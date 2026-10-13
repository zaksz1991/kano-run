import GAME_CONFIG from "../core/config.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);
const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

export const TRAFFIC_TYPES = Object.freeze({
  KEKE: "keke", CAR: "car", TAXI: "taxi", BUS: "bus",
  MOTORCYCLE: "motorcycle", TRUCK: "truck", POLICE: "police",
  KAROTA: "karota", ROBBER: "robber",
});

// 🔥 OPTIMIZATION: Reduced speeds so the player's Keke (max 25-34) overtakes traffic
const VEHICLE_SPECS = Object.freeze({
  keke: { width: 1.25, length: 2.2, speedMin: 6, speedMax: 12, weight: 0.8, score: 30, colors: ["#e7b923", "#168b50", "#f4f0df"] },
  car: { width: 1.8, length: 4.1, speedMin: 8, speedMax: 16, weight: 1.2, score: 20, colors: ["#d8dce2", "#2466b3", "#c13d35", "#222831"] },
  taxi: { width: 1.8, length: 4.1, speedMin: 7, speedMax: 14, weight: 1.2, score: 25, colors: ["#f2c230", "#e8b925"] },
  bus: { width: 2.25, length: 7.2, speedMin: 5, speedMax: 11, weight: 2.5, score: 40, colors: ["#f0a51c", "#2671a9", "#28804e"] },
  motorcycle: { width: 0.75, length: 1.9, speedMin: 10, speedMax: 18, weight: 0.5, score: 35, colors: ["#242424", "#d93b35", "#f4f4f4"] },
  truck: { width: 2.4, length: 6.5, speedMin: 4, speedMax: 10, weight: 3, score: 50, colors: ["#d4d5d6", "#b84b32", "#337c56"] },
  police: { width: 1.9, length: 4.3, speedMin: 9, speedMax: 17, weight: 1.4, score: 45, colors: ["#e9edf1", "#233a5b"] },
  karota: { width: 1.9, length: 4.3, speedMin: 7, speedMax: 14, weight: 1.4, score: 45, colors: ["#f2a323", "#252525"] },
  robber: { width: 1.8, length: 4, speedMin: 11, speedMax: 20, weight: 1.1, score: 60, colors: ["#202020", "#4c293a"] },
});

const DEFAULT_TRAFFIC_WEIGHTS = {
  keke: 25, car: 22, taxi: 14, bus: 9, motorcycle: 15,
  truck: 6, police: 3, karota: 4, robber: 2,
};

export class TrafficSystem {
  constructor(options = {}) {
    this.config = options.config ?? GAME_CONFIG;
    this.eventBus = options.eventBus ?? null;

    this.lanes = options.lanes ?? [-3.2, 0, 3.2];
    this.spawnDistance = options.spawnDistance ?? 120;
    this.despawnDistance = options.despawnDistance ?? -30;
    this.minimumGap = options.minimumGap ?? 14;
    this.maximumSpawnAttempts = options.maximumSpawnAttempts ?? 12;

    this.vehicles = new Map();
    this.nextVehicleId = 1;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.enabled = false;

    this.weights = { ...DEFAULT_TRAFFIC_WEIGHTS, ...(options.weights ?? {}) };
    this.difficulty = 1;
    this.statistics = { spawned: 0, despawned: 0, nearMisses: 0, collisions: 0 };

    this.eventBus?.on?.("scenery:districtChanged", (payload) => this.applyDistrictWeights(payload?.district || payload?.theme));
    this.eventBus?.on?.("world:districtChanged", (payload) => this.applyDistrictWeights(payload?.district || payload?.theme));
  }

  applyDistrictWeights(districtOrTheme) {
    const key = String(districtOrTheme || "").toLowerCase();
    if (key.includes("city") || key.includes("centre") || key.includes("center") || key.includes("nassarawa")) {
      this.setWeights({ taxi: 25, police: 10, car: 20, keke: 15, bus: 8, motorcycle: 10, truck: 2, karota: 5, robber: 3 });
    } else if (key.includes("sabon") || key.includes("kurmi") || key.includes("market") || key.includes("boko")) {
      this.setWeights({ motorcycle: 28, truck: 14, keke: 22, car: 12, bus: 6, taxi: 8, police: 2, karota: 4, robber: 4 });
    } else if (key.includes("industrial") || key.includes("sharada") || key.includes("bompai")) {
      this.setWeights({ truck: 22, car: 18, bus: 10, motorcycle: 12, keke: 12, taxi: 8, police: 4, karota: 4, robber: 2 });
    } else if (key.includes("outskirt") || key.includes("airport") || key.includes("kumbotso")) {
      this.setWeights({ car: 22, motorcycle: 18, truck: 12, keke: 15, taxi: 10, bus: 8, police: 5, karota: 3, robber: 3 });
    } else {
      this.setWeights(DEFAULT_TRAFFIC_WEIGHTS);
    }
    this.emit("traffic:weights-changed", { district: districtOrTheme, weights: { ...this.weights } });
  }

  start() {
    this.enabled = true;
    this.elapsed = 0;
    this.spawnTimer = 0.5;
    this.emit("traffic:started", { activeVehicles: this.vehicles.size });
  }

  stop() {
    this.enabled = false;
    this.emit("traffic:stopped", { activeVehicles: this.vehicles.size });
  }

  update(deltaSeconds, player = {}) {
    if (!this.enabled) return;
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);

    this.elapsed += dt;
    this.difficulty = 1 + Math.min(1.5, this.elapsed / 180);

    this.updateVehicles(dt, player);
    this.spawnTimer -= dt;

    if (this.spawnTimer <= 0) {
      this.trySpawnTraffic(player);
      this.spawnTimer = randomBetween(0.8, 1.5) / this.difficulty;
    }

    this.removeDistantVehicles(player);
  }

  updateVehicles(dt, player) {
    const playerSpeed = Math.max(0, Number(player.speed) || 0);
    const playerZ = Number(player.z) || Number(player.position?.z) || 0;

    for (const vehicle of this.vehicles.values()) {
      // 🔥 FIX: Always move traffic FORWARD (+Z) at their own speed.
      // The player will naturally overtake slower traffic.
      vehicle.z += vehicle.speed * dt;
      vehicle.previousZ = vehicle.z;

      if (vehicle.laneChangeTimer > 0) {
        vehicle.laneChangeTimer -= dt;
      }

      if (vehicle.type === TRAFFIC_TYPES.ROBBER) {
        this.updateRobber(vehicle, dt, player);
      }
      if (vehicle.type === TRAFFIC_TYPES.MOTORCYCLE) {
        this.updateMotorcycle(vehicle, dt);
      }

      vehicle.x = this.getLaneX(vehicle.lane);
      this.emit("traffic:vehicle-updated", vehicle);
    }
  }

  updateRobber(vehicle, dt, player) {
    if (vehicle.laneChangeTimer > 0) return;

    const playerZ = Number(player.z) || Number(player.position?.z) || 0;
    const playerLane = Number.isFinite(player.lane) ? player.lane : 1;
    const playerSpeed = Math.max(0, Number(player.speed) || 0);
    const distance = vehicle.z - playerZ;

    // STATE 1: THE HUNT — behind player, closing in
    if (distance < 0 && distance > -45) {
      vehicle.speed = Math.max(vehicle.speed, playerSpeed + 3);
      if (vehicle.lane !== playerLane) {
        const candidates = this.getAvailableAdjacentLanes(vehicle);
        if (candidates.includes(playerLane)) {
          vehicle.lane = playerLane;
          vehicle.laneChangeTimer = 1.2;
          vehicle.x = this.getLaneX(vehicle.lane);
          this.emit("traffic:robber-hunt", { vehicleId: vehicle.id, lane: vehicle.lane });
        } else if (candidates.length > 0 && Math.random() < dt * 1.2) {
          vehicle.lane = randomItem(candidates);
          vehicle.laneChangeTimer = 1.5;
          vehicle.x = this.getLaneX(vehicle.lane);
        }
      }
      return;
    }

    // STATE 2: THE BAIT — just ahead, slow and swerve
    if (distance > 0 && distance < 22) {
      vehicle.speed = Math.min(vehicle.speed, Math.max(6, playerSpeed - 5));
      if (vehicle.lane === playerLane) {
        const safeLanes = this.getAvailableAdjacentLanes(vehicle);
        const escapeLanes = safeLanes.filter((l) => l !== playerLane);
        if (escapeLanes.length > 0) {
          vehicle.lane = randomItem(escapeLanes);
          vehicle.laneChangeTimer = 2.5;
          vehicle.x = this.getLaneX(vehicle.lane);
          this.emit("traffic:robber-bait", { vehicleId: vehicle.id, lane: vehicle.lane });
        }
      }
      return;
    }

    // STATE 3: CRUISING
    const specs = VEHICLE_SPECS.robber;
    const cruise = specs.speedMin + Math.random() * (specs.speedMax - specs.speedMin);
    vehicle.speed += (cruise - vehicle.speed) * dt * 2;
  }

  updateMotorcycle(vehicle, dt) {
    if (vehicle.laneChangeTimer > 0) return;
    if (Math.random() < dt * 0.25) {
      const candidates = this.getAvailableAdjacentLanes(vehicle);
      if (candidates.length > 0) {
        vehicle.lane = randomItem(candidates);
        vehicle.laneChangeTimer = randomBetween(1.5, 3);
      }
    }
  }

  trySpawnTraffic(player) {
    for (let attempt = 0; attempt < this.maximumSpawnAttempts; attempt += 1) {
      const lane = Math.floor(Math.random() * this.lanes.length);
      if (!this.hasSafeSpawnGap(lane, this.spawnDistance)) continue;

      const type = this.chooseVehicleType();
      const specs = VEHICLE_SPECS[type];

      const vehicle = {
        id: this.nextVehicleId++,
        type,
        lane,
        x: this.getLaneX(lane),
        z: this.spawnDistance + randomBetween(0, 15),
        speed: randomBetween(specs.speedMin, specs.speedMax),
        width: specs.width,
        length: specs.length,
        weight: specs.weight,
        score: specs.score,
        color: randomItem(specs.colors),
        previousZ: this.spawnDistance,
        laneChangeTimer: randomBetween(1, 4),
        marked: type === TRAFFIC_TYPES.POLICE,
        enforcement: type === TRAFFIC_TYPES.KAROTA,
        hostile: type === TRAFFIC_TYPES.ROBBER,
        passed: false,
        nearMissRecorded: false,
        collisionRecorded: false,
      };

      if (!this.hasSafeSpawnGap(lane, vehicle.z, vehicle.length)) continue;

      this.vehicles.set(vehicle.id, vehicle);
      this.statistics.spawned += 1;
      this.emit("traffic:vehicle-spawned", vehicle);
      return vehicle;
    }
    return null;
  }

  chooseVehicleType() {
    const entries = Object.entries(this.weights).filter(
      ([type, weight]) => VEHICLE_SPECS[type] && Number.isFinite(weight) && weight > 0
    );
    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (totalWeight <= 0) return TRAFFIC_TYPES.CAR;

    let roll = Math.random() * totalWeight;
    for (const [type, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return type;
    }
    return TRAFFIC_TYPES.CAR;
  }

  hasSafeSpawnGap(lane, z, candidateLength = 4) {
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.lane !== lane) continue;
      const requiredGap = Math.max(candidateLength, vehicle.length) / 2 + this.minimumGap;
      if (Math.abs(vehicle.z - z) < requiredGap) return false;
    }
    return true;
  }

  getAvailableAdjacentLanes(vehicle) {
    const candidates = [];
    for (const lane of [vehicle.lane - 1, vehicle.lane + 1]) {
      if (lane < 0 || lane >= this.lanes.length) continue;

      // 🔥 OPTIMIZATION: Prevents GC spikes by avoiding [...this.vehicles.values()]
      let isBlocked = false;
      for (const other of this.vehicles.values()) {
        if (other.id !== vehicle.id && other.lane === lane && Math.abs(other.z - vehicle.z) < this.minimumGap) {
          isBlocked = true;
          break;
        }
      }
      if (!isBlocked) candidates.push(lane);
    }
    return candidates;
  }

  getLaneX(lane) {
    return this.lanes[clamp(Math.round(lane), 0, this.lanes.length - 1)];
  }

  getVehicle(id) { return this.vehicles.get(id) ?? null; }

  getNearbyVehicles(z, range = 30) {
    return [...this.vehicles.values()]
      .filter((vehicle) => Math.abs(vehicle.z - z) <= range)
      .sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z));
  }

  recordNearMiss(vehicleId) {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle || vehicle.nearMissRecorded) return false;
    vehicle.nearMissRecorded = true;
    this.statistics.nearMisses += 1;
    this.emit("traffic:near-miss", { vehicleId, type: vehicle.type, score: vehicle.score });
    return true;
  }

  recordCollision(vehicleId) {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle || vehicle.collisionRecorded) return false;
    vehicle.collisionRecorded = true;
    this.statistics.collisions += 1;
    this.emit("traffic:collision", { vehicleId, type: vehicle.type, weight: vehicle.weight });
    return true;
  }

  removeDistantVehicles(player = {}) {
    const playerZ = Number(player.z) || Number(player.position?.z) || 0;
    for (const [id, vehicle] of this.vehicles) {
      // 🔥 FIX: Correct despawn logic (only remove when BEHIND the player)
      if (vehicle.z < playerZ + this.despawnDistance) {
        this.vehicles.delete(id);
        this.statistics.despawned += 1;
        this.emit("traffic:vehicle-despawned", { id, type: vehicle.type });
      }
    }
  }

  setWeights(weights) {
    this.weights = { ...this.weights, ...weights };
  }

  clear() {
    this.vehicles.clear();
    this.spawnTimer = 0;
    this.elapsed = 0;
  }

  getSnapshot() {
    return {
      enabled: this.enabled,
      elapsed: this.elapsed,
      difficulty: this.difficulty,
      activeVehicles: this.vehicles.size,
      statistics: { ...this.statistics },
      vehicles: [...this.vehicles.values()].map((vehicle) => ({ ...vehicle })),
    };
  }

  onEvent(eventName, callback) { return this.eventBus?.on(eventName, callback) ?? (() => {}); }
  emit(eventName, payload) { this.eventBus?.emit(eventName, payload); }
  destroy() { this.stop(); this.clear(); }
}

export default TrafficSystem;