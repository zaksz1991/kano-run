import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HOUSEHOLD_WATER_LITRES, WATER_ACCESS_MODES, WATER_BUNDLES, HOUSEHOLD_WATER_TASKS,
  createDefaultHouseholdWaterState, normalizeHouseholdWaterState, householdWaterReport,
  setHouseholdWaterAccess, collectHouseholdWater, buyHouseholdWater,
  completeHouseholdWaterTask, recordHouseholdWaterShortage, exportHouseholdWaterReport,
} from '../js/KanoNorthernDriverHouseholdWater.js';

test('default water state is bounded and starts with a usable household reserve', () => {
  const state = createDefaultHouseholdWaterState();
  assert.equal(state.waterLitres, 80);
  assert.equal(householdWaterReport(state, 1).status, 'adequate');
  assert.equal(MAX_HOUSEHOLD_WATER_LITRES, 500);
  assert.equal(WATER_ACCESS_MODES.length, 3);
  assert.equal(WATER_BUNDLES.length, 3);
  assert.equal(Object.keys(HOUSEHOLD_WATER_TASKS).length, 4);
});

test('normalization clamps invalid water, meters, task days and unsafe history', () => {
  const state = normalizeHouseholdWaterState({
    accessMode: 'bad', waterLitres: 9000,
    meters: { hygiene: -50, clothingCare: 125 },
    lastTaskDay: { bath: -1, laundry: 9 },
    ledger: [{ day: 2, type: 'x<>', text: '<bad>\nline', litres: 900, amount: 4 }],
  });
  assert.equal(state.waterLitres, 500);
  assert.equal(state.accessMode, 'shared-borehole');
  assert.equal(state.meters.hygiene, 0);
  assert.equal(state.meters.clothingCare, 100);
  assert.equal(state.lastTaskDay.bath, 0);
  assert.equal(state.lastTaskDay.laundry, 9);
  assert.equal(state.ledger[0].text.includes('<'), false);
  assert.equal(state.ledger[0].litres, 500);
});

test('access choice is blocked during a driving segment and rejects unknown modes', () => {
  const start = createDefaultHouseholdWaterState();
  assert.equal(setHouseholdWaterAccess(start, { accessMode: 'scheduled-pipe', activeShift: true }).reason, 'shift_active');
  assert.equal(setHouseholdWaterAccess(start, { accessMode: 'unknown' }).reason, 'unknown_access_mode');
  const changed = setHouseholdWaterAccess(start, { accessMode: 'scheduled-pipe' });
  assert.equal(changed.ok, true);
  assert.equal(changed.state.accessMode, 'scheduled-pipe');
});

test('shared borehole collection is once per day and does not create money', () => {
  let state = createDefaultHouseholdWaterState();
  const result = collectHouseholdWater(state, { day: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.litresAdded, 20);
  assert.equal(result.state.waterLitres, 100);
  assert.equal(collectHouseholdWater(result.state, { day: 1 }).reason, 'already_collected_today');
  assert.equal(collectHouseholdWater(result.state, { day: 2, activeShift: true }).reason, 'shift_active');
});

test('scheduled pipe collection is available only on the three-day supply cycle', () => {
  let state = setHouseholdWaterAccess(createDefaultHouseholdWaterState(), { accessMode: 'scheduled-pipe' }).state;
  assert.equal(collectHouseholdWater(state, { day: 2 }).reason, 'not_supply_day');
  const result = collectHouseholdWater(state, { day: 4 });
  assert.equal(result.ok, true);
  assert.equal(result.litresAdded, 60);
});

test('vendor-dependent household cannot collect free supply but can buy a bundle', () => {
  const state = setHouseholdWaterAccess(createDefaultHouseholdWaterState(), { accessMode: 'vendor-dependent' }).state;
  assert.equal(collectHouseholdWater(state, { day: 1 }).reason, 'paid_only');
  const result = buyHouseholdWater(state, { bundleId: 'vendor', wallet: 1000, day: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 750);
  assert.equal(result.state.waterLitres, state.waterLitres + 50);
});

test('water purchase rejects active shifts, insufficient wallet and tank overflow', () => {
  const state = createDefaultHouseholdWaterState();
  assert.equal(buyHouseholdWater(state, { wallet: 1000, activeShift: true }).reason, 'shift_active');
  assert.equal(buyHouseholdWater(state, { wallet: 100 }).reason, 'insufficient_wallet');
  const nearFull = normalizeHouseholdWaterState({ waterLitres: 490 });
  assert.equal(buyHouseholdWater(nearFull, { bundleId: 'vendor', wallet: 1000 }).reason, 'reserve_full');
});

test('household tasks consume water, improve only their designated roleplay meter and enforce cooldown', () => {
  const state = normalizeHouseholdWaterState({ waterLitres: 80 });
  const bath = completeHouseholdWaterTask(state, { taskId: 'bath', day: 1 });
  assert.equal(bath.ok, true);
  assert.equal(bath.state.waterLitres, 62);
  assert.equal(bath.state.meters.hygiene, state.meters.hygiene + 8);
  assert.equal(completeHouseholdWaterTask(bath.state, { taskId: 'bath', day: 1 }).reason, 'cooldown');
  assert.equal(completeHouseholdWaterTask(bath.state, { taskId: 'unknown', day: 2 }).reason, 'unknown_task');
});

test('laundry requires three in-game days between completions', () => {
  const state = normalizeHouseholdWaterState({ waterLitres: 200 });
  const first = completeHouseholdWaterTask(state, { taskId: 'laundry', day: 2 });
  assert.equal(first.ok, true);
  assert.equal(completeHouseholdWaterTask(first.state, { taskId: 'laundry', day: 4 }).reason, 'cooldown');
  assert.equal(completeHouseholdWaterTask(first.state, { taskId: 'laundry', day: 5 }).ok, true);
});

test('water-shortage record is limited to one per day and does not affect the wallet', () => {
  const initial = createDefaultHouseholdWaterState();
  const first = recordHouseholdWaterShortage(initial, { day: 7, note: 'No water today' });
  assert.equal(first.ok, true);
  assert.equal(first.state.shortageReports, 1);
  assert.equal(recordHouseholdWaterShortage(first.state, { day: 7 }).reason, 'already_recorded_today');
  assert.equal(recordHouseholdWaterShortage(first.state, { day: 7, activeShift: true }).reason, 'shift_active');
});

test('export is explicitly a fictional roleplay report and includes bounded history', () => {
  const report = exportHouseholdWaterReport(createDefaultHouseholdWaterState(), 6);
  assert.equal(report.snapshot.day, 6);
  assert.match(report.note, /not a hygiene or medical diagnostic tool/i);
  assert.ok(Array.isArray(report.ledger));
});
