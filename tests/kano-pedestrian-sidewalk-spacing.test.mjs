import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');
const sidewalk = source.slice(source.indexOf('  buildSidewalkLife()'), source.indexOf('  buildRoadsideProps()'));

test('mobile pedestrians are paired across both sidewalks at the same depth row', () => {
  assert.match(sidewalk, /const rowIndex = this\.mobile \? Math\.floor\(index \/ 2\) : index;/);
  assert.match(sidewalk, /const z = -5 - rowIndex \* pedestrianSpacing;/);
  assert.match(sidewalk, /const side = index % 2 === 0 \? -1 : 1;/);
});

test('mobile pedestrian loop length follows per-side rows and keeps the visible loop bounded', () => {
  assert.match(sidewalk, /const rowsPerSide = Math\.ceil\(count \/ 2\);/);
  assert.match(sidewalk, /this\.pedestrianLoopDistance = this\.mobile\s*\?\s*rowsPerSide \* pedestrianSpacing\s*:\s*count \* pedestrianSpacing;/);
  assert.match(source, /pedestrian\.actor\.position\.z -= this\.pedestrianLoopDistance/);
});

test('desktop pedestrian spacing is unchanged by the mobile row fix', () => {
  assert.match(sidewalk, /const rowIndex = this\.mobile \? Math\.floor\(index \/ 2\) : index;/);
  assert.match(sidewalk, /this\.pedestrianLoopDistance = this\.mobile\s*\?\s*rowsPerSide \* pedestrianSpacing\s*:\s*count \* pedestrianSpacing;/);
});

test('denser mobile sidewalk layout does not add pedestrian actors or GLB promotions', () => {
  assert.match(sidewalk, /this\.mobileTier === 'low' \? 10 : 12/);
  assert.match(source, /this\.mobileTier === 'high' \? 3 : this\.mobileTier === 'mid' \? 2 : 1/);
  assert.match(sidewalk, /this\.mergeMobilePedestrianStaticParts\(group\)/);
});

test('mobile pedestrian arm animation and recycling remain enabled', () => {
  assert.match(source, /for \(const \[index, arm\] of pedestrian\.arms\.entries\(\)\)/);
  assert.match(source, /pedestrian\.actor\.position\.z \+= scroll \* 0\.72/);
  assert.match(source, /updateMobileDistanceCulling\(\)/);
});
