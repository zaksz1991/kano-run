/**
 * Kano air: a soft sandy dust haze over the horizon (strongest in the harmattan months, Nov-Feb), fading out at
 * night. It is a single CSS gradient under the HUD, so it costs the phone's GPU nothing and keeps the road readable.
 */
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__ || window.__KANO_LIFE_GAME__;
let el = null;

function ensure() {
  if (el?.isConnected) return el;
  el = document.createElement('div');
  el.id = 'kano-harmattan-haze';
  el.style.cssText = 'position:fixed;inset:0;z-index:3;pointer-events:none;opacity:0;transition:opacity 1.2s ease;'
    + 'background:linear-gradient(to bottom,rgba(222,190,140,0) 18%,rgba(222,190,140,.5) 30%,rgba(214,176,128,.28) 38%,rgba(214,176,128,0) 46%)';
  document.body.appendChild(el);
  return el;
}

function strength() {
  const month = new Date().getMonth(); // 0 = Jan
  const harmattan = month >= 10 || month <= 1;
  const base = harmattan ? 0.85 : month >= 2 && month <= 4 ? 0.55 : 0.3;
  const minute = Number(game()?.dayCycle?.state?.minuteOfDay);
  let light = 1;
  if (Number.isFinite(minute)) {
    const h = (((minute % 1440) + 1440) % 1440) / 60;
    light = h >= 7 && h <= 17.5 ? 1 : h >= 19.5 || h <= 5 ? 0.15 : 0.55;
  }
  return base * light;
}

if (typeof window !== 'undefined' && !window.__kanoHaze) {
  window.__kanoHaze = true;
  setInterval(() => {
    try {
      const g = game();
      const on = g?.state === 'PLAY' && window.kanoRenderer?.lifeScene === 'road';
      const node = ensure();
      node.style.opacity = on ? String(strength().toFixed(2)) : '0';
    } catch (_) { /* optional */ }
  }, 1000);
}
