import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CATALOG = {
  keke: [
    'vehicles/keke/keke-3.glb', 'vehicles/keke/keke-1.glb', 'vehicles/keke/keke-2.glb',
    'vehicles/keke/keke-4.glb', 'vehicles/keke/keke-5.glb', 'vehicles/keke/keke-6.glb',
    'vehicles/keke/keke-7.glb', 'vehicles/keke/keke-8.glb',
  ],
  car: ['vehicles/cars/sedan.glb', 'vehicles/cars/car.glb', 'vehicles/cars/vehicle.glb'],
  taxi: ['vehicles/cars/taxi.glb', 'vehicles/cars/sedan.glb'],
  suv: ['vehicles/cars/suv.glb', 'vehicles/cars/luxury-suv.glb', 'vehicles/cars/sedan.glb'],
  truck: ['vehicles/cars/truck.glb'],
  bus: ['vehicles/special/bus.glb', 'vehicles/cars/bus.glb'],
  motorcycle: ['vehicles/cars/motorcycle.glb', 'vehicles/special/okada.glb'],
  police: ['vehicles/special/police.glb', 'vehicles/cars/police.glb', 'vehicles/cars/sedan.glb'],
  karota: ['vehicles/special/karota.glb', 'vehicles/special/police.glb'],
  passenger: [
    'characters/passengers/hijab_muslim_woman.glb',
    'characters/passengers/Man.glb',
    'characters/passengers/suit.glb',
    'characters/passengers/women_in_hijab.glb',
  ],
  pedestrian: ['characters/pedestrians/pedestrian.glb', 'characters/pedestrians/Man.glb'],
  building: [
    'world/buildings-suburban/building-1.glb',
    'world/buildings-suburban/house.glb',
    'world/buildings-suburban/building.glb',
  ],
  industrialBuilding: [
    'world/buildings-industrial/industrial-building.glb',
    'world/buildings-industrial/factory.glb',
    'world/buildings-industrial/building.glb',
  ],
  flyover: [
    'world/roads/kano_urban_flyover.glb',
    'world/roads/kai_tak_flyovers.glb',
    'world/roads/kowloon_bay_flyover.glb',
  ],
  roadlight: [
    'world/roads/street-lights.glb',
    'world/roads/roadlight.glb',
    'world/roads/street_light.glb',
  ],
  cone: ['world/roads/construction-cone.glb', 'world/roads/cone.glb'],
  dirtmound: ['world/roads/gravel-dirt-mound.glb', 'world/roads/dirt-mound.glb'],
  bench: ['world/props/bench.glb', 'world/props/park-bench.glb'],
  busStop: ['world/props/bus-stop.glb', 'world/props/bus_stop.glb'],
  trafficLight: ['world/props/traffic-light.glb', 'world/props/trafficlight.glb', 'world/roads/traffic-light.glb'],
  stopSign: ['world/props/stop-sign.glb', 'world/roads/stop-sign.glb'],
  marketStall: ['world/props/market-stall.glb', 'world/props/market_stall.glb'],
};

const TARGET_HEIGHT = {
  keke: 1.85, car: 1.4, taxi: 1.4, suv: 1.65, truck: 2.35,
  bus: 2.55, motorcycle: 1.25, police: 1.45, karota: 1.5,
  passenger: 1.7, pedestrian: 1.7,
  building: 4.5, industrialBuilding: 5.2, flyover: 5.8, roadlight: 4.2,
  cone: 0.75, dirtmound: 1.1,
  bench: 0.72, busStop: 3.0, trafficLight: 3.8, stopSign: 2.1, marketStall: 2.45,
};

function repairMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    object.castShadow = false;
    object.receiveShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.side = THREE.DoubleSide;
      if (Number.isFinite(material.opacity) && material.opacity < 0.12) {
        material.opacity = 0.85;
        material.transparent = true;
      }
      material.needsUpdate = true;
    }
  });
}

function disposeModelResources(roots) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  for (const root of roots) {
    root?.traverse((object) => {
      if (object.geometry && !geometries.has(object.geometry)) {
        geometries.add(object.geometry);
        object.geometry.dispose();
      }
      const materialList = Array.isArray(object.material)
        ? object.material
        : object.material ? [object.material] : [];
      for (const material of materialList) {
        if (!material || materials.has(material)) continue;
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value?.isTexture && !textures.has(value)) {
            textures.add(value);
            value.dispose();
          }
        }
        material.dispose();
      }
    });
  }
}

export class ModelManager {
  constructor({ basePath = '/assets/models/' } = {}) {
    this.loader = new GLTFLoader();
    this.basePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
    this.cache = new Map();
    this.pending = new Map();
    this.failed = new Set();
    this.disposed = false;
  }

  async load(key) {
    if (this.disposed) return null;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    const catalog = CATALOG[key] || [];
    const task = (async () => {
      for (const relativePath of catalog) {
        const url = `${this.basePath}${relativePath}`;
        try {
          const gltf = await this.loader.loadAsync(url);
          if (this.disposed) {
            disposeModelResources([gltf.scene]);
            return null;
          }
          const source = gltf.scene;
          source.updateMatrixWorld(true);
          const originalBox = new THREE.Box3().setFromObject(source);
          const originalSize = originalBox.getSize(new THREE.Vector3());
          const maxSize = Math.max(originalSize.x, originalSize.y, originalSize.z);
          const horizontalSpan = Math.max(originalSize.x, originalSize.z);
          const horizontalRatioLimit = key === 'flyover' ? 100 : key === 'roadlight' ? 24 : 18;
          const maxDimensionLimit = key === 'flyover' ? 650 : 120;
          if (
            !Number.isFinite(originalSize.y)
            || !Number.isFinite(horizontalSpan)
            || originalSize.y < 0.05
            || originalSize.y > 120
            || maxSize > maxDimensionLimit
            || horizontalSpan > originalSize.y * horizontalRatioLimit
          ) {
            console.warn(`[ModelManager] rejected absurd model ${url}`, originalSize);
            disposeModelResources([source]);
            continue;
          }

          const targetHeight = TARGET_HEIGHT[key] || 1.6;
          source.scale.multiplyScalar(targetHeight / originalSize.y);
          source.updateMatrixWorld(true);
          const scaledBox = new THREE.Box3().setFromObject(source);
          const center = scaledBox.getCenter(new THREE.Vector3());

          // Keep all source-mesh normalization offsets inside a wrapper. Gameplay
          // can then position the wrapper without undoing the model's centering.
          source.position.x -= center.x;
          // Keep the model's feet/wheels on the road (Y=0), not half-buried.
          source.position.y -= scaledBox.min.y;
          source.position.z -= center.z;
          repairMaterials(source);

          const wrapper = new THREE.Group();
          wrapper.add(source);
          wrapper.position.set(0, 0, 0);
          const uprightWorldAssets = new Set(['passenger', 'pedestrian', 'building', 'industrialBuilding', 'flyover', 'roadlight', 'cone', 'dirtmound', 'bench', 'busStop', 'trafficLight', 'stopSign', 'marketStall']);
          if (!uprightWorldAssets.has(key)) wrapper.rotation.y = Math.PI;
          wrapper.userData.modelPath = relativePath;
          wrapper.userData.targetHeight = targetHeight;
          this.cache.set(key, wrapper);
          this.failed.delete(key);
          console.info(`[ModelManager] OK ${key} ← assets/models/${relativePath}`);
          return wrapper;
        } catch (error) {
          if (this.disposed) return null;
          // GLB packs are optional; keep trying each catalog fallback.
          console.debug(`[ModelManager] asset unavailable ${url}`, error?.message || error);
        }
      }
      this.failed.add(key);
      console.info(`[ModelManager] placeholder ${key} (no usable GLB found)`);
      return null;
    })();
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }

  async preload(keys) {
    if (this.disposed) return [];
    return Promise.all([...new Set(keys)].map((key) => this.load(key)));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    disposeModelResources([...this.cache.values()]);
    this.cache.clear();
    this.failed.clear();
    this.pending.clear();
  }

  getInstance(key) {
    const model = this.cache.get(key);
    if (!model) return null;
    const clone = model.clone(true);
    // GLB geometries and textures remain owned by this cache. Each clone gets
    // independent materials, but its geometry must not be freed when one actor leaves.
    clone.userData.sharedGeometry = true;
    clone.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
    });
    return clone;
  }
}

export const MODEL_KEYS = CATALOG;
export const MODEL_TARGET_HEIGHT = TARGET_HEIGHT;
