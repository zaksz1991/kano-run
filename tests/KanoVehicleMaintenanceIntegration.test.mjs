import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('maintenance UI requires the authoritative LIFE & CAREER wallet API for paid service', async () => {
  const source = await read('../js/KanoNorthernDriverVehicleMaintenanceUpgrade.js');
  assert.match(source, /window\.kanoNorthernDriverLifeSimulation/);
  assert.match(source, /life\.chargeExpense\(\{ amount: service\.cost/);
  assert.match(source, /No service was recorded or charged/);
});

test('service purchase checks the active shift before charging', async () => {
  const source = await read('../js/KanoNorthernDriverVehicleMaintenanceUpgrade.js');
  assert.match(source, /snapshot\?\.\(\)\.activeShift/);
  assert.match(source, /Finish the active shift before paying for a service/);
});

test('start hook applies persistent vehicle metrics and synchronizes the existing settlement baseline', async () => {
  const source = await read('../js/KanoNorthernDriverVehicleMaintenanceUpgrade.js');
  assert.match(source, /Game\.prototype\.start/);
  assert.match(source, /applyPersistentVehicleState\(this\.s, state\)/);
  assert.match(source, /syncActiveShiftStart\?\.\(this\.s\)/);
});

test('the next panel is loaded from the Step 52 household panel chain without editing main/game/renderer', async () => {
  const source = await read('../js/KanoNorthernDriverHouseholdBudgetUpgrade.js');
  assert.match(source, /await import\('\.\/KanoNorthernDriverVehicleMaintenanceUpgrade\.js'\)/);
});
