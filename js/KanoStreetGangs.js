/**
 * Kano street gangs: Yan Daba (bad boys) demand 'kudin shayi' at busy parks, and Yan Kwacen Waya (phone snatchers) on
 * bikes go for a passenger's phone on the road. Each has three responses with different risk. Never blocks a pick-up; the passenger is already on board.
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.streetGangs.v1');
const naira = (n) => `₦${Math.round(n).toLocaleString()}`;
let timer = 0;
let lastAt = 0;

function host() {
  let el = document.getElementById('kano-gang-panel');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kano-gang-panel';
  el.setAttribute('role', 'dialog');
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:max(90px,env(safe-area-inset-bottom));width:min(92vw,340px);max-height:calc(100dvh - 160px);overflow-y:auto;z-index:60;background:#1b1a14;color:#fff;border:2px solid #ff9a3c;border-radius:14px;padding:10px 12px;font:800 13px Arial,sans-serif;box-shadow:0 10px 30px #0008;display:none';
  document.body.append(el);
  return el;
}
function close() { clearTimeout(timer); const el = document.getElementById('kano-gang-panel'); if (el) { el.style.display = 'none'; el.replaceChildren(); } }
function btn(label, sub, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.style.cssText = 'display:block;width:100%;margin-top:6px;min-height:42px;border-radius:9px;border:1px solid #ff9a3c;text-align:left;padding:6px 10px;touch-action:manipulation;font:900 12px Arial,sans-serif;background:#2c2a1f;color:#fff';
  b.innerHTML = `${label}<br><span style="font-weight:700;opacity:.8;font-size:11px">${sub}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

function offerDaba(game, place) {
  const s = game.s;
  const el = host();
  el.replaceChildren();
  let done = false;
  const settle = (fn) => { if (done) return; done = true; fn(); close(); };
  const fee = 200 + Math.round(Math.random() * 3) * 100;
  const title = document.createElement('div');
  title.textContent = `Yan Daba at ${place || 'the park'}`;
  title.style.cssText = 'font-size:14px;color:#ff9a3c';
  const line = document.createElement('div');
  line.textContent = `"Direba, kudin shayi! ${naira(fee)}. Ba ka biya ba, ba ka tafiya."`;
  line.style.cssText = 'margin-top:4px;font-weight:700;opacity:.9';
  el.append(title, line);
  const pay = (amount) => { s.fares = Math.max(0, (Number(s.fares) || 0) - amount); };
  el.append(btn(`Pay the kudin shayi, ${naira(fee)}`, 'Quiet. They let you load and leave you alone for a while.', () => settle(() => {
    pay(fee); s.kanoGoodwill = (s.kanoGoodwill || 0) + 1; game.ui?.toast?.(`Paid ${naira(fee)}. The boys step back.`);
  })));
  el.append(btn('Beg and bargain', 'They may take half, or get rough and take double.', () => settle(() => {
    if (Math.random() < 0.55) { const half = Math.round(fee / 2 / 10) * 10; pay(half); game.ui?.toast?.(`They take ${naira(half)} and laugh.`); }
    else { pay(fee * 2); s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 8); game.ui?.toast?.(`They slap the roof and take ${naira(fee * 2)}.`); }
  })));
  el.append(btn('Drive off fast', 'Free if they are slow. They hit the keke if they catch you.', () => settle(() => {
    if (Math.random() < 0.45) { game.ui?.toast?.('You are gone before they react.'); }
    else { s.kanoGoodwill = (s.kanoGoodwill || 0) - 1; s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 6); game.ui?.toast?.('A stone hits the keke as you go. They will remember you.'); }
  })));
  el.style.display = 'block';
  timer = setTimeout(() => settle(() => { pay(fee); game.ui?.toast?.(`They take ${naira(fee)} through the window.`); }), 11000);
}

function offerSnatch(game) {
  const s = game.s;
  const el = host();
  el.replaceChildren();
  let done = false;
  const settle = (fn) => { if (done) return; done = true; fn(); close(); };
  const loss = 1000 + Math.round(Math.random() * 4) * 500;
  const title = document.createElement('div');
  title.textContent = 'Yan Kwacen Waya!';
  title.style.cssText = 'font-size:14px;color:#ff6b5a';
  const line = document.createElement('div');
  line.textContent = 'A bike with two boys closes in beside your passenger, hands reaching for the phone.';
  line.style.cssText = 'margin-top:4px;font-weight:700;opacity:.9';
  el.append(title, line);
  const lose = (amount) => { s.fares = Math.max(0, (Number(s.fares) || 0) - amount); };
  el.append(btn('Brake hard and block them', 'Good odds they swerve off. Risky if they are armed.', () => settle(() => {
    if (Math.random() < 0.6) { s.kanoGoodwill = (s.kanoGoodwill || 0) + 1; game.ui?.toast?.('They swerve away. Your passenger thanks you.'); }
    else { lose(loss); s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 8); game.ui?.toast?.(`They grab it anyway. You lose ${naira(loss)} in compensation.`); }
  })));
  el.append(btn('Shout "Barawo!" and honk', 'Crowd attention. Often scares them without a fight.', () => settle(() => {
    if (Math.random() < 0.5) { game.ui?.toast?.('People shout. The boys speed away empty-handed.'); }
    else { lose(Math.round(loss / 2)); game.ui?.toast?.(`The crowd is too slow. You lose ${naira(Math.round(loss / 2))}.`); }
  })));
  el.append(btn('Speed away', 'Fast but you are carrying a passenger on a bad road.', () => settle(() => {
    if (Math.random() < 0.4) { game.ui?.toast?.('You outrun them.'); }
    else { lose(loss); s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 5); game.ui?.toast?.(`They snatch it from the window. You lose ${naira(loss)}.`); }
  })));
  el.style.display = 'block';
  timer = setTimeout(() => settle(() => { lose(loss); game.ui?.toast?.(`The phone is gone. You lose ${naira(loss)}.`); }), 9000);
}

function isNight() {
  const m = Number(window.kanoDayCycle?.state?.minuteOfDay);
  if (!Number.isFinite(m)) return false;
  const h = (((m % 1440) + 1440) % 1440) / 60;
  return h >= 19 || h < 5;
}

if (!Game.prototype[PATCH]) {
  Object.defineProperty(Game.prototype, PATCH, { value: true });
  const base = Game.prototype.pickup;
  Game.prototype.pickup = function pickupWithAgbero(zone) {
    const before = this.s?.passengers?.length || 0;
    const result = base.call(this, zone);
    try {
      const after = this.s?.passengers?.length || 0;
      const busy = ['kano-change-panel', 'kano-haggle-panel', 'kano-ride-panel', 'kano-stubborn-panel', 'kano-gang-panel', 'kano-karota-panel']
        .some((id) => document.getElementById(id)?.childElementCount && document.getElementById(id).style.display !== 'none');
      const now = Date.now();
      if (after > before && !busy && now - lastAt > (isNight() ? 90000 : 200000)) {
        if (zone?.hub && Math.random() < 0.35) { lastAt = now; setTimeout(() => offerDaba(this, zone.name || zone.label), 1200); }
        else if (!zone?.hub && Math.random() < (isNight() ? 0.45 : 0.15)) { lastAt = now; setTimeout(() => offerSnatch(this), 2500); }
      }
    } catch { /* never break a pick-up */ }
    return result;
  };
}
