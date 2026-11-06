/**
 * Night streets: pavement life follows the clock. Busy by day, thinning through the evening,
 * and only a few people about after the late prayer. A person is only added or removed while
 * far from the keke, so nobody ever pops in or out in front of the driver.
 */
import { Renderer3D } from './renderer3d.js';

const KEY = '__kanoNightStreetLife';

function peopleDensity(state) {
  const m = Number(state?.gameClockMinutes);
  if (!Number.isFinite(m)) return 1;
  const t = ((m % 1440) + 1440) % 1440;
  if (t >= 22.5 * 60 || t < 4.5 * 60) return 0.2;   // late night
  if (t >= 20.2 * 60) return 0.4;                   // after Isha
  if (t >= 18.8 * 60) return 0.7;                   // dusk
  if (t < 5.5 * 60) return 0.4;                     // pre-dawn
  if (t < 6.5 * 60) return 0.7;                     // dawn
  return 1;
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype[KEY]) {
  Object.defineProperty(Renderer3D.prototype, KEY, { value: true });
  const draw = Renderer3D.prototype.draw;
  Renderer3D.prototype.draw = function drawWithNightStreetLife(state, dt, ...rest) {
    try {
      const density = this.lifeScene === 'road' ? peopleDensity(state) : 1;
      const playerZ = Number(this.player?.position?.z) || 0;
      for (const person of this.pedestrians || []) {
        const actor = person?.actor;
        if (!actor || actor.userData?.kanoPersonDisposed) continue;
        const keep = ((person.index * 0.618) % 1) < density;
        if (actor.visible === keep) continue;
        const gap = Math.abs((Number(actor.position.z) || 0) - playerZ);
        if (gap > 36 || !keep && !actor.visible) actor.visible = keep;
      }
    } catch (error) {
      console.warn('[Kano Life] Night street life skipped safely.', error);
    }
    return draw.call(this, state, dt, ...rest);
  };
}
