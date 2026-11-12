/**
 * One home for the floating write-ups. Every banner used to pick its own spot and they sat on top of each other
 * (sign reader over the clock, TOTAL PLAYERS over the hint, the engine-cooling card hidden behind a sign).
 * Now the left column below the top bar is a single stack: urgent cards first, at most 3 shown at once, none overlap.
 * The two player-count chips share one row at the bottom.
 */
const ORDER = [
  'kano-chase-chip', 'kano-cooling-card', 'kano-race-chip', 'kano-signal-chip', 'kano-karota-chip', 'kano-flyover-fork',
  'kano-goslow-chip', 'kano-cng-chip', 'kano-drop-chip', 'kano-sign-reader', 'kano-day-arc',
];
const MAX_VISIBLE = 3;
let box = null;

function css() {
  if (document.getElementById('kano-hud-stack-css')) return;
  const s = document.createElement('style');
  s.id = 'kano-hud-stack-css';
  s.textContent = `
#kano-hud-stack{position:fixed;left:8px;top:112px;width:min(48vw,230px);z-index:44;display:flex;flex-direction:column;gap:6px;pointer-events:none}
#kano-hud-stack>*{position:static!important;inset:auto!important;transform:none!important;margin:0!important;width:100%!important;max-width:100%!important;box-sizing:border-box;white-space:normal!important;font-size:12px!important;line-height:1.3!important;padding:6px 9px!important}
#kano-hud-stack>#kano-cooling-card{pointer-events:auto;padding:9px!important}
#kano-hud-stack>#kano-cooling-card button{pointer-events:auto}
#kano-hud-stack>#kano-sign-reader{font-size:14px!important}
#kano-hud-stack>[data-stack-hidden="1"]{display:none!important}
body:has(.screen:not(.hidden)) #kano-hud-stack{display:none!important}
#kano-total-players-chip{bottom:max(64px,calc(env(safe-area-inset-bottom) + 60px))!important}
#game-container .kano-interaction-hint{bottom:calc(122px + env(safe-area-inset-bottom,0px))!important}
`;
  document.head.appendChild(s);
}

function visible(el) {
  if (!el.isConnected) return false;
  if (el.style.display === 'none' || el.hidden) return false;
  return Boolean((el.textContent || '').trim()) || el.children.length > 0;
}

function tick() {
  try {
    if (!document.body) return;
    css();
    if (!box || !box.isConnected) {
      box = document.createElement('div');
      box.id = 'kano-hud-stack';
      document.body.appendChild(box);
    }
    let shown = 0;
    for (const id of ORDER) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.parentElement !== box) box.appendChild(el);
      // keep the declared order
      const wantIndex = ORDER.filter((k) => document.getElementById(k)?.parentElement === box).indexOf(id);
      if (box.children[wantIndex] !== el) box.insertBefore(el, box.children[wantIndex] || null);
      if (visible(el)) {
        shown += 1;
        el.dataset.stackHidden = shown > MAX_VISIBLE ? '1' : '0';
      } else el.dataset.stackHidden = '0';
    }
    // Player-count chips: TOTAL sits to the right of LIVE on the same row.
    const total = document.getElementById('kano-total-players-chip');
    const live = document.getElementById('kano-live-user-counter');
    if (total) {
      const liveVisible = live && live.style.display !== 'none' && live.getBoundingClientRect().width > 0;
      total.style.left = liveVisible ? `${Math.round(live.getBoundingClientRect().right + 8)}px` : '10px';
    }
  } catch (_) { /* optional */ }
}

if (typeof window !== 'undefined' && !window.__kanoHudStack) {
  window.__kanoHudStack = true;
  setInterval(tick, 250);
}
