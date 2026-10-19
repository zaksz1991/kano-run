/**
 * Kano Life — Road Physics & Collision Response
 * Standalone simulation helper for a Three.js/Vite driving game.
 * This module computes forces, grip, suspension response and collision outcomes;
 * the existing physics/game loop remains responsible for applying movement.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
const DEFAULTS = {
  keke: { mass: 430, grip: 0.78, suspension: 0.62, stability: 0.58, brake: 7.8, maxDamage: 100 },
  motorcycle: { mass: 155, grip: 0.84, suspension: 0.45, stability: 0.36, brake: 9.2, maxDamage: 80 },
  car: { mass: 1350, grip: 0.92, suspension: 0.76, stability: 0.88, brake: 9.8, maxDamage: 120 },
  bus: { mass: 4200, grip: 0.72, suspension: 0.82, stability: 0.84, brake: 6.5, maxDamage: 180 },
  truck: { mass: 6500, grip: 0.7, suspension: 0.88, stability: 0.9, brake: 5.8, maxDamage: 200 },
};

export class KanoRoadPhysicsDirector {
  constructor(options = {}) {
    this.options = { gravity: 9.81, potholeImpactScale: 1, collisionDamageScale: 1, emit: null, ...options };
    this.vehicles = new Map();
    this.lastFrame = 0;
  }

  registerVehicle(id, type = 'keke', overrides = {}) {
    if (id == null) throw new Error('registerVehicle requires a stable vehicle id');
    const base = DEFAULTS[type] || DEFAULTS.keke;
    const vehicle = {
      id: String(id), type: DEFAULTS[type] ? type : 'keke',
      mass: finite(overrides.mass, base.mass), grip: finite(overrides.grip, base.grip),
      suspension: finite(overrides.suspension, base.suspension), stability: finite(overrides.stability, base.stability),
      brake: finite(overrides.brake, base.brake), maxDamage: finite(overrides.maxDamage, base.maxDamage),
      damage: clamp(overrides.damage ?? 0, 0, finite(overrides.maxDamage, base.maxDamage)),
      suspensionVelocity: 0, suspensionOffset: 0, yawInstability: 0, traction: 1,
      engineHealth: 1, tyreHealth: 1, lastImpact: null, collisionCount: 0,
    };
    this.vehicles.set(vehicle.id, vehicle);
    return this.getVehicle(vehicle.id);
  }

  unregisterVehicle(id) { return this.vehicles.delete(String(id)); }
  getVehicle(id) { const v = this.vehicles.get(String(id)); return v ? { ...v } : null; }

  /**
   * Calculate road grip and braking. Call once per frame or physics tick.
   * road: { wetness:0..1, dust:0..1, looseGravel:0..1, surface:'asphalt'|'rough'|'sand' }
   * controls: { brake:0..1, throttle:0..1, steering:-1..1 }
   */
  evaluateRoad(id, input = {}) {
    const v = this.#require(id);
    const speed = Math.max(0, finite(input.speed));
    const dt = clamp(input.dt ?? 1 / 60, 0.001, 0.1);
    const road = input.road || {};
    const wetness = clamp(road.wetness ?? 0, 0, 1);
    const dust = clamp(road.dust ?? 0, 0, 1);
    const gravel = clamp(road.looseGravel ?? 0, 0, 1);
    const rough = road.surface === 'rough' ? 0.14 : road.surface === 'sand' ? 0.24 : 0;
    const grip = clamp(v.grip * v.tyreHealth * (1 - wetness * 0.42) * (1 - dust * 0.12) * (1 - gravel * 0.28) * (1 - rough), 0.18, 1.15);
    const steering = clamp(input.controls?.steering ?? 0, -1, 1);
    const brake = clamp(input.controls?.brake ?? 0, 0, 1);
    const turnRisk = Math.abs(steering) * (speed / 18) * (1.05 - v.stability * 0.38) / grip;
    const slide = clamp((turnRisk - 0.28) * 0.82, 0, 1);
    const maxDeceleration = v.brake * grip * (0.35 + 0.65 * v.tyreHealth);
    const brakingDeceleration = brake * maxDeceleration;
    const brakingDistance = speed * speed / Math.max(0.1, 2 * maxDeceleration);
    v.traction = grip;
    v.yawInstability = lerp(v.yawInstability, slide, clamp(dt * 4, 0, 1));
    return {
      vehicleId: v.id, grip, wetness, dust, slide, turnRisk,
      brakingDeceleration, brakingDistance, recommendedSpeed: this.recommendedSpeed(v.id, { wetness, dust, surface: road.surface }),
      tractionLost: slide > 0.35, dt,
    };
  }

  recommendedSpeed(id, road = {}) {
    const v = this.#require(id);
    const base = v.type === 'motorcycle' ? 15 : v.type === 'keke' ? 12 : v.type === 'bus' ? 10 : v.type === 'truck' ? 9 : 17;
    const wet = clamp(road.wetness ?? 0, 0, 1);
    const dust = clamp(road.dust ?? 0, 0, 1);
    const surfacePenalty = road.surface === 'rough' ? 0.76 : road.surface === 'sand' ? 0.62 : 1;
    return Math.max(3, base * (1 - wet * 0.3) * (1 - dust * 0.12) * surfacePenalty * (0.7 + v.tyreHealth * 0.3));
  }

  /** Apply a pothole impact to suspension and vehicle health. */
  hitPothole(id, impact = {}) {
    const v = this.#require(id);
    const speed = Math.max(0, finite(impact.speed));
    const severity = clamp(impact.severity ?? 0.5, 0, 1);
    const depth = clamp(impact.depth ?? severity, 0, 1);
    const dt = clamp(impact.dt ?? 1 / 60, 0.001, 0.1);
    const energy = (speed * speed / Math.max(100, v.mass)) * severity * (0.7 + depth) * this.options.potholeImpactScale;
    const suspensionImpulse = clamp(energy * (1.3 - v.suspension * 0.55), 0, 2.5);
    v.suspensionVelocity += suspensionImpulse;
    const damage = clamp((speed / 18) * severity * (1.15 - v.suspension * 0.45) * 9, 0, 18);
    v.tyreHealth = clamp(v.tyreHealth - damage * 0.003, 0.35, 1);
    v.damage = clamp(v.damage + damage * 0.12, 0, v.maxDamage);
    const result = { vehicleId: v.id, suspensionImpulse, damage, tyreHealth: v.tyreHealth, speedPenalty: clamp(severity * speed * 0.08, 0, speed * 0.35), shake: clamp(suspensionImpulse * 0.7, 0, 1) };
    v.lastImpact = { type: 'pothole', ...result };
    this.#emit('pothole-impact', result);
    this.updateSuspension(id, dt);
    return result;
  }

  /** Spring-damper response; use returned offset to animate the vehicle body. */
  updateSuspension(id, dt = 1 / 60) {
    const v = this.#require(id);
    dt = clamp(dt, 0.001, 0.1);
    const stiffness = 18 + v.suspension * 26;
    const damping = 5 + v.suspension * 8;
    const acceleration = -stiffness * v.suspensionOffset - damping * v.suspensionVelocity;
    v.suspensionVelocity += acceleration * dt;
    v.suspensionOffset += v.suspensionVelocity * dt;
    if (Math.abs(v.suspensionOffset) < 0.0005 && Math.abs(v.suspensionVelocity) < 0.005) {
      v.suspensionOffset = 0; v.suspensionVelocity = 0;
    }
    return { offset: v.suspensionOffset, velocity: v.suspensionVelocity, bodyPitch: clamp(-v.suspensionOffset * 0.08, -0.12, 0.12) };
  }

  /**
   * Resolve a detected collision into consequences; does not detect collisions itself.
   * impact: { relativeSpeed, angle:0..180, otherMass, obstacle:'vehicle'|'goat'|'pedestrian'|'barrier'|'static', playerAtFault }
   */
  resolveCollision(id, impact = {}) {
    const v = this.#require(id);
    const relativeSpeed = Math.max(0, finite(impact.relativeSpeed));
    const otherMass = Math.max(1, finite(impact.otherMass, 250));
    const angle = clamp(impact.angle ?? 0, 0, 180);
    const obstacle = impact.obstacle || 'vehicle';
    const angleFactor = angle < 35 ? 1 : angle < 90 ? 0.78 : 0.48;
    const massFactor = clamp(Math.sqrt(otherMass / v.mass), 0.35, 2.2);
    const vulnerability = v.type === 'motorcycle' ? 1.65 : v.type === 'keke' ? 1.2 : v.type === 'car' ? 0.8 : 0.65;
    const severity = clamp(relativeSpeed / 16 * angleFactor * massFactor * vulnerability, 0, 2.5);
    const damage = clamp(severity * 22 * this.options.collisionDamageScale, 0, v.maxDamage - v.damage);
    const speedLoss = clamp(relativeSpeed * (0.18 + severity * 0.16), 0, relativeSpeed * 0.8);
    const injuryRisk = clamp(severity * (obstacle === 'pedestrian' ? 0.78 : obstacle === 'goat' ? 0.12 : v.type === 'motorcycle' ? 0.42 : 0.2), 0, 1);
    v.damage = clamp(v.damage + damage, 0, v.maxDamage);
    v.engineHealth = clamp(v.engineHealth - severity * 0.025, 0.25, 1);
    v.tyreHealth = clamp(v.tyreHealth - severity * 0.035, 0.2, 1);
    v.collisionCount += 1;
    v.yawInstability = clamp(v.yawInstability + severity * 0.22, 0, 1);
    const result = {
      vehicleId: v.id, obstacle, severity, damage, totalDamage: v.damage,
      speedLoss, injuryRisk, needsRepair: v.damage >= v.maxDamage * 0.65,
      engineHealth: v.engineHealth, tyreHealth: v.tyreHealth,
      playerAtFault: Boolean(impact.playerAtFault), collisionCount: v.collisionCount,
      recommendation: injuryRisk > 0.55 ? 'stop-and-check' : v.damage > 25 ? 'inspect-vehicle' : 'continue-cautiously',
    };
    v.lastImpact = { type: 'collision', ...result };
    this.#emit('collision-resolved', result);
    return result;
  }

  /** Service costs are estimates; connect to the game's authoritative wallet. */
  getRepairEstimate(id) {
    const v = this.#require(id);
    const rates = { keke: 95, motorcycle: 70, car: 180, bus: 260, truck: 300 };
    return Math.round(v.damage * (rates[v.type] || 95) + (1 - v.tyreHealth) * 3500 + (1 - v.engineHealth) * 5000);
  }

  repair(id, amount = Infinity) {
    const v = this.#require(id);
    const estimate = this.getRepairEstimate(id);
    const paid = Math.min(estimate, Math.max(0, finite(amount, estimate)));
    if (paid <= 0 || estimate <= 0) return { paid: 0, remaining: estimate, vehicle: this.getVehicle(id) };
    const fraction = clamp(paid / estimate, 0, 1);
    v.damage = Math.max(0, v.damage * (1 - fraction));
    v.tyreHealth = lerp(v.tyreHealth, 1, fraction);
    v.engineHealth = lerp(v.engineHealth, 1, fraction);
    return { paid, remaining: this.getRepairEstimate(id), vehicle: this.getVehicle(id) };
  }

  getSnapshot() {
    return { version: 1, vehicles: [...this.vehicles.values()].map(v => ({ ...v })) };
  }

  restoreSnapshot(snapshot = {}) {
    if (!Array.isArray(snapshot.vehicles)) throw new Error('Invalid road physics snapshot');
    this.vehicles.clear();
    for (const raw of snapshot.vehicles) {
      if (!raw || raw.id == null) continue;
      const registered = this.registerVehicle(raw.id, raw.type, raw);
      const v = this.vehicles.get(registered.id);
      for (const key of ['damage', 'suspensionVelocity', 'suspensionOffset', 'yawInstability', 'traction', 'engineHealth', 'tyreHealth', 'collisionCount', 'lastImpact']) {
        if (raw[key] !== undefined) v[key] = raw[key];
      }
    }
    return this.getSnapshot();
  }

  #require(id) { const v = this.vehicles.get(String(id)); if (!v) throw new Error(`Unknown vehicle: ${id}`); return v; }
  #emit(type, payload) { if (typeof this.options.emit === 'function') this.options.emit(type, payload); }
}

export default KanoRoadPhysicsDirector;
