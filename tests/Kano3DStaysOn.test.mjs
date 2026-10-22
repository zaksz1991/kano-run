import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
test('a lost WebGL context rebuilds 3D instead of switching to 2D', () => {
  assert.match(main, /webglcontextrestored/);
  assert.match(main, /rebuild3D\('context lost'\)/);
  assert.doesNotMatch(main, /WebGL context lost; switching to Canvas 2D/);
});
test('a frame error never forces 2D while 3D is kept on', () => {
  assert.match(main, /if \(!keep3D\) \{\s*start2D\('2D MODE · RECOVERED AFTER ERROR'\)/);
});
