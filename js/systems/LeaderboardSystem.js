const STORAGE_KEY = "kanoRunLeaderboard";
const MAX_ENTRIES = 50;

export default class LeaderboardSystem {
  constructor(context = {}) {
    this.game = context.game ?? null;
    this.events = context.eventBus ?? context.events ?? null;
    this.state = context.gameState ?? context.state ?? null;
    this.saveManager = context.saveManager ?? null;

    this.entries = [];
    this.listeners = [];
    this.enabled = true;
    this.initialized = false;
    this.destroyed = false;
  }

  async initialize(context = {}) {
    if (this.destroyed || this.initialized) return this;

    this.setDependencies(context);
    this.load();

    this.listen("trip:completed", (payload) => {
      this.recordTrip(payload ?? {});
    });

    this.listen("route:completed", (payload) => {
      this.recordRoute(payload ?? {});
    });

    this.initialized = true;

    this.emit("leaderboard:initialized", {
      entries: this.getLeaderboard(),
    });

    return this;
  }

  setDependencies(context = {}) {
    this.game = context.game ?? this.game;
    this.events =
      context.eventBus ?? context.events ?? this.events;
    this.state =
      context.gameState ?? context.state ?? this.state;
    this.saveManager =
      context.saveManager ?? this.saveManager;
  }

  listen(eventName, handler) {
    if (typeof this.events?.on !== "function") return;

    this.events.on(eventName, handler);
    this.listeners.push({ eventName, handler });
  }

  recordTrip(payload = {}) {
    if (!this.enabled || this.destroyed) return null;

    const fare = this.toNonNegativeNumber(
      payload.fare ?? payload.earnings ?? payload.amount
    );

    const distance = this.toNonNegativeNumber(
      payload.distance
    );

    const score = this.toNonNegativeNumber(
      payload.score,
      fare + Math.round(distance)
    );

    return this.recordResult({
      type: "trip",
      score,
      earnings: fare,
      distance,
      route: payload.route ?? null,
    });
  }

  recordRoute(payload = {}) {
    if (!this.enabled || this.destroyed) return null;

    const score = this.toNonNegativeNumber(payload.score);
    const earnings = this.toNonNegativeNumber(
      payload.earnings ?? payload.fare
    );

    return this.recordResult({
      type: "route",
      score,
      earnings,
      distance: this.toNonNegativeNumber(payload.distance),
      route: payload.route ?? null,
    });
  }

  recordResult(result = {}) {
    const profile =
      this.state?.getProfile?.() ??
      this.saveManager?.getProfile?.() ??
      {};

    const playerName = this.cleanName(
      result.playerName ??
      profile.displayName ??
      profile.username ??
      profile.name ??
      "Driver"
    );

    const entry = {
      id: this.createId(),
      playerName,
      type: result.type === "route" ? "route" : "trip",
      score: this.toNonNegativeNumber(result.score),
      earnings: this.toNonNegativeNumber(result.earnings),
      distance: this.toNonNegativeNumber(result.distance),
      route: this.cleanName(result.route ?? "Kano"),
      recordedAt: new Date().toISOString(),
    };

    this.entries.push(entry);

    this.entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.earnings !== a.earnings) {
        return b.earnings - a.earnings;
      }

      return (
        new Date(a.recordedAt).getTime() -
        new Date(b.recordedAt).getTime()
      );
    });

    this.entries = this.entries.slice(0, MAX_ENTRIES);

    this.save();

    this.emit("leaderboard:updated", {
      entry,
      rank: this.getRank(entry.id),
      entries: this.getLeaderboard(),
    });

    return entry;
  }

  getLeaderboard(options = {}) {
    const limit = Math.max(
      1,
      Math.min(
        MAX_ENTRIES,
        Math.floor(Number(options.limit) || 10)
      )
    );

    const type = options.type;

    return this.entries
      .filter((entry) => !type || entry.type === type)
      .slice(0, limit)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
  }

  getRank(entryId) {
    const index = this.entries.findIndex(
      (entry) => entry.id === entryId
    );

    return index < 0 ? null : index + 1;
  }

  getPersonalBest(type = null) {
    const entries = this.entries.filter(
      (entry) => !type || entry.type === type
    );

    if (entries.length === 0) return null;

    return { ...entries[0] };
  }

  getPlayerStats(playerName) {
    const normalized = this.cleanName(playerName).toLowerCase();

    const entries = this.entries.filter(
      (entry) => entry.playerName.toLowerCase() === normalized
    );

    return {
      playerName: this.cleanName(playerName),
      totalResults: entries.length,
      totalEarnings: entries.reduce(
        (sum, entry) => sum + entry.earnings,
        0
      ),
      totalDistance: entries.reduce(
        (sum, entry) => sum + entry.distance,
        0
      ),
      bestScore: entries.reduce(
        (best, entry) => Math.max(best, entry.score),
        0
      ),
    };
  }

  load() {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);

      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) return;

      this.entries = parsed
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          id: String(entry.id ?? this.createId()),
          playerName: this.cleanName(entry.playerName),
          type: entry.type === "route" ? "route" : "trip",
          score: this.toNonNegativeNumber(entry.score),
          earnings: this.toNonNegativeNumber(entry.earnings),
          distance: this.toNonNegativeNumber(entry.distance),
          route: this.cleanName(entry.route ?? "Kano"),
          recordedAt: this.validDate(entry.recordedAt),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ENTRIES);
    } catch (error) {
      console.warn("[Kano Run] Leaderboard loading failed:", error);
      this.entries = [];
    }
  }

  save() {
    try {
      globalThis.localStorage?.setItem(
        STORAGE_KEY,
        JSON.stringify(this.entries)
      );

      return true;
    } catch (error) {
      console.warn("[Kano Run] Leaderboard saving failed:", error);
      return false;
    }
  }

  clear() {
    this.entries = [];
    this.save();

    this.emit("leaderboard:updated", {
      entry: null,
      rank: null,
      entries: [],
    });
  }

  toNonNegativeNumber(value, fallback = 0) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      return fallback;
    }

    return number;
  }

  cleanName(value) {
    const name = String(value ?? "")
      .replace(/[<>]/g, "")
      .trim()
      .slice(0, 40);

    return name || "Driver";
  }

  validDate(value) {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  }

  createId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  }

  destroy() {
    if (this.destroyed) return;

    for (const { eventName, handler } of this.listeners) {
      if (typeof this.events?.off === "function") {
        this.events.off(eventName, handler);
      } else if (typeof this.events?.removeListener === "function") {
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