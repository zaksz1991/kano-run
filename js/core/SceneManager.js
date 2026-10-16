import * as THREE_NS from "three";
import PostProcessing from "./PostProcessing.js";
import GAME_CONFIG from "./config.js";

const THREE_STATIC = THREE_NS;

export default class SceneManager {
  constructor(options = {}) {
    this.THREE = options.THREE ?? null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.post = null;

    this.backgroundColor = options.backgroundColor ?? 0x87b8d8;
    this.fogColor = options.fogColor ?? 0xc5d4c8;

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
      options.fogNear ?? 35,
      options.fogFar ?? 160
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

    if (this.renderer.domElement) {
      Object.assign(this.renderer.domElement.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        display: "block",
        zIndex: "0",
      });
    }
    this.renderer.setClearColor(this.backgroundColor, 1);
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

    this.renderer.shadowMap.enabled = options.shadows ?? true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if ("outputColorSpace" in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    if ("toneMapping" in this.renderer && THREE.ACESFilmicToneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
    }

    // Slightly sharper on mid-range mobiles without crushing blacks
    if ("physicallyCorrectLights" in this.renderer) {
      this.renderer.physicallyCorrectLights = true;
    }

    const container =
      options.container ??
      document.getElementById("game-container") ??
      document.body;

    container.appendChild(this.renderer.domElement);

    this.resizeHandler = () => this.resize();
    window.addEventListener("resize", this.resizeHandler);

    this.createDefaultLighting();

    // Initialize Post-Processing
    this.post = new PostProcessing({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      THREE: this.THREE,
    });

    // Initialize the adaptive quality governor
    this._initGovernor();

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

    // Soft hemisphere only — full sun/fill comes from LightingSystem
    // (avoids double-bright overlapping directional lights)
    const ambient = new THREE.HemisphereLight(
      0xd8e8f5,
      0x8a7355,
      0.55
    );

    ambient.name = "kano-ambient-light";
    this.scene.add(ambient);
    this._defaultHemisphere = ambient;
  }

  getAspectRatio() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);

    return width / height;
  }

  resize() {
    if (this.destroyed || !this.camera || !this.renderer) {
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
    
    // Resize the post-processing composer as well
    this.post?.setSize(width, height);
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

  render(delta = 0) {
    if (this.destroyed || !this.scene || !this.camera || !this.renderer) {
      return;
    }

    // Use post-processing if available, otherwise fallback to standard render
    if (this.post) {
      this.post.render(delta);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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
      throw new Error("[SceneManager] Scene manager has been destroyed.");
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("[SceneManager] A browser environment is required.");
    }
  }

  // --- ADAPTIVE QUALITY GOVERNOR ---
  _initGovernor() {
    this._frames = 0;
    this._accum = 0;
    this._tierDrops = 0;          // never downgrade more than twice
    this._lastCheck = performance.now();
  }

  govern(dt) {
    if (!this.post) return; // Safety check
    
    this._frames++;
    this._accum += dt;
    const now = performance.now();
    
    // Sample every 2 seconds
    if (now - this._lastCheck < 2000) return; 

    const avgFps = this._frames / (this._accum || 1);
    this._frames = 0; 
    this._accum = 0; 
    this._lastCheck = now;

    // Hysteresis: stop oscillating after 2 drops
    if (this._tierDrops >= 2) return;          

    if (avgFps < 42) {
      this._tierDrops++;
      const next = this.post.tier === 'high' ? 'medium' : 'low';
      this.post.setTier(next);
      
      if (next === 'low') {
        this.renderer.shadowMap.enabled = false;
        this.renderer.setPixelRatio(1);
      }
      console.info(`[KanoRun] Perf tier → ${next} (${avgFps.toFixed(0)} fps)`);
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    if (this.resizeHandler && typeof window !== "undefined") {
      window.removeEventListener("resize", this.resizeHandler);
    }

    this.resizeHandler = null;

    // Clean up post-processing first
    if (this.post) {
      this.post.dispose();
      this.post = null;
    }

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