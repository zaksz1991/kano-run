import * as THREE from "three";
import { modelCache } from "../core/SmartModelCache.js";
import { MODEL_PATHS } from "../core/AssetCatalog.js";

const DEFAULTS = {
  spawnAhead: 90,
  spawnInterval: 42,
  pickupDistance: 5.5,
  minimumTripDistance: 90,
  maximumTripDistance: 220,
  baseFare: 150,
  farePerDistance: 0.8,
  maximumPassengers: 3,
  roadSideOffset: 7,
};

export default class PassengerSystem {
  constructor({
    scene,
    eventBus = null,
    gameState = null,
    playerVehicleSystem = null,
    config = {},
  } = {}) {
    if (!scene) throw new Error("PassengerSystem requires a scene.");
    this.scene = scene;
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.config = { ...DEFAULTS, ...config };
    this.player = playerVehicleSystem;
    this.passengers = [];
    this.activePassenger = null;
    this.nextSpawnZ = 45;
    this.enabled = false;
    this.disposed = false;
    this.totalPickedUp = 0;
    this.totalDroppedOff = 0;
    this.totalFares = 0;
    this._disposers = [];
    this._clock = 0;

    this._subscribe("game:started", () => {
      this.enabled = true;
      modelCache.warmBackground(MODEL_PATHS.passengersMore, 1);
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clear();
    });
    this._subscribe("game:over", () => {
      this.enabled = false;
      this.clear();
    });
  }

  async initialize() {
    this.player ??= this.game?.systems?.get?.("playerVehicle") ?? null;
    await modelCache.warm(MODEL_PATHS.passengersBoot);
    console.info(
      `[PassengerSystem] ${MODEL_PATHS.passengersBoot.length} character GLBs ready.`,
    );
    return this;
  }

  update(deltaTime = 0, playerZ = null) {
    if (!this.enabled || this.disposed) return;
    this._clock += Math.min(Number(deltaTime) || 0, 0.1);
    const player = this.player ?? this.game?.systems?.get?.("playerVehicle");
    const position = player?.position ?? player?.vehicle?.position;
    const currentZ = Number.isFinite(playerZ) ? playerZ : Number(position?.z) || 0;
    const playerX = Number(position?.x) || 0;

    if (
      this.passengers.length < this.config.maximumPassengers &&
      currentZ + this.config.spawnAhead >= this.nextSpawnZ
    ) {
      this._spawn(this.nextSpawnZ);
      this.nextSpawnZ =
        currentZ + this.config.spawnAhead + Math.random() * this.config.spawnInterval;
    }

    for (let i = this.passengers.length - 1; i >= 0; i--) {
      const p = this.passengers[i];
      if (p.group.position.z < currentZ - 25) {
        this.scene.remove(p.group);
        this.passengers.splice(i, 1);
        continue;
      }
      p.group.position.y = Math.abs(Math.sin(this._clock * 3.5 + p.phase)) * 0.04;
      if (
        !this.activePassenger &&
        Math.abs(p.group.position.z - currentZ) < this.config.pickupDistance &&
        Math.abs(p.group.position.x - playerX) < 11
      ) {
        this._pickup(p);
      }
    }

    if (this.activePassenger) {
      const travelled = Math.max(0, currentZ - this.activePassenger.pickupZ);
      if (travelled >= this.activePassenger.tripDistance) this._dropoff(currentZ);
    }
  }

  _paths() {
    return [
      ...MODEL_PATHS.passengersBoot,
      ...MODEL_PATHS.passengersMore.filter((p) => modelCache.has(p)),
    ];
  }

  _spawn(z) {
    const group = new THREE.Group();
    group.position.set(
      Math.random() < 0.5 ? -this.config.roadSideOffset : this.config.roadSideOffset,
      0,
      z,
    );
    const paths = this._paths();
    const path = paths[Math.floor(Math.random() * paths.length)];
    const model = modelCache.clone(path, 1.55);
    if (model) {
      model.rotation.y = group.position.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(model);
    } else {
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.25, 0.5, 3, 6),
        new THREE.MeshStandardMaterial({ color: 0x1e3a5f, flatShading: true }),
      );
      body.position.y = 0.8;
      group.add(body);
    }

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide }),
    );
    board.position.set(0, 2.0, 0);
    group.add(board);

    this.scene.add(group);
    this.passengers.push({ group, phase: Math.random() * 6 });
    this.eventBus?.emit?.("passenger:spotted", { position: group.position.clone() });
  }

  _pickup(passenger) {
    if (this.activePassenger) return;
    const i = this.passengers.indexOf(passenger);
    if (i !== -1) this.passengers.splice(i, 1);
    this.scene.remove(passenger.group);
    const player = this.player ?? this.game?.systems?.get?.("playerVehicle");
    const playerZ = Number(player?.position?.z) || passenger.group.position.z;
    this.activePassenger = {
      pickupZ: playerZ,
      tripDistance:
        this.config.minimumTripDistance +
        Math.random() *
          (this.config.maximumTripDistance - this.config.minimumTripDistance),
    };
    this.totalPickedUp += 1;
    this.eventBus?.emit?.("passenger:boarding", {});
    this.eventBus?.emit?.("passenger:boarded", {
      passengerCount: this.totalPickedUp,
      tripDistance: this.activePassenger.tripDistance,
    });
  }

  _dropoff(playerZ) {
    if (!this.activePassenger) return;
    const trip = this.activePassenger;
    const distance = Math.min(
      Math.max(0, playerZ - trip.pickupZ),
      trip.tripDistance,
    );
    const fare = Math.round(
      this.config.baseFare + distance * this.config.farePerDistance,
    );
    this.eventBus?.emit?.("passenger:dropping", { fare, distance });
    this.activePassenger = null;
    this.totalDroppedOff += 1;
    this.totalFares += fare;
    this.eventBus?.emit?.("economy:fare-earned", { amount: fare, fare });
    this.eventBus?.emit?.("passenger:dropped", {
      fare,
      distance,
      totalDroppedOff: this.totalDroppedOff,
      totalFares: this.totalFares,
    });
  }

  clear() {
    for (const p of this.passengers) this.scene.remove(p.group);
    this.passengers = [];
    this.activePassenger = null;
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

  _subscribe(name, cb) {
    if (!this.eventBus?.on) return;
    const r = this.eventBus.on(name, cb);
    if (typeof r === "function") this._disposers.push(r);
  }

  dispose() {
    this.disposed = true;
    this.clear();
    for (const d of this._disposers) {
      try {
        d();
      } catch {}
    }
    this._disposers = [];
  }
}
