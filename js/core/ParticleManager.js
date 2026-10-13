// js/core/ParticleManager.js

export class ParticleManager {
  constructor(options = {}) {
    this.options = {
      maxParticles: 2000,
      maxDeltaTime: 0.05,
      gravity: -9.81,
      defaultLifetime: 1,
      defaultSize: 0.1,
      defaultColor: 0xffffff,
      defaultSpeed: 1,
      ...options,
    };

    this.particles = [];
    this.emitters = new Map();
    this.listeners = new Map();
    this.nextEmitterId = 1;
    this.destroyed = false;

    this.stats = {
      created: 0,
      removed: 0,
      active: 0,
      dropped: 0,
    };
  }

  createEmitter(config = {}) {
    this.ensureActive();

    const id = config.id ?? `emitter-${this.nextEmitterId++}`;

    if (this.emitters.has(id)) {
      throw new Error(`Emitter "${id}" already exists.`);
    }

    const emitter = {
      id,
      position: this.normalizeVector(config.position),
      direction: this.normalizeVector(
        config.direction ?? { x: 0, y: 1, z: 0 }
      ),
      spread: Math.max(0, config.spread ?? 0.5),
      rate: Math.max(0, config.rate ?? 10),
      burst: Math.max(0, Math.floor(config.burst ?? 0)),
      lifetime: Math.max(
        0.001,
        config.lifetime ?? this.options.defaultLifetime
      ),
      lifetimeVariance: Math.max(0, config.lifetimeVariance ?? 0),
      speed: Math.max(0, config.speed ?? this.options.defaultSpeed),
      speedVariance: Math.max(0, config.speedVariance ?? 0),
      size: Math.max(0, config.size ?? this.options.defaultSize),
      sizeEnd: Math.max(0, config.sizeEnd ?? 0),
      sizeVariance: Math.max(0, config.sizeVariance ?? 0),
      color: config.color ?? this.options.defaultColor,
      colorEnd: config.colorEnd ?? null,
      opacity: this.clamp(config.opacity ?? 1, 0, 1),
      opacityEnd: this.clamp(config.opacityEnd ?? 0, 0, 1),
      gravity: config.gravity ?? this.options.gravity,
      drag: this.clamp(config.drag ?? 0, 0, 1),
      duration: Math.max(0, config.duration ?? Infinity),
      elapsed: 0,
      emissionAccumulator: 0,
      active: config.active ?? true,
      loop: config.loop ?? true,
      localSpace: config.localSpace ?? false,
      maxParticles: Math.max(
        0,
        Math.floor(config.maxParticles ?? this.options.maxParticles)
      ),
      onParticleSpawn: config.onParticleSpawn ?? null,
      onParticleDeath: config.onParticleDeath ?? null,
      metadata: config.metadata ?? null,
    };

    this.emitters.set(id, emitter);

    if (emitter.burst > 0) {
      this.emitBurst(id, emitter.burst);
    }

    this.emit("emitter:create", { id, emitter });

    return id;
  }

  emitBurst(emitterId, count = 1) {
    const emitter = this.emitters.get(emitterId);

    if (!emitter) {
      return 0;
    }

    const requested = Math.max(0, Math.floor(count));
    let created = 0;

    for (let i = 0; i < requested; i++) {
      if (!this.spawnParticle(emitter)) {
        break;
      }

      created++;
    }

    return created;
  }

  spawnParticle(emitterOrId, overrides = {}) {
    this.ensureActive();

    const emitter = typeof emitterOrId === "string"
      ? this.emitters.get(emitterOrId)
      : emitterOrId;

    if (!emitter) {
      return null;
    }

    if (
      this.particles.length >= this.options.maxParticles ||
      this.countEmitterParticles(emitter.id) >= emitter.maxParticles
    ) {
      this.stats.dropped++;
      this.emit("particle:dropped", {
        emitterId: emitter.id,
        reason: "capacity",
      });

      return null;
    }

    const lifetime = Math.max(
      0.001,
      overrides.lifetime ??
        emitter.lifetime +
          this.randomSigned() * emitter.lifetimeVariance
    );

    const speed = Math.max(
      0,
      overrides.speed ??
        emitter.speed +
          this.randomSigned() * emitter.speedVariance
    );

    const size = Math.max(
      0,
      overrides.size ??
        emitter.size +
          this.randomSigned() * emitter.sizeVariance
    );

    const direction = this.randomDirection(emitter.direction, emitter.spread);

    const particle = {
      id: `particle-${this.stats.created + 1}`,
      emitterId: emitter.id,
      position: {
        ...emitter.position,
        ...(overrides.position ?? {}),
      },
      velocity: {
        x: direction.x * speed,
        y: direction.y * speed,
        z: direction.z * speed,
      },
      acceleration: {
        x: 0,
        y: emitter.gravity,
        z: 0,
      },
      lifetime,
      age: 0,
      progress: 0,
      size,
      sizeStart: size,
      sizeEnd: overrides.sizeEnd ?? emitter.sizeEnd,
      color: overrides.color ?? emitter.color,
      colorStart: overrides.color ?? emitter.color,
      colorEnd: overrides.colorEnd ?? emitter.colorEnd,
      opacity: overrides.opacity ?? emitter.opacity,
      opacityStart: overrides.opacity ?? emitter.opacity,
      opacityEnd: overrides.opacityEnd ?? emitter.opacityEnd,
      drag: overrides.drag ?? emitter.drag,
      active: true,
      metadata: overrides.metadata ?? null,
      emitter,
    };

    this.particles.push(particle);
    this.stats.created++;
    this.stats.active = this.particles.length;

    this.safeCall(emitter.onParticleSpawn, particle);
    this.emit("particle:spawn", particle);

    return particle;
  }

  update(deltaTime) {
    if (this.destroyed) {
      return;
    }

    const dt = Math.min(
      Math.max(0, Number(deltaTime) || 0),
      this.options.maxDeltaTime
    );

    this.updateEmitters(dt);
    this.updateParticles(dt);

    this.stats.active = this.particles.length;
  }

  updateEmitters(deltaTime) {
    for (const emitter of this.emitters.values()) {
      if (!emitter.active) {
        continue;
      }

      emitter.elapsed += deltaTime;

      if (emitter.elapsed >= emitter.duration) {
        if (emitter.loop) {
          emitter.elapsed = 0;
          emitter.emissionAccumulator = 0;
        } else {
          emitter.active = false;
          this.emit("emitter:complete", {
            id: emitter.id,
            emitter,
          });

          continue;
        }
      }

      if (emitter.rate <= 0) {
        continue;
      }

      emitter.emissionAccumulator += emitter.rate * deltaTime;

      const count = Math.floor(emitter.emissionAccumulator);

      if (count > 0) {
        emitter.emissionAccumulator -= count;
        this.emitBurst(emitter.id, count);
      }
    }
  }

  updateParticles(deltaTime) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];

      particle.age += deltaTime;
      particle.progress = this.clamp(
        particle.age / particle.lifetime,
        0,
        1
      );

      if (particle.age >= particle.lifetime) {
        this.removeParticleAt(i);
        continue;
      }

      particle.velocity.x += particle.acceleration.x * deltaTime;
      particle.velocity.y += particle.acceleration.y * deltaTime;
      particle.velocity.z += particle.acceleration.z * deltaTime;

      const dragFactor = Math.max(0, 1 - particle.drag * deltaTime);

      particle.velocity.x *= dragFactor;
      particle.velocity.y *= dragFactor;
      particle.velocity.z *= dragFactor;

      particle.position.x += particle.velocity.x * deltaTime;
      particle.position.y += particle.velocity.y * deltaTime;
      particle.position.z += particle.velocity.z * deltaTime;

      particle.size = this.lerp(
        particle.sizeStart,
        particle.sizeEnd,
        particle.progress
      );

      particle.opacity = this.lerp(
        particle.opacityStart,
        particle.opacityEnd,
        particle.progress
      );

      if (particle.colorEnd !== null) {
        particle.color = this.interpolateColor(
          particle.colorStart,
          particle.colorEnd,
          particle.progress
        );
      }

      this.emit("particle:update", particle);
    }
  }

  removeParticleAt(index) {
    const [particle] = this.particles.splice(index, 1);

    if (!particle) {
      return false;
    }

    particle.active = false;
    this.stats.removed++;
    this.stats.active = this.particles.length;

    const emitter = this.emitters.get(particle.emitterId);

    if (emitter) {
      this.safeCall(emitter.onParticleDeath, particle);
    }

    this.emit("particle:death", particle);

    return true;
  }

  removeParticle(id) {
    const index = this.particles.findIndex(
      (particle) => particle.id === id
    );

    return index === -1 ? false : this.removeParticleAt(index);
  }

  countEmitterParticles(emitterId) {
    let count = 0;

    for (const particle of this.particles) {
      if (particle.emitterId === emitterId) {
        count++;
      }
    }

    return count;
  }

  setEmitterActive(id, active) {
    const emitter = this.emitters.get(id);

    if (!emitter) {
      return false;
    }

    emitter.active = Boolean(active);

    this.emit("emitter:active", {
      id,
      active: emitter.active,
    });

    return true;
  }

  setEmitterPosition(id, position) {
    const emitter = this.emitters.get(id);

    if (!emitter) {
      return false;
    }

    emitter.position = this.normalizeVector(position);
    return true;
  }

  setEmitterDirection(id, direction) {
    const emitter = this.emitters.get(id);

    if (!emitter) {
      return false;
    }

    emitter.direction = this.normalizeVector(direction);
    return true;
  }

  clearEmitter(id) {
    const emitter = this.emitters.get(id);

    if (!emitter) {
      return false;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i].emitterId === id) {
        this.removeParticleAt(i);
      }
    }

    this.emitters.delete(id);
    this.emit("emitter:remove", { id });

    return true;
  }

  clearAll() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.removeParticleAt(i);
    }

    this.emitters.clear();
    this.stats.active = 0;
  }

  getParticles(emitterId = null) {
    if (emitterId === null) {
      return [...this.particles];
    }

    return this.particles.filter(
      (particle) => particle.emitterId === emitterId
    );
  }

  getEmitter(id) {
    return this.emitters.get(id) ?? null;
  }

  getStats() {
    return {
      ...this.stats,
      emitters: this.emitters.size,
      capacity: this.options.maxParticles,
      utilization: this.options.maxParticles > 0
        ? this.particles.length / this.options.maxParticles
        : 0,
    };
  }

  randomDirection(direction, spread) {
    const base = this.normalizeVector(direction);

    return this.normalizeVector({
      x: base.x + this.randomSigned() * spread,
      y: base.y + this.randomSigned() * spread,
      z: base.z + this.randomSigned() * spread,
    });
  }

  normalizeVector(vector = {}) {
    return {
      x: Number.isFinite(vector.x) ? vector.x : 0,
      y: Number.isFinite(vector.y) ? vector.y : 0,
      z: Number.isFinite(vector.z) ? vector.z : 0,
    };
  }

  randomSigned() {
    return Math.random() * 2 - 1;
  }

  lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  interpolateColor(start, end, amount) {
    const startColor = Number(start) >>> 0;
    const endColor = Number(end) >>> 0;

    const r1 = (startColor >> 16) & 255;
    const g1 = (startColor >> 8) & 255;
    const b1 = startColor & 255;

    const r2 = (endColor >> 16) & 255;
    const g2 = (endColor >> 8) & 255;
    const b2 = endColor & 255;

    const r = Math.round(this.lerp(r1, r2, amount));
    const g = Math.round(this.lerp(g1, g2, amount));
    const b = Math.round(this.lerp(b1, b2, amount));

    return (r << 16) | (g << 8) | b;
  }

  safeCall(callback, payload) {
    if (typeof callback !== "function") {
      return;
    }

    try {
      callback(payload);
    } catch (error) {
      console.error("[ParticleManager] Callback failed:", error);
      this.emit("error", { error, payload });
    }
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Particle event listener must be a function.");
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) {
      return false;
    }

    const removed = callbacks.delete(callback);

    if (callbacks.size === 0) {
      this.listeners.delete(eventName);
    }

    return removed;
  }

  emit(eventName, payload) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) {
      return;
    }

    for (const callback of [...callbacks]) {
      try {
        callback(payload);
      } catch (error) {
        console.error(
          `[ParticleManager] "${eventName}" listener failed:`,
          error
        );
      }
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("ParticleManager has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.clearAll();
    this.listeners.clear();
    this.destroyed = true;
  }
}

export default ParticleManager;