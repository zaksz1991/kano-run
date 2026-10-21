import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const moduleSource = fs.readFileSync(path.join(root, 'js/KanoCulturalStreetEventsUpgrade.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('cultural upgrade patches the actual Renderer3D traffic actor path', () => {
  assert.match(moduleSource, /Renderer3D\.prototype\.syncTraffic/);
  assert.match(moduleSource, /trafficActors\?\.get\(vehicle\.id\)/);
  assert.match(moduleSource, /KANO_AURE_WEDDING_CONVOY_DECOR/);
});

test('wedding convoys remain real SUV traffic entities with normal game simulation', () => {
  assert.match(moduleSource, /type: 'suv'/);
  assert.match(moduleSource, /event: 'weddingConvoy'/);
  assert.match(moduleSource, /originalUpdateEnvironment\.call\(this, dt, \.\.\.args\)/);
});

test('roadside children use existing ModelManager character instances', () => {
  assert.match(moduleSource, /manager\.getInstance\(key\)/);
  assert.match(moduleSource, /KANO_ALMAJIRI_CHILD_/);
  assert.match(moduleSource, /KANO_ALMAJIRI_FOOD_BOWL/);
  assert.doesNotMatch(moduleSource, /new THREE\.CapsuleGeometry\([^\n]*child/i);
});

test('goat is loaded from generated real-asset inventory and no goat placeholder is fabricated', () => {
  assert.match(moduleSource, /model-catalog-audit\.generated\.json/);
  assert.match(moduleSource, /new GLTFLoader\(\)\.load\(url/);
  assert.match(moduleSource, /no-goat-glb-found-in-inventory/);
  assert.match(moduleSource, /no primitive goat placeholder was created/);
});

test('goat crossing uses the loaded asset and its available animation clips', () => {
  assert.match(moduleSource, /new THREE\.AnimationMixer\(root\)/);
  assert.match(moduleSource, /goatCrossing/);
  assert.match(moduleSource, /goatNextAt/);
});

test('model cleanup avoids disposing shared GLB clones', () => {
  assert.match(moduleSource, /GLB clones share model-manager geometry\/material/);
  assert.match(moduleSource, /disposeUniqueTree\(child\.bowl\)/);
});

test('index registers cultural hooks before the existing bootstrap chain', () => {
  const cultureAt = htmlSource.indexOf('/js/KanoCulturalStreetEventsUpgrade.js');
  const rootCauseAt = htmlSource.indexOf('/js/KanoLifeRootCauseRepair.js');
  const visualAt = htmlSource.indexOf('/js/KanoModelAssetVisualUpgrade.js');
  assert.ok(cultureAt >= 0 && rootCauseAt > cultureAt && visualAt > rootCauseAt);
});

test('no external model URLs or additional binary assets are required', () => {
  assert.doesNotMatch(moduleSource, /https?:\/\//i);
  assert.match(moduleSource, /assets\/models/);
});
