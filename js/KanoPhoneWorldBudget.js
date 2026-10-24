/**
 * Kano Life — Phone world budget (traffic + fog clarity)
 * ----------------------------------------------------
 * Caps how many traffic actors can exist on phone and tightens fog so the
 * near road stays readable (desktop-like clarity without desktop pixel cost).
 *
 * Load after game.js modules (end of index is fine).
 * Phone-safe: only patches spawn + occasional trim; no extra rAF loop.
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.phone.worldBudget.v1');

function isPhone() {
  if (typeof navigator === 'undefined') return false;
  return (
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 600)
  );
}

function tier() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 4 || mem <= 2) return 'low';
  if (cores <= 6 || mem <= 4) return 'mid';
  return 'high';
}

/** Max simultaneous traffic entities on phone */
function trafficCap(t) {
  if (t === 'low') return 5;
  if (t === 'mid') return 7;
  return 10;
}

function fogForTier(t) {
  // nearer far-plane = clearer asphalt + cheaper shading
  if (t === 'low') return { near: 10, far: 32 };
  if (t === 'mid') return { near: 11, far: 40 };
  return { near: 12, far: 52 };
}

function applyFog(game, t) {
  const fog = fogForTier(t);
  const candidates = [
    game?.renderer?.scene,
    game?.renderer3d?.scene,
    game?.r3?.scene,
    window.__kanoScene,
  ];
  for (const scene of candidates) {
    if (scene?.fog && typeof scene.fog.far === 'number') {
      scene.fog.near = fog.near;
      scene.fog.far = fog.far;
    }
  }
  // renderer3d instance may hang on game.renderer
  try {
    const r = game?.renderer;
    if (r?.scene?.fog) {
      r.scene.fog.near = fog.near;
      r.scene.fog.far = fog.far;
    }
  } catch (_) {}
  return fog;
}

function install() {
  const phone = isPhone() || window.kanoPhonePlay?.isPhone;
  const t = window.kanoPhonePlay?.profile?.tier || tier();
  const cap = trafficCap(t);

  if (!Game?.prototype) {
    console.warn('[PhoneWorldBudget] Game missing');
    return;
  }
  if (Game.prototype[PATCH]) {
    console.info('[PhoneWorldBudget] already installed');
    return;
  }
  Object.defineProperty(Game.prototype, PATCH, { value: true });

  // Cap traffic spawns
  const prevSpawn = Game.prototype.spawnTraffic;
  if (typeof prevSpawn === 'function') {
    Game.prototype.spawnTraffic = function spawnTrafficBudgeted(initialIndex = null, ...args) {
      if (phone || window.kanoPhonePlay?.isPhone) {
        const n = this.s?.traffic?.length || 0;
        if (n >= cap) return null;
      }
      return prevSpawn.call(this, initialIndex, ...args);
    };
  }

  // On start: fog + hard trim if over cap
  const prevStart = Game.prototype.start;
  if (typeof prevStart === 'function') {
    Game.prototype.start = function startWithWorldBudget(mode, ...args) {
      const result = prevStart.call(this, mode, ...args);
      try {
        if (phone || window.kanoPhonePlay?.isPhone) {
          const fog = applyFog(this, t);
          if (this.s?.traffic && this.s.traffic.length > cap) {
            this.s.traffic.length = cap;
          }
          console.info(
            `[PhoneWorldBudget] trafficCap=${cap} fogFar=${fog.far} tier=${t}`
          );
        }
      } catch (e) {
        console.warn('[PhoneWorldBudget] start', e);
      }
      return result;
    };
  }

  // Light trim during update every ~45 frames if exposed
  const prevUpdate = Game.prototype.update;
  if (typeof prevUpdate === 'function' && phone) {
    Game.prototype.update = function updateWithTrafficTrim(dt, ...args) {
      const out = prevUpdate.call(this, dt, ...args);
      try {
        this.__kwbFrame = (this.__kwbFrame || 0) + 1;
        if (this.__kwbFrame % 45 === 0 && this.s?.traffic?.length > cap) {
          // Drop farthest traffic (highest depth)
          this.s.traffic.sort((a, b) => (b.depth || 0) - (a.depth || 0));
          this.s.traffic.length = cap;
        }
      } catch (_) {}
      return out;
    };
  }

  window.kanoPhoneWorldBudget = {
    version: 1,
    trafficCap: cap,
    tier: t,
    phone: !!phone,
    fog: fogForTier(t),
  };

  console.info(
    `[Kano Phone World] budget ready cap=${cap} phone=${!!phone} tier=${t}`
  );
}

install();
export { install, trafficCap, fogForTier };
