import * as THREE from "three";

export class SceneBuilder {
  constructor(options = {}) {
    this.options = {
      background: 0x87ceeb,
      fogColor: 0x87ceeb,
      fogNear: 35,
      fogFar: 220,
      enableFog: true,
      ambientIntensity: 1.5,
      sunIntensity: 2.2,
      shadows: true,
      groundSize: 1000,
      ...options,
    };

    this.scene = null;
    this.world = null;
    this.lights = {};
    this.groups = {};
    this.disposed = false;
  }

  build() {
    if (this.disposed) {
      throw new Error("SceneBuilder has been disposed.");
    }

    if (this.scene) {
      return this.scene;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.background);

    if (this.options.enableFog) {
      this.scene.fog = new THREE.Fog(
        this.options.fogColor,
        this.options.fogNear,
        this.options.fogFar
      );
    }

    this.createGroups();
    this.createLighting();
    this.createGround();

    return this.scene;
  }

  createGroups() {
    const groupNames = [
      "environment",
      "road",
      "markings",
      "sidewalks",
      "buildings",
      "vegetation",
      "traffic",
      "vehicles",
      "passengers",
      "effects",
      "landmarks",
    ];

    for (const name of groupNames) {
      const group = new THREE.Group();
      group.name = name;
      group.userData.sceneGroup = true;

      this.groups[name] = group;
      this.scene.add(group);
    }

    this.world = this.groups.environment;
  }

  createLighting() {
    const ambient = new THREE.HemisphereLight(
      0xdceeff,
      0x76604b,
      this.options.ambientIntensity
    );

    ambient.name = "ambient-light";
    this.scene.add(ambient);
    this.lights.ambient = ambient;

    const sun = new THREE.DirectionalLight(
      0xfff0d2,
      this.options.sunIntensity
    );

    sun.name = "sun-light";
    sun.position.set(-45, 80, 35);
    sun.castShadow = Boolean(this.options.shadows);

    if (sun.castShadow) {
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 240;
      sun.shadow.camera.left = -90;
      sun.shadow.camera.right = 90;
      sun.shadow.camera.top = 90;
      sun.shadow.camera.bottom = -90;
      sun.shadow.bias = -0.0003;
      sun.shadow.normalBias = 0.025;
    }

    this.scene.add(sun);
    this.lights.sun = sun;

    const fill = new THREE.DirectionalLight(0xb9d9ff, 0.45);

    fill.name = "sky-fill-light";
    fill.position.set(35, 25, -45);

    this.scene.add(fill);
    this.lights.fill = fill;
  }

  createGround() {
    const size = this.options.groundSize;

    const geometry = new THREE.PlaneGeometry(size, size);

    const material = new THREE.MeshStandardMaterial({
      color: 0xc6b58a,
      roughness: 1,
      metalness: 0,
    });

    const ground = new THREE.Mesh(geometry, material);

    ground.name = "world-ground";
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    
    // OPTIMIZATION: Ground receives shadows, but never casts them (saves GPU cycles)
    ground.castShadow = false;
    ground.receiveShadow = Boolean(this.options.shadows);
    ground.userData.worldGround = true;

    this.groups.environment.add(ground);

    return ground;
  }

  add(name, object, options = {}) {
    if (!this.scene) {
      this.build();
    }

    if (!object || !object.isObject3D) {
      throw new TypeError("SceneBuilder.add expects a Three.js Object3D.");
    }

    const group = this.groups[name];

    if (group) {
      group.add(object);
    } else if (options.group) {
      const target = this.groups[options.group];

      if (!target) {
        throw new Error(`Unknown scene group: ${options.group}`);
      }

      target.add(object);
    } else {
      this.scene.add(object);
    }

    return object;
  }

  remove(object) {
    if (!object?.isObject3D) {
      return false;
    }

    if (!object.parent) {
      return false;
    }

    object.parent.remove(object);
    return true;
  }

  getGroup(name) {
    return this.groups[name] || null;
  }

  getScene() {
    return this.scene || this.build();
  }

  getWorld() {
    return this.world || this.getGroup("environment");
  }

  getLights() {
    return { ...this.lights };
  }

  setBackground(color) {
    if (!this.scene) {
      this.build();
    }

    this.scene.background = new THREE.Color(color);
  }

  setFog(enabled, options = {}) {
    if (!this.scene) {
      this.build();
    }

    this.options.enableFog = Boolean(enabled);

    if (!enabled) {
      this.scene.fog = null;
      return;
    }

    const color = options.color ?? this.options.fogColor;
    const near = options.near ?? this.options.fogNear;
    const far = options.far ?? this.options.fogFar;

    this.scene.fog = new THREE.Fog(
      color,
      Math.max(0, near),
      Math.max(near + 1, far)
    );
  }

  setLighting(options = {}) {
    if (!this.scene) {
      this.build();
    }

    if (Number.isFinite(options.ambientIntensity) && this.lights.ambient) {
      this.lights.ambient.intensity = Math.max(0, options.ambientIntensity);
    }

    if (Number.isFinite(options.sunIntensity) && this.lights.sun) {
      this.lights.sun.intensity = Math.max(0, options.sunIntensity);
    }

    if (Number.isFinite(options.fillIntensity) && this.lights.fill) {
      this.lights.fill.intensity = Math.max(0, options.fillIntensity);
    }
  }

  setShadows(enabled) {
    this.options.shadows = Boolean(enabled);

    if (this.lights.sun) {
      this.lights.sun.castShadow = this.options.shadows;
    }

    // OPTIMIZATION: Only apply shadow properties to groups that actually need them
    // This skips "effects", "passengers", etc., and prevents transparent mesh artifacts
    const shadowGroups = ["road", "buildings", "vegetation", "vehicles", "landmarks"];

    for (const groupName of shadowGroups) {
      const group = this.groups[groupName];
      if (!group) continue;

      group.traverse((object) => {
        if (!object.isMesh) return;
        
        // Skip transparent objects to prevent shadow map rendering glitches
        if (object.material?.transparent) return;

        object.castShadow = this.options.shadows;
        object.receiveShadow = this.options.shadows;
      });
    }
  }

  clearGroup(name, disposeResources = false) {
    const group = this.groups[name];

    if (!group) {
      return false;
    }

    while (group.children.length > 0) {
      const object = group.children[group.children.length - 1];

      group.remove(object);

      if (disposeResources) {
        this.disposeObject(object);
      }
    }

    return true;
  }

  disposeObject(object) {
    object.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.geometry?.dispose();

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of materials) {
        if (!material) {
          continue;
        }

        for (const value of Object.values(material)) {
          if (value?.isTexture) {
            value.dispose();
          }
        }

        material.dispose();
      }
    });
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    for (const group of Object.values(this.groups)) {
      group.clear();
    }

    this.scene?.clear();

    this.groups = {};
    this.lights = {};
    this.world = null;
    this.scene = null;
    this.disposed = true;
  }
}

export default SceneBuilder;