import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

export default class CheckpointSystem {
  constructor({ scene, eventBus = null, playerVehicleSystem = null, config = {} } = {}) {
    if (!scene) throw new Error("CheckpointSystem requires a scene.");
    
    this.scene = scene;
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this.config = { ...GAME_CONFIG?.checkpoint ?? {}, ...config };
    
    this.checkpoints = [];
    this.nextSpawnZ = 200;
    this.enabled = false;
    this._disposers = [];

    this._subscribe("game:started", () => { this.enabled = true; });
    this._subscribe("game:stopped", () => { this.enabled = false; this.clear(); });
  }

  start() {
    this.enabled = true;
  }

  update(deltaTime, playerZ = 0, playerSpeed = 0) {
    if (!this.enabled || !this.player) return;

    // Spawn new checkpoints ahead
    if (playerZ + 300 > this.nextSpawnZ) {
      this._spawnCheckpoint(this.nextSpawnZ);
      this.nextSpawnZ += 400 + Math.random() * 200; // Spawn every 400-600 units
    }

    // Update existing checkpoints
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      const cp = this.checkpoints[i];
      
      // Cull old checkpoints
      if (cp.z < playerZ - 50) {
        this.scene.remove(cp.mesh);
        this.checkpoints.splice(i, 1);
        continue;
      }

      // Check collision/passing
      const dist = Math.abs(cp.z - playerZ);
      if (dist < 5 && !cp.passed) {
        cp.passed = true;
        this._handleCheckpointPass(cp, playerSpeed);
      }
    }
  }

  _spawnCheckpoint(z) {
    const group = new THREE.Group();
    group.name = "karota-checkpoint";
    group.position.set(0, 0, z);

    // Road barriers (Red/White)
    const barrierGeo = new THREE.BoxGeometry(12, 1.2, 0.5);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xff0000, flatShading: true });
    const barrier = new THREE.Mesh(barrierGeo, barrierMat);
    barrier.position.y = 0.6;
    barrier.castShadow = true;
    group.add(barrier);

    // KAROTA Sign
    const signGeo = new THREE.BoxGeometry(2, 1, 0.2);
    const signMat = new THREE.MeshStandardMaterial({ color: 0x000000, flatShading: true });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 2.5, 0);
    group.add(sign);

    // Sign Text (Simple yellow box representing text for now)
    const textGeo = new THREE.BoxGeometry(1.8, 0.4, 0.1);
    const textMat = new THREE.MeshStandardMaterial({ color: 0xffff00, flatShading: true });
    const text = new THREE.Mesh(textGeo, textMat);
    text.position.set(0, 2.5, 0.15);
    group.add(text);

    this.scene.add(group);
    this.checkpoints.push({ z, mesh: group, passed: false });
  }

  _handleCheckpointPass(cp, playerSpeed) {
    const speedLimit = this.config.speedLimit || 12;
    
    if (playerSpeed > speedLimit * 1.5) {
      // Chase triggered!
      this.eventBus?.emit?.("checkpoint:chase-triggered", { speed: playerSpeed });
      this.eventBus?.emit?.("audio:sfx", "warning");
    } else if (playerSpeed > speedLimit) {
      // Fine triggered!
      const fine = Math.floor((playerSpeed - speedLimit) * 50);
      this.eventBus?.emit?.("checkpoint:fined", { amount: fine });
      this.eventBus?.emit?.("audio:sfx", "button"); // Use a negative sound here in AudioManager
    } else {
      // Safe pass
      this.eventBus?.emit?.("checkpoint:cleared", { speed: playerSpeed });
    }
  }

  clear() {
    for (const cp of this.checkpoints) this.scene.remove(cp.mesh);
    this.checkpoints = [];
    this.nextSpawnZ = 200;
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    this.clear();
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}
