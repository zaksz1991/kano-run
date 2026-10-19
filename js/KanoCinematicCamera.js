import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const damp = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

/**
 * Cinematic camera polish for Kano Life's existing Renderer3D.
 *
 * - Smooth speed-dependent FOV for a stronger sense of acceleration.
 * - Subtle steering bank and road vibration.
 * - Short crash-impact shake driven by Game.s.crashShake.
 * - Works with the existing reverse-camera targeting in Renderer3D.
 * - Does not create a second camera or alter game physics.
 *
 * Camera changes are applied only immediately around the renderer's actual
 * WebGL render call and restored afterward, preventing accumulated transforms.
 */
export class KanoCinematicCamera {
  constructor({ renderer, game, mobile = false, enabled = true } = {}) {
    if (!renderer?.renderer?.render || !renderer?.camera?.isPerspectiveCamera) {
      throw new TypeError('KanoCinematicCamera requires a live Renderer3D instance.');
    }

    this.renderer3d = renderer;
    this.webgl = renderer.renderer;
    this.game = game || null;
    this.mobile = Boolean(mobile);
    this.enabled = Boolean(enabled);
    this.disposed = false;
    this.elapsed = 0;
    this.active = false;
    this.speedRatio = 0;
    this.steer = 0;
    this.crash = 0;
    this.throttle = 0;
    this.braking = 0;
    this.reverse = false;
    this.fov = renderer.camera.fov;
    this.baseFov = renderer.camera.fov;

    this.savedPosition = new THREE.Vector3();
    this.savedQuaternion = new THREE.Quaternion();
    this.axisZ = new THREE.Vector3(0, 0, 1);
    this.rollQuaternion = new THREE.Quaternion();

    this.originalRender = this.webgl.render;
    this.renderWrapper = (...args) => this.renderWithEffects(...args);
    this.webgl.render = this.renderWrapper;
  }

  update(dt, state = {}) {
    if (this.disposed) return;

    const delta = clamp(Number(dt) || 0, 0, 0.05);
    this.elapsed += delta;

    const signedSpeed = Number.isFinite(state.signedSpeed)
      ? state.signedSpeed
      : state.reverse
        ? -Math.abs(Number(state.speed) || 0)
        : Math.abs(Number(state.speed) || 0);

    const speed = Math.abs(signedSpeed);
    const targetSpeedRatio = clamp(speed / 95, 0, 1);
    this.speedRatio = damp(this.speedRatio, targetSpeedRatio, 3.2, delta);
    this.steer = damp(
      this.steer,
      clamp(Number(state.steer) || 0, -1, 1),
      6.5,
      delta,
    );
    this.crash = damp(
      this.crash,
      clamp(Number(state.crashShake) || 0, 0, 1.5),
      10,
      delta,
    );
    this.throttle = damp(this.throttle, state.gas ? 1 : 0, 5, delta);
    this.braking = damp(this.braking, state.brake && !state.reverse ? 1 : 0, 7, delta);
    this.reverse = Boolean(state.reverse || signedSpeed < -0.05);

    const inDriveState = this.game?.state === 'PLAY' && !state.event;
    this.active = Boolean(
      this.enabled &&
      inDriveState &&
      this.renderer3d.lifeScene === 'road' &&
      this.renderer3d.world?.visible,
    );

    const baseFov = this.baseFov || 58;
    const speedFov = this.mobile ? 5.5 : 8.0;
    const reverseReduction = this.reverse ? 1.0 : 0;
    const targetFov = this.active
      ? baseFov + this.speedRatio * speedFov - reverseReduction
      : baseFov;

    this.fov = damp(this.fov, targetFov, this.active ? 2.8 : 5.5, delta);
  }

  renderWithEffects(scene, camera, ...args) {
    const webgl = this.webgl;
    const originalRender = this.originalRender;
    const apply = Boolean(
      !this.disposed &&
      this.active &&
      camera?.isPerspectiveCamera &&
      camera === this.renderer3d.camera &&
      this.renderer3d.lifeScene === 'road' &&
      this.renderer3d.world?.visible,
    );

    if (!apply) {
      return originalRender.call(webgl, scene, camera, ...args);
    }

    this.savedPosition.copy(camera.position);
    this.savedQuaternion.copy(camera.quaternion);
    const savedFov = camera.fov;

    const speed = this.speedRatio;
    const crash = this.crash;
    const time = this.elapsed;

    const roadShake = (this.mobile ? 0.0028 : 0.0038) + speed * 0.0055;
    const impactShake = clamp(crash, 0, 1.2) * 0.052;
    const amplitude = roadShake + impactShake;

    const shakeX = (
      Math.sin(time * 23.7) * 0.42 +
      Math.sin(time * 41.3 + 0.8) * 0.18
    ) * amplitude;

    const shakeY = (
      Math.sin(time * 19.1 + 0.4) * 0.55 +
      Math.sin(time * 36.7) * 0.15
    ) * amplitude;

    const shakeZ = Math.sin(time * 17.9) * amplitude * 0.22;
    const steerBank = -this.steer * speed * (this.mobile ? 0.010 : 0.014);
    const impactRoll = Math.sin(time * 27.0) * impactShake * 0.24;
    const pitch = (this.throttle * -0.008 + this.braking * 0.010) * (0.35 + speed);

    try {
      camera.position.x += shakeX;
      camera.position.y += shakeY + pitch;
      camera.position.z += shakeZ;
      camera.quaternion.multiply(
        this.rollQuaternion.setFromAxisAngle(this.axisZ, steerBank + impactRoll),
      );

      if (Math.abs(camera.fov - this.fov) > 0.001) {
        camera.fov = this.fov;
        camera.updateProjectionMatrix();
      }

      return originalRender.call(webgl, scene, camera, ...args);
    } finally {
      camera.position.copy(this.savedPosition);
      camera.quaternion.copy(this.savedQuaternion);
      if (camera.fov !== savedFov) {
        camera.fov = savedFov;
        camera.updateProjectionMatrix();
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    if (this.webgl?.render === this.renderWrapper) {
      this.webgl.render = this.originalRender;
    }

    this.renderer3d = null;
    this.webgl = null;
    this.game = null;
  }
}
