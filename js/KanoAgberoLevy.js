/**
 * Agbero levy: at busy motor parks a tout steps up to the keke and demands the park ticket. Pay, argue or drive off,
 * each with a different cost. Never blocks a pick-up; the passenger is already on board.
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.agberoLevy.v1');
const naira = (n) => `₦${Math.round(n).toLocaleString()}`;
let timer = 0;
let lastAt = 0;

function host() {
  let el = document.getElementById('kano-agbero-panel');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kano-agbero-panel';
  el.setAttribute('role', 'dialog');
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:max(90px,env(safe-area-inset-bottom));width:min(92vw,340px);max-height:calc(100dvh - 160px);overflow-y:auto;z-index:60;background:#1b1a14;color:#fff;border:2px solid #ff9a3c;border-radius:14px;padding:10px 12px;font:800 13px Arial,sans-serif;box-shadow:0 10px 30px #0008;display:none';
  document.body.append(el);
  return el;
}
function close() { clearTimeout(timer); const el = document.getElementById('kano-agbero-panel'); if (el) { el.style.display = 'none'; el.replaceChildren(); } }
function btn(label, sub, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.style.cssText = 'display:block;width:100%;margin-top:6px;min-height:42px;border-radius:9px;border:1px solid #ff9a3c;text-align:left;padding:6px 10px;touch-action:manipulation;font:900 12px Arial,sans-serif;background:#2c2a1f;color:#fff';
  b.innerHTML = `${label}<br><span style="font-weight:700;opacity:.8;font-size:11px">${sub}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

function offer(game, parkName) {
  const s = game.s;
  const el = host();
  el.replaceChildren();
  let done = false;
  const settle = (fn) => { if (done) return; done = true; fn(); close(); };
  const fee = 100 + Math.round(Math.random() * 3) * 50;
  const title = document.createElement('div');
  title.textContent = `Agbero at ${parkName || 'the park'}`;
  title.style.cssText = 'font-size:14px;color:#ff9a3c';
  const line = document.createElement('div');
  line.textContent = `"Oga, park ticket! ${naira(fee)}. No ticket, no loading."`;
  line.style.cssText = 'margin-top:4px;font-weight:700;opacity:.9';
  el.append(title, line);
  const pay = (amount) => { s.fares = Math.max(0, (Number(s.fares) || 0) - amount); };

  el.append(btn(`Pay the ticket, ${naira(fee)}`, 'Quiet. He waves you through and keeps the park friendly.', () => settle(() => {
    pay(fee); s.kanoGoodwill = (s.kanoGoodwill || 0) + 1; game.ui?.toast?.(`Ticket paid, ${naira(fee)}.`);
  })));
  el.append(btn('Argue it down', 'Good odds of a discount, but he can get loud.', () => settle(() => {
    if (Math.random() < 0.6) { const half = Math.round(fee / 2 / 10) * 10; pay(half); game.ui?.toast?.(`He agrees on ${naira(half)}.`); }
    else { pay(fee * 2); s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 6); game.ui?.toast?.(`He shouts, the crowd gathers. You pay ${naira(fee * 2)}.`); }
  })));
  el.append(btn('Drive off', 'Free if he lets it pass. Park boys remember.', () => settle(() => {
    if (Math.random() < 0.5) { game.ui?.toast?.('You slip away. Nobody follows.'); }
    else { s.kanoGoodwill = (s.kanoGoodwill || 0) - 1; s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 4); game.ui?.toast?.('They bang the roof as you go. Goodwill drops.'); }
  })));
  el.style.display = 'block';
  timer = setTimeout(() => settle(() => { pay(fee); game.ui?.toast?.(`He takes ${naira(fee)} through the window.`); }), 11000);
}

if (!Game.prototype[PATCH]) {
  Object.defineProperty(Game.prototype, PATCH, { value: true });
  const base = Game.prototype.pickup;
  Game.prototype.pickup = function pickupWithAgbero(zone) {
    const before = this.s?.passengers?.length || 0;
    const result = base.call(this, zone);
    try {
      const after = this.s?.passengers?.length || 0;
      const busy = ['kano-change-panel', 'kano-haggle-panel', 'kano-ride-panel', 'kano-stubborn-panel', 'kano-agbero-panel']
        .some((id) => document.getElementById(id)?.childElementCount && document.getElementById(id).style.display !== 'none');
      const now = Date.now();
      if (zone?.hub && after > before && !busy && now - lastAt > 240000 && Math.random() < 0.35) {
        lastAt = now;
        setTimeout(() => offer(this, zone.name || zone.label), 1200);
      }
    } catch { /* never break a pick-up */ }
    return result;
  };
}
