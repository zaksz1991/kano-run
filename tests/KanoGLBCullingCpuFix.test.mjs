import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/KanoGameplayPresentationRepair.js', import.meta.url), 'utf8');
const functionBody = (name, nextName) => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const end = nextName ? source.indexOf(`\nfunction ${nextName}(`, start) : -1;
  assert.notEqual(end, -1, `${nextName} follows ${name}`);
  return source.slice(start, end);
};

test('GLB mesh preparation is cached and retains frustum culling', () => {
  const body = functionBody('kanoPrepareVisibleGlbRoot', 'kanoRepairBuildingSlotTransform');
  assert.match(body, /kanoGlbVisibilityPrepared === true/);
  assert.match(body, /node\.frustumCulled = true/);
  assert.match(body, /computeBoundingBox\?\.\(\)/);
  assert.match(body, /computeBoundingSphere\?\.\(\)/);
  assert.doesNotMatch(body, /root\.visible\s*=\s*true/);
});

test('GLB visibility repair is throttled and only traverses the active scene', () => {
  const body = functionBody('kanoRepairRendererGlbVisibility', 'kanoBuildWorldFramingReport');
  assert.match(body, /renderer\.mobile \? 450 : 250/);
  assert.match(body, /renderer\.__kanoGlbVisibilityLastPassAtMs/);
  assert.match(body, /activeScene === 'road'/);
  assert.match(body, /activeScene === 'garage'/);
  assert.match(body, /renderer\.lifeSceneGroups\?\.get\?\./);
  assert.doesNotMatch(body, /renderer\.lifeDioramaRoot\?\.traverse/);
});
