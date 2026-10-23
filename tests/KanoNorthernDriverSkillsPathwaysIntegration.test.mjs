import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

test('latest-main entry keeps the existing app, PWA, and startup modules while adding Step 65 once', async () => {
  const html = await read('index.html');
  for (const marker of [
    'id="game-container"', 'id="game-canvas"', 'id="start-screen"',
    'id="life-routine-screen"', 'href="/manifest.webmanifest"',
    'href="/icons/apple-touch-icon.png"',
    'src="/js/KanoCulturalStreetEventsUpgrade.js"',
    'src="/js/KanoWorldPerformanceInstancingUpgrade.js"',
    'src="/js/KanoLifeRootCauseRepair.js"',
    'src="/js/KanoModelAssetVisualUpgrade.js"',
  ]) assert.ok(html.includes(marker), `missing latest-main marker: ${marker}`);
  assert.equal((html.match(/src="\/js\/KanoNorthernDriverSkillsPathwaysUpgrade\.js"/g) || []).length, 1);
});

