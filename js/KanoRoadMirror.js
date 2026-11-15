/**
 * Road edges that match on both sides. The far-left edge (outer side of the oncoming carriageway) now gets the
 * exact same footway, kerb line and shoulder treatment as the driver's right-hand side, so the road reads as one
 * designed, symmetric dual carriageway. The old photo-based sunken underpass walls and pale underpass section
 * are kept out of the road scene: they were the pale grey slabs that made the left side look different.
 * Visual only: lanes, stops, collisions and fares are untouched.
 */
import { Renderer3D } from './renderer3d.js';

const HIDE = /^(KANO_SUNKEN_ROAD_WALLS|KANO_INSTANCED_UNDERPASS)$/;
let frame = 0;

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
      }
    } catch (_) { /* optional */ }
    return draw.apply(this, args);
  };
}
