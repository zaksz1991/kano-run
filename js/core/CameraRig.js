import * as THREE from "/vendor/three.module.js";

export class CameraRig {
  constructor(options = {}) {
    this.options = {
      fov: 60,
      near: 0.1,
      far: 1000,
      position: new THREE.Vector3(0, 6.2, -3.5),
      lookAt: new THREE.Vector3(0, 1, 8),
      followDistance: 7,
      followHeight: 4.5,
      lookAhead: 9,
      positionDamping: 5,
      rotationDamping: 6,
      shakeDecay: 2.5,
      maxShake: 0.35,
      ...options,
    };

    this.camera = null;
    this.target = null;
    this.initialized = false;
    this.disposed = false;

    this.desiredPosition = new THREE.Vector3();
    this.desiredLookAt = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();

    this.offset = new THREE.Vector3(
      0,
      this.options.followHeight,
      -this.options.followDistance
    );

    this.velocity = new THREE.Vector3();
    this.shakeOffset = new THREE.Vector3();
    this.shakeVelocity = new THREE.Vector3();

    this.shakeIntensity = 0;
    this.shakeTime = 0;
    this.elapsedTime = 0;

    this.tempPosition = new THREE.Vector3();
    this.tempTarget = new THREE.Vector3();
    this.tempDirection = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
  }

  init(aspect = 1) {
    if (this.disposed) {
      throw new Error("CameraRig has been disposed.");
    }

    if (this.camera) {
      return this.camera;
    }

    this.camera = new THREE.PerspectiveCamera(
      this.options.fov,
      Math.max(0.01, aspect),
      this.options.near,
      this.options.far
    );

    this.camera.position.copy(this.options.position);
    this.currentLookAt.copy(this.options.lookAt);
    this.camera.lookAt(this.currentLookAt);

    this.initialized = true;

    return this.camera;
  }

  setTarget(target) {
    this.target = target || null;
  }

  setFollowOffset(x, y, z) {
    this.offset.set(x, y, z);

    this.options.followHeight = y;
    this.options.followDistance = Math.abs(z);
  }

  setFollowDistance(distance) {
    this.options.followDistance = Math.max(1, distance);
    this.offset.z = -this.options.followDistance;
  }

  setFollowHeight(height) {
    this.options.followHeight = Math.max(0, height);
    this.offset.y = this.options.followHeight;
  }

  setLookAhead(distance) {
    this.options.lookAhead = Math.max(0, distance);
  }

  setDamping(positionDamping, rotationDamping = positionDamping) {
    this.options.positionDamping = Math.max(0, positionDamping);
    this.options.rotationDamping = Math.max(0, rotationDamping);
  }

  update(deltaTime, target = this.target) {
    if (!this.camera || this.disposed) {
      return;
    }

    const dt = THREE.MathUtils.clamp(
      Number(deltaTime) || 0,
      0,
      0.1
    );

    this.elapsedTime += dt;

    if (target) {
      this.updateFollowTarget(target, dt);
    }

    this.updateShake(dt);
  }

  updateFollowTarget(target, deltaTime) {
    const targetPosition = target.position || target;

    if (
      !Number.isFinite(targetPosition.x) ||
      !Number.isFinite(targetPosition.y) ||
      !Number.isFinite(targetPosition.z)
    ) {
      return;
    }

    this.tempPosition.copy(targetPosition);

    const heading = this.getHeading(target);

    this.tempDirection.set(
      Math.sin(heading),
      0,
      Math.cos(heading)
    );

    this.desiredPosition
      .copy(this.tempPosition)
      .add(this.offset);

    this.desiredPosition.x +=
      this.tempDirection.x * -this.options.followDistance * 0.15;

    this.desiredPosition.z +=
      this.tempDirection.z * -this.options.followDistance * 0.15;

    this.desiredLookAt
      .copy(this.tempPosition)
      .addScaledVector(
        this.tempDirection,
        this.options.lookAhead
      );

    this.desiredLookAt.y += 0.8;

    const positionAlpha = this.getDampingAlpha(
      this.options.positionDamping,
      deltaTime
    );

    const rotationAlpha = this.getDampingAlpha(
      this.options.rotationDamping,
      deltaTime
    );

    this.camera.position.lerp(
      this.desiredPosition,
      positionAlpha
    );

    this.currentLookAt.lerp(
      this.desiredLookAt,
      rotationAlpha
    );

    this.camera.lookAt(this.currentLookAt);
  }

  getHeading(target) {
    if (Number.isFinite(target.rotation?.y)) {
      return target.rotation.y;
    }

    if (Number.isFinite(target.heading)) {
      return target.heading;
    }

    if (Number.isFinite(target.userData?.heading)) {
      return target.userData.heading;
    }

    return 0;
  }

  getDampingAlpha(damping, deltaTime) {
    if (damping <= 0) {
      return 1;
    }

    return 1 - Math.exp(-damping * deltaTime);
  }

  shake(intensity = 0.15, duration = 0.25) {
    if (this.disposed) {
      return;
    }

    this.shakeIntensity = THREE.MathUtils.clamp(
      intensity,
      0,
      this.options.maxShake
    );

    this.shakeTime = Math.max(
      this.shakeTime,
      Math.max(0, duration)
    );
  }

  updateShake(deltaTime) {
    if (!this.camera) {
      return;
    }

    if (this.shakeTime <= 0 || this.shakeIntensity <= 0) {
      this.shakeOffset.set(0, 0, 0);
      return;
    }

    this.shakeTime = Math.max(
      0,
      this.shakeTime - deltaTime
    );

    const remaining = this.shakeTime > 0
      ? Math.min(1, this.shakeTime)
      : 0;

    const intensity =
      this.shakeIntensity * remaining;

    const t = this.elapsedTime * 38;

    this.shakeOffset.set(
      Math.sin(t * 1.13) * intensity,
      Math.cos(t * 1.71) * intensity * 0.65,
      Math.sin(t * 0.87) * intensity * 0.35
    );

    // Apply shake relative to the intended position without accumulating drift.
    this.camera.position.add(this.shakeOffset);

    if (this.shakeTime <= 0) {
      this.shakeIntensity = 0;
      this.shakeOffset.set(0, 0, 0);
    }
  }

  setAspect(aspect) {
    if (!this.camera) {
      return;
    }

    this.camera.aspect = Math.max(0.01, aspect);
    this.camera.updateProjectionMatrix();
  }

  setFov(fov) {
    if (!this.camera) {
      return;
    }

    this.camera.fov = THREE.MathUtils.clamp(fov, 20, 110);
    this.camera.updateProjectionMatrix();
  }

  setClipPlanes(near, far) {
    if (!this.camera) {
      return;
    }

    this.camera.near = Math.max(0.01, near);
    this.camera.far = Math.max(this.camera.near + 1, far);

    this.camera.updateProjectionMatrix();
  }

  setPosition(x, y, z) {
    if (!this.camera) {
      return;
    }

    this.camera.position.set(x, y, z);
    this.desiredPosition.set(x, y, z);
  }

  lookAt(x, y, z) {
    if (!this.camera) {
      return;
    }

    this.currentLookAt.set(x, y, z);
    this.desiredLookAt.set(x, y, z);
    this.camera.lookAt(this.currentLookAt);
  }

  getCamera() {
    return this.camera;
  }

  getPosition() {
    return this.camera
      ? this.camera.position.clone()
      : null;
  }

  getTarget() {
    return this.target;
  }

  reset() {
    if (!this.camera) {
      return;
    }

    this.camera.position.copy(this.options.position);
    this.currentLookAt.copy(this.options.lookAt);
    this.camera.lookAt(this.currentLookAt);

    this.shakeIntensity = 0;
    this.shakeTime = 0;
    this.shakeOffset.set(0, 0, 0);
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.target = null;
    this.camera = null;
    this.initialized = false;
    this.disposed = true;
  }
}

export default CameraRig;