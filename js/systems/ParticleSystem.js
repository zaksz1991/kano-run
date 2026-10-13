const PARTICLE_PRESETS = Object.freeze({
  rain: {
    count: 900,
    color: 0xb9d9ef,
    size: 0.07,
    speed: 24,
    spreadX: 24,
    spreadY: 14,
    spreadZ: 65,
    opacity: 0.65,
  },
  storm: {
    count: 1500,
    color: 0xd4e6f5,
    size: 0.09,
    speed: 36,
    spreadX: 28,
    spreadY: 18,
    spreadZ: 75,
    opacity: 0.8,
  },
  harmattan: {
    count: 500,
    color: 0xcbb58e,
    size: 0.12,
    speed: 2.5,
    spreadX: 30,
    spreadY: 12,
    spreadZ: 70,
    opacity: 0.3,
  },
  dust: {
    count: 250,
    color: 0xc99c58,
    size: 0.1,
    speed: 1.8,
    spreadX: 18,
    spreadY: 5,
    spreadZ: 50,
    opacity: 0.35,
  },
});

export default class ParticleSystem {
  constructor({
    THREE,
    scene,
    eventBus = null,
    camera = null,
    maxParticles = 1600,
  } = {}) {
    if (!THREE || !scene) {
      throw new Error(
        "ParticleSystem requires THREE and scene."
      );
    }

    this.THREE = THREE;
    this.scene = scene;
    this.eventBus = eventBus;
    this.camera = camera;
    this.maxParticles = Math.max(100, maxParticles);

    this.groups = new Map();
    this.activeWeather = null;
    this.disposed = false;

    this.onWeatherChanged = (payload) => {
      const weather =
        typeof payload === "string"
          ? payload
          : payload?.weather ?? payload?.type;

      this.setWeather(weather ?? "clear");
    };

    this.unsubscribeWeather = this.eventBus?.on?.(
      "weather:changed",
      this.onWeatherChanged
    );

    this.setWeather("clear");
  }

  setWeather(weather) {
    if (this.disposed) return;

    if (weather === this.activeWeather) return;

    this.clearAll();
    this.activeWeather = weather;

    if (weather === "rain" || weather === "storm") {
      this.createParticles(weather);
    } else if (weather === "harmattan") {
      this.createParticles("harmattan");
    }

    this.eventBus?.emit?.("particles:weather-updated", {
      weather,
      active: this.groups.size > 0,
    });
  }

  createParticles(presetName) {
    const preset = PARTICLE_PRESETS[presetName];

    if (!preset) return null;

    const count = Math.min(
      preset.count,
      this.maxParticles
    );

    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const index = i * 3;

      positions[index] = this.randomRange(
        -preset.spreadX / 2,
        preset.spreadX / 2
      );

      positions[index + 1] = this.randomRange(
        0,
        preset.spreadY
      );

      positions[index + 2] = this.randomRange(
        -preset.spreadZ,
        0
      );

      velocities[index] = this.randomRange(-0.5, 0.5);

      velocities[index + 1] =
        presetName === "harmattan"
          ? this.randomRange(-0.4, 0.1)
          : -preset.speed * this.randomRange(0.7, 1.3);

      velocities[index + 2] =
        presetName === "harmattan"
          ? -preset.speed * this.randomRange(0.3, 1)
          : -this.randomRange(0, 1.5);
    }

    const geometry = new this.THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new this.THREE.BufferAttribute(positions, 3)
    );

    const material = new this.THREE.PointsMaterial({
      color: preset.color,
      size: preset.size,
      transparent: true,
      opacity: preset.opacity,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new this.THREE.Points(
      geometry,
      material
    );

    points.frustumCulled = false;
    points.renderOrder = 10;

    this.scene.add(points);

    const group = {
      name: presetName,
      preset,
      count,
      geometry,
      material,
      points,
      positions,
      velocities,
    };

    this.groups.set(presetName, group);

    return group;
  }

  update(deltaSeconds, options = {}) {
    if (this.disposed || !Number.isFinite(deltaSeconds)) {
      return;
    }

    const delta = Math.min(
      Math.max(deltaSeconds, 0),
      0.05
    );

    const speed = Math.max(0, options.speed ?? 0);
    const windX = options.windX ?? 0;
    const windZ = options.windZ ?? 0;

    for (const group of this.groups.values()) {
      const {
        count,
        preset,
        positions,
        velocities,
        geometry,
        name,
      } = group;

      for (let i = 0; i < count; i += 1) {
        const index = i * 3;

        positions[index] +=
          (velocities[index] + windX) * delta;

        positions[index + 1] +=
          velocities[index + 1] * delta;

        positions[index + 2] +=
          (velocities[index + 2] - speed + windZ) *
          delta;

        const outOfBounds =
          positions[index + 1] < -1 ||
          positions[index + 1] > preset.spreadY + 2 ||
          Math.abs(positions[index]) > preset.spreadX ||
          positions[index + 2] < -preset.spreadZ ||
          positions[index + 2] > 5;

        if (outOfBounds) {
          this.resetParticle(group, i);
        }
      }

      geometry.attributes.position.needsUpdate = true;

      if (name === "harmattan") {
        group.material.opacity =
          preset.opacity *
          (0.8 + Math.sin(Date.now() * 0.0004) * 0.2);
      }
    }

    this.followCamera();
  }

  resetParticle(group, particleIndex) {
    const {
      positions,
      velocities,
      preset,
      name,
    } = group;

    const index = particleIndex * 3;

    positions[index] = this.randomRange(
      -preset.spreadX / 2,
      preset.spreadX / 2
    );

    positions[index + 1] =
      name === "harmattan"
        ? this.randomRange(0, preset.spreadY)
        : preset.spreadY;

    positions[index + 2] = this.randomRange(
      -preset.spreadZ,
      -preset.spreadZ * 0.5
    );

    velocities[index] = this.randomRange(-0.5, 0.5);

    velocities[index + 1] =
      name === "harmattan"
        ? this.randomRange(-0.4, 0.1)
        : -preset.speed * this.randomRange(0.7, 1.3);

    velocities[index + 2] =
      name === "harmattan"
        ? -preset.speed * this.randomRange(0.3, 1)
        : -this.randomRange(0, 1.5);
  }

  followCamera() {
    if (!this.camera) return;

    for (const group of this.groups.values()) {
      group.points.position.x = this.camera.position.x;
      group.points.position.y = this.camera.position.y;
      group.points.position.z = this.camera.position.z;
    }
  }

  clearAll() {
    for (const group of this.groups.values()) {
      this.scene?.remove(group.points);
      group.geometry.dispose();
      group.material.dispose();
    }

    this.groups.clear();
  }

  randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  getSnapshot() {
    return {
      weather: this.activeWeather,
      active: this.groups.size > 0,
      particleGroups: [...this.groups.keys()],
      totalParticles: [...this.groups.values()].reduce(
        (total, group) => total + group.count,
        0
      ),
    };
  }

  destroy() {
    if (typeof this.unsubscribeWeather === "function") {
      this.unsubscribeWeather();
    }

    this.clearAll();

    this.scene = null;
    this.camera = null;
    this.eventBus = null;
    this.disposed = true;
  }
}

export { PARTICLE_PRESETS };