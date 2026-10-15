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
    description: "Earn ₦{amount} in fares",
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

    this.uiContainer = null;
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
      this._renderUI();
    });

    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this._destroyUI();
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
      description: template.description
        .replace("{count}", Math.ceil(template.target * multiplier))
        .replace("{amount}", Math.ceil(template.target * multiplier))
        .replace("{distance}", Math.ceil(template.target * multiplier)),
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
    this._renderUI();
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

  // 🔥 PHASE 1: Mission UI Rendering (FIXED POSITIONING)
  _renderUI() {
    this._destroyUI();
    if (!this.enabled || this.activeMissions.length === 0) return;

    this.uiContainer = document.createElement("div");
    this.uiContainer.id = "kano-mission-ui";

    if (!document.getElementById("kano-mission-css")) {
      const style = document.createElement("style");
      style.id = "kano-mission-css";
      style.textContent = `
        #kano-mission-ui {
          position: fixed; 
          top: calc(110px + env(safe-area-inset-top, 0px)); /* 🔥 Pushed down below the top HUD */
          right: 12px; 
          z-index: 6700; 
          width: 260px; /* 🔥 Slightly narrower for mobile */
          pointer-events: none;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .mission-card {
          background: rgba(15, 23, 42, 0.85); 
          backdrop-filter: blur(12px);
          border: 1px solid rgba(56, 189, 248, 0.3); 
          border-radius: 12px;
          padding: 14px; 
          margin-bottom: 10px; 
          pointer-events: auto;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          animation: slideInRight 0.3s ease-out;
        }
        @keyframes slideInRight { 
          from { transform: translateX(20px); opacity: 0; } 
          to { transform: translateX(0); opacity: 1; } 
        }
        .mission-header { 
          display: flex; 
          align-items: center; 
          gap: 10px; 
          margin-bottom: 8px; 
        }
        .mission-icon { 
          font-size: 20px; 
          width: 32px; 
          height: 32px; 
          display: flex; 
          align-items: center; 
          justify-content: center;
          background: rgba(56, 189, 248, 0.15);
          border-radius: 8px;
        }
        .mission-title { 
          font-size: 12px; 
          font-weight: 800; 
          color: #38bdf8; 
          text-transform: uppercase; 
          letter-spacing: 0.5px; 
        }
        .mission-desc { 
          font-size: 13px; 
          color: #e2e8f0; 
          line-height: 1.4; 
          margin-bottom: 12px; 
        }
        .progress-container { margin-bottom: 10px; }
        .progress-text {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #94a3b8;
          margin-bottom: 4px;
          font-weight: 600;
        }
        .progress-bar-bg { 
          width: 100%; 
          height: 8px; 
          background: rgba(255,255,255,0.1); 
          border-radius: 4px; 
          overflow: hidden; 
        }
        .progress-bar-fill { 
          height: 100%; 
          background: linear-gradient(90deg, #38bdf8, #22c55e); 
          border-radius: 4px; 
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
        }
        .mission-rewards { 
          display: flex; 
          justify-content: space-between; 
          align-items: center;
          padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        .reward-item { 
          display: flex; 
          align-items: center; 
          gap: 6px; 
          font-size: 12px; 
          font-weight: 700; 
        }
        .reward-item.money { color: #fbbf24; }
        .reward-item.xp { color: #a78bfa; }
        .claim-btn {
          width: 100%;
          margin-top: 10px;
          padding: 10px;
          border: none;
          border-radius: 8px;
          background: #22c55e;
          color: #fff;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: background 0.2s, transform 0.1s;
        }
        .claim-btn:active {
          background: #16a34a;
          transform: scale(0.96);
        }
        
        /* 🔥 Responsive adjustments for small screens */
        @media (max-width: 400px) {
          #kano-mission-ui { 
            width: 220px; 
            right: 8px; 
            top: calc(100px + env(safe-area-inset-top, 0px)); 
          }
          .mission-title { font-size: 11px; }
          .mission-desc { font-size: 12px; }
          .reward-item { font-size: 11px; }
        }
      `;
      document.head.appendChild(style);
    }

    // Render max 2 active missions to prevent mobile screen clutter
    this.activeMissions.slice(0, 2).forEach((mission) => {
      const card = document.createElement("div");
      card.className = "mission-card";
      
      const progressPct = Math.min(100, (mission.progress / mission.target) * 100);
      const isCompleted = mission.progress >= mission.target;
      
      let icon = "📋";
      if (mission.icon === "passenger") icon = "🧍";
      else if (mission.icon === "money") icon = "💰";
      else if (mission.icon === "shield") icon = "🛡️";
      else if (mission.icon === "zap") icon = "⚡";
      else if (mission.icon === "route") icon = "🛣️";
      else if (mission.icon === "map") icon = "📍";
      else if (mission.icon === "badge") icon = "👮";
      else if (mission.icon === "moon") icon = "🌙";

      card.innerHTML = `
        <div class="mission-header">
          <div class="mission-icon">${icon}</div>
          <div class="mission-title">${mission.type.replace("_", " ").toUpperCase()}</div>
        </div>
        <div class="mission-desc">${mission.description}</div>
        <div class="progress-container">
          <div class="progress-text">
            <span>Progress</span>
            <span>${Math.floor(mission.progress)} / ${mission.target}</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
          </div>
        </div>
        <div class="mission-rewards">
          <div class="reward-item money">💰 ₦${mission.moneyReward.toLocaleString()}</div>
          <div class="reward-item xp">⭐ ${mission.xpReward} XP</div>
        </div>
        ${isCompleted && !mission.claimed ? `<button class="claim-btn" data-mission-id="${mission.id}">CLAIM REWARD</button>` : ""}
      `;
      
      this.uiContainer.appendChild(card);
    });

    // Bind claim buttons
    this.uiContainer.querySelectorAll(".claim-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const missionId = e.target.dataset.missionId;
        this.claimMission(missionId);
      });
    });

    document.body.appendChild(this.uiContainer);
  }

  _destroyUI() {
    if (this.uiContainer) {
      this.uiContainer.remove();
      this.uiContainer = null;
    }
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    this._destroyUI();
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}