/**
 * Kano Life — Passenger ↔ Park bridge (senior integration)
 * -------------------------------------------------------
 * Patches the real Game.pickup / Game.drop methods (not guessed names).
 * Every successful board/drop updates park operations ledger.
 * Career + freeRoam only. Zero per-frame work.
 *
 * Install after KanoParkEssenceBridge.js
 */
import { Game } from './game.js';
import { KanoNorthernDriverParkOperations } from './KanoNorthernDriverParkOperations.js';

function stage(detail) {
  try {
    if (window.kanoLifeStage?.present) window.kanoLifeStage.present(detail);
    else window.dispatchEvent(new CustomEvent('kano-life-stage', { detail }));
  } catch (_) {}
}


const PATCH = Symbol.for('kano.life.passengerParkBridge.v1');
const money = (v) => Math.max(0, Math.round(Number(v) || 0));

const park = new KanoNorthernDriverParkOperations();

function worldDay(game) {
  const s = game?.s;
  const d =
    s?.__kanoScheduleCurrentDay ??
    s?.worldDayNumber ??
    1;
  return Math.max(1, Math.floor(Number(d) || 1));
}

function isSimMode(game) {
  const m = game?.mode;
  return m === 'career' || m === 'freeRoam' || m === 'free_roam';
}

function install() {
  if (!Game?.prototype || Game.prototype[PATCH]) {
    console.info('[PassengerPark] already installed or Game missing');
    return;
  }
  Object.defineProperty(Game.prototype, PATCH, { value: true });

  const prevPickup = Game.prototype.pickup;
  if (typeof prevPickup === 'function') {
    Game.prototype.pickup = function pickupWithParkLedger(zone, ...args) {
      const before = this.s?.boards ?? 0;
      const beforeLen = this.s?.passengers?.length ?? 0;
      const result = prevPickup.call(this, zone, ...args);
      try {
        if (!isSimMode(this)) return result;
        const after = this.s?.boards ?? 0;
        const afterLen = this.s?.passengers?.length ?? 0;
        // Successful board increments boards or passenger list
        if (after > before || afterLen > beforeLen) {
          const p = this.s.passengers[this.s.passengers.length - 1];
          park.recordBoarding({
            day: worldDay(this),
            name: p?.name || zone?.stopName || '',
            returning: Boolean(p?.returning),
          });
          stage({
            kind: 'board',
            title: (p?.name ? `${p.name} boarded` : 'Passenger boarded'),
            body: p?.dest
              ? `They are going toward ${p.dest}. Fare is held until you drop them at a matching stop.`
              : 'They sat in your keke. Complete the drop to earn the fare and update the park day.',
            chips: [p?.name, p?.dest, p?.fare != null ? `₦${Math.round(p.fare)}` : null].filter(Boolean),
            ms: 3500,
          });
        }
      } catch (e) {
        console.warn('[PassengerPark] pickup', e);
      }
      return result;
    };
  } else {
    console.warn('[PassengerPark] Game.pickup missing — board ledger inactive');
  }

  const prevDrop = Game.prototype.drop;
  if (typeof prevDrop === 'function') {
    Game.prototype.drop = function dropWithParkLedger(zone, ...args) {
      const beforeLen = this.s?.passengers?.length ?? 0;
      const head = beforeLen ? { ...this.s.passengers[0] } : null;
      const fareBefore = this.s?.fares ?? 0;
      const result = prevDrop.call(this, zone, ...args);
      try {
        if (!isSimMode(this) || !head) return result;
        const afterLen = this.s?.passengers?.length ?? 0;
        if (afterLen < beforeLen) {
          const fareAfter = this.s?.fares ?? 0;
          const fareEarned = Math.max(0, fareAfter - fareBefore) || money(head.fare);
          const matched = head.dest && zone?.dest ? head.dest === zone.dest : true;
          park.recordTrip({
            tripId: `${worldDay(this)}-${head.name || 'pax'}-${Math.round((this.s?.distance || 0) * 1000)}-${this.s?.boards || 0}`,
            day: worldDay(this),
            matched,
            safeTrip: (this.s?.condition ?? 100) > 35,
            fareEarned,
            distance: 0,
            destination: String(zone?.dest || head.dest || ''),
            returning: Boolean(head.returning),
            name: String(head.name || ''),
          });
          stage({
            kind: 'drop',
            title: matched ? 'Correct drop · fare earned' : 'Drop completed',
            body: matched
              ? 'Destination matched. Fare is counted and the park ledger records a completed trip.'
              : 'Passenger left the keke. Trip is recorded; matching drops pay better over a full day.',
            chips: [head.name, zone?.dest || head.dest, fareEarned ? `₦${fareEarned}` : null, matched ? 'Matched' : 'Unmatched'].filter(Boolean),
            ms: 3800,
          });
        }
      } catch (e) {
        console.warn('[PassengerPark] drop', e);
      }
      return result;
    };
  } else {
    console.warn('[PassengerPark] Game.drop missing — trip ledger inactive');
  }

  if (typeof window !== 'undefined') {
    window.kanoPassengerPark = {
      version: 1,
      snapshot: () => park.getSnapshot?.() ?? null,
    };
  }

  console.info(
    '[Kano Life] Passenger↔Park bridge installed — real pickup/drop feed park operations'
  );
}

install();
export { install };
