import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  laneWidth: 3.2,
  roadWidth: 12,
  acceleration: 12,
  braking: 20,
  maxSpeed: 34,
  steeringSpeed: 8,
  steeringSmoothing: 10,
  offRoadDrag: 0.55,
  fuelCapacity: 100,
  fuelConsumption: 0.12,
  initialCondition: 100,
  collisionCooldown: 1.2,
  damagePerCollision: 18,
};

const VEHICLE_PRESETS = {
  standard: {
    name: "Standard Adaidaita",
    width: 1.65,
    height: 1.65,
    length: 2.7,
    maxSpeed: 25,
    acceleration: 10,
    handling: 1,
    fuelCapacity: 100,
    fuelConsumption: 0.12,
    color: 0xfbbf24,
    modelPath: "/models/keke_standard.glb", // 👈 POINT TO YOUR REAL MODEL
    modelScale: 1.0,
  },
  // Add other presets here...
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function damp(current, target, smoothing, dt) { return THREE.MathUtils.damp(current, target, smoothing, dt); }

export default class PlayerVehicleSystem {
  constructor(ctx = {}) {
    // ... (Keep your existing constructor setup) ...
    this.scene = ctx.scene;
    this.camera = ctx.camera;
    this.eventBus = ctx.eventBus;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.driving ?? {}), ...ctx.config };
    
    this.vehicle = null; // This will now be a GLTF Scene, not a Group of boxes
    this.vehicleType = "standard";
    this.preset = VEHICLE_PRESETS.standard;
    
    this.position = new THREE.Vector3(0, 0, 0);
    this.speed = 0;
    this.targetX = 0;
    this.steering = 0;
    this.steeringInput = 0;
    this.lane = 1;
    
    // ... (rest of constructor) ...
    this.loader = new GLTFLoader(); // 👈 Initialize Loader
  }

  // ... (Keep initialize, start, update logic mostly the same) ...

  update(deltaTime, state = {}) {
    // ... (Keep physics/input logic) ...
    
    // Update 3D Model Position
    if (this.vehicle) {
      this.vehicle.position.set(this.position.x, 0, this.position.z);
      
      // Commercial games use "Tilt" for steering, not just rotation
      const targetTilt = -this.steering * 0.15; 
      this.vehicle.rotation.z = damp(this.vehicle.rotation.z, targetTilt, 10, deltaTime);
      
      // Keep facing forward (assuming model is built facing +Z or -Z)
      // If your model faces -Z in Blender, keep Math.PI. If +Z, use 0.
      this.vehicle.rotation.y = damp(this.vehicle.rotation.y, Math.PI, 10, deltaTime);
    }
  }

  async setVehicleType(type, { reset = false } = {}) {
    const preset = VEHICLE_PRESETS[type];
    if (!preset) throw new Error(`Unknown vehicle: ${type}`);

    // 1. Remove old model
    if (this.vehicle) {
      this.scene.remove(this.vehicle);
      // Dispose geometry/materials to prevent memory leaks
      this.vehicle.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (child.material.isMaterial) child.material.dispose();
        }
      });
    }

    this.vehicleType = type;
    this.preset = preset;

    // 2. Load New Model
    try {
      this.vehicle = await this._loadGLBModel(preset);
      this.scene.add(this.vehicle);
      
      // Initial rotation
      this.vehicle.rotation.y = Math.PI; 
    } catch (error) {
      console.error("Failed to load vehicle model:", error);
      // Fallback to a simple box if model fails (for debugging)
      this.vehicle = this._createFallbackBox(preset);
      this.scene.add(this.vehicle);
    }
  }

  _loadGLBModel(preset) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        preset.modelPath,
        (gltf) => {
          const model = gltf.scene;
          
          // Scale model if needed
          if (preset.modelScale) {
            model.scale.setScalar(preset.modelScale);
          }
          
          // Enable shadows for the whole model
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Optional: Tint the model if you want dynamic coloring
              // if (child.material) child.material.color.setHex(preset.color);
            }
          });
          
          resolve(model);
        },
        undefined, // onProgress
        (error) => reject(error)
      );
    });
  }

  _createFallbackBox(preset) {
    // Simple box if GLB fails
    const geo = new THREE.BoxGeometry(preset.width, preset.height, preset.length);
    const mat = new THREE.MeshStandardMaterial({ color: preset.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }
  
  // ... (Rest of your methods: steerLeft, accelerate, etc.) ...
}