/**
 * Kano Life Step 61 — household water access, hygiene routines and sanitation.
 * Every price and volume is fictional gameplay tuning, not a current market quote.
 * Actions are explicit; no invisible daily water loss or health diagnosis occurs.
 */
export const HOUSEHOLD_WATER_STORAGE_KEY = 'kano-life-household-water-v1';
export const MAX_HOUSEHOLD_WATER_LITRES = 500;

export const WATER_ACCESS_MODES = Object.freeze([
  Object.freeze({ id: 'shared-borehole', label: 'Shared neighbourhood borehole', freeLitres: 20, pattern: 'daily' }),
  Object.freeze({ id: 'scheduled-pipe', label: 'Scheduled piped supply', freeLitres: 60, pattern: 'every-third-day' }),
  Object.freeze({ id: 'vendor-dependent', label: 'Vendor-dependent household', freeLitres: 0, pattern: 'paid-only' }),
]);

export const WATER_BUNDLES = Object.freeze([
  Object.freeze({ id: 'packaged', label: 'Packaged drinking-water reserve', litres: 10, cost: 180 }),
  Object.freeze({ id: 'vendor', label: 'Water vendor delivery', litres: 50, cost: 250 }),
  Object.freeze({ id: 'tanker', label: 'Small household tanker delivery', litres: 200, cost: 850 }),
]);

export const HOUSEHOLD_WATER_TASKS = Object.freeze({
  cook: Object.freeze({ label: 'Prepare food and wash cooking items', litres: 8, cooldownDays: 1, benefit: 'mealReadiness' }),
  bath: Object.freeze({ label: 'Bathe and wash', litres: 18, cooldownDays: 1, benefit: 'hygiene' }),
  laundry: Object.freeze({ label: 'Wash clothes', litres: 30, cooldownDays: 3, benefit: 'clothingCare' }),
  clean: Object.freeze({ label: 'Clean toilet and household area', litres: 12, cooldownDays: 1, benefit: 'householdOrder' }),
});

const PLAN_IDS = new Set(WATER_ACCESS_MODES.map(x => x.id));
const BUNDLE_BY_ID = new Map(WATER_BUNDLES.map(x => [x.id, x]));
const TASK_BY_ID = new Map(Object.entries(HOUSEHOLD_WATER_TASKS));
const clampInt = (v, min, max, fallback = min) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};
const dayValue = d => clampInt(d, 1, 1000000, 1);
const meter = v => clampInt(v, 0, 100, 60);

export function createDefaultHouseholdWaterState() {
  return {
    version: 1,
    accessMode: 'shared-borehole',
    waterLitres: 80,
    lastCollectionDay: 0,
    lastTaskDay: { cook: 0, bath: 0, laundry: 0, clean: 0 },
    meters: { hygiene: 65, clothingCare: 55, householdOrder: 60, mealReadiness: 55 },
    shortageReports: 0,
    ledger: [],
  };
}

export function normalizeHouseholdWaterState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = createDefaultHouseholdWaterState();
  const tasks = src.lastTaskDay && typeof src.lastTaskDay === 'object' ? src.lastTaskDay : {};
  const meters = src.meters && typeof src.meters === 'object' ? src.meters : {};
  const ledger = Array.isArray(src.ledger) ? src.ledger.slice(0, 80).filter(row => row && typeof row === 'object').map(row => ({
    day: dayValue(row.day),
    type: String(row.type || 'note').replace(/[^a-z0-9-]/gi, '').slice(0, 36) || 'note',
    text: String(row.text || '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 200),
    litres: clampInt(row.litres, 0, MAX_HOUSEHOLD_WATER_LITRES, 0),
    amount: clampInt(row.amount, -100000, 100000, 0),
  })) : [];
  return {
    version: 1,
    accessMode: PLAN_IDS.has(src.accessMode) ? src.accessMode : base.accessMode,
    waterLitres: clampInt(src.waterLitres, 0, MAX_HOUSEHOLD_WATER_LITRES, base.waterLitres),
    lastCollectionDay: clampInt(src.lastCollectionDay, 0, 1000000, 0),
    lastTaskDay: Object.fromEntries(Object.keys(base.lastTaskDay).map(k => [k, clampInt(tasks[k], 0, 1000000, 0)])),
    meters: Object.fromEntries(Object.keys(base.meters).map(k => [k, meter(meters[k] ?? base.meters[k])])),
    shortageReports: clampInt(src.shortageReports, 0, 1000000, 0),
    ledger,
  };
}

function appendEntry(state, entry) {
  state.ledger.unshift({ day: dayValue(entry.day), type: entry.type, text: entry.text, litres: clampInt(entry.litres, 0, MAX_HOUSEHOLD_WATER_LITRES, 0), amount: clampInt(entry.amount, -100000, 100000, 0) });
  state.ledger = state.ledger.slice(0, 80);
}

export function householdWaterReport(rawState, day = 1) {
  const state = normalizeHouseholdWaterState(rawState);
  const d = dayValue(day);
  const mode = WATER_ACCESS_MODES.find(x => x.id === state.accessMode) || WATER_ACCESS_MODES[0];
  const collectionAvailable = mode.pattern === 'daily'
    ? true
    : mode.pattern === 'every-third-day' && (d - 1) % 3 === 0;
  const collectionLitres = mode.pattern === 'paid-only' ? 0 : mode.freeLitres;
  const lastCollectionWasToday = state.lastCollectionDay === d;
  const status = state.waterLitres < 20 ? 'low' : state.waterLitres < 60 ? 'watch' : 'adequate';
  return {
    day: d,
    accessMode: state.accessMode,
    accessLabel: mode.label,
    waterLitres: state.waterLitres,
    maxLitres: MAX_HOUSEHOLD_WATER_LITRES,
    status,
    collectionLitres,
    collectionAvailable: collectionLitres > 0 && collectionAvailable && !lastCollectionWasToday && state.waterLitres < MAX_HOUSEHOLD_WATER_LITRES,
    collectionUnavailableReason: lastCollectionWasToday ? 'already_collected_today' : mode.pattern === 'paid-only' ? 'paid_only' : !collectionAvailable ? 'not_supply_day' : state.waterLitres >= MAX_HOUSEHOLD_WATER_LITRES ? 'reserve_full' : null,
    tasks: Object.fromEntries(Object.entries(HOUSEHOLD_WATER_TASKS).map(([id, task]) => {
      const last = state.lastTaskDay[id] || 0;
      const eligible = last === 0 || (d - last >= task.cooldownDays);
      return [id, { ...task, lastDoneDay: last, eligible, canComplete: eligible && state.waterLitres >= task.litres }];
    })),
    meters: { ...state.meters },
    shortageReports: state.shortageReports,
    recentHistory: state.ledger.slice(0, 8).map(row => ({ ...row })),
  };
}

export function setHouseholdWaterAccess(rawState, { accessMode, activeShift = false } = {}) {
  const state = normalizeHouseholdWaterState(rawState);
  if (activeShift) return { ok: false, reason: 'shift_active', state };
  if (!PLAN_IDS.has(accessMode)) return { ok: false, reason: 'unknown_access_mode', state };
  state.accessMode = accessMode;
  return { ok: true, reason: null, state };
}

export function collectHouseholdWater(rawState, { day = 1, activeShift = false } = {}) {
  const state = normalizeHouseholdWaterState(rawState);
  const d = dayValue(day);
  if (activeShift) return { ok: false, reason: 'shift_active', state };
  const report = householdWaterReport(state, d);
  if (state.lastCollectionDay === d) return { ok: false, reason: 'already_collected_today', state };
  if (report.collectionUnavailableReason === 'paid_only') return { ok: false, reason: 'paid_only', state };
  if (report.collectionUnavailableReason === 'not_supply_day') return { ok: false, reason: 'not_supply_day', state };
  if (state.waterLitres >= MAX_HOUSEHOLD_WATER_LITRES) return { ok: false, reason: 'reserve_full', state };
  const litresAdded = Math.min(report.collectionLitres, MAX_HOUSEHOLD_WATER_LITRES - state.waterLitres);
  if (litresAdded <= 0) return { ok: false, reason: 'reserve_full', state };
  state.waterLitres += litresAdded;
  state.lastCollectionDay = d;
  appendEntry(state, { day: d, type: 'water-collection', text: `Collected ${litresAdded} L of household water from the shared supply.`, litres: litresAdded, amount: 0 });
  return { ok: true, reason: null, state, litresAdded };
}

export function buyHouseholdWater(rawState, { bundleId = 'vendor', wallet = 0, activeShift = false, day = 1 } = {}) {
  const state = normalizeHouseholdWaterState(rawState);
  const d = dayValue(day);
  const cash = clampInt(wallet, 0, 1000000000, 0);
  if (activeShift) return { ok: false, reason: 'shift_active', state, wallet: cash };
  const bundle = BUNDLE_BY_ID.get(bundleId);
  if (!bundle) return { ok: false, reason: 'unknown_bundle', state, wallet: cash };
  if (state.waterLitres + bundle.litres > MAX_HOUSEHOLD_WATER_LITRES) return { ok: false, reason: 'reserve_full', state, wallet: cash, required: bundle.cost };
  if (cash < bundle.cost) return { ok: false, reason: 'insufficient_wallet', state, wallet: cash, required: bundle.cost };
  state.waterLitres += bundle.litres;
  appendEntry(state, { day: d, type: 'water-purchase', text: `Purchased ${bundle.litres} L: ${bundle.label}.`, litres: bundle.litres, amount: -bundle.cost });
  return { ok: true, reason: null, state, wallet: cash - bundle.cost, litresAdded: bundle.litres, cost: bundle.cost };
}

export function completeHouseholdWaterTask(rawState, { taskId, day = 1, activeShift = false } = {}) {
  const state = normalizeHouseholdWaterState(rawState);
  const d = dayValue(day);
  if (activeShift) return { ok: false, reason: 'shift_active', state };
  const task = TASK_BY_ID.get(taskId);
  if (!task) return { ok: false, reason: 'unknown_task', state };
  const last = state.lastTaskDay[taskId] || 0;
  if (last > 0 && d - last < task.cooldownDays) return { ok: false, reason: 'cooldown', state, nextEligibleDay: last + task.cooldownDays };
  if (state.waterLitres < task.litres) return { ok: false, reason: 'insufficient_water', state, required: task.litres, available: state.waterLitres };
  state.waterLitres -= task.litres;
  state.lastTaskDay[taskId] = d;
  const meterKey = task.benefit;
  const gain = taskId === 'bath' ? 8 : taskId === 'laundry' ? 8 : taskId === 'clean' ? 7 : 4;
  state.meters[meterKey] = Math.min(100, state.meters[meterKey] + gain);
  if (taskId === 'clean') state.meters.hygiene = Math.min(100, state.meters.hygiene + 3);
  appendEntry(state, { day: d, type: `task-${taskId}`, text: `${task.label} completed. ${task.litres} L used.`, litres: task.litres, amount: 0 });
  return { ok: true, reason: null, state, taskId, litresUsed: task.litres, meter: meterKey, meterValue: state.meters[meterKey] };
}

export function recordHouseholdWaterShortage(rawState, { day = 1, activeShift = false, note = '' } = {}) {
  const state = normalizeHouseholdWaterState(rawState);
  const d = dayValue(day);
  if (activeShift) return { ok: false, reason: 'shift_active', state };
  if (state.ledger.some(row => row.day === d && row.type === 'water-shortage')) return { ok: false, reason: 'already_recorded_today', state };
  const safeNote = String(note || 'Household water supply was insufficient today.').replace(/[<>\u0000-\u001f]/g, '').slice(0, 180);
  state.shortageReports += 1;
  appendEntry(state, { day: d, type: 'water-shortage', text: safeNote, litres: 0, amount: 0 });
  return { ok: true, reason: null, state };
}

export function exportHouseholdWaterReport(rawState, day = 1) {
  const state = normalizeHouseholdWaterState(rawState);
  return {
    schemaVersion: 1,
    report: 'Kano Life fictional household water and sanitation report',
    snapshot: householdWaterReport(state, day),
    ledger: state.ledger.map(row => ({ ...row })),
    note: 'Water volumes, supplies, prices and household meter gains are fictional gameplay values. This is not a hygiene or medical diagnostic tool. No water is deducted automatically; players explicitly complete tasks.',
  };
}
