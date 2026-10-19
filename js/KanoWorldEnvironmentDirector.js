/**
 * Kano Life — World Environment Director
 * Standalone simulation director for market congestion, pedestrians, goats,
 * roadside parking, flyovers, KAROTA checkpoints and shared road conditions.
 * This module provides simulation state/events; the host Three.js game renders
 * entities and remains authoritative for movement and collision physics.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const EVENT_TEMPLATES = {
  marketRush: { label: 'Market Rush', duration: 90, traffic: 1.35, pedestrians: 1.6, demand: 1.45, risk: 1.2 },
  schoolClosing: { label: 'School Closing Time', duration: 55, traffic: 1.15, pedestrians: 1.7, demand: 1.2, risk: 1.25 },
  rainBurst: { label: 'Rain Burst', duration: 70, traffic: 1.08, pedestrians: 0.85, demand: 1.18, risk: 1.5 },
  weddingConvoy: { label: 'Wedding Convoy', duration: 65, traffic: 1.22, pedestrians: 1.12, demand: 1.25, risk: 1.55 },
  checkpoint: { label: 'KAROTA Checkpoint', duration: 45, traffic: 1.3, pedestrians: 1, demand: 0.95, risk: 1.12 },
  quietPeriod: { label: 'Quiet Period', duration: 75, traffic: 0.72, pedestrians: 0.78, demand: 0.78, risk: 0.8 },
};

export class KanoWorldEnvironmentDirector {
  constructor(options = {}) {
    this.options = { maxActors: 90, eventChancePerMinute: 0.22, persist: true, storageKey: 'kano-life-world-environment-v1', ...options };
    this.clock = 0;
    this.dayPhase = options.dayPhase || 'morning';
    this.weather = options.weather || 'clear';
    this.activeEvents = [];
    this.actors = new Map();
    this.roadSegments = new Map();
    this.listeners = new Map();
    this.nextEventCheck = 60;
    this.stats = { eventsStarted: 0, eventsEnded: 0, pedestriansSpawned: 0, hazardsResolved: 0, checkpointStops: 0 };
    this.random = options.random || Math.random;
    if (options.autoLoad !== false) this.load();
  }

  on(eventName, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(callback);
    return () => this.listeners.get(eventName)?.delete(callback);
  }

  emit(eventName, payload = {}) {
    for (const fn of this.listeners.get(eventName) || []) {
      try { fn(payload); } catch (error) { if (typeof console !== 'undefined') console.error('[KanoWorldEnvironmentDirector]', error); }
    }
  }

  setDayPhase(phase) {
    const allowed = ['dawn', 'morning', 'afternoon', 'evening', 'night'];
    if (!allowed.includes(phase)) throw new Error(`Unsupported day phase: ${phase}`);
    this.dayPhase = phase;
    this.emit('dayPhaseChanged', { phase, modifiers: this.getWorldState().modifiers });
    this.save();
  }

  setWeather(weather) {
    const allowed = ['clear', 'rain', 'dust', 'harmattan'];
    if (!allowed.includes(weather)) throw new Error(`Unsupported weather: ${weather}`);
    const previous = this.weather;
    this.weather = weather;
    this.emit('weatherChanged', { previous, weather, modifiers: this.getWorldState().modifiers });
    this.save();
  }

  registerRoadSegment(segment) {
    if (!segment || !segment.id) throw new Error('Road segment requires a unique id');
    const record = {
      id: String(segment.id), type: segment.type || 'street', name: segment.name || segment.id,
      marketDensity: clamp(Number(segment.marketDensity ?? 0), 0, 1), pedestrianDensity: clamp(Number(segment.pedestrianDensity ?? 0.2), 0, 1),
      potholeRisk: clamp(Number(segment.potholeRisk ?? 0.1), 0, 1), parkingObstruction: clamp(Number(segment.parkingObstruction ?? 0), 0, 1),
      flyover: Boolean(segment.flyover), checkpoint: Boolean(segment.checkpoint), safeCrossing: Boolean(segment.safeCrossing),
      speedLimit: clamp(Number(segment.speedLimit ?? 45), 10, 100), metadata: segment.metadata || {},
    };
    this.roadSegments.set(record.id, record);
    this.emit('roadSegmentRegistered', { segment: { ...record } });
    return { ...record };
  }

  removeRoadSegment(segmentId) { return this.roadSegments.delete(String(segmentId)); }

  spawnActor(type, data = {}) {
    const allowed = ['pedestrian', 'goat', 'roadsideSeller', 'parkedVehicle', 'marketStall', 'karotaOfficer'];
    if (!allowed.includes(type)) throw new Error(`Unsupported environment actor: ${type}`);
    if (this.actors.size >= this.options.maxActors) {
      const removable = [...this.actors.values()].find((actor) => actor.transient && actor.state !== 'interacting');
      if (removable) this.actors.delete(removable.id); else return null;
    }
    const actor = {
      id: data.id || id(type), type, segmentId: data.segmentId ? String(data.segmentId) : null,
      lane: Number.isFinite(data.lane) ? clamp(data.lane, -1, 1) : Math.round(this.random() * 2 - 1),
      distance: Number.isFinite(data.distance) ? data.distance : 15 + this.random() * 45,
      state: data.state || this.initialActorState(type), mood: data.mood || pick(['calm', 'busy', 'cautious']),
      speed: Number.isFinite(data.speed) ? data.speed : this.actorSpeed(type), risk: clamp(Number(data.risk ?? this.actorRisk(type)), 0, 1),
      transient: data.transient !== false, createdAt: this.clock, expiresAt: Number.isFinite(data.ttl) ? this.clock + data.ttl : null,
      metadata: data.metadata || {},
    };
    this.actors.set(actor.id, actor);
    if (type === 'pedestrian') this.stats.pedestriansSpawned++;
    this.emit('actorSpawned', { actor: { ...actor } });
    return { ...actor };
  }

  initialActorState(type) {
    return ({ pedestrian: 'walking', goat: 'wandering', roadsideSeller: 'selling', parkedVehicle: 'parked', marketStall: 'operating', karotaOfficer: 'monitoring' })[type] || 'idle';
  }
  actorSpeed(type) { return ({ pedestrian: 1.2, goat: 1.5, roadsideSeller: 0, parkedVehicle: 0, marketStall: 0, karotaOfficer: 0 })[type] ?? 1; }
  actorRisk(type) { return ({ pedestrian: 0.55, goat: 0.7, roadsideSeller: 0.2, parkedVehicle: 0.35, marketStall: 0.3, karotaOfficer: 0.25 })[type] ?? 0.3; }

  despawnActor(actorId, reason = 'cleared') {
    const actor = this.actors.get(String(actorId));
    if (!actor) return false;
    this.actors.delete(String(actorId));
    this.emit('actorDespawned', { actor: { ...actor }, reason });
    return true;
  }

  startEvent(type, data = {}) {
    const template = EVENT_TEMPLATES[type];
    if (!template) throw new Error(`Unsupported world event: ${type}`);
    const event = { id: id('event'), type, label: template.label, startAt: this.clock,
      endAt: this.clock + Math.max(5, Number(data.duration ?? template.duration)),
      segmentId: data.segmentId ? String(data.segmentId) : null,
      modifiers: { traffic: template.traffic, pedestrians: template.pedestrians, demand: template.demand, risk: template.risk, ...(data.modifiers || {}) },
      metadata: data.metadata || {} };
    this.activeEvents.push(event);
    this.stats.eventsStarted++;
    this.emit('worldEventStarted', { event: { ...event }, worldState: this.getWorldState() });
    this.save();
    return { ...event };
  }

  endEvent(eventId, reason = 'completed') {
    const index = this.activeEvents.findIndex((event) => event.id === eventId);
    if (index < 0) return false;
    const [event] = this.activeEvents.splice(index, 1);
    this.stats.eventsEnded++;
    this.emit('worldEventEnded', { event: { ...event }, reason, worldState: this.getWorldState() });
    this.save();
    return true;
  }

  maybeStartEvent() {
    if (this.clock < this.nextEventCheck) return;
    this.nextEventCheck = this.clock + 60;
    if (this.random() > this.options.eventChancePerMinute) return;
    const candidates = Object.keys(EVENT_TEMPLATES).filter((type) => !this.activeEvents.some((event) => event.type === type));
    if (!candidates.length) return;
    const phaseWeights = {
      dawn: ['quietPeriod', 'marketRush'], morning: ['marketRush', 'schoolClosing', 'checkpoint'],
      afternoon: ['marketRush', 'schoolClosing', 'rainBurst'], evening: ['weddingConvoy', 'marketRush', 'checkpoint'], night: ['weddingConvoy', 'quietPeriod', 'rainBurst'],
    };
    const preferred = (phaseWeights[this.dayPhase] || candidates).filter((type) => candidates.includes(type));
    this.startEvent(pick(preferred.length ? preferred : candidates));
  }

  update(deltaSeconds) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 1);
    if (!dt) return this.getWorldState();
    this.clock += dt;
    for (const event of [...this.activeEvents]) if (this.clock >= event.endAt) this.endEvent(event.id, 'duration-ended');
    for (const actor of [...this.actors.values()]) {
      if (actor.expiresAt !== null && this.clock >= actor.expiresAt) { this.despawnActor(actor.id, 'expired'); continue; }
      if (actor.type === 'pedestrian' && actor.state === 'walking') actor.distance = Math.max(-5, actor.distance - actor.speed * dt);
      if (actor.type === 'goat' && actor.state === 'wandering' && this.random() < dt * 0.08) {
        actor.lane = clamp(actor.lane + (this.random() < 0.5 ? -1 : 1), -1, 1);
        this.emit('actorBehaviourChanged', { actor: { ...actor }, behaviour: 'goat-changed-lane' });
      }
    }
    this.maybeStartEvent();
    return this.getWorldState();
  }

  getWorldState(segmentId = null) {
    const events = this.activeEvents.filter((event) => !event.segmentId || !segmentId || event.segmentId === String(segmentId));
    const segment = segmentId ? this.roadSegments.get(String(segmentId)) : null;
    const multiply = (key) => events.reduce((value, event) => value * Number(event.modifiers[key] ?? 1), 1);
    const weatherSpeed = this.weather === 'rain' ? 0.72 : this.weather === 'dust' ? 0.82 : this.weather === 'harmattan' ? 0.88 : 1;
    const phaseTraffic = ({ dawn: 0.75, morning: 1.18, afternoon: 1.05, evening: 1.28, night: 0.72 })[this.dayPhase] || 1;
    const segmentRisk = segment ? 1 + segment.potholeRisk * 0.55 + segment.parkingObstruction * 0.7 + segment.marketDensity * 0.35 : 1;
    return {
      clock: this.clock, dayPhase: this.dayPhase, weather: this.weather,
      activeEvents: events.map((event) => ({ ...event })),
      modifiers: {
        traffic: multiply('traffic') * phaseTraffic,
        pedestrianDensity: clamp((segment?.pedestrianDensity ?? 0.25) * multiply('pedestrians') * (this.weather === 'rain' ? 0.8 : 1), 0, 2),
        passengerDemand: multiply('demand') * (this.weather === 'rain' ? 1.12 : 1),
        roadRisk: multiply('risk') * segmentRisk,
        safeSpeedMultiplier: weatherSpeed * (segment?.flyover ? 1.05 : 1) / Math.max(1, segmentRisk * 0.72),
        marketDensity: segment?.marketDensity ?? 0,
        parkingObstruction: segment?.parkingObstruction ?? 0,
        potholeRisk: segment?.potholeRisk ?? 0,
        checkpointActive: Boolean(segment?.checkpoint || events.some((event) => event.type === 'checkpoint')),
        flyover: Boolean(segment?.flyover),
      },
      actorCount: this.actors.size, stats: { ...this.stats },
    };
  }

  getActors(filter = {}) {
    return [...this.actors.values()].filter((actor) => (!filter.type || actor.type === filter.type) && (!filter.segmentId || actor.segmentId === String(filter.segmentId))).map((actor) => ({ ...actor, metadata: { ...actor.metadata } }));
  }

  assessCheckpoint(driver = {}) {
    const violations = [];
    if (Number(driver.speed || 0) > Number(driver.speedLimit || 45) + 8) violations.push('speeding');
    if (driver.passengerOverload) violations.push('passenger-overload');
    if (driver.noHelmet && driver.motorcycle) violations.push('helmet-violation');
    if (driver.dangerousDriving) violations.push('dangerous-driving');
    this.stats.checkpointStops++;
    const result = { stopped: true, violations, fineMultiplier: violations.length ? 1 + violations.length * 0.35 : 0, cleanPass: violations.length === 0, assessedAt: this.clock };
    this.emit('checkpointAssessed', result);
    this.save();
    return result;
  }

  resolveHazard(actorId, outcome = 'avoided') {
    const actor = this.actors.get(String(actorId));
    if (!actor) return { ok: false, reason: 'actor-not-found' };
    const valid = ['avoided', 'near-miss', 'collision', 'helped'];
    if (!valid.includes(outcome)) throw new Error(`Unsupported hazard outcome: ${outcome}`);
    this.stats.hazardsResolved++;
    const result = { ok: true, actorId: actor.id, actorType: actor.type, outcome,
      reputationDelta: outcome === 'helped' ? 2 : outcome === 'avoided' ? 0.2 : outcome === 'near-miss' ? -1 : -5,
      damageRisk: outcome === 'collision' ? actor.risk : outcome === 'near-miss' ? actor.risk * 0.25 : 0 };
    if (outcome === 'collision') actor.state = 'disturbed';
    this.emit('hazardResolved', result);
    this.save();
    return result;
  }

  save() {
    if (!this.options.persist || typeof localStorage === 'undefined') return false;
    try { localStorage.setItem(this.options.storageKey, JSON.stringify(this.exportState())); return true; }
    catch (error) { this.emit('storageError', { operation: 'save', message: error.message }); return false; }
  }

  load() {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(this.options.storageKey);
      if (!raw) return false;
      this.importState(JSON.parse(raw));
      return true;
    } catch (error) { this.emit('storageError', { operation: 'load', message: error.message }); return false; }
  }

  exportState() {
    return { version: 1, clock: this.clock, dayPhase: this.dayPhase, weather: this.weather,
      activeEvents: this.activeEvents.map((event) => ({ ...event, modifiers: { ...event.modifiers } })),
      actors: this.getActors(), roadSegments: [...this.roadSegments.values()].map((segment) => ({ ...segment })),
      stats: { ...this.stats }, nextEventCheck: this.nextEventCheck };
  }

  importState(state) {
    if (!state || state.version !== 1) throw new Error('Unsupported world environment save version');
    this.clock = Math.max(0, Number(state.clock) || 0);
    this.dayPhase = ['dawn', 'morning', 'afternoon', 'evening', 'night'].includes(state.dayPhase) ? state.dayPhase : 'morning';
    this.weather = ['clear', 'rain', 'dust', 'harmattan'].includes(state.weather) ? state.weather : 'clear';
    this.activeEvents = Array.isArray(state.activeEvents) ? state.activeEvents.map((event) => ({ ...event, modifiers: { ...event.modifiers } })) : [];
    this.actors.clear();
    for (const actor of (Array.isArray(state.actors) ? state.actors : []).slice(0, this.options.maxActors)) this.actors.set(actor.id, { ...actor });
    this.roadSegments.clear();
    for (const segment of Array.isArray(state.roadSegments) ? state.roadSegments : []) this.registerRoadSegment(segment);
    this.stats = { ...this.stats, ...(state.stats || {}) };
    this.nextEventCheck = Number(state.nextEventCheck) || this.clock + 60;
    this.emit('stateImported', { clock: this.clock, actorCount: this.actors.size });
    return this.getWorldState();
  }
}

export { EVENT_TEMPLATES };
