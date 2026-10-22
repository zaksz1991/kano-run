import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { advanceInstancedRoadPattern } from '../js/KanoInstancedRoadScroll.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererPath = path.resolve(here, '../js/renderer3d.js');

function makeHarness(records, rootZ = 0) {
  const writes = [];
  const matrix = {};
  const scratch = {
    position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } },
    rotation: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { Object.assign(this, { x, y, z }); } },
    matrix,
    updateMatrix() { Object.assign(matrix, { x: this.position.x, y: this.position.y, z: this.position.z, rotationX: this.rotation.x }); },
  };
  const mesh = {
    position: { z: rootZ },
    instanceMatrix: { needsUpdate: false },
    setMatrixAt(index, value) { writes.push({ index, ...value }); },
  };
  return { mesh, writes, scratch };
}

test('normal road movement scrolls the instanced mesh without rewriting its matrices', () => {
  const records = [{ x: -4.8, z: -20 }, { x: 4.8, z: -70 }];
  const { mesh, writes, scratch } = makeHarness(records);
  const count = advanceInstancedRoadPattern({ mesh, records, scroll: 1.25, scratch, y: 0.08 });
  assert.equal(mesh.position.z, 1.25);
  assert.equal(count, 0);
  assert.equal(writes.length, 0);
  assert.equal(mesh.instanceMatrix.needsUpdate, false);
});

test('only an instance crossing the front boundary is rewritten', () => {
  const records = [{ x: -4.8, z: -3 }, { x: 4.8, z: -40 }];
  const { mesh, writes, scratch } = makeHarness(records);
  const count = advanceInstancedRoadPattern({ mesh, records, scroll: 12, scratch, y: 0.08 });
  assert.equal(count, 1);
  assert.equal(records[0].z, -253);
  assert.equal(records[1].z, -40);
  assert.deepEqual(writes.map((entry) => entry.index), [0]);
  assert.equal(mesh.instanceMatrix.needsUpdate, true);
});

test('reverse movement recycles an instance across the back boundary', () => {
  const records = [{ x: 1.8, z: -248 }];
  const { mesh, writes, scratch } = makeHarness(records);
  const count = advanceInstancedRoadPattern({ mesh, records, scroll: -4, scratch, y: 0.028, rotationX: -Math.PI / 2 });
  assert.equal(count, 1);
  assert.equal(records[0].z, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].rotationX, -Math.PI / 2);
});

test('rebasing the root preserves world positions and refreshes the batch once', () => {
  const records = [{ x: -4.8, z: -248 }, { x: 4.8, z: -10 }];
  const beforeWorld = records.map((record) => record.z + 249);
  const { mesh, writes, scratch } = makeHarness(records, 249);
  const count = advanceInstancedRoadPattern({ mesh, records, scroll: 2, scratch, y: 0.08 });
  assert.equal(mesh.position.z, 1);
  assert.equal(count, records.length);
  assert.equal(writes.length, records.length);
  // First record remains inside the road loop; second crossed the front
  // boundary during the same step and was recycled by one period.
  assert.equal(records[0].z + mesh.position.z, beforeWorld[0] + 2);
  assert.equal(records[1].z + mesh.position.z, beforeWorld[1] + 2 - 250);
});

test('Renderer3D calls the shared road-pattern helper for kerbs and lane markings', async () => {
  const source = await readFile(rendererPath, 'utf8');
  assert.match(source, /import \{ advanceInstancedRoadPattern \} from '\.\/KanoInstancedRoadScroll\.js'/);
  assert.match(source, /advanceInstancedRoadPattern\(\{\s*mesh: this\.curbInstanced/);
  assert.match(source, /advanceInstancedRoadPattern\(\{\s*mesh: this\.laneDashInstanced/);
  assert.match(source, /curbMesh\.frustumCulled = false/);
  assert.match(source, /laneDashMesh\.frustumCulled = false/);
  assert.doesNotMatch(source, /for \(let index = 0; index < this\.curbRecords\.length; index \+= 1\) \{\s*const record = this\.curbRecords\[index\];\s*record\.z \+= scroll/);
});
