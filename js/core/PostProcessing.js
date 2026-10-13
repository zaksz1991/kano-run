/**
 * Optional post-processing with adaptive quality tiers.
 * Falls back silently if three/examples postprocessing is unavailable.
 */
export default class PostProcessing {
  constructor({ scene, camera, renderer, THREE }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.THREE = THREE;
    this.composer = null;
    this.bloom = null;
    this.grade = null;
    this.tier = "high";
    this.ready = false;
    this._initPromise = this._init();
  }

  async _init() {
    try {
      const [
        { EffectComposer },
        { RenderPass },
        { UnrealBloomPass },
        { ShaderPass },
        { OutputPass },
      ] = await Promise.all([
        import("three/examples/jsm/postprocessing/EffectComposer.js"),
        import("three/examples/jsm/postprocessing/RenderPass.js"),
        import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
        import("three/examples/jsm/postprocessing/ShaderPass.js"),
        import("three/examples/jsm/postprocessing/OutputPass.js"),
      ]);

      const THREE = this.THREE;
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);

      const rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        samples: 0,
      });

      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(w / 2, h / 2),
        0.45,
        0.8,
        0.85
      );
      this.composer.addPass(this.bloom);

      const VignetteChromaShader = {
        uniforms: {
          tDiffuse: { value: null },
          uVignette: { value: 1.1 },
          uAberration: { value: 0.0012 },
          uTime: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float uVignette;
          uniform float uAberration;
          varying vec2 vUv;
          void main() {
            vec2 c = vUv - 0.5;
            float dist = length(c);
            vec2 offset = c * uAberration * (1.0 + dist * 4.0);
            vec4 col;
            col.r = texture2D(tDiffuse, vUv + offset).r;
            col.g = texture2D(tDiffuse, vUv).g;
            col.b = texture2D(tDiffuse, vUv - offset).b;
            col.a = 1.0;
            float vig = smoothstep(0.85, 0.25, dist * uVignette);
            col.rgb *= mix(0.6, 1.0, vig);
            gl_FragColor = col;
          }
        `,
      };

      this.grade = new ShaderPass(VignetteChromaShader);
      this.composer.addPass(this.grade);
      this.composer.addPass(new OutputPass());

      this.ready = true;
      console.log("[Kano Run] Post-processing ready");
    } catch (err) {
      console.warn(
        "[Kano Run] Post-processing unavailable, using direct render:",
        err?.message || err
      );
      this.ready = false;
    }
  }

  async ensureReady() {
    await this._initPromise;
    return this.ready;
  }

  render(delta = 0) {
    if (!this.ready || !this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.grade?.uniforms?.uTime) {
      this.grade.uniforms.uTime.value += delta;
    }
    this.composer.render(delta);
  }

  setSize(w, h) {
    this.composer?.setSize(w, h);
  }

  setTier(tier) {
    if (tier === this.tier) return;
    this.tier = tier;
    if (this.bloom) this.bloom.enabled = tier === "high";
    if (this.grade) this.grade.enabled = tier !== "low";
  }

  setSpeedAberration(speedRatio = 0) {
    if (!this.grade?.uniforms?.uAberration) return;
    const r = Math.min(1, Math.max(0, speedRatio));
    this.grade.uniforms.uAberration.value = 0.0008 + r * 0.002;
  }

  dispose() {
    try {
      this.composer?.dispose?.();
      this.bloom?.dispose?.();
    } catch (e) {}
  }
}
