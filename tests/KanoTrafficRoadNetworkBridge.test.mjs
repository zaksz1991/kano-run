import test from 'node:test';
import assert from 'node:assert/strict';
import { createKanoRoadPath } from '../js/KanoDriveableRoadGeometry.js';
import { createKanoTrafficRoadNetworkBridge } from '../js/KanoTrafficRoadNetworkBridge.js';

function path(id, start, end) {
  const lerp = (a, b, t) => a + (b - a) * t;
  return createKanoRoadPath({ id, segments: [{
    p0: start,
    p1: { x: lerp(start.x, end.x, 1 / 3), y: 0, z: lerp(start.z, end.z, 1 / 3) },
    p2: { x: lerp(start.x, end.x, 2 / 3), y: 0, z: lerp(start.z, end.z, 2 / 3) },
    p3: end,
  }] }).path;
}

class FakeGame {
  constructor() { this.s = { traffic: [] }; }
  moveTraffic() {
    for (const vehicle of this.s.traffic) vehicle.depth -= 0.1;
    return 'original-movement-ran';
  }
}

test('navigation bridge installs on Game and updates explicitly routed live traffic after movement', () => {
  const game = new FakeGame();
  const vehicle = { id: 'car-1', lane: 1, depth: 0, direction: 1, visualOffsetX: 0 };
  game.s.traffic.push(vehicle);
  const windowObject = { __KANO_ACTIVE_GAME__: game };
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: FakeGame, windowObject });
  assert.equal(bridge.ok, true);
  assert.equal(bridge.audit().installed, true);
  assert.equal(bridge.registerPath({
    path: path('approach', { x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 100 }),
    fromNode: 'south', toNode: 'junction', turn: 'straight',
  }).ok, true);
  assert.equal(bridge.registerPath({
    path: path('exit', { x: 6, y: 0, z: 100 }, { x: 6, y: 0, z: 200 }),
    fromNode: 'junction', toNode: 'north', turn: 'straight',
  }).ok, true);
  const assigned = bridge.assignVehicleRoute({ vehicleId: 'car-1', fromNode: 'south', toNode: 'north', progress: 0.1 });
  assert.equal(assigned.ok, true);
  const result = game.moveTraffic();
  assert.equal(result, 'original-movement-ran');
  assert.equal(vehicle.kanoRoadPose.pathId, 'approach');
  assert.ok(vehicle.kanoRoadPose.position.z > assigned.pose.position.z);
  const collisionX = (vehicle.lane - 1) * 3 + vehicle.visualOffsetX;
  assert.ok(Math.abs(collisionX - vehicle.kanoRoadPose.position.x) < 1e-6);
  assert.equal(bridge.audit().routedVehicleCount, 1);
});
