import * as THREE from "three";
import { modelCache } from "../core/SmartModelCache.js";
import { MODEL_PATHS } from "../core/AssetCatalog.js";

/**
 * Phase 2 — Living Kano pickups
 * - Passengers at bus stops + roadside (not pure random)
 * - Driver must pull to the side and stop to board
 * - Drop-off is roadside; fare from negotiation
 * Extends prior PassengerSystem API (stats, events).
 */

const DESTINATIONS = [
  "Sabon Gari",
  "Kurmi Market",
  "Kantin Kwari",
  "Fagge",
  "Tarauni",
  "Hotoro",
  "Bompai",
  "Zoo Road",
  "Nassarawa",
  "Kofar Wambai",
  "Emir Palace",
  "Farm Centre",
  "Sharada",
  "Naibawa",
];

const DEFAULTS = {
  spawnAhead: 95,
  stopInterval: 70,
  roadsideChance: 0.35,
  pickupDistance: 7,
  stopSpeedMax: 4.5,
  sideAlignX: 5.5,
  minimumTripDistance: 100,
  maximumTripDistance: 280,
  baseFare: 200,
  farePerDistance: 0.9,
  maximumPassengers: 3,
  roadSideOffset: 7.2,
  busStopCapacityMin: 5,
  busStopCapacityMax: 14,
  nightFareMult: 1.45,
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
    this.busStops = [];
    this.activePassenger = null;
    this.negotiating = null;
    this.nextStopZ = 60;
    this.enabled = false;
    this.disposed = false;
    this.totalPickedUp = 0;
    this.totalDroppedOff = 0;
    this.totalFares = 0;
    this.isNight = false;
    this._disposers = [];
    this._clock = 0;

    this._subscribe("game:started", () => {
      this.enabled = true;
      this.nextStopZ = 60;
      modelCache?.warmBackground?.(MODEL_PATHS?.passengersMore || [], 1);
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clear();
    });
    this._subscribe("game:over", () => {
      this.enabled = false;
      this.clear();
    });
    this._subscribe("daynight:changed", (p) => {
      this.isNight = Boolean(p?.isNight || p?.phase === "night");
    });
    this._subscribe("weather:changed", (p) => {
      this.isNight = this.isNight; // keep
    });
    this._subscribe("negotiation:finished", (p) => this._onNegotiationFinished(p));
    this._subscribe("negotiation:accepted", (p) =>
      this._onNegotiationFinished({ accepted: true, fare: p?.fare }),
    );
    this._subscribe("negotiation:rejected", () =>
      this._onNegotiationFinished({ accepted: false }),
    );
  }

  async initialize() {
    this.player ??= this.game?.systems?.get?.("playerVehicle") ?? null;
    if (modelCache?.warm && MODEL_PATHS?.passengersBoot) {
      await modelCache.warm(MODEL_PATHS.passengersBoot);
    }
    console.info("[PassengerSystem] Phase2 bus stops + roadside ready.");
    return this;
  }

  update(deltaTime = 0, playerZ = null) {
    if (!this.enabled || this.disposed) return;
    this._clock += Math.min(Number(deltaTime) || 0, 0.1);

    const player = this.player ?? this.game?.systems?.get?.("playerVehicle");
    const position = player?.position ?? player?.vehicle?.position;
    const currentZ = Number.isFinite(playerZ) ? playerZ : Number(position?.z) || 0;
    const playerX = Number(position?.x) || 0;
    const speed = Number(player?.speed ?? player?.velocity ?? 0);

    // Spawn bus stops / roadside clusters ahead
    if (currentZ + this.config.spawnAhead >= this.nextStopZ) {
      if (Math.random() < this.config.roadsideChance) {
        this._spawnRoadside(this.nextStopZ);
      } else {
        this._spawnBusStop(this.nextStopZ);
      }
      this.nextStopZ +=
        this.config.stopInterval + Math.random() * this.config.stopInterval * 0.5;
    }

    // Animate waiting people
    for (const p of this.passengers) {
      if (p.state !== "waiting") continue;
      p.group.position.y = Math.abs(Math.sin(this._clock * 3 + p.phase)) * 0.04;
    }

    // Recycle far behind
    for (let i = this.passengers.length - 1; i >= 0; i--) {
      const p = this.passengers[i];
      if (p.group.position.z < currentZ - 40) {
        this.scene.remove(p.group);
        this.passengers.splice(i, 1);
      }
    }
    for (let i = this.busStops.length - 1; i >= 0; i--) {
      const s = this.busStops[i];
      if (s.z < currentZ - 50) {
        this.scene.remove(s.group);
        this.busStops.splice(i, 1);
      }
    }

    // Drop-off
    if (this.activePassenger && !this.negotiating) {
      const trip = this.activePassenger;
      const travelled = Math.max(0, currentZ - trip.pickupZ);
      if (travelled >= trip.tripDistance) {
        this._tryDropoff(currentZ, playerX, speed);
      }
    }

    // Pickup / start negotiation — must be slow and near the side
    if (this.activePassenger || this.negotiating) return;

    for (const p of this.passengers) {
      if (p.state !== "waiting") continue;
      const dz = Math.abs(p.group.position.z - currentZ);
      const dx = Math.abs(p.group.position.x - playerX);
      if (dz < this.config.pickupDistance && dx < 9) {
        this.eventBus?.emit?.("passenger:nearby", {
          destination: p.destination,
          message: p.callLine,
        });
        if (speed <= this.config.stopSpeedMax && dx < this.config.sideAlignX + 3) {
          this._beginNegotiation(p);
          break;
        } else if (dz < 4) {
          this.eventBus?.emit?.("hud:notify", {
            text: "Pull to the side and stop to pick up",
            type: "hint",
          });
        }
      }
    }
  }

  _spawnBusStop(z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const group = new THREE.Group();
    group.position.set(side * (this.config.roadSideOffset + 1.5), 0, z);

    // Shelter
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, flatShading: true });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, flatShading: true });
    for (const x of [-1.2, 1.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6), poleMat);
      pole.position.set(x, 1.3, 0);
      group.add(pole);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.4), roofMat);
    roof.position.set(0, 2.65, 0);
    group.add(roof);

    // Sign
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.45),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide }),
    );
    sign.position.set(0, 3.1, 0.2);
    group.add(sign);

    this.scene.add(group);
    this.busStops.push({ group, z, side });

    const count =
      this.config.busStopCapacityMin +
      Math.floor(
        Math.random() *
          (this.config.busStopCapacityMax - this.config.busStopCapacityMin + 1),
      );
    // Show a queue of a few visible, rest counted as demand
    const visible = Math.min(count, 6);
    for (let i = 0; i < visible; i++) {
      this._spawnPerson({
        z: z + (i - visible / 2) * 0.55,
        side,
        offset: this.config.roadSideOffset + 0.3 + (i % 2) * 0.4,
        atStop: true,
      });
    }
    this.eventBus?.emit?.("busstop:spawned", { z, side, waiting: count });
  }

  _spawnRoadside(z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    this._spawnPerson({
      z,
      side,
      offset: this.config.roadSideOffset,
      atStop: false,
    });
  }

  _spawnPerson({ z, side, offset, atStop }) {
    const group = new THREE.Group();
    group.position.set(side * offset, 0, z);

    const paths = [
      ...(MODEL_PATHS?.passengersBoot || []),
      ...((MODEL_PATHS?.passengersMore || []).filter((p) => modelCache?.has?.(p))),
    ];
    const path = paths.length
      ? paths[Math.floor(Math.random() * paths.length)]
      : null;
    let model =
      path && modelCache?.clone ? modelCache.clone(path, 1.55) : null;
    if (!model) {
      model = new THREE.Group();
      const colors = [0x1e3a5f, 0x166534, 0x7c2d12, 0xf8fafc, 0x4c1d95, 0xb45309];
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 0.5, 3, 6),
        new THREE.MeshStandardMaterial({
          color: colors[Math.floor(Math.random() * colors.length)],
          flatShading: true,
        }),
      );
      body.position.y = 0.85;
      model.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x8d5524, flatShading: true }),
      );
      head.position.y = 1.35;
      model.add(head);
    }
    model.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(model);

    if (!atStop) {
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.32),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide }),
      );
      board.position.set(0, 2.0, 0);
      group.add(board);
    }

    const destination =
      DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];
    const base =
      this.config.baseFare +
      Math.round(Math.random() * 120) +
      (this.isNight ? 80 : 0);
    const fareMult = this.isNight ? this.config.nightFareMult : 1;
    const askedFare = Math.round(base * fareMult);

    this.scene.add(group);
    const passenger = {
      group,
      phase: Math.random() * 6,
      state: "waiting",
      destination,
      askedFare,
      atStop,
      callLine: this.isNight
        ? `Ina so in je ${destination}, Mama — night fare ₦${askedFare}`
        : `Sannu! ${destination}? (₦${askedFare})`,
    };
    this.passengers.push(passenger);
    this.eventBus?.emit?.("passenger:spotted", {
      destination,
      fare: askedFare,
      atStop,
    });
  }

  _beginNegotiation(passenger) {
    passenger.state = "negotiating";
    this.negotiating = passenger;
    // Hold vehicle
    this.eventBus?.emit?.("vehicle:hold", { reason: "boarding", hold: true });
    this.eventBus?.emit?.("passenger:boarding", {
      destination: passenger.destination,
      fare: passenger.askedFare,
    });
    this.eventBus?.emit?.("negotiation:started", {
      destination: passenger.destination,
      askedFare: passenger.askedFare,
      lowFare: Math.round(passenger.askedFare * 0.65),
      midFare: passenger.askedFare,
      highFare: Math.round(passenger.askedFare * 1.35),
      night: this.isNight,
      message: passenger.callLine,
    });
  }

  _onNegotiationFinished(payload = {}) {
    if (!this.negotiating) return;
    const p = this.negotiating;
    this.negotiating = null;
    this.eventBus?.emit?.("vehicle:hold", { reason: "boarding", hold: false });

    if (!payload.accepted) {
      p.state = "waiting";
      this.eventBus?.emit?.("hud:notify", {
        text: "Passenger refused — try another",
        type: "info",
      });
      return;
    }

    const i = this.passengers.indexOf(p);
    if (i !== -1) this.passengers.splice(i, 1);
    this.scene.remove(p.group);

    const player = this.player ?? this.game?.systems?.get?.("playerVehicle");
    const playerZ = Number(player?.position?.z) || p.group.position.z;
    const fare = Math.round(Number(payload.fare) || p.askedFare);

    this.activePassenger = {
      pickupZ: playerZ,
      tripDistance:
        this.config.minimumTripDistance +
        Math.random() *
          (this.config.maximumTripDistance - this.config.minimumTripDistance),
      fare,
      destination: p.destination,
    };
    this.totalPickedUp += 1;
    this.eventBus?.emit?.("passenger:boarded", {
      destination: p.destination,
      fare,
      passengerCount: this.totalPickedUp,
    });
    this.eventBus?.emit?.("hud:notify", {
      text: `On board → ${p.destination}`,
      type: "ok",
    });
  }

  _tryDropoff(currentZ, playerX, speed) {
    // Prefer slow near roadside
    if (speed > this.config.stopSpeedMax + 2) {
      this.eventBus?.emit?.("hud:notify", {
        text: "Slow down and pull over to drop passenger",
        type: "hint",
      });
      return;
    }
    this._dropoff(currentZ);
  }

  _dropoff(playerZ) {
    if (!this.activePassenger) return;
    const trip = this.activePassenger;
    const fare = Math.round(trip.fare || this.config.baseFare);
    this.activePassenger = null;
    this.totalDroppedOff += 1;
    this.totalFares += fare;

    this.eventBus?.emit?.("vehicle:hold", { reason: "dropoff", hold: true });
    setTimeout(() => {
      this.eventBus?.emit?.("vehicle:hold", { reason: "dropoff", hold: false });
    }, 900);

    this.eventBus?.emit?.("economy:fare-earned", {
      amount: fare,
      fare,
      destination: trip.destination,
    });
    this.eventBus?.emit?.("passenger:dropped", {
      fare,
      destination: trip.destination,
      totalDroppedOff: this.totalDroppedOff,
      totalFares: this.totalFares,
    });
    this.eventBus?.emit?.("hud:notify", {
      text: `Dropped at roadside · ₦${fare}`,
      type: "ok",
    });
  }

  getStats() {
    return {
      passengersPickedUp: this.totalPickedUp,
      passengersDroppedOff: this.totalDroppedOff,
      totalFares: this.totalFares,
      hasPassenger: Boolean(this.activePassenger),
      waitingPassengers: this.passengers.length,
      busStops: this.busStops.length,
    };
  }

  clear() {
    for (const p of this.passengers) this.scene.remove(p.group);
    for (const s of this.busStops) this.scene.remove(s.group);
    this.passengers = [];
    this.busStops = [];
    this.activePassenger = null;
    this.negotiating = null;
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
