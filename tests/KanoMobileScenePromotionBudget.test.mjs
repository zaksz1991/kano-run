import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const renderer = read('js/renderer3d.js');

test('mobile world and pedestrian model-promotion scans have independent 300ms budgets', () => {
  assert.match(renderer, /this\._nextMobileWorldAssetUpgradeAt = 0/);
  assert.match(renderer, /this\._nextMobilePedestrianUpgradeAt = 0/);
  assert.match(renderer, /shouldRunMobilePromotionCheck\(kind, now = \(globalThis\.performance\?\.now\?\.\(\) \?\? Date\.now\(\)\)\)/);
  assert.match(renderer, /this\[deadlineField\] = now \+ 300/);
  assert.match(renderer, /upgradeWorldAssets\(\)\s*\{\s*if \(!this\.models \|\| !this\.shouldRunMobilePromotionCheck\('world'\)\) return/);
  assert.match(renderer, /!this\.shouldRunMobilePromotionCheck\('pedestrians'\)/);
});

test('desktop model promotions remain unthrottled', () => {
  assert.match(renderer, /shouldRunMobilePromotionCheck\(kind,[\s\S]{0,160}if \(!this\.mobile\) return true/);
});

test('zone synchronization reuses its active-ID set instead of allocating one per frame', () => {
  assert.match(renderer, /this\._activeZoneIds = new Set\(\)/);
  assert.match(renderer, /syncZones\(state\)\s*\{\s*const activeIds = this\._activeZoneIds;\s*activeIds\.clear\(\)/);
  assert.doesNotMatch(renderer, /syncZones\(state\)\s*\{\s*const activeIds = new Set\(\)/);
});
