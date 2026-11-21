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

// Stalls, kiosks, signs and trees between the side camera and the door hide the person stepping in or out:
// while the boarding view is on, those few props are switched off, then restored.
const hidden = new Set();
const sizeCache = new WeakMap();
let clearClock = 0;
const tmpBox = new THREE.Box3();
const tmpSize = new THREE.Vector3();
function restoreProps() {
  for (const o of hidden) o.visible = true;
  hidden.clear();
}
const probe = new THREE.Vector3();
function segmentHits(box, from, to) {
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    probe.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t);
    if (box.containsPoint(probe)) return true;
  }
  return false;
}
const camGuess = new THREE.Vector3();
const doorPoint = new THREE.Vector3();
const kerbPoint = new THREE.Vector3();
const childBox = new THREE.Box3();
function clearView(owner, player, side, nowMs) {
  if (nowMs - clearClock < 450) return;
  clearClock = nowMs;
  const world = owner.world;
  if (!world) return;
  const skip = new Set(walkers().map((w) => w.rig?.root));
  const next = new Set();
  const pz = player.position.z;
  const px = player.position.x;
  camGuess.set(px + side * 8.2, 2.9, pz + 6.6);
  doorPoint.set(px + side * 0.3, 1.0, pz);
  kerbPoint.set(side * 5.9, 1.0, pz - 1.9);
  for (const child of world.children) {
    if (!child.visible && !hidden.has(child)) continue;
    if (child === player || skip.has(child) || child.isLight || child.isCamera) continue;
    const lx = (child.position.x - px) * side;
    const dz = child.position.z - pz;
    if (lx < 2.0 || lx > 40 || dz < -30 || dz > 24) continue;
    let info = sizeCache.get(child);
    if (!info) {
      try {
        tmpBox.setFromObject(child); tmpBox.getSize(tmpSize);
        info = { size: tmpSize.clone(), off: tmpBox.getCenter(new THREE.Vector3()).sub(child.position) };
      } catch { info = { size: new THREE.Vector3(99, 99, 99), off: new THREE.Vector3() }; }
      sizeCache.set(child, info);
    }
    const size = info.size;
    if (size.x > 45 || size.z > 45 || size.y < 0.25) continue; // road, ground and very long walls stay
    if (child.userData?.kanoKeepVisible || /road|ground|terrain|flyover|bridge|sky|player|keke|traffic|vehicle|passenger|walker/i.test(child.name || '')) continue;
    childBox.setFromCenterAndSize(probe.copy(child.position).add(info.off), size);
    // Anything standing between the camera and the door or the waiting spot, or right beside the door, goes.
    const near = lx < 13 && Math.abs(dz) < 9;
    if (near || segmentHits(childBox, camGuess, doorPoint) || segmentHits(childBox, camGuess, kerbPoint)) next.add(child);
  }
  for (const o of hidden) if (!next.has(o)) o.visible = true;
  for (const o of next) o.visible = false;
  hidden.clear();
  for (const o of next) hidden.add(o);
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
        // Hysteresis: pickups only need <=12 km/h, so a hard 6 km/h cut-off made the camera flip
        // on and off while the keke rolled to a stop (visible blinking).
        const limit = state.w > 0.001 ? 30 : 16;
        const active = list.length > 0 && speed < limit;
        if (active) state.side = list[list.length - 1].side || 1;
        state.w = Math.min(1, Math.max(0, state.w + (active ? 2.2 : -2.0) * dt));
        if (state.w > 0.3) clearView(owner, player, state.side, now); else if (hidden.size && state.w < 0.05) restoreProps();
        if (state.w > 0.001) {
          const e = state.w * state.w * (3 - 2 * state.w);
          restore = { p: camera.position.clone(), q: camera.quaternion.clone() };
          const px = player.position.x;
          const pz = player.position.z;
          tmpPos.set(px + state.side * 8.2, 2.9, pz + 6.6);
          tmpTarget.set(px + state.side * 1.0, 0.9, pz - 0.7);
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
