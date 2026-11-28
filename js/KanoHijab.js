import * as THREE from 'three';

// Kano women wear the hijab: a soft low-poly head wrap and shoulder drape, bound to the head bone so it
// follows every animation. Built in world scale at the rest pose, then re-expressed in the bone's space.
export function addHijab(root) {
  let head = null;
  root.traverse((o) => { if (!head && o.isBone && /head/i.test(o.name) && !/headtop|end/i.test(o.name)) head = o; });
  if (!head || head.userData.kanoHijab) return;
  root.updateMatrixWorld(true);
  const colour = 0xb5576b;
  const cloth = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const g = new THREE.Group();
  g.name = 'KANO_HIJAB';
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12, Math.PI / 2 + 0.78, Math.PI * 2 - 1.56, 0, Math.PI * 0.8), cloth);
  dome.scale.set(1, 1.1, 1.08);
  dome.position.set(0, 0.062, -0.012);
  const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.31, 1.02, 16, 1, true), cloth);
  drape.position.set(0, -0.56, -0.02);   // long khimar: hangs past the hips so the top underneath is covered
  const chin = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.03, 8, 18, Math.PI), cloth);
  chin.position.set(0, 0.02, 0.0);
  chin.rotation.set(Math.PI / 2, 0, Math.PI);
  g.add(dome, drape);
  // place at the head bone's rest position in model (world) space, upright, then convert into bone space
  const wp = new THREE.Vector3();
  head.getWorldPosition(wp);
  const wq = new THREE.Quaternion();
  root.getWorldQuaternion(wq);
  const desired = new THREE.Matrix4().compose(wp, wq, new THREE.Vector3(1, 1, 1));
  const local = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(desired);
  g.applyMatrix4(local);
  head.add(g);
  head.userData.kanoHijab = true;
  // Long skirt (hijab women in Kano wear a skirt, not trousers): hangs from the hip to the calf, parented to the model root.
  try {
    const box = new THREE.Box3().setFromObject(root);
    const feet = root.worldToLocal(new THREE.Vector3(0, box.min.y, 0)).y;
    const top = root.worldToLocal(new THREE.Vector3(0, box.max.y, 0)).y;
    const H = Math.max(0.5, top - feet);
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * H / 1.7, 0.25 * H / 1.7, 0.86 * H / 1.7, 18, 1, true), skirtMat);
    skirt.name = 'KANO_SKIRT';
    skirt.position.set(0, feet + 0.51 * H / 1.7, 0);
    root.add(skirt);
  } catch { /* cosmetic */ }
}

// Hausa men in Kano wear a long flowing kaftan (babban riga) and a embroidered cap (hula). Layered over the supplied
// man model (shirt and trousers stay underneath); the robe colour is picked per instance in ModelManager.getInstance.
export function addHausaWear(root) {
  root.updateMatrixWorld(true);
  if (root.getObjectByName('KANO_ROBE')) return;
  const box = new THREE.Box3().setFromObject(root);
  const feet = root.worldToLocal(new THREE.Vector3(0, box.min.y, 0)).y;
  const top = root.worldToLocal(new THREE.Vector3(0, box.max.y, 0)).y;
  const H = Math.max(0.5, top - feet);
  const k = H / 1.7;
  const robeMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.205 * k, 0.30 * k, 1.12 * k, 18, 1, true), robeMat);
  robe.name = 'KANO_ROBE';
  robe.scale.z = 0.82;
  robe.position.set(0, feet + 0.06 * k + 0.56 * k, 0);
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * k, 0.205 * k, 0.1 * k, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x2e5d4b, roughness: 0.8, side: THREE.DoubleSide }));
  yoke.name = 'KANO_ROBE_TRIM';
  yoke.scale.z = 0.82;
  yoke.position.set(0, feet + 0.06 * k + 1.12 * k - 0.04 * k, 0);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.098 * k, 0.108 * k, 0.15 * k, 16), new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.85 }));
  cap.name = 'KANO_HULA';
  cap.position.set(0, top - 0.055 * k, 0);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * k, 0.1 * k, 0.03 * k, 16), new THREE.MeshStandardMaterial({ color: 0x2e5d4b, roughness: 0.8 }));
  band.position.set(0, top - 0.105 * k, 0);
  root.add(robe, yoke, cap, band);
}
