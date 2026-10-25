import test from 'node:test';
import assert from 'node:assert/strict';
import { createKanoRoadPath } from '../js/KanoDriveableRoadGeometry.js';
import { createKanoTrafficRoadNetworkBridge } from '../js/KanoTrafficRoadNetworkBridge.js';

function straightPath(id, start, end) {
  const point = t => ({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, z: start.z + (end.z - start.z) * t });
  return createKanoRoadPath({ id, segments: [{ p0: start, p1: point(1 / 3), p2: point(2 / 3), p3: end }] }).path;
}

class AutoRouteGame {
  constructor() { this.s = { traffic: [] }; }
  moveTraffic() { for (const vehicle of this.s.traffic) vehicle.depth -= 0.05; }
}

test('automatic routing assigns newly spawned traffic only after explicit nodes and paths are configured', () => {
  const game = new AutoRouteGame();
  const windowObject = { __KANO_ACTIVE_GAME__: game };
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: AutoRouteGame, windowObject });
  game.s.traffic.push({ id: 'new-car-1', type: 'car', lane: 1, depth: 0, direction: 1, visualOffsetX: 0, kanoRoadEntryNode: 'south', kanoRoadExitNode: 'north' });

  assert.equal(bridge.configureAutoRouting({ enabled: true, entryNodes: ['south'], exitNodes: ['north'] }).ok, false);
  assert.equal(bridge.audit().routedVehicleCount, 0);

  assert.equal(bridge.registerPath({
    path: straightPath('south-approach', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 50 }),
    fromNode: 'south', toNode: 'junction', turn: 'straight',
  }).ok, true);
  assert.equal(bridge.registerPath({
    path: straightPath('north-exit', { x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: 100 }),
    fromNode: 'junction', toNode: 'north', turn: 'straight',
  }).ok, true);

  const configured = bridge.configureAutoRouting({ enabled: true, entryNodes: ['south'], exitNodes: ['north'], seed: 'test' });
  assert.equal(configured.ok, true);
  game.moveTraffic();
  assert.equal(bridge.audit().routedVehicleCount, 1);
  assert.equal(game.s.traffic[0].kanoRoadRoute.ok, true);
  assert.ok(['south-approach', 'north-exit'].includes(game.s.traffic[0].kanoRoadPose.pathId));
});

test('automatic routing does not hijack untagged ordinary traffic by default', () => {
  const game = new AutoRouteGame();
  const vehicle = { id: 'ordinary-car', type: 'car', lane: 1, depth: -2, direction: 1, visualOffsetX: 0 };
  game.s.traffic.push(vehicle);
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: AutoRouteGame, windowObject: { __KANO_ACTIVE_GAME__: game } });
  const point = t => ({ x: 0, y: 0, z: 50 * t });
  assert.equal(bridge.registerPath({ path: straightPath('road', point(0), point(1)), fromNode: 'south', toNode: 'north' }).ok, true);
  assert.equal(bridge.configureAutoRouting({ enabled: true, entryNodes: ['south'], exitNodes: ['north'] }).ok, true);
  const result = bridge.assignUnroutedTraffic(game.s.traffic);
  assert.deepEqual(result, { assigned: 0, skipped: 1 });
  assert.equal(vehicle.kanoRoadRoute, undefined);
  assert.equal(vehicle.depth, -2);
});

test('automatic routing rejects unknown nodes and can be disabled', () => {
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: AutoRouteGame, windowObject: {} });
  assert.deepEqual(bridge.configureAutoRouting({ enabled: true, entryNodes: ['missing'], exitNodes: ['also-missing'] }), {
    ok: false, reason: 'route-node-not-found', nodes: ['missing', 'also-missing'],
  });
  assert.equal(bridge.configureAutoRouting({ enabled: false }).ok, true);
  assert.equal(bridge.audit().autoRouting.enabled, false);
});

test('completed routes continue onto a connected exit without teleporting to an unrelated path', () => {
  const game = new AutoRouteGame();
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: AutoRouteGame, windowObject: { __KANO_ACTIVE_GAME__: game } });
  const points = {
    south: { x: 0, y: 0, z: 0 },
    junction: { x: 0, y: 0, z: 50 },
    north: { x: 0, y: 0, z: 100 },
  };
  assert.equal(bridge.registerPath({ path: straightPath('south-junction', points.south, points.junction), fromNode: 'south', toNode: 'junction' }).ok, true);
  assert.equal(bridge.registerPath({ path: straightPath('junction-north', points.junction, points.north), fromNode: 'junction', toNode: 'north' }).ok, true);
  assert.equal(bridge.registerPath({ path: straightPath('north-south', points.north, points.south), fromNode: 'north', toNode: 'south' }).ok, true);
  assert.equal(bridge.configureAutoRouting({ enabled: true, entryNodes: ['south'], exitNodes: ['north', 'south'], seed: 'loop' }).ok, true);
  const vehicle = { id: 'loop-car', type: 'car', lane: 1, depth: -100 / 88, direction: 1, visualOffsetX: 0 };
  game.s.traffic.push(vehicle);
  const initial = bridge.assignVehicleRoute({ vehicleId: 'loop-car', fromNode: 'south', toNode: 'north', progress: 1 });
  assert.equal(initial.ok, true);
  vehicle.kanoRoadPathIndex = vehicle.kanoRoadRoute.pathIds.length - 1;
  vehicle.kanoRoadPathProgress = 1;
  vehicle.kanoRoadPose = { ...vehicle.kanoRoadPose, position: { x: 0, y: 0, z: 100 } };
  const continued = bridge.continueCompletedRoutes(game.s.traffic);
  assert.equal(continued.continued, 1);
  assert.equal(vehicle.kanoRoadRoute.nodeIds[0], 'north');
  assert.equal(vehicle.kanoRoadPose.position.z, 100);
});


test('automatic routing refuses graph-connected paths whose scene-space endpoints do not meet', () => {
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: AutoRouteGame, windowObject: {} });
  assert.equal(bridge.registerPath({
    path: straightPath('approach-gap', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }),
    fromNode: 'south', toNode: 'junction',
  }).ok, true);
  assert.equal(bridge.registerPath({
    path: straightPath('exit-gap', { x: 5, y: 0, z: 20 }, { x: 5, y: 0, z: 40 }),
    fromNode: 'junction', toNode: 'north',
  }).ok, true);

  const configured = bridge.configureAutoRouting({ enabled: true, entryNodes: ['south'], exitNodes: ['north'] });
  assert.equal(configured.ok, false);
  assert.equal(configured.reason, 'road-path-connections-invalid');
  assert.ok(configured.issueCount > 0);
  assert.equal(bridge.audit().autoRouting.enabled, false);
});
