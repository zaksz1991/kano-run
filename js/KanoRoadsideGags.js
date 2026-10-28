/**
 * Roadside comedy on the shoulder: a man sprinting after his rolling kufi cap,
 * and a trader pushing a wobbly handcart piled with sacks. Both are tiny actors
 * (merged meshes, ~12 draw calls total) that scroll with the road and recycle
 * ahead of the player. Purely visual; no collisions, fares or timing change.
 */
import * as THREE from 'three';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';
import { createKanoStreetPerson } from './KanoStreetLifeMotionUpgrade.js';
import { mergeActor } from './KanoMergeStaticMeshes.js';

const PATCH_TAG = Symbol.for('kano.life.roadsideGags.v1');
const states = new WeakMap();
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mat = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const put = (parent, geo, m, pos, scale = [1, 1, 1], rot = [0, 0, 0]) => {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(...pos); mesh.scale.set(...scale); mesh.rotation.set(...rot);
  parent.add(mesh);
  return mesh;
};

function buildCap() {
  const cap = new THREE.Group();
  cap.name = 'KANO_GAG_ROLLING_CAP';
  put(cap, new THREE.CylinderGeometry(0.16, 0.19, 0.12, 10), mat(0xf4efe4), [0, 0.0, 0]);
  put(cap, new THREE.TorusGeometry(0.17, 0.02, 4, 10), mat(0x2f6f4f), [0, 0.06, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  mergeActor(cap);
  const holder = new THREE.Group();
  holder.add(cap);
  return { holder, cap };
}

function buildCart() {
  const cart = new THREE.Group();
  cart.name = 'KANO_GAG_HANDCART';
  const wood = mat(0x8a6a3c), tyre = mat(0x1d1d1d), sack = mat(0xc9ab6e, 0.95), sack2 = mat(0xb8bfae, 0.95);
  put(cart, new THREE.BoxGeometry(1.5, 0.08, 0.8), wood, [0, 0.55, 0]);
  put(cart, new THREE.BoxGeometry(1.5, 0.25, 0.06), wood, [0, 0.7, 0.4]);
  put(cart, new THREE.BoxGeometry(1.5, 0.25, 0.06), wood, [0, 0.7, -0.4]);
  put(cart, new THREE.BoxGeometry(0.08, 0.12, 0.08), wood, [-1.3, 0.62, 0.3], [10, 1, 1]);
  put(cart, new THREE.BoxGeometry(0.08, 0.12, 0.08), wood, [-1.3, 0.62, -0.3], [10, 1, 1]);
  for (const z of [-0.45, 0.45]) put(cart, new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10), tyre, [0.1, 0.28, z], [1, 1, 1], [Math.PI / 2, 0, 0]);
  [[-0.35, 1.05, 0.1, sack], [0.3, 1.0, -0.15, sack2], [0.0, 1.38, 0.0, sack], [0.55, 0.95, 0.2, sack]].forEach(([x, y, z, m]) => put(cart, new THREE.SphereGeometry(0.34, 8, 6), m, [x, y, z], [1.1, 1.0, 0.85]));
  mergeActor(cart);
  return cart;
}

function animatePerson(person, t, speed) {
  const parts = person.userData.kanoAnimationParts;
  if (!parts) return;
  const swing = Math.sin(t * speed);
  parts.legs?.forEach((leg, i) => { leg.pivot.rotation.x = swing * (i % 2 ? -1 : 1) * 0.8; });
  parts.arms?.forEach((arm, i) => { arm.pivot.rotation.x = swing * (i % 2 ? 1 : -1) * 0.9; });
}

function buildState(system) {
  const group = new THREE.Group();
  group.name = 'KANO_ROADSIDE_GAGS';
  system.renderer.world.add(group);
  const side = Math.random() < 0.5 ? -1 : 1;

  const runner = createKanoStreetPerson(0);
  runner.rotation.y = Math.PI; // runs away from the camera (-z)
  const { holder: capHolder, cap } = buildCap();
  const chase = new THREE.Group();
  chase.add(runner, capHolder);
  capHolder.position.set(0, 0.17, -2.6);
  group.add(chase);

  const pusher = createKanoStreetPerson(3);
  pusher.rotation.y = Math.PI;
  const cart = buildCart();
  const pushed = new THREE.Group();
  pushed.add(pusher, cart);
  cart.position.set(0, 0, -1.7);
  cart.rotation.y = Math.PI / 2;
  pusher.position.set(0, 0, 0);
  group.add(pushed);

  const state = {
    group, chase, runner, capHolder, cap, pushed, pusher, cart, t: 0,
    chaseSide: side, pushSide: -side,
  };
  chase.scale.setScalar(1.3);
  pushed.scale.setScalar(1.3);
  chase.position.set(side * 6.5, 0, -85);
  pushed.position.set(-side * 6.6, 0, -170);
  return state;
}

function update(system, dt, snap) {
  if (!system?.renderer?.world || system.renderer.disposed) return;
  let state = states.get(system);
  if (!state) { state = buildState(system); states.set(system, state); }
  if (typeof window !== 'undefined') window.__KANO_GAGS__ = state;
  const visible = !system.renderer.lifeScene || system.renderer.lifeScene === 'road';
  state.group.visible = visible && !(window.kanoFrameGovernorLevel >= 1);
  if (!visible) return;
  const delta = clamp(dt, 0, 0.05);
  state.t += delta;
  const signed = Number.isFinite(snap?.signedSpeed) ? snap.signedSpeed
    : snap?.reverse ? -Math.abs(Number(snap?.speed) || 0) : Math.abs(Number(snap?.speed) || 0);
  const scroll = signed * delta * 0.28;

  // Hat chase: runner goes away from the camera at ~2.4 u/s, the cap rolls ahead.
  state.chase.position.z += scroll - 2.4 * delta;
  animatePerson(state.runner, state.t, 13);
  state.runner.position.y = Math.abs(Math.sin(state.t * 13)) * 0.04;
  state.cap.rotation.z = -state.t * 9;
  state.capHolder.position.x = Math.sin(state.t * 1.7) * 0.4;
  if (state.chase.position.z > 12) { state.chase.position.z = -rand(150, 190); state.chase.position.x = state.chaseSide * rand(6.4, 6.9); }
  else if (state.chase.position.z < -230) state.chase.position.z = -(150 + rand(0, 30));

  // Handcart: slow, wobbly push away from the camera at ~0.9 u/s.
  state.pushed.position.z += scroll - 0.9 * delta;
  animatePerson(state.pusher, state.t, 5.5);
  state.cart.rotation.z = Math.sin(state.t * 4) * 0.025;
  state.cart.position.y = Math.abs(Math.sin(state.t * 5)) * 0.015;
  if (state.pushed.position.z > 12) { state.pushed.position.z = -rand(160, 210); state.pushed.position.x = state.pushSide * rand(6.5, 6.9); }
  else if (state.pushed.position.z < -240) state.pushed.position.z = -(160 + rand(0, 30));
}

if (KanoSceneUpgrade?.prototype && !KanoSceneUpgrade.prototype[PATCH_TAG]) {
  Object.defineProperty(KanoSceneUpgrade.prototype, PATCH_TAG, { value: true });
  const originalUpdate = KanoSceneUpgrade.prototype.update;
  if (typeof originalUpdate === 'function') {
    KanoSceneUpgrade.prototype.update = function updateWithRoadsideGags(dt, state, ...args) {
      const result = originalUpdate.call(this, dt, state, ...args);
      try { update(this, dt, state); } catch (error) { /* cosmetic only */ }
      return result;
    };
  }
  const originalDispose = KanoSceneUpgrade.prototype.dispose;
  if (typeof originalDispose === 'function') {
    KanoSceneUpgrade.prototype.dispose = function disposeRoadsideGags(...args) {
      const state = states.get(this);
      if (state) { state.group.parent?.remove(state.group); states.delete(this); }
      return originalDispose.apply(this, args);
    };
  }
}
