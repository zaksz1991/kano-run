import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = { maxVehicles: 40, spawnDistance: 150, despawnDistance: 65, laneWidth: 3.2, roadWidth: 12, playerCollisionRadius: 1.1, minimumSpawnGap: 16, vehicleCollisionGap: 8, maxSpawnAttempts: 12 };

const VEHICLE_SPECS = {
  car: { width: 1.8, height: 1.45, length: 4.1, maxSpeed: 23, acceleration: 2.2, weight: 1.2, color: [0xc0392b, 0x2471a3, 0xf4d03f, 0xecf0f1, 0x273746] },
  taxi: { width: 1.85, height: 1.5, length: 4.3, maxSpeed: 19, acceleration: 1.8, weight: 1.3, color: [0xf4d03f, 0xf7dc6f, 0xfdfefe] },
  keke: { width: 1.35, height: 1.75, length: 2.6, maxSpeed: 14, acceleration: 2.8, weight: 0.7, color: [0x1e8449, 0xf1c40f, 0x2471a3, 0xd35400] },
  bus: { width: 2.35, height: 2.8, length: 7.4, maxSpeed: 15, acceleration: 1.1, weight: 3.8, color: [0xf39c12, 0x2471a3, 0x1e8449, 0xf4d03f] },
  motorcycle: { width: 0.8, height: 1.4, length: 2, maxSpeed: 24, acceleration: 3.4, weight: 0.4, color: [0x17202a, 0xc0392b, 0xf4d03f] },
  truck: { width: 2.5, height: 3, length: 8, maxSpeed: 13, acceleration: 0.8, weight: 5, color: [0x95a5a6, 0xd35400, 0x566573] },
  police: { width: 1.9, height: 1.6, length: 4.4, maxSpeed: 25, acceleration: 2.8, weight: 1.5, color: [0xfdfefe, 0x2471a3] },
  karota: { width: 1.9, height: 1.6, length: 4.3, maxSpeed: 20, acceleration: 2.1, weight: 1.4, color: [0xf39c12, 0xfdfefe] },
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
    this.spawnWeights = { car: 30, taxi: 17, keke: 22, bus: 8, motorcycle: 12, truck: 5, police: 3, karota: 3 };
    this._cachedWeightEntries = Object.entries(this.spawnWeights);
    this._totalSpawnWeight = this._cachedWeightEntries.reduce((sum, [, weight]) => sum + weight, 0);
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

  spawnVehicle({ type = null, z = this.playerZ + this.config.spawnDistance, preferredLane = null, speed = null } = {}) {
    if (this.vehicles.size >= this.config.maxVehicles) return null;
    const vehicleType = type ?? this._chooseVehicleType();
    const spec = VEHICLE_SPECS[vehicleType];
    if (!spec) throw new Error(`Unknown vehicle type: ${vehicleType}`);
    const lane = this._findSafeLane(z, preferredLane, spec.length);
    if (lane === null) return null;
    const vehicle = this._createVehicle(vehicleType);
    vehicle.id = `traffic-${this.nextVehicleId++}`; vehicle.type = vehicleType; vehicle.spec = spec;
    vehicle.lane = lane; vehicle.targetLane = lane; vehicle.z = z;
    vehicle.speed = speed ?? randomBetween(spec.maxSpeed * 0.45, spec.maxSpeed * 0.85);
    vehicle.cruiseSpeed = vehicle.speed; vehicle.damage = 0; vehicle.wanderTimer = randomBetween(2, 6);
    vehicle.changeLaneTimer = randomBetween(3, 8); vehicle.stopped = false;
    vehicle.group.position.set(this._laneX(lane), 0, z);
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
      
      // 🔥 FIX: Move traffic FORWARD (+Z) so player can overtake them
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

  _createVehicle(type) {
    const spec = VEHICLE_SPECS[type]; const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: choose(spec.color), roughness: 0.85, metalness: 0.0, flatShading: true });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x252a2c, roughness: 0.85, metalness: 0.0, flatShading: true });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x78949e, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.6, flatShading: true });
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: 0.9, metalness: 0.0, flatShading: true });

    if (type === "motorcycle") this._buildMotorcycle(group, spec, bodyMaterial, darkMaterial, wheelMaterial);
    else if (type === "keke") this._buildKeke(group, spec, bodyMaterial, darkMaterial, glassMaterial, wheelMaterial);
    else this._buildFourWheelVehicle(group, type, spec, bodyMaterial, darkMaterial, glassMaterial, wheelMaterial);

    group.userData.vehicleType = type;
    
    // 🔥 FIX: Rotate traffic vehicles 180 degrees so their front faces +Z (forward)
    group.rotation.y = Math.PI;

    return { group, bodyMaterial, darkMaterial, glassMaterial, wheelMaterial };
  }

  _buildFourWheelVehicle(group, type, spec, bodyMaterial, darkMaterial, glassMaterial, wheelMaterial) {
    const w = spec.width; const h = spec.height; const L = spec.length;
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.6, roughness: 0.4, flatShading: true });
    if (type === "bus") {
      this._addBox(group, "bus-body", w, h * 0.72, L * 0.95, bodyMaterial, 0, h * 0.42, 0); this._addBox(group, "bus-roof", w * 0.98, 0.12, L * 0.92, darkMaterial, 0, h * 0.82, 0);
      this._addBox(group, "bus-windows", w * 1.01, h * 0.28, L * 0.7, glassMaterial, 0, h * 0.58, 0.05); this._addBox(group, "bus-glass-front", w * 0.85, h * 0.35, 0.06, glassMaterial, 0, h * 0.55, -L * 0.46);
      this._addBox(group, "bus-board", w * 0.7, 0.18, 0.05, darkMaterial, 0, h * 0.78, -L * 0.47); this._addBox(group, "bus-door", 0.08, h * 0.55, L * 0.12, darkMaterial, w * 0.51, h * 0.4, -L * 0.15);
    } else if (type === "truck") {
      this._addBox(group, "truck-cab", w * 0.9, h * 0.55, L * 0.28, bodyMaterial, 0, h * 0.38, -L * 0.32); this._addBox(group, "truck-cab-top", w * 0.85, h * 0.28, L * 0.22, bodyMaterial, 0, h * 0.7, -L * 0.3);
      this._addBox(group, "truck-glass", w * 0.7, h * 0.22, 0.05, glassMaterial, 0, h * 0.62, -L * 0.45); this._addBox(group, "truck-bed", w * 0.95, 0.15, L * 0.55, darkMaterial, 0, h * 0.28, L * 0.15);
      this._addBox(group, "truck-cargo", w * 0.9, h * 0.55, L * 0.5, bodyMaterial, 0, h * 0.55, L * 0.15);
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h * 0.5, 6), darkMaterial); exhaust.position.set(-w * 0.4, h * 0.55, -L * 0.2); group.add(exhaust);
    } else if (type === "police" || type === "karota") {
      this._addBox(group, "sedan-body", w, h * 0.38, L * 0.92, bodyMaterial, 0, h * 0.32, 0); this._addBox(group, "sedan-cabin", w * 0.88, h * 0.35, L * 0.45, bodyMaterial, 0, h * 0.58, -L * 0.02);
      this._addBox(group, "sedan-glass", w * 0.8, h * 0.28, L * 0.4, glassMaterial, 0, h * 0.58, -L * 0.02); this._addBox(group, "sedan-hood", w * 0.9, h * 0.12, L * 0.22, bodyMaterial, 0, h * 0.38, -L * 0.35);
      this._addBox(group, "sedan-trunk", w * 0.9, h * 0.12, L * 0.18, bodyMaterial, 0, h * 0.38, L * 0.35);
      if (type === "police") {
        this._addBox(group, "lightbar-base", 0.9, 0.12, 0.28, darkMaterial, 0, h * 0.82, -0.05);
        this._addBox(group, "lightbar-red", 0.35, 0.14, 0.26, new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0x3c0804, flatShading: true }), -0.25, h * 0.88, -0.05);
        this._addBox(group, "lightbar-blue", 0.35, 0.14, 0.26, new THREE.MeshStandardMaterial({ color: 0x2471a3, emissive: 0x102e50, flatShading: true }), 0.25, h * 0.88, -0.05);
      } else this._addBox(group, "karota-sign", 0.95, 0.22, 0.32, darkMaterial, 0, h * 0.85, 0);
    } else if (type === "taxi") {
      this._addBox(group, "taxi-body", w, h * 0.36, L * 0.9, bodyMaterial, 0, h * 0.3, 0); this._addBox(group, "taxi-cabin", w * 0.86, h * 0.32, L * 0.42, bodyMaterial, 0, h * 0.55, 0);
      this._addBox(group, "taxi-glass", w * 0.78, h * 0.26, L * 0.38, glassMaterial, 0, h * 0.55, 0); this._addBox(group, "taxi-hood", w * 0.88, h * 0.1, L * 0.22, bodyMaterial, 0, h * 0.36, -L * 0.34);
      this._addBox(group, "taxi-sign", 0.5, 0.16, 0.22, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, flatShading: true }), 0, h * 0.78, 0);
    } else {
      this._addBox(group, "car-body", w, h * 0.35, L * 0.9, bodyMaterial, 0, h * 0.28, 0); this._addBox(group, "car-cabin", w * 0.85, h * 0.32, L * 0.4, bodyMaterial, 0, h * 0.52, L * 0.02);
      this._addBox(group, "car-glass", w * 0.78, h * 0.25, L * 0.36, glassMaterial, 0, h * 0.52, L * 0.02); this._addBox(group, "car-hood", w * 0.92, h * 0.1, L * 0.25, bodyMaterial, 0, h * 0.34, -L * 0.32);
      this._addBox(group, "car-trunk", w * 0.9, h * 0.1, L * 0.18, bodyMaterial, 0, h * 0.34, L * 0.35);
      for (const side of [-1, 1]) this._addBox(group, "mirror", 0.12, 0.08, 0.06, darkMaterial, side * w * 0.52, h * 0.48, -L * 0.1);
    }
    this._addWheels(group, spec, wheelMaterial, false); this._addHeadlights(group, spec); this._addTailLights(group, spec);
    this._addBox(group, "bumper-f", w * 0.85, 0.12, 0.1, darkMaterial, 0, 0.28, -L * 0.48); this._addBox(group, "bumper-r", w * 0.85, 0.12, 0.1, darkMaterial, 0, 0.28, L * 0.48);
  }

  _buildKeke(group, spec, bodyMaterial, darkMaterial, glassMaterial, wheelMaterial) {
    const w = spec.width; const L = spec.length;
    const canopy = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85, metalness: 0.0, flatShading: true });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.6, roughness: 0.4, flatShading: true });
    this._addBox(group, "keke-nose", w * 0.5, 0.45, L * 0.3, bodyMaterial, 0, 0.7, -L * 0.28); this._addBox(group, "keke-cabin", w * 0.95, 0.4, L * 0.4, bodyMaterial, 0, 0.72, L * 0.12);
    this._addBox(group, "keke-floor", w * 0.9, 0.08, L * 0.7, darkMaterial, 0, 0.45, 0); this._addBox(group, "keke-canopy", w * 1.0, 0.08, L * 0.7, canopy, 0, 1.55, 0.05);
    for (const side of [-1, 1]) { for (const z of [-L * 0.2, L * 0.25]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.7, 6), chrome); pole.position.set(side * w * 0.42, 1.2, z); group.add(pole); } }
    this._addBox(group, "keke-glass", w * 0.4, 0.35, 0.04, glassMaterial, 0, 1.1, -L * 0.4); this._addBox(group, "keke-bench", w * 0.75, 0.12, 0.3, darkMaterial, 0, 0.85, L * 0.15);
    this._addBox(group, "keke-handle", w * 0.45, 0.05, 0.05, chrome, 0, 1.05, -L * 0.32);
    for (const side of [-1, 1]) { const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff7d6, emissive: 0xaa8844, emissiveIntensity: 0.4, flatShading: true })); light.position.set(side * w * 0.18, 0.55, -L * 0.48); group.add(light); }
    this._addWheels(group, spec, wheelMaterial, true);
  }

  _buildMotorcycle(group, spec, bodyMaterial, darkMaterial, wheelMaterial) {
    const L = spec.length; const chrome = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.6, roughness: 0.4, flatShading: true });
    for (const z of [-L * 0.35, L * 0.32]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14), wheelMaterial); wheel.rotation.z = Math.PI / 2; wheel.position.set(0, 0.28, z); wheel.castShadow = true; group.add(wheel);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.13, 10), chrome); rim.rotation.z = Math.PI / 2; rim.position.set(0, 0.28, z); group.add(rim);
    }
    this._addBox(group, "moto-frame", 0.12, 0.15, L * 0.55, darkMaterial, 0, 0.55, 0);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 10), bodyMaterial); tank.rotation.z = Math.PI / 2; tank.position.set(0, 0.78, -0.05); tank.castShadow = true; group.add(tank);
    this._addBox(group, "moto-seat", 0.28, 0.1, 0.4, darkMaterial, 0, 0.85, 0.28); this._addBox(group, "moto-handle", 0.7, 0.05, 0.05, chrome, 0, 1.05, -L * 0.28);
    for (const side of [-1, 1]) this._addBox(group, "fork", 0.04, 0.45, 0.04, chrome, side * 0.08, 0.55, -L * 0.32);
    const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfdf2c5, emissive: 0x554422, emissiveIntensity: 0.5, flatShading: true })); headlight.position.set(0, 0.75, -L * 0.42); group.add(headlight);
    this._addBox(group, "rider-body", 0.3, 0.35, 0.25, darkMaterial, 0, 1.15, 0.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true })); head.position.set(0, 1.45, 0.05); group.add(head);
  }

  _addWheels(group, spec, material, threeWheeler = false) {
    const radius = spec.height > 2.3 ? 0.48 : 0.34; const wheelWidth = 0.18; const x = spec.width * 0.48;
    const zPositions = threeWheeler ? [-spec.length * 0.36, spec.length * 0.36] : [-spec.length * 0.33, spec.length * 0.33];
    for (const z of zPositions) {
      for (const side of [-1, 1]) {
        if (threeWheeler && z === zPositions[0] && side === 1) continue;
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, wheelWidth, 12), material);
        wheel.name = "vehicle-wheel"; wheel.rotation.z = Math.PI / 2; wheel.position.set(side * x, radius, z); wheel.castShadow = true; group.add(wheel);
      }
    }
  }

  _addHeadlights(group, spec) {
    const material = new THREE.MeshStandardMaterial({ color: 0xfdf4d0, emissive: 0x55472a, flatShading: true });
    for (const side of [-1, 1]) this._addBox(group, "vehicle-headlight", 0.22, 0.14, 0.08, material, side * spec.width * 0.32, 0.45, -spec.length * 0.49);
  }

  _addTailLights(group, spec) {
    const material = new THREE.MeshStandardMaterial({ color: 0xb3261e, emissive: 0x330400, flatShading: true });
    for (const side of [-1, 1]) this._addBox(group, "vehicle-tail-light", 0.2, 0.13, 0.08, material, side * spec.width * 0.32, 0.45, spec.length * 0.49);
  }

  _addBox(group, name, width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
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
  dispose() { this.clear(); for (const dispose of this._disposers ?? []) { try { dispose(); } catch {} } this._disposers = []; this.initialized = false; }
}
export { VEHICLE_SPECS, VEHICLE_TYPES };