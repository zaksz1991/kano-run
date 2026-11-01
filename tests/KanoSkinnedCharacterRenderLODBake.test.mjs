import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bakeSkinnedCharacterStaticPose,
  restoreSkinnedCharacterPose,
  updateSkinnedCharacterRenderLodState,
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


test('far idle no-clip fallback can bake its current skeletal pose', () => {
  const { root, source } = makeFakeScene();
  const state = {
    staticPoseActive: false,
    staticPoseMeshCount: 0,
    staticPoseBakeAttempted: false,
    staticPoseBakeFailure: null,
    pendingElapsed: 0.1,
  };
  const result = updateSkinnedCharacterRenderLodState(root, state, {
    mobile: true,
    role: 'idle',
    distanceSquared: 45 * 45,
    THREE,
  });
  assert.equal(result.applied, true);
  assert.equal(state.staticPoseActive, true);
  assert.equal(state.staticPoseMeshCount, 1);
  assert.equal(state.pendingElapsed, 0);
  assert.equal(source.layers.mask & 1, 0);
});

test('a no-clip fallback restores its untouched skinned source inside the exit distance', () => {
  const { root, source } = makeFakeScene();
  const state = { staticPoseActive: false, staticPoseMeshCount: 0, staticPoseBakeAttempted: false, staticPoseBakeFailure: null };
  updateSkinnedCharacterRenderLodState(root, state, { mobile: true, role: 'idle', distanceSquared: 50 * 50, THREE });
  const result = updateSkinnedCharacterRenderLodState(root, state, { mobile: true, role: 'idle', distanceSquared: 25 * 25, THREE });
  assert.equal(result.restored, true);
  assert.equal(state.staticPoseActive, false);
  assert.equal(state.staticPoseBakeAttempted, false);
  assert.equal(source.layers.mask, 1);
  assert.equal(source.children.length, 0);
});

test('the 32–40 metre hysteresis band keeps an already baked idle pose stable', () => {
  const { root } = makeFakeScene();
  const state = { staticPoseActive: false, staticPoseMeshCount: 0, staticPoseBakeAttempted: false, staticPoseBakeFailure: null };
  updateSkinnedCharacterRenderLodState(root, state, { mobile: true, role: 'idle', distanceSquared: 45 * 45, THREE });
  const result = updateSkinnedCharacterRenderLodState(root, state, { mobile: true, role: 'idle', distanceSquared: 36 * 36, THREE });
  assert.equal(result.applied, true);
  assert.equal(state.staticPoseActive, true);
});

test('walking roles and non-mobile devices never enter static-pose LOD', () => {
  const walking = makeFakeScene();
  const walkingState = { staticPoseActive: false, staticPoseBakeAttempted: false };
  const walkingResult = updateSkinnedCharacterRenderLodState(walking.root, walkingState, { mobile: true, role: 'walk', distanceSquared: 80 * 80, THREE });
  assert.equal(walkingResult.applied, false);
  assert.equal(walking.source.children.length, 0);

  const desktop = makeFakeScene();
  const desktopState = { staticPoseActive: false, staticPoseBakeAttempted: false };
  const desktopResult = updateSkinnedCharacterRenderLodState(desktop.root, desktopState, { mobile: false, role: 'idle', distanceSquared: 80 * 80, THREE });
  assert.equal(desktopResult.applied, false);
  assert.equal(desktop.source.children.length, 0);
});

test('unsupported no-clip assets cache their bake failure instead of retrying', () => {
  const { root, source } = makeFakeScene({ morph: true });
  const state = { staticPoseActive: false, staticPoseBakeAttempted: false, staticPoseBakeFailure: null };
  const first = updateSkinnedCharacterRenderLodState(root, state, { mobile: true, role: 'idle', distanceSquared: 60 * 60, THREE });
  const second = updateSkinnedCharacterRenderLodState(root, state, { mobile: true, role: 'idle', distanceSquared: 70 * 70, THREE });
  assert.equal(first.reason, 'unsupported-skinned-mesh');
  assert.equal(second.reason, 'unsupported-skinned-mesh');
  assert.equal(state.staticPoseBakeAttempted, true);
  assert.equal(source.children.length, 0);
  assert.equal(source.layers.mask, 1);
});
