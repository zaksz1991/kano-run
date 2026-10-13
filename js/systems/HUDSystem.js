export default class HUDSystem {
  constructor(options = {}) {
    this.options = {
      rootId: "game-ui",
      updateInterval: 0.1,
      animationDuration: 180,
      ...options,
    };

    this.root = null;
    this.elements = {};
    this.state = {};
    this.elapsed = 0;
    this.disposed = false;
    this.visible = true;

    this.previousValues = new Map();

    this.createHUD();
  }

  createHUD() {
    if (typeof document === "undefined") return;

    this.root =
      document.getElementById(this.options.rootId) ||
      this.createRoot();

    this.root.classList.add("kano-game-ui");

    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "10",
      color: "#ffffff",
      fontFamily: "Arial, Helvetica, sans-serif",
      userSelect: "none",
    });

    this.injectStyles();
    this.createTopBar();
    this.createDrivingPanel();
    this.createMissionPanel();
    this.createMessageArea();
  }

  createRoot() {
    const root = document.createElement("div");
    root.id = this.options.rootId;

    Object.assign(root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "10",
    });

    document.body.appendChild(root);
    return root;
  }

  injectStyles() {
    if (document.getElementById("kano-hud-styles")) return;

    const style = document.createElement("style");
    style.id = "kano-hud-styles";

    style.textContent = `
      .kano-hud-panel {
        background: rgba(7, 17, 31, .88);
        border: 1px solid rgba(0, 180, 216, .55);
        border-radius: 12px;
        padding: 10px 14px;
        box-shadow: 0 4px 18px rgba(0,0,0,.22);
        backdrop-filter: blur(6px);
      }

      .kano-hud-label {
        font-size: 10px;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        color: #aebdca;
      }

      .kano-hud-value {
        font-size: 20px;
        font-weight: 800;
        line-height: 1.3;
        color: #fff;
      }

      .kano-hud-cyan { color: #00d4ff; }
      .kano-hud-gold { color: #fbbf24; }
      .kano-hud-green { color: #5ce1a0; }
      .kano-hud-red { color: #ff6961; }

      .kano-hud-meter {
        height: 6px;
        margin-top: 5px;
        overflow: hidden;
        border-radius: 5px;
        background: rgba(255,255,255,.15);
      }

      .kano-hud-meter-fill {
        width: 100%;
        height: 100%;
        background: #00b4d8;
        transition: width .15s linear;
      }

      .kano-hud-message {
        padding: 10px 16px;
        border-radius: 8px;
        background: rgba(7,17,31,.92);
        border: 1px solid #00b4d8;
        font-size: 15px;
        font-weight: 700;
        text-align: center;
        opacity: 0;
        transform: translateY(-6px);
        transition: opacity .18s, transform .18s;
      }

      .kano-hud-value.score-pop {
        transform: scale(1.25);
        color: #fbbf24 !important;
        text-shadow: 0 0 12px rgba(251, 191, 36, 0.85);
        transition: transform 0.12s ease-out, color 0.15s ease;
      }

      .kano-hud-value {
        transition: transform 0.12s ease-out, color 0.15s ease;
      }

      .kano-hud-message.visible {
        opacity: 1;
        transform: translateY(0);
      }

      @media (max-width: 600px) {
        .kano-hud-panel {
          padding: 7px 9px;
          border-radius: 9px;
        }

        .kano-hud-value { font-size: 16px; }
        .kano-hud-label { font-size: 9px; }
      }
    `;

    document.head.appendChild(style);
  }

  createElement(tag, className, parent, styles = {}) {
    const safeTag = (typeof tag === "string" && tag.trim()) ? tag.trim() : "div";
    const element = document.createElement(safeTag);

    if (className) element.className = className;

    Object.assign(element.style, styles || {});
    if (parent && typeof parent.appendChild === "function") {
      parent.appendChild(element);
    }

    return element;
  }

  createTopBar() {
    const top = this.createElement(
      "div",
      "",
      this.root,
      {
        position: "absolute",
        top: "14px",
        left: "14px",
        right: "210px",
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        alignItems: "flex-start",
      }
    );

    this.elements.brand = this.createElement(
      "div",
      "kano-hud-panel",
      top,
      { minWidth: "145px" }
    );

    this.elements.brand.innerHTML = `
      <div style="font-size:17px;font-weight:900;letter-spacing:.5px">
        KANO <span style="color:#00d4ff">RUN</span>
      </div>
      <div class="kano-hud-label">ADAIDAITA SAHU</div>
    `;

    this.elements.speedPanel = this.createMetric(
      top,
      "SPEED",
      "0",
      "km/h",
      "speed"
    );

    this.elements.moneyPanel = this.createMetric(
      top,
      "WALLET",
      "₦0",
      "",
      "money"
    );

    this.elements.levelPanel = this.createMetric(
      top,
      "DRIVER LEVEL",
      "1",
      "",
      "level"
    );

    this.elements.scorePanel = this.createMetric(
      top,
      "TRIP SCORE",
      "0",
      "",
      "score"
    );
  }

  createMetric(parent, label, value, suffix, key) {
    const panel = this.createElement(
      "div",
      "kano-hud-panel",
      parent,
      { minWidth: "76px" }
    );

    const labelElement = this.createElement(
      "div",
      "kano-hud-label",
      panel
    );

    labelElement.textContent = label;

    const valueElement = this.createElement(
      "div",
      "kano-hud-value",
      panel
    );

    valueElement.textContent = value;

    if (suffix) {
      const suffixElement = this.createElement(
        "span",
        "",
        valueElement,
        {
          marginLeft: "4px",
          fontSize: "10px",
          fontWeight: "600",
          color: "#aebdca",
        }
      );

      suffixElement.textContent = suffix;
    }

    this.elements[`${key}Value`] = valueElement;

    return panel;
  }

  createDrivingPanel() {
    const panel = this.createElement(
      "div",
      "kano-hud-panel",
      this.root,
      {
        position: "absolute",
        left: "14px",
        bottom: "18px",
        width: "190px",
        boxSizing: "border-box",
      }
    );

    this.elements.drivingPanel = panel;

    this.elements.fuelMeter = this.createMeter(
      panel,
      "FUEL",
      "fuel"
    );

    this.elements.conditionMeter = this.createMeter(
      panel,
      "VEHICLE CONDITION",
      "condition"
    );

    this.elements.passengers = this.createElement(
      "div",
      "",
      panel,
      {
        marginTop: "10px",
        fontSize: "13px",
        fontWeight: "700",
      }
    );

    this.elements.passengers.textContent = "Passengers: 0";
  }

  createMeter(parent, label, key) {
    const wrapper = this.createElement(
      "div",
      "",
      parent,
      { marginTop: "5px" }
    );

    const heading = this.createElement(
      "div",
      "",
      wrapper,
      {
        display: "flex",
        justifyContent: "space-between",
        fontSize: "10px",
        color: "#aebdca",
      }
    );

    const title = this.createElement("", "", heading);
    title.textContent = label;

    const value = this.createElement("", "", heading);
    value.textContent = "100%";

    const meter = this.createElement(
      "div",
      "kano-hud-meter",
      wrapper
    );

    const fill = this.createElement(
      "div",
      "kano-hud-meter-fill",
      meter
    );

    this.elements[`${key}Text`] = value;
    this.elements[`${key}Fill`] = fill;

    return wrapper;
  }

  createMissionPanel() {
    const panel = this.createElement(
      "div",
      "kano-hud-panel",
      this.root,
      {
        position: "absolute",
        left: "50%",
        bottom: "20px",
        transform: "translateX(-50%)",
        minWidth: "190px",
        maxWidth: "min(320px, 55vw)",
        textAlign: "center",
      }
    );

    this.elements.missionPanel = panel;

    this.elements.missionTitle = this.createElement(
      "div",
      "kano-hud-label",
      panel
    );

    this.elements.missionTitle.textContent = "CURRENT MISSION";

    this.elements.missionText = this.createElement(
      "div",
      "",
      panel,
      {
        marginTop: "5px",
        fontSize: "14px",
        fontWeight: "700",
      }
    );

    this.elements.missionText.textContent = "Explore Kano";

    this.elements.missionProgress = this.createElement(
      "div",
      "kano-hud-meter",
      panel
    );

    this.elements.missionProgressFill = this.createElement(
      "div",
      "kano-hud-meter-fill",
      this.elements.missionProgress
    );

    this.elements.missionProgressFill.style.width = "0%";
  }

  createMessageArea() {
    this.elements.message = this.createElement(
      "div",
      "kano-hud-message",
      this.root,
      {
        position: "absolute",
        top: "100px",
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: "80vw",
      }
    );

    this.elements.messageTimer = 0;
  }

  update(deltaTime = 0, state = {}) {
    if (this.disposed || !this.visible) return;

    this.elapsed += Math.max(0, deltaTime);

    if (this.elapsed < this.options.updateInterval) return;

    this.elapsed = 0;
    this.state = state;

    this.updateSpeed(state);
    this.updateMoney(state);
    this.updateLevel(state);
    this.updateScore(state);
    this.updateFuel(state);
    this.updateCondition(state);
    this.updatePassengers(state);
    this.updateMission(state);
    this.updateMessageTimer(deltaTime);
  }

  read(state, paths, fallback = 0) {
    for (const path of paths) {
      let value = state;

      for (const key of path.split(".")) {
        value = value?.[key];
      }

      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return fallback;
  }

  updateSpeed(state) {
    const speed = Math.max(
      0,
      Number(
        this.read(
          state,
          ["speedKmh", "speed", "player.speedKmh"],
          0
        )
      ) || 0
    );

    this.setText("speedValue", Math.round(speed));
  }

  updateMoney(state) {
    const money = Number(
      this.read(
        state,
        ["money", "wallet", "profile.money", "player.money"],
        0
      )
    ) || 0;

    this.setText(
      "moneyValue",
      `₦${Math.floor(money).toLocaleString("en-NG")}`
    );
  }

  updateLevel(state) {
    const level = Number(
      this.read(
        state,
        ["level", "playerLevel", "profile.level"],
        1
      )
    ) || 1;

    this.setText("levelValue", Math.max(1, level));
  }

  updateScore(state) {
    const score = Number(
      state?.score ??
        state?.tripScore ??
        state?.run?.score ??
        0
    );
    const rounded = Math.floor(score);
    const el = this.elements.scoreValue;
    const prev = this.previousValues.get("score");

    this.setText("scoreValue", rounded);

    if (el && prev !== undefined && rounded > prev) {
      el.classList.add("score-pop");
      clearTimeout(this._scorePopTimer);
      this._scorePopTimer = setTimeout(() => {
        el.classList.remove("score-pop");
      }, 180);
    }
    this.previousValues.set("score", rounded);
  }

  updateFuel(state) {
    const fuel = this.read(
      state,
      ["fuel", "player.fuel", "vehicle.fuel", "vehicle.fuelPercent"],
      100
    );

    this.setMeter("fuel", fuel);
  }

  updateCondition(state) {
    const condition = this.read(
      state,
      [
        "condition",
        "health",
        "player.condition",
        "vehicle.condition",
        "vehicle.health",
      ],
      100
    );

    this.setMeter("condition", condition);
  }

  updatePassengers(state) {
    const count = this.read(
      state,
      [
        "passengerCount",
        "passengers.length",
        "passengerSystem.passengers.length",
      ],
      0
    );

    this.setText(
      "passengers",
      `Passengers: ${Number(count) || 0}`
    );
  }

  updateMission(state) {
    const mission = this.read(
      state,
      ["mission", "activeMission", "missionSystem.activeMission"],
      null
    );

    if (!mission) return;

    const title =
      mission.title ||
      mission.name ||
      mission.description ||
      "Complete your mission";

    const progress = Number(mission.progress) || 0;
    const target = Number(mission.target) || 0;

    const percent =
      target > 0
        ? Math.min(100, (progress / target) * 100)
        : mission.completed
          ? 100
          : 0;

    this.setText("missionText", title);

    if (this.elements.missionProgressFill) {
      this.elements.missionProgressFill.style.width =
        `${percent}%`;
    }
  }

  setMeter(key, rawValue) {
    const numeric = Number(rawValue);

    const value = Math.max(
      0,
      Math.min(100, Number.isFinite(numeric) ? numeric : 100)
    );

    if (this.elements[`${key}Text`]) {
      this.elements[`${key}Text`].textContent =
        `${Math.round(value)}%`;
    }

    if (this.elements[`${key}Fill`]) {
      this.elements[`${key}Fill`].style.width = `${value}%`;

      this.elements[`${key}Fill`].style.background =
        value < 25
          ? "#ff6961"
          : value < 50
            ? "#fbbf24"
            : "#00b4d8";
    }
  }

  setText(key, value) {
    const element = this.elements[key];

    if (!element) return;

    const text = String(value);

    if (element.textContent !== text) {
      element.textContent = text;
    }
  }

  showMessage(message, duration = 2200) {
    if (!this.elements.message) return;

    this.elements.message.textContent = String(message);
    this.elements.message.classList.add("visible");
    this.elements.messageTimer = duration / 1000;
  }

  updateMessageTimer(deltaTime) {
    if (!this.elements.message) return;

    if (this.elements.messageTimer > 0) {
      this.elements.messageTimer -= Math.max(0, deltaTime);

      if (this.elements.messageTimer <= 0) {
        this.elements.message.classList.remove("visible");
      }
    }
  }

  setVisible(visible) {
    this.visible = Boolean(visible);

    if (this.root) {
      this.root.style.display = this.visible ? "block" : "none";
    }
  }

  setMission(title, progress = 0) {
    this.setText("missionText", title);

    if (this.elements.missionProgressFill) {
      const value = Math.max(0, Math.min(100, progress));

      this.elements.missionProgressFill.style.width =
        `${value}%`;
    }
  }

  getElements() {
    return { ...this.elements };
  }

  dispose() {
    if (this.disposed) return;

    this.root?.remove();

    this.root = null;
    this.elements = {};
    this.state = {};
    this.previousValues.clear();
    this.disposed = true;
  }
}