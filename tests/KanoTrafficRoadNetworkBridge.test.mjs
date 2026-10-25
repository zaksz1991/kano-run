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

test('renderer bridge applies registered road-path XYZ position and sampled heading to GLB actors', () => {
  class FakeRenderer {
    constructor() {
      this.trafficActors = new Map();
    }
    syncTraffic(state) {
      for (const vehicle of state.traffic) {
        if (!this.trafficActors.has(vehicle.id)) {
          this.trafficActors.set(vehicle.id, {
            position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
            rotation: { y: 0 },
          });
        }
      }
      return 'original-render-ran';
    }
  }
  const game = new FakeGame();
  const vehicle = { id: 'elevated-keke', lane: 1, depth: 0, direction: 1, visualOffsetX: 0 };
  game.s.traffic.push(vehicle);
  const bridge = createKanoTrafficRoadNetworkBridge({
    GameClass: FakeGame,
    RendererClass: FakeRenderer,
    windowObject: { __KANO_ACTIVE_GAME__: game },
  });
  assert.equal(bridge.ok, true);
  assert.equal(bridge.audit().rendererInstalled, true);
  assert.equal(bridge.registerPath({
    path: path('ramp', { x: 3, y: 2, z: 0 }, { x: 9, y: 5, z: 100 }),
    fromNode: 'ramp-start', toNode: 'ramp-end', turn: 'right',
  }).ok, true);
  const assignment = bridge.assignVehicleRoute({ vehicleId: vehicle.id, fromNode: 'ramp-start', toNode: 'ramp-end', progress: 0.25 });
  assert.equal(assignment.ok, true);
  const renderer = new FakeRenderer();
  assert.equal(renderer.syncTraffic(game.s), 'original-render-ran');
  const actor = renderer.trafficActors.get(vehicle.id);
  assert.ok(Math.abs(actor.position.x - vehicle.kanoRoadPose.position.x) < 1e-6);
  assert.ok(Math.abs(actor.position.y - vehicle.kanoRoadPose.position.y) < 1e-6);
  assert.ok(Math.abs(actor.position.z - vehicle.kanoRoadPose.position.z) < 1e-6);
  assert.ok(Math.abs(actor.rotation.y - vehicle.kanoRoadPose.yaw) < 1e-6);
});

test('curved road progress advances by vehicle travel distance even when depth does not change', () => {
  class TimedGame {
    constructor() { this.s = { traffic: [] }; }
    moveTraffic(dt) {
      // Simulate the normal game frame. This route runs laterally, so Z/depth
      // is intentionally almost unchanged while the vehicle travels along X.
      for (const vehicle of this.s.traffic) vehicle.depth -= 0.001 * dt;
      return 'timed-movement-ran';
    }
  }
  const game = new TimedGame();
  const vehicle = { id: 'turning-car', type: 'car', lane: 1, depth: 0, direction: 1, speedKmh: 36, visualOffsetX: 0 };
  game.s.traffic.push(vehicle);
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: TimedGame, windowObject: { __KANO_ACTIVE_GAME__: game } });
  assert.equal(bridge.ok, true);
  const lateral = createKanoRoadPath({ id: 'lateral-turn', segments: [{
    p0: { x: 0, y: 0, z: 0 },
    p1: { x: 3.333, y: 0, z: 0 },
    p2: { x: 6.667, y: 0, z: 0 },
    p3: { x: 10, y: 0, z: 0 },
  }] });
  assert.equal(lateral.ok, true);
  assert.equal(bridge.registerPath({ path: lateral, fromNode: 'turn-in', toNode: 'turn-out', turn: 'left' }).ok, true);
  const assignment = bridge.assignVehicleRoute({ vehicleId: vehicle.id, fromNode: 'turn-in', toNode: 'turn-out', progress: 0.1 });
  assert.equal(assignment.ok, true);
  game.moveTraffic(0.5); // 36 km/h for half a second = 5 scene units.
  assert.ok(vehicle.kanoRoadPathProgress > 0.58 && vehicle.kanoRoadPathProgress < 0.63, `progress=${vehicle.kanoRoadPathProgress}`);
  assert.ok(vehicle.kanoRoadPose.position.x > 5.5, `x=${vehicle.kanoRoadPose.position.x}`);
  assert.equal(vehicle.kanoRoadPose.position.z, 0);
});
