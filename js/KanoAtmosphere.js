import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);

const ATMOSPHERE_PROFILES = {
  night: { background: 0x202c43, fog: 0x2d394e, fogNear: 28, fogFar: 128, hemiFactor: 0.52, directionalFactor: 0.19, tint: 0x8199c4 },
  harmattan: { background: 0xbab5a5, fog: 0xbab5a5, fogNear: 13, fogFar: 88, hemiFactor: 0.90, directionalFactor: 0.66, tint: 0xd1c6ac },
  rain: { background: 0x8098a5, fog: 0x8599a5, fogNear: 25, fogFar: 142, hemiFactor: 0.77, directionalFactor: 0.55, tint: 0x9eafbd },
  dustyRoad: { background: 0xaab3ae, fog: 0xaab3ae, fogNear: 35, fogFar: 160, hemiFactor: 0.91, directionalFactor: 0.76, tint: 0xb8b4a1 },
};

/**
 * Kano Life atmospheric effects.
 *
 * Adds lightweight weather particles and time-of-day lighting to an existing
 * Renderer3D without creating a second renderer, camera, road, or simulation.
 * It temporarily shades scene colors/lights immediately around the active
 * WebGL render call, then restores them to avoid accumulating changes.
 *
 * Supported Game.s environment values include:
 *   clear, harmattan, rainPuddles, muddy, badRoad
 */
export class KanoAtmosphere {
  constructor({ renderer, game, mobile = false, enabled = true } = {}) {
    if (!renderer?.scene?.isScene || !renderer?.camera?.isCamera || !renderer?.renderer?.render) {
      throw new TypeError('KanoAtmosphere requires a live Renderer3D instance.');
    }
    if (!game) {
      throw new TypeError('KanoAtmosphere requires the active Game instance.');
    }

    this.renderer3d = renderer;
    this.scene = renderer.scene;
    this.webgl = renderer.renderer;
    this.game = game;
    this.mobile = Boolean(mobile);
    this.enabled = Boolean(enabled);
    this.disposed = false;
    this.active = false;
    this.night = false;
    this.environment = 'clear';
    this.elapsed = 0;
    this.wind = this.mobile ? 0.36 : 0.48;

    this.scratch = new THREE.Vector3();
    this.scratchTail = new THREE.Vector3();
    this.tintColor = new THREE.Color();
    this.snapshot = {
      background: new THREE.Color(),
      backgroundValid: false,
      fogColor: new THREE.Color(),
      fogValid: false,
      fogNear: 0,
      fogFar: 0,
      lights: [],
    };
    this.originalRender = this.webgl.render;
    this.renderWrapper = (...args) => this.renderWithAtmosphere(...args);

    this.lights = [];
    this.scene.traverse((object) => {
      if (object?.isHemisphereLight || object?.isDirectionalLight) {
        this.lights.push({
          light: object,
          intensity: object.intensity,
          color: object.color.clone(),
          tempColor: object.color.clone(),
        });
      }
    });

    this.rainParticles = [];
    this.dustParticles = [];
    this.createRain();
    this.createDust();

    // This wrapper is installed after KanoCinematicCamera, so both layers can
    // compose. Dispose this layer before disposing the cinematic camera layer.
    this.webgl.render = this.renderWrapper;
  }

  createRain() {
    const count = this.mobile ? 86 : 190;
    this.rainPositions = new Float32Array(count * 2 * 3);
    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xc1d9e4,
      transparent: true,
      opacity: this.mobile ? 0.32 : 0.38,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.rain = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rain.name = 'KANO_ATMOSPHERE_RAIN';
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 990;
    this.rain.visible = false;
    this.scene.add(this.rain);

    for (let index = 0; index < count; index += 1) {
      this.rainParticles.push({
        x: randomBetween(-18, 18),
        y: randomBetween(-7, 18),
        z: randomBetween(-48, -7),
        speed: randomBetween(9, 17),
        drift: randomBetween(-0.7, 0.7),
        length: randomBetween(0.25, 0.68),
      });
    }
  }

  createDust() {
    const count = this.mobile ? 64 : 142;
    this.dustPositions = new Float32Array(count * 3);
    this.dustGeometry = new THREE.BufferGeometry();
    this.dustGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.dustPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.dustMaterial = new THREE.PointsMaterial({
      color: 0xc5b38e,
      size: this.mobile ? 0.19 : 0.24,
      transparent: true,
      opacity: this.mobile ? 0.12 : 0.16,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });
    this.dust = new THREE.Points(this.dustGeometry, this.dustMaterial);
    this.dust.name = 'KANO_ATMOSPHERE_HARMATTAN_DUST';
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 989;
    this.dust.visible = false;
    this.scene.add(this.dust);

    for (let index = 0; index < count; index += 1) {
      this.dustParticles.push({
        x: randomBetween(-20, 20),
        y: randomBetween(-6, 15),
        z: randomBetween(-55, -8),
        drift: randomBetween(-0.42, 0.42),
        rise: randomBetween(-0.05, 0.12),
        phase: randomBetween(0, Math.PI * 2),
      });
    }
  }

  update(dt, state = {}, gameState = this.game?.state) {
    if (this.disposed) return;

    const delta = clamp(Number(dt) || 0, 0, 0.05);
    this.elapsed += delta;
    this.environment = String(state.environment || 'clear');
    this.night = Boolean(state.night);
    this.active = Boolean(
      this.enabled &&
      gameState === 'PLAY' &&
      !state.event &&
      this.renderer3d?.lifeScene === 'road' &&
      this.renderer3d?.world?.visible !== false,
    );

    const raining = this.active && this.environment === 'rainPuddles';
    const dusty = this.active && (
      this.environment === 'harmattan' ||
      this.environment === 'badRoad' ||
      this.environment === 'muddy'
    );

    this.rain.visible = raining;
    this.dust.visible = dusty;

    if (raining) {
      for (const particle of this.rainParticles) {
        particle.y -= particle.speed * delta;
        particle.x += (this.wind + particle.drift) * delta;
        if (particle.y < -9) {
          particle.y = randomBetween(9, 19);
          particle.x = randomBetween(-18, 18);
          particle.z = randomBetween(-48, -7);
        }
        if (particle.x > 20) particle.x = -20;
      }
    }

    if (dusty) {
      for (const particle of this.dustParticles) {
        particle.x += (particle.drift + this.wind * 0.16) * delta;
        particle.y += particle.rise * delta + Math.sin(this.elapsed * 0.7 + particle.phase) * 0.004;
        particle.phase += delta * 0.25;
        if (particle.x > 22) particle.x = -22;
        if (particle.x < -22) particle.x = 22;
        if (particle.y > 16) particle.y = -7;
        if (particle.y < -8) particle.y = 15;
      }
    }
  }

  syncParticleWorldPositions(camera) {
    if (!camera?.isCamera || (!this.rain.visible && !this.dust.visible)) return;
    camera.updateMatrixWorld(true);

    if (this.rain.visible) {
      let offset = 0;
      for (const particle of this.rainParticles) {
        this.scratch.set(particle.x, particle.y, particle.z).applyMatrix4(camera.matrixWorld);
        this.rainPositions[offset++] = this.scratch.x;
        this.rainPositions[offset++] = this.scratch.y;
        this.rainPositions[offset++] = this.scratch.z;

        this.scratchTail.set(
          particle.x - 0.055,
          particle.y + particle.length,
          particle.z,
        ).applyMatrix4(camera.matrixWorld);
        this.rainPositions[offset++] = this.scratchTail.x;
        this.rainPositions[offset++] = this.scratchTail.y;
        this.rainPositions[offset++] = this.scratchTail.z;
      }
      this.rainGeometry.attributes.position.needsUpdate = true;
      this.rainGeometry.computeBoundingSphere();
    }

    if (this.dust.visible) {
      let offset = 0;
      for (const particle of this.dustParticles) {
        this.scratch.set(particle.x, particle.y, particle.z).applyMatrix4(camera.matrixWorld);
        this.dustPositions[offset++] = this.scratch.x;
        this.dustPositions[offset++] = this.scratch.y;
        this.dustPositions[offset++] = this.scratch.z;
      }
      this.dustGeometry.attributes.position.needsUpdate = true;
      this.dustGeometry.computeBoundingSphere();
    }
  }

  atmosphereProfile() {
    if (this.night) return ATMOSPHERE_PROFILES.night;
    if (this.environment === 'harmattan') return ATMOSPHERE_PROFILES.harmattan;
    if (this.environment === 'rainPuddles') return ATMOSPHERE_PROFILES.rain;
    if (this.environment === 'muddy' || this.environment === 'badRoad') {
      return ATMOSPHERE_PROFILES.dustyRoad;
    }
    return null;
  }

  applyAtmosphere(scene) {
    const profile = this.atmosphereProfile();
    if (!profile || !scene) return null;

    // Reuse this snapshot on every frame to avoid per-frame garbage.
    const snapshot = this.snapshot;
    snapshot.backgroundValid = Boolean(scene.background?.isColor);
    if (snapshot.backgroundValid) snapshot.background.copy(scene.background);

    snapshot.fogValid = Boolean(scene.fog?.color?.isColor);
    if (snapshot.fogValid) {
      snapshot.fogColor.copy(scene.fog.color);
      snapshot.fogNear = scene.fog.near;
      snapshot.fogFar = scene.fog.far;
    }
    snapshot.lights.length = 0;

    if (scene.background?.isColor) scene.background.setHex(profile.background);
    if (scene.fog?.color) {
      scene.fog.color.setHex(profile.fog);
      scene.fog.near = profile.fogNear;
      scene.fog.far = profile.fogFar;
    }

    this.tintColor.setHex(profile.tint);
    for (const entry of this.lights) {
      const light = entry.light;
      if (!light || light.parent === null) continue;
      snapshot.lights.push(entry);
      if (light.isHemisphereLight) {
        light.intensity = entry.intensity * profile.hemiFactor;
      } else if (light.isDirectionalLight) {
        light.intensity = entry.intensity * profile.directionalFactor;
      }
      entry.tempColor.copy(entry.color).lerp(this.tintColor, this.night ? 0.28 : 0.13);
      light.color.copy(entry.tempColor);
    }
    return snapshot;
  }

  restoreAtmosphere(scene, snapshot) {
    if (!snapshot || !scene) return;
    if (snapshot.backgroundValid && scene.background?.isColor) {
      scene.background.copy(snapshot.background);
    }
    if (snapshot.fogValid && scene.fog?.color) {
      scene.fog.color.copy(snapshot.fogColor);
      scene.fog.near = snapshot.fogNear;
      scene.fog.far = snapshot.fogFar;
    }
    for (const entry of snapshot.lights) {
      entry.light.intensity = entry.intensity;
      entry.light.color.copy(entry.color);
    }
    snapshot.lights.length = 0;
  }

  renderWithAtmosphere(scene, camera, ...args) {
    if (this.disposed) {
      return this.originalRender.call(this.webgl, scene, camera, ...args);
    }

    this.syncParticleWorldPositions(camera);
    const shouldShade = this.active && this.renderer3d?.lifeScene === 'road';
    const snapshot = shouldShade ? this.applyAtmosphere(scene) : null;

    try {
      return this.originalRender.call(this.webgl, scene, camera, ...args);
    } finally {
      this.restoreAtmosphere(scene, snapshot);
    }
  }

  getDiagnostics() {
    return {
      enabled: this.enabled,
      active: this.active,
      night: this.night,
      environment: this.environment,
      rainVisible: Boolean(this.rain?.visible),
      dustVisible: Boolean(this.dust?.visible),
      mobile: this.mobile,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    // Restore the wrapped render method before camera/renderer teardown.
    if (this.webgl?.render === this.renderWrapper) {
      this.webgl.render = this.originalRender;
    }

    for (const object of [this.rain, this.dust]) {
      if (!object) continue;
      object.parent?.remove(object);
    }

    this.rainGeometry?.dispose();
    this.rainMaterial?.dispose();
    this.dustGeometry?.dispose();
    this.dustMaterial?.dispose();

    this.rainParticles.length = 0;
    this.dustParticles.length = 0;
    this.lights.length = 0;
    this.renderer3d = null;
    this.scene = null;
    this.webgl = null;
    this.game = null;
  }
}
