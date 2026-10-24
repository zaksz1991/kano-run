import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isKnownKekeGlbPath,
  isPlausibleKekeBounds,
  computeCollisionKickOffset,
  mobileTextureAnisotropy,
  defaultSharpness,
} from '../js/KanoCoreExperienceRepairRules.js';

const moduleUrl = new URL('../js/KanoCoreExperienceRepair.js', import.meta.url);
const apiUrl = new URL('../api/players-ever.js', import.meta.url);
const moduleSource = await readFile(moduleUrl, 'utf8');
const apiSource = await readFile(apiUrl, 'utf8');

test('only explicitly catalogued keke GLB paths pass the fallback path guard', () => {
  assert.equal(isKnownKekeGlbPath('vehicles/keke/keke-3.glb'), true);
  assert.equal(isKnownKekeGlbPath('assets/models/vehicles\\keke\\keke-8.glb'), true);
  assert.equal(isKnownKekeGlbPath('characters/passengers/hijab_muslim_woman.glb'), false);
  assert.equal(isKnownKekeGlbPath('vehicles/keke/not-a-keke.glb'), false);
  assert.match(moduleSource, /isPlausibleKekeBounds\(measured\.size, measured\.meshCount\)/);
  assert.match(moduleSource, /Character\/human assets cannot pass this guard/);
});

test('keke bounds check rejects tiny, oversized, and mesh-poor candidates', () => {
  assert.equal(isPlausibleKekeBounds({ x: 1.8, y: 1.85, z: 0.95 }, 12), true);
  assert.equal(isPlausibleKekeBounds({ x: 0.05, y: 0.1, z: 0.04 }, 8), false);
  assert.equal(isPlausibleKekeBounds({ x: 2, y: 1.85, z: 1 }, 1), false);
  assert.equal(isPlausibleKekeBounds({ x: 1, y: 16, z: 1 }, 20), false);
});

test('collision kick is zero at contact start/end and moves sideways in between', () => {
  assert.equal(computeCollisionKickOffset(0.62, 0.62, 1), 0);
  assert.ok(computeCollisionKickOffset(0.31, 0.62, 1) > 1.8);
  assert.ok(computeCollisionKickOffset(0.31, 0.62, -1) < -1.8);
  assert.equal(computeCollisionKickOffset(0, 0.62, 1), 0);
  assert.match(moduleSource, /const original = proto\.moveTraffic/);
  assert.match(moduleSource, /collisionKickDuration = 0\.62/);
});

test('mobile signage anisotropy is bounded by hardware support', () => {
  assert.equal(mobileTextureAnisotropy(16), 8);
  assert.equal(mobileTextureAnisotropy(4), 4);
  assert.equal(mobileTextureAnisotropy(0), 1);
  assert.match(moduleSource, /LinearMipmapLinearFilter/);
  assert.match(moduleSource, /1800/);
});

test('default phone sharpness is raised without overwriting explicit choices', () => {
  assert.equal(defaultSharpness(null), 'sharp');
  assert.equal(defaultSharpness('standard'), 'sharp');
  assert.equal(defaultSharpness('max'), 'max');
  assert.equal(defaultSharpness('battery-saver'), 'battery-saver');
  assert.match(moduleSource, /kano-life-render-sharpness-v1/);
});

test('all-time player counter counts unique browser profiles only when a game starts', () => {
  assert.match(apiSource, /SADD/);
  assert.match(apiSource, /SCARD/);
  assert.match(apiSource, /kano-life:players-ever:v1/);
  assert.match(apiSource, /exactHumanCount: false/);
  assert.match(moduleSource, /installPlayersEverStartHook/);
  assert.match(moduleSource, /unique browser profiles/i);
});

test('pothole fallback keeps original marker if new geometry construction fails', () => {
  assert.match(moduleSource, /const originalMakePotholeActor = proto\.makePotholeActor/);
  assert.match(moduleSource, /originalMakePotholeActor\.call\(this, zone, \.\.\.args\)/);
  assert.match(moduleSource, /KANO_POTHOLE_BROKEN_ASPHALT_RIM/);
  assert.match(moduleSource, /KANO_POTHOLE_RECESSED_DARK_CENTRE/);
  assert.match(moduleSource, /KANO_POTHOLE_EXPOSED_AGGREGATE/);
});
