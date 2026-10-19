import * as THREE from 'three';

/**
 * Kano Life — Living Driver AI Director
 * Decision layer for existing traffic actors; it does not spawn models or
 * replace the game's physics, collision system, renderer, or animation loop.
 *
 * Actor adapter expected:
 * { id, root: THREE.Object3D, kind: 'keke'|'motorcycle'|'car', lane,
 *   speed, maxSpeed, personality, targetPassenger?, convoyId?, active }
 *
 * Call update(dt, context) from the game's existing update loop, then apply
 * returned steering/throttle/brake/lane targets through your existing vehicle
 * controller. Never directly set a physics body's transform from this module.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.floor(Math.random() * items.length)];

const PERSONALITIES = {
  professional: { patience: 0.85, aggression: 0.12, passengerFocus: 0.85, horn: 0.2, risk: 0.1 },
  impatient:    { patience: 0.25, aggression: 0.62, passengerFocus: 0.6, horn: 0.75, risk: 0.48 },
  showoff:      { patience: 0.3, aggression: 0.78, passengerFocus: 0.45, horn: 0.85, risk: 0.78 },
  hustler:      { patience: 0.55, aggression: 0.42, passengerFocus: 0.95, horn: 0.45, risk: 0.3 },
  cautious:     { patience: 0.9, aggression: 0.08, passengerFocus: 0.55, horn: 0.15, risk: 0.05 },
  novice:       { patience: 0.5, aggression: 0.25, passengerFocus: 0.5, horn: 0.35, risk: 0.32 },
};

export class KanoLivingDriverAIDirector {
  constructor(options = {}) {
    this.options = {
      decisionInterval: 0.35,
      detectionRadius: 32,
      passengerRadius: 13,
      safeFollowingDistance: 7,
      maxActors: 48,
      marketDemand: 0.5,
      karotaAlert: false,
      ...options,
    };
    this.actors = new Map();
    this.passengers = new Map();
    this.convoys = new Map();
    this.accumulator = 0;
    this.time = 0;
    this.lastDecisions = 0;
    this.disposed = false;
    this.events = new Map();
    this.pendingEvents = [];
  }

  on(eventName, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    if (!this.events.has(eventName)) this.events.set(eventName, new Set());
    this.events.get(eventName).add(callback);
    return () => this.events.get(eventName)?.delete(callback);
  }

  emit(name, detail) {
    for (const callback of this.events.get(name) || []) {
      try { callback(detail); } catch (error) { console.error(`[KanoDriverAI:${name}]`, error); }
    }
  }

  registerActor(actor) {
    if (!actor?.id || !actor.root?.isObject3D) throw new TypeError('Actor requires a unique id and THREE.Object3D root');
    const previous = this.actors.get(actor.id);
    const profile = PERSONALITIES[actor.personality] ? actor.personality : 'professional';
    this.actors.set(actor.id, {
      ...actor,
      personality: profile,
      active: actor.active !== false,
      speed: Math.max(0, Number(actor.speed) || 0),
      maxSpeed: Math.max(4, Number(actor.maxSpeed) || (actor.kind === 'motorcycle' ? 15 : 11)),
      lane: Number.isFinite(actor.lane) ? actor.lane : 0,
      decisionTimer: previous?.decisionTimer ?? rand(0, this.options.decisionInterval),
      targetLane: previous?.targetLane ?? (Number.isFinite(actor.lane) ? actor.lane : 0),
      throttle: 0,
      brake: 0,
      steering: 0,
      desiredSpeed: 0,
      state: 'cruise',
      hornCooldown: 0,
      mood: actor.mood || 'neutral',
      lastTargetId: null,
    });
    return this.actors.get(actor.id);
  }

  unregisterActor(id) { return this.actors.delete(id); }

  registerPassenger(passenger) {
    if (!passenger?.id || !passenger.position) throw new TypeError('Passenger requires id and position');
    const position = passenger.position.isVector3 ? passenger.position.clone() : new THREE.Vector3(passenger.position.x || 0, passenger.position.y || 0, passenger.position.z || 0);
    this.passengers.set(passenger.id, { ...passenger, position, waiting: passenger.waiting !== false, groupSize: clamp(passenger.groupSize || 1, 1, 6), waited: passenger.waited || 0 });
  }
  updatePassengerPosition(id, position) {
    const p = this.passengers.get(id);
    if (!p || !position) return false;
    p.position.copy(position.isVector3 ? position : new THREE.Vector3(position.x || 0, position.y || 0, position.z || 0));
    return true;
  }
  removePassenger(id) { return this.passengers.delete(id); }

  registerConvoy(convoyId, actorIds, options = {}) {
    if (!convoyId || !Array.isArray(actorIds)) throw new TypeError('Convoy requires an id and actorIds array');
    const convoy = { id: convoyId, actorIds: [...new Set(actorIds)], active: true, formation: options.formation || 'loose', speedLimit: options.speedLimit || 9, createdAt: this.time };
    this.convoys.set(convoyId, convoy);
    for (const id of convoy.actorIds) { const actor = this.actors.get(id); if (actor) actor.convoyId = convoyId; }
    this.emit('convoy:registered', { ...convoy });
    return convoy;
  }
  endConvoy(id) {
    const convoy = this.convoys.get(id);
    if (!convoy) return false;
    for (const actorId of convoy.actorIds) { const actor = this.actors.get(actorId); if (actor?.convoyId === id) actor.convoyId = null; }
    this.convoys.delete(id);
    this.emit('convoy:ended', { id });
    return true;
  }

  /**
   * context: { playerPosition, marketDemand 0..1, marketZones:[{id,position,radius,demand}],
   *            karotaCheckpoints:[{id,position,radius}], pedestrians:[{id,position}],
   *            roadSpeedLimit, getLaneAvailability(actor, lane), isLaneClear(actor,lane),
   *            reportNearMiss, requestHorn }
   */
  update(dt, context = {}) {
    if (this.disposed) return [];
    const delta = clamp(Number(dt) || 0, 0, 0.1);
    this.time += delta;
    this.accumulator += delta;
    for (const passenger of this.passengers.values()) if (passenger.waiting) passenger.waited += delta;
    for (const actor of this.actors.values()) actor.hornCooldown = Math.max(0, actor.hornCooldown - delta);
    if (this.accumulator < this.options.decisionInterval) return [];
    const decisionDt = this.accumulator;
    this.accumulator = 0;
    const actors = [...this.actors.values()].filter(a => a.active).slice(0, this.options.maxActors);
    const outputs = [];
    for (const actor of actors) {
      const result = this.#decide(actor, actors, context, decisionDt);
      outputs.push(result);
    }
    this.lastDecisions = outputs.length;
    return outputs;
  }

  #decide(actor, actors, context, dt) {
    const p = PERSONALITIES[actor.personality] || PERSONALITIES.professional;
    const position = actor.root.getWorldPosition(new THREE.Vector3());
    let nearestVehicle = null, nearestVehicleDistance = Infinity;
    for (const other of actors) {
      if (other.id === actor.id || !other.root) continue;
      const d = position.distanceTo(other.root.getWorldPosition(new THREE.Vector3()));
      if (d < nearestVehicleDistance) { nearestVehicleDistance = d; nearestVehicle = other; }
    }
    const passenger = this.#findPassenger(position, actor, context);
    const checkpoint = this.#findCheckpoint(position, context);
    const market = this.#findMarket(position, context);
    let desiredSpeed = actor.maxSpeed;
    let state = 'cruise';
    let brake = 0;
    let targetLane = actor.targetLane;

    const convoy = actor.convoyId ? this.convoys.get(actor.convoyId) : null;
    if (convoy?.active) {
      desiredSpeed = Math.min(desiredSpeed, convoy.speedLimit);
      state = 'convoy';
      const index = convoy.actorIds.indexOf(actor.id);
      targetLane = clamp((index % 3) - 1, -1, 1);
      if (nearestVehicleDistance < this.options.safeFollowingDistance * 0.8) {
        desiredSpeed *= 0.72;
        brake = 0.25;
      }
    } else if (checkpoint && context.karotaAlert) {
      desiredSpeed *= actor.personality === 'showoff' ? 0.8 : 0.55;
      state = 'checkpoint';
      brake = 0.18;
    } else if (passenger && p.passengerFocus > 0.4 && !actor.convoyId) {
      desiredSpeed = Math.min(desiredSpeed, 4.5);
      state = 'seeking_passenger';
      actor.lastTargetId = passenger.id;
      if (nearestVehicleDistance > this.options.safeFollowingDistance * 1.5 && Math.random() < p.horn * 0.08 && actor.hornCooldown === 0) {
        actor.hornCooldown = 2.5;
        this.emit('driver:horn', { actorId: actor.id, passengerId: passenger.id, position });
        context.requestHorn?.(actor);
      }
    } else if (nearestVehicle && nearestVehicleDistance < this.options.safeFollowingDistance) {
      desiredSpeed *= clamp(nearestVehicleDistance / this.options.safeFollowingDistance, 0.15, 0.85);
      state = 'following';
      brake = clamp(1 - nearestVehicleDistance / this.options.safeFollowingDistance, 0, 0.85);
      if (p.aggression > 0.55 && nearestVehicleDistance > 3.5 && Math.random() < p.aggression * 0.12) {
        const candidateLane = actor.lane + (Math.random() < 0.5 ? -1 : 1);
        const laneAvailable = context.getLaneAvailability ? context.getLaneAvailability(actor, candidateLane) : true;
        const laneClear = context.isLaneClear ? context.isLaneClear(actor, candidateLane) : true;
        if (laneAvailable && laneClear) {
          targetLane = clamp(candidateLane, -1, 1);
          state = 'overtaking';
          brake = 0;
          desiredSpeed = Math.min(actor.maxSpeed * (actor.personality === 'showoff' ? 1.08 : 1), context.roadSpeedLimit || Infinity);
          this.emit('driver:overtake', { actorId: actor.id, targetActorId: nearestVehicle.id, targetLane });
        }
      }
    }

    if (market) desiredSpeed *= 1 - 0.25 * clamp(market.demand ?? context.marketDemand ?? this.options.marketDemand, 0, 1);
    if (context.roadSpeedLimit) desiredSpeed = Math.min(desiredSpeed, context.roadSpeedLimit * (actor.personality === 'showoff' ? 1.08 : 1));
    desiredSpeed = clamp(desiredSpeed, 0, actor.maxSpeed * (actor.personality === 'showoff' ? 1.08 : 1));

    const currentSpeed = Math.max(0, Number(actor.speed) || 0);
    const speedError = desiredSpeed - currentSpeed;
    const throttle = clamp(speedError * 0.32, 0, 1);
    if (speedError < -0.5) brake = Math.max(brake, clamp(-speedError * 0.18, 0.08, 1));
    const laneError = targetLane - actor.lane;
    const steering = clamp(laneError * (actor.personality === 'novice' ? 0.35 : 0.65), -1, 1);
    actor.targetLane = targetLane;
    actor.state = state;
    actor.desiredSpeed = desiredSpeed;
    actor.throttle = throttle;
    actor.brake = brake;
    actor.steering = steering;
    const output = { id: actor.id, state, desiredSpeed, throttle, brake, steering, targetLane, personality: actor.personality, targetPassengerId: state === 'seeking_passenger' ? actor.lastTargetId : null, convoyId: actor.convoyId || null };
    this.emit('driver:decision', output);
    return output;
  }

  #findPassenger(position, actor, context) {
    if (actor.convoyId) return null;
    let best = null, bestDistance = this.options.passengerRadius;
    for (const p of this.passengers.values()) {
      if (!p.waiting || p.reservedBy && p.reservedBy !== actor.id) continue;
      const d = position.distanceTo(p.position);
      if (d < bestDistance) { best = p; bestDistance = d; }
    }
    if (best && bestDistance <= this.options.passengerRadius) {
      const marketDemand = clamp(context.marketDemand ?? this.options.marketDemand, 0, 1);
      if (Math.random() < 0.25 + marketDemand * 0.6) {
        best.reservedBy = actor.id;
        this.emit('passenger:targeted', { actorId: actor.id, passengerId: best.id, distance: bestDistance });
        return best;
      }
    }
    return null;
  }

  #findCheckpoint(position, context) {
    for (const point of context.karotaCheckpoints || []) {
      if (!point.position) continue;
      const pos = point.position.isVector3 ? point.position : new THREE.Vector3(point.position.x || 0, point.position.y || 0, point.position.z || 0);
      if (position.distanceTo(pos) <= (point.radius || 20)) return point;
    }
    return null;
  }
  #findMarket(position, context) {
    for (const zone of context.marketZones || []) {
      if (!zone.position) continue;
      const pos = zone.position.isVector3 ? zone.position : new THREE.Vector3(zone.position.x || 0, zone.position.y || 0, zone.position.z || 0);
      if (position.distanceTo(pos) <= (zone.radius || 35)) return zone;
    }
    return null;
  }

  /** Call only after the existing collision system reports an incident. */
  reportIncident({ actorId, otherId = null, severity = 'minor', position = null } = {}) {
    const actor = this.actors.get(actorId);
    if (!actor) return false;
    const severityValue = severity === 'major' ? 1 : severity === 'moderate' ? 0.6 : 0.25;
    actor.speed = Math.max(0, actor.speed * (1 - severityValue));
    actor.state = 'incident';
    const incident = { actorId, otherId, severity, time: this.time, position: position?.clone?.() || position, personality: actor.personality };
    this.emit('incident:reported', incident);
    return true;
  }

  getSnapshot() {
    return { time: this.time, actorCount: this.actors.size, passengerCount: this.passengers.size, convoyCount: this.convoys.size, lastDecisions: this.lastDecisions, actors: [...this.actors.values()].map(a => ({ id: a.id, personality: a.personality, state: a.state, speed: a.speed, desiredSpeed: a.desiredSpeed, lane: a.lane, targetLane: a.targetLane })) };
  }
  dispose() {
    this.disposed = true;
    this.actors.clear(); this.passengers.clear(); this.convoys.clear(); this.events.clear(); this.pendingEvents.length = 0;
  }
}

export { PERSONALITIES as KANO_DRIVER_PERSONALITIES };
