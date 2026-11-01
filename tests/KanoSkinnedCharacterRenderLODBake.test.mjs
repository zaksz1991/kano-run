import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bakeSkinnedCharacterStaticPose,
  restoreSkinnedCharacterPose,
} from '../js/KanoSkinnedCharacterRenderLOD.js';

class FakeVector3 {
  constructor() { this.x = 0; this.y = 0; this.z = 0; }
  fromBufferAttribute(attribute, index) {
    this.x = attribute.array[index * attribute.itemSize];
    this.y = attribute.array[index * attribute.itemSize + 1];
    this.z = attribute.array[index * attribute.itemSize + 2];
    return this;
  }
}

class FakeAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
  setXYZ(index, x, y, z) {
    this.array[index * this.itemSize] = x;
    this.array[index * this.itemSize + 1] = y;
    this.array[index * this.itemSize + 2] = z;
  }
}

class FakeGeometry {
  constructor(attributes = {}, morphAttributes = {}) {
    this.attributes = attributes;
    this.morphAttributes = morphAttributes;
    this.disposed = false;
  }
  getAttribute(name) { return this.attributes[name]; }
  deleteAttribute(name) { delete this.attributes[name]; }
  clone() {
    const attrs = Object.fromEntries(Object.entries(this.attributes).map(([key, value]) => [key, new FakeAttribute([...value.array], value.itemSize)]));
    return new FakeGeometry(attrs, structuredClone(this.morphAttributes));
  }
  computeVertexNormals() { this.normalsComputed = true; }
  computeBoundingBox() { this.boundsComputed = true; }
  computeBoundingSphere() { this.sphereComputed = true; }
  dispose() { this.disposed = true; }
}

class FakeLayers {
  constructor(mask = 1) { this.mask = mask; }
  disable(channel) { this.mask &= ~(1 << channel); }
}

class FakeNode {
  constructor() { this.children = []; this.parent = null; this.userData = {}; this.layers = new FakeLayers(); this.visible = true; }
  add(child) { if (child.parent) child.parent.remove(child); child.parent = this; this.children.push(child); }
  remove(child) { this.children = this.children.filter((entry) => entry !== child); child.parent = null; }
  traverse(callback) { callback(this); for (const child of [...this.children]) child.traverse(callback); }
  updateMatrixWorld() {}
}

class FakeMesh extends FakeNode {
  constructor(geometry, material) {
    super();
    this.isMesh = true;
    this.geometry = geometry;
    this.material = material;
    this.position = { set() {} };
    this.quaternion = { identity() {} };
    this.scale = { set() {} };
    this.matrix = { identity() {} };
    this.renderOrder = 0;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = false;
    this.onBeforeRender = () => {};
    this.onAfterRender = () => {};
  }
}

function makeFakeScene({ morph = false } = {}) {
  const root = new FakeNode();
  root.userData = {};
  const geometry = new FakeGeometry({
    position: new FakeAttribute([1, 2, 3, 4, 5, 6], 3),
    skinIndex: new FakeAttribute([0, 0, 0, 0, 0, 0, 0, 0], 4),
    skinWeight: new FakeAttribute([1, 0, 0, 0, 1, 0, 0, 0], 4),
  }, morph ? { position: [{}] } : {});
  const source = new FakeNode();
  source.isSkinnedMesh = true;
  source.name = 'passenger-body';
  source.geometry = geometry;
  source.material = { color: 'preserved' };
  source.skeleton = { update() { this.updated = true; } };
  source.applyBoneTransform = (index, vertex) => { vertex.x += 2; return vertex; };
  source.layers = new FakeLayers(1);
  source.renderOrder = 2;
  source.castShadow = true;
  source.receiveShadow = false;
  source.frustumCulled = false;
  root.add(source);
  return { root, source, geometry };
}

const THREE = { Vector3: FakeVector3, Mesh: FakeMesh };

test('bakes the current skinned pose into static geometry without changing the source GLB', () => {
  const { root, source } = makeFakeScene();
  const result = bakeSkinnedCharacterStaticPose(root, THREE);
  assert.deepEqual({ applied: result.applied, meshes: result.meshes }, { applied: true, meshes: 1 });
  assert.equal(source.skeleton.updated, true);
  assert.equal(source.layers.mask & 1, 0);
  assert.equal(source.children.length, 1);
  const staticMesh = source.children[0];
  assert.equal(staticMesh.userData.kanoStaticPoseLod, true);
  assert.equal(staticMesh.geometry.getAttribute('position').array[0], 3);
  assert.equal(staticMesh.geometry.getAttribute('skinIndex'), undefined);
  assert.equal(staticMesh.geometry.getAttribute('skinWeight'), undefined);
  assert.equal(staticMesh.geometry.normalsComputed, true);
  assert.equal(source.geometry.getAttribute('skinIndex') !== undefined, true);
});

test('restores the original layer mask and disposes only temporary baked geometry', () => {
  const { root, source, geometry } = makeFakeScene();
  bakeSkinnedCharacterStaticPose(root, THREE);
  const bakedGeometry = source.children[0].geometry;
  const result = restoreSkinnedCharacterPose(root);
  assert.equal(result.restored, 1);
  assert.equal(source.layers.mask, 1);
  assert.equal(source.children.length, 0);
  assert.equal(bakedGeometry.disposed, true);
  assert.equal(geometry.disposed, false);
  assert.equal(root.userData.kanoCharacterStaticPoseLodActive, undefined);
});

test('morph-target characters remain untouched instead of losing facial or body animation', () => {
  const { root, source } = makeFakeScene({ morph: true });
  const result = bakeSkinnedCharacterStaticPose(root, THREE);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'unsupported-skinned-mesh');
  assert.equal(source.layers.mask, 1);
  assert.equal(source.children.length, 0);
});

test('repeated bake requests are idempotent and do not duplicate static meshes', () => {
  const { root, source } = makeFakeScene();
  bakeSkinnedCharacterStaticPose(root, THREE);
  const second = bakeSkinnedCharacterStaticPose(root, THREE);
  assert.equal(second.alreadyApplied, true);
  assert.equal(source.children.length, 1);
});
