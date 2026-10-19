import * as THREE from 'three';

/**
 * Kano Life — GLB Asset Streaming Director
 * Additive utility for reusing cached GLTF assets and recycling route scenery.
 * Does not own the player's vehicle, physics, or the game's existing scene loop.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const asArray = (value) => Array.isArray(value) ? value : value ? [value] : [];

const DEFAULTS = {
  segmentLength: 80,
  segmentCount: 5,
  aheadSegments: 3,
  behindSegments: 1,
  sideOffset: 13,
  laneOffset: 3.8,
  maxAssetsPerSegment: 18,
  maxConcurrentLoads: 4,
  enableShadows: false,
  groundY: 0,
  assetScale: 1,
  assetPaths: {},
  placement: {},
};

const DEFAULT_PLACEMENT = {
  shop: { side: [-1, 1], x: [16, 22], z: [-34, 34], scale: [0.85, 1.2], yaw: [0, Math.PI * 2] },
  stall: { side: [-1, 1], x: [11.5, 14.5], z: [-34, 34], scale: [0.8, 1.1], yaw: [0, Math.PI * 2] },
  pedestrian: { side: [-1, 1], x: [7.5, 11], z: [-34, 34], scale: [0.88, 1.08], yaw: [0, Math.PI * 2] },
  goat: { side: [-1, 1], x: [7.2, 10.5], z: [-34, 34], scale: [0.8, 1.0], yaw: [0, Math.PI * 2] },
  motorcycle: { side: [-1, 1], x: [9.5, 13], z: [-34, 34], scale: [0.8, 1.05], yaw: [0, Math.PI * 2] },
  parkedKeke: { side: [-1, 1], x: [10.5, 13.2], z: [-34, 34], scale: [0.88, 1.05], yaw: [0, Math.PI * 2] },
  marketGoods: { side: [-1, 1], x: [12, 15], z: [-34, 34], scale: [0.8, 1.1], yaw: [0, Math.PI * 2] },
};

export class KanoAssetStreamingDirector {
  constructor({ scene, loader, options = {} } = {}) {
    if (!scene?.isScene) throw new Error('KanoAssetStreamingDirector requires a THREE.Scene.');
    if (!loader || typeof loader.load !== 'function') throw new Error('Provide a GLTFLoader-compatible loader.');
    this.scene = scene;
    this.loader = loader;
    this.options = { ...DEFAULTS, ...options, placement: { ...DEFAULT_PLACEMENT, ...(options.placement || {}) } };
    this.root = new THREE.Group();
    this.root.name = 'KanoLifeStreamedWorldAssets';
    scene.add(this.root);
    this.cache = new Map();
    this.pending = new Map();
    this.loadQueue = [];
    this.activeLoads = 0;
    this.segments = new Map();
    this.listeners = new Map();
    this.nextInstanceId = 1;
    this.disposed = false;
    this.lastCenterSegment = null;
    this._randomSeed = (options.seed ?? 72119) >>> 0 || 1;
  }

  on(event, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit(event, payload = {}) {
    for (const callback of this.listeners.get(event) || []) {
      try { callback(payload); } catch (error) { console.error(`[KanoAssetStreamingDirector:${event}]`, error); }
    }
  }

  random() {
    this._randomSeed = (1664525 * this._randomSeed + 1013904223) >>> 0;
    return this._randomSeed / 4294967296;
  }

  between(range) { return range[0] + this.random() * (range[1] - range[0]); }

  /** Register an already loaded GLTF scene (for apps with their own model catalog). */
  registerAsset(key, gltfOrObject3D) {
    if (!key || !gltfOrObject3D) throw new Error('registerAsset requires a key and model.');
    const model = gltfOrObject3D.scene || gltfOrObject3D;
    if (!model.isObject3D) throw new Error(`Asset "${key}" is not a THREE.Object3D or GLTF result.`);
    this.cache.set(key, { source: model, animations: gltfOrObject3D.animations || [], path: null });
    this.emit('asset:registered', { key });
    return this;
  }

  /** Configure semantic asset keys to existing public GLB paths. */
  setAssetPaths(paths = {}) {
    this.options.assetPaths = { ...this.options.assetPaths, ...paths };
    return this;
  }

  getAssetPath(key) { return this.options.assetPaths[key] || null; }

  loadAsset(key, path = this.getAssetPath(key)) {
    if (this.disposed) return Promise.reject(new Error('Asset streamer has been disposed.'));
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    if (!path) return Promise.reject(new Error(`No GLB path configured for asset key "${key}".`));
    if (this.pending.has(key)) return this.pending.get(key);

    const promise = new Promise((resolve, reject) => {
      this.loadQueue.push({ key, path, resolve, reject });
      this._pumpQueue();
    });
    this.pending.set(key, promise);
    return promise;
  }

  _pumpQueue() {
    while (!this.disposed && this.activeLoads < Math.max(1, this.options.maxConcurrentLoads) && this.loadQueue.length) {
      const item = this.loadQueue.shift();
      this.activeLoads += 1;
      this.loader.load(item.path, (gltf) => {
        this.activeLoads -= 1;
        const source = gltf?.scene;
        if (!source?.isObject3D) {
          const error = new Error(`GLB at "${item.path}" did not contain a scene.`);
          this.pending.delete(item.key); item.reject(error);
          this.emit('asset:error', { key: item.key, path: item.path, error });
        } else {
          const record = { source, animations: gltf.animations || [], path: item.path };
          this.cache.set(item.key, record);
          this.pending.delete(item.key); item.resolve(record);
          this.emit('asset:loaded', { key: item.key, path: item.path });
        }
        this._pumpQueue();
      }, undefined, (error) => {
        this.activeLoads -= 1;
        this.pending.delete(item.key); item.reject(error);
        this.emit('asset:error', { key: item.key, path: item.path, error });
        this._pumpQueue();
      });
    }
  }

  /** Create a clone. Cached source geometry/materials remain owned by the model cache. */
  async createInstance(key, { parent = this.root, position = [0, 0, 0], rotation = [0, 0, 0], scale = this.options.assetScale, name = key, castShadow = this.options.enableShadows } = {}) {
    const record = await this.loadAsset(key);
    if (this.disposed) throw new Error('Asset streamer was disposed while loading.');
    const instance = record.source.clone(true);
    instance.name = name;
    instance.position.set(position[0], position[1], position[2]);
    instance.rotation.set(rotation[0], rotation[1], rotation[2]);
    if (typeof scale === 'number') instance.scale.setScalar(scale);
    else instance.scale.set(scale[0], scale[1], scale[2]);
    instance.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = Boolean(castShadow);
      node.receiveShadow = Boolean(castShadow);
      node.userData.kanoStreamInstance = true;
    });
    instance.userData.kanoAssetKey = key;
    instance.userData.kanoInstanceId = this.nextInstanceId++;
    parent.add(instance);
    this.emit('instance:created', { key, instance });
    return instance;
  }

  /** Build a deterministic route segment using only assets that have paths configured. */
  async buildSegment(segmentIndex, { profile = 'market', counts = {}, centerX = 0 } = {}) {
    if (this.disposed) throw new Error('Asset streamer has been disposed.');
    if (this.segments.has(segmentIndex)) return this.segments.get(segmentIndex);
    const group = new THREE.Group();
    group.name = `Kano streamed segment ${segmentIndex}`;
    group.position.z = segmentIndex * this.options.segmentLength;
    group.position.x = centerX;
    group.userData.segmentIndex = segmentIndex;
    group.userData.profile = profile;
    this.root.add(group);
    const segment = { index: segmentIndex, group, profile, instances: [], pending: 0, ready: false };
    this.segments.set(segmentIndex, segment);

    const defaults = profile === 'residential'
      ? { shop: 3, stall: 2, pedestrian: 3, goat: 1, motorcycle: 1, parkedKeke: 2, marketGoods: 1 }
      : profile === 'school'
        ? { shop: 2, stall: 1, pedestrian: 6, goat: 0, motorcycle: 2, parkedKeke: 1, marketGoods: 0 }
        : profile === 'motorPark'
          ? { shop: 3, stall: 4, pedestrian: 6, goat: 1, motorcycle: 3, parkedKeke: 4, marketGoods: 2 }
          : { shop: 4, stall: 5, pedestrian: 7, goat: 1, motorcycle: 2, parkedKeke: 2, marketGoods: 3 };
    const desired = { ...defaults, ...counts };
    const placements = [];
    for (const [kind, countValue] of Object.entries(desired)) {
      const count = clamp(Math.floor(countValue), 0, this.options.maxAssetsPerSegment);
      const key = this._resolveAssetKey(kind);
      if (!key || !this.getAssetPath(key) && !this.cache.has(key)) {
        this.emit('asset:missing', { kind, key, segmentIndex, profile });
        continue;
      }
      const rule = this.options.placement[kind] || DEFAULT_PLACEMENT[kind];
      if (!rule) continue;
      for (let i = 0; i < count && placements.length < this.options.maxAssetsPerSegment; i++) {
        const side = rule.side[Math.floor(this.random() * rule.side.length)];
        placements.push({ kind, key, side, rule, index: i });
      }
    }

    segment.pending = placements.length;
    await Promise.all(placements.map(async (item) => {
      try {
        const x = item.side * this.between(item.rule.x);
        const z = this.between(item.rule.z);
        const scale = this.between(item.rule.scale);
        const yaw = this.between(item.rule.yaw);
        const instance = await this.createInstance(item.key, {
          parent: group,
          position: [x, this.options.groundY, z],
          rotation: [0, yaw, 0],
          scale,
          name: `${item.kind} segment-${segmentIndex}-${item.index}`,
        });
        instance.userData.kanoSegmentIndex = segmentIndex;
        instance.userData.kanoKind = item.kind;
        segment.instances.push(instance);
      } catch (error) {
        this.emit('placement:error', { kind: item.kind, key: item.key, segmentIndex, error });
      } finally {
        segment.pending -= 1;
      }
    }));
    segment.ready = true;
    this.emit('segment:ready', { segmentIndex, profile, count: segment.instances.length });
    return segment;
  }

  _resolveAssetKey(kind) {
    const aliases = {
      shop: ['shop', 'building', 'marketShop'],
      stall: ['stall', 'marketStall'],
      pedestrian: ['pedestrian', 'person', 'npc'],
      goat: ['goat', 'animalGoat'],
      motorcycle: ['motorcycle', 'okada'],
      parkedKeke: ['parkedKeke', 'keke', 'napep'],
      marketGoods: ['marketGoods', 'goods', 'produce'],
    };
    const candidates = aliases[kind] || [kind];
    return candidates.find((candidate) => this.getAssetPath(candidate) || this.cache.has(candidate)) || null;
  }

  /** Stream nearby segments around world-space player Z. Call from the existing update loop. */
  async update(playerWorldZ, { profile = 'market', centerX = 0, counts = {} } = {}) {
    if (this.disposed || !Number.isFinite(playerWorldZ)) return;
    const center = Math.floor(playerWorldZ / this.options.segmentLength);
    if (center === this.lastCenterSegment) return;
    this.lastCenterSegment = center;
    const min = center - Math.max(0, this.options.behindSegments);
    const max = center + Math.max(0, this.options.aheadSegments);
    const wanted = new Set();
    const jobs = [];
    for (let index = min; index <= max; index++) {
      wanted.add(index);
      if (!this.segments.has(index)) jobs.push(this.buildSegment(index, { profile, centerX, counts }));
    }
    for (const [index, segment] of this.segments) {
      if (!wanted.has(index)) this.removeSegment(index);
    }
    await Promise.all(jobs);
    this.emit('stream:update', { centerSegment: center, activeSegments: this.segments.size });
  }

  removeSegment(index) {
    const segment = this.segments.get(index);
    if (!segment) return false;
    this.root.remove(segment.group);
    // Instances are clones; remove scene nodes only. Never dispose cached GLTF geometry/materials here.
    segment.group.traverse((node) => {
      if (node.isMesh) {
        node.removeFromParent();
      }
    });
    segment.group.clear();
    this.segments.delete(index);
    this.emit('segment:removed', { segmentIndex: index });
    return true;
  }

  getSnapshot() {
    const instances = [];
    for (const segment of this.segments.values()) instances.push(...segment.instances);
    return {
      activeSegments: this.segments.size,
      activeInstances: instances.length,
      cachedAssetKeys: [...this.cache.keys()],
      pendingLoads: this.pending.size,
      queuedLoads: this.loadQueue.length,
      segments: [...this.segments.values()].map((segment) => ({ index: segment.index, profile: segment.profile, ready: segment.ready, instanceCount: segment.instances.length })),
    };
  }

  /** Remove streamed scene instances but keep cached source GLBs for reuse. */
  clearWorld() {
    for (const index of [...this.segments.keys()]) this.removeSegment(index);
    this.lastCenterSegment = null;
  }

  dispose({ disposeCachedAssets = false } = {}) {
    if (this.disposed) return;
    this.clearWorld();
    this.scene.remove(this.root);
    this.root.clear();
    if (disposeCachedAssets) {
      const disposedMaterials = new Set();
      for (const { source } of this.cache.values()) {
        source.traverse((node) => {
          if (!node.isMesh) return;
          node.geometry?.dispose?.();
          for (const material of asArray(node.material)) {
            if (material && !disposedMaterials.has(material)) { material.dispose?.(); disposedMaterials.add(material); }
          }
        });
      }
    }
    this.cache.clear();
    this.pending.clear();
    this.loadQueue.length = 0;
    this.listeners.clear();
    this.disposed = true;
  }
}
