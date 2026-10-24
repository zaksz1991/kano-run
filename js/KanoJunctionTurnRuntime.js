/**
 * Optional runtime bridge for traffic systems that dispatch `kano:traffic-turn`.
 * Event detail: { vehicle, start, end, turn, direction?, radius?, progress? }.
 * vehicle must be a THREE Object3D-like object with position.set and rotation.
 * This bridge deliberately does not guess the game's private traffic loop API.
 */
import { createTurnPath, cubicBezierPoint, cubicBezierTangent, resolveKanoJunction, KANO_JUNCTIONS } from './KanoJunctionTurnRules.js';

const active = new WeakMap();
function applyEvent(event) {
  const d = event?.detail;
  if (!d?.vehicle || typeof d.vehicle.position?.set !== 'function') return;
  const path = createTurnPath(d);
  if (!path) return;
  const progress = Math.max(0, Math.min(1, Number(d.progress) || 0));
  const point = cubicBezierPoint(path.p0,path.p1,path.p2,path.p3,progress);
  const tangent = cubicBezierTangent(path.p0,path.p1,path.p2,path.p3,progress);
  d.vehicle.position.set(point.x,point.y,point.z);
  if (d.vehicle.rotation && Math.hypot(tangent.x,tangent.z) > 1e-6) {
    // Three.js vehicles commonly face local +Z; yaw follows the path tangent.
    d.vehicle.rotation.y = Math.atan2(tangent.x, tangent.z);
  }
  active.set(d.vehicle, { turn:d.turn, progress, junction:d.junction || null });
}
if (typeof window !== 'undefined' && !window.__kanoJunctionTurnRuntimeInstalled) {
  window.addEventListener('kano:traffic-turn', applyEvent);
  window.__kanoJunctionTurnRuntimeInstalled = true;
  window.kanoJunctionTurnAudit = () => ({ installed:true, junctions:KANO_JUNCTIONS.map(({id,name,area})=>({id,name,area})), eventContract:'kano:traffic-turn', note:'Vehicles turn only when the game traffic loop dispatches the event with a vehicle and progress.' });
  window.kanoResolveJunction = resolveKanoJunction;
}
export { applyEvent as applyKanoTrafficTurnEvent };
