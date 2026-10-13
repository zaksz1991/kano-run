import GAME_CONFIG from "../core/config.js";

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const DEFAULTS = {
  playerWidth: 1.15,
  playerLength: 2.1,
  laneChangeGrace: 0.12,
  collisionCooldown: 0.8,
  nearMissDistance: 2.4,
  nearMissRange: 5.5,
  minimumImpactSpeed: 2,
  maximumDamage: 45,
  minimumDamage: 8,
};

export class CollisionSystem {
  constructor(options = {}) {
    this.config = options.config ?? GAME_CONFIG;
    this.eventBus = options.eventBus ?? null;
    this.gameState = options.gameState ?? null;

    this.options = {
      ...DEFAULTS,
      ...(options.collision ?? {}),
    };

    this.lastCollisionAt = new Map();
    this.nearMissedVehicles = new Set();
    this.previousPlayer = null;
    this.elapsed = 0;

    this.statistics = {
      collisionChecks: 0,
      collisions: 0,
      nearMisses: 0,
      avoidedCollisions: 0,
    };
  }

  update(deltaSeconds, player, trafficSystem) {
    if (!player || !trafficSystem) return [];

    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    this.elapsed += dt;

    this.expireCooldowns();

    const playerBox = this.getPlayerBox(player);
    const nearbyVehicles = trafficSystem.getNearbyVehicles(
      playerBox.z,
      this.options.nearMissRange + 5,
    );

    const collisions = [];

    for (const vehicle of nearbyVehicles) {
      this.statistics.collisionChecks += 1;

      const vehicleBox = this.getVehicleBox(vehicle);

      if (this.intersects(playerBox, vehicleBox)) {
        const collision = this.handleCollision(
          player,
          vehicle,
          trafficSystem,
        );

        if (collision) collisions.push(collision);

        continue;
      }

      this.checkNearMiss(
        playerBox,
        vehicleBox,
        vehicle,
        trafficSystem,
      );
    }

    this.previousPlayer = {
      x: playerBox.x,
      z: playerBox.z,
      lane: player.lane,
    };

    return collisions;
  }

  getPlayerBox(player) {
    return {
      x: Number(player.x ?? player.lanePosition) || 0,
      z: Number(player.z) || 0,
      halfWidth: this.options.playerWidth / 2,
      halfLength: this.options.playerLength / 2,
      lane: Number(player.lane) || 0,
    };
  }

  getVehicleBox(vehicle) {
    return {
      x: Number(vehicle.x) || 0,
      z: Number(vehicle.z) || 0,
      halfWidth: Math.max(0.3, Number(vehicle.width) || 1) / 2,
      halfLength: Math.max(0.5, Number(vehicle.length) || 3) / 2,
      lane: Number(vehicle.lane) || 0,
    };
  }

  intersects(a, b) {
    const overlapX =
      Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth;

    const overlapZ =
      Math.abs(a.z - b.z) < a.halfLength + b.halfLength;

    return overlapX && overlapZ;
  }

  checkNearMiss(playerBox, vehicleBox, vehicle, trafficSystem) {
    if (this.nearMissedVehicles.has(vehicle.id)) return;

    const deltaX = Math.abs(playerBox.x - vehicleBox.x);
    const deltaZ = Math.abs(playerBox.z - vehicleBox.z);

    const longitudinalOverlap =
      deltaZ < playerBox.halfLength + vehicleBox.halfLength + 1;

    const safeSideDistance =
      playerBox.halfWidth + vehicleBox.halfWidth;

    const narrowlyAvoided =
      longitudinalOverlap &&
      deltaX >= safeSideDistance &&
      deltaX <= safeSideDistance + this.options.nearMissDistance;

    if (!narrowlyAvoided) return;

    this.nearMissedVehicles.add(vehicle.id);
    this.statistics.nearMisses += 1;

    trafficSystem.recordNearMiss(vehicle.id);

    this.gameState?.recordNearMiss();

    this.emit("collision:near-miss", {
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      distanceX: deltaX,
      distanceZ: deltaZ,
    });
  }

  handleCollision(player, vehicle, trafficSystem) {
    const previousCollision = this.lastCollisionAt.get(vehicle.id);

    if (
      previousCollision !== undefined &&
      this.elapsed - previousCollision <
        this.options.collisionCooldown
    ) {
      return null;
    }

    if ((player.invulnerabilityTimer ?? 0) > 0) {
      this.statistics.avoidedCollisions += 1;

      this.emit("collision:protected", {
        vehicleId: vehicle.id,
        vehicleType: vehicle.type,
      });

      return null;
    }

    this.lastCollisionAt.set(vehicle.id, this.elapsed);

    const playerSpeed = Math.max(0, Number(player.speed) || 0);
    const trafficSpeed = Math.max(0, Number(vehicle.speed) || 0);

    const relativeSpeed = Math.abs(playerSpeed - trafficSpeed);

    const damage = clamp(
      this.options.minimumDamage +
        relativeSpeed * (Number(vehicle.weight) || 1) * 0.7,
      this.options.minimumDamage,
      this.options.maximumDamage,
    );

    this.statistics.collisions += 1;
    trafficSystem.recordCollision(vehicle.id);

    const result = {
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      damage: Math.round(damage),
      relativeSpeed,
      hostile: Boolean(vehicle.hostile),
      enforcement: Boolean(vehicle.enforcement),
      marked: Boolean(vehicle.marked),
    };

    if (this.gameState) {
      this.gameState.recordCollision(result.damage);
    }

    this.emit("collision:detected", result);

    return result;
  }

  expireCooldowns() {
    const expiry = this.options.collisionCooldown * 3;

    for (const [vehicleId, timestamp] of this.lastCollisionAt) {
      if (this.elapsed - timestamp > expiry) {
        this.lastCollisionAt.delete(vehicleId);
      }
    }

    // Bound memory use during long sessions.
    if (this.nearMissedVehicles.size > 500) {
      this.nearMissedVehicles.clear();
    }
  }

  reset() {
    this.lastCollisionAt.clear();
    this.nearMissedVehicles.clear();
    this.previousPlayer = null;
    this.elapsed = 0;

    this.statistics = {
      collisionChecks: 0,
      collisions: 0,
      nearMisses: 0,
      avoidedCollisions: 0,
    };
  }

  getSnapshot() {
    return {
      elapsed: this.elapsed,
      statistics: { ...this.statistics },
      cooldownCount: this.lastCollisionAt.size,
      trackedNearMisses: this.nearMissedVehicles.size,
    };
  }

  emit(eventName, payload) {
    this.eventBus?.emit(eventName, payload);
  }

  destroy() {
    this.reset();
    this.eventBus = null;
    this.gameState = null;
  }
}

export default CollisionSystem;