/**
 * Funny roadside pickups: some waiting passengers come with props - a basket of
 * tomatoes on the head, a chicken under the arm, a goat on a leash, a loud
 * radio, a huge sack. Props are tiny merged meshes (1 draw call each), added
 * once per pickup marker; nothing about fares, collisions or timing changes.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { createProceduralGoat } from './KanoCulturalStreetEventsUpgrade.js';
import { mergeActor } from './KanoMergeStaticMeshes.js';

const PATCH = Symbol.for('kano.life.funnyPickupProps.v1');
export const FUNNY_PROPS = ['tomatoBasket', 'chicken', 'goat', 'radio', 'sack', 'none', 'none'];

const mat = (color, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const add = (parent, geo, material, pos, scale = [1, 1, 1], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
  parent.add(m);
  return m;
};

export function propForZone(zone) {
  const id = String(zone?.id || '');
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return FUNNY_PROPS[hash % FUNNY_PROPS.length];
}

export function buildProp(kind) {
  const g = new THREE.Group();
  g.name = `KANO_FUNNY_PROP_${kind}`;
  if (kind === 'tomatoBasket') {
    add(g, new THREE.CylinderGeometry(0.34, 0.26, 0.2, 10), mat(0xb98c4a), [0, 2.0, 0]);
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2;
      add(g, new THREE.SphereGeometry(0.11, 6, 5), mat(0xd22d1f, 0.6), [Math.cos(a) * 0.18, 2.14, Math.sin(a) * 0.18]);
    }
    add(g, new THREE.SphereGeometry(0.12, 6, 5), mat(0xd22d1f, 0.6), [0, 2.2, 0]);
    g.position.set(0, -0.36, 0);
  } else if (kind === 'chicken') {
    add(g, new THREE.SphereGeometry(0.2, 8, 6), mat(0xf4efe4), [0.42, 0.95, 0.12], [1.15, 0.9, 0.85]);
    add(g, new THREE.SphereGeometry(0.1, 7, 5), mat(0xf4efe4), [0.6, 1.12, 0.12]);
    add(g, new THREE.ConeGeometry(0.04, 0.12, 5), mat(0xf29a1b), [0.7, 1.1, 0.12], [1, 1, 1], [0, 0, -Math.PI / 2]);
    add(g, new THREE.BoxGeometry(0.05, 0.1, 0.03), mat(0xd22d1f), [0.6, 1.2, 0.12]);
  } else if (kind === 'goat') {
    const goat = createProceduralGoat();
    mergeActor(goat.root);
    goat.root.visible = true;
    goat.root.position.set(0.75, 0, 0.25);
    goat.root.scale.setScalar(0.62);
    goat.root.rotation.y = -0.6;
    g.add(goat.root);
    add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4), mat(0x6a4a2a), [0.38, 0.62, 0.1], [1, 1, 1], [0, 0, 1.15]);
  } else if (kind === 'radio') {
    add(g, new THREE.BoxGeometry(0.46, 0.28, 0.16), mat(0x1c1c1c, 0.6), [0.5, 0.45, 0.2]);
    add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), mat(0x777777), [0.4, 0.45, 0.285], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), mat(0x777777), [0.6, 0.45, 0.285], [1, 1, 1], [Math.PI / 2, 0, 0]);
    add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4), mat(0xcccccc), [0.66, 0.78, 0.2], [1, 1, 1], [0, 0, -0.3]);
  } else if (kind === 'sack') {
    add(g, new THREE.SphereGeometry(0.4, 9, 7), mat(0xc4a46a, 0.95), [0.55, 0.42, 0.15], [1, 1.25, 0.9]);
    add(g, new THREE.ConeGeometry(0.16, 0.2, 6), mat(0xb59557, 0.95), [0.55, 0.98, 0.15]);
  }
  mergeActor(g);
  return g;
}

function decorate(renderer, state) {
  for (const zone of state.zones || []) {
    const actor = renderer.zoneActors?.get(zone.id);
    if (!actor || zone.type !== 'pickup' || zone.hub || actor.userData.funnyPropDone) continue;
    actor.userData.funnyPropDone = true;
    const kind = propForZone(zone);
    if (kind === 'none') continue;
    try { actor.add(buildProp(kind)); } catch (error) { /* cosmetic only */ }
  }
}

function install() {
  const proto = Renderer3D?.prototype;
  if (!proto || proto[PATCH] || typeof proto.syncZones !== 'function') return;
  const original = proto.syncZones;
  proto.syncZones = function syncZonesWithFunnyProps(state, ...args) {
    const result = original.call(this, state, ...args);
    try { decorate(this, state); } catch (error) { /* cosmetic only */ }
    return result;
  };
  Object.defineProperty(proto, PATCH, { value: true, configurable: false });
}
install();
