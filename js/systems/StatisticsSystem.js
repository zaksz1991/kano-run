const STORAGE_KEY = "kanoRunStatistics";

const INITIAL_STATS = {
  totalTrips: 0,
  completedRoutes: 0,
  passengersPickedUp: 0,
  passengersDroppedOff: 0,
  totalEarnings: 0,
  totalDistance: 0,
  totalDrivingTime: 0,
  totalCollisions: 0,
  totalNearMisses: 0,
  highestSpeed: 0,
  longestTrip: 0,
  bestFare: 0,
};

export default class StatisticsSystem {
  constructor(context = {}) {
    this.game = context.game ?? null;
    this.events = context.eventBus ?? context.events ?? null;
    this.state = context.gameState ?? context.state ?? null;

    this.stats = { ...INITIAL_STATS };
    this.session = { ...INITIAL_STATS };
    this.listeners = [];

    this.enabled = true;
    this.initialized = false;
    this.destroyed = false;
  }

  async initialize(context = {}) {
    if (this.initialized || this.destroyed) return this;

    this.setDependencies(context);
    this.load();

    this.listen("trip:completed", (payload) =>
      this.recordTrip(payload)
    );

    this.listen("route:completed", (payload) =>
      this.recordRoute(payload)
    );

    this.listen("passenger:pickedUp", () =>
      this.increment("passengersPickedUp")
    );

    this.listen("passenger:droppedOff", () =>
      this.increment("passengersDroppedOff")
    );

    this.listen("collision:detected", () =>
      this.increment("totalCollisions")
    );

    this.listen("collision", () =>
      this.increment("totalCollisions")
    );

    this.listen("near-miss", () =>
      this.increment("totalNearMisses")
    );

    this.listen("driving:distance", (payload) =>
      this.recordDistance(payload?.distance ?? payload)
    );

    this.listen("fare:earned", (payload) =>
      this.recordFare(payload)
    );

    this.initialized = true;

    this.emit("statistics:initialized", this.getSummary());

    return this;
  }

  setDependencies(context = {}) {
    this.game = context.game ?? this.game;
    this.events =
      context.eventBus ?? context.events ?? this.events;
    this.state =
      context.gameState ?? context.state ?? this.state;
  }

  listen(eventName, handler) {
    if (typeof this.events?.on !== "function") return;

    this.events.on(eventName, handler);
    this.listeners.push({ eventName, handler });
  }

  update(delta = 0) {
    if (!this.enabled || !this.initialized || this.destroyed) {
      return;
    }

    const elapsed = Number(delta);

    if (!Number.isFinite(elapsed) || elapsed <= 0) return;

    this.stats.totalDrivingTime += elapsed;
    this.session.totalDrivingTime += elapsed;

    const speed = Number(this.state?.run?.speed) || 0;

    if (speed > this.stats.highestSpeed) {
      this.stats.highestSpeed = speed;
    }

    if (speed > this.session.highestSpeed) {
      this.session.highestSpeed = speed;
    }
  }

  recordTrip(payload = {}) {
    if (!this.enabled || this.destroyed) return;

    this.increment("totalTrips");

    const distance = this.number(payload.distance);
    const earnings = this.number(
      payload.earnings ?? payload.fare ?? payload.amount
    );

    this.recordDistance(distance);
    this.recordFare(earnings);

    this.stats.longestTrip = Math.max(
      this.stats.longestTrip,
      distance
    );

    this.session.longestTrip = Math.max(
      this.session.longestTrip,
      distance
    );

    this.emit("statistics:updated", this.getSummary());
    this.save();
  }

  recordRoute() {
    if (!this.enabled || this.destroyed) return;

    this.increment("completedRoutes");
    this.emit("statistics:updated", this.getSummary());
    this.save();
  }

  recordFare(payload) {
    if (!this.enabled || this.destroyed) return;

    const amount =
      typeof payload === "object" && payload !== null
        ? this.number(
            payload.amount ?? payload.fare ?? payload.earnings
          )
        : this.number(payload);

    if (amount <= 0) return;

    this.stats.totalEarnings += amount;
    this.session.totalEarnings += amount;

    this.stats.bestFare = Math.max(
      this.stats.bestFare,
      amount
    );

    this.session.bestFare = Math.max(
      this.session.bestFare,
      amount
    );

    this.emit("statistics:updated", this.getSummary());
    this.save();
  }

  recordDistance(value) {
    if (!this.enabled || this.destroyed) return;

    const distance = this.number(value);

    if (distance <= 0) return;

    this.stats.totalDistance += distance;
    this.session.totalDistance += distance;

    this.emit("statistics:updated", this.getSummary());
  }

  increment(key, amount = 1) {
    if (
      !Object.prototype.hasOwnProperty.call(INITIAL_STATS, key)
    ) {
      return;
    }

    const increment = this.number(amount);

    if (increment <= 0) return;

    this.stats[key] += increment;
    this.session[key] += increment;

    this.emit("statistics:updated", this.getSummary());
    this.save();
  }

  getStats() {
    return { ...this.stats };
  }

  getSessionStats() {
    return { ...this.session };
  }

  getSummary() {
    return {
      lifetime: this.getStats(),
      session: this.getSessionStats(),
    };
  }

  getAverageFare() {
    return this.stats.totalTrips > 0
      ? this.stats.totalEarnings / this.stats.totalTrips
      : 0;
  }

  getAverageDistancePerTrip() {
    return this.stats.totalTrips > 0
      ? this.stats.totalDistance / this.stats.totalTrips
      : 0;
  }

  getAverageSpeed() {
    return this.stats.totalDrivingTime > 0
      ? this.stats.totalDistance / this.stats.totalDrivingTime
      : 0;
  }

  load() {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);

      if (!raw) return;

      const saved = JSON.parse(raw);

      if (!saved || typeof saved !== "object") return;

      for (const key of Object.keys(INITIAL_STATS)) {
        const value = Number(saved[key]);

        if (Number.isFinite(value) && value >= 0) {
          this.stats[key] = value;
        }
      }
    } catch (error) {
      console.warn(
        "[Kano Run] Statistics loading failed:",
        error
      );
    }
  }

  save() {
    try {
      globalThis.localStorage?.setItem(
        STORAGE_KEY,
        JSON.stringify(this.stats)
      );
    } catch (error) {
      console.warn(
        "[Kano Run] Statistics saving failed:",
        error
      );
    }
  }

  resetSession() {
    this.session = { ...INITIAL_STATS };

    this.emit("statistics:sessionReset", this.getSessionStats());
  }

  resetAll() {
    this.stats = { ...INITIAL_STATS };
    this.resetSession();
    this.save();

    this.emit("statistics:updated", this.getSummary());
  }

  number(value) {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : 0;
  }

  emit(eventName, payload) {
    this.events?.emit?.(eventName, payload);
  }

  start() {
    this.enabled = true;
  }

  pause() {
    this.enabled = false;
  }

  resume() {
    if (!this.destroyed) this.enabled = true;
  }

  stop() {
    this.enabled = false;
    this.save();
  }

  destroy() {
    if (this.destroyed) return;

    for (const { eventName, handler } of this.listeners) {
      if (typeof this.events?.off === "function") {
        this.events.off(eventName, handler);
      } else if (
        typeof this.events?.removeListener === "function"
      ) {
        this.events.removeListener(eventName, handler);
      }
    }

    this.listeners = [];
    this.save();

    this.enabled = false;
    this.initialized = false;
    this.destroyed = true;

    this.events = null;
    this.state = null;
    this.game = null;
  }
}