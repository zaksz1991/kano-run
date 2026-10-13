import * as THREE from "../../vendor/three.module.js";

export default class RendererSystem {
  constructor(canvas, options = {}) {
    if (!canvas) {
      throw new Error("RendererSystem requires a canvas element.");
    }

    this.canvas = canvas;

    this.options = {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      maxPixelRatio: 2,
      shadows: true,
      toneMappingExposure: 1.1,
      clearColor: 0x87ceeb,
      ...options,
    };

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.options.antialias,
      alpha: this.options.alpha,
      powerPreference: this.options.powerPreference,
    });

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        this.options.maxPixelRatio
      )
    );

    this.renderer.setSize(
      window.innerWidth,
      window.innerHeight,
      false
    );

    this.renderer.shadowMap.enabled = this.options.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure =
      this.options.toneMappingExposure;

    this.renderer.setClearColor(this.options.clearColor, 1);

    this.scene = null;
    this.camera = null;
    this.running = false;
    this.disposed = false;

    this.lastFrameTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsAccumulator = 0;
    this.fpsFrames = 0;

    this.boundResize = this.resize.bind(this);

    window.addEventListener("resize", this.boundResize, {
      passive: true,
    });

    this.resize();
  }

  setScene(scene) {
    this.scene = scene;
    return this;
  }

  setCamera(camera) {
    this.camera = camera;
    return this;
  }

  setPixelRatioLimit(limit) {
    this.options.maxPixelRatio = THREE.MathUtils.clamp(
      limit,
      1,
      3
    );

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        this.options.maxPixelRatio
      )
    );

    this.resize();
  }

  setShadowsEnabled(enabled) {
    this.options.shadows = Boolean(enabled);
    this.renderer.shadowMap.enabled = this.options.shadows;
  }

  setExposure(exposure) {
    this.options.toneMappingExposure = THREE.MathUtils.clamp(
      exposure,
      0.1,
      3
    );

    this.renderer.toneMappingExposure =
      this.options.toneMappingExposure;
  }

  setClearColor(color) {
    this.options.clearColor = color;
    this.renderer.setClearColor(color, 1);
  }

  resize() {
    if (this.disposed) {
      return;
    }

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);

    this.renderer.setSize(width, height, false);

    if (this.camera?.isPerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
  }

  render(scene = this.scene, camera = this.camera) {
    if (
      this.disposed ||
      !scene ||
      !camera ||
      !this.renderer
    ) {
      return;
    }

    this.renderer.render(scene, camera);
    this.frameCount++;
  }

  beginFrame(timestamp = performance.now()) {
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
    }

    const deltaTime = Math.min(
      (timestamp - this.lastFrameTime) / 1000,
      0.1
    );

    this.lastFrameTime = timestamp;

    this.fpsAccumulator += deltaTime;
    this.fpsFrames++;

    if (this.fpsAccumulator >= 1) {
      this.fps = Math.round(
        this.fpsFrames / this.fpsAccumulator
      );

      this.fpsAccumulator = 0;
      this.fpsFrames = 0;
    }

    return deltaTime;
  }

  start() {
    if (this.disposed) {
      return false;
    }

    this.running = true;
    this.lastFrameTime = 0;

    return true;
  }

  stop() {
    this.running = false;
    this.lastFrameTime = 0;
  }

  getRenderer() {
    return this.renderer;
  }

  getStats() {
    return {
      fps: this.fps,
      frames: this.frameCount,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
      running: this.running,
    };
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.stop();

    window.removeEventListener(
      "resize",
      this.boundResize
    );

    this.renderer.dispose();
    this.renderer = null;

    this.scene = null;
    this.camera = null;
    this.disposed = true;
  }
}