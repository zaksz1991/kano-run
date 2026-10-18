/**
 * Kano Life — ModelManager
 * Paths match rearranged repo:
 *   public/assets/models/{vehicles,characters,world,environment}/
 * Game Developer: Hassan Zakariya
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Each key: ordered fallbacks (first that loads wins).
 * Spaces in filenames are encoded at load time.
 */
const MODEL_MAP = {
  // ——— Player / traffic keke ———
  keke: [
    'assets/models/vehicles/keke/keke-3.glb',
    'assets/models/vehicles/keke/keke-1.glb',
    'assets/models/vehicles/keke/keke-7.glb',
    'assets/models/vehicles/keke/keke-2.glb',
  ],
  // ——— Cars ———
  car: [
    'assets/models/vehicles/cars/quaternius_cc0-normal-car-1190.glb',
    'assets/models/vehicles/cars/low_poly_car_1.glb',
    'assets/models/vehicles/cars/RedCar.glb',
    'assets/models/world/props/Car.glb',
  ],
  taxi: [
    'assets/models/vehicles/cars/quaternius_cc0-taxi-1413.glb',
  ],
  suv: [
    'assets/models/vehicles/cars/quaternius_cc0-suv-1402.glb',
  ],
  truck: [
    'assets/models/vehicles/cars/quaternius_cc0-truck-1449.glb',
    'assets/models/vehicles/cars/truck.glb',
  ],
  // ——— Special ———
  police: [
    'assets/models/vehicles/special/police.glb',
    'assets/models/world/props/Police-Car.glb',
  ],
  karota: [
    'assets/models/vehicles/special/karota.glb',
    'assets/models/vehicles/special/police.glb',
  ],
  bus: [
    'assets/models/vehicles/special/bus.glb',
    'assets/models/world/props/Bus.glb',
  ],
  motorcycle: [
    'assets/models/vehicles/special/okada.glb',
    'assets/models/vehicles/cars/motorcycle.glb',
    'assets/models/vehicles/cars/ps2_styled_old_motorcycle.glb',
  ],
  ambulance: [
    'assets/models/vehicles/special/ambulance.glb',
  ],
  robber: [
    'assets/models/vehicles/keke/keke-6.glb',
  ],
  bicycle: [
    'assets/models/vehicles/cars/quaternius_cc0-bicycle-697.glb',
    'assets/models/world/props/Bicycle.glb',
  ],
  // ——— People ———
  pedestrian: [
    'assets/models/characters/pedestrians/pedestrian.glb',
    'assets/models/characters/pedestrians/passenger.glb',
    'assets/models/characters/pedestrians/Man in Long Sleeves.glb',
    'assets/models/characters/pedestrians/muslim_girl.glb',
    'assets/models/characters/passengers/tekamist_mens.glb',
  ],
  passenger: [
    'assets/models/characters/passengers/hijab_muslim_woman.glb',
    'assets/models/characters/passengers/women_in_hijab.glb',
    'assets/models/characters/passengers/Man in Suit.glb',
    'assets/models/characters/passengers/Man.glb',
    'assets/models/characters/pedestrians/passenger.glb',
  ],
  // ——— World props ———
  bustop: [
    'assets/models/world/props/Stop-sign.glb',
    'assets/models/world/props/Bench.glb',
    'assets/models/world/props/Traffic-Light.glb',
  ],
  bustation: [
    'assets/models/world/props/Stop-sign.glb',
    'assets/models/world/props/Bench.glb',
  ],
  market: [
    'assets/models/world/props/Pizza-Corner.glb',
    'assets/models/world/props/Greenhouse.glb',
  ],
  building: [
    'assets/models/world/buildings-suburban/building-type-a.glb',
    'assets/models/world/buildings-suburban/building-type-b.glb',
    'assets/models/world/buildings-suburban/building-type-c.glb',
    'assets/models/world/props/big-building.glb',
  ],
  tree: ['assets/models/world/props/Tree.glb'],
  billboard: ['assets/models/world/props/Billboard.glb'],
  bench: ['assets/models/world/props/Bench.glb'],
  flyover: [
    'assets/models/world/roads/kano_urban_flyover.glb',
    'assets/models/world/roads/kai_tak_flyovers.glb',
    'assets/models/world/roads/kowloon_bay_flyover.glb',
  ],
  roadlight: [
    'assets/models/world/roads/light-curved.glb',
    'assets/models/world/roads/light-square.glb',
  ],
  trafficlight: [
    'assets/models/world/roads/traffic-light.glb',
    'assets/models/world/props/Traffic-Light.glb',
  ],
  cone: ['assets/models/world/roads/construction-cone.glb'],
  dirtmound: ['assets/models/world/roads/gravel_asphalt_dirt_mound_pile.glb'],
  trafficlight: ['assets/models/world/props/Traffic-Light.glb'],
};

const TARGET_HEIGHT = {
  keke: 1.75, car: 1.35, taxi: 1.35, suv: 1.55, truck: 2.0,
  motorcycle: 1.15, police: 1.4, karota: 1.45, bus: 2.2,
  ambulance: 1.7, robber: 1.85, bicycle: 0.9,
  pedestrian: 1.7, passenger: 1.7,
  building: 5.0, market: 2.8, bustop: 2.2, bustation: 2.4, flyover: 6.0, roadlight: 4.5,
  tree: 4, billboard: 3.5, bench: 0.6, trafficlight: 3.2
};

function encodePath(path) {
  return path.split('/').map((s) => encodeURIComponent(s)).join('/');
}

export class ModelManager {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/';
    this.cache = new Map();
    this.failed = new Set();
    this.mixers = [];
    this.pools = new Map();
    this.loader = new GLTFLoader();
    this.ready = false;
    this.log = [];
    console.log('[ModelManager] catalog → vehicles/ characters/ world/ environment/');
  }

  async preload(keys = Object.keys(MODEL_MAP)) {
    await Promise.all(keys.map((k) => this.load(k)));
    this.ready = true;
    console.log('[ModelManager] Loaded:', [...this.cache.keys()].join(', ') || '(none)');
    console.log('[ModelManager] Failed:', [...this.failed].join(', ') || '(none)');
    return this;
  }

  pathsFor(key) {
    const v = MODEL_MAP[key];
    if (!v) return [`assets/models/${key}.glb`];
    return Array.isArray(v) ? v : [v];
  }

  async load(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.failed.has(key)) return null;

    for (const path of this.pathsFor(key)) {
      const url = this.baseUrl.replace(/\/?$/, '/') + encodePath(path).replace(/^\//, '');
      try {
        const gltf = await new Promise((resolve, reject) => {
          this.loader.load(url, resolve, undefined, reject);
        });
        const root = gltf.scene || gltf.scenes?.[0];
        if (!root) throw new Error('empty gltf');
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetH = TARGET_HEIGHT[key] ?? 1.4;
        if (size.y > 0.001) {
          root.scale.multiplyScalar(targetH / size.y);
          root.updateMatrixWorld(true);
          const box2 = new THREE.Box3().setFromObject(root);
          root.position.y -= box2.min.y;
        }
        // Reject absurd size after normalize
        root.updateMatrixWorld(true);
        const box3 = new THREE.Box3().setFromObject(root);
        box3.getSize(size);
        // Strict caps — giant "train/bus in sky" meshes get rejected
        const maxY = key === 'flyover' ? 25 : key === 'building' ? 10 : 8;
        const maxX = key === 'flyover' ? 40 : 12;
        const maxZ = key === 'flyover' ? 40 : 14;
        if (size.y > maxY || size.x > maxX || size.z > maxZ) {
          console.warn('[ModelManager] skip oversized', key, size.toArray());
          continue;
        }
        // Keke must be tricycle-ish, not bus-long
        if (key === 'keke' || key === 'robber') {
          const longest = Math.max(size.x, size.z);
          if (longest > 4.5 || size.y < 0.8) {
            console.warn('[ModelManager] skip non-keke aspect', key, size.toArray());
            continue;
          }
        }
        root.traverse((ch) => {
          if (ch.isMesh) {
            ch.castShadow = true;
            ch.receiveShadow = true;
            // Ensure materials visible (some GLBs ship unlit / black)
            if (ch.material) {
              const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
              for (const m of mats) {
                if (m) {
                  m.side = THREE.DoubleSide;
                  if (m.transparent && m.opacity < 0.05) m.opacity = 1;
                  m.needsUpdate = true;
                }
              }
            }
          }
        });
        // Vehicles face +Z toward traffic in our runner
        if (['keke', 'car', 'taxi', 'suv', 'truck', 'police', 'karota', 'bus', 'motorcycle', 'ambulance', 'robber'].includes(key)) {
          root.rotation.y = Math.PI; // face camera / oncoming feel
        }
        const entry = { scene: root, animations: gltf.animations || [], url };
        this.cache.set(key, entry);
        this.log.push({ key, ok: true, url });
        console.log('[ModelManager] OK', key, '←', path);
        return entry;
      } catch (err) {
        this.log.push({ key, ok: false, url, err: String(err?.message || err) });
      }
    }
    this.failed.add(key);
    console.warn('[ModelManager] FAIL', key);
    return null;
  }

  getInstance(key, opts = {}) {
    const entry = this.cache.get(key);
    let root;
    if (entry?.scene) {
      root = entry.scene.clone(true);
      root.userData.isPlaceholder = false;
      if (entry.animations?.length) {
        try {
          const mixer = new THREE.AnimationMixer(root);
          mixer.clipAction(entry.animations[0]).play();
          root.userData.mixer = mixer;
          this.mixers.push(mixer);
        } catch (_) {}
      }
    } else {
      root = this.makePlaceholder(key, opts.color);
      root.userData.isPlaceholder = true;
    }
    if (opts.scale != null) root.scale.multiplyScalar(opts.scale);
    root.userData.modelKey = key;
    return root;
  }

  acquire(key, opts = {}) {
    if (!this.pools.has(key)) this.pools.set(key, []);
    const pool = this.pools.get(key);
    let obj = pool.pop();
    if (!obj) obj = this.getInstance(key, opts);
    obj.visible = true;
    return obj;
  }

  release(obj) {
    if (!obj) return;
    obj.visible = false;
    if (obj.parent) obj.parent.remove(obj);
    const key = obj.userData.modelKey || 'misc';
    if (!this.pools.has(key)) this.pools.set(key, []);
    this.pools.get(key).push(obj);
  }

  update(dt = 0.016) {
    for (let i = this.mixers.length - 1; i >= 0; i--) {
      try { this.mixers[i].update(dt); } catch { this.mixers.splice(i, 1); }
    }
  }

  has(key) { return this.cache.has(key); }

  report() {
    return { loaded: [...this.cache.keys()], failed: [...this.failed], log: this.log.slice() };
  }

  makePlaceholder(key, color) {
    const g = new THREE.Group();
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.12 });
    const col = color ?? ({
      keke: 0xfbbf24, car: 0xdc2626, taxi: 0xeab308, bus: 0x15803d,
      truck: 0x64748b, police: 0x1e40af, karota: 0xfacc15, motorcycle: 0x475569,
      robber: 0x7f1d1d, pedestrian: 0x3b82f6, passenger: 0x22c55e, building: 0x334155
    }[key] ?? 0x94a3b8);
    if (key === 'keke' || key === 'robber' || key === 'karota') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 1.5), mat(col));
      body.position.y = 0.55; g.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 1.2), mat(0x1e293b));
      roof.position.y = 1.15; g.add(roof);
    } else if (key === 'pedestrian' || key === 'passenger') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.22), mat(col));
      body.position.y = 0.95; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), mat(0xc4a574));
      head.position.y = 1.45; g.add(head);
    } else if (key === 'building') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.5, 2.0), mat(col));
      body.position.y = 1.75; g.add(body);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 2.0), mat(col));
      body.position.y = 0.4; g.add(body);
    }
    g.userData.isPlaceholder = true;
    g.userData.modelKey = key;
    return g;
  }
}

/** Texture URLs for road / world (rearranged environment folder) */
export const TEXTURE_URLS = {
  asphalt: '/assets/models/environment/ground/asphalt.jpg',
  asphaltAlt: '/assets/models/environment/ground/asphalt-1.jpg',
  potholes: '/assets/models/environment/ground/potholes.jpg',
  dirt: '/assets/models/environment/ground/Dirt.jpg',
  wall: '/assets/models/environment/ground/building-wall.jpg',
  market: '/assets/models/environment/ground/market-stall.jpg',
  sky: {
    ft: '/assets/models/environment/sky/sh_ft.png',
    bk: '/assets/models/environment/sky/sh_bk.png',
    up: '/assets/models/environment/sky/sh_up.png',
    dn: '/assets/models/environment/sky/sh_dn.png',
    lf: '/assets/models/environment/sky/sh_lf.png',
    rt: '/assets/models/environment/sky/sh_rt.png',
  }
};
