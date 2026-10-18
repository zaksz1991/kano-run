import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');

test('mobile viewport is valid and declared once', () => {
  const html = read('index.html');
  const viewportTags = html.match(/<meta\s+name=["']viewport["'][^>]*>/gi) || [];
  assert.equal(viewportTags.length, 1);
  assert.match(viewportTags[0], /width=device-width/);
  assert.match(viewportTags[0], /viewport-fit=cover/);
  assert.doesNotMatch(viewportTags[0], /cover\.0|maximum-scale=.*maximum-scale|user-scalable=.*user-scalable/);
});

test('all UI element lookups have matching HTML IDs', () => {
  const html = read('index.html');
  const ui = read('js/ui.js');
  const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  const uiIds = new Set([...ui.matchAll(/this\.el\(["']([^"']+)["']\)/g)].map((match) => match[1]));
  assert.deepEqual([...uiIds].filter((id) => !htmlIds.has(id)), []);
});

test('2D fallback always replaces the active canvas before creating its context', () => {
  const main = read('js/main.js');
  assert.match(main, /function freshCanvas\(/);
  assert.match(main, /function start2D[\s\S]*?const newCanvas = freshCanvas\(\)[\s\S]*?new Renderer2D\(newCanvas\)/);
  assert.match(main, /function start3D[\s\S]*?const activeCanvas = freshCanvas\(\)[\s\S]*?new Renderer3D\(activeCanvas/);
});

test('saved 2D preference is resolved before WebGL startup and force3d overrides it', () => {
  const main = read('js/main.js');
  const boot = main.slice(main.indexOf('function boot()'), main.indexOf('function frame('));
  assert.match(boot, /const saved2D = save\?\.settings\?\.quality === '2d'/);
  assert.ok(boot.indexOf('if (force2d || (saved2D && !force3d))') < boot.indexOf('start3D()'));
  assert.doesNotMatch(boot, /start3D\(\)[\s\S]{0,500}save\?\.settings\?\.quality === '2d'/);
});

test('GLB loader uses public assets path, guards absurd bounds, grounds models', () => {
  const manager = read('js/ModelManager.js');
  assert.match(manager, /basePath = '\/assets\/models\/'/);
  assert.match(manager, /horizontalSpan > originalSize\.y \* 18/);
  assert.match(manager, /source\.position\.y -= scaledBox\.min\.y/);
  assert.match(manager, /\[ModelManager\] OK \$\{key\}/);
});
