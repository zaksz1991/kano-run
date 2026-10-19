const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Lightweight optional frame-time monitor. It never changes game settings;
 * it reports measurements only when the user opts in with ?debugPerf=1.
 */
export class KanoPerformanceMonitor {
  constructor({ container, enabled = false, sampleCount = 120 } = {}) {
    this.container = container || document.body;
    this.enabled = Boolean(enabled);
    this.samples = new Float32Array(clamp(sampleCount, 30, 240));
    this.sampleIndex = 0;
    this.sampleSize = 0;
    this.frameCount = 0;
    this.windowStart = performance.now();
    this.lastPaint = 0;
    this.frameStartTime = 0;
    this.disposed = false;
    this.element = null;

    if (this.enabled) this.createPanel();
  }

  createPanel() {
    const panel = document.createElement('output');
    panel.id = 'kano-performance-monitor';
    panel.setAttribute('aria-live', 'off');
    panel.textContent = 'PERF · collecting frame samples…';
    panel.style.cssText = [
      'position:absolute',
      'left:8px',
      'bottom:calc(64px + env(safe-area-inset-bottom, 0px))',
      'z-index:80',
      'max-width:min(94vw,420px)',
      'padding:6px 8px',
      'border:1px solid #ffffff40',
      'border-radius:7px',
      'background:rgba(5,12,19,.86)',
      'color:#dcf7ea',
      'font:700 10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
      'pointer-events:none',
      'white-space:normal',
    ].join(';');

    this.container.append(panel);
    this.element = panel;
  }

  beginFrame(now = performance.now()) {
    this.frameStartTime = now;
  }

  percentile95() {
    if (!this.sampleSize) return 0;

    const values = Array.from(this.samples.slice(0, this.sampleSize));
    values.sort((a, b) => a - b);
    const index = Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1);
    return values[Math.max(0, index)] || 0;
  }

  endFrame(now = performance.now(), rendererMode = '2D', renderer = null) {
    if (this.disposed) return;

    const frameMs = Math.max(0, now - (this.frameStartTime || now));
    this.samples[this.sampleIndex] = frameMs;
    this.sampleIndex = (this.sampleIndex + 1) % this.samples.length;
    this.sampleSize = Math.min(this.sampleSize + 1, this.samples.length);
    this.frameCount += 1;

    if (now - this.windowStart < 1000) return;

    const span = Math.max(1, now - this.windowStart);
    const fps = this.frameCount * 1000 / span;
    this.frameCount = 0;
    this.windowStart = now;

    if (!this.enabled || !this.element || now - this.lastPaint < 850) return;
    this.lastPaint = now;

    const info = renderer?.renderer?.info;
    const calls = Number(info?.render?.calls) || 0;
    const triangles = Number(info?.render?.triangles) || 0;
    const memory = performance.memory?.usedJSHeapSize;
    const memoryText = Number.isFinite(memory)
      ? ` · JS ${(memory / 1048576).toFixed(0)} MB`
      : '';

    this.element.textContent =
      `PERF · ${rendererMode} · ${fps.toFixed(0)} FPS · ` +
      `P95 ${(this.percentile95()).toFixed(1)} ms · ` +
      `draw calls ${calls} · tris ${(triangles / 1000).toFixed(1)}k${memoryText}`;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.element?.remove();
    this.element = null;
  }
}
