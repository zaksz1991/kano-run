import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('adaptive quality does not create a second overlapping GLB crowd pool', () => {
  const adaptive = read('js/KanoAdaptiveQuality.js');
  assert.match(adaptive, /const targetCount = 0/);
  assert.match(adaptive, /KanoInteractionReliability owns the sole real-person crowd pool/);
});

test('mobile roadside walkers have a hard cap on imported GLB replacements', () => {
  const interaction = read('js/KanoInteractionReliability.js');
  assert.match(interaction, /const MOBILE_REAL_CROWD_COUNT = 2/);
  assert.match(interaction, /const phoneBudget = this\.mobile \? 1 : Infinity/);
  assert.match(interaction, /modelledCount >= phoneBudget/);
});

test('mobile renders fewer imported traffic models and uses lightweight traffic keke', () => {
  const tier = read('js/KanoDeviceTier.js');
  const renderer = read('js/renderer3d.js');
  assert.match(tier, /if \(tier === 'high'\) return 1/);
  assert.match(tier, /if \(tier === 'mid'\) return 1/);
  assert.match(tier, /return 0/);
  assert.match(renderer, /this\.mobile \? this\.makeTrafficKeke\(\) : this\.makeKeke\(\)/);
  assert.match(renderer, /keke\.userData\.sharedGeometry = true/);
});

test('mobile rendering avoids MSAA and limits distant scenery at camera and fog level', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /antialias: !mobile/);
  assert.match(renderer, /mobile \? 125 : 260/);
  assert.match(renderer, /mobile \? 105 : 195/);
});
