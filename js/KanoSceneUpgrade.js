import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (items, index) => items[index % items.length];

const SHOP_LABELS = [
  'MAI SHAI',
  'MAI INDOME',
  'PURE WATER',
  'KANO PROVISIONS',
  'GRAINS & SPICES',
  'AKARA & PAP',
  'KEKE PARTS',
  'COLD DRINKS',
];

const CLOTHING = [
  0x33634d, 0x294f6c, 0x8c5938, 0x8b7635,
  0x6a3f59, 0x48565d, 0x875044, 0xb2a078,
];
const SKIN = [0x5b3525, 0x70432d, 0x86563a, 0x9a6747];

/**
 * KanoSceneUpgrade
 *
 * Additive visual upgrade for the existing Renderer3D/Game pair.
 * It adds an instanced market street, a low-draw-call animated crowd,
 * procedural walking boarding/alighting actors, and animated action rigs
 * to the existing morning-life dioramas. It does not create a second road,
 * traffic simulator, economy, or collision system.
 */
export class KanoSceneUpgrade {
  constructor({ renderer, game, mobile = false } = {}) {
    if (!renderer?.scene?.isScene || !renderer?.world?.isObject3D) {
      throw new TypeError('KanoSceneUpgrade requires an active Renderer3D instance.');
    }
    if (!game?.s) {
      throw new TypeError('KanoSceneUpgrade requires an initialized Game instance.');
    }

    this.renderer = renderer;
    this.game = game;
    this.mobile = Boolean(mobile);
    this.disposed = false;
    this.elapsed = 0;
    this.loopLength = clamp(Number(renderer.buildingLoopDistance) || (mobile ? 155 : 231), 130, 255);
    this.walkers = [];
    this.walkingPassengers = [];
    this.lifeRigs = [];
    this.ownedMeshes = [];
    this.ownedGroups = [];
    this.originalMethods = [];
    this.dummy = new THREE.Object3D();
    this.tempColor = new THREE.Color();
    this.inverseMatrix = new THREE.Matrix4();
    this.localBox = new THREE.Box3();
    this.localSize = new THREE.Vector3();
    this.localCenter = new THREE.Vector3();
    this.driverPlayer = null;
    this.seatedDriverRoots = new Set();
    this.lastSceneName = '';

    this.buildMarketStreet();
    this.buildAmbientCrowd();
    this.buildMorningActivityRigs();
    this.patchPassengerInteractions();
    this.ensureSeatedDriver(true);
  }

  ownMaterial(material) {
    this.ownedMaterials ||= new Set();
    this.ownedMaterials.add(material);
    return material;
  }

  ownGeometry(geometry) {
    this.ownedGeometries ||= new Set();
    this.ownedGeometries.add(geometry);
    return geometry;
  }

  addInstanced(parent, geometry, material, count, name) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    this.ownedMeshes.push(mesh);
    return mesh;
  }

  // ----------------------------------------------------------
  // DENSE MARKET STREET — INSTANCED SHOPFRONTS, AWNINGS, CRATES
  // ----------------------------------------------------------

  buildMarketStreet() {
    const root = new THREE.Group();
    root.name = 'KANO_DENSE_MARKET_STREET';
    root.userData.kanoSceneUpgradeOwned = true;
    this.renderer.world.add(root);
    this.marketRoot = root;
    this.ownedGroups.push(root);

    const perSide = this.mobile ? 10 : 18;
    const slots = [];
    for (const side of [-1, 1]) {
      for (let index = 0; index < perSide; index += 1) {
        const spacing = this.loopLength / perSide;
        const z = -9 - index * spacing;
        slots.push({
          side,
          index: slots.length,
          laneZ: z,
          x: side * (8.0 + ((index + (side > 0 ? 1 : 0)) % 3) * 0.42),
          z,
          yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          bodyColor: pick([0xc6a77d, 0xb89970, 0xd1b88b, 0x9a8b71], slots.length),
          awningColor: pick([0x9d3b31, 0x225d49, 0xd1a54d, 0x375b76], slots.length + 2),
          signTile: slots.length % SHOP_LABELS.length,
          products: [
            { x: -0.38, z: 0.45, color: pick([0xb86d32, 0x9a3c31, 0x4e894e, 0xd6b752], slots.length) },
            { x: 0.00, z: 0.43, color: pick([0xc58b3d, 0xb8b8ae, 0x6a8a4b, 0xd2a15e], slots.length + 3) },
            { x: 0.38, z: 0.45, color: pick([0x9f5934, 0xd7c38c, 0x567a8b, 0x8a3f3c], slots.length + 5) },
          ],
        });
      }
    }
    this.shopSlots = slots;

    const bodyGeo = this.ownGeometry(new THREE.BoxGeometry(2.55, 2.45, 1.35));
    const awningGeo = this.ownGeometry(new THREE.BoxGeometry(2.92, 0.18, 1.65));
    const counterGeo = this.ownGeometry(new THREE.BoxGeometry(2.10, 0.66, 0.60));
    const crateGeo = this.ownGeometry(new THREE.BoxGeometry(0.34, 0.31, 0.32));

    const bodyMat = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }));
    const awningMat = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 }));
    const counterMat = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0x77543a, roughness: 0.95 }));
    const crateMat = this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 }));

    this.shopBodies = this.addInstanced(root, bodyGeo, bodyMat, slots.length, 'KANO_MARKET_SHOPFRONTS');
    this.shopAwnings = this.addInstanced(root, awningGeo, awningMat, slots.length, 'KANO_MARKET_AWNINGS');
    this.shopCounters = this.addInstanced(root, counterGeo, counterMat, slots.length, 'KANO_MARKET_COUNTERS');
    this.shopCrates = this.addInstanced(root, crateGeo, crateMat, slots.length * 3, 'KANO_MARKET_PRODUCE_CRATES');

    slots.forEach((slot, index) => {
      this.shopBodies.setColorAt(index, this.tempColor.setHex(slot.bodyColor));
      this.shopAwnings.setColorAt(index, this.tempColor.setHex(slot.awningColor));
      this.shopCounters.setColorAt(index, this.tempColor.setHex(0x77543a));
      slot.products.forEach((product, productIndex) => {
        this.shopCrates.setColorAt(index * 3 + productIndex, this.tempColor.setHex(product.color));
      });
    });

    this.shopBodies.instanceColor.needsUpdate = true;
    this.shopAwnings.instanceColor.needsUpdate = true;
    this.shopCounters.instanceColor.needsUpdate = true;
    this.shopCrates.instanceColor.needsUpdate = true;

    this.buildSignAtlas();
    this.updateMarketMatrices();
  }

  buildSignAtlas() {
    const columns = 4;
    const rows = 2;
    const cellWidth = 256;
    const cellHeight = 128;
    const canvas = document.createElement('canvas');
    canvas.width = columns * cellWidth;
    canvas.height = rows * cellHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    SHOP_LABELS.forEach((label, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = col * cellWidth;
      const y = row * cellHeight;
      const palette = [
        ['#173c2d', '#f5d47b'], ['#7b2f27', '#fff1d3'],
        ['#173c2d', '#f5d47b'], ['#4e5f42', '#fff0c2'],
        ['#7e522f', '#fff2ce'], ['#8a3e2c', '#ffe4a2'],
        ['#254f66', '#fff1d3'], ['#7d6a36', '#fff3d0'],
      ][index];

      ctx.fillStyle = '#4a3526';
      ctx.fillRect(x, y, cellWidth, cellHeight);
      ctx.fillStyle = palette[0];
      ctx.fillRect(x + 5, y + 5, cellWidth - 10, cellHeight - 10);
      ctx.strokeStyle = palette[1];
      ctx.lineWidth = 5;
      ctx.strokeRect(x + 8, y + 8, cellWidth - 16, cellHeight - 16);
      ctx.fillStyle = palette[1];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${label.length > 13 ? 23 : label.length > 9 ? 27 : 32}px system-ui, sans-serif`;
      ctx.fillText(label, x + cellWidth / 2, y + cellHeight / 2, cellWidth - 22);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 1;
    this.signTexture = texture;
    this.ownedTextures ||= new Set();
    this.ownedTextures.add(texture);
    this.signMaterial = this.ownMaterial(new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));

    const base = new THREE.PlaneGeometry(2.18, 0.52);
    const uv = base.attributes.uv;
    this.signMeshes = [];

    for (let tile = 0; tile < SHOP_LABELS.length; tile += 1) {
      const geometry = base.clone();
      const signUV = geometry.attributes.uv;
      const col = tile % columns;
      const row = Math.floor(tile / columns);
      const u0 = col / columns;
      const v0 = 1 - (row + 1) / rows;
      for (let i = 0; i < signUV.count; i += 1) {
        signUV.setXY(i, u0 + uv.getX(i) / columns, v0 + uv.getY(i) / rows);
      }
      signUV.needsUpdate = true;
      geometry.computeBoundingSphere();
      this.ownGeometry(geometry);

      const labelSlots = this.shopSlots.filter((slot) => slot.signTile === tile);
      if (!labelSlots.length) continue;
      const mesh = this.addInstanced(this.marketRoot, geometry, this.signMaterial, labelSlots.length, `KANO_SHOP_SIGN_${tile}`);
      this.signMeshes.push({ mesh, slots: labelSlots });
    }
    this.ownGeometry(base);
  }

  writeMatrix(mesh, index, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, rotationX = 0, rotationZ = 0) {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(rotationX, yaw, rotationZ);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  updateMarketMatrices() {
    if (!this.shopSlots || this.disposed) return;

    this.shopSlots.forEach((slot, index) => {
      const x = slot.x;
      const z = slot.z;
      const yaw = slot.yaw;

      this.writeMatrix(this.shopBodies, index, x, 1.23, z, yaw);
      this.writeMatrix(this.shopAwnings, index, x, 2.50, z + 0.20, yaw);
      this.writeMatrix(this.shopCounters, index, x - slot.side * 0.62, 0.44, z + 0.26, yaw);

      slot.products.forEach((product, productIndex) => {
        const productX = x - slot.side * 0.61 + product.x;
        this.writeMatrix(
          this.shopCrates,
          index * 3 + productIndex,
          productX, 0.94, z + 0.28 + product.z * 0.18,
          0, 0.72, 0.72, 0.72,
        );
      });
    });

    for (const { mesh, slots } of this.signMeshes || []) {
      slots.forEach((slot, index) => {
        // Signs face the approaching driver so the local market feels readable.
        this.writeMatrix(
          mesh,
          index,
          slot.x - slot.side * 0.82, 2.15, slot.z + 0.18,
          0,
        );
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    for (const mesh of [this.shopBodies, this.shopAwnings, this.shopCounters, this.shopCrates]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ----------------------------------------------------------
  // AMBIENT PEDESTRIAN CROWD — FOUR INSTANCED DRAW CALLS
  // ----------------------------------------------------------

  buildAmbientCrowd() {
    const root = new THREE.Group();
    root.name = 'KANO_ANIMATED_MARKET_CROWD';
    root.userData.kanoSceneUpgradeOwned = true;
    this.marketRoot.add(root);
    this.crowdRoot = root;

    const count = this.mobile ? 24 : 44;
    this.walkers = Array.from({ length: count }, (_, index) => ({
      index,
      side: index % 2 ? 1 : -1,
      x: (index % 2 ? 1 : -1) * rand(6.85, 7.85),
      baseX: 0,
      z: rand(-this.loopLength, -6),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.22, 0.62),
      direction: Math.random() > 0.5 ? 1 : -1,
      sway: rand(0.035, 0.11),
      clothing: CLOTHING[index % CLOTHING.length],
      skin: SKIN[index % SKIN.length],
      height: rand(0.90, 1.08),
    }));
    for (const walker of this.walkers) walker.baseX = walker.x;

    this.crowdMaterials = {
      torso: this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })),
      head: this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })),
      limb: this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })),
    };

    const torsoGeo = this.ownGeometry(new THREE.CapsuleGeometry(0.16, 0.48, 2, 5));
    const headGeo = this.ownGeometry(new THREE.SphereGeometry(0.145, 8, 6));
    const armGeo = this.ownGeometry(new THREE.CylinderGeometry(0.045, 0.055, 0.47, 5));
    const legGeo = this.ownGeometry(new THREE.CylinderGeometry(0.055, 0.065, 0.49, 5));

    this.crowdTorso = this.addInstanced(root, torsoGeo, this.crowdMaterials.torso, count, 'KANO_CROWD_TORSOS');
    this.crowdHead = this.addInstanced(root, headGeo, this.crowdMaterials.head, count, 'KANO_CROWD_HEADS');
    this.crowdArms = this.addInstanced(root, armGeo, this.crowdMaterials.limb, count * 2, 'KANO_CROWD_ARMS');
    this.crowdLegs = this.addInstanced(root, legGeo, this.crowdMaterials.limb, count * 2, 'KANO_CROWD_LEGS');

    this.walkers.forEach((walker, index) => {
      this.crowdTorso.setColorAt(index, this.tempColor.setHex(walker.clothing));
      this.crowdHead.setColorAt(index, this.tempColor.setHex(walker.skin));
      for (let part = 0; part < 2; part += 1) {
        this.crowdArms.setColorAt(index * 2 + part, this.tempColor.setHex(walker.clothing));
        this.crowdLegs.setColorAt(index * 2 + part, this.tempColor.setHex(0x35302a));
      }
    });

    for (const mesh of [this.crowdTorso, this.crowdHead, this.crowdArms, this.crowdLegs]) {
      mesh.instanceColor.needsUpdate = true;
    }

    this.updateCrowdMatrices();
  }

  updateCrowdMatrices() {
    if (!this.walkers.length || this.disposed) return;

    this.walkers.forEach((walker, index) => {
      const step = Math.sin(this.elapsed * 6.8 * walker.speed + walker.phase) * 0.30;
      const stride = Math.cos(this.elapsed * 6.8 * walker.speed + walker.phase) * 0.22;
      const bob = Math.abs(step) * 0.035;
      const height = walker.height;
      const x = walker.x + Math.sin(this.elapsed * 1.1 + walker.phase) * walker.sway;
      const z = walker.z;

      this.writeMatrix(this.crowdTorso, index, x, 0.98 * height + bob, z, 0, 1, height, 0.90);
      this.writeMatrix(this.crowdHead, index, x, 1.58 * height + bob, z, 0, 1, 1, 0.92);

      for (const side of [-1, 1]) {
        const partIndex = index * 2 + (side > 0 ? 1 : 0);
        const armRot = side * (0.10 + step * 0.45);
        this.writeMatrix(
          this.crowdArms,
          partIndex,
          x + side * 0.22, 1.02 * height + bob, z,
          0,
        );
        this.dummy.rotation.set(0, 0, armRot);
        this.dummy.updateMatrix();
        this.crowdArms.setMatrixAt(partIndex, this.dummy.matrix);

        const legRot = stride * side;
        this.writeMatrix(
          this.crowdLegs,
          partIndex,
          x + side * 0.09, 0.44 * height, z,
          0,
        );
        this.dummy.rotation.set(legRot, 0, 0);
        this.dummy.updateMatrix();
        this.crowdLegs.setMatrixAt(partIndex, this.dummy.matrix);
      }
    });

    for (const mesh of [this.crowdTorso, this.crowdHead, this.crowdArms, this.crowdLegs]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ----------------------------------------------------------
  // LIFE SCENES — PROCEDURAL ACTIVITY RIGS
  // ----------------------------------------------------------

  makeLifeRig(parent, { scene, x, z, action, outfit = 0x37634a, scale = 1, phase = 0 } = {}) {
    if (!parent) return null;
    const root = new THREE.Group();
    root.name = `KANO_LIFE_ACTIVITY_${scene}_${action}`;
    root.position.set(x, 0, z);
    root.scale.setScalar(scale);
    root.userData.kanoLifeActor = true;
    parent.add(root);
    this.ownedGroups.push(root);

    const mat = (color, roughness = 0.92) => this.ownMaterial(new THREE.MeshStandardMaterial({ color, roughness }));
    const torso = new THREE.Mesh(this.ownGeometry(new THREE.CapsuleGeometry(0.16, 0.46, 2, 6)), mat(outfit));
    torso.position.y = 1.04;
    root.add(torso);

    const head = new THREE.Mesh(this.ownGeometry(new THREE.SphereGeometry(0.145, 10, 8)), mat(0x70472f));
    head.position.set(0, 1.53, -0.015);
    root.add(head);

    const cap = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.145, 0.165, 0.07, 10)), mat(0x234333));
    cap.position.set(0, 1.68, -0.015);
    root.add(cap);

    const armPivots = [];
    const legPivots = [];
    for (const side of [-1, 1]) {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.20, 1.28, 0.01);
      root.add(armPivot);
      const arm = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.045, 0.055, 0.48, 6)), mat(outfit));
      arm.position.y = -0.23;
      arm.rotation.z = side * -0.12;
      armPivot.add(arm);
      const hand = new THREE.Mesh(this.ownGeometry(new THREE.SphereGeometry(0.055, 7, 6)), mat(0x70472f));
      hand.position.set(side * 0.015, -0.47, 0.02);
      armPivot.add(hand);
      armPivots.push({ side, pivot: armPivot, hand });

      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.095, 0.60, 0);
      root.add(legPivot);
      const leg = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 6)), mat(0x292f32));
      leg.position.y = -0.25;
      legPivot.add(leg);
      const foot = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.12, 0.07, 0.20)), mat(0x1e2324));
      foot.position.set(0, -0.53, -0.035);
      legPivot.add(foot);
      legPivots.push({ side, pivot: legPivot });
    }

    let prop = null;
    if (action === 'drawWater') {
      prop = new THREE.Group();
      const bucket = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.16, 0.12, 0.25, 8)), mat(0x8c9a9a));
      bucket.position.y = -0.53;
      prop.add(bucket);
      const handle = new THREE.Mesh(this.ownGeometry(new THREE.TorusGeometry(0.12, 0.018, 5, 12, Math.PI)), mat(0x515e61));
      handle.rotation.z = Math.PI;
      handle.position.y = -0.39;
      prop.add(handle);
      armPivots[1].pivot.add(prop);
    } else if (action === 'sweep') {
      prop = new THREE.Group();
      const stick = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.018, 0.024, 1.05, 5)), mat(0x875c35));
      stick.position.y = -0.42;
      stick.rotation.z = 0.12;
      prop.add(stick);
      const bristles = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.065, 0.095, 0.18, 6)), mat(0xc2a16c));
      bristles.position.y = -0.93;
      prop.add(bristles);
      armPivots[0].pivot.add(prop);
    } else if (action === 'sellFood') {
      prop = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.12, 0.08, 0.45, 6)), mat(0x6a5035));
      prop.position.set(0, -0.42, -0.02);
      armPivots[0].pivot.add(prop);
    } else if (action === 'clean') {
      prop = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.18, 0.10, 0.04)), mat(0xe9d9b5));
      prop.position.set(0.02, -0.47, 0.03);
      armPivots[1].pivot.add(prop);
    }

    const rig = { root, torso, head, cap, armPivots, legPivots, scene, action, phase, prop, baseX: x, baseZ: z };
    this.lifeRigs.push(rig);
    return rig;
  }

  buildMorningActivityRigs() {
    const groups = this.renderer.lifeSceneGroups;
    if (groups instanceof Map) {
      this.makeLifeRig(groups.get('bedroom'), { scene: 'bedroom', x: 4.0, z: 1.4, action: 'wake', outfit: 0x6b8758, phase: 0.4 });
      this.makeLifeRig(groups.get('household'), { scene: 'household', x: 5.3, z: 2.0, action: 'drawWater', outfit: 0x315a78, phase: 0.8 });
      this.makeLifeRig(groups.get('household'), { scene: 'household', x: -5.0, z: 1.9, action: 'sweep', outfit: 0x855a39, phase: 1.5, scale: 0.93 });
      this.makeLifeRig(groups.get('street'), { scene: 'street', x: -3.6, z: 2.1, action: 'sellFood', outfit: 0x8e4735, phase: 0.2 });
      this.makeLifeRig(groups.get('street'), { scene: 'street', x: 4.0, z: 2.8, action: 'walk', outfit: 0x3d6380, phase: 1.4 });
      this.makeLifeRig(groups.get('breakfast'), { scene: 'breakfast', x: 3.0, z: -2.25, action: 'sellFood', outfit: 0x8d4934, phase: 0.3 });
      this.makeLifeRig(groups.get('breakfast'), { scene: 'breakfast', x: -3.0, z: -0.6, action: 'walk', outfit: 0x315d45, phase: 1.7, scale: 0.96 });
      this.makeLifeRig(groups.get('walk'), { scene: 'walk', x: -1.8, z: 2.8, action: 'walk', outfit: 0x3c6384, phase: 0.2 });
      this.makeLifeRig(groups.get('walk'), { scene: 'walk', x: 3.0, z: 2.1, action: 'walk', outfit: 0x8b583b, phase: 1.6, scale: 0.94 });
      this.makeLifeRig(groups.get('school'), { scene: 'school', x: -4.4, z: 2.6, action: 'walk', outfit: 0x345b85, phase: 0.8, scale: 0.78 });
      this.makeLifeRig(groups.get('school'), { scene: 'school', x: 4.3, z: 2.3, action: 'walk', outfit: 0x8e6c3d, phase: 2.0, scale: 0.83 });
    }

    if (this.renderer.garageGroup) {
      this.makeLifeRig(this.renderer.garageGroup, {
        scene: 'garage', x: -1.5, z: 1.6, action: 'clean', outfit: 0x315c46, phase: 0.6, scale: 0.92,
      });
    }
  }

  // ----------------------------------------------------------
  // SEATED DRIVER PLACEMENT
  // Ensure a driver-rig exists as a child of the vehicle and calibrate it
  // against the loaded vehicle bounds. This never creates a world-space
  // pedestrian beside the player keke.
  // ----------------------------------------------------------

  ensureSeatedDriver(force = false) {
    const player = this.renderer?.player;
    if (!player?.isObject3D || this.disposed) return;
    if (!force && this.driverPlayer === player && player.userData.kanoDriverCalibrated) return;

    // The procedural fallback already contains its own correctly seated driver.
    // Reuse that rig rather than creating a second person on top of the first.
    let driverRoot = player.getObjectByName('KANO_KEKE_SEATED_DRIVER');
    let driverPivot = player.getObjectByName('KANO_KEKE_DRIVER_PIVOT');

    if (player.userData?.fallback && driverPivot) {
      if (!player.userData.driverAnimationParts) {
        const arms = [];
        for (const side of [-1, 1]) {
          const shoulder = player.getObjectByName(side < 0 ? 'KANO_KEKE_DRIVER_SHOULDER_LEFT' : 'KANO_KEKE_DRIVER_SHOULDER_RIGHT');
          const forearm = player.getObjectByName(side < 0 ? 'KANO_KEKE_DRIVER_FOREARM_LEFT' : 'KANO_KEKE_DRIVER_FOREARM_RIGHT');
          if (shoulder && forearm) arms.push({ shoulder, forearm });
        }
        player.userData.driverAnimationParts = { driverPivot, arms, wheels: [] };
      }
      player.userData.kanoDriverCalibrated = true;
      this.driverPlayer = player;
      return;
    }

    if (!driverPivot) {
      // A GLB that contains a mesh called "driver" may only mean a door or
      // panel; only the explicit seated rig names count as a seated person.
      const rig = this.createSeatedDriverRig();
      driverRoot = rig.root;
      driverPivot = rig.pivot;
      player.add(driverRoot);
      this.seatedDriverRoots.add(driverRoot);
      player.userData.driverAnimationParts = {
        driverPivot,
        arms: rig.arms,
        wheels: [],
      };
      player.userData.hasSeatedDriver = true;
    } else if (!driverRoot) {
      // Renderer3D.makeKeke() exposes the pivot directly under the root.
      // Do not scale or move the whole vehicle as if it were a driver group.
      driverRoot = driverPivot.parent !== player ? driverPivot.parent : null;
      if (!player.userData.driverAnimationParts) {
        const arms = [];
        for (const side of [-1, 1]) {
          const shoulder = player.getObjectByName(side < 0 ? 'KANO_KEKE_DRIVER_SHOULDER_LEFT' : 'KANO_KEKE_DRIVER_SHOULDER_RIGHT');
          const forearm = player.getObjectByName(side < 0 ? 'KANO_KEKE_DRIVER_FOREARM_LEFT' : 'KANO_KEKE_DRIVER_FOREARM_RIGHT');
          if (shoulder && forearm) arms.push({ shoulder, forearm });
        }
        player.userData.driverAnimationParts = { driverPivot, arms, wheels: [] };
      }
    }

    player.updateMatrixWorld(true);
    // Find the vehicle shell, not an external/world-space person actor.
    let shell = null;
    for (const child of player.children) {
      if (child === driverRoot || child === driverPivot || child.userData?.kanoDynamicsPivot || child.name === 'KANO_KEKE_DYNAMICS_VISUAL_PIVOT') continue;
      if (child.isObject3D && child.children?.length) {
        shell = child;
        break;
      }
    }

    if (shell) {
      shell.updateMatrixWorld(true);
      const worldBox = new THREE.Box3().setFromObject(shell);
      if (!worldBox.isEmpty()) {
        this.inverseMatrix.copy(player.matrixWorld).invert();
        this.localBox.copy(worldBox).applyMatrix4(this.inverseMatrix);
        this.localBox.getSize(this.localSize);
        this.localBox.getCenter(this.localCenter);
        const height = clamp(this.localSize.y, 1.1, 2.25);
        const width = clamp(this.localSize.x, 0.8, 2.7);
        const length = clamp(this.localSize.z, 1.0, 3.8);

        if (driverRoot && driverRoot !== player) {
          driverRoot.position.set(0, 0, 0);
          const uniformScale = clamp(height / 1.85, 0.82, 1.08);
          driverRoot.scale.set(uniformScale * clamp(width / 1.5, 0.82, 1.03), uniformScale, uniformScale);
        }
        driverPivot.position.set(
          this.localCenter.x,
          this.localBox.min.y + height * 0.59,
          this.localCenter.z + length * 0.015,
        );
      }
    }

    player.userData.kanoDriverCalibrated = true;
    this.driverPlayer = player;
  }

  createSeatedDriverRig() {
    const root = new THREE.Group();
    root.name = 'KANO_KEKE_SEATED_DRIVER';
    root.userData.proceduralDriver = true;
    root.userData.seated = true;

    const makeMat = (color) => this.ownMaterial(new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));
    const shirt = makeMat(0x315d46);
    const skin = makeMat(0x70472f);
    const capMaterial = makeMat(0x18382e);
    const trousers = makeMat(0x252d32);
    const shoeMaterial = makeMat(0x12171b);
    const metal = makeMat(0x657276);

    const pivot = new THREE.Group();
    pivot.name = 'KANO_KEKE_DRIVER_PIVOT';
    root.add(pivot);

    const torso = new THREE.Mesh(this.ownGeometry(new THREE.CapsuleGeometry(0.17, 0.42, 2, 7)), shirt);
    torso.name = 'KANO_KEKE_DRIVER_TORSO';
    torso.position.y = 0.02;
    pivot.add(torso);

    const neck = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8)), skin);
    neck.position.set(0, 0.25, -0.05);
    pivot.add(neck);
    const head = new THREE.Mesh(this.ownGeometry(new THREE.SphereGeometry(0.14, 12, 10)), skin);
    head.name = 'KANO_KEKE_DRIVER_HEAD';
    head.position.set(0, 0.34, -0.08);
    pivot.add(head);
    const cap = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.14, 0.16, 0.06, 10)), capMaterial);
    cap.position.set(0, 0.46, -0.08);
    pivot.add(cap);

    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(this.ownGeometry(new THREE.CapsuleGeometry(0.07, 0.2, 2, 6)), trousers);
      thigh.position.set(side * 0.10, -0.22, -0.15);
      thigh.rotation.x = Math.PI / 2.8;
      pivot.add(thigh);
      const shin = new THREE.Mesh(this.ownGeometry(new THREE.CapsuleGeometry(0.05, 0.17, 2, 6)), trousers);
      shin.position.set(side * 0.105, -0.43, -0.30);
      shin.rotation.x = -0.3;
      pivot.add(shin);
      const shoe = new THREE.Mesh(this.ownGeometry(new THREE.BoxGeometry(0.13, 0.07, 0.19)), shoeMaterial);
      shoe.position.set(side * 0.105, -0.55, -0.38);
      pivot.add(shoe);
    }

    const arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.name = side < 0 ? 'KANO_KEKE_DRIVER_SHOULDER_LEFT' : 'KANO_KEKE_DRIVER_SHOULDER_RIGHT';
      shoulder.position.set(side * 0.16, 0.10, -0.02);
      pivot.add(shoulder);
      const upper = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.045, 0.055, 0.27, 7)), shirt);
      upper.position.set(side * 0.04, -0.10, -0.09);
      upper.rotation.x = -0.35;
      shoulder.add(upper);
      const forearm = new THREE.Group();
      forearm.name = side < 0 ? 'KANO_KEKE_DRIVER_FOREARM_LEFT' : 'KANO_KEKE_DRIVER_FOREARM_RIGHT';
      forearm.position.set(side * 0.08, -0.20, -0.15);
      shoulder.add(forearm);
      const lower = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.035, 0.045, 0.24, 7)), shirt);
      lower.position.y = -0.10;
      forearm.add(lower);
      const hand = new THREE.Mesh(this.ownGeometry(new THREE.SphereGeometry(0.05, 7, 6)), skin);
      hand.position.set(side * 0.06, -0.20, -0.20);
      forearm.add(hand);
      arms.push({ shoulder, forearm });
    }

    const handlebar = new THREE.Mesh(this.ownGeometry(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 8)), metal);
    handlebar.name = 'KANO_KEKE_DRIVER_HANDLEBAR';
    handlebar.rotation.z = Math.PI / 2;
    handlebar.position.set(0, -0.02, -0.42);
    pivot.add(handlebar);

    return { root, pivot, arms };
  }

  // ----------------------------------------------------------
  // PASSENGER BOARDING AND ALIGHTING ANIMATIONS
  // ----------------------------------------------------------

  patchPassengerInteractions() {
    const upgrade = this;

    // The existing Game.moveZones() gates roadside interactions on a tiny
    // positive signedSpeed. That unintentionally blocks picking up, dropping
    // off, and refuelling while fully stopped. Supply a tiny *temporary*
    // interaction epsilon only during that method call; physical speed remains
    // zero, the epsilon is restored immediately, and pothole damage still has
    // its independent speed > 0.5 guard. This keeps the existing engine intact.
    if (typeof this.game.moveZones === 'function') {
      const original = this.game.moveZones;
      const wrapped = function (dt) {
        const state = this.s;
        const originalSignedSpeed = state?.signedSpeed;
        const stoppedForRoadsideInteraction = Boolean(
          this.state === 'PLAY' &&
          !state?.event &&
          !state?.reverse &&
          Number(state?.speed) <= 0.05
        );

        if (stoppedForRoadsideInteraction) {
          state.signedSpeed = 0.051;
        }

        try {
          return original.call(this, dt);
        } finally {
          if (state && stoppedForRoadsideInteraction) {
            state.signedSpeed = originalSignedSpeed;
          }
        }
      };
      this.game.moveZones = wrapped;
      this.originalMethods.push({ key: 'moveZones', original, wrapped });
    }

    if (typeof this.game.pickup === 'function') {
      const original = this.game.pickup;
      const wrapped = function (zone) {
        const before = this.s?.passengers?.length || 0;
        const beforeSeats = (this.s?.passengers || []).reduce((sum, p) => sum + (p.seats || 0), 0);
        const result = original.call(this, zone);
        const after = this.s?.passengers?.length || 0;
        const afterSeats = (this.s?.passengers || []).reduce((sum, p) => sum + (p.seats || 0), 0);
        if (result && after > before && afterSeats > beforeSeats) {
          upgrade.startPassengerWalk('board', zone, this.s.passengers[this.s.passengers.length - 1]);
        }
        return result;
      };
      this.game.pickup = wrapped;
      this.originalMethods.push({ key: 'pickup', original, wrapped });
    }

    if (typeof this.game.drop === 'function') {
      const original = this.game.drop;
      const wrapped = function (zone) {
        const passengers = this.s?.passengers || [];
        const passenger = passengers[0] || null;
        const before = passengers.length;
        const result = original.call(this, zone);
        const after = this.s?.passengers?.length || 0;
        if (passenger && result && after < before) {
          upgrade.startPassengerWalk('alight', zone, passenger);
        }
        return result;
      };
      this.game.drop = wrapped;
      this.originalMethods.push({ key: 'drop', original, wrapped });
    }
  }

  makeWalkingPassenger(type = 'passenger') {
    const root = new THREE.Group();
    root.name = `KANO_PASSENGER_${type.toUpperCase()}_WALK_ANIMATION`;
    this.passengerResources ||= {};
    const resources = this.passengerResources;
    resources.skinMat ||= this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0x70472f, roughness: 0.92 }));
    resources.manMat ||= this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0x315b46, roughness: 0.9 }));
    resources.womanMat ||= this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0x8a4c60, roughness: 0.9 }));
    resources.trouserMat ||= this.ownMaterial(new THREE.MeshStandardMaterial({ color: 0x293137, roughness: 0.94 }));
    resources.bodyGeo ||= this.ownGeometry(new THREE.CapsuleGeometry(0.16, 0.42, 2, 6));
    resources.headGeo ||= this.ownGeometry(new THREE.SphereGeometry(0.14, 9, 7));
    resources.hijabGeo ||= this.ownGeometry(new THREE.ConeGeometry(0.19, 0.32, 8));
    resources.armGeo ||= this.ownGeometry(new THREE.CylinderGeometry(0.04, 0.05, 0.43, 5));
    resources.legGeo ||= this.ownGeometry(new THREE.CylinderGeometry(0.05, 0.06, 0.56, 5));
    const skinMat = resources.skinMat;
    const clothMat = type === 'woman' ? resources.womanMat : resources.manMat;
    const trouserMat = resources.trouserMat;

    const body = new THREE.Mesh(resources.bodyGeo, clothMat);
    body.position.y = 0.96;
    root.add(body);
    const head = new THREE.Mesh(resources.headGeo, skinMat);
    head.position.set(0, 1.47, -0.015);
    root.add(head);

    if (type === 'woman') {
      const hijab = new THREE.Mesh(resources.hijabGeo, clothMat);
      hijab.position.set(0, 1.53, 0.04);
      hijab.rotation.x = Math.PI;
      root.add(hijab);
    }

    const arms = [];
    const legs = [];
    for (const side of [-1, 1]) {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.20, 1.19, 0);
      root.add(armPivot);
      const arm = new THREE.Mesh(resources.armGeo, clothMat);
      arm.position.y = -0.20;
      armPivot.add(arm);
      arms.push({ side, pivot: armPivot });

      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.085, 0.68, 0);
      root.add(legPivot);
      const leg = new THREE.Mesh(resources.legGeo, trouserMat);
      leg.position.y = -0.25;
      legPivot.add(leg);
      legs.push({ side, pivot: legPivot });
    }

    return { root, arms, legs, head };
  }

  startPassengerWalk(kind, zone, passenger) {
    if (this.disposed || this.renderer.lifeScene !== 'road') return;
    if (!this.renderer.world?.visible || !this.renderer.player) return;

    // Bound the transient animation pool to avoid bursts causing allocations.
    while (this.walkingPassengers.length >= 4) {
      const oldest = this.walkingPassengers.shift();
      this.renderer.world.remove(oldest.rig.root);
    }

    const type = passenger?.female ? 'woman' : 'man';
    const rig = this.makeWalkingPassenger(type);
    const side = Number(zone?.side) < 0 ? -1 : 1;
    const player = this.renderer.player;
    const playerX = Number(player.position.x) || 0;
    const playerZ = Number(player.position.z) || 2;
    let start;
    let end;

    if (kind === 'board') {
      start = new THREE.Vector3(side * 6.55, 0, -clamp(Number(zone?.depth) || 0.12, 0.04, 1.8) * 88);
      end = new THREE.Vector3(playerX + side * 0.48, 0, playerZ + 0.20);
    } else {
      start = new THREE.Vector3(playerX + side * 0.48, 0, playerZ + 0.28);
      end = new THREE.Vector3(side * 6.55, 0, -clamp(Number(zone?.depth) || 0.12, 0.04, 1.8) * 88);
    }

    rig.root.position.copy(start);
    rig.root.rotation.y = kind === 'board' ? (side < 0 ? -Math.PI / 2 : Math.PI / 2) : (side < 0 ? Math.PI / 2 : -Math.PI / 2);
    this.renderer.world.add(rig.root);

    this.walkingPassengers.push({
      kind,
      rig,
      side,
      passenger,
      start,
      end,
      elapsed: 0,
      duration: clamp(start.distanceTo(end) / 6.8, 0.85, 2.35),
      worldScroll: 0,
      initialScale: 1,
    });
  }

  updatePassengerWalkers(dt, scroll) {
    for (let index = this.walkingPassengers.length - 1; index >= 0; index -= 1) {
      const item = this.walkingPassengers[index];
      item.elapsed += dt;
      item.worldScroll += scroll;
      const t = clamp(item.elapsed / item.duration, 0, 1);
      const eased = t * t * (3 - 2 * t);
      const startZ = item.kind === 'board' ? item.start.z + item.worldScroll : item.start.z;
      const endZ = item.kind === 'board' ? item.end.z : item.end.z + item.worldScroll;
      const x = THREE.MathUtils.lerp(item.start.x, item.end.x, eased);
      const z = THREE.MathUtils.lerp(startZ, endZ, eased);
      item.rig.root.position.set(x, Math.abs(Math.sin(item.elapsed * 8.5)) * 0.035 * (1 - t * 0.35), z);

      const stride = Math.sin(item.elapsed * 9.4) * 0.48;
      for (const arm of item.rig.arms) arm.pivot.rotation.x = arm.side * stride * 0.38;
      for (const leg of item.rig.legs) leg.pivot.rotation.x = -armSafe(stride, leg.side);
      item.rig.head.rotation.y = Math.sin(item.elapsed * 1.8) * 0.08;

      if (item.kind === 'board' && t > 0.72) {
        const fade = clamp((1 - t) / 0.28, 0, 1);
        item.rig.root.scale.setScalar(Math.max(0.015, fade));
      } else if (item.kind === 'alight' && t > 0.84) {
        item.rig.root.scale.setScalar(clamp((1 - t) / 0.16, 0.015, 1));
      }

      if (t >= 1) {
        this.renderer.world.remove(item.rig.root);
        this.walkingPassengers.splice(index, 1);
      }
    }
  }

  // ----------------------------------------------------------
  // FRAME UPDATE
  // ----------------------------------------------------------

  update(dt, state = {}) {
    if (this.disposed) return;
    const delta = clamp(Number(dt) || 0, 0, 0.05);
    this.elapsed += delta;

    if (this.renderer.player !== this.driverPlayer) {
      this.ensureSeatedDriver(true);
    }

    const signedSpeed = Number.isFinite(state.signedSpeed)
      ? state.signedSpeed
      : state.reverse
        ? -Math.abs(Number(state.speed) || 0)
        : Math.abs(Number(state.speed) || 0);
    const scroll = signedSpeed * delta * 0.28;

    const isRoad = this.renderer.lifeScene === 'road' && this.renderer.world.visible;
    if (this.marketRoot) this.marketRoot.visible = isRoad;
    if (isRoad) {
      for (const slot of this.shopSlots) {
        slot.z += scroll;
        if (slot.z > 12) slot.z -= this.loopLength;
        else if (slot.z < -this.loopLength - 6) slot.z += this.loopLength;
      }
      for (const walker of this.walkers) {
        walker.z += scroll + walker.direction * walker.speed * delta;
        if (walker.z > 10) walker.z -= this.loopLength;
        else if (walker.z < -this.loopLength - 5) walker.z += this.loopLength;
      }
      this.updateMarketMatrices();
      this.updateCrowdMatrices();
      this.updatePassengerWalkers(delta, scroll);
    }

    this.updateLifeRigs(delta);
  }

  updateLifeRigs(dt) {
    for (const rig of this.lifeRigs) {
      const active = rig.scene === this.renderer.lifeScene || (rig.scene === 'garage' && this.renderer.lifeScene === 'garage');
      const t = this.elapsed * 2.1 + rig.phase;
      const swing = Math.sin(t);
      const stride = Math.sin(t * 1.15);
      rig.root.visible = active;

      if (rig.action === 'wake') {
        rig.root.position.y = Math.abs(swing) * 0.055;
        rig.root.rotation.z = Math.sin(t * 0.55) * 0.035;
        rig.armPivots.forEach((arm) => {
          arm.pivot.rotation.z = arm.side * (0.12 + Math.max(0, swing) * 0.55);
          arm.pivot.rotation.x = -0.08 + Math.max(0, swing) * 0.25;
        });
        rig.head.rotation.x = Math.max(0, swing) * 0.12;
      } else if (rig.action === 'drawWater') {
        rig.root.position.y = Math.abs(swing) * 0.025;
        rig.armPivots[1].pivot.rotation.x = -0.50 + swing * 0.6;
        rig.armPivots[1].pivot.rotation.z = 0.25 + Math.sin(t * 0.6) * 0.12;
        rig.armPivots[0].pivot.rotation.x = 0.12 + Math.sin(t * 1.1) * 0.22;
        if (rig.prop) rig.prop.rotation.z = swing * 0.10;
      } else if (rig.action === 'sweep') {
        rig.root.rotation.y = Math.sin(t * 0.5) * 0.10;
        rig.armPivots[0].pivot.rotation.x = -0.35 + swing * 0.30;
        rig.armPivots[0].pivot.rotation.z = 0.20 + swing * 0.15;
        rig.armPivots[1].pivot.rotation.x = -0.20 - swing * 0.22;
        if (rig.prop) rig.prop.rotation.z = swing * 0.18;
      } else if (rig.action === 'sellFood') {
        rig.armPivots[0].pivot.rotation.x = -0.15 + Math.sin(t * 1.8) * 0.48;
        rig.armPivots[0].pivot.rotation.z = -0.25;
        rig.armPivots[1].pivot.rotation.x = -0.10 + Math.sin(t * 1.8 + 1) * 0.34;
        rig.head.rotation.y = Math.sin(t * 0.65) * 0.12;
      } else if (rig.action === 'clean') {
        rig.root.rotation.x = 0.04 + Math.abs(swing) * 0.08;
        rig.armPivots[1].pivot.rotation.x = -0.58 + Math.sin(t * 2.5) * 0.28;
        rig.armPivots[1].pivot.rotation.z = 0.12 + swing * 0.10;
        rig.armPivots[0].pivot.rotation.x = -0.28 + Math.sin(t * 1.1) * 0.10;
        if (rig.prop) rig.prop.position.x = Math.sin(t * 2.5) * 0.06;
      } else if (rig.action === 'walk') {
        rig.root.position.x = rig.baseX + Math.sin(t * 0.55) * 0.45;
        rig.root.position.z = rig.baseZ + Math.sin(t * 0.40) * 0.12;
        rig.root.position.y = Math.abs(stride) * 0.025;
        rig.armPivots.forEach((arm) => {
          arm.pivot.rotation.x = arm.side * stride * 0.35;
        });
        rig.legPivots.forEach((leg) => {
          leg.pivot.rotation.x = -leg.side * stride * 0.48;
        });
        rig.head.rotation.y = Math.sin(t * 0.4) * 0.08;
      }
    }
  }

  // ----------------------------------------------------------
  // SAFE DISPOSAL
  // ----------------------------------------------------------

  disposeOwnedSubtree(root) {
    if (!root) return;
    root.traverse((object) => {
      if (object.geometry && this.ownedGeometries?.has(object.geometry)) {
        object.geometry.dispose();
        this.ownedGeometries.delete(object.geometry);
      }
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) {
        if (this.ownedMaterials?.has(material)) {
          material.dispose();
          this.ownedMaterials.delete(material);
        }
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    for (const method of this.originalMethods) {
      if (this.game[method.key] === method.wrapped) {
        this.game[method.key] = method.original;
      }
    }
    this.originalMethods.length = 0;

    for (const item of this.walkingPassengers) {
      this.renderer.world?.remove(item.rig.root);
    }
    this.walkingPassengers.length = 0;

    // Remove only procedural seated drivers created by this upgrade.
    // Renderer3D's built-in fallback driver is owned by Renderer3D itself.
    for (const root of this.seatedDriverRoots || []) {
      root.parent?.remove(root);
    }
    this.seatedDriverRoots?.clear();

    for (const rig of this.lifeRigs) {
      rig.root.parent?.remove(rig.root);
    }
    this.lifeRigs.length = 0;

    for (const mesh of this.ownedMeshes) {
      mesh.parent?.remove(mesh);
    }
    for (const group of this.ownedGroups) {
      group.parent?.remove(group);
    }
    for (const geometry of this.ownedGeometries || []) geometry.dispose();
    for (const material of this.ownedMaterials || []) material.dispose();
    for (const texture of this.ownedTextures || []) texture.dispose();

    this.ownedMeshes.length = 0;
    this.ownedGroups.length = 0;
    this.ownedGeometries?.clear();
    this.ownedMaterials?.clear();
    this.ownedTextures?.clear();
  }
}

function armSafe(stride, side) {
  return stride * side * 0.48;
}
