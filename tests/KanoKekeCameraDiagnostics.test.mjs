import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { measureKekeCameraDiagnostics } from '../js/KanoKekeCameraDiagnostics.js';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z); }
  copy(other) { this.x = other.x; this.y = other.y; this.z = other.z; return this; }
}
class Box3 {
  setFromObject(root) { this.data = root.cameraTestBounds; return this; }
  isEmpty() { return !this.data || this.data.empty === true; }
  getSize(out) { return out.copy(this.data.size); }
  getCenter(out) { return out.copy(this.data.center); }
}
class Matrix4 { multiplyMatrices() { return this; } }
class Frustum {
  setFromProjectionMatrix() { return this; }
  intersectsBox(box) { return box.data.inFrustum !== false; }
}
const THREE = { Vector3, Box3, Matrix4, Frustum };
function rootWithBounds(overrides = {}) {
  return {
    cameraTestBounds: {
      size: new Vector3(1.8, 1.7, 3.5),
      center: new Vector3(0, 0.8, 2),
      inFrustum: true,
      ...overrides,
    },
    updateWorldMatrix() { this.updated = true; },
  };
}
function cameraAt(x = 0, y = 2, z = 8) {
  return {
    position: new Vector3(x, y, z),
    projectionMatrix: {},
    matrixWorldInverse: {},
    updateMatrixWorld() { this.updated = true; },
    getWorldPosition(out) { return out.copy(this.position); },
  };
}

test('camera diagnostics measure world bounds, camera position, distance and frustum without changing transforms', () => {
  const root = rootWithBounds();
  const camera = cameraAt();
  const result = measureKekeCameraDiagnostics(root, camera, THREE);
  assert.equal(result.available, true);
  assert.equal(result.boundsValid, true);
  assert.equal(result.inFrustum, true);
  assert.deepEqual(result.boundsSize, { x: 1.8, y: 1.7, z: 3.5 });
  assert.deepEqual(result.boundsCenter, { x: 0, y: 0.8, z: 2 });
  assert.deepEqual(result.cameraWorldPosition, { x: 0, y: 2, z: 8 });
  assert.ok(Math.abs(result.distanceToCenter - Math.hypot(1.2, 6)) < 1e-10);
  assert.equal(root.updated, true);
  assert.equal(camera.updated, true);
  assert.equal(root.position, undefined, 'diagnostic does not create or rewrite transforms');
});

test('camera diagnostics distinguish bounds outside the camera frustum', () => {
  const result = measureKekeCameraDiagnostics(rootWithBounds({ inFrustum: false }), cameraAt(), THREE);
  assert.equal(result.available, true);
  assert.equal(result.boundsValid, true);
  assert.equal(result.inFrustum, false);
  assert.equal(result.reason, 'bounds-outside-camera-frustum');
});

test('camera diagnostics return a useful state for empty bounds or unavailable dependencies', () => {
  const empty = measureKekeCameraDiagnostics(rootWithBounds({ empty: true }), cameraAt(), THREE);
  assert.equal(empty.boundsValid, false);
  assert.equal(empty.reason, 'empty-world-bounds');
  const unavailable = measureKekeCameraDiagnostics(null, cameraAt(), THREE);
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.reason, 'camera-or-three-unavailable');
});

test('camera diagnostics fail safely if a bounds traversal throws', () => {
  const broken = { updateWorldMatrix() { throw new Error('test-bounds-error'); } };
  const result = measureKekeCameraDiagnostics(broken, cameraAt(), THREE);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'measurement-error');
  assert.equal(result.error, 'test-bounds-error');
});

test('renderer only enables expensive camera bounds measurement for opt-in diagnostics and exports the data', async () => {
  const renderer = await readFile(new URL('../js/renderer3d.js', import.meta.url), 'utf8');
  assert.match(renderer, /import \{ measureKekeCameraDiagnostics \} from '\.\/KanoKekeCameraDiagnostics\.js'/);
  assert.match(renderer, /if \(!this\._kekeRuntimeDiagnostics\?\.enabled\) return/);
  assert.match(renderer, /this\._cachedKekeCameraDiagnostics = measureKekeCameraDiagnostics\(player, this\.camera, THREE\)/);
  assert.match(renderer, /camera: this\._cachedKekeCameraDiagnostics/);
  assert.match(renderer, /this\._nextKekeCameraDiagnosticsAt = diagnosticsNow \+ 900/);
});
