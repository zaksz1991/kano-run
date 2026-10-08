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

// ------------------------------------------------------------
// Core game
// ------------------------------------------------------------

const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;

// ------------------------------------------------------------
// 3D renderer
// ------------------------------------------------------------

const renderer = new Renderer3D(game);
game.renderer3d = renderer;

// ------------------------------------------------------------
// Resize
// ------------------------------------------------------------

function onResize() {
  if (typeof game.resize === 'function') {
    game.resize();
  }

  if (typeof renderer.resize === 'function') {
    renderer.resize();
  }
}

window.addEventListener('resize', onResize);
onResize();

// ------------------------------------------------------------
// Mobile / mouse controls
//
// IMPORTANT:
// Use Game.moveLeft() / Game.moveRight() directly.
// Do not route these through changeLane().
// This preserves the original working lane implementation.
// ------------------------------------------------------------

function bindButton(id, handler) {
  const button = document.getElementById(id);

  if (!button) {
    console.warn(`Kano Run: #${id} was not found.`);
    return;
  }

  const activate = (event) => {
    event.preventDefault();
    event.stopPropagation();

    handler();
  };

  // Pointer events cover mouse, touch and pen on modern browsers.
  button.addEventListener('pointerdown', activate, { passive: false });

  // Prevent the browser from turning a touch into a delayed click.
  button.addEventListener(
    'touchstart',
    (event) => {
      event.preventDefault();
    },
    { passive: false }
  );
}

bindButton('left-btn', () => {
  if (typeof game.moveLeft === 'function') {
    game.moveLeft();
  }
});

bindButton('right-btn', () => {
  if (typeof game.moveRight === 'function') {
    game.moveRight();
  }
});

// ------------------------------------------------------------
// Horn
// ------------------------------------------------------------

bindButton('horn-btn', () => {
  if (typeof game.horn === 'function') {
    game.horn();
  }
});

// ------------------------------------------------------------
// Radio
// ------------------------------------------------------------

bindButton('radio-btn', () => {
  if (typeof game.nextRadio === 'function') {
    game.nextRadio();
    return;
  }

  if (typeof game.nextRadioStation === 'function') {
    game.nextRadioStation();
  }
});

// ------------------------------------------------------------
// Prevent mobile browser gestures on the game controls.
// ------------------------------------------------------------

const controls = document.getElementById('controls');

if (controls) {
  controls.addEventListener(
    'touchmove',
    (event) => {
      event.preventDefault();
    },
    { passive: false }
  );
}

// ------------------------------------------------------------
// Public debugging API
// ------------------------------------------------------------

window.KanoRun = {
  game,
  ui,
  renderer,
  mode: '3d'
};

// ------------------------------------------------------------
// Game loop
// ------------------------------------------------------------

let last = 0;

function loop(ts) {
  if (!last) {
    last = ts;
  }

  const dt = Math.min(32, ts - last);
  last = ts;

  game.update(dt);
  renderer.draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

console.log('Kano Run 3D (Three.js / WebGL) active');
console.log('Kano Run controls: direct Game.moveLeft / Game.moveRight');