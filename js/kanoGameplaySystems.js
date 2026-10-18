/**
 * Kano Life — Gameplay Systems Manager
 *
 * Coordinates the standalone gameplay modules.
 *
 * Expected files:
 *   ./vehiclePhysics.js
 *   ./potholeSystem.js
 *   ./trafficSafety.js
 *   ./pedestrianSystem.js
 *   ./passengerSystem.js
 *   ./kekeCheckpointSystem.js
 *
 * IMPORTANT:
 * This manager assumes the exported function names
 * from the previous modules. Test against the actual
 * repository before connecting it to the live game.
 */

import {
  createVehiclePhysics,
  updateVehiclePhysics,
  moveVehicle,
} from "./vehiclePhysics.js";

import {
  createPotholeSystem,
} from "./potholeSystem.js";

import {
  scanTraffic,
} from "./trafficSafety.js";

import {
  createPedestrianSystem,
} from "./pedestrianSystem.js";

import {
  createPassengerSystem,
} from "./passengerSystem.js";

import {
  createCheckpointSystem,
} from "./kekeCheckpointSystem.js";

export function createKanoGameplaySystems(options = {}) {
  const player = options.player ?? {
    id: "player-keke",
    position: { x: 0, z: 0 },
    speed: 0,
    heading: 0,
    passengersOnboard: 0,
    damage: 0,
  };

  const physics = createVehiclePhysics({
    speed: player.speed ?? 0,
    heading: player.heading ?? 0,
    damage: player.damage ?? 0,
  });

  const potholes = createPotholeSystem(
    options.potholes
  );

  const pedestrians = createPedestrianSystem(
    options.pedestrians
  );

  const passengers = createPassengerSystem(
    options.passengers
  );

  const checkpoints = createCheckpointSystem(
    options.checkpoints
  );

  let totalPotholeDamage = 0;
  let lastTrafficWarnings = [];

  /**
   * Advance gameplay systems.
   *
   * Call this from the existing game loop.
   * Do not also move the same player independently
   * in another update function.
   */
  function update(deltaTime, controls = {}, traffic = []) {
    const dt = Math.max(
      0,
      Math.min(0.05, Number(deltaTime) || 0)
    );

    if (dt === 0) {
      return {
        player,
        trafficWarnings: lastTrafficWarnings,
        events: [],
      };
    }

    const previousPosition = {
      x: player.position.x,
      z: player.position.z,
    };

    // 1. Update the physics state.
    updateVehiclePhysics(
      physics,
      controls,
      dt
    );

    // 2. Synchronize physics with the player.
    player.speed = physics.speed;
    player.heading = physics.heading;

    // 3. Move the player using the shared physics state.
    moveVehicle(player, dt);

    // 4. Synchronize the updated world position.
    physics.position = player.position;

    const events = [];

    // 5. Check persistent potholes.
    const potholeEvents = potholes.update(
      player,
      performance.now()
    );

    for (const event of potholeEvents) {
      totalPotholeDamage += event.damage;

      player.damage = Math.min(
        100,
        (Number(player.damage) || 0) +
          event.damage
      );

      events.push(event);
    }

    // 6. Update pedestrians.
    pedestrians.update(dt, player);

    // 7. Check nearby traffic.
    lastTrafficWarnings = scanTraffic(
      player,
      traffic
    );

    for (const warning of lastTrafficWarnings) {
      if (warning.collisionRisk) {
        events.push({
          type: "vehicle_collision_detected",
          otherId: warning.otherId,
          distance: warning.distance,
        });
      }
    }

    // 8. Update passenger drop-offs and waiting times.
    const passengerEvents = passengers.update(
      dt,
      player
    );

    events.push(
      ...passengerEvents.dropoffs,
      ...passengerEvents.waiting
    );

    // 9. Keep the passenger count synchronized.
    player.passengersOnboard =
      passengers.getState().passengersOnboard;

    return {
      player,
      previousPosition,
      trafficWarnings: lastTrafficWarnings,
      events,
      totalPotholeDamage,
    };
  }

  /**
   * Expose systems to the existing game UI,
   * renderer, and input handlers.
   */
  function getSystems() {
    return {
      potholes,
      pedestrians,
      passengers,
      checkpoints,
    };
  }

  function getState() {
    return {
      player,
      physics,
      trafficWarnings: lastTrafficWarnings,
      totalPotholeDamage,
      passengers: passengers.getState(),
      checkpoints: checkpoints.getState(),
      potholes: potholes.getAll(),
      pedestrians: pedestrians.getAll(),
    };
  }

  return {
    player,
    update,
    getSystems,
    getState,
  };
}