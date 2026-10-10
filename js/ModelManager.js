/**

* Kano Run — ModelManager
* GLB models, caching, pooling, animation and fallback objects.
* Game Developer: Hassan Zakariya
  */

import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_MAP = {
keke: ['keke.glb'],
car: ['car.glb'],
bus: ['bus.glb'],
taxi: ['taxi.glb'],
motorcycle: ['motorcycle.glb'],
truck: ['truck.glb'],
police: ['police.glb'],
karota: ['karota.glb'],
pedestrian: ['pedestrian.glb'],
passenger: ['passenger.glb'],
robber: ['robber.glb'],
bicycle: ['bicycle.glb'],
market: ['market.glb'],
bustop: ['bustop.glb', 'bus-stop.glb'],
bustation: ['bustation.glb', 'bus-station.glb']
};

const DEFAULT_SCALE = {
keke: 1,
car: 1,
taxi: 1,
bus: 0.85,
truck: 0.9,
motorcycle: 1,
police: 1,
karota: 1.1,
pedestrian: 1,
passenger: 1,
robber: 1,
bicycle: 1,
market: 1,
bustop: 1,
bustation: 0.8
};

export class ModelManager {
constructor(options = {}) {
this.baseUrl = options.baseUrl || '/';
this.modelDirectories = options.modelDirectories || [
'model',
'models'
];

```
this.loader = new GLTFLoader();
this.cache = new Map();
this.failed = new Set();
this.loading = new Map();
this.mixers = [];
this.pools = new Map();
this.log = [];
this.ready = false;
```

}

getModelCandidates(key) {
const names = MODEL_MAP[key] || [`${key}.glb`];
const candidates = [];

```
for (const directory of this.modelDirectories) {
  for (const name of names) {
    candidates.push(
      `${this.baseUrl.replace(/\/?$/, '/')}${directory}/${name}`
    );
  }
}

return [...new Set(candidates)];
```

}

async load(key) {
if (this.cache.has(key)) {
return this.cache.get(key);
}

```
if (this.loading.has(key)) {
  return this.loading.get(key);
}

const task = this.loadModel(key);
this.loading.set(key, task);

try {
  return await task;
} finally {
  this.loading.delete(key);
}
```

}

async loadModel(key) {
const candidates = this.getModelCandidates(key);
let lastError = null;

```
for (const url of candidates) {
  try {
    const gltf = await new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });

    if (!gltf || !gltf.scene) {
      throw new Error('The GLB file has no scene.');
    }

    const scene = gltf.scene;

    scene.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;

      if (child.geometry) {
        child.geometry.computeBoundingSphere();
      }
    });

    // Place the model's lowest point on the ground.
    const bounds = new THREE.Box3().setFromObject(scene);

    if (
      Number.isFinite(bounds.min.y) &&
      Math.abs(bounds.min.y) > 0.0001
    ) {
      scene.position.y -= bounds.min.y;
    }

    const entry = {
      scene,
      animations: gltf.animations || [],
      source: url
    };

    this.cache.set(key, entry);
    this.failed.delete(key);
    this.log.push(`${key}: LOADED (${url})`);

    console.info(`[ModelManager] Loaded ${key}: ${url}`);

    return entry;
  } catch (error) {
    lastError = error;
  }
}

this.failed.add(key);
this.log.push(`${key}: MODEL NOT FOUND`);

console.warn(
  `[ModelManager] Could not load "${key}". Tried:`,
  candidates,
  lastError?.message || ''
);

return null;
```

}

async preload(keys = Object.keys(MODEL_MAP)) {
await Promise.all(keys.map((key) => this.load(key)));

```
this.ready = true;

console.info(
  '[ModelManager] Preload complete.',
  'Loaded:',
  [...this.cache.keys()],
  'Failed:',
  [...this.failed]
);

return this;
```

}

getInstance(key, options = {}) {
const entry = this.cache.get(key);
let object;

```
if (entry?.scene) {
  object = entry.scene.clone(true);

  object.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = true;
    child.receiveShadow = true;

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        material.clone()
      );
    } else if (child.material) {
      child.material = child.material.clone();
    }
  });

  if (entry.animations.length) {
    const mixer = new THREE.AnimationMixer(object);
    const clip = entry.animations[0];

    if (clip) {
      mixer.clipAction(clip).play();
    }

    object.userData.mixer = mixer;
    this.mixers.push(mixer);
  }

  object.userData.isPlaceholder = false;
} else {
  object = this.makePlaceholder(key, options.color);
  object.userData.isPlaceholder = true;
}

const scale = options.scale ?? DEFAULT_SCALE[key] ?? 1;

object.scale.setScalar(scale);
object.userData.modelKey = key;

return object;
```

}

acquire(key, options = {}) {
if (!this.pools.has(key)) {
this.pools.set(key, []);
}

```
const pool = this.pools.get(key);
const object = pool.pop() || this.getInstance(key, options);

object.visible = true;

return object;
```

}

release(object) {
if (!object) return;

```
object.visible = false;

if (object.parent) {
  object.parent.remove(object);
}

const key = object.userData.modelKey || 'misc';

if (!this.pools.has(key)) {
  this.pools.set(key, []);
}

this.pools.get(key).push(object);
```

}

update(deltaSeconds = 0.016) {
for (let i = this.mixers.length - 1; i >= 0; i--) {
try {
this.mixers[i].update(deltaSeconds);
} catch (error) {
console.warn('[ModelManager] Animation update failed:', error);
this.mixers.splice(i, 1);
}
}
}

has(key) {
return this.cache.has(key);
}

report() {
return {
loader: this.loader ? 'OK' : 'MISSING',
ready: this.ready,
loaded: [...this.cache.keys()],
failed: [...this.failed],
log: [...this.log]
};
}

makePlaceholder(key, color) {
const group = new THREE.Group();

```
const material = (value) =>
  new THREE.MeshStandardMaterial({
    color: value,
    roughness: 0.62,
    metalness: 0.08
  });

const colors = {
  keke: 0xfbbf24,
  car: 0xdc2626,
  taxi: 0xeab308,
  bus: 0x15803d,
  truck: 0x64748b,
  police: 0x1e40af,
  karota: 0xfacc15,
  motorcycle: 0x475569,
  robber: 0x7f1d1d,
  pedestrian: 0x3b82f6,
  passenger: 0x22c55e,
  bicycle: 0x16a34a,
  market: 0xb45309,
  bustop: 0x0e7490,
  bustation: 0x0e7490
};

const bodyColor = color ?? colors[key] ?? 0x94a3b8;

const addBox = (width, height, depth, value, x, y, z) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material(value)
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  return mesh;
};

if (key === 'pedestrian' || key === 'passenger' || key === 'karota') {
  addBox(0.3, 0.55, 0.22, bodyColor, 0, 0.85, 0);
  addBox(0.32, 0.25, 0.25, 0xd4a373, 0, 1.25, 0);
  addBox(0.12, 0.35, 0.14, 0x334155, -0.1, 0.35, 0);
  addBox(0.12, 0.35, 0.14, 0x334155, 0.1, 0.35, 0);
} else if (key === 'motorcycle' || key === 'bicycle') {
  const wheelMaterial = material(0x202020);

  for (const z of [-0.65, 0.65]) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.07, 8, 16),
      wheelMaterial
    );

    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, 0.28, z);
    group.add(wheel);
  }

  addBox(0.18, 0.3, 0.7, bodyColor, 0, 0.55, 0);
  addBox(0.35, 0.12, 0.25, 0x202020, 0, 0.75, -0.12);
} else if (key === 'keke' || key === 'robber') {
  addBox(1.1, 0.45, 1.6, bodyColor, 0, 0.65, 0);
  addBox(0.9, 0.55, 0.75, 0x93c5fd, 0, 1.12, -0.12);
  addBox(1.12, 0.12, 0.15, 0x202020, 0, 0.42, 0.72);
} else if (key === 'market' || key === 'bustop' || key === 'bustation') {
  addBox(2.2, 0.18, 1.5, bodyColor, 0, 2.1, 0);
  addBox(0.15, 2, 0.15, 0x795548, -0.9, 1, -0.55);
  addBox(0.15, 2, 0.15, 0x795548, 0.9, 1, -0.55);
  addBox(0.15, 2, 0.15, 0x795548, -0.9, 1, 0.55);
  addBox(0.15, 2, 0.15, 0x795548, 0.9, 1, 0.55);
} else {
  const length = key === 'bus' || key === 'truck' ? 3 : 2.2;
  const height = key === 'bus' ? 1.35 : 0.8;

  addBox(1.3, height, length, bodyColor, 0, height / 2 + 0.2, 0);

  addBox(
    1.05,
    0.35,
    length * 0.45,
    0x93c5fd,
    0,
    height + 0.12,
    -0.08
  );

  const wheelMaterial = material(0x202020);

  for (const x of [-0.68, 0.68]) {
    for (const z of [-length * 0.3, length * 0.3]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12),
        wheelMaterial
      );

      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.25, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }
}

group.userData.modelKey = key;
group.userData.isPlaceholder = true;

return group;
```

}
}

let sharedModelManager = null;

export function getModelManager(options) {
if (!sharedModelManager) {
sharedModelManager = new ModelManager(options);
}

return sharedModelManager;
}
