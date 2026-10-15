import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";
import { MODEL_PATHS, MODEL_SCALES } from "../core/AssetCatalog.js";

const DEFAULTS = {
  laneWidth: 3.8,
  roadWidth: 14,
  fuelCapacity: 100,
  fuelConsumption: 0.028,
  initialCondition: 100,
  collisionCooldown: 1.2,
  damagePerCollision: 18,
  vehicleWidth: 1.7,
  vehicleHeight: 1.5,
  vehicleLength: 3.5,
};

const VEHICLE_PRESETS = {
  standard: {
    name: "Standard Adaidaita", width: 1.65, height: 1.65, length: 2.7,
    maxSpeed: 25, acceleration: 10, handling: 1, fuelCapacity: 100, fuelConsumption: 0.028,
    color: 0xfbbf24, modelPath: MODEL_PATHS.player.standard, modelScale: MODEL_SCALES.player.standard,
    style: "standard", passengers: 3,
  },
  luxury: {
    name: "Luxury Adaidaita", width: 1.8, height: 1.75, length: 2.9,
    maxSpeed: 29, acceleration: 12, handling: 1.12, fuelCapacity: 115, fuelConsumption: 0.03,
    color: 0xc9a227, modelPath: MODEL_PATHS.player.luxury, modelScale: MODEL_SCALES.player.luxury,
    style: "luxury", passengers: 3,
  },
  cargo: {
    name: "Cargo Adaidaita", width: 1.9, height: 1.8, length: 3.2,
    maxSpeed: 22, acceleration: 8, handling: 0.85, fuelCapacity: 120, fuelConsumption: 0.035,
    color: 0x305e48, modelPath: MODEL_PATHS.player.cargo, modelScale: MODEL_SCALES.player.cargo,
    style: "cargo", passengers: 1,
  },
  open: {
    name: "Open Adaidaita", width: 1.7, height: 1.6, length: 2.8,
    maxSpeed: 27, acceleration: 11, handling: 1.08, fuelCapacity: 95, fuelConsumption: 0.028,
    color: 0xd4a72c, modelPath: MODEL_PATHS.player.open, modelScale: MODEL_SCALES.player.open,
    style: "open", passengers: 3,
  },
  police: {
    name: "Police Adaidaita", width: 1.75, height: 1.7, length: 2.9,
    maxSpeed: 31, acceleration: 14, handling: 1.15, fuelCapacity: 110, fuelConsumption: 0.032,
    color: 0xf3f3ed, modelPath: MODEL_PATHS.player.police, modelScale: MODEL_SCALES.player.police,
    style: "police", passengers: 2,
  },
  karota: {
    name: "KAROTA Adaidaita", width: 1.75, height: 1.7, length: 2.9,
    maxSpeed: 28, acceleration: 12, handling: 1.1, fuelCapacity: 105, fuelConsumption: 0.03,
    color: 0xe5a323, modelPath: MODEL_PATHS.player.karota, modelScale: MODEL_SCALES.player.karota,
    style: "karota", passengers: 2,
  },
};

const MODEL_CACHE = new Map();

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function damp(current, target, smoothing, dt) { return THREE.MathUtils.damp(current, target, smoothing, dt); }

function cloneMaterial(material) {
  if (Array.isArray(material)) return material.map((item) => item?.clone?.() ?? item);
  return material?.clone?.() ?? material;
}

function forEachMaterial(material, callback) {
  if (Array.isArray(material)) material.forEach((item) => { if (item) callback(item); });
  else if (material) callback(material);
}

function disposeMaterial(material) {
  forEachMaterial(material, (item) => item.dispose?.());
}

export default class PlayerVehicleSystem {
  constructor(ctx = {}) {
    const { scene, camera = null, inputManager = null, input = null, gameState = null, eventBus = null, config = {} } = ctx;

    if (!scene) throw new Error("PlayerVehicleSystem requires a Three.js scene.");

    this.scene = scene;
    this.camera = camera;
    this.inputManager = inputManager || input || null;
    this.gameState = gameState;
    this.eventBus = eventBus;
    
    this._headlights = [];
    this._nightLightsOn = false;
    this._held = false;
    this._speedCap = 0;
    this.limpMode = false;

    // 🔥 Physics State Sync
    this.physicsState = { 
      x: 0, z: 0, y: 0, speed: 0, speedKmh: 0, 
      roll: 0, quaternion: new THREE.Quaternion() 
    };

    if (this.eventBus?.on) {
      this.eventBus.on("physics:state", (p) => {
        this.physicsState = p;
        this.speed = p.speed; // m/s
      });
      this.eventBus.on("lighting:night", (p) => this._setHeadlights(Boolean(p?.isNight)));
      this.eventBus.on("daynight:changed", (p) => this._setHeadlights(Boolean(p?.isNight || p?.phase === "night" || p?.phase === "evening")));
      this.eventBus.on("vehicle:hold", (p) => {
        this._held = Boolean(p?.hold);
      });
      this.eventBus.on("player:force-speed-cap", (p) => { this._speedCap = Number(p.maxSpeed) || 0; });
      this.eventBus.on("player:limp-mode", (p) => { this.limpMode = Boolean(p.active); });
      this.eventBus.on("player:revive", (p) => {
        this.isDestroyed = false; this.enabled = true;
        this.condition = Math.max(35, this.condition || 40);
        this.damage = Math.min(this.damage, 55);
        this.collisionTimer = Number(p.invulnSeconds) || 2.5;
        if (this.vehicle) this.vehicle.visible = true;
        this.eventBus?.emit?.("playerVehicle:revived", { condition: this.condition });
      });
    }

    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.driving ?? {}), ...config };

    this.vehicle = null;
    this.vehicleType = "standard";
    this.preset = VEHICLE_PRESETS.standard;

    this.position = new THREE.Vector3(0, 0, 0);
    this.targetX = 0;
    this.steeringInput = 0;
    this.lane = 1;
    this.distance = 0;

    this.fuel = this.preset.fuelCapacity;
    this.condition = this.config.initialCondition;
    this.damage = 0;
    this.collisionTimer = 0;

    this.isAccelerating = false;
    this.isBraking = false;
    this.isOffRoad = false;
    this.isDestroyed = false;
    this.initialized = false;
    this.enabled = true;

    this.paintColor = this.preset.color;
    this._disposers = [];
    this._glbLoader = new GLTFLoader();
    this._modelLoaded = false;
    this._vehicleRequest = 0;

    this._subscribe("vehicle:select", (payload) => { if (payload?.type) this.setVehicleType(payload.type); });
    this._subscribe("vehicle:paintChanged", (payload) => { if (payload?.color !== undefined) this.setPaint(payload.color); });
    this._subscribe("collision:player", (payload) => { this.applyCollision(payload); });
    this._subscribe("game:paused", () => { this.enabled = false; });
    this._subscribe("game:resumed", () => { this.enabled = true; });
  }

  _subscribe(eventName, handler) {
    if (!this.eventBus?.on) return;
    this._disposers ??= [];
    const result = this.eventBus.on(eventName, handler);
    if (typeof result === "function") this._disposers.push(result);
    else if (this.eventBus.off) this._disposers.push(() => this.eventBus.off(eventName, handler));
  }

  async initialize(opts = {}) {
    const lane = Number.isFinite(opts.lane) ? opts.lane : 1;
    const z = Number.isFinite(opts.z) ? opts.z : 0;
    const vehicleType = (typeof opts.vehicleType === "string" && VEHICLE_PRESETS[opts.vehicleType]) ? opts.vehicleType : "standard";
    const paint = (typeof opts.paint === "number" || typeof opts.paint === "string") ? opts.paint : null;

    if (this.initialized && this.vehicle) { this.vehicle.visible = true; return this; }

    this.lane = clamp(lane, 0, 2);
    this.position.set(this._laneX(this.lane), 0, z);
    this.targetX = this.position.x;

    await this.setVehicleType(vehicleType, { reset: true });

    if (paint !== null) this.setPaint(paint);

    if (this.vehicle) {
      this.vehicle.visible = true;
      this.vehicle.frustumCulled = false;
      this.vehicle.traverse((child) => {
        if (child.isMesh) { child.visible = true; child.frustumCulled = false; }
      });
    }

    this.initialized = true;
    this.enabled = true;
    try { opts.cameraSystem?.setTarget?.(this); } catch {}

    this.eventBus?.emit?.("playerVehicle:initialized", { type: this.vehicleType, lane: this.lane, position: this.position.toArray() });
    return this;
  }

  start() {
    if (!this.vehicle) this.initialize({ lane: 1, z: 0 });
    if (this.vehicle) this.vehicle.visible = true;
    this.enabled = true;
    this.initialized = true;
  }

  update(deltaTime, state = {}) {
    if (this._held) return;
    if (!this.initialized || !this.enabled || this.isDestroyed || !this.vehicle) return;

    const dt = clamp(deltaTime || 0, 0, 0.05);
    this.collisionTimer = Math.max(0, this.collisionTimer - dt);

    this._readInput(state);
    this._pushPhysicsInput(); // 🔥 Sends inputs to PhysicsSystem
    
    this._updateFuel(dt);
    this._updateCondition();

    // 🔥 VISUAL SYNC: Apply physics position and rotation to the mesh
    this.vehicle.position.set(this.physicsState.x, this.physicsState.y, this.physicsState.z);
    this.vehicle.quaternion.copy(this.physicsState.quaternion);

    // Update distance based on physics speed
    this.distance += Math.abs(this.speed) * dt;

    // Calculate off-road based on physics X position
    this.isOffRoad = Math.abs(this.physicsState.x) > this.config.roadWidth / 2 - this.preset.width * 0.35;

    // Update approximate lane for UI
    this.lane = clamp(Math.round((this.physicsState.x + this.config.laneWidth) / this.config.laneWidth), 0, 2);

    // Update Camera to follow physics position
    this._updateCamera(dt);

    // Update Game State
    this.gameState?.setSpeed?.(this.physicsState.speedKmh);
    this.gameState?.setDistance?.(this.distance);

    this.eventBus?.emit?.("playerVehicle:updated", {
      type: this.vehicleType,
      speed: this.physicsState.speedKmh,
      lane: this.lane,
      x: this.physicsState.x,
      z: this.physicsState.z,
      fuel: this.fuel,
      condition: this.condition,
      distance: this.distance,
      offRoad: this.isOffRoad,
    });
  }

  _readInput(state) {
    const input = this.inputManager;
    const accelerate = state.accelerate ?? input?.isDown?.("accelerate") ?? input?.isDown?.("gas") ?? false;
    const brake = state.brake ?? input?.isDown?.("brake") ?? false;
    const left = state.left ?? input?.isDown?.("left") ?? false;
    const right = state.right ?? input?.isDown?.("right") ?? false;
    const steeringAxis = Number(state.steeringAxis) || (left ? 1 : 0) - (right ? 1 : 0);

    this.isAccelerating = Boolean(accelerate);
    this.isBraking = Boolean(brake);
    this.steeringInput = clamp(steeringAxis, -1, 1);
  }

  _updateFuel(dt) {
    if (!this.isAccelerating || this.speed <= 0) return;
    const consumption = this.config.fuelConsumption * this.preset.fuelConsumption * Math.max(0.4, this.speed / 10);
    const previousFuel = this.fuel;
    this.fuel = Math.max(0, this.fuel - consumption * dt);
    if (previousFuel > 0 && this.fuel <= 0) {
      this.eventBus?.emit?.("playerVehicle:fuelEmpty", { vehicleType: this.vehicleType });
    }
  }

  _updateCondition() {
    this.condition = clamp(this.condition, 0, 100);
    if (this.condition <= 0 && !this.isDestroyed) {
      this.isDestroyed = true;
      this.eventBus?.emit?.("playerVehicle:destroyed", { condition: this.condition, damage: this.damage });
      this.eventBus?.emit?.("lives:request-continue", { reason: "destroyed" });
    }
  }

  _updateCamera(dt) {
    if (!this.camera) return;
    // Camera smoothly follows the physics position
    const targetPosition = new THREE.Vector3(this.physicsState.x * 0.35, 4.2, this.physicsState.z - 9.5);
    this.camera.position.x = damp(this.camera.position.x, targetPosition.x, 4, dt);
    this.camera.position.y = damp(this.camera.position.y, targetPosition.y, 3, dt);
    this.camera.position.z = damp(this.camera.position.z, targetPosition.z, 4, dt);
    this.camera.lookAt(this.physicsState.x * 0.25, 0.4, this.physicsState.z + 12);
  }

  async setVehicleType(type, { reset = false } = {}) {
    const preset = VEHICLE_PRESETS[type];
    if (!preset) throw new Error(`Unknown player vehicle type: ${type}`);

    const requestId = ++this._vehicleRequest;
    const previousType = this.vehicleType;
    const previousVehicle = this.vehicle;

    this.vehicleType = type;
    this.preset = preset;
    this.fuel = reset ? preset.fuelCapacity : Math.min(this.fuel, preset.fuelCapacity);
    this.paintColor = preset.color;

    let nextVehicle;
    let modelLoaded = false;

    try {
      nextVehicle = await this._loadGLBModel(preset);
      modelLoaded = true;
    } catch (error) {
      console.warn(`[PlayerVehicle] Could not load ${preset.modelPath}. Using fallback.`, error);
      nextVehicle = this._createFallbackVehicle(preset);
    }

    if (requestId !== this._vehicleRequest) {
      if (!modelLoaded) this._disposeVehicle(nextVehicle);
      return this;
    }

    if (previousVehicle) {
      this.scene.remove(previousVehicle);
      this._disposeVehicle(previousVehicle);
    }

    this.vehicle = nextVehicle;
    this._modelLoaded = modelLoaded;

    if (modelLoaded) {
      this._applyPaintToVehicle(this.vehicle, this.paintColor);
    }

    this.vehicle.position.set(this.physicsState.x || 0, 0, this.physicsState.z || 0);
    this.vehicle.visible = true;
    this.vehicle.frustumCulled = false;
    this.scene.add(this.vehicle);

    this.eventBus?.emit?.("playerVehicle:typeChanged", { previousType, type, preset: { ...preset } });
    return this;
  }

  _loadGLBModel(preset) {
    if (!preset.modelPath) return Promise.reject(new Error("No GLB model path was configured."));

    let cacheEntry = MODEL_CACHE.get(preset.modelPath);
    if (!cacheEntry) {
      cacheEntry = this._loadGLBScene(preset.modelPath);
      MODEL_CACHE.set(preset.modelPath, cacheEntry);
      cacheEntry.catch(() => {
        if (MODEL_CACHE.get(preset.modelPath) === cacheEntry) MODEL_CACHE.delete(preset.modelPath);
      });
    }

    return cacheEntry.then((sourceScene) => {
      const model = sourceScene.clone(true);
      model.name = `player-${preset.style || "vehicle"}`;

      if (preset.modelScale) model.scale.multiplyScalar(preset.modelScale);

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0.01 && maxDim < 1.8) model.scale.multiplyScalar(2.2 / maxDim);
      else if (maxDim > 6) model.scale.multiplyScalar(2.8 / maxDim);

      const box2 = new THREE.Box3().setFromObject(model);
      model.position.y -= box2.min.y;

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = cloneMaterial(child.material);
      });

      return model;
    });
  }

  _loadGLBScene(path) {
    return new Promise((resolve, reject) => {
      this._glbLoader.load(
        path,
        (gltf) => {
          resolve(gltf.scene);
        },
        undefined,
        (error) => {
          console.error(`[PlayerVehicle] ❌ Failed to load: ${path}`, error);
          reject(error);
        }
      );
    });
  }

  _applyPaintToVehicle(vehicle, color) {
    if (!vehicle) return;
    const paintHex = Number(color);
    if (!Number.isFinite(paintHex)) return;
    const paintColor = new THREE.Color(paintHex);

    vehicle.traverse((child) => {
      if (!child.isMesh) return;
      forEachMaterial(child.material, (material) => {
        if (!material.color || material.map) return;
        const current = material.color;
        const maxChannel = Math.max(current.r, current.g, current.b);
        const minChannel = Math.min(current.r, current.g, current.b);
        if (maxChannel - minChannel < 0.12 && maxChannel > 0.45) {
          material.color.copy(paintColor);
          material.needsUpdate = true;
        }
      });
    });
  }

  _createFallbackVehicle(preset) {
    const group = new THREE.Group();
    group.name = "player-keke-fallback";
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: this.paintColor ?? preset.color, roughness: 0.72, metalness: 0.05 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(preset.width, preset.height * 0.6, preset.length), bodyMaterial);
    body.position.y = preset.height * 0.3; body.castShadow = true; body.receiveShadow = true;
    group.add(body);

    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.95 });
    const wheelGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12);
    for (const z of [-preset.length * 0.3, preset.length * 0.3]) {
      for (const x of [-preset.width * 0.48, preset.width * 0.48]) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.22, z);
        wheel.castShadow = true;
        group.add(wheel);
      }
    }
    group.userData.bodyMaterial = bodyMaterial;
    group.userData.preset = preset;
    return group;
  }

  _disposeVehicle(vehicle) {
    if (!vehicle) return;
    vehicle.traverse((object) => {
      if (!object.isMesh) return;
      const fallback = object.parent?.name === "player-keke-fallback";
      if (fallback) object.geometry?.dispose();
      disposeMaterial(object.material);
    });
  }

  _laneX(lane) {
    const positions = GAME_CONFIG?.LANE_POSITIONS ?? [-this.config.laneWidth, 0, this.config.laneWidth];
    return positions[clamp(lane, 0, positions.length - 1)];
  }

  steerLeft() { this.steeringInput = 1; }
  steerRight() { this.steeringInput = -1; }
  releaseSteering() { this.steeringInput = 0; }
  accelerate() { this.isAccelerating = true; }
  brake() { this.isBraking = true; }
  releasePedals() { this.isAccelerating = false; this.isBraking = false; }

  setPaint(color) {
    const parsedColor = typeof color === "number" ? color : Number.parseInt(String(color).replace("#", ""), 16);
    if (!Number.isFinite(parsedColor)) return false;
    this.paintColor = parsedColor;
    if (this._modelLoaded && this.vehicle) this._applyPaintToVehicle(this.vehicle, parsedColor);
    else {
      const bodyMaterial = this.vehicle?.userData?.bodyMaterial;
      if (bodyMaterial) bodyMaterial.color.setHex(parsedColor);
    }
    this.eventBus?.emit?.("playerVehicle:paintChanged", { color: parsedColor });
    return true;
  }

  applyCollision(payload = {}) {
    if (this.collisionTimer > 0 || this.isDestroyed) return;
    this.collisionTimer = this.config.collisionCooldown;
    const impact = clamp(Number(payload.impact ?? payload.speed ?? 1), 0.5, 2.5);
    const damage = this.config.damagePerCollision * impact;
    this.damage = clamp(this.damage + damage, 0, 100);
    this.condition = clamp(this.condition - damage, 0, 100);
    
    // Push the vehicle back slightly on collision
    this.eventBus?.emit?.("physics:pushback", { force: impact * 5 });
    
    this.eventBus?.emit?.("playerVehicle:damaged", { damage, totalDamage: this.damage, condition: this.condition, speed: this.physicsState.speedKmh });
  }

  refuel(amount = 25) {
    const previousFuel = this.fuel;
    this.fuel = clamp(this.fuel + Math.max(0, amount), 0, this.preset.fuelCapacity);
    const added = this.fuel - previousFuel;
    this.eventBus?.emit?.("playerVehicle:refueled", { amount: added, fuel: this.fuel, capacity: this.preset.fuelCapacity });
    return added;
  }

  repair(amount = 25) {
    const previousCondition = this.condition;
    this.condition = clamp(this.condition + Math.max(0, amount), 0, 100);
    this.damage = Math.max(0, this.damage - (this.condition - previousCondition));
    if (this.condition > 0) this.isDestroyed = false;
    const repaired = this.condition - previousCondition;
    this.eventBus?.emit?.("playerVehicle:repaired", { amount: repaired, condition: this.condition, damage: this.damage });
    return repaired;
  }

  setEnabled(enabled) { this.enabled = Boolean(enabled); }
  getVehicleObject() { return this.vehicle; }
  
  getSnapshot() {
    return {
      initialized: this.initialized, enabled: this.enabled, vehicleType: this.vehicleType, vehicleName: this.preset.name,
      speed: this.physicsState.speedKmh, lane: this.lane, position: { x: this.physicsState.x, y: this.physicsState.y, z: this.physicsState.z },
      distance: this.distance, fuel: this.fuel, fuelCapacity: this.preset.fuelCapacity, condition: this.condition,
      damage: this.damage, isOffRoad: this.isOffRoad, isDestroyed: this.isDestroyed, accelerating: this.isAccelerating,
      braking: this.isBraking, paintColor: this.paintColor,
    };
  }

  reset({ lane = 1, z = 0, fuel = null, condition = 100 } = {}) {
    this.lane = clamp(lane, 0, 2);
    const startX = this._laneX(this.lane);
    
    this.speed = 0;
    this.distance = 0;
    this.damage = 0;
    this.condition = clamp(condition, 0, 100);
    this.fuel = clamp(fuel ?? this.preset.fuelCapacity, 0, this.preset.fuelCapacity);
    this.collisionTimer = 0;
    this.isDestroyed = false;
    this.isOffRoad = false;
    this.isAccelerating = false;
    this.isBraking = false;
    this.steeringInput = 0;

    // 🔥 Tell PhysicsSystem to reset
    this.eventBus?.emit?.("physics:reset", { x: startX, z });

    if (this.vehicle) {
      this.vehicle.position.set(startX, 0, z);
      this.vehicle.rotation.set(0, Math.PI, 0); 
    }
    
    this.eventBus?.emit?.("playerVehicle:reset", this.getSnapshot());
    return this;
  }

  _setHeadlights(on) {
    this._nightLightsOn = Boolean(on);
    if (!this._headlights.length) this._attachHeadlights();
    for (const l of this._headlights) {
      l.visible = this._nightLightsOn;
      if (l.isLight) l.intensity = this._nightLightsOn ? 1.6 : 0;
    }
  }

  _attachHeadlights() {
    const root = this.vehicle;
    if (!root || this._headlights.length) return;
    for (const x of [-0.35, 0.35]) {
      const light = new THREE.SpotLight(0xfff2d6, 0, 28, Math.PI / 7, 0.4, 1);
      light.position.set(x, 1.05, 1.35);
      light.target.position.set(x * 0.2, 0.4, 12);
      root.add(light);
      root.add(light.target);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8), new THREE.MeshStandardMaterial({ color: 0xffe4a3, emissive: 0xffc04d, emissiveIntensity: 0.2 }));
      lens.position.set(x, 1.0, 1.25);
      root.add(lens);
      this._headlights.push(light, lens);
    }
  }

  _pushPhysicsInput() {
    const throttle = this.isAccelerating ? 1 : 0;
    const brake = this.isBraking ? 1 : 0;
    const steer = this.steeringInput; 
    
    this.eventBus?.emit?.("physics:input", { steer, throttle, brake });
  }

  dispose() {
    ++this._vehicleRequest;
    if (this.vehicle) { this.scene.remove(this.vehicle); this._disposeVehicle(this.vehicle); this.vehicle = null; }
    for (const dispose of this._disposers) { try { dispose(); } catch {} }
    this._disposers.length = 0;
    this.initialized = false;
  }
}

export { VEHICLE_PRESETS };