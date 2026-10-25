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
  game.s.traffic.push({ id: 'new-car-1', type: 'car', lane: 1, depth: 0, direction: 1, visualOffsetX: 0 });

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

test('automatic routing rejects unknown nodes and can be disabled', () => {
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: AutoRouteGame, windowObject: {} });
  assert.deepEqual(bridge.configureAutoRouting({ enabled: true, entryNodes: ['missing'], exitNodes: ['also-missing'] }), {
    ok: false, reason: 'route-node-not-found', nodes: ['missing', 'also-missing'],
  });
  assert.equal(bridge.configureAutoRouting({ enabled: false }).ok, true);
  assert.equal(bridge.audit().autoRouting.enabled, false);
});
