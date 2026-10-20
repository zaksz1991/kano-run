import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanGlbCatalog, createGlbCatalogSyncPlugin } from '../scripts/glb-catalog-sync.mjs';

function writeMinimalGlb(filePath, internalName) {
  const doc = JSON.stringify({
    asset: { version: '2.0', generator: 'Kano GLB scanner test' },
    scenes: [{ name: internalName }],
    nodes: [{ name: internalName }],
  });
  const jsonBytes = Buffer.from(doc, 'utf8');
  const paddedLength = Math.ceil(jsonBytes.length / 4) * 4;
  const paddedJson = Buffer.alloc(paddedLength, 0x20);
  jsonBytes.copy(paddedJson);
  const totalLength = 12 + 8 + paddedJson.length;
  const glb = Buffer.alloc(totalLength);
  glb.write('glTF', 0, 'ascii');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(paddedJson.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(glb, 20);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, glb);
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kano-glb-catalog-'));
  const modelRoot = path.join(root, 'public', 'assets', 'models');
  writeMinimalGlb(path.join(modelRoot, 'vehicles', 'keke', 'renamed-tricycle-01.glb'), 'KekeMesh');
  writeMinimalGlb(path.join(modelRoot, 'vehicles', 'cars', 'renamed-sedan-01.glb'), 'SedanMesh');
  writeMinimalGlb(path.join(modelRoot, 'world', 'buildings-suburban', 'house-type-one.glb'), 'HouseMesh');
  writeMinimalGlb(path.join(modelRoot, 'world', 'flyover-kano.glb'), 'FlyoverMesh');
  writeMinimalGlb(path.join(modelRoot, 'environment', 'ground', 'surface-variant-a.glb'), 'GroundMesh');
  writeMinimalGlb(path.join(modelRoot, 'characters', 'passengers', 'renamed-person-01.glb'), 'PassengerMesh');
  return { root, modelRoot };
}

test('scanner accepts object candidates in uniqueSorted and discovers renamed GLBs', async (t) => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = await scanGlbCatalog(modelRoot);

  assert.equal(report.discoveredCount, 6);
  assert.deepEqual(report.catalog.keke, ['vehicles/keke/renamed-tricycle-01.glb']);
  assert.deepEqual(report.catalog.building, ['world/buildings-suburban/house-type-one.glb']);
  assert.deepEqual(report.catalog.flyover, ['world/flyover-kano.glb']);
  assert.deepEqual(report.catalog.dirtmound, ['environment/ground/surface-variant-a.glb']);
  assert.deepEqual(report.catalog.passenger, ['characters/passengers/renamed-person-01.glb']);
  assert.equal(report.files.length, 6);
});

test('plugin transforms ModelManager catalog using scanned paths', async (t) => {
  const { root } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugin = createGlbCatalogSyncPlugin();
  await plugin.configResolved({ root, publicDir: 'public' });
  const source = 'const CATALOG = {\n  old: []\n};\n\n// MODEL DIMENSIONS\nconst MODEL_DIMENSIONS = {};';
  const result = await plugin.transform(source, path.join(root, 'js', 'ModelManager.js'));
  assert.ok(result?.code);
  assert.match(result.code, /vehicles\/keke\/renamed-tricycle-01\.glb/);
  assert.match(result.code, /world\/buildings-suburban\/house-type-one\.glb/);
  assert.doesNotMatch(result.code, /old: \[\]/);
});
