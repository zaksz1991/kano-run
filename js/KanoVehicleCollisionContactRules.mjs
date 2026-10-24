/** Pure collision-contact geometry shared by the runtime adapter and tests. */
export const PLAYER_KEKE_HALF_LENGTH = 1.15;
export const PLAYER_KEKE_HALF_WIDTH = 0.62;
export const ROAD_DEPTH_UNITS = 88;

const VEHICLE_HALF_LENGTH = Object.freeze({
  motorcycle: 0.78,
  keke: 1.18,
  car: 1.78,
  taxi: 1.72,
  suv: 1.9,
  police: 1.78,
  karota: 1.7,
  ambulance: 2.18,
  truck: 2.72,
  bus: 3.0,
});

const VEHICLE_HALF_WIDTH = Object.freeze({
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function getVehicleCollisionDimensions(type) {
  return {
    halfLength: VEHICLE_HALF_LENGTH[type] ?? 1.65,
    halfWidth: VEHICLE_HALF_WIDTH[type] ?? 0.82,
  };
}

/**
 * Holds the other vehicle just outside longitudinal overlap for a short shove
 * window; a positive buffer avoids keeping the two model bounds interpenetrating.
 */
export function calculateContactHoldDepth(type, longitudinalBuffer = 0.14) {
  const { halfLength } = getVehicleCollisionDimensions(type);
  const combinedHalfLength = PLAYER_KEKE_HALF_LENGTH + halfLength;
  return clamp(
    (combinedHalfLength + Math.max(0, finite(longitudinalBuffer, 0.14)) - 2) / ROAD_DEPTH_UNITS,
    0.003,
    0.06,
  );
}

/**
 * Computes an outward visual displacement large enough to clear the keke's
 * collision envelope. Lanes are spaced three units apart in the renderer.
 */
export function calculateContactDeflection({
  type,
  playerWorldX = 0,
  lane = 1,
  currentOffsetX = 0,
  preferredSide = 0,
  extraClearance = 0.24,
} = {}) {
  const { halfWidth } = getVehicleCollisionDimensions(type);
  const safePlayerX = clamp(finite(playerWorldX, 0), -4.5, 4.5);
  const safeLane = clamp(Math.round(finite(lane, 1)), 0, 2);
  const trafficWorldX = (safeLane - 1) * 3 + finite(currentOffsetX, 0);
  const lateralGap = Math.abs(trafficWorldX - safePlayerX);
  const collisionGap = PLAYER_KEKE_HALF_WIDTH + halfWidth + 0.12;
  const hintedSide = Math.sign(finite(preferredSide, 0));
  const side = hintedSide || (trafficWorldX >= safePlayerX ? 1 : -1);
  const magnitude = clamp(collisionGap - lateralGap + Math.max(0, finite(extraClearance, 0.24)), 0.75, 2.15);
  return {
    side,
    trafficWorldX,
    playerWorldX: safePlayerX,
    lateralGap,
    collisionGap,
    deflection: magnitude,
    offsetX: side * magnitude,
  };
}


/** Minimum distance from the longitudinal impact plane over one simulation step. */
export function sweptLongitudinalGap(previousDepth, currentDepth) {
  const previous = 2 + finite(previousDepth, 0) * ROAD_DEPTH_UNITS;
  const current = 2 + finite(currentDepth, 0) * ROAD_DEPTH_UNITS;
  if (previous * current <= 0) return 0;
  return Math.min(Math.abs(previous), Math.abs(current));
}

/**
 * Backstop for a visible model contact that falls just outside the core's
 * conservative half-widths or crosses the contact plane between frames.
 */
export function detectSweptVehicleContact({
  type,
  previousDepth,
  currentDepth,
  playerWorldX = 0,
  lane = 1,
  previousOffsetX = 0,
  lateralMargin = 0.22,
  longitudinalMargin = 0.12,
} = {}) {
  const { halfLength, halfWidth } = getVehicleCollisionDimensions(type);
  const longitudinalGap = sweptLongitudinalGap(previousDepth, currentDepth);
  const combinedHalfLength = PLAYER_KEKE_HALF_LENGTH + halfLength;
  const safeLane = clamp(Math.round(finite(lane, 1)), 0, 2);
  const trafficWorldX = (safeLane - 1) * 3 + finite(previousOffsetX, 0);
  const safePlayerX = clamp(finite(playerWorldX, 0), -4.5, 4.5);
  const lateralGap = Math.abs(trafficWorldX - safePlayerX);
  const collisionGap = PLAYER_KEKE_HALF_WIDTH + halfWidth + 0.12 + Math.max(0, finite(lateralMargin, 0.22));
  return {
    collides: longitudinalGap <= combinedHalfLength + Math.max(0, finite(longitudinalMargin, 0.12))
      && lateralGap <= collisionGap,
    longitudinalGap,
    combinedHalfLength,
    lateralGap,
    collisionGap,
    trafficWorldX,
    playerWorldX: safePlayerX,
  };
}

/** A collision is new only when the core engine just marked it as a contact. */
export function isFreshVehicleContact(before, vehicle) {
  if (!before || !vehicle || typeof vehicle !== 'object') return false;
  return before.passed !== true
    && vehicle.passed === true
    && finite(before.collisionKickTime, 0) <= 0
    && finite(vehicle.collisionKickTime, 0) > 0;
}

/** Keep numeric state within safe bounds while a contact separation is active. */
export function advanceContactHold(contact, dtSeconds) {
  if (!contact || typeof contact !== 'object') return null;
  const dt = clamp(finite(dtSeconds, 1 / 60), 0, 0.12);
  const remaining = Math.max(0, finite(contact.holdRemaining, 0) - dt);
  return {
    ...contact,
    holdRemaining: remaining,
    holding: remaining > 0,
  };
}
