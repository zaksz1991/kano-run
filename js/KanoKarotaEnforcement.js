/**
 * KAROTA enforcement beyond the roadside checkpoint:
 *  - Market ticket: loading at a busy market stop without a valid ticket gets you stopped.
 *  - Overload: more than three passengers in a keke.
 *  - Wrong parking: stopping in the traffic lane.
 * Each is a short panel with different choices, risks and costs. The panel never blocks the driving controls.
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.karotaEnforcement.v1');
const naira = (n) => `₦${Math.round(n).toLocaleString()}`;
const PANELS = ['kano-change-panel', 'kano-haggle-panel', 'kano-ride-panel', 'kano-stubborn-panel', 'kano-gang-panel', 'kano-karota-panel'];
const LEGAL_SEATS = 3;
let timer = 0;
let lastAt = 0;
let stillFor = 0;
let lastStopAt = 0;

const anyPanel = () => PANELS.some((id) => { const e = document.getElementById(id); return e && e.childElementCount && e.style.display !== 'none'; });

function host() {
  let el = document.getElementById('kano-karota-panel');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kano-karota-panel';
  el.setAttribute('role', 'dialog');
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:max(90px,env(safe-area-inset-bottom));width:min(92vw,340px);max-height:calc(100dvh - 160px);overflow-y:auto;z-index:61;background:#0f1b2e;color:#fff;border:2px solid #6db3e8;border-radius:14px;padding:10px 12px;font:800 13px Arial,sans-serif;box-shadow:0 10px 30px #0009;display:none';
  document.body.append(el);
  return el;
}
function close() { clearTimeout(timer); const el = document.getElementById('kano-karota-panel'); if (el) { el.style.display = 'none'; el.replaceChildren(); } }
function btn(label, sub, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.style.cssText = 'display:block;width:100%;margin-top:6px;min-height:42px;border-radius:9px;border:1px solid #6db3e8;text-align:left;padding:6px 10px;touch-action:manipulation;font:900 12px Arial,sans-serif;background:#18304f;color:#fff';
  b.innerHTML = `${label}<br><span style="font-weight:700;opacity:.8;font-size:11px">${sub}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

function open(game, title, line, options, autoMs, autoFn) {
  const el = host();
  el.replaceChildren();
  let done = false;
  const settle = (fn) => { if (done) return; done = true; try { fn(); } finally { close(); } };
  const t = document.createElement('div');
  t.textContent = `🚔 ${title}`;
  t.style.cssText = 'font-size:14px;color:#6db3e8';
  const l = document.createElement('div');
  l.textContent = line;
  l.style.cssText = 'margin-top:4px;font-weight:700;opacity:.92';
  el.append(t, l);
  for (const [label, sub, fn] of options) el.append(btn(label, sub, () => settle(fn)));
  el.style.display = 'block';
  timer = setTimeout(() => settle(autoFn), autoMs);
  lastAt = Date.now();
}

const lose = (s, amount) => { s.fares = Math.max(0, (Number(s.fares) || 0) - amount); };
const tire = (s, n) => { s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + n); };

function marketTicket(game, place) {
  const s = game.s;
  const price = 200;
  const fine = 600;
  open(game, 'KAROTA · Market ticket', `"Show your ticket for ${place || 'this market'}. No ticket, no loading here."`, [
    [`Buy a ticket, ${naira(price)}`, 'Valid for the next few minutes in every market.', () => { lose(s, price); s.kanoMarketTicketUntil = Date.now() + 240000; game.ui?.toast?.(`Ticket bought, ${naira(price)}.`); }],
    ['Say you forgot it', 'Half the time he lets it go with a warning.', () => {
      if (Math.random() < 0.5) { game.ui?.toast?.('Warning only. Do not forget it again.'); s.kanoMarketTicketUntil = Date.now() + 90000; }
      else { lose(s, fine); tire(s, 5); game.ui?.toast?.(`Fined ${naira(fine)} for no market ticket.`); }
    }],
    ['Drive off', 'Risky. He notes your plate and you pay more later.', () => {
      if (Math.random() < 0.4) game.ui?.toast?.('You slip away from the market gate.');
      else { lose(s, fine * 2); s.kanoGoodwill = (s.kanoGoodwill || 0) - 1; game.ui?.toast?.(`Caught. Fine ${naira(fine * 2)}.`); }
    }],
  ], 12000, () => { lose(s, fine); game.ui?.toast?.(`No answer. Fined ${naira(fine)}.`); });
}

function overload(game, count) {
  const s = game.s;
  const fine = 1000;
  open(game, 'KAROTA · Overload', `"${count} passengers in a keke? The limit is ${LEGAL_SEATS}. Park and answer me."`, [
    [`Pay the fine, ${naira(fine)}`, 'Keep everyone on board.', () => { lose(s, fine); tire(s, 4); game.ui?.toast?.(`Overload fine paid, ${naira(fine)}.`); }],
    ['Let one passenger off', 'No fine, but you lose that fare.', () => {
      const p = s.passengers.pop();
      game.ui?.toast?.(`${p?.name || 'A passenger'} gets down. No fine.`);
    }],
    ['Plead with him', 'Small chance he waves you on. Otherwise the fine doubles.', () => {
      if (Math.random() < 0.35) game.ui?.toast?.('He waves you on. "Next time, I will take the keke."');
      else { lose(s, fine * 2); tire(s, 6); s.kanoGoodwill = (s.kanoGoodwill || 0) - 1; game.ui?.toast?.(`He refuses. Fine ${naira(fine * 2)}.`); }
    }],
  ], 12000, () => { lose(s, fine); game.ui?.toast?.(`Overload fine, ${naira(fine)}.`); });
}

function wrongParking(game) {
  const s = game.s;
  const fine = 500;
  open(game, 'KAROTA · Wrong parking', '"You are parked in the traffic lane. Move to the roadside or pay."', [
    [`Pay the fine, ${naira(fine)}`, 'Quick and clean.', () => { lose(s, fine); game.ui?.toast?.(`Parking fine paid, ${naira(fine)}.`); }],
    ['Move off now', 'Half the time that is enough.', () => {
      if (Math.random() < 0.5) game.ui?.toast?.('Warning only. Park at the kerb next time.');
      else { lose(s, fine); tire(s, 3); game.ui?.toast?.(`He already wrote the ticket. ${naira(fine)}.`); }
    }],
    ['Argue it', 'He is not in the mood.', () => { lose(s, Math.round(fine * 1.6)); tire(s, 6); game.ui?.toast?.(`Fine plus extra, ${naira(Math.round(fine * 1.6))}.`); }],
  ], 10000, () => { lose(s, fine); game.ui?.toast?.(`Parking fine, ${naira(fine)}.`); });
}

if (!Game.prototype[PATCH]) {
  Object.defineProperty(Game.prototype, PATCH, { value: true });
  // Instance-level hook: other modules replace pickup/drop on the game object itself, which
  // would hide a prototype wrapper added later (the KAROTA panels then never appeared).
  const hookGame = () => {
    const g = window.kanoGame;
    if (!g || g.__kanoKarotaHooked || typeof g.pickup !== 'function' || typeof g.drop !== 'function') return;
    g.__kanoKarotaHooked = true;
    const base = g.pickup;
    g.pickup = function pickupWithKarota(zone, ...rest) {
      const before = this.s?.passengers?.length || 0;
      lastStopAt = Date.now();
      const result = base.call(this, zone, ...rest);
      try {
        const s = this.s;
        const after = s?.passengers?.length || 0;
        if (after > before && !anyPanel() && Date.now() - lastAt > 90000) {
          const seats = (s.passengers || []).reduce((n, p) => n + (Number(p.seats) || 1), 0);
          if (seats > LEGAL_SEATS && Math.random() < 0.65) setTimeout(() => overload(this, seats), 1500);
          else if (zone?.hub && !(Number(s.kanoMarketTicketUntil) > Date.now()) && Math.random() < 0.55) setTimeout(() => marketTicket(this, zone.stopName), 1500);
          else if (zone?.hub && Number(s.kanoMarketTicketUntil) > Date.now() && !s.kanoTicketShown) { s.kanoTicketShown = true; this.ui?.toast?.('KAROTA checks your market ticket. All good.'); }
        }
      } catch { /* never break a pick-up */ }
      return result;
    };
    const dropBase = g.drop;
    g.drop = function dropMarkStop(zone, ...rest) { lastStopAt = Date.now(); return dropBase.call(this, zone, ...rest); };
  };
  setInterval(hookGame, 300);
  setInterval(() => {
    try {
      const g = window.kanoGame; const s = g?.s;
      if (!s || g.state !== 'PLAY') { stillFor = 0; return; }
      // Loading or dropping passengers is a legal stop: never fine it.
      if (window.kanoBoardingCamera?.w > 0 || (window.__KANO_LIFE_SCENE_UPGRADE__?.walkingPassengers || []).length || Date.now() - lastStopAt < 30000) { stillFor = 0; return; }
      const near = (s.zones || []).some((z) => z.type !== 'pothole' && z.depth > 0 && z.depth < 0.4);
      const middle = Math.abs(Number(s.steer) || 0) < 0.5;
      if ((Number(s.speed) || 0) < 1.5 && !near && middle && !s.event) stillFor += 0.5; else stillFor = 0;
      if (stillFor >= 8 && !anyPanel() && Date.now() - lastAt > 120000 && Math.random() < 0.7) { stillFor = 0; wrongParking(g); }
    } catch { /* cosmetic */ }
  }, 500);
}
