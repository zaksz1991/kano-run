import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  // Chase camera settings
  chaseOffset: new THREE.Vector3(0, 4.2, -7.5),
  lookAheadOffset: new THREE.Vector3(0, 1.0, 10),
  positionDamping: 6.0,
  lookAtDamping: 8.0,
  
  // Dynamic FOV settings (Speed effect)
  baseFOV: 58,
  maxFOV: 85,
  speedForMaxFOV: 34, // Matches maxSpeed in config
  
  // Screen shake settings
  shakeDecay: 10.0,
  maxShakeIntensity: 0.8,
  
  // Intro camera settings
  introRadius: 14,
  introHeight: 6,
  introSpeed: 0.15
};

export default class CameraSystem {
  constructor({
    scene,
    camera,
    eventBus = null,
    config = {},
    gameState = null,
  } = {}) {
    if (!camera) throw new Error("CameraSystem requires a camera.");

    this.scene = scene;
    this.camera = camera;
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.camera ?? {}), ...config };

    this.target = null; // The player vehicle
    this.currentShake = 0;
    this.currentFOV = this.config.baseFOV;
    this.introAngle = 0;
    this.isIntroPhase = true;
    if (typeof window !== "undefined" && (window.innerWidth <= 900 || matchMedia("(pointer: coarse)").matches)) {
      this.isIntroPhase = false;
    }

    this._disposers = [];
    if (typeof window !== "undefined" && (window.innerWidth <= 900 || matchMedia("(pointer: coarse)").matches)) {
      this.config.chaseOffset = new THREE.Vector3(0, 3.6, -6.2);
      this.config.lookAheadOffset = new THREE.Vector3(0, 0.9, 8);
      this.config.baseFOV = 55;
    }
    this._bindEvents();
  }

  _bindEvents() {
    // Listen for collisions to trigger screen shake
    this._subscribe("traffic:collision", (payload) => {
      const intensity = Math.min(this.config.maxShakeIntensity, (payload.weight || 1) * 0.3);
      this.triggerShake(intensity);
    });

    // Listen for near misses for a subtle "whiplash" shake
    this._subscribe("traffic:near-miss", () => {
      this.triggerShake(0.15);
    });

    // Listen for game phase changes
    this._subscribe("game:intro-complete", () => {
      this.isIntroPhase = false;
    });

    this._subscribe("game:over", () => {
      this.isIntroPhase = true;
    if (typeof window !== "undefined" && (window.innerWidth <= 900 || matchMedia("(pointer: coarse)").matches)) {
      this.isIntroPhase = false;
    } // Reset to intro cam on game over
    });
  }

  initialize() {
    // Set initial camera position
    this.camera.position.set(0, this.config.chaseOffset.y, this.config.chaseOffset.z);
    this.camera.lookAt(0, 0, 10);
  }

  setTarget(target) {
    this.isIntroPhase = false;
    this.target = target;
  }

  update(deltaTime, playerSpeed = 0) {
    if (!this.target) return;

    const dt = Math.min(deltaTime || 0, 0.1);

    if (this.isIntroPhase) {
      this._updateIntroCamera(dt);
    } else {
      this._updateChaseCamera(dt, playerSpeed);
    }

    // Decay screen shake
    if (this.currentShake > 0.001) {
      this.currentShake = THREE.MathUtils.damp(this.currentShake, 0, this.config.shakeDecay, dt);
    } else {
      this.currentShake = 0;
    }

    // Apply shake offset
    if (this.currentShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.currentShake;
      const shakeY = (Math.random() - 0.5) * this.currentShake;
      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
    }

    // Update FOV based on speed (Dynamic FOV)
    const speedRatio = Math.min(1, playerSpeed / this.config.speedForMaxFOV);
    const targetFOV = this.config.baseFOV + (this.config.maxFOV - this.config.baseFOV) * speedRatio;
    this.currentFOV = THREE.MathUtils.damp(this.currentFOV, targetFOV, 5.0, dt);
    
    if (this.camera.fov !== this.currentFOV) {
      this.camera.fov = this.currentFOV;
      this.camera.updateProjectionMatrix();
    }
  }

  _updateIntroCamera(dt) {
    // Cinematic orbit around the starting position
    this.introAngle += this.config.introSpeed * dt;
    
    const x = Math.sin(this.introAngle) * this.config.introRadius;
    const z = Math.cos(this.introAngle) * this.config.introRadius;
    const y = this.config.introHeight;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, x, 2.0, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, y, 2.0, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, z, 2.0, dt);

    // Look at the center of the road where the keke will spawn
    this.camera.lookAt(0, 1.5, 0);
  }

  _updateChaseCamera(dt, playerSpeed) {
    const targetPos = this.target.position;
    const targetRot = this.target.vehicle?.rotation.y || 0;

    // Calculate desired camera position relative to player
    // We use simple offsets here, but you can add rotation-based offsets if the keke turns sharply
    const desiredPos = new THREE.Vector3(
      targetPos.x + this.config.chaseOffset.x,
      targetPos.y + this.config.chaseOffset.y,
      targetPos.z + this.config.chaseOffset.z
    );

    // Smoothly interpolate camera position
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, desiredPos.x, this.config.positionDamping, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, desiredPos.y, this.config.positionDamping, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, desiredPos.z, this.config.positionDamping, dt);

    // Calculate look-at target (ahead of the player)
    const lookAtTarget = new THREE.Vector3(
      targetPos.x + this.config.lookAheadOffset.x,
      targetPos.y + this.config.lookAheadOffset.y,
      targetPos.z + this.config.lookAheadOffset.z
    );

    // Create a temporary object to handle smooth look-at rotation
    const tempObj = new THREE.Object3D();
    tempObj.position.copy(this.camera.position);
    tempObj.lookAt(lookAtTarget);
    
    // Damp the rotation for a smoother, less jittery chase cam
    this.camera.quaternion.slerp(tempObj.quaternion, 1 - Math.exp(-this.config.lookAtDamping * dt));
  }

  triggerShake(intensity) {
    this.currentShake = Math.max(this.currentShake, intensity);
  }

  _subscribe(eventName, handler) {
    if (!this.eventBus?.on) return;
    const result = this.eventBus.on(eventName, handler);
    if (typeof result === "function") this._disposers.push(result);
    else if (this.eventBus.off) this._disposers.push(() => this.eventBus.off(eventName, handler));
  }

  dispose() {
    for (const unsub of this._disposers) {
      try { unsub(); } catch {}
    }
    this._disposers = [];
  }
}