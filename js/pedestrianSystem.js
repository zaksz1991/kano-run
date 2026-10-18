/**
 * Kano Life — Pedestrian System
 *
 * Features:
 * - Spawns pedestrians along roadside areas.
 * - Supports walking, waiting, and crossing states.
 * - Moves pedestrians using world coordinates.
 * - Avoids spawning every pedestrian at the same position.
 * - Supports different walking speeds and directions.
 *
 * Existing game-loop and renderer integration required.
 */

export const PEDESTRIAN_CONFIG = Object.freeze({
  minimumSpawnDistance: 8,
  maximumSpawnDistance: 45,
  minimumWalkingSpeed: 0.65,
  maximumWalkingSpeed: 1.45,
  roadsideOffset: 5,
  crossingDuration: 5,
  waitingDuration: 2.5,
  maximumPedestrians: 35,
  spawnInterval: 2.5,
});

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomChoice(items) {
  return items[
    Math.floor(Math.random() * items.length)
  ];
}

export function createPedestrianSystem(config = {}) {
  const settings = {
    ...PEDESTRIAN_CONFIG,
    ...config,
  };

  const pedestrians = new Map();

  let nextId = 1;
  let spawnTimer = 0;

  /**
   * Create a pedestrian at a world position.
   */
  function add({
    x,
    z,
    targetX,
    targetZ,
    speed,
    state = "walking",
    side = "left",
    id,
  }) {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z)
    ) {
      throw new TypeError(
        "Pedestrians require finite world coordinates."
      );
    }

    const pedestrianId =
      id ?? `pedestrian-${nextId++}`;

    if (pedestrians.has(pedestrianId)) {
      return pedestrians.get(pedestrianId);
    }

    const pedestrian = {
      id: pedestrianId,
      x,
      z,
      targetX: Number.isFinite(targetX)
        ? targetX
        : x + randomBetween(-4, 4),
      targetZ: Number.isFinite(targetZ)
        ? targetZ
        : z + randomBetween(-4, 4),
      speed: Number.isFinite(speed)
        ? Math.max(0.1, speed)
        : randomBetween(
            settings.minimumWalkingSpeed,
            settings.maximumWalkingSpeed
          ),
      state,
      side,
      stateTimer: randomBetween(0, 1.5),
      heading: 0,
    };

    pedestrians.set(
      pedestrianId,
      pedestrian
    );

    return pedestrian;
  }

  /**
   * Spawn pedestrians near the player's current position.
   *
   * The world must provide a valid road direction.
   * This generic implementation assumes the road runs
   * along the Z axis.
   */
  function spawnNearPlayer(player) {
    if (
      pedestrians.size >=
      settings.maximumPedestrians
    ) {
      return null;
    }

    const playerPosition =
      player.position ?? player;

    const side = randomChoice([
      "left",
      "right",
    ]);

    const sideDirection =
      side === "left" ? -1 : 1;

    const longitudinalDistance =
      randomBetween(
        settings.minimumSpawnDistance,
        settings.maximumSpawnDistance
      );

    const pedestrianZ =
      playerPosition.z +
      longitudinalDistance;

    const pedestrianX =
      playerPosition.x +
      sideDirection *
        settings.roadsideOffset;

    return add({
      x: pedestrianX,
      z: pedestrianZ,
      targetX:
        pedestrianX +
        randomBetween(-2, 2),
      targetZ:
        pedestrianZ +
        randomBetween(-6, 6),
      side,
      state: randomChoice([
        "walking",
        "waiting",
      ]),
    });
  }

  /**
   * Move a pedestrian toward its current target.
   */
  function moveTowardTarget(
    pedestrian,
    deltaTime
  ) {
    const dx =
      pedestrian.targetX - pedestrian.x;

    const dz =
      pedestrian.targetZ - pedestrian.z;

    const distance = Math.hypot(dx, dz);

    if (distance < 0.15) {
      return true;
    }

    const step = Math.min(
      distance,
      pedestrian.speed * deltaTime
    );

    pedestrian.x +=
      (dx / distance) * step;

    pedestrian.z +=
      (dz / distance) * step;

    pedestrian.heading =
      Math.atan2(dx, dz);

    return false;
  }

  /**
   * Start a road crossing.
   *
   * Call this only when the game's traffic logic
   * determines that crossing is sufficiently safe.
   */
  function startCrossing(
    pedestrian,
    oppositeSideX
  ) {
    if (
      !pedestrian ||
      !Number.isFinite(oppositeSideX)
    ) {
      return false;
    }

    pedestrian.state = "crossing";
    pedestrian.targetX = oppositeSideX;
    pedestrian.targetZ = pedestrian.z;
    pedestrian.stateTimer =
      settings.crossingDuration;

    return true;
  }

  /**
   * Advance all pedestrians by deltaTime seconds.
   */
  function update(deltaTime, player) {
    const dt = Math.max(
      0,
      Math.min(0.05, Number(deltaTime) || 0)
    );

    if (dt === 0) {
      return;
    }

    spawnTimer += dt;

    if (
      spawnTimer >= settings.spawnInterval &&
      player &&
      pedestrians.size <
        settings.maximumPedestrians
    ) {
      spawnTimer = 0;
      spawnNearPlayer(player);
    }

    for (const pedestrian of pedestrians.values()) {
      if (pedestrian.state === "waiting") {
        pedestrian.stateTimer -= dt;

        if (pedestrian.stateTimer <= 0) {
          pedestrian.state = "walking";

          pedestrian.targetX =
            pedestrian.x +
            randomBetween(-3, 3);

          pedestrian.targetZ =
            pedestrian.z +
            randomBetween(-5, 5);
        }

        continue;
      }

      if (pedestrian.state === "crossing") {
        pedestrian.stateTimer -= dt;

        const arrived = moveTowardTarget(
          pedestrian,
          dt
        );

        if (
          arrived ||
          pedestrian.stateTimer <= 0
        ) {
          pedestrian.state = "walking";

          pedestrian.targetZ =
            pedestrian.z +
            randomBetween(-4, 4);
        }

        continue;
      }

      const arrived = moveTowardTarget(
        pedestrian,
        dt
      );

      if (arrived) {
        pedestrian.state = "waiting";

        pedestrian.stateTimer =
          randomBetween(
            0.5,
            settings.waitingDuration
          );
      }
    }
  }

  /**
   * Return pedestrian data for the renderer.
   * Do not use camera visibility as a reason to
   * repeatedly respawn pedestrians at the same position.
   */
  function getAll() {
    return Array.from(pedestrians.values());
  }

  function remove(id) {
    return pedestrians.delete(id);
  }

  function clear() {
    pedestrians.clear();
    spawnTimer = 0;
  }

  return {
    add,
    update,
    startCrossing,
    getAll,
    remove,
    clear,
  };
}