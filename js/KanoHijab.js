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
  const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.19, 0.22, 16, 1, true), cloth);
  drape.position.set(0, -0.135, -0.02);
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
}
