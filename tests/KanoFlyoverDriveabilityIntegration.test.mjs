import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const trafficMix = await readFile(resolve(root, 'js/KanoTrafficMix.js'), 'utf8');
const upgrade = await readFile(resolve(root, 'js/KanoFlyoverDriveabilityUpgrade.js'), 'utf8');
const rules = await readFile(resolve(root, 'js/KanoFlyoverDriveabilityRules.mjs'), 'utf8');

test('the existing startup dependency loads driveability before renderer construction', () => {
  assert.match(trafficMix, /import\s+['"]\.\/KanoFlyoverDriveabilityUpgrade\.js['"];?/);
  assert.match(upgrade, /import\s*\{\s*Renderer3D\s*\}\s*from\s*['"]\.\/renderer3d\.js['"]/);
  assert.match(upgrade, /Renderer3D\.prototype\.buildFlyover\s*=/);
  assert.match(upgrade, /Renderer3D\.prototype\.draw\s*=/);
});

test('the road surface removes transverse deck barriers and supplies ramps', () => {
  assert.match(upgrade, /hideCrossDeckBarriers/);
  assert.match(upgrade, /KWANKWASIYYA_FLYOVER_ENTRY_RAMP/);
  assert.match(upgrade, /KWANKWASIYYA_FLYOVER_EXIT_RAMP/);
  assert.match(upgrade, /const countPerSide = Math\.floor\(\(\(KANO_FLYOVER_RAMP_END - 1\) \* 2\) \/ 3\.1\) \+ 1/);
  assert.match(upgrade, /kanoFlyoverHeightAt/);
  assert.match(upgrade, /renderer\.player\.position\.y\s*\+=\s*height/);
  assert.match(upgrade, /updateMobileTrafficBatchElevations/);
});

test('diagnostics explicitly distinguish drivable flyover from linear roundabouts', () => {
  assert.match(upgrade, /kanoFlyoverDriveabilityAudit/);
  assert.match(upgrade, /roundaboutRoutesDriveable:\s*false/);
  assert.match(upgrade, /True roundabout exits require changing the protected game\/renderer route simulation/);
});

test('surface geometry and recycle rules are exported for focused testing', () => {
  assert.match(rules, /export function kanoFlyoverHeightAt/);
  assert.match(rules, /export function kanoWrapFlyoverZ/);
  assert.match(rules, /export function kanoSignedRoadScroll/);
});
