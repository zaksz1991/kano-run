/**
 * Kano Life fuel-station queue simulation.
 * Additive simulation logic only: the host game supplies wallet, vehicle and UI callbacks.
 * No DOM access, global mutation, or direct wallet writes.
 */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;

export class KanoFuelQueueDirector {
  constructor(options = {}) {
    this.pumpCount = Math.floor(clamp(finite(options.pumpCount, 2), 1, 8));
    this.litersPerMinute = clamp(finite(options.litersPerMinute, 8), 0.5, 80);
    this.stockLiters = Math.max(0, finite(options.stockLiters, 800));
    this.pricePerLiter = Math.max(0, finite(options.pricePerLiter, 950));
    this.queue = [];
    this.active = new Map();
    this.completed = [];
    this.nextId = 1;
    this.clockMinutes = Math.max(0, finite(options.clockMinutes, 0));
  }

  snapshot() {
    return {
      pumpCount: this.pumpCount,
      availablePumps: Math.max(0, this.pumpCount - this.active.size),
      stockLiters: round(this.stockLiters, 2),
      pricePerLiter: round(this.pricePerLiter, 2),
      queue: this.queue.map((entry, index) => ({ ...entry, position: index + 1 })),
      active: [...this.active.values()].map(entry => ({ ...entry })),
      clockMinutes: round(this.clockMinutes, 2),
    };
  }

  setPrice(pricePerLiter) {
    const price = finite(pricePerLiter, NaN);
    if (!Number.isFinite(price) || price < 0) return { ok: false, reason: 'invalid_price' };
    this.pricePerLiter = price;
    return { ok: true, pricePerLiter: this.pricePerLiter };
  }

  addStock(liters) {
    const amount = finite(liters, NaN);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_stock_amount' };
    this.stockLiters += amount;
    return { ok: true, stockLiters: round(this.stockLiters, 2) };
  }

  joinQueue(vehicle = {}) {
    const vehicleId = String(vehicle.vehicleId ?? '').trim();
    if (!vehicleId) return { ok: false, reason: 'missing_vehicle_id' };
    if (this.queue.some(v => v.vehicleId === vehicleId) || this.active.has(vehicleId)) {
      return { ok: false, reason: 'vehicle_already_at_station' };
    }
    const requestedLiters = finite(vehicle.requestedLiters, 10);
    if (requestedLiters <= 0) return { ok: false, reason: 'invalid_liters' };
    if (this.stockLiters <= 0) return { ok: false, reason: 'station_out_of_fuel' };
    const entry = {
      id: `fuel-queue-${this.nextId++}`,
      vehicleId,
      vehicleType: String(vehicle.vehicleType ?? 'keke'),
      driverName: String(vehicle.driverName ?? 'Driver'),
      requestedLiters: round(clamp(requestedLiters, 0.1, 200), 2),
      joinedAtMinute: this.clockMinutes,
      state: 'waiting',
    };
    this.queue.push(entry);
    return { ok: true, entry: { ...entry }, position: this.queue.length, estimatedWaitMinutes: this.estimateWaitMinutes(vehicleId) };
  }

  leaveQueue(vehicleId) {
    const index = this.queue.findIndex(v => v.vehicleId === String(vehicleId));
    if (index < 0) return { ok: false, reason: 'vehicle_not_waiting' };
    const [removed] = this.queue.splice(index, 1);
    return { ok: true, entry: { ...removed, state: 'left_queue' } };
  }

  estimateWaitMinutes(vehicleId) {
    const index = this.queue.findIndex(v => v.vehicleId === String(vehicleId));
    if (index < 0) return this.active.has(String(vehicleId)) ? 0 : null;
    const activeRemaining = [...this.active.values()].reduce((sum, v) => sum + v.remainingMinutes, 0);
    const peopleAhead = this.queue.slice(0, index);
    const queuedWork = peopleAhead.reduce((sum, v) => sum + v.requestedLiters / this.litersPerMinute, 0);
    const openPumpFactor = Math.max(1, this.pumpCount);
    return round(Math.max(0, activeRemaining / openPumpFactor + queuedWork / openPumpFactor), 1);
  }

  startNext() {
    if (this.active.size >= this.pumpCount) return { ok: false, reason: 'all_pumps_busy' };
    if (this.queue.length === 0) return { ok: false, reason: 'queue_empty' };
    if (this.stockLiters <= 0) return { ok: false, reason: 'station_out_of_fuel' };

    const entry = this.queue.shift();
    const liters = round(Math.min(entry.requestedLiters, this.stockLiters), 2);
    if (liters <= 0) return { ok: false, reason: 'station_out_of_fuel' };
    this.stockLiters = round(this.stockLiters - liters, 2);
    const service = {
      ...entry,
      state: 'refuelling',
      liters,
      pricePerLiter: this.pricePerLiter,
      totalCost: round(liters * this.pricePerLiter, 2),
      remainingMinutes: round(liters / this.litersPerMinute, 2),
      startedAtMinute: this.clockMinutes,
    };
    this.active.set(service.vehicleId, service);
    return { ok: true, service: { ...service } };
  }

  /**
   * Progress station service time. Completed services are returned for host-side settlement.
   * Fuel is reserved at service start; it is not added to the vehicle until settle() succeeds.
   */
  tick(minutes = 1) {
    const elapsed = finite(minutes, NaN);
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 240) return { ok: false, reason: 'invalid_elapsed_minutes' };
    this.clockMinutes += elapsed;
    const ready = [];
    for (const service of this.active.values()) {
      service.remainingMinutes = round(Math.max(0, service.remainingMinutes - elapsed), 2);
      if (service.remainingMinutes <= 0) ready.push(service.vehicleId);
    }
    const completed = [];
    for (const vehicleId of ready) {
      const service = this.active.get(vehicleId);
      this.active.delete(vehicleId);
      const finished = { ...service, state: 'awaiting_payment', completedAtMinute: this.clockMinutes };
      this.completed.push(finished);
      completed.push({ ...finished });
    }
    return { ok: true, clockMinutes: round(this.clockMinutes, 2), completed };
  }

  async settle(vehicleId, pay) {
    const id = String(vehicleId);
    const index = this.completed.findIndex(v => v.vehicleId === id && v.state === 'awaiting_payment');
    if (index < 0) return { ok: false, reason: 'service_not_ready' };
    if (typeof pay !== 'function') return { ok: false, reason: 'payment_callback_required' };
    const service = this.completed[index];
    let paymentResult;
    try {
      paymentResult = await pay({ vehicleId: id, amount: service.totalCost, liters: service.liters, pricePerLiter: service.pricePerLiter });
    } catch {
      return { ok: false, reason: 'payment_failed' };
    }
    if (!(paymentResult === true || paymentResult?.ok === true)) return { ok: false, reason: paymentResult?.reason ?? 'payment_failed' };
    this.completed.splice(index, 1);
    const receipt = { ...service, state: 'paid', paidAtMinute: this.clockMinutes };
    this.completed.push(receipt);
    return { ok: true, receipt: { ...receipt } };
  }

  getReceipt(vehicleId) {
    const receipt = [...this.completed].reverse().find(v => v.vehicleId === String(vehicleId) && v.state === 'paid');
    return receipt ? { ...receipt } : null;
  }
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((finite(value) + Number.EPSILON) * factor) / factor;
}

export default KanoFuelQueueDirector;
