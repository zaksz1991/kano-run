/**
 * Kano Run boot — 3D with Canvas 2D fallback (Phase 10)
 * Game Developer: Hassan Zakariya
 */
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { Renderer2D } from './renderer2d.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Storage } from './storage.js';
import { Controls } from './controls.js';

Audio.muted = Storage.getMuted();

const canvas = document.getElementById('c');
const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;

const controls = new Controls(game, { lanes: 3, laneLambda: 7, laneLerp: 0.18, swipeMinPx: 28 });
game.controls = controls;
controls.bind();

function canWebGL() {
  try {
    const t = document.createElement('canvas');
    const gl = t.getContext('webgl2') || t.getContext('webgl') || t.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

let renderer;
let mode = '3d';

function use2D(reason) {
  console.warn('[Kano Run] Falling back to 2D renderer:', reason || 'WebGL unavailable');
  try {
    renderer = new Renderer2D(game);
    game.renderer3d = renderer;
    mode = '2d';
    if (ui?.showMissionToast) ui.showMissionToast('2D mode · WebGL not available');
    console.log('Kano Run 2D active');
  } catch (e2) {
    console.error('2D renderer also failed', e2);
    renderer = { ready: false, draw() {}, render() {}, resize() {}, cycleCamera() { return 'chase'; } };
    game.renderer3d = renderer;
    mode = 'none';
  }
}

if (canWebGL()) {
  try {
    renderer = new Renderer3D(game);
    if (!renderer.ready) throw new Error('Renderer3D not ready');
    game.renderer3d = renderer;
    mode = '3d';
    console.log('Kano Run 3D active');
  } catch (err) {
    console.error('Renderer3D failed', err);
    use2D(err?.message || 'init failed');
  }
} else {
  use2D('no WebGL');
}

function onResize() {
  try {
    game.resize?.();
    renderer?.resize?.();
  } catch (e) {}
}
window.addEventListener('resize', onResize);
onResize();

let last = 0;
let renderErrors = 0;
function loop(ts) {
  const dt = Math.min(32, (ts - last) || 16);
  last = ts;
  try {
    controls.update();
    game.update(dt);
  } catch (err) {
    console.error('update', err);
  }
  try {
    if (renderer?.draw) renderer.draw();
    else if (renderer?.render) renderer.render();
  } catch (err) {
    console.error('render', err);
    renderErrors++;
    // If 3D keeps throwing, switch to 2D once
    if (mode === '3d' && renderErrors >= 3) {
      renderErrors = 0;
      use2D('render crash');
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.KanoRun = { game, ui, renderer, controls, mode };
console.log('Kano Run ready · mode=' + mode);
