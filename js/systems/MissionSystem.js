import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  maxActiveMissions: 3,
  dailyResetInterval: 86400000, // 24 hours in ms
  baseXPReward: 100,
  baseMoneyReward: 500,
};

// Mission templates with Kano-specific flavor
const MISSION_TEMPLATES = [
  {
    id: "deliver_passengers",
    type: "delivery",
    description: "Deliver {count} passengers to their destinations",
    target: 5,
    xpReward: 150,
    moneyReward: 750,
    icon: "passenger",
  },
  {
    id: "earn_fares",
    type: "economy",
    description: "Earn N{amount} in fares",
    target: 3000,
    xpReward: 200,
    moneyReward: 1000,
    icon: "money",
  },
  {
    id: "avoid_collisions",
    type: "driving",
    description: "Complete {count} trips without collisions",
    target: 3,
    xpReward: 250,
    moneyReward: 1200,
    icon: "shield",
  },
  {
    id: "near_misses",
    type: "driving",
    description: "Perform {count} near-misses",
    target: 10,
    xpReward: 100,
    moneyReward: 500,
    icon: "zap",
  },
  {
    id: "distance_traveled",
    type: "driving",
    description: "Drive {distance}km in total",
    target: 15,
    xpReward: 180,
    moneyReward: 900,
    icon: "route",
  },
  {
    id: "visit_districts",
    type: "exploration",
    description: "Visit {count} different districts",
    target: 4,
    xpReward: 300,
    moneyReward: 1500,
    icon: "map",
  },
  {
    id: "karota_checkpoints",
    type: "special",
    description: "Pass {count} KAROTA checkpoints without fines",
    target: 5,
    xpReward: 200,
    moneyReward: 1000,
    icon: "badge",
  },
  {
    id: "night_driving",
    type: "special",
    description: "Complete {count} trips during night time",
    target: 2,
    xpReward: 250,
    moneyReward: 1250,
    icon: "moon",
  },
  {
    id: "visit_landmarks",
    type: "exploration",
    description: "Pass {count} Kano landmarks on your route",
    target: 4,
    xpReward: 220,
    moneyReward: 1100,
    icon: "map",
  },
  {
    id: "escape_chase",
    type: "special",
    description: "Escape {count} police chase",
    target: 1,
    xpReward: 300,
    moneyReward: 1500,
    icon: "zap",
  },
];

export default class MissionSystem {
  constructor({
    eventBus = null,
    gameState = null,
    saveManager = null,
    config = {},
  } = {}) {
    if (!gameState) throw new Error("MissionSystem requires gameState.");

    this.eventBus = eventBus;
    this.gameState = gameState;
    this.saveManager = saveManager;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.missions ?? {}), ...config };

    this.activeMissions = [];
    this.completedMissions = [];
    this.missionHistory = [];
    this.lastDailyReset = 0;
    this.enabled = false;

    this._disposers = [];
    this._bindEvents();
  }

  _bindEvents() {
    this._subscribe("game:started", () => {
      this.enabled = true;
      this._checkDailyReset();
      if (this.activeMissions.length === 0) {
        this.generateDailyMissions();
      }
    });

    this._subscribe("game:stopped", () => {
      this.enabled = false;
    });

    this._subscribe("passenger:dropped", (payload = {}) => {
      this._updateMissions("deliver_passengers", 1);
      this._updateMissions("earn_fares", Number(payload.fare) || 0);
    });

    this._subscribe("traffic:near-miss", () => {
      this._updateMissions("near_misses", 1);
    });

    this._subscribe("run:finished", (payload) => {
      if (payload.reason === "completed") {
        this._updateMissions("avoid_collisions", 1);
      }
      this._updateMissions("distance_traveled", (payload.distance || 0) / 1000);
    });

    this._subscribe("scenery:districtChanged", (payload) => {
      this._trackDistrictVisit(payload.district);
    });

    this._subscribe("checkpoint:cleared", () => {
      this._updateMissions("karota_checkpoints", 1);
    });

    this._subscribe("time:period-changed", (payload) => {
      if (payload.period === "night") {
        this._updateMissions("night_driving", 1);
      }
    });

    this._subscribe("landmark:reached", () => {
      this._updateMissions("visit_landmarks", 1);
    });

    this._subscribe("chase:escaped", () => {
      this._updateMissions("escape_chase", 1);
    });

    this._subscribe("collision:near-miss", () => {
      this._updateMissions("near_misses", 1);
    });
  }

  initialize() {
    this._loadMissions();
    this._checkDailyReset();
    if (this.activeMissions.length === 0) {
      this.generateDailyMissions();
    }
    this._emitUpdate();
  }

  generateDailyMissions() {
    if (this.activeMissions.length >= this.config.maxActiveMissions) {
      return;
    }

    const available = MISSION_TEMPLATES.filter(
      (t) => !this.activeMissions.find((m) => m.templateId === t.id)
    );

    const shuffled = available.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, this.config.maxActiveMissions - this.activeMissions.length);

    for (const template of selected) {
      const mission = this._createMission(template);
      this.activeMissions.push(mission);
    }

    this.lastDailyReset = Date.now();
    this._saveMissions();
    this._emitUpdate();

    this.eventBus?.emit?.("missions:generated", {
      missions: this.activeMissions,
    });
  }

  _createMission(template) {
    const difficulty = this.gameState.profile?.level || 1;
    const multiplier = 1 + (difficulty - 1) * 0.2;

    return {
      id: `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      templateId: template.id,
      type: template.type,
      description: template.description.replace("{count}", Math.ceil(template.target * multiplier)).replace("{amount}", Math.ceil(template.target * multiplier)).replace("{distance}", Math.ceil(template.target * multiplier)),
      target: Math.ceil(template.target * multiplier),
      progress: 0,
      xpReward: Math.ceil(template.xpReward * multiplier),
      moneyReward: Math.ceil(template.moneyReward * multiplier),
      icon: template.icon,
      completed: false,
      claimed: false,
      createdAt: Date.now(),
    };
  }

  _updateMissions(templateId, amount) {
    let updated = false;

    for (const mission of this.activeMissions) {
      if (mission.templateId === templateId && !mission.completed) {
        mission.progress += amount;

        if (mission.progress >= mission.target) {
          mission.progress = mission.target;
          mission.completed = true;
          this.eventBus?.emit?.("mission:completed", {
            mission: this._serializeMission(mission),
          });
        }

        updated = true;
      }
    }

    if (updated) {
      this._saveMissions();
      this._emitUpdate();
    }
  }

  _trackDistrictVisit(district) {
    if (!district) return;

    const mission = this.activeMissions.find(
      (m) => m.templateId === "visit_districts" && !m.completed
    );

    if (mission) {
      const visited = mission.visitedDistricts || [];
      if (!visited.includes(district)) {
        visited.push(district);
        mission.visitedDistricts = visited;
        this._updateMissions("visit_districts", 1);
      }
    }
  }

  claimMission(missionId) {
    const mission = this.activeMissions.find((m) => m.id === missionId);

    if (!mission || !mission.completed || mission.claimed) {
      return { success: false, reason: "Mission not available for claiming." };
    }

    mission.claimed = true;
    this.completedMissions.push(mission);

    // Award rewards
    this.gameState.addXP?.(mission.xpReward, "mission_completion");
    this.gameState.addMoney?.(mission.moneyReward, "mission_reward");

    // Remove from active
    this.activeMissions = this.activeMissions.filter((m) => m.id !== missionId);

    this._saveMissions();
    this._emitUpdate();

    this.eventBus?.emit?.("mission:claimed", {
      mission: this._serializeMission(mission),
      xpReward: mission.xpReward,
      moneyReward: mission.moneyReward,
    });

    return {
      success: true,
      xpReward: mission.xpReward,
      moneyReward: mission.moneyReward,
    };
  }

  getActiveMissions() {
    return this.activeMissions.map((m) => this._serializeMission(m));
  }

  getCompletedMissions() {
    return this.completedMissions.map((m) => this._serializeMission(m));
  }

  getMissionProgress() {
    return {
      active: this.activeMissions.length,
      completed: this.completedMissions.length,
      total: this.missionHistory.length,
    };
  }

  _checkDailyReset() {
    const now = Date.now();
    const timeSinceReset = now - this.lastDailyReset;

    if (timeSinceReset >= this.config.dailyResetInterval) {
      this._resetDailyMissions();
    }
  }

  _resetDailyMissions() {
    // Move uncompleted missions to history
    for (const mission of this.activeMissions) {
      if (!mission.completed) {
        this.missionHistory.push({
          ...mission,
          failed: true,
          completedAt: Date.now(),
        });
      }
    }

    this.activeMissions = [];
    this.lastDailyReset = Date.now();

    this._saveMissions();
    this._emitUpdate();

    this.eventBus?.emit?.("missions:reset", {
      reason: "daily_reset",
    });
  }

  _serializeMission(mission) {
    return {
      id: mission.id,
      templateId: mission.templateId,
      type: mission.type,
      description: mission.description,
      target: mission.target,
      progress: Math.min(mission.progress, mission.target),
      xpReward: mission.xpReward,
      moneyReward: mission.moneyReward,
      icon: mission.icon,
      completed: mission.completed,
      claimed: mission.claimed,
      progressPercent: Math.min(100, (mission.progress / mission.target) * 100),
    };
  }

  _emitUpdate() {
    this.eventBus?.emit?.("missions:updated", {
      active: this.getActiveMissions(),
      completed: this.getCompletedMissions(),
      progress: this.getMissionProgress(),
    });
  }

  _saveMissions() {
    if (this.saveManager) {
      this.saveManager.setValue?.("missions.active", this.activeMissions);
      this.saveManager.setValue?.("missions.completed", this.completedMissions);
      this.saveManager.setValue?.("missions.history", this.missionHistory);
      this.saveManager.setValue?.("missions.lastDailyReset", this.lastDailyReset);
    }
  }

  _loadMissions() {
    if (this.saveManager) {
      this.activeMissions = this.saveManager.getValue?.("missions.active") || [];
      this.completedMissions = this.saveManager.getValue?.("missions.completed") || [];
      this.missionHistory = this.saveManager.getValue?.("missions.history") || [];
      this.lastDailyReset = this.saveManager.getValue?.("missions.lastDailyReset") || 0;
    }
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}
