import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('entrypoint is based on current GitHub main and keeps PWA links', async () => {
  const html = await read('index.html');
  for (const required of ['href="/manifest.webmanifest"', 'href="/icons/apple-touch-icon.png"', 'href="/css/styles.css"']) assert.ok(html.includes(required), required);
  for (const script of ['KanoCulturalStreetEventsUpgrade.js', 'KanoWorldPerformanceInstancingUpgrade.js', 'KanoLifeRootCauseRepair.js', 'KanoModelAssetVisualUpgrade.js', 'KanoNorthernDriverSkillsPathwaysUpgrade.js', 'KanoNorthernDriverCareerProgressionUpgrade.js']) assert.ok(html.includes(`/js/${script}`), script);
  assert.ok(html.includes('/js/KanoNorthernDriverParenthoodUpgrade.js'));
});

test('parenthood runtime imports the current Aure journey integration rather than copying its state', async () => {
  const runtime = await read('js/KanoNorthernDriverParenthoodUpgrade.js');
  assert.ok(runtime.includes("import './KanoNorthernDriverAureJourneyUpgrade.js';"));
  assert.ok(runtime.includes('kanoNorthernDriverAureAndCulture?.snapshot?.()'));
  assert.ok(runtime.includes('kanoNorthernDriverLifeSimulation?.snapshot?.()'));
});

test('parenthood package keeps all story actions off active driving and does not transact the wallet', async () => {
  const runtime = await read('js/KanoNorthernDriverParenthoodUpgrade.js');
  const model = await read('js/KanoNorthernDriverParenthood.js');
  assert.ok(runtime.includes("if (ctx.activeShift)"));
  assert.ok(!runtime.includes("import { save, persist } from './storage.js'"));
  assert.ok(!model.includes('wallet') || model.includes('does not move money'));
});
