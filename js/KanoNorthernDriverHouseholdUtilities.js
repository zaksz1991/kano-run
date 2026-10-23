/**
 * Kano Life Step 60 — household electricity reliability and generator reserve.
 * These are fictional gameplay estimates, not official Nigerian electricity tariffs.
 * Electricity contributions continue to use Step 58's existing weekly bill system.
 */
export const UTILITIES_STORAGE_KEY = 'kano-life-household-utilities-v1';
export const GENERATOR_FUEL_BUNDLE = Object.freeze({ hours: 5, cost: 850, maxReserveHours: 35, dailyUseLimitHours: 4 });

export const POWER_PLANS = Object.freeze([
  Object.freeze({ id: 'regular', label: 'More regular supply', baseHours: 14 }),
  Object.freeze({ id: 'mixed', label: 'Mixed supply', baseHours: 9 }),
  Object.freeze({ id: 'frequent-outages', label: 'Frequent outages', baseHours: 5 }),
]);

const VALID_PLANS = new Set(POWER_PLANS.map(item => item.id));
const clamp = (value, min, max, fallback = min) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};
const dayNumber = value => clamp(value, 1, 1000000, 1);
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

export function createDefaultUtilitiesState() {
  return {
    version: 1,
    supplyPlan: 'mixed',
    generatorFuelHours: 0,
    generatorUseDay: 0,
    generatorHoursUsedToday: 0,
    lastComplaintDay: 0,
    complaintCount: 0,
    openTicket: null,
    ledger: [],
  };
}

export function normalizeUtilitiesState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = createDefaultUtilitiesState();
  const allowedIssues = new Set(['no-supply', 'meter-billing', 'low-voltage']);
  const ledger = Array.isArray(src.ledger) ? src.ledger.slice(0, 80).filter(row => row && typeof row === 'object').map(row => ({
    day: dayNumber(row.day), type: String(row.type || 'note').slice(0, 40),
    text: String(row.text || '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 220),
    amount: clamp(row.amount, -100000, 100000, 0),
  })) : [];
  const ticket = src.openTicket && typeof src.openTicket === 'object' && allowedIssues.has(src.openTicket.issue) ? {
    issue: src.openTicket.issue,
    day: dayNumber(src.openTicket.day),
    status: ['open', 'recorded'].includes(src.openTicket.status) ? src.openTicket.status : 'open',
  } : null;
  return {
    version: 1,
    supplyPlan: VALID_PLANS.has(src.supplyPlan) ? src.supplyPlan : base.supplyPlan,
    generatorFuelHours: clamp(src.generatorFuelHours, 0, GENERATOR_FUEL_BUNDLE.maxReserveHours, 0),
    generatorUseDay: clamp(src.generatorUseDay, 0, 1000000, 0),
    generatorHoursUsedToday: clamp(src.generatorHoursUsedToday, 0, GENERATOR_FUEL_BUNDLE.dailyUseLimitHours, 0),
    lastComplaintDay: clamp(src.lastComplaintDay, 0, 1000000, 0),
    complaintCount: clamp(src.complaintCount, 0, 1000000, 0),
    openTicket: ticket,
    ledger,
  };
}

/** Deterministic, gently varying supply estimate for a fictional in-game day. */
export function estimatedSupplyHours(supplyPlan = 'mixed', day = 1) {
  const plan = POWER_PLANS.find(item => item.id === supplyPlan) || POWER_PLANS[1];
  const dayIndex = dayNumber(day);
  const offset = mod(dayIndex * 17 + plan.baseHours * 3, 7) - 3;
  const floor = plan.id === 'frequent-outages' ? 1 : 2;
  return Math.max(floor, Math.min(22, plan.baseHours + offset));
}

export function householdPowerReport(rawState, day = 1) {
  const state = normalizeUtilitiesState(rawState);
  const d = dayNumber(day);
  const supplyHours = estimatedSupplyHours(state.supplyPlan, d);
  const outageHours = 24 - supplyHours;
  const foodRisk = outageHours <= 7 ? 'lower' : outageHours <= 12 ? 'moderate' : 'high';
  const usedToday = state.generatorUseDay === d ? state.generatorHoursUsedToday : 0;
  const permittedGeneratorHours = Math.max(0, GENERATOR_FUEL_BUNDLE.dailyUseLimitHours - usedToday);
  return {
    day: d,
    supplyPlan: state.supplyPlan,
    supplyHours,
    outageHours,
    foodRisk,
    generatorFuelHours: state.generatorFuelHours,
    generatorHoursUsedToday: usedToday,
    permittedGeneratorHours,
    canRunGenerator: state.generatorFuelHours >= 1 && permittedGeneratorHours >= 1,
    canBuyFuel: state.generatorFuelHours + GENERATOR_FUEL_BUNDLE.hours <= GENERATOR_FUEL_BUNDLE.maxReserveHours,
    canFileComplaint: state.lastComplaintDay !== d,
    openTicket: state.openTicket ? { ...state.openTicket } : null,
    complaintCount: state.complaintCount,
  };
}

export function setSupplyPlan(rawState, { supplyPlan, activeShift = false } = {}) {
  const state = normalizeUtilitiesState(rawState);
  if (activeShift) return { ok: false, reason: 'shift_active', state };
  if (!VALID_PLANS.has(supplyPlan)) return { ok: false, reason: 'unknown_plan', state };
  state.supplyPlan = supplyPlan;
  return { ok: true, reason: null, state };
}

export function buyGeneratorFuel(rawState, { wallet = 0, activeShift = false, day = 1 } = {}) {
  const state = normalizeUtilitiesState(rawState);
  const cash = clamp(wallet, 0, 1000000000, 0);
  const d = dayNumber(day);
  if (activeShift) return { ok: false, reason: 'shift_active', state, wallet: cash };
  if (state.generatorFuelHours + GENERATOR_FUEL_BUNDLE.hours > GENERATOR_FUEL_BUNDLE.maxReserveHours) return { ok: false, reason: 'reserve_full', state, wallet: cash };
  if (cash < GENERATOR_FUEL_BUNDLE.cost) return { ok: false, reason: 'insufficient_wallet', state, wallet: cash, required: GENERATOR_FUEL_BUNDLE.cost };
  state.generatorFuelHours += GENERATOR_FUEL_BUNDLE.hours;
  state.ledger.unshift({ day: d, type: 'generator-fuel', text: `Bought a ${GENERATOR_FUEL_BUNDLE.hours}-hour household generator-fuel reserve.`, amount: -GENERATOR_FUEL_BUNDLE.cost });
  state.ledger = state.ledger.slice(0, 80);
  return { ok: true, reason: null, state, wallet: cash - GENERATOR_FUEL_BUNDLE.cost, cost: GENERATOR_FUEL_BUNDLE.cost, hoursAdded: GENERATOR_FUEL_BUNDLE.hours };
}

export function runGeneratorHour(rawState, { day = 1, activeShift = false } = {}) {
  const state = normalizeUtilitiesState(rawState);
  const d = dayNumber(day);
  if (activeShift) return { ok: false, reason: 'shift_active', state };
  const report = householdPowerReport(state, d);
  if (state.generatorFuelHours < 1) return { ok: false, reason: 'no_generator_fuel', state };
  if (report.permittedGeneratorHours < 1) return { ok: false, reason: 'daily_limit', state };
  state.generatorFuelHours -= 1;
  if (state.generatorUseDay !== d) { state.generatorUseDay = d; state.generatorHoursUsedToday = 0; }
  state.generatorHoursUsedToday = Math.min(GENERATOR_FUEL_BUNDLE.dailyUseLimitHours, state.generatorHoursUsedToday + 1);
  state.ledger.unshift({ day: d, type: 'generator-use', text: 'Ran the household generator for one simulated hour; fuel was paid for when purchased.', amount: 0 });
  state.ledger = state.ledger.slice(0, 80);
  return { ok: true, reason: null, state, fuelHoursRemaining: state.generatorFuelHours, usedToday: state.generatorHoursUsedToday };
}

export function recordUtilityComplaint(rawState, { day = 1, issue = 'no-supply', activeShift = false } = {}) {
  const state = normalizeUtilitiesState(rawState);
  const d = dayNumber(day);
  const allowedIssues = new Set(['no-supply', 'meter-billing', 'low-voltage']);
  if (activeShift) return { ok: false, reason: 'shift_active', state };
  if (!allowedIssues.has(issue)) return { ok: false, reason: 'unknown_issue', state };
  if (state.lastComplaintDay === d) return { ok: false, reason: 'already_recorded_today', state };
  state.lastComplaintDay = d;
  state.complaintCount += 1;
  state.openTicket = { issue, day: d, status: 'open' };
  const labels = { 'no-supply': 'power outage', 'meter-billing': 'meter or billing question', 'low-voltage': 'low voltage' };
  state.ledger.unshift({ day: d, type: 'utility-complaint', text: `Recorded a household utility complaint about ${labels[issue]}. No compensation or reputation reward was granted.`, amount: 0 });
  state.ledger = state.ledger.slice(0, 80);
  return { ok: true, reason: null, state, ticket: { ...state.openTicket } };
}

export function exportUtilitiesReport(rawState, day = 1) {
  const state = normalizeUtilitiesState(rawState);
  return {
    schemaVersion: 1,
    report: 'Kano Life fictional household utility report',
    day: dayNumber(day),
    power: householdPowerReport(state, day),
    ledger: state.ledger.map(row => ({ ...row })),
    note: 'Supply hours, generator-fuel costs and all simulated amounts are fictional gameplay values, not official tariffs or live supply data. Household electricity contributions are paid through the existing Society & Markets weekly-bill system; this module does not create a duplicate electricity bill.',
  };
}
