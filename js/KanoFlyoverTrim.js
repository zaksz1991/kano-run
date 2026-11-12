/**
 * Painted flyover parapets, from the player's photos of Kano flyovers: red-and-white on some,
 * green-and-white on others. Alternating painted blocks sit along both outer edges of the
 * flyover deck and follow its climb. Visual only (one batched draw call per flyover).
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { KANO_FLYOVER_SITES } from './KanoFlyoverRoundaboutUpgrade.js';

const PATCH = Symbol.for('kano.life.flyoverTrim.v1');
const HALF = 150;
const STEP = 3;
const DECK_CENTER_X = 1.8;
const EDGE_X = 4.05;      // block centre, inside the deck's outer edge
const RED = [0xb3262e, 0xf4efe2];
const GREEN = [0x1f7a3d, 0xf4efe2];
const RED_SITES = /KOFAR MATA|DAN AGUNDI|MURTALA|BUK/;

function paletteFor(renderer, record) {
  const key = renderer.__kanoFlyoverSiteKey;
  const title = KANO_FLYOVER_SITES[key]?.title || '';
  if (title) return RED_SITES.test(title) ? RED : GREEN;
  return record.index % 2 === 0 ? RED : GREEN;
}

function heightAt(profile, z) {
  const f = Math.max(0, Math.min(profile.length - 1.001, z + HALF));
  const i = Math.floor(f);
  const t = f - i;
  return profile[i] * (1 - t) + profile[i + 1] * t;
}

function addTrim(renderer, record) {
  const profile = record.profile;
  const count = Math.floor((HALF * 2) / STEP) * 2;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  material.userData = { kanoNoShift: true };
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.62, STEP), material, count);
  mesh.name = 'KANO_INSTANCED_FLYOVER_PARAPET_TRIM';
  mesh.frustumCulled = false;
  const colours = paletteFor(renderer, record).map((c) => new THREE.Color(c));
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let z = -HALF + STEP / 2; z < HALF - STEP / 2 && n < count; z += STEP) {
    const y0 = heightAt(profile, z - STEP / 2);
    const y1 = heightAt(profile, z + STEP / 2);
    const y = (y0 + y1) / 2;
    const pitch = Math.atan2(y1 - y0, STEP);   // z grows toward the camera, so a rising road slopes toward -z
    for (const side of [-1, 1]) {
      dummy.position.set(DECK_CENTER_X + side * EDGE_X, y + 0.3, z);
      dummy.rotation.set(-pitch, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, colours[Math.round((z + HALF) / STEP) % 2]);
      n += 1;
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  record.group.add(mesh);
  // Continuous concrete cap on top of the painted wall, and hide the older duplicate block rail on the same edge.
  const capMat = new THREE.MeshLambertMaterial({ color: 0xb9bdc0 });
  capMat.userData = { kanoNoShift: true };
  const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.08, STEP), capMat, count);
  cap.name = 'KANO_FLYOVER_PARAPET_CAP';
  cap.frustumCulled = false;
  let m = 0;
  for (let z = -HALF + STEP / 2; z < HALF - STEP / 2 && m < count; z += STEP) {
    const y0 = heightAt(profile, z - STEP / 2);
    const y1 = heightAt(profile, z + STEP / 2);
    const pitch = Math.atan2(y1 - y0, STEP);
    for (const side of [-1, 1]) {
      dummy.position.set(DECK_CENTER_X + side * EDGE_X, (y0 + y1) / 2 + 0.64, z);
      dummy.rotation.set(-pitch, 0, 0);
      dummy.updateMatrix();
      cap.setMatrixAt(m, dummy.matrix);
      m += 1;
    }
  }
  cap.count = m;
  cap.instanceMatrix.needsUpdate = true;
  record.group.add(cap);
  record.group.traverse((o) => { if (o.userData?.kanoFlyoverSideParapets) o.visible = false; });
  record.trimmed = true;
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype[PATCH]) {
  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true });
  const draw = Renderer3D.prototype.draw;
  let last = 0;
  if (typeof draw === 'function') {
    Renderer3D.prototype.draw = function drawWithFlyoverTrim(...args) {
      const now = performance.now();
      if (now - last > 1000) {
        last = now;
        try {
          for (const record of this.kanoFlyoverApproachRecords || []) {
            if (record.glbSkinned && record.profile && !record.trimmed) addTrim(this, record);
          }
        } catch (error) { console.warn('[Kano Life] Flyover trim skipped safely.', error); }
      }
      return draw.apply(this, args);
    };
  }
}
