import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/ModelManager.js', import.meta.url), 'utf8');
const start = source.indexOf('function repairMaterials(root) {');
const end = source.indexOf('// RESOURCE MANAGEMENT', start);
assert.notEqual(start, -1, 'repairMaterials exists');
assert.notEqual(end, -1, 'repairMaterials section ends');
const block = source.slice(start, end);

test('GLB material repair preserves authored sidedness for back-face culling', () => {
  assert.doesNotMatch(block, /material\.side\s*=\s*THREE\.DoubleSide/);
  assert.match(block, /Preserve the material side authored in the GLB/);
});

test('low-opacity GLB material repair remains and only requests an update when changed', () => {
  assert.match(block, /material\.opacity\s*<\s*0\.12/);
  assert.match(block, /material\.opacity\s*=\s*0\.85/);
  assert.match(block, /material\.transparent\s*=\s*true/);
  assert.match(block, /material\.needsUpdate\s*=\s*true/);
  assert.equal((block.match(/material\.needsUpdate\s*=\s*true/g) || []).length, 1);
});

test('GLB material repair keeps shadow flags disabled', () => {
  assert.match(block, /object\.castShadow\s*=\s*false/);
  assert.match(block, /object\.receiveShadow\s*=\s*false/);
});
