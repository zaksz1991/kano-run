import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const PASSENGER_MODELS = [
  "/assets/models/pedestrian-passengers/passenger.glb",
  "/assets/models/pedestrian-passengers/pedestrian.glb",
  "/assets/models/pedestrian-passengers/hijab_muslim_woman.glb",
  "/assets/models/pedestrian-passengers/Man.glb",
  "/assets/models/pedestrian-passengers/Man in Suit.glb",
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

  start() {
    this.player ??= this.game?.systems?.get?.("playerVehicle") ?? null;
    this.enabled = true;
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
      })
    );

    const loaded = results.filter(
      (result) => result.status === "fulfilled"
    ).length;

    console.info(
      `[PassengerSystem] Loaded ${loaded}/${PASSENGER_MODELS.length} passenger models.`
    );

    if (loaded === 0) {
      console.warn(
        "[PassengerSystem] No passenger models loaded. Check asset paths."
      );
    }

    return this;
  }

  update(deltaTime = 0, playerZ = null, playerSpeed = 0) {
    if (!this.enabled || this.disposed) return;

    this._clock += Math.min(Number(deltaTime) || 0, 0.1);

    const player = this.player ??
      this.game?.systems?.get?.("playerVehicle");

    const position = player?.position ??
      player?.vehicle?.position;

    const currentZ = Number.isFinite(playerZ)
      ? playerZ
      : Number(position?.z) || 0;

    const playerX = Number(position?.x) || 0;

    if (
      this.passengers.length < this.config.maximumPassengers &&
      currentZ + this.config.spawnAhead >= this.nextSpawnZ
    ) {
      this._spawnPassenger(this.nextSpawnZ);
      this.nextSpawnZ = currentZ + this.config.spawnAhead +
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

      if (
        !this.activePassenger &&
        Math.abs(passenger.group.position.z - currentZ) <
          this.config.pickupDistance &&
        Math.abs(passenger.group.position.x - playerX) < 11
      ) {
        this._pickupPassenger(passenger, playerSpeed);
      }
    }

    if (this.activePassenger) {
      const trip = this.activePassenger;
      const distanceTravelled = Math.max(0, currentZ - trip.pickupZ);
      const remaining = Math.max(0, trip.tripDistance - distanceTravelled);

      this._emit("passenger:trip-update", {
        distanceTravelled,
        remainingDistance: remaining,
        fare: Math.round(
          this.config.baseFare +
          Math.min(distanceTravelled, trip.tripDistance) *
            this.config.farePerDistance
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
    group.position.set(
      Math.random() < 0.5
        ? -this.config.roadSideOffset
        : this.config.roadSideOffset,
      0,
      z
    );

    const available = [...this.modelCache.entries()];
    const selected = available.length
      ? available[Math.floor(Math.random() * available.length)]
      : null;

    let walking = false;

    if (selected) {
      const model = selected[1].clone(true);
      model.rotation.y = group.position.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(model);
      walking = true;
    } else {
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.3, 0.8, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x168aad })
      );
      body.position.y = 0.7;
      body.castShadow = true;
      group.add(body);
    }

    const passenger = {
      group,
      z,
      walking,
      phase: Math.random() * Math.PI * 2,
      modelPath: selected?.[0] ?? null,
    };

    this.scene.add(group);
    this.passengers.push(passenger);

    this._emit("passenger:spotted", {
      position: group.position.clone(),
      passenger,
    });

    return passenger;
  }

  _pickupPassenger(passenger, playerSpeed = 0) {
    if (this.activePassenger || !passenger) return;

    const index = this.passengers.indexOf(passenger);
    if (index !== -1) this.passengers.splice(index, 1);

    this.scene.remove(passenger.group);

    const player = this.player ??
      this.game?.systems?.get?.("playerVehicle");

    const playerZ = Number(player?.position?.z) || passenger.z;

    this.activePassenger = {
      pickupZ: playerZ,
      tripDistance:
        this.config.minimumTripDistance +
        Math.random() *
          (this.config.maximumTripDistance -
            this.config.minimumTripDistance),
      modelPath: passenger.modelPath,
    };

    this.totalPickedUp += 1;

    this._emit("passenger:boarded", {
      passenger,
      passengerCount: this.totalPickedUp,
      speed: Number(playerSpeed) || 0,
      tripDistance: this.activePassenger.tripDistance,
    });

    this._emit("passenger:shout", {
      message: "Please take me to my destination!",
    });
  }

  _dropoffPassenger(playerZ) {
    if (!this.activePassenger) return;

    const trip = this.activePassenger;
    const distance = Math.min(
      Math.max(0, playerZ - trip.pickupZ),
      trip.tripDistance
    );

    const fare = Math.round(
      this.config.baseFare + distance * this.config.farePerDistance
    );

    this.activePassenger = null;
    this.totalDroppedOff += 1;
    this.totalFares += fare;

    const economy =
      this.game?.systems?.get?.("economy") ??
      this.game?.economy ??
      null;

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
    };
  }

  clear() {
    for (const passenger of this.passengers) {
      this.scene.remove(passenger.group);
    }

    this.passengers.length = 0;
    this.activePassenger = null;

    this.nextSpawnZ =
      (Number(this.player?.position?.z) || 0) +
      this.config.spawnAhead;
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

