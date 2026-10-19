/**
 * KANO LIFE — Traffic Intelligence Director
 * Standalone additive traffic AI for a browser-based Kano driving simulation.
 * Does not depend on Three.js. Feed its decisions into existing vehicle physics/rendering.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randomBetween = (min, max, random = Math.random) => min + random() * (max - min);
const choose = (items, random = Math.random) => items[Math.floor(random() * items.length)];

export const KANO_TRAFFIC_PROFILES = Object.freeze({
  keke: { label: 'Adaidaita Sahu', share: 0.4, speed: [5, 13], acceleration: [2, 4.2], braking: [5, 9], laneChange: 0.45, gap: 5.2, risk: 0.62, width: 1.25 },
  motorcycle: { label: 'Motorcycle', share: 0.3, speed: [7, 17], acceleration: [3.5, 6], braking: [6, 11], laneChange: 0.82, gap: 3.2, risk: 0.78, width: 0.7 },
  car: { label: 'Car', share: 0.3, speed: [8, 18], acceleration: [2.4, 4.5], braking: [6, 10], laneChange: 0.38, gap: 6.5, risk: 0.35, width: 1.7 },
  bus: { label: 'Bus', share: 0, speed: [5, 12], acceleration: [1.2, 2.6], braking: [3.5, 6], laneChange: 0.16, gap: 9, risk: 0.22, width: 2.2 },
  truck: { label: 'Truck', share: 0, speed: [4, 10], acceleration: [1, 2.2], braking: [3, 5.5], laneChange: 0.12, gap: 10, risk: 0.18, width: 2.35 },
});

const OBSTACLE_RULES = {
  pothole: { speedFactor: 0.58, lateralBias: 0.7, risk: 0.72 },
  pedestrian: { speedFactor: 0.38, lateralBias: 0.45, risk: 0.95 },
  goat: { speedFactor: 0.32, lateralBias: 0.5, risk: 1 },
  market_stall: { speedFactor: 0.55, lateralBias: 0.8, risk: 0.65 },
  parked_vehicle: { speedFactor: 0.62, lateralBias: 0.65, risk: 0.55 },
  checkpoint: { speedFactor: 0.42, lateralBias: 0, risk: 0.12 },
  convoy: { speedFactor: 0.78, lateralBias: 0.25, risk: 0.82 },
};

export class KanoTrafficIntelligenceDirector {
  constructor(options = {}) {
    this.random = options.random || Math.random;
    this.laneCount = Math.max(2, Math.floor(options.laneCount || 3));
    this.laneCenters = options.laneCenters || Array.from({ length: this.laneCount }, (_, i) => i - (this.laneCount - 1) / 2);
    this.targetMix = { keke: 0.4, motorcycle: 0.3, car: 0.3, ...(options.targetMix || {}) };
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.vehicles = new Map();
    this.clock = 0;
    this.trafficPressure = 0.35;
    this.weather = 'clear';
    this.activeEvent = null;
    this.nextId = 1;
  }

  emit(type, detail = {}) { this.onEvent({ type, detail, time: this.clock }); }

  chooseType() {
    const entries = Object.entries(this.targetMix).filter(([type, weight]) => KANO_TRAFFIC_PROFILES[type] && weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    let roll = this.random() * total;
    for (const [type, weight] of entries) { roll -= weight; if (roll <= 0) return type; }
    return 'keke';
  }

  spawnVehicle(options = {}) {
    const type = KANO_TRAFFIC_PROFILES[options.type] ? options.type : this.chooseType();
    const profile = KANO_TRAFFIC_PROFILES[type];
    const lane = clamp(Math.floor(options.lane ?? Math.floor(this.random() * this.laneCount)), 0, this.laneCount - 1);
    const vehicle = {
      id: options.id || `traffic-${this.nextId++}`,
      type,
      label: profile.label,
      lane,
      targetLane: lane,
      longitudinal: Number.isFinite(options.longitudinal) ? options.longitudinal : randomBetween(25, 90, this.random),
      speed: Number.isFinite(options.speed) ? options.speed : randomBetween(profile.speed[0], profile.speed[1], this.random),
      desiredSpeed: Number.isFinite(options.desiredSpeed) ? options.desiredSpeed : randomBetween(profile.speed[0], profile.speed[1], this.random),
      acceleration: randomBetween(profile.acceleration[0], profile.acceleration[1], this.random),
      braking: randomBetween(profile.braking[0], profile.braking[1], this.random),
      personality: choose(['cautious', 'ordinary', 'impatient', 'assertive'], this.random),
      state: 'cruising',
      indicator: null,
      lateralOffset: 0,
      damage: 0,
      nearMisses: 0,
      collisionCooldown: 0,
      hasPassengers: type === 'keke' ? this.random() < 0.55 : false,
      isConvoyMember: Boolean(options.isConvoyMember),
      risk: profile.risk,
      width: profile.width,
      lastDecision: null,
    };
    this.vehicles.set(vehicle.id, vehicle);
    this.emit('vehicle_spawned', { id: vehicle.id, type, lane });
    return { ...vehicle };
  }

  despawnVehicle(id) {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return false;
    this.vehicles.delete(id);
    this.emit('vehicle_despawned', { id, type: vehicle.type });
    return true;
  }

  setConditions({ trafficPressure, weather, event } = {}) {
    if (Number.isFinite(trafficPressure)) this.trafficPressure = clamp(trafficPressure, 0, 1);
    if (weather) this.weather = weather;
    if (event !== undefined) this.activeEvent = event;
  }

  /**
   * obstacles: [{ type: 'pothole'|'pedestrian'|'goat'|..., lane, distance }]
   * player: { lane, speed, distanceAhead } (all optional)
   * Returns decisions for the frame; caller applies movement/physics to actual models.
   */
  update(deltaSeconds, { obstacles = [], player = null, nearbyVehicles = [] } = {}) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
    this.clock += dt;
    const snapshots = [...this.vehicles.values()];
    const external = nearbyVehicles.filter(v => v && Number.isFinite(v.lane) && Number.isFinite(v.longitudinal));
    const decisions = [];

    for (const vehicle of snapshots) {
      const profile = KANO_TRAFFIC_PROFILES[vehicle.type];
      const nearby = [...snapshots.filter(other => other.id !== vehicle.id), ...external]
        .filter(other => other.lane === vehicle.lane && other.longitudinal > vehicle.longitudinal)
        .sort((a, b) => a.longitudinal - b.longitudinal)[0];
      const gap = nearby ? nearby.longitudinal - vehicle.longitudinal : Infinity;
      let desired = vehicle.desiredSpeed;
      let state = 'cruising';
      let targetLane = vehicle.lane;
      let reason = null;

      const weatherFactor = this.weather === 'rain' ? 0.72 : this.weather === 'dust' ? 0.84 : 1;
      desired *= weatherFactor;
      if (this.trafficPressure > 0.65) desired *= 0.82;
      if (vehicle.isConvoyMember || this.activeEvent === 'celebration_convoy') desired *= 1.08;

      if (nearby && gap < profile.gap * (1.1 + this.trafficPressure)) {
        const alternate = this.findSafeLane(vehicle, snapshots, external, obstacles);
        if (alternate !== null && this.random() < profile.laneChange * (vehicle.personality === 'impatient' ? 1.25 : 0.75)) {
          targetLane = alternate;
          state = 'changing_lane';
          reason = 'slow_vehicle_ahead';
          vehicle.indicator = targetLane < vehicle.lane ? 'left' : 'right';
        } else {
          desired = Math.min(desired, Math.max(0, (gap - profile.gap * 0.45) * 1.5));
          state = 'following';
          reason = 'safe_following_distance';
          vehicle.indicator = null;
        }
      }

      let closestObstacle = null;
      for (const obstacle of obstacles) {
        const rule = OBSTACLE_RULES[obstacle.type];
        if (!rule || !Number.isFinite(obstacle.lane) || !Number.isFinite(obstacle.distance)) continue;
        if (obstacle.lane === vehicle.lane && obstacle.distance >= 0 && obstacle.distance < 18 && (!closestObstacle || obstacle.distance < closestObstacle.distance)) closestObstacle = { ...obstacle, rule };
      }
      if (closestObstacle) {
        const d = closestObstacle.distance;
        desired = Math.min(desired, vehicle.desiredSpeed * (d < 4 ? 0.08 : d < 8 ? closestObstacle.rule.speedFactor * 0.55 : closestObstacle.rule.speedFactor));
        state = d < 3.2 ? 'emergency_braking' : 'hazard_avoidance';
        reason = closestObstacle.type;
        if (d > 4 && closestObstacle.rule.lateralBias > 0) {
          const alternate = this.findSafeLane(vehicle, snapshots, external, obstacles);
          if (alternate !== null && this.random() < closestObstacle.rule.lateralBias) {
            targetLane = alternate;
            vehicle.indicator = targetLane < vehicle.lane ? 'left' : 'right';
          }
        }
      }

      if (player && Number.isFinite(player.lane) && player.lane === vehicle.lane && Number.isFinite(player.distanceAhead) && player.distanceAhead >= 0 && player.distanceAhead < 12) {
        desired = Math.min(desired, vehicle.desiredSpeed * clamp(player.distanceAhead / 12, 0.12, 1));
        state = player.distanceAhead < 3 ? 'emergency_braking' : 'yielding_to_player';
        reason = 'player_vehicle';
      }

      const accelerationLimit = desired < vehicle.speed ? vehicle.braking : vehicle.acceleration;
      const deltaSpeed = clamp(desired - vehicle.speed, -accelerationLimit * dt, vehicle.acceleration * dt);
      vehicle.speed = Math.max(0, vehicle.speed + deltaSpeed);
      if (targetLane !== vehicle.lane) {
        vehicle.targetLane = targetLane;
        vehicle.lane = targetLane;
      }
      vehicle.longitudinal -= vehicle.speed * dt;
      vehicle.state = state;
      vehicle.lastDecision = { id: vehicle.id, type: vehicle.type, lane: vehicle.lane, targetLane, speed: vehicle.speed, state, reason, indicator: vehicle.indicator, gap: Number.isFinite(gap) ? gap : null };
      decisions.push({ ...vehicle.lastDecision });
    }
    return decisions;
  }

  findSafeLane(vehicle, vehicles, external, obstacles = []) {
    const candidates = [];
    for (let lane = 0; lane < this.laneCount; lane++) {
      if (lane === vehicle.lane) continue;
      const occupied = [...vehicles.filter(v => v.id !== vehicle.id), ...external].some(other => other.lane === lane && Math.abs(other.longitudinal - vehicle.longitudinal) < 9);
      const blocked = obstacles.some(o => o.lane === lane && Number.isFinite(o.distance) && o.distance >= 0 && o.distance < 8);
      if (!occupied && !blocked) candidates.push(lane);
    }
    return candidates.length ? choose(candidates, this.random) : null;
  }

  /** Records contact consequences; physical collision detection remains with the game engine. */
  recordCollision(id, severity = 0.35, context = {}) {
    const vehicle = this.vehicles.get(id);
    if (!vehicle || vehicle.collisionCooldown > 0) return null;
    const impact = clamp(severity, 0, 1);
    vehicle.damage = clamp(vehicle.damage + impact * 0.6, 0, 1);
    vehicle.speed *= 1 - impact * 0.8;
    vehicle.collisionCooldown = 1.5;
    vehicle.state = 'collision_recovery';
    this.emit('collision_recorded', { id, type: vehicle.type, severity: impact, damage: vehicle.damage, context });
    return { id, severity: impact, damage: vehicle.damage, speedAfterImpact: vehicle.speed, requiresRepair: vehicle.damage >= 0.45 };
  }

  tickCooldowns(deltaSeconds) {
    const dt = Math.max(0, Number(deltaSeconds) || 0);
    for (const vehicle of this.vehicles.values()) vehicle.collisionCooldown = Math.max(0, vehicle.collisionCooldown - dt);
  }

  getTrafficMix() {
    const counts = { keke: 0, motorcycle: 0, car: 0, bus: 0, truck: 0 };
    for (const vehicle of this.vehicles.values()) counts[vehicle.type]++;
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const shares = Object.fromEntries(Object.entries(counts).map(([type, count]) => [type, total ? count / total : 0]));
    return { total, counts, shares, target: { ...this.targetMix } };
  }

  spawnWave(count, options = {}) {
    const amount = clamp(Math.floor(count), 0, 100);
    const spawned = [];
    for (let i = 0; i < amount; i++) spawned.push(this.spawnVehicle({ ...options, longitudinal: (options.startDistance ?? 25) + i * (options.spacing ?? 12) }));
    return spawned;
  }

  getSnapshot() {
    return { clock: this.clock, trafficPressure: this.trafficPressure, weather: this.weather, activeEvent: this.activeEvent, trafficMix: this.getTrafficMix(), vehicles: [...this.vehicles.values()].map(v => ({ ...v })) };
  }

  clear() { this.vehicles.clear(); this.emit('traffic_cleared'); }
}

export default KanoTrafficIntelligenceDirector;
