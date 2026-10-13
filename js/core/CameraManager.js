// js/core/CameraManager.js

export class CameraManager {
  constructor(options = {}) {
    this.options = {
      defaultFov: 60,
      minFov: 35,
      maxFov: 85,
      defaultNear: 0.1,
      defaultFar: 1000,
      smoothing: 5,
      lookAtSmoothing: 7,
      maxDeltaTime: 0.1,
      ...options,
    };

    this.camera = null;
    this.target = null;
    this.scene = null;
    this.renderer = null;

    this.followOffset = { x: 0, y: 6.2, z: -3.5 };
    this.lookAtOffset = { x: 0, y: 1, z: 5 };
    this.currentPosition = { x: 0, y: 6.2, z: -3.5 };
    this.currentLookAt = { x: 0, y: 1, z: 5 };

    this.positionSmoothing = this.options.smoothing;
    this.targetSmoothing = this.options.lookAtSmoothing;

    this.shake = {
      active: false,
      intensity: 0,
      duration: 0,
      elapsed: 0,
      offset: { x: 0, y: 0, z: 0 },
    };

    this.zoom = {
      current: 1,
      target: 1,
      min: 0.7,
      max: 1.8,
      smoothing: 4,
    };

    this.mode = "follow";
    this.enabled = true;
    this.listeners = new Map();
    this.initialized = false;
    this.destroyed = false;
  }

  init({ camera, scene = null, renderer = null } = {}) {
    this.ensureActive();

    if (!camera) {
      throw new TypeError("CameraManager requires a camera.");
    }

    this.camera = camera;
    this.scene = scene;
    this.renderer = renderer;

    if (this.camera.fov !== undefined) {
      this.camera.fov = this.options.defaultFov;
      this.camera.updateProjectionMatrix?.();
    }

    this.initialized = true;
    this.emit("init", { camera, scene, renderer });

    return this;
  }

  setTarget(target) {
    this.ensureActive();

    if (!target) {
      this.target = null;
      this.emit("target:change", { target: null });
      return this;
    }

    this.target = target;
    this.emit("target:change", { target });

    return this;
  }

  getTargetPosition(target = this.target) {
    if (!target) {
      return null;
    }

    const position = target.position ?? target;

    if (
      Number.isFinite(position.x) &&
      Number.isFinite(position.y) &&
      Number.isFinite(position.z)
    ) {
      return {
        x: position.x,
        y: position.y,
        z: position.z,
      };
    }

    return null;
  }

  setFollowOffset(offset = {}) {
    this.followOffset = {
      x: this.numberOr(offset.x, this.followOffset.x),
      y: this.numberOr(offset.y, this.followOffset.y),
      z: this.numberOr(offset.z, this.followOffset.z),
    };

    return this;
  }

  setLookAtOffset(offset = {}) {
    this.lookAtOffset = {
      x: this.numberOr(offset.x, this.lookAtOffset.x),
      y: this.numberOr(offset.y, this.lookAtOffset.y),
      z: this.numberOr(offset.z, this.lookAtOffset.z),
    };

    return this;
  }

  setSmoothing(position, lookAt = position) {
    if (Number.isFinite(position)) {
      this.positionSmoothing = Math.max(0, position);
    }

    if (Number.isFinite(lookAt)) {
      this.targetSmoothing = Math.max(0, lookAt);
    }

    return this;
  }

  setMode(mode) {
    const allowedModes = ["follow", "free", "fixed"];

    if (!allowedModes.includes(mode)) {
      throw new Error(`Unsupported camera mode "${mode}".`);
    }

    const previousMode = this.mode;
    this.mode = mode;

    this.emit("mode:change", { previousMode, mode });

    return this;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    return this;
  }

  update(deltaTime) {
    if (
      this.destroyed ||
      !this.initialized ||
      !this.enabled ||
      !this.camera
    ) {
      return;
    }

    const dt = Math.min(
      Math.max(0, Number(deltaTime) || 0),
      this.options.maxDeltaTime
    );

    this.updateShake(dt);
    this.updateZoom(dt);

    if (this.mode === "follow" && this.target) {
      this.updateFollow(dt);
    }

    this.applyShake();
  }

  updateFollow(deltaTime) {
    const targetPosition = this.getTargetPosition();

    if (!targetPosition) {
      return;
    }

    const desiredPosition = {
      x: targetPosition.x + this.followOffset.x,
      y: targetPosition.y + this.followOffset.y,
      z: targetPosition.z + this.followOffset.z,
    };

    const desiredLookAt = {
      x: targetPosition.x + this.lookAtOffset.x,
      y: targetPosition.y + this.lookAtOffset.y,
      z: targetPosition.z + this.lookAtOffset.z,
    };

    const positionAlpha = this.smoothingAlpha(
      this.positionSmoothing,
      deltaTime
    );

    const lookAtAlpha = this.smoothingAlpha(
      this.targetSmoothing,
      deltaTime
    );

    this.currentPosition = this.lerpVector(
      this.currentPosition,
      desiredPosition,
      positionAlpha
    );

    this.currentLookAt = this.lerpVector(
      this.currentLookAt,
      desiredLookAt,
      lookAtAlpha
    );

    this.camera.position.set(
      this.currentPosition.x,
      this.currentPosition.y,
      this.currentPosition.z
    );

    this.camera.lookAt(
      this.currentLookAt.x,
      this.currentLookAt.y,
      this.currentLookAt.z
    );
  }

  updateZoom(deltaTime) {
    this.zoom.current = this.lerp(
      this.zoom.current,
      this.zoom.target,
      this.smoothingAlpha(this.zoom.smoothing, deltaTime)
    );

    if (this.camera.fov !== undefined) {
      const fov = this.clamp(
        this.options.defaultFov / this.zoom.current,
        this.options.minFov,
        this.options.maxFov
      );

      if (Math.abs(this.camera.fov - fov) > 0.01) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix?.();
      }
    }
  }

  setZoom(value, immediate = false) {
    this.zoom.target = this.clamp(
      this.numberOr(value, 1),
      this.zoom.min,
      this.zoom.max
    );

    if (immediate) {
      this.zoom.current = this.zoom.target;
      this.updateZoom(1);
    }

    this.emit("zoom:change", {
      target: this.zoom.target,
      current: this.zoom.current,
    });

    return this;
  }

  setZoomLimits(min, max) {
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min <= 0 ||
      max < min
    ) {
      throw new RangeError("Invalid camera zoom limits.");
    }

    this.zoom.min = min;
    this.zoom.max = max;
    this.zoom.target = this.clamp(
      this.zoom.target,
      min,
      max
    );

    return this;
  }

  shakeCamera(intensity = 0.2, duration = 0.25) {
    this.shake.active = true;
    this.shake.intensity = Math.max(0, intensity);
    this.shake.duration = Math.max(0, duration);
    this.shake.elapsed = 0;

    if (duration === 0 || intensity === 0) {
      this.shake.active = false;
      this.shake.offset = { x: 0, y: 0, z: 0 };
    }

    this.emit("shake:start", { intensity, duration });

    return this;
  }

  updateShake(deltaTime) {
    if (!this.shake.active) {
      return;
    }

    this.shake.elapsed += deltaTime;

    if (this.shake.elapsed >= this.shake.duration) {
      this.shake.active = false;
      this.shake.offset = { x: 0, y: 0, z: 0 };
      this.emit("shake:end", {});
      return;
    }

    const remaining = 1 - this.shake.elapsed / this.shake.duration;
    const strength = this.shake.intensity * remaining;

    this.shake.offset = {
      x: (Math.random() * 2 - 1) * strength,
      y: (Math.random() * 2 - 1) * strength,
      z: (Math.random() * 2 - 1) * strength,
    };
  }

  applyShake() {
    if (!this.camera || !this.shake.active) {
      return;
    }

    this.camera.position.x += this.shake.offset.x;
    this.camera.position.y += this.shake.offset.y;
    this.camera.position.z += this.shake.offset.z;
  }

  stopShake() {
    this.shake.active = false;
    this.shake.elapsed = 0;
    this.shake.offset = { x: 0, y: 0, z: 0 };

    return this;
  }

  setPosition(position, immediate = true) {
    const next = {
      x: this.numberOr(position?.x, this.currentPosition.x),
      y: this.numberOr(position?.y, this.currentPosition.y),
      z: this.numberOr(position?.z, this.currentPosition.z),
    };

    this.currentPosition = { ...next };

    if (immediate && this.camera) {
      this.camera.position.set(next.x, next.y, next.z);
    }

    return this;
  }

  lookAt(position, immediate = true) {
    const next = {
      x: this.numberOr(position?.x, this.currentLookAt.x),
      y: this.numberOr(position?.y, this.currentLookAt.y),
      z: this.numberOr(position?.z, this.currentLookAt.z),
    };

    this.currentLookAt = { ...next };

    if (immediate && this.camera) {
      this.camera.lookAt(next.x, next.y, next.z);
    }

    return this;
  }

  setFov(fov) {
    if (!this.camera || this.camera.fov === undefined) {
      return false;
    }

    this.camera.fov = this.clamp(
      fov,
      this.options.minFov,
      this.options.maxFov
    );

    this.camera.updateProjectionMatrix?.();

    return true;
  }

  resize(width, height) {
    if (!this.camera || !Number.isFinite(width) || !Number.isFinite(height)) {
      return;
    }

    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
    }
  }

  getCamera() {
    return this.camera;
  }

  getState() {
    return {
      mode: this.mode,
      enabled: this.enabled,
      hasTarget: Boolean(this.target),
      position: { ...this.currentPosition },
      lookAt: { ...this.currentLookAt },
      zoom: {
        current: this.zoom.current,
        target: this.zoom.target,
      },
      shaking: this.shake.active,
    };
  }

  smoothingAlpha(speed, deltaTime) {
    return speed <= 0 ? 1 : 1 - Math.exp(-speed * deltaTime);
  }

  lerpVector(from, to, alpha) {
    return {
      x: this.lerp(from.x, to.x, alpha),
      y: this.lerp(from.y, to.y, alpha),
      z: this.lerp(from.z, to.z, alpha),
    };
  }

  lerp(start, end, alpha) {
    return start + (end - start) * alpha;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  numberOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Camera event listener must be a function.");
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) {
      return false;
    }

    const removed = callbacks.delete(callback);

    if (callbacks.size === 0) {
      this.listeners.delete(eventName);
    }

    return removed;
  }

  emit(eventName, payload) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) {
      return;
    }

    for (const callback of [...callbacks]) {
      try {
        callback(payload);
      } catch (error) {
        console.error(
          `[CameraManager] ${eventName} listener failed:`,
          error
        );
      }
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("CameraManager has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.stopShake();
    this.target = null;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.listeners.clear();
    this.initialized = false;
    this.destroyed = true;
  }
}

export default CameraManager;