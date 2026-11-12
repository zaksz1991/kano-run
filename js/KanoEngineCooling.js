/**
 * Overheating options. When the engine passes 100 degrees a small card appears with the real roadside choices:
 *  - STOP & LET IT COOL  (free, stand still ~15 s, bonnet up)
 *  - ADD WATER ₦300      (you stop, pour in water from a roadside mai-ruwa; drops to about 75 degrees)
 *  - CALL MECHANIC ₦2,500 (coolant flush at the roadside: drops to 60 degrees and repairs some engine wear)
 * The card only appears while the keke is hot, never overlaps the top HUD, and disappears once it is cooled.
 * Electric keke: much cooler motor, so it rarely shows.
 */
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__;
const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;
let card = null;
let cooling = null; // { target, rate, label }

function ensure() {
  if (card && card.isConnected) return card;
  card = document.createElement('div');
  card.id = 'kano-cooling-card';
  card.style.cssText = 'position:fixed;left:8px;top:44%;z-index:48;width:min(52vw,210px);padding:10px;border-radius:14px;'
    + 'background:rgba(34,12,10,.95);border:2px solid #ff7a3d;color:#fff;font:700 12px/1.3 system-ui,sans-serif;display:none';
  document.body.appendChild(card);
  return card;
}

function button(label, fn, disabled) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.disabled = !!disabled;
  b.style.cssText = 'display:block;width:100%;margin-top:6px;padding:9px 8px;border-radius:9px;border:1px solid #ffb38a;'
    + `background:${disabled ? '#3a2a26' : '#7a2a12'};color:#fff;font:900 12px system-ui,sans-serif;touch-action:manipulation;opacity:${disabled ? 0.55 : 1}`;
  b.addEventListener('click', fn);
  return b;
}

function render(g) {
  const s = g.s;
  const c = ensure();
  const temp = Math.round(s.engineTemp || 0);
  const stopped = (s.speed || 0) < 3;
  c.replaceChildren();
  const h = document.createElement('div');
  h.textContent = `🌡 ENGINE ${temp}° · TOO HOT`;
  h.style.cssText = 'font-weight:900;color:#ffb38a';
  c.appendChild(h);
  if (cooling) {
    const p = document.createElement('div');
    p.style.marginTop = '6px';
    p.textContent = cooling.label + '…';
    c.appendChild(p);
    return;
  }
  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:4px;font-weight:600;opacity:.85';
  hint.textContent = stopped ? 'Choose how to cool it:' : 'Stop the keke first, or ease off the gas.';
  c.appendChild(hint);
  c.appendChild(button('STOP & LET IT COOL · FREE', () => start(g, 62, 3.2, 'Engine cooling, bonnet open'), !stopped));
  c.appendChild(button(`ADD WATER · ${naira(300)}`, () => pay(g, 300, 75, 18, 'Pouring water'), !stopped || s.score < 300));
  c.appendChild(button(`CALL MECHANIC · ${naira(2500)}`, () => pay(g, 2500, 60, 30, 'Mechanic flushing coolant', 12), !stopped || s.score < 2500));
}

function pay(g, cost, target, rate, label, repair = 0) {
  const s = g.s;
  if (s.score < cost) { g.ui?.toast?.('Not enough earnings for that'); return; }
  s.score -= cost;
  if (repair) s.engine = Math.min(100, (s.engine ?? 100) + repair);
  start(g, target, rate, label);
}

function start(g, target, rate, label) {
  cooling = { target, rate, label, until: performance.now() + 30000 };
  g.s.speed = 0; g.s.signedSpeed = 0;
  g.s.gas = false;
  render(g);
}

let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    const g = game();
    const s = g?.s;
    if (!g || g.state !== 'PLAY' || !s) { if (card) card.style.display = 'none'; cooling = null; }
    else {
      if (cooling) {
        s.speed = 0; s.signedSpeed = 0;
        s.engineTemp = Math.max(cooling.target, (s.engineTemp ?? 90) - cooling.rate * dt);
        if (s.engineTemp <= cooling.target + 0.2 || now > cooling.until) {
          cooling = null;
          g.ui?.toast?.('Engine cooled down. You can drive again.');
        }
      }
      const hot = (s.engineTemp ?? 0) >= 100 && !s.electric;
      if (hot || cooling) {
        const c = ensure();
        c.style.display = 'block';
        if (!c._t || now - c._t > 350) { c._t = now; render(g); }
      } else if (card) card.style.display = 'none';
    }
  } catch (_) { /* optional */ }
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && !window.__kanoEngineCooling) {
  window.__kanoEngineCooling = true;
  requestAnimationFrame(frame);
}
