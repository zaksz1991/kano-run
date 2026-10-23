import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIGITAL_DATA_BUNDLES, DIGITAL_SCENARIOS } from '../js/KanoNorthernDriverDigitalLife.js';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('integration is based on current main script entrypoints and preserves PWA links', () => {
  assert.match(html, /href="\/manifest\.webmanifest"/);
  assert.match(html, /href="\/icons\/apple-touch-icon\.png"/);
  assert.match(html, /src="\/js\/KanoCulturalStreetEventsUpgrade\.js"/);
  assert.match(html, /src="\/js\/KanoWorldPerformanceInstancingUpgrade\.js"/);
  assert.match(html, /src="\/js\/KanoLifeRootCauseRepair\.js"/);
  assert.match(html, /src="\/js\/KanoModelAssetVisualUpgrade\.js"/);
  assert.match(html, /src="\/js\/KanoNorthernDriverDigitalLifeUpgrade\.js"/);
});

test('digital-life interface is attached by standalone module without replacing game core files', () => {
  const runtime = readFileSync(new URL('../js/KanoNorthernDriverDigitalLifeUpgrade.js', import.meta.url), 'utf8');
  assert.match(runtime, /#kano-life-career-screen \.klc-panel/);
  assert.match(runtime, /kano-phone-life/);
  assert.match(runtime, /kano:digital-life-updated/);
  assert.match(runtime, /buyDigitalData/);
  assert.match(runtime, /resolveDigitalScenario/);
  assert.ok(!runtime.includes("from './game.js'"));
  assert.ok(DIGITAL_SCENARIOS.length >= 7);
  assert.ok(DIGITAL_DATA_BUNDLES.every(bundle => bundle.price > 0 && bundle.mb > 0));
});
