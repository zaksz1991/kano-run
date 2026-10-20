// ============================================================
// KANO LIFE — WORKSHOP & RECOVERY DIRECTOR
// File: js/KanoWorkshopRecoveryDirector.js
//
// Corrected integration version.
//
// Responsibilities:
// - Kano workshop directory and operating status
// - Repair estimates, bookings, and repair progress
// - Explicitly confirmed repair payment tracking
// - Roadside recovery requests, dispatch, and arrival
// - Persistent simulation state
//
// The wallet bridge remains responsible for charging money.
// This module never charges the player's wallet.
//
// Compatibility:
// - Preserves the existing public method names.
// - Preserves storage version 1.
// - Preserves existing recovery status values.
// - Preserves existing event callback structure.
// ============================================================

const clamp = (value, min, max) => {
  const parsed = Number(value);
  return Math.max(
    min,
    Math.min(max, Number.isFinite(parsed) ? parsed : 0),
  );
};

const makeId = (prefix = 'job') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;

const timestamp = () => Date.now();

const clone = (value) => {
  if (value === undefined || value === null) return value;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const COMPONENTS = Object.freeze({
  tyre: {
    label: 'Tyre / tube',
    base: 1800,
    minutes: 12,
    parts: 'Tyre, tube, patch kit',
  },
  tyres: {
    label: 'Tyres',
    base: 1800,
    minutes: 12,
    parts: 'Tyre, tube, patch kit',
  },
  engine: {
    label: 'Engine',
    base: 8500,
    minutes: 75,
    parts: 'Engine parts, oil',
  },
  cooling: {
    label: 'Cooling system',
    base: 3200,
    minutes: 30,
    parts: 'Coolant, hose, clamps',
  },
  brakes: {
    label: 'Brakes',
    base: 2800,
    minutes: 25,
    parts: 'Brake cable, pads',
  },
  suspension: {
    label: 'Suspension',
    base: 4200,
    minutes: 45,
    parts: 'Springs, bushings',
  },
  electrical: {
    label: 'Electrical system',
    base: 2600,
    minutes: 35,
    parts: 'Wiring, connectors',
  },
  body: {
    label: 'Bodywork',
    base: 2200,
    minutes: 40,
    parts: 'Panels, fasteners',
  },
});

const RECOVERY_REASONS = Object.freeze({
  breakdown: {
    label: 'Mechanical breakdown',
    baseFee: 3000,
  },
  engine_failure: {
    label: 'Engine failure',
    baseFee: 5000,
  },
  crash: {
    label: 'Serious crash',
    baseFee: 6500,
  },
  collision: {
    label: 'Collision damage',
    baseFee: 4500,
  },
  stuck: {
    label: 'Vehicle stuck',
    baseFee: 3500,
  },
  overheating: {
    label: 'Overheating',
    baseFee: 3200,
  },
});

const DEFAULT_WORKSHOPS = [
  {
    id: 'kano-central',
    name: 'Kano Central Mechanics',
    district: 'central',
    quality: 1,
    stock: 0.95,
    recovery: 0.9,
  },
  {
    id: 'sabon-gari',
    name: 'Sabon Gari Workshop Row',
    district: 'market',
    quality: 0.92,
    stock: 1,
    recovery: 0.82,
  },
  {
    id: 'kumbotso',
    name: 'Kumbotso Roadside Mechanics',
    district: 'roadside',
    quality: 0.78,
    stock: 0.72,
    recovery: 0.9,
  },
  {
    id: 'naibawa',
    name: 'Naibawa Repair Yard',
    district: 'yard',
    quality: 0.86,
    stock: 0.88,
    recovery: 0.95,
  },
];

const VALID_JOB_STATUSES = new Set([
  'awaiting_payment',
  'in_progress',
  'ready_for_pickup',
  'completed',
]);

const VALID_RECOVERY_STATUSES = new Set([
  'awaiting_confirmation',
  'dispatched',
  'arrived',
  'completed',
]);

const normaliseComponent = (value) => {
  const component = String(value || '')
    .trim()
    .toLowerCase();

  if (component === 'tyre' || component === 'tyres') {
    return 'tyres';
  }

  return component;
};

export class KanoWorkshopRecoveryDirector {
  constructor(options = {}) {
    this.storageKey =
      options.storageKey ||
      'kano-life-workshop-recovery-v1';

    this.onEvent =
      typeof options.onEvent === 'function'
        ? options.onEvent
        : () => {};

    this.workshops = new Map();
    this.jobs = new Map();
    this.recoveryCalls = new Map();

    this.sequence = 0;
    this.destroyed = false;

    this.registerDefaultWorkshops();

    if (options.autoLoad !== false) {
      this.load();
    }
  }

  // ----------------------------------------------------------
  // Lifecycle and events
  // ----------------------------------------------------------

  assertActive() {
    if (this.destroyed) {
      throw new Error(
        'KanoWorkshopRecoveryDirector has been disposed.',
      );
    }
  }

  emit(type, detail = {}) {
    if (this.destroyed) return;

    const event = {
      type,
      detail: clone(detail),
      at: timestamp(),
      sequence: ++this.sequence,
    };

    try {
      this.onEvent(event);
    } catch (error) {
      console.error(
        '[KanoWorkshopRecoveryDirector] Event callback failed:',
        error,
      );
    }
  }

  dispose() {
    if (this.destroyed) return;

    this.destroyed = true;
    this.onEvent = () => {};
  }

  // ----------------------------------------------------------
  // Workshops
  // ----------------------------------------------------------

  registerDefaultWorkshops() {
    DEFAULT_WORKSHOPS.forEach((workshop) => {
      this.registerWorkshop(workshop);
    });
  }

  registerWorkshop(data = {}) {
    this.assertActive();

    if (!data.id || !data.name) {
      throw new Error('Workshop id and name are required.');
    }

    const workshop = {
      id: String(data.id),
      name: String(data.name),
      district: String(data.district || 'Kano'),
      quality: clamp(data.quality ?? 0.8, 0.3, 1.25),
      stock: clamp(data.stock ?? 0.8, 0, 1),
      recovery: clamp(data.recovery ?? 0.8, 0.3, 1.2),
      priceMultiplier: clamp(
        data.priceMultiplier ?? 1,
        0.5,
        2.5,
      ),
      open: data.open !== false,
      reputation: clamp(data.reputation ?? 50, 0, 100),
    };

    this.workshops.set(workshop.id, workshop);

    this.save();

    return { ...workshop };
  }

  getWorkshop(workshopId) {
    this.assertActive();

    const workshop = this.workshops.get(String(workshopId));

    return workshop ? { ...workshop } : null;
  }

  listWorkshops({ openOnly = true } = {}) {
    this.assertActive();

    return [...this.workshops.values()]
      .filter((workshop) => !openOnly || workshop.open)
      .map((workshop) => ({ ...workshop }));
  }

  setWorkshopOpen(workshopId, open) {
    this.assertActive();

    const workshop = this.workshops.get(String(workshopId));

    if (!workshop) {
      return {
        ok: false,
        reason: 'workshop_not_found',
      };
    }

    workshop.open = Boolean(open);

    this.emit('workshop_open_changed', {
      workshopId: workshop.id,
      open: workshop.open,
    });

    const persisted = this.save();

    return {
      ok: true,
      persisted,
      workshop: { ...workshop },
    };
  }

  // ----------------------------------------------------------
  // Repair estimates
  // ----------------------------------------------------------

  quoteRepair({
    workshopId,
    vehicleId,
    component,
    severity = 0.5,
    urgency = 'normal',
    roadside = false,
  } = {}) {
    this.assertActive();

    const workshop = this.workshops.get(String(workshopId));

    if (!workshop) {
      return { ok: false, reason: 'workshop_not_found' };
    }

    if (!workshop.open) {
      return { ok: false, reason: 'workshop_closed' };
    }

    const normalizedComponent = normaliseComponent(component);
    const spec = COMPONENTS[normalizedComponent];

    if (!spec) {
      return { ok: false, reason: 'unknown_component' };
    }

    const normalizedUrgency = [
      'normal',
      'urgent',
      'emergency',
    ].includes(urgency)
      ? urgency
      : 'normal';

    const normalizedSeverity = clamp(severity, 0.05, 1);

    const stockPenalty =
      workshop.stock < 0.35
        ? 1.25
        : workshop.stock < 0.65
          ? 1.1
          : 1;

    const roadsideMultiplier = roadside ? 1.35 : 1;

    const urgencyMultiplier = {
      normal: 1,
      urgent: 1.25,
      emergency: 1.5,
    }[normalizedUrgency];

    const qualityMultiplier =
      0.78 + workshop.quality * 0.32;

    const partsCost = Math.round(
      spec.base *
        (0.45 + normalizedSeverity * 0.55) *
        stockPenalty,
    );

    const labourCost = Math.round(
      spec.base *
        0.45 *
        workshop.priceMultiplier *
        roadsideMultiplier *
        urgencyMultiplier *
        qualityMultiplier,
    );

    const durationMinutes = Math.max(
      5,
      Math.round(
        (spec.minutes *
          (0.6 + normalizedSeverity * 0.8)) /
          Math.max(0.55, workshop.quality) *
          (roadside ? 1.25 : 1),
      ),
    );

    const createdAt = timestamp();

    return {
      ok: true,
      quoteId: makeId('quote'),
      workshopId: workshop.id,
      workshopName: workshop.name,
      vehicleId: vehicleId ? String(vehicleId) : null,
      component: normalizedComponent,
      componentLabel: spec.label,
      severity: normalizedSeverity,
      parts: spec.parts,
      partsCost,
      labourCost,
      totalCost: partsCost + labourCost,
      durationMinutes,
      roadside: Boolean(roadside),
      urgency: normalizedUrgency,
      estimatedQualityGain: Math.round(
        (18 + workshop.quality * 22) *
          (1 - normalizedSeverity * 0.25),
      ),
      createdAt,
      expiresAt: createdAt + 5 * 60_000,
      paymentRequired: true,
    };
  }

  // ----------------------------------------------------------
  // Repair booking and payment state
  // ----------------------------------------------------------

  bookRepair(quote, options = {}) {
    this.assertActive();

    if (
      !quote?.ok ||
      !quote.quoteId ||
      !quote.workshopId ||
      !COMPONENTS[normaliseComponent(quote.component)]
    ) {
      return { ok: false, reason: 'invalid_quote' };
    }

    const workshop = this.workshops.get(String(quote.workshopId));

    if (!workshop) {
      return { ok: false, reason: 'workshop_not_found' };
    }

    if (!workshop.open) {
      return { ok: false, reason: 'workshop_closed' };
    }

    if (
      !Number.isFinite(Number(quote.expiresAt)) ||
      Number(quote.expiresAt) < timestamp()
    ) {
      return { ok: false, reason: 'quote_expired' };
    }

    const alreadyBooked = [...this.jobs.values()].some(
      (job) => job.quoteId === quote.quoteId,
    );

    if (alreadyBooked) {
      return { ok: false, reason: 'already_booked' };
    }

    const paymentConfirmed = options.paymentConfirmed === true;
    const paymentReference = options.paymentReference;

    if (paymentConfirmed && !paymentReference) {
      return {
        ok: false,
        reason: 'payment_reference_required',
      };
    }

    const durationMinutes = Math.max(
      1,
      Math.round(Number(quote.durationMinutes) || 1),
    );

    const job = {
      id: makeId('repair'),
      quoteId: quote.quoteId,
      workshopId: workshop.id,
      workshopName: workshop.name,
      vehicleId: quote.vehicleId || null,
      component: normaliseComponent(quote.component),
      componentLabel:
        quote.componentLabel ||
        COMPONENTS[normaliseComponent(quote.component)].label,
      cost: Math.max(0, Math.round(Number(quote.totalCost) || 0)),
      durationMinutes,
      remainingMinutes: durationMinutes,
      status: paymentConfirmed
        ? 'in_progress'
        : 'awaiting_payment',
      paymentReference: paymentConfirmed
        ? String(paymentReference)
        : null,
      createdAt: timestamp(),
      updatedAt: timestamp(),
      qualityGain: Math.max(
        0,
        Math.round(Number(quote.estimatedQualityGain) || 0),
      ),
      roadside: Boolean(quote.roadside),
    };

    this.jobs.set(job.id, job);

    this.emit('repair_booked', { job });

    const persisted = this.save();

    return {
      ok: true,
      job: { ...job },
      paymentRequired: job.status === 'awaiting_payment',
      persisted,
    };
  }

  confirmRepairPayment(jobId, paymentReference) {
    this.assertActive();

    const job = this.jobs.get(String(jobId));

    if (!job) {
      return { ok: false, reason: 'job_not_found' };
    }

    if (job.status !== 'awaiting_payment') {
      return {
        ok: false,
        reason: 'invalid_job_state',
        status: job.status,
      };
    }

    if (!paymentReference) {
      return {
        ok: false,
        reason: 'payment_reference_required',
      };
    }

    job.paymentReference = String(paymentReference);
    job.status = 'in_progress';
    job.updatedAt = timestamp();

    this.emit('repair_started', { job });

    const persisted = this.save();

    return {
      ok: true,
      job: { ...job },
      persisted,
    };
  }

  advanceWorkshopTime(minutes) {
    this.assertActive();

    const elapsed = clamp(minutes, 0, 24 * 60);
    const completed = [];

    for (const job of this.jobs.values()) {
      if (job.status !== 'in_progress') continue;

      job.remainingMinutes = Math.max(
        0,
        job.remainingMinutes - elapsed,
      );

      job.updatedAt = timestamp();

      if (job.remainingMinutes === 0) {
        job.status = 'ready_for_pickup';
        completed.push({ ...job });
        this.emit('repair_ready', { job });
      }
    }

    const persisted = elapsed <= 0 ? true : this.save();

    return {
      elapsedMinutes: elapsed,
      completed,
      activeJobs: this.listJobs({
        statuses: ['in_progress'],
      }).length,
      persisted,
    };
  }

  completeRepair(jobId) {
    this.assertActive();

    const job = this.jobs.get(String(jobId));

    if (!job) {
      return { ok: false, reason: 'job_not_found' };
    }

    if (job.status !== 'ready_for_pickup') {
      return {
        ok: false,
        reason: 'repair_not_ready',
        status: job.status,
      };
    }

    job.status = 'completed';
    job.completedAt = timestamp();
    job.updatedAt = timestamp();

    const result = {
      ok: true,
      job: { ...job },
      vehicleId: job.vehicleId,
      component: job.component,
      qualityGain: job.qualityGain,
      walletAlreadyHandled: true,
      maintenanceRecord: {
        type: 'repair',
        component: job.component,
        cost: job.cost,
        at: job.completedAt,
        workshopId: job.workshopId,
        paymentReference: job.paymentReference,
      },
    };

    this.emit('repair_completed', result);

    const persisted = this.save();

    return {
      ...result,
      persisted,
    };
  }

  // ----------------------------------------------------------
  // Roadside recovery
  // ----------------------------------------------------------

  requestRecovery({
    vehicleId,
    location,
    severity = 'breakdown',
    distanceKm = 3,
    timeOfDay = 12,
  } = {}) {
    this.assertActive();

    if (!vehicleId) {
      return {
        ok: false,
        reason: 'vehicle_id_required',
      };
    }

    const reason = RECOVERY_REASONS[severity]
      ? severity
      : 'breakdown';

    const reasonSpec = RECOVERY_REASONS[reason];

    // Prefer the strongest available recovery rating.
    // Use lower price and then name as deterministic tie-breakers.
    const availableWorkshops = [...this.workshops.values()]
      .filter((workshop) => workshop.open)
      .sort(
        (a, b) =>
          b.recovery - a.recovery ||
          a.priceMultiplier - b.priceMultiplier ||
          a.name.localeCompare(b.name),
      );

    const workshop = availableWorkshops[0];

    if (!workshop) {
      return {
        ok: false,
        reason: 'no_recovery_available',
      };
    }

    const distance = clamp(distanceKm, 0, 100);
    const hour = clamp(timeOfDay, 0, 24);
    const afterHours = hour < 6 || hour >= 22;

    const fee = Math.round(
      ((reasonSpec.baseFee + distance * 450) *
        (afterHours ? 1.3 : 1)) /
        Math.max(0.6, workshop.recovery),
    );

    const call = {
      id: makeId('recovery'),
      vehicleId: String(vehicleId),
      location: String(location || 'Unknown roadside location'),
      severity: reason,
      severityLabel: reasonSpec.label,
      distanceKm: distance,
      workshopId: workshop.id,
      workshopName: workshop.name,
      fee,
      status: 'awaiting_confirmation',
      createdAt: timestamp(),
      etaMinutes: Math.max(
        5,
        Math.round((8 + (distance * 3) / workshop.recovery)),
      ),
      paymentRequired: true,
    };

    this.recoveryCalls.set(call.id, call);

    this.emit('recovery_requested', { call });

    const persisted = this.save();

    return {
      ok: true,
      call: { ...call },
      persisted,
      walletActionRequired:
        'Obtain explicit player confirmation, then process the fee through the existing wallet.',
    };
  }

  confirmRecoveryPayment(callId, paymentReference) {
    this.assertActive();

    const call = this.recoveryCalls.get(String(callId));

    if (!call) {
      return {
        ok: false,
        reason: 'recovery_not_found',
      };
    }

    if (call.status !== 'awaiting_confirmation') {
      return {
        ok: false,
        reason: 'invalid_recovery_state',
        status: call.status,
      };
    }

    if (!paymentReference) {
      return {
        ok: false,
        reason: 'payment_reference_required',
      };
    }

    call.status = 'dispatched';
    call.paymentReference = String(paymentReference);
    call.dispatchedAt = timestamp();

    this.emit('recovery_dispatched', { call });

    const persisted = this.save();

    return {
      ok: true,
      call: { ...call },
      persisted,
    };
  }

  advanceRecoveryTime(minutes) {
    this.assertActive();

    const elapsed = clamp(minutes, 0, 24 * 60);
    const arrived = [];

    for (const call of this.recoveryCalls.values()) {
      if (call.status !== 'dispatched') continue;

      call.etaMinutes = Math.max(
        0,
        call.etaMinutes - elapsed,
      );

      if (call.etaMinutes === 0) {
        call.status = 'arrived';
        call.arrivedAt = timestamp();

        arrived.push({ ...call });
        this.emit('recovery_arrived', { call });
      }
    }

    const persisted = elapsed <= 0 ? true : this.save();

    return {
      arrived,
      active: [...this.recoveryCalls.values()].filter(
        (call) => call.status === 'dispatched',
      ).length,
      persisted,
    };
  }

  completeRecovery(callId) {
    this.assertActive();

    const call = this.recoveryCalls.get(String(callId));

    if (!call) {
      return {
        ok: false,
        reason: 'recovery_not_found',
      };
    }

    if (call.status !== 'arrived') {
      return {
        ok: false,
        reason: 'recovery_not_arrived',
        status: call.status,
      };
    }

    call.status = 'completed';
    call.completedAt = timestamp();

    this.emit('recovery_completed', { call });

    const persisted = this.save();

    return {
      ok: true,
      call: { ...call },
      persisted,
    };
  }

  // ----------------------------------------------------------
  // Queries
  // ----------------------------------------------------------

  listJobs({ vehicleId, statuses } = {}) {
    this.assertActive();

    return [...this.jobs.values()]
      .filter(
        (job) =>
          !vehicleId ||
          String(job.vehicleId) === String(vehicleId),
      )
      .filter(
        (job) => !statuses || statuses.includes(job.status),
      )
      .map((job) => ({ ...job }));
  }

  getJob(jobId) {
    this.assertActive();

    const job = this.jobs.get(String(jobId));

    return job ? { ...job } : null;
  }

  listRecoveryCalls({ vehicleId } = {}) {
    this.assertActive();

    return [...this.recoveryCalls.values()]
      .filter(
        (call) =>
          !vehicleId ||
          String(call.vehicleId) === String(vehicleId),
      )
      .map((call) => ({ ...call }));
  }

  getRecoveryCall(callId) {
    this.assertActive();

    const call = this.recoveryCalls.get(String(callId));

    return call ? { ...call } : null;
  }

  getSnapshot() {
    this.assertActive();

    return {
      version: 1,
      workshops: this.listWorkshops({ openOnly: false }),
      jobs: this.listJobs(),
      recoveryCalls: this.listRecoveryCalls(),
      generatedAt: timestamp(),
    };
  }

  exportState() {
    return JSON.stringify(this.getSnapshot());
  }

  // ----------------------------------------------------------
  // Persistence
  // ----------------------------------------------------------

  importState(serialized) {
    this.assertActive();

    try {
      const data =
        typeof serialized === 'string'
          ? JSON.parse(serialized)
          : serialized;

      if (
        !data ||
        data.version !== 1 ||
        !Array.isArray(data.workshops) ||
        !Array.isArray(data.jobs) ||
        !Array.isArray(data.recoveryCalls)
      ) {
        return {
          ok: false,
          reason: 'invalid_state_format',
        };
      }

      const workshops = new Map();
      const jobs = new Map();
      const recoveryCalls = new Map();

      for (const item of data.workshops) {
        if (!item?.id || !item?.name) continue;

        const workshop = {
          id: String(item.id),
          name: String(item.name),
          district: String(item.district || 'Kano'),
          quality: clamp(item.quality ?? 0.8, 0.3, 1.25),
          stock: clamp(item.stock ?? 0.8, 0, 1),
          recovery: clamp(item.recovery ?? 0.8, 0.3, 1.2),
          priceMultiplier: clamp(
            item.priceMultiplier ?? 1,
            0.5,
            2.5,
          ),
          open: item.open !== false,
          reputation: clamp(item.reputation ?? 50, 0, 100),
        };

        workshops.set(workshop.id, workshop);
      }

      for (const item of data.jobs) {
        if (
          !item?.id ||
          !VALID_JOB_STATUSES.has(item.status)
        ) {
          continue;
        }

        jobs.set(String(item.id), clone(item));
      }

      for (const item of data.recoveryCalls) {
        if (
          !item?.id ||
          !VALID_RECOVERY_STATUSES.has(item.status)
        ) {
          continue;
        }

        recoveryCalls.set(String(item.id), clone(item));
      }

      if (workshops.size === 0) {
        return {
          ok: false,
          reason: 'no_valid_workshops',
        };
      }

      this.workshops = workshops;
      this.jobs = jobs;
      this.recoveryCalls = recoveryCalls;

      const persisted = this.save();

      return {
        ok: true,
        workshops: this.workshops.size,
        jobs: this.jobs.size,
        recoveryCalls: this.recoveryCalls.size,
        persisted,
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'parse_error',
        message: String(error?.message || error),
      };
    }
  }

  save() {
    if (this.destroyed) return false;

    try {
      if (typeof localStorage === 'undefined') {
        return false;
      }

      localStorage.setItem(
        this.storageKey,
        this.exportState(),
      );

      return true;
    } catch (error) {
      this.emit('storage_error', {
        message: String(error?.message || error),
      });

      return false;
    }
  }

  load() {
    this.assertActive();

    try {
      if (typeof localStorage === 'undefined') {
        return {
          ok: false,
          reason: 'storage_unavailable',
        };
      }

      const raw = localStorage.getItem(this.storageKey);

      if (!raw) {
        return {
          ok: true,
          empty: true,
        };
      }

      const result = this.importState(raw);

      if (!result.ok) {
        this.emit('storage_error', {
          message:
            result.reason || 'State could not be loaded.',
        });
      }

      return result;
    } catch (error) {
      this.emit('storage_error', {
        message: String(error?.message || error),
      });

      return {
        ok: false,
        reason: 'storage_error',
        message: String(error?.message || error),
      };
    }
  }
}

export { COMPONENTS as KANO_REPAIR_COMPONENTS };
export { RECOVERY_REASONS as KANO_RECOVERY_REASONS };

export default KanoWorkshopRecoveryDirector;