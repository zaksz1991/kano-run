/**
 * Kano Life — Passenger Rush & Market Crowd AI
 * Dependency-free simulation director. Connect callbacks to the game's existing
 * Three.js scene, pedestrian animation, vehicle, fare, and UI systems.
 * This module deliberately does not create meshes or run its own render loop.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.floor(Math.random() * items.length)];

const DEFAULT_PERSONALITIES = {
  hurried: { patience: 0.35, fareSensitivity: 0.55, walkSpeed: 1.25 },
  calm: { patience: 0.85, fareSensitivity: 0.65, walkSpeed: 0.8 },
  bargaining: { patience: 0.65, fareSensitivity: 0.95, walkSpeed: 0.85 },
  carrying_goods: { patience: 0.7, fareSensitivity: 0.7, walkSpeed: 0.55 },
  group_leader: { patience: 0.6, fareSensitivity: 0.6, walkSpeed: 0.75 },
};

export class KanoPassengerRushDirector {
  constructor(options = {}) {
    this.options = {
      maxPassengers: options.maxPassengers ?? 36,
      maxSpawnPerMinute: options.maxSpawnPerMinute ?? 12,
      baseDemand: options.baseDemand ?? 0.35,
      marketDemandMultiplier: options.marketDemandMultiplier ?? 1.8,
      rushHourMultiplier: options.rushHourMultiplier ?? 1.35,
      mobileMaxPassengers: options.mobileMaxPassengers ?? 18,
      mobile: options.mobile ?? (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches),
      defaultFare: options.defaultFare ?? 250,
      fareTolerance: options.fareTolerance ?? 0.22,
      pickupRadius: options.pickupRadius ?? 8,
      dropoffRadius: options.dropoffRadius ?? 5,
      spawnInterval: options.spawnInterval ?? 2.5,
      callbacks: options.callbacks ?? {},
      personalityProfiles: options.personalityProfiles ?? DEFAULT_PERSONALITIES,
    };
    this.passengers = new Map();
    this.stops = new Map();
    this.nextPassengerId = 1;
    this.elapsed = 0;
    this.spawnAccumulator = 0;
    this.gameMinute = 7 * 60;
    this.paused = false;
    this.stats = { spawned: 0, boarded: 0, completed: 0, abandoned: 0, fareNegotiations: 0 };
  }

  setCallbacks(callbacks = {}) { this.options.callbacks = { ...this.options.callbacks, ...callbacks }; }

  registerStop(stop) {
    if (!stop || stop.id == null) throw new Error('Passenger stop requires an id.');
    this.stops.set(String(stop.id), {
      id: String(stop.id), x: Number(stop.x) || 0, z: Number(stop.z) || 0,
      market: Boolean(stop.market), demand: clamp(Number(stop.demand ?? 1), 0, 3),
      destinationIds: Array.isArray(stop.destinationIds) ? stop.destinationIds.map(String) : [],
      active: stop.active !== false,
    });
    return this.stops.get(String(stop.id));
  }

  removeStop(id) { return this.stops.delete(String(id)); }

  getCapacity() { return this.options.mobile ? this.options.mobileMaxPassengers : this.options.maxPassengers; }

  setGameTime(hour, minute = 0) {
    this.gameMinute = ((Math.floor(hour) * 60 + Math.floor(minute)) % 1440 + 1440) % 1440;
  }

  getDemandMultiplier(stop, context = {}) {
    let multiplier = this.options.baseDemand;
    const minute = this.gameMinute;
    const morningRush = minute >= 6 * 60 && minute <= 10 * 60;
    const eveningRush = minute >= 16 * 60 && minute <= 20 * 60;
    if (morningRush || eveningRush) multiplier *= this.options.rushHourMultiplier;
    if (stop.market && context.marketDay) multiplier *= this.options.marketDemandMultiplier;
    if (context.rain) multiplier *= 0.78;
    if (context.specialEvent) multiplier *= 1.2;
    return clamp(multiplier * stop.demand, 0.05, 3.5);
  }

  spawnAtStop(stopId, options = {}) {
    if (this.passengers.size >= this.getCapacity()) return null;
    const stop = this.stops.get(String(stopId));
    if (!stop || !stop.active) return null;
    const profileKey = options.personality || pick(Object.keys(this.options.personalityProfiles));
    const profile = this.options.personalityProfiles[profileKey] || DEFAULT_PERSONALITIES.calm;
    const destination = options.destinationId != null
      ? String(options.destinationId)
      : (stop.destinationIds.length ? pick(stop.destinationIds) : null);
    const id = `passenger-${this.nextPassengerId++}`;
    const passenger = {
      id, stopId: stop.id, destinationId: destination,
      x: stop.x + rand(-2.5, 2.5), z: stop.z + rand(-2.5, 2.5),
      state: 'waiting', personality: profileKey,
      patience: clamp(options.patience ?? profile.patience, 0.05, 1),
      fareSensitivity: clamp(options.fareSensitivity ?? profile.fareSensitivity, 0, 1),
      walkSpeed: profile.walkSpeed ?? 0.8,
      waitTime: 0, maxWait: options.maxWait ?? rand(45, 150),
      groupSize: Math.max(1, Math.floor(options.groupSize ?? 1)),
      carryingGoods: profileKey === 'carrying_goods' || Boolean(options.carryingGoods),
      offeredFare: null, vehicleId: null, createdAt: this.elapsed,
      targetX: null, targetZ: null, metadata: options.metadata ?? {},
    };
    this.passengers.set(id, passenger);
    this.stats.spawned++;
    this.emit('passengerSpawned', this.snapshot(passenger));
    return passenger;
  }

  spawnWave(context = {}) {
    const activeStops = [...this.stops.values()].filter((stop) => stop.active);
    if (!activeStops.length) return [];
    const spawned = [];
    const limit = Math.min(this.options.maxSpawnPerMinute, this.getCapacity() - this.passengers.size);
    const expected = activeStops.reduce((sum, stop) => sum + this.getDemandMultiplier(stop, context), 0) * 0.35;
    const count = Math.min(limit, Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0));
    for (let i = 0; i < count; i++) {
      const weighted = activeStops.map((stop) => ({ stop, weight: this.getDemandMultiplier(stop, context) }));
      const total = weighted.reduce((sum, item) => sum + item.weight, 0);
      let roll = Math.random() * total;
      let chosen = weighted[weighted.length - 1].stop;
      for (const item of weighted) { roll -= item.weight; if (roll <= 0) { chosen = item.stop; break; } }
      const personality = pick(Object.keys(this.options.personalityProfiles));
      const groupSize = Math.random() < 0.18 ? (Math.random() < 0.6 ? 2 : 3) : 1;
      const passenger = this.spawnAtStop(chosen.id, { personality, groupSize });
      if (passenger) spawned.push(passenger);
    }
    return spawned;
  }

  offerFare(passengerId, vehicle, fare) {
    const passenger = this.passengers.get(String(passengerId));
    if (!passenger || passenger.state !== 'waiting' || !vehicle) return { accepted: false, reason: 'unavailable' };
    const amount = Math.max(0, Math.round(Number(fare) || 0));
    const expected = Math.max(50, Number(vehicle.fareEstimate ?? this.options.defaultFare));
    const tolerance = this.options.fareTolerance + (1 - passenger.fareSensitivity) * 0.28;
    const ratio = Math.abs(amount - expected) / expected;
    this.stats.fareNegotiations++;
    passenger.offeredFare = amount;
    if (ratio <= tolerance || amount < expected) {
      passenger.state = 'boarding';
      passenger.vehicleId = String(vehicle.id ?? 'player');
      this.stats.boarded++;
      this.emit('passengerAcceptedFare', { passenger: this.snapshot(passenger), vehicleId: passenger.vehicleId, fare: amount });
      this.emit('boardingRequested', { passengerId: passenger.id, vehicleId: passenger.vehicleId, groupSize: passenger.groupSize });
      return { accepted: true, fare: amount, passenger: this.snapshot(passenger) };
    }
    const counterOffer = Math.max(50, Math.round(expected * (1 + rand(-0.08, 0.1))));
    this.emit('fareCounterOffer', { passenger: this.snapshot(passenger), vehicleId: String(vehicle.id ?? 'player'), offered: amount, counterOffer });
    return { accepted: false, reason: 'counter_offer', counterOffer };
  }

  confirmBoarded(passengerId) {
    const p = this.passengers.get(String(passengerId));
    if (!p || p.state !== 'boarding') return false;
    p.state = 'onboard'; this.emit('passengerBoarded', this.snapshot(p)); return true;
  }

  requestDropoff(passengerId, location = {}) {
    const p = this.passengers.get(String(passengerId));
    if (!p || p.state !== 'onboard') return false;
    p.state = 'alighting'; p.x = Number(location.x ?? p.x); p.z = Number(location.z ?? p.z);
    this.emit('dropoffRequested', { passenger: this.snapshot(p), x: p.x, z: p.z }); return true;
  }

  confirmDroppedOff(passengerId) {
    const p = this.passengers.get(String(passengerId));
    if (!p || p.state !== 'alighting') return false;
    p.state = 'completed'; this.stats.completed++;
    this.emit('passengerTripCompleted', { passenger: this.snapshot(p), fare: p.offeredFare ?? this.options.defaultFare });
    this.passengers.delete(p.id); return true;
  }

  abandon(passengerId, reason = 'wait_timeout') {
    const p = this.passengers.get(String(passengerId));
    if (!p || !['waiting', 'boarding'].includes(p.state)) return false;
    p.state = 'abandoned'; this.stats.abandoned++;
    this.emit('passengerAbandoned', { passenger: this.snapshot(p), reason });
    this.passengers.delete(p.id); return true;
  }

  update(deltaSeconds, context = {}) {
    if (this.paused) return;
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
    this.elapsed += dt;
    this.spawnAccumulator += dt;
    if (this.spawnAccumulator >= this.options.spawnInterval) {
      this.spawnAccumulator %= this.options.spawnInterval;
      this.spawnWave(context);
    }
    for (const p of this.passengers.values()) {
      if (p.state !== 'waiting') continue;
      p.waitTime += dt;
      if (p.waitTime >= p.maxWait) { this.abandon(p.id); continue; }
      // Optional small idle movement signal for existing pedestrian animation.
      if (Math.random() < dt * 0.12) this.emit('passengerIdleAction', { passengerId: p.id, action: pick(['look_for_keke', 'check_bag', 'gesture', 'look_at_road']) });
    }
  }

  findWaitingPassengersNear(x, z, radius = this.options.pickupRadius) {
    const r2 = radius * radius;
    return [...this.passengers.values()]
      .filter((p) => p.state === 'waiting' && (p.x - x) ** 2 + (p.z - z) ** 2 <= r2)
      .sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2))
      .map((p) => this.snapshot(p));
  }

  getStats() { return { ...this.stats, waiting: [...this.passengers.values()].filter(p => p.state === 'waiting').length, onboard: [...this.passengers.values()].filter(p => p.state === 'onboard').length, active: this.passengers.size }; }
  snapshot(p) { return { ...p, metadata: { ...p.metadata } }; }
  emit(name, payload) { const fn = this.options.callbacks?.[name]; if (typeof fn === 'function') { try { fn(payload); } catch (error) { this.options.callbacks?.onCallbackError?.({ name, error }); } } }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  clear() { this.passengers.clear(); this.stops.clear(); }
}
