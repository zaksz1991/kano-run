/**
 * Kano Run boot — WebGL 3D + safe fallback stub
 * Game Developer: Hassan Zakariya
 * No renderer2d.js import — Vercel build stays clean
 */
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Storage } from './storage.js';
import { Controls } from './controls.js';

Audio.muted = Storage.getMuted();

const canvas = document.getElementById('c');
const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;

const controls = new Controls(game, { lanes: 3, laneLerp: 0.2, swipeMinPx: 32 });
game.controls = controls;
controls.bind();

/** Minimal stub if WebGL fails — keeps game loop alive */
function makeStubRenderer() {
  const ctx = canvas.getContext('2d');
  return {
    ready: true,
    introPhase: 3,
    cameraMode: 'chase',
    cycleCamera() {
      return 'chase';
    },
    applyPaint() {},
    applyQuality() {},
    resize() {
      const p = canvas.parentElement;
      const w = (p && p.clientWidth) || window.innerWidth || 390;
      const h = (p && p.clientHeight) || window.innerHeight || 700;
      canvas.width = w;
      canvas.height = h;
    },
    draw() {
      if (!ctx) return;
      const g = game;
      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a2e35';
      ctx.beginPath();
      ctx.moveTo(W * 0.35, H * 0.4);
      ctx.lineTo(W * 0.65, H * 0.4);
      ctx.lineTo(W * 0.95, H);
      ctx.lineTo(W * 0.05, H);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.setLineDash([12, 16]);
      ctx.lineDashOffset = -((g.roadOff || 0) * 4);
      ctx.beginPath();
      ctx.moveTo(W / 2, H * 0.4);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);
      const lane = typeof g.smoothLane === 'number' ? g.smoothLane : g.playerLane || 1;
      const px = W / 2 + (lane - 1) * (W * 0.18);
      const py = H * 0.78;
      ctx.fillStyle = '#f5c542';
      ctx.fillRect(px - 28, py - 36, 56, 40);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(px - 18, py - 52, 36, 20);
      if (g.state === 2) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText('WebGL off · 2D fallback', 12, H - 12);
      }
    },
    render() {
      this.draw();
    }
  };
}

let renderer = null;
let mode = '3d';

try {
  renderer = new Renderer3D(game);
  if (!renderer.ready) throw new Error('WebGL not ready');
  mode = '3d';
  console.log('Kano Run: WebGL 3D active');
} catch (err) {
  console.warn('Kano Run: WebGL failed, using stub renderer', err);
  renderer = makeStubRenderer();
  mode = '2d-stub';
}

game.renderer3d = renderer;

function onResize() {
  try {
    game.resize();
  } catch (e) {}
  try {
    if (renderer && renderer.resize) renderer.resize();
  } catch (e) {}
}
window.addEventListener('resize', onResize);
onResize();

let last = 0;
function loop(ts) {
  const dt = Math.min(32, (ts - last) || 16);
  last = ts;
  try {
    controls.update();
    game.update(dt);
  } catch (err) {
    console.error('KanoRun update error', err);
  }
  try {
    if (renderer && renderer.draw) renderer.draw();
    else if (renderer && renderer.render) renderer.render();
  } catch (err) {
    console.error('KanoRun render error', err);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.KanoRun = { game, ui, renderer, controls, mode };
console.log('Kano Run ready · mode=' + mode);
