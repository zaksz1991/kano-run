// js/core/AnimationManager.js

export class AnimationManager {
  constructor(options = {}) {
    this.options = {
      maxDeltaTime: 0.1,
      defaultSpeed: 1,
      autoUpdate: true,
      ...options,
    };

    this.animations = new Map();
    this.groups = new Map();
    this.listeners = new Map();
    this.nextId = 1;
    this.lastTime = 0;
    this.frameId = null;
    this.running = false;
    this.destroyed = false;

    this.tick = this.tick.bind(this);
  }

  add(config = {}) {
    if (this.destroyed) {
      throw new Error("AnimationManager has been destroyed.");
    }

    const id = config.id ?? `animation-${this.nextId++}`;

    if (this.animations.has(id)) {
      throw new Error(`Animation "${id}" already exists.`);
    }

    const animation = {
      id,
      from: config.from ?? 0,
      to: config.to ?? 1,
      duration: Math.max(0, config.duration ?? 1000),
      delay: Math.max(0, config.delay ?? 0),
      elapsed: 0,
      speed: config.speed ?? this.options.defaultSpeed,
      repeat: Math.max(0, config.repeat ?? 0),
      repeatCount: 0,
      yoyo: config.yoyo ?? false,
      reversed: false,
      paused: config.paused ?? false,
      playing: config.autoplay !== false,
      completed: false,
      easing: config.easing ?? this.easings.linear,
      onUpdate: config.onUpdate ?? null,
      onComplete: config.onComplete ?? null,
      onStart: config.onStart ?? null,
      onRepeat: config.onRepeat ?? null,
      started: false,
      metadata: config.metadata ?? null,
    };

    if (!Number.isFinite(animation.duration) || animation.duration < 0) {
      throw new RangeError("Animation duration must be non-negative.");
    }

    if (!Number.isFinite(animation.speed) || animation.speed <= 0) {
      throw new RangeError("Animation speed must be greater than zero.");
    }

    if (typeof animation.easing !== "function") {
      throw new TypeError("Animation easing must be a function.");
    }

    this.animations.set(id, animation);

    if (config.group) {
      this.addToGroup(config.group, id);
    }

    if (this.options.autoUpdate && animation.playing) {
      this.start();
    }

    this.emit("add", { id, animation });

    return id;
  }

  update(deltaTime) {
    if (this.destroyed) return;

    const dt = Math.min(
      Math.max(0, Number(deltaTime) || 0),
      this.options.maxDeltaTime
    );

    for (const animation of [...this.animations.values()]) {
      if (
        animation.paused ||
        !animation.playing ||
        animation.completed
      ) {
        continue;
      }

      this.updateAnimation(animation, dt);
    }

    if (this.animations.size === 0) {
      this.stop();
    }
  }

  updateAnimation(animation, deltaTime) {
    animation.elapsed += deltaTime * 1000 * animation.speed;

    if (animation.elapsed < animation.delay) {
      return;
    }

    if (!animation.started) {
      animation.started = true;

      this.safeCall(animation.onStart, {
        id: animation.id,
        animation,
      });

      this.emit("start", { id: animation.id, animation });
    }

    const activeElapsed = animation.elapsed - animation.delay;
    const progress = animation.duration === 0
      ? 1
      : Math.min(1, activeElapsed / animation.duration);

    const easedProgress = animation.easing(progress);
    const start = animation.reversed ? animation.to : animation.from;
    const end = animation.reversed ? animation.from : animation.to;
    const value = start + (end - start) * easedProgress;

    this.safeCall(animation.onUpdate, {
      id: animation.id,
      value,
      progress,
      easedProgress,
      animation,
    });

    this.emit("update", {
      id: animation.id,
      value,
      progress,
      animation,
    });

    if (progress >= 1) {
      this.finishIteration(animation);
    }
  }

  finishIteration(animation) {
    if (animation.repeatCount < animation.repeat) {
      animation.repeatCount++;
      animation.elapsed = animation.delay;
      animation.started = false;

      if (animation.yoyo) {
        animation.reversed = !animation.reversed;
      }

      this.safeCall(animation.onRepeat, {
        id: animation.id,
        repeatCount: animation.repeatCount,
        animation,
      });

      this.emit("repeat", {
        id: animation.id,
        repeatCount: animation.repeatCount,
        animation,
      });

      return;
    }

    animation.completed = true;
    animation.playing = false;

    this.safeCall(animation.onComplete, {
      id: animation.id,
      animation,
    });

    this.emit("complete", {
      id: animation.id,
      animation,
    });

    this.remove(animation.id);
  }

  play(id) {
    const animation = this.animations.get(id);
    if (!animation) return false;

    animation.paused = false;
    animation.playing = true;

    if (this.options.autoUpdate) this.start();

    this.emit("play", { id, animation });
    return true;
  }

  pause(id) {
    const animation = this.animations.get(id);
    if (!animation) return false;

    animation.paused = true;
    this.emit("pause", { id, animation });
    return true;
  }

  resume(id) {
    const animation = this.animations.get(id);
    if (!animation) return false;

    animation.paused = false;
    animation.playing = true;

    if (this.options.autoUpdate) this.start();

    this.emit("resume", { id, animation });
    return true;
  }

  restart(id) {
    const animation = this.animations.get(id);
    if (!animation) return false;

    animation.elapsed = 0;
    animation.repeatCount = 0;
    animation.reversed = false;
    animation.started = false;
    animation.completed = false;
    animation.paused = false;
    animation.playing = true;

    if (this.options.autoUpdate) this.start();

    this.emit("restart", { id, animation });
    return true;
  }

  remove(id) {
    const animation = this.animations.get(id);
    if (!animation) return false;

    this.animations.delete(id);

    for (const [groupName, group] of this.groups) {
      group.delete(id);

      if (group.size === 0) {
        this.groups.delete(groupName);
      }
    }

    this.emit("remove", { id, animation });
    return true;
  }

  get(id) {
    return this.animations.get(id) ?? null;
  }

  has(id) {
    return this.animations.has(id);
  }

  addToGroup(groupName, id) {
    if (!this.animations.has(id)) {
      throw new Error(`Cannot group unknown animation "${id}".`);
    }

    if (!this.groups.has(groupName)) {
      this.groups.set(groupName, new Set());
    }

    this.groups.get(groupName).add(id);
  }

  playGroup(groupName) {
    return this.controlGroup(groupName, "play");
  }

  pauseGroup(groupName) {
    return this.controlGroup(groupName, "pause");
  }

  resumeGroup(groupName) {
    return this.controlGroup(groupName, "resume");
  }

  restartGroup(groupName) {
    return this.controlGroup(groupName, "restart");
  }

  controlGroup(groupName, method) {
    const group = this.groups.get(groupName);
    if (!group) return 0;

    let count = 0;

    for (const id of [...group]) {
      if (this[method](id)) count++;
    }

    return count;
  }

  clearGroup(groupName) {
    const group = this.groups.get(groupName);
    if (!group) return 0;

    let count = 0;

    for (const id of [...group]) {
      if (this.remove(id)) count++;
    }

    this.groups.delete(groupName);
    return count;
  }

  start() {
    if (
      this.running ||
      this.destroyed ||
      typeof requestAnimationFrame !== "function"
    ) {
      return;
    }

    this.running = true;
    this.lastTime = 0;
    this.frameId = requestAnimationFrame(this.tick);
  }

  tick(timestamp) {
    if (!this.running || this.destroyed) return;

    if (this.lastTime === 0) {
      this.lastTime = timestamp;
    }

    const deltaTime = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    this.update(deltaTime);

    if (this.running) {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  stop() {
    this.running = false;

    if (
      this.frameId !== null &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(this.frameId);
    }

    this.frameId = null;
    this.lastTime = 0;
  }

  safeCall(callback, payload) {
    if (typeof callback !== "function") return;

    try {
      callback(payload);
    } catch (error) {
      console.error("[AnimationManager] Callback failed:", error);
      this.emit("error", { error, payload });
    }
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Event listener must be a function.");
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return false;

    const removed = listeners.delete(callback);

    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }

    return removed;
  }

  emit(eventName, payload) {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;

    for (const callback of [...listeners]) {
      try {
        callback(payload);
      } catch (error) {
        console.error(
          `[AnimationManager] "${eventName}" listener failed:`,
          error
        );
      }
    }
  }

  get easings() {
    return {
      linear: (t) => t,
      easeInQuad: (t) => t * t,
      easeOutQuad: (t) => t * (2 - t),
      easeInOutQuad: (t) =>
        t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
      easeInCubic: (t) => t * t * t,
      easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
      easeInOutCubic: (t) =>
        t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2,
      easeOutElastic: (t) =>
        t === 0 || t === 1
          ? t
          : Math.pow(2, -10 * t) *
            Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) +
            1,
      easeOutBounce: (t) => {
        const n = 7.5625;
        const d = 2.75;

        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) {
          return n * (t -= 1.5 / d) * t + 0.75;
        }
        if (t < 2.5 / d) {
          return n * (t -= 2.25 / d) * t + 0.9375;
        }

        return n * (t -= 2.625 / d) * t + 0.984375;
      },
    };
  }

  destroy() {
    if (this.destroyed) return;

    this.stop();
    this.animations.clear();
    this.groups.clear();
    this.listeners.clear();
    this.destroyed = true;
  }
}

export default AnimationManager;