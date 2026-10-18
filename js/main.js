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

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) ||
    (navigator.maxTouchPoints > 1);
}
const MOBILE = isMobileDevice();
if (MOBILE) {
  try { Storage.setLowQuality(true); } catch (e) {}
  console.log('[Kano Life] mobile → low quality on');
}

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
    // Release WebGL so we can draw; Renderer2D clones canvas if needed
    try {
      if (renderer && renderer.renderer) {
        renderer.renderer.dispose?.();
        renderer.renderer.forceContextLoss?.();
      }
    } catch (e) {}
    renderer = new Renderer2D(game);
    game.renderer3d = renderer;
    mode = '2d';
    onResize();
    ui.showMissionToast?.('2D mode — road on');
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
    if (canvas) {
      const parent = canvas.parentElement;
      const rect = parent?.getBoundingClientRect?.() || canvas.getBoundingClientRect();
      let w = Math.floor(rect.width || window.innerWidth || 390);
      let h = Math.floor(rect.height || window.innerHeight || 700);
      if (w < 200) w = Math.min(430, window.innerWidth || 390);
      if (h < 200) h = Math.min(900, window.innerHeight || 700);
      // Backing store — critical for mobile black canvas
      const dpr = MOBILE ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    game.resize?.();
    renderer?.resize?.();
  } catch (e) {
    console.warn('resize', e);
  }
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 150));
// Multiple resize passes — mobile browser chrome settles late
onResize();
setTimeout(onResize, 100);
setTimeout(onResize, 500);
setTimeout(onResize, 1200);

let last = 0;
let renderErrors = 0;
let fpsFrames = 0;
let fpsT = 0;
let lowFpsStreak = 0;
let force2D =
  typeof location !== 'undefined' &&
  (location.search.includes('force2d') || location.hash.includes('force2d'));

if (force2D && mode === '3d') {
  console.warn('[Kano Life] force2d URL flag');
  use2D('force2d');
}

function loop(ts) {
  const dt = Math.min(32, (ts - last) || 16);
  last = ts;
  fpsFrames++;
  if (ts - fpsT > 1000) {
    const fps = fpsFrames;
    fpsFrames = 0;
    fpsT = ts;
    window.KanoLifeFps = fps;
    // Mobile: if 3D can't hold ~20fps, drop to 2D so the road stays visible
    if (mode === '3d' && MOBILE && fps > 0 && fps < 18) {
      lowFpsStreak++;
      if (lowFpsStreak >= 3) {
        console.warn('[Kano Life] FPS', fps, '→ switching to 2D');
        use2D('low fps ' + fps);
        lowFpsStreak = 0;
        try { ui.showMissionToast?.('Switched to fast 2D mode'); } catch (e) {}
      }
    } else {
      lowFpsStreak = 0;
    }
  }
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

window.KanoLife = {
  get game() { return game; },
  get ui() { return ui; },
  get renderer() { return renderer; },
  get controls() { return controls; },
  get mode() { return mode; },
  switch2D: () => use2D('manual'),
  switch3D: () => { try { use3D(); } catch (e) { use2D(e.message); } }
};
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
