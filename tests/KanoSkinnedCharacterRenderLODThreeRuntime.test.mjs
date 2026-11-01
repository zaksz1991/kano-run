import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {
  bakeSkinnedCharacterStaticPose,
  restoreSkinnedCharacterPose,
} from '../js/KanoSkinnedCharacterRenderLOD.js';

test('Three.js SkinnedMesh pose is baked to ordinary Mesh and restored without mutating source geometry', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  geometry.setIndex([0, 1, 2]);

  const source = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff }));
  source.name = 'KanoRuntimeSkinnedTest';
  const bone = new THREE.Bone();
  bone.position.x = 1;
  source.add(bone);
  const skeleton = new THREE.Skeleton([bone]);
  source.bind(skeleton);
  bone.position.x = 2;

  const root = new THREE.Group();
  root.add(source);
  root.updateMatrixWorld(true);
  skeleton.update();
  const originalPositions = [...geometry.attributes.position.array];

  const result = bakeSkinnedCharacterStaticPose(root, THREE);
  const staticMesh = source.children.find((child) => child.userData?.kanoStaticPoseLod === true);
  assert.equal(result.applied, true);
  assert.equal(result.meshes, 1);
  assert.equal(staticMesh?.isMesh, true);
  assert.equal(staticMesh?.isSkinnedMesh, undefined);
  assert.equal(staticMesh.geometry.getAttribute('skinIndex'), undefined);
  assert.equal(staticMesh.geometry.getAttribute('skinWeight'), undefined);
  assert.ok(Math.abs(staticMesh.geometry.getAttribute('position').getX(0) - 1) < 1e-6);
  assert.deepEqual([...geometry.attributes.position.array], originalPositions);
  const defaultCameraLayer = new THREE.Layers();
  defaultCameraLayer.set(0);
  assert.equal(source.layers.test(defaultCameraLayer), false);

  const restored = restoreSkinnedCharacterPose(root);
  assert.equal(restored.restored, 1);
  assert.equal(source.layers.test(defaultCameraLayer), true);
  assert.equal(source.children.some((child) => child.userData?.kanoStaticPoseLod === true), false);
});
