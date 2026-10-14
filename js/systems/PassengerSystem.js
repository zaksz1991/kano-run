import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const PASSENGER_MODELS = [
  "/assets/models/pedestrian-passengers/passenger.glb",
  "/assets/models/pedestrian-passengers/pedestrian.glb",
  "/assets/models/pedestrian-passengers/hijab_muslim_woman.glb",
  "/assets/models/pedestrian-passengers/Man.glb",
  "/assets/models/pedestrian-passengers/Man in Suit.glb",
];

const DESTINATIONS = [
  "Sabon Gari", "Kofar Mata", "Fagge", "Farm Centre", "Hotoro",
  "Zoo Road", "Naibawa", "Tarauni", "Dala", "Kantin Kwari",
  "Kofar Wambai", "Panshekara", "Kumbotso", "Gwale", "Sharada",
  "Emir's Palace", "Kurmi Market", "Bompai", "Yankaba", "Kabuga",
];

const DEFAULTS = {
  spawnAhead: 80,
  spawnInterval: 40,
  pickupDistance: 5.5,
  minimumTripDistance: 90,
  maximumTripDistance: 220,
  baseFare: 150,
  farePerDistance: 0.8,
  maximumPassengers: 3,
  roadSideOffset: 7,
  maxPickupSpeed: 9,
  /** Target height in meters for roadside people */
  personHeight: 1.55,
};

export default class PassengerSystem {
  constructor({
    scene,
    eventBus = null,
    events = null,
    gameState = null,
    state = null,
    playerVehicleSystem = null,
    config = {},
  } = {}) {
    if (!scene) throw new Error("PassengerSystem requires a scene.");

    this.scene = scene;
    this.eventBus = eventBus ?? events;
    this.gameState = gameState ?? state;
    this.config = { ...DEFAULTS, ...config };

    this.player = playerVehicleSystem;
    this.loader = new GLTFLoader();
    this.modelCache = new Map();
    this.passengers = [];
    this.activePassenger = null;
    this._dropMarker = null;
    this._boardedMesh = null;
    this.nextSpawnZ = 40;
    this.enabled = false;
    this.disposed = false;
    this.totalPickedUp = 0;
    this.totalDroppedOff = 0;
    this.totalFares = 0;
    this._disposers = [];
    this._clock = 0;
    this._exitAnim = null;

    this._subscribe("game:started", () => {
      this.enabled = true;
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clear();
    });
    this._subscribe("game:over", () => {
      this.enabled = false;
      this.clear();
    });
    this._subscribe("game:paused", () => {
      this.enabled = false;
    });
    this._subscribe("game:resumed", () => {
      this.enabled = true;
    });
  }

  _subscribe(name, callback) {
    if (!this.eventBus?.on) return;
    const result = this.eventBus.on(name, callback);
    if (typeof result === "function") this._disposers.push(result);
    else if (this.eventBus.off) {
      this._disposers.push(() => this.eventBus.off(name, callback));
    }
  }

  _emit(name, payload = {}) {
    this.eventBus?.emit?.(name, payload);
  }

  async initialize() {
    this.player ??= this.game?.systems?.get?.("playerVehicle") ?? null;

    // Load only 2 models first for speed; rest in background
    const priority = PASSENGER_MODELS.slice(0, 2);
    const rest = PASSENGER_MODELS.slice(2);

    await Promise.allSettled(priority.map((p) => this._cacheModel(p)));

    // Background — does not block start
    Promise.allSettled(rest.map((p) => this._cacheModel(p))).then((results) => {
      const loaded = [...priority, ...rest].filter((p) =>
        this.modelCache.has(p),
      ).length;
      console.info(
        `[PassengerSystem] Models ready ${loaded}/${PASSENGER_MODELS.length}`,
      );
    });

    return this;
  }

  async _cacheModel(path) {
    if (this.modelCache.has(path)) return path;
    try {
      const gltf = await this.loader.loadAsync(path);
      const model = gltf.scene;
      model.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this._normalizePersonScale(model);
      model.userData.animations = gltf.animations ?? [];
      this.modelCache.set(path, model);
      return path;
    } catch (error) {
      console.warn(`[PassengerSystem] Skip model ${path}`, error);
      return null;
    }
  }

  _normalizePersonScale(model) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0.01) {
      const target = this.config.personHeight;
      model.scale.setScalar(target / size.y);
    }
    // Re-center feet on ground after scale
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;
  }

  update(deltaTime = 0, playerZ = null, playerSpeed = 0) {
    if (!this.enabled || this.disposed) return;

    const dt = Math.min(Number(deltaTime) || 0, 0.1);
    this._clock += dt;

    const player =
      this.player ?? this.game?.systems?.get?.("playerVehicle");
    const position = player?.position ?? player?.vehicle?.position;
    const currentZ = Number.isFinite(playerZ)
      ? playerZ
      : Number(position?.z) || 0;
    const playerX = Number(position?.x) || 0;
    const speed = Number(playerSpeed) || 0;

    this._updateExitAnimation(dt, currentZ);
    this._syncBoardedPassenger(player);

    if (
      this.passengers.length < this.config.maximumPassengers &&
      currentZ + this.config.spawnAhead >= this.nextSpawnZ
    ) {
      this._spawnPassenger(this.nextSpawnZ);
      this.nextSpawnZ =
        currentZ +
        this.config.spawnAhead +
        Math.random() * this.config.spawnInterval;
    }

    for (let i = this.passengers.length - 1; i >= 0; i--) {
      const passenger = this.passengers[i];

      if (passenger.group.position.z < currentZ - 25) {
        this.scene.remove(passenger.group);
        this.passengers.splice(i, 1);
        continue;
      }

      if (passenger.walking) {
        passenger.group.position.y =
          Math.abs(Math.sin(this._clock * 3 + passenger.phase)) * 0.04;
      }

      const ring = passenger.group.getObjectByName("pickup-ring");
      if (ring) {
        const pulse = 1 + Math.sin(this._clock * 4 + passenger.phase) * 0.08;
        ring.scale.set(pulse, pulse, pulse);
      }

      if (
        !this.activePassenger &&
        !this._exitAnim &&
        Math.abs(passenger.group.position.z - currentZ) <
          this.config.pickupDistance &&
        Math.abs(passenger.group.position.x - playerX) < 11 &&
        speed < this.config.maxPickupSpeed
      ) {
        this._pickupPassenger(passenger, speed, player);
      }
    }

    if (this.activePassenger) {
      const trip = this.activePassenger;
      const distanceTravelled = Math.max(0, currentZ - trip.pickupZ);
      const remaining = Math.max(0, trip.tripDistance - distanceTravelled);

      this._emit("passenger:trip-update", {
        distanceTravelled,
        remainingDistance: remaining,
        destination: trip.destination,
        fare: Math.round(
          this.config.baseFare +
            Math.min(distanceTravelled, trip.tripDistance) *
              this.config.farePerDistance,
        ),
      });

      if (distanceTravelled >= trip.tripDistance && speed < this.config.maxPickupSpeed + 2) {
        this._dropoffPassenger(currentZ, player);
      }
    }
  }

  _spawnPassenger(z) {
    const group = new THREE.Group();
    group.name = "kano-run-passenger";
    const side = Math.random() < 0.5 ? -1 : 1;
    group.position.set(side * this.config.roadSideOffset, 0, z);

    const destination =
      DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];

    const available = [...this.modelCache.entries()];
    const selected = available.length
      ? available[Math.floor(Math.random() * available.length)]
      : null;

    let walking = false;
    let personRoot = null;

    if (selected) {
      personRoot = selected[1].clone(true);
      personRoot.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(personRoot);
      walking = true;
    } else {
      personRoot = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 0.7, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x168aad }),
      );
      personRoot.position.y = 0.55;
      personRoot.castShadow = true;
      group.add(personRoot);
    }

    const signGroup = new THREE.Group();
    signGroup.name = "pickup-sign";
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 }),
    );
    pole.position.y = 0.9;
    pole.castShadow = true;
    signGroup.add(pole);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.5, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        emissive: 0x14532d,
        emissiveIntensity: 0.35,
        roughness: 0.55,
      }),
    );
    board.position.y = 1.9;
    signGroup.add(board);

    signGroup.position.set(side < 0 ? 0.7 : -0.7, 0, 0);
    group.add(signGroup);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.7, 20),
      new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      }),
    );
    ring.name = "pickup-ring";
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);

    const passenger = {
      group,
      z,
      walking,
      phase: Math.random() * Math.PI * 2,
      modelPath: selected?.[0] ?? null,
      destination,
      personRoot,
    };

    this.scene.add(group);
    this.passengers.push(passenger);

    const callText = `Oga! ${destination}?`;
    this._emit("passenger:spotted", {
      position: group.position.clone(),
      passenger,
      text: callText,
      message: callText,
      destination,
    });

    return passenger;
  }

  _pickupPassenger(passenger, playerSpeed = 0, player = null) {
    if (this.activePassenger || !passenger) return;

    const index = this.passengers.indexOf(passenger);
    if (index !== -1) this.passengers.splice(index, 1);

    const playerZ = Number(player?.position?.z) || passenger.z;
    const destination = passenger.destination || "Nearby stop";
    const tripDistance =
      this.config.minimumTripDistance +
      Math.random() *
        (this.config.maximumTripDistance - this.config.minimumTripDistance);

    // Board animation: parent a small person into the keke cabin
    this._attachBoardedPassenger(passenger, player);

    this.scene.remove(passenger.group);

    this.activePassenger = {
      pickupZ: playerZ,
      tripDistance,
      modelPath: passenger.modelPath,
      destination,
      dropZ: playerZ + tripDistance,
    };

    this.totalPickedUp += 1;
    this._spawnDropMarker(this.activePassenger.dropZ);

    this._emit("passenger:boarded", {
      passenger,
      passengerCount: this.totalPickedUp,
      speed: Number(playerSpeed) || 0,
      tripDistance,
      destination,
    });

    this._emit("passenger:shout", {
      message: `Please take me to ${destination}!`,
    });
  }

  _attachBoardedPassenger(passenger, player) {
    this._detachBoardedPassenger();

    const vehicle = player?.vehicle ?? player?.getVehicleObject?.();
    if (!vehicle) return;

    let mesh;
    if (passenger.modelPath && this.modelCache.has(passenger.modelPath)) {
      mesh = this.modelCache.get(passenger.modelPath).clone(true);
      this._normalizePersonScale(mesh);
      // Smaller while seated in cabin
      mesh.scale.multiplyScalar(0.85);
    } else {
      mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.18, 0.5, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x1e90ff }),
      );
      mesh.position.y = 0.4;
    }

    mesh.name = "boarded-passenger";
    // Seat offset inside keke cabin (slightly behind driver)
    mesh.position.set(0.15, 0.35, -0.35);
    mesh.rotation.y = Math.PI;
    vehicle.add(mesh);
    this._boardedMesh = mesh;
  }

  _syncBoardedPassenger(player) {
    // Mesh is parented to vehicle — position follows automatically
  }

  _detachBoardedPassenger() {
    if (!this._boardedMesh) return;
    this._boardedMesh.parent?.remove(this._boardedMesh);
    this._boardedMesh = null;
  }

  _spawnDropMarker(z) {
    this._clearDropMarker();
    const marker = new THREE.Group();
    marker.name = "dropoff-marker";
    marker.position.set(0, 0, z);

    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 2.4, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b }),
    );
    post.position.y = 1.2;
    marker.add(post);

    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.65, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xb45309,
        emissiveIntensity: 0.3,
      }),
    );
    flag.position.set(0.55, 2.1, 0);
    marker.add(flag);

    this.scene.add(marker);
    this._dropMarker = marker;
  }

  _clearDropMarker() {
    if (this._dropMarker) {
      this.scene.remove(this._dropMarker);
      this._dropMarker = null;
    }
  }

  _dropoffPassenger(playerZ, player = null) {
    if (!this.activePassenger) return;

    const trip = this.activePassenger;
    const distance = Math.min(
      Math.max(0, playerZ - trip.pickupZ),
      trip.tripDistance,
    );
    const fare = Math.round(
      this.config.baseFare + distance * this.config.farePerDistance,
    );

    // Exit animation: detach from keke and walk to roadside
    this._startExitAnimation(player, trip.destination);

    this.activePassenger = null;
    this.totalDroppedOff += 1;
    this.totalFares += fare;
    this._clearDropMarker();

    const economy =
      this.game?.systems?.get?.("economy") ?? this.game?.economy ?? null;
    if (typeof economy?.addMoney === "function") economy.addMoney(fare);
    else if (typeof economy?.earn === "function") economy.earn(fare);

    this._emit("economy:fare-earned", {
      amount: fare,
      fare,
      source: "passenger",
    });
    this._emit("passenger:dropped", {
      fare,
      distance,
      destination: trip.destination,
      totalDroppedOff: this.totalDroppedOff,
      totalFares: this.totalFares,
    });
    this._emit("passenger:shout", {
      message: `Thank you! Your fare is ₦${fare.toLocaleString()}.`,
    });
  }

  _startExitAnimation(player, destination) {
    this._detachBoardedPassenger();

    const pos = player?.position ?? { x: 0, z: 0 };
    const group = new THREE.Group();
    group.name = "exiting-passenger";
    group.position.set(Number(pos.x) || 0, 0, Number(pos.z) || 0);

    let mesh;
    const paths = [...this.modelCache.keys()];
    if (paths.length) {
      mesh = this.modelCache.get(paths[0]).clone(true);
      this._normalizePersonScale(mesh);
    } else {
      mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.2, 0.65, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x2dd4bf }),
      );
      mesh.position.y = 0.5;
    }
    group.add(mesh);
    this.scene.add(group);

    const side = Math.random() < 0.5 ? -1 : 1;
    this._exitAnim = {
      group,
      t: 0,
      duration: 1.4,
      fromX: group.position.x,
      toX: side * this.config.roadSideOffset,
      fromZ: group.position.z,
      toZ: group.position.z + 2,
    };
  }

  _updateExitAnimation(dt, playerZ) {
    if (!this._exitAnim) return;

    const anim = this._exitAnim;
    anim.t += dt;
    const u = Math.min(1, anim.t / anim.duration);
    // ease out
    const e = 1 - (1 - u) * (1 - u);

    anim.group.position.x = anim.fromX + (anim.toX - anim.fromX) * e;
    anim.group.position.z = anim.fromZ + (anim.toZ - anim.fromZ) * e;
    anim.group.position.y = Math.sin(u * Math.PI) * 0.15;

    if (u >= 1 || anim.group.position.z < playerZ - 20) {
      this.scene.remove(anim.group);
      this._exitAnim = null;
    }
  }

  getStats() {
    return {
      passengersPickedUp: this.totalPickedUp,
      passengersDroppedOff: this.totalDroppedOff,
      totalFares: this.totalFares,
      hasPassenger: Boolean(this.activePassenger),
      waitingPassengers: this.passengers.length,
      activeDestination: this.activePassenger?.destination ?? null,
    };
  }

  clear() {
    for (const passenger of this.passengers) {
      this.scene.remove(passenger.group);
    }
    this.passengers.length = 0;
    this.activePassenger = null;
    this._clearDropMarker();
    this._detachBoardedPassenger();
    if (this._exitAnim) {
      this.scene.remove(this._exitAnim.group);
      this._exitAnim = null;
    }
    this.nextSpawnZ =
      (Number(this.player?.position?.z) || 0) + this.config.spawnAhead;
  }

  dispose() {
    if (this.disposed) return;
    this.enabled = false;
    this.clear();
    for (const dispose of this._disposers) {
      try {
        dispose();
      } catch {}
    }
    this._disposers.length = 0;
    this.modelCache.clear();
    this.disposed = true;
  }
}
