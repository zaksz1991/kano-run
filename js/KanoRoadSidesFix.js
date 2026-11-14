/**
 * Road sides that match real Kano roads. The wide tan sand bands either side of the
 * asphalt read as fat yellow stripes. In the reference photos the strip beside the
 * median is planted (green) and the outer verge is pale paving / concrete, with only a
 * thin painted edge line. Colours only; positions, sizes and collisions are unchanged.
 */
import * as THREE from 'three';

const COLOURS = {
  KANO_LEFT_SAND_VERGE: 0xb59f78,   // dry earth median top, as in the photos
  KANO_RIGHT_SAND_VERGE: 0x9b9a92,  // paved footway
};
const DONE = new Set();

function sweep() {
  const R = window.__KANO_ACTIVE_RENDERER__;
  if (!R?.world) return;
  for (const [name, hex] of Object.entries(COLOURS)) {
    if (DONE.has(name)) continue;
    const mesh = R.world.getObjectByName(name);
    if (!mesh?.material) continue;
    mesh.material = mesh.material.clone();
    mesh.material.color = new THREE.Color(hex);
    if (mesh.material.map) mesh.material.map = null;
    mesh.material.needsUpdate = true;
    DONE.add(name);
  }
}
if (typeof window !== 'undefined') window.setInterval(sweep, 1000);
