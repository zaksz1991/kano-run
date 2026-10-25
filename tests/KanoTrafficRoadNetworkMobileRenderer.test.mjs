import test from 'node:test';
import assert from 'node:assert/strict';
import { createKanoRoadPath } from '../js/KanoDriveableRoadGeometry.js';
import { createKanoTrafficRoadNetworkBridge } from '../js/KanoTrafficRoadNetworkBridge.js';

function path(id, start, end) {
  const lerp = (a, b, t) => a + (b - a) * t;
  return createKanoRoadPath({ id, segments: [{
    p0: start,
    p1: { x: lerp(start.x, end.x, 1 / 3), y: lerp(start.y, end.y, 1 / 3), z: lerp(start.z, end.z, 1 / 3) },
    p2: { x: lerp(start.x, end.x, 2 / 3), y: lerp(start.y, end.y, 2 / 3), z: lerp(start.z, end.z, 2 / 3) },
    p3: end,
  }] }).path;
}

class FakeGame {
  constructor() { this.s = { traffic: [] }; }
  moveTraffic() { for (const vehicle of this.s.traffic) vehicle.depth -= 0.1; }
}

function vector3() {
  return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
}

class FakeRenderer {
  constructor() {
    this.mobile = true;
    this._mobileTrafficInstanceTransform = {
      position: vector3(), rotation: vector3(), scale: vector3(), matrix: null,
      updateMatrix() {
        this.matrix = {
          position: { x: this.position.x, y: this.position.y, z: this.position.z },
          rotation: { x: this.rotation.x, y: this.rotation.y, z: this.rotation.z },
          scale: { x: this.scale.x, y: this.scale.y, z: this.scale.z },
        };
      },
    };
    this._mobileTrafficBatches = new Map([['car', { mesh: {
      count: 1, matrices: [], instanceMatrix: { needsUpdate: false },
      setMatrixAt(index, matrix) { this.matrices[index] = structuredClone(matrix); },
    } }]]);
    this._mobileFallbackTrafficByType = new Map();
  }
  syncTraffic() { return 'normal-render'; }
}

test('mobile instanced traffic receives routed road XYZ and heading, including elevation', () => {
  const vehicle = { id: 'mobile-car', type: 'car', lane: 1, direction: 1, depth: 0, visualOffsetX: 0 };
  const game = new FakeGame();
  game.s.traffic.push(vehicle);
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: FakeGame, RendererClass: FakeRenderer, windowObject: { __KANO_ACTIVE_GAME__: game } });
  assert.equal(bridge.ok, true);
  assert.equal(bridge.registerPath({
    path: path('elevated-curve', { x: 1.25, y: 4.5, z: 0 }, { x: 7.75, y: 9.5, z: 100 }),
    fromNode: 'a', toNode: 'b', turn: 'right',
  }).ok, true);
  assert.equal(bridge.assignVehicleRoute({ vehicleId: vehicle.id, fromNode: 'a', toNode: 'b', progress: 0.4 }).ok, true);
  const renderer = new FakeRenderer();
  renderer._mobileFallbackTrafficByType.set('car', [vehicle]);
  assert.equal(renderer.syncTraffic({ traffic: game.s.traffic }), 'normal-render');
  const matrix = renderer._mobileTrafficBatches.get('car').mesh.matrices[0];
  assert.ok(matrix);
  assert.ok(Math.abs(matrix.position.x - vehicle.kanoRoadPose.position.x) < 1e-6);
  assert.ok(Math.abs(matrix.position.y - vehicle.kanoRoadPose.position.y) < 1e-6);
  assert.ok(Math.abs(matrix.position.z - vehicle.kanoRoadPose.position.z) < 1e-6);
  assert.ok(Math.abs(matrix.rotation.y - vehicle.kanoRoadPose.yaw) < 1e-6);
  assert.equal(renderer._mobileTrafficBatches.get('car').mesh.instanceMatrix.needsUpdate, true);
});

test('mobile renderer leaves non-routed instance matrices untouched', () => {
  const vehicle = { id: 'ordinary-car', type: 'car', lane: 1, direction: 1, depth: 0 };
  const game = new FakeGame();
  game.s.traffic.push(vehicle);
  const bridge = createKanoTrafficRoadNetworkBridge({ GameClass: FakeGame, RendererClass: FakeRenderer, windowObject: { __KANO_ACTIVE_GAME__: game } });
  assert.equal(bridge.ok, true);
  const renderer = new FakeRenderer();
  renderer._mobileFallbackTrafficByType.set('car', [vehicle]);
  renderer.syncTraffic({ traffic: game.s.traffic });
  assert.equal(renderer._mobileTrafficBatches.get('car').mesh.matrices.length, 0);
  assert.equal(renderer._mobileTrafficBatches.get('car').mesh.instanceMatrix.needsUpdate, false);
});
