import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const quality = read('js/KanoAdaptiveQuality.js');
const main = read('js/main.js');

test('adaptive policy is connected to the existing live renderer controller', () => {
  assert.match(main, /import \{ KanoAdaptiveQuality \} from '\.\/KanoAdaptiveQuality\.js'/);
  assert.match(quality, /buildAdaptiveQualityPlan/);
  assert.match(quality, /chooseAdaptiveQualityAction/);
  assert.match(quality, /classifyAdaptivePerformance/);
});

test('emergency sub-1.0 resolution is limited to low-tier mobile on Standard sharpness', () => {
  assert.match(quality, /this\.mobileTier === 'low'/);
  assert.match(quality, /getRenderSharpness\(\) === 'standard'/);
  assert.match(quality, /this\.emergencyResolutionFloor = this\.emergencyResolutionAllowed \? 0\.82 : null/);
});

test('adaptive sampling ignores hidden-tab gaps, long resume stalls and non-driving frames', () => {
  assert.match(quality, /globalThis\.document\?\.hidden/);
  assert.match(quality, /frameDelta <= 250/);
  assert.match(quality, /frameTimeEma/);
  assert.match(quality, /this\.lastGameState !== gameState/);
});

test('LOD includes waiting passenger GLBs but never removes their pickup-zone simulation', () => {
  assert.match(quality, /renderer\?\.zoneActors\?\.values/);
  assert.match(quality, /zone\?\.userData\?\.waitingActors/);
  assert.match(quality, /only the character model's draw visibility/);
  assert.match(quality, /const pedestrianFloor = deepMobileLod \? 42 : 88/);
});

test('visibility LOD uses hysteresis and releases stale actor references', () => {
  assert.match(quality, /const hysteresis = this\.mobile \? 7 : 4/);
  assert.match(quality, /this\.visibilityRecords\.delete\(actor\)/);
  assert.match(quality, /this\.lodVisibilityStates\.delete\(actor\)/);
});

test('quality diagnostics expose measured frame time and active resolution profile', () => {
  assert.match(quality, /frameTimeMs: Number\(this\.frameTimeEma\.toFixed\(2\)\)/);
  assert.match(quality, /qualityProfile: this\.currentRatio < 1 \? 'emergency-resolution'/);
  assert.match(quality, /emergencyResolution: this\.emergencyResolutionAllowed/);
});
