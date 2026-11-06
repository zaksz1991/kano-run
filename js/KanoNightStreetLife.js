/**
 * Night streets: pavement life follows the clock. Busy by day, thinning through the evening,
 * and only a few people about after the late prayer. A person is only added or removed while
 * far from the keke, so nobody ever pops in or out in front of the driver.
 */
import * as THREE from 'three';
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
      // Shops: after dark some shutters come down (shop goes dark), the rest stay warmly lit.
      const su = typeof window !== 'undefined' ? window.__KANO_LIFE_SCENE_UPGRADE__ : null;
      if (su?.shopBodies?.instanceColor && su.shopSlots?.length) {
        const level = this.lifeScene === 'road' ? Math.round((1 - Math.min(1, density)) * 10) : 0;
        if (su.__kanoShopLevel !== level) {
          su.__kanoShopLevel = level;
          const dark = level / 10;                 // 0 by day .. 0.8 late night
          const c = new THREE.Color();
          su.shopSlots.forEach((slot, i) => {
            const open = ((i * 0.381) % 1) < (1 - dark * 0.95);
            const dim = open ? 1 - dark * 0.25 : 1 - dark * 0.72;
            c.setHex(slot.bodyColor).multiplyScalar(dim);
            if (open && dark > 0) c.lerp(new THREE.Color(0xffd79a), dark * 0.22);
            su.shopBodies.setColorAt(i, c);
            c.setHex(slot.awningColor).multiplyScalar(open ? 1 : 1 - dark * 0.7);
            su.shopAwnings.setColorAt(i, c);
          });
          su.shopBodies.instanceColor.needsUpdate = true;
          su.shopAwnings.instanceColor.needsUpdate = true;
        }
      }
    } catch (error) {
      console.warn('[Kano Life] Night street life skipped safely.', error);
    }
    return draw.call(this, state, dt, ...rest);
  };
}
