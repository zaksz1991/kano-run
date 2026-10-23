/** Hooks persistent passenger relationships into actual Game pickup/drop outcomes. */
import { Game } from './game.js';
import { UI } from './ui.js';
import { KanoNorthernDriverPassengerRelationships } from './KanoNorthernDriverPassengerRelationships.js';

const PATCH = Symbol.for('kano.life.passengerRelationships.v1');
const passengers = new KanoNorthernDriverPassengerRelationships();
let activeUI = null;

function getDay(game) {
  const s = game?.s || {};
  return Math.max(1, Math.floor(Number(s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? 1) || 1));
}
function getMinute(game) {
  const s = game?.s || {};
  const value = Number(s.gameClockMinutes ?? s.__kanoScheduleClockMinutes ?? 408);
  return ((Math.floor(Number.isFinite(value) ? value : 408) % 1440) + 1440) % 1440;
}
function emitUpdate(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kano:passenger-relationship-updated', { detail: { ...detail, snapshot: passengers.getSnapshot() } }));
}
function refreshPanel() {
  if (typeof document === 'undefined') return null;
  const section = ensurePanel();
  if (!section) return null;
  const snapshot = passengers.getSnapshot();
  const setText = (id, text) => { const node = section.querySelector(`#${id}`); if (node) node.textContent = String(text); };
  const setBar = (id, value) => { const node = section.querySelector(`#${id}`); if (node) node.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`; };
  const totals = snapshot.totals;
  setText('knpr-reputation', `${snapshot.reputation}/100`);
  setBar('knpr-reputation-bar', snapshot.reputation);
  setText('knpr-trip-count', totals.trips);
  setText('knpr-safe-count', `${totals.safeTrips} safe`);
  setText('knpr-correct-count', `${totals.correctStops} correct stops`);
  setText('knpr-repeat-count', `${totals.repeatTrips} repeat rides`);

  const latest = snapshot.lastTrip;
  setText('knpr-last-trip', latest
    ? `${latest.name} · ${latest.message}`
    : 'Complete a passenger trip to start building your service reputation.');

  const regulars = section.querySelector('#knpr-regulars');
  if (regulars) {
    regulars.replaceChildren();
    if (!snapshot.regulars.length) {
      const empty = document.createElement('p'); empty.className = 'klc-muted';
      empty.textContent = 'Familiar passengers will appear here after completed trips.';
      regulars.append(empty);
    } else {
      for (const person of snapshot.regulars) {
        const row = document.createElement('div'); row.className = 'knpr-person';
        const identity = document.createElement('span'); identity.textContent = person.name;
        const stats = document.createElement('b'); stats.textContent = `${person.rides} trip(s) · trust ${person.trust}/100`;
        row.append(identity, stats); regulars.append(row);
      }
    }
  }

  const ledger = section.querySelector('#knpr-ledger');
  if (ledger) {
    ledger.replaceChildren();
    if (!snapshot.ledger.length) {
      const empty = document.createElement('p'); empty.className = 'klc-muted'; empty.textContent = 'Passenger service records appear here.'; ledger.append(empty);
    } else {
      for (const row of snapshot.ledger.slice(0, 5)) {
        const line = document.createElement('div'); line.className = 'knpr-person';
        const kind = document.createElement('span');
        kind.textContent = row.type === 'passenger_trip_completed' ? `${row.details.name || 'Passenger'} · ${row.details.matched ? 'correct stop' : 'wrong stop'} · ${row.details.safeTrip ? 'safe' : 'rough'}` : `${row.details.name || 'Passenger'} boarded`;
        const amount = document.createElement('b'); amount.textContent = row.type === 'passenger_trip_completed' ? `Fare ${Math.max(0, Math.round(Number(row.details.fareEarned) || 0)).toLocaleString('en-NG')}` : row.details.returning ? 'Returning' : 'New';
        line.append(kind, amount); ledger.append(line);
      }
    }
  }
  return snapshot;
}

function ensurePanel() {
  const panel = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!panel) return null;
  let section = document.getElementById('kano-passenger-relationships-panel');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'kano-passenger-relationships-panel';
  section.setAttribute('aria-labelledby', 'knpr-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="knpr-title">PASSENGER RELATIONSHIPS & SERVICE REPUTATION</h3>
    <p class="klc-muted">Safe, correct drop-offs build trust; rough or incorrect trips weaken it. Familiar repeat passengers may offer a fare up to 3% higher or lower based on trust. This is applied to the ordinary in-game fare only; no separate wallet or duplicate payout is created.</p>
    <div class="knpr-reputation"><div><span>DRIVER SERVICE REPUTATION</span><strong id="knpr-reputation">50/100</strong></div><div class="knpr-track"><i id="knpr-reputation-bar" style="width:50%"></i></div></div>
    <div class="klc-card-grid knpr-stats">
      <div class="klc-stat"><small>COMPLETED TRIPS</small><strong id="knpr-trip-count">0</strong></div>
      <div class="klc-stat"><small>SAFE JOURNEYS</small><strong id="knpr-safe-count">0 safe</strong></div>
      <div class="klc-stat"><small>CORRECT STOPS</small><strong id="knpr-correct-count">0 correct stops</strong></div>
      <div class="klc-stat"><small>REPEAT RIDES</small><strong id="knpr-repeat-count">0 repeat rides</strong></div>
    </div>
    <p class="klc-muted"><b>Latest service note:</b> <span id="knpr-last-trip">Complete a passenger trip to start building your service reputation.</span></p>
    <h4 class="knpr-subhead">FAMILIAR PASSENGERS</h4><div id="knpr-regulars" class="knpr-list"><p class="klc-muted">Familiar passengers will appear here after completed trips.</p></div>
    <h4 class="knpr-subhead">RECENT TRIP HISTORY</h4><div id="knpr-ledger" class="knpr-list"><p class="klc-muted">Passenger service records appear here.</p></div>`;
  const before = panel.querySelector('#klc-close-bottom')?.parentElement;
  if (before) panel.insertBefore(section, before);
  else panel.append(section);
  if (!document.getElementById('kano-passenger-relationships-style')) {
    const style = document.createElement('style');
    style.id = 'kano-passenger-relationships-style';
    style.textContent = `
      #kano-passenger-relationships-panel{margin-top:18px;padding-top:12px;border-top:1px solid #345064;min-width:0}
      #kano-passenger-relationships-panel .knpr-reputation{border:1px solid #29465b;background:#0a1723;border-radius:10px;padding:10px;margin:10px 0}
      #kano-passenger-relationships-panel .knpr-reputation>div:first-child{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:11px;color:#a9bdcc;font-weight:800}
      #kano-passenger-relationships-panel .knpr-reputation strong{font-size:18px;color:#f3c861}
      #kano-passenger-relationships-panel .knpr-track{height:9px;background:#263d4f;border-radius:999px;overflow:hidden;margin-top:8px}
      #kano-passenger-relationships-panel .knpr-track i{display:block;height:100%;background:linear-gradient(90deg,#00b4d8,#71d5b0);border-radius:inherit;transition:width .2s}
      #kano-passenger-relationships-panel .knpr-stats{margin:8px 0}
      #kano-passenger-relationships-panel .knpr-subhead{margin:15px 0 6px;font-size:11px;letter-spacing:.08em;color:#c4d7e5}
      #kano-passenger-relationships-panel .knpr-list{display:grid;gap:6px;min-width:0}
      #kano-passenger-relationships-panel .knpr-person{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:8px;background:#0b1925;border:1px solid #263e50;border-radius:8px;font-size:12px;min-width:0}
      #kano-passenger-relationships-panel .knpr-person span{min-width:0;overflow-wrap:anywhere;color:#d8e5ee}
      #kano-passenger-relationships-panel .knpr-person b{font-size:11px;text-align:right;color:#a9bdcc;flex:0 0 auto;max-width:55%}
    `;
    document.head.append(style);
  }
  return section;
}

function installGameHooks() {
  if (!Game?.prototype || Game.prototype[PATCH]) return;
  Object.defineProperty(Game.prototype, PATCH, { value: true });

  const originalPickup = Game.prototype.pickup;
  if (typeof originalPickup === 'function') {
    Game.prototype.pickup = function pickupWithPassengerRelationships(zone, ...args) {
      const before = Array.isArray(this.s?.passengers) ? this.s.passengers.length : 0;
      const result = originalPickup.call(this, zone, ...args);
      const afterPassengers = this.s?.passengers;
      if (Array.isArray(afterPassengers) && afterPassengers.length > before) {
        const passenger = afterPassengers[afterPassengers.length - 1];
        const record = passengers.recordBoarding(passenger, { day: getDay(this), minute: getMinute(this) });
        if (record.ok) {
          passenger.__kanoRelationshipReturning = record.returning;
          passenger.__kanoRelationshipTrustAtBoarding = record.trust;
          passenger.__kanoRelationshipFareMultiplier = record.fareMultiplier;
          if (record.returning && record.fareMultiplier !== 1 && Number.isFinite(Number(passenger.fare))) {
            passenger.fare = Math.max(1, Math.floor(Number(passenger.fare) * record.fareMultiplier));
          }
          emitUpdate({ type: 'boarding', name: passenger.name, returning: record.returning });
        }
      }
      return result;
    };
  }

  const originalDrop = Game.prototype.drop;
  if (typeof originalDrop === 'function') {
    Game.prototype.drop = function dropWithPassengerRelationships(zone, ...args) {
      const state = this.s;
      const passenger = Array.isArray(state?.passengers) ? state.passengers[0] : null;
      const beforeDrops = Number(state?.drops) || 0;
      const beforeFares = Number(state?.fares) || 0;
      const tripStart = passenger?.tripStart || {};
      const result = originalDrop.call(this, zone, ...args);
      const afterDrops = Number(this.s?.drops) || 0;
      if (passenger && afterDrops > beforeDrops) {
        const s = this.s || {};
        const matched = passenger.dest === zone?.dest;
        const safeTrip = (s.collisions || 0) <= (tripStart.collisions ?? (s.collisions || 0))
          && (s.potholeHits || 0) <= (tripStart.potholeHits ?? (s.potholeHits || 0))
          && (s.nearMisses || 0) <= (tripStart.nearMisses ?? (s.nearMisses || 0));
        const runId = Number(s.runStartedAt) || 0;
        const tripId = `${runId}:${beforeDrops}:${String(passenger.name || 'passenger').slice(0, 48)}`;
        const distance = Math.max(0, (Number(s.distance) || 0) - (Number(tripStart.distance) || 0));
        const record = passengers.recordTrip({
          tripId,
          passenger,
          matched,
          safeTrip,
          fareEarned: Math.max(0, (Number(s.fares) || 0) - beforeFares),
          day: getDay(this),
          minute: getMinute(this),
          distance,
          destination: zone?.dest || passenger.dest || '',
          returning: Boolean(passenger.__kanoRelationshipReturning),
        });
        if (record.ok) {
          try {
            globalThis.window?.kanoNorthernDriverRealLife?.recordPassengerService?.({
              name: passenger.name, matched, safeTrip, day: getDay(this),
              fareEarned: Math.max(0, (Number(s.fares) || 0) - beforeFares),
            });
          } catch (error) {
            console.warn('[Kano Life] Passenger service meter bridge failed; trip gameplay remains unchanged.', error);
          }
          emitUpdate({ type: 'trip_completed', trip: record.report });
        }
      }
      return result;
    };
  }
}

function installUiHooks() {
  if (!UI?.prototype) return;
  const symbol = Symbol.for('kano.life.passengerRelationships.ui.v1');
  if (UI.prototype[symbol]) return;
  Object.defineProperty(UI.prototype, symbol, { value: true });
  const originalBind = UI.prototype.bind;
  if (typeof originalBind === 'function') {
    UI.prototype.bind = function bindPassengerRelationships(game, ...args) {
      const result = originalBind.call(this, game, ...args);
      activeUI = this;
      ensurePanel();
      refreshPanel();
      return result;
    };
  }
}

function install() {
  installGameHooks();
  installUiHooks();
  if (typeof window !== 'undefined') {
    window.kanoNorthernDriverPassengerRelationships = {
      version: 1,
      snapshot: () => passengers.getSnapshot(),
      getPassenger: name => passengers.getPassenger(name),
      exportReport: () => passengers.exportReport(),
      refresh: refreshPanel,
    };
    window.addEventListener('kano:passenger-relationship-updated', refreshPanel);
    window.addEventListener('kano:life-shift-settled', refreshPanel);
    window.addEventListener('kano:daily-day-change', refreshPanel);
    for (const id of ['life-career-btn', 'life-career-menu-btn']) {
      document.getElementById(id)?.addEventListener('click', () => queueMicrotask(refreshPanel));
    }
    if (window.__KANO_ACTIVE_UI__) { activeUI = window.__KANO_ACTIVE_UI__; ensurePanel(); refreshPanel(); }
    document.addEventListener('DOMContentLoaded', () => { ensurePanel(); refreshPanel(); }, { once: true });
  }
}

install();
export { passengers as kanoNorthernDriverPassengerRelationshipsService };
