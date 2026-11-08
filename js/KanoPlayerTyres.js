/**
 * Real, visible black tyres on the player's keke.
 * The keke GLB is baked as one merged mesh with one texture, so its wheels render in body colour and hide
 * under the mudguards. This adds dark rubber tyres with a steel hub at the rear wheels and a front wheel,
 * sized from the model's own bounds, and spins them with the road speed. A flat tyre sags and wobbles.
 */
import * as THREE from 'three';

function build(player) {
  player.updateMatrixWorld(true);
  const wp = new THREE.Vector3(); player.getWorldPosition(wp);
  const ws = new THREE.Vector3(); player.getWorldScale(ws);
  const box = new THREE.Box3().setFromObject(player);
  if (box.isEmpty()) return null;
  const minX = (box.min.x - wp.x) / ws.x, maxX = (box.max.x - wp.x) / ws.x;
  const minZ = (box.min.z - wp.z) / ws.z, maxZ = (box.max.z - wp.z) / ws.z;
  const halfW = Math.min(0.95, Math.max(0.5, (maxX - minX) / 2));
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.95, metalness: 0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.5, metalness: 0.5 });
  const group = new THREE.Group();
  group.name = 'KANO_PLAYER_TYRES';
  const wheels = [];
  const make = (x, z, r, w) => {
    const spin = new THREE.Group();
    spin.position.set(x, r, z);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), rubber);
    tyre.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 10), steel);
    hub.rotation.z = Math.PI / 2;
    const lug = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, r * 0.18, r * 1.7), steel); // makes the spin visible
    spin.add(tyre, hub, lug);
    group.add(spin);
    wheels.push({ spin, x, rest: r });
    return spin;
  };
  const r = 0.29; const w = 0.19;
  const rearZ = maxZ - 0.5; const frontZ = minZ + 0.5;
  make(-(halfW - w / 2 + 0.02), rearZ, r, w);
  make(halfW - w / 2 - 0.02 + 0.04, rearZ, r, w);
  make(0, frontZ, 0.25, 0.14);
  player.add(group);
  player.userData.kanoTyres = { group, wheels, flatSide: null };
  return player.userData.kanoTyres;
}

if (typeof window !== 'undefined' && !window.__kanoPlayerTyres) {
  window.__kanoPlayerTyres = true;
  setInterval(() => {
    try {
      const R = window.kanoRenderer;
      const p = R?.player;
      if (!p || p.userData?.kanoTyres) return;
      if ((p.userData?.driverAnimationParts?.wheels || []).length) return; // procedural keke already has wheels
      let meshes = 0; p.traverse((o) => { if (o.isMesh) meshes += 1; });
      if (meshes < 3) return;
      build(p);
    } catch (_) { /* optional */ }
  }, 800);
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try {
      const t = window.kanoRenderer?.player?.userData?.kanoTyres;
      const s = window.kanoGame?.s;
      if (t && s) {
        const v = Number.isFinite(s.signedSpeed) ? s.signedSpeed : s.speed || 0;
        const flat = !!s.flatTyre;
        t.wheels.forEach((wh, i) => {
          wh.spin.rotation.x += (v / 3.6) * dt / (wh.rest || 0.27);
          const sag = flat && ((s.flatSide === -1 && i === 0) || (s.flatSide === 1 && i === 1)) ? 0.45 : 1;
          wh.spin.scale.y = wh.spin.scale.z = sag;
          wh.spin.position.y = (wh.rest || 0.27) * sag;
        });
      }
    } catch (_) { /* optional */ }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
