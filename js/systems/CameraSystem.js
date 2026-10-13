import * as THREE from "three";

export default class CameraSystem {
  constructor(cameraOrContext = {}, options = {}) {
    const ctx = cameraOrContext && (cameraOrContext.camera || cameraOrContext.scene)
      ? cameraOrContext
      : { camera: cameraOrContext };
    const camera = ctx.camera;
    if (!camera) {
      throw new Error("CameraSystem requires a THREE.Camera instance.");
    }

    this.camera = camera;
    this.context = ctx;

    this.options = {
      followDistance: 9.5,
      followHeight: 5.2,
      lookAhead: 10,
      positionSmoothness: 5,
      rotationSmoothness: 4,
      fieldOfView: 65,
      minimumHeight: 2.5,
      maximumHeight: 12,
      collisionShakeDuration: 0.35,
      collisionShakeIntensity: 0.3,
      ...options,
    };

    this.target = null;
    this.lookTarget = new THREE.Vector3();
    this.desiredPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    this.initialized = false;
    this.enabled = true;
    this.paused = false;

    this.cameraMode = "chase";
    this.cameraModes = ["chase", "close", "cinematic", "overhead"];

    this.shakeTime = 0;
    this.shakeDuration = 0;
    this.shakeIntensity = 0;

    this.elapsedTime = 0;
    this.lastTargetPosition = new THREE.Vector3();
    this.targetSpeed = 0;

    this.originalFov = camera.fov ?? this.options.fieldOfView;
    this.camera.fov = this.originalFov;

    this.camera.updateProjectionMatrix();
  }

  setTarget(target) {
    this.target = target;

    if (target) {
      const position = this.getTargetPosition();

      this.lastTargetPosition.copy(position);
      this.currentLookAt.copy(position);
      this.initialized = false;
    }

    return this;
  }

  setMode(mode) {
    if (!this.cameraModes.includes(mode)) {
      return false;
    }

    this.cameraMode = mode;
    this.initialized = false;

    return true;
  }

  cycleMode() {
    const currentIndex = this.cameraModes.indexOf(this.cameraMode);
    const nextIndex = (currentIndex + 1) % this.cameraModes.length;

    this.setMode(this.cameraModes[nextIndex]);

    return this.cameraMode;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
  }

  getTargetPosition() {
    if (!this.target) {
      return new THREE.Vector3();
    }

    if (this.target.position) {
      return this.target.position;
    }

    if (typeof this.target.getPosition === "function") {
      return this.target.getPosition();
    }

    return new THREE.Vector3();
  }

  getTargetRotation() {
    if (!this.target) {
      return new THREE.Euler();
    }

    if (this.target.rotation) {
      return this.target.rotation;
    }

    if (typeof this.target.getRotation === "function") {
      return this.target.getRotation();
    }

    return new THREE.Euler();
  }

  getTargetForward() {
    const rotation = this.getTargetRotation();

    return new THREE.Vector3(0, 0, 1)
      .applyEuler(rotation)
      .normalize();
  }

  getCameraOffsets() {
    switch (this.cameraMode) {
      case "close":
        return {
          distance: 5.5,
          height: 3.2,
          lookAhead: 8,
        };

      case "cinematic":
        return {
          distance: 13,
          height: 7,
          lookAhead: 13,
        };

      case "overhead":
        return {
          distance: 2,
          height: 11,
          lookAhead: 1,
        };

      case "chase":
      default:
        return {
          distance: this.options.followDistance,
          height: this.options.followHeight,
          lookAhead: this.options.lookAhead,
        };
    }
  }

  calculateDesiredPosition(targetPosition, forward) {
    const offsets = this.getCameraOffsets();

    this.desiredPosition
      .copy(targetPosition)
      .addScaledVector(forward, -offsets.distance);

    this.desiredPosition.y += offsets.height;

    this.desiredPosition.y = THREE.MathUtils.clamp(
      this.desiredPosition.y,
      this.options.minimumHeight,
      this.options.maximumHeight
    );

    return this.desiredPosition;
  }

  calculateLookTarget(targetPosition, forward) {
    const offsets = this.getCameraOffsets();

    this.lookTarget
      .copy(targetPosition)
      .addScaledVector(forward, offsets.lookAhead);

    this.lookTarget.y += 1.1;

    return this.lookTarget;
  }

  update(deltaTime) {
    if (!this.enabled || this.paused || !this.target) {
      return;
    }

    const dt = THREE.MathUtils.clamp(deltaTime || 0, 0, 0.1);

    if (dt === 0) {
      return;
    }

    this.elapsedTime += dt;

    const targetPosition = this.getTargetPosition();
    const forward = this.getTargetForward();

    this.targetSpeed =
      targetPosition.distanceTo(this.lastTargetPosition) / dt;

    this.lastTargetPosition.copy(targetPosition);

    this.calculateDesiredPosition(targetPosition, forward);
    this.calculateLookTarget(targetPosition, forward);

    if (!this.initialized) {
      this.camera.position.copy(this.desiredPosition);
      this.currentLookAt.copy(this.lookTarget);

      this.camera.lookAt(this.currentLookAt);

      this.initialized = true;
    } else {
      const positionAlpha =
        1 - Math.exp(-this.options.positionSmoothness * dt);

      const rotationAlpha =
        1 - Math.exp(-this.options.rotationSmoothness * dt);

      this.camera.position.lerp(
        this.desiredPosition,
        positionAlpha
      );

      this.currentLookAt.lerp(
        this.lookTarget,
        rotationAlpha
      );
    }

    this.updateCollisionShake(dt);
    this.updateFieldOfView(dt);

    this.camera.lookAt(this.currentLookAt);
  }

  updateFieldOfView(deltaTime) {
    const baseFov = this.originalFov;
    const speedFactor = THREE.MathUtils.clamp(
      this.targetSpeed / 30,
      0,
      1
    );

    const desiredFov = baseFov + speedFactor * 5;
    const alpha = 1 - Math.exp(-2 * deltaTime);

    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      desiredFov,
      alpha
    );

    this.camera.updateProjectionMatrix();
  }

  triggerCollisionShake(
    intensity = this.options.collisionShakeIntensity,
    duration = this.options.collisionShakeDuration
  ) {
    this.shakeIntensity = Math.max(
      this.shakeIntensity,
      THREE.MathUtils.clamp(intensity, 0, 2)
    );

    this.shakeDuration = Math.max(
      this.shakeDuration,
      duration
    );

    this.shakeTime = this.shakeDuration;
  }

  updateCollisionShake(deltaTime) {
    if (this.shakeTime <= 0) {
      return;
    }

    this.shakeTime = Math.max(0, this.shakeTime - deltaTime);

    const strength =
      this.shakeIntensity *
      (this.shakeTime / Math.max(this.shakeDuration, 0.001));

    const shakeX = (Math.random() - 0.5) * strength;
    const shakeY = (Math.random() - 0.5) * strength;

    this.camera.position.x += shakeX;
    this.camera.position.y += shakeY;
  }

  setFieldOfView(fov) {
    this.originalFov = THREE.MathUtils.clamp(fov, 35, 100);
    this.camera.fov = this.originalFov;
    this.camera.updateProjectionMatrix();
  }

  setFollowDistance(distance) {
    this.options.followDistance = THREE.MathUtils.clamp(
      distance,
      3,
      25
    );
  }

  setFollowHeight(height) {
    this.options.followHeight = THREE.MathUtils.clamp(
      height,
      2,
      15
    );
  }

  reset() {
    this.initialized = false;
    this.elapsedTime = 0;
    this.targetSpeed = 0;

    this.shakeTime = 0;
    this.shakeDuration = 0;
    this.shakeIntensity = 0;

    this.camera.fov = this.originalFov;
    this.camera.updateProjectionMatrix();

    if (this.target) {
      this.lastTargetPosition.copy(this.getTargetPosition());
    }
  }

  dispose() {
    this.target = null;
    this.enabled = false;
    this.paused = true;
  }

  getSnapshot() {
    return {
      mode: this.cameraMode,
      enabled: this.enabled,
      paused: this.paused,
      targetSpeed: this.targetSpeed,
      fieldOfView: this.camera.fov,
      followDistance: this.options.followDistance,
      followHeight: this.options.followHeight,
    };
  }
}