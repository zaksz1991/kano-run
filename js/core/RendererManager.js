import * as THREE from "three";

export class RendererManager {
  constructor(options = {}) {
    this.options = {
      canvas: null,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      maxPixelRatio: 2,
      shadows: true,
      toneMapping: THREE.ACESFilmicToneMapping,
      exposure: 1,
      ...options,
    };

    this.renderer = null;
    this.canvas = null;
    this.container = null;
    this.resizeObserver = null;
    this.contextLost = false;
    this.disposed = false;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.frameCount = 0;
    this.lastFrameTime = 0;

    this.boundResize = this.resize.bind(this);
    this.boundContextLost = this.handleContextLost.bind(this);
    this.boundContextRestored = this.handleContextRestored.bind(this);
    this.boundVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  init(container = null) {
    if (this.disposed) {
      throw new Error("RendererManager has been disposed.");
    }

    if (this.renderer) {
      return this.renderer;
    }

    this.container =
      container ||
      (typeof document !== "undefined"
        ? document.querySelector("#game-container") ||
          document.body
        : null);

    this.canvas =
      this.options.canvas ||
      (typeof document !== "undefined"
        ? document.querySelector("#c") ||
          document.querySelector("canvas")
        : null);

    const rendererOptions = {
      antialias: this.options.antialias,
      alpha: this.options.alpha,
      powerPreference: this.options.powerPreference,
    };

    if (this.canvas) {
      rendererOptions.canvas = this.canvas;
    }

    this.renderer = new THREE.WebGLRenderer(rendererOptions);
    this.canvas = this.renderer.domElement;

    this.renderer.setPixelRatio(
      Math.min(
        this.getDevicePixelRatio(),
        this.options.maxPixelRatio
      )
    );

    this.renderer.setSize(1, 1, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = this.options.toneMapping;
    this.renderer.toneMappingExposure = this.options.exposure;
    this.renderer.shadowMap.enabled = Boolean(
      this.options.shadows
    );
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (this.container && !this.canvas.parentElement) {
      this.container.appendChild(this.canvas);
    }

    this.applyCanvasStyles();
    this.attachEvents();
    this.resize();

    return this.renderer;
  }

  getDevicePixelRatio() {
    if (typeof window === "undefined") {
      return 1;
    }

    return Math.max(1, window.devicePixelRatio || 1);
  }

  applyCanvasStyles() {
    if (!this.canvas) {
      return;
    }

    Object.assign(this.canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      outline: "none",
      touchAction: "none",
    });

    if (!this.canvas.hasAttribute("tabindex")) {
      this.canvas.tabIndex = 0;
    }
  }

  attachEvents() {
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.boundResize, {
        passive: true,
      });

      window.addEventListener(
        "orientationchange",
        this.boundResize,
        { passive: true }
      );
    }

    if (typeof document !== "undefined") {
      document.addEventListener(
        "visibilitychange",
        this.boundVisibilityChange
      );
    }

    if (this.canvas) {
      this.canvas.addEventListener(
        "webglcontextlost",
        this.boundContextLost,
        false
      );

      this.canvas.addEventListener(
        "webglcontextrestored",
        this.boundContextRestored,
        false
      );
    }

    if (
      typeof ResizeObserver !== "undefined" &&
      this.container
    ) {
      this.resizeObserver = new ResizeObserver(
        this.boundResize
      );

      this.resizeObserver.observe(this.container);
    }
  }

  detachEvents() {
    if (typeof window !== "undefined") {
      window.removeEventListener(
        "resize",
        this.boundResize
      );

      window.removeEventListener(
        "orientationchange",
        this.boundResize
      );
    }

    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this.boundVisibilityChange
      );
    }

    if (this.canvas) {
      this.canvas.removeEventListener(
        "webglcontextlost",
        this.boundContextLost
      );

      this.canvas.removeEventListener(
        "webglcontextrestored",
        this.boundContextRestored
      );
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  resize() {
    if (!this.renderer || this.disposed) {
      return;
    }

    const target = this.container || this.canvas;

    const width = Math.max(
      1,
      Math.floor(target?.clientWidth || window.innerWidth || 1)
    );

    const height = Math.max(
      1,
      Math.floor(target?.clientHeight || window.innerHeight || 1)
    );

    const ratio = Math.min(
      this.getDevicePixelRatio(),
      this.options.maxPixelRatio
    );

    const changed =
      width !== this.width ||
      height !== this.height ||
      ratio !== this.pixelRatio;

    if (!changed) {
      return;
    }

    this.width = width;
    this.height = height;
    this.pixelRatio = ratio;

    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);

    this.dispatchResizeEvent();
  }

  dispatchResizeEvent() {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("game:renderer-resize", {
        detail: {
          width: this.width,
          height: this.height,
          aspect: this.width / this.height,
          pixelRatio: this.pixelRatio,
        },
      })
    );
  }

  handleContextLost(event) {
    event.preventDefault();
    this.contextLost = true;

    this.emitLifecycleEvent("game:webgl-context-lost");
  }

  handleContextRestored() {
    this.contextLost = false;

    if (this.renderer) {
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(
        this.width,
        this.height,
        false
      );
    }

    this.emitLifecycleEvent("game:webgl-context-restored");
  }

  handleVisibilityChange() {
    if (typeof document === "undefined") {
      return;
    }

    this.emitLifecycleEvent(
      document.hidden
        ? "game:renderer-hidden"
        : "game:renderer-visible"
    );
  }

  emitLifecycleEvent(name) {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(new CustomEvent(name));
  }

  render(scene, camera) {
    if (
      !this.renderer ||
      this.disposed ||
      this.contextLost ||
      !scene ||
      !camera
    ) {
      return;
    }

    this.renderer.render(scene, camera);

    this.frameCount += 1;
    this.lastFrameTime =
      typeof performance !== "undefined"
        ? performance.now()
        : Date.now();
  }

  clear(color = true, depth = true, stencil = true) {
    if (!this.renderer || this.disposed || this.contextLost) {
      return;
    }

    this.renderer.clear(color, depth, stencil);
  }

  setSize(width, height, updateStyle = false) {
    if (!this.renderer || this.disposed) {
      return;
    }

    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));

    this.renderer.setSize(
      this.width,
      this.height,
      updateStyle
    );

    this.dispatchResizeEvent();
  }

  setPixelRatio(ratio) {
    if (!this.renderer || this.disposed) {
      return;
    }

    this.pixelRatio = Math.max(
      1,
      Math.min(
        Number(ratio) || 1,
        this.options.maxPixelRatio
      )
    );

    this.renderer.setPixelRatio(this.pixelRatio);

    this.renderer.setSize(
      this.width,
      this.height,
      false
    );
  }

  setExposure(exposure) {
    if (!this.renderer || this.disposed) {
      return;
    }

    this.options.exposure = Math.max(
      0,
      Number(exposure) || 1
    );

    this.renderer.toneMappingExposure =
      this.options.exposure;
  }

  setShadows(enabled) {
    if (!this.renderer || this.disposed) {
      return;
    }

    this.options.shadows = Boolean(enabled);
    this.renderer.shadowMap.enabled =
      this.options.shadows;
  }

  setToneMapping(toneMapping) {
    if (!this.renderer || this.disposed) {
      return;
    }

    this.options.toneMapping = toneMapping;
    this.renderer.toneMapping = toneMapping;
  }

  setClearColor(color, alpha = 1) {
    if (!this.renderer || this.disposed) {
      return;
    }

    this.renderer.setClearColor(color, alpha);
  }

  getRenderer() {
    return this.renderer;
  }

  getCanvas() {
    return this.canvas;
  }

  getSize() {
    return {
      width: this.width,
      height: this.height,
      aspect: this.width / this.height,
      pixelRatio: this.pixelRatio,
    };
  }

  getInfo() {
    if (!this.renderer) {
      return null;
    }

    return {
      ...this.getSize(),
      frameCount: this.frameCount,
      lastFrameTime: this.lastFrameTime,
      contextLost: this.contextLost,
      memory: { ...this.renderer.info.memory },
      render: { ...this.renderer.info.render },
      programs: this.renderer.info.programs?.length ?? 0,
    };
  }

  resetFrameStats() {
    if (!this.renderer) {
      return;
    }

    this.frameCount = 0;
    this.renderer.info.reset();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.detachEvents();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }

    this.canvas = null;
    this.container = null;
    this.contextLost = false;
    this.disposed = true;
  }
}

export default RendererManager;