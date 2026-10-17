import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

/**
 * Chase camera only.
 * Goal:
 *  - Desktop: keke ~25% of screen height
 *  - Mobile:  keke ~35% of screen height
 * Lower + closer than the previous high/far chase.
 */

function isMobile() {
  if (typeof window === "undefined") return false;
  return (
    window.innerWidth <= 900 ||
    (window.matchMedia && matchMedia("(pointer: coarse)").matches)
  );
}

const DESKTOP = {
  chaseOffset: new THREE.Vector3(0, 3.2, -5.4),
  lookAheadOffset: new THREE.Vector3(0, 0.85, 7.5),
  baseFOV: 56,
  maxFOV: 68,
};

const MOBILE = {
  chaseOffset: new THREE.Vector3(0, 2.7, -4.4),
  lookAheadOffset: new THREE.Vector3(0, 0.75, 6.0),
  baseFOV: 52,
  maxFOV: 64,
};

const DEFAULTS = {
  positionDamping: 7.5,
  lookAtDamping: 9.0,
  speedForMaxFOV: 34,
  shakeDecay: 12.0,
  maxShakeIntensity: 0.7,
  introRadius: 10,
  introHeight: 4.5,
  introSpeed: 0.2,
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

    this._mobile = isMobile();
    const profile = this._mobile ? MOBILE : DESKTOP;

    this.config = {
      ...DEFAULTS,
      ...profile,
      ...(GAME_CONFIG?.camera ?? {}),
      ...config,
    };

    // Force framing offsets (ignore stale GAME_CONFIG far camera if present)
    this.config.chaseOffset = profile.chaseOffset.clone();
    this.config.lookAheadOffset = profile.lookAheadOffset.clone();
    this.config.baseFOV = profile.baseFOV;
    this.config.maxFOV = profile.maxFOV;

    this.target = null;
    this.currentShake = 0;
    this.currentFOV = this.config.baseFOV;
    this.introAngle = 0;
    this.isIntroPhase = false; // never trap players in intro cam

    this._disposers = [];
    this._bindEvents();
  }

  _bindEvents() {
    this._subscribe("traffic:collision", (payload) => {
      const intensity = Math.min(
        this.config.maxShakeIntensity,
        (payload?.weight || 1) * 0.3,
      );
      this.triggerShake(intensity);
    });

    this._subscribe("traffic:near-miss", () => {
      this.triggerShake(0.12);
    });

    this._subscribe("game:intro-complete", () => {
      this.isIntroPhase = false;
    });

    this._subscribe("game:started", () => {
      this.isIntroPhase = false;
      this._snapToTarget();
    });

    this._subscribe("game:over", () => {
      this.isIntroPhase = false;
    });
  }

  initialize() {
    this.camera.fov = this.config.baseFOV;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      this.config.chaseOffset.x,
      this.config.chaseOffset.y,
      this.config.chaseOffset.z,
    );
    this.camera.lookAt(0, 1.0, 6);
    return this;
  }

  setTarget(target) {
    this.target = target;
    this.isIntroPhase = false;
    this._snapToTarget();
  }

  _snapToTarget() {
    if (!this.target?.position) return;
    const p = this.target.position;
    this.camera.position.set(
      p.x + this.config.chaseOffset.x,
      p.y + this.config.chaseOffset.y,
      p.z + this.config.chaseOffset.z,
    );
    this.camera.lookAt(
      p.x + this.config.lookAheadOffset.x,
      p.y + this.config.lookAheadOffset.y,
      p.z + this.config.lookAheadOffset.z,
    );
  }

  update(dt, playerSpeed = 0) {
    if (!this.camera) return;
    const speed = Number(playerSpeed) || 0;

    if (this.isIntroPhase && !this.target) {
      this._updateIntroCamera(dt);
    } else if (this.target?.position) {
      this._updateChaseCamera(dt, speed);
    }

    // FOV expands slightly with speed
    const t = Math.min(1, speed / (this.config.speedForMaxFOV || 34));
    const desiredFov =
      this.config.baseFOV +
      (this.config.maxFOV - this.config.baseFOV) * t;
    this.currentFOV = THREE.MathUtils.damp(
      this.currentFOV,
      desiredFov,
      4.0,
      dt,
    );
    if (Math.abs(this.camera.fov - this.currentFOV) > 0.05) {
      this.camera.fov = this.currentFOV;
      this.camera.updateProjectionMatrix();
    }

    // Screen shake
    if (this.currentShake > 0.001) {
      const s = this.currentShake;
      this.camera.position.x += (Math.random() - 0.5) * s * 0.35;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.25;
      this.currentShake = THREE.MathUtils.damp(
        this.currentShake,
        0,
        this.config.shakeDecay,
        dt,
      );
    }
  }

  _updateIntroCamera(dt) {
    this.introAngle += this.config.introSpeed * dt;
    const x = Math.sin(this.introAngle) * this.config.introRadius;
    const z = Math.cos(this.introAngle) * this.config.introRadius;
    const y = this.config.introHeight;
    this.camera.position.x = THREE.MathUtils.damp(
      this.camera.position.x,
      x,
      2.0,
      dt,
    );
    this.camera.position.y = THREE.MathUtils.damp(
      this.camera.position.y,
      y,
      2.0,
      dt,
    );
    this.camera.position.z = THREE.MathUtils.damp(
      this.camera.position.z,
      z,
      2.0,
      dt,
    );
    this.camera.lookAt(0, 1.2, 0);
  }

  _updateChaseCamera(dt, playerSpeed) {
    const targetPos = this.target.position;

    const desiredPos = new THREE.Vector3(
      targetPos.x + this.config.chaseOffset.x,
      targetPos.y + this.config.chaseOffset.y,
      targetPos.z + this.config.chaseOffset.z,
    );

    this.camera.position.x = THREE.MathUtils.damp(
      this.camera.position.x,
      desiredPos.x,
      this.config.positionDamping,
      dt,
    );
    this.camera.position.y = THREE.MathUtils.damp(
      this.camera.position.y,
      desiredPos.y,
      this.config.positionDamping,
      dt,
    );
    this.camera.position.z = THREE.MathUtils.damp(
      this.camera.position.z,
      desiredPos.z,
      this.config.positionDamping,
      dt,
    );

    const lookAtTarget = new THREE.Vector3(
      targetPos.x + this.config.lookAheadOffset.x,
      targetPos.y + this.config.lookAheadOffset.y,
      targetPos.z + this.config.lookAheadOffset.z,
    );

    const tempObj = new THREE.Object3D();
    tempObj.position.copy(this.camera.position);
    tempObj.lookAt(lookAtTarget);
    this.camera.quaternion.slerp(
      tempObj.quaternion,
      1 - Math.exp(-this.config.lookAtDamping * dt),
    );
  }

  setIntroCamera(position) {
    if (!position) return;
    this.camera.position.set(
      position.x + 2.5,
      position.y + 2.8,
      position.z - 4.5,
    );
    this.camera.lookAt(position.x, position.y + 1.0, position.z);
  }

  triggerShake(intensity) {
    this.currentShake = Math.max(this.currentShake, intensity);
  }

  _subscribe(eventName, handler) {
    if (!this.eventBus?.on) return;
    const result = this.eventBus.on(eventName, handler);
    if (typeof result === "function") this._disposers.push(result);
    else if (this.eventBus.off) {
      this._disposers.push(() => this.eventBus.off(eventName, handler));
    }
  }

  dispose() {
    for (const unsub of this._disposers) {
      try {
        unsub();
      } catch {}
    }
    this._disposers = [];
  }
}
