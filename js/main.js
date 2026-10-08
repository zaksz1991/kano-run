// Kano Run - Entry Point
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';

const canvas = document.getElementById('c');
const game = new Game(canvas);
const ui = new UI(game);
const renderer = new Renderer(game);

// Link UI back to game (already done in constructor, but ensure)
game.ui = ui;

// Resize handling
function onResize() {
  game.resize();
}
window.addEventListener('resize', onResize);
onResize();

// Main loop
let last = 0;
function loop(timestamp) {
  const dt = Math.min(32, timestamp - last);
  last = timestamp;

  game.update(dt);
  renderer.draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// Expose for debugging if needed
window.KanoRun = { game, ui, renderer };
