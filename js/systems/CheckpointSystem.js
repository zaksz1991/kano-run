import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

export default class CheckpointSystem {
  constructor({
    scene,
    eventBus = null,
    playerVehicleSystem = null,
    config = {},
  } = {}) {
    if (!scene) throw new Error("CheckpointSystem requires a scene.");

    this.scene = scene;
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this.config = { ...(GAME_CONFIG?.checkpoint ?? {}), ...config };

    this.checkpoints = [];
    this.nextSpawnZ = 200;
    this.enabled = false;
    this._disposers = [];

    this._subscribe("game:started", () => {
      this.enabled = true;
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

  update(deltaTime, playerZ = 0, playerSpeed = 0) {
    // Do not require player object — only need Z/speed from Game.update
    if (!this.enabled) return;

    const z = Number(playerZ) || 0;
    const speed = Number(playerSpeed) || 0;

    if (z + 300 > this.nextSpawnZ) {
      this._spawnCheckpoint(this.nextSpawnZ);
      this.nextSpawnZ += 400 + Math.random() * 200;
    }

    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      const cp = this.checkpoints[i];

      if (cp.z < z - 50) {
        this.scene.remove(cp.mesh);
        this.checkpoints.splice(i, 1);
        continue;
      }

      const dist = Math.abs(cp.z - z);

      if (dist < 40 && !cp.warned) {
        cp.warned = true;
        this.eventBus?.emit?.("checkpoint:approaching", { z: cp.z });
      }

      if (dist < 5 && !cp.passed) {
        cp.passed = true;
        this._handleCheckpointPass(cp, speed);
      }
    }
  }

  _spawnCheckpoint(z) {
    const group = new THREE.Group();
    group.name = "karota-checkpoint";
    group.position.set(0, 0, z);

    const barrierGeo = new THREE.BoxGeometry(12, 1.2, 0.5);
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      flatShading: true,
    });
    const barrier = new THREE.Mesh(barrierGeo, barrierMat);
    barrier.position.y = 0.6;
    barrier.castShadow = true;
    group.add(barrier);

    const signGeo = new THREE.BoxGeometry(2, 1, 0.2);
    const signMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      flatShading: true,
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 2.5, 0);
    group.add(sign);

    const textGeo = new THREE.BoxGeometry(1.8, 0.4, 0.1);
    const textMat = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      flatShading: true,
    });
    const text = new THREE.Mesh(textGeo, textMat);
    text.position.set(0, 2.5, 0.15);
    group.add(text);

    // Side posts so the checkpoint is visible from distance
    for (const x of [-6, 6]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc }),
      );
      post.position.set(x, 1.6, 0);
      post.castShadow = true;
      group.add(post);
    }

    this.scene.add(group);
    this.checkpoints.push({ z, mesh: group, passed: false, warned: false });
  }

  _handleCheckpointPass(cp, playerSpeed) {
    const speedLimit = this.config.speedLimit || 12;

    if (playerSpeed > speedLimit * 1.5) {
      this.eventBus?.emit?.("checkpoint:chase-triggered", {
        speed: playerSpeed,
      });
      this.eventBus?.emit?.("audio:sfx", "warning");
    } else if (playerSpeed > speedLimit) {
      const fine = Math.floor((playerSpeed - speedLimit) * 50);
      this.eventBus?.emit?.("checkpoint:fined", { amount: fine });
      this.eventBus?.emit?.("audio:sfx", "button");
    } else {
      this.eventBus?.emit?.("checkpoint:cleared", { speed: playerSpeed });
    }
  }

  clear() {
    for (const cp of this.checkpoints) {
      this.scene.remove(cp.mesh);
    }
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
