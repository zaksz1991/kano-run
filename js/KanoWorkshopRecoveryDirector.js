/**
 * KANO LIFE — Workshop & Recovery Director
 * Standalone simulation module. It does not move Three.js meshes or charge a wallet.
 * The host game must confirm payment before calling completeRepair().
 */
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const uid = (prefix = 'job') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const COMPONENTS = {
  tyre: { label: 'Tyre / tube', base: 1800, minutes: 12, parts: 'tyre, tube, patch kit' },
  engine: { label: 'Engine', base: 8500, minutes: 75, parts: 'engine parts, oil' },
  cooling: { label: 'Cooling system', base: 3200, minutes: 30, parts: 'coolant, hose, clamps' },
  brakes: { label: 'Brakes', base: 2800, minutes: 25, parts: 'brake cable, pads' },
  suspension: { label: 'Suspension', base: 4200, minutes: 45, parts: 'spring, bushings' },
  electrical: { label: 'Electrical', base: 2600, minutes: 35, parts: 'wiring, connectors' },
  body: { label: 'Bodywork', base: 2200, minutes: 40, parts: 'panels, fasteners' },
};

export class KanoWorkshopRecoveryDirector {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'kano-life-workshop-recovery-v1';
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.workshops = new Map();
    this.jobs = new Map();
    this.recoveryCalls = new Map();
    this.sequence = 0;
    this.registerDefaultWorkshops();
    if (options.autoLoad !== false) this.load();
  }

  registerDefaultWorkshops() {
    const defaults = [
      ['kano-central', 'Kano Central Mechanics', 'central', 1.0, 0.95, 0.9],
      ['sabon-gari', 'Sabon Gari Workshop Row', 'market', 0.92, 1.0, 0.82],
      ['kumbotso', 'Kumbotso Roadside Mechanics', 'roadside', 0.78, 0.72, 0.9],
      ['naibawa', 'Naibawa Repair Yard', 'yard', 0.86, 0.88, 0.95],
    ];
    defaults.forEach(([id, name, district, quality, stock, recovery]) => this.registerWorkshop({ id, name, district, quality, stock, recovery }));
  }

  registerWorkshop(data) {
    if (!data?.id || !data?.name) throw new Error('Workshop id and name are required.');
    const workshop = {
      id: String(data.id), name: String(data.name), district: String(data.district || 'Kano'),
      quality: clamp(data.quality ?? 0.8, 0.3, 1.25), stock: clamp(data.stock ?? 0.8, 0, 1),
      recovery: clamp(data.recovery ?? 0.8, 0.3, 1.2), priceMultiplier: clamp(data.priceMultiplier ?? 1, 0.5, 2.5),
      open: data.open !== false, reputation: clamp(data.reputation ?? 50, 0, 100),
    };
    this.workshops.set(workshop.id, workshop);
    return { ...workshop };
  }

  listWorkshops({ openOnly = true } = {}) {
    return [...this.workshops.values()].filter(w => !openOnly || w.open).map(w => ({ ...w }));
  }

  setWorkshopOpen(workshopId, open) {
    const w = this.workshops.get(workshopId);
    if (!w) return { ok: false, reason: 'workshop_not_found' };
    w.open = Boolean(open); this.emit('workshop_open_changed', { workshopId, open: w.open });
    this.save(); return { ok: true, workshop: { ...w } };
  }

  quoteRepair({ workshopId, vehicleId, component, severity = 0.5, urgency = 'normal', roadside = false } = {}) {
    const w = this.workshops.get(workshopId);
    if (!w) return { ok: false, reason: 'workshop_not_found' };
    if (!w.open) return { ok: false, reason: 'workshop_closed' };
    if (!COMPONENTS[component]) return { ok: false, reason: 'unknown_component' };
    const spec = COMPONENTS[component];
    const sev = clamp(severity, 0.05, 1);
    const stockPenalty = w.stock < 0.35 ? 1.25 : w.stock < 0.65 ? 1.1 : 1;
    const roadsideMultiplier = roadside ? 1.35 : 1;
    const urgencyMultiplier = urgency === 'urgent' ? 1.25 : urgency === 'emergency' ? 1.5 : 1;
    const qualityMultiplier = 0.78 + w.quality * 0.32;
    const partsCost = Math.round(spec.base * (0.45 + sev * 0.55) * stockPenalty);
    const labourCost = Math.round(spec.base * 0.45 * w.priceMultiplier * roadsideMultiplier * urgencyMultiplier * qualityMultiplier);
    const durationMinutes = Math.max(5, Math.round(spec.minutes * (0.6 + sev * 0.8) / Math.max(0.55, w.quality) * (roadside ? 1.25 : 1)));
    return {
      ok: true, quoteId: uid('quote'), workshopId, workshopName: w.name, vehicleId: vehicleId || null,
      component, componentLabel: spec.label, severity: sev, parts: spec.parts, partsCost, labourCost,
      totalCost: partsCost + labourCost, durationMinutes, roadside: Boolean(roadside), urgency,
      estimatedQualityGain: Math.round((18 + w.quality * 22) * (1 - sev * 0.25)), expiresAt: Date.now() + 5 * 60_000,
      paymentRequired: true,
    };
  }

  bookRepair(quote, options = {}) {
    if (!quote?.ok || !quote.quoteId || !this.workshops.has(quote.workshopId)) return { ok: false, reason: 'invalid_quote' };
    if (quote.expiresAt < Date.now()) return { ok: false, reason: 'quote_expired' };
    if ([...this.jobs.values()].some(j => j.quoteId === quote.quoteId)) return { ok: false, reason: 'already_booked' };
    const job = {
      id: uid('repair'), quoteId: quote.quoteId, workshopId: quote.workshopId, vehicleId: quote.vehicleId,
      component: quote.component, componentLabel: quote.componentLabel, cost: quote.totalCost,
      durationMinutes: quote.durationMinutes, remainingMinutes: quote.durationMinutes,
      status: options.paymentConfirmed === true ? 'in_progress' : 'awaiting_payment',
      paymentReference: options.paymentReference || null, createdAt: Date.now(), updatedAt: Date.now(),
      qualityGain: quote.estimatedQualityGain, roadside: quote.roadside,
    };
    this.jobs.set(job.id, job);
    this.emit('repair_booked', { job: { ...job } }); this.save();
    return { ok: true, job: { ...job }, paymentRequired: job.status === 'awaiting_payment' };
  }

  /** Call only after the existing wallet/payment system confirms a successful charge. */
  confirmRepairPayment(jobId, paymentReference) {
    const job = this.jobs.get(jobId);
    if (!job) return { ok: false, reason: 'job_not_found' };
    if (job.status !== 'awaiting_payment') return { ok: false, reason: 'invalid_job_state', status: job.status };
    if (!paymentReference) return { ok: false, reason: 'payment_reference_required' };
    job.paymentReference = String(paymentReference); job.status = 'in_progress'; job.updatedAt = Date.now();
    this.emit('repair_started', { job: { ...job } }); this.save(); return { ok: true, job: { ...job } };
  }

  advanceWorkshopTime(minutes) {
    const elapsed = clamp(minutes, 0, 24 * 60);
    const completed = [];
    for (const job of this.jobs.values()) {
      if (job.status !== 'in_progress') continue;
      job.remainingMinutes = Math.max(0, job.remainingMinutes - elapsed); job.updatedAt = Date.now();
      if (job.remainingMinutes === 0) { job.status = 'ready_for_pickup'; completed.push({ ...job }); this.emit('repair_ready', { job: { ...job } }); }
    }
    if (elapsed > 0) this.save();
    return { elapsedMinutes: elapsed, completed, activeJobs: this.listJobs({ statuses: ['in_progress'] }).length };
  }

  completeRepair(jobId, options = {}) {
    const job = this.jobs.get(jobId);
    if (!job) return { ok: false, reason: 'job_not_found' };
    if (job.status !== 'ready_for_pickup') return { ok: false, reason: 'repair_not_ready', status: job.status };
    job.status = 'completed'; job.completedAt = Date.now(); job.updatedAt = Date.now();
    const result = { ok: true, job: { ...job }, vehicleId: job.vehicleId, component: job.component, qualityGain: job.qualityGain, walletAlreadyHandled: true, maintenanceRecord: { type: 'repair', component: job.component, cost: job.cost, at: job.completedAt, workshopId: job.workshopId, paymentReference: job.paymentReference } };
    this.emit('repair_completed', result); this.save(); return result;
  }

  requestRecovery({ vehicleId, location, severity = 'breakdown', distanceKm = 3, timeOfDay = 12 } = {}) {
    if (!vehicleId) return { ok: false, reason: 'vehicle_id_required' };
    const nearby = [...this.workshops.values()].filter(w => w.open).sort((a, b) => a.recovery - b.recovery)[0];
    if (!nearby) return { ok: false, reason: 'no_recovery_available' };
    const distance = clamp(distanceKm, 0, 100);
    const afterHours = Number(timeOfDay) < 6 || Number(timeOfDay) >= 22;
    const base = severity === 'crash' ? 6500 : severity === 'engine_failure' ? 5000 : 3000;
    const fee = Math.round((base + distance * 450) * (afterHours ? 1.3 : 1) / Math.max(0.6, nearby.recovery));
    const call = {
      id: uid('recovery'), vehicleId: String(vehicleId), location: location || 'Unknown roadside location',
      severity, distanceKm: distance, workshopId: nearby.id, workshopName: nearby.name, fee,
      status: 'awaiting_confirmation', createdAt: Date.now(), etaMinutes: Math.max(5, Math.round(8 + distance * 3 / nearby.recovery)),
      paymentRequired: true,
    };
    this.recoveryCalls.set(call.id, call); this.emit('recovery_requested', { call: { ...call } }); this.save();
    return { ok: true, call: { ...call }, walletActionRequired: 'Obtain explicit player confirmation, then process fee through the existing wallet.' };
  }

  confirmRecoveryPayment(callId, paymentReference) {
    const call = this.recoveryCalls.get(callId);
    if (!call) return { ok: false, reason: 'recovery_not_found' };
    if (call.status !== 'awaiting_confirmation') return { ok: false, reason: 'invalid_recovery_state' };
    if (!paymentReference) return { ok: false, reason: 'payment_reference_required' };
    call.status = 'dispatched'; call.paymentReference = String(paymentReference); call.dispatchedAt = Date.now();
    this.emit('recovery_dispatched', { call: { ...call } }); this.save(); return { ok: true, call: { ...call } };
  }

  advanceRecoveryTime(minutes) {
    const elapsed = clamp(minutes, 0, 24 * 60); const arrived = [];
    for (const call of this.recoveryCalls.values()) {
      if (call.status !== 'dispatched') continue;
      call.etaMinutes = Math.max(0, call.etaMinutes - elapsed);
      if (call.etaMinutes === 0) { call.status = 'arrived'; call.arrivedAt = Date.now(); arrived.push({ ...call }); this.emit('recovery_arrived', { call: { ...call } }); }
    }
    if (elapsed > 0) this.save(); return { arrived, active: [...this.recoveryCalls.values()].filter(c => c.status === 'dispatched').length };
  }

  listJobs({ vehicleId, statuses } = {}) {
    return [...this.jobs.values()].filter(j => !vehicleId || j.vehicleId === vehicleId).filter(j => !statuses || statuses.includes(j.status)).map(j => ({ ...j }));
  }
  listRecoveryCalls({ vehicleId } = {}) { return [...this.recoveryCalls.values()].filter(c => !vehicleId || c.vehicleId === vehicleId).map(c => ({ ...c })); }
  getSnapshot() { return { version: 1, workshops: this.listWorkshops({ openOnly: false }), jobs: this.listJobs(), recoveryCalls: this.listRecoveryCalls(), generatedAt: Date.now() }; }
  exportState() { return JSON.stringify(this.getSnapshot()); }

  importState(serialized) {
    try {
      const data = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
      if (!data || data.version !== 1 || !Array.isArray(data.workshops) || !Array.isArray(data.jobs) || !Array.isArray(data.recoveryCalls)) return { ok: false, reason: 'invalid_state_format' };
      this.workshops.clear(); this.jobs.clear(); this.recoveryCalls.clear();
      data.workshops.forEach(w => this.registerWorkshop(w));
      data.jobs.forEach(j => { if (j?.id && j?.status) this.jobs.set(j.id, j); });
      data.recoveryCalls.forEach(c => { if (c?.id && c?.status) this.recoveryCalls.set(c.id, c); });
      this.save(); return { ok: true, workshops: this.workshops.size, jobs: this.jobs.size, recoveryCalls: this.recoveryCalls.size };
    } catch (error) { return { ok: false, reason: 'parse_error', message: error.message }; }
  }
  save() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(this.storageKey, this.exportState()); return true; }
    catch (error) { this.emit('storage_error', { message: error.message }); return false; }
  }
  load() {
    try { if (typeof localStorage === 'undefined') return { ok: false, reason: 'storage_unavailable' }; const raw = localStorage.getItem(this.storageKey); return raw ? this.importState(raw) : { ok: true, empty: true }; }
    catch (error) { this.emit('storage_error', { message: error.message }); return { ok: false, reason: 'storage_error' }; }
  }
  emit(type, detail = {}) { this.onEvent({ type, detail, at: Date.now(), sequence: ++this.sequence }); }
}

export { COMPONENTS as KANO_REPAIR_COMPONENTS };
