import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const waterUpgrade = await readFile(new URL('../js/KanoNorthernDriverHouseholdWaterUpgrade.js', import.meta.url), 'utf8');
const familyUi = await readFile(new URL('../js/KanoNorthernDriverFamilyResponsibilitiesUpgrade.js', import.meta.url), 'utf8');
const familyCore = await readFile(new URL('../js/KanoNorthernDriverFamilyResponsibilities.js', import.meta.url), 'utf8');

test('Step 61 household water integration chain imports Step 62 family responsibilities', () => {
  assert.match(waterUpgrade, /import\s+['"]\.\/KanoNorthernDriverFamilyResponsibilitiesUpgrade\.js['"]/);
});

test('family responsibility runtime is additive and uses current wallet integration', () => {
  assert.match(familyUi, /import\s*\{\s*save,\s*persist\s*\}\s*from\s*['"]\.\/storage\.js['"]/);
  assert.match(familyUi, /window\.kanoNorthernDriverAureAndCulture\?\.snapshot/);
  assert.match(familyUi, /window\.kanoNorthernDriverRealLife\?\.snapshot/);
});

test('family commitments never apply an automatic day-based debit', () => {
  assert.match(familyCore, /no money was taken/);
  assert.doesNotMatch(familyCore, /setInterval|setTimeout/i);
  assert.match(familyCore, /nextWallet -= event\.amount/);
  assert.match(familyCore, /const newWallet = cash - item\.amount/);
});

test('family action and pay controls are locked during active driving', () => {
  assert.match(familyUi, /activeShift/);
  assert.match(familyCore, /reason: 'shift_active'/);
});
