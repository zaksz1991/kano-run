import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CATALOG = {
  // Every preferred path below matches a filename in the Kano Run public asset pack.
  // Ordered alternatives keep one broken or unusual model from disabling a category.
  keke: [
    'vehicles/keke/keke-3.glb', 'vehicles/keke/keke-1.glb', 'vehicles/keke/keke-2.glb',
    'vehicles/keke/keke-4.glb', 'vehicles/keke/keke-5.glb', 'vehicles/keke/keke-6.glb',
    'vehicles/keke/keke-7.glb', 'vehicles/keke/keke-8.glb',
  ],
  car: [
    'vehicles/cars/quaternius_cc0-normal-car-1190.glb',
    'vehicles/cars/lowpoly_bmw_e36_m3.glb',
    'vehicles/cars/2006_kia_ceed.glb',
    'vehicles/cars/2005_chrysler_300.glb',
    'vehicles/cars/1979_chevrolet_impala.glb',
  ],
  taxi: [
    'vehicles/cars/2006_kia_ceed.glb',
    'vehicles/cars/quaternius_cc0-normal-car-1190.glb',
    'vehicles/cars/lowpoly_bmw_e36_m3.glb',
  ],
  suv: [
    'vehicles/cars/quaternius_cc0-suv-1402.glb',
    'vehicles/cars/2002_dodge_ram_2500.glb',
    'world/props/SUV.glb',
    'vehicles/cars/asphalt_8_-_nissan_juke_nismo.glb',
  ],
  truck: [
    'vehicles/cars/quaternius_cc0-truck-1449.glb',
    'vehicles/cars/peterbilt_352.glb',
    'vehicles/cars/volvo_fh.glb',
    'vehicles/cars/volvo_fh_cement_truck.glb',
    'vehicles/cars/2002_dodge_ram_2500.glb',
  ],
  bus: ['vehicles/special/bus.glb', 'vehicles/cars/quaternius_cc0-truck-1449.glb'],
  motorcycle: [
    'vehicles/special/okada.glb',
    'vehicles/cars/motorcycle.glb',
    'vehicles/cars/asphalt_6_ktm_rc8.glb',
    'vehicles/cars/asphalt_6_can-am_spyder.glb',
  ],
  police: ['vehicles/special/police.glb', 'world/props/Police-Car.glb', 'vehicles/cars/2006_kia_ceed.glb'],
  karota: ['vehicles/special/karota.glb', 'vehicles/special/police.glb'],
  ambulance: ['vehicles/special/ambulance.glb', 'vehicles/special/bus.glb'],
  passenger: [
    'characters/passengers/hijab_muslim_woman.glb',
    'characters/passengers/Man.glb',
    'characters/passengers/Man in Suit.glb',
    'characters/passengers/women_in_hijab.glb',
  ],
  passengerWoman: [
    'characters/passengers/hijab_muslim_woman.glb',
    'characters/passengers/women_in_hijab.glb',
    'characters/passengers/hijab_muslim_woman 2.glb',
    'characters/passengers/free_download_attractive_african_woman_236.glb',
    'characters/passengers/woman with her arms crossed.glb',
  ],
  passengerMan: [
    'characters/passengers/Man.glb',
    'characters/passengers/Man-fjHyMd5Wxw.glb',
    'characters/passengers/handsome_man_in_casual_clothes_in_a-pose_86.glb',
    'characters/passengers/tekamist_mens.glb',
  ],
  passengerVIP: [
    'characters/passengers/Man in Suit.glb',
    'characters/passengers/Man-fjHyMd5Wxw.glb',
    'characters/passengers/handsome_man_in_casual_clothes_in_a-pose_86.glb',
  ],
  security: [
    'characters/pedestrians/Man in Long Sleeves.glb',
    'characters/pedestrians/police_man.glb',
    'characters/passengers/Man.glb',
  ],
  pedestrian: [
    'characters/pedestrians/pedestrian.glb',
    'characters/pedestrians/Man in Long Sleeves.glb',
    'characters/pedestrians/low_poly_people_free_sample_pack.glb',
    'characters/pedestrians/hi_guys.glb',
    'characters/pedestrians/passenger.glb',
  ],
  pedestrianWoman: [
    'characters/pedestrians/muslim_girl.glb',
    'characters/pedestrians/keke female.glb',
    'characters/passengers/women_in_hijab.glb',
    'characters/passengers/hijab_muslim_woman.glb',
    'characters/pedestrians/low_poly_people_free_sample_pack.glb',
  ],
  building: [
    'world/buildings-suburban/building-type-d.glb',
    'world/buildings-suburban/building-type-e.glb',
    'world/buildings-suburban/building-type-f.glb',
    'world/buildings-suburban/building-type-g.glb',
    'world/buildings-suburban/building-type-h.glb',
    'world/buildings-suburban/building-type-i.glb',
    'world/buildings-suburban/building-type-j.glb',
    'world/buildings-suburban/building-type-k.glb',
    'world/buildings-suburban/building-type-l.glb',
    'world/buildings-suburban/building-type-m.glb',
    'world/buildings-suburban/building-type-n.glb',
    'world/buildings-suburban/building-type-o.glb',
    'world/buildings-suburban/building-type-p.glb',
    'world/buildings-suburban/building-type-q.glb',
    'world/buildings-suburban/building-type-r.glb',
    'world/buildings-suburban/building-type-s.glb',
    'world/buildings-suburban/building-type-t.glb',
    'world/buildings-suburban/building-type-u.glb',
  ],
  industrialBuilding: [
    'world/buildings-industrial/building-a.glb',
    'world/buildings-industrial/building-b.glb',
    'world/buildings-industrial/building-c.glb',
    'world/buildings-industrial/building-d.glb',
    'world/buildings-industrial/building-e.glb',
    'world/buildings-industrial/building-f.glb',
    'world/buildings-industrial/building-g.glb',
    'world/buildings-industrial/building-h.glb',
    'world/buildings-industrial/building-i.glb',
    'world/buildings-industrial/building-j.glb',
    'world/buildings-industrial/building-k.glb',
    'world/buildings-industrial/building-l.glb',
    'world/buildings-industrial/building-m.glb',
    'world/buildings-industrial/building-n.glb',
    'world/buildings-industrial/building-o.glb',
    'world/buildings-industrial/building-p.glb',
    'world/buildings-industrial/building-q.glb',
    'world/buildings-industrial/building-r.glb',
    'world/buildings-industrial/building-s.glb',
    'world/buildings-industrial/building-t.glb',
  ],
  flyover: [
    'world/roads/kano_urban_flyover.glb',
    'world/roads/kai_tak_flyovers.glb',
    'world/roads/kowloon_bay_flyover.glb',
  ],
  roadlight: [
    'world/roads/light-square.glb',
    'world/roads/light-curved.glb',
    'world/roads/light-square-double.glb',
    'world/roads/light-curved-double.glb',
    'world/roads/electricity-pole-single.glb',
    'world/roads/electricity-pole.glb',
    'world/roads/electricity-pole-wide.glb',
  ],
  cone: ['world/roads/construction-cone.glb', 'world/roads/construction-barrier.glb', 'world/props/Cone.glb'],
  dirtmound: [
    'environment/ground/photoscan_-_pothole_1.glb',
    'environment/ground/low_poly_dirt_ground.glb',
    'environment/ground/close_sand_with_tracks.glb',
    'environment/ground/sand_with_handprints_tile_texture.glb',
    'environment/ground/manhole_cover_on_broken_asphalt_road.glb',
  ],
  bench: ['world/props/Bench.glb'],
  busStop: [], // No dedicated bus-stop GLB in this pack; retain the purpose-built procedural shelter.
  trafficLight: ['world/props/Traffic-Light.glb', 'world/roads/traffic-light.glb'],
  stopSign: ['world/props/Stop-sign.glb', 'world/roads/road-sign-stop.glb'],
  marketStall: [], // Roadside stalls use the supplied market-stall JPG textures and a procedural stall.
};

const TARGET_HEIGHT = {
  keke: 1.85, car: 1.4, taxi: 1.4, suv: 1.65, truck: 2.35,
  bus: 2.55, motorcycle: 1.25, police: 1.45, karota: 1.5, ambulance: 1.65,
  passenger: 1.7, passengerWoman: 1.7, passengerMan: 1.75, passengerVIP: 1.8,
  security: 1.75, pedestrian: 1.7, pedestrianWoman: 1.7,
  building: 4.5, industrialBuilding: 5.2, flyover: 5.8, roadlight: 4.2,
  cone: 0.75, dirtmound: 1.1,
  bench: 0.72, busStop: 3.0, trafficLight: 3.8, stopSign: 2.1, marketStall: 2.45,
};

const UPRIGHT_KEYS = new Set([
  'passenger', 'passengerWoman', 'passengerMan', 'passengerVIP', 'security',
  'pedestrian', 'pedestrianWoman', 'building', 'industrialBuilding', 'flyover',
  'roadlight', 'cone', 'dirtmound', 'bench', 'busStop', 'trafficLight',
  'stopSign', 'marketStall',
]);

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
        const url = `${this.basePath}${relativePath.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
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
          // Correct the imported mesh's local forward axis once. Keep the wrapper
          // free so traffic/player root yaw can express travel direction consistently.
          if (!UPRIGHT_KEYS.has(key)) source.rotation.y = Math.PI;
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
