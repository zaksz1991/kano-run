import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentCategoryPaths,
  toggleCategoryPath,
  publicModelUrl,
  createOverridePayload,
  initialOverridesFromReport,
  currentAssignments,
} from '../js/glb-model-review-utils.js';

const sampleReport = {
  catalog: {
    building: ['world/frontage/Shop A.glb', 'world/frontage/House.glb'],
    marketStall: [],
    keke: ['vehicles/keke/renamed-tricycle.glb'],
  },
  overrideAudit: {
    appliedCategories: ['keke'],
    appliedExclusions: [{ category: 'building', path: 'world/frontage/House.glb' }],
  },
};

test('initial draft preserves active overrides and exclusions from the generated audit', () => {
  const draft = initialOverridesFromReport(sampleReport);
  assert.deepEqual(draft.categories.keke, ['vehicles/keke/renamed-tricycle.glb']);
  assert.deepEqual(draft.exclude.building, ['world/frontage/House.glb']);
  assert.equal(Object.hasOwn(draft.categories, 'building'), false);
});

test('adding a visual selection preserves the rest of the category as candidates', () => {
  const draft = initialOverridesFromReport(sampleReport);
  const result = toggleCategoryPath(sampleReport, draft, 'marketStall', 'world/frontage/Shop A.glb');
  assert.equal(result.action, 'added');
  assert.deepEqual(result.draft.categories.marketStall, ['world/frontage/Shop A.glb']);
  const addBuilding = toggleCategoryPath(sampleReport, result.draft, 'building', 'world/frontage/New Stall.glb');
  assert.deepEqual(addBuilding.draft.categories.building, [
    'world/frontage/House.glb',
    'world/frontage/New Stall.glb',
    'world/frontage/Shop A.glb',
  ]);
});

test('toggle removes only the selected path and can intentionally leave empty category', () => {
  let draft = initialOverridesFromReport(sampleReport);
  draft = toggleCategoryPath(sampleReport, draft, 'building', 'world/frontage/House.glb').draft;
  assert.deepEqual(draft.categories.building, ['world/frontage/Shop A.glb']);
  draft = toggleCategoryPath(sampleReport, draft, 'building', 'world/frontage/Shop A.glb').draft;
  assert.deepEqual(draft.categories.building, []);
});

test('model URLs encode spaces and preserve directory segments', () => {
  assert.equal(publicModelUrl('characters/passengers/woman arms crossed.glb'), '/assets/models/characters/passengers/woman%20arms%20crossed.glb');
  assert.throws(() => publicModelUrl('../secret.glb'), /Unsafe model path/);
});

test('exported override JSON contains only explicit categories while preserving exclusions', () => {
  let draft = initialOverridesFromReport(sampleReport);
  draft = toggleCategoryPath(sampleReport, draft, 'marketStall', 'world/frontage/Shop A.glb').draft;
  const output = createOverridePayload(draft);
  assert.equal(output.schemaVersion, 1);
  assert.deepEqual(output.categories, {
    keke: ['vehicles/keke/renamed-tricycle.glb'],
    marketStall: ['world/frontage/Shop A.glb'],
  });
  assert.deepEqual(output.exclude, { building: ['world/frontage/House.glb'] });
});

test('current assignments read draft categories before catalogue defaults', () => {
  const draft = initialOverridesFromReport(sampleReport);
  draft.categories.building = ['world/frontage/House.glb'];
  assert.deepEqual(currentCategoryPaths(sampleReport, draft, 'building'), ['world/frontage/House.glb']);
  assert.deepEqual(currentAssignments(sampleReport, draft, 'world/frontage/Shop A.glb'), []);
});
