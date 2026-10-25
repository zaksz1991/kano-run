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
  await writeFile(path.join(js, 'game.js'), `export class Game { moveTraffic(dt) { this.originalCalls = (this.originalCalls || 0) + 1; for (let i = this.s.traffic.length - 1; i >= 0; i -= 1) { const v = this.s.traffic[i]; v.visualOffsetX = 0; v.depth -= dt * 0.01; if (this.simulateDespawn && v.depth < -0.12) this.s.traffic.splice(i, 1); } } }\n`);
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

test('turning AI traffic enters the perpendicular branch and keeps moving sideways', async () => {
  const fixture = await loadAdapterFixture();
  try {
    const game = new fixture.Game();
    const junctionKey = '3600:0';
    const id = findTurningId(junctionKey);
    const vehicle = makeVehicle(id);
    game.kanoWorldDistanceKm = 0.36;
    game.kanoNavigationState = { nextJunctionAt: 0.36, junctionIndex: 0, turn: null };
    game.s = { traffic: [vehicle], distance: 0.36 };
    const junctionDepth = (0 * 1008 - 2) / 88;
    vehicle.depth = junctionDepth - 0.15;

    game.moveTraffic(0.016);
    assert.equal(vehicle.kanoTurn?.phase, 'branch', 'vehicle completes its approach curve and joins the crossroad');
    assert.ok(Math.abs(Math.abs(vehicle.kanoVisualYawDelta) - Math.PI / 2) < 1e-9, 'vehicle keeps a 90-degree branch heading');
    const firstX = vehicle.kanoTurn.branchX;
    const pinnedDepth = vehicle.depth;

    game.moveTraffic(0.016);
    assert.ok(Math.abs(vehicle.kanoTurn.branchX) > Math.abs(firstX), 'vehicle continues along the side road instead of returning to its original lane');
    assert.ok(Math.abs(vehicle.depth - pinnedDepth) < 1e-9, 'vehicle remains on the crossroad depth while travelling sideways');
    assert.ok(Math.abs(vehicle.visualOffsetX) > 3, 'branch movement remains in the same lateral position used by collision checks');
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('an in-progress AI turn stays attached to its original junction after navigation advances', async () => {
  const fixture = await loadAdapterFixture();
  try {
    const game = new fixture.Game();
    const junctionKey = '3600:0';
    const vehicle = makeVehicle(findTurningId(junctionKey));
    game.kanoWorldDistanceKm = 0.36;
    game.kanoNavigationState = { nextJunctionAt: 0.36, junctionIndex: 0, turn: null };
    game.s = { traffic: [vehicle], distance: 0.36 };
    const junctionDepth = (0 * 1008 - 2) / 88;
    vehicle.depth = junctionDepth + 0.10;

    game.moveTraffic(0.016);
    assert.equal(vehicle.kanoTurn?.phase, 'approach');
    const originalTarget = vehicle.kanoTurn.junctionWorldKm;
    const progressBeforeAdvance = vehicle.kanoTurnProgress;

    // This mirrors the navigation module advancing its target immediately
    // after the player chooses a branch, then finishing its own turn animation.
    game.kanoNavigationState.nextJunctionAt += 0.46;
    game.kanoNavigationState.junctionIndex += 1;
    game.kanoNavigationState.turn = null;
    game.moveTraffic(0.016);

    assert.equal(vehicle.kanoTurn?.junctionWorldKm, originalTarget, 'vehicle retains its committed junction');
    assert.equal(vehicle.kanoTurn?.phase, 'approach', 'global target change must not force an early branch transition');
    assert.ok(vehicle.kanoTurnProgress >= progressBeforeAdvance, 'turn progress continues smoothly');
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});


test('AI traffic does not miss a junction when a large frame step crosses the whole turn window', async () => {
  const fixture = await loadAdapterFixture();
  try {
    const game = new fixture.Game();
    const junctionKey = '3600:0';
    const vehicle = makeVehicle(findTurningId(junctionKey));
    game.kanoWorldDistanceKm = 0.36;
    game.kanoNavigationState = { nextJunctionAt: 0.36, junctionIndex: 0, turn: null };
    game.s = { traffic: [vehicle], distance: 0.36 };
    const junctionDepth = (0 * 1008 - 2) / 88;
    vehicle.depth = junctionDepth + 0.5;

    game.moveTraffic(0); // Record the vehicle before the approach envelope.
    assert.equal(vehicle.kanoTurn, undefined);
    game.moveTraffic(100); // The original movement loop jumps beyond the whole envelope.
    assert.equal(vehicle.kanoTurn, undefined, 'the crossing is detected on the following update');
    game.moveTraffic(0);

    assert.equal(vehicle.kanoTurn?.phase, 'branch', 'the vehicle joins the branch instead of silently skipping the junction');
    assert.ok(Math.abs(Math.abs(vehicle.kanoVisualYawDelta) - Math.PI / 2) < 1e-9);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});



test('branching traffic survives the base-game despawn plane until it leaves the junction', async () => {
  const fixture = await loadAdapterFixture();
  try {
    const game = new fixture.Game();
    const vehicle = makeVehicle(findTurningId());
    game.kanoWorldDistanceKm = 0.36;
    game.kanoNavigationState = { nextJunctionAt: 0.36, junctionIndex: 0, turn: null };
    game.s = { traffic: [vehicle], distance: 0.36 };
    game.simulateDespawn = true;
    const junctionDepth = (0 * 1008 - 2) / 88;
    vehicle.depth = junctionDepth - 0.15;

    game.moveTraffic(0.016);
    assert.equal(vehicle.kanoTurn?.phase, 'branch');

    // The junction moves behind the player. The base game would normally
    // remove the vehicle at depth < -0.12, but a committed turn must continue.
    game.kanoWorldDistanceKm = 0.39;
    game.moveTraffic(0.016);
    assert.ok(game.s.traffic.includes(vehicle), 'branching vehicle survives the ordinary despawn plane');
    assert.equal(vehicle.kanoTurn?.phase, 'branch');
    assert.ok(vehicle.depth < -0.12 && vehicle.depth > -1.35);

    // Once the junction is fully outside the visible depth range, normal
    // cleanup is allowed again.
    game.kanoWorldDistanceKm = 0.50;
    game.moveTraffic(0.016);
    assert.ok(!game.s.traffic.includes(vehicle), 'vehicle is removed after leaving the junction view');
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('AI vehicle heading is continuous when the approach phase becomes a perpendicular branch', async () => {
  const fixture = await loadAdapterFixture();
  try {
    const game = new fixture.Game();
    const junctionKey = '3600:0';
    const vehicle = makeVehicle(findTurningId(junctionKey));
    game.kanoWorldDistanceKm = 0.36;
    game.kanoNavigationState = { nextJunctionAt: 0.36, junctionIndex: 0, turn: null };
    game.s = { traffic: [vehicle], distance: 0.36 };
    const junctionDepth = (0 * 1008 - 2) / 88;
    vehicle.depth = junctionDepth - 0.15;

    game.moveTraffic(0.016);
    assert.equal(vehicle.kanoTurn?.phase, 'branch');
    const branchYaw = -vehicle.kanoTurn.side * Math.PI / 2;
    assert.ok(Math.abs(vehicle.kanoVisualYawDelta - branchYaw) < 1e-9,
      'the completed approach and branch share the same final heading');
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
