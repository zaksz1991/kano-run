import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/renderer3d.js', import.meta.url), 'utf8');
const start = source.indexOf('  material(color, roughness = 1) {');
const end = source.indexOf('\n  loadOptionalTexture(', start);
assert.ok(start >= 0 && end > start, 'Renderer3D material factory should exist');
const factory = source.slice(start, end);

test('mobile procedural materials use cheaper Lambert shading', () => {
  assert.match(factory, /if \(this\.mobile\)\s*\{\s*return new THREE\.MeshLambertMaterial\(\{\s*color,\s*side\s*\}\);/);
});

test('desktop procedural materials retain Standard shading and roughness', () => {
  assert.match(factory, /return new THREE\.MeshStandardMaterial\(\{ color, roughness, side \}\);/);
});

test('mobile materials keep front-face culling and desktop keeps previous side mode', () => {
  assert.match(factory, /const side = this\.mobile \? THREE\.FrontSide : THREE\.DoubleSide/);
});

test('texture-loading path remains present for Lambert-compatible materials', () => {
  assert.match(source, /material\.map = texture;/);
  assert.match(source, /material\.needsUpdate = true;/);
});

test('instanced traffic and road-scroll optimization remains in this replacement', () => {
  assert.match(source, /advanceInstancedRoadPattern/);
  assert.match(source, /_mobileTrafficBatches/);
});
