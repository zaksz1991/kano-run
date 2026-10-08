// Kano Run — Camera Rig
// Phase A upgrade module
//
// Smooth player following, dynamic FOV and impact shake.

import * as THREE from '../vendor/three.module.js';

export class CameraRig {
  constructor(
    camera,
    options = {}
  ) {
    this.camera =
      camera;

    this.followHeight =
      options.followHeight ?? 6.2;

    this.followZ =
      options.followZ ?? -3.5;

    this.lookAhead =
      options.lookAhead ?? 16;

    this.followStrength =
      options.followStrength ?? 7;

    this.lookStrength =
      options.lookStrength ?? 5;

    this.baseFov =
      options.baseFov ?? 50;

    this.maxFov =
      options.maxFov ?? 58;

    this.shakeTime = 0;
    this.shakeStrength = 0;

    this.currentX = 0;
    this.currentY =
      this.followHeight;
    this.currentZ =
      this.followZ;

    this.lookTarget =
      new THREE.Vector3();

    this.positionTarget =
      new THREE.Vector3();
  }

  setTarget(
    x,
    y = 0,
    z = 5.5
  ) {
    this.positionTarget.set(
      x,
      y,
      z
    );
  }

  impact(
    strength = 1,
    duration = 0.22
  ) {
    this.shakeStrength =
      Math.max(
        this.shakeStrength,
        strength
      );

    this.shakeTime =
      Math.max(
        this.shakeTime,
        duration
      );
  }

  update(
    state = {},
    dt = 1 / 60
  ) {
    if (!this.camera) {
      return;
    }

    const playerX =
      Number.isFinite(
        Number(state.playerX)
      )
        ? Number(state.playerX)
        : 0;

    const speed =
      Number.isFinite(
        Number(state.speed)
      )
        ? Number(state.speed)
        : 0;

    const targetX =
      playerX * 0.4;

    const smooth =
      1 -
      Math.exp(
        -this.followStrength *
          dt
      );

    this.currentX +=
      (targetX -
        this.currentX) *
      smooth;

    this.currentY +=
      (this.followHeight -
        this.currentY) *
      smooth;

    this.currentZ +=
      (this.followZ -
        this.currentZ) *
      smooth;

    let shakeX = 0;
    let shakeY = 0;

    if (
      this.shakeTime >
      0
    ) {
      const intensity =
        this.shakeStrength *
        Math.min(
          1,
          this.shakeTime /
            0.22
        );

      shakeX =
        (Math.random() -
          0.5) *
        intensity *
        0.08;

      shakeY =
        (Math.random() -
          0.5) *
        intensity *
        0.05;

      this.shakeTime -=
        dt;

      if (
        this.shakeTime <=
        0
      ) {
        this.shakeTime = 0;
        this.shakeStrength = 0;
      }
    }

    this.camera.position.set(
      this.currentX +
        shakeX,
      this.currentY +
        shakeY,
      this.currentZ
    );

    this.lookTarget.set(
      playerX * 0.25,
      0.9,
      this.lookAhead
    );

    this.camera.lookAt(
      this.lookTarget
    );

    const targetFov =
      Math.min(
        this.maxFov,
        this.baseFov +
          Math.max(
            0,
            speed - 4
          ) *
            1.5
      );

    this.camera.fov +=
      (targetFov -
        this.camera.fov) *
      Math.min(
        1,
        dt * 5
      );

    this.camera.updateProjectionMatrix();
  }

  resize(
    width,
    height
  ) {
    if (!this.camera) {
      return;
    }

    this.camera.aspect =
      width /
      Math.max(
        height,
        1
      );

    this.camera.updateProjectionMatrix();
  }

  reset() {
    this.shakeTime = 0;
    this.shakeStrength = 0;

    this.currentX = 0;
    this.currentY =
      this.followHeight;
    this.currentZ =
      this.followZ;
  }
}

export function createCameraRig(
  camera,
  options = {}
) {
  return new CameraRig(
    camera,
    options
  );
}

export default CameraRig;