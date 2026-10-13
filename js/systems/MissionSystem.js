import GAME_CONFIG from "../core/config.js";

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const randomItem = (items) =>
  items[Math.floor(Math.random() * items.length)];


const DAILY_QUESTS = [
  {
    id: "daily-fare",
    title: "Daily Hustle",
    description: "Earn ₦5,000 in a single run.",
    type: "earnings",
    target: 5000,
    reward: 1000,
    xp: 80,
    difficulty: 1,
    daily: true,
  },
  {
    id: "daily-near-miss",
    title: "Close Calls",
    description: "Get 10 near-misses in one run.",
    type: "near_misses",
    target: 10,
    reward: 500,
    xp: 60,
    difficulty: 1,
    daily: true,
  },
  {
    id: "daily-clean",
    title: "Clean Run",
    description: "Drive 3km without crashing.",
    type: "distance",
    target: 3000,
    reward: 2000,
    xp: 100,
    difficulty: 2,
    daily: true,
  },
];

const MISSION_TEMPLATES = [
  {
    id: "passenger-rush",
    title: "Passenger Rush",
    description: "Deliver passengers to their destinations.",
    type: "deliveries",
    target: 5,
    reward: 1500,
    xp: 100,
    difficulty: 1,
  },
  {
    id: "safe-driver",
    title: "Safe Driver",
    description: "Complete a journey without crashing.",
    type: "no_collisions",
    target: 1,
    reward: 1200,
    xp: 80,
    difficulty: 1,
  },
  {
    id: "near-miss-master",
    title: "Near-Miss Master",
    description: "Perform close traffic evasions.",
    type: "near_misses",
    target: 10,
    reward: 1000,
    xp: 90,
    difficulty: 2,
  },
  {
    id: "distance-runner",
    title: "Distance Runner",
    description: "Drive the required distance.",
    type: "distance",
    target: 2500,
    reward: 1800,
    xp: 120,
    difficulty: 2,
  },
  {
    id: "fare-collector",
    title: "Fare Collector",
    description: "Earn money from passenger fares.",
    type: "earnings",
    target: 3000,
    reward: 1000,
    xp: 75,
    difficulty: 2,
  },
  {
    id: "traffic-survivor",
    title: "Traffic Survivor",
    description: "Finish a run with vehicle condition above 60%.",
    type: "condition",
    target: 60,
    reward: 1600,
    xp: 110,
    difficulty: 3,
  },
  {
    id: "kano-express",
    title: "Kano Express",
    description: "Complete a run within the target time.",
    type: "time",
    target: 180,
    reward: 2000,
    xp: 150,
    difficulty: 3,
  },
];

export class MissionSystem {
  constructor(options = {}) {
    this.config = options.config ?? GAME_CONFIG;
    this.eventBus = options.eventBus ?? null;
    this.gameState = options.gameState ?? null;

    this.settings = {
      maximumActiveMissions: 3,
      refreshInterval: 300,
      ...options.settings,
    };

    this.missions = new Map();
    this.completedMissionIds = new Set();
    this.failedMissionIds = new Set();

    this.elapsed = 0;
    this.nextRefreshAt = this.settings.refreshInterval;
    this.nextMissionId = 1;
    this.active = false;

    this.unsubscribe = [];
  }

  start() {
    if (this.active) return;

    this.active = true;
    this.elapsed = 0;

    this.bindEvents();
    this.ensureDailyMissions();
    this.ensureMissions();

    this.emit("missions:system-started", {
      activeMissions: this.getActiveMissions().length,
    });
  }


  ensureDailyMissions() {
    const today = new Date().toISOString().slice(0, 10);
    const last = this.gameState?.profile?.lastDailyDate || this._lastDailyDate;
    if (last === today) {
      const hasDaily = [...this.missions.values()].some((ms) => ms.daily);
      if (hasDaily) return;
    }
    this._lastDailyDate = today;
    if (this.gameState?.profile) this.gameState.profile.lastDailyDate = today;
    for (const [id, mission] of this.missions) {
      if (mission.daily) this.missions.delete(id);
    }
    const pool = typeof DAILY_QUESTS !== "undefined" ? [...DAILY_QUESTS] : [];
    pool.sort(() => Math.random() - 0.5);
    for (const template of pool.slice(0, 2)) {
      const id = `daily-${template.id}-${today}`;
      this.missions.set(id, {
        ...template,
        id,
        progress: 0,
        completed: false,
        failed: false,
        active: true,
      });
    }
    this.emit("missions:daily-refreshed", { date: today });
  }

  bindEvents() {
    if (this.unsubscribe.length > 0) return;

    const bus = this.gameState && typeof this.gameState.on === "function"
      ? this.gameState
      : (this.eventBus && typeof this.eventBus.on === "function" ? this.eventBus : null);

    if (!bus) {
      console.warn("[MissionSystem] No event bus for bindEvents — skipping");
      return;
    }

    const bind = (type, fn) => {
      const unsub = bus.on(type, fn);
      if (typeof unsub === "function") this.unsubscribe.push(unsub);
    };

    bind("passengers:delivered", (payload) => {
      this.recordProgress("deliveries", 1);
      this.recordProgress("earnings", Number(payload?.fare) || 0);
    });

    bind("traffic:near-miss", () => {
      this.recordProgress("near_misses", 1);
    });

    bind("player:collision", () => {
      this.checkNoCollisionMissions();
    });

    bind("run:distance", (payload) => {
      this.recordProgress("distance", Number(payload?.added) || 0);
    });

    bind("run:finished", (run) => {
      this.evaluateRunEnd(run);
    });
  }

  update(deltaSeconds) {
    if (!this.active) return;

    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    this.elapsed += dt;

    if (this.elapsed >= this.nextRefreshAt) {
      this.refreshMissions();
      this.nextRefreshAt =
        this.elapsed + this.settings.refreshInterval;
    }

    this.updateTimeMissions();
    this.updateConditionMissions();
  }

  ensureMissions() {
    const active = this.getActiveMissions();
    const slots =
      this.settings.maximumActiveMissions - active.length;

    if (slots <= 0) return;

    const available = MISSION_TEMPLATES.filter(
      (template) =>
        !this.completedMissionIds.has(template.id) &&
        !this.hasActiveTemplate(template.id),
    );

    const shuffled = [...available].sort(
      () => Math.random() - 0.5,
    );

    for (const template of shuffled.slice(0, slots)) {
      this.activateMission(template);
    }
  }

  hasActiveTemplate(templateId) {
    return this.getActiveMissions().some(
      (mission) => mission.templateId === templateId,
    );
  }

  activateMission(template) {
    const mission = {
      instanceId: `mission-${this.nextMissionId++}`,
      templateId: template.id,
      title: template.title,
      description: template.description,
      type: template.type,
      target: template.target,
      progress: 0,
      reward: template.reward,
      xp: template.xp,
      difficulty: template.difficulty,
      status: "active",
      createdAt: this.elapsed,
      completedAt: null,
      claimedAt: null,
    };

    this.missions.set(mission.instanceId, mission);

    this.emit("missions:activated", { ...mission });

    return mission;
  }

  recordProgress(type, amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) return;

    for (const mission of this.getActiveMissions()) {
      if (mission.type !== type) continue;

      mission.progress = Math.min(
        mission.target,
        mission.progress + amount,
      );

      this.emit("missions:progress", {
        mission: { ...mission },
        progress: mission.progress,
        target: mission.target,
      });

      if (mission.progress >= mission.target) {
        this.completeMission(mission.instanceId);
      }
    }
  }

  checkNoCollisionMissions() {
    for (const mission of this.getActiveMissions()) {
      if (mission.type !== "no_collisions") continue;

      mission.progress = 0;

      this.emit("missions:progress", {
        mission: { ...mission },
        progress: 0,
        target: mission.target,
      });
    }
  }

  updateTimeMissions() {
    const run = this.gameState?.run;

    if (!run || this.gameState.phase !== "playing") return;

    for (const mission of this.getActiveMissions()) {
      if (mission.type !== "time") continue;

      // Time missions are evaluated when a run ends.
      if (run.elapsed > mission.target) {
        this.emit("missions:time-warning", {
          missionId: mission.instanceId,
          remaining: 0,
        });
      }
    }
  }

  updateConditionMissions() {
    const run = this.gameState?.run;

    if (!run || this.gameState.phase !== "playing") return;

    for (const mission of this.getActiveMissions()) {
      if (mission.type !== "condition") continue;

      mission.progress = Math.max(
        0,
        Number(run.condition) || 0,
      );
    }
  }

  evaluateRunEnd(run) {
    if (!run) return;

    for (const mission of this.getActiveMissions()) {
      if (mission.type === "no_collisions") {
        if ((run.collisions || 0) === 0) {
          this.completeMission(mission.instanceId);
        } else {
          this.failMission(mission.instanceId, "collision");
        }
      }

      if (mission.type === "condition") {
        if ((run.condition || 0) >= mission.target) {
          this.completeMission(mission.instanceId);
        } else {
          this.failMission(mission.instanceId, "condition-too-low");
        }
      }

      if (mission.type === "time") {
        if ((run.elapsed || 0) <= mission.target) {
          this.completeMission(mission.instanceId);
        } else {
          this.failMission(mission.instanceId, "time-exceeded");
        }
      }
    }
  }

  completeMission(instanceId) {
    const mission = this.missions.get(instanceId);

    if (!mission || mission.status !== "active") return false;

    mission.status = "completed";
    mission.completedAt = this.elapsed;

    this.completedMissionIds.add(mission.templateId);

    this.emit("missions:completed", { ...mission });

    return true;
  }

  claimReward(instanceId) {
    const mission = this.missions.get(instanceId);

    if (!mission || mission.status !== "completed") {
      return false;
    }

    if (mission.claimedAt !== null) return false;

    mission.claimedAt = this.elapsed;
    mission.status = "claimed";

    if (this.gameState) {
      this.gameState.profile.money += mission.reward;
      this.gameState.profile.totalEarnings += mission.reward;

      this.gameState.profile.xp += mission.xp;

      const progression = this.config.progression ?? {};
      const xpPerLevel = progression.xpPerLevel ?? 1000;
      const maximumLevel = progression.maximumLevel ?? 100;

      const previousLevel = this.gameState.profile.level;

      this.gameState.profile.level = Math.min(
        maximumLevel,
        Math.floor(this.gameState.profile.xp / xpPerLevel) + 1,
      );

      this.gameState.emit("economy:money", {
        earned: mission.reward,
        balance: this.gameState.profile.money,
      });

      this.gameState.emit("progression:xp", {
        awarded: mission.xp,
        totalXP: this.gameState.profile.xp,
        level: this.gameState.profile.level,
      });

      if (this.gameState.profile.level > previousLevel) {
        this.gameState.emit("progression:level-up", {
          previousLevel,
          level: this.gameState.profile.level,
          totalXP: this.gameState.profile.xp,
        });
      }
    }

    this.emit("missions:reward-claimed", {
      mission: { ...mission },
      reward: mission.reward,
      xp: mission.xp,
    });

    this.ensureMissions();

    return true;
  }

  failMission(instanceId, reason = "failed") {
    const mission = this.missions.get(instanceId);

    if (!mission || mission.status !== "active") return false;

    mission.status = "failed";
    mission.failureReason = reason;

    this.failedMissionIds.add(mission.templateId);

    this.emit("missions:failed", {
      mission: { ...mission },
      reason,
    });

    return true;
  }

  refreshMissions() {
    const active = this.getActiveMissions();

    for (const mission of active) {
      if (mission.status === "active") {
        this.failMission(mission.instanceId, "expired");
      }
    }

    this.ensureMissions();

    this.emit("missions:refreshed", {
      activeMissions: this.getActiveMissions().length,
    });
  }

  getActiveMissions() {
    return [...this.missions.values()].filter(
      (mission) => mission.status === "active",
    );
  }

  getAvailableRewards() {
    return [...this.missions.values()].filter(
      (mission) => mission.status === "completed",
    );
  }

  getSnapshot() {
    return {
      active: this.active,
      elapsed: this.elapsed,
      activeMissions: this.getActiveMissions().map((mission) => ({
        ...mission,
      })),
      availableRewards: this.getAvailableRewards().map((mission) => ({
        ...mission,
      })),
      completed: [...this.completedMissionIds],
      failed: [...this.failedMissionIds],
    };
  }

  emit(eventName, payload) {
    this.eventBus?.emit(eventName, payload);
    this.gameState?.emit(eventName, payload);
  }

  stop() {
    this.active = false;

    for (const unsubscribe of this.unsubscribe) {
      unsubscribe();
    }

    this.unsubscribe = [];

    this.emit("missions:system-stopped");
  }

  reset() {
    this.stop();

    this.missions.clear();
    this.completedMissionIds.clear();
    this.failedMissionIds.clear();

    this.elapsed = 0;
    this.nextRefreshAt = this.settings.refreshInterval;
    this.nextMissionId = 1;
  }

  destroy() {
    this.reset();
    this.eventBus = null;
    this.gameState = null;
  }
}

export default MissionSystem;