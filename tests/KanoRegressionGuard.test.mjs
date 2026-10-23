import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const lines = (f) => read(f).split('\n').length;
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test('core files were not replaced by older, shorter copies', () => {
  assert.ok(lines('js/KanoGameplayPresentationRepair.js') > 5000, 'presentation repair was truncated (it holds REVERSE, crowd budgets, traffic selector)');
  assert.ok(lines('js/renderer3d.js') > 5000, 'renderer3d.js was truncated');
  assert.ok(lines('js/game.js') > 2000, 'game.js was truncated');
});

test('startup chain still loads the core life-sim modules and the career bind guard', () => {
  const boot = read('js/KanoModelAssetVisualUpgrade.js');
  for (const m of ['KanoNorthernDriverLifeSimulationUpgrade', 'KanoLifeCareerBindGuard', 'KanoNorthernDriverRealLifeUpgrade', 'KanoNorthernDriverPassengerRelationshipsUpgrade', 'KanoNorthernDriverParkOperationsUpgrade', 'KanoStreetRhythmUpgrade', 'KanoGameplayPresentationRepair']) {
    assert.ok(boot.includes(`${m}.js`), `startup chain no longer imports ${m}`);
  }
});

test('reverse gear control is still installed', () => {
  assert.match(read('js/KanoGameplayPresentationRepair.js'), /reverse-btn/);
});

test('real model files were not deleted (asset count and size floor)', () => {
  const glbs = walk(path.join(root, 'public/assets/models')).filter((f) => f.endsWith('.glb'));
  assert.ok(glbs.length >= 100, `only ${glbs.length} GLB files remain; real models were deleted`);
  const bytes = glbs.reduce((s, f) => s + fs.statSync(f).size, 0);
  assert.ok(bytes > 25e6, 'model folder is suspiciously small; real models may have been replaced by placeholders');
});
