import test from 'node:test';
import assert from 'node:assert/strict';
import { createKanoRoadPath } from '../js/KanoDriveableRoadGeometry.js';
import { createKanoTrafficRoadNetwork } from '../js/KanoTrafficRoadNetwork.js';

function road(id, start, end, kind = 'road') {
  const dx = (end.x - start.x) / 3;
  const dz = (end.z - start.z) / 3;
  return createKanoRoadPath({ id, segments: [{
    p0: start,
    p1: { x: start.x + dx, y: start.y ?? 0, z: start.z + dz },
    p2: { x: end.x - dx, y: end.y ?? 0, z: end.z - dz },
    p3: end,
    kind,
  }] });
}

function buildNetwork() {
  const network = createKanoTrafficRoadNetwork({ connectionTolerance: 0.75 });
  assert.equal(network.ok, true);
  assert.equal(network.addPath({ path: road('west-main', { x: -20, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), fromNode: 'west', toNode: 'junction' }).ok, true);
  assert.equal(network.addPath({ path: road('north-branch', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }), fromNode: 'junction', toNode: 'north', turn: 'left' }).ok, true);
  assert.equal(network.addPath({ path: road('east-main', { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }), fromNode: 'junction', toNode: 'east', turn: 'straight' }).ok, true);
  assert.equal(network.addPath({ path: road('south-branch', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -20 }), fromNode: 'junction', toNode: 'south', turn: 'right' }).ok, true);
  return network;
}

test('network accepts only valid explicit paths and records junction branches', () => {
  const network = buildNetwork();
  const snapshot = network.snapshot();
  assert.equal(snapshot.nodeCount, 5);
  assert.equal(snapshot.pathCount, 4);
  assert.deepEqual(snapshot.paths.filter(path => path.fromNode === 'junction').map(path => path.turn).sort(), ['left', 'right', 'straight']);
});

test('route planner finds an actual connected branch path', () => {
  const network = buildNetwork();
  const route = network.planRoute({ fromNode: 'west', toNode: 'north', seed: 'vehicle-12' });
  assert.equal(route.ok, true);
  assert.deepEqual(route.pathIds, ['west-main', 'north-branch']);
  assert.deepEqual(route.nodeIds, ['west', 'junction', 'north']);
  assert.ok(route.length > 0);
});

test('route planner reports unreachable destinations instead of inventing roads', () => {
  const network = buildNetwork();
  assert.deepEqual(network.planRoute({ fromNode: 'north', toNode: 'west' }), { ok: false, reason: 'destination-unreachable' });
  assert.deepEqual(network.planRoute({ fromNode: 'missing', toNode: 'west' }), { ok: false, reason: 'route-node-not-found' });
});

test('route selection is stable for a given vehicle seed', () => {
  const network = buildNetwork();
  const first = network.planRoute({ fromNode: 'junction', toNode: 'north', seed: 'keke-7' });
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(network.planRoute({ fromNode: 'junction', toNode: 'north', seed: 'keke-7' }), first);
  }
});

test('connection validation flags disconnected paths without modifying their geometry', () => {
  const network = createKanoTrafficRoadNetwork({ connectionTolerance: 0.5 });
  network.addPath({ path: road('approach', { x: -10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), fromNode: 'west', toNode: 'j' });
  network.addPath({ path: road('branch-a', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }), fromNode: 'j', toNode: 'north' });
  network.addPath({ path: road('branch-b', { x: 4, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), fromNode: 'j', toNode: 'east' });
  const validation = network.validateConnections();
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(issue => issue.nodeId === 'j'));
});


test('one-way approach endpoints are checked against outgoing junction branches', () => {
  const network = createKanoTrafficRoadNetwork({ connectionTolerance: 0.5 });
  // Both outgoing branches meet at the same point, but the incoming approach
  // ends six scene units away. The old outgoing-only validator missed this.
  network.addPath({ path: road('approach-far', { x: -10, y: 0, z: 6 }, { x: -6, y: 0, z: 6 }), fromNode: 'west', toNode: 'j' });
  network.addPath({ path: road('branch-north', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }), fromNode: 'j', toNode: 'north' });
  network.addPath({ path: road('branch-east', { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), fromNode: 'j', toNode: 'east' });
  const validation = network.validateConnections();
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(issue => issue.nodeId === 'j' && issue.pathIds.includes('approach-far')));
});

test('sampleRoutePose returns world position and heading from registered geometry', () => {
  const network = buildNetwork();
  const route = network.planRoute({ fromNode: 'west', toNode: 'north' });
  const pose = network.sampleRoutePose(route, 1, 0.5);
  assert.equal(pose.ok, true);
  assert.equal(pose.networkPathId, 'north-branch');
  assert.ok(Number.isFinite(pose.yaw));
  assert.ok(Number.isFinite(pose.position.x));
  assert.ok(Number.isFinite(pose.position.z));
});

test('network rejects duplicate paths and malformed connections', () => {
  const network = createKanoTrafficRoadNetwork();
  const path = road('single', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 });
  assert.equal(network.addPath({ path, fromNode: 'a', toNode: 'b' }).ok, true);
  assert.deepEqual(network.addPath({ path, fromNode: 'a', toNode: 'b' }), { ok: false, reason: 'road-path-duplicate' });
  assert.deepEqual(network.addPath({ path, fromNode: 'a', toNode: 'a' }), { ok: false, reason: 'self-loop-not-supported' });
});
