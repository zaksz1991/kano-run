import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMobileTrafficModelBudget } from '../js/KanoDeviceTier.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('mobile traffic model pool is capped by device tier', () => {
  assert.equal(getMobileTrafficModelBudget('low'), 1);
  assert.equal(getMobileTrafficModelBudget('mid'), 2);
  assert.equal(getMobileTrafficModelBudget('high'), 3);
});

test('all lane markings use one InstancedMesh instead of individual Mesh draw calls', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /KANO_INSTANCED_LANE_MARKINGS/);
  assert.match(renderer, /new THREE\.InstancedMesh\([\s\S]*?laneDashRecords\.length/);
  assert.match(renderer, /laneDashInstanced\.setMatrixAt\(index, this\.laneDashObject\.matrix\)/);
  assert.match(renderer, /this\.laneDashInstanced\.instanceMatrix\.needsUpdate = true/);
});

test('mobile traffic uses stable, bounded imported GLB instances with procedural fallbacks', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /getMobileTrafficModelBudget\(this\.mobileTier\)/);
  assert.match(renderer, /this\._mobileGlbTrafficIds/);
  assert.match(renderer, /makeTrafficActor\(vehicle, \{ allowGLB \}/);
  assert.match(renderer, /actor\.visible = !this\.mobile \|\| depth <= 2\.65/);
});

test('mobile keeps procedural flyover and lightweight props while preserving market-stall GLBs', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /if \(!this\.mobile && this\.models\.cache\.has\('flyover'\)\)/);
  assert.match(renderer, /!\['marketStall', 'busStop'\]\.includes\(slot\.key\)/);
});

test('nonessential model batches pause during active driving', () => {
  const main = read('js/main.js');
  const block = main.slice(main.indexOf('const mobileAssetBatches'), main.indexOf('// WORKSHOP PANEL CLEANUP'));
  assert.match(block, /while \(game\?\.state === 'PLAY'\)/);
  assert.match(block, /await models\.preload\(keys\)/);
});
