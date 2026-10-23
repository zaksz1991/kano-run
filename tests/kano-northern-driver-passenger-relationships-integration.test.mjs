import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../js/${file}`, import.meta.url), 'utf8');

test('visual upgrade bootstrap loads passenger relationships before presentation startup completes', async () => {
  const source = await read('KanoModelAssetVisualUpgrade.js');
  assert.match(source, /await import\('\.\/KanoNorthernDriverPassengerRelationshipsUpgrade\.js'\)/);
  assert.ok(source.indexOf("KanoNorthernDriverPassengerRelationshipsUpgrade.js") < source.indexOf("KanoGameplayPresentationRepair.js"));
});

test('runtime integration records only actual new boardings', async () => {
  const source = await read('KanoNorthernDriverPassengerRelationshipsUpgrade.js');
  assert.match(source, /Game\.prototype\.pickup/);
  assert.match(source, /afterPassengers\.length > before/);
  assert.match(source, /recordBoarding\(passenger/);
});

test('runtime integration records actual drops after the game confirms a successful drop-off', async () => {
  const source = await read('KanoNorthernDriverPassengerRelationshipsUpgrade.js');
  assert.match(source, /Game\.prototype\.drop/);
  assert.match(source, /afterDrops > beforeDrops/);
  assert.match(source, /recordTrip\(/);
  assert.match(source, /recordPassengerService/);
});

test('repeat passenger fare adjustment remains small and does not manipulate the wallet', async () => {
  const source = await read('KanoNorthernDriverPassengerRelationshipsUpgrade.js');
  const service = await read('KanoNorthernDriverPassengerRelationships.js');
  assert.match(source, /Math\.floor\(Number\(passenger\.fare\) \* record\.fareMultiplier\)/);
  assert.match(service, /1\.03/);
  assert.match(service, /0\.97/);
  assert.doesNotMatch(source, /save\.money\s*[+\-]?=/);
});

test('panel builds UI safely with textContent and reports current passengers without HTML injection', async () => {
  const source = await read('KanoNorthernDriverPassengerRelationshipsUpgrade.js');
  assert.match(source, /identity\.textContent = person\.name/);
  assert.match(source, /kano:passenger-relationship-updated/);
  assert.match(source, /kano-passenger-relationships-panel/);
});


test('completed trip feeds the existing social passenger-respect meter without an extra wallet transaction', async () => {
  const runtime = await read('KanoNorthernDriverPassengerRelationshipsUpgrade.js');
  const social = await read('KanoNorthernDriverRealLife.js');
  const api = await read('KanoNorthernDriverRealLifeUpgrade.js');
  assert.match(runtime, /kanoNorthernDriverRealLife\?\.recordPassengerService/);
  assert.match(social, /recordPassengerService\(/);
  assert.match(social, /meters\.passengerRespect = clamp/);
  assert.match(api, /recordPassengerService: details =>/);
});
