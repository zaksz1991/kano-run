import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MISSION_POOL, SAFE_SPEED_MISSION_KMH } from '../js/config.js';
import { getMobileRatios } from '../js/KanoDeviceTier.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('the safe-speed mission can be achieved by a normal city keke', () => {
  const mission = MISSION_POOL.find((item) => item.id === 'safeSpeed');
  assert.equal(SAFE_SPEED_MISSION_KMH, 30);
  assert.match(mission.text, /30 km\/h/);
  assert.equal(mission.target, 12);
});

test('city keke acceleration and cruise speed are increased without changing Time Attack', () => {
  const game = read('js/game.js');
  assert.match(game, /this\.mode === 'timeAttack'\s*\?\s*150\s*:\s*this\.mode === 'freeRoam'\s*\?\s*48\s*:\s*46/);
  assert.match(game, /this\.mode === 'timeAttack'\s*\?\s*1\.8\s*:\s*1\.35/);
  assert.match(game, /s\.speed >= SAFE_SPEED_MISSION_KMH/);
});

test('roadside pull-over position is clamped into view and camera tracks lateral movement', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /new THREE\.PlaneGeometry\(10\.0, 250\)/);
  assert.match(renderer, /-3\.45[\s\S]*?3\.45/);
  assert.match(renderer, /const cameraFollow = driverView \? 0\.72 : 0\.92/);
  assert.match(renderer, /\(Number\(vehicle\.visualOffsetX\) \|\| 0\)/);
});

test('traffic collision checks physical lane separation and deflects a contacting vehicle', () => {
  const game = read('js/game.js');
  assert.match(game, /const playerWorldX = clamp/);
  assert.match(game, /const lateralGap = Math\.abs\(trafficWorldX - playerWorldX\)/);
  assert.match(game, /if \(lateralGap <= collisionGap\)/);
  assert.match(game, /vehicle\.collisionKickTime = 0\.44/);
});

test('mobile pixel budgets are lower on weaker hardware and do not force 2D', () => {
  assert.ok(getMobileRatios('low').start < getMobileRatios('mid').start);
  assert.ok(getMobileRatios('mid').start < getMobileRatios('high').start);
  const adaptive = read('js/KanoAdaptiveQuality.js');
  assert.match(adaptive, /this\.setLevel\(this\.levelIndex \+ 1, now, 'performance'\)/);
  assert.doesNotMatch(adaptive, /start2D|Renderer2D/);
});

test('3D startup uses one WebGL2 canvas/context instead of force-losing a probe context', () => {
  const main = read('js/main.js');
  assert.match(main, /const activeCanvas = freshCanvas\(\)/);
  assert.match(main, /activeCanvas\.getContext\('webgl2'/);
  assert.doesNotMatch(main, /WEBGL_lose_context/);
});
