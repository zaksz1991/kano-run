import * as THREE from 'three';

/**
 * Kano Life — Living Neighbourhoods Director
 * Procedural, lightweight 3D street dressing and ambient actors for a Three.js scene.
 * Additive module: it does not move the player vehicle or replace existing traffic/physics.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const DEFAULTS = {
  seed: 7319,
  length: 260,
  roadWidth: 18,
  sideOffset: 11,
  maxProps: 90,
  maxActors: 22,
  pedestrianCount: 12,
  goatCount: 3,
  motorcycleCount: 4,
  stallCount: 12,
  shopCount: 10,
  enableShadows: false,
  actorMoveSpeed: 0.65,
};

const PALETTE = {
  wall: [0xc6a77b, 0xd8c39d, 0xb9b1a2, 0xe0d4bd, 0xc8b49a],
  awning: [0x0f766e, 0xb91c1c, 0xd97706, 0x2563eb, 0x7c3aed],
  cloth: [0x2563eb, 0x15803d, 0x9f1239, 0x92400e, 0x6d28d9, 0x0f766e],
  vehicle: [0x159447, 0x0f766e, 0xd97706, 0x2563eb, 0xb91c1c, 0xe5e7eb],
};

export class KanoLivingNeighborhoodDirector {
  constructor(scene, options = {}) {
    if (!scene || !scene.isScene) throw new Error('KanoLivingNeighborhoodDirector requires a THREE.Scene.');
    this.scene = scene;
    this.options = { ...DEFAULTS, ...options };
    this.root = new THREE.Group();
    this.root.name = 'KanoLivingNeighbourhoods';
    this.scene.add(this.root);
    this.props = [];
    this.actors = [];
    this.disposed = false;
    this.elapsed = 0;
    this.timeOfDay = 9.0;
    this.neighbourhood = 'market';
    this.listeners = new Map();
    this.randomState = (this.options.seed >>> 0) || 1;
    this.materials = new Map();
    this._buildStreet();
    this._populate();
    this.setTimeOfDay(this.timeOfDay);
  }

  on(event, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit(event, payload = {}) {
    for (const callback of this.listeners.get(event) || []) {
      try { callback(payload); } catch (error) { console.error(`[KanoLivingNeighborhoodDirector:${event}]`, error); }
    }
  }

  random() {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  between(min, max) { return min + this.random() * (max - min); }

  material(color, roughness = 0.9, metalness = 0) {
    const key = `${color}:${roughness}:${metalness}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    return this.materials.get(key);
  }

  box(name, size, position, color, parent = this.root, options = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      this.material(color, options.roughness ?? 0.92, options.metalness ?? 0),
    );
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = Boolean(this.options.enableShadows);
    mesh.receiveShadow = Boolean(this.options.enableShadows);
    parent.add(mesh);
    this.props.push(mesh);
    return mesh;
  }

  cylinder(name, radiusTop, radiusBottom, height, position, color, parent = this.root, segments = 8) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      this.material(color),
    );
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = Boolean(this.options.enableShadows);
    parent.add(mesh);
    this.props.push(mesh);
    return mesh;
  }

  _buildStreet() {
    const { length, roadWidth } = this.options;
    this.box('Kano asphalt road', [roadWidth, 0.12, length], [0, -0.12, 0], 0x4b4d4f);
    this.box('Left road shoulder', [1.3, 0.18, length], [-roadWidth / 2 - 0.65, -0.08, 0], 0x9a8e7a);
    this.box('Right road shoulder', [1.3, 0.18, length], [roadWidth / 2 + 0.65, -0.08, 0], 0x9a8e7a);
    for (let z = -length / 2 + 4; z < length / 2; z += 8) {
      this.box('Faded road centre marking', [0.13, 0.015, 3.2], [0, -0.045, z], 0xd8d2bd);
    }
    // Drainage channels and rough roadside verges give the street a recognisably local scale.
    for (const side of [-1, 1]) {
      const x = side * (roadWidth / 2 + 2.1);
      this.box('Open roadside drainage', [0.55, 0.16, length], [x, -0.13, 0], 0x343a3c);
      this.box('Dusty roadside verge', [5.5, 0.08, length], [side * (roadWidth / 2 + 5.0), -0.14, 0], 0xb9a27e);
    }
  }

  _makeShop(side, z, index) {
    const group = new THREE.Group();
    group.name = `Kano shop ${index + 1}`;
    group.position.set(side * this.between(15.5, 18.5), 0, z);
    this.root.add(group);
    const width = this.between(4.2, 6.2);
    const height = this.between(3.2, 4.4);
    const depth = this.between(3.5, 5.0);
    const wall = pick(PALETTE.wall);
    this.box('Shop facade', [width, height, depth], [0, height / 2, 0], wall, group);
    this.box('Shop doorway', [width * 0.24, height * 0.58, 0.12], [0, height * 0.29, depth / 2 + 0.07], 0x403329, group);
    this.box('Shop signboard', [width * 0.9, 0.42, 0.16], [0, height * 0.78, depth / 2 + 0.12], 0x135e59, group);
    this.box('Shop awning', [width * 1.08, 0.16, 1.2], [0, height * 0.62, depth / 2 + 0.55], pick(PALETTE.awning), group);
    // Crates and sacks outside shops add clutter without using expensive imported meshes.
    for (let c = 0; c < 2; c++) {
      this.box('Shop goods crate', [0.55, 0.5, 0.5], [side * this.between(0.8, 1.5), 0.25, depth / 2 + 0.75 + c * 0.48], c % 2 ? 0x8b5e34 : 0x9b7653, group);
    }
    this.props.push(group);
    return group;
  }

  _makeStall(side, z, index) {
    const group = new THREE.Group();
    group.name = `Roadside market stall ${index + 1}`;
    group.position.set(side * this.between(12.4, 14.8), 0, z);
    this.root.add(group);
    const cloth = pick(PALETTE.awning);
    for (const x of [-1, 1]) for (const zz of [-0.8, 0.8]) {
      this.cylinder('Stall timber post', 0.055, 0.065, 2.15, [x * 1.1, 1.05, zz], 0x765238, group, 6);
    }
    this.box('Market stall canopy', [2.55, 0.15, 2.0], [0, 2.12, 0], cloth, group);
    this.box('Market stall counter', [2.25, 0.78, 0.75], [0, 0.55, 0.2], 0x8d633e, group);
    for (let i = 0; i < 5; i++) {
      const goodsColor = [0xd97706, 0x15803d, 0xb91c1c, 0xd4a72c, 0x8b5cf6][i];
      this.cylinder('Market produce bowl', 0.18, 0.23, 0.15, [-0.82 + i * 0.41, 1.02, 0.2], goodsColor, group, 8);
    }
    this.props.push(group);
    return group;
  }

  _makePerson(kind, position, index) {
    const group = new THREE.Group();
    group.name = `${kind} ambient actor ${index}`;
    group.position.set(position.x, 0, position.z);
    group.userData = {
      kind,
      phase: this.between(0, Math.PI * 2),
      speed: this.between(0.25, this.options.actorMoveSpeed),
      direction: this.random() < 0.5 ? -1 : 1,
      originX: position.x,
      originZ: position.z,
      roam: kind === 'goat' ? this.between(1.5, 4.0) : this.between(0.5, 2.0),
      pause: this.between(0.5, 4),
    };
    if (kind === 'goat') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.42, 0.34), this.material(0xd6c7a7));
      body.position.y = 0.55; group.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.28, 0.25), this.material(0xc5b28e));
      head.position.set(0.42, 0.68, 0); group.add(head);
      for (const x of [-0.23, 0.23]) for (const z of [-0.1, 0.1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.08), this.material(0x6c5740));
        leg.position.set(x, 0.22, z); group.add(leg);
      }
      group.userData.legs = group.children.slice(2);
    } else if (kind === 'motorcycle') {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.9), this.material(pick(PALETTE.vehicle), 0.55));
      frame.position.y = 0.62; group.add(frame);
      for (const z of [-0.34, 0.34]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 6, 10), this.material(0x202020, 0.7));
        wheel.rotation.y = Math.PI / 2; wheel.position.set(0, 0.25, z); group.add(wheel);
      }
      const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.43, 3, 6), this.material(0x1f2937));
      rider.position.set(0, 1.05, -0.03); group.add(rider);
    } else {
      const cloth = pick(PALETTE.cloth);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.52, 3, 7), this.material(cloth));
      body.position.y = 0.88; group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), this.material(0x754c35));
      head.position.y = 1.34; group.add(head);
      // A simple Hausa-inspired flowing outer garment silhouette, deliberately low-poly.
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.7, 7), this.material(cloth));
      robe.position.y = 0.55; group.add(robe);
    }
    this.root.add(group);
    this.actors.push(group);
    return group;
  }

  _makeParkedKeke(side, z, index) {
    const group = new THREE.Group();
    group.name = `Parked Adaidaita Sahu ${index + 1}`;
    group.position.set(side * this.between(11.4, 12.2), 0, z);
    group.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.0, 1.8), this.material(pick(PALETTE.vehicle), 0.65));
    body.position.y = 0.8; group.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.9), this.material(0x222a2b, 0.75));
    roof.position.y = 1.65; group.add(roof);
    for (const x of [-0.66, 0.66]) for (const zz of [-0.62, 0.62]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.09, 6, 10), this.material(0x171717, 0.85));
      wheel.rotation.y = Math.PI / 2; wheel.position.set(x, 0.35, zz); group.add(wheel);
    }
    this.root.add(group); this.props.push(group);
  }

  _populate() {
    const half = this.options.length / 2 - 8;
    for (let i = 0; i < this.options.shopCount; i++) {
      const z = this.between(-half, half);
      this._makeShop(i % 2 ? -1 : 1, z, i);
    }
    for (let i = 0; i < this.options.stallCount; i++) {
      const z = this.between(-half, half);
      this._makeStall(i % 2 ? 1 : -1, z, i);
    }
    for (let i = 0; i < Math.min(this.options.pedestrianCount, this.options.maxActors); i++) {
      const side = this.random() < 0.5 ? -1 : 1;
      this._makePerson('pedestrian', new THREE.Vector3(side * this.between(10.8, 13.4), 0, this.between(-half, half)), i);
    }
    for (let i = 0; i < Math.min(this.options.goatCount, Math.max(0, this.options.maxActors - this.actors.length)); i++) {
      this._makePerson('goat', new THREE.Vector3(this.between(-8.5, 8.5), 0, this.between(-half, half)), i);
    }
    for (let i = 0; i < Math.min(this.options.motorcycleCount, Math.max(0, this.options.maxActors - this.actors.length)); i++) {
      const side = this.random() < 0.5 ? -1 : 1;
      this._makePerson('motorcycle', new THREE.Vector3(side * this.between(6.5, 8.4), 0, this.between(-half, half)), i);
    }
    for (let i = 0; i < 5; i++) this._makeParkedKeke(i % 2 ? -1 : 1, this.between(-half, half), i);
    this.emit('world:built', { props: this.props.length, actors: this.actors.length });
  }

  setNeighbourhood(type = 'market') {
    const presets = {
      market: { stallDensity: 1, actorSpeed: 1, trafficMood: 'busy', label: 'Kano market street' },
      residential: { stallDensity: 0.35, actorSpeed: 0.7, trafficMood: 'calm', label: 'Residential neighbourhood' },
      school: { stallDensity: 0.6, actorSpeed: 0.8, trafficMood: 'school-rush', label: 'School district' },
      motorPark: { stallDensity: 0.8, actorSpeed: 1.1, trafficMood: 'crowded', label: 'Motor park' },
      industrial: { stallDensity: 0.25, actorSpeed: 0.65, trafficMood: 'heavy-vehicles', label: 'Industrial district' },
      event: { stallDensity: 0.7, actorSpeed: 1.2, trafficMood: 'celebration', label: 'Celebration route' },
    };
    if (!presets[type]) throw new Error(`Unknown neighbourhood type: ${type}`);
    this.neighbourhood = type;
    this.emit('neighbourhood:changed', { type, ...presets[type] });
    return { type, ...presets[type] };
  }

  setTimeOfDay(hour) {
    this.timeOfDay = ((Number(hour) % 24) + 24) % 24;
    const night = this.timeOfDay < 5.5 || this.timeOfDay >= 19.25;
    const dusk = (this.timeOfDay >= 17.5 && this.timeOfDay < 19.25) || (this.timeOfDay >= 5 && this.timeOfDay < 6.5);
    const sky = night ? 0x101a31 : dusk ? 0x8e7665 : 0xb9d5e8;
    this.scene.background = new THREE.Color(sky);
    this.root.traverse((object) => {
      if (object.isMesh && object.material && object.material.emissive) {
        object.material.emissive.setHex(night ? 0x111008 : 0x000000);
      }
    });
    this.emit('time:changed', { hour: this.timeOfDay, phase: night ? 'night' : dusk ? 'dawn-dusk' : 'day' });
    return { hour: this.timeOfDay, phase: night ? 'night' : dusk ? 'dawn-dusk' : 'day' };
  }

  update(deltaSeconds, playerPosition = null) {
    if (this.disposed) return;
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    this.elapsed += dt;
    for (const actor of this.actors) {
      const data = actor.userData;
      data.phase += dt * (data.speed || 0.4) * 5;
      if (data.kind === 'pedestrian') {
        actor.position.x = data.originX + Math.sin(data.phase * 0.28) * data.roam;
        actor.position.z = data.originZ + Math.sin(data.phase * 0.18) * 1.4;
        actor.rotation.y = Math.cos(data.phase * 0.28) > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (actor.children[0]) actor.children[0].rotation.z = Math.sin(data.phase) * 0.035;
      } else if (data.kind === 'goat') {
        actor.position.x = data.originX + Math.sin(data.phase * 0.24) * data.roam;
        actor.position.z = data.originZ + Math.cos(data.phase * 0.17) * data.roam;
        actor.rotation.y = Math.cos(data.phase * 0.24) >= 0 ? Math.PI / 2 : -Math.PI / 2;
        for (let i = 0; i < (data.legs || []).length; i++) data.legs[i].rotation.x = Math.sin(data.phase * 2 + i) * 0.18;
      } else if (data.kind === 'motorcycle') {
        actor.position.z = data.originZ + Math.sin(data.phase * 0.12) * 7;
        actor.position.x = data.originX + Math.sin(data.phase * 0.09) * 0.7;
        actor.rotation.y = Math.cos(data.phase * 0.12) >= 0 ? 0 : Math.PI;
      }
      if (playerPosition && Number.isFinite(playerPosition.x) && Number.isFinite(playerPosition.z)) {
        const distance = Math.hypot(actor.position.x - playerPosition.x, actor.position.z - playerPosition.z);
        if (distance < 3 && data.kind === 'goat') this.emit('hazard:nearby', { kind: 'goat', distance, position: actor.position.clone() });
      }
    }
  }

  getSnapshot() {
    return {
      neighbourhood: this.neighbourhood,
      timeOfDay: this.timeOfDay,
      propCount: this.props.length,
      actorCount: this.actors.length,
      actors: this.actors.reduce((acc, actor) => { acc[actor.userData.kind] = (acc[actor.userData.kind] || 0) + 1; return acc; }, {}),
      elapsed: this.elapsed,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.traverse((object) => {
      if (object.isMesh) object.geometry?.dispose();
    });
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.scene.remove(this.root);
    this.props.length = 0;
    this.actors.length = 0;
    this.listeners.clear();
  }
}

export default KanoLivingNeighborhoodDirector;
