/**
 * Phase 8 — Kano mission overhaul
 * Richer objectives, mobile-safe (no road-covering cards on phone).
 * Desktop: compact side cards. Mobile: dock sheet via MobileUISystem.
 */

const DEFAULTS = {
  maxActiveMissions: 3,
  dailyResetInterval: 86400000,
};

const MISSION_TEMPLATES = [
  {
    id: "drop_passengers",
    type: "delivery",
    title: "Passenger runs",
    description: "Drop {count} passengers at the roadside",
    target: 8,
    xpReward: 160,
    moneyReward: 800,
    icon: "👤",
    track: "passenger:dropped",
  },
  {
    id: "sabon_gari_runs",
    type: "delivery",
    title: "Sabon Gari shuttle",
    description: "Complete {count} drop-offs bound for Sabon Gari",
    target: 3,
    xpReward: 220,
    moneyReward: 1100,
    icon: "🏪",
    track: "passenger:dropped",
    filter: { destinationIncludes: "Sabon Gari" },
  },
  {
    id: "earn_fares",
    type: "economy",
    title: "Fare collector",
    description: "Earn ₦{amount} in fares this shift",
    target: 4000,
    xpReward: 200,
    moneyReward: 1000,
    icon: "₦",
    track: "passenger:dropped",
    accumulate: "fare",
  },
  {
    id: "clean_shift",
    type: "driving",
    title: "Clean shift",
    description: "Drop {count} passengers with no collisions",
    target: 5,
    xpReward: 280,
    moneyReward: 1400,
    icon: "🛡️",
    track: "passenger:dropped",
    failOn: ["collision:player", "player:crashed"],
  },
  {
    id: "near_misses",
    type: "driving",
    title: "Close calls",
    description: "Score {count} near-misses in traffic",
    target: 8,
    xpReward: 120,
    moneyReward: 600,
    icon: "⚡",
    track: "collision:near-miss",
    alsoTrack: ["traffic:near-miss"],
  },
  {
    id: "distance_traveled",
    type: "driving",
    title: "Long corridor",
    description: "Cover {distance} km on Kano roads",
    target: 12,
    xpReward: 180,
    moneyReward: 900,
    icon: "🛣️",
    track: "player:distance",
    accumulate: "km",
  },
  {
    id: "visit_districts",
    type: "exploration",
    title: "District hopper",
    description: "Visit {count} different districts",
    target: 4,
    xpReward: 300,
    moneyReward: 1500,
    icon: "🗺️",
    track: "route:district",
    unique: true,
  },
  {
    id: "karota_clean",
    type: "special",
    title: "KAROTA clean pass",
    description: "Clear {count} KAROTA stops without paying a full fine",
    target: 3,
    xpReward: 240,
    moneyReward: 1200,
    icon: "🚓",
    track: "checkpoint:cleared",
    failOn: ["checkpoint:fined"],
  },
  {
    id: "night_shift",
    type: "special",
    title: "Night shift",
    description: "Complete {count} drop-offs after dark",
    target: 4,
    xpReward: 260,
    moneyReward: 1300,
    icon: "🌙",
    track: "passenger:dropped",
    requireNight: true,
  },
  {
    id: "fuel_economy",
    type: "economy",
    title: "Fuel economy",
    description: "Keep fuel above 40% while dropping {count} passengers",
    target: 4,
    xpReward: 200,
    moneyReward: 1000,
    icon: "⛽",
    track: "passenger:dropped",
    requireFuelAbove: 40,
  },
  {
    id: "vip_passenger",
    type: "delivery",
    title: "VIP fare",
    description: "Collect a single fare of ₦{amount} or more",
    target: 1,
    xpReward: 180,
    moneyReward: 900,
    icon: "⭐",
    track: "passenger:dropped",
    minFare: 500,
  },
  {
    id: "escape_chase",
    type: "special",
    title: "Outrun the chase",
    description: "Escape {count} police chase",
    target: 1,
    xpReward: 320,
    moneyReward: 1600,
    icon: "🚨",
    track: "chase:escaped",
  },
  {
    id: "no_yandaba_loss",
    type: "special",
    title: "Street wise",
    description: "Survive {count} Yan Daba encounters without full robbery",
    target: 2,
    xpReward: 250,
    moneyReward: 1250,
    icon: "🕶️",
    track: "yandaba:survived",
  },
  {
    id: "kurmi_market",
    type: "delivery",
    title: "Kurmi market run",
    description: "Drop {count} passengers near Kurmi / Kofar Wambai",
    target: 3,
    xpReward: 230,
    moneyReward: 1150,
    icon: "🛕",
    track: "passenger:dropped",
    filter: { destinationIncludesAny: ["Kurmi", "Kofar Wambai", "Wambai"] },
  },
];

function formatDesc(template, target) {
  return String(template.description)
    .replace("{count}", String(target))
    .replace("{amount}", String(target))
    .replace("{distance}", String(target));
}

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
    this.config = { ...DEFAULTS, ...config };
    this.activeMissions = [];
    this.completedToday = [];
    this.enabled = false;
    this.isNight = false;
    this.fuelPercent = 100;
    this.uiContainer = null;
    this._disposers = [];
    this._visitedDistricts = new Set();
    this._bindEvents();
  }

  async initialize() {
    this._loadDaily();
    this._ensureActiveMissions();
    this.enabled = true;
    this._renderUI();
    this._emitList();
    return this;
  }

  _bindEvents() {
    this._subscribe("game:started", () => {
      this.enabled = true;
      this._ensureActiveMissions();
      this._renderUI();
      this._emitList();
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this._destroyUI();
    });
    this._subscribe("daynight:changed", (p) => {
      this.isNight = Boolean(p?.isNight || p?.phase === "night");
    });
    this._subscribe("playerVehicle:fuel", (p) => {
      const cap = Number(p?.capacity) || 100;
      const fuel = Number(p?.fuel);
      if (Number.isFinite(fuel)) this.fuelPercent = (fuel / cap) * 100;
    });
    this._subscribe("player:fuel", (p) => {
      if (Number.isFinite(p?.percent)) this.fuelPercent = p.percent;
    });

    const tracks = new Set();
    for (const t of MISSION_TEMPLATES) {
      tracks.add(t.track);
      (t.alsoTrack || []).forEach((e) => tracks.add(e));
      (t.failOn || []).forEach((e) => tracks.add(e));
    }
    for (const ev of tracks) {
      this._subscribe(ev, (payload) => this._onEvent(ev, payload || {}));
    }
  }

  _onEvent(eventName, payload) {
    if (!this.enabled) return;

    // Fail handlers
    for (const mission of [...this.activeMissions]) {
      if (mission.completed || mission.failed) continue;
      const tpl = mission.template;
      if (tpl.failOn?.includes(eventName)) {
        if (eventName === "checkpoint:fined" && payload?.paid === false) {
          // negotiated/reduced — allow
        } else {
          mission.failed = true;
          mission.progress = 0;
          this.eventBus?.emit?.("hud:notify", {
            text: `Mission failed: ${mission.title}`,
            type: "warn",
          });
        }
      }
    }

    for (const mission of this.activeMissions) {
      if (mission.completed || mission.failed) continue;
      const tpl = mission.template;
      const events = [tpl.track, ...(tpl.alsoTrack || [])];
      if (!events.includes(eventName)) continue;

      if (tpl.requireNight && !this.isNight) continue;
      if (
        Number.isFinite(tpl.requireFuelAbove) &&
        this.fuelPercent < tpl.requireFuelAbove
      ) {
        continue;
      }

      if (tpl.filter?.destinationIncludes) {
        const dest = String(payload.destination || "");
        if (!dest.includes(tpl.filter.destinationIncludes)) continue;
      }
      if (tpl.filter?.destinationIncludesAny) {
        const dest = String(payload.destination || "");
        if (!tpl.filter.destinationIncludesAny.some((s) => dest.includes(s)))
          continue;
      }
      if (Number.isFinite(tpl.minFare)) {
        const fare = Number(payload.fare ?? payload.amount) || 0;
        if (fare < tpl.minFare) continue;
      }

      if (tpl.unique && eventName.includes("district")) {
        const id = String(payload.district || payload.id || payload.name || "");
        if (!id || this._visitedDistricts.has(id)) continue;
        this._visitedDistricts.add(id);
        mission.progress += 1;
      } else if (tpl.accumulate === "fare") {
        mission.progress += Number(payload.fare ?? payload.amount) || 0;
      } else if (tpl.accumulate === "km") {
        const km =
          Number(payload.km) ||
          Number(payload.distanceKm) ||
          (Number(payload.meters) || 0) / 1000 ||
          0.05;
        mission.progress += km;
      } else {
        mission.progress += 1;
      }

      if (mission.progress >= mission.target) {
        mission.progress = mission.target;
        mission.completed = true;
        this.eventBus?.emit?.("mission:completed", {
          id: mission.id,
          title: mission.title,
          moneyReward: mission.moneyReward,
          xpReward: mission.xpReward,
        });
        this.eventBus?.emit?.("hud:notify", {
          text: `Mission done: ${mission.title} — claim reward`,
          type: "ok",
        });
      }
    }

    this._renderUI();
    this._emitList();
    this._saveDaily();
  }

  _ensureActiveMissions() {
    while (this.activeMissions.filter((m) => !m.completed && !m.failed).length <
      this.config.maxActiveMissions) {
      const used = new Set(this.activeMissions.map((m) => m.templateId));
      const pool = MISSION_TEMPLATES.filter((t) => !used.has(t.id));
      if (!pool.length) break;
      const tpl = pool[Math.floor(Math.random() * pool.length)];
      this.activeMissions.push(this._instantiate(tpl));
    }
  }

  _instantiate(tpl) {
    let target = tpl.target;
    if (tpl.id === "earn_fares") target = tpl.target;
    if (tpl.id === "vip_passenger") target = 1;
    return {
      id: `m_${tpl.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      templateId: tpl.id,
      template: tpl,
      title: tpl.title,
      description: formatDesc(tpl, target),
      target,
      progress: 0,
      xpReward: tpl.xpReward,
      moneyReward: tpl.moneyReward,
      icon: tpl.icon,
      type: tpl.type,
      completed: false,
      failed: false,
      claimed: false,
    };
  }

  claimReward(missionId) {
    const mission = this.activeMissions.find((m) => m.id === missionId);
    if (!mission || !mission.completed || mission.claimed) return false;
    mission.claimed = true;
    this.eventBus?.emit?.("economy:fare-earned", {
      amount: mission.moneyReward,
      fare: mission.moneyReward,
      source: "mission_reward",
    });
    this.eventBus?.emit?.("progression:xp", { amount: mission.xpReward });
    this.eventBus?.emit?.("mission:claimed", {
      id: mission.id,
      money: mission.moneyReward,
      xp: mission.xpReward,
    });
    this.activeMissions = this.activeMissions.filter((m) => m.id !== missionId);
    this._ensureActiveMissions();
    this._renderUI();
    this._emitList();
    this._saveDaily();
    return true;
  }

  getActiveMissions() {
    return this.activeMissions.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      progress: Math.min(m.progress, m.target),
      target: m.target,
      xpReward: m.xpReward,
      moneyReward: m.moneyReward,
      icon: m.icon,
      type: m.type,
      completed: m.completed,
      failed: m.failed,
      claimed: m.claimed,
      progressPct: Math.min(100, Math.round((m.progress / m.target) * 100)),
    }));
  }

  _emitList() {
    this.eventBus?.emit?.("missions:updated", {
      missions: this.getActiveMissions(),
    });
  }

  _isMobile() {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 900 || matchMedia("(pointer: coarse)").matches;
  }

  _renderUI() {
    this._destroyUI();
    if (!this.enabled || this.activeMissions.length === 0) return;
    // Mobile: dock sheet only
    if (this._isMobile()) return;

    this.uiContainer = document.createElement("div");
    this.uiContainer.id = "kano-mission-ui";
    if (!document.getElementById("kano-mission-css")) {
      const style = document.createElement("style");
      style.id = "kano-mission-css";
      style.textContent = `
        #kano-mission-ui {
          position: fixed;
          top: calc(100px + env(safe-area-inset-top, 0px));
          right: 12px;
          z-index: 6600;
          width: 250px;
          pointer-events: none;
          font-family: system-ui, Arial, sans-serif;
        }
        .mission-card {
          background: rgba(15,23,42,0.9);
          border: 1px solid rgba(56,189,248,0.35);
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 8px;
          pointer-events: auto;
        }
        .mission-title { font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase; }
        .mission-desc { font-size: 13px; color: #e2e8f0; margin: 6px 0 10px; line-height: 1.35; }
        .progress-bar-bg { height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
        .progress-bar-fill { height: 100%; background: linear-gradient(90deg,#22d3ee,#38bdf8); }
        .mission-rewards { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: #fbbf24; font-weight: 700; }
        .claim-btn {
          width: 100%; margin-top: 8px; padding: 8px; border: 0; border-radius: 8px;
          background: #22c55e; color: #052e16; font-weight: 900; cursor: pointer;
        }
      `;
      document.head.appendChild(style);
    }

    for (const mission of this.activeMissions) {
      if (mission.failed) continue;
      const pct = Math.min(100, Math.round((mission.progress / mission.target) * 100));
      const card = document.createElement("div");
      card.className = "mission-card";
      card.innerHTML = `
        <div class="mission-header" style="display:flex;gap:8px;align-items:center">
          <span style="font-size:18px">${mission.icon}</span>
          <span class="mission-title">${mission.type}</span>
        </div>
        <div class="mission-desc">${mission.description}</div>
        <div class="progress-text" style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:4px">
          <span>Progress</span><span>${Math.min(mission.progress, mission.target).toFixed?.(0) ?? Math.floor(Math.min(mission.progress, mission.target))} / ${mission.target}</span>
        </div>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="mission-rewards"><span>₦${mission.moneyReward}</span><span>${mission.xpReward} XP</span></div>
        ${
          mission.completed && !mission.claimed
            ? `<button class="claim-btn" data-id="${mission.id}">CLAIM</button>`
            : ""
        }
      `;
      card.querySelector(".claim-btn")?.addEventListener("click", () => {
        this.claimReward(mission.id);
      });
      this.uiContainer.appendChild(card);
    }
    document.body.appendChild(this.uiContainer);
  }

  _destroyUI() {
    this.uiContainer?.remove();
    this.uiContainer = null;
  }

  _loadDaily() {
    try {
      const raw = localStorage.getItem("kano_missions_daily");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Date.now() - (data.savedAt || 0) > this.config.dailyResetInterval) return;
      if (Array.isArray(data.active)) this.activeMissions = data.active;
    } catch {}
  }

  _saveDaily() {
    try {
      localStorage.setItem(
        "kano_missions_daily",
        JSON.stringify({
          savedAt: Date.now(),
          active: this.activeMissions,
        }),
      );
    } catch {}
  }

  _subscribe(name, h) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, h);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._destroyUI();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
  }
}
