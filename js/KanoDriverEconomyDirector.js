/**
 * Kano Life — Driver Economy Director
 * Standalone economic simulation for keke-driver daily finances.
 * It deliberately does not mutate an external wallet: integration code must
 * authorize/commit wallet transactions and then record the confirmed result.
 */
const DEFAULTS = {
  storageKey: 'kano-life-driver-economy-v1',
  startingCash: 2500,
  startingSavings: 0,
  startingDebt: 0,
  fuelPricePerLitre: 950,
  fuelLitres: 5,
  dailyHouseholdCost: 500,
  dailyFoodCost: 350,
  dailyDataCost: 100,
  dailyPermitReserve: 100,
  hirePurchase: { enabled: false, principal: 450000, deposit: 90000, dailyInstalment: 2500, totalDays: 144 }
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const clone = value => JSON.parse(JSON.stringify(value));

export class KanoDriverEconomyDirector {
  constructor(options = {}) {
    this.options = { ...clone(DEFAULTS), ...options };
    this.options.hirePurchase = { ...DEFAULTS.hirePurchase, ...(options.hirePurchase || {}) };
    this.listeners = new Map();
    this.state = this._initialState();
    if (options.autoLoad !== false) this.load();
  }

  _initialState() {
    return {
      version: 1, day: 1, cash: Math.max(0, Number(this.options.startingCash) || 0), savings: Math.max(0, Number(this.options.startingSavings) || 0),
      debt: Math.max(0, Number(this.options.startingDebt) || 0), fuelLitres: Math.max(0, Number(this.options.fuelLitres) || 0),
      fuelPricePerLitre: Math.max(0, Number(this.options.fuelPricePerLitre) || 0),
      hirePurchase: { active: false, principal: 0, depositPaid: 0, outstanding: 0, dailyInstalment: 0, daysRemaining: 0, missedPayments: 0, owned: false },
      today: this._emptyDay(), history: [], ledger: [], alerts: [], totalRevenue: 0, totalExpenses: 0, totalFuelBought: 0, trips: 0, defaults: 0
    };
  }
  _emptyDay() { return { revenue: 0, fuel: 0, repairs: 0, household: 0, food: 0, data: 0, permit: 0, instalments: 0, other: 0, trips: 0, kilometres: 0, notes: [] }; }
  on(event, callback) { if (typeof callback !== 'function') throw new TypeError('callback must be a function'); const set = this.listeners.get(event) || new Set(); set.add(callback); this.listeners.set(event, set); return () => set.delete(callback); }
  _emit(event, payload) { for (const cb of this.listeners.get(event) || []) { try { cb(payload); } catch (error) { /* callbacks must not break the economy */ } } }
  _record(type, amount, details = {}) { const entry = { id: `KE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, day: this.state.day, type, amount: round2(amount), details: clone(details), at: new Date().toISOString() }; this.state.ledger.push(entry); if (this.state.ledger.length > 500) this.state.ledger.shift(); this._emit('transaction', clone(entry)); return entry; }
  _saveAndEmit(event = 'change') { this.save(); const snap = this.getSnapshot(); this._emit(event, snap); this._emit('change', snap); return snap; }
  _assertAmount(amount, label = 'amount') { const n = Number(amount); if (!Number.isFinite(n) || n < 0) throw new RangeError(`${label} must be a finite non-negative number`); return round2(n); }

  /** Record revenue only after the game's authoritative wallet confirms receipt. */
  recordRevenue(amount, source = 'passenger_fare', details = {}) {
    const value = this._assertAmount(amount); this.state.cash = round2(this.state.cash + value); this.state.today.revenue += value; this.state.totalRevenue += value;
    if (source === 'passenger_fare') { this.state.today.trips += 1; this.state.trips += 1; }
    this._record('revenue', value, { source, ...details }); return this._saveAndEmit('revenue');
  }

  /** Record an expense after external wallet authorization; refuses unaffordable costs. */
  recordExpense(category, amount, details = {}) {
    const value = this._assertAmount(amount); if (!category || typeof category !== 'string') throw new TypeError('category is required');
    if (value > this.state.cash) return { ok: false, reason: 'insufficient_cash', required: value, available: this.state.cash, snapshot: this.getSnapshot() };
    this.state.cash = round2(this.state.cash - value); this.state.totalExpenses += value;
    const key = ({ fuel: 'fuel', repair: 'repairs', household: 'household', food: 'food', data: 'data', permit: 'permit', instalment: 'instalments' })[category] || 'other';
    this.state.today[key] = round2((this.state.today[key] || 0) + value);
    this._record('expense', -value, { category, ...details }); this._saveAndEmit('expense'); return { ok: true, snapshot: this.getSnapshot() };
  }

  buyFuel(litres, pricePerLitre = this.state.fuelPricePerLitre) {
    const qty = this._assertAmount(litres, 'litres'); const price = this._assertAmount(pricePerLitre, 'pricePerLitre');
    const cost = round2(qty * price); const result = this.recordExpense('fuel', cost, { litres: qty, pricePerLitre: price });
    if (!result.ok) return result;
    this.state.fuelLitres = round2(this.state.fuelLitres + qty); this.state.totalFuelBought = round2(this.state.totalFuelBought + qty); this.state.fuelPricePerLitre = price;
    this._record('fuel_purchase', cost, { litres: qty, pricePerLitre: price }); this._saveAndEmit('fuel'); return { ok: true, cost, litres: this.state.fuelLitres, snapshot: this.getSnapshot() };
  }
  consumeFuel(litres, kilometres = 0) {
    const qty = this._assertAmount(litres, 'litres'); const km = this._assertAmount(kilometres, 'kilometres');
    if (qty > this.state.fuelLitres) return { ok: false, reason: 'insufficient_fuel', required: qty, available: this.state.fuelLitres };
    this.state.fuelLitres = round2(this.state.fuelLitres - qty); this.state.today.kilometres = round2(this.state.today.kilometres + km);
    this._record('fuel_consumed', 0, { litres: qty, kilometres: km }); this._saveAndEmit('fuel'); return { ok: true, fuelLitres: this.state.fuelLitres, snapshot: this.getSnapshot() };
  }
  setFuelPrice(pricePerLitre, reason = 'market_update') { const p = this._assertAmount(pricePerLitre, 'pricePerLitre'); const previous = this.state.fuelPricePerLitre; this.state.fuelPricePerLitre = p; this._record('fuel_price_change', 0, { previous, current: p, reason }); return this._saveAndEmit('fuel_price'); }

  setDailyBudget(overrides = {}) {
    for (const key of ['dailyHouseholdCost', 'dailyFoodCost', 'dailyDataCost', 'dailyPermitReserve']) if (overrides[key] !== undefined) this.options[key] = this._assertAmount(overrides[key], key);
    this._record('budget_updated', 0, { budget: { ...this.options } }); return this._saveAndEmit('budget');
  }
  estimateDailyBudget() { return { household: this.options.dailyHouseholdCost, food: this.options.dailyFoodCost, data: this.options.dailyDataCost, permit: this.options.dailyPermitReserve, hirePurchase: this.state.hirePurchase.active ? this.state.hirePurchase.dailyInstalment : 0, total: round2(this.options.dailyHouseholdCost + this.options.dailyFoodCost + this.options.dailyDataCost + this.options.dailyPermitReserve + (this.state.hirePurchase.active ? this.state.hirePurchase.dailyInstalment : 0)) }; }

  settleDailyExpenses({ payHousehold = true, payFood = true, payData = true, reservePermit = true, payInstalment = true } = {}) {
    const budget = this.estimateDailyBudget(); const requested = [payHousehold ? ['household', budget.household] : null, payFood ? ['food', budget.food] : null, payData ? ['data', budget.data] : null, reservePermit ? ['permit', budget.permit] : null, payInstalment && this.state.hirePurchase.active ? ['instalment', budget.hirePurchase] : null].filter(Boolean);
    const results = [];
    for (const [category, amount] of requested) {
      if (category === 'instalment') { results.push(this.payHirePurchaseInstalment()); continue; }
      const r = this.recordExpense(category, amount, { automaticDailyExpense: true }); results.push({ category, ...r });
      if (!r.ok) { this.state.alerts.push({ type: 'budget_shortfall', category, required: amount, available: this.state.cash, day: this.state.day }); this._emit('alert', this.state.alerts[this.state.alerts.length - 1]); }
    }
    return { ok: results.every(r => r.ok !== false), results, snapshot: this.getSnapshot() };
  }

  startHirePurchase({ principal, deposit, dailyInstalment, totalDays } = {}) {
    if (this.state.hirePurchase.active || this.state.hirePurchase.owned) return { ok: false, reason: 'agreement_already_exists' };
    const cfg = { ...this.options.hirePurchase, principal: principal ?? this.options.hirePurchase.principal, deposit: deposit ?? this.options.hirePurchase.deposit, dailyInstalment: dailyInstalment ?? this.options.hirePurchase.dailyInstalment, totalDays: totalDays ?? this.options.hirePurchase.totalDays };
    const p = this._assertAmount(cfg.principal, 'principal'), d = this._assertAmount(cfg.deposit, 'deposit'), inst = this._assertAmount(cfg.dailyInstalment, 'dailyInstalment'), days = Math.floor(this._assertAmount(cfg.totalDays, 'totalDays'));
    if (p <= 0 || d > p || inst <= 0 || days < 1) return { ok: false, reason: 'invalid_agreement' };
    if (d > this.state.cash) return { ok: false, reason: 'insufficient_deposit', required: d, available: this.state.cash };
    this.state.cash = round2(this.state.cash - d); const outstanding = round2(p - d);
    this.state.hirePurchase = { active: outstanding > 0, principal: p, depositPaid: d, outstanding, dailyInstalment: inst, daysRemaining: days, missedPayments: 0, owned: outstanding <= 0 };
    this._record('hire_purchase_started', -d, { principal: p, deposit: d, outstanding, dailyInstalment: inst, totalDays: days }); this._saveAndEmit('hire_purchase'); return { ok: true, snapshot: this.getSnapshot() };
  }
  payHirePurchaseInstalment() {
    const hp = this.state.hirePurchase; if (!hp.active) return { ok: false, reason: hp.owned ? 'already_owned' : 'no_active_agreement' };
    const due = round2(Math.min(hp.dailyInstalment, hp.outstanding));
    if (this.state.cash < due) { hp.missedPayments += 1; hp.daysRemaining = Math.max(0, hp.daysRemaining - 1); this.state.defaults += 1; this._record('hire_purchase_missed', 0, { due, available: this.state.cash, missedPayments: hp.missedPayments }); this._saveAndEmit('payment_missed'); return { ok: false, reason: 'insufficient_cash', due, available: this.state.cash, snapshot: this.getSnapshot() }; }
    this.state.cash = round2(this.state.cash - due); this.state.today.instalments = round2(this.state.today.instalments + due); this.state.totalExpenses = round2(this.state.totalExpenses + due); hp.outstanding = round2(Math.max(0, hp.outstanding - due)); hp.daysRemaining = Math.max(0, hp.daysRemaining - 1);
    this._record('hire_purchase_payment', -due, { outstanding: hp.outstanding, daysRemaining: hp.daysRemaining });
    if (hp.outstanding <= 0) { hp.active = false; hp.owned = true; this._emit('ownership_complete', clone(hp)); }
    else if (hp.daysRemaining <= 0) { hp.active = false; this.state.alerts.push({ type: 'hire_purchase_term_ended', outstanding: hp.outstanding, day: this.state.day }); this._emit('alert', clone(this.state.alerts[this.state.alerts.length - 1])); }
    this._saveAndEmit('hire_purchase'); return { ok: true, paid: due, outstanding: hp.outstanding, owned: hp.owned, snapshot: this.getSnapshot() };
  }
  makeExtraHirePurchasePayment(amount) { const hp = this.state.hirePurchase; if (!hp.active) return { ok: false, reason: 'no_active_agreement' }; const value = this._assertAmount(amount); if (value <= 0 || value > this.state.cash) return { ok: false, reason: value > this.state.cash ? 'insufficient_cash' : 'invalid_amount' }; const paid = Math.min(value, hp.outstanding); this.state.cash = round2(this.state.cash - paid); this.state.totalExpenses = round2(this.state.totalExpenses + paid); hp.outstanding = round2(hp.outstanding - paid); this._record('hire_purchase_extra_payment', -paid, { outstanding: hp.outstanding }); if (hp.outstanding <= 0) { hp.active = false; hp.owned = true; this._emit('ownership_complete', clone(hp)); } this._saveAndEmit('hire_purchase'); return { ok: true, paid, outstanding: hp.outstanding, owned: hp.owned }; }

  depositSavings(amount) { const value = this._assertAmount(amount); if (value <= 0 || value > this.state.cash) return { ok: false, reason: value > this.state.cash ? 'insufficient_cash' : 'invalid_amount' }; this.state.cash = round2(this.state.cash - value); this.state.savings = round2(this.state.savings + value); this._record('savings_deposit', -value, { savings: this.state.savings }); return { ok: true, snapshot: this._saveAndEmit('savings') }; }
  withdrawSavings(amount) { const value = this._assertAmount(amount); if (value <= 0 || value > this.state.savings) return { ok: false, reason: value > this.state.savings ? 'insufficient_savings' : 'invalid_amount' }; this.state.savings = round2(this.state.savings - value); this.state.cash = round2(this.state.cash + value); this._record('savings_withdrawal', value, { savings: this.state.savings }); return { ok: true, snapshot: this._saveAndEmit('savings') }; }
  recordEmergency(name, cost, { canBorrow = false, debtLimit = 0 } = {}) { const value = this._assertAmount(cost); if (!name) throw new TypeError('emergency name is required'); if (value <= this.state.cash) return { ok: true, ...this.recordExpense('other', value, { emergency: name }) }; if (canBorrow && value - this.state.cash <= debtLimit) { const paidFromCash = this.state.cash; const borrowed = round2(value - paidFromCash); this.state.cash = 0; this.state.debt = round2(this.state.debt + borrowed); this.state.totalExpenses = round2(this.state.totalExpenses + value); this._record('emergency_expense', -value, { name, borrowed, paidFromCash }); return { ok: true, borrowed, snapshot: this._saveAndEmit('emergency') }; } return { ok: false, reason: 'insufficient_funds', required: value, cash: this.state.cash, savings: this.state.savings }; }
  repayDebt(amount) { const value = this._assertAmount(amount); if (value <= 0 || value > this.state.cash || this.state.debt <= 0) return { ok: false, reason: value > this.state.cash ? 'insufficient_cash' : 'no_debt_or_invalid_amount' }; const paid = Math.min(value, this.state.debt); this.state.cash = round2(this.state.cash - paid); this.state.debt = round2(this.state.debt - paid); this._record('debt_repayment', -paid, { debt: this.state.debt }); return { ok: true, snapshot: this._saveAndEmit('debt') }; }

  closeDay({ settleExpenses = false } = {}) {
    if (settleExpenses) this.settleDailyExpenses();
    const day = { day: this.state.day, ...clone(this.state.today), netOperating: round2(this.state.today.revenue - this.state.today.fuel - this.state.today.repairs - this.state.today.other), netAfterLiving: round2(this.state.today.revenue - this.state.today.fuel - this.state.today.repairs - this.state.today.household - this.state.today.food - this.state.today.data - this.state.today.permit - this.state.today.instalments - this.state.today.other), closingCash: this.state.cash, savings: this.state.savings, debt: this.state.debt, fuelLitres: this.state.fuelLitres };
    this.state.history.push(day); if (this.state.history.length > 365) this.state.history.shift(); this._record('day_closed', 0, day); this.state.day += 1; this.state.today = this._emptyDay(); this._saveAndEmit('day_closed'); return clone(day);
  }
  getSnapshot() { const s = clone(this.state); const budget = this.estimateDailyBudget(); return { ...s, budget, netWorth: round2(s.cash + s.savings - s.debt - s.hirePurchase.outstanding), availableAfterBudget: round2(s.cash - budget.total), fuelRangeKmEstimate: round2(s.fuelLitres * 18), todayNet: round2(s.today.revenue - Object.values(s.today).filter(v => typeof v === 'number' && v !== s.today.revenue && v !== s.today.trips && v !== s.today.kilometres).reduce((a, v) => a + v, 0)), warnings: this._warnings() }; }
  _warnings() { const out = []; if (this.state.cash < this.estimateDailyBudget().total) out.push({ type: 'low_cash', message: 'Cash is below the estimated daily budget.' }); if (this.state.fuelLitres < 2) out.push({ type: 'low_fuel', message: 'Fuel is running low.' }); if (this.state.hirePurchase.active && this.state.hirePurchase.missedPayments > 0) out.push({ type: 'missed_instalments', count: this.state.hirePurchase.missedPayments }); if (this.state.debt > 0) out.push({ type: 'outstanding_debt', amount: this.state.debt }); return out; }
  exportState() { return JSON.stringify({ options: this.options, state: this.state }); }
  importState(serialized) { let parsed; try { parsed = typeof serialized === 'string' ? JSON.parse(serialized) : serialized; } catch { return { ok: false, reason: 'invalid_json' }; } if (!parsed || parsed.state?.version !== 1 || !Number.isFinite(parsed.state.cash) || parsed.state.cash < 0 || !Number.isFinite(parsed.state.savings) || parsed.state.savings < 0) return { ok: false, reason: 'invalid_state' }; this.state = { ...this._initialState(), ...clone(parsed.state), today: { ...this._emptyDay(), ...(parsed.state.today || {}) }, hirePurchase: { ...this._initialState().hirePurchase, ...(parsed.state.hirePurchase || {}) } }; if (parsed.options) { this.options = { ...this.options, ...parsed.options, hirePurchase: { ...this.options.hirePurchase, ...(parsed.options.hirePurchase || {}) } }; } this._saveAndEmit('restore'); return { ok: true, snapshot: this.getSnapshot() }; }
  save() { try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(this.options.storageKey, this.exportState()); return true; } catch (error) { this._emit('storage_error', error); return false; } }
  load() { try { if (typeof localStorage === 'undefined') return false; const raw = localStorage.getItem(this.options.storageKey); if (!raw) return false; const result = this.importState(raw); return result.ok; } catch (error) { this._emit('storage_error', error); return false; } }
  reset({ keepLedger = false } = {}) { const oldLedger = keepLedger ? this.state.ledger : []; this.state = this._initialState(); this.state.ledger = oldLedger; this._saveAndEmit('reset'); return this.getSnapshot(); }
}

export default KanoDriverEconomyDirector;
