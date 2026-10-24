import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../js/KanoMobileGeometryBudgetRules.js', import.meta.url), 'utf8');
const optimizerDiff = await readFile(new URL('../integration/KanoMobileGeometryBudgetUpgrade.js.diff', import.meta.url), 'utf8');
const startupDiff = await readFile(new URL('../integration/KanoAnimationTrafficUpgrade.js.diff', import.meta.url), 'utf8');

test('rules are delivered as .js rather than requiring a rules .mjs file', () => {
  assert.match(rules, /KANO_MOBILE_MODEL_TRIANGLE_LIMIT\s*=\s*5_000/);
  assert.match(rules, /export function countGeometryTriangles/);
  assert.doesNotMatch(rules, /\.mjs/);
});

test('optimizer dependency diff switches only the missing rules import extension', () => {
  assert.match(optimizerDiff, /^--- a\/js\/KanoMobileGeometryBudgetUpgrade\.js$/m);
  assert.match(optimizerDiff, /-\} from '\.\/KanoMobileGeometryBudgetRules\.mjs';/);
  assert.match(optimizerDiff, /\+\} from '\.\/KanoMobileGeometryBudgetRules\.js';/);
  assert.doesNotMatch(optimizerDiff, /^\+\+\+ b\/(?:index\.html|js\/(?:main|game|renderer3d|ui|ModelManager|KanoDeviceTier|KanoPhoneComfortUpgrade|KanoModelAssetVisualUpgrade)\.js)$/m);
});

test('startup diff imports the existing optimizer through main.js import graph', () => {
  assert.match(startupDiff, /^--- a\/js\/KanoAnimationTrafficUpgrade\.js$/m);
  assert.match(startupDiff, /^\+import '\.\/KanoMobileGeometryBudgetUpgrade\.js';$/m);
  assert.doesNotMatch(startupDiff, /^\+\+\+ b\/(?:index\.html|js\/(?:main|game|renderer3d|ui|ModelManager|KanoDeviceTier|KanoPhoneComfortUpgrade|KanoModelAssetVisualUpgrade)\.js)$/m);
});
