import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Step 69 adds one additive module to the current public GitHub-main entrypoint', () => {
  assert.match(index, /<script type="module" src="\/js\/KanoNorthernDriverAureJourneyUpgrade\.js"><\/script>/);
  assert.match(index, /\/js\/KanoCulturalStreetEventsUpgrade\.js/);
  assert.match(index, /\/js\/KanoWorldPerformanceInstancingUpgrade\.js/);
  assert.match(index, /\/js\/KanoLifeRootCauseRepair\.js/);
  assert.match(index, /\/js\/KanoModelAssetVisualUpgrade\.js/);
  assert.match(index, /\/js\/KanoNorthernDriverSkillsPathwaysUpgrade\.js/);
  assert.match(index, /\/js\/KanoNorthernDriverCareerProgressionUpgrade\.js/);
});

test('PWA links and original game canvas/HUD IDs remain in the updated entrypoint', () => {
  assert.match(index, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(index, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
  assert.match(index, /id="game-canvas"/);
  assert.match(index, /id="passenger-list"/);
  assert.match(index, /id="drive-controls"/);
});

test('the new integration imports the existing Aure and family/phone life layers', () => {
  const moduleText = readFileSync(new URL('../js/KanoNorthernDriverAureJourneyUpgrade.js', import.meta.url), 'utf8');
  assert.match(moduleText, /KanoNorthernDriverAureAndCultureUpgrade\.js/);
  assert.match(moduleText, /KanoNorthernDriverFamilyResponsibilitiesUpgrade\.js/);
  assert.match(moduleText, /KanoNorthernDriverCareerProgressionUpgrade\.js/);
});
