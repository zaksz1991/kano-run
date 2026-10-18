/**
 * Kano Life — Traffic Safety System
 *
 * Features:
 * - Detects vehicles that are too close.
 * - Calculates safe following distance from speed.
 * - Detects potential front and rear collisions.
 * - Supports reversing vehicles.
 * - Reports collision events without moving vehicles.
 *
 * Integration with the existing game loop is required.
 */

export const TRAFFIC_CONFIG = Object.freeze({
  minimumFollowingDistance: 3.5,
  followingDistancePerSpeed: 0.65,
  collisionMargin: 0.35,
  defaultVehicleLength: 2.8,
  defaultVehicleWidth: 1.5,
  dangerDistance: 5,
});

function getPosition(vehicle) {
  const position = vehicle?.position ?? vehicle;

  if (
    !position ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.z)
  ) {
    throw new TypeError(
      "Vehicle requires finite world coordinates x and z."
    );
  }

  return {
    x: position.x,
    z: position.z,
  };
}

function getHeading(vehicle) {
  return Number.isFinite(vehicle?.heading)
    ? vehicle.heading
    : 0;
}

function getSpeed(vehicle) {
  return Number.isFinite(vehicle?.speed)
    ? vehicle.speed
    : 0;
}

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;

  return Math.hypot(dx, dz);
}

function getForwardVector(vehicle) {
  const heading = getHeading(vehicle);

  return {
    x: Math.sin(heading),
    z: Math.cos(heading),
  };
}

function dot(a, b) {
  return a.x * b.x + a.z * b.z;
}

function getDimensions(vehicle, config) {
  return {
    length: Math.max(
      0.5,
      Number(vehicle.length) ||
        config.defaultVehicleLength
    ),
    width: Math.max(
      0.5,
      Number(vehicle.width) ||
        config.defaultVehicleWidth
    ),
  };
}

/**
 * Determine whether another vehicle is ahead
 * in the player's current direction of travel.
 */
export function isVehicleAhead(
  player,
  other,
  maximumDistance = Infinity
) {
  const playerPosition = getPosition(player);
  const otherPosition = getPosition(other);

  const relativePosition = {
    x: otherPosition.x - playerPosition.x,
    z: otherPosition.z - playerPosition.z,
  };

  const distance = Math.hypot(
    relativePosition.x,
    relativePosition.z
  );

  if (distance > maximumDistance) {
    return false;
  }

  const forward = getForwardVector(player);

  // Reversing vehicles travel opposite their heading.
  const travelDirection =
    getSpeed(player) < 0
      ? { x: -forward.x, z: -forward.z }
      : forward;

  return dot(relativePosition, travelDirection) > 0;
}

/**
 * Calculate the recommended following distance.
 */
export function getSafeFollowingDistance(
  speed,
  config = TRAFFIC_CONFIG
) {
  const absoluteSpeed = Math.abs(
    Number(speed) || 0
  );

  return (
    config.minimumFollowingDistance +
    absoluteSpeed *
      config.followingDistancePerSpeed
  );
}

/**
 * Check the relative position of two vehicles.
 *
 * Returns distance and directional information.
 * This is a proximity check, not a complete physics
 * engine or oriented-box collision test.
 */
export function checkVehicleProximity(
  player,
  other,
  config = TRAFFIC_CONFIG
) {
  const playerPosition = getPosition(player);
  const otherPosition = getPosition(other);

  const distance = distanceBetween(
    playerPosition,
    otherPosition
  );

  const playerDimensions = getDimensions(
    player,
    config
  );

  const otherDimensions = getDimensions(
    other,
    config
  );

  const collisionDistance =
    (
      playerDimensions.length +
      otherDimensions.length
    ) / 2 +
    config.collisionMargin;

  const safeDistance =
    getSafeFollowingDistance(
      getSpeed(player),
      config
    );

  const ahead = isVehicleAhead(
    player,
    other
  );

  return {
    otherId: other.id ?? null,
    distance,
    ahead,
    collisionDistance,
    safeDistance,
    collisionRisk:
      distance <= collisionDistance,
    tooClose:
      ahead && distance < safeDistance,
    danger:
      distance <= config.dangerDistance,
  };
}

/**
 * Scan traffic and return warnings.
 *
 * Expected:
 * player = { id, position: { x, z }, heading, speed }
 * traffic = [{ id, position: { x, z }, heading, speed }]
 */
export function scanTraffic(
  player,
  traffic = [],
  config = TRAFFIC_CONFIG
) {
  return traffic
    .filter(
      (vehicle) =>
        vehicle &&
        vehicle.id !== player.id
    )
    .map((vehicle) =>
      checkVehicleProximity(
        player,
        vehicle,
        config
      )
    )
    .filter(
      (result) =>
        result.collisionRisk ||
        result.tooClose ||
        result.danger
    )
    .sort(
      (a, b) => a.distance - b.distance
    );
}

/**
 * Create a simple collision event.
 *
 * The existing game should decide how to respond:
 * reduce speed, apply damage, play an animation,
 * or trigger a crash sequence.
 */
export function createTrafficCollisionEvent(
  player,
  other,
  config = TRAFFIC_CONFIG
) {
  const result = checkVehicleProximity(
    player,
    other,
    config
  );

  if (!result.collisionRisk) {
    return null;
  }

  return {
    type: "vehicle_collision",
    playerId: player.id ?? null,
    otherId: other.id ?? null,
    distance: result.distance,
    relativeSpeed: Math.abs(
      getSpeed(player) - getSpeed(other)
    ),
    timestamp: Date.now(),
  };
}