/**
 * Kano Life — Persistent Pothole System
 *
 * Features:
 * - Potholes remain at fixed world coordinates.
 * - Collision detection uses the player's world position.
 * - Each pothole registers a hit only once per encounter.
 * - Potholes are not deleted when they pass behind the camera.
 * - Supports Three.js-style position objects and plain coordinates.
 *
 * Integration with the existing renderer and game loop is still required.
 */

export const POTHOLE_CONFIG = Object.freeze({
  defaultRadius: 1.15,
  playerRadius: 0.85,
  hitCooldownMs: 1200,
  damagePerHit: 4,
  speedThreshold: 2,
});

export function createPotholeSystem(config = {}) {
  const settings = {
    ...POTHOLE_CONFIG,
    ...config,
  };

  const potholes = new Map();
  let nextId = 1;

  /**
   * Create a pothole at a fixed world position.
   *
   * x and z are world coordinates, not screen coordinates.
   */
  function add({
    x,
    z,
    radius = settings.defaultRadius,
    depth = 0.15,
    damage = settings.damagePerHit,
    id,
  }) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      throw new TypeError(
        "Potholes require finite world coordinates x and z."
      );
    }

    const potholeId = id ?? `pothole-${nextId++}`;

    if (potholes.has(potholeId)) {
      return potholes.get(potholeId);
    }

    const pothole = {
      id: potholeId,
      x,
      z,
      radius: Math.max(0.1, radius),
      depth: Math.max(0, depth),
      damage: Math.max(0, damage),
      hitCount: 0,
      lastHitAt: -Infinity,
      occupied: false,
    };

    potholes.set(potholeId, pothole);

    return pothole;
  }

  /**
   * Add multiple potholes without moving existing ones.
   */
  function addMany(items = []) {
    return items.map((item) => add(item));
  }

  /**
   * Read the player's position from either:
   * { x, z }
   * { position: { x, z } }
   * { position: THREE.Vector3 }
   */
  function getPosition(object) {
    const position = object?.position ?? object;

    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.z)
    ) {
      throw new TypeError(
        "Expected an object with finite world position x and z."
      );
    }

    return {
      x: position.x,
      z: position.z,
    };
  }

  /**
   * Test whether the player overlaps a pothole.
   */
  function overlaps(player, pothole) {
    const position = getPosition(player);

    const dx = position.x - pothole.x;
    const dz = position.z - pothole.z;

    const combinedRadius =
      settings.playerRadius + pothole.radius;

    return (
      dx * dx + dz * dz <=
      combinedRadius * combinedRadius
    );
  }

  /**
   * Update pothole collision states.
   *
   * Call once per game frame.
   *
   * Returns collision events for the game to process.
   * A pothole registers one hit per entry, with a cooldown
   * preventing repeated damage while the keke remains inside.
   */
  function update(player, now = performance.now()) {
    const events = [];
    const speed = Math.abs(Number(player.speed) || 0);

    for (const pothole of potholes.values()) {
      const inside = overlaps(player, pothole);

      if (!inside) {
        pothole.occupied = false;
        continue;
      }

      if (pothole.occupied) {
        continue;
      }

      pothole.occupied = true;

      if (speed < settings.speedThreshold) {
        continue;
      }

      if (
        now - pothole.lastHitAt <
        settings.hitCooldownMs
      ) {
        continue;
      }

      pothole.lastHitAt = now;
      pothole.hitCount += 1;

      events.push({
        potholeId: pothole.id,
        damage: pothole.damage,
        depth: pothole.depth,
        speed,
        worldPosition: {
          x: pothole.x,
          z: pothole.z,
        },
        hitCount: pothole.hitCount,
      });
    }

    return events;
  }

  /**
   * Return potholes for rendering.
   *
   * Do not delete potholes because they are outside
   * the camera's visible area.
   */
  function getAll() {
    return Array.from(potholes.values());
  }

  function getById(id) {
    return potholes.get(id) ?? null;
  }

  /**
   * Explicitly remove a pothole when the world is reset
   * or a level is intentionally rebuilt.
   */
  function remove(id) {
    return potholes.delete(id);
  }

  function clear() {
    potholes.clear();
  }

  return {
    add,
    addMany,
    update,
    getAll,
    getById,
    remove,
    clear,
  };
}