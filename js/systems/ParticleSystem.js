import * as THREE from "three";

const MAX_PARTICLES = 400;

/**
 * GPU-resident particle system — one Points mesh, ring-buffer pool, zero per-frame alloc.
 */
export default class ParticleSystem {
  constructor({
    scene,
    eventBus = null,
    THREE: THREE_NS = null,
    renderer = null,
  } = {}) {
    if (!scene) {
      throw new Error("ParticleSystem requires a Three.js scene.");
    }

    this.THREE = THREE_NS || THREE;
    this.scene = scene;
    this.eventBus = eventBus;
    this.renderer = renderer;

    this.max = MAX_PARTICLES;
    this.cursor = 0;
    this.enabled = true;
    this.disposed = false;

    this.positions = new Float32Array(this.max * 3);
    this.velocities = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.sizes = new Float32Array(this.max);
    this.gravity = new Float32Array(this.max);
    this.drag = new Float32Array(this.max);

    this._scratchColor = new THREE.Color();
    this._lifeAttr = new Float32Array(this.max);

    this._buildGeometry();
    this._buildMaterial();
    this._bindEvents();
  }

  initialize() {
    this.enabled = true;
    return this;
  }

  _buildGeometry() {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3)
    );
    this.geometry.setAttribute(
      "aColor",
      new THREE.BufferAttribute(this.colors, 3)
    );
    this.geometry.setAttribute(
      "aSize",
      new THREE.BufferAttribute(this.sizes, 1)
    );
    this.geometry.setAttribute(
      "aLife",
      new THREE.BufferAttribute(this._lifeAttr, 1)
    );

    this.points = new THREE.Points(this.geometry, null);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.scene.add(this.points);
  }

  _buildMaterial() {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aLife;
        attribute vec3 aColor;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = smoothstep(0.0, 0.15, aLife) * aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (320.0 / max(0.1, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float falloff = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, vAlpha * falloff);
        }
      `,
    });
    this.points.material = this.material;
  }

  spawnBurst({
    position = { x: 0, y: 0.5, z: 0 },
    count = 24,
    color = 0xffaa00,
    speed = 12,
    spread = 1.0,
    gravity = -22,
    drag = 1.8,
    lifespan = 0.7,
    size = 0.18,
  } = {}) {
    if (this.disposed || !this.enabled) return;

    this._scratchColor.set(color);

    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = idx * 3;

      this.positions[i3] = position.x;
      this.positions[i3 + 1] = position.y;
      this.positions[i3 + 2] = position.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const mag = speed * (0.4 + Math.random() * 0.6);

      this.velocities[i3] =
        Math.sin(phi) * Math.cos(theta) * mag * spread;
      this.velocities[i3 + 1] = Math.abs(Math.cos(phi)) * mag * 0.8;
      this.velocities[i3 + 2] =
        Math.sin(phi) * Math.sin(theta) * mag * spread;

      this.colors[i3] = this._scratchColor.r;
      this.colors[i3 + 1] = this._scratchColor.g;
      this.colors[i3 + 2] = this._scratchColor.b;

      const life = lifespan * (0.6 + Math.random() * 0.4);
      this.life[idx] = life;
      this.maxLife[idx] = life;
      this.sizes[idx] = size * (0.7 + Math.random() * 0.6);
      this.gravity[idx] = gravity;
      this.drag[idx] = drag;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }

  _bindEvents() {
    if (!this.eventBus?.on || this._bound) return;
    this._bound = true;

    this.eventBus.on("collision:detected", (p = {}) => {
      const pos = p.position || { x: 0, y: 0.8, z: 0 };
      const weight = Number(p.weight) || Number(p.relativeSpeed) || 1;
      this.spawnBurst({
        position: pos,
        count: 28 + Math.floor(weight * 2),
        color: 0xffb020,
        speed: 14,
        gravity: -24,
        lifespan: 0.6,
        size: 0.2,
      });
      this.spawnBurst({
        position: { x: pos.x, y: pos.y + 0.3, z: pos.z },
        count: 10,
        color: 0x555555,
        speed: 3,
        gravity: 2.5,
        drag: 3.0,
        lifespan: 1.4,
        size: 0.55,
      });
    });

    this.eventBus.on("collision:near-miss", (p = {}) => {
      const pos = p.position || { x: 0, y: 0.6, z: 2 };
      this.spawnBurst({
        position: pos,
        count: 8,
        color: 0x00b4d8,
        speed: 6,
        gravity: -4,
        lifespan: 0.35,
        size: 0.12,
      });
    });

    this.eventBus.on("traffic:near-miss", (p = {}) => {
      this.spawnBurst({
        position: p?.position || { x: 0, y: 0.5, z: 1 },
        count: 6,
        color: 0x00b4d8,
        speed: 5,
        gravity: -3,
        lifespan: 0.3,
        size: 0.1,
      });
    });
  }

  update(delta) {
    if (!this.enabled || this.disposed) return;
    const dt = Math.min(Number(delta) || 0, 0.05);

    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this._lifeAttr[i] = 0;
        continue;
      }

      this.life[i] -= dt;
      const i3 = i * 3;

      this.velocities[i3 + 1] += this.gravity[i] * dt;
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.velocities[i3] *= damp;
      this.velocities[i3 + 1] *= damp;
      this.velocities[i3 + 2] *= damp;

      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      if (this.positions[i3 + 1] < 0.05) {
        this.positions[i3 + 1] = 0.05;
        this.velocities[i3 + 1] *= -0.35;
      }

      this._lifeAttr[i] = Math.max(
        0,
        this.life[i] / Math.max(0.001, this.maxLife[i])
      );
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
  }

  setWeather() {
    // Weather particles handled separately if needed; keep API
  }

  dispose() {
    this.disposed = true;
    this.enabled = false;
    if (this.points) this.scene.remove(this.points);
    this.geometry?.dispose();
    this.material?.dispose();
  }

  destroy() {
    this.dispose();
  }
}
