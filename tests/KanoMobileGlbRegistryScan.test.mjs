import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const presentation = await readFile(
  path.join(here, '../js/KanoGameplayPresentationRepair.js'),
  'utf8',
);

const start = presentation.indexOf('function kanoRepairRendererGlbVisibility(renderer) {');
const end = presentation.indexOf('\nif (!Renderer3D.prototype[KANO_GLB_VISIBILITY_TRANSFORM_PATCH])', start);
assert.ok(start >= 0 && end > start, 'GLB repair function must remain present');
const repairFunction = presentation.slice(start, end);

test('visibility pass does not recursively scan the whole world, garage, or life scene', () => {
  assert.doesNotMatch(repairFunction, /renderer\.world\?\.traverse/);
  assert.doesNotMatch(repairFunction, /renderer\.garageGroup\?\.traverse/);
  assert.doesNotMatch(repairFunction, /activeGroup\?\.traverse/);
  assert.match(repairFunction, /kanoPrepareMarkedGlbChildren\(renderer\.world, prepare\)/);
});

test('visibility pass uses known live GLB roots and environment instances', () => {
  assert.match(repairFunction, /renderer\.trafficActors\?\.values\?\.\(\)/);
  assert.match(repairFunction, /prepare\(renderer\.player\)/);
  assert.match(repairFunction, /environmentState\?\.details/);
  assert.match(repairFunction, /renderer\.zoneActors\?\.values\?\.\(\)/);
  assert.match(repairFunction, /renderer\.lifeAssetSlots/);
  assert.match(repairFunction, /renderer\.garageVehicleSlots/);
});

test('visibility repair remains throttled and prepares imported GLB bounds once', () => {
  assert.match(repairFunction, /const interval = renderer\.mobile \? 450 : 250/);
  assert.match(presentation, /root\.userData\.kanoGlbVisibilityPrepared === true/);
  assert.match(presentation, /node\.frustumCulled = true/);
  assert.match(presentation, /geometry\.userData\.kanoGlbCullingBoundsPrepared !== true/);
});

test('shallow registry scan checks direct children and one nested child level', () => {
  const helperStart = presentation.indexOf('function kanoPrepareMarkedGlbChildren(group, prepare) {');
  const helperEnd = presentation.indexOf('\nfunction kanoPrepareMarkedGlbCollection', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = presentation.slice(helperStart, helperEnd);
  assert.match(helper, /group\?\.children/);
  assert.match(helper, /child\?\.children/);
  assert.doesNotMatch(helper, /\.traverse\(/);
});
