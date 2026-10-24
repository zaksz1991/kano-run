/**
 * Fare haggling in the live game.
 * After a solo roadside passenger boards, a compact, non-blocking panel lets the
 * driver accept the passenger's offer, counter, or refuse. The agreed amount
 * replaces passenger.fare, so the existing drop-off payout, wallet and combo
 * logic stay authoritative. Group/checkpoint/special passengers keep the normal fare.
 */
import { Game } from './game.js';
import { KanoFareHagglingDirector } from './KanoFareHagglingDirector.js';

const PATCH = Symbol.for('kano.life.fareHagglingBridge.v1');
const AUTO_ACCEPT_MS = 14000;
const directors = new WeakMap();

export function personalityForPassenger(passenger, rnd = Math.random()) {
  const cls = String(passenger?.class || '');
  if (/student/i.test(passenger?.name || '')) return 'student';
  if (cls === 'VIP') return 'visitor';
  if (cls === 'market woman') return rnd < 0.7 ? 'trader' : 'elder';
  if (/student/i.test(passenger?.name || '')) return 'student';
  if (cls === 'worker') return rnd < 0.25 ? 'hurried' : 'worker';
  return 'regular';
}

export function eligibleForHaggling(passenger) {
  return Boolean(passenger) && !passenger.group && !passenger.special && passenger.seats === 1 && passenger.fare >= 60;
}

const naira = (n) => `₦${Math.round(n).toLocaleString()}`;

function panelHost() {
  let el = document.getElementById('kano-haggle-panel');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kano-haggle-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Fare negotiation');
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:132px;width:min(92vw,360px);z-index:60;background:rgba(10,24,16,.95);color:#fff4d0;border:2px solid #f5d77b;border-radius:14px;padding:10px 12px;font:700 13px/1.35 Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);display:none';
  document.body.append(el);
  return el;
}

function closePanel() {
  const el = document.getElementById('kano-haggle-panel');
  if (el) { el.style.display = 'none'; el.replaceChildren(); }
}

function button(label, onClick, primary = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText = `flex:1 1 45%;min-height:40px;border-radius:9px;border:1px solid #f5d77b;font:900 12px Arial,sans-serif;touch-action:manipulation;${primary ? 'background:#f5c542;color:#1b1405' : 'background:#203747;color:#fff4d0'}`;
  b.addEventListener('click', onClick);
  return b;
}

function openNegotiation(game, passenger) {
  let director = directors.get(game);
  if (!director) { director = new KanoFareHagglingDirector(); directors.set(game, director); }
  const id = `p-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const started = director.startNegotiation({
    passengerId: id,
    passengerName: passenger.name,
    personality: personalityForPassenger(passenger),
    destination: passenger.dest,
    suggestedFare: passenger.fare,
    distanceKm: 1,
  });
  if (!started.ok) return;
  const host = panelHost();
  let timer = null;
  const finish = (message, ok) => {
    clearTimeout(timer);
    closePanel();
    if (message) game.ui?.toast?.(message);
    return ok;
  };
  const stillAboard = () => game.state === 'PLAY' && game.s.passengers.includes(passenger);
  const render = () => {
    const session = director.snapshot(id);
    if (!session || session.status !== 'negotiating') return;
    if (!stillAboard()) { finish('', false); return; }
    host.replaceChildren();
    host.style.display = 'block';
    const head = document.createElement('div');
    head.innerHTML = '';
    head.textContent = `${session.passengerName} · ${session.personalityLabel} → ${session.destination}`;
    head.style.cssText = 'font-size:11px;color:#f5d77b';
    const said = document.createElement('div');
    const last = [...session.history].reverse().find((h) => h.speaker === 'passenger');
    said.textContent = `“${last?.text || ''}”  ${naira(session.passengerOffer)}`;
    said.style.cssText = 'margin:4px 0 8px;font-size:14px';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    const counters = [session.suggestedFare, Math.round(session.suggestedFare * 1.1)];
    row.append(
      button(`ACCEPT ${naira(session.passengerOffer)}`, () => {
        const r = director.acceptPassengerOffer(id);
        if (r.ok) { passenger.fare = r.fare; finish(`Fare agreed · ${naira(r.fare)}`, true); }
      }, true),
      ...counters.map((amount) => button(`ASK ${naira(amount)}`, () => {
        const r = director.counterOffer(id, amount);
        if (!r.ok) return;
        if (r.status === 'accepted') { passenger.fare = r.fare; finish(`Fare agreed · ${naira(r.fare)}`, true); }
        else if (r.status === 'rejected') {
          const index = game.s.passengers.indexOf(passenger);
          if (index >= 0) { game.s.passengers.splice(index, 1); game.s.boards = Math.max(0, (game.s.boards || 1) - 1); }
          finish(`${passenger.name} walked away · too expensive`, false);
        } else render();
      })),
      button('REFUSE', () => {
        director.refusePassenger(id);
        const index = game.s.passengers.indexOf(passenger);
        if (index >= 0) { game.s.passengers.splice(index, 1); game.s.boards = Math.max(0, (game.s.boards || 1) - 1); }
        finish('You declined this passenger', false);
      }),
    );
    host.append(head, said, row);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const r = director.acceptPassengerOffer(id);
      if (r.ok && stillAboard()) { passenger.fare = r.fare; finish(`Fare agreed · ${naira(r.fare)}`, true); } else finish('', false);
    }, AUTO_ACCEPT_MS);
  };
  render();
}

if (Game?.prototype && !Game.prototype[PATCH]) {
  const originalPickup = Game.prototype.pickup;
  if (typeof originalPickup === 'function') {
    Game.prototype.pickup = function pickupWithHaggling(zone, ...args) {
      const before = this.s?.passengers?.length || 0;
      const result = originalPickup.call(this, zone, ...args);
      try {
        const passengers = this.s?.passengers || [];
        if (result && passengers.length === before + 1) {
          const passenger = passengers[passengers.length - 1];
          if (eligibleForHaggling(passenger)) {
            // Let any same-tick random event (free-ride request etc.) open first; never stack dialogs.
            setTimeout(() => {
              if (this.state === 'PLAY' && !this.s.event && this.s.passengers.includes(passenger)) openNegotiation(this, passenger);
            }, 250);
          }
        }
      } catch (error) { console.warn('[Kano haggling] skipped', error); }
      return result;
    };
  }
  Object.defineProperty(Game.prototype, PATCH, { value: true });
}
