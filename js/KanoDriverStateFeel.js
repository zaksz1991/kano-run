/**
 * Tired / hungry driver you can see and feel (visual only; never touches lanes, collisions, fares or wallet).
 *  - Fatigue >= 60: the road view slowly sways and nods; it grows with fatigue, and at 85+ the head "drops" in a slow nod.
 *  - Spoken-style nudges (toasts) when hunger or fatigue crosses a threshold, once per crossing, with where to fix it.
 * Reads game.dayCycle.state (hunger, fatigue). Works by transforming the WebGL canvas element, so it costs no GPU render work.
 */
const TOASTS = [
  { key: 'hungry', test: (s) => s.hunger >= 75, text: 'Your stomach is empty. Find a buka or a tea stand soon.' },
  { key: 'tired', test: (s) => s.fatigue >= 70, text: 'Your eyes are heavy. Take a tea break before you hit something.' },
  { key: 'exhausted', test: (s) => s.fatigue >= 88, text: 'You are nodding off at the wheel. Stop and rest now.' },
];
const shown = new Set();
let canvas = null;

function findCanvas() {
  if (canvas && canvas.isConnected) return canvas;
  canvas = document.querySelector('canvas');
  return canvas;
}

function tick(now) {
  const game = window.kanoGame || window.__KANO_ACTIVE_GAME__;
  const st = game?.dayCycle?.state;
  const el = findCanvas();
  if (!el) return;
  if (!st || game.state !== 'PLAY') { if (el.dataset.kanoSway) { el.style.transform = ''; delete el.dataset.kanoSway; } return; }
  const fatigue = Number(st.fatigue) || 0;
  const hunger = Number(st.hunger) || 0;
  for (const t of TOASTS) {
    const on = t.test({ fatigue, hunger });
    if (on && !shown.has(t.key)) { shown.add(t.key); try { game.ui?.toast?.(t.text); } catch (_) { /* optional */ } }
    if (!on && shown.has(t.key)) shown.delete(t.key);
  }
  const k = Math.max(0, (fatigue - 60) / 40) + Math.max(0, (hunger - 85) / 15) * 0.25;
  if (k <= 0) { if (el.dataset.kanoSway) { el.style.transform = ''; delete el.dataset.kanoSway; } return; }
  const t = now / 1000;
  const roll = Math.sin(t * 0.7) * 0.9 * k;
  let nod = Math.sin(t * 0.45) * 5 * k;
  if (fatigue >= 85) nod += Math.max(0, Math.sin(t * 0.33)) ** 6 * 26 * ((fatigue - 80) / 20);
  el.dataset.kanoSway = '1';
  el.style.transformOrigin = '50% 60%';
  el.style.transform = `translate3d(0, ${nod.toFixed(1)}px, 0) rotate(${roll.toFixed(2)}deg) scale(1.04)`;
}

if (typeof window !== 'undefined') {
  const loop = (now) => { try { tick(now); } catch (_) { /* optional */ } setTimeout(() => requestAnimationFrame(loop), 50); };
  requestAnimationFrame(loop);
}
