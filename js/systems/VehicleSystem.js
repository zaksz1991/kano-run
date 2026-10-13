import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";
import { MODEL_PATHS, MODEL_SCALES } from "../core/AssetCatalog.js";

const DEFAULTS = { maxVehicles: 40, spawnDistance: 150, despawnDistance: 65, laneWidth: 3.2, roadWidth: 12, playerCollisionRadius: 1.1, minimumSpawnGap: 16, vehicleCollisionGap: 8, maxSpawnAttempts: 12 };

const VEHICLE_SPECS = {
  car: { width: 1.8, height: 1.45, length: 4.1, maxSpeed: 23, acceleration: 2.2, weight: 1.2, color: [0xc0392b, 0x2471a3, 0xf4d03f, 0xecf0f1, 0x273746], modelPath: MODEL_PATHS.traffic.car, modelScale: MODEL_SCALES.traffic.car },
  car1: { width: 1.8, height: 1.45, length: 4.1, maxSpeed: 22, acceleration: 2.0, weight: 1.2, color: [0x2980b9, 0x8e44ad, 0x16a085], modelPath: MODEL_PATHS.traffic.car1, modelScale: MODEL_SCALES.traffic.car1 },
  car2: { width: 1.8, height: 1.45, length: 4.1, maxSpeed: 21, acceleration: 1.9, weight: 1.3, color: [0xe74c3c, 0xf39c12, 0x2c3e50], modelPath: MODEL_PATHS.traffic.car2, modelScale: MODEL_SCALES.traffic.car2 },
  taxi: { width: 1.85, height: 1.5, length: 4.3, maxSpeed: 19, acceleration: 1.8, weight: 1.3, color: [0xf4d03f, 0xf7dc6f, 0xfdfefe], modelPath: MODEL_PATHS.traffic.taxi, modelScale: MODEL_SCALES.traffic.taxi },
  bus: { width: 2.35, height: 2.8, length: 7.4, maxSpeed: 15, acceleration: 1.1, weight: 3.8, color: [0xf39c12, 0x2471a3, 0x1e8449, 0xf4d03f], modelPath: MODEL_PATHS.traffic.bus, modelScale: MODEL_SCALES.traffic.bus },
  motorcycle: { width: 0.8, height: 1.4, length: 2, maxSpeed: 24, acceleration: 3.4, weight: 0.4, color: [0x17202a, 0xc0392b, 0xf4d03f], modelPath: MODEL_PATHS.traffic.motorcycle, modelScale: MODEL_SCALES.traffic.motorcycle },
  truck: { width: 2.5, height: 3, length: 8, maxSpeed: 13, acceleration: 0.8, weight: 5, color: [0x95a5a6, 0xd35400, 0x566573], modelPath: MODEL_PATHS.traffic.pickup, modelScale: MODEL_SCALES.traffic.pickup },
  police: { width: 1.9, height: 1.6, length: 4.4, maxSpeed: 25, acceleration: 2.8, weight: 1.5, color: [0xfdfefe, 0x2471a3], modelPath: MODEL_PATHS.traffic.car3, modelScale: MODEL_SCALES.traffic.car3 },
  karota: { width: 1.9, height: 1.6, length: 4.3, maxSpeed: 20, acceleration: 2.1, weight: 1.4, color: [0xf39c12, 0xfdfefe], modelPath: MODEL_PATHS.traffic.car4, modelScale: MODEL_SCALES.traffic.car4 },
};

const VEHICLE_TYPES = Object.keys(VEHICLE_SPECS);
function randomBetween(min, max) { return min + Math.random() * (max - min); }
function choose(items) { return items[Math.floor(Math.random() * items.length)]; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function disposeVehicle(vehicle) {
  vehicle.group.traverse((object) => {
    if (!object.isMesh) return; object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
}

export default class VehicleSystem {
  constructor({ scene, camera = null, player = null, drivingSystem = null, collisionSystem = null, trafficSystem = null, eventBus = null, config = {} } = {}) {
    if (!scene) throw new Error("VehicleSystem requires a Three.js scene.");
    this.scene = scene; this.camera = camera; this.player = player; this.drivingSystem = drivingSystem; this.collisionSystem = collisionSystem; this.trafficSystem = trafficSystem; this.eventBus = eventBus;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.traffic ?? {}), ...config };
    this.vehicles = new Map(); this.nextVehicleId = 1; this.playerZ = 0; this.playerLane = 1; this.playerSpeed = 0; this.spawnTimer = 0; this.initialized = false; this.paused = false;
    this.spawnWeights = { car: 20, car1: 10, car2: 10, taxi: 17, bus: 8, motorcycle: 15, truck: 5, police: 3, karota: 3 };
    this._cachedWeightEntries = Object.entries(this.spawnWeights);
    this._totalSpawnWeight = this._cachedWeightEntries.reduce((sum, [, weight]) => sum + weight, 0);
    this._glbLoader = new GLTFLoader(); this._modelCache = new Map();
    
    this._onRunStarted = () => { this.paused = false; };
    this._onRunEnded = () => { this.paused = true; };
    this._subscribe("game:started", this._onRunStarted); this._subscribe("game:finished", this._onRunEnded); this._subscribe("game:over", this._onRunEnded);
    this._subscribe("game:paused", () => { this.paused = true; }); this._subscribe("game:resumed", () => { this.paused = false; });
  }

  _subscribe(eventName, handler) {
    if (!this.eventBus?.on) return;
    const result = this.eventBus.on(eventName, handler);
    if (typeof result === "function") { this._disposers ??= []; this._disposers.push(result); }
    else if (this.eventBus.off) { this._disposers ??= []; this._disposers.push(() => this.eventBus.off(eventName, handler)); }
  }

  initialize({ playerZ = 0, playerLane = 1, initialVehicles = 8 } = {}) {
    if (this.initialized) return this;
    this.playerZ = playerZ; this.playerLane = clamp(playerLane, 0, 2);
    for (let i = 0; i < initialVehicles; i += 1) {
      const z = playerZ + 28 + i * (this.config.spawnDistance / initialVehicles);
      this.spawnVehicle({ z, preferredLane: i % 3 });
    }
    this.initialized = true;
    this.eventBus?.emit?.("vehicles:initialized", { count: this.vehicles.size });
    return this;
  }

  update(deltaTime, state = {}) {
    if (!this.initialized || this.paused) return;
    const dt = clamp(deltaTime || 0, 0, 0.05);
    this.playerZ = Number.isFinite(state.playerZ) ? state.playerZ : this.playerZ;
    this.playerLane = Number.isFinite(state.playerLane) ? clamp(state.playerLane, 0, 2) : this.playerLane;
    this.playerSpeed = Number.isFinite(state.playerSpeed) ? Math.max(0, state.playerSpeed) : this.playerSpeed;
    this._updateVehicles(dt); this._removeDistantVehicles(); this._spawnTraffic(dt);
  }

  async spawnVehicle({ type = null, z = this.playerZ + this.config.spawnDistance, preferredLane = null, speed = null } = {}) {
    if (this.vehicles.size >= this.config.maxVehicles) return null;
    const vehicleType = type ?? this._chooseVehicleType();
    const spec = VEHICLE_SPECS[vehicleType];
    if (!spec) throw new Error(`Unknown vehicle type: ${vehicleType}`);
    const lane = this._findSafeLane(z, preferredLane, spec.length);
    if (lane === null) return null;

    let vehicle;
    try { vehicle = await this._createVehicle(vehicleType); } 
    catch (error) { console.warn(`Failed to load model for ${vehicleType}:`, error); vehicle = this._createFallbackVehicle(vehicleType, spec); }

    vehicle.id = `traffic-${this.nextVehicleId++}`; vehicle.type = vehicleType; vehicle.spec = spec;
    vehicle.lane = lane; vehicle.targetLane = lane; vehicle.z = z;
    vehicle.speed = speed ?? randomBetween(spec.maxSpeed * 0.45, spec.maxSpeed * 0.85);
    vehicle.cruiseSpeed = vehicle.speed; vehicle.damage = 0; vehicle.wanderTimer = randomBetween(2, 6);
    vehicle.changeLaneTimer = randomBetween(3, 8); vehicle.stopped = false;

    vehicle.group.position.set(this._laneX(lane), 0, z);
    vehicle.group.rotation.y = Math.PI; // Face forward

    this.vehicles.set(vehicle.id, vehicle); this.scene.add(vehicle.group);
    this.eventBus?.emit?.("vehicle:spawned", { id: vehicle.id, type: vehicle.type, lane: vehicle.lane, z: vehicle.z, speed: vehicle.speed });
    return vehicle;
  }

  removeVehicle(id, reason = "removed") {
    const vehicle = this.vehicles.get(id); if (!vehicle) return false;
    this.scene.remove(vehicle.group); disposeVehicle(vehicle); this.vehicles.delete(id);
    this.eventBus?.emit?.("vehicle:removed", { id, type: vehicle.type, reason }); return true;
  }

  getVehicle(id) { return this.vehicles.get(id) ?? null; }
  getVehicles() { return Array.from(this.vehicles.values()).map((v) => ({ id: v.id, type: v.type, lane: v.lane, targetLane: v.targetLane, x: v.group.position.x, y: v.group.position.y, z: v.z, speed: v.speed, length: v.spec.length, width: v.spec.width, damage: v.damage })); }
  getSnapshot() {
    const counts = {}; for (const v of this.vehicles.values()) counts[v.type] = (counts[v.type] ?? 0) + 1;
    return { initialized: this.initialized, paused: this.paused, count: this.vehicles.size, playerZ: this.playerZ, playerLane: this.playerLane, playerSpeed: this.playerSpeed, counts };
  }

  _updateVehicles(dt) {
    for (const vehicle of this.vehicles.values()) {
      this._updateLaneChange(vehicle, dt); this._updateFollowing(vehicle, dt);
      if (vehicle.stopped) vehicle.speed = Math.max(0, vehicle.speed - 5 * dt);
      vehicle.z += vehicle.speed * dt;
      vehicle.group.position.x = THREE.MathUtils.damp(vehicle.group.position.x, this._laneX(vehicle.targetLane), 5, dt);
      vehicle.group.position.z = vehicle.z;
      this._avoidVehicleAhead(vehicle, dt); this._checkPlayerProximity(vehicle);
    }
  }

  _updateLaneChange(vehicle, dt) {
    vehicle.changeLaneTimer -= dt; if (vehicle.changeLaneTimer > 0) return;
    vehicle.changeLaneTimer = randomBetween(3, 8); if (Math.random() > 0.28) return;
    const candidates = [vehicle.lane - 1, vehicle.lane + 1].filter((lane) => lane >= 0 && lane <= 2);
    if (candidates.length > 0) {
      const candidate = candidates[Math.floor(Math.random() * candidates.length)];
      if (this._isLaneSafe(candidate, vehicle.z, vehicle.spec.length, vehicle.id)) {
        vehicle.targetLane = candidate; vehicle.lane = candidate;
        this.eventBus?.emit?.("vehicle:laneChanged", { id: vehicle.id, lane: candidate });
      }
    }
  }

  _updateFollowing(vehicle, dt) {
    let nearestGap = Infinity; let frontVehicle = null;
    for (const other of this.vehicles.values()) {
      if (other.id === vehicle.id || other.lane !== vehicle.lane) continue;
      const gap = other.z - vehicle.z; if (gap > 0 && gap < nearestGap) { nearestGap = gap; frontVehicle = other; }
    }
    if (!frontVehicle) { vehicle.speed = THREE.MathUtils.damp(vehicle.speed, vehicle.cruiseSpeed, 0.65, dt); return; }
    const safeGap = (vehicle.spec.length + frontVehicle.spec.length) / 2 + this.config.vehicleCollisionGap;
    if (nearestGap < safeGap) {
      vehicle.speed = Math.max(0, vehicle.speed - 9 * dt);
      if (nearestGap < safeGap * 0.65) { const sideLane = this._findAdjacentSafeLane(vehicle); if (sideLane !== null) { vehicle.targetLane = sideLane; vehicle.lane = sideLane; } }
    } else { vehicle.speed = THREE.MathUtils.damp(vehicle.speed, vehicle.cruiseSpeed, 0.8, dt); }
  }

  _avoidVehicleAhead(vehicle, dt) {
    const playerGap = vehicle.z - this.playerZ;
    if (playerGap < 0 || playerGap > 18 || vehicle.lane !== this.playerLane) return;
    const relativeSpeed = this.playerSpeed - vehicle.speed; if (relativeSpeed <= 0) return;
    if (playerGap < 10) {
      const sideLane = this._findAdjacentSafeLane(vehicle);
      if (sideLane !== null) { vehicle.targetLane = sideLane; vehicle.lane = sideLane; }
      else vehicle.speed = Math.max(0, vehicle.speed - 6 * dt);
    }
  }

  _checkPlayerProximity(vehicle) {
    const longitudinalGap = Math.abs(vehicle.z - this.playerZ); if (longitudinalGap > 4.5) return;
    if (vehicle.lane === this.playerLane) this.eventBus?.emit?.("vehicle:playerThreat", { id: vehicle.id, type: vehicle.type, lane: vehicle.lane, distance: longitudinalGap });
  }

  _spawnTraffic(dt) {
    this.spawnTimer -= dt; if (this.spawnTimer > 0 || this.vehicles.size >= this.config.maxVehicles) return;
    const densityFactor = clamp(this.playerSpeed / 18, 0.45, 1.4);
    this.spawnTimer = randomBetween(0.55, 1.25) / densityFactor;
    const z = this.playerZ + randomBetween(this.config.spawnDistance * 0.65, this.config.spawnDistance);
    this.spawnVehicle({ z, preferredLane: Math.floor(Math.random() * 3) });
  }

  _removeDistantVehicles() {
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.z < this.playerZ - this.config.despawnDistance) this.removeVehicle(vehicle.id, "behind-player");
    }
  }

  async _createVehicle(type) {
    const spec = VEHICLE_SPECS[type];
    const cacheKey = spec.modelPath;
    let gltf;
    if (this._modelCache.has(cacheKey)) { gltf = this._modelCache.get(cacheKey); } 
    else {
      gltf = await new Promise((resolve, reject) => {
        this._glbLoader.load(cacheKey, (loaded) => { this._modelCache.set(cacheKey, loaded); resolve(loaded); }, undefined, reject);
      });
    }
    const group = gltf.scene.clone(true);
    if (spec.modelScale) group.scale.setScalar(spec.modelScale);
    const color = choose(spec.color);
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true; child.receiveShadow = true;
        if (child.material) {
          const material = child.material.clone();
          material.color.set(color); material.roughness = 0.85; material.metalness = 0.0; material.flatShading = true;
          child.material = material;
        }
      }
    });
    return { group };
  }

  _createFallbackVehicle(type, spec) {
    const group = new THREE.Group();
    const color = choose(spec.color);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85, metalness: 0.0, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height * 0.6, spec.length), bodyMaterial);
    body.position.y = spec.height * 0.3; body.castShadow = true;
    group.add(body);
    return { group };
  }

  _chooseVehicleType() {
    let roll = Math.random() * this._totalSpawnWeight;
    for (const [type, weight] of this._cachedWeightEntries) { roll -= weight; if (roll <= 0) return type; }
    return "car";
  }

  _findSafeLane(z, preferredLane, vehicleLength) {
    const lanes = [0, 1, 2];
    if (Number.isInteger(preferredLane) && preferredLane >= 0 && preferredLane <= 2) lanes.sort((a, b) => Math.abs(a - preferredLane) - Math.abs(b - preferredLane));
    else lanes.sort(() => Math.random() - 0.5);
    for (const lane of lanes) if (this._isLaneSafe(lane, z, vehicleLength, null) && !this._overlapsPlayer(lane, z, vehicleLength)) return lane;
    return null;
  }

  _isLaneSafe(lane, z, vehicleLength, excludeId = null) {
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.id === excludeId) continue;
      const longitudinalGap = Math.abs(vehicle.z - z);
      const requiredGap = (vehicle.spec.length + vehicleLength) / 2 + this.config.minimumSpawnGap;
      if ((vehicle.lane === lane || vehicle.targetLane === lane) && longitudinalGap < requiredGap) return false;
    }
    return true;
  }

  _overlapsPlayer(lane, z, vehicleLength) {
    const longitudinalGap = Math.abs(z - this.playerZ);
    const requiredGap = vehicleLength / 2 + this.config.playerCollisionRadius + this.config.minimumSpawnGap;
    return lane === this.playerLane && longitudinalGap < requiredGap;
  }

  _findAdjacentSafeLane(vehicle) {
    const candidates = [vehicle.lane - 1, vehicle.lane + 1].filter((lane) => lane >= 0 && lane <= 2);
    for (const lane of candidates) if (this._isLaneSafe(lane, vehicle.z, vehicle.spec.length, vehicle.id)) return lane;
    return null;
  }

  _laneX(lane) { const positions = GAME_CONFIG?.LANE_POSITIONS ?? [-this.config.laneWidth, 0, this.config.laneWidth]; return positions[clamp(lane, 0, positions.length - 1)]; }
  setPlayerState({ z, lane, speed } = {}) { if (Number.isFinite(z)) this.playerZ = z; if (Number.isFinite(lane)) this.playerLane = clamp(lane, 0, 2); if (Number.isFinite(speed)) this.playerSpeed = Math.max(0, speed); }
  pause() { this.paused = true; } resume() { this.paused = false; }
  clear() { for (const id of [...this.vehicles.keys()]) this.removeVehicle(id, "cleared"); }
  dispose() {
    this.clear();
    for (const dispose of this._disposers ?? []) { try { dispose(); } catch {} }
    this._disposers = []; this.initialized = false; this._modelCache.clear();
  }
}
export { VEHICLE_SPECS, VEHICLE_TYPES };