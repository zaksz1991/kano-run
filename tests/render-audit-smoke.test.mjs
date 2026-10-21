import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/KanoRenderModeFrameBudgetAudit.js', import.meta.url), 'utf8');
test('audit is opt-in and does not change renderer mode', () => {
  assert.match(source, /if \(!params\.has\('renderAudit'\)\) return/);
  assert.doesNotMatch(source, /force3d|force2d|localStorage\.setItem/);
});
test('audit reports frame pacing, canvases and WebGL context loss', () => {
  for (const token of ['averageFrameMs', 'worstFrameMs', 'webglCanvasCount', 'twoDCanvasCount', 'webglcontextlost', 'EXPORT JSON']) assert.ok(source.includes(token), `missing ${token}`);
});
test('audit includes a caution against over-interpreting canvas detection', () => {
  assert.match(source, /does not prove gameplay fell back to 2D/);
});
