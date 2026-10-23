import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOUSEHOLD_BUDGET_PLAN,
  loadHouseholdBudgetPlan,
  projectHouseholdBudget,
  sanitizeHouseholdBudgetPlan,
  saveHouseholdBudgetPlan,
  suggestHouseholdBudgetPlan,
} from '../js/KanoNorthernDriverHouseholdBudget.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
}

test('sanitizes invalid amounts and clamps days per week', () => {
  const plan = sanitizeHouseholdBudgetPlan({ netPerShift: -9, workDaysPerWeek: 99, operatingReserveWeekly: 'bad', emergencyTarget: 150.6 });
  assert.equal(plan.netPerShift, 0);
  assert.equal(plan.workDaysPerWeek, 7);
  assert.equal(plan.operatingReserveWeekly, 0);
  assert.equal(plan.emergencyTarget, 151);
});

test('projects weekly income and set-asides without applying financial effects', () => {
  const projection = projectHouseholdBudget({
    netPerShift: 1500, workDaysPerWeek: 6,
    operatingReserveWeekly: 1200, maintenanceReserveWeekly: 300, vehicleReserveWeekly: 400,
    extraHouseholdSupportWeekly: 500, emergencyContributionWeekly: 200, longTermSavingsWeekly: 300,
    emergencyTarget: 1000, emergencyAlreadySetAside: 200,
  });
  assert.equal(projection.weeklyExpectedNet, 9000);
  assert.equal(projection.weeklyPlanned, 2900);
  assert.equal(projection.weeklyRemainder, 6100);
  assert.equal(projection.emergencyGap, 800);
  assert.equal(projection.weeksToEmergencyTarget, 4);
  assert.equal(projection.financialEffectsApplied, false);
});

test('identifies overcommitted budgets and unentered income', () => {
  assert.equal(projectHouseholdBudget({ ...DEFAULT_HOUSEHOLD_BUDGET_PLAN, operatingReserveWeekly: 800 }).status, 'income_estimate_required');
  const projection = projectHouseholdBudget({ ...DEFAULT_HOUSEHOLD_BUDGET_PLAN, netPerShift: 100, workDaysPerWeek: 5, longTermSavingsWeekly: 600 });
  assert.equal(projection.status, 'overcommitted');
  assert.equal(projection.weeklyRemainder, -100);
});

test('suggests editable values from the last recorded shift cost breakdown', () => {
  const plan = suggestHouseholdBudgetPlan({ lastShiftReport: {
    netAfterPaidCosts: 1200,
    fuelCost: { due: 40 }, maintenanceCost: { due: 30 }, vehicleCost: { due: 160 },
  } });
  assert.equal(plan.netPerShift, 1200);
  assert.equal(plan.workDaysPerWeek, 6);
  assert.equal(plan.operatingReserveWeekly, 240);
  assert.equal(plan.maintenanceReserveWeekly, 180);
  assert.equal(plan.vehicleReserveWeekly, 960);
});

test('save and reload a budget plan without creating any cash transaction', () => {
  const storage = memoryStorage();
  const result = saveHouseholdBudgetPlan({ ...DEFAULT_HOUSEHOLD_BUDGET_PLAN, netPerShift: 1500 }, { storage, now: () => Date.parse('2026-10-23T00:00:00Z') });
  assert.equal(result.ok, true);
  const loaded = loadHouseholdBudgetPlan(storage);
  assert.equal(loaded.plan.netPerShift, 1500);
  assert.equal(result.record.financialEffectsApplied, false);
});

test('handles unavailable browser storage clearly', () => {
  assert.equal(loadHouseholdBudgetPlan({ getItem() { throw new Error('blocked'); } }), null);
  assert.equal(saveHouseholdBudgetPlan(DEFAULT_HOUSEHOLD_BUDGET_PLAN, { storage: { setItem() { throw new Error('blocked'); } } }).reason, 'storage_unavailable');
});
