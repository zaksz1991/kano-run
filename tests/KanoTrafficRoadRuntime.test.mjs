import test from 'node:test';
import assert from 'node:assert/strict';
import { createKanoRoadPath } from '../js/KanoDriveableRoadGeometry.js';
import { createKanoTrafficRoadNetwork } from '../js/KanoTrafficRoadNetwork.js';
import { createKanoTrafficRoadRuntime } from '../js/KanoTrafficRoadNetworkRuntime.js';

function straightPath(id, start, end) {
  const third = (a, b) => a + (b - a) / 3;
  const twoThirds = (a, b) => a + 2 * (b - a) / 3;
  return createKanoRoadPath({ id, segments: [{
    p0: start,
    p1: { x: third(start.x, end.x), y: third(start.y ?? 0, end.y ?? 0), z: third(start.z, end.z) },
    p2: { x: twoThirds(start.x, end.x), y: twoThirds(start.y ?? 0, end.y ?? 0), z: twoThirds(start.z, end.z) },
    p3: end,
  }] }).path;
}

test('reverse traversal samples the correct endpoint and reverses heading', () => {
  const network = createKanoTrafficRoadNetwork();
  const path = straightPath('two-way', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 });
  assert.equal(network.addPath({ path, fromNode: 'south', toNode: 'north', bidirectional: true }).ok, true);
  const route = network.planRoute({ fromNode: 'north', toNode: 'south', seed: 'oncoming-1' });
  assert.equal(route.ok, true);
  assert.equal(route.pathSteps[0].reverse, true);
  const start = network.sampleRoutePose(route, 0, 0);
  const end = network.sampleRoutePose(route, 0, 1);
  assert.equal(start.ok, true);
  assert.equal(end.ok, true);
  assert.ok(Math.abs(start.position.z - 10) < 0.01);
  assert.ok(Math.abs(end.position.z) < 0.01);
  assert.ok(Math.abs(Math.abs(start.yaw) - Math.PI) < 0.01);
  assert.equal(start.reverse, true);
});

test('runtime carries scene distance across connected paths of different lengths', () => {
  const network = createKanoTrafficRoadNetwork();
  const first = straightPath('approach', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 });
  const second = straightPath('exit', { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 30 });
  assert.equal(network.addPath({ path: first, fromNode: 'start', toNode: 'junction' }).ok, true);
  assert.equal(network.addPath({ path: second, fromNode: 'junction', toNode: 'end' }).ok, true);
  const route = network.planRoute({ fromNode: 'start', toNode: 'end' });
  const runtime = createKanoTrafficRoadRuntime(network);
  const vehicle = { id: 'traffic-1', lane: 1, depth: 0, direction: 1 };
  assert.equal(runtime.assignRoute(vehicle, route, { progress: 0.2 }).ok, true);
  assert.equal(runtime.updateVehicle(vehicle).ok, true);
  // A 0.2 depth movement is 17.6 scene units. Starting 2 units into
  // the 10-unit approach should leave 9.6 units along the 20-unit exit.
  vehicle.depth = vehicle.depth - 0.2;
  assert.equal(vehicle.kanoRoadPathIndex, 1);
  assert.ok(Math.abs(vehicle.kanoRoadPathProgress - 0.48) < 0.015);
  assert.ok(Math.abs(vehicle.kanoRoadPose.position.z - 19.6) < 0.3);
  const collisionWorldX = (vehicle.lane - 1) * 3 + vehicle.visualOffsetX;
  assert.ok(Math.abs(collisionWorldX - vehicle.kanoRoadPose.position.x) < 0.001);
});

test('runtime consumes distance across multiple short paths in one update', () => {
  const network = createKanoTrafficRoadNetwork();
  const points = [0, 4, 8, 12].map(z => ({ x: 0, y: 0, z }));
  for (let i = 0; i < 3; i += 1) {
    assert.equal(network.addPath({
      path: straightPath(`p${i}`, points[i], points[i + 1]),
      fromNode: `n${i}`, toNode: `n${i + 1}`,
    }).ok, true);
  }
  const route = network.planRoute({ fromNode: 'n0', toNode: 'n3' });
  const runtime = createKanoTrafficRoadRuntime(network);
  const vehicle = { id: 'fast-traffic', lane: 1, depth: 0, direction: 1 };
  runtime.assignRoute(vehicle, route, { progress: 0.1 });
  runtime.updateVehicle(vehicle);
  vehicle.depth -= 0.13; // 11.44 scene units plus 0.4 initial units.
  assert.equal(vehicle.kanoRoadPathIndex, 2);
  assert.ok(Math.abs(vehicle.kanoRoadPathProgress - 0.96) < 0.03);
});
