/**
 * KANO LIFE — Task 1: physical contact response for traffic collisions.
 *
 * The core Game.moveTraffic() remains authoritative for collision detection,
 * collision counts, damage, invulnerability, audio and UI. This adapter adds a
 * short contact hold and a lateral shove to the already-detected vehicle so
 * overlapping GLBs do not visually continue straight through the player keke.
 * No vehicle models, assets, renderer code, or protected startup files change.
 */
import { Game } from './game.js';
import {
  PLAYER_KEKE_HALF_LENGTH,
  calculateContactDeflection,
  calculateContactHoldDepth,
  advanceContactHold,
  isFreshVehicleContact,
  detectSweptVehicleContact,
} from './KanoVehicleCollisionContactRules.mjs';

const PATCH_KEY = Symbol.for('kano.life.vehicleCollisionContact.step1');
const HOLD_SECONDS = 0.095;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
let lastGame = null;
let totalContacts = 0;
let lastContact = null;

function playerWorldX(state) {
  return clamp(
    finite(state?.steer, 0) * 3 + finite(state?.pullOverSide, 0) * 2.35,
    -4.5,
    4.5,
  );
}

function snapshotTraffic(traffic) {
  const before = new Map();
  for (const vehicle of traffic) {
    if (!vehicle || typeof vehicle !== 'object') continue;
    before.set(vehicle, {
      passed: vehicle.passed === true,
      collisionKickTime: finite(vehicle.collisionKickTime, 0),
      depth: finite(vehicle.depth, 0),
      visualOffsetX: finite(vehicle.visualOffsetX, 0),
    });
  }
  return before;
}

function startContactResponse(game, vehicle, before) {
  const state = game?.s;
  const side = Math.sign(finite(vehicle.collisionKickSide, 0)) || 1;
  const deflection = calculateContactDeflection({
    type: vehicle.type,
    playerWorldX: playerWorldX(state),
    lane: vehicle.lane,
    currentOffsetX: before?.visualOffsetX ?? 0,
    preferredSide: side,
  });
  const holdDepth = calculateContactHoldDepth(vehicle.type);
  const contact = {
    version: 1,
    side: deflection.side,
    offsetX: deflection.offsetX,
    holdDepth,
    holdRemaining: HOLD_SECONDS,
    holding: true,
    originalCollisionDepth: finite(vehicle.depth, before?.depth ?? 0),
    type: String(vehicle.type || 'unknown'),
    startedAt: finite(state?.elapsed, 0),
  };
  vehicle.kanoContactSeparation = contact;
  vehicle.depth = holdDepth;
  vehicle.visualOffsetX = contact.offsetX;
  totalContacts += 1;
  lastContact = {
    type: contact.type,
    depth: contact.originalCollisionDepth,
    heldDepth: holdDepth,
    offsetX: contact.offsetX,
    at: contact.startedAt,
  };
}

function applyContactResponse(vehicle, dtSeconds, fresh = false) {
  const stored = vehicle?.kanoContactSeparation;
  if (!stored) return false;
  let contact = stored;
  if (!fresh) contact = advanceContactHold(stored, dtSeconds);
  vehicle.kanoContactSeparation = contact;
  if (contact.holding) vehicle.depth = contact.holdDepth;
  // Keep the vehicle deflected sideways for the rest of its short on-screen
  // lifetime. Core Game.moveTraffic removes it after it has passed the road view.
  vehicle.visualOffsetX = finite(contact.offsetX, 0);
  return true;
}

if (!Game.prototype[PATCH_KEY] && typeof Game.prototype.moveTraffic === 'function') {
  const originalMoveTraffic = Game.prototype.moveTraffic;
  Object.defineProperty(Game.prototype, PATCH_KEY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Game.prototype.moveTraffic = function moveTrafficWithCollisionContact(dtSeconds, ...args) {
    lastGame = this;
    const trafficBefore = Array.isArray(this?.s?.traffic)
      ? snapshotTraffic(this.s.traffic)
      : new Map();
    const playerXBefore = playerWorldX(this?.s);
    const collisionsBefore = finite(this?.s?.collisions, 0);
    const dt = Number.isFinite(Number(dtSeconds)) && Number(dtSeconds) > 0
      ? clamp(Number(dtSeconds), 0, 0.12)
      : 1 / 60;

    const result = originalMoveTraffic.call(this, dtSeconds, ...args);
    const traffic = this?.s?.traffic;
    if (!Array.isArray(traffic)) return result;

    // Detect new contacts from markers set by the core engine.
    // When the core classified the encounter as a near miss despite a visible
    // body overlap, a swept-envelope backstop catches that single frame too.
    // Existing damage, scoring and invulnerability remain owned by Game.hit().
    for (const vehicle of traffic) {
      if (!vehicle || typeof vehicle !== 'object') continue;
      const before = trafficBefore.get(vehicle);
      if (isFreshVehicleContact(before, vehicle)) {
        startContactResponse(this, vehicle, before);
        applyContactResponse(vehicle, dt, true);
      } else if (before && before.passed !== true && !vehicle.kanoContactSeparation) {
        const contact = detectSweptVehicleContact({
          type: vehicle.type,
          previousDepth: before.depth,
          currentDepth: finite(vehicle.depth, before.depth),
          playerWorldX: playerXBefore,
          lane: vehicle.lane,
          previousOffsetX: before.visualOffsetX,
        });
        if (contact.collides) {
          const side = Math.sign(contact.trafficWorldX - contact.playerWorldX) || 1;
          vehicle.passed = true;
          vehicle.collisionKickDuration = 0.44;
          vehicle.collisionKickTime = 0.44;
          vehicle.collisionKickSide = side;
          vehicle.visualOffsetX = side * 0.08;
          vehicle.contactObserved = true;
          vehicle.contactMinLateralGap = contact.lateralGap;
          vehicle.kanoContactBackstop = true;
          if (finite(this.s?.invuln, 0) <= 0 && typeof this.hit === 'function') {
            this.hit(vehicle);
          }
          startContactResponse(this, vehicle, before);
          applyContactResponse(vehicle, dt, true);
        }
      } else if (vehicle.kanoContactSeparation) {
        applyContactResponse(vehicle, dt, false);
      }
    }

    // The core also removes vehicles that leave the depth band during this
    // update. Check those snapshots for a full-frame pass-through before
    // removal; this path records damage even when the traffic object is gone.
    const currentSet = new Set(traffic);
    for (const [vehicle, before] of trafficBefore) {
      if (currentSet.has(vehicle) || before.passed === true || vehicle.kanoContactSeparation
        || isFreshVehicleContact(before, vehicle)) continue;
      const contact = detectSweptVehicleContact({
        type: vehicle.type,
        previousDepth: before.depth,
        currentDepth: finite(vehicle.depth, before.depth),
        playerWorldX: playerXBefore,
        lane: vehicle.lane,
        previousOffsetX: before.visualOffsetX,
      });
      if (!contact.collides) continue;
      vehicle.kanoContactBackstop = true;
      vehicle.passed = true;
      if (finite(this.s?.invuln, 0) <= 0 && typeof this.hit === 'function'
        && finite(this.s?.collisions, 0) === collisionsBefore) {
        this.hit(vehicle);
      }
      totalContacts += 1;
      lastContact = {
        type: String(vehicle.type || 'unknown'),
        depth: finite(vehicle.depth, before.depth),
        heldDepth: null,
        offsetX: null,
        at: finite(this.s?.elapsed, 0),
        sweptOutOfView: true,
      };
    }

    this._kanoVehicleCollisionContact = {
      version: 1,
      frames: finite(this._kanoVehicleCollisionContact?.frames, 0) + 1,
      currentTraffic: traffic.length,
      activeSeparations: traffic.filter((vehicle) => Boolean(vehicle?.kanoContactSeparation)).length,
      totalContacts,
      lastContact,
      lastDtSeconds: dt,
    };
    return result;
  };
}

if (typeof window !== 'undefined') {
  window.kanoVehicleCollisionContactAudit = () => {
    const state = lastGame?.s || null;
    const status = lastGame?._kanoVehicleCollisionContact || {};
    return {
      version: 1,
      installed: Boolean(Game.prototype[PATCH_KEY]),
      coreGameAvailable: Boolean(lastGame),
      coreCollisionCount: finite(state?.collisions, 0),
      activeTraffic: Array.isArray(state?.traffic) ? state.traffic.length : 0,
      ...status,
    };
  };
}

console.info('[Kano Life] vehicle collision contact response registered before game startup.');
