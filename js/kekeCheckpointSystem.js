/**
 * Kano Life — Keke Checkpoint System
 *
 * Features:
 * - General keke checkpoints.
 * - KAROTA inspection checkpoints.
 * - Stop-to-interact requirements.
 * - Passenger capacity checks.
 * - Inspection results and rewards.
 * - Checkpoint cooldowns to prevent repeated rewards.
 *
 * Integration with the existing game loop, world map,
 * and HUD is required.
 */

export const CHECKPOINT_CONFIG = Object.freeze({
  interactionRadius: 5,
  maximumInteractionSpeed: 0.5,
  checkpointCooldownMs: 30000,
  generalCheckpointReward: 300,
  karotaInspectionFine: 500,
  passengerCapacity: 4,
});

export function createCheckpointSystem(config = {}) {
  const settings = {
    ...CHECKPOINT_CONFIG,
    ...config,
  };

  const checkpoints = new Map();
  const completedCheckpoints = new Set();

  let nextId = 1;
  let totalRewards = 0;
  let totalFines = 0;
  let inspectionsCompleted = 0;

  function getPosition(object) {
    const position = object?.position ?? object;

    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.z)
    ) {
      throw new TypeError(
        "Expected valid world coordinates."
      );
    }

    return {
      x: position.x,
      z: position.z,
    };
  }

  function distanceBetween(a, b) {
    return Math.hypot(
      a.x - b.x,
      a.z - b.z
    );
  }

  /**
   * Register a checkpoint at a fixed world position.
   *
   * type:
   * - general
   * - karota
   */
  function addCheckpoint({
    id,
    x,
    z,
    type = "general",
    name,
    reward,
    requiredPassengers = 0,
    inspectionDuration = 3,
  }) {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z)
    ) {
      throw new TypeError(
        "Checkpoint coordinates must be finite."
      );
    }

    if (!["general", "karota"].includes(type)) {
      throw new TypeError(
        "Checkpoint type must be general or karota."
      );
    }

    const checkpointId =
      id ?? `checkpoint-${nextId++}`;

    if (checkpoints.has(checkpointId)) {
      return checkpoints.get(checkpointId);
    }

    const checkpoint = {
      id: checkpointId,
      x,
      z,
      type,
      name:
        name ??
        (type === "karota"
          ? "KAROTA Inspection"
          : "General Keke Checkpoint"),
      reward:
        Number.isFinite(reward)
          ? Math.max(0, reward)
          : settings.generalCheckpointReward,
      requiredPassengers: Math.max(
        0,
        Math.floor(requiredPassengers)
      ),
      inspectionDuration: Math.max(
        0,
        inspectionDuration
      ),
      lastUsedAt: -Infinity,
      inspectionStartedAt: null,
      occupied: false,
    };

    checkpoints.set(
      checkpointId,
      checkpoint
    );

    return checkpoint;
  }

  /**
   * Find checkpoints close to the keke.
   */
  function findNearby(keke) {
    const position = getPosition(keke);

    return Array.from(checkpoints.values())
      .map((checkpoint) => ({
        checkpoint,
        distance: distanceBetween(
          position,
          checkpoint
        ),
      }))
      .filter(
        (item) =>
          item.distance <=
          settings.interactionRadius
      )
      .sort(
        (a, b) => a.distance - b.distance
      )
      .map((item) => item.checkpoint);
  }

  /**
   * Interact with a checkpoint.
   *
   * The keke must be stopped and within range.
   */
  function interact(
    keke,
    checkpointId,
    now = Date.now()
  ) {
    const checkpoint =
      checkpoints.get(checkpointId);

    if (!checkpoint) {
      return {
        success: false,
        reason: "Checkpoint not found.",
      };
    }

    if (
      Math.abs(Number(keke.speed) || 0) >
      settings.maximumInteractionSpeed
    ) {
      return {
        success: false,
        reason: "Stop the keke before entering the checkpoint.",
      };
    }

    const position = getPosition(keke);

    if (
      distanceBetween(position, checkpoint) >
      settings.interactionRadius
    ) {
      return {
        success: false,
        reason: "Move closer to the checkpoint.",
      };
    }

    if (
      now - checkpoint.lastUsedAt <
      settings.checkpointCooldownMs
    ) {
      return {
        success: false,
        reason: "This checkpoint is temporarily unavailable.",
      };
    }

    if (checkpoint.type === "general") {
      return processGeneralCheckpoint(
        keke,
        checkpoint,
        now
      );
    }

    return processKarotaCheckpoint(
      keke,
      checkpoint,
      now
    );
  }

  function processGeneralCheckpoint(
    keke,
    checkpoint,
    now
  ) {
    const passengerCount = Math.max(
      0,
      Number(keke.passengersOnboard) || 0
    );

    const required =
      checkpoint.requiredPassengers;

    if (
      passengerCount < required ||
      passengerCount > settings.passengerCapacity
    ) {
      return {
        success: false,
        reason:
          passengerCount > settings.passengerCapacity
            ? "Passenger capacity exceeded."
            : `This checkpoint requires at least ${required} passengers.`,
      };
    }

    checkpoint.lastUsedAt = now;

    const reward = checkpoint.reward;

    totalRewards += reward;
    completedCheckpoints.add(checkpoint.id);

    return {
      success: true,
      event: {
        type: "general_checkpoint_completed",
        checkpointId: checkpoint.id,
        reward,
        totalRewards,
        passengersOnboard: passengerCount,
      },
    };
  }

  function processKarotaCheckpoint(
    keke,
    checkpoint,
    now
  ) {
    const passengerCount = Math.max(
      0,
      Number(keke.passengersOnboard) || 0
    );

    const overloaded =
      passengerCount > settings.passengerCapacity;

    checkpoint.lastUsedAt = now;
    inspectionsCompleted += 1;

    const fine = overloaded
      ? settings.karotaInspectionFine
      : 0;

    totalFines += fine;

    return {
      success: true,
      event: {
        type: "karota_inspection_completed",
        checkpointId: checkpoint.id,
        passed: !overloaded,
        passengersOnboard: passengerCount,
        capacity: settings.passengerCapacity,
        fine,
        totalFines,
        message: overloaded
          ? "Inspection failed: passenger capacity exceeded."
          : "Inspection passed.",
      },
    };
  }

  function getState() {
    return {
      checkpoints: Array.from(
        checkpoints.values()
      ),
      completedCheckpoints: Array.from(
        completedCheckpoints
      ),
      totalRewards,
      totalFines,
      inspectionsCompleted,
      netCheckpointEarnings:
        totalRewards - totalFines,
    };
  }

  function reset() {
    checkpoints.clear();
    completedCheckpoints.clear();

    totalRewards = 0;
    totalFines = 0;
    inspectionsCompleted = 0;
    nextId = 1;
  }

  return {
    addCheckpoint,
    findNearby,
    interact,
    getState,
    reset,
  };
}