import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { capturePlayerKekeRecoveryPose } from '../js/KanoPlayerKekeRecoveryTransform.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const renderer = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');

function tuple(x, y, z, w) {
  const value = { x, y, z };
  if (w !== undefined) value.w = w;
  value.clone = () => tuple(value.x, value.y, value.z, value.w);
  value.copy = (other) => {
    value.x = other.x; value.y = other.y; value.z = other.z;
    if (other.w !== undefined) value.w = other.w;
    return value;
  };
  return value;
}

function makeObject(parent = null) {
  return {
    parent,
    position: tuple(4.2, 0.1, 2.7),
    quaternion: tuple(0, 0.12, 0, 0.9927738917),
    scale: tuple(1.2, 1.2, 1.2),
    matrixWorld: { offset: { x: 14, y: 2, z: -1 } },
    updateWorldMatrix() {},
  };
}

test('same-parent recovery captures position, orientation and scale by value', () => {
  const parent = {};
  const player = makeObject(parent);
  const pose = capturePlayerKekeRecoveryPose(player, parent, {});
  assert.equal(pose.source, 'same-parent-local');
  assert.deepEqual({ x: pose.position.x, y: pose.position.y, z: pose.position.z },
    { x: 4.2, y: 0.1, z: 2.7 });
  assert.equal(pose.quaternion.y, 0.12);
  assert.equal(pose.scale.x, 1.2);
  player.position.x = 99;
  assert.equal(pose.position.x, 4.2, 'captured pose must not mutate with original object');
});

test('recovery rejects non-finite player positions and uses safe default downstream', () => {
  const parent = {};
  const player = makeObject(parent);
  player.position.x = Number.NaN;
  assert.equal(capturePlayerKekeRecoveryPose(player, parent, {}), null);
});

test('cross-parent capture converts world transform into destination-parent coordinates', () => {
  class Matrix4 {
    constructor() { this.offset = { x: 0, y: 0, z: 0 }; }
    copy(other) { this.offset = { ...other.offset }; return this; }
    invert() {
      this.offset = { x: -this.offset.x, y: -this.offset.y, z: -this.offset.z };
      return this;
    }
    multiply(other) {
      this.offset = {
        x: this.offset.x + other.offset.x,
        y: this.offset.y + other.offset.y,
        z: this.offset.z + other.offset.z,
      };
      return this;
    }
    decompose(position, quaternion, scale) {
      position.x = this.offset.x; position.y = this.offset.y; position.z = this.offset.z;
      quaternion.x = 0; quaternion.y = 0; quaternion.z = 0; quaternion.w = 1;
      scale.x = 1; scale.y = 1; scale.z = 1;
    }
  }
  class Vector3 { constructor() { this.x=0; this.y=0; this.z=0; } }
  class Quaternion extends Vector3 {
    constructor() { super(); this.w=1; }
    normalize() { return this; }
  }
  const THREE = { Matrix4, Vector3, Quaternion };
  const oldParent = { matrixWorld: { offset: { x: 10, y: 0, z: -3 } }, updateWorldMatrix() {} };
  const targetParent = { matrixWorld: { offset: { x: 5, y: 1, z: -7 } }, updateWorldMatrix() {} };
  const player = makeObject(oldParent);
  player.matrixWorld = { offset: { x: 14, y: 2, z: -1 } };
  const pose = capturePlayerKekeRecoveryPose(player, targetParent, THREE);
  assert.equal(pose.source, 'world-converted');
  assert.deepEqual({ x: pose.position.x, y: pose.position.y, z: pose.position.z },
    { x: 9, y: 1, z: 6 });
});

test('renderer captures pose before corrective reparent and applies it to recovered keke', () => {
  assert.match(renderer, /capturePlayerKekeRecoveryPose\(\s*activePlayer,\s*recoveryParent,\s*THREE,?\s*\)/);
  assert.match(renderer, /activePlayer\.parent\?\.remove\(activePlayer\);\s*recoveryParent\.add\(activePlayer\);\s*if \(recoveryPose\)/);
  assert.match(renderer, /fallback\.position\.copy\(recoveryPose\.position\)/);
  assert.match(renderer, /fallback\.quaternion\.copy\(recoveryPose\.quaternion\)/);
  assert.match(renderer, /kanoRuntimeRecoveryPoseSource/);
  assert.match(renderer, /fallback\.scale\.set\(1, 1, 1\)/);
});
