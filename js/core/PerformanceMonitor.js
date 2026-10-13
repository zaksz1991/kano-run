export default class PerformanceMonitor {
  constructor(options = {}) {
    this.options = {
      sampleInterval: 500,
      historySize: 120,
      slowFrameThreshold: 33.3,
      ...options,
    };

    this.enabled = true;
    this.frameCount = 0;
    this.lastSampleTime = 0;
    this.lastFrameTime = 0;
    this.frameTime = 0;
    this.fps = 0;
    this.minFps = Infinity;
    this.maxFps = 0;
    this.averageFps = 0;
    this.slowFrames = 0;
    this.totalFrames = 0;

    this.frameHistory = [];
    this.fpsHistory = [];

    this.memory = {
      used: 0,
      total: 0,
      limit: 0,
    };

    this.listeners = new Set();
  }

  beginFrame(now = performance.now()) {
    if (!this.enabled) return;

    this.lastFrameTime = now;
  }

  endFrame(now = performance.now()) {
    if (!this.enabled) return;

    if (this.lastFrameTime > 0) {
      this.frameTime = Math.max(0, now - this.lastFrameTime);

      this.frameHistory.push(this.frameTime);

      if (this.frameHistory.length > this.options.historySize) {
        this.frameHistory.shift();
      }

      if (this.frameTime > this.options.slowFrameThreshold) {
        this.slowFrames += 1;
      }
    }

    this.totalFrames += 1;
    this.frameCount += 1;

    if (
      !this.lastSampleTime ||
      now - this.lastSampleTime >= this.options.sampleInterval
    ) {
      this.sample(now);
    }
  }

  sample(now = performance.now()) {
    const elapsed = this.lastSampleTime
      ? now - this.lastSampleTime
      : this.options.sampleInterval;

    if (elapsed > 0) {
      this.fps = (this.frameCount * 1000) / elapsed;
    }

    this.frameCount = 0;
    this.lastSampleTime = now;

    this.minFps = Math.min(this.minFps, this.fps);
    this.maxFps = Math.max(this.maxFps, this.fps);

    this.fpsHistory.push(this.fps);

    if (this.fpsHistory.length > this.options.historySize) {
      this.fpsHistory.shift();
    }

    this.averageFps =
      this.fpsHistory.reduce((sum, value) => sum + value, 0) /
      Math.max(1, this.fpsHistory.length);

    this.sampleMemory();
    this.notifyListeners();
  }

  sampleMemory() {
    const memory = performance.memory;

    if (!memory) return;

    this.memory.used = memory.usedJSHeapSize ?? 0;
    this.memory.total = memory.totalJSHeapSize ?? 0;
    this.memory.limit = memory.jsHeapSizeLimit ?? 0;
  }

  getAverageFrameTime() {
    if (this.frameHistory.length === 0) return 0;

    const total = this.frameHistory.reduce(
      (sum, value) => sum + value,
      0
    );

    return total / this.frameHistory.length;
  }

  getSnapshot() {
    return {
      fps: Number(this.fps.toFixed(1)),
      averageFps: Number(this.averageFps.toFixed(1)),
      minFps: Number.isFinite(this.minFps)
        ? Number(this.minFps.toFixed(1))
        : 0,
      maxFps: Number(this.maxFps.toFixed(1)),
      frameTime: Number(this.frameTime.toFixed(2)),
      averageFrameTime: Number(this.getAverageFrameTime().toFixed(2)),
      slowFrames: this.slowFrames,
      totalFrames: this.totalFrames,
      memory: { ...this.memory },
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Performance listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyListeners() {
    const snapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[Kano Run] Performance listener failed:", error);
      }
    }
  }

  reset() {
    this.frameCount = 0;
    this.lastSampleTime = 0;
    this.lastFrameTime = 0;
    this.frameTime = 0;
    this.fps = 0;
    this.minFps = Infinity;
    this.maxFps = 0;
    this.averageFps = 0;
    this.slowFrames = 0;
    this.totalFrames = 0;

    this.frameHistory.length = 0;
    this.fpsHistory.length = 0;

    this.memory.used = 0;
    this.memory.total = 0;
    this.memory.limit = 0;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  destroy() {
    this.enabled = false;
    this.listeners.clear();
    this.frameHistory.length = 0;
    this.fpsHistory.length = 0;
  }
}