import * as THREE from "/vendor/three.module.js";

export class WorldEnvironment {
  constructor(options = {}) {
    this.options = {
      seed: 1991,
      roadWidth: 12,
      sidewalkWidth: 2.5,
      buildingSpacing: 18,
      vegetationSpacing: 14,
      visibleDistance: 220,
      ...options,
    };

    this.scene = null;
    this.groups = {};
    this.materials = {};
    this.random = null;
    this.disposed = false;
    this.initialized = false;
    this.landmarks = [];
    this.generatedObjects = [];
  }

  init(sceneOrBuilder) {
    if (this.disposed) {
      throw new Error("WorldEnvironment has been disposed.");
    }

    if (this.initialized) {
      return this;
    }

    this.scene =
      typeof sceneOrBuilder?.getScene === "function"
        ? sceneOrBuilder.getScene()
        : sceneOrBuilder;

    if (!this.scene?.isScene) {
      throw new TypeError(
        "WorldEnvironment requires a Three.js scene."
      );
    }

    this.random = this.createRandom(this.options.seed);
    this.createMaterials();
    this.createGroups();

    this.initialized = true;

    return this;
  }

  createRandom(seed) {
    let state = Number(seed) >>> 0;

    return () => {
      state = (state + 0x6d2b79f5) >>> 0;

      let value = state;

      value = Math.imul(
        value ^ (value >>> 15),
        value | 1
      );

      value ^= value + Math.imul(
        value ^ (value >>> 7),
        value | 61
      );

      return (
        ((value ^ (value >>> 14)) >>> 0) /
        4294967296
      );
    };
  }

  randomRange(min, max) {
    return min + this.random() * (max - min);
  }

  createMaterials() {
    this.materials = {
      sand: new THREE.MeshStandardMaterial({
        color: 0xc4ad7a,
        roughness: 1,
      }),

      plaster: new THREE.MeshStandardMaterial({
        color: 0xd7c9a7,
        roughness: 0.92,
      }),

      white: new THREE.MeshStandardMaterial({
        color: 0xe8e3d5,
        roughness: 0.88,
      }),

      terracotta: new THREE.MeshStandardMaterial({
        color: 0xb76e4a,
        roughness: 0.95,
      }),

      concrete: new THREE.MeshStandardMaterial({
        color: 0x8e8c83,
        roughness: 1,
      }),

      roof: new THREE.MeshStandardMaterial({
        color: 0x65574b,
        roughness: 0.9,
      }),

      glass: new THREE.MeshStandardMaterial({
        color: 0x527b89,
        roughness: 0.35,
        metalness: 0.15,
      }),

      metal: new THREE.MeshStandardMaterial({
        color: 0x777d80,
        roughness: 0.6,
        metalness: 0.5,
      }),

      trunk: new THREE.MeshStandardMaterial({
        color: 0x6e4b2d,
        roughness: 1,
      }),

      foliage: new THREE.MeshStandardMaterial({
        color: 0x53783e,
        roughness: 1,
      }),

      foliageLight: new THREE.MeshStandardMaterial({
        color: 0x7e9147,
        roughness: 1,
      }),

      dryGrass: new THREE.MeshStandardMaterial({
        color: 0xa9a06b,
        roughness: 1,
      }),

      sign: new THREE.MeshStandardMaterial({
        color: 0x24584a,
        roughness: 0.8,
      }),

      signText: new THREE.MeshStandardMaterial({
        color: 0xf5e7b9,
        roughness: 0.8,
      }),
    };
  }

  createGroups() {
    const names = [
      "environment-buildings",
      "environment-vegetation",
      "environment-street-furniture",
      "environment-landmarks",
    ];

    for (const name of names) {
      const group = new THREE.Group();

      group.name = name;
      group.userData.environmentGroup = true;

      this.scene.add(group);
      this.groups[name] = group;
    }
  }

  addObject(groupName, object, options = {}) {
    const group = this.groups[groupName];

    if (!group) {
      throw new Error(
        `Unknown environment group: ${groupName}`
      );
    }

    group.add(object);

    if (options.track !== false) {
      this.generatedObjects.push(object);
    }

    return object;
  }

  createBuilding(options = {}) {
    this.ensureInitialized();

    const width = Math.max(
      3,
      options.width ?? this.randomRange(5, 11)
    );

    const height = Math.max(
      3,
      options.height ?? this.randomRange(4, 13)
    );

    const depth = Math.max(
      4,
      options.depth ?? this.randomRange(6, 12)
    );

    const material =
      options.material ??
      this.pick([
        this.materials.sand,
        this.materials.plaster,
        this.materials.white,
        this.materials.terracotta,
      ]);

    const building = new THREE.Group();

    building.name = options.name || "street-building";

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );

    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;

    building.add(body);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        width + 0.25,
        0.22,
        depth + 0.25
      ),
      this.materials.roof
    );

    roof.position.y = height + 0.08;
    roof.castShadow = true;

    building.add(roof);

    this.addWindows(building, width, height, depth);

    if (options.position) {
      building.position.copy(options.position);
    }

    building.userData.environmentType = "building";
    building.userData.dimensions = {
      width,
      height,
      depth,
    };

    this.addObject(
      "environment-buildings",
      building
    );

    return building;
  }

  addWindows(building, width, height, depth) {
    const rows = Math.max(
      1,
      Math.floor((height - 1.2) / 1.7)
    );

    const columns = Math.max(
      1,
      Math.floor(width / 1.8)
    );

    const windowWidth = Math.min(
      0.85,
      width / (columns * 1.5)
    );

    const windowHeight = 0.9;

    const geometry = new THREE.BoxGeometry(
      windowWidth,
      windowHeight,
      0.06
    );

    const sideGeometry = new THREE.BoxGeometry(
      0.06,
      windowHeight,
      Math.min(0.9, depth / 5)
    );

    for (let row = 0; row < rows; row += 1) {
      const y = 1.1 + row * 1.7;

      if (y + windowHeight / 2 >= height - 0.25) {
        continue;
      }

      for (let column = 0; column < columns; column += 1) {
        const spacing = width / (columns + 1);

        const x =
          -width / 2 + spacing * (column + 1);

        const frontWindow = new THREE.Mesh(
          geometry,
          this.materials.glass
        );

        frontWindow.position.set(
          x,
          y,
          depth / 2 + 0.035
        );

        building.add(frontWindow);

        const backWindow = new THREE.Mesh(
          geometry,
          this.materials.glass
        );

        backWindow.position.set(
          x,
          y,
          -depth / 2 - 0.035
        );

        building.add(backWindow);
      }

      for (const side of [-1, 1]) {
        const sideWindow = new THREE.Mesh(
          sideGeometry,
          this.materials.glass
        );

        sideWindow.position.set(
          side * (width / 2 + 0.035),
          y,
          0
        );

        building.add(sideWindow);
      }
    }
  }

  createTree(options = {}) {
    this.ensureInitialized();

    const height = Math.max(
      2,
      options.height ?? this.randomRange(3.5, 6.5)
    );

    const scale = Math.max(
      0.3,
      options.scale ?? this.randomRange(0.8, 1.25)
    );

    const tree = new THREE.Group();
    tree.name = "street-tree";

    const trunkHeight = height * 0.43;
    const crownRadius = height * 0.28;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.13 * scale,
        0.24 * scale,
        trunkHeight,
        7
      ),
      this.materials.trunk
    );

    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;

    tree.add(trunk);

    const crownMaterial = this.pick([
      this.materials.foliage,
      this.materials.foliageLight,
    ]);

    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(
        crownRadius * scale,
        8,
        6
      ),
      crownMaterial
    );

    crown.position.y =
      trunkHeight + crownRadius * 0.65;

    crown.scale.set(
      1,
      1.2,
      0.95
    );

    crown.castShadow = true;
    crown.receiveShadow = true;

    tree.add(crown);

    if (options.position) {
      tree.position.copy(options.position);
    }

    tree.userData.environmentType = "tree";

    this.addObject(
      "environment-vegetation",
      tree
    );

    return tree;
  }

  createStreetLight(options = {}) {
    this.ensureInitialized();

    const height = options.height ?? 5.5;
    const lightGroup = new THREE.Group();

    lightGroup.name = "street-light";

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.055,
        0.09,
        height,
        7
      ),
      this.materials.metal
    );

    pole.position.y = height / 2;
    pole.castShadow = true;

    lightGroup.add(pole);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.07, 0.07),
      this.materials.metal
    );

    arm.position.set(0.35, height - 0.08, 0);

    lightGroup.add(arm);

    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.14, 0.24),
      this.materials.signText
    );

    lamp.position.set(0.7, height - 0.13, 0);

    lightGroup.add(lamp);

    if (options.position) {
      lightGroup.position.copy(options.position);
    }

    lightGroup.userData.environmentType =
      "street-light";

    this.addObject(
      "environment-street-furniture",
      lightGroup
    );

    return lightGroup;
  }

  createSign(text, options = {}) {
    this.ensureInitialized();

    const width = options.width ?? 3.2;
    const height = options.height ?? 1.1;

    const sign = new THREE.Group();
    sign.name = "street-sign";

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.12),
      this.materials.sign
    );

    board.position.y = height + 1.4;
    board.castShadow = true;

    sign.add(board);

    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, height + 1.4, 0.12),
      this.materials.metal
    );

    post.position.y = (height + 1.4) / 2;

    sign.add(post);

    const label = this.createTextLabel(
      String(text),
      width * 0.86,
      height * 0.6
    );

    if (label) {
      label.position.set(
        0,
        height + 1.4,
        0.075
      );

      sign.add(label);
    }

    if (options.position) {
      sign.position.copy(options.position);
    }

    sign.userData.environmentType = "sign";
    sign.userData.label = String(text);

    this.addObject(
      "environment-street-furniture",
      sign
    );

    return sign;
  }

  createTextLabel(text, width, height) {
    if (typeof document === "undefined") {
      return null;
    }

    const canvas = document.createElement("canvas");

    canvas.width = 512;
    canvas.height = 160;

    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    context.fillStyle = "#f5e7b9";
    context.font = "bold 46px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";

    context.fillText(
      text.slice(0, 30),
      canvas.width / 2,
      canvas.height / 2,
      canvas.width - 24
    );

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      material
    );

    label.userData.ownsTexture = true;

    return label;
  }

  createLandmark(name, options = {}) {
    this.ensureInitialized();

    const landmark = new THREE.Group();
    landmark.name = `landmark-${name}`;

    const baseWidth = options.width ?? 8;
    const baseHeight = options.height ?? 12;
    const baseDepth = options.depth ?? 8;

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(
        baseWidth,
        baseHeight,
        baseDepth
      ),
      options.material ?? this.materials.white
    );

    base.position.y = baseHeight / 2;
    base.castShadow = true;
    base.receiveShadow = true;

    landmark.add(base);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(
        baseWidth * 0.72,
        Math.max(1, baseHeight * 0.16),
        4
      ),
      this.materials.terracotta
    );

    roof.position.y = baseHeight + baseHeight * 0.08;
    roof.rotation.y = Math.PI / 4;

    landmark.add(roof);

    if (options.position) {
      landmark.position.copy(options.position);
    }

    landmark.userData.environmentType = "landmark";
    landmark.userData.landmarkName = name;

    this.landmarks.push(landmark);

    this.addObject(
      "environment-landmarks",
      landmark
    );

    return landmark;
  }

  generateStreet(options = {}) {
    this.ensureInitialized();

    const startZ = options.startZ ?? 0;
    const endZ =
      options.endZ ?? this.options.visibleDistance;

    const spacing = Math.max(
      8,
      options.spacing ?? this.options.buildingSpacing
    );

    const roadEdge =
      this.options.roadWidth / 2 +
      this.options.sidewalkWidth +
      1.5;

    const buildingCount = Math.ceil(
      (endZ - startZ) / spacing
    );

    for (let index = 0; index < buildingCount; index += 1) {
      const z =
        startZ + index * spacing;

      for (const side of [-1, 1]) {
        if (this.random() < 0.16) {
          this.createTree({
            position: new THREE.Vector3(
              side *
                (roadEdge + this.randomRange(0, 2)),
              0,
              z + this.randomRange(-3, 3)
            ),
          });
        } else {
          const width = this.randomRange(5, 10);
          const depth = this.randomRange(6, 12);

          this.createBuilding({
            width,
            height: this.randomRange(4, 12),
            depth,
            position: new THREE.Vector3(
              side *
                (roadEdge + width / 2 + 2),
              0,
              z
            ),
          });
        }

        if (index % 3 === 0 && this.random() < 0.65) {
          this.createStreetLight({
            position: new THREE.Vector3(
              side * roadEdge,
              0,
              z + spacing * 0.4
            ),
          });
        }
      }
    }

    return buildingCount;
  }

  pick(items) {
    return items[
      Math.floor(this.random() * items.length)
    ];
  }

  ensureInitialized() {
    if (!this.initialized || this.disposed) {
      throw new Error(
        "Initialize WorldEnvironment before creating objects."
      );
    }
  }

  getGroup(name) {
    return this.groups[name] || null;
  }

  getLandmarks() {
    return [...this.landmarks];
  }

  clearGeneratedObjects() {
    for (const group of Object.values(this.groups)) {
      while (group.children.length > 0) {
        const object = group.children[0];

        group.remove(object);
        this.disposeObject(object);
      }
    }

    this.generatedObjects.length = 0;
    this.landmarks.length = 0;
  }

  disposeObject(object) {
    object.traverse((child) => {
      if (child.userData?.ownsTexture) {
        child.material?.map?.dispose();
      }

      if (child.isMesh) {
        child.geometry?.dispose();

        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        for (const material of materials) {
          if (
            material &&
            !Object.values(this.materials).includes(material)
          ) {
            material.dispose();
          }
        }
      }
    });
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.clearGeneratedObjects();

    for (const group of Object.values(this.groups)) {
      group.parent?.remove(group);
    }

    for (const material of Object.values(this.materials)) {
      material.dispose();
    }

    this.groups = {};
    this.materials = {};
    this.generatedObjects = [];
    this.landmarks = [];
    this.scene = null;
    this.random = null;
    this.initialized = false;
    this.disposed = true;
  }
}

export default WorldEnvironment;