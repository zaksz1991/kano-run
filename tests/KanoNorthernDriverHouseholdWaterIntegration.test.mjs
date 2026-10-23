import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const integration = await readFile(new URL('../js/KanoNorthernDriverUtilitiesUpgrade.js', import.meta.url), 'utf8');
const moduleCode = await readFile(new URL('../js/KanoNorthernDriverHouseholdWaterUpgrade.js', import.meta.url), 'utf8');
const modelCode = await readFile(new URL('../js/KanoNorthernDriverHouseholdWater.js', import.meta.url), 'utf8');

test('Step 61 import is additive to the existing household utilities integration module', () => {
  assert.match(integration, /^import '\.\/KanoNorthernDriverHouseholdWaterUpgrade\.js';/);
  assert.match(integration, /KanoNorthernDriverHouseholdUtilities/);
  assert.match(integration, /install\(\);/);
});

test('water UI uses the existing LIFE & CAREER wallet and shift state', () => {
  assert.match(moduleCode, /import \{ save, persist \} from '\.\/storage\.js'/);
  assert.match(moduleCode, /save\.money = safeWallet/);
  assert.match(moduleCode, /activeShift/);
  assert.match(moduleCode, /#kano-life-career-screen \.klc-panel/);
});

test('Step 61 keeps purchases and household tasks explicit rather than applying hidden daily losses', () => {
  assert.match(modelCode, /completeHouseholdWaterTask/);
  assert.match(modelCode, /buyHouseholdWater/);
  assert.match(modelCode, /No water is deducted automatically/);
  assert.doesNotMatch(modelCode, /setInterval|requestAnimationFrame/);
});
