import * as THREE_NS from "three";
import GAME_CONFIG from "./config.js";

const THREE_STATIC = THREE_NS;

export default class SceneManager {
  constructor(options = {}) {
    this.THREE = options.THREE ?? null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.backgroundColor = options.backgroundColor ?? 0x87ceeb;
    this.fogColor = options.fogColor ?? 0xc4d7df;

    this.destroyed = false;
    this.resizeHandler = null;
  }

  async initialize(options = {}) {
    this.assertAvailable();

    if (!this.THREE) {
      this.THREE = await this.loadThree(options.threePath);
    }

    const THREE = this.THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.backgroundColor);

    this.scene.fog = new THREE.Fog(
      this.fogColor,
      options.fogNear ?? 45,
      options.fogFar ?? 220
    );

    this.camera = new THREE.PerspectiveCamera(
      options.fov ?? 65,
      this.getAspectRatio(),
      options.near ?? 0.1,
      options.far ?? 500
    );

    this.camera.position.set(0, 6, -9);
    this.camera.lookAt(0, 1, 8);

    this.renderer = new THREE.WebGLRenderer({
      antialias: options.antialias ?? true,
      alpha: false,
      powerPreference: "high-performance",
    });

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        options.maxPixelRatio ?? 2
      )
    );

    this.renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );

    this.renderer.shadowMap.enabled =
      options.shadows ?? true;

    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if ("outputColorSpace" in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    if ("toneMapping" in this.renderer && THREE.ACESFilmicToneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1;
    }

    const container =
      options.container ??
      document.getElementById("game-container") ??
      document.body;

    container.appendChild(this.renderer.domElement);

    this.resizeHandler = () => this.resize();
    window.addEventListener("resize", this.resizeHandler);

    this.createDefaultLighting();

    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
    };
  }

  async loadThree(_path) {
    // Static import so Vite bundles three into the app (bare "three" fails in browser)
    if (this.THREE) return this.THREE;
    if (!THREE_STATIC?.Scene || !THREE_STATIC?.WebGLRenderer) {
      throw new Error("Unable to load Three.js: static module missing Scene/WebGLRenderer");
    }
    this.THREE = THREE_STATIC;
    return this.THREE;
  }

  createDefaultLighting() {
    const THREE = this.THREE;

    const ambient = new THREE.HemisphereLight(
      0xe4f2ff,
      0x74604a,
      1.6
    );

    ambient.name = "kano-ambient-light";
    this.scene.add(ambient);

    const sunlight = new THREE.DirectionalLight(0xfff0d5, 2.1);

    sunlight.name = "kano-sunlight";
    sunlight.position.set(-35, 55, 25);
    sunlight.castShadow = true;

    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.near = 1;
    sunlight.shadow.camera.far = 150;
    sunlight.shadow.camera.left = -45;
    sunlight.shadow.camera.right = 45;
    sunlight.shadow.camera.top = 55;
    sunlight.shadow.camera.bottom = -55;

    this.scene.add(sunlight);
    this.scene.add(sunlight.target);

    const fill = new THREE.DirectionalLight(0xb9dcff, 0.45);

    fill.name = "kano-fill-light";
    fill.position.set(30, 18, -25);

    this.scene.add(fill);
  }

  getAspectRatio() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);

    return width / height;
  }

  resize() {
    if (
      this.destroyed ||
      !this.camera ||
      !this.renderer
    ) {
      return;
    }

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 2)
    );
  }

  setBackground(color) {
    if (!this.scene || !this.THREE) return;

    this.backgroundColor = color;
    this.scene.background = new this.THREE.Color(color);
  }

  setFog(color, near, far) {
    if (!this.scene || !this.THREE) return;

    this.fogColor = color;

    this.scene.fog = new this.THREE.Fog(
      color,
      Math.max(0, near),
      Math.max(near + 1, far)
    );
  }

  add(object) {
    if (!this.scene || !object) return false;

    this.scene.add(object);
    return true;
  }

  remove(object) {
    if (!this.scene || !object) return false;

    this.scene.remove(object);
    return true;
  }

  render() {
    if (
      this.destroyed ||
      !this.scene ||
      !this.camera ||
      !this.renderer
    ) {
      return;
    }

    this.renderer.render(this.scene, this.camera);
  }

  getContext() {
    return {
      THREE: this.THREE,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
    };
  }

  assertAvailable() {
    if (this.destroyed) {
      throw new Error(
        "[SceneManager] Scene manager has been destroyed."
      );
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error(
        "[SceneManager] A browser environment is required."
      );
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    if (this.resizeHandler && typeof window !== "undefined") {
      window.removeEventListener("resize", this.resizeHandler);
    }

    this.resizeHandler = null;

    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry?.dispose) {
          object.geometry.dispose();
        }

        const materials = Array.isArray(object.material)
          ? object.material
          : object.material
            ? [object.material]
            : [];

        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value?.isTexture && typeof value.dispose === "function") {
              value.dispose();
            }
          }

          material.dispose?.();
        }
      });

      this.scene.clear();
    }

    if (this.renderer) {
      this.renderer.renderLists?.dispose?.();
      this.renderer.dispose();
      this.renderer.domElement?.remove();
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.THREE = null;
  }
}