import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
const monitor = fs.readFileSync(path.join(ROOT, 'js', 'KanoPerformanceMonitor.js'), 'utf8');
const adaptive = fs.readFileSync(path.join(ROOT, 'js', 'KanoAdaptiveQuality.js'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');

test('low-FPS handling never calls the Canvas 2D renderer', () => {
  assert.doesNotMatch(main, /2D MODE · LOW FPS FALLBACK/);
  assert.doesNotMatch(main, /fallbackStarted|lowFpsSince/);
  assert.match(main, /adaptiveQuality\?\.update\?\./);
});

test('frame errors recover the WebGL renderer instead of forcing 2D', () => {
  assert.match(main, /shouldRebuild3DAfterFrameError\(/);
  assert.match(main, /rebuild3D\('repeated frame update error'\)/);
  assert.doesNotMatch(main, /2D MODE · RECOVERED AFTER ERROR/);
});

test('all renderer-to-2D transitions pass through the explicit permission guard', () => {
  assert.match(main, /if \(!canUse2D\(/);
  assert.match(main, /confirmedNoWebGL = webglUnavailableConfirmed && !webglEverAvailable/);
  assert.match(main, /isWebGLUnavailableError\(error\)/);
});

test('performance monitor is telemetry-only and adaptive quality changes LOD/resolution only', () => {
  assert.doesNotMatch(monitor, /start2D|Renderer2D|dispatchEvent\(['"]kano:quality-change/);
  assert.match(monitor, /frame-time monitor/);
  assert.match(adaptive, /applyRatio\(/);
  assert.doesNotMatch(adaptive, /start2D|Renderer2D/);
});

test('service worker rotates both code and model/texture caches after asset repairs', () => {
  assert.match(sw, /const VERSION = 'kano-life-v2'/);
  assert.match(sw, /const MODELS = `\$\{VERSION\}-models`/);
  assert.match(sw, /url\.pathname\.startsWith\('\/assets\/models\/'\)/);
});
