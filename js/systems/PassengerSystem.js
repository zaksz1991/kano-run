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
  "Sabon Gari",
  "Kofar Mata",
  "Fagge",
  "Farm Centre",
  "Hotoro",
  "Zoo Road",
  "Naibawa",
  "Tarauni",
  "Dala",
  "Kantin Kwari",
  "Kofar Wambai",
  "Panshekara",
  "Kumbotso",
  "Gwale",
  "Sharada",
  "Emir's Palace",
  "Kurmi Market",
  "Bompai",
  "Yankaba",
  "Kabuga",
];

const DEFAULTS = {
  spawnAhead: 100,
  spawnInterval: 45,
  pickupDistance: 5,
  minimumTripDistance: 100,
  maximumTripDistance: 240,
  baseFare: 150,
  farePerDistance: 0.8,
  maximumPassengers: 3,
  roadSideOffset: 7,
  maxPickupSpeed: 8,
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
    if (!scene) {
      throw new Error("PassengerSystem requires a scene.");
    }

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
    this.nextSpawnZ = 50;
    this.enabled = false;
    this.disposed = false;
    this.totalPickedUp = 0;
    this.totalDroppedOff = 0;
    this.totalFares = 0;
    this._disposers = [];
    this._clock = 0;

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

    if (typeof result === "function") {
      this._disposers.push(result);
    } else if (this.eventBus.off) {
      this._disposers.push(() => {
        this.eventBus.off(name, callback);
      });
    }
  }

  _emit(name, payload = {}) {
    this.eventBus?.emit?.(name, payload);
  }

  async initialize() {
    this.player ??= this.game?.systems?.get?.("playerVehicle") ?? null;

    const results = await Promise.allSettled(
      PASSENGER_MODELS.map(async (path) => {
        const gltf = await this.loader.loadAsync(path);
        const model = gltf.scene;

        model.traverse((object) => {
          if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());

        if (size.y > 0) {
          model.scale.setScalar(1.8 / size.y);
        }

        model.userData.animations = gltf.animations ?? [];
        this.modelCache.set(path, model);
        return path;
      }),
    );

    const loaded = results.filter((result) => result.status === "fulfilled").length;

    console.info(
      `[PassengerSystem] Loaded ${loaded}/${PASSENGER_MODELS.length} passenger models.`,
    );

    if (loaded === 0) {
      console.warn(
        "[PassengerSystem] No passenger models loaded. Check asset paths.",
      );
    }

    return this;
  }

  update(deltaTime = 0, playerZ = null, playerSpeed = 0) {
    if (!this.enabled || this.disposed) return;

    this._clock += Math.min(Number(deltaTime) || 0, 0.1);

    const player = this.player ?? this.game?.systems?.get?.("playerVehicle");

    const position = player?.position ?? player?.vehicle?.position;

    const currentZ = Number.isFinite(playerZ)
      ? playerZ
      : Number(position?.z) || 0;

    const playerX = Number(position?.x) || 0;
    const speed = Number(playerSpeed) || 0;

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
          Math.abs(Math.sin(this._clock * 3 + passenger.phase)) * 0.06;
      }

      // Pulse the sign ring so pickup points stay readable
      const ring = passenger.group.getObjectByName("pickup-ring");
      if (ring) {
        const pulse = 1 + Math.sin(this._clock * 4 + passenger.phase) * 0.08;
        ring.scale.set(pulse, pulse, pulse);
      }

      if (
        !this.activePassenger &&
        Math.abs(passenger.group.position.z - currentZ) <
          this.config.pickupDistance &&
        Math.abs(passenger.group.position.x - playerX) < 11 &&
        speed < this.config.maxPickupSpeed
      ) {
        this._pickupPassenger(passenger, speed);
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

      if (distanceTravelled >= trip.tripDistance) {
        this._dropoffPassenger(currentZ);
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

    if (selected) {
      const model = selected[1].clone(true);
      model.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(model);
      walking = true;
    } else {
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.3, 0.8, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x168aad }),
      );
      body.position.y = 0.7;
      body.castShadow = true;
      group.add(body);
    }

    // --- Visible pickup sign ---
    const signGroup = new THREE.Group();
    signGroup.name = "pickup-sign";

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 }),
    );
    pole.position.y = 1.1;
    pole.castShadow = true;
    signGroup.add(pole);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.7, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        emissive: 0x14532d,
        emissiveIntensity: 0.35,
        roughness: 0.55,
      }),
    );
    board.position.y = 2.35;
    board.castShadow = true;
    signGroup.add(board);

    const tab = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.12, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24 }),
    );
    tab.position.y = 2.75;
    signGroup.add(tab);

    // Offset sign slightly toward the road
    signGroup.position.set(side < 0 ? 0.85 : -0.85, 0, 0);
    group.add(signGroup);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.9, 24),
      new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    ring.name = "pickup-ring";
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    const passenger = {
      group,
      z,
      walking,
      phase: Math.random() * Math.PI * 2,
      modelPath: selected?.[0] ?? null,
      destination,
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

  _pickupPassenger(passenger, playerSpeed = 0) {
    if (this.activePassenger || !passenger) return;

    const index = this.passengers.indexOf(passenger);
    if (index !== -1) this.passengers.splice(index, 1);

    this.scene.remove(passenger.group);

    const player =
      this.player ?? this.game?.systems?.get?.("playerVehicle");

    const playerZ = Number(player?.position?.z) || passenger.z;
    const destination = passenger.destination || "Nearby stop";

    const tripDistance =
      this.config.minimumTripDistance +
      Math.random() *
        (this.config.maximumTripDistance - this.config.minimumTripDistance);

    this.activePassenger = {
      pickupZ: playerZ,
      tripDistance,
      modelPath: passenger.modelPath,
      destination,
      dropZ: playerZ + tripDistance,
    };

    this.totalPickedUp += 1;

    this._spawnDropMarker(this.activePassenger.dropZ, destination);

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

  _spawnDropMarker(z, destination) {
    this._clearDropMarker();

    const marker = new THREE.Group();
    marker.name = "dropoff-marker";
    marker.position.set(0, 0, z);

    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 3, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b }),
    );
    post.position.y = 1.5;
    post.castShadow = true;
    marker.add(post);

    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.8, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xb45309,
        emissiveIntensity: 0.3,
      }),
    );
    flag.position.set(0.7, 2.6, 0);
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

  _dropoffPassenger(playerZ) {
    if (!this.activePassenger) return;

    const trip = this.activePassenger;
    const distance = Math.min(
      Math.max(0, playerZ - trip.pickupZ),
      trip.tripDistance,
    );

    const fare = Math.round(
      this.config.baseFare + distance * this.config.farePerDistance,
    );

    this.activePassenger = null;
    this.totalDroppedOff += 1;
    this.totalFares += fare;

    this._clearDropMarker();

    const economy =
      this.game?.systems?.get?.("economy") ?? this.game?.economy ?? null;

    if (typeof economy?.addMoney === "function") {
      economy.addMoney(fare);
    } else if (typeof economy?.earn === "function") {
      economy.earn(fare);
    }

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
      } catch {
        // Continue cleanup if an event listener is already removed.
      }
    }

    this._disposers.length = 0;
    this.modelCache.clear();
    this.disposed = true;
  }
}
