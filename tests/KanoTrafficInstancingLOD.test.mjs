import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {
  KanoTrafficInstancingLOD,
  installKanoTrafficInstancingLOD,
  isKanoTrafficMeshBatchable,
} from '../js/KanoTrafficInstancingLOD.js';

function makeRenderer({ mobile = false } = {}) {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  world.name = 'traffic-world';
  scene.add(world);
  return { scene, world, trafficActors: new Map(), mobile };
}

function addTrafficActor(renderer, id, geometry, material, x = 0, options = {}) {
  const actor = new THREE.Group();
  actor.userData.modelKey = options.modelKey || 'car';
  actor.userData.modelPath = '/assets/models/vehicles/cars/test-car.glb';
  actor.userData.vehicleType = options.vehicleType || 'car';
  actor.userData.fallback = options.fallback === true;
  actor.position.set(x, 0, 0);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.25, 0.1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0.2, 0.4, -0.3);
  pivot.add(mesh);
  actor.add(pivot);
  renderer.world.add(actor);
  renderer.trafficActors.set(id, actor);
  return { actor, mesh };
}

test('batches matching rigid GLB vehicle meshes into one instanced draw', () => {
  const renderer = makeRenderer();
  const geometry = new THREE.BoxGeometry(1, 1, 2);
  const materialA = new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.7 });
  const materialB = materialA.clone();
  const first = addTrafficActor(renderer, 'a', geometry, materialA, -2);
  const second = addTrafficActor(renderer, 'b', geometry, materialB, 3);
  const manager = new KanoTrafficInstancingLOD(renderer, THREE);

  const stats = manager.sync();
  assert.equal(stats.activeBatches, 1);
  assert.equal(stats.batchedInstances, 2);
  assert.equal(stats.instancedVehicles, 2);
  assert.equal(stats.avoidedDrawCalls, 1);
  assert.equal(first.mesh.visible, false);
  assert.equal(second.mesh.visible, false);

  const batch = [...manager.batches.values()][0].mesh;
  assert.equal(batch.frustumCulled, true);
  assert.ok(batch.boundingSphere && batch.boundingSphere.radius > 0);
  const left = new THREE.Matrix4();
  const right = new THREE.Matrix4();
  batch.getMatrixAt(0, left);
  batch.getMatrixAt(1, right);
  assert.ok(Math.abs(left.elements[12] - -1.8) < 1e-6);
  assert.ok(Math.abs(right.elements[12] - 3.2) < 1e-6);
  assert.notEqual(batch.material, materialA);
  manager.dispose();
  assert.equal(first.mesh.visible, true);
  assert.equal(second.mesh.visible, true);
  assert.equal(manager.batches.size, 0);
  assert.equal(geometry.attributes.position.count > 0, true);
});

test('keeps a single vehicle on its original GLB meshes until a second copy exists', () => {
  const renderer = makeRenderer();
  const geometry = new THREE.BoxGeometry(1, 1, 2);
  const material = new THREE.MeshStandardMaterial();
  const only = addTrafficActor(renderer, 'only', geometry, material, 0);
  const manager = new KanoTrafficInstancingLOD(renderer, THREE);

  const stats = manager.sync();
  assert.equal(stats.activeBatches, 0);
  assert.equal(stats.avoidedDrawCalls, 0);
  assert.equal(only.mesh.visible, true);
  manager.dispose();
});

test('does not batch transparent vehicle glass or other order-dependent materials', () => {
  const renderer = makeRenderer();
  const geometry = new THREE.BoxGeometry(1, 1, 2);
  const glassA = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.6 });
  const glassB = glassA.clone();
  const first = addTrafficActor(renderer, 'a', geometry, glassA, -1);
  const second = addTrafficActor(renderer, 'b', geometry, glassB, 1);
  const manager = new KanoTrafficInstancingLOD(renderer, THREE);

  const stats = manager.sync();
  assert.equal(stats.activeBatches, 0);
  assert.equal(first.mesh.visible, true);
  assert.equal(second.mesh.visible, true);
  assert.equal(isKanoTrafficMeshBatchable(first.mesh, THREE), false);
  manager.dispose();
});

test('restores the remaining original GLB mesh when a repeated actor leaves traffic', () => {
  const renderer = makeRenderer();
  const geometry = new THREE.BoxGeometry(1, 1, 2);
  const first = addTrafficActor(renderer, 'a', geometry, new THREE.MeshStandardMaterial(), -1);
  const second = addTrafficActor(renderer, 'b', geometry, new THREE.MeshStandardMaterial(), 1);
  const manager = new KanoTrafficInstancingLOD(renderer, THREE);

  assert.equal(manager.sync().activeBatches, 1);
  renderer.trafficActors.delete('b');
  assert.equal(manager.sync().activeBatches, 0);
  assert.equal(first.mesh.visible, true);
  manager.dispose();
  assert.equal(second.mesh.visible, true);
});

test('does not modify mobile fallback traffic already handled by InstancedMesh batches', () => {
  const renderer = makeRenderer({ mobile: true });
  const manager = new KanoTrafficInstancingLOD(renderer, THREE);
  const stats = manager.sync();
  assert.equal(stats.enabled, false);
  assert.equal(stats.reason, 'mobile-fallback-traffic-is-already-instanced');
  assert.equal(manager.batches.size, 0);
  manager.dispose();
});

test('skips skinned and morph-target meshes instead of freezing animated vehicle parts', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const skinned = new THREE.Mesh(geometry, material);
  skinned.isSkinnedMesh = true;
  assert.equal(isKanoTrafficMeshBatchable(skinned, THREE), false);

  const morphedGeometry = geometry.clone();
  morphedGeometry.morphAttributes.position = [geometry.attributes.position.clone()];
  const morphed = new THREE.Mesh(morphedGeometry, material);
  assert.equal(isKanoTrafficMeshBatchable(morphed, THREE), false);
});

test('instancing prototype integration is idempotent and cleans up before renderer disposal', () => {
  class FakeRenderer {
    constructor() {
      const renderer = makeRenderer();
      this.world = renderer.world;
      this.trafficActors = renderer.trafficActors;
      this.mobile = false;
      this.calls = 0;
      this.disposed = false;
    }
    syncTraffic() { this.calls += 1; return 'traffic-synced'; }
    dispose() { this.disposed = true; }
  }

  assert.equal(installKanoTrafficInstancingLOD(FakeRenderer, THREE), true);
  assert.equal(installKanoTrafficInstancingLOD(FakeRenderer, THREE), false);
  const renderer = new FakeRenderer();
  assert.equal(renderer.syncTraffic(), 'traffic-synced');
  assert.ok(renderer.__kanoTrafficInstancingLOD);
  renderer.dispose();
  assert.equal(renderer.__kanoTrafficInstancingLOD, null);
  assert.equal(renderer.disposed, true);
});

test('renderer bootstrap installs the batcher before main gameplay initialization', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const root = resolve(new URL('..', import.meta.url).pathname);
  const index = await readFile(resolve(root, 'index.html'), 'utf8');
  const worldBootstrap = await readFile(resolve(root, 'js/KanoWorldPerformanceInstancingUpgrade.js'), 'utf8');
  assert.match(worldBootstrap, /import ['"]\.\/KanoTrafficInstancingUpgrade\.js['"]/);
  assert.match(index, /<template id="kano-deferred-modules">[\s\S]*KanoWorldPerformanceInstancingUpgrade\.js/);
  assert.match(index, /<script type="module" src="\/js\/main\.js"><\/script>/);
});

test('Performance Lab isolates and reports the new GLB traffic batches', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const root = resolve(new URL('..', import.meta.url).pathname);
  const lab = await readFile(resolve(root, 'js/KanoPerfLab.js'), 'utf8');
  assert.match(lab, /__kanoTrafficInstancingLOD\?\.batches/);
  assert.match(lab, /traffic GLB batches:/);
  assert.match(lab, /avoidedDrawCalls/);
});
