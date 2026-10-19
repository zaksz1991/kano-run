/**
 * Kano Life — Systemic Event Director
 * Additive gameplay-event scheduler for a Kano-inspired transport simulation.
 * Framework-agnostic: connect callbacks to the existing Three.js game systems.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const pick = (items, rng = Math.random) => items[Math.floor(rng() * items.length)];

const DEFAULT_EVENTS = [
  { id: 'passenger_demand', weight: 24, cooldown: 22, minDistance: 35, maxDistance: 100 },
  { id: 'fuel_reminder', weight: 12, cooldown: 35, minDistance: 0, maxDistance: 1 },
  { id: 'karota_checkpoint', weight: 10, cooldown: 55, minDistance: 70, maxDistance: 160 },
  { id: 'road_hazard', weight: 18, cooldown: 18, minDistance: 25, maxDistance: 90 },
  { id: 'market_congestion', weight: 14, cooldown: 28, minDistance: 30, maxDistance: 110 },
  { id: 'fare_negotiation', weight: 14, cooldown: 25, minDistance: 0, maxDistance: 1 },
  { id: 'rest_opportunity', weight: 8, cooldown: 60, minDistance: 0, maxDistance: 1 },
];

export class KanoSystemicEventDirector {
  constructor(options = {}) {
    this.rng = options.rng || Math.random;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.events = (options.events || DEFAULT_EVENTS).map(e => ({ ...e }));
    this.cooldowns = new Map();
    this.elapsed = 0;
    this.enabled = options.enabled !== false;
    this.minInterval = Math.max(3, options.minInterval ?? 8);
    this.maxInterval = Math.max(this.minInterval, options.maxInterval ?? 17);
    this.nextEventAt = this.randomInterval();
    this.lastEvent = null;
    this.sequence = 0;
    this.context = {};
  }

  randomInterval() { return this.minInterval + this.rng() * (this.maxInterval - this.minInterval); }

  setEnabled(enabled) { this.enabled = Boolean(enabled); }

  setContext(context = {}) {
    this.context = {
      speed: Math.max(0, Number(context.speed) || 0),
      fuel: clamp(Number.isFinite(context.fuel) ? context.fuel : 100, 0, 100),
      money: Math.max(0, Number(context.money) || 0),
      hunger: clamp(Number(context.hunger) || 0, 0, 100),
      fatigue: clamp(Number(context.fatigue) || 0, 0, 100),
      distance: Math.max(0, Number(context.distance) || 0),
      routeId: context.routeId || 'kano-central',
      shiftActive: context.shiftActive !== false,
      ...context,
    };
  }

  update(deltaSeconds, context) {
    if (!this.enabled) return;
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
    this.elapsed += dt;
    if (context) this.setContext(context);
    for (const [id, end] of this.cooldowns) if (this.elapsed >= end) this.cooldowns.delete(id);
    if (!this.context.shiftActive || this.elapsed < this.nextEventAt) return;
    const candidates = this.getEligibleEvents();
    this.nextEventAt = this.elapsed + this.randomInterval();
    if (!candidates.length) return;
    const total = candidates.reduce((sum, event) => sum + Math.max(0, event.weight), 0);
    if (!total) return;
    let roll = this.rng() * total;
    let chosen = candidates[candidates.length - 1];
    for (const event of candidates) {
      roll -= Math.max(0, event.weight);
      if (roll <= 0) { chosen = event; break; }
    }
    this.dispatch(chosen);
  }

  getEligibleEvents() {
    return this.events.filter(event => {
      if (this.cooldowns.has(event.id)) return false;
      if (event.id === 'fuel_reminder' && this.context.fuel > 25) return false;
      if (event.id === 'rest_opportunity' && this.context.fatigue < 55 && this.context.hunger < 55) return false;
      if (event.id === 'fare_negotiation' && this.context.speed > 2) return false;
      if (event.id === 'passenger_demand' && this.context.speed > 12) return false;
      if (event.requires && !event.requires(this.context)) return false;
      return true;
    });
  }

  dispatch(definition, payload = {}) {
    const event = {
      id: definition.id,
      eventId: `KANO-EVT-${++this.sequence}`,
      time: this.elapsed,
      routeId: this.context.routeId,
      ...payload,
    };
    this.cooldowns.set(definition.id, this.elapsed + Math.max(0, definition.cooldown || 0));
    this.lastEvent = event;
    try { this.onEvent(event, this.context); } catch (error) {
      // An optional UI/audio callback must not crash the simulation.
      if (typeof console !== 'undefined' && console.error) console.error('[KanoSystemicEventDirector] onEvent failed:', error);
    }
    return event;
  }

  trigger(id, payload = {}) {
    const definition = this.events.find(event => event.id === id);
    if (!definition) return null;
    return this.dispatch(definition, payload);
  }

  getSnapshot() {
    return {
      enabled: this.enabled,
      elapsed: this.elapsed,
      nextEventIn: Math.max(0, this.nextEventAt - this.elapsed),
      lastEvent: this.lastEvent ? { ...this.lastEvent } : null,
      activeCooldowns: [...this.cooldowns.entries()].map(([id, end]) => ({ id, remaining: Math.max(0, end - this.elapsed) })),
    };
  }

  reset() {
    this.cooldowns.clear();
    this.elapsed = 0;
    this.sequence = 0;
    this.lastEvent = null;
    this.nextEventAt = this.randomInterval();
  }
}

export const KANO_EVENT_COPY = Object.freeze({
  passenger_demand: { title: 'Passenger nearby', message: 'A passenger is waiting by the roadside.', action: 'Slow down and stop safely.' },
  fuel_reminder: { title: 'Fuel running low', message: 'Your fuel is getting low.', action: 'Look for a fuel station.' },
  karota_checkpoint: { title: 'KAROTA checkpoint ahead', message: 'A transport checkpoint is approaching.', action: 'Reduce speed and follow the checkpoint rules.' },
  road_hazard: { title: 'Road hazard', message: 'Watch for potholes and uneven road surfaces.', action: 'Steer carefully and reduce speed.' },
  market_congestion: { title: 'Busy market road', message: 'Pedestrians and vehicles may slow traffic.', action: 'Keep a safe distance.' },
  fare_negotiation: { title: 'Fare negotiation', message: 'A passenger wants to discuss the fare.', action: 'Choose a fair fare before starting the trip.' },
  rest_opportunity: { title: 'Take a break', message: 'You could use a meal or a short rest.', action: 'Find a safe place to stop.' },
});
