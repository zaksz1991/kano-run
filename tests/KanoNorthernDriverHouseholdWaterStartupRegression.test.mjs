import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const uiPath = new URL('../js/KanoNorthernDriverHouseholdWaterUpgrade.js', import.meta.url);
const modelPath = new URL('../js/KanoNorthernDriverHouseholdWater.js', import.meta.url);
const uiCode = await readFile(uiPath, 'utf8');
const modelCode = await readFile(modelPath, 'utf8');

test('household-water UI uses the model report capacity without a free constant reference', () => {
  assert.match(modelCode, /export const MAX_HOUSEHOLD_WATER_LITRES\s*=\s*500\s*;/);
  assert.doesNotMatch(uiCode, /\bMAX_HOUSEHOLD_WATER_LITRES\b/);
  assert.match(uiCode, /const report = householdWaterReport\(state, ctx\.day\)/);
  assert.match(uiCode, /const maxLitres = Number\.isFinite\(Number\(report\.maxLitres\)\)/);
  assert.match(uiCode, /state\.waterLitres\s*\+\s*\(bundle\?\.litres\s*\|\|\s*0\)\s*>\s*maxLitres/);
});

test('household-water UI dependency graph imports without browser globals', async () => {
  // Startup modules must remain safely importable in test/SSR environments.
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  try {
    delete globalThis.window;
    delete globalThis.document;
    await import(`../js/KanoNorthernDriverHouseholdWaterUpgrade.js?startup-regression=${Date.now()}`);
  } finally {
    if (savedWindow !== undefined) globalThis.window = savedWindow;
    if (savedDocument !== undefined) globalThis.document = savedDocument;
  }
});
