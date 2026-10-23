/**
 * Kano Life — persistent northern Nigerian keke-driver career ledger.
 * Uses the existing banked wallet as the single source of spendable cash.
 * Operating costs are game-scaled for playability, not market-price claims.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const money = (value) => Math.max(0, Math.round(Number.isFinite(Number(value)) ? Number(value) : 0));
const safeDay = (value) => clamp(Math.floor(Number(value) || 1), 1, 999999);
const clone = (value) => JSON.parse(JSON.stringify(value));

export const KANO_LIFE_PROFILE_DEFAULTS = Object.freeze({
  name: 'Musa',
  gender: 'male',
  age: 22,
  residence: 'family_compound',
  householdRole: 'contribute',
  ownership: 'daily_hire',
  goal: 'own_keke',
});

const PROFILE_ENUMS = {
  gender: new Set(['male', 'female']),
  residence: new Set(['family_compound', 'single_room', 'shared_flat', 'married_household']),
  householdRole: new Set(['independent', 'contribute', 'provider']),
  ownership: new Set(['owned', 'daily_hire', 'hire_purchase']),
  goal: new Set(['own_keke', 'education', 'small_business', 'home_upgrade']),
};

const GOAL_TARGETS = Object.freeze({
  own_keke: 90000,
  education: 25000,
  small_business: 45000,
  home_upgrade: 60000,
});

const DEFAULT_STATE = () => ({
  version: 1,
  profile: { ...KANO_LIFE_PROFILE_DEFAULTS },
  savings: 0,
  vehicleOutstanding: 450000,
  arrears: { operating: 0, vehicle: 0, household: 0 },
  totals: { gross: 0, paidExpenses: 0, fuel: 0, maintenance: 0, vehicle: 0, household: 0, meals: 0, shifts: 0, trips: 0, kilometres: 0 },
  lastVehicleChargeDay: null,
  lastHouseholdChargeDay: null,
  activeShift: null,
  lastShiftReport: null,
  ledger: [],
});

function normalizeProfile(input = {}) {
  const profile = { ...KANO_LIFE_PROFILE_DEFAULTS };
  profile.name = String(input.name ?? profile.name).trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 32) || profile.name;
  profile.gender = PROFILE_ENUMS.gender.has(input.gender) ? input.gender : profile.gender;
  profile.age = clamp(Math.floor(Number(input.age) || profile.age), 18, 35);
  for (const key of ['residence', 'householdRole', 'ownership', 'goal']) {
    if (PROFILE_ENUMS[key].has(input[key])) profile[key] = input[key];
  }
  return profile;
}

function normalizeState(input = {}) {
  const fresh = DEFAULT_STATE();
  const state = { ...fresh, ...input };
  state.version = 1;
  state.profile = normalizeProfile(input.profile || {});
  state.savings = money(input.savings);
  state.vehicleOutstanding = money(input.vehicleOutstanding ?? fresh.vehicleOutstanding);
  state.arrears = { ...fresh.arrears, ...(input.arrears || {}) };
  for (const key of Object.keys(state.arrears)) state.arrears[key] = money(state.arrears[key]);
  state.totals = { ...fresh.totals, ...(input.totals || {}) };
  for (const key of Object.keys(state.totals)) {
    state.totals[key] = key === 'kilometres'
      ? Math.max(0, Math.round((Number(state.totals[key]) || 0) * 1000) / 1000)
      : money(state.totals[key]);
  }
  state.ledger = Array.isArray(input.ledger) ? input.ledger.filter(row => row && typeof row === 'object').slice(-160).map(row => ({ ...row })) : [];
  state.lastVehicleChargeDay = Number.isFinite(Number(input.lastVehicleChargeDay)) ? safeDay(input.lastVehicleChargeDay) : null;
  state.lastHouseholdChargeDay = Number.isFinite(Number(input.lastHouseholdChargeDay)) ? safeDay(input.lastHouseholdChargeDay) : null;
  state.activeShift = input.activeShift && typeof input.activeShift === 'object' ? { ...input.activeShift } : null;
  state.lastShiftReport = input.lastShiftReport && typeof input.lastShiftReport === 'object' ? { ...input.lastShiftReport } : null;
  return state;
}

export class KanoNorthernDriverLifeSimulation {
  constructor({ storage = globalThis.localStorage ?? null, storageKey = 'kano-life-northern-driver-career-v1', now = () => Date.now() } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.now = now;
    this.state = DEFAULT_STATE();
    this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || typeof parsed !== 'object') return false;
      this.state = normalizeState(parsed);
      return true;
    } catch {
      this.state = DEFAULT_STATE();
      return false;
    }
  }

  save() {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.state));
      return Boolean(this.storage);
    } catch {
      return false;
    }
  }

  updateProfile(input = {}) {
    const priorOwnership = this.state.profile.ownership;
    this.state.profile = normalizeProfile({ ...this.state.profile, ...input });
    if (this.state.profile.ownership === 'owned') {
      this.state.vehicleOutstanding = 0;
      this.state.arrears.vehicle = 0;
    } else if (this.state.profile.ownership === 'hire_purchase' && priorOwnership !== 'hire_purchase' && this.state.vehicleOutstanding <= 0) {
      this.state.vehicleOutstanding = 450000;
    }
    this._record('profile_updated', 0, { name: this.state.profile.name, gender: this.state.profile.gender });
    this.save();
    return this.getSnapshot(0);
  }

  beginShift(gameState = {}, dayNumber = 1, mode = 'career') {
    if (!['career', 'freeRoam'].includes(mode)) return { ok: false, reason: 'mode_not_simulated' };
    const runStartedAt = Number(gameState.runStartedAt) || this.now();
    this.state.activeShift = {
      runId: `${mode}-${runStartedAt}`,
      mode,
      startedAt: runStartedAt,
      day: safeDay(dayNumber),
      // fuel is the billable starting baseline. The fuel-market integration may
      // lower it by fuel units already purchased in advance, without changing the
      // actual tank gauge stored separately below.
      fuel: clamp(Number(gameState.fuel) || 0, 0, 100),
      fuelGaugeAtShiftStart: clamp(Number(gameState.fuel) || 0, 0, 100),
      prepaidFuelAtStart: 0,
      fuelPriceMultiplier: 1,
      condition: clamp(Number(gameState.condition) || 0, 0, 100),
      engine: clamp(Number(gameState.engine) || 0, 0, 100),
      tyres: clamp(Number(gameState.tyres) || 0, 0, 100),
      distance: Math.max(0, Number(gameState.distance) || 0),
      drops: Math.max(0, Number(gameState.drops) || 0),
      collisions: Math.max(0, Number(gameState.collisions) || 0),
    };
    this.save();
    return { ok: true, shift: { ...this.state.activeShift } };
  }

  recordMeal({ amount = 0, food = 'meal', day = 1 } = {}) {
    const cost = money(amount);
    this.state.totals.meals += cost;
    this.state.totals.paidExpenses += cost;
    this._record('meal', -cost, { food: String(food).slice(0, 60), day: safeDay(day) });
    this.save();
    return { ok: true, amount: cost };
  }

  settleShift({ earned = 0, gameState = {}, wallet = 0, dayNumber = 1, mode = 'career' } = {}) {
    const active = this.state.activeShift;
    const gross = money(earned);
    const day = safeDay(dayNumber);
    if (!active) return { ok: false, reason: 'no_active_shift' };
    if (!['career', 'freeRoam'].includes(mode) || active.mode !== mode) return { ok: false, reason: 'mode_mismatch' };
    const runId = `${mode}-${Number(gameState.runStartedAt) || active.startedAt}`;
    if (active.runId !== runId) return { ok: false, reason: 'shift_id_mismatch' };

    const fuelEnd = clamp(Number(gameState.fuel) || 0, 0, 100);
    const conditionEnd = clamp(Number(gameState.condition) || 0, 0, 100);
    const engineEnd = clamp(Number(gameState.engine) || 0, 0, 100);
    const tyresEnd = clamp(Number(gameState.tyres) || 0, 0, 100);
    // The active.fuel baseline may exclude fuel units purchased before this
    // shift, so those units are not charged again at settlement.
    const billableFuelUsed = Math.max(0, active.fuel - fuelEnd);
    const actualFuelStart = clamp(Number(active.fuelGaugeAtShiftStart ?? active.fuel), 0, 100);
    const fuelUsed = Math.max(0, actualFuelStart - fuelEnd);
    const prepaidFuelUsed = Math.min(Math.max(0, Number(active.prepaidFuelAtStart) || 0), fuelUsed);
    const fuelPriceMultiplier = clamp(Number(active.fuelPriceMultiplier) || 1, 0.75, 1.75);
    const conditionWear = Math.max(0, active.condition - conditionEnd);
    const engineWear = Math.max(0, active.engine - engineEnd);
    const tyreWear = Math.max(0, active.tyres - tyresEnd);
    const trips = Math.max(0, Math.floor(Number(gameState.drops) || 0) - active.drops);
    const kilometres = Math.max(0, (Number(gameState.distance) || 0) - active.distance);

    // Conservative game-balance costs; the existing arcade payout banks only a
    // fraction of in-run fare/score, so costs are intentionally scaled down.
    const fuelDue = money(billableFuelUsed * 8 * fuelPriceMultiplier);
    const maintenanceDue = money(conditionWear * 7 + engineWear * 7 + tyreWear * 5);
    let vehicleDue = 0;
    if (this.state.lastVehicleChargeDay !== day) {
      if (this.state.profile.ownership === 'daily_hire') vehicleDue = 160;
      if (this.state.profile.ownership === 'hire_purchase') vehicleDue = Math.min(250, this.state.vehicleOutstanding);
      this.state.lastVehicleChargeDay = day;
    }
    let householdDue = 0;
    if (this.state.lastHouseholdChargeDay !== day) {
      householdDue = ({ independent: 40, contribute: 100, provider: 180 })[this.state.profile.householdRole] ?? 100;
      this.state.lastHouseholdChargeDay = day;
    }

    let available = money(wallet);
    const applyDue = (category, due, totalsKey) => {
      const paid = Math.min(available, due);
      const unpaid = due - paid;
      available -= paid;
      this.state.arrears[category] = money(this.state.arrears[category] + unpaid);
      this.state.totals.paidExpenses += paid;
      if (paid && totalsKey) this.state.totals[totalsKey] += paid;
      if (due > 0) this._record(category, -paid, { due, paid, unpaid, day, ledgerKind: totalsKey || category });
      return { due, paid, unpaid };
    };
    const fuel = applyDue('operating', fuelDue, 'fuel');
    const maintenance = applyDue('operating', maintenanceDue, 'maintenance');
    const vehicle = applyDue('vehicle', vehicleDue, 'vehicle');
    const household = applyDue('household', householdDue, 'household');
    if (this.state.profile.ownership === 'hire_purchase' && vehicle.paid > 0) this.state.vehicleOutstanding = Math.max(0, this.state.vehicleOutstanding - vehicle.paid);

    this.state.totals.gross += gross;
    this.state.totals.shifts += 1;
    this.state.totals.trips += trips;
    this.state.totals.kilometres = Math.round((this.state.totals.kilometres + kilometres) * 1000) / 1000;
    const totalDue = fuel.due + maintenance.due + vehicle.due + household.due;
    const totalPaid = fuel.paid + maintenance.paid + vehicle.paid + household.paid;
    const report = {
      day, mode, runId, gross,
      fuelUsed: Number(fuelUsed.toFixed(2)),
      fuelBilledUnits: Number(billableFuelUsed.toFixed(2)),
      prepaidFuelUnitsUsed: Number(prepaidFuelUsed.toFixed(2)),
      fuelPriceMultiplier: Number(fuelPriceMultiplier.toFixed(3)),
      fuelCost: fuel,
      conditionWear: Number(conditionWear.toFixed(2)), engineWear: Number(engineWear.toFixed(2)), tyreWear: Number(tyreWear.toFixed(2)),
      maintenanceCost: maintenance, vehicleCost: vehicle, householdCost: household,
      totalDue, totalPaid, netAfterPaidCosts: gross - totalPaid, walletBeforeExpenses: money(wallet), walletAfterExpenses: available,
      trips, kilometres: Number(kilometres.toFixed(3)), arrears: { ...this.state.arrears }, vehicleOutstanding: this.state.vehicleOutstanding,
    };
    this.state.lastShiftReport = report;
    this.state.activeShift = null;
    this._record('shift_closed', gross - totalPaid, { day, gross, totalDue, totalPaid, walletAfterExpenses: available });
    this.save();
    return { ok: true, report, wallet: available, snapshot: this.getSnapshot(available) };
  }

  depositSavings(amount, wallet) {
    const requested = money(amount);
    const available = money(wallet);
    if (requested < 100) return { ok: false, reason: 'minimum_deposit_100' };
    if (requested > available) return { ok: false, reason: 'insufficient_wallet', required: requested, wallet: available };
    this.state.savings += requested;
    this._record('savings_deposit', -requested, { amount: requested });
    this.save();
    return { ok: true, amount: requested, wallet: available - requested, snapshot: this.getSnapshot(available - requested) };
  }

  payArrears(wallet) {
    let available = money(wallet);
    const starting = available;
    for (const key of ['vehicle', 'household', 'operating']) {
      const paid = Math.min(available, this.state.arrears[key]);
      if (paid) {
        available -= paid;
        this.state.arrears[key] -= paid;
        this._record('arrears_payment', -paid, { category: key, remaining: this.state.arrears[key] });
      }
      if (!available) break;
    }
    const amount = starting - available;
    if (amount) { this.state.totals.paidExpenses += amount; this.save(); }
    return { ok: amount > 0, amount, wallet: available, remaining: { ...this.state.arrears } };
  }

  _record(type, amount, details = {}) {
    const signedAmount = Number.isFinite(Number(amount)) ? Math.round(Number(amount)) : 0;
    this.state.ledger.push({ id: `life-${this.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, type, amount: signedAmount, details: clone(details), at: new Date(this.now()).toISOString() });
    if (this.state.ledger.length > 160) this.state.ledger.splice(0, this.state.ledger.length - 160);
  }

  getSnapshot(wallet = 0) {
    const s = this.state;
    return {
      profile: { ...s.profile },
      wallet: money(wallet),
      savings: s.savings,
      vehicleOutstanding: s.vehicleOutstanding,
      arrears: { ...s.arrears },
      totalArrears: s.arrears.operating + s.arrears.vehicle + s.arrears.household,
      totals: { ...s.totals },
      lastShiftReport: s.lastShiftReport ? clone(s.lastShiftReport) : null,
      activeShift: s.activeShift ? { ...s.activeShift } : null,
      goal: { id: s.profile.goal, target: GOAL_TARGETS[s.profile.goal] || GOAL_TARGETS.own_keke, saved: s.savings, remaining: Math.max(0, (GOAL_TARGETS[s.profile.goal] || GOAL_TARGETS.own_keke) - s.savings) },
      ledger: s.ledger.slice(-8).reverse().map(row => ({ ...row, details: { ...(row.details || {}) } })),
    };
  }
}

export { GOAL_TARGETS };
export default KanoNorthernDriverLifeSimulation;
