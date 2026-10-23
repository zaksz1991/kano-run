// ============================================================
// KANO LIFE — HOUSEHOLD BUDGET PLANNER
// Planning only: this module never debits the game wallet or moves savings.
// ============================================================
const MAX_AMOUNT = 100_000_000;
const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const amount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(clamp(number, 0, MAX_AMOUNT)) : 0;
};
const days = (value) => Math.round(clamp(Number.isFinite(Number(value)) ? Number(value) : 6, 1, 7));

export const HOUSEHOLD_BUDGET_STORAGE_KEY = 'kano-life-household-budget-v1';

export const DEFAULT_HOUSEHOLD_BUDGET_PLAN = Object.freeze({
  netPerShift: 0,
  workDaysPerWeek: 6,
  operatingReserveWeekly: 0,
  maintenanceReserveWeekly: 0,
  vehicleReserveWeekly: 0,
  extraHouseholdSupportWeekly: 0,
  emergencyContributionWeekly: 0,
  longTermSavingsWeekly: 0,
  emergencyTarget: 1000,
  emergencyAlreadySetAside: 0,
});

export function sanitizeHouseholdBudgetPlan(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  return {
    netPerShift: amount(row.netPerShift),
    workDaysPerWeek: days(row.workDaysPerWeek),
    operatingReserveWeekly: amount(row.operatingReserveWeekly),
    maintenanceReserveWeekly: amount(row.maintenanceReserveWeekly),
    vehicleReserveWeekly: amount(row.vehicleReserveWeekly),
    extraHouseholdSupportWeekly: amount(row.extraHouseholdSupportWeekly),
    emergencyContributionWeekly: amount(row.emergencyContributionWeekly),
    longTermSavingsWeekly: amount(row.longTermSavingsWeekly),
    emergencyTarget: amount(row.emergencyTarget),
    emergencyAlreadySetAside: amount(row.emergencyAlreadySetAside),
  };
}

function lastRun(lifeSnapshot) {
  const snapshot = lifeSnapshot && typeof lifeSnapshot === 'object' ? lifeSnapshot : {};
  return snapshot.lastShiftReport && typeof snapshot.lastShiftReport === 'object' ? snapshot.lastShiftReport : {};
}

function costDue(cost) {
  if (cost && typeof cost === 'object') return amount(cost.due ?? cost.paid ?? 0);
  return amount(cost);
}

/** Seed an editable plan from the last recorded shift; the estimates remain editable. */
export function suggestHouseholdBudgetPlan(lifeSnapshot = {}, savedPlan = null) {
  if (savedPlan) return sanitizeHouseholdBudgetPlan(savedPlan);
  const shift = lastRun(lifeSnapshot);
  const workDaysPerWeek = 6;
  return sanitizeHouseholdBudgetPlan({
    ...DEFAULT_HOUSEHOLD_BUDGET_PLAN,
    netPerShift: shift.netAfterPaidCosts ?? 0,
    workDaysPerWeek,
    operatingReserveWeekly: costDue(shift.fuelCost) * workDaysPerWeek,
    maintenanceReserveWeekly: costDue(shift.maintenanceCost) * workDaysPerWeek,
    vehicleReserveWeekly: costDue(shift.vehicleCost) * workDaysPerWeek,
  });
}

export function projectHouseholdBudget(input = {}) {
  const plan = sanitizeHouseholdBudgetPlan(input);
  const weeklyExpectedNet = plan.netPerShift * plan.workDaysPerWeek;
  const allocations = {
    operatingReserve: plan.operatingReserveWeekly,
    maintenanceReserve: plan.maintenanceReserveWeekly,
    vehicleReserve: plan.vehicleReserveWeekly,
    extraHouseholdSupport: plan.extraHouseholdSupportWeekly,
    emergencyContribution: plan.emergencyContributionWeekly,
    longTermSavings: plan.longTermSavingsWeekly,
  };
  const weeklyPlanned = Object.values(allocations).reduce((sum, value) => sum + value, 0);
  const weeklyRemainder = weeklyExpectedNet - weeklyPlanned;
  const emergencyGap = Math.max(0, plan.emergencyTarget - plan.emergencyAlreadySetAside);
  const weeksToEmergencyTarget = emergencyGap === 0 ? 0
    : plan.emergencyContributionWeekly > 0 ? Math.ceil(emergencyGap / plan.emergencyContributionWeekly)
      : null;
  return {
    plan,
    weeklyExpectedNet,
    allocations,
    weeklyPlanned,
    weeklyRemainder,
    commitmentPercent: weeklyExpectedNet > 0 ? Math.round((weeklyPlanned / weeklyExpectedNet) * 1000) / 10 : null,
    emergencyGap,
    weeksToEmergencyTarget,
    status: weeklyExpectedNet <= 0 ? 'income_estimate_required'
      : weeklyRemainder < 0 ? 'overcommitted'
        : weeklyRemainder === 0 ? 'fully_allocated' : 'within_estimate',
    financialEffectsApplied: false,
  };
}

export function loadHouseholdBudgetPlan(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(HOUSEHOLD_BUDGET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !parsed.plan || typeof parsed.plan !== 'object') return null;
    return { version: 1, savedAt: String(parsed.savedAt || ''), plan: sanitizeHouseholdBudgetPlan(parsed.plan) };
  } catch {
    return null;
  }
}

export function saveHouseholdBudgetPlan(planInput, { storage = defaultStorage(), now = () => Date.now() } = {}) {
  const record = {
    version: 1,
    savedAt: new Date(now()).toISOString(),
    plan: sanitizeHouseholdBudgetPlan(planInput),
    financialEffectsApplied: false,
  };
  try {
    if (!storage) return { ok: false, reason: 'storage_unavailable' };
    storage.setItem(HOUSEHOLD_BUDGET_STORAGE_KEY, JSON.stringify(record));
    return { ok: true, record };
  } catch {
    return { ok: false, reason: 'storage_unavailable' };
  }
}

export default {
  sanitizeHouseholdBudgetPlan,
  suggestHouseholdBudgetPlan,
  projectHouseholdBudget,
  loadHouseholdBudgetPlan,
  saveHouseholdBudgetPlan,
};
