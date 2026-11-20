/**
 * Drop-off payment step. Real keke rides rarely end with the exact fare: the passenger hands over a bigger
 * note and the driver decides what to do. After a solo drop-off the driver now chooses:
 *   - give full change (honest, small tip chance, goodwill up)
 *   - say "no change" and keep part of it (extra cash now, but the passenger may shout and goodwill drops)
 *   - ask for transfer (exact fare, sometimes the network fails and the passenger has to find cash later)
 * The fare itself is still paid by the existing drop-off logic; this only adds the human step on top.
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.changePayment.v1');
const NOTES = [200, 500, 1000, 2000];
const naira = (n) => `₦${Math.round(n).toLocaleString()}`;

function host() {
  let el = document.getElementById('kano-change-panel');
  if (el) return el;
  const style = document.createElement('style');
  style.textContent = '@keyframes kanoChangePop{0%{opacity:0;transform:translate(-50%,14px) scale(.92)}70%{opacity:1;transform:translate(-50%,-2px) scale(1.02)}100%{opacity:1;transform:translate(-50%,0) scale(1)}}';
  document.head.append(style);
  el = document.createElement('div');
  el.id = 'kano-change-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Passenger payment');
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:max(70px,env(safe-area-inset-top));width:min(92vw,340px);max-height:calc(100dvh - 160px);overflow-y:auto;z-index:60;background:#14202b;color:#fff;border:2px solid #f5d77b;border-radius:14px;padding:10px 12px;font:800 13px Arial,sans-serif;box-shadow:0 10px 30px #0008;display:none;animation:kanoChangePop .3s cubic-bezier(.2,.9,.3,1.2) both';
  document.body.append(el);
  return el;
}

function close() { const el = document.getElementById('kano-change-panel'); if (el) { el.style.display = 'none'; el.replaceChildren(); } }

function btn(label, sub, onClick, primary) {
  const b = document.createElement('button');
  b.type = 'button';
  b.style.cssText = `display:block;width:100%;margin-top:6px;min-height:42px;border-radius:9px;border:1px solid #f5d77b;text-align:left;padding:6px 10px;touch-action:manipulation;font:900 12px Arial,sans-serif;${primary ? 'background:#f5c518;color:#1a1a1a' : 'background:#1f3345;color:#fff'}`;
  b.innerHTML = `${label}<br><span style="font-weight:700;opacity:.8;font-size:11px">${sub}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

function offer(game, passenger, fare) {
  const note = NOTES.find((n) => n > fare + 40);
  if (!note) return;
  const change = note - fare;
  const s = game.s;
  const el = host();
  el.replaceChildren();
  let settled = false;
  const settle = (fn) => { if (settled) return; settled = true; fn(); close(); };
  const title = document.createElement('div');
  title.textContent = `${passenger?.name || 'Passenger'} pays with a ${naira(note)} note`;
  title.style.cssText = 'font-size:14px;color:#f5d77b';
  const line = document.createElement('div');
  line.textContent = `Fare ${naira(fare)}. Change owed: ${naira(change)}. What do you do?`;
  line.style.cssText = 'margin-top:4px;font-weight:700;opacity:.9';
  el.append(title, line);

  el.append(btn('Give full change', `Hand back ${naira(change)}. Honest drivers get tips and loyal riders.`, () => settle(() => {
    s.kanoGoodwill = (s.kanoGoodwill || 0) + 1;
    if (Math.random() < 0.4) {
      const tip = [20, 50, 100][Math.floor(Math.random() * 3)];
      s.fares += tip; s.score += tip;
      game.ui?.toast?.(`Change returned. "Nagode, oga!" Tip ${naira(tip)}.`);
    } else game.ui?.toast?.('Change returned. Passenger thanks you.');
  }), true));

  const keep = Math.min(change, change <= 100 ? change : 100);
  el.append(btn('"No change, oga"', `Keep ${naira(keep)} extra. Risky: the passenger may shout and spread the word.`, () => settle(() => {
    if (Math.random() < 0.55) {
      s.kanoGoodwill = (s.kanoGoodwill || 0) - 2;
      s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 4);
      game.ui?.toast?.('Passenger shouts "Ole!" in front of everyone. You get the money but lose goodwill.');
      s.fares += Math.floor(keep * 0.5); s.score += Math.floor(keep * 0.5);
    } else {
      s.fares += keep; s.score += keep;
      game.ui?.toast?.(`Passenger lets it go. You keep ${naira(keep)}.`);
    }
  })));

  el.append(btn('Ask for transfer', 'Send your account number. Exact fare only. Network may fail.', () => settle(() => {
    if (Math.random() < 0.8) game.ui?.toast?.(`Transfer received. ${naira(fare)} confirmed.`);
    else {
      const loss = Math.floor(fare * 0.5);
      s.fares = Math.max(0, s.fares - loss); s.score = Math.max(0, s.score - loss);
      game.ui?.toast?.(`Network failed. Passenger ran off with half the fare (${naira(loss)} lost).`);
    }
  })));

  el.style.display = 'block';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'kanoChangePop .3s cubic-bezier(.2,.9,.3,1.2) both';
  setTimeout(() => settle(() => { s.kanoGoodwill = (s.kanoGoodwill || 0) + 1; game.ui?.toast?.('Change returned automatically.'); }), 12000);
}

if (!Game.prototype[PATCH]) {
  Object.defineProperty(Game.prototype, PATCH, { value: true });
  const base = Game.prototype.drop;
  Game.prototype.drop = function dropWithChangeStep(zone) {
    const passenger = this.s?.passengers?.[0] || null;
    const before = this.s?.passengers?.length || 0;
    const fareBefore = Number(this.s?.fares) || 0;
    const result = base.call(this, zone);
    try {
      const after = this.s?.passengers?.length || 0;
      const paid = (Number(this.s?.fares) || 0) - fareBefore;
      if (passenger && result !== false && after < before && !passenger.group && !passenger.special && paid >= 120 && Math.random() < 0.5
          && !document.getElementById('kano-haggle-panel')?.childElementCount) {
        offer(this, passenger, Math.round(paid));
      }
    } catch { /* never break a drop-off */ }
    return result;
  };
}
