import * as THREE from 'three';

const VEHICLE_MODEL_KEY = {
  keke: 'keke', car: 'car', taxi: 'taxi', suv: 'suv', truck: 'truck',
  bus: 'bus', motorcycle: 'motorcycle', police: 'police', karota: 'karota',
};

/**
 * Release resources owned by a scene subtree. GLB clones share cached geometry
 * and textures, identified by userData.sharedGeometry on the clone root. Their
 * cloned materials are still unique and safe to dispose when an actor is removed.
 */
function disposeSceneTree(root, { disposeTextures = false } = {}) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  const visit = (object, inheritedSharedGeometry = false) => {
    const sharedGeometry = inheritedSharedGeometry || object.userData?.sharedGeometry === true;
    if (object.geometry && !sharedGeometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }

    const materialList = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    for (const material of materialList) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      if (disposeTextures && !sharedGeometry) {
        for (const value of Object.values(material)) {
          if (value?.isTexture && !textures.has(value)) {
            textures.add(value);
            value.dispose();
          }
        }
      }
      material.dispose();
    }
    for (const child of object.children || []) visit(child, sharedGeometry);
  };

  visit(root);
}

export class Renderer3D {
  constructor(canvas, models, { mobile = false } = {}) {
    this.canvas = canvas;
    this.models = models;
    this.mobile = mobile;
    this.ready = false;
    this.disposed = false;
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
    this.pedestrians = [];
    this.streetLights = [];
    this.roadProps = [];
    this.buildingSlots = [];
    this.flyoverFallback = null;
    this.flyoverModelAdded = false;
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

  loadOptionalTexture(url, material, repeat = [1, 1]) {
    try {
      const loader = new THREE.TextureLoader();
      loader.load(url, (texture) => {
        if (!this.ready || !this.scene) {
          texture.dispose();
          return;
        }
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat[0], repeat[1]);
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
      }, undefined, () => {
        // Textures are optional. The coloured asphalt material remains valid.
      });
    } catch {
      // A missing or unsupported texture must never block the road renderer.
    }
  }

  buildWorld() {
    const asphaltMaterial = this.material(0x343c43);
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(13, 250), asphaltMaterial);
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.z = -92;
    this.world.add(asphalt);
    this.loadOptionalTexture('/assets/environment/ground/asphalt.jpg', asphaltMaterial, [3, 64]);

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
      const buildingGroup = new THREE.Group();
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, 3),
        this.material(buildingColors[index % buildingColors.length]),
      );
      building.position.set(0, height / 2, 0);
      buildingGroup.add(building);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.15, 0.15, 3.15), this.material(0x9d5740));
      roof.position.set(0, height + 0.05, 0);
      buildingGroup.add(roof);
      this.addWindows(buildingGroup, width, height);
      buildingGroup.position.set(x, 0, z);
      this.world.add(buildingGroup);
      this.buildingSlots.push({ actor: buildingGroup, x, z, height, side, industrial: index % 6 === 3, replaced: false });
      if (index % 4 === 0) this.addBillboard(x - side * 1.5, 2.7, z + 1.75, index % 2 === 0);
    }

    const hemi = new THREE.HemisphereLight(0xeaf7ff, 0x75634d, 1.8);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffedca, 1.75);
    sun.position.set(-8, 14, 5);
    this.scene.add(sun);

    this.addBillboard(-8.7, 3.1, -45, false);
    this.addBillboard(8.7, 3.1, -78, true);
    this.buildFlyover();
    this.buildSidewalkLife();
    this.buildRoadsideProps();
  }

  addWindows(buildingGroup, width, height) {
    if (this.mobile) return;
    const count = Math.max(1, Math.floor(width / 0.8));
    for (let row = 0; row < Math.max(1, Math.floor(height / 1.2)); row += 1) {
      for (let col = 0; col < count; col += 1) {
        const windowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.24, 0.32),
          this.material(0x4f7180),
        );
        windowMesh.position.set(-width * 0.35 + col * 0.65, 0.6 + row * 0.9, 1.51);
        buildingGroup.add(windowMesh);
      }
    }
  }

  buildFlyover() {
    if (this.mobile) return;
    const group = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(20, 0.62, 3.4), this.material(0x888d91));
    deck.position.y = 4.25;
    group.add(deck);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(20, 0.24, 0.2), this.material(0xb7b9b7));
    rail.position.set(0, 4.68, -1.45);
    group.add(rail);
    for (const x of [-7.7, 7.7]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.2, 0.85), this.material(0x777e83));
      pillar.position.set(x, 2.1, 0);
      group.add(pillar);
    }
    group.position.set(0, 0, -116);
    group.userData.proceduralFlyover = true;
    this.world.add(group);
    this.flyoverFallback = group;
  }

  addBillboard(x, y, z, green) {
    const sign = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(3.3, 1.05, 0.12),
      this.material(green ? 0x168b71 : 0xf5c542),
    );
    sign.add(board);
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 640;
    signCanvas.height = 210;
    const signContext = signCanvas.getContext('2d');
    signContext.fillStyle = green ? '#126c56' : '#172638';
    signContext.fillRect(0, 0, signCanvas.width, signCanvas.height);
    signContext.fillStyle = green ? '#f7d85a' : '#f6d45d';
    signContext.font = '900 42px Arial, sans-serif';
    signContext.textAlign = 'center';
    signContext.fillText(green ? 'RUFFNECK LEARN' : 'RUFFNECK ENTERTAINMENT', 320, 78, 600);
    signContext.fillStyle = '#ffffff';
    signContext.font = '700 25px Arial, sans-serif';
    signContext.fillText(green ? 'ruffneck-lms.vercel.app' : 'ruffneck-entertainment.vercel.app', 320, 135, 600);
    signContext.fillStyle = '#b9d7e4';
    signContext.font = '600 18px Arial, sans-serif';
    signContext.fillText(green ? 'PRACTICAL AI & DIGITAL SKILLS' : 'KANO LIFE · MADE IN NIGERIA', 320, 176, 600);
    const texture = new THREE.CanvasTexture(signCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(3.12, 0.91),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    face.position.z = 0.066;
    sign.add(face);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.09), this.material(0x495260));
    post.position.y = -1.05;
    sign.add(post);
    sign.position.set(x, y, z);
    sign.rotation.y = x > 0 ? -0.18 : 0.18;
    this.world.add(sign);
  }


  buildSidewalkLife() {
    const count = this.mobile ? 6 : 14;
    const clothes = [0xf1e7ce, 0x2b8067, 0x99472e, 0x343d56, 0xdec15c, 0xb88fa8, 0x42749a];
    const skinTones = [0x8d5537, 0x6d402d, 0xa66a45, 0x5a3528];
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const variant = index % 5;
      const group = new THREE.Group();
      const skin = this.material(skinTones[index % skinTones.length]);
      const cloth = this.material(clothes[index % clothes.length]);
      const accent = this.material(clothes[(index + 3) % clothes.length]);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(variant === 1 ? 0.22 : 0.15, variant === 1 ? 0.30 : 0.23, 0.82, 8),
        cloth,
      );
      body.position.y = 0.80;
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skin);
      head.position.y = 1.39;
      group.add(head);
      if (variant === 1 || variant === 4) {
        const hijab = new THREE.Mesh(new THREE.SphereGeometry(0.215, 10, 8), accent);
        hijab.scale.set(1, 1.22, 0.92);
        hijab.position.set(0, 1.42, 0.015);
        group.add(hijab);
        const scarf = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.44, 8), accent);
        scarf.position.set(0, 1.18, 0.02);
        scarf.rotation.x = Math.PI;
        group.add(scarf);
      } else if (variant === 0) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.08, 10), accent);
        cap.position.y = 1.55;
        group.add(cap);
      }
      for (const armX of [-0.22, 0.22]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.56, 6), cloth);
        arm.position.set(armX, 0.90, 0);
        arm.rotation.z = armX < 0 ? -0.12 : 0.12;
        group.add(arm);
      }
      if (variant === 2 || variant === 3) {
        for (const legX of [-0.095, 0.095]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.40, 6), accent);
          leg.position.set(legX, 0.22, 0);
          group.add(leg);
        }
      }
      if (variant === 4) {
        const basket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.25), this.material(0x8b5934));
        basket.position.set(side * 0.25, 0.16, 0.08);
        group.add(basket);
      }
      group.scale.setScalar(index % 3 === 0 ? 0.94 : 0.82);
      const z = -5 - index * (this.mobile ? 27 : 15);
      group.position.set(side * (7.0 + (index % 3) * 0.45), 0, z);
      group.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.userData.fallbackPedestrian = true;
      this.world.add(group);
      this.pedestrians.push({ index, side, actor: group, usingModel: false });
    }

    if (!this.mobile) {
      for (let index = 0; index < 6; index += 1) {
        for (const side of [-1, 1]) {
          const pole = new THREE.Group();
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 4.1, 8), this.material(0x48505a));
          stem.position.y = 2.05;
          pole.add(stem);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), this.material(0x48505a));
          arm.position.set(-side * 0.22, 4.05, 0);
          pole.add(arm);
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.24), this.material(0xf3e2a1));
          lamp.position.set(-side * 0.48, 4.00, 0);
          pole.add(lamp);
          pole.position.set(side * 7.6, 0, -24 - index * 34);
          pole.userData.proceduralStreetLight = true;
          this.world.add(pole);
          this.streetLights.push(pole);
        }
      }
    }
  }

  buildRoadsideProps() {
    const types = ['marketStall', 'bench', 'busStop', 'trafficLight', 'stopSign'];
    const count = this.mobile ? 5 : 10;
    const colors = [0x168c70, 0xf0be42, 0xb54b36, 0x6e7f90, 0xd7c8a5];
    for (let index = 0; index < count; index += 1) {
      const key = types[index % types.length];
      const side = index % 2 === 0 ? -1 : 1;
      const x = side * (key === 'marketStall' || key === 'busStop' ? 7.05 : 7.2);
      const z = -35 - Math.floor(index / 2) * (this.mobile ? 75 : 44);
      const group = new THREE.Group();
      const postMaterial = this.material(0x554637);
      const accent = this.material(colors[index % colors.length]);

      if (key === 'bench') {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.12, 0.36), accent);
        seat.position.y = 0.42;
        group.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.46, 0.10), accent);
        back.position.set(0, 0.68, -0.14);
        group.add(back);
        for (const legX of [-0.48, 0.48]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.10), postMaterial);
          leg.position.set(legX, 0.20, 0);
          group.add(leg);
        }
      } else if (key === 'marketStall') {
        for (const postX of [-0.80, 0.80]) {
          for (const postZ of [-0.48, 0.48]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.075, 1.75, 0.075), postMaterial);
            post.position.set(postX, 0.88, postZ);
            group.add(post);
          }
        }
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.13, 1.2), accent);
        canopy.position.y = 1.83;
        group.add(canopy);
        const counter = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.16, 0.52), this.material(0xb88a59));
        counter.position.set(0, 0.83, 0.28);
        group.add(counter);
        const crates = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.25, 0.30), this.material(0x7a512f));
        crates.position.set(-0.45, 0.55, -0.05);
        group.add(crates);
      } else if (key === 'busStop') {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 1.3), accent);
        roof.position.y = 2.42;
        group.add(roof);
        for (const postX of [-0.86, 0.86]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.10, 2.35, 0.10), postMaterial);
          post.position.set(postX, 1.18, 0);
          group.add(post);
        }
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.10, 0.35), this.material(0x9b7048));
        bench.position.set(0, 0.52, -0.20);
        group.add(bench);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.32, 0.08), this.material(0x172a3a));
        sign.position.set(0, 1.98, 0.05);
        group.add(sign);
      } else if (key === 'trafficLight') {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.3, 8), postMaterial);
        stem.position.y = 1.65;
        group.add(stem);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.12, 0.35), this.material(0x242d35));
        head.position.set(0, 2.65, 0.02);
        group.add(head);
        for (const [lightY, color] of [[3.00, 0xdf4a3d], [2.66, 0xf2bd3c], [2.31, 0x39bf75]]) {
          const light = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), this.material(color));
          light.position.set(0, lightY, 0.21);
          group.add(light);
        }
      } else {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.85, 7), postMaterial);
        post.position.y = 0.92;
        group.add(post);
        const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.09, 8), this.material(0xc94a3b));
        sign.rotation.x = Math.PI / 2;
        sign.position.set(0, 1.65, 0.02);
        group.add(sign);
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.26, 8), this.material(0xf4e6cf));
        face.position.set(0, 1.65, 0.075);
        group.add(face);
      }

      group.position.set(x, 0, z);
      group.rotation.y = side < 0 ? 0.10 : -0.10;
      group.userData.proceduralRoadProp = true;
      this.world.add(group);
      this.roadProps.push({ key, actor: group, replaced: false, targetHeight: ({ bench: 0.72, busStop: 3, trafficLight: 3.8, stopSign: 2.1, marketStall: 2.45 })[key] });
    }
  }

  upgradeWorldAssets() {
    if (!this.models || this.mobile) return;

    for (const slot of this.buildingSlots) {
      if (slot.replaced) continue;
      const key = slot.industrial ? 'industrialBuilding' : 'building';
      if (!this.models.cache.has(key)) continue;
      const model = this.models.getInstance(key);
      if (!model) continue;
      const normalizedHeight = model.userData.targetHeight || (slot.industrial ? 5.2 : 4.5);
      model.scale.multiplyScalar(slot.height / normalizedHeight);
      model.position.set(slot.x, 0, slot.z);
      model.rotation.y = slot.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.world.remove(slot.actor);
      disposeSceneTree(slot.actor);
      this.world.add(model);
      slot.actor = model;
      slot.replaced = true;
    }

    if (this.flyoverFallback && !this.flyoverModelAdded && this.models.cache.has('flyover')) {
      const model = this.models.getInstance('flyover');
      if (model) {
        model.position.copy(this.flyoverFallback.position);
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        if (size.x > 0 && size.x < 15) model.scale.x *= 15 / size.x;
        this.world.remove(this.flyoverFallback);
        disposeSceneTree(this.flyoverFallback);
        this.world.add(model);
        this.flyoverFallback = null;
        this.flyoverModelAdded = true;
      }
    }

    if (this.models.cache.has('roadlight')) {
      for (let index = 0; index < this.streetLights.length; index += 1) {
        const old = this.streetLights[index];
        if (!old.userData.proceduralStreetLight) continue;
        const model = this.models.getInstance('roadlight');
        if (!model) continue;
        model.position.copy(old.position);
        model.scale.multiplyScalar(4.1 / (model.userData.targetHeight || 4.2));
        this.world.remove(old);
        disposeSceneTree(old);
        this.world.add(model);
        this.streetLights[index] = model;
      }
    }

    for (const slot of this.roadProps) {
      if (slot.replaced || !this.models.cache.has(slot.key)) continue;
      const model = this.models.getInstance(slot.key);
      if (!model) continue;
      const normalizedHeight = model.userData.targetHeight || slot.targetHeight;
      model.scale.multiplyScalar(slot.targetHeight / normalizedHeight);
      model.position.copy(slot.actor.position);
      model.rotation.copy(slot.actor.rotation);
      model.userData.roadPropKey = slot.key;
      this.world.remove(slot.actor);
      disposeSceneTree(slot.actor);
      this.world.add(model);
      slot.actor = model;
      slot.replaced = true;
    }
  }

  upgradePedestrians() {
    if (!this.models || !this.pedestrians.length) return;
    const modelKey = this.models.cache.has('pedestrian') ? 'pedestrian'
      : this.models.cache.has('passenger') ? 'passenger' : null;
    if (!modelKey) return;
    for (const pedestrian of this.pedestrians) {
      if (pedestrian.usingModel || pedestrian.index % 3 !== 0) continue;
      const model = this.models.getInstance(modelKey);
      if (!model) continue;
      model.position.copy(pedestrian.actor.position);
      model.rotation.y = pedestrian.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      model.userData.fallback = false;
      model.userData.characterType = 'pedestrian';
      this.world.remove(pedestrian.actor);
      disposeSceneTree(pedestrian.actor);
      this.world.add(model);
      pedestrian.actor = model;
      pedestrian.usingModel = true;
    }
  }

  makeKeke() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.65, 1.85), this.material(0xf5c542));
    body.userData.paintable = true;
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
    // Adaidaita Sahu geometry: one steerable front wheel and two rear wheels.
    const wheelSpots = [[0, -0.73], [-0.56, 0.62], [0.56, 0.62]];
    for (const [x, z] of wheelSpots) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.15, 12),
        this.material(0x121820),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.28, z);
      group.add(wheel);
    }
    const frontFork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.62, 8), this.material(0x7a8794));
    frontFork.position.set(0, 0.61, -0.71);
    frontFork.rotation.x = -0.22;
    group.add(frontFork);
    const headlamp = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 8), this.material(0xffedb5));
    headlamp.position.set(0, 0.91, -0.96);
    group.add(headlamp);
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
    disposeSceneTree(old);
    this.scene.add(object);
    this.player = object;
    this.lastPaint = null;
    return true;
  }

  applyPlayerPaint(paint) {
    const color = typeof paint === 'string' && /^#[0-9a-f]{6}$/i.test(paint) ? paint : '#f5c542';
    if (!this.player || this.lastPaint === color) return;

    const paintable = [];
    const namedPaintPart = /body|paint|shell|chassis|outer|cover|hood|fender|side.?panel|cowl/i;
    this.player.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      const identity = `${object.name || ''} ${materialList.map((material) => material?.name || '').join(' ')}`;
      if (object.userData.paintable || namedPaintPart.test(identity)) paintable.push(object);
    });

    // Many GLB packs merge the painted shell into one unnamed mesh. In that
    // case tint only the largest plausible non-glass/non-wheel mesh, never all
    // vehicle materials at once.
    if (!paintable.length && !this.player.userData.fallback) {
      let largest = null;
      let largestVolume = 0;
      this.player.traverse((object) => {
        if (!object.isMesh || !object.geometry) return;
        const identity = `${object.name || ''} ${(Array.isArray(object.material) ? object.material : [object.material]).map((material) => material?.name || '').join(' ')}`;
        if (/wheel|tire|tyre|glass|window|lamp|light|rubber/i.test(identity)) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        if (!box) return;
        const size = box.getSize(new THREE.Vector3());
        const volume = size.x * size.y * size.z;
        if (Number.isFinite(volume) && volume > largestVolume) {
          largest = object;
          largestVolume = volume;
        }
      });
      if (largest) paintable.push(largest);
    }

    for (const object of paintable) {
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materialList) {
        if (material?.color) {
          material.color.set(color);
          material.needsUpdate = true;
        }
      }
    }
    this.lastPaint = color;
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
        actor.userData.propKey = zone.prop || null;
        actor.userData.propAdded = false;
        this.world.add(actor);
        this.zoneActors.set(zone.id, actor);
      }
      actor.userData.propKey = zone.prop || actor.userData.propKey || null;
      if (actor.userData.propKey && !actor.userData.propAdded && this.models?.cache.has(actor.userData.propKey)) {
        const prop = this.models.getInstance(actor.userData.propKey);
        if (prop) {
          prop.scale.multiplyScalar(actor.userData.propKey === 'cone' ? 0.7 : 0.42);
          prop.position.set(actor.userData.propKey === 'cone' ? 0.82 : -0.82, 0.03, -0.15);
          actor.add(prop);
          actor.userData.propAdded = true;
        }
      }
      actor.position.set((zone.lane - 1) * 3, 0.035, -Math.max(-0.05, zone.depth) * 88);
    }
    for (const [id, actor] of this.zoneActors) {
      if (!activeIds.has(id)) {
        this.world.remove(actor);
        disposeSceneTree(actor);
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
          disposeSceneTree(actor);
          this.world.add(model);
          this.trafficActors.set(vehicle.id, model);
          actor = model;
        }
      }
      actor.position.set((vehicle.lane - 1) * 3, 0, -Math.max(-0.05, vehicle.depth) * 88);
      actor.rotation.y = vehicle.direction === -1
        ? (actor.userData.fallback ? Math.PI : 0)
        : (actor.userData.fallback ? 0 : Math.PI);
    }
    for (const [id, actor] of this.trafficActors) {
      if (!activeIds.has(id)) {
        this.world.remove(actor);
        disposeSceneTree(actor);
        this.trafficActors.delete(id);
      }
    }
  }

  draw(state, deltaSeconds) {
    if (!this.ready) return;
    const dt = Math.min(Math.max(deltaSeconds || 0, 0), 0.05);
    this.syncZones(state);
    this.syncTraffic(state);
    this.upgradeWorldAssets();
    this.upgradePedestrians();
    const sky = state.night ? 0x26334a : state.environment === 'harmattan' ? 0xb5b2a3 : 0x8ccde5;
    this.scene.background.set(sky);
    this.scene.fog.color.set(state.night ? 0x374256 : state.environment === 'harmattan' ? 0xb5b2a3 : 0x8ccde5);
    this.scene.fog.near = state.environment === 'harmattan' ? 18 : 48;
    this.scene.fog.far = state.environment === 'harmattan' ? 100 : 195;

    const laneX = state.steer * 3;
    this.player.position.x += (laneX - this.player.position.x) * Math.min(1, dt * 8);
    this.player.rotation.z = -state.steer * 0.075;
    this.player.position.y = Math.sin(state.distance * 2.2) * 0.025;
    this.applyPlayerPaint(state.paint);

    const scroll = state.speed * dt * 0.48;
    for (const pedestrian of this.pedestrians) {
      pedestrian.actor.position.z += scroll * 0.72;
      if (pedestrian.actor.position.z > 6) pedestrian.actor.position.z -= 200;
    }
    for (const pole of this.streetLights) {
      pole.position.z += scroll;
      if (pole.position.z > 9) pole.position.z -= 245;
    }
    for (const slot of this.roadProps) {
      slot.actor.position.z += scroll * 0.88;
      if (slot.actor.position.z > 9) slot.actor.position.z -= 245;
    }
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
    if (!this.renderer || this.disposed) return;
    this.disposed = true;
    this.ready = false;
    // First release clone-owned materials and procedural scene resources; then
    // release the cache-owned GLB geometries and textures exactly once.
    disposeSceneTree(this.scene, { disposeTextures: true });
    this.models?.dispose?.();
    try { this.renderer.renderLists?.dispose?.(); } catch { /* renderer version fallback */ }
    this.renderer.dispose();
    try { this.renderer.forceContextLoss(); } catch { /* some browsers omit this API */ }
    this.scene.clear();
  }
}
