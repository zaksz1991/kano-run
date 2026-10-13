class Clock {
  #lastTime = 0;
  #elapsed = 0;
  #delta = 0;
  #totalElapsed = 0;
  #timeScale = 1;
  #maxDelta;
  #paused = false;
  #started = false;
  #frameCount = 0;
  #fps = 0;
  #fpsElapsed = 0;
  #fpsFrames = 0;

  constructor(options = {}) {
    const {
      maxDelta = 0.1,
      timeScale = 1,
      autoStart = false,
    } = options;

    this.#maxDelta = Math.max(0.001, Number(maxDelta) || 0.1);
    this.#timeScale = Math.max(0, Number(timeScale) || 0);

    if (autoStart) {
      this.start();
    }
  }

  get delta() {
    return this.#delta;
  }

  get elapsed() {
    return this.#elapsed;
  }

  get totalElapsed() {
    return this.#totalElapsed;
  }

  get timeScale() {
    return this.#timeScale;
  }

  get paused() {
    return this.#paused;
  }

  get started() {
    return this.#started;
  }

  get frameCount() {
    return this.#frameCount;
  }

  get fps() {
    return this.#fps;
  }

  get deltaMilliseconds() {
    return this.#delta * 1000;
  }

  get elapsedMilliseconds() {
    return this.#elapsed * 1000;
  }

  get totalElapsedMilliseconds() {
    return this.#totalElapsed * 1000;
  }

  start(now = this.#now()) {
    this.#lastTime = Number(now);
    this.#elapsed = 0;
    this.#delta = 0;
    this.#totalElapsed = 0;
    this.#frameCount = 0;
    this.#fps = 0;
    this.#fpsElapsed = 0;
    this.#fpsFrames = 0;
    this.#paused = false;
    this.#started = true;

    return this;
  }

  tick(now = this.#now()) {
    if (!this.#started) {
      this.start(now);
      return 0;
    }

    if (this.#paused) {
      this.#delta = 0;
      this.#lastTime = Number(now);
      return 0;
    }

    const currentTime = Number(now);

    if (!Number.isFinite(currentTime)) {
      this.#delta = 0;
      return 0;
    }

    const rawDelta = Math.max(
      0,
      (currentTime - this.#lastTime) / 1000
    );

    this.#lastTime = currentTime;

    this.#delta = Math.min(rawDelta, this.#maxDelta) * this.#timeScale;
    this.#elapsed = this.#delta;
    this.#totalElapsed += this.#delta;
    this.#frameCount += 1;

    this.#updateFPS(rawDelta);

    return this.#delta;
  }

  pause() {
    this.#paused = true;
    this.#delta = 0;
    return this;
  }

  resume(now = this.#now()) {
    this.#lastTime = Number(now);
    this.#paused = false;
    this.#started = true;
    this.#delta = 0;

    return this;
  }

  setTimeScale(scale) {
    const value = Number(scale);

    if (Number.isFinite(value)) {
      this.#timeScale = Math.max(0, value);
    }

    return this;
  }

  setMaxDelta(seconds) {
    const value = Number(seconds);

    if (Number.isFinite(value) && value > 0) {
      this.#maxDelta = value;
    }

    return this;
  }

  reset(now = this.#now()) {
    return this.start(now);
  }

  getSnapshot() {
    return {
      delta: this.#delta,
      elapsed: this.#elapsed,
      totalElapsed: this.#totalElapsed,
      timeScale: this.#timeScale,
      paused: this.#paused,
      started: this.#started,
      frameCount: this.#frameCount,
      fps: this.#fps,
    };
  }

  #updateFPS(rawDelta) {
    this.#fpsElapsed += rawDelta;
    this.#fpsFrames += 1;

    if (this.#fpsElapsed >= 0.5) {
      this.#fps = this.#fpsElapsed > 0
        ? this.#fpsFrames / this.#fpsElapsed
        : 0;

      this.#fpsElapsed = 0;
      this.#fpsFrames = 0;
    }
  }

  #now() {
    if (
      typeof globalThis.performance !== "undefined" &&
      typeof globalThis.performance.now === "function"
    ) {
      return globalThis.performance.now();
    }

    return Date.now();
  }
}

export { Clock };
export default Clock;