class Timer {
  #duration;
  #elapsed = 0;
  #running = false;
  #completed = false;
  #repeat;
  #maxDelta;
  #onComplete;
  #completionCount = 0;

  constructor(options = {}) {
    const {
      duration = 1000,
      repeat = false,
      maxDelta = 0.1,
      onComplete = null,
      autoStart = false,
    } = options;

    this.#duration = Math.max(0, Number(duration) || 0);
    this.#repeat = Boolean(repeat);
    this.#maxDelta = Math.max(0, Number(maxDelta) || 0.1);
    this.#onComplete =
      typeof onComplete === "function" ? onComplete : null;

    if (autoStart) {
      this.start();
    }
  }

  get duration() {
    return this.#duration;
  }

  get elapsed() {
    return this.#elapsed;
  }

  get remaining() {
    return Math.max(0, this.#duration - this.#elapsed);
  }

  get progress() {
    if (this.#duration === 0) {
      return this.#completed ? 1 : 0;
    }

    return Math.min(1, this.#elapsed / this.#duration);
  }

  get running() {
    return this.#running;
  }

  get completed() {
    return this.#completed;
  }

  get completionCount() {
    return this.#completionCount;
  }

  start(options = {}) {
    const { reset = false } = options;

    if (reset) {
      this.reset();
    }

    if (this.#completed && !this.#repeat) {
      return this;
    }

    this.#running = true;

    if (this.#duration === 0) {
      this.#finish();
    }

    return this;
  }

  pause() {
    this.#running = false;
    return this;
  }

  resume() {
    if (!this.#completed || this.#repeat) {
      this.#running = true;
    }

    return this;
  }

  stop() {
    this.#running = false;
    return this;
  }

  reset(options = {}) {
    const { autoStart = false } = options;

    this.#elapsed = 0;
    this.#running = false;
    this.#completed = false;
    this.#completionCount = 0;

    if (autoStart) {
      this.start();
    }

    return this;
  }

  setDuration(duration, options = {}) {
    const { preserveProgress = false } = options;
    const oldProgress = this.progress;

    this.#duration = Math.max(0, Number(duration) || 0);

    if (preserveProgress) {
      this.#elapsed = this.#duration * oldProgress;
    } else {
      this.#elapsed = Math.min(this.#elapsed, this.#duration);
    }

    this.#completed =
      this.#duration > 0 && this.#elapsed >= this.#duration;

    return this;
  }

  setRepeat(repeat) {
    this.#repeat = Boolean(repeat);
    return this;
  }

  setOnComplete(callback) {
    this.#onComplete =
      typeof callback === "function" ? callback : null;

    return this;
  }

  update(deltaSeconds) {
    if (!this.#running) {
      return false;
    }

    const delta = Number(deltaSeconds);

    if (!Number.isFinite(delta) || delta <= 0) {
      return false;
    }

    const deltaMs = Math.min(delta, this.#maxDelta) * 1000;

    if (this.#duration === 0) {
      this.#finish();
      return true;
    }

    this.#elapsed += deltaMs;

    if (this.#elapsed >= this.#duration) {
      this.#finish();
      return true;
    }

    return false;
  }

  advanceMilliseconds(deltaMs) {
    if (!this.#running) {
      return false;
    }

    const delta = Number(deltaMs);

    if (!Number.isFinite(delta) || delta <= 0) {
      return false;
    }

    return this.update(delta / 1000);
  }

  #finish() {
    this.#completionCount += 1;

    const overflow =
      this.#duration > 0
        ? Math.max(0, this.#elapsed - this.#duration)
        : 0;

    this.#completed = true;

    if (this.#repeat) {
      this.#elapsed =
        this.#duration > 0 ? overflow % this.#duration : 0;

      this.#completed = false;
      this.#running = true;
    } else {
      this.#elapsed = this.#duration;
      this.#running = false;
    }

    if (this.#onComplete) {
      try {
        this.#onComplete(this);
      } catch (error) {
        if (typeof console !== "undefined" && console.error) {
          console.error("Timer completion callback failed:", error);
        }
      }
    }
  }

  destroy() {
    this.#running = false;
    this.#onComplete = null;
  }
}

export { Timer };
export default Timer;