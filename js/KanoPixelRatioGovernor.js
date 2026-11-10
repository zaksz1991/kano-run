/**
 * Stops the start-of-game blinking. Several quality controllers (adaptive quality, FPS floor, phone profile,
 * performance scaler) each change the renderer's pixel ratio in the first seconds, and every change reallocates
 * the drawing buffer, which flashes the canvas. This governor lets the first ratio through, then ignores changes
 * smaller than 15% and any change sooner than 10 s after the last applied one.
 */
import * as THREE from 'three';

const MIN_GAP_MS = 10000;
const MIN_REL_CHANGE = 0.15;

(function install() {
  const proto = THREE.WebGLRenderer?.prototype;
  if (!proto || proto.__kanoPixelGovernor) return;
  proto.__kanoPixelGovernor = true;
  const original = proto.setPixelRatio;
  proto.setPixelRatio = function governedSetPixelRatio(value) {
    const now = performance.now();
    const gov = this.__kanoGov || (this.__kanoGov = { last: -Infinity, seen: false });
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) return original.call(this, value);
    const prev = this.getPixelRatio();
    if (!gov.seen) {
      gov.seen = true; gov.last = now;
      return original.call(this, next);
    }
    if (Math.abs(next - prev) / Math.max(0.1, prev) < MIN_REL_CHANGE) return undefined;
    if (now - gov.last < MIN_GAP_MS) return undefined;
    gov.last = now;
    return original.call(this, next);
  };
})();
