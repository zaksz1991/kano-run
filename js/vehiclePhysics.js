/**
 * Kano Life — Vehicle Physics
 *
 * Features:
 * - Forward acceleration
 * - Braking and reverse movement
 * - Steering while moving forward or backward
 * - Forward and reverse speed limits
 * - Vehicle displacement
 * - Basic collision damage calculation
 */

export const VEHICLE_CONFIG = Object.freeze({
  maxForwardSpeed: 18,
  maxReverseSpeed: 4,
  acceleration: 5.5,
  reverseAcceleration: 2.8,
  braking: 10,
  rollingResistance: 0.8,
  steeringRate: 1.5,
  minSteeringSpeed: 0.15,
  maxDeltaTime: 0.05,
});

/**
 * Create the initial physics state for a vehicle.
 */
export function createVehiclePhysics(initialState = {}) {
  return {
    speed: 0,
    heading: 0,
    steering: 0,
    damage: 0,
    ...initialState,
  };
}

/**
 * Update vehicle physics.
 *
 * controls:
 * {
 *   accelerate: boolean,
 *   brake: boolean,
 *   left: boolean,
 *   right: boolean
 * }
 *
 * Holding brake slows the vehicle and engages reverse
 * after forward speed approaches zero.
 */
export function updateVehiclePhysics(
  vehicle,
  controls = {},
  deltaTime = 1 / 60,
  config = VEHICLE_CONFIG
) {
  const dt = Math.max(
    0,
    Math.min(
      Number(deltaTime) || 0,
      config.maxDeltaTime
    )
  );

  if (dt === 0) {
    return vehicle;
  }

  const accelerate = Boolean(controls.accelerate);
  const brake = Boolean(controls.brake);
  const left = Boolean(controls.left);
  const right = Boolean(controls.right);

  let speed = Number(vehicle.speed) || 0;

  // Acceleration and reverse transition.
  if (accelerate && !brake) {
    if (speed < 0) {
      // Accelerating while reversing first slows the vehicle.
      speed = Math.min(
        0,
        speed + config.braking * dt
      );
    } else {
      speed += config.acceleration * dt;
    }
  } else if (brake) {
    if (speed > 0.05) {
      // Brake before reversing.
      speed = Math.max(
        0,
        speed - config.braking * dt
      );
    } else {
      // Reverse acceleration.
      speed -= config.reverseAcceleration * dt;
    }
  } else {
    // Rolling resistance.
    const resistance =
      config.rollingResistance * dt;

    if (speed > 0) {
      speed = Math.max(
        0,
        speed - resistance
      );
    } else if (speed < 0) {
      speed = Math.min(
        0,
        speed + resistance
      );
    }
  }

  // Enforce speed limits.
  vehicle.speed = Math.max(
    -config.maxReverseSpeed,
    Math.min(
      config.maxForwardSpeed,
      speed
    )
  );

  // Steering input: -1 left, 0 straight, +1 right.
  const steeringInput =
    Number(right) - Number(left);

  // Reduce steering authority at very low speeds.
  if (
    Math.abs(vehicle.speed) >
    config.minSteeringSpeed
  ) {
    const direction =
      vehicle.speed < 0 ? -1 : 1;

    const steeringStrength = Math.min(
      1,
      Math.abs(vehicle.speed) / 3
    );

    vehicle.heading =
      (Number(vehicle.heading) || 0) +
      steeringInput *
        config.steeringRate *
        steeringStrength *
        direction *
        dt;
  }

  vehicle.steering = steeringInput;

  return vehicle;
}

/**
 * Calculate vehicle displacement.
 *
 * Coordinate convention:
 * heading = 0      -> positive Z
 * heading = PI / 2 -> positive X
 *
 * Negative speed moves the vehicle backward.
 */
export function calculateVehicleDisplacement(
  vehicle,
  deltaTime
) {
  const dt = Math.max(
    0,
    Number(deltaTime) || 0
  );

  const heading =
    Number(vehicle.heading) || 0;

  const speed =
    Number(vehicle.speed) || 0;

  return {
    x: Math.sin(heading) * speed * dt,
    z: Math.cos(heading) * speed * dt,
  };
}

/**
 * Apply displacement to a vehicle.
 *
 * Supports:
 * { x, z, speed, heading }
 *
 * or:
 * { position: { x, z }, speed, heading }
 */
export function moveVehicle(
  vehicle,
  deltaTime
) {
  const displacement =
    calculateVehicleDisplacement(
      vehicle,
      deltaTime
    );

  const position =
    vehicle.position || vehicle;

  position.x =
    (Number(position.x) || 0) +
    displacement.x;

  position.z =
    (Number(position.z) || 0) +
    displacement.z;

  return vehicle;
}

/**
 * Calculate a basic collision damage estimate.
 *
 * Adapt the multiplier and speed units to the
 * existing game's collision system.
 */
export function calculateCollisionDamage(
  relativeSpeed,
  impactMultiplier = 1
) {
  const speed = Math.abs(
    Number(relativeSpeed) || 0
  );

  const multiplier = Math.max(
    0,
    Number(impactMultiplier) || 0
  );

  return Math.min(
    100,
    speed * 2.5 * multiplier
  );
}