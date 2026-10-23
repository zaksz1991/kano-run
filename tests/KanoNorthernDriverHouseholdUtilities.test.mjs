import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERATOR_FUEL_BUNDLE, POWER_PLANS, createDefaultUtilitiesState,
  normalizeUtilitiesState, estimatedSupplyHours, householdPowerReport,
  setSupplyPlan, buyGeneratorFuel, runGeneratorHour, recordUtilityComplaint,
  exportUtilitiesReport,
} from '../js/KanoNorthernDriverHouseholdUtilities.js';

test('supply estimates are deterministic, bounded, and vary by chosen fictional pattern', () => {
  for (const plan of POWER_PLANS) {
    for (let day = 1; day <= 90; day += 1) {
      const hours = estimatedSupplyHours(plan.id, day);
      assert.ok(Number.isInteger(hours) && hours >= 1 && hours <= 22);
      assert.equal(hours, estimatedSupplyHours(plan.id, day));
    }
  }
  assert.notEqual(estimatedSupplyHours('regular', 3), estimatedSupplyHours('frequent-outages', 3));
  assert.equal(estimatedSupplyHours('invalid', 1), estimatedSupplyHours('mixed', 1));
});

test('utility state normalization discards unknown plans and bounds reserve and history', () => {
  const raw = normalizeUtilitiesState({ supplyPlan: 'bogus', generatorFuelHours: 900, generatorHoursUsedToday: -3, ledger: Array.from({ length: 100 }, (_, i) => ({ day: i + 1, text: 'ok' })) });
  assert.equal(raw.supplyPlan, 'mixed');
  assert.equal(raw.generatorFuelHours, GENERATOR_FUEL_BUNDLE.maxReserveHours);
  assert.equal(raw.generatorHoursUsedToday, 0);
  assert.equal(raw.ledger.length, 80);
});

test('power report provides an outage estimate and temperature-sensitive storage warning without mutating state', () => {
  const state = createDefaultUtilitiesState();
  const before = JSON.stringify(state);
  const report = householdPowerReport(state, 22);
  assert.equal(report.day, 22);
  assert.equal(report.outageHours, 24 - report.supplyHours);
  assert.ok(['lower', 'moderate', 'high'].includes(report.foodRisk));
  assert.equal(JSON.stringify(state), before);
});

test('supply plan changes reject active shifts and accept valid plans when stopped', () => {
  const state = createDefaultUtilitiesState();
  assert.equal(setSupplyPlan(state, { supplyPlan: 'regular', activeShift: true }).reason, 'shift_active');
  const result = setSupplyPlan(state, { supplyPlan: 'regular', activeShift: false });
  assert.equal(result.ok, true);
  assert.equal(result.state.supplyPlan, 'regular');
  assert.equal(setSupplyPlan(state, { supplyPlan: 'fake' }).reason, 'unknown_plan');
});

test('generator fuel purchase checks shift, capacity and wallet and charges exactly once', () => {
  const state = createDefaultUtilitiesState();
  assert.equal(buyGeneratorFuel(state, { wallet: 5000, activeShift: true }).reason, 'shift_active');
  assert.equal(buyGeneratorFuel(state, { wallet: 10 }).reason, 'insufficient_wallet');
  const purchase = buyGeneratorFuel(state, { wallet: 2000, day: 2 });
  assert.equal(purchase.ok, true);
  assert.equal(purchase.wallet, 2000 - GENERATOR_FUEL_BUNDLE.cost);
  assert.equal(purchase.state.generatorFuelHours, GENERATOR_FUEL_BUNDLE.hours);
  const full = normalizeUtilitiesState({ generatorFuelHours: 32 });
  assert.equal(buyGeneratorFuel(full, { wallet: 2000 }).reason, 'reserve_full');
});

test('generator consumption uses prepaid reserve, is limited per day, and resets the daily quota on a new day', () => {
  let state = normalizeUtilitiesState({ generatorFuelHours: 5 });
  for (let i = 0; i < GENERATOR_FUEL_BUNDLE.dailyUseLimitHours; i += 1) {
    const result = runGeneratorHour(state, { day: 4 });
    assert.equal(result.ok, true);
    state = result.state;
  }
  assert.equal(runGeneratorHour(state, { day: 4 }).reason, 'daily_limit');
  const nextDay = runGeneratorHour(state, { day: 5 });
  assert.equal(nextDay.ok, true);
  assert.equal(nextDay.state.generatorFuelHours, 0);
  assert.equal(runGeneratorHour(nextDay.state, { day: 6 }).reason, 'no_generator_fuel');
  assert.equal(runGeneratorHour({ generatorFuelHours: 2 }, { day: 6, activeShift: true }).reason, 'shift_active');
});

test('utility complaints are recorded once daily without a wallet reward', () => {
  const state = createDefaultUtilitiesState();
  assert.equal(recordUtilityComplaint(state, { day: 1, activeShift: true }).reason, 'shift_active');
  const outcome = recordUtilityComplaint(state, { day: 1, issue: 'low-voltage' });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state.complaintCount, 1);
  assert.equal(outcome.state.openTicket.issue, 'low-voltage');
  assert.equal(recordUtilityComplaint(outcome.state, { day: 1 }).reason, 'already_recorded_today');
  assert.equal(recordUtilityComplaint(outcome.state, { day: 2 }).ok, true);
  assert.equal(recordUtilityComplaint(outcome.state, { day: 3, issue: 'fake' }).reason, 'unknown_issue');
  assert.equal(outcome.wallet, undefined);
});

test('export clearly labels fictional values and does not create a second NEPA bill', () => {
  const report = exportUtilitiesReport(createDefaultUtilitiesState(), 1);
  assert.equal(report.schemaVersion, 1);
  assert.match(report.note, /fictional gameplay values/i);
  assert.match(report.note, /existing Society & Markets weekly-bill system/i);
  assert.doesNotMatch(JSON.stringify(report), /newBill|billAmount|monthlyBill/);
});
