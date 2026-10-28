import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMobileTier, getMobileRatios } from '../js/KanoDeviceTier.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('phone tier follows cores and memory, and unknown memory is treated as mid-range', () => {
  assert.equal(getMobileTier({ cores: 8, memory: 8 }), 'high');
  assert.equal(getMobileTier({ cores: 8, memory: 4 }), 'mid');
  assert.equal(getMobileTier({ cores: 6, memory: 4 }), 'mid');
  assert.equal(getMobileTier({ cores: 4, memory: 4 }), 'low');
  assert.equal(getMobileTier({ cores: 8, memory: 2 }), 'low');
  assert.equal(getMobileTier({ cores: 8, memory: undefined }), 'mid');
});

test('every tier keeps min <= start <= max and weak phones start at a reduced GPU load', () => {
  for (const tier of ['high', 'mid', 'low']) {
    const r = getMobileRatios(tier);
    assert.ok(r.min <= r.start && r.start <= r.max, tier);
  }
  assert.deepEqual(getMobileRatios('low'), { max: 1.5, start: 1.25, min: 1 });
  assert.deepEqual(getMobileRatios('mid'), { max: 1.5, start: 1.35, min: 1 });
  assert.deepEqual(getMobileRatios('high'), { max: 1.75, start: 1.6, min: 1 });
});

test('anti-aliasing stays off on phones (resolution does the sharpening) and on for desktop', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /antialias: !mobile,/);
});


test('a checkpoint group gets a long bay marker while a roadside pick-up stays a small disc', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /checkpointBay\s*\?\s*new THREE\.BoxGeometry\(2\.6, 0\.04, 5\.2\)/);
  assert.match(renderer, /new THREE\.CylinderGeometry\(radius, radius, 0\.04, 20\)/);
  const flat = read('js/renderer2d.js');
  assert.match(flat, /bay \? size \* 0\.72 : size \* 0\.35/);
});
