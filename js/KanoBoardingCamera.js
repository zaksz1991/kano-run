/**
 * Boarding camera: while a passenger walks to or from the stopped keke, the camera eases to a
 * 3/4 side view so the person is actually visible stepping in or out, then eases back to the
 * normal chase view. Applied only at render time and restored afterwards, so gameplay, steering
 * and every other camera module keep seeing the normal camera.
 */
import * as THREE from 'three';

const KEY = Symbol.for('kano.life.boardingCamera.v1');
const state = { w: 0, side: 1, lastT: 0 };
if (typeof window !== "undefined") window.kanoBoardingCamera = state;
const tmpPos = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

function walkers() {
  const upgrade = typeof window !== 'undefined' ? window.__KANO_LIFE_SCENE_UPGRADE__ : null;
  return upgrade?.walkingPassengers || [];
}

function withBoardingCamera(inner) {
  return function renderWithBoardingCamera(scene, camera) {
    let restore = null;
    try {
      const owner = window.__KANO_ACTIVE_RENDERER__;
      const player = owner?.player;
      if (owner && camera === owner.camera && player && owner.lifeScene === 'road') {
        const now = performance.now();
        const dt = Math.min(0.1, Math.max(0, (now - state.lastT) / 1000));
        state.lastT = now;
        const list = walkers();
        const speed = Math.abs(Number(window.kanoGame?.s?.speed) || 0);
        const active = list.length > 0 && speed < 6;
        if (active) state.side = list[list.length - 1].side || 1;
        state.w = Math.min(1, Math.max(0, state.w + (active ? 2.2 : -2.0) * dt));
        if (state.w > 0.001) {
          const e = state.w * state.w * (3 - 2 * state.w);
          restore = { p: camera.position.clone(), q: camera.quaternion.clone() };
          const px = player.position.x;
          const pz = player.position.z;
          tmpPos.set(px + state.side * 1.9, 2.9, pz + 4.3);
          tmpTarget.set(px + state.side * 0.8, 0.85, pz + 0.1);
          camera.position.lerp(tmpPos, e);
          const look = tmpTarget.clone();
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(restore.q).multiplyScalar(12).add(restore.p);
          look.lerp(fwd, 1 - e);
          camera.lookAt(look);
        }
      }
    } catch { restore = null; }
    try {
      return inner.call(this, scene, camera);
    } finally {
      if (restore) { camera.position.copy(restore.p); camera.quaternion.copy(restore.q); }
    }
  };
}

// Other modules install per-instance render wrappers when the renderer is built, so wrap the
// live instance (outermost) rather than only the prototype.
if (typeof window !== 'undefined' && !window[KEY]) {
  window[KEY] = true;
  setInterval(() => {
    const webgl = window.__KANO_ACTIVE_RENDERER__?.renderer;
    if (!webgl || webgl.__kanoBoardingCameraWrapped) return;
    Object.defineProperty(webgl, '__kanoBoardingCameraWrapped', { value: true });
    webgl.render = withBoardingCamera(webgl.render);
  }, 500);
}
