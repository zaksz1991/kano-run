/**
 * Kano Life — collision contact sync for the current main branch.
 *
 * The simulation already classifies swept vehicle collisions and applies
 * damage in Game.moveTraffic(). This additive adapter aligns that test with
 * the player's actually rendered, eased X position and increases the traffic
 * vehicle's post-impact lateral clearance. It does not replace game.js or
 * renderer3d.js and does not change traffic spawning, scoring, or damage.
 */
const INSTALL_KEY = Symbol.for('kano.life.collisionContactUpgrade.v1');
const PLAYER_RENDER_X = Symbol.for('kano.life.collisionContactUpgrade.playerRenderX');
const LAST_DISTANCE = Symbol.for('kano.life.collisionContactUpgrade.lastDistance');
const LAST_GAME = Symbol.for('kano.life.collisionContactUpgrade.lastGame');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const numberOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const PLAYER_HALF_WIDTH = 0.62;
const TRAFFIC_HALF_WIDTH = Object.freeze({
  motorcycle: 0.35,
  keke: 0.62,
  car: 0.9,
  taxi: 0.9,
  suv: 0.98,
  police: 0.9,
  karota: 0.82,
  ambulance: 0.92,
  truck: 1.08,
  bus: 1.12,
});

/** Matches Renderer3D's rendered target, including its tighter phone-safe road limits. */
export function collisionRenderTargetX(state) {
  const steer = numberOr(state?.steer);
  const pullOverSide = numberOr(state?.pullOverSide);
  return clamp(steer * 3 + pullOverSide * 2.35, -3.45, 3.45);
}

/** Matches the renderer's 50 ms delta cap and X easing factor. */
export function advanceCollisionRenderX(currentX, targetX, deltaSeconds) {
  const current = numberOr(currentX);
  const target = numberOr(targetX);
  const dt = clamp(numberOr(deltaSeconds), 0, 0.05);
  const alpha = Math.min(1, dt * 5.8);
  return current + (target - current) * alpha;
}

/** Required lateral displacement to separate model half-widths with a small visual gap. */
export function collisionKickClearance(vehicleType) {
  return Math.min(
    1.95,
    PLAYER_HALF_WIDTH + (TRAFFIC_HALF_WIDTH[vehicleType] || 0.82) + 0.22,
  );
}

/** Smooth contact displacement; dt compensation makes the first impact frame visible. */
export function collisionKickOffset({ timeLeft, duration, deltaSeconds, side, distance }) {
  const total = Math.max(0.001, numberOr(duration, 0.44));
  const time = clamp(numberOr(timeLeft), 0, total);
  const dt = clamp(numberOr(deltaSeconds), 0, 0.05);
  const progress = clamp(1 - Math.max(0, time - dt) / total, 0, 1);
  if (progress <= 0 || progress >= 1) return 0;
  return Math.sign(numberOr(side, 1) || 1)
    * Math.max(0, numberOr(distance))
    * Math.sin(Math.PI * progress);
}

function chooseContactSide(vehicle, playerX, steer) {
  const lane = clamp(Math.round(numberOr(vehicle?.lane, 1)), 0, 2);
  // At the outer lanes, deflect toward the road centre rather than off the kerb.
  if (lane === 0) return 1;
  if (lane === 2) return -1;

  const trafficX = (lane - 1) * 3 + numberOr(vehicle?.visualOffsetX);
  if (trafficX > playerX + 0.15) return 1;
  if (trafficX < playerX - 0.15) return -1;
  // In a same-lane impact, move opposite the player's requested steering.
  return numberOr(steer) >= 0 ? -1 : 1;
}

/**
 * Installs once against the live Game class. The wrapper temporarily supplies
 * the previous rendered player X to the existing collision test, then advances
 * its estimate to the same position the renderer will draw this frame.
 */
export function installKanoCollisionContactUpgrade(GameClass) {
  const prototype = GameClass?.prototype;
  if (!prototype || typeof prototype.moveTraffic !== 'function') {
    return { installed: false, reason: 'Game.moveTraffic-unavailable' };
  }
  if (prototype.moveTraffic[INSTALL_KEY]) {
    return { installed: true, alreadyInstalled: true };
  }

  const originalMoveTraffic = prototype.moveTraffic;
  function collisionContactMoveTraffic(deltaSeconds, ...args) {
    const state = this?.s;
    if (!state || !Array.isArray(state.traffic)) {
      return originalMoveTraffic.call(this, deltaSeconds, ...args);
    }

    let renderedX = Number(this[PLAYER_RENDER_X]);
    const currentDistance = numberOr(state.distance, NaN);
    const previousDistance = Number(this[LAST_DISTANCE]);
    // A new run resets distance and the renderer returns the keke to centre.
    if (Number.isFinite(currentDistance)
      && Number.isFinite(previousDistance)
      && currentDistance + 0.05 < previousDistance) {
      renderedX = 0;
    }
    if (!Number.isFinite(renderedX)) renderedX = 0;

    const requestedSteer = numberOr(state.steer);
    const pullOverSide = numberOr(state.pullOverSide);
    const collisionSteer = clamp((renderedX - pullOverSide * 2.35) / 3, -1, 1);
    let result;
    let steerAfterMove = collisionSteer;

    state.steer = collisionSteer;
    try {
      result = originalMoveTraffic.call(this, deltaSeconds, ...args);
      steerAfterMove = numberOr(state.steer, collisionSteer);
    } finally {
      // Keep steering feedback (for example, the hit() nudge) while removing the
      // temporary value used solely for the collision test.
      state.steer = clamp(
        requestedSteer + (steerAfterMove - collisionSteer),
        -1,
        1,
      );
    }

    const dt = clamp(numberOr(deltaSeconds), 0, 0.05);
    const targetX = collisionRenderTargetX(state);
    this[PLAYER_RENDER_X] = advanceCollisionRenderX(renderedX, targetX, dt);
    if (Number.isFinite(currentDistance)) this[LAST_DISTANCE] = currentDistance;

    // Existing game logic triggers damage and a collision kick. The base kick
    // is only 0.92 world units, smaller than a car+keke half-width sum, so the
    // models can still visibly overlap. Use model-aware clearance instead.
    const playerXAtContact = renderedX;
    for (const vehicle of state.traffic) {
      const duration = numberOr(vehicle?.collisionKickDuration);
      const timeLeft = numberOr(vehicle?.collisionKickTime);
      if (!(duration > 0 && timeLeft > 0 && vehicle?.passed)) continue;

      if (!vehicle.kanoContactKickPrepared) {
        vehicle.collisionKickSide = chooseContactSide(vehicle, playerXAtContact, requestedSteer);
        vehicle.kanoContactKickPrepared = true;
        vehicle.kanoContactKickDistance = collisionKickClearance(vehicle.type);
      }
      vehicle.visualOffsetX = collisionKickOffset({
        timeLeft,
        duration,
        deltaSeconds: dt,
        side: vehicle.collisionKickSide,
        distance: vehicle.kanoContactKickDistance || collisionKickClearance(vehicle.type),
      });
    }

    return result;
  }

  Object.defineProperty(collisionContactMoveTraffic, INSTALL_KEY, { value: true });
  Object.defineProperty(collisionContactMoveTraffic, 'originalMoveTraffic', { value: originalMoveTraffic });
  prototype.moveTraffic = collisionContactMoveTraffic;
  return { installed: true, alreadyInstalled: false };
}

export function getKanoCollisionContactAudit(game = globalThis[LAST_GAME]) {
  const state = game?.s;
  const renderedX = Number(game?.[PLAYER_RENDER_X]);
  return {
    installed: Boolean(game?.moveTraffic?.[INSTALL_KEY]),
    estimatedRenderedPlayerX: Number.isFinite(renderedX) ? renderedX : null,
    playerRenderTargetX: state ? collisionRenderTargetX(state) : null,
    activeContactKicks: Array.isArray(state?.traffic)
      ? state.traffic.filter((vehicle) => Number(vehicle?.collisionKickTime) > 0 && vehicle?.passed).length
      : 0,
    contactKickClearance: Array.isArray(state?.traffic)
      ? state.traffic.filter((vehicle) => Number(vehicle?.collisionKickTime) > 0 && vehicle?.passed)
        .map((vehicle) => ({ id: vehicle.id, type: vehicle.type, distance: vehicle.kanoContactKickDistance || collisionKickClearance(vehicle.type) }))
      : [],
  };
}

if (typeof window !== 'undefined' && !window.kanoVehicleCollisionContactAudit) {
  window.kanoVehicleCollisionContactAudit = () => getKanoCollisionContactAudit();
}
