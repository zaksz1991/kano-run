import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanGlbCatalog, createGlbCatalogSyncPlugin, makeCatalog, uniqueSorted } from '../scripts/glb-catalog-sync.mjs';

function writeTinyGlb(filePath, names = []) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'Kano test GLB' },
    scene: 0,
    scenes: [{ nodes: names.map((_, index) => index) }],
    nodes: names.map((name) => ({ name })),
    meshes: [],
    materials: [],
  });
  const paddedLength = Math.ceil(Buffer.byteLength(json) / 4) * 4;
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kano-glb-catalog-current-'));
  const modelRoot = path.join(root, 'public', 'assets', 'models');
  writeTinyGlb(path.join(modelRoot, 'vehicles', 'keke', 'Adaidaita-Renamed.glb'), ['Keke Body']);
  writeTinyGlb(path.join(modelRoot, 'vehicles', 'cars', 'car-body-final.glb'), ['Sedan']);
  writeTinyGlb(path.join(modelRoot, 'characters', 'passengers', 'hijab-person-v3.glb'), ['Woman in Hijab']);
  writeTinyGlb(path.join(modelRoot, 'world', 'buildings-suburban', 'frontage-renamed.glb'), ['Shopfront']);
  writeTinyGlb(path.join(modelRoot, 'environment', 'ground', 'surface-revised.glb'), ['Broken Asphalt Pothole']);
  return { root, modelRoot };
}

test('uniqueSorted handles strings and inventory records deterministically', () => {
  const records = [{ path: 'vehicles/keke/a.glb' }, { path: 'vehicles/cars/b.glb' }, { path: 'vehicles/keke/a.glb' }];
  assert.deepEqual(uniqueSorted(records).map((entry) => entry.path), ['vehicles/cars/b.glb', 'vehicles/keke/a.glb']);
  assert.deepEqual(uniqueSorted(['b.glb', 'a.glb', 'b.glb']), ['a.glb', 'b.glb']);
});

test('catalog scan discovers exact on-disk GLB paths and safely categorizes them', async (t) => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = await scanGlbCatalog(modelRoot);
  assert.equal(report.discoveredCount, 5);
  assert.deepEqual(report.catalog.keke, ['vehicles/keke/Adaidaita-Renamed.glb']);
  assert.deepEqual(report.catalog.building, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.deepEqual(report.catalog.dirtmound, ['environment/ground/surface-revised.glb']);
  assert.ok(report.catalog.passengerWoman.includes('characters/passengers/hijab-person-v3.glb'));
  assert.ok(report.files.every((entry) => entry.path.endsWith('.glb')));
  assert.equal(report.root, 'public/assets/models/');
});

test('catalog sync plugin replaces only the runtime CATALOG and preserves following code', async (t) => {
  const { root } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugin = createGlbCatalogSyncPlugin();
  await plugin.configResolved({ root, publicDir: path.join(root, 'public') });
  const source = "const CATALOG = { keke: ['old-name.glb'] };\n// MODEL DIMENSIONS\nconst TARGET_HEIGHT = { keke: 1.6 };\nexport const untouched = true;";
  const transformed = await plugin.transform(source, path.join(root, 'js', 'ModelManager.js'));
  assert.ok(transformed?.code.includes('Adaidaita-Renamed.glb'));
  assert.ok(!transformed.code.includes('old-name.glb'));
  assert.ok(transformed.code.includes('// MODEL DIMENSIONS'));
  assert.ok(transformed.code.includes('const TARGET_HEIGHT = { keke: 1.6 };'));
  assert.ok(transformed.code.includes('export const untouched = true;'));
  assert.equal(await plugin.transform(source, path.join(root, 'js', 'game.js')), null);
});

test('no discovered models leaves the static runtime catalog untouched', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kano-glb-catalog-empty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'public', 'assets', 'models'), { recursive: true });
  const plugin = createGlbCatalogSyncPlugin();
  await plugin.configResolved({ root, publicDir: path.join(root, 'public') });
  const source = "const CATALOG = { keke: ['existing-keke.glb'] };\n// MODEL DIMENSIONS\nconst TARGET_HEIGHT = {};";
  assert.equal(await plugin.transform(source, path.join(root, 'js', 'ModelManager.js')), null);
});

test('valid explicit overrides are applied and invalid paths preserve automatic safe candidates', async (t) => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const overridesPath = path.join(root, 'scripts', 'glb-catalog-overrides.json');
  fs.mkdirSync(path.dirname(overridesPath), { recursive: true });
  fs.writeFileSync(overridesPath, JSON.stringify({
    schemaVersion: 1,
    categories: {
      marketStall: ['world/buildings-suburban/frontage-renamed.glb'],
      keke: ['vehicles/keke/ADAIDAIta-missing.glb'],
    },
    exclude: {},
  }));
  const report = await scanGlbCatalog(modelRoot, overridesPath);
  assert.deepEqual(report.catalog.marketStall, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.deepEqual(report.catalog.keke, ['vehicles/keke/Adaidaita-Renamed.glb']);
  assert.ok(report.overrideWarnings.some((line) => line.includes('path not found')));
});

test('a character mentioning keke cannot become the player vehicle', () => {
  const report = makeCatalog([
    { path: 'characters/pedestrians/keke female.glb', hints: ['female pedestrian'], bytes: 100 },
    { path: 'vehicles/keke/real-keke.glb', hints: ['three wheeler'], bytes: 100 },
  ]);
  assert.deepEqual(report.catalog.keke, ['vehicles/keke/real-keke.glb']);
  assert.ok(report.unsafeKekeMatches.some((item) => item.path === 'characters/pedestrians/keke female.glb'));
});
