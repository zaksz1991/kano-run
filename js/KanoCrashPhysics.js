/**
 * Crash physics. The old hit() only shaved a percentage off the speed. This adds a
 * momentum-based collision on top of the existing damage model:
 *  - real vehicle masses decide how much speed the keke loses (a truck stops you dead,
 *    a motorbike barely slows you)
 *  - a sideways shove away from the other vehicle, bigger when the other vehicle is heavy
 *  - hard hits can burst a tyre, stall the engine, shake the passengers and cut their trust
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.crashPhysics.v1');
const MASS_KG = {
  keke: 520, car: 1300, taxi: 1250, suv: 1900, police: 2200, karota: 2200,
  motorcycle: 190, truck: 8500, bus: 9500, ambulance: 3000,
};
const RESTITUTION = 0.25; // body panels crumple; a little bounce
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function crashOutcome({ playerKmh, otherKmh, playerMass, otherMass, restitution = RESTITUTION }) {
  const total = playerMass + otherMass;
  const after = (playerMass * playerKmh + otherMass * otherKmh + otherMass * restitution * (otherKmh - playerKmh)) / total;
  const closing = Math.abs(playerKmh - otherKmh);
  return { playerAfterKmh: Math.max(0, after), closingKmh: closing, massRatio: otherMass / total };
}

if (!Game.prototype[PATCH]) {
  const originalHit = Game.prototype.hit;
  Game.prototype.hit = function hitWithMomentum(vehicle) {
    const s = this.s;
    const before = Math.max(0, Number(s.speed) || 0);
    const result = originalHit.call(this, vehicle);
    try {
      const playerMass = 520 + 70 * (s.passengers?.length || 0) + 70;
      const otherMass = MASS_KG[vehicle?.type] || 1300;
      const otherKmh = Number.isFinite(vehicle?.speedKmh) ? vehicle.speedKmh * (vehicle.direction === -1 ? -1 : 1) : 25;
      const out = crashOutcome({ playerKmh: before, otherKmh, playerMass, otherMass });
      // Never gain speed from a crash; never keep more than the old damage model allowed.
      s.speed = Math.min(Math.max(0, Number(s.speed) || 0), Math.max(out.playerAfterKmh, 0));
      const severity = clamp((out.closingKmh - 6) / 55, 0, 1.2) * (0.6 + 0.8 * out.massRatio);

      // Sideways shove away from the other vehicle.
      const side = ((Number(vehicle?.lane) || 1) - 1) * 3 >= ((Number(s.steer) || 0) * 3) ? -1 : 1;
      s.steer = clamp((Number(s.steer) || 0) + side * 0.22 * severity * (0.5 + out.massRatio), -1, 1);
      s.crashShake = Math.max(s.crashShake || 0, clamp(severity, 0.2, 1));

      if (severity > 0.55 && Math.random() < 0.4) {
        s.tyres = Math.max(0, s.tyres - 12 * severity);
        this.ui.toast('Tyre damaged in the crash · drive carefully');
      }
      if (severity > 0.85) {
        s.speed = 0;
        s.invuln = Math.max(s.invuln || 0, 1.6);
        this.ui.toast('Engine stalled · hold GAS to restart');
      }
      if (severity > 0.4 && s.passengers?.length) {
        s.passengerTrust = clamp((Number(s.passengerTrust) || 0) - 7 * severity, 0, 100);
        const shout = s.passengers[0]?.name ? `${s.passengers[0].name}: "Allah ya kiyaye! Slow down!"` : '';
        if (shout) this.ui.toast(shout);
      }
      if (typeof this.syncSignedSpeed === 'function') this.syncSignedSpeed();
    } catch (error) {
      console.warn('[Kano Life] crash physics skipped', error);
    }
    return result;
  };
  Object.defineProperty(Game.prototype, PATCH, { value: true });
}
