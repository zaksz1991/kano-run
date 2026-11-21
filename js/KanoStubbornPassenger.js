/**
 * Stubborn passenger: now and then a rider reaches the stop, stays in the seat and says "Oga, abeg, carry me small
 * further". The driver decides how to handle it. Runs after the normal drop-off, on top of the fare already paid.
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.stubbornPassenger.v1');
const naira = (n) => `₦${Math.round(n).toLocaleString()}`;
let timer = 0;

function host() {
  let el = document.getElementById('kano-stubborn-panel');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kano-stubborn-panel';
  el.setAttribute('role', 'dialog');
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:max(90px,env(safe-area-inset-bottom));width:min(92vw,340px);max-height:calc(100dvh - 160px);overflow-y:auto;z-index:60;background:#14202b;color:#fff;border:2px solid #f5d77b;border-radius:14px;padding:10px 12px;font:800 13px Arial,sans-serif;box-shadow:0 10px 30px #0008;display:none';
  document.body.append(el);
  return el;
}
function close() { clearTimeout(timer); const el = document.getElementById('kano-stubborn-panel'); if (el) { el.style.display = 'none'; el.replaceChildren(); } }
function btn(label, sub, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.style.cssText = 'display:block;width:100%;margin-top:6px;min-height:42px;border-radius:9px;border:1px solid #f5d77b;text-align:left;padding:6px 10px;touch-action:manipulation;font:900 12px Arial,sans-serif;background:#1f3345;color:#fff';
  b.innerHTML = `${label}<br><span style="font-weight:700;opacity:.8;font-size:11px">${sub}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

function offer(game, passenger, fare) {
  const s = game.s;
  const el = host();
  el.replaceChildren();
  let done = false;
  const settle = (fn) => { if (done) return; done = true; fn(); close(); };
  const title = document.createElement('div');
  title.textContent = `${passenger?.name || 'Passenger'} won't come down`;
  title.style.cssText = 'font-size:14px;color:#f5d77b';
  const line = document.createElement('div');
  line.textContent = '"Oga, abeg, carry me small further. I no reach yet."';
  line.style.cssText = 'margin-top:4px;font-weight:700;opacity:.9';
  el.append(title, line);
  const extra = Math.max(50, Math.round(fare * 0.4 / 10) * 10);

  el.append(btn('Politely insist', 'Tell them this is the stop. They may argue before leaving.', () => settle(() => {
    if (Math.random() < 0.7) { s.kanoGoodwill = (s.kanoGoodwill || 0) + 1; game.ui?.toast?.('Passenger apologises and climbs down.'); }
    else { s.kanoGoodwill = (s.kanoGoodwill || 0) - 1; s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 5); game.ui?.toast?.('Long argument at the roadside. You lose time and patience.'); }
  })));
  el.append(btn(`Carry them further for ${naira(extra)}`, 'Quick extra fare, a bit more tiredness.', () => settle(() => {
    s.fares += extra; s.score += extra;
    s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 3);
    game.ui?.toast?.(`Short extra trip. ${naira(extra)} added.`);
  })));
  el.append(btn('Let it go', 'Keep the peace. They climb down smiling.', () => settle(() => {
    s.kanoGoodwill = (s.kanoGoodwill || 0) + 1;
    game.ui?.toast?.('Passenger thanks you and leaves.');
  })));
  el.style.display = 'block';
  timer = setTimeout(() => settle(() => game.ui?.toast?.('Passenger finally climbs down.')), 11000);
}

if (!Game.prototype[PATCH]) {
  Object.defineProperty(Game.prototype, PATCH, { value: true });
  const base = Game.prototype.drop;
  Game.prototype.drop = function dropWithStubborn(zone) {
    const passenger = this.s?.passengers?.[0] || null;
    const before = this.s?.passengers?.length || 0;
    const fareBefore = Number(this.s?.fares) || 0;
    const result = base.call(this, zone);
    try {
      const after = this.s?.passengers?.length || 0;
      const paid = (Number(this.s?.fares) || 0) - fareBefore;
      const busy = ['kano-change-panel', 'kano-haggle-panel', 'kano-ride-panel', 'kano-stubborn-panel']
        .some((id) => document.getElementById(id)?.childElementCount && document.getElementById(id).style.display !== 'none');
      if (passenger && result !== false && after < before && !passenger.group && !passenger.special && paid >= 80 && !busy && Math.random() < 0.15) {
        setTimeout(() => offer(this, passenger, Math.round(paid)), 900);
      }
    } catch { /* never break a drop-off */ }
    return result;
  };
}
