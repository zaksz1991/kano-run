import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Storage } from './storage.js';

Audio.muted = Storage.getMuted();

const canvas = document.getElementById('c');
if (!canvas) {
  throw new Error('Kano Run: #c canvas was not found.');
}

// Core game and UI. UI owns the left/right/horn interactions; Game owns gas/brake.
const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;

// Renderer setup.
const renderer = new Renderer3D(game);
game.renderer3d = renderer;

// The renderer registers its own resize listener. Game.resize() already calls
// renderer.resize(), so remove the renderer's listener and route resize through
// one handler to avoid repeated canvas/renderer resizing.
if (renderer.onResize) {
  window.removeEventListener('resize', renderer.onResize);
}
function onResize() {
  if (typeof game.resize === 'function') game.resize();
}
window.addEventListener('resize', onResize, { passive: true });
onResize();

// Developer credit is inserted at runtime, keeping index.html unchanged.
function addDeveloperCredit() {
  const startScreen = document.getElementById('start-screen');
  if (!startScreen || document.getElementById('kano-run-developer-credit')) return;

  const credit = document.createElement('p');
  credit.id = 'kano-run-developer-credit';
  credit.textContent = 'Developed by Hassan Zakariya · RuffNeck Entertainment';
  credit.setAttribute(
    'aria-label',
    'Game developer: Hassan Zakariya, RuffNeck Entertainment'
  );
  credit.style.cssText = [
    'display:block',
    'width:100%',
    'box-sizing:border-box',
    'margin:14px 0 0',
    'padding:8px 12px',
    'color:rgba(255,255,255,.74)',
    'font-size:12px',
    'font-weight:600',
    'line-height:1.5',
    'letter-spacing:.025em',
    'text-align:center'
  ].join(';');
  startScreen.appendChild(credit);
}
addDeveloperCredit();

// UI.bind() previously assigned the radio button to cycleRadio(), which is not
// the method exposed by Game. Replace only that one callback with the real API.
const radioButton = document.getElementById('radio-btn');
if (radioButton) {
  radioButton.onclick = (event) => {
    event.preventDefault();
    if (typeof game.nextRadio === 'function') game.nextRadio();
  };
}

// Avoid browser page gestures over existing controls without binding duplicate
// movement/horn handlers. ui.js and game.js already bind those actions.
const controls = document.getElementById('controls');
if (controls) {
  controls.addEventListener(
    'touchmove',
    (event) => event.preventDefault(),
    { passive: false }
  );
}

window.KanoRun = {
  game,
  ui,
  renderer,
  mode: '3d'
};

// Game.update() already renders through renderer3d.draw(). Do not call draw a
// second time here; one update/render pass per animation frame is sufficient.
let lastFrameTime = 0;
function loop(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const delta = Math.min(32, Math.max(0, timestamp - lastFrameTime));
  lastFrameTime = timestamp;
  game.update(delta);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

console.log('Kano Run 3D (Three.js / WebGL) active');
console.log('Kano Run controls: UI lane/horn handlers and Game gas/brake handlers');
