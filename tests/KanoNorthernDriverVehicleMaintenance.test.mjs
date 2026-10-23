import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VEHICLE_MAINTENANCE_STORAGE_KEY,
  defaultVehicleMaintenanceState,
  sanitizeVehicleMaintenanceState,
  loadVehicleMaintenanceState,
  saveVehicleMaintenanceState,
  readVehicleTelemetry,
  assessVehicleRoadworthiness,
  recordVehicleInspection,
  recordVehicleService,
  applyPersistentVehicleState,
  recordVehicleShiftEnd,
  recordVehicleShiftStart,
} from '../js/KanoNorthernDriverVehicleMaintenance.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    _map: map,
  };
};

test('fresh vehicle state starts with full arcade condition but no manual inspection', () => {
  const state = defaultVehicleMaintenanceState();
  assert.deepEqual(state.vehicle, { condition: 100, engine: 100, tyres: 100 });
  assert.equal(state.lastInspectionDay, null);
  assert.equal(assessVehicleRoadworthiness(state, { day: 1 }).status, 'inspection_required');
});

test('sanitizer clamps bad telemetry and retains defaults for omitted fields', () => {
  const state = sanitizeVehicleMaintenanceState({ version: 1, vehicle: { condition: 140, engine: -3 }, manualChecks: { brakes: 'unsafe' } });
  assert.deepEqual(state.vehicle, { condition: 100, engine: 0, tyres: 100 });
  assert.equal(state.manualChecks.brakes, 'not_checked');
  assert.equal(state.lastInspectionDay, null);
  assert.equal(state.lastServiceDay, null);
});

test('telemetry reads live game stats but falls back for missing metrics', () => {
  const state = defaultVehicleMaintenanceState(); state.vehicle.engine = 70;
  assert.deepEqual(readVehicleTelemetry({ condition: 45, tyres: 20 }, state), { condition: 45, engine: 70, tyres: 20 });
  assert.deepEqual(readVehicleTelemetry({ condition: null }, state), { condition: 100, engine: 70, tyres: 100 });
});

test('critical condition is flagged before any shift starts', () => {
  const state = defaultVehicleMaintenanceState();
  state.vehicle.tyres = 25;
  const result = recordVehicleShiftStart(state, { day: 1, runId: 'career-1', now: () => 1 });
  assert.equal(result.assessment.status, 'critical');
  assert.equal(result.state.unsafeShiftStarts, 1);
  const duplicate = recordVehicleShiftStart(result.state, { day: 1, runId: 'career-1', now: () => 2 });
  assert.equal(duplicate.state.unsafeShiftStarts, 1);
});

test('roadworthy status needs current inspection and every manual check marked OK', () => {
  const initial = defaultVehicleMaintenanceState();
  const partial = recordVehicleInspection(initial, { day: 4, gameState: { condition: 90, engine: 80, tyres: 85 }, manualChecks: { brakes: 'ok', steering: 'ok', lights: 'ok' }, now: () => 1000 });
  assert.equal(partial.assessment.status, 'inspection_required');
  const checked = recordVehicleInspection(partial.state, { day: 4, gameState: { condition: 90, engine: 80, tyres: 85 }, manualChecks: { brakes: 'ok', steering: 'ok', lights: 'ok', horn: 'ok' }, now: () => 2000 });
  assert.equal(checked.assessment.status, 'roadworthy');
  assert.equal(checked.state.inspectionCount, 2);
});

test('service increases only the selected persistent metric and invalidates old inspection', () => {
  const state = defaultVehicleMaintenanceState();
  state.vehicle.tyres = 40; state.lastInspectionDay = 2;
  const result = recordVehicleService(state, { serviceId: 'tyres', day: 2, now: () => 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.state.vehicle.tyres, 75);
  assert.equal(result.state.vehicle.engine, 100);
  assert.equal(result.state.lastInspectionDay, null);
  assert.equal(result.service.cost, 450);
  assert.equal(result.state.serviceHistory.length, 1);
});

test('unknown workshop service is rejected without changing vehicle values', () => {
  const state = defaultVehicleMaintenanceState(); state.vehicle.engine = 36;
  for (const serviceId of ['fake-service', '__proto__', 'toString']) {
    const result = recordVehicleService(state, { serviceId, day: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown_service');
    assert.equal(result.state.vehicle.engine, 36);
  }
});

test('persistent service values apply to available game telemetry fields', () => {
  const state = defaultVehicleMaintenanceState(); state.vehicle = { condition: 70, engine: 50, tyres: 80 };
  const game = { condition: 100, engine: 100, tyres: 100, fuel: 67 };
  assert.equal(applyPersistentVehicleState(game, state), true);
  assert.deepEqual(game, { condition: 70, engine: 50, tyres: 80, fuel: 67 });
  assert.equal(applyPersistentVehicleState(null, state), false);
});

test('shift-end records final vehicle condition and updates same run instead of duplicating it', () => {
  let state = defaultVehicleMaintenanceState();
  state = recordVehicleShiftStart(state, { day: 1, runId: 'career-77', now: () => 1000 }).state;
  const end1 = recordVehicleShiftEnd(state, { day: 1, runId: 'career-77', gameState: { condition: 80, engine: 75, tyres: 70 }, now: () => 2000 });
  assert.equal(end1.recorded, true);
  assert.equal(end1.state.vehicle.tyres, 70);
  const end2 = recordVehicleShiftEnd(end1.state, { day: 1, runId: 'career-77', gameState: { condition: 78, engine: 74, tyres: 65 }, now: () => 3000 });
  assert.equal(end2.duplicate, true);
  assert.equal(end2.state.shiftHistory.length, 1);
  assert.equal(end2.state.shiftHistory[0].statusAtStart, 'inspection_required');
  assert.equal(end2.state.vehicle.tyres, 65);
});

test('state persists and reloads with histories', () => {
  const storage = fakeStorage();
  let state = defaultVehicleMaintenanceState();
  state = recordVehicleService(state, { serviceId: 'engine', day: 7, now: () => 1700000000000 }).state;
  const saved = saveVehicleMaintenanceState(state, storage);
  assert.equal(saved.ok, true);
  assert.ok(storage.getItem(VEHICLE_MAINTENANCE_STORAGE_KEY));
  const loaded = loadVehicleMaintenanceState(storage);
  assert.equal(loaded.serviceHistory.length, 1);
  assert.equal(loaded.vehicle.engine, 100);
});

test('corrupt storage safely falls back to clean state', () => {
  const storage = fakeStorage();
  storage.setItem(VEHICLE_MAINTENANCE_STORAGE_KEY, '{broken');
  const loaded = loadVehicleMaintenanceState(storage);
  assert.deepEqual(loaded.vehicle, { condition: 100, engine: 100, tyres: 100 });
  assert.equal(loaded.serviceHistory.length, 0);
});
