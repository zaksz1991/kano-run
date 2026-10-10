/**
 * Kano Run boot — WebGL + Canvas2D fallback + professional Controls
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

const controls = new Controls(game, { lanes: 3, laneLerp: 0.2, swipeMinPx: 32 });
game.controls = controls;
controls.bind();

let renderer = null;
let mode = '3d';

try {
  renderer = new Renderer3D(game);
  if (!renderer.ready) throw new Error('WebGL not ready');
  mode = '3d';
  console.log('Kano Run: WebGL 3D active');
} catch (err) {
  console.warn('Kano Run: WebGL failed, using 2D fallback', err);
  try {
    renderer = new Renderer2D(game);
    mode = '2d';
    console.log('Kano Run: Canvas 2D fallback active');
  } catch (err2) {
    console.error('Kano Run: both renderers failed', err2);
    renderer = {
      ready: false,
      draw() {},
      render() {},
      resize() {},
      cycleCamera() { return 'chase'; }
    };
  }
}

game.renderer3d = renderer;

function onResize() {
  try { game.resize(); } catch (e) {}
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
