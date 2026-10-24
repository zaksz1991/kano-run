/**
 * Task 29: time-based junction turn controller.
 * Dispatch window event `kano:traffic-turn-start` with detail:
 * { vehicle, start:{x,y,z}, end:{x,y,z}, turn:'left'|'straight'|'right',
 *   durationMs?:number, radius?:number, direction?:number, junction?:string }
 * A turn animates over durationMs using requestAnimationFrame. This bridge
 * still requires the game's traffic loop to dispatch the start event at a
 * suitable junction and supply real scene-space endpoints.
 */
import { createTurnPath, cubicBezierPoint, cubicBezierTangent, resolveKanoJunction, KANO_JUNCTIONS } from './KanoJunctionTurnRules.js';

const activeTurns = new WeakMap();
let installed = false;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finitePoint = p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y ?? 0)) && Number.isFinite(Number(p.z ?? 0));
function setVehiclePose(vehicle, path, progress) {
  const p = cubicBezierPoint(path.p0, path.p1, path.p2, path.p3, progress);
  const t = cubicBezierTangent(path.p0, path.p1, path.p2, path.p3, progress);
  vehicle.position.set(p.x, p.y, p.z);
  if (vehicle.rotation && Math.hypot(t.x, t.z) > 1e-7) vehicle.rotation.y = Math.atan2(t.x, t.z);
}
function stopTurn(vehicle, reason = 'cancelled') {
  const turn = activeTurns.get(vehicle);
  if (!turn) return false;
  turn.cancelled = true;
  if (turn.rafId != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(turn.rafId);
  activeTurns.delete(vehicle);
  turn.onFinish?.({ vehicle, reason, junction: turn.junction });
  return true;
}
function startTurnEvent(event) {
  const d = event?.detail;
  if (!d?.vehicle || typeof d.vehicle.position?.set !== 'function' || !finitePoint(d.start) || !finitePoint(d.end)) return false;
  const path = createTurnPath({ start:d.start, end:d.end, turn:d.turn || 'straight', direction:d.direction, radius:d.radius });
  if (!path) return false;
  stopTurn(d.vehicle, 'replaced');
  const durationMs = clamp(Number(d.durationMs) || 1400, 250, 10000);
  const turn = { vehicle:d.vehicle, path, startedAt:null, durationMs, rafId:null, cancelled:false, junction:d.junction || null, onFinish:typeof d.onFinish === 'function' ? d.onFinish : null };
  activeTurns.set(d.vehicle, turn);
  const requestFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : cb => setTimeout(() => cb(Date.now()), 16);
  const tick = timestamp => {
    if (turn.cancelled || activeTurns.get(d.vehicle) !== turn) return;
    if (turn.startedAt === null) turn.startedAt = Number(timestamp) || Date.now();
    const now = Number(timestamp) || Date.now();
    const raw = clamp((now - turn.startedAt) / turn.durationMs, 0, 1);
    // Smoothstep keeps the turn gentle at both ends while preserving endpoints.
    const eased = raw * raw * (3 - 2 * raw);
    setVehiclePose(d.vehicle, path, eased);
    if (raw >= 1) {
      activeTurns.delete(d.vehicle);
      turn.onFinish?.({ vehicle:d.vehicle, reason:'completed', junction:turn.junction });
      return;
    }
    turn.rafId = requestFrame(tick);
  };
  turn.rafId = requestFrame(tick);
  return true;
}
function install() {
  if (installed || typeof window === 'undefined') return;
  window.addEventListener('kano:traffic-turn-start', startTurnEvent);
  window.addEventListener('kano:traffic-turn-cancel', event => { if (event?.detail?.vehicle) stopTurn(event.detail.vehicle); });
  window.kanoJunctionTurnAudit = () => ({ installed:true, activeTurnTracking:'WeakMap (not enumerable)', junctions:KANO_JUNCTIONS.map(({id,name,area})=>({id,name,area})), startEvent:'kano:traffic-turn-start', cancelEvent:'kano:traffic-turn-cancel', note:'The game traffic loop must dispatch start events with actual scene-space endpoints.' });
  window.kanoResolveJunction = resolveKanoJunction;
  installed = true;
}
install();
export { startTurnEvent as startKanoTrafficTurn, stopTurn as cancelKanoTrafficTurn, setVehiclePose };
