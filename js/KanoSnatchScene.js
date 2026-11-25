/**
 * Yan Kwacen Waya on screen: a motorbike with two riders closes in beside the keke, matches speed, then
 * either swerves away empty-handed or races off. Cosmetic only; the outcome is decided by KanoStreetGangs.
 */
import * as THREE from 'three';

let scene = null;
let raf = 0;

function clear() {
  cancelAnimationFrame(raf);
  if (scene?.outer?.parent) scene.outer.parent.remove(scene.outer);
  scene = null;
}

function rider(models, key) {
  const m = models.getInstance(key);
  if (!m) return null;
  m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return m;
}

export function showSnatchBike() {
  clear();
  const R = window.kanoRenderer;
  const models = R?.models;
  if (!R?.player || !R?.scene || !models?.getInstance) return;
  const bike = models.getInstance('motorcycle');
  if (!bike) return;
  const group = new THREE.Group();
  group.name = 'KANO_SNATCH_BIKE';
  group.add(bike);
  const side = Math.random() < 0.5 ? -1 : 1;
  const r1 = rider(models, 'passengerMan');
  const r2 = rider(models, 'passengerMan');
  [[r1, 0.62, -0.1], [r2, 0.62, 0.55]].forEach(([r, y, z]) => {
    if (!r) return;
    r.scale.multiplyScalar(0.85);
    r.position.set(0, y - 0.5, z);
    group.add(r);
  });
  // closes in from behind on the passenger's side, riders turn their heads toward the keke
  // lives in the scene (the player group is swapped when the keke model loads) and follows the keke
  const bikeHolder = group;
  const outer = new THREE.Group();
  outer.name = 'KANO_SNATCH_BIKE';
  bikeHolder.name = '';
  bikeHolder.rotation.y = Math.PI;
  outer.add(bikeHolder);
  R.scene.add(outer);
  scene = { group: bikeHolder, outer, side, local: new THREE.Vector3(side * 3.4, 0, 6.5), t0: performance.now(), mode: 'approach', fleeAt: 0, swerve: false };
  const step = () => {
    if (!scene) return;
    const g = scene.group;
    const now = performance.now();
    const P = window.kanoRenderer?.player;
    if (!P) { clear(); return; }
    if (scene.mode === 'approach') {
      const k = Math.min(1, (now - scene.t0) / 2200);
      const e = k * k * (3 - 2 * k);
      scene.local.x = scene.side * (3.4 - 1.5 * e);
      scene.local.z = 6.5 - 6.7 * e;
    } else {
      const k = (now - scene.fleeAt) / 1000;
      scene.local.z -= 0.55 * (1 + k * 2);
      scene.local.x += scene.side * (scene.swerve ? 0.12 : 0.02);
      g.rotation.z = scene.swerve ? scene.side * 0.18 : 0;
      if (k > 3.2) { clear(); return; }
    }
    P.updateWorldMatrix(true, false);
    scene.outer.position.copy(scene.local).applyMatrix4(P.matrixWorld);
    scene.outer.quaternion.setFromRotationMatrix(P.matrixWorld);
    g.position.y = Math.sin(now * 0.02) * 0.012;
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

export function fleeSnatchBike(swerve) {
  if (!scene) return;
  scene.mode = 'flee';
  scene.swerve = !!swerve;
  scene.fleeAt = performance.now();
}
