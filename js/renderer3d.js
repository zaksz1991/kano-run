import * as THREE from 'three';

const VEHICLE_MODEL_KEY = {
  keke: 'keke', car: 'car', taxi: 'taxi', suv: 'suv', truck: 'truck',
  bus: 'bus', motorcycle: 'motorcycle', police: 'police', karota: 'karota',
};

export class Renderer3D {
  constructor(canvas, models, { mobile = false } = {}) {
    this.canvas = canvas;
    this.models = models;
    this.mobile = mobile;
    this.ready = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ccde5);
    this.scene.fog = new THREE.Fog(0x8ccde5, 48, 195);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 260);
    this.camera.position.set(0, 5.2, 11);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      alpha: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setPixelRatio(mobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.trafficActors = new Map();
    this.zoneActors = new Map();
    this.laneDashes = [];
    this.buildWorld();
    this.player = this.makeKeke();
    this.player.position.set(0, 0, 2);
    this.scene.add(this.player);
    this.ready = true;
  }

  material(color, roughness = 1) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      side: THREE.DoubleSide,
    });
  }

  buildWorld() {
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(13, 250), this.material(0x343c43));
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.z = -92;
    this.world.add(asphalt);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 270), this.material(0xa59a78));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.09, -92);
    this.world.add(ground);

    for (const x of [-6.15, 6.15]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 250), this.material(0xf5d88e));
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x, 0.025, -92);
      this.world.add(edge);
    }
    for (const x of [-2, 2]) {
      for (let z = -4; z > -245; z -= 8.5) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 3.4), this.material(0xe8e0c8));
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.028, z);
        this.world.add(dash);
        this.laneDashes.push(dash);
      }
    }

    // Procedural Kano compound buildings ensure the street remains populated
    // even when no asset pack is installed.
    const buildingCount = this.mobile ? 10 : 24;
    const buildingColors = [0xd0b78e, 0xb98e6b, 0xd8c8a3, 0x8d8e7a];
    for (let index = 0; index < buildingCount; index += 1) {
      const side = index % 2 ? 1 : -1;
      const z = -index * (this.mobile ? 14 : 9) - 8;
      const x = side * (9 + (index % 3) * 2.8);
      const height = 2.2 + (index % 4) * 0.7;
      const width = 2.8 + (index % 3) * 0.7;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, 3),
        this.material(buildingColors[index % buildingColors.length]),
      );
      building.position.set(x, height / 2, z);
      this.world.add(building);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.15, 0.15, 3.15), this.material(0x9d5740));
      roof.position.set(x, height + 0.05, z);
      this.world.add(roof);
      this.addWindows(building, width, height, z, x);
      if (index % 4 === 0) this.addBillboard(x - side * 1.5, 2.7, z + 1.75, index % 2 === 0);
    }

    const hemi = new THREE.HemisphereLight(0xeaf7ff, 0x75634d, 1.8);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffedca, 1.75);
    sun.position.set(-8, 14, 5);
    this.scene.add(sun);

    this.addBillboard(-8.7, 3.1, -45, false);
    this.addBillboard(8.7, 3.1, -78, true);
  }

  addWindows(building, width, height, z, x) {
    if (this.mobile) return;
    const count = Math.max(1, Math.floor(width / 0.8));
    for (let row = 0; row < Math.max(1, Math.floor(height / 1.2)); row += 1) {
      for (let col = 0; col < count; col += 1) {
        const windowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.24, 0.32),
          this.material(0x4f7180),
        );
        windowMesh.position.set(
          x - width * 0.35 + col * 0.65,
          0.6 + row * 0.9,
          z + 1.51,
        );
        this.world.add(windowMesh);
      }
    }
  }

  addBillboard(x, y, z, green) {
    const sign = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(3.3, 1.05, 0.12),
      this.material(green ? 0x168b71 : 0xf5c542),
    );
    sign.add(board);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.09), this.material(0x495260));
    post.position.y = -1.05;
    sign.add(post);
    sign.position.set(x, y, z);
    sign.rotation.y = x > 0 ? -0.18 : 0.18;
    this.world.add(sign);
  }

  makeKeke() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.65, 1.85), this.material(0xf5c542));
    body.position.y = 0.8;
    group.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.2), this.material(0x1d2a3a));
    roof.position.set(0, 1.45, -0.1);
    group.add(roof);
    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(1.08, 0.42, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    windshield.position.set(0, 1.16, -0.86);
    group.add(windshield);
    for (const x of [-0.56, 0.56]) {
      for (const z of [-0.6, 0.65]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.15, 12), this.material(0x121820));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.28, z);
        group.add(wheel);
      }
    }
    group.userData.fallback = true;
    return group;
  }

  async applyModel(key, object) {
    if (!object || !this.ready || key !== 'keke') return false;
    const old = this.player;
    object.position.set(old.position.x, 0, old.position.z);
    object.rotation.z = old.rotation.z;
    object.userData.fallback = false;
    this.scene.remove(old);
    this.scene.add(object);
    this.player = object;
    return true;
  }

  resize() {
    if (!this.ready || !this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  makeTrafficActor(vehicle) {
    const key = VEHICLE_MODEL_KEY[vehicle.type] || 'car';
    const model = this.models?.getInstance(key);
    if (model) {
      model.userData.fallback = false;
      return model;
    }
    const group = new THREE.Group();
    const colorMap = {
      keke: 0xf5c542, taxi: 0xe8c64b, suv: 0x37465a, motorcycle: 0xc84a3b,
      police: 0xe8edf3, karota: 0x328ac2, truck: 0x9e5544, bus: 0xd4ad46,
    };
    const bodyHeight = vehicle.type === 'bus' ? 1.5 : vehicle.type === 'motorcycle' ? 0.35 : 0.8;
    const bodyWidth = vehicle.type === 'truck' ? 2.1 : vehicle.type === 'motorcycle' ? 0.55 : 1.5;
    const bodyLength = vehicle.type === 'motorcycle' ? 1.1 : 2.2;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyLength),
      this.material(colorMap[vehicle.type] || 0xd6dce1),
    );
    body.position.y = bodyHeight / 2 + 0.2;
    group.add(body);
    if (vehicle.type !== 'motorcycle') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.55, 0.7), this.material(0x23364a));
      cab.position.set(0, bodyHeight + 0.32, -0.25);
      group.add(cab);
      for (const x of [-0.62, 0.62]) {
        for (const z of [-0.7, 0.7]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.13, 10), this.material(0x101820));
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x, 0.25, z);
          group.add(wheel);
        }
      }
    }
    group.userData.fallback = true;
    return group;
  }

  syncZones(state) {
    const activeIds = new Set();
    for (const zone of state.zones) {
      activeIds.add(zone.id);
      let actor = this.zoneActors.get(zone.id);
      if (!actor) {
        const colors = { pickup: 0x28d78a, drop: 0xf5c542, fuel: 0x54e6a1, pothole: 0x252b31 };
        actor = new THREE.Group();
        const radius = zone.hub ? 1.25 : zone.type === 'pickup' ? 0.68 : 0.98;
        const pad = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 0.04, 20),
          new THREE.MeshStandardMaterial({ color: colors[zone.type] || 0x353b42, side: THREE.DoubleSide, transparent: true, opacity: 0.78 }),
        );
        pad.position.y = 0.035;
        actor.add(pad);
        if (zone.type === 'fuel') {
          const pump = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.72, 0.34), this.material(0x35c991));
          pump.position.set(0.75, 0.38, 0);
          actor.add(pump);
        }
        actor.userData.zoneType = zone.type;
        this.world.add(actor);
        this.zoneActors.set(zone.id, actor);
      }
      actor.position.set((zone.lane - 1) * 3, 0.035, -Math.max(-0.05, zone.depth) * 88);
    }
    for (const [id, actor] of this.zoneActors) {
      if (!activeIds.has(id)) {
        this.world.remove(actor);
        this.zoneActors.delete(id);
      }
    }
  }

  syncTraffic(state) {
    const activeIds = new Set();
    for (const vehicle of state.traffic) {
      activeIds.add(vehicle.id);
      let actor = this.trafficActors.get(vehicle.id);
      if (!actor) {
        actor = this.makeTrafficActor(vehicle);
        actor.userData.vehicleType = vehicle.type;
        this.world.add(actor);
        this.trafficActors.set(vehicle.id, actor);
      }

      // Models may finish loading after the road first starts. Upgrade an actor
      // in-place once a real GLB becomes available; otherwise keep its visible placeholder.
      const key = VEHICLE_MODEL_KEY[vehicle.type] || 'car';
      if (actor.userData.fallback) {
        const model = this.models?.getInstance(key);
        if (model) {
          model.userData.fallback = false;
          model.userData.vehicleType = vehicle.type;
          model.position.copy(actor.position);
          model.rotation.copy(actor.rotation);
          this.world.remove(actor);
          this.world.add(model);
          this.trafficActors.set(vehicle.id, model);
          actor = model;
        }
      }
      actor.position.set((vehicle.lane - 1) * 3, 0, -Math.max(-0.05, vehicle.depth) * 88);
      actor.rotation.y = Math.PI;
    }
    for (const [id, actor] of this.trafficActors) {
      if (!activeIds.has(id)) {
        this.world.remove(actor);
        this.trafficActors.delete(id);
      }
    }
  }

  draw(state, deltaSeconds) {
    if (!this.ready) return;
    const dt = Math.min(Math.max(deltaSeconds || 0, 0), 0.05);
    this.syncZones(state);
    this.syncTraffic(state);
    const sky = state.night ? 0x26334a : state.environment === 'harmattan' ? 0xb5b2a3 : 0x8ccde5;
    this.scene.background.set(sky);
    this.scene.fog.color.set(state.night ? 0x374256 : state.environment === 'harmattan' ? 0xb5b2a3 : 0x8ccde5);
    this.scene.fog.near = state.environment === 'harmattan' ? 18 : 48;
    this.scene.fog.far = state.environment === 'harmattan' ? 100 : 195;

    const laneX = state.steer * 3;
    this.player.position.x += (laneX - this.player.position.x) * Math.min(1, dt * 8);
    this.player.rotation.z = -state.steer * 0.075;
    this.player.position.y = Math.sin(state.distance * 2.2) * 0.025;

    const scroll = state.speed * dt * 0.48;
    for (const dash of this.laneDashes) {
      dash.position.z += scroll;
      if (dash.position.z > 8) dash.position.z -= 250;
    }

    const targetX = this.player.position.x * 0.45;
    const driverView = state.camera === 'driver';
    this.camera.position.x += ((driverView ? this.player.position.x * 0.25 : this.player.position.x * 0.45) - this.camera.position.x) * Math.min(1, dt * 2.2);
    this.camera.position.y = driverView ? 1.55 : 5.15;
    this.camera.position.z = driverView ? 4.25 : 11;
    this.camera.lookAt(targetX, driverView ? 1.15 : 0.9, -14);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (!this.renderer) return;
    this.ready = false;
    try { this.renderer.renderLists?.dispose?.(); } catch { /* renderer version fallback */ }
    this.renderer.dispose();
    try { this.renderer.forceContextLoss(); } catch { /* some browsers omit this API */ }
    this.scene.clear();
  }
}
