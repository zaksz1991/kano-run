import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";
import { MODEL_PATHS } from "../core/AssetCatalog.js";

/**
 * Phase 6 Performance: InstancedMesh for dense crowds.
 * Renders up to 100 ambient pedestrians in a SINGLE draw call.
 * Essential for maintaining 60 FPS on low-end Android devices in markets.
 */
export default class InstancedCrowdSystem {
  constructor({ scene, eventBus = null, config = {} } = {}) {
    if (!scene) throw new Error("InstancedCrowdSystem requires a scene.");

    this.scene = scene;
    this.eventBus = eventBus;
    this.config = {
      maxInstances: 100,
      spawnDistance: 150,
      despawnDistance: 60,
      walkSpeedBase: 1.2,
      ...config,
    };

    this.instancedMesh = null;
    this.dummy = new THREE.Object3D();
    this.instances = []; // Stores custom data: { speed, direction, phase, active }
    this.enabled = false;
    this._disposers = [];
    this._glbLoader = new GLTFLoader();
    this._template = null;
    this._nextSpawnZ = 50;

    this._bindEvents();
    this._loadTemplate();
  }

  _bindEvents() {
    this._subscribe("game:started", () => {
      this.enabled = true;
      this._nextSpawnZ = 50;
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this._clearAll();
    });
  }

  _loadTemplate() {
    // Use the first available pedestrian model as the template for all instances
    const path = MODEL_PATHS.passengersBoot?.[0] || "/assets/models/pedestrian-passengers/Man.glb";
    
    this._glbLoader.load(
      path,
      (gltf) => {
        this._template = gltf.scene;
        this._createInstancedMesh();
        console.log("[InstancedCrowdSystem] Template loaded, InstancedMesh ready.");
      },
      undefined,
      (err) => console.warn("[InstancedCrowdSystem] Failed to load crowd template:", err)
    );
  }

  _createInstancedMesh() {
    if (!this._template) return;

    // Extract the first mesh from the template to instance
    let geometry = null;
    let material = null;

    this._template.traverse((child) => {
      if (child.isMesh && !geometry) {
        geometry = child.geometry;
        material = child.material;
      }
    });

    if (!geometry || !material) {
      console.warn("[InstancedCrowdSystem] No valid mesh found in template.");
      return;
    }

    // Create the InstancedMesh
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.config.maxInstances);
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;
    this.instancedMesh.frustumCulled = false; // Prevent popping at screen edges
    
    // Initialize all instances as inactive (scaled to 0)
    for (let i = 0; i < this.config.maxInstances; i++) {
      this.dummy.position.set(0, -10, 0); // Hide below ground
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

      this.instances.push({
        active: false,
        x: 0,
        z: 0,
        speed: 0,
        direction: 1, // 1 or -1
        phase: Math.random() * Math.PI * 2,
      });
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.instancedMesh);
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled || !this.instancedMesh) return;

    const dt = Math.min(deltaTime || 0, 0.05);
    let needsMatrixUpdate = false;

    // 1. Spawn new instances ahead
    if (playerZ + this.config.spawnDistance > this._nextSpawnZ) {
      this._spawnInstance(this._nextSpawnZ);
      this._nextSpawnZ += 15 + Math.random() * 25; // Staggered spacing
    }

    // 2. Update active instances
    for (let i = 0; i < this.config.maxInstances; i++) {
      const data = this.instances[i];
      if (!data.active) continue;

      // Cull instances behind the player
      if (data.z < playerZ - this.config.despawnDistance) {
        data.active = false;
        this.dummy.position.set(0, -10, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        needsMatrixUpdate = true;
        continue;
      }

      // Move instance
      data.z += data.direction * data.speed * dt;
      
      // Walking bob animation
      const bob = Math.abs(Math.sin(data.phase + (Date.now() * 0.005))) * 0.05;
      
      // Update dummy transform
      this.dummy.position.set(data.x, bob, data.z);
      this.dummy.rotation.y = data.direction > 0 ? 0 : Math.PI;
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
      needsMatrixUpdate = true;
    }

    if (needsMatrixUpdate) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  _spawnInstance(z) {
    // Find an inactive slot
    const slotIndex = this.instances.findIndex((inst) => !inst.active);
    if (slotIndex === -1) return; // Pool is full

    const side = Math.random() > 0.5 ? 1 : -1;
    const data = this.instances[slotIndex];
    
    data.active = true;
    data.x = side * (6 + Math.random() * 3); // Sidewalk offset
    data.z = z;
    data.speed = this.config.walkSpeedBase * (0.8 + Math.random() * 0.4);
    data.direction = Math.random() > 0.5 ? 1 : -1;
    data.phase = Math.random() * Math.PI * 2;

    // Initial matrix update
    this.dummy.position.set(data.x, 0, data.z);
    this.dummy.rotation.y = data.direction > 0 ? 0 : Math.PI;
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();
    this.instancedMesh.setMatrixAt(slotIndex, this.dummy.matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  _clearAll() {
    if (!this.instancedMesh) return;
    for (let i = 0; i < this.config.maxInstances; i++) {
      this.instances[i].active = false;
      this.dummy.position.set(0, -10, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this._nextSpawnZ = 50;
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    this._clearAll();
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
      if (Array.isArray(this.instancedMesh.material)) {
        this.instancedMesh.material.forEach((m) => m.dispose());
      } else {
        this.instancedMesh.material.dispose();
      }
    }
    for (const unsub of this._disposers) {
      try { unsub(); } catch {}
    }
    this._disposers = [];
  }
}