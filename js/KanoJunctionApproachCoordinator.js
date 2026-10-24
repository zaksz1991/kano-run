/** Task 31: explicit junction approach coordinator.
 * Does not guess the game's lane coordinates. The traffic owner registers its
 * actual vehicle object, route choice, and junction scene-space geometry.
 */
import { dispatchKanoTrafficTurn, cancelKanoTrafficTurn } from './KanoTrafficTurnDispatch.js';

const registrations = new WeakMap();
const validTurns = new Set(['left', 'straight', 'right']);
const point = p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y ?? 0)) && Number.isFinite(Number(p.z ?? 0));
const distXZ = (a,b) => Math.hypot(Number(a.x)-Number(b.x), Number(a.z ?? 0)-Number(b.z ?? 0));

export function registerKanoJunctionApproach({ vehicle, junctionId, trigger, start, end, turn, durationMs = 1400, onComplete } = {}) {
  if (!vehicle || typeof vehicle.position?.set !== 'function') return { ok:false, reason:'vehicle-invalid' };
  if (typeof junctionId !== 'string' || !junctionId.trim()) return { ok:false, reason:'junction-id-required' };
  if (!point(trigger) || !point(start) || !point(end)) return { ok:false, reason:'scene-coordinates-required' };
  if (!validTurns.has(turn)) return { ok:false, reason:'turn-invalid' };
  if (distXZ(start,end) < 0.25) return { ok:false, reason:'turn-path-too-short' };
  registrations.set(vehicle, { vehicle, junctionId:junctionId.trim(), trigger:{x:Number(trigger.x),y:Number(trigger.y ?? 0),z:Number(trigger.z ?? 0)}, start:{x:Number(start.x),y:Number(start.y ?? 0),z:Number(start.z ?? 0)}, end:{x:Number(end.x),y:Number(end.y ?? 0),z:Number(end.z ?? 0)}, turn, durationMs, onComplete, dispatched:false });
  return { ok:true, reason:'approach-registered', junctionId:junctionId.trim() };
}

/** Call from the owning traffic update using the same scene-space vehicle position. */
export function updateKanoJunctionApproach(vehicle, { triggerRadius = 3.5 } = {}) {
  const r = vehicle && registrations.get(vehicle);
  if (!r) return { ok:false, reason:'approach-not-registered' };
  if (r.dispatched) return { ok:true, reason:'turn-already-dispatched', junctionId:r.junctionId };
  const p = vehicle.position;
  if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) return { ok:false, reason:'vehicle-position-invalid' };
  const radius = Number(triggerRadius);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 50) return { ok:false, reason:'trigger-radius-invalid' };
  if (distXZ(p,r.trigger) > radius) return { ok:true, reason:'approaching', junctionId:r.junctionId };
  const result = dispatchKanoTrafficTurn({ vehicle, start:r.start, end:r.end, turn:r.turn, junction:r.junctionId, durationMs:r.durationMs });
  if (!result.dispatched) return { ok:false, reason:result.reason, junctionId:r.junctionId };
  r.dispatched = true;
  // Completion is surfaced by the runtime's event-independent callback contract only
  // when the traffic loop handles its own completion; do not fake completion here.
  if (typeof r.onComplete === 'function') vehicle.userData && (vehicle.userData.kanoTurnCompleteCallback = r.onComplete);
  return { ok:true, reason:'turn-dispatched', junctionId:r.junctionId, turn:r.turn };
}

export function cancelKanoJunctionApproach(vehicle) {
  if (!vehicle || !registrations.has(vehicle)) return { ok:false, reason:'approach-not-registered' };
  registrations.delete(vehicle);
  return cancelKanoTrafficTurn(vehicle);
}

export function installKanoJunctionApproachAudit(target = globalThis.window) {
  if (!target) return false;
  target.kanoJunctionApproachAudit = () => ({ installed:true, integration:'traffic owner must call updateKanoJunctionApproach(vehicle) each update', coordinateSource:'explicit registration only', triggerDistanceDefault:3.5, autoInventedCoordinates:false, activeRegistrations:'WeakMap (not enumerable)' });
  return true;
}
if (typeof window !== 'undefined') installKanoJunctionApproachAudit(window);
