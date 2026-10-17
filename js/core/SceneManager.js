import * as THREE_NS from "three";
import PostProcessing from "./PostProcessing.js";
import GAME_CONFIG from "./config.js";

const THREE_STATIC = THREE_NS;

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return (
    window.innerWidth <= 900 ||
    (window.matchMedia && matchMedia("(pointer: coarse)").matches)
  );
}

function viewportSize() {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const width = Math.max(
    1,
    Math.floor(
      vv?.width ||
        window.innerWidth ||
        document.documentElement?.clientWidth ||
        1,
    ),
  );
  const height = Math.max(
    1,
    Math.floor(
      vv?.height ||
        window.innerHeight ||
        document.documentElement?.clientHeight ||
        1,
    ),
  );
  return { width, height };
}

/**
 * SceneManager — mobile black-screen fix focused.
 *
 * Root causes addressed:
 * 1) Empty #c canvas left on top of a second WebGL canvas
 * 2) Post-processing composer failing on many Android GPUs
 * 3) Wrong size/aspect after orientation / URL-bar resize
 * 4) devicePixelRatio too high for weak GPUs
 */
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
    this._isMobile = isMobileDevice();
  }

  async initialize(options = {}) {
    this.assertAvailable();

    if (!this.THREE) {
      this.THREE = await this.loadThree(options.threePath);
    }

    const THREE = this.THREE;
    this._isMobile = isMobileDevice();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.backgroundColor);
    this.scene.fog = new THREE.Fog(
      this.fogColor,
      options.fogNear ?? 35,
      options.fogFar ?? 160,
    );

    const { width, height } = viewportSize();

    this.camera = new THREE.PerspectiveCamera(
      options.fov ?? (this._isMobile ? 58 : 65),
      width / height,
      options.near ?? 0.1,
      options.far ?? 500,
    );
    this.camera.position.set(0, 5, -8);
    this.camera.lookAt(0, 1, 10);

    // Bind to existing #c — never create a second full-screen canvas under/over it
    const existingCanvas =
      options.canvas ||
      (typeof document !== "undefined" ? document.getElementById("c") : null);

    this.renderer = new THREE.WebGLRenderer({
      canvas: existingCanvas || undefined,
      antialias: options.antialias ?? !this._isMobile,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });

    const el = this.renderer.domElement;
    if (el) {
      el.id = "c";
      Object.assign(el.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        display: "block",
        zIndex: "0",
        touchAction: "none",
        background: "#87b8d8",
      });
    }

    this.renderer.setClearColor(this.backgroundColor, 1);
    this.renderer.setPixelRatio(
      Math.min(
        (typeof window !== "undefined" && window.devicePixelRatio) || 1,
        this._isMobile ? 1.25 : options.maxPixelRatio ?? 2,
      ),
    );
    this.renderer.setSize(width, height, false);

    // Shadows are expensive and can black-out some mobile drivers
    this.renderer.shadowMap.enabled = options.shadows ?? !this._isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if ("outputColorSpace" in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    if ("toneMapping" in this.renderer && THREE.ACESFilmicToneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = this._isMobile ? 1.35 : 1.15;
    }

    const container =
      options.container ||
      (typeof document !== "undefined" &&
        document.getElementById("game-container")) ||
      (typeof document !== "undefined" && document.body);

    if (el && container && el.parentElement !== container) {
      container.appendChild(el);
    }

    // Remove any other canvas nodes that can cover the WebGL surface on Android
    if (container) {
      for (const child of [...container.querySelectorAll("canvas")]) {
        if (child !== el) child.remove();
      }
    }

    // Post-processing: desktop only. Mobile composer often yields a black frame.
    this.post = null;
    if (!this._isMobile) {
      try {
        this.post = new PostProcessing({
          scene: this.scene,
          camera: this.camera,
          renderer: this.renderer,
          THREE,
        });
        await this.post?._initPromise;
        if (!this.post?.ready && !this.post?.composer) {
          this.post = null;
        }
      } catch (err) {
        console.warn("[SceneManager] PostProcessing disabled:", err);
        this.post = null;
      }
    }

    this.resizeHandler = () => this.resize();
    window.addEventListener("resize", this.resizeHandler);
    window.addEventListener("orientationchange", this.resizeHandler);
    window.visualViewport?.addEventListener?.("resize", this.resizeHandler);
    window.visualViewport?.addEventListener?.("scroll", this.resizeHandler);

    // Android chrome URL-bar settle
    setTimeout(() => this.resize(), 50);
    setTimeout(() => this.resize(), 300);
    setTimeout(() => this.resize(), 1000);

    this._initGovernor();

    console.info(
      `[SceneManager] ready mobile=${this._isMobile} size=${width}x${height} post=${Boolean(this.post)}`,
    );

    return this;
  }

  getAspectRatio() {
    const { width, height } = viewportSize();
    return width / height;
  }

  resize() {
    if (this.destroyed || !this.camera || !this.renderer) return;

    this._isMobile = isMobileDevice();
    const { width, height } = viewportSize();

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        this._isMobile ? 1.25 : 2,
      ),
    );
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(this.backgroundColor, 1);

    try {
      this.post?.setSize?.(width, height);
    } catch {}
  }

  render(delta = 0) {
    if (this.destroyed || !this.scene || !this.camera || !this.renderer) {
      return;
    }

    // Always clear to sky blue so a failed frame is never pure black
    this.renderer.setClearColor(this.backgroundColor, 1);

    // Mobile: never touch post pipeline
    if (this._isMobile || !this.post) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    try {
      this.post.render(delta);
    } catch (err) {
      console.warn("[SceneManager] post render failed, fallback", err);
      this.post = null;
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

  async loadThree(threePath) {
    if (THREE_STATIC) return THREE_STATIC;
    if (threePath) {
      const mod = await import(/* @vite-ignore */ threePath);
      return mod.default || mod;
    }
    return THREE_STATIC;
  }

  _initGovernor() {
    this._frames = 0;
    this._accum = 0;
    this._tierDrops = 0;
    this._lastCheck = performance.now();
  }

  govern(dt) {
    if (!this.post) return;

    this._frames++;
    this._accum += dt;
    const now = performance.now();
    if (now - this._lastCheck < 2000) return;

    const avgFps = this._frames / (this._accum || 1);
    this._frames = 0;
    this._accum = 0;
    this._lastCheck = now;

    if (this._tierDrops >= 2) return;

    if (avgFps < 42) {
      this._tierDrops++;
      const next = this.post.tier === "high" ? "medium" : "low";
      this.post.setTier?.(next);
      if (next === "low") {
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
      window.removeEventListener("orientationchange", this.resizeHandler);
      window.visualViewport?.removeEventListener?.("resize", this.resizeHandler);
      window.visualViewport?.removeEventListener?.("scroll", this.resizeHandler);
    }
    this.resizeHandler = null;

    if (this.post) {
      try {
        this.post.dispose?.();
      } catch {}
      this.post = null;
    }

    if (this.scene) {
      this.scene.traverse((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material)
          ? object.material
          : object.material
            ? [object.material]
            : [];
        for (const material of materials) {
          for (const value of Object.values(material || {})) {
            if (value?.isTexture) value.dispose?.();
          }
          material.dispose?.();
        }
      });
      this.scene.clear();
    }

    if (this.renderer) {
      this.renderer.renderLists?.dispose?.();
      this.renderer.dispose();
      // Do not remove #c node from DOM — page owns it
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.THREE = null;
  }
}
