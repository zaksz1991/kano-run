/**
 * Task 30: validated dispatch helpers for the Task 29 turn runtime.
 * This module does not guess scene coordinates or intercept the game's traffic loop.
 * The real traffic controller must call dispatchKanoTrafficTurn once at junction entry.
 */
const VALID_TURNS = new Set(['left', 'straight', 'right']);
const finite = n => Number.isFinite(Number(n));
function point(p) {
  return !!p && finite(p.x) && finite(p.y ?? 0) && finite(p.z ?? 0);
}
export function validateKanoTrafficTurnRequest(request) {
  if (!request || typeof request !== 'object') return { ok: false, reason: 'request-missing' };
  if (!request.vehicle || typeof request.vehicle.position?.set !== 'function') return { ok: false, reason: 'vehicle-must-have-position-set' };
  if (!point(request.start) || !point(request.end)) return { ok: false, reason: 'scene-space-endpoints-invalid' };
  if (!VALID_TURNS.has(request.turn)) return { ok: false, reason: 'turn-must-be-left-straight-or-right' };
  const distance = Math.hypot(Number(request.end.x)-Number(request.start.x), Number(request.end.y ?? 0)-Number(request.start.y ?? 0), Number(request.end.z ?? 0)-Number(request.start.z ?? 0));
  if (distance < 0.25) return { ok: false, reason: 'endpoints-too-close' };
  const durationMs = Math.max(250, Math.min(10000, Math.round(Number(request.durationMs) || 1400)));
  return { ok: true, reason: 'valid', distance, durationMs };
}
export function dispatchKanoTrafficTurn(request, target = globalThis.window) {
  const validation = validateKanoTrafficTurnRequest(request);
  if (!validation.ok) return { ...validation, dispatched: false };
  if (!target || typeof target.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') {
    return { ok: false, reason: 'browser-event-target-unavailable', dispatched: false };
  }
  const detail = { ...request, durationMs: validation.durationMs };
  target.dispatchEvent(new CustomEvent('kano:traffic-turn-start', { detail }));
  return { ...validation, dispatched: true };
}
export function cancelKanoTrafficTurn(vehicle, target = globalThis.window) {
  if (!vehicle) return { ok: false, reason: 'vehicle-missing', dispatched: false };
  if (!target || typeof target.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') {
    return { ok: false, reason: 'browser-event-target-unavailable', dispatched: false };
  }
  target.dispatchEvent(new CustomEvent('kano:traffic-turn-cancel', { detail: { vehicle } }));
  return { ok: true, reason: 'cancel-dispatched', dispatched: true };
}
export function installKanoTrafficTurnDispatchAudit(target = globalThis.window) {
  if (!target) return false;
  target.kanoTrafficTurnDispatchAudit = () => ({
    installed: true,
    startEvent: 'kano:traffic-turn-start',
    cancelEvent: 'kano:traffic-turn-cancel',
    validation: ['vehicle.position.set', 'finite scene-space endpoints', 'left/straight/right', 'minimum 0.25 scene-unit separation'],
    durationMs: { default: 1400, min: 250, max: 10000 },
    integrationStatus: 'helper installed; existing traffic loop must call dispatchKanoTrafficTurn at junction entry',
    doesNotInventCoordinates: true
  });
  return true;
}
if (typeof window !== 'undefined') installKanoTrafficTurnDispatchAudit(window);
