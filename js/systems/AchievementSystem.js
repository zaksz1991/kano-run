const ACHIEVEMENTS = [
  {
    id: "first_fare",
    title: "First Fare",
    description: "Earn your first fare.",
    category: "economy",
    target: 1,
    stat: "faresEarned",
    reward: 100,
  },
  {
    id: "first_passenger",
    title: "Passenger Service",
    description: "Pick up your first passenger.",
    category: "passengers",
    target: 1,
    stat: "passengersPickedUp",
    reward: 100,
  },
  {
    id: "passenger_pro",
    title: "Passenger Pro",
    description: "Pick up 25 passengers.",
    category: "passengers",
    target: 25,
    stat: "passengersPickedUp",
    reward: 500,
  },
  {
    id: "road_regular",
    title: "Road Regular",
    description: "Travel 10 kilometres.",
    category: "driving",
    target: 10_000,
    stat: "distanceTravelled",
    reward: 300,
  },
  {
    id: "long_distance",
    title: "Long Distance Driver",
    description: "Travel 100 kilometres.",
    category: "driving",
    target: 100_000,
    stat: "distanceTravelled",
    reward: 1500,
  },
  {
    id: "money_maker",
    title: "Money Maker",
    description: "Earn ₦10,000 in fares.",
    category: "economy",
    target: 10_000,
    stat: "totalEarnings",
    reward: 1000,
  },
  {
    id: "route_explorer",
    title: "Route Explorer",
    description: "Complete five routes.",
    category: "exploration",
    target: 5,
    stat: "routesCompleted",
    reward: 500,
  },
  {
    id: "veteran_driver",
    title: "Veteran Driver",
    description: "Complete 100 trips.",
    category: "driving",
    target: 100,
    stat: "tripsCompleted",
    reward: 2000,
  },
];

const INITIAL_STATS = {
  faresEarned: 0,
  passengersPickedUp: 0,
  distanceTravelled: 0,
  totalEarnings: 0,
  routesCompleted: 0,
  tripsCompleted: 0,
};

export default class AchievementSystem {
  constructor(context = {}) {
    this.game = context.game ?? null;
    this.config = context.config ?? {};
    this.services = context.services ?? null;

    this.events =
      context.eventBus ??
      context.events ??
      this.game?.events ??
      null;

    this.state =
      context.gameState ??
      context.state ??
      this.game?.state ??
      null;

    this.saveManager = context.saveManager ?? null;

    this.stats = { ...INITIAL_STATS };
    this.unlocked = new Set();
    this.pendingRewards = 0;

    this.enabled = true;
    this.initialized = false;
    this.destroyed = false;

    this.listeners = [];
    this.processedEvents = new Set();
  }

  async initialize(context = {}) {
    if (this.destroyed || this.initialized) {
      return this;
    }

    this.setDependencies(context);

    this.loadProgress();
    this.bindEvents();

    this.initialized = true;

    this.emit("achievements:initialized", {
      achievements: this.getAchievements(),
      stats: this.getStats(),
    });

    return this;
  }

  setDependencies(context = {}) {
    this.game = context.game ?? this.game;
    this.config = context.config ?? this.config;
    this.services = context.services ?? this.services;

    this.events =
      context.eventBus ??
      context.events ??
      this.events;

    this.state =
      context.gameState ??
      context.state ??
      this.state;

    this.saveManager =
      context.saveManager ??
      this.saveManager;
  }

  bindEvents() {
    const eventBindings = [
      [
        "fare:earned",
        (payload) => this.recordFare(payload),
      ],
      [
        "passenger:pickedUp",
        () => this.recordPassenger(),
      ],
      [
        "passenger:pickup",
        () => this.recordPassenger(),
      ],
      [
        "route:completed",
        () => this.recordRoute(),
      ],
      [
        "trip:completed",
        () => this.recordTrip(),
      ],
      [
        "driving:distance",
        (payload) => this.recordDistance(payload),
      ],
    ];

    for (const [eventName, handler] of eventBindings) {
      if (!this.events?.on) {
        continue;
      }

      this.events.on(eventName, handler);

      this.listeners.push({
        eventName,
        handler,
      });
    }
  }

  update(delta = 0) {
    if (!this.enabled || !this.initialized || this.destroyed) {
      return;
    }

    const elapsed = Number(delta);

    if (!Number.isFinite(elapsed) || elapsed <= 0) {
      return;
    }

    const run = this.state?.run;

    const speed = Number(run?.speed);

    if (Number.isFinite(speed) && speed > 0) {
      this.recordDistance(speed * elapsed);
    }
  }

  recordFare(payload = {}) {
    if (!this.enabled || this.destroyed) {
      return;
    }

    const amount = Math.max(
      0,
      Number(payload.amount ?? payload.fare ?? payload.earnings) || 0
    );

    if (amount <= 0) {
      return;
    }

    const eventId = this.getEventId(payload, "fare");

    if (!this.acceptEvent(eventId)) {
      return;
    }

    this.stats.faresEarned += 1;
    this.stats.totalEarnings += amount;

    this.checkAchievements();
    this.persistProgress();
  }

  recordPassenger() {
    if (!this.enabled || this.destroyed) {
      return;
    }

    this.stats.passengersPickedUp += 1;

    this.checkAchievements();
    this.persistProgress();
  }

  recordDistance(metres) {
    if (!this.enabled || this.destroyed) {
      return;
    }

    const distance = Number(metres);

    if (!Number.isFinite(distance) || distance <= 0) {
      return;
    }

    this.stats.distanceTravelled += distance;

    this.checkAchievements();
  }

  recordRoute() {
    if (!this.enabled || this.destroyed) {
      return;
    }

    this.stats.routesCompleted += 1;

    this.checkAchievements();
    this.persistProgress();
  }

  recordTrip() {
    if (!this.enabled || this.destroyed) {
      return;
    }

    this.stats.tripsCompleted += 1;

    this.checkAchievements();
    this.persistProgress();
  }

  getEventId(payload, prefix) {
    const id =
      payload.eventId ??
      payload.transactionId ??
      payload.id;

    if (id === undefined || id === null) {
      return null;
    }

    return `${prefix}:${String(id)}`;
  }

  acceptEvent(eventId) {
    if (!eventId) {
      return true;
    }

    if (this.processedEvents.has(eventId)) {
      return false;
    }

    this.processedEvents.add(eventId);

    if (this.processedEvents.size > 2000) {
      const oldest = this.processedEvents.values().next().value;

      if (oldest !== undefined) {
        this.processedEvents.delete(oldest);
      }
    }

    return true;
  }

  checkAchievements() {
    for (const achievement of ACHIEVEMENTS) {
      if (this.unlocked.has(achievement.id)) {
        continue;
      }

      const progress = this.stats[achievement.stat] ?? 0;

      if (progress >= achievement.target) {
        this.unlock(achievement);
      }
    }
  }

  unlock(achievement) {
    if (this.unlocked.has(achievement.id)) {
      return false;
    }

    this.unlocked.add(achievement.id);
    this.pendingRewards += achievement.reward;

    const result = {
      ...achievement,
      progress: achievement.target,
      unlocked: true,
      unlockedAt: new Date().toISOString(),
    };

    this.emit("achievement:unlocked", result);
    this.emit("achievements:changed", this.getAchievements());

    this.persistProgress();

    return true;
  }

  getAchievements() {
    return ACHIEVEMENTS.map((achievement) => {
      const unlocked = this.unlocked.has(achievement.id);

      const current = Math.max(
        0,
        Number(this.stats[achievement.stat]) || 0
      );

      return {
        ...achievement,
        progress: Math.min(current, achievement.target),
        percentage: Math.min(
          100,
          Math.floor((current / achievement.target) * 100)
        ),
        unlocked,
      };
    });
  }

  getAchievement(id) {
    return (
      this.getAchievements().find(
        (achievement) => achievement.id === id
      ) ?? null
    );
  }

  getStats() {
    return { ...this.stats };
  }

  getUnlockedAchievements() {
    return this.getAchievements().filter(
      (achievement) => achievement.unlocked
    );
  }

  getLockedAchievements() {
    return this.getAchievements().filter(
      (achievement) => !achievement.unlocked
    );
  }

  getCompletionPercentage() {
    if (ACHIEVEMENTS.length === 0) {
      return 100;
    }

    return Math.round(
      (this.unlocked.size / ACHIEVEMENTS.length) * 100
    );
  }

  getPendingRewards() {
    return this.pendingRewards;
  }

  claimRewards() {
    const reward = this.pendingRewards;

    if (reward <= 0) {
      return 0;
    }

    this.pendingRewards = 0;

    this.emit("achievements:rewardsClaimed", {
      amount: reward,
    });

    this.persistProgress();

    return reward;
  }

  loadProgress() {
    try {
      const profile = this.saveManager?.loadProfile?.();

      if (!profile || typeof profile !== "object") {
        return;
      }

      const saved = profile.achievements;

      if (!saved || typeof saved !== "object") {
        return;
      }

      if (saved.stats && typeof saved.stats === "object") {
        for (const key of Object.keys(INITIAL_STATS)) {
          const value = Number(saved.stats[key]);

          if (Number.isFinite(value) && value >= 0) {
            this.stats[key] = value;
          }
        }
      }

      if (Array.isArray(saved.unlocked)) {
        const validIds = new Set(
          ACHIEVEMENTS.map((achievement) => achievement.id)
        );

        for (const id of saved.unlocked) {
          if (validIds.has(id)) {
            this.unlocked.add(id);
          }
        }
      }

      const pending = Number(saved.pendingRewards);

      if (Number.isFinite(pending) && pending >= 0) {
        this.pendingRewards = pending;
      }
    } catch (error) {
      console.warn(
        "[Kano Run] Could not load achievement progress:",
        error
      );
    }
  }

  persistProgress() {
    if (!this.saveManager?.updateProfile) {
      return;
    }

    try {
      const profile =
        this.state?.getProfile?.() ?? {};

      this.saveManager.updateProfile(
        {
          ...profile,
          achievements: {
            stats: this.getStats(),
            unlocked: [...this.unlocked],
            pendingRewards: this.pendingRewards,
          },
        },
        { autosave: true }
      );
    } catch (error) {
      console.warn(
        "[Kano Run] Could not save achievement progress:",
        error
      );
    }
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
    if (!this.destroyed) {
      this.enabled = true;
    }
  }

  stop() {
    this.enabled = false;
  }

  reset() {
    this.stats = { ...INITIAL_STATS };
    this.unlocked.clear();
    this.pendingRewards = 0;
    this.processedEvents.clear();

    this.persistProgress();

    this.emit("achievements:changed", this.getAchievements());
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    for (const { eventName, handler } of this.listeners) {
      if (typeof this.events?.off === "function") {
        this.events.off(eventName, handler);
      } else if (typeof this.events?.removeListener === "function") {
        this.events.removeListener(eventName, handler);
      }
    }

    this.listeners = [];
    this.persistProgress();

    this.enabled = false;
    this.initialized = false;
    this.destroyed = true;

    this.events = null;
    this.state = null;
    this.services = null;
    this.game = null;
  }
}