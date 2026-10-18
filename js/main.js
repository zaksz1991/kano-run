/**
 * Kano Life boot — reliable 3D + 2D fallback
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
if (!canvas) {
  console.error('[Kano Life] #c canvas missing');
}

const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;

const controls = new Controls(game, { lanes: 3, laneLambda: 7, laneLerp: 0.18, swipeMinPx: 28 });
game.controls = controls;
controls.bind();

function canWebGL() {
  try {
    const t = document.createElement('canvas');
    const gl =
      t.getContext('webgl2', { powerPreference: 'high-performance' }) ||
      t.getContext('webgl', { powerPreference: 'high-performance' }) ||
      t.getContext('experimental-webgl');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch {
    return false;
  }
}

let renderer = null;
let mode = 'none';

function use2D(reason) {
  console.warn('[Kano Life] 2D fallback:', reason);
  try {
    renderer = new Renderer2D(game);
    game.renderer3d = renderer;
    mode = '2d';
    ui.showMissionToast?.('2D mode — still playable');
    console.log('[Kano Life] 2D active');
  } catch (e) {
    console.error('[Kano Life] 2D failed', e);
    renderer = { ready: false, draw() {}, render() {}, resize() {} };
    game.renderer3d = renderer;
    mode = 'none';
  }
}

function use3D() {
  renderer = new Renderer3D(game);
  if (!renderer.ready) throw new Error('Renderer3D not ready');
  // Verify context still alive
  const gl = renderer.renderer?.getContext?.();
  if (!gl) throw new Error('WebGL context lost after init');
  game.renderer3d = renderer;
  mode = '3d';
  console.log('[Kano Life] 3D active');
}

if (canvas && canWebGL()) {
  try {
    use3D();
  } catch (err) {
    console.error('[Kano Life] 3D init failed', err);
    use2D(err?.message || '3D init');
  }
} else {
  use2D(canvas ? 'no WebGL' : 'no canvas');
}

function onResize() {
  try {
    game.resize?.();
    renderer?.resize?.();
  } catch (e) {
    console.warn('resize', e);
  }
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
onResize();

let last = 0;
let renderErrors = 0;
function loop(ts) {
  const dt = Math.min(32, (ts - last) || 16);
  last = ts;
  try {
    controls.update?.();
    game.update?.(dt);
  } catch (err) {
    console.error('update', err);
  }
  try {
    if (renderer?.draw) renderer.draw();
    else if (renderer?.render) renderer.render();
  } catch (err) {
    console.error('render', err);
    renderErrors++;
    if (mode === '3d' && renderErrors >= 2) {
      renderErrors = 0;
      use2D('render crash');
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.KanoLife = { game, ui, renderer, controls, mode };
// Naija Challenge: press N or call KanoLife.game.cycleDialect()
window.addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') game.cycleDialect?.();
  if (e.key === 'm' || e.key === 'M') game.cycleGameMode?.();
  if (e.key === 't' || e.key === 'T') {
    const stand = game.getNaijaGrandWinners?.() || [];
    if (!stand.length) game.ui?.showMissionToast?.('🇳🇬 No tribal scores yet — finish a run');
    else {
      const line = stand.map((r, i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉') + r.label.split('·').pop().trim() + ' ₦' + r.total).join(' · ');
      game.ui?.showMissionToast?.('🇳🇬 ' + line);
    }
  }
});
window.KanoRun = window.KanoLife; // back-compat
console.log('[Kano Life] ready · mode=' + mode);
