// ============================================================
// KANO LIFE — PERSISTENT KEKE MAINTENANCE & ROADWORTHINESS
// Vehicle condition is tied to the existing game's condition/engine/tyres
// telemetry. Service charges go through the existing career wallet API.
// ============================================================

export const VEHICLE_MAINTENANCE_STORAGE_KEY = 'kano-life-vehicle-maintenance-v1';
export const MAINTENANCE_SERVICES = Object.freeze({
  tyres: Object.freeze({ id: 'tyres', label: 'Tyre service', cost: 450, boosts: Object.freeze({ tyres: 35 }), description: 'Repair or replace worn tyres.' }),
  engine: Object.freeze({ id: 'engine', label: 'Engine tune-up and oil service', cost: 650, boosts: Object.freeze({ engine: 35 }), description: 'Improve engine condition before another shift.' }),
  condition: Object.freeze({ id: 'condition', label: 'General mechanical service', cost: 500, boosts: Object.freeze({ condition: 35 }), description: 'Improve general vehicle condition.' }),
  full: Object.freeze({ id: 'full', label: 'Full service package', cost: 1250, boosts: Object.freeze({ condition: 25, engine: 25, tyres: 25 }), description: 'A game-balanced combined service.' }),
});

const MAX_LEDGER = 40;
const CHECK_VALUES = new Set(['not_checked', 'ok', 'attention', 'urgent']);
const COMPONENT_KEYS = ['condition', 'engine', 'tyres'];
const MANUAL_KEYS = ['brakes', 'steering', 'lights', 'horn'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const amount = value => Math.round(clamp(value, 0, 100_000_000));
const safeDay = value => Math.round(clamp(value, 1, 999999));
const safeText = (value, max = 100) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));
const finitePercent = value => value != null && value !== '' && Number.isFinite(Number(value)) ? clamp(Number(value), 0, 100) : null;
const percentOr = (value, fallback) => finitePercent(value) ?? fallback;

export function defaultVehicleMaintenanceState() {
  return {
    version: 1,
    vehicle: { condition: 100, engine: 100, tyres: 100 },
    manualChecks: { brakes: 'not_checked', steering: 'not_checked', lights: 'not_checked', horn: 'not_checked' },
    inspectionCount: 0,
    lastInspectionDay: null,
    lastServiceDay: null,
    serviceHistory: [],
    inspectionHistory: [],
    shiftHistory: [],
    lastRunId: '',
    unsafeShiftStarts: 0,
  };
}

export function sanitizeVehicleMaintenanceState(input = {}) {
  const fresh = defaultVehicleMaintenanceState();
  const row = input && typeof input === 'object' ? input : {};
  const vehicle = row.vehicle && typeof row.vehicle === 'object' ? row.vehicle : {};
  const checks = row.manualChecks && typeof row.manualChecks === 'object' ? row.manualChecks : {};
  fresh.vehicle = Object.fromEntries(COMPONENT_KEYS.map(key => [key, Math.round(percentOr(vehicle[key], fresh.vehicle[key]))]));
  fresh.manualChecks = Object.fromEntries(MANUAL_KEYS.map(key => [key, CHECK_VALUES.has(checks[key]) ? checks[key] : 'not_checked']));
  fresh.inspectionCount = Math.max(0, Math.floor(Number(row.inspectionCount) || 0));
  fresh.lastInspectionDay = row.lastInspectionDay != null && Number.isFinite(Number(row.lastInspectionDay)) ? safeDay(row.lastInspectionDay) : null;
  fresh.lastServiceDay = row.lastServiceDay != null && Number.isFinite(Number(row.lastServiceDay)) ? safeDay(row.lastServiceDay) : null;
  fresh.serviceHistory = Array.isArray(row.serviceHistory) ? row.serviceHistory.filter(x => x && typeof x === 'object').slice(-MAX_LEDGER).map(x => ({
    id: safeText(x.id, 100), serviceId: Object.hasOwn(MAINTENANCE_SERVICES, x.serviceId) ? x.serviceId : 'condition',
    day: safeDay(x.day), cost: amount(x.cost), at: safeText(x.at, 40),
    vehicleAfter: Object.fromEntries(COMPONENT_KEYS.map(key => [key, Math.round(percentOr(x.vehicleAfter?.[key], fresh.vehicle[key]))])),
  })) : [];
  fresh.inspectionHistory = Array.isArray(row.inspectionHistory) ? row.inspectionHistory.filter(x => x && typeof x === 'object').slice(-MAX_LEDGER).map(x => ({
    day: safeDay(x.day), status: ['roadworthy', 'attention', 'critical', 'inspection_required'].includes(x.status) ? x.status : 'inspection_required',
    vehicle: Object.fromEntries(COMPONENT_KEYS.map(key => [key, Math.round(percentOr(x.vehicle?.[key], fresh.vehicle[key]))])),
    manualChecks: Object.fromEntries(MANUAL_KEYS.map(key => [key, CHECK_VALUES.has(x.manualChecks?.[key]) ? x.manualChecks[key] : 'not_checked'])),
    at: safeText(x.at, 40),
  })) : [];
  fresh.shiftHistory = Array.isArray(row.shiftHistory) ? row.shiftHistory.filter(x => x && typeof x === 'object').slice(-MAX_LEDGER).map(x => ({
    runId: safeText(x.runId, 120), day: safeDay(x.day), statusAtStart: ['roadworthy', 'attention', 'critical', 'inspection_required'].includes(x.statusAtStart) ? x.statusAtStart : 'inspection_required',
    vehicleAfter: Object.fromEntries(COMPONENT_KEYS.map(key => [key, Math.round(percentOr(x.vehicleAfter?.[key], fresh.vehicle[key]))])), at: safeText(x.at, 40),
  })) : [];
  fresh.lastRunId = safeText(row.lastRunId, 120);
  fresh.unsafeShiftStarts = Math.max(0, Math.floor(Number(row.unsafeShiftStarts) || 0));
  return fresh;
}

export function loadVehicleMaintenanceState(storage = globalThis.localStorage ?? null) {
  try {
    const raw = storage?.getItem(VEHICLE_MAINTENANCE_STORAGE_KEY);
    if (!raw) return defaultVehicleMaintenanceState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return defaultVehicleMaintenanceState();
    return sanitizeVehicleMaintenanceState(parsed);
  } catch { return defaultVehicleMaintenanceState(); }
}

export function saveVehicleMaintenanceState(input, storage = globalThis.localStorage ?? null) {
  const state = sanitizeVehicleMaintenanceState(input);
  try {
    if (!storage) return { ok: false, reason: 'storage_unavailable', state };
    storage.setItem(VEHICLE_MAINTENANCE_STORAGE_KEY, JSON.stringify(state));
    return { ok: true, state };
  } catch { return { ok: false, reason: 'storage_unavailable', state }; }
}

export function readVehicleTelemetry(gameState = {}, fallbackState = defaultVehicleMaintenanceState()) {
  const s = gameState && typeof gameState === 'object' ? gameState : {};
  const fallback = sanitizeVehicleMaintenanceState(fallbackState).vehicle;
  return Object.fromEntries(COMPONENT_KEYS.map(key => [key, finitePercent(s[key]) ?? fallback[key]]));
}

function metricStatus(value) {
  if (value < 35) return 'critical';
  if (value < 65) return 'attention';
  return 'good';
}

export function assessVehicleRoadworthiness(input = {}, { day = 1, requireToday = true } = {}) {
  const state = sanitizeVehicleMaintenanceState(input);
  const statuses = COMPONENT_KEYS.map(key => metricStatus(state.vehicle[key]));
  const manualValues = MANUAL_KEYS.map(key => state.manualChecks[key]);
  const hasUrgentManual = manualValues.includes('urgent');
  const hasAttentionManual = manualValues.includes('attention');
  const hasUncheckedManual = manualValues.some(value => value === 'not_checked');
  const coreCritical = statuses.includes('critical');
  const coreAttention = statuses.includes('attention');
  let status = 'roadworthy';
  if (coreCritical || hasUrgentManual) status = 'critical';
  else if (coreAttention || hasAttentionManual) status = 'attention';
  else if (hasUncheckedManual || (requireToday && state.lastInspectionDay !== safeDay(day))) status = 'inspection_required';
  return {
    status,
    vehicle: { ...state.vehicle },
    manualChecks: { ...state.manualChecks },
    outstandingManualChecks: MANUAL_KEYS.filter(key => state.manualChecks[key] !== 'ok'),
    criticalMetrics: COMPONENT_KEYS.filter(key => metricStatus(state.vehicle[key]) === 'critical'),
    attentionMetrics: COMPONENT_KEYS.filter(key => metricStatus(state.vehicle[key]) === 'attention'),
    inspectionCurrent: state.lastInspectionDay === safeDay(day),
    canStartShiftWithoutCriticalWarning: status !== 'critical',
  };
}

export function recordVehicleInspection(input, { day = 1, gameState = {}, manualChecks = {}, now = () => Date.now() } = {}) {
  const state = sanitizeVehicleMaintenanceState(input);
  state.vehicle = readVehicleTelemetry(gameState, state);
  for (const key of MANUAL_KEYS) if (CHECK_VALUES.has(manualChecks[key])) state.manualChecks[key] = manualChecks[key];
  state.lastInspectionDay = safeDay(day);
  state.inspectionCount += 1;
  const assessment = assessVehicleRoadworthiness(state, { day, requireToday: true });
  const at = new Date(now()).toISOString();
  state.inspectionHistory.push({ day: safeDay(day), status: assessment.status, vehicle: { ...state.vehicle }, manualChecks: { ...state.manualChecks }, at });
  state.inspectionHistory = state.inspectionHistory.slice(-MAX_LEDGER);
  return { state, assessment, inspection: state.inspectionHistory.at(-1) };
}

export function recordVehicleService(input, { serviceId, day = 1, now = () => Date.now() } = {}) {
  const state = sanitizeVehicleMaintenanceState(input);
  const service = Object.hasOwn(MAINTENANCE_SERVICES, serviceId) ? MAINTENANCE_SERVICES[serviceId] : null;
  if (!service || !service.boosts || typeof service.boosts !== 'object') return { ok: false, reason: 'unknown_service', state };
  for (const [key, boost] of Object.entries(service.boosts)) state.vehicle[key] = Math.round(clamp(state.vehicle[key] + boost, 0, 100));
  state.lastServiceDay = safeDay(day);
  state.lastInspectionDay = null; // Service requires a fresh manual roadworthiness check.
  const record = {
    id: `${now().toString(36)}-${serviceId}`,
    serviceId,
    day: safeDay(day),
    cost: service.cost,
    at: new Date(now()).toISOString(),
    vehicleAfter: { ...state.vehicle },
  };
  state.serviceHistory.push(record);
  state.serviceHistory = state.serviceHistory.slice(-MAX_LEDGER);
  return { ok: true, state, service: record, assessment: assessVehicleRoadworthiness(state, { day, requireToday: true }) };
}

export function applyPersistentVehicleState(gameState, input) {
  if (!gameState || typeof gameState !== 'object') return false;
  const state = sanitizeVehicleMaintenanceState(input);
  for (const key of COMPONENT_KEYS) {
    if (Number.isFinite(Number(gameState[key]))) gameState[key] = state.vehicle[key];
  }
  return true;
}

/** Persist the live game's final condition values after a run; no financial effects. */
export function recordVehicleShiftEnd(input, { gameState = {}, day = 1, runId = '', now = () => Date.now() } = {}) {
  const state = sanitizeVehicleMaintenanceState(input);
  const validRunId = safeText(runId, 120);
  const vehicleAfter = readVehicleTelemetry(gameState, state);
  state.vehicle = vehicleAfter;
  if (!validRunId) return { state, recorded: false, reason: 'run_id_missing' };
  const existingIndex = state.shiftHistory.findIndex(row => row.runId === validRunId);
  const record = {
    runId: validRunId, day: safeDay(day), statusAtStart: existingIndex >= 0 ? state.shiftHistory[existingIndex].statusAtStart : 'inspection_required', vehicleAfter: { ...vehicleAfter }, at: new Date(now()).toISOString(),
  };
  if (existingIndex >= 0) state.shiftHistory[existingIndex] = record;
  else state.shiftHistory.push(record);
  state.shiftHistory = state.shiftHistory.slice(-MAX_LEDGER);
  state.lastRunId = validRunId;
  return { state, recorded: true, duplicate: existingIndex >= 0, record };
}

/** Record a shift-start observation without blocking play; a critical vehicle is flagged. */
export function recordVehicleShiftStart(input, { day = 1, runId = '', now = () => Date.now() } = {}) {
  const state = sanitizeVehicleMaintenanceState(input);
  const validRunId = safeText(runId, 120);
  const assessment = assessVehicleRoadworthiness(state, { day, requireToday: true });
  if (validRunId) {
    const existingIndex = state.shiftHistory.findIndex(row => row.runId === validRunId);
    if (existingIndex >= 0) {
      state.shiftHistory[existingIndex] = { ...state.shiftHistory[existingIndex], statusAtStart: assessment.status };
    } else {
      state.shiftHistory.push({ runId: validRunId, day: safeDay(day), statusAtStart: assessment.status, vehicleAfter: { ...state.vehicle }, at: new Date(now()).toISOString() });
      state.shiftHistory = state.shiftHistory.slice(-MAX_LEDGER);
    }
    if (assessment.status === 'critical' && existingIndex < 0) state.unsafeShiftStarts += 1;
  }
  return { state, assessment };
}

export default {
  defaultVehicleMaintenanceState, sanitizeVehicleMaintenanceState, loadVehicleMaintenanceState, saveVehicleMaintenanceState,
  readVehicleTelemetry, assessVehicleRoadworthiness, recordVehicleInspection, recordVehicleService,
  applyPersistentVehicleState, recordVehicleShiftEnd, recordVehicleShiftStart,
};
