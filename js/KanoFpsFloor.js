/**
 * Frame-rate floor for phones. The lab showed the phone GPU is limited by how many pixels it
 * must fill, and that halving the resolution gave about +9 FPS. The existing adaptive quality
 * never goes below 1 pixel per CSS pixel, so a weak phone stays at 8-15 FPS. This steps the 3D
 * view down in small stages (0.85, then 0.72; up to 1.25 on a fast phone) only while the phone is truly struggling
 * (under 20 FPS for 6 seconds of real driving), and remembers the choice. The HUD and buttons are
 * normal page elements, so they stay sharp. It steps back up if the phone later holds 45+ FPS.
 */
import * as THREE from 'three';

const KEY = 'kano.life.pixelCap.v2'; // v2: forget the 0.85 that v1 saved on slow measurements
const STAGES = [1.25, 1.15, 1, 0.85, 0.72];
const PATCH = Symbol.for('kano.life.fpsFloor.v1');

const coarse = typeof window !== 'undefined'
  && (window.matchMedia?.('(pointer: coarse)')?.matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || ''));

function load() {
  try { const v = Number(localStorage.getItem(KEY)); return STAGES.includes(v) ? Math.min(1.15, Math.max(v, 0.85)) : 1.15; } catch (_) { return 1.15; } // each session re-checks the deepest stage
}
const MODE_KEY = 'kano.life.qualityMode.v1';
const MODES = ['auto', 'sharp', 'fast'];
const MODE_CAP = { sharp: 1.25, fast: 0.72 };
function loadMode() { try { const m = localStorage.getItem(MODE_KEY); return MODES.includes(m) ? m : 'auto'; } catch (_) { return 'auto'; } }
function saveMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (_) { /* optional */ } }
function save(v) { try { localStorage.setItem(KEY, String(v)); } catch (_) { /* optional */ } }

if (coarse && !THREE.WebGLRenderer.prototype[PATCH]) {
  Object.defineProperty(THREE.WebGLRenderer.prototype, PATCH, { value: true });
  const state = { cap: load(), samples: [], lastStep: performance.now(), highSince: 0, mode: loadMode() };
  if (state.mode !== 'auto') state.cap = MODE_CAP[state.mode];
  window.kanoFpsFloor = state;

  const original = THREE.WebGLRenderer.prototype.setPixelRatio;
  THREE.WebGLRenderer.prototype.setPixelRatio = function setPixelRatioCapped(value) {
    const v = Number(value);
    return original.call(this, Number.isFinite(v) && v > state.cap ? state.cap : value);
  };

  const apply = () => {
    const r = window.__KANO_ACTIVE_RENDERER__?.renderer;
    if (!r?.getPixelRatio) return;
    if (r.getPixelRatio() > state.cap) r.setPixelRatio(state.cap);
  };

  let frames = 0;
  let windowStart = performance.now();
  const loop = (now) => {
    frames += 1;
    if (now - windowStart >= 1000) {
      const fps = frames * 1000 / (now - windowStart);
      frames = 0; windowStart = now;
      const game = window.kanoGame || window.__KANO_GAME__;
      const driving = Boolean(document.getElementById('drive-controls')?.offsetParent) && !document.hidden;
      if (driving && (!game || game.state === 'PLAY')) {
        state.samples.push(fps);
        if (state.samples.length > 6) state.samples.shift();
        const full = state.samples.length === 6;
        const avg = state.samples.reduce((a, b) => a + b, 0) / state.samples.length;
        const idx = STAGES.indexOf(state.cap);
        if (state.mode === 'auto' && full && now - state.lastStep > 40000 && Number(game?.s?.distance || 0) >= 0.4) { // never mid-start: a resolution change clears the canvas
          if (avg < 20 && idx < STAGES.length - 1) {
            state.cap = STAGES[idx + 1]; state.steppedDown = true; state.lastStep = now; state.samples = []; save(state.cap); apply();
          } else if (avg > 45 && idx > 0) {
            if (!state.highSince) state.highSince = now;
            if (now - state.highSince > 60000 && !state.steppedDown) { state.cap = STAGES[idx - 1]; state.lastStep = now; state.samples = []; state.highSince = 0; save(state.cap); }
          } else if (avg <= 45) state.highSince = 0;
        }
      } else {
        state.samples = [];
      }
      if (state.cap < 1) apply();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Small header button so the player can pick the picture/speed trade-off directly.
  const LABEL = { auto: 'AUTO', sharp: 'SHARP', fast: 'FAST' };
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.id = 'kano-quality-chip';
  chip.style.cssText = 'position:fixed;left:96px;top:calc(env(safe-area-inset-top,0px) + 9px);z-index:20;padding:2px 8px;border-radius:9px;border:1px solid #ffffff55;background:rgba(12,26,43,.85);color:#f6f8fb;font:800 10px system-ui,sans-serif;letter-spacing:.06em;display:none';
  const paint = () => { chip.textContent = `PICTURE: ${LABEL[state.mode]}`; };
  chip.addEventListener('click', () => {
    state.mode = MODES[(MODES.indexOf(state.mode) + 1) % MODES.length];
    saveMode(state.mode);
    state.samples = [];
    state.cap = state.mode === 'auto' ? 1.15 : MODE_CAP[state.mode];
    const r = window.__KANO_ACTIVE_RENDERER__?.renderer;
    if (r?.setPixelRatio) r.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.cap));
    window.dispatchEvent(new Event('resize'));
    paint();
  });
  paint();
  const mountChip = () => {
    if (!document.body) return requestAnimationFrame(mountChip);
    document.body.appendChild(chip);
    setInterval(() => {
      const driving = Boolean(document.getElementById('drive-controls')?.offsetParent) && !document.querySelector('.screen:not(.hidden)');
      chip.style.display = driving ? 'block' : 'none';
    }, 600);
  };
  mountChip();
}
