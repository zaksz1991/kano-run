import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('uses the existing pre-main world-performance module as the integration point', async () => {
  const diff = await read('../integration/KanoWorldPerformanceInstancingUpgrade.js.diff');
  for (const module of [
    'KanoMobileGeometryBudgetUpgrade.js',
    'KanoFlyoverDriveabilityUpgrade.js',
    'KanoCurrentMainExperienceRepair.js',
  ]) assert.match(diff, new RegExp(module.replaceAll('.', '\\.')));
});
test('only lengthens the existing flyover driveability constants', async () => {
  const diff = await read('../js/KanoFlyoverDriveabilityRules.mjs');
  assert.match(diff, /KANO_FLYOVER_DECK_HALF_LENGTH = 7\.5/);
  assert.match(diff, /KANO_FLYOVER_RAMP_END = 44/);
  assert.doesNotMatch(diff, /public\/assets\/models/);
});
test('aligns the title panel to the approach-facing side', async () => {
  const diff = await read('../js/KanoFlyoverRoundaboutUpgrade.js');
  assert.match(diff, /\[0, 5\.68, 7\.635\]/);
  assert.match(diff, /signFace\.rotation\.y = Math\.PI/);
});
test('Keke validation exception is limited to the known bundled asset path', async () => {
  const source = await read('../js/KanoCurrentMainExperienceRepair.js');
  assert.match(source, /vehicles\/keke\/keke-3\.glb/);
  assert.match(source, /stats\.plausibleBounds/);
  assert.match(source, /stats\.sourceMeshCount < 2/);
  assert.match(source, /stats\.triangles < 300/);
});
test('low-tier traffic receives at most the existing mid-tier GLB budget', async () => {
  const source = await read('../js/KanoCurrentMainExperienceRepair.js');
  assert.match(source, /this\.mobileTier = 'mid'/);
  assert.match(source, /finally \{\s*this\.mobileTier = previousTier/);
});
test('does not remove or disable the life simulation', async () => {
  const source = await read('../js/KanoCurrentMainExperienceRepair.js');
  assert.doesNotMatch(source, /life-routine-screen.*remove|delete.*life-routine-screen/i);
  assert.doesNotMatch(source, /unlock.*all|save\.unlocks\.push\((?!'ruffneck')/i);
});
