import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanGlbCatalog, createGlbCatalogSyncPlugin } from '../scripts/glb-catalog-sync.mjs';

function writeTinyGlb(filePath, names = []) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'Test GLB' },
    scene: 0,
    scenes: [{ nodes: names.map((_, index) => index) }],
    nodes: names.map(name => ({ name })), meshes: [], materials: [],
  });
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const jsonBytes = Buffer.alloc(paddedLength, 0x20);
  jsonBytes.write(json, 0, 'utf8');
  const header = Buffer.alloc(20);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + paddedLength, 8);
  header.writeUInt32LE(paddedLength, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  fs.writeFileSync(filePath, Buffer.concat([header, jsonBytes]));
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kano-glb-catalog-'));
  const modelRoot = path.join(root, 'public', 'assets', 'models');
  writeTinyGlb(path.join(modelRoot, 'vehicles', 'keke', 'Adaidaita-Renamed.glb'), ['Keke Body']);
  writeTinyGlb(path.join(modelRoot, 'vehicles', 'cars', 'car-body-final.glb'), ['Sedan']);
  writeTinyGlb(path.join(modelRoot, 'characters', 'passengers', 'hijab-person-v3.glb'), ['Woman in Hijab']);
  writeTinyGlb(path.join(modelRoot, 'world', 'buildings-suburban', 'frontage-renamed.glb'), ['Shopfront']);
  writeTinyGlb(path.join(modelRoot, 'environment', 'ground', 'surface-revised.glb'), ['Broken Asphalt Pothole']);
  return { root, modelRoot };
}

function modelManagerFixture() {
  return `const CATALOG = {
  keke: ['vehicles/keke/old-name.glb'],
};
// MODEL DIMENSIONS
export class ModelManager {
  async load(key) { return key; }
  getInstance(key) { return this.cache?.get(key) || null; }
}
`;
}

test('catalog scan uses exact current GLB paths and asset content hints', async t => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = await scanGlbCatalog(modelRoot);
  assert.equal(report.discoveredCount, 5);
  assert.deepEqual(report.catalog.keke, ['vehicles/keke/Adaidaita-Renamed.glb']);
  assert.deepEqual(report.catalog.building, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.deepEqual(report.catalog.dirtmound, ['environment/ground/surface-revised.glb']);
  assert.ok(report.catalog.passengerWoman.includes('characters/passengers/hijab-person-v3.glb'));
  assert.ok(report.files.every(entry => entry.path.endsWith('.glb')));
});

test('catalog safety rules do not reclassify a character as the player keke', async t => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = await scanGlbCatalog(modelRoot);
  assert.ok(report.catalog.keke.every(modelPath => modelPath.startsWith('vehicles/')));
  assert.ok(!report.catalog.keke.includes('characters/passengers/hijab-person-v3.glb'));
  assert.ok(report.catalog.passengerWoman.includes('characters/passengers/hijab-person-v3.glb'));
});

test('Vite transform replaces only the stale CATALOG with the current inventory', async t => {
  const { root } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugin = createGlbCatalogSyncPlugin();
  await plugin.configResolved({ root, publicDir: path.join(root, 'public') });
  const source = modelManagerFixture();
  const transformed = await plugin.transform(source, path.join(root, 'js', 'ModelManager.js'));
  assert.ok(transformed?.code.includes('Adaidaita-Renamed.glb'));
  assert.ok(transformed?.code.includes('frontage-renamed.glb'));
  assert.ok(!transformed?.code.includes('old-name.glb'));
  assert.ok(transformed?.code.includes('// MODEL DIMENSIONS'));
  assert.ok(transformed?.code.includes('async load(key) { return key; }'));
  assert.ok(transformed?.code.includes('getInstance(key)'));
});

test('catalog transform leaves game, renderer and unrelated modules untouched', async t => {
  const { root } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugin = createGlbCatalogSyncPlugin();
  await plugin.configResolved({ root, publicDir: path.join(root, 'public') });
  const source = modelManagerFixture();
  assert.equal(await plugin.transform(source, path.join(root, 'js', 'game.js')), null);
  assert.equal(await plugin.transform(source, path.join(root, 'js', 'renderer3d.js')), null);
  assert.equal(await plugin.transform(source, path.join(root, 'js', 'ui.js')), null);
});

test('manual category override maps a renamed world model to the explicitly chosen category', async t => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const overridesFile = path.join(root, 'scripts', 'glb-catalog-overrides.json');
  fs.mkdirSync(path.dirname(overridesFile), { recursive: true });
  fs.writeFileSync(overridesFile, JSON.stringify({ schemaVersion: 1, categories: { marketStall: ['world/buildings-suburban/frontage-renamed.glb'], busStop: [] }, exclude: {} }));
  const report = await scanGlbCatalog(modelRoot, overridesFile);
  assert.deepEqual(report.catalog.marketStall, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.deepEqual(report.catalog.busStop, []);
  const frontage = report.files.find(entry => entry.path === 'world/buildings-suburban/frontage-renamed.glb');
  assert.ok(frontage.categories.includes('marketStall'));
  assert.ok(!report.overrideWarnings.some(line => line.includes('frontage-renamed.glb')));
});

test('case-mismatched override reports the exact mismatch and preserves safe automatic candidates', async t => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const overridesFile = path.join(root, 'scripts', 'glb-catalog-overrides.json');
  fs.mkdirSync(path.dirname(overridesFile), { recursive: true });
  fs.writeFileSync(overridesFile, JSON.stringify({ schemaVersion: 1, categories: { building: ['world/buildings-suburban/Frontage-Renamed.glb'] }, exclude: {} }));
  const report = await scanGlbCatalog(modelRoot, overridesFile);
  assert.deepEqual(report.catalog.building, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.ok(report.overrideWarnings.some(line => line.includes('Frontage-Renamed.glb') && /case-sensitive|not found/i.test(line)));
});

test('valid override paths win when a category mixes found and missing files', async t => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const overridesFile = path.join(root, 'scripts', 'glb-catalog-overrides.json');
  fs.mkdirSync(path.dirname(overridesFile), { recursive: true });
  fs.writeFileSync(overridesFile, JSON.stringify({ schemaVersion: 1, categories: { building: ['world/buildings-suburban/frontage-renamed.glb', 'world/missing-other-frontage.glb'] }, exclude: { dirtmound: ['environment/ground/surface-revised.glb'] } }));
  const report = await scanGlbCatalog(modelRoot, overridesFile);
  assert.deepEqual(report.catalog.building, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.ok(!report.catalog.dirtmound.includes('environment/ground/surface-revised.glb'));
  assert.ok(report.overrideWarnings.some(line => line.includes('world/missing-other-frontage.glb')));
});

test('an empty model inventory leaves the original static model catalogue unchanged', async t => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(modelRoot, { recursive: true, force: true });
  const plugin = createGlbCatalogSyncPlugin();
  await plugin.configResolved({ root, publicDir: path.join(root, 'public') });
  assert.equal(await plugin.transform(modelManagerFixture(), path.join(root, 'js', 'ModelManager.js')), null);
});

test('plugin does not mutate the fixture source object between transforms', async t => {
  const { root } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugin = createGlbCatalogSyncPlugin();
  await plugin.configResolved({ root, publicDir: path.join(root, 'public') });
  const source = modelManagerFixture();
  const original = source;
  await plugin.transform(source, path.join(root, 'js', 'ModelManager.js'));
  assert.equal(source, original);
  assert.ok(source.includes('old-name.glb'));
});
