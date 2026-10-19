/**
 * Kano Life — Market Day Director
 * Additive simulation module. Connect callbacks to the existing game loop/UI.
 */
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

export class KanoMarketDayDirector {
  constructor(options = {}) {
    this.rng = options.rng || Math.random;
    this.onEvent = options.onEvent || (() => {});
    this.markets = (options.markets || [
      { id: 'kurmi', name: 'Kurmi Market', demand: 1.35, congestion: 1.25, marketDays: [1, 4] },
      { id: 'sabon-gari', name: 'Sabon Gari Market', demand: 1.2, congestion: 1.2, marketDays: [2, 5] },
      { id: 'dawanau', name: 'Dawanau Market', demand: 1.45, congestion: 1.35, marketDays: [0, 3] },
      { id: 'neighborhood', name: 'Neighbourhood Stops', demand: 1, congestion: 1, marketDays: [0,1,2,3,4,5,6] },
    ]).map(m => ({ ...m }));
    this.state = { minuteOfDay: 6 * 60, day: 1, activeMarketId: null, demand: 1, congestion: 1, passengerQueue: 0, elapsed: 0 };
  }

  setClock(day, minuteOfDay) {
    this.state.day = Math.max(1, Math.floor(Number(day) || 1));
    this.state.minuteOfDay = clamp(Number(minuteOfDay) || 0, 0, 1439);
    this.recalculate();
  }

  recalculate() {
    const weekday = (this.state.day - 1) % 7;
    const hour = this.state.minuteOfDay / 60;
    const eligible = this.markets.filter(m => m.marketDays.includes(weekday));
    const market = eligible.find(m => m.id !== 'neighborhood') || this.markets.find(m => m.id === 'neighborhood');
    const rush = (hour >= 6 && hour < 10) ? 1.45 : (hour >= 15 && hour < 19) ? 1.3 : (hour >= 10 && hour < 15) ? 1.08 : 0.72;
    const isMarketDay = Boolean(market && market.id !== 'neighborhood');
    this.state.activeMarketId = market?.id || null;
    this.state.demand = clamp((market?.demand || 1) * rush * (isMarketDay ? 1.15 : 1), 0.5, 2.5);
    this.state.congestion = clamp((market?.congestion || 1) * (hour >= 7 && hour < 10 ? 1.25 : 1) * (isMarketDay ? 1.1 : 1), 0.5, 2.2);
    this.state.isMarketDay = isMarketDay;
    this.state.marketName = market?.name || 'Local streets';
    return this.snapshot();
  }

  update(dtSeconds = 0, context = {}) {
    const dt = clamp(Number(dtSeconds) || 0, 0, 0.25);
    this.state.elapsed += dt;
    if (context.day != null || context.minuteOfDay != null) {
      this.setClock(context.day ?? this.state.day, context.minuteOfDay ?? this.state.minuteOfDay);
    }
    // Arrival rate is demand-driven; the host decides when/how to spawn real passengers.
    const perSecond = 0.025 * this.state.demand;
    if (this.rng() < 1 - Math.exp(-perSecond * dt)) {
      this.state.passengerQueue = Math.min(30, this.state.passengerQueue + 1);
      this.onEvent({ type: 'passenger_demand_pulse', marketId: this.state.activeMarketId, queue: this.state.passengerQueue, demand: this.state.demand });
    }
    return this.snapshot();
  }

  passengerBoarded() { this.state.passengerQueue = Math.max(0, this.state.passengerQueue - 1); }
  snapshot() { return { ...this.state }; }
  getFareMultiplier() { return clamp(0.9 + this.state.demand * 0.12, 0.9, 1.25); }
  getTrafficMultiplier() { return this.state.congestion; }
}
