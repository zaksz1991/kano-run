import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUntriedKekeCatalogPaths,
  isRetryableKekeRejection,
  normalizeCataloguedKekePath,
  shouldStartKekeCatalogFailover,
} from '../js/KanoKekeCatalogFailoverRules.js';

const paths = [
  'vehicles/keke/keke-3.glb',
  'vehicles/keke/keke-1.glb',
  'vehicles/keke/keke-2.glb',
  'vehicles/keke/keke-4.glb',
];

test('normalizes catalogued paths and URL suffixes', () => {
  assert.equal(normalizeCataloguedKekePath('vehicles/keke/keke-3.glb'), 'vehicles/keke/keke-3.glb');
  assert.equal(normalizeCataloguedKekePath('/assets/models/vehicles/keke/keke-3.glb?v=2'), 'vehicles/keke/keke-3.glb');
  assert.equal(normalizeCataloguedKekePath('vehicles\\keke\\keke-8.glb'), 'vehicles/keke/keke-8.glb');
});

test('rejects unknown paths and traversal', () => {
  assert.equal(normalizeCataloguedKekePath('vehicles/keke/keke-9.glb'), '');
  assert.equal(normalizeCataloguedKekePath('../vehicles/keke/keke-3.glb'), '');
  assert.equal(normalizeCataloguedKekePath('/assets/models/characters/keke-3.glb'), '');
  assert.equal(normalizeCataloguedKekePath(null), '');
});

test('marks only known visual-structure failures as retryable', () => {
  assert.equal(isRetryableKekeRejection({ ok: false, reason: 'character-only-model-no-vehicle-structure' }), true);
  assert.equal(isRetryableKekeRejection({ ok: false, reason: 'implausible-keke-bounds' }), true);
  assert.equal(isRetryableKekeRejection({ ok: false, reason: 'http_404' }), false);
  assert.equal(isRetryableKekeRejection({ ok: true, reason: 'missing-vehicle-structure-evidence' }), false);
  assert.equal(isRetryableKekeRejection(null), false);
});

test('returns untried candidates in catalog order with duplicates removed', () => {
  assert.deepEqual(
    getUntriedKekeCatalogPaths(paths, new Set(['vehicles/keke/keke-3.glb', 'vehicles/keke/keke-2.glb'])),
    ['vehicles/keke/keke-1.glb', 'vehicles/keke/keke-4.glb'],
  );
  assert.deepEqual(getUntriedKekeCatalogPaths([paths[0], paths[0], 'bad-path'], []), [paths[0]]);
  assert.deepEqual(getUntriedKekeCatalogPaths(paths, paths), []);
});

test('starts failover only for a ready renderer and retryable catalogued rejection', () => {
  const good = {
    key: 'keke', ready: true, disposed: false,
    modelPath: paths[0], attemptsRemaining: 3,
    validation: { ok: false, reason: 'missing-vehicle-structure-evidence' },
  };
  assert.equal(shouldStartKekeCatalogFailover(good), true);
  assert.equal(shouldStartKekeCatalogFailover({ ...good, key: 'car' }), false);
  assert.equal(shouldStartKekeCatalogFailover({ ...good, ready: false }), false);
  assert.equal(shouldStartKekeCatalogFailover({ ...good, disposed: true }), false);
  assert.equal(shouldStartKekeCatalogFailover({ ...good, modelPath: 'characters/pedestrian.glb' }), false);
  assert.equal(shouldStartKekeCatalogFailover({ ...good, validation: { ok: false, reason: 'http_404' } }), false);
  assert.equal(shouldStartKekeCatalogFailover({ ...good, attemptsRemaining: 0 }), false);
});
