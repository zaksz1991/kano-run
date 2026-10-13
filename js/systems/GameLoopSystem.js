export default class GameLoopSystem {
  constructor({
    update = () => {},
    render = () => {},
    onError = null,
    maxDelta = 0.05,
    targetFPS = 0,
    autoStart = false,
  } = {}) {
    this.updateCallback = update;
    this.renderCallback = render;
    this.onError = onError;

    this.maxDelta = Math.max(0.001, Number(maxDelta) || 0.05);
    this.targetFPS = Math.max(0, Number(targetFPS) || 0);

    this.running = false;
    this.paused = false;
    this.destroyed = false;

    this.frameId = null;
    this.previousTime = 0;
    this.accumulator = 0;
    this.elapsedTime = 0;
    this.frameCount = 0;
    this.fps = 0;

    this.fpsElapsed = 0;
    this.fpsFrames = 0;
    this.frameInterval = this.targetFPS > 0
      ? 1000 / this.targetFPS
      : 0;

    this.boundFrame = this.frame.bind(this);

    if (autoStart) {
      this.start();
    }
  }

  start() {
    if (this.destroyed || this.running) return false;

    this.running = true;
    this.paused = false;
    this.previousTime = 0;
    this.accumulator = 0;

    this.frameId = requestAnimationFrame(this.boundFrame);

    return true;
  }

  stop() {
    if (!this.running) return false;

    this.running = false;

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    this.previousTime = 0;
    this.accumulator = 0;

    return true;
  }

  pause() {
    if (!this.running || this.paused) return false;

    this.paused = true;
    this.previousTime = 0;
    this.accumulator = 0;

    return true;
  }

  resume() {
    if (!this.running || !this.paused || this.destroyed) {
      return false;
    }

    this.paused = false;
    this.previousTime = 0;

    return true;
  }

  frame(timestamp) {
    if (!this.running || this.destroyed) return;

    this.frameId = requestAnimationFrame(this.boundFrame);

    if (this.paused) {
      this.previousTime = 0;
      return;
    }

    if (this.frameInterval > 0) {
      const elapsed = timestamp - this.previousTime;

      if (
        this.previousTime !== 0 &&
        elapsed < this.frameInterval
      ) {
        return;
      }
    }

    let delta = this.previousTime === 0
      ? 0
      : (timestamp - this.previousTime) / 1000;

    this.previousTime = timestamp;

    delta = Math.min(Math.max(delta, 0), this.maxDelta);

    this.elapsedTime += delta;
    this.frameCount += 1;
    this.fpsFrames += 1;
    this.fpsElapsed += delta;

    if (this.fpsElapsed >= 1) {
      this.fps = this.fpsFrames / this.fpsElapsed;
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
    }

    try {
      this.updateCallback(delta, this.elapsedTime);

      this.renderCallback({
        delta,
        elapsedTime: this.elapsedTime,
        frame: this.frameCount,
        fps: this.fps,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  handleError(error) {
    try {
      this.onError?.(error);
    } catch (callbackError) {
      console.error("Game loop error handler failed:", callbackError);
    }

    if (!this.onError) {
      console.error("Kano Run game loop error:", error);
    }
  }

  setUpdate(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Update callback must be a function.");
    }

    this.updateCallback = callback;
  }

  setRender(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Render callback must be a function.");
    }

    this.renderCallback = callback;
  }

  setTargetFPS(fps = 0) {
    this.targetFPS = Math.max(0, Number(fps) || 0);

    this.frameInterval = this.targetFPS > 0
      ? 1000 / this.targetFPS
      : 0;
  }

  getStats() {
    return {
      running: this.running,
      paused: this.paused,
      destroyed: this.destroyed,
      elapsedTime: this.elapsedTime,
      frameCount: this.frameCount,
      fps: Number(this.fps.toFixed(1)),
      targetFPS: this.targetFPS,
    };
  }

  resetStats() {
    this.elapsedTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsElapsed = 0;
    this.fpsFrames = 0;
  }

  destroy() {
    if (this.destroyed) return;

    this.stop();

    this.updateCallback = () => {};
    this.renderCallback = () => {};
    this.onError = null;

    this.destroyed = true;
  }
}