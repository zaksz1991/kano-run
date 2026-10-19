/**
 * Kano Life — Driver Life Events Director
 * Persistent, configurable life-simulation layer for driver finances, household
 * obligations, relationships, vehicle handovers, and social invitations.
 *
 * This module is deliberately independent of Three.js. Call update() from the
 * existing game loop using game-time seconds. Connect emitted events to the
 * existing HUD, economy, audio, and character systems. It does not alter physics.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const money = (v) => Math.round(Math.max(0, Number(v) || 0));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const DEFAULT_PROFILE = {
  name: 'Keke Driver', cash: 0, savings: 0, reputation: 50,
  household: { married: false, children: 0, dailyNeeds: 0, partnerRelationship: 60 },
  relationships: [],
  vehicle: { id: null, ownership: 'owner', ownerId: null, balance: 0, instalment: 0, paymentEveryDays: 7, nextPaymentDay: 7, shift: 'full_day', sharedWith: null },
  expenses: { dailyFood: 0, dailyFuel: 0, dailyOther: 0 },
  wellbeing: { fatigue: 0, stress: 0 },
  day: 1, shift: 'morning', tripsToday: 0, revenueToday: 0, costsToday: 0,
  debts: [], invitations: [], flags: {},
};

function mergeProfile(base, incoming = {}) {
  const out = { ...base, ...incoming };
  for (const key of ['household','vehicle','expenses','wellbeing','flags']) out[key] = { ...base[key], ...(incoming[key] || {}) };
  out.relationships = Array.isArray(incoming.relationships) ? incoming.relationships.map(x => ({ ...x })) : [];
  out.debts = Array.isArray(incoming.debts) ? incoming.debts.map(x => ({ ...x })) : [];
  out.invitations = Array.isArray(incoming.invitations) ? incoming.invitations.map(x => ({ ...x })) : [];
  out.cash = money(out.cash); out.savings = money(out.savings);
  return out;
}

export class KanoDriverLifeEventsDirector {
  constructor(options = {}) {
    this.options = {
      storageKey: 'kano-life-driver-life-v1', autosaveSeconds: 20,
      dailyEventChance: 0.42, relationshipSpendMax: 12000,
      allowNegativeCash: false, dayLengthSeconds: 900, ...options,
    };
    this.profile = mergeProfile(DEFAULT_PROFILE, options.profile || {});
    this.elapsed = 0; this.dayElapsed = 0; this.gameSeconds = 0;
    this.listeners = new Map(); this.disposed = false; this.eventSequence = 0;
    this.lastDailyEventDay = 0; this._storage = options.storage ?? globalThis.localStorage ?? null;
    if (options.load !== false) this.load();
  }

  on(type, fn) {
    if (typeof fn !== 'function') throw new TypeError('Listener must be a function');
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }
  emit(type, detail = {}) {
    const event = { id: `life-${++this.eventSequence}`, type, day: this.profile.day, gameTime: this.gameSeconds, ...detail };
    for (const fn of this.listeners.get(type) || []) { try { fn(event); } catch (e) { console.error(`[KanoLife:${type}]`, e); } }
    for (const fn of this.listeners.get('*') || []) { try { fn(event); } catch (e) { console.error('[KanoLife:*]', e); } }
    return event;
  }

  load() {
    try {
      const raw = this._storage?.getItem(this.options.storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.profile) return false;
      this.profile = mergeProfile(DEFAULT_PROFILE, parsed.profile);
      this.gameSeconds = Math.max(0, Number(parsed.gameSeconds) || 0);
      this.emit('save:loaded', { day: this.profile.day });
      return true;
    } catch (error) { this.emit('save:error', { operation: 'load', message: String(error) }); return false; }
  }
  save() {
    try {
      if (!this._storage) return false;
      this._storage.setItem(this.options.storageKey, JSON.stringify({ version: 1, gameSeconds: this.gameSeconds, profile: this.profile }));
      this.emit('save:complete'); return true;
    } catch (error) { this.emit('save:error', { operation: 'save', message: String(error) }); return false; }
  }

  update(dt, context = {}) {
    if (this.disposed) return;
    const delta = clamp(Number(dt) || 0, 0, 1);
    if (context.paused) return;
    this.elapsed += delta; this.dayElapsed += delta; this.gameSeconds += delta;
    if (this.dayElapsed >= this.options.dayLengthSeconds) this.endDay();
    if (this.elapsed >= this.options.autosaveSeconds) { this.elapsed = 0; this.save(); }
    this.#expireInvitations();
  }

  recordTrip({ fare = 0, fuelCost = 0, ownerPayment = 0, repairCost = 0, fine = 0, passengerRating = 0 } = {}) {
    const p = this.profile;
    const gross = money(fare); const costs = money(fuelCost) + money(ownerPayment) + money(repairCost) + money(fine);
    p.cash = this.#applyCash(gross - costs);
    p.revenueToday += gross; p.costsToday += costs; p.tripsToday += 1;
    p.wellbeing.fatigue = clamp(p.wellbeing.fatigue + 3.5, 0, 100);
    p.wellbeing.stress = clamp(p.wellbeing.stress + (fine ? 8 : 1.5), 0, 100);
    p.reputation = clamp(p.reputation + clamp(Number(passengerRating) || 0, -3, 3), 0, 100);
    this.emit('trip:recorded', { gross, costs, net: gross - costs, cash: p.cash, tripsToday: p.tripsToday });
    return { gross, costs, net: gross - costs, cash: p.cash };
  }

  spend(amount, category = 'other', note = '') {
    amount = money(amount);
    if (!amount) return { ok: true, amount: 0, cash: this.profile.cash };
    if (!this.options.allowNegativeCash && this.profile.cash < amount) {
      this.emit('finance:declined', { amount, category, note, cash: this.profile.cash });
      return { ok: false, reason: 'insufficient_funds', amount, cash: this.profile.cash };
    }
    this.profile.cash -= amount; this.profile.costsToday += amount;
    this.emit('finance:spent', { amount, category, note, cash: this.profile.cash });
    return { ok: true, amount, cash: this.profile.cash };
  }
  depositSavings(amount) {
    amount = money(amount); const result = this.spend(amount, 'savings', 'Deposit into savings');
    if (result.ok) { this.profile.savings += amount; this.emit('savings:deposited', { amount, savings: this.profile.savings }); }
    return result;
  }
  withdrawSavings(amount) {
    amount = money(amount); if (this.profile.savings < amount) return { ok: false, reason: 'insufficient_savings' };
    this.profile.savings -= amount; this.profile.cash += amount;
    this.emit('savings:withdrawn', { amount, savings: this.profile.savings, cash: this.profile.cash });
    return { ok: true, amount, cash: this.profile.cash };
  }

  configureHousehold({ married, children, dailyNeeds, partnerRelationship } = {}) {
    const h = this.profile.household;
    if (married !== undefined) h.married = Boolean(married);
    if (children !== undefined) h.children = clamp(Math.floor(Number(children) || 0), 0, 12);
    if (dailyNeeds !== undefined) h.dailyNeeds = money(dailyNeeds);
    if (partnerRelationship !== undefined) h.partnerRelationship = clamp(Number(partnerRelationship) || 0, 0, 100);
    this.emit('household:updated', { household: { ...h } });
  }
  addRelationship({ id, type = 'friend', name = 'Contact', affinity = 50, spendingPressure = 0 } = {}) {
    if (!id) throw new TypeError('Relationship requires a unique id');
    const existing = this.profile.relationships.find(r => r.id === id);
    if (existing) return existing;
    const relation = { id, type, name, affinity: clamp(Number(affinity) || 0, 0, 100), spendingPressure: clamp(Number(spendingPressure) || 0, 0, 1), lastInteractionDay: this.profile.day };
    this.profile.relationships.push(relation); this.emit('relationship:added', { relationship: { ...relation } }); return relation;
  }
  interactRelationship(id, { spend = 0, affinityChange = 0, activity = 'visit' } = {}) {
    const relation = this.profile.relationships.find(r => r.id === id);
    if (!relation) return { ok: false, reason: 'relationship_not_found' };
    const cost = money(spend); const result = this.spend(cost, `relationship:${relation.type}`, activity);
    if (!result.ok) return result;
    relation.affinity = clamp(relation.affinity + (Number(affinityChange) || 0), 0, 100);
    relation.lastInteractionDay = this.profile.day;
    if (this.profile.household.married && relation.type === 'romantic') this.profile.household.partnerRelationship = clamp(this.profile.household.partnerRelationship - Math.ceil(cost / 2500), 0, 100);
    this.emit('relationship:interaction', { relationship: { ...relation }, activity, spend: cost });
    return { ok: true, affinity: relation.affinity, cash: this.profile.cash };
  }

  createDebt({ id, creditor, amount, dueDay, label = 'Payment', lateFee = 0 } = {}) {
    if (!id || !Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new TypeError('Debt requires id and positive amount');
    const debt = { id, creditor: creditor || 'Vehicle owner', amount: money(amount), dueDay: Math.max(this.profile.day, Math.floor(Number(dueDay) || this.profile.day + 1)), label, lateFee: money(lateFee), status: 'due', lateDays: 0 };
    this.profile.debts.push(debt); this.emit('debt:created', { debt: { ...debt } }); return debt;
  }
  payDebt(id, amount) {
    const debt = this.profile.debts.find(d => d.id === id && d.status !== 'paid');
    if (!debt) return { ok: false, reason: 'debt_not_found' };
    const payment = Math.min(money(amount ?? debt.amount), debt.amount);
    const result = this.spend(payment, 'debt_payment', debt.label);
    if (!result.ok) return result;
    debt.amount -= payment;
    if (debt.amount === 0) { debt.status = 'paid'; this.emit('debt:paid', { debt: { ...debt } }); }
    else this.emit('debt:partial_payment', { debt: { ...debt }, payment });
    return { ok: true, remaining: debt.amount, cash: this.profile.cash };
  }

  handover({ toDriverId, fuelPercent = 100, condition = 100, note = '' } = {}) {
    const v = this.profile.vehicle;
    if (v.shift !== 'shared' && v.sharedWith == null) return { ok: false, reason: 'vehicle_not_shared' };
    const report = { vehicleId: v.id, fromShift: this.profile.shift, toDriverId: toDriverId || v.sharedWith, fuelPercent: clamp(Number(fuelPercent) || 0, 0, 100), condition: clamp(Number(condition) || 0, 0, 100), note, day: this.profile.day };
    this.emit('vehicle:handover', report); this.profile.flags.lastHandover = report; return { ok: true, report };
  }

  invite({ id, type = 'social', title = 'Community event', location = null, startsIn = 60, reward = 0, risk = 0.1, expiresIn = 300 } = {}) {
    if (!id) throw new TypeError('Invitation requires a unique id');
    const invitation = { id, type, title, location, createdAt: this.gameSeconds, startsAt: this.gameSeconds + Math.max(0, Number(startsIn) || 0), expiresAt: this.gameSeconds + Math.max(1, Number(expiresIn) || 300), reward: money(reward), risk: clamp(Number(risk) || 0, 0, 1), status: 'pending' };
    this.profile.invitations.push(invitation); this.emit('invitation:received', { invitation: { ...invitation } }); return invitation;
  }
  respondInvitation(id, accept) {
    const invitation = this.profile.invitations.find(i => i.id === id && i.status === 'pending');
    if (!invitation) return { ok: false, reason: 'invitation_unavailable' };
    invitation.status = accept ? 'accepted' : 'declined';
    this.emit(accept ? 'invitation:accepted' : 'invitation:declined', { invitation: { ...invitation } });
    return { ok: true, invitation: { ...invitation } };
  }

  endDay() {
    const p = this.profile; this.dayElapsed = 0;
    const householdCost = p.household.dailyNeeds;
    const foodCost = p.expenses.dailyFood;
    const total = householdCost + foodCost + p.expenses.dailyOther;
    const paid = this.spend(total, 'daily_living', 'Daily household, food, and other expenses');
    if (!paid.ok) {
      p.household.partnerRelationship = clamp(p.household.partnerRelationship - (p.household.married ? 4 : 0), 0, 100);
      this.emit('household:shortfall', { amount: total, cash: p.cash });
    }
    p.wellbeing.fatigue = clamp(p.wellbeing.fatigue - 28, 0, 100);
    p.wellbeing.stress = clamp(p.wellbeing.stress - 12, 0, 100);
    for (const debt of p.debts) if (debt.status !== 'paid' && debt.dueDay < p.day + 1) {
      debt.lateDays += 1; debt.status = 'late'; debt.amount += debt.lateFee;
      this.emit('debt:overdue', { debt: { ...debt } });
    }
    const summary = { day: p.day, trips: p.tripsToday, revenue: p.revenueToday, costs: p.costsToday, cash: p.cash, savings: p.savings, householdPaid: paid.ok };
    this.emit('day:ended', summary);
    p.day += 1; p.tripsToday = 0; p.revenueToday = 0; p.costsToday = 0;
    p.shift = 'morning';
    if (Math.random() < this.options.dailyEventChance) this.#generateLifeEvent();
    this.save();
    return summary;
  }

  #generateLifeEvent() {
    const p = this.profile; const candidates = [];
    if (p.vehicle.ownership === 'hire_purchase' || p.vehicle.ownership === 'weekly_remittance' || p.vehicle.ownership === 'monthly_remittance') candidates.push({ type: 'owner_payment_reminder', title: 'Vehicle payment reminder', description: 'The vehicle owner asks about the next payment.', urgency: 0.7 });
    if (p.household.married || p.household.children > 0) candidates.push({ type: 'family_request', title: 'Family needs support', description: 'A household expense competes with today’s operating money.', urgency: 0.55 });
    if (p.relationships.length) candidates.push({ type: 'social_invitation', title: 'A friend has invited you out', description: 'Accepting may cost money but can strengthen a relationship.', urgency: 0.3 });
    candidates.push({ type: 'market_opportunity', title: 'Busy market opportunity', description: 'A market area is expected to have strong passenger demand.', urgency: 0.4 });
    this.emit('life:event', pick(candidates));
  }
  #expireInvitations() {
    for (const i of this.profile.invitations) if (i.status === 'pending' && this.gameSeconds > i.expiresAt) {
      i.status = 'expired'; this.emit('invitation:expired', { invitation: { ...i } });
    }
  }
  #applyCash(delta) { this.profile.cash = this.options.allowNegativeCash ? this.profile.cash + delta : Math.max(0, this.profile.cash + delta); return this.profile.cash; }

  getSnapshot() {
    const p = this.profile;
    return { day: p.day, shift: p.shift, cash: p.cash, savings: p.savings, reputation: p.reputation, tripsToday: p.tripsToday, revenueToday: p.revenueToday, costsToday: p.costsToday, household: { ...p.household }, vehicle: { ...p.vehicle }, wellbeing: { ...p.wellbeing }, outstandingDebts: p.debts.filter(d => d.status !== 'paid').map(d => ({ ...d })), pendingInvitations: p.invitations.filter(i => i.status === 'pending').map(i => ({ ...i })) };
  }
  dispose({ save = true } = {}) { if (save) this.save(); this.disposed = true; this.listeners.clear(); }
}
