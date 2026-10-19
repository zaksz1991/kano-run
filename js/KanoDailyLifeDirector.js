/**
 * Kano Life — Daily Life Simulation Director
 * Additive state machine for a driver's daily routine. It does not render 3D
 * scenes or charge an external wallet; integrations must commit costs first.
 */
const DEFAULTS = {
  storageKey: 'kano-life-daily-life-v1',
  autoLoad: true,
  activities: {
    breakfast: { duration: 18, cost: 350, energy: 24, mood: 8 },
    collectKeke: { duration: 8, cost: 0, energy: -3, mood: 0 },
    inspection: { duration: 6, cost: 0, energy: -2, mood: 3 },
    driveToRank: { duration: 12, cost: 0, energy: -7, mood: 0 },
    workShift: { duration: 120, cost: 0, energy: -28, mood: -2 },
    mealBreak: { duration: 20, cost: 500, energy: 22, mood: 5 },
    refuel: { duration: 12, cost: 0, energy: -2, mood: 0 },
    mechanicVisit: { duration: 35, cost: 0, energy: -5, mood: 4 },
    returnHome: { duration: 15, cost: 0, energy: -7, mood: 2 },
    sleep: { duration: 420, cost: 0, energy: 65, mood: 10 }
  }
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const clone = value => JSON.parse(JSON.stringify(value));
const id = () => `DAY-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export class KanoDailyLifeDirector {
  constructor(options = {}) {
    this.options = { ...clone(DEFAULTS), ...options, activities: { ...clone(DEFAULTS.activities), ...(options.activities || {}) } };
    this.listeners = new Map();
    this.state = this._initialState();
    if (this.options.autoLoad !== false) this.load();
  }
  _initialState() {
    return { version: 1, day: 1, minute: 360, phase: 'morning', location: 'home', energy: 82, mood: 70,
      hunger: 25, fatigue: 18, keke: { secured: true, collected: false, inspected: false, condition: 100, fuel: 5, breakdown: false },
      routine: [], completedActivities: [], activeActivity: null, daily: { expenses: 0, earnings: 0, trips: 0, kilometres: 0, notes: [] },
      history: [], flags: { breakfast: false, vehicleCollected: false, inspectionDone: false, workedToday: false, returnedHome: false, slept: false } };
  }
  on(event, callback) { if (typeof callback !== 'function') throw new TypeError('callback must be a function'); const s = this.listeners.get(event) || new Set(); s.add(callback); this.listeners.set(event, s); return () => s.delete(callback); }
  _emit(event, payload) { for (const cb of this.listeners.get(event) || []) { try { cb(clone(payload)); } catch (_) {} } }
  _save(event = 'change') { this.save(); const s = this.getSnapshot(); this._emit(event, s); this._emit('change', s); return s; }
  _activity(name) { const a = this.options.activities[name]; if (!a) throw new RangeError(`Unknown activity: ${name}`); return a; }
  _advance(minutes) { this.state.minute += minutes; while (this.state.minute >= 1440) { this.state.minute -= 1440; this.state.day += 1; this.state.phase = 'morning'; this.state.daily = { expenses: 0, earnings: 0, trips: 0, kilometres: 0, notes: [] }; this.state.flags = { breakfast: false, vehicleCollected: false, inspectionDone: false, workedToday: false, returnedHome: false, slept: false }; this.state.completedActivities = []; this._emit('new_day', this.getSnapshot()); } this._updatePhase(); }
  _updatePhase() { const h = Math.floor(this.state.minute / 60); this.state.phase = h < 5 ? 'night' : h < 11 ? 'morning' : h < 16 ? 'afternoon' : h < 20 ? 'evening' : 'night'; }
  getClock() { const h = Math.floor(this.state.minute / 60) % 24; const m = this.state.minute % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  startActivity(name, options = {}) {
    if (this.state.activeActivity) return { ok: false, reason: 'activity_in_progress' };
    const def = this._activity(name); const cost = Math.max(0, Number(options.cost ?? def.cost) || 0);
    if (options.paymentConfirmed !== true && cost > 0) return { ok: false, reason: 'payment_confirmation_required', cost };
    if (name === 'breakfast' && this.state.flags.breakfast) return { ok: false, reason: 'already_done_today' };
    if (name === 'collectKeke' && !this.state.keke.secured) return { ok: false, reason: 'keke_not_secured' };
    if (name === 'collectKeke' && this.state.keke.breakdown) return { ok: false, reason: 'keke_needs_repair' };
    if (name === 'inspection' && !this.state.keke.collected) return { ok: false, reason: 'collect_keke_first' };
    if (name === 'driveToRank' && !this.state.keke.inspected) return { ok: false, reason: 'inspect_vehicle_first' };
    if (name === 'workShift' && (!this.state.keke.collected || !this.state.keke.inspected)) return { ok: false, reason: 'vehicle_not_ready' };
    if (name === 'sleep' && this.state.location !== 'home') return { ok: false, reason: 'return_home_first' };
    this.state.activeActivity = { id: id(), name, startedAt: this.getClock(), duration: Math.max(1, Number(options.duration ?? def.duration) || 1), elapsed: 0, cost, metadata: clone(options.metadata || {}) };
    this._emit('activity_started', this.state.activeActivity); this._save(); return { ok: true, activity: clone(this.state.activeActivity), snapshot: this.getSnapshot() };
  }
  completeActivity(options = {}) {
    const active = this.state.activeActivity; if (!active) return { ok: false, reason: 'no_activity_in_progress' };
    if (active.cost > 0 && options.paymentConfirmed !== true) return { ok: false, reason: 'payment_confirmation_required', cost: active.cost };
    const def = this._activity(active.name); this._advance(active.duration);
    this.state.energy = clamp(this.state.energy + (Number(def.energy) || 0), 0, 100);
    this.state.mood = clamp(this.state.mood + (Number(def.mood) || 0), 0, 100);
    this.state.hunger = clamp(this.state.hunger + active.duration / 12 - (active.name === 'breakfast' || active.name === 'mealBreak' ? 30 : 0), 0, 100);
    this.state.fatigue = clamp(this.state.fatigue + active.duration / 18 - (active.name === 'sleep' ? 70 : 0), 0, 100);
    if (active.cost) this.state.daily.expenses += active.cost;
    const name = active.name;
    if (name === 'breakfast') { this.state.flags.breakfast = true; this.state.location = 'roadside_breakfast'; }
    if (name === 'collectKeke') { this.state.keke.secured = false; this.state.keke.collected = true; this.state.flags.vehicleCollected = true; this.state.location = 'parking_garage'; }
    if (name === 'inspection') { this.state.keke.inspected = true; this.state.flags.inspectionDone = true; this.state.location = 'parking_garage'; }
    if (name === 'driveToRank') this.state.location = 'passenger_rank';
    if (name === 'workShift') { this.state.flags.workedToday = true; this.state.location = 'road'; }
    if (name === 'mealBreak') this.state.location = 'roadside_food_stall';
    if (name === 'refuel') this.state.location = 'fuel_station';
    if (name === 'mechanicVisit') this.state.location = 'mechanic_workshop';
    if (name === 'returnHome') { this.state.location = 'home'; this.state.flags.returnedHome = true; this.state.keke.secured = true; this.state.keke.collected = false; this.state.keke.inspected = false; }
    if (name === 'sleep') { this.state.flags.slept = true; this.state.energy = clamp(this.state.energy + 25, 0, 100); this.state.fatigue = clamp(this.state.fatigue - 35, 0, 100); }
    const entry = { id: active.id, name, startedAt: active.startedAt, completedAt: this.getClock(), duration: active.duration, cost: active.cost, day: this.state.day, metadata: active.metadata };
    this.state.completedActivities.push(entry); this.state.routine.push(entry); if (this.state.routine.length > 300) this.state.routine.shift();
    this.state.activeActivity = null; this._emit('activity_completed', entry); this._save('activity_completed'); return { ok: true, activity: entry, snapshot: this.getSnapshot() };
  }
  cancelActivity() { if (!this.state.activeActivity) return { ok: false, reason: 'no_activity_in_progress' }; const a = this.state.activeActivity; this.state.activeActivity = null; this._emit('activity_cancelled', a); return { ok: true, snapshot: this._save() }; }
  tick(realSeconds, timeScale = 1) { const seconds = clamp(realSeconds, 0, 10); const scale = clamp(timeScale, 0, 120); if (this.state.activeActivity) { this.state.activeActivity.elapsed += seconds * scale / 60; if (this.state.activeActivity.elapsed >= this.state.activeActivity.duration) return this.completeActivity({ paymentConfirmed: this.state.activeActivity.cost === 0 }); } this.state.hunger = clamp(this.state.hunger + seconds * scale / 3600, 0, 100); this.state.fatigue = clamp(this.state.fatigue + seconds * scale / 5400, 0, 100); return this.getSnapshot(); }
  recordTrip({ fare = 0, kilometres = 0, duration = 0, safe = true } = {}) { const f = Math.max(0, Number(fare) || 0); this.state.daily.earnings += f; this.state.daily.trips += 1; this.state.daily.kilometres += Math.max(0, Number(kilometres) || 0); this.state.energy = clamp(this.state.energy - Math.max(1, duration / 10) - (safe ? 0 : 8), 0, 100); this.state.mood = clamp(this.state.mood + (safe ? 1 : -8), 0, 100); this.state.keke.condition = clamp(this.state.keke.condition - Math.max(0, Number(kilometres) || 0) * 0.025 - (safe ? 0 : 2), 0, 100); this._emit('trip_recorded', { fare: f, safe, snapshot: this.getSnapshot() }); this._save(); return this.getSnapshot(); }
  updateVehicle({ condition, fuel, breakdown } = {}) { if (condition !== undefined) this.state.keke.condition = clamp(condition, 0, 100); if (fuel !== undefined) this.state.keke.fuel = clamp(fuel, 0, 1000); if (breakdown !== undefined) this.state.keke.breakdown = Boolean(breakdown); return this._save('vehicle'); }
  closeDay({ secureKeke = true } = {}) { if (this.state.activeActivity) return { ok: false, reason: 'activity_in_progress' }; if (secureKeke) { this.state.keke.secured = true; this.state.keke.collected = false; this.state.keke.inspected = false; this.state.location = 'home'; this.state.flags.returnedHome = true; } const report = { day: this.state.day, ...clone(this.state.daily), net: this.state.daily.earnings - this.state.daily.expenses, energy: this.state.energy, mood: this.state.mood, completedActivities: this.state.completedActivities.length }; this.state.history.push(report); if (this.state.history.length > 90) this.state.history.shift(); this._emit('day_closed', report); this._advance(1440 - this.state.minute + 360); this.state.location = 'home'; this.state.keke.secured = true; this.state.keke.collected = false; this.state.keke.inspected = false; return { ok: true, report, snapshot: this._save('day_closed') }; }
  getSnapshot() { return { ...clone(this.state), clock: this.getClock(), netToday: this.state.daily.earnings - this.state.daily.expenses, needs: { hunger: this.state.hunger, fatigue: this.state.fatigue, energy: this.state.energy, mood: this.state.mood }, nextRecommendedActivity: this.getRecommendedActivity() }; }
  getRecommendedActivity() { if (this.state.energy < 20 || this.state.fatigue > 85) return this.state.location === 'home' ? 'sleep' : 'returnHome'; if (!this.state.flags.breakfast && this.state.minute < 600) return 'breakfast'; if (!this.state.keke.collected) return 'collectKeke'; if (!this.state.keke.inspected) return 'inspection'; if (this.state.keke.fuel < 1) return 'refuel'; if (!this.state.flags.workedToday) return 'driveToRank'; if (this.state.hunger > 65) return 'mealBreak'; if (this.state.flags.workedToday && this.state.minute > 1080) return 'returnHome'; return 'workShift'; }
  save() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(this.options.storageKey, JSON.stringify(this.state)); return true; } catch (error) { this._emit('storage_error', { operation: 'save', message: error.message }); return false; } }
  load() { try { if (typeof localStorage === 'undefined') return false; const raw = localStorage.getItem(this.options.storageKey); if (!raw) return false; const data = JSON.parse(raw); if (!data || data.version !== 1) return false; this.state = { ...this._initialState(), ...data }; this._emit('restore', this.getSnapshot()); return true; } catch (error) { this._emit('storage_error', { operation: 'load', message: error.message }); return false; } }
  exportState() { return JSON.stringify({ schema: 'kano-life-daily-life', version: 1, state: this.state }); }
  importState(serialized) { const data = typeof serialized === 'string' ? JSON.parse(serialized) : serialized; const s = data?.state || data; if (!s || s.version !== 1 || !Number.isFinite(Number(s.day)) || !s.keke || !s.daily) return { ok: false, reason: 'invalid_state' }; this.state = { ...this._initialState(), ...clone(s) }; this._save('restore'); return { ok: true, snapshot: this.getSnapshot() }; }
  reset() { this.state = this._initialState(); this.save(); this._emit('reset', this.getSnapshot()); return this.getSnapshot(); }
}

export default KanoDailyLifeDirector;
