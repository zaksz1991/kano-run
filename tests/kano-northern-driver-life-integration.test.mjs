import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

test('life-simulation module is loaded before gameplay startup is imported', async () => {
  const wrapper = await read('js/KanoModelAssetVisualUpgrade.js');
  const lifeImport = wrapper.indexOf("await import('./KanoNorthernDriverLifeSimulationUpgrade.js')");
  const gameplayImport = wrapper.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(lifeImport >= 0, 'life-simulation integration import must exist');
  assert.ok(gameplayImport > lifeImport, 'life-simulation patch must register before main.js is loaded');
});

test('profile supports young men and women and varied household arrangements', async () => {
  const simulation = await read('js/KanoNorthernDriverLifeSimulation.js');
  const integration = await read('js/KanoNorthernDriverLifeSimulationUpgrade.js');
  for (const value of ['male', 'female', 'family_compound', 'single_room', 'shared_flat', 'married_household', 'independent', 'contribute', 'provider']) {
    assert.ok(simulation.includes(value) || integration.includes(value), `expected profile option ${value}`);
  }
  assert.match(integration, /name="gender"/);
  assert.match(integration, /name="age"/);
});

test('life ledger is limited to Career and Free roam and reads the existing banked transaction', async () => {
  const integration = await read('js/KanoNorthernDriverLifeSimulationUpgrade.js');
  const simulation = await read('js/KanoNorthernDriverLifeSimulation.js');
  assert.match(integration, /\['career', 'freeRoam'\]/);
  assert.match(integration, /save\.banking\?\.transactions\?\.\[0\]/);
  assert.match(integration, /earned: afterTransaction\.earned/);
  assert.match(simulation, /mode_not_simulated/);
});

test('career profile saves goals, savings, arrears and existing wallet adjustments', async () => {
  const integration = await read('js/KanoNorthernDriverLifeSimulationUpgrade.js');
  const simulation = await read('js/KanoNorthernDriverLifeSimulation.js');
  for (const feature of ['klc-deposit-btn', 'klc-pay-arrears', 'klc-ownership', 'klc-goal']) assert.ok(integration.includes(feature));
  for (const feature of ['depositSavings', 'payArrears', 'vehicleOutstanding', 'lastVehicleChargeDay', 'lastHouseholdChargeDay']) assert.ok(simulation.includes(feature));
  assert.match(integration, /save\.money = settled\.wallet/);
});

test('cost claims are explicitly game-scaled and never advertised as market prices', async () => {
  const simulation = await read('js/KanoNorthernDriverLifeSimulation.js');
  const integration = await read('js/KanoNorthernDriverLifeSimulationUpgrade.js');
  assert.match(simulation, /game-scaled for playability, not market-price claims/);
  assert.match(integration, /scaled for this game's fractional arcade wallet/);
});
