/**
 * Kano Run boot — 3D only (no renderer2d.js)
 * Game Developer: Hassan Zakariya
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

const controls = new Controls(game, {
  lanes: 3,
  laneLerp: 0.2,
  swipeMinPx: 32
});
game.controls = controls;
controls.bind();

const renderer = new Renderer3D(game);
game.renderer3d = renderer;

function onResize() {
  try {
    game.resize?.();
    renderer.resize?.();
  } catch (err) {
    console.error(err);
  }
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
    console.error('Kano Run update error', err);
  }
  try {
    if (renderer.draw) renderer.draw();
    else if (renderer.render) renderer.render();
  } catch (err) {
    console.error('Kano Run render error', err);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.KanoRun = {
  game,
  ui,
  renderer,
  controls,
  mode: '3d'
};
console.log('Kano Run ready · 3D mode');
