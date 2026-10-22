import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getMobileRenderBudget, getMobileRatios, getMobileTier } from '../js/KanoDeviceTier.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const renderer = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');

test('phone render targets restore audited sharpness and keep adaptive floors', () => {
  assert.deepEqual(getMobileRenderBudget('high'), { max: 1.45, start: 1.40, min: 0.72 });
  assert.deepEqual(getMobileRenderBudget('mid'), { max: 1.25, start: 1.15, min: 0.62 });
  assert.deepEqual(getMobileRenderBudget('low'), { max: 1.10, start: 0.92, min: 0.58 });
  assert.equal(getMobileRatios('high').max, 1.45);
  assert.equal(getMobileRatios('mid').start, 1.15);
  assert.equal(getMobileRatios('low').start, 0.92);
  assert.match(renderer, /getMobileRenderBudget\(this\.mobileTier\)\.start/);
});

test('mobile road optimizations remain in the renderer after the Kano visual merge', () => {
  assert.match(renderer, /mergeMobilePedestrianStaticParts\(group\)/);
  assert.match(renderer, /getMobileTrafficModelBudget\(this\.mobileTier\)/);
  assert.match(renderer, /getMobileTrafficBatch\(type, vehicles\.length\)/);
  assert.match(renderer, /advanceInstancedRoadPattern\(/);
  assert.match(renderer, /updateMobileDistanceCulling\(\)/);
  assert.match(renderer, /shouldRunMobilePromotionCheck\('pedestrians'\)/);
});

test('roadside neem trees and black-white median dividers use instanced meshes and recycle with road motion', () => {
  assert.match(renderer, /this\.buildKanoRoadsideSet\(\)/);
  assert.match(renderer, /new THREE\.InstancedMesh\(geometry, material, count\)/);
  assert.match(renderer, /Kano black-white concrete roadside dividers/);
  assert.match(renderer, /Kano neem tree trunks/);
  assert.match(renderer, /this\.updateKanoRoadsideSet\(scroll\)/);
});

test('sidewalk density grows by phone tier while fallback pedestrians stay draw-call merged', () => {
  assert.match(renderer, /this\.mobileTier === 'low' \? 10 : 12/);
  assert.match(renderer, /this\.mobileTier === 'low' \? 19 : 16/);
  assert.match(renderer, /this\.mergeMobilePedestrianStaticParts\(group\)/);
  assert.match(renderer, /this\.mobileTier === 'high' \? 3 : this\.mobileTier === 'mid' \? 2 : 1/);
});

test('motorcycle traffic includes a rear passenger on both desktop actors and mobile one-mesh batches', () => {
  assert.match(renderer, /ensureAchabaRiders\(actor\)/);
  assert.match(renderer, /ACHABA_FRONT_RIDER_BODY/);
  assert.match(renderer, /ACHABA_REAR_PASSENGER/);
  assert.match(renderer, /Rear passenger gives the mobile one-mesh bike the two-rider achaba silhouette/);
});

test('police and bus fallbacks are Kano pickup/Hiace shapes while valid specialized GLBs are preferred', () => {
  assert.match(renderer, /buildKanoPolicePickup\(/);
  assert.match(renderer, /kanoVehicleFallback = 'policePickup'/);
  assert.match(renderer, /kanoVehicleFallback = 'hiaceBus'/);
  assert.match(renderer, /forceKanoPolicePickup/);
  assert.match(renderer, /forceKanoHiaceFallback/);
  assert.match(renderer, /if \(bus\) box\(\[width \* 0\.94, 0\.08, length \* 0\.82\]/);
});

test('texture paths resolve under the models/environment folder', () => {
  assert.match(renderer, /\/assets\/models\/environment\/ground\/asphalt\.jpg/);
  assert.match(renderer, /\/assets\/models\/environment\/ground\/market-stall\.jpg/);
  assert.doesNotMatch(renderer, /\/assets\/environment\/ground\/(?:asphalt|market-stall)\.jpg/);
});

test('mobile fog keeps a short rendering horizon instead of resetting to desktop range', () => {
  assert.match(renderer, /state\.environment === 'harmattan' \? 70 : 105/);
  assert.match(renderer, /state\.environment === 'harmattan' \? 100 : 195/);
});

test('shared Achaba geometry is released during renderer disposal', () => {
  assert.match(renderer, /for \(const geometry of this\.achabaGeometries\.values\(\)\)/);
  assert.match(renderer, /this\.achabaGeometries\.clear\(\)/);
});

test('device tier selection remains explicit and deterministic for hardware overrides', () => {
  assert.equal(getMobileTier({ cores: 8, memory: 8 }), 'high');
  assert.equal(getMobileTier({ cores: 6, memory: 4 }), 'mid');
  assert.equal(getMobileTier({ cores: 4, memory: 3 }), 'low');
});
