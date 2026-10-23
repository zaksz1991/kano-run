import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createKanoTrafficBag, takeNextKanoTrafficType } from '../js/KanoTrafficCompositionRules.mjs';

const root = resolve(import.meta.dirname, '..');
const bootstrap = await readFile(resolve(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');
const upgrade = await readFile(resolve(root, 'js/KanoTrafficCompositionUpgrade.js'), 'utf8');
const rules = await readFile(resolve(root, 'js/KanoTrafficCompositionRules.mjs'), 'utf8');

test('one shuffled batch has exact 40/30/30 category counts', () => {
  const sequence = [0.13, 0.77, 0.25, 0.91, 0.33, 0.65, 0.08, 0.59, 0.47];
  let i = 0;
  const bag = createKanoTrafficBag(() => sequence[i++ % sequence.length]);
  assert.equal(bag.length, 10);
  assert.equal(bag.filter((v) => v === 'keke').length, 4);
  assert.equal(bag.filter((v) => v === 'motorcycle').length, 3);
  assert.equal(bag.filter((v) => v === 'car').length, 3);
});

test('each successive full batch remains exactly balanced', () => {
  const state = {};
  const spawned = Array.from({length: 30}, () => takeNextKanoTrafficType(state, () => 0.42));
  for (let offset = 0; offset < spawned.length; offset += 10) {
    const block = spawned.slice(offset, offset + 10);
    assert.equal(block.filter((v) => v === 'keke').length, 4);
    assert.equal(block.filter((v) => v === 'motorcycle').length, 3);
    assert.equal(block.filter((v) => v === 'car').length, 3);
  }
});

test('traffic hook only reassigns newly created vehicles', () => {
  assert.match(upgrade, /const existing = new Set\(getTraffic\(this\)\)/);
  assert.match(upgrade, /traffic\.filter\(\(vehicle\) => vehicle && !existing\.has\(vehicle\)\)/);
  assert.match(upgrade, /vehicle\.type = type/);
});

test("traffic mix rules do not change the vehicle's physical fields or collision code", () => {
  assert.match(upgrade, /vehicle\.type = type/);
  assert.doesNotMatch(upgrade, /vehicle\.(speed|speedKmh|lane|depth|x|z)\s*=/);
});

test('prototype patches are idempotent and additive', () => {
  assert.match(upgrade, /Symbol\.for\('kano\.life\.trafficComposition\.step100'\)/);
  assert.match(upgrade, /if \(typeof Game\.prototype\.spawnTraffic === 'function' && !Game\.prototype\[PATCH_KEY\]\)/);
  assert.match(upgrade, /originalSpawnTraffic\.apply\(this, args\)/);
});

test('actual Keke, okada, and sedan GLBs are preloaded before later traffic spawns', async () => {
  assert.match(upgrade, /\['keke', 'motorcycle', 'car'\]/);
  assert.match(upgrade, /manager\.load\(key\)/);
  assert.match(bootstrap, /KanoTrafficCompositionUpgrade\.js/);
  assert.ok(bootstrap.indexOf('KanoGameplayPresentationRepair.js') < bootstrap.indexOf('KanoTrafficCompositionUpgrade.js'));
  for (const path of [
    'public/assets/models/vehicles/keke/keke-3.glb',
    'public/assets/models/vehicles/special/okada.glb',
    'public/assets/models/vehicles/cars/quaternius_cc0-normal-car-1190.glb',
  ]) {
    assert.ok((await stat(resolve(root, path))).size > 10000, `${path} is missing or too small`);
  }
});

test('audit reports composition targets and the actual loaded asset path', () => {
  assert.match(upgrade, /window\.kanoTrafficCompositionAudit/);
  assert.match(upgrade, /target: \{ keke: 40, motorcycle: 30, car: 30 \}/);
  assert.match(upgrade, /model\?\.userData\?\.modelPath/);
});

test('pure balancing rules remain dependency-free and use shuffled ten-vehicle bags', () => {
  assert.match(rules, /KANO_TRAFFIC_BAG_SIZE = 10/);
  assert.match(rules, /Fisher–Yates/);
  assert.doesNotMatch(rules, /from ['"]three|from ['"]\.\/game/);
});
