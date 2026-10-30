/**
 * Driver feel layer (visual only, never touches lanes, collisions or fares):
 *  (The curved-road bend lives in KanoCurvedWorld.js.)
 *  Tired / hungry driver. The existing day cycle already slows steering and changes
 *     fares; this adds the feeling: a darkening vignette as fatigue rises and slow heavy
 *     blinks when you are exhausted, plus a faint dimming when very hungry.
 */

function vignetteEl() {
  let el = document.getElementById('kano-fatigue-vignette');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kano-fatigue-vignette';
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;transition:opacity .4s;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 38%,rgba(5,8,14,.78) 100%)';
  document.body.appendChild(el);
  return el;
}

let blinkUntil = 0;
let nextBlink = 0;
function updateFeel(now) {
  const game = window.__KANO_ACTIVE_GAME__;
  const st = game?.dayCycle?.state;
  if (!st || game.state !== 'PLAY') { const el = document.getElementById('kano-fatigue-vignette'); if (el) el.style.opacity = '0'; return; }
  const el = vignetteEl();
  const fatigue = Number(st.fatigue) || 0;
  const hunger = Number(st.hunger) || 0;
  let strength = Math.max(0, (fatigue - 55) / 45) * 0.8 + Math.max(0, (hunger - 75) / 25) * 0.25;
  if (fatigue >= 85) {
    if (now > nextBlink) { blinkUntil = now + 380; nextBlink = now + 5200 - (fatigue - 85) * 160; }
    if (now < blinkUntil) strength = 1;
  }
  el.style.opacity = String(Math.min(1, strength).toFixed(2));
}

if (typeof window !== 'undefined') {
  setInterval(() => { try { updateFeel(performance.now()); } catch (_) { /* optional */ } }, 400);
}
