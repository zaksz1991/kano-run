/**
 * Slow-network start-up guard. On a very slow connection the 3D renderer can finish building AFTER the run has
 * started, so the "show the road" request sent at start-up was dropped and the player saw only sky and HUD.
 * This (1) shows a clear "Loading the road" card while the world is not ready and (2) re-applies the road
 * scene during the first seconds of a run once the renderer is ready.
 */
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__;
let card = null;
let playSince = 0;

function ensureCard() {
  if (card && card.isConnected) return card;
  card = document.createElement('div');
  card.id = 'kano-road-loading';
  card.style.cssText = 'position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);z-index:44;padding:14px 20px;'
    + 'border-radius:16px;background:rgba(14,20,30,.9);border:2px solid #f5c431;color:#fff;text-align:center;'
    + 'font:800 15px/1.4 system-ui,sans-serif;pointer-events:none;display:none;max-width:80vw';
  card.innerHTML = '🛺 Loading the road…<br><span style="font:600 12px system-ui;opacity:.8">Slow network: the game is still downloading</span>';
  document.body.appendChild(card);
  return card;
}

function tick() {
  try {
    const g = game();
    const R = window.kanoRenderer;
    const playing = g?.state === 'PLAY';
    if (!playing) { playSince = 0; if (card) card.style.display = 'none'; return; }
    if (!playSince) playSince = performance.now();
    const age = (performance.now() - playSince) / 1000;
    const ready = Boolean(R?.ready && R.player && R.world?.children?.length);
    ensureCard().style.display = ready ? 'none' : 'block';
    if (ready && age < 12 && R.lifeScene && R.lifeScene !== 'road' && !g.s?.event && !g.s?.lifeSceneActive) {
      R.setLifeScene('road');
    }
  } catch (_) { /* optional */ }
}
if (typeof window !== 'undefined' && !window.__kanoRoadFailsafe) {
  window.__kanoRoadFailsafe = true;
  setInterval(tick, 700);
}
