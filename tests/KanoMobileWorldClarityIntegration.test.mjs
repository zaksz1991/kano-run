import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const upgrade = await readFile(new URL('../js/KanoMobileWorldClarityUpgrade.js', import.meta.url), 'utf8');
const diff = await readFile(new URL('../integration/KanoWorldPerformanceInstancingUpgrade.js.diff', import.meta.url), 'utf8');

test('world clarity hooks only existing ModelManager load and adaptive ratio methods', () => {
  assert.match(upgrade, /ModelManager\?\.prototype/);
  assert.match(upgrade, /KanoAdaptiveQuality\?\.prototype/);
  assert.match(upgrade, /originalApplyRatio\.call/);
});

test('source explicitly keeps mobile viewport checks and preserves non-mobile ratio behavior', () => {
  assert.match(upgrade, /isMobileViewport/);
  assert.match(upgrade, /if \(!this\.mobile \|\| this\.enabled === false \|\| this\.disposed\)/);
});

test('model filtering does not edit source files or replace model assets', () => {
  assert.match(upgrade, /texture\.needsUpdate = true/);
  assert.match(upgrade, /isCompressedTexture/);
  assert.doesNotMatch(upgrade, /writeFile|unlink|rename|public\/assets\/models/);
});

test('integration is one additive import in the existing pre-main module', () => {
  assert.match(diff, /^\+import '\.\/KanoMobileWorldClarityUpgrade\.js';$/m);
});

test('runtime audit exposes current canvas density and adaptive controller ratios', () => {
  assert.match(upgrade, /kanoMobileWorldClarityAudit/);
  assert.match(upgrade, /backingWidth/);
  assert.match(upgrade, /actualPixelRatio/);
});
