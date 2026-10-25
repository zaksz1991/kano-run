import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chooseKanoTrafficTurnSide } from '../js/KanoTrafficJunctionTurnMath.js';

async function loadAdapterFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kano-traffic-hook-'));
  const js = path.join(root, 'js');
  await mkdir(js, { recursive: true });
  await copyFile(new URL('../js/KanoTrafficJunctionTurnUpgrade.js', import.meta.url), path.join(js, 'KanoTrafficJunctionTurnUpgrade.js'));
  await copyFile(new URL('../js/KanoTrafficJunctionTurnMath.js', import.meta.url), path.join(js, 'KanoTrafficJunctionTurnMath.js'));
  await writeFile(path.join(js, 'game.js'), `export class Game { moveTraffic(dt) { this.originalCalls = (this.originalCalls || 0) + 1; for (const v of this.s.traffic) { v.visualOffsetX = 0; v.depth -= dt * 0.01; } } }\n`);
  await writeFile(path.join(js, 'renderer3d.js'), `export class Renderer3D { syncTraffic(state) { this.originalSyncCalls = (this.originalSyncCalls || 0) + 1; } }\n`);
  const adapterUrl = pathToFileURL(path.join(js, 'KanoTrafficJunctionTurnUpgrade.js')).href + `?fixture=${Date.now()}-${Math.random()}`;
  const { Game } = await import(pathToFileURL(path.join(js, 'game.js')).href);
  const { Renderer3D } = await import(pathToFileURL(path.join(js, 'renderer3d.js')).href);
  await import(adapterUrl);
  return { root, Game, Renderer3D };
}

function makeVehicle(id) {
  return { id, type: 'car', lane: 1, direction: 1, depth: 0.10, speedKmh: 25, passed: false };
}

function findTurningId(junctionKey = '3600:0') {
  for (let i = 0; i < 1000; i += 1) {
    const id = `integration-vehicle-${i}`;
    if (chooseKanoTrafficTurnSide(id, junctionKey, 1) !== 0) return id;
  }
  throw new Error('Could not find a deterministic turning fixture ID');
}

test('Game.moveTraffic hook preserves the original update and exposes turn offset to collision reads', async () => {
  const fixture = await loadAdapterFixture();
  try {
    const game = new fixture.Game();
    const vehicle = makeVehicle(findTurningId());
    game.kanoWorldDistanceKm = 0.36;
    game.kanoNavigationState = { nextJunctionAt: 0.36, junctionIndex: 0, turn: null };
    game.s = { traffic: [vehicle], distance: 0.36 };
    game.moveTraffic(0.016);
    assert.equal(game.originalCalls, 1, 'original traffic movement still runs');
    assert.equal(vehicle.__kanoTurnOffsetAccessor, true, 'collision and rendering share visualOffsetX');
    assert.ok(vehicle.kanoTurn, 'vehicle acquired a stable junction turn');
    assert.ok(Math.abs(vehicle.visualOffsetX) > 0, 'turn offset remains after the original method resets its base offset');
    assert.equal(vehicle.visualOffsetX, vehicle._kanoVisualOffsetBase + vehicle._kanoTurnOffsetX);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('Renderer3D hook applies yaw to GLB actors and mobile fallback instances', async () => {
  const fixture = await loadAdapterFixture();
  try {
    const renderer = new fixture.Renderer3D();
    const vehicle = { id: 'render-1', type: 'car', lane: 1, direction: -1, depth: 0.2, visualOffsetX: 0.4, kanoVisualYawDelta: 0.31 };
    const actor = { rotation: { y: 0 } };
    renderer.trafficActors = new Map([[vehicle.id, actor]]);
    const position = { set(x, y, z) { this.x=x; this.y=y; this.z=z; } };
    const rotation = { set(x, y, z) { this.x=x; this.y=y; this.z=z; } };
    const scale = { set(x, y, z) { this.x=x; this.y=y; this.z=z; } };
    const transform = { position, rotation, scale, updateMatrix() { this.matrix = { rotationY: this.rotation.y, x: this.position.x, z: this.position.z }; } };
    const matrices = [];
    const batch = { mesh: { count: 1, instanceMatrix: { needsUpdate: false }, setMatrixAt(i, matrix) { matrices[i] = matrix; } } };
    renderer.mobile = true;
    renderer._mobileTrafficBatches = new Map([['car', batch]]);
    renderer._mobileFallbackTrafficByType = new Map([['car', [vehicle]]]);
    renderer._mobileTrafficInstanceTransform = transform;
    renderer.syncTraffic({ traffic: [vehicle] });
    assert.equal(renderer.originalSyncCalls, 1, 'original renderer synchronization still runs');
    assert.ok(Math.abs(actor.rotation.y - (Math.PI + 0.31)) < 1e-12, 'oncoming GLB actor receives direction-aware yaw');
    assert.ok(Math.abs(matrices[0].rotationY - (Math.PI + 0.31)) < 1e-12, 'mobile instance receives the same yaw');
    assert.ok(Math.abs(matrices[0].x - 0.4) < 1e-12, 'mobile instance retains the shared lateral offset');
    assert.equal(batch.mesh.instanceMatrix.needsUpdate, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
