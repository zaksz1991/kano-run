/**
 * KANO LIFE — ADAPTIVE MOBILE QUALITY + WORLD LEVEL OF DETAIL
 *
 * Drop-in replacement for js/KanoAdaptiveQuality.js.
 * Keeps the constructor/update/setLevel/getDiagnostics/dispose API used by
 * js/main.js, while managing resolution and selectively culling distant,
 * decorative world actors when sustained low frame rate is detected.
 *
 * Gameplay-critical pickups, potholes, traffic state, the player keke, and
 * the separate life-scene dioramas are deliberately never culled by this file.
 */
import * as THREE from 'three';

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const nowTime = () => globalThis.performance?.now?.() ?? Date.now();

const safeDevicePixelRatio = () => {
  const value = Number(globalThis.window?.devicePixelRatio) || 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
};

export class KanoAdaptiveQuality {
  constructor({ renderer, mobile = false, enabled = true } = {}) {
    if (
      !renderer?.renderer?.setPixelRatio ||
      !renderer?.renderer?.getPixelRatio
    ) {
      throw new TypeError(
        'KanoAdaptiveQuality requires a live Renderer3D instance.',
      );
    }

    this.renderer3d = renderer;
    this.webgl = renderer.renderer;
    this.mobile = Boolean(mobile);
    this.enabled = Boolean(enabled);
    this.disposed = false;

    this.originalRatio = Number(this.webgl.getPixelRatio()) || 1;
    this.deviceRatio = safeDevicePixelRatio();

    // Limit GPU fill-rate cost without making the mobile image excessively soft.
    this.maximumRatio = this.mobile ? 1.28 : 1.72;
    this.minimumRatio = this.mobile ? 0.78 : 0.84;
    this.startupRatio = this.mobile ? 1.06 : 1.30;
    this.maxSupportedRatio = Math.max(
      this.minimumRatio,
      Math.min(this.deviceRatio, this.maximumRatio),
    );
    this.baseRatio = this.maxSupportedRatio;
    this.minRatio = Math.min(this.baseRatio, this.minimumRatio);

    this.levels = this.buildLevels();
    this.lodDistances = this.mobile
      ? [Infinity, 230, 210, 190, 170, 150]
      : [Infinity, 270, 245, 220, 195, 175];

    const targetStart = Math.min(this.baseRatio, this.startupRatio);
    let startIndex = this.levels.findIndex(
      (ratio) => ratio <= targetStart + 0.01,
    );
    if (startIndex < 0) startIndex = this.levels.length - 1;

    this.levelIndex = startIndex;
    this.currentRatio = this.levels[this.levelIndex] ?? targetStart;
    this.currentLodDistance = this.distanceForLevel(this.levelIndex);

    this.windowStart = nowTime();
    this.windowFrames = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.lastChangeAt = 0;
    this.lastFps = 60;
    this.lastTierEventAt = 0;
    this.lastLodUpdateAt = 0;

    this.worldPosition = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
    this.visibilityRecords = new Map();

    this.applyRatio(this.currentRatio);
    this.applySceneLod(true);
  }

  buildLevels() {
    const raw = [
      this.baseRatio,
      this.baseRatio * 0.94,
      this.baseRatio * 0.87,
      this.baseRatio * 0.81,
      this.baseRatio * 0.75,
      this.minRatio,
    ];
    const unique = [];
    for (const value of raw) {
      const ratio = clamp(value, this.minRatio, this.baseRatio);
      if (!unique.some((previous) => Math.abs(previous - ratio) < 0.025)) {
        unique.push(ratio);
      }
    }
    unique.sort((a, b) => b - a);
    return unique.length ? unique : [this.baseRatio];
  }

  distanceForLevel(index) {
    if (index <= 0) return Infinity;
    const safeIndex = Math.min(index, this.lodDistances.length - 1);
    return this.lodDistances[safeIndex];
  }

  applyRatio(ratio) {
    if (this.disposed || !this.webgl) return false;
    const next = clamp(Number(ratio) || 1, this.minRatio, this.baseRatio);
    try {
      this.webgl.setPixelRatio(next);
      this.renderer3d?.resize?.();
      this.currentRatio = next;
      return true;
    } catch (error) {
      console.warn(
        '[Kano Life] adaptive render resolution change failed',
        error,
      );
      return false;
    }
  }

  getWorldPosition(actor) {
    if (!actor) return null;
    try {
      if (typeof actor.getWorldPosition === 'function') {
        actor.getWorldPosition(this.worldPosition);
        return this.worldPosition;
      }
      return actor.position || null;
    } catch {
      return actor.position || null;
    }
  }

  rememberVisibility(actor) {
    if (!actor || this.visibilityRecords.has(actor)) return;
    this.visibilityRecords.set(actor, actor.visible !== false);
  }

  setActorLodVisibility(actor, maxDistance, extraBuffer = 0) {
    if (!actor || actor.isInstancedMesh) return;
    this.rememberVisibility(actor);
    const originalVisible = this.visibilityRecords.get(actor);
    if (!originalVisible) {
      actor.visible = false;
      return;
    }

    if (!Number.isFinite(maxDistance)) {
      actor.visible = true;
      return;
    }

    const position = this.getWorldPosition(actor);
    if (!position || !Number.isFinite(position.z)) return;

    const camera = this.renderer3d?.camera;
    if (camera?.getWorldPosition) {
      camera.getWorldPosition(this.cameraPosition);
    } else {
      this.cameraPosition.copy(camera?.position || new THREE.Vector3(0, 0, 0));
    }

    const dx = Number(position.x || 0) - this.cameraPosition.x;
    const dz = Number(position.z || 0) - this.cameraPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    actor.visible = distance <= maxDistance + extraBuffer;
  }

  restoreRecordedVisibility() {
    for (const [actor, visible] of this.visibilityRecords) {
      if (!actor) continue;
      try {
        actor.visible = visible;
      } catch {
        // Scene objects can be disposed during a renderer transition.
      }
    }
  }

  collectDecorativeActors() {
    const renderer = this.renderer3d;
    const actors = new Set();

    for (const slot of renderer?.buildingSlots || []) {
      if (slot?.actor) actors.add(slot.actor);
    }
    for (const slot of renderer?.roadProps || []) {
      if (slot?.actor) actors.add(slot.actor);
    }
    for (const actor of renderer?.flyovers || []) {
      if (actor) actors.add(actor);
    }

    // Only distant pedestrian models are LOD-managed. Their saved positions
    // and game-state updates remain untouched; only visual draw visibility changes.
    for (const pedestrian of renderer?.pedestrians || []) {
      const actor = pedestrian?.actor;
      if (!actor) continue;
      if (
        pedestrian.usingModel ||
        pedestrian.kanoAmbientCrowd ||
        actor.userData?.kanoAmbientCrowd ||
        actor.userData?.modelPath
      ) {
        actors.add(actor);
      }
    }

    return actors;
  }

  applySceneLod(force = false) {
    if (this.disposed || !this.renderer3d) return;

    const renderer = this.renderer3d;
    const timestamp = nowTime();
    // A short cadence is enough because the road actors already have their own
    // update loop. Avoid adding per-frame scene traversal work on mobile.
    if (!force && timestamp - this.lastLodUpdateAt < 420) return;
    this.lastLodUpdateAt = timestamp;

    const isRoad = !renderer.lifeScene || renderer.lifeScene === 'road';
    if (!isRoad || renderer.world?.visible === false) {
      this.restoreRecordedVisibility();
      return;
    }

    const maxDistance = this.currentLodDistance;
    const pedestrianDistance = Number.isFinite(maxDistance)
      ? Math.max(115, maxDistance - (this.mobile ? 14 : 4))
      : Infinity;

    for (const actor of this.collectDecorativeActors()) {
      const isCharacter = Boolean(
        actor.userData?.kanoAmbientCrowd ||
        actor.userData?.modelPath && /pedestrian|passenger|character/i.test(
          `${actor.userData?.characterType || ''} ${actor.userData?.modelPath || ''}`,
        ),
      );
      this.setActorLodVisibility(
        actor,
        isCharacter ? pedestrianDistance : maxDistance,
        isCharacter ? 0 : 8,
      );
    }

    // The player keke, traffic, pickups, fuel stops and potholes are deliberately
    // excluded from LOD, so gameplay and collision semantics cannot be altered.
  }

  update(now = nowTime(), renderMode = '3D', gameState = 'PLAY') {
    if (
      this.disposed ||
      !this.enabled ||
      renderMode !== '3D' ||
      this.renderer3d?.disposed ||
      !this.webgl
    ) {
      return;
    }

    this.applySceneLod();
    this.windowFrames += 1;
    if (now - this.windowStart < 1000) return;

    const duration = Math.max(1, now - this.windowStart);
    this.lastFps = (this.windowFrames * 1000) / duration;
    this.windowFrames = 0;
    this.windowStart = now;

    if (gameState !== 'PLAY') {
      this.slowWindows = 0;
      this.fastWindows = 0;
      return;
    }

    const sinceChange = now - this.lastChangeAt;
    if (this.lastFps < (this.mobile ? 43 : 47)) {
      this.slowWindows += 1;
      this.fastWindows = 0;
    } else if (this.lastFps > 57) {
      this.fastWindows += 1;
      this.slowWindows = 0;
    } else {
      this.slowWindows = Math.max(0, this.slowWindows - 1);
      this.fastWindows = 0;
    }

    if (
      this.slowWindows >= 2 &&
      sinceChange >= 2200 &&
      this.levelIndex < this.levels.length - 1
    ) {
      this.setLevel(this.levelIndex + 1, now, 'performance');
      return;
    }

    if (
      this.fastWindows >= 7 &&
      sinceChange >= 9000 &&
      this.levelIndex > 0
    ) {
      this.setLevel(this.levelIndex - 1, now, 'headroom');
    }
  }

  setLevel(index, now = nowTime(), reason = 'manual') {
    const nextIndex = clamp(
      Math.floor(Number(index) || 0),
      0,
      this.levels.length - 1,
    );
    if (nextIndex === this.levelIndex) return false;
    if (!this.applyRatio(this.levels[nextIndex])) return false;

    this.levelIndex = nextIndex;
    this.currentLodDistance = this.distanceForLevel(nextIndex);
    this.lastChangeAt = now;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.applySceneLod(true);

    if (now - this.lastTierEventAt > 1000) {
      this.lastTierEventAt = now;
      try {
        globalThis.window?.dispatchEvent?.(
          new CustomEvent('kano:adaptive-quality', {
            detail: {
              ratio: this.currentRatio,
              level: this.levelIndex + 1,
              levels: this.levels.length,
              fps: Math.round(this.lastFps),
              reason,
              lodDistance: Number.isFinite(this.currentLodDistance)
                ? this.currentLodDistance
                : 'full',
            },
          }),
        );
      } catch {
        // Telemetry is optional; rendering must continue if unavailable.
      }
    }
    return true;
  }

  getDiagnostics() {
    return {
      enabled: this.enabled,
      fps: Math.round(this.lastFps),
      ratio: Number(this.currentRatio.toFixed(2)),
      level: this.levelIndex + 1,
      levels: this.levels.length,
      minimumRatio: Number(this.minRatio.toFixed(2)),
      maximumRatio: Number(this.baseRatio.toFixed(2)),
      devicePixelRatio: Number(this.deviceRatio.toFixed(2)),
      lodDistance: Number.isFinite(this.currentLodDistance)
        ? this.currentLodDistance
        : 'full',
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.restoreRecordedVisibility();
    this.visibilityRecords.clear();

    try {
      if (this.webgl && !this.renderer3d?.disposed) {
        this.webgl.setPixelRatio(this.originalRatio);
        this.renderer3d?.resize?.();
      }
    } catch {
      // Renderer may already have been destroyed after WebGL context loss.
    }

    this.renderer3d = null;
    this.webgl = null;
  }
}
