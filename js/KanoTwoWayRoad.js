/**
 * Kano two-way divided road, matching the player's reference photo:
 *   keke carriageway | planted median with black-white kerbs, solar double-arm lamp
 *   posts and tall conical trees | oncoming carriageway | far roadside.
 *
 * Everything the old game placed to the LEFT of the keke carriageway (shops, trees,
 * poles, dividers, people) is pushed 9.5 m further left by KanoCurvedWorld's vertex
 * shader, which opens the room. This module fills that room. It is visual only:
 * lanes, kerbs, pickup stops, collisions and fares are unchanged.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { KANO_LEFT_SHIFT } from './KanoCurvedWorld.js';

const LOOP_FAR = 215;      // metres of road built ahead
const MEDIAN_X = -6.2;     // centre of the median
const ONCOMING_X0 = -7.6;  // oncoming carriageway inner edge
const ONCOMING_X1 = -15.2; // oncoming carriageway outer edge
const ONCOMING_CENTRE = (ONCOMING_X0 + ONCOMING_X1) / 2;

function noShift(material) {
  material.userData = material.userData || {};
  material.userData.kanoNoShift = true;
  return material;
}

function scrollingInstances(group, geometry, material, positions, period, colors) {
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((p, i) => {
    dummy.position.set(p[0], p[1], p[2]);
    dummy.rotation.set(p[3] || 0, p[4] || 0, p[5] || 0);
    dummy.scale.set(p[6] || 1, p[7] || 1, p[8] || 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (colors) mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  root.userData.period = period;
  group.add(root);
  return root;
}

function build(renderer) {
  const mat = (color, rough) => noShift(renderer.material(color, rough));
  const group = new THREE.Group();
  group.name = 'KANO_TWO_WAY_ROAD';
  const roots = [];

  // --- oncoming asphalt (same texture as the player's road, filled in once it has loaded)
  const asphaltMaterial = mat(0x343c43, 0.95);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(ONCOMING_X0 - ONCOMING_X1, 250), asphaltMaterial);
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(ONCOMING_CENTRE, 0.006, -92);
  group.add(asphalt);

  // --- median: raised dry-grass bed
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 250), mat(0x8a8350, 1));
  bed.position.set(MEDIAN_X, 0.08, -92);
  group.add(bed);
  // sparse green tufts down the median
  const tuftPositions = [];
  for (let z = 10; z > -LOOP_FAR; z -= 3.1) tuftPositions.push([MEDIAN_X + ((z * 7.3) % 1.2) - 0.6, 0.2, z, 0, 0, 0, 1, 1, 1]);
  roots.push(scrollingInstances(group, new THREE.ConeGeometry(0.22, 0.4, 5), mat(0x5d7d3a, 1), tuftPositions, 3.1));

  // --- painted edges: yellow on both sides of the median, white on the far edge
  for (const [x, w, color] of [[-5.28, 0.12, 0xf2c200], [-7.5, 0.12, 0xf2c200], [ONCOMING_X1 + 0.15, 0.12, 0xf1efe6]]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 250), mat(color, 0.8));
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.012, -92);
    group.add(line);
  }

  // --- median kerbs, black and white
  const kerbPositions = [];
  const kerbColors = [0x202326, 0xeee9df];
  for (let i = -4, z = 10; z > -LOOP_FAR; i += 1, z -= 2.9) {
    kerbPositions.push([-5.4, 0.08, z], [-7.0, 0.08, z]);
  }
  // alternating colours need one colour per instance; two instances share a z so pair them
  const kerbRoot = scrollingInstances(group, new THREE.BoxGeometry(0.26, 0.18, 2.84), mat(0xffffff, 0.95),
    kerbPositions.map((p) => [p[0], p[1], p[2]]), 5.8,
    kerbPositions.map((_, i) => kerbColors[Math.floor(i / 2) % 2]));
  roots.push(kerbRoot);

  // --- solar double-arm lamp posts (every 26 m) and tall conical trees (every 13 m, offset)
  const lampPositions = [];
  for (let z = 14; z > -LOOP_FAR; z -= 26) lampPositions.push([MEDIAN_X, 3.6, z]);
  roots.push(scrollingInstances(group, new THREE.CylinderGeometry(0.075, 0.11, 7.2, 8), mat(0x1c2126, 0.7), lampPositions, 26));
  roots.push(scrollingInstances(group, new THREE.BoxGeometry(3.7, 0.07, 0.07), mat(0x1c2126, 0.7),
    lampPositions.map((p) => [p[0], 7.12, p[2]]), 26));
  const panelPositions = [];
  lampPositions.forEach((p) => { panelPositions.push([p[0] - 1.05, 7.3, p[2], 0, 0, 0.1], [p[0] + 1.05, 7.3, p[2], 0, 0, -0.1]); });
  roots.push(scrollingInstances(group, new THREE.BoxGeometry(1.7, 0.06, 0.62), mat(0x1d2f4a, 0.45), panelPositions, 26));

  const treePositions = [];
  for (let z = 7.5; z > -LOOP_FAR; z -= 13) treePositions.push([MEDIAN_X, 2.55, z, 0, 0, 0, 1, 1, 1]);
  roots.push(scrollingInstances(group, new THREE.ConeGeometry(0.7, 4.2, 7), mat(0x2f6b34, 1), treePositions, 13));
  roots.push(scrollingInstances(group, new THREE.CylinderGeometry(0.11, 0.14, 1.2, 6), mat(0x5a4632, 1),
    treePositions.map((p) => [p[0], 0.6, p[2]]), 13));

  // --- oncoming lane dashes (centre of the oncoming carriageway)
  const dashPositions = [];
  for (let z = 6; z > -LOOP_FAR; z -= 8.5) dashPositions.push([ONCOMING_CENTRE, 0.014, z, -Math.PI / 2]);
  roots.push(scrollingInstances(group, new THREE.PlaneGeometry(0.1, 3.4), mat(0xe8e0c8, 0.8), dashPositions, 8.5));

  renderer.world.add(group);
  return { group, roots, asphalt, asphaltMaterial, hasMap: false, frames: 0 };
}

function update(renderer, state, dt) {
  const k = renderer.__kanoTwoWay;
  if (!k) return;
  const signed = Number.isFinite(state?.signedSpeed)
    ? state.signedSpeed
    : state?.reverse ? -Math.abs(Number(state?.speed) || 0) : Math.abs(Number(state?.speed) || 0);
  const scroll = signed * Math.max(0, Math.min(0.05, dt)) * 0.28;
  for (const root of k.roots) {
    const period = root.userData.period;
    root.position.z = (((root.position.z + scroll) % period) + period) % period;
  }
  k.group.visible = renderer.lifeScene === 'road';
  if (!k.hasMap && k.frames < 900) {
    k.frames += 1;
    const road = renderer.world.children.find((c) => c.geometry?.parameters?.width === 10 && c.geometry?.parameters?.height === 250);
    const map = road?.material?.map;
    if (map) {
      const clone = map.clone();
      clone.repeat.set(2.4, 64);
      clone.needsUpdate = true;
      k.asphaltMaterial.map = clone;
      k.asphaltMaterial.color.set(0xffffff);
      k.asphaltMaterial.needsUpdate = true;
      k.hasMap = true;
    }
  }
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype.__kanoTwoWayRoad) {
  Object.defineProperty(Renderer3D.prototype, '__kanoTwoWayRoad', { value: true });
  const draw = Renderer3D.prototype.draw;
  if (typeof draw === 'function') {
    Renderer3D.prototype.draw = function drawWithTwoWayRoad(state, dt, ...rest) {
      try {
        if (!this.__kanoTwoWay && this.world && this.lifeScene === 'road' && !window.kanoOneWayRoad) {
          this.__kanoTwoWay = build(this);
        }
        if (this.__kanoTwoWay) update(this, state, Number(dt) || 0.016);
      } catch (error) {
        console.warn('[Kano Life] Two-way road skipped safely.', error);
        window.kanoOneWayRoad = true;
      }
      return draw.call(this, state, dt, ...rest);
    };
  }
}

export const KANO_TWO_WAY_ROAD = { shift: KANO_LEFT_SHIFT, medianX: MEDIAN_X, oncomingX0: ONCOMING_X0, oncomingX1: ONCOMING_X1 };
