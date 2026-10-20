import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanGlbCatalog, createGlbCatalogSyncPlugin, patchModelManagerVariants, patchRenderer3dModelActivation } from '../scripts/glb-catalog-sync.mjs';

function writeTinyGlb(filePath, names = []) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'Test GLB' },
    scene: 0,
    scenes: [{ nodes: names.map((_, index) => index) }],
    nodes: names.map((name) => ({ name })),
    meshes: [],
    materials: [],
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

function variantTestModelManagerSource() {
  return `const CATALOG = {
  keke: ['vehicles/keke/old-name.glb'],
};
// ============================================================
// MODEL DIMENSIONS
const TARGET_HEIGHT = {};
export class ModelManager {
  constructor({ basePath = '/assets/models/' } = {}) {
    this.basePath = basePath.endsWith('/') ? basePath : basePath + '/';
    this.cache = new Map();
    this.pending = new Map();
    this.failed = new Set();
    this.disposed = false;
  }
  async load(key) { return this.cache.get(key) || null; }
  async preload(keys) {
    if (this.disposed) return [];
    return Promise.all([...new Set(keys)].map((key) => this.load(key)));
  }
  // ----------------------------------------------------------
  // GET INSTANCE
  getInstance(key) {
    if (this.disposed) return null;
    const model = this.cache.get(key);

    if (!model) return null;
    const clone = model.clone(true);
    return clone;
  }
  getStatus() {
    return {
      loaded: [...this.cache.keys()],
      pending: [...this.pending.keys()],
      failed: [...this.failed.keys()],
      disposed: this.disposed,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    disposeModelResources(
      [...this.cache.values()],
    );

    this.cache.clear();
    this.failed.clear();
    this.pending.clear();
  }
}
`;
}

test('scan uses the exact current renamed GLB paths', async (t) => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = await scanGlbCatalog(modelRoot);
  assert.equal(report.discoveredCount, 5);
  assert.deepEqual(report.catalog.keke, ['vehicles/keke/Adaidaita-Renamed.glb']);
  assert.deepEqual(report.catalog.building, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.deepEqual(report.catalog.dirtmound, ['environment/ground/surface-revised.glb']);
  assert.ok(report.catalog.passengerWoman.includes('characters/passengers/hijab-person-v3.glb'));
  assert.ok(report.files.every((entry) => entry.path.endsWith('.glb')));
});

test('Vite transform replaces the stale CATALOG without modifying other modules', async (t) => {
  const { root } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugin = createGlbCatalogSyncPlugin();
  await plugin.configResolved({ root, publicDir: path.join(root, 'public') });
  const source = variantTestModelManagerSource();
  const transformed = await plugin.transform(source, path.join(root, 'js', 'ModelManager.js'));
  assert.ok(transformed.code.includes('Adaidaita-Renamed.glb'));
  assert.ok(!transformed.code.includes('old-name.glb'));
  assert.ok(transformed.code.includes('// MODEL DIMENSIONS'));
  assert.ok(transformed.code.includes('warmVariantPools(uniqueKeys)'));
  assert.ok(transformed.code.includes('variantPools: Object.fromEntries'));
  assert.ok(transformed.code.includes('KANO GLB VARIANT ACTIVATION PATCH'));
  assert.equal(await plugin.transform(source, path.join(root, 'js', 'game.js')), null);
});

test('manual override maps generic renamed world models to explicitly chosen categories', async (t) => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const overridesFile = path.join(root, 'scripts', 'glb-catalog-overrides.json');
  fs.mkdirSync(path.dirname(overridesFile), { recursive: true });
  fs.writeFileSync(overridesFile, JSON.stringify({
    schemaVersion: 1,
    categories: {
      marketStall: ['world/buildings-suburban/frontage-renamed.glb'],
      busStop: [],
    },
    exclude: {},
  }));
  const report = await scanGlbCatalog(modelRoot, overridesFile);
  assert.deepEqual(report.catalog.marketStall, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.deepEqual(report.catalog.busStop, []);
  const frontage = report.files.find((entry) => entry.path === 'world/buildings-suburban/frontage-renamed.glb');
  assert.ok(frontage.categories.includes('marketStall'));
  assert.equal(report.overrideAudit.status, 'applied');
  assert.ok(report.overrideAudit.appliedCategories.includes('marketStall'));
});

test('invalid all-missing override preserves automatic category and reports exact filename mismatch', async (t) => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const overridesFile = path.join(root, 'scripts', 'glb-catalog-overrides.json');
  fs.mkdirSync(path.dirname(overridesFile), { recursive: true });
  fs.writeFileSync(overridesFile, JSON.stringify({
    schemaVersion: 1,
    categories: { building: ['world/buildings-suburban/Frontage-Renamed.glb'] },
    exclude: {},
  }));
  const report = await scanGlbCatalog(modelRoot, overridesFile);
  assert.deepEqual(report.catalog.building, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.ok(report.overrideAudit.errors.some((line) => line.includes('Filename case does not match')));
  assert.equal(report.overrideAudit.status, 'needs_attention');
});

test('valid entries win when a category mixes found and missing paths', async (t) => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const overridesFile = path.join(root, 'scripts', 'glb-catalog-overrides.json');
  fs.mkdirSync(path.dirname(overridesFile), { recursive: true });
  fs.writeFileSync(overridesFile, JSON.stringify({
    schemaVersion: 1,
    categories: { building: [
      'world/buildings-suburban/frontage-renamed.glb',
      'world/missing-other-frontage.glb'
    ] },
    exclude: { dirtmound: ['environment/ground/surface-revised.glb'] },
  }));
  const report = await scanGlbCatalog(modelRoot, overridesFile);
  assert.deepEqual(report.catalog.building, ['world/buildings-suburban/frontage-renamed.glb']);
  assert.ok(!report.catalog.dirtmound.includes('environment/ground/surface-revised.glb'));
  assert.ok(report.overrideAudit.missingPaths.includes('world/missing-other-frontage.glb'));
  assert.equal(report.overrideAudit.status, 'applied_with_warnings');
});

test('Vite transform uses manually overridden catalog paths and ignores other modules', async (t) => {
  const { root, modelRoot } = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const overridesFile = path.join(root, 'scripts', 'glb-catalog-overrides.json');
  fs.mkdirSync(path.dirname(overridesFile), { recursive: true });
  fs.writeFileSync(overridesFile, JSON.stringify({
    schemaVersion: 1,
    categories: { marketStall: ['world/buildings-suburban/frontage-renamed.glb'] },
    exclude: {},
  }));
  const plugin = createGlbCatalogSyncPlugin();
  await plugin.configResolved({ root, publicDir: path.join(root, 'public') });
  const source = variantTestModelManagerSource();
  const transformed = await plugin.transform(source, path.join(root, 'js', 'ModelManager.js'));
  assert.ok(transformed.code.includes('frontage-renamed.glb'));
  assert.ok(transformed.code.includes('marketStall'));
  assert.ok(!transformed.code.includes('old-name.glb'));
  assert.equal(await plugin.transform(source, path.join(root, 'js', 'game.js')), null);
});


test('variant transformer is idempotent and refuses unsupported ModelManager layouts', () => {
  const first = patchModelManagerVariants(variantTestModelManagerSource());
  const second = patchModelManagerVariants(first);
  assert.equal(second, first);
  assert.ok(first.includes('async warmVariantPools(keys)'));
  assert.ok(first.includes('kanoVariantPolicyFor'));
  assert.ok(first.includes('this.variantCache.clear()'));
  const syntaxPath = path.join(os.tmpdir(), `kano-variant-transform-${process.pid}.mjs`);
  fs.writeFileSync(syntaxPath, first);
  try { execFileSync(process.execPath, ['--check', syntaxPath]); } finally { fs.rmSync(syntaxPath, { force: true }); }
  assert.throws(() => patchModelManagerVariants('export class ModelManager {}'), /constructor markers were not found/);
});


function rendererFixture() {
  return `import * as THREE from 'three';
export class Renderer3D {
  constructor(canvas, models, { mobile = false } = {}) {
    this.canvas = canvas;
    this.models = models;
    this.mobile = mobile;
    this.ready = false;
    this.buildWorld();
    this.player = this.makeKeke();
    this.buildGarageScene();
    this.buildLifeDioramas();

    this.ready = true;
  }

  buildWorld() {
    const buildingCount = this.mobile ? 10 : 24;
    for (let index = 0; index < buildingCount; index += 1) {
      const side = index % 2 ? 1 : -1;
      const x = side * (9 + (index % 3) * 2.8);
      const height = 2.2 + (index % 4) * 0.7;
      this.buildingSlots.push({ x, height, side, industrial: index % 6 === 3, replaced: false });
    }
  }

  buildSidewalkLife() {
    if (!this.mobile) {
      for (let index = 0; index < 6; index += 1) {
        for (const side of [-1, 1]) {
          const pole = new THREE.Group();
          pole.position.set(side * 7.6, 0, -24 - index * 34);
          pole.userData.proceduralStreetLight = true;
          this.world.add(pole);
          this.streetLights.push(pole);
        }
      }
    }
  }

  buildRoadsideProps() {
    const count = this.mobile ? 5 : 10;
  }


  upgradeWorldAssets() {
    if (!this.models) return;
    const activeBuildingSlots = this.mobile
      ? this.buildingSlots.slice(0, 2)
      : this.buildingSlots;
    for (const slot of activeBuildingSlots) {
      if (slot.replaced) continue;
      const key = slot.industrial ? 'industrialBuilding' : 'building';
      if (!this.models.cache.has(key)) continue;
      const model = this.models.getInstance(key);
      if (!model) continue;
      const normalizedHeight =
        model.userData.targetHeight ||
        (slot.industrial ? 5.2 : 4.5);
      model.scale.multiplyScalar(
        slot.height / normalizedHeight,
      );
      model.position.set(slot.x, 0, slot.z);
      this.world.remove(slot.actor);
      this.world.add(model);
      slot.actor = model;
      slot.replaced = true;
    }
  }
}
`;
}

test('renderer activation upgrades all mobile building slots, frontage placement, size, props, and streetlights', () => {
  const source = rendererFixture();
  const patched = patchRenderer3dModelActivation(source);
  assert.ok(patched.includes('const activeBuildingSlots = this.buildingSlots;'));
  assert.ok(patched.includes('this.mobile ? 7.8 + (index % 3) * 1.9 : 9 + (index % 3) * 2.8'));
  assert.ok(patched.includes('model.userData.sceneDisplayHeight = displayHeight;'));
  assert.ok(patched.includes('const count = this.mobile ? 6 : 10;'));
  assert.ok(patched.includes('index < (this.mobile ? 3 : 6)'));
  assert.ok(patched.includes('getGlbSceneUsageReport()'));
  assert.ok(patched.includes('kanoDownloadGlbSceneUsageReport'));
  assert.ok(patched.includes('KANO GLB SCENE ACTIVATION AND AUDIT PATCH'));
});

test('renderer transformation is idempotent and generated source remains valid JavaScript', () => {
  const patched = patchRenderer3dModelActivation(rendererFixture());
  assert.equal(patchRenderer3dModelActivation(patched), patched);
  const syntaxPath = path.join(os.tmpdir(), `kano-renderer-transform-${process.pid}.mjs`);
  fs.writeFileSync(syntaxPath, patched);
  try {
    execFileSync(process.execPath, ['--check', syntaxPath]);
  } finally {
    fs.rmSync(syntaxPath, { force: true });
  }
});

test('Vite plugin transforms renderer even independently of the GLB catalog', async () => {
  const plugin = createGlbCatalogSyncPlugin();
  const transformed = await plugin.transform(rendererFixture(), '/repo/js/renderer3d.js');
  assert.ok(transformed?.code.includes('KANO GLB SCENE ACTIVATION AND AUDIT PATCH'));
  assert.ok(transformed?.code.includes('this.buildingSlots;'));
});
