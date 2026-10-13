import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";
import { MODEL_PATHS, MODEL_SCALES } from "../core/AssetCatalog.js";

const DEFAULTS = {
  laneWidth: 3.2, roadWidth: 12, acceleration: 12, braking: 20, maxSpeed: 34,
  reverseSpeed: 5, steeringSpeed: 8, steeringSmoothing: 10, offRoadDrag: 0.55,
  fuelCapacity: 100, fuelConsumption: 0.12, initialCondition: 100,
  collisionCooldown: 1.2, damagePerCollision: 18, vehicleWidth: 1.7,
  vehicleHeight: 1.5, vehicleLength: 3.5,
};

const VEHICLE_PRESETS = {
  standard: { name: "Standard Adaidaita", width: 1.65, height: 1.65, length: 2.7, maxSpeed: 25, acceleration: 10, handling: 1, fuelCapacity: 100, fuelConsumption: 0.12, color: 0xfbbf24, modelPath: MODEL_PATHS.player.standard, modelScale: MODEL_SCALES.player.standard, style: "standard", passengers: 3 },
  luxury: { name: "Luxury Adaidaita", width: 1.8, height: 1.75, length: 2.9, maxSpeed: 29, acceleration: 12, handling: 1.12, fuelCapacity: 115, fuelConsumption: 0.13, color: 0xc9a227, modelPath: MODEL_PATHS.player.luxury, modelScale: MODEL_SCALES.player.luxury, style: "luxury", passengers: 3 },
  cargo: { name: "Cargo Adaidaita", width: 1.9, height: 1.8, length: 3.2, maxSpeed: 22, acceleration: 8, handling: 0.85, fuelCapacity: 120, fuelConsumption: 0.16, color: 0x305e48, modelPath: MODEL_PATHS.player.cargo, modelScale: MODEL_SCALES.player.cargo, style: "cargo", passengers: 1 },
  open: { name: "Open Adaidaita", width: 1.7, height: 1.6, length: 2.8, maxSpeed: 27, acceleration: 11, handling: 1.08, fuelCapacity: 95, fuelConsumption: 0.12, color: 0xd4a72c, modelPath: MODEL_PATHS.player.open, modelScale: MODEL_SCALES.player.open, style: "open", passengers: 3 },
  police: { name: "Police Adaidaita", width: 1.75, height: 1.7, length: 2.9, maxSpeed: 31, acceleration: 14, handling: 1.15, fuelCapacity: 110, fuelConsumption: 0.15, color: 0xf3f3ed, modelPath: MODEL_PATHS.player.police, modelScale: MODEL_SCALES.player.police, style: "police", passengers: 2 },
  karota: { name: "KAROTA Adaidaita", width: 1.75, height: 1.7, length: 2.9, maxSpeed: 28, acceleration: 12, handling: 1.1, fuelCapacity: 105, fuelConsumption: 0.14, color: 0xe5a323, modelPath: MODEL_PATHS.player.karota, modelScale: MODEL_SCALES.player.karota, style: "karota", passengers: 2 },
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function damp(current, target, smoothing, dt) { return THREE.MathUtils.damp(current, target, smoothing, dt); }

export default class PlayerVehicleSystem {
  constructor(ctx = {}) {
    const { scene, camera = null, inputManager = null, input = null, gameState = null, drivingSystem = null, collisionSystem = null, weatherSystem = null, roadSystem = null, eventBus = null, config = {} } = ctx;
    if (!scene) throw new Error("PlayerVehicleSystem requires a Three.js scene.");

    this.scene = scene; this.camera = camera; this.inputManager = inputManager || input || null;
    this.gameState = gameState; this.drivingSystem = drivingSystem; this.collisionSystem = collisionSystem;
    this.weatherSystem = weatherSystem; this.roadSystem = roadSystem; this.eventBus = eventBus;

    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.driving ?? {}), ...config };
    this.vehicle = null; this.vehicleType = "standard"; this.preset = VEHICLE_PRESETS.standard;
    this.position = new THREE.Vector3(0, 0, 0); this.velocity = 0; this.speed = 0;
    this.targetX = 0; this.steering = 0; this.steeringInput = 0; this.lane = 1; this.distance = 0;
    this.fuel = this.preset.fuelCapacity; this.condition = this.config.initialCondition;
    this.damage = 0; this.collisionTimer = 0;
    this.isAccelerating = false; this.isBraking = false; this.isOffRoad = false;
    this.isDestroyed = false; this.initialized = false; this.enabled = true;
    this.paintColor = this.preset.color; this.accessories = []; this._disposers = [];
    this._modelLoaded = false; this._glbLoader = new GLTFLoader();

    this._subscribe("vehicle:select", (payload) => { if (payload?.type) this.setVehicleType(payload.type); });
    this._subscribe("vehicle:paintChanged", (payload) => { if (payload?.color !== undefined) this.setPaint(payload.color); });
    this._subscribe("collision:player", (payload) => { this.applyCollision(payload); });
    this._subscribe("game:paused", () => { this.enabled = false; });
    this._subscribe("game:resumed", () => { this.enabled = true; });
  }

  _subscribe(eventName, handler) {
    if (!this.eventBus?.on) return;
    const result = this.eventBus.on(eventName, handler);
    if (typeof result === "function") this._disposers.push(result);
    else if (this.eventBus.off) this._disposers.push(() => this.eventBus.off(eventName, handler));
  }

  async initialize(opts = {}) {
    const lane = Number.isFinite(opts.lane) ? opts.lane : 1;
    const z = Number.isFinite(opts.z) ? opts.z : 0;
    let vehicleType = "standard";
    if (typeof opts.vehicleType === "string" && VEHICLE_PRESETS[opts.vehicleType]) vehicleType = opts.vehicleType;
    const paint = typeof opts.paint === "number" || typeof opts.paint === "string" ? opts.paint : null;

    if (this.initialized && this.vehicle) { this.vehicle.visible = true; return this; }

    this.lane = clamp(lane, 0, 2);
    this.position.set(this._laneX(this.lane), 0, z);
    this.targetX = this.position.x; this.speed = 0;
    await this.setVehicleType(vehicleType, { reset: true });
    if (paint !== null) this.setPaint(paint);

    if (this.vehicle) {
      this.vehicle.visible = true; this.vehicle.frustumCulled = false;
      this.vehicle.traverse((ch) => { if (ch.isMesh) { ch.visible = true; ch.frustumCulled = false; } });
    }

    this.initialized = true; this.enabled = true;
    try { opts.cameraSystem?.setTarget?.(this); } catch (e) {}
    this.eventBus?.emit?.("playerVehicle:initialized", { type: this.vehicleType, lane: this.lane, position: this.position.toArray() });
    return this;
  }

  start() {
    if (!this.vehicle) this.initialize({ lane: 1, z: 0 });
    if (this.vehicle) this.vehicle.visible = true;
    this.enabled = true; this.initialized = true;
  }

  update(deltaTime, state = {}) {
    if (!this.initialized || !this.enabled || this.isDestroyed) return;
    const dt = clamp(deltaTime || 0, 0, 0.05);
    this.collisionTimer = Math.max(0, this.collisionTimer - dt);
    this._readInput(state); this._updateSpeed(dt); this._updateSteering(dt); this._updateFuel(dt); this._updateCondition();

    this.position.x = damp(this.position.x, this.targetX, this.config.steeringSmoothing * this.preset.handling, dt);
    this.position.z += this.speed * dt;
    this.distance += Math.abs(this.speed) * dt;
    this.vehicle.position.set(this.position.x, 0, this.position.z);

    this._updateVehicleVisuals(dt); this._updateCamera(dt);
    this.gameState?.setSpeed?.(this.speed); this.gameState?.setDistance?.(this.distance);
    this.eventBus?.emit?.("playerVehicle:updated", { type: this.vehicleType, speed: this.speed, lane: this.lane, x: this.position.x, z: this.position.z, fuel: this.fuel, condition: this.condition, distance: this.distance, offRoad: this.isOffRoad });
  }

  _readInput(state) {
    const input = this.inputManager;
    const accelerate = state.accelerate ?? input?.isDown?.("accelerate") ?? input?.isDown?.("gas") ?? false;
    const brake = state.brake ?? input?.isDown?.("brake") ?? false;
    const left = state.left ?? input?.isDown?.("left") ?? false;
    const right = state.right ?? input?.isDown?.("right") ?? false;
    const steeringAxis = Number(state.steeringAxis) || (left ? 1 : 0) - (right ? 1 : 0);
    this.isAccelerating = Boolean(accelerate); this.isBraking = Boolean(brake);
    this.steeringInput = clamp(steeringAxis, -1, 1);
  }

  _updateSpeed(dt) {
    const maxSpeed = Math.min(this.config.maxSpeed, this.preset.maxSpeed);
    const acceleration = this.preset.acceleration * (this.condition / 100);
    const cruise = 14;
    if (this.isBraking) this.speed -= this.config.braking * dt;
    else if (this.isAccelerating && this.fuel > 0) this.speed += acceleration * dt;
    else if (this.fuel > 0) this.speed = damp(this.speed, cruise, 1.2, dt);
    else this.speed = damp(this.speed, 0, 0.12, dt);
    this.speed = Math.max(0, this.speed);
    const grip = this.roadSystem?.getGripMultiplier?.() ?? this.weatherSystem?.getGripMultiplier?.() ?? 1;
    this.speed = clamp(this.speed, 0, maxSpeed * clamp(grip, 0.45, 1));
    this.isOffRoad = Math.abs(this.position.x) > this.config.roadWidth / 2 - this.preset.width * 0.35;
    if (this.isOffRoad) this.speed *= Math.max(0, 1 - this.config.offRoadDrag * dt);
  }

  _updateSteering(dt) {
    const steeringLimit = this.config.laneWidth * 1.25;
    this.steering = damp(this.steering, this.steeringInput, this.config.steeringSpeed, dt);
    const steeringEffect = this.steering * this.preset.handling * (0.55 + Math.min(Math.abs(this.speed) / 18, 0.7));
    this.targetX += steeringEffect * dt * 4;
    this.targetX = clamp(this.targetX, -steeringLimit, steeringLimit);
    this.lane = clamp(Math.round((this.targetX + this.config.laneWidth) / this.config.laneWidth), 0, 2);
  }

  _updateFuel(dt) {
    if (!this.isAccelerating || this.speed <= 0) return;
    const consumption = this.config.fuelConsumption * this.preset.fuelConsumption * Math.max(0.4, this.speed / 10);
    this.fuel = Math.max(0, this.fuel - consumption * dt);
    if (this.fuel <= 0) this.eventBus?.emit?.("playerVehicle:fuelEmpty", { vehicleType: this.vehicleType });
  }

  _updateCondition() {
    this.condition = clamp(this.condition, 0, 100);
    if (this.condition <= 0) { this.isDestroyed = true; this.speed = 0; this.eventBus?.emit?.("playerVehicle:destroyed", { damage: this.damage }); }
  }

  _updateVehicleVisuals(dt) {
    if (!this.vehicle) return;
    this.vehicle.rotation.z = damp(this.vehicle.rotation.z, -this.steering * 0.08, 8, dt);
    this.vehicle.rotation.y = damp(this.vehicle.rotation.y, Math.PI + (this.steering * 0.035), 6, dt);
    if (this.collisionTimer > 0) this.vehicle.position.y = Math.abs(Math.sin(this.collisionTimer * 35)) * 0.06;
    else this.vehicle.position.y = 0;
  }

  _updateCamera(dt) {
    if (!this.camera) return;
    const targetPosition = new THREE.Vector3(this.position.x * 0.35, 4.2, this.position.z - 9.5);
    this.camera.position.x = damp(this.camera.position.x, targetPosition.x, 4, dt);
    this.camera.position.y = damp(this.camera.position.y, targetPosition.y, 3, dt);
    this.camera.position.z = damp(this.camera.position.z, targetPosition.z, 4, dt);
    this.camera.lookAt(this.position.x * 0.25, 0.4, this.position.z + 12);
  }

  async setVehicleType(type, { reset = false } = {}) {
    const preset = VEHICLE_PRESETS[type];
    if (!preset) throw new Error(`Unknown player vehicle type: ${type}`);
    const previousType = this.vehicleType;
    if (this.vehicle) { this.scene.remove(this.vehicle); this._disposeVehicle(this.vehicle); }
    this.vehicleType = type; this.preset = preset;
    this.fuel = reset ? preset.fuelCapacity : Math.min(this.fuel, preset.fuelCapacity);
    this.paintColor = preset.color;

    try {
      this.vehicle = await this._loadGLBModel(preset);
      this._modelLoaded = true;
      console.log(`[Kano Run] Successfully loaded player model: ${preset.modelPath}`);
    } catch (error) {
      console.warn(`[Kano Run] Failed to load model for ${type}, using fallback:`, error);
      this.vehicle = this._createFallbackVehicle(preset);
      this._modelLoaded = false;
    }

    this.vehicle.rotation.y = Math.PI;
    this.vehicle.position.set(this.position.x, 0, this.position.z);
    this.vehicle.visible = true; this.vehicle.frustumCulled = false;
    this.scene.add(this.vehicle);
    this.eventBus?.emit?.("playerVehicle:typeChanged", { previousType, type, preset: { ...preset } });
    return this;
  }

  //  ROBUST MODEL LOADER: Auto-centers and scales models
  _loadGLBModel(preset) {
    return new Promise((resolve, reject) => {
      this._glbLoader.load(preset.modelPath, (gltf) => {
        const model = gltf.scene;

        // 1. Calculate bounding box to find size and center
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // 2. Auto-scale if the model is too big or too small
        const maxDim = Math.max(size.x, size.y, size.z);
        let finalScale = preset.modelScale || 1.0;
        
        // If model is gigantic (>10 units) or microscopic (<0.5 units), normalize it
        if (maxDim > 10 || maxDim < 0.5) {
          const targetSize = 2.5; // Target size for a car/keke
          finalScale = (targetSize / maxDim) * (preset.modelScale || 1.0);
        }
        model.scale.setScalar(finalScale);

        // 3. Re-calculate box after scaling to center it perfectly
        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        const scaledSize = scaledBox.getSize(new THREE.Vector3());

        // Center X and Z, and lift Y so the bottom of the wheels sits at y=0
        model.position.x = -scaledCenter.x;
        model.position.y = -scaledBox.min.y; 
        model.position.z = -scaledCenter.z;

        // 4. Apply materials and shadows
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Fix invisible models by making materials double-sided
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              // Apply tint color
              const material = child.material.clone();
              material.color.set(preset.color);
              material.roughness = 0.85;
              material.metalness = 0.0;
              material.flatShading = true;
              child.material = material;
            }
          }
        });

        resolve(model);
      }, undefined, (error) => {
        console.error(`[Kano Run] GLTFLoader Error for ${preset.modelPath}:`, error);
        reject(error);
      });
    });
  }

  _createFallbackVehicle(preset) {
    const group = new THREE.Group(); group.name = "player-keke-fallback";
    const paint = this.paintColor ?? preset.color ?? 0xfbbf24;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.85, metalness: 0.0, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(preset.width, preset.height * 0.6, preset.length), bodyMaterial);
    body.position.y = preset.height * 0.3; body.castShadow = true;
    group.add(body);
    group.userData.bodyMaterial = bodyMaterial; group.userData.preset = preset;
    return group;
  }

  _disposeVehicle(vehicle) {
    vehicle.traverse((object) => {
      if (!object.isMesh) return; object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
  }

  _laneX(lane) { const positions = GAME_CONFIG?.LANE_POSITIONS ?? [-this.config.laneWidth, 0, this.config.laneWidth]; return positions[clamp(lane, 0, positions.length - 1)]; }
  steerLeft() { this.steeringInput = 1; } steerRight() { this.steeringInput = -1; } releaseSteering() { this.steeringInput = 0; }
  accelerate() { this.isAccelerating = true; } brake() { this.isBraking = true; } releasePedals() { this.isAccelerating = false; this.isBraking = false; }

  setPaint(color) {
    const parsedColor = typeof color === "number" ? color : Number.parseInt(String(color).replace("#", ""), 16);
    if (!Number.isFinite(parsedColor)) return false;
    this.paintColor = parsedColor;
    if (this._modelLoaded && this.vehicle) {
      this.vehicle.traverse((child) => { if (child.isMesh && child.material) child.material.color.setHex(parsedColor); });
    } else {
      const bodyMaterial = this.vehicle?.userData?.bodyMaterial;
      if (bodyMaterial) bodyMaterial.color.setHex(parsedColor);
    }
    this.eventBus?.emit?.("playerVehicle:paintChanged", { color: parsedColor }); return true;
  }

  applyCollision(payload = {}) {
    if (this.collisionTimer > 0 || this.isDestroyed) return;
    this.collisionTimer = this.config.collisionCooldown;
    const impact = clamp(Number(payload.impact ?? payload.speed ?? 1), 0.5, 2.5);
    const damage = this.config.damagePerCollision * impact;
    this.damage = clamp(this.damage + damage, 0, 100); this.condition = clamp(this.condition - damage, 0, 100); this.speed *= 0.45;
    if (payload.direction === "left") this.targetX += 0.4; else if (payload.direction === "right") this.targetX -= 0.4;
    this.eventBus?.emit?.("playerVehicle:damaged", { damage, totalDamage: this.damage, condition: this.condition, speed: this.speed });
  }

  refuel(amount = 25) {
    const previousFuel = this.fuel; this.fuel = clamp(this.fuel + Math.max(0, amount), 0, this.preset.fuelCapacity); const added = this.fuel - previousFuel;
    this.eventBus?.emit?.("playerVehicle:refueled", { amount: added, fuel: this.fuel, capacity: this.preset.fuelCapacity }); return added;
  }

  repair(amount = 25) {
    const previousCondition = this.condition; this.condition = clamp(this.condition + Math.max(0, amount), 0, 100); this.damage = Math.max(0, this.damage - (this.condition - previousCondition));
    if (this.condition > 0) this.isDestroyed = false; const repaired = this.condition - previousCondition;
    this.eventBus?.emit?.("playerVehicle:repaired", { amount: repaired, condition: this.condition, damage: this.damage }); return repaired;
  }

  setEnabled(enabled) { this.enabled = Boolean(enabled); }
  getVehicleObject() { return this.vehicle; }
  getSnapshot() {
    return { initialized: this.initialized, enabled: this.enabled, vehicleType: this.vehicleType, vehicleName: this.preset.name, speed: this.speed, lane: this.lane, position: { x: this.position.x, y: this.position.y, z: this.position.z }, distance: this.distance, fuel: this.fuel, fuelCapacity: this.preset.fuelCapacity, condition: this.condition, damage: this.damage, isOffRoad: this.isOffRoad, isDestroyed: this.isDestroyed, accelerating: this.isAccelerating, braking: this.isBraking, paintColor: this.paintColor };
  }

  reset({ lane = 1, z = 0, fuel = null, condition = 100 } = {}) {
    this.lane = clamp(lane, 0, 2); this.position.set(this._laneX(this.lane), 0, z); this.targetX = this.position.x;
    this.speed = 0; this.velocity = 0; this.steering = 0; this.steeringInput = 0; this.distance = 0; this.damage = 0;
    this.condition = clamp(condition, 0, 100); this.fuel = clamp(fuel ?? this.preset.fuelCapacity, 0, this.preset.fuelCapacity);
    this.collisionTimer = 0; this.isDestroyed = false; this.isOffRoad = false; this.isAccelerating = false; this.isBraking = false;
    if (this.vehicle) { this.vehicle.position.set(this.position.x, 0, this.position.z); this.vehicle.rotation.set(0, Math.PI, 0); }
    this.eventBus?.emit?.("playerVehicle:reset", this.getSnapshot()); return this;
  }

  dispose() {
    if (this.vehicle) { this.scene.remove(this.vehicle); this._disposeVehicle(this.vehicle); this.vehicle = null; }
    for (const dispose of this._disposers) { try { dispose(); } catch {} }
    this._disposers.length = 0; this.initialized = false;
  }
}
export { VEHICLE_PRESETS };