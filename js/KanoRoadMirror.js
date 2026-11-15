/**
 * Road edges that match on both sides. The far-left edge (outer side of the oncoming carriageway) now gets the
 * exact same footway, kerb line and shoulder treatment as the driver's right-hand side, so the road reads as one
 * designed, symmetric dual carriageway. The old photo-based sunken underpass walls and pale underpass section
 * are kept out of the road scene: they were the pale grey slabs that made the left side look different.
 * Visual only: lanes, stops, collisions and fares are untouched.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const HIDE = /^(KANO_SUNKEN_ROAD_WALLS|KANO_INSTANCED_UNDERPASS|Kano black-white concrete roadside dividers|Kano divider black diagonal stripes)$/;
let frame = 0;
const box = new THREE.Box3();

function mirror(world) {
  const metas = [];
  for (const m of world.children) {
    if (!m.isMesh || !m.geometry?.parameters || !m.material || m.material.isShaderMaterial) continue;
    const p = m.geometry.parameters;
    if (p.height !== 250 && p.depth !== 250) continue;
    metas.push(m);
  }
  for (const left of metas) {
    if (left.position.x >= -1) continue;
    const right = metas.find((r) => r !== left && Math.abs(r.position.x + left.position.x) < 0.2
      && r.geometry.parameters.width === left.geometry.parameters.width
      && r.geometry.parameters.height === left.geometry.parameters.height
      && r.material.color && left.material.color);
    if (!right || left.name === 'KANO_TWO_WAY_ROAD') continue;
    if (!left.material.color.equals(right.material.color) || left.material.map !== right.material.map) {
      left.material = right.material; // share: identical on both sides
    }
  }
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype.__kanoRoadMirror) {
  Object.defineProperty(Renderer3D.prototype, '__kanoRoadMirror', { value: true });
  const draw = Renderer3D.prototype.draw;
  Renderer3D.prototype.draw = function drawWithRoadMirror(...args) {
    try {
      if (this.world) {
        frame += 1;
        for (const child of this.world.children) if (HIDE.test(child.name || '')) child.visible = false;
        if (frame % 30 === 1) mirror(this.world);
        // A flyover ramp that is entirely behind the keke is the dark slab seen under the rear camera: drop it.
        // 'visible' is wrapped so other modules re-showing the group cannot bring the slab back.
        for (const child of this.world.children) {
          if (!/^KWANKWASIYYA_DRIVABLE_APPROACH_/.test(child.name || '')) continue;
          if (!child.userData.kanoVisGuard) {
            let shown = child.visible !== false;
            Object.defineProperty(child, 'visible', {
              configurable: true,
              get() { return shown && !child.userData.kanoBehind; },
              set(v) { shown = !!v; },
            });
            child.userData.kanoVisGuard = true;
          }
          box.setFromObject(child);
          child.userData.kanoBehind = Number.isFinite(box.min.z) && box.min.z > 1.5;
        }
      }
    } catch (_) { /* optional */ }
    return draw.apply(this, args);
  };
}
