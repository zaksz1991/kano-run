import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const main = readFileSync(resolve(root, 'js/main.js'), 'utf8');

test('a lost WebGL context rebuilds 3D instead of switching to 2D', () => {
  const start = main.indexOf('function attachWebGLRecovery(');
  const end = main.indexOf('// THREE.JS RENDERER', start);
  assert.notEqual(start, -1, 'WebGL recovery handler must exist');
  assert.notEqual(end, -1, 'WebGL recovery handler must have an end');
  const recovery = main.slice(start, end);

  assert.match(recovery, /addEventListener\('webglcontextlost'/);
  assert.match(recovery, /rebuild3D\(`context lost \(attempt \$\{contextRebuilds\}\)`\)/);
  assert.match(recovery, /rebuild3D\('context restored'\)/);
  assert.doesNotMatch(recovery, /start2D\(/, 'context loss/restoration must not trigger Canvas 2D');
});

test('a frame error never forces 2D while 3D is kept on', () => {
  const start = main.indexOf('function frame(');
  assert.notEqual(start, -1, 'game frame loop must exist');
  const frame = main.slice(start);

  assert.match(frame, /shouldRebuild3DAfterFrameError\(/);
  assert.match(frame, /rebuild3D\('repeated frame update error'\)/);
  assert.doesNotMatch(frame, /start2D\(/);
  assert.doesNotMatch(frame, /2D MODE · RECOVERED AFTER ERROR/);
});
