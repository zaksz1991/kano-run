/**
 * KANO LIFE — static GLB traffic draw-call batching.
 *
 * Background traffic models are static rigid GLBs. When two or more copies of
 * the same model/material/geometry are active, this manager batches matching
 * opaque mesh parts into InstancedMesh objects. The original model nodes remain
 * in place and are restored whenever batching is not useful or the renderer is
 * disposed. Skinned, morphed, transparent and unsupported meshes stay intact.
 *
 * This module only changes visual submission. Traffic movement, lane selection,
 * collision, vehicle IDs, scoring and the player vehicle remain game-owned.
 */

const MATERIAL_MAP_FIELDS = [
  'map', 'alphaMap', 'aoMap', 'bumpMap', 'normalMap', 'roughnessMap',
  'metalnessMap', 'emissiveMap', 'lightMap', 'envMap',
];

function textureId(material, field) {
  const texture = material?.[field];
  return texture?.uuid || '';
}

function materialSignature(material) {
  const color = material?.color?.getHex?.() ?? '';
  const emissive = material?.emissive?.getHex?.() ?? '';
  const maps = MATERIAL_MAP_FIELDS.map((field) => textureId(material, field)).join(',');
  return [
    material?.type || '', color, emissive, maps,
    material?.side ?? '', material?.transparent ? 1 : 0,
    Number(material?.opacity ?? 1).toFixed(4),
    Number(material?.alphaTest ?? 0).toFixed(4),
    Number(material?.metalness ?? 0).toFixed(4),
    Number(material?.roughness ?? 1).toFixed(4),
    material?.vertexColors ? 1 : 0,
    material?.wireframe ? 1 : 0,
    material?.depthWrite === false ? 0 : 1,
    material?.blending ?? '',
  ].join('|');
}

/** Return false when a mesh requires per-object or order-dependent rendering. */
export function isKanoTrafficMeshBatchable(mesh, THREE) {
  if (!mesh?.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh) return false;
  if (mesh.userData?.kanoNoTrafficInstancing === true) return false;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  if (Object.prototype.hasOwnProperty.call(mesh, 'onBeforeRender') || Object.prototype.hasOwnProperty.call(mesh, 'onAfterRender')) return false;
  const geometry = mesh.geometry;
  if (!geometry?.isBufferGeometry || !geometry.attributes?.position) return false;
  if (geometry.morphAttributes && Object.values(geometry.morphAttributes).some((items) => items?.length)) return false;
  if (mesh.morphTargetInfluences?.length) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (!materials.length || materials.some((material) => !material)) return false;
  // Transparent surfaces need per-object sorting. Keep vehicle glass and
  // decals on their original GLB nodes rather than altering their appearance.
  if (materials.some((material) => (
    material.transparent === true
    || Number(material.opacity ?? 1) < 0.999
    || Number(material.transmission ?? 0) > 0
    || material.depthWrite === false
    || (THREE?.NormalBlending !== undefined && material.blending !== THREE.NormalBlending)
  ))) return false;
  return true;
}

function cloneMaterials(source) {
  const clone = (material) => {
    if (typeof material?.clone !== 'function') {
      throw new TypeError('Traffic instancing requires cloneable Three.js materials.');
    }
    return material.clone();
  };
  return Array.isArray(source) ? source.map(clone) : clone(source);
}

function ancestorsVisible(mesh, root) {
  let parent = mesh.parent;
  while (parent && parent !== root) {
    if (!parent.visible) return false;
    parent = parent.parent;
  }
  return parent === root && root.visible;
}

export class KanoTrafficInstancingLOD {
  constructor(renderer, THREE, { initialCapacity = 16 } = {}) {
    if (!renderer?.world?.isObject3D || !(renderer.trafficActors instanceof Map)) {
      throw new TypeError('KanoTrafficInstancingLOD requires a live Renderer3D instance.');
    }
    if (!THREE?.InstancedMesh || !THREE?.Matrix4) {
      throw new TypeError('KanoTrafficInstancingLOD requires Three.js InstancedMesh support.');
    }
    this.renderer = renderer;
    this.THREE = THREE;
    this.initialCapacity = Math.max(4, Math.floor(initialCapacity));
    this.bindings = new WeakMap();
    this.batches = new Map();
    this.buckets = new Map();
    this.actorScratch = [];
    this.trackedActors = new Set();
    this.currentActors = new Set();
    this.worldInverse = new THREE.Matrix4();
    this.instanceMatrix = new THREE.Matrix4();
    this.disposed = false;
    this.diagnostics = {
      enabled: !renderer.mobile,
      reason: renderer.mobile ? 'mobile-fallback-traffic-is-already-instanced' : 'waiting-for-repeated-glb-traffic',
      modelRoots: 0,
      eligibleSourceMeshes: 0,
      activeBatches: 0,
      batchedInstances: 0,
      instancedVehicles: 0,
      avoidedDrawCalls: 0,
      skippedMeshes: 0,
    };
  }

  ensureBindings(actor) {
    const existing = this.bindings.get(actor);
    if (existing) return existing;

    const modelKey = String(actor.userData?.modelKey || '');
    const bindings = [];
    bindings.skippedMeshes = 0;
    if (!modelKey || actor.userData?.fallback === true) {
      this.bindings.set(actor, bindings);
      return bindings;
    }

    actor.traverse((mesh) => {
      if (!mesh?.isMesh) return;
      if (!isKanoTrafficMeshBatchable(mesh, this.THREE)) {
        bindings.skippedMeshes += 1;
        return;
      }
      const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const materialKey = materialList.map(materialSignature).join('||');
      const geometryId = mesh.geometry.uuid || String(mesh.geometry.id || 'geometry');
      const layerMask = Number(mesh.layers?.mask) || 1;
      const castShadow = mesh.castShadow ? 1 : 0;
      const receiveShadow = mesh.receiveShadow ? 1 : 0;
      const renderOrder = Number(mesh.renderOrder) || 0;
      const key = `${modelKey}::${geometryId}::${materialKey}::${renderOrder}::${layerMask}::${castShadow}::${receiveShadow}`;
      bindings.push({
        actor,
        mesh,
        key,
        originalVisible: mesh.visible !== false,
      });
    });

    this.bindings.set(actor, bindings);
    return bindings;
  }

  getBucket(key) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { entries: [], roots: new Set() };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  createBatch(key, sourceMesh) {
    const material = cloneMaterials(sourceMesh.material);
    const mesh = new this.THREE.InstancedMesh(
      sourceMesh.geometry,
      material,
      this.initialCapacity,
    );
    mesh.name = `KANO_TRAFFIC_INSTANCED_${String(key.split('::', 1)[0] || 'GLB').toUpperCase()}`;
    mesh.renderOrder = sourceMesh.renderOrder || 0;
    mesh.castShadow = Boolean(sourceMesh.castShadow);
    mesh.receiveShadow = Boolean(sourceMesh.receiveShadow);
    mesh.layers.mask = sourceMesh.layers?.mask ?? mesh.layers.mask;
    mesh.frustumCulled = true;
    if (!sourceMesh.geometry.boundingSphere) sourceMesh.geometry.computeBoundingSphere();
    mesh.instanceMatrix.setUsage(this.THREE.DynamicDrawUsage);
    mesh.userData.sharedGeometry = true;
    mesh.userData.kanoTrafficInstancingBatch = true;
    mesh.userData.kanoTrafficInstancingKey = key;
    this.renderer.world.add(mesh);

    const batch = { mesh, capacity: this.initialCapacity, key, geometry: sourceMesh.geometry };
    this.batches.set(key, batch);
    return batch;
  }

  ensureBatchCapacity(batch, required) {
    if (required <= batch.capacity) return batch;
    const capacity = Math.max(required, batch.capacity * 2);
    const replacement = new this.THREE.InstancedMesh(
      batch.geometry,
      batch.mesh.material,
      capacity,
    );
    replacement.name = batch.mesh.name;
    replacement.renderOrder = batch.mesh.renderOrder;
    replacement.castShadow = batch.mesh.castShadow;
    replacement.receiveShadow = batch.mesh.receiveShadow;
    replacement.layers.mask = batch.mesh.layers.mask;
    replacement.frustumCulled = true;
    replacement.instanceMatrix.setUsage(this.THREE.DynamicDrawUsage);
    replacement.userData = { ...batch.mesh.userData };
    batch.mesh.parent?.remove(batch.mesh);
    this.renderer.world.add(replacement);
    batch.mesh = replacement;
    batch.capacity = capacity;
    return batch;
  }

  sync() {
    if (this.disposed) return this.getDiagnostics();
    if (this.renderer.mobile) {
      this.diagnostics = {
        ...this.diagnostics,
        enabled: false,
        reason: 'mobile-fallback-traffic-is-already-instanced',
        modelRoots: 0,
        eligibleSourceMeshes: 0,
        activeBatches: 0,
        batchedInstances: 0,
        instancedVehicles: 0,
        avoidedDrawCalls: 0,
      };
      return this.getDiagnostics();
    }

    const actors = this.actorScratch;
    actors.length = 0;
    for (const actor of this.renderer.trafficActors.values()) {
      if (actor?.isObject3D && actor.userData?.fallback !== true) actors.push(actor);
    }
    this.currentActors.clear();
    for (const actor of actors) this.currentActors.add(actor);
    for (const previousActor of this.trackedActors) {
      if (this.currentActors.has(previousActor)) continue;
      for (const binding of this.bindings.get(previousActor) || []) {
        binding.mesh.visible = binding.originalVisible;
      }
      this.trackedActors.delete(previousActor);
    }
    for (const actor of actors) this.trackedActors.add(actor);

    for (const bucket of this.buckets.values()) {
      bucket.entries.length = 0;
      bucket.roots.clear();
    }
    for (const batch of this.batches.values()) {
      batch.mesh.count = 0;
      batch.mesh.visible = false;
    }

    let eligibleSourceMeshes = 0;
    let skippedMeshes = 0;
    for (const actor of actors) {
      const bindings = this.ensureBindings(actor);
      skippedMeshes += bindings.skippedMeshes || 0;
      for (const binding of bindings) {
        // Restore the original node before collecting the active set. A node is
        // hidden only after its matching batch has enough distinct vehicle roots.
        binding.mesh.visible = binding.originalVisible;
      }
      if (!actor.visible) continue;
      actor.updateMatrixWorld(true);

      for (const binding of bindings) {
        if (!binding.originalVisible || !ancestorsVisible(binding.mesh, actor)) continue;
        const bucket = this.getBucket(binding.key);
        bucket.entries.push(binding);
        bucket.roots.add(actor);
        eligibleSourceMeshes += 1;
      }
    }

    this.renderer.world.updateMatrixWorld(true);
    this.worldInverse.copy(this.renderer.world.matrixWorld).invert();
    let activeBatches = 0;
    let batchedInstances = 0;
    let instancedVehicles = 0;
    let avoidedDrawCalls = 0;

    for (const [key, bucket] of this.buckets) {
      if (bucket.roots.size < 2 || bucket.entries.length < 2) continue;
      const first = bucket.entries[0].mesh;
      let batch = this.batches.get(key);
      if (!batch) batch = this.createBatch(key, first);
      batch = this.ensureBatchCapacity(batch, bucket.entries.length);

      let index = 0;
      for (const binding of bucket.entries) {
        const source = binding.mesh;
        this.instanceMatrix.multiplyMatrices(this.worldInverse, source.matrixWorld);
        batch.mesh.setMatrixAt(index, this.instanceMatrix);
        source.visible = false;
        index += 1;
      }
      batch.mesh.count = index;
      batch.mesh.visible = index > 0;
      batch.mesh.instanceMatrix.needsUpdate = true;
      // Preserve the normal frustum-culling behaviour of the source GLB meshes.
      // The InstancedMesh bound must cover every active vehicle transform.
      batch.mesh.computeBoundingSphere();
      activeBatches += 1;
      batchedInstances += index;
      instancedVehicles += bucket.roots.size;
      avoidedDrawCalls += Math.max(0, index - 1);
    }

    this.diagnostics = {
      enabled: true,
      reason: activeBatches ? 'repeated-static-glb-parts-batched' : 'no-repeated-eligible-glb-parts',
      modelRoots: actors.length,
      eligibleSourceMeshes,
      activeBatches,
      batchedInstances,
      instancedVehicles,
      avoidedDrawCalls,
      skippedMeshes,
    };
    return this.getDiagnostics();
  }

  getDiagnostics() {
    return { ...this.diagnostics };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const actor of this.trackedActors) {
      const bindings = this.bindings.get(actor) || [];
      for (const binding of bindings) binding.mesh.visible = binding.originalVisible;
    }
    this.trackedActors.clear();
    for (const batch of this.batches.values()) {
      batch.mesh.parent?.remove(batch.mesh);
      const materials = Array.isArray(batch.mesh.material)
        ? batch.mesh.material
        : [batch.mesh.material];
      for (const material of materials) material?.dispose?.();
      // Geometry is owned by ModelManager's GLB cache and must not be disposed here.
    }
    this.batches.clear();
    this.buckets.clear();
    this.currentActors.clear();
    this.actorScratch.length = 0;
  }
}

const INSTALL_KEY = Symbol.for('kano.life.trafficInstancingLod.installed.v1');

/** Install the optional batching layer after renderer3d.js has defined its class. */
export function installKanoTrafficInstancingLOD(Renderer3D, THREE) {
  const prototype = Renderer3D?.prototype;
  if (!prototype || prototype[INSTALL_KEY] || typeof prototype.syncTraffic !== 'function') {
    return false;
  }
  const originalSyncTraffic = prototype.syncTraffic;
  const originalDispose = prototype.dispose;

  prototype.syncTraffic = function syncTrafficWithGLBInstancing(...args) {
    const result = originalSyncTraffic.apply(this, args);
    if (!this.__kanoTrafficInstancingLOD) {
      this.__kanoTrafficInstancingLOD = new KanoTrafficInstancingLOD(this, THREE);
    }
    const diagnostics = this.__kanoTrafficInstancingLOD.sync();
    if (typeof window !== 'undefined') {
      window.__KANO_TRAFFIC_INSTANCING__ = diagnostics;
    }
    return result;
  };

  if (typeof originalDispose === 'function') {
    prototype.dispose = function disposeWithTrafficInstancing(...args) {
      this.__kanoTrafficInstancingLOD?.dispose?.();
      this.__kanoTrafficInstancingLOD = null;
      return originalDispose.apply(this, args);
    };
  }

  Object.defineProperty(prototype, INSTALL_KEY, { value: true, configurable: false });
  return true;
}
