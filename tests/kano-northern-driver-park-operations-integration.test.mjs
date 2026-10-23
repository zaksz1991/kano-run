import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../js/${name}`, import.meta.url), 'utf8');

test('model visual bootstrap loads park operations after passenger relationship hooks', async () => {
  const source = await read('KanoModelAssetVisualUpgrade.js');
  const passengerIndex = source.indexOf("await import('./KanoNorthernDriverPassengerRelationshipsUpgrade.js')");
  const parkIndex = source.indexOf("await import('./KanoNorthernDriverParkOperationsUpgrade.js')");
  assert.ok(passengerIndex >= 0);
  assert.ok(parkIndex > passengerIndex);
});

test('park operations integrate into Game.start and listen to actual passenger outcomes', async () => {
  const source = await read('KanoNorthernDriverParkOperationsUpgrade.js');
  assert.match(source, /Game\.prototype\.start/);
  assert.match(source, /kano:passenger-relationship-updated/);
  assert.match(source, /trip_completed/);
  assert.match(source, /operations\.recordTrip/);
  assert.match(source, /operations\.recordBoarding/);
});

test('park token is optional and uses the existing banked wallet only after explicit click', async () => {
  const source = await read('KanoNorthernDriverParkOperationsUpgrade.js');
  const engine = await read('KanoNorthernDriverParkOperations.js');
  assert.match(source, /kpo-pay-token/);
  assert.match(source, /save\.money\s*=/);
  assert.match(engine, /not_on_duty/);
  assert.match(engine, /insufficient_wallet/);
  assert.match(engine, /already_paid/);
  assert.doesNotMatch(engine, /state\.wallet\s*=/);
  assert.doesNotMatch(engine, /state\.money\s*=/);
});

test('use-stand action maps to a real configured game route and persists it', async () => {
  const source = await read('KanoNorthernDriverParkOperationsUpgrade.js');
  assert.match(source, /ROUTES\.find/);
  assert.match(source, /save\.routeId\s*=\s*route\.id/);
  assert.match(source, /route-select/);
});
