/**
 * Deterministic junction-turn paths and Kano route-location labels.
 * Pure math only: no Three.js dependency and no fabricated GPS coordinates.
 */
export const KANO_JUNCTIONS = Object.freeze([
  { id: 'kofar-mata', name: 'Kofar Mata', area: 'Kano Municipal', turns: ['left', 'straight', 'right'] },
  { id: 'sabongari', name: 'Sabon Gari', area: 'Fagge', turns: ['left', 'straight', 'right'] },
  { id: 'kantin-kwari', name: 'Kantin Kwari', area: 'Kano Municipal', turns: ['left', 'straight', 'right'] },
  { id: 'yankaba', name: 'Yankaba', area: 'Nassarawa', turns: ['left', 'straight', 'right'] },
  { id: 'sharada', name: 'Sharada', area: 'Sharada industrial area', turns: ['left', 'straight', 'right'] },
  { id: 'tarauni', name: 'Tarauni', area: 'Tarauni', turns: ['left', 'straight', 'right'] },
  { id: 'dakata', name: 'Dakata', area: 'Nassarawa', turns: ['left', 'straight', 'right'] },
  { id: 'zoo-road', name: 'Zoo Road', area: 'Nassarawa', turns: ['left', 'straight', 'right'] },
  { id: 'murtala-mohammed-way', name: 'Murtala Mohammed Way', area: 'Kano metropolitan area', turns: ['left', 'straight', 'right'] },
  { id: 'kofar-ruwa', name: 'Kofar Ruwa', area: 'Kano metropolitan area', turns: ['left', 'straight', 'right'] }
]);

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
export function cubicBezierPoint(p0, p1, p2, p3, progress) {
  const t = clamp01(progress), u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    z: u*u*u*(p0.z || 0) + 3*u*u*t*(p1.z || 0) + 3*u*t*t*(p2.z || 0) + t*t*t*(p3.z || 0)
  };
}
export function cubicBezierTangent(p0, p1, p2, p3, progress) {
  const t = clamp01(progress), u = 1 - t;
  const tangent = {
    x: 3*u*u*(p1.x-p0.x) + 6*u*t*(p2.x-p1.x) + 3*t*t*(p3.x-p2.x),
    y: 3*u*u*(p1.y-p0.y) + 6*u*t*(p2.y-p1.y) + 3*t*t*(p3.y-p2.y),
    z: 3*u*u*((p1.z||0)-(p0.z||0)) + 6*u*t*((p2.z||0)-(p1.z||0)) + 3*t*t*((p3.z||0)-(p2.z||0))
  };
  const length = Math.hypot(tangent.x, tangent.y, tangent.z);
  return length > 1e-9 ? { x:tangent.x/length, y:tangent.y/length, z:tangent.z/length } : { x:0, y:0, z:0 };
}
export function createTurnPath({ start, end, turn = 'straight', direction = 1, radius = 3 }) {
  if (!start || !end || !['left','straight','right'].includes(turn)) return null;
  const sign = (turn === 'left' ? 1 : -1) * (direction < 0 ? -1 : 1);
  const dx = end.x - start.x, dz = (end.z || 0) - (start.z || 0);
  if (turn === 'straight') {
    return { p0:{...start}, p1:{x:start.x+dx/3,y:start.y||0,z:(start.z||0)+dz/3}, p2:{x:start.x+2*dx/3,y:end.y||0,z:(start.z||0)+2*dz/3}, p3:{...end} };
  }
  const r = Math.max(0.5, Math.min(12, Math.abs(Number(radius) || 3)));
  // Offset control points from the straight chord to create a smooth quarter-turn.
  const nx = -dz, nz = dx, nlen = Math.hypot(nx,nz) || 1;
  const bendX = (nx/nlen) * r * sign, bendZ = (nz/nlen) * r * sign;
  return {
    p0:{...start},
    p1:{x:start.x+dx/3+bendX*0.35,y:start.y||0,z:(start.z||0)+dz/3+bendZ*0.35},
    p2:{x:start.x+2*dx/3+bendX,y:end.y||0,z:(start.z||0)+2*dz/3+bendZ},
    p3:{...end}
  };
}
export function resolveKanoJunction(idOrName) {
  const key = String(idOrName || '').trim().toLowerCase();
  return KANO_JUNCTIONS.find(item => item.id === key || item.name.toLowerCase() === key) || null;
}
