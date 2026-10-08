import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { UI } from './ui.js';

const canvas = document.getElementById('c');
const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;

const renderer = new Renderer3D(game);
game.renderer3d = renderer;

function onResize() { game.resize(); }
window.addEventListener('resize', onResize);
onResize();

let last = 0;
function loop(ts) {
  const dt = Math.min(32, ts - last);
  last = ts;
  game.update(dt);
  renderer.draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.KanoRun = { game, ui, renderer, mode: '3d' };
console.log('Kano Run 3D (Three.js / WebGL) active');
