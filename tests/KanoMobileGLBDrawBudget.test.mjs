import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.join(here, relative), 'utf8');

const [presentation, main] = await Promise.all([
  read('../js/KanoGameplayPresentationRepair.js'),
  read('../js/main.js'),
]);

test('mobile imported building pool is capped at two variants per category', () => {
  assert.match(presentation, /building:\s*\{\s*mobile:\s*2,\s*desktop:\s*8\s*\}/);
  assert.match(presentation, /industrialBuilding:\s*\{\s*mobile:\s*2,\s*desktop:\s*5\s*\}/);
});

test('mobile road rendering promotes no more than four building slots', () => {
  assert.match(presentation, /const maximum = this\.mobile \? Math\.min\(4, this\.buildingSlots\.length\) : this\.buildingSlots\.length/);
  assert.doesNotMatch(presentation, /Math\.min\(14,\s*this\.buildingSlots\.length\)/);
});

test('mobile model queue skips imported flyover and roadlight categories', () => {
  const match = main.match(/const mobileAssetBatches = \[([\s\S]*?)\n    \];/);
  assert.ok(match, 'mobile asset queue must remain present');
  const mobileBatches = match[1];
  for (const unused of ['flyover', 'roadlight', 'bench', 'trafficLight', 'stopSign', 'busStop', 'marketStall']) {
    assert.doesNotMatch(mobileBatches, new RegExp(`['\"]${unused}['\"]`), `${unused} should not be preloaded on mobile`);
  }
  for (const retained of ['car', 'motorcycle', 'building', 'industrialBuilding', 'passengerWoman', 'passengerMan', 'karota', 'cone', 'dirtmound']) {
    assert.match(mobileBatches, new RegExp(`['\"]${retained}['\"]`), `${retained} should remain available on mobile`);
  }
});

test('desktop still requests the full-detail category list', () => {
  const match = main.match(/const essentials = mobile\s*\?\s*\['keke'\]\s*:\s*\[([\s\S]*?)\n    \];/);
  assert.ok(match, 'desktop essential preload list must remain present');
  for (const retained of ['flyover', 'roadlight', 'bench', 'trafficLight', 'stopSign']) {
    assert.match(match[1], new RegExp(`['\"]${retained}['\"]`), `${retained} must remain available on desktop`);
  }
});

test('GLB culling repair remains one-time and keeps frustum culling enabled', () => {
  assert.match(presentation, /root\.userData\.kanoGlbVisibilityPrepared === true/);
  assert.match(presentation, /node\.frustumCulled = true/);
  assert.match(presentation, /const interval = renderer\.mobile \? 450 : 250/);
});
