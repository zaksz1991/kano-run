/**
 * Kano kerb variety from your road photos: some stretches are painted blue-and-white, others black-and-white.
 * The existing kerb InstancedMesh is recoloured per instance by the road distance it currently sits at,
 * so the style changes every ~3 km and stays stable while you drive. No new geometry.
 */
import * as THREE from 'three';

const UNITS_PER_KM = 1008;
const ZONE_KM = 3;
const BLUE = new THREE.Color(0x1f5fb0);
const BLACK = new THREE.Color(0x202326);
const m = new THREE.Matrix4();
const c = new THREE.Color();

function pass() {
  const R = window.kanoRenderer;
  const g = window.kanoGame;
  const mesh = R?.curbInstanced;
  if (!mesh?.instanceColor || !g?.s) return;
  const dist = Number(g.s.distance) || 0;
  let changed = false;
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getColorAt(i, c);
    const isDark = c.r < 0.2 && c.g < 0.2 && c.b < 0.2;     // black
    const isBlue = c.b > c.r + 0.2;                          // already blue
    if (!isDark && !isBlue) continue;                        // white stays white
    mesh.getMatrixAt(i, m);
    const z = m.elements[14];
    const km = dist + (2 - z) / UNITS_PER_KM;
    const wantBlue = Math.floor(km / ZONE_KM) % 2 === 1;
    if (wantBlue && isDark) { mesh.setColorAt(i, BLUE); changed = true; }
    else if (!wantBlue && isBlue) { mesh.setColorAt(i, BLACK); changed = true; }
  }
  if (changed) mesh.instanceColor.needsUpdate = true;
}

if (typeof window !== 'undefined' && !window.__kanoBlueKerbs) {
  window.__kanoBlueKerbs = true;
  setInterval(() => { if (!document.hidden) { try { pass(); } catch (_) { /* optional */ } } }, 400);
}
