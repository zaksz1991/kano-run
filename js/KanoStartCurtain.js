/**
 * Start curtain: when a drive begins, the first second or two can show half-built scenery or an empty canvas
 * (models still loading, scene switching). A plain sky-coloured curtain sits under the HUD during that moment and
 * fades away once the road scene is up, so the start looks like a deliberate fade-in instead of a flash.
 */
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__ || window.__KANO_LIFE_GAME__;
let lastState = '';
let curtain = null;
let shownAt = 0;

function show() {
  if (curtain?.isConnected) return;
  curtain = document.createElement('div');
  curtain.id = 'kano-start-curtain';
  curtain.style.cssText = 'position:fixed;inset:0;z-index:20;pointer-events:none;background:linear-gradient(#78bde6,#cfe8f5);opacity:1;transition:opacity .55s ease';
  document.body.appendChild(curtain);
  shownAt = performance.now();
}

function hide() {
  if (!curtain) return;
  const c = curtain;
  curtain = null;
  c.style.opacity = '0';
  setTimeout(() => c.remove(), 700);
}

if (typeof window !== 'undefined' && !window.__kanoStartCurtain) {
  window.__kanoStartCurtain = true;
  setInterval(() => {
    try {
      const g = game();
      const st = g?.state || '';
      if (st === 'PLAY' && lastState !== 'PLAY') show();
      lastState = st;
      if (curtain) {
        const age = performance.now() - shownAt;
        const ready = window.kanoRenderer?.lifeScene === 'road' && age > 1500;
        if (ready || age > 4500 || st !== 'PLAY') hide();
      }
    } catch (_) { /* optional */ }
  }, 100);
}
