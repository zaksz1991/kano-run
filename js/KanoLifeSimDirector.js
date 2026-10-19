const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const DEFAULTS = Object.freeze({
  cash: 1800, fuel: 72, hunger: 18, fatigue: 12, reputation: 50,
  day: 1, minuteOfDay: 7 * 60, passengersCompleted: 0, distanceKm: 0,
});

/** Persistent, frame-rate-independent Kano driver life simulation. No UI assumptions. */
export class KanoLifeSimDirector {
  constructor({ storageKey = 'kano-life-sim-v1', initialState = {}, onChange = () => {}, onEvent = () => {}, autosaveMs = 8000 } = {}) {
    this.storageKey = storageKey;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.autosaveMs = Math.max(1000, autosaveMs);
    this.elapsedSinceSave = 0;
    this.destroyed = false;
    let stored = {};
    try { stored = JSON.parse(globalThis.localStorage?.getItem(storageKey) || '{}') || {}; } catch { stored = {}; }
    this.state = { ...DEFAULTS, ...stored, ...initialState };
    this.state.cash = Math.max(0, Number(this.state.cash) || 0);
    this.state.fuel = clamp(Number(this.state.fuel) || 0, 0, 100);
    this.state.hunger = clamp(Number(this.state.hunger) || 0, 0, 100);
    this.state.fatigue = clamp(Number(this.state.fatigue) || 0, 0, 100);
    this.state.reputation = clamp(Number(this.state.reputation) || 0, 0, 100);
    this.activeTrip = null;
    this.emit('loaded', { state: this.snapshot() });
  }

  snapshot() { return { ...this.state, activeTrip: this.activeTrip ? { ...this.activeTrip } : null, condition: this.condition() }; }
  condition() {
    if (this.state.fuel <= 0) return 'out_of_fuel';
    if (this.state.fatigue >= 90) return 'exhausted';
    if (this.state.hunger >= 95) return 'hungry';
    return 'ready';
  }
  emit(type, detail = {}) { const payload = { type, detail, state: this.snapshot() }; try { this.onEvent(payload); } catch {} try { this.onChange(payload.state, type); } catch {} }
  save() { try { globalThis.localStorage?.setItem(this.storageKey, JSON.stringify(this.state)); return true; } catch { return false; } }

  update(dt, { speedKmh = 0, distanceKm = 0, engineRunning = true, passengerOnboard = false } = {}) {
    if (this.destroyed || !Number.isFinite(dt) || dt <= 0) return;
    const seconds = Math.min(dt, 0.25);
    const moving = Math.max(0, Number(speedKmh) || 0);
    this.state.minuteOfDay += seconds * (engineRunning ? 0.42 : 0.2);
    while (this.state.minuteOfDay >= 1440) { this.state.minuteOfDay -= 1440; this.state.day += 1; this.emit('new_day'); }
    if (engineRunning) this.state.fuel = clamp(this.state.fuel - seconds * (0.0011 + moving / 65000), 0, 100);
    if (moving > 2) {
      this.state.distanceKm += Math.max(0, Number(distanceKm) || moving * seconds / 3600);
      this.state.fatigue = clamp(this.state.fatigue + seconds * (passengerOnboard ? 0.0016 : 0.001), 0, 100);
    }
    this.state.hunger = clamp(this.state.hunger + seconds * 0.00075, 0, 100);
    this.elapsedSinceSave += seconds * 1000;
    if (this.elapsedSinceSave >= this.autosaveMs) { this.elapsedSinceSave = 0; this.save(); }
  }

  startTrip({ destination = 'Next stop', expectedFare = 0, distanceKm = 1 } = {}) {
    if (this.activeTrip) return { ok: false, reason: 'trip_in_progress' };
    if (this.condition() === 'out_of_fuel' || this.condition() === 'exhausted') return { ok: false, reason: this.condition() };
    this.activeTrip = { destination, expectedFare: Math.max(0, Number(expectedFare) || 0), distanceKm: Math.max(0.1, Number(distanceKm) || 1), startedAt: Date.now() };
    this.emit('trip_started', { ...this.activeTrip });
    return { ok: true, trip: { ...this.activeTrip } };
  }

  completeTrip({ fare, tip = 0, safe = true } = {}) {
    if (!this.activeTrip) return { ok: false, reason: 'no_active_trip' };
    const trip = this.activeTrip;
    const paid = Math.max(0, Number(fare ?? trip.expectedFare) || 0) + Math.max(0, Number(tip) || 0);
    this.state.cash += paid;
    this.state.passengersCompleted += 1;
    this.state.reputation = clamp(this.state.reputation + (safe ? 2 : -8), 0, 100);
    if (!safe) this.state.cash = Math.max(0, this.state.cash - Math.min(this.state.cash, 100));
    this.activeTrip = null;
    this.emit('trip_completed', { destination: trip.destination, paid, safe });
    this.save();
    return { ok: true, paid, state: this.snapshot() };
  }

  refuel({ litres = 10, pricePerLitre = 1000 } = {}) {
    const requested = clamp(Number(litres) || 0, 0, 100 - this.state.fuel);
    const cost = requested * Math.max(0, Number(pricePerLitre) || 0);
    if (!requested) return { ok: false, reason: 'tank_full' };
    if (this.state.cash < cost) return { ok: false, reason: 'insufficient_cash', cost };
    this.state.cash -= cost; this.state.fuel = clamp(this.state.fuel + requested, 0, 100);
    this.emit('refuelled', { litres: requested, cost }); this.save(); return { ok: true, litres: requested, cost };
  }

  eat({ cost = 500, hungerRelief = 35 } = {}) {
    cost = Math.max(0, Number(cost) || 0);
    if (this.state.cash < cost) return { ok: false, reason: 'insufficient_cash', cost };
    this.state.cash -= cost; this.state.hunger = clamp(this.state.hunger - Math.max(0, Number(hungerRelief) || 0), 0, 100);
    this.emit('ate_meal', { cost }); this.save(); return { ok: true, cost };
  }

  rest({ minutes = 60, cost = 0 } = {}) {
    cost = Math.max(0, Number(cost) || 0);
    if (this.activeTrip) return { ok: false, reason: 'trip_in_progress' };
    if (this.state.cash < cost) return { ok: false, reason: 'insufficient_cash', cost };
    this.state.cash -= cost; this.state.fatigue = clamp(this.state.fatigue - Math.max(0, Number(minutes) || 0) * 0.55, 0, 100);
    this.state.minuteOfDay = (this.state.minuteOfDay + Math.max(0, Number(minutes) || 0)) % 1440;
    this.emit('rested', { minutes, cost }); this.save(); return { ok: true, minutes, cost };
  }

  fine(amount, reason = 'traffic_violation') {
    const value = Math.max(0, Number(amount) || 0); this.state.cash = Math.max(0, this.state.cash - value);
    this.state.reputation = clamp(this.state.reputation - 1, 0, 100); this.emit('fine', { amount: value, reason }); this.save();
  }
  dispose() { if (this.destroyed) return; this.save(); this.destroyed = true; }
}
