import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renderer = fs.readFileSync(path.join(ROOT, 'js/renderer3d.js'), 'utf8');
const method = renderer.slice(renderer.indexOf('  makeTrafficKeke() {'), renderer.indexOf('\n  makeTrafficActor(', renderer.indexOf('  makeTrafficKeke() {')));

test('procedural mobile traffic keke uses one mesh with merged vertex-coloured geometry', () => {
  assert.match(method, /new THREE\.BufferGeometry\(\)/);
  assert.match(method, /new THREE\.Float32BufferAttribute\(positions, 3\)/);
  assert.match(method, /new THREE\.Float32BufferAttribute\(colors, 3\)/);
  assert.match(method, /new THREE\.Mesh\(\s*this\._mobileTrafficKekeGeometry\.merged/);
  assert.match(method, /vertexColors: true/);
  assert.match(method, /sharedGeometry = true/);
});

test('merged background keke geometry is reused and disposed by the renderer', () => {
  assert.match(method, /if \(!this\._mobileTrafficKekeGeometry\?\.merged\)/);
  assert.match(renderer, /for \(const geometry of Object\.values\(this\._mobileTrafficKekeGeometry \|\| \{\}\)\)/);
  assert.match(renderer, /geometry\?\.dispose\?\.\(\)/);
});

test('player keke and traffic simulation code remain outside the background mesh replacement', () => {
  assert.match(renderer, /this\.player = this\.makeKeke\(\)/);
  assert.match(renderer, /const allowGLB = !this\.mobile \|\| mobileGlbIds\.has\(vehicle\.id\)/);
  assert.match(renderer, /actor\.position\.set\([\s\S]*?vehicle\.lane/);
  assert.match(renderer, /keke\.userData\.fallback = true/);
});
