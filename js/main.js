/**
 * Kano Life — 3D ONLY boot (no Canvas 2D fallback)
 * Game Developer: Hassan Zakariya
 */
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Storage } from './storage.js';
import { Controls } from './controls.js';

Audio.muted = Storage.getMuted();

function isMobileDevice() {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) ||
    (navigator.maxTouchPoints > 1)
  );
}
const MOBILE = isMobileDevice();
if (MOBILE) {
  try {
    Storage.setLowQuality(true);
  } catch (e) {}
  console.log('[Kano Life] mobile → low quality 3D');
}

const canvas = document.getElementById('c');
if (!canvas) {
  console.error('[Kano Life] #c canvas missing');
  throw new Error('Canvas #c required');
}

const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;

const controls = new Controls(game, {
  lanes: 3,
  laneLambda: 7,
  laneLerp: 0.18,
  swipeMinPx: 28
});
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

function showFatal(msg) {
  console.error('[Kano Life]', msg);
  try {
    ui.showMissionToast?.(String(msg));
  } catch (e) {}
  let el = document.getElementById('kano-fatal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kano-fatal';
    el.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:#0a101c;color:#e2e8f0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:Outfit,system-ui,sans-serif;';
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div style="font-size:1.25rem;font-weight:800;color:#f5c542;margin-bottom:12px">Kano Life — 3D required</div>' +
    '<div style="max-width:320px;line-height:1.5;color:#94a3b8;font-size:0.9rem">' +
    String(msg) +
    '</div>' +
    '<button type="button" onclick="location.reload()" style="margin-top:20px;padding:12px 20px;border:none;border-radius:12px;background:#f5c542;color:#0a0f1c;font-weight:800;cursor:pointer">Reload</button>';
}

let renderer = null;
let mode = 'none';

function use3D() {
  renderer = new Renderer3D(game);
  if (!renderer.ready) throw new Error('Renderer3D not ready');
  const gl = renderer.renderer?.getContext?.();
  if (!gl) throw new Error('WebGL context missing after init');
  game.renderer3d = renderer;
  mode = '3d';
  console.log('[Kano Life] 3D active (no 2D path)');
}

if (!canWebGL()) {
  showFatal('This device/browser has no WebGL. Kano Life is 3D-only — try Chrome/Firefox updated, or another device.');
} else {
  try {
    use3D();
  } catch (err) {
    console.error('[Kano Life] 3D init failed', err);
    showFatal(err?.message || '3D init failed');
  }
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
      const dpr = MOBILE ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
      // Do NOT stomp WebGL drawing buffer every resize from main if renderer owns setSize
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
onResize();
setTimeout(onResize, 100);
setTimeout(onResize, 500);
setTimeout(onResize, 1200);

// WebGL context lost → try restore, never switch to 2D
if (canvas) {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('[Kano Life] WebGL context lost');
    try {
      ui.showMissionToast?.('Graphics paused — recovering…');
    } catch (err) {}
  });
  canvas.addEventListener('webglcontextrestored', () => {
    console.log('[Kano Life] WebGL restored — reinit 3D');
    try {
      use3D();
      onResize();
    } catch (err) {
      showFatal('WebGL lost and could not recover. Reload the page.');
    }
  });
}

let last = 0;
let renderErrors = 0;
function loop(ts) {
  const dt = Math.min(32, (ts - last) || 16);
  last = ts;
  if (mode !== '3d') {
    requestAnimationFrame(loop);
    return;
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
    renderErrors = 0;
  } catch (err) {
    console.error('render', err);
    renderErrors++;
    if (renderErrors >= 30) {
      showFatal('3D render kept failing. Reload. Check console for GL errors.');
      mode = 'none';
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.KanoLife = {
  get game() {
    return game;
  },
  get ui() {
    return ui;
  },
  get renderer() {
    return renderer;
  },
  get controls() {
    return controls;
  },
  get mode() {
    return mode;
  },
  reload3D: () => {
    try {
      use3D();
      onResize();
    } catch (e) {
      showFatal(e.message);
    }
  }
};
window.KanoRun = window.KanoLife;

window.addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') game.cycleDialect?.();
  if (e.key === 'm' || e.key === 'M') game.cycleGameMode?.();
  if (e.key === 't' || e.key === 'T') {
    const stand = game.getNaijaGrandWinners?.() || [];
    if (!stand.length) game.ui?.showMissionToast?.('🇳🇬 No tribal scores yet');
    else {
      const line = stand
        .map(
          (r, i) =>
            (i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉') +
            (r.label || r.tribe) +
            ' ₦' +
            r.total
        )
        .join(' · ');
      game.ui?.showMissionToast?.('🇳🇬 ' + line);
    }
  }
});

console.log('[Kano Life] ready · mode=' + mode + ' · 3D-only build');
