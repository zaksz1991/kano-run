import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSafeKekeVehiclePath,
  sanitizeKekeCatalogSource,
  sanitizeCatalogReport,
} from '../scripts/keke-catalog-safety.mjs';

test('allows an ordinary existing vehicle GLB path', () => {
  assert.equal(isSafeKekeVehiclePath('vehicles/keke/keke-3.glb'), true);
});

test('rejects a female character named keke as a player vehicle', () => {
  assert.equal(isSafeKekeVehiclePath('characters/pedestrians/keke female.glb'), false);
});

test('rejects human-labelled models misfiled inside the vehicles tree', () => {
  assert.equal(isSafeKekeVehiclePath('vehicles/keke/keke_driver_female.glb'), false);
});

test('rejects non-GLB, traversal, and non-vehicle paths', () => {
  assert.equal(isSafeKekeVehiclePath('../vehicles/keke.glb'), false);
  assert.equal(isSafeKekeVehiclePath('world/props/keke.glb'), false);
  assert.equal(isSafeKekeVehiclePath('vehicles/keke/readme.txt'), false);
});

test('sanitizes the transformed generated CATALOG without rewriting unrelated code', () => {
  const source = `const CATALOG = {\n  "keke": ["characters/pedestrians/keke female.glb", "vehicles/keke/keke-3.glb"],\n  "building": ["world/buildings/a.glb"]\n};\n// MODEL DIMENSIONS\nconst TARGET_HEIGHT = {};\n// KANO GLB VARIANT ACTIVATION PATCH\nexport class ModelManager {}`;
  const result = sanitizeKekeCatalogSource(source);
  assert.match(result.code, /KANO KEKE VEHICLE-CATEGORY SAFETY GUARD/);
  assert.match(result.code, /vehicles\/keke\/keke-3\.glb/);
  assert.doesNotMatch(result.code, /characters\/pedestrians\/keke female\.glb/);
  assert.match(result.code, /world\/buildings\/a\.glb/);
  assert.equal(result.audit.excludedNonVehicleOrHumanPaths.length, 1);
});

test('leaves the original non-transformed catalogue intact when no GLB scan ran', () => {
  const source = `const CATALOG = { keke: ['vehicles/keke.glb'] };\n// MODEL DIMENSIONS\nconst TARGET_HEIGHT = {};`;
  const result = sanitizeKekeCatalogSource(source);
  assert.equal(result.code, source);
  assert.equal(result.audit, null);
});

test('sanitizes generated audit categories and recomputes unclassified files', () => {
  const report = {
    catalog: { keke: ['characters/pedestrians/keke female.glb', 'vehicles/keke/keke-3.glb'], pedestrianWoman: ['characters/pedestrians/keke female.glb'] },
    categoryCounts: { keke: 2, pedestrianWoman: 1 },
    files: [
      { path: 'characters/pedestrians/keke female.glb', categories: ['keke', 'pedestrianWoman'], classified: true },
      { path: 'vehicles/keke/keke-3.glb', categories: ['keke'], classified: true },
    ],
  };
  const result = sanitizeCatalogReport(report);
  assert.deepEqual(result.report.catalog.keke, ['vehicles/keke/keke-3.glb']);
  assert.equal(result.report.categoryCounts.keke, 1);
  assert.deepEqual(result.report.files[0].categories, ['pedestrianWoman']);
  assert.deepEqual(result.report.unclassified, []);
});

test('chooses an explicit fallback state rather than allowing a human if no vehicle candidate remains', () => {
  const source = `const CATALOG = {\n  "keke": ["characters/pedestrians/keke female.glb"]\n};\n// MODEL DIMENSIONS\nconst TARGET_HEIGHT = {};\n// KANO GLB VARIANT ACTIVATION PATCH\nexport class ModelManager {}`;
  const result = sanitizeKekeCatalogSource(source);
  assert.match(result.code, /"keke": \[\]/);
  assert.equal(result.audit.fallbackRequired, true);
});
