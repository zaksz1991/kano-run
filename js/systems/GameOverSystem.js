import GAME_CONFIG from "../core/config.js";

export default class GameOverSystem {
  constructor({
    gameState,
    eventBus,
    saveManager,
    onRestart = () => {},
    onMainMenu = () => {},
  } = {}) {
    this.gameState = gameState;
    this.eventBus = eventBus;
    this.saveManager = saveManager;
    this.onRestart = onRestart;
    this.onMainMenu = onMainMenu;

    this.root = null;
    this.visible = false;
    this.destroyed = false;
    this.listeners = [];

    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.createUI();
    this.bindEvents();
  }

  createUI() {
    if (typeof document === "undefined") return;

    this.root = document.createElement("section");
    this.root.id = "kano-run-game-over";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "kano-run-game-over-title");

    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "10000",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      background: "rgba(3, 9, 18, 0.88)",
      backdropFilter: "blur(9px)",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#ffffff",
      overflowY: "auto",
    });

    const panel = document.createElement("div");

    Object.assign(panel.style, {
      width: "min(100%, 480px)",
      padding: "30px",
      borderRadius: "20px",
      border: "1px solid rgba(0, 180, 216, 0.4)",
      background: "linear-gradient(145deg, #14243a, #081321)",
      boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5)",
      boxSizing: "border-box",
    });

    const brand = this.createElement("div", "RUN COMPLETE", {
      color: "#00b4d8",
      fontSize: "12px",
      fontWeight: "800",
      letterSpacing: "3px",
      marginBottom: "10px",
    });

    const title = this.createElement("h1", "Trip Summary", {
      id: "kano-run-game-over-title",
      fontSize: "clamp(28px, 7vw, 38px)",
      lineHeight: "1.1",
      margin: "0 0 8px",
      fontWeight: "900",
    });

    const subtitle = this.createElement(
      "p",
      "Kano Run — Adaidaita Sahu",
      {
        color: "#a9bbd0",
        fontSize: "14px",
        margin: "0 0 24px",
      }
    );

    this.statsContainer = document.createElement("div");

    Object.assign(this.statsContainer.style, {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "12px",
      marginBottom: "24px",
    });

    this.resultLabel = this.createElement("div", "", {
      fontSize: "13px",
      color: "#a9bbd0",
      marginBottom: "6px",
    });

    this.resultValue = this.createElement("div", "₦0", {
      fontSize: "30px",
      fontWeight: "900",
      color: "#fbbf24",
      overflowWrap: "anywhere",
    });

    this.resultCard = document.createElement("div");

    Object.assign(this.resultCard.style, {
      padding: "16px",
      borderRadius: "12px",
      background: "rgba(255, 255, 255, 0.06)",
      marginBottom: "18px",
    });

    this.resultCard.append(this.resultLabel, this.resultValue);

    this.message = this.createElement(
      "p",
      "Your progress has been recorded.",
      {
        color: "#c7d3e2",
        fontSize: "13px",
        lineHeight: "1.6",
        margin: "0 0 20px",
      }
    );

    this.restartButton = this.createButton("Drive Again", true);
    this.menuButton = this.createButton("Main Menu", false);

    this.restartButton.addEventListener("click", () => {
      this.hide();
      this.onRestart();
    });

    this.menuButton.addEventListener("click", () => {
      this.hide();
      this.onMainMenu();
    });

    this.buttonContainer = document.createElement("div");

    Object.assign(this.buttonContainer.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
    });

    this.buttonContainer.append(this.restartButton, this.menuButton);

    const footer = this.createElement(
      "div",
      "RUFFNECK ENTERTAINMENT",
      {
        marginTop: "24px",
        textAlign: "center",
        fontSize: "10px",
        letterSpacing: "2px",
        color: "#71849a",
      }
    );

    panel.append(
      brand,
      title,
      subtitle,
      this.statsContainer,
      this.resultCard,
      this.message,
      this.buttonContainer,
      footer
    );

    this.root.appendChild(panel);
    document.body.appendChild(this.root);
  }

  createElement(tag, text, styles = {}) {
    const element = document.createElement(tag);

    element.textContent = text;

    Object.assign(element.style, styles);

    if (styles.id) {
      element.id = styles.id;
      delete element.style.id;
      element.removeAttribute("id");
      element.id = styles.id;
    }

    return element;
  }

  createButton(label, primary) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;

    Object.assign(button.style, {
      minHeight: "48px",
      padding: "12px 16px",
      borderRadius: "10px",
      border: primary ? "none" : "1px solid #43546a",
      background: primary ? "#00b4d8" : "transparent",
      color: primary ? "#061421" : "#ffffff",
      fontSize: "14px",
      fontWeight: "800",
      cursor: "pointer",
      transition: "transform 120ms ease, opacity 120ms ease",
    });

    button.addEventListener("pointerenter", () => {
      button.style.opacity = "0.88";
    });

    button.addEventListener("pointerleave", () => {
      button.style.opacity = "1";
    });

    return button;
  }

  bindEvents() {
    if (!this.eventBus) return;

    const events = [
      "gameover",
      "game:over",
      "run:finished",
      "run:gameover",
    ];

    for (const eventName of events) {
      const callback = (payload) => this.show(payload || {});

      const unsubscribe = this.eventBus.on?.(eventName, callback);

      if (typeof unsubscribe === "function") {
        this.listeners.push(unsubscribe);
      }
    }
  }

  getSnapshot(payload = {}) {
    let snapshot = {};

    try {
      if (typeof this.gameState?.getSnapshot === "function") {
        snapshot = this.gameState.getSnapshot() || {};
      } else if (typeof this.gameState?.snapshot === "function") {
        snapshot = this.gameState.snapshot() || {};
      } else if (this.gameState?.state) {
        snapshot = this.gameState.state;
      } else if (this.gameState) {
        snapshot = this.gameState;
      }
    } catch {
      snapshot = {};
    }

    return {
      ...snapshot,
      ...payload,
    };
  }

  formatNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? Math.round(number).toLocaleString("en-NG")
      : "0";
  }

  formatMoney(value) {
    return `₦${this.formatNumber(value)}`;
  }

  getValue(source, keys, fallback = 0) {
    for (const key of keys) {
      const value = source?.[key];

      if (value !== undefined && value !== null && value !== "") {
        const number = Number(value);

        if (Number.isFinite(number)) return number;

        return value;
      }
    }

    return fallback;
  }

  createStat(label, value) {
    const card = document.createElement("div");

    Object.assign(card.style, {
      padding: "14px",
      borderRadius: "12px",
      background: "rgba(255, 255, 255, 0.06)",
      minWidth: "0",
    });

    const heading = this.createElement("div", label, {
      color: "#a9bbd0",
      fontSize: "12px",
      marginBottom: "8px",
    });

    const amount = this.createElement("div", String(value), {
      fontSize: "21px",
      fontWeight: "800",
      overflowWrap: "anywhere",
    });

    card.append(heading, amount);

    return card;
  }

  show(payload = {}) {
    if (!this.root || this.destroyed) return;

    const state = this.getSnapshot(payload);

    const score = this.getValue(
      state,
      ["score", "totalScore", "runScore"],
      0
    );

    const earnings = this.getValue(
      state,
      ["runEarnings", "tripEarnings", "earnedThisRun", "earnings"],
      0
    );

    const distance = this.getValue(
      state,
      ["distanceKm", "distance", "tripDistance"],
      0
    );

    const deliveries = this.getValue(
      state,
      ["deliveries", "passengersDelivered", "completedDeliveries"],
      0
    );

    const nearMisses = this.getValue(
      state,
      ["nearMisses", "nearMissCount"],
      0
    );

    const collisions = this.getValue(
      state,
      ["collisions", "collisionCount"],
      0
    );

    const level = this.getValue(
      state,
      ["level", "playerLevel"],
      1
    );

    const reason = String(
      state.reason || state.endReason || state.status || ""
    ).toLowerCase();

    const failed =
      reason.includes("crash") ||
      reason.includes("damage") ||
      reason.includes("fail") ||
      reason.includes("gameover") ||
      reason.includes("game_over");

    this.statsContainer.replaceChildren(
      this.createStat("DISTANCE", `${this.formatNumber(distance)} km`),
      this.createStat("DELIVERIES", this.formatNumber(deliveries)),
      this.createStat("NEAR MISSES", this.formatNumber(nearMisses)),
      this.createStat("COLLISIONS", this.formatNumber(collisions)),
      this.createStat("PLAYER LEVEL", this.formatNumber(level)),
      this.createStat("TRIP SCORE", this.formatNumber(score))
    );

    this.resultLabel.textContent = failed
      ? "Trip earnings"
      : "Fare and bonuses";

    this.resultValue.textContent = this.formatMoney(earnings);

    this.message.textContent = failed
      ? "Your trip has ended. Review your results and try another run."
      : "Trip completed. Your results are ready for the next journey.";

    this.root.style.display = "flex";
    this.visible = true;

    document.addEventListener("keydown", this.handleKeyDown);

    this.restartButton.focus();

    this.eventBus?.emit?.("gameover:shown", {
      score,
      earnings,
      distance,
      deliveries,
      failed,
    });

    this.saveManager?.save?.();
    this.saveManager?.flush?.();
  }

  hide() {
    if (!this.root) return;

    this.root.style.display = "none";
    this.visible = false;

    document.removeEventListener("keydown", this.handleKeyDown);
  }

  handleKeyDown(event) {
    if (!this.visible) return;

    if (event.key === "Escape") {
      event.preventDefault();
      this.menuButton.focus();
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.onRestart();
      this.hide();
    }
  }

  toggle(payload = {}) {
    if (this.visible) {
      this.hide();
    } else {
      this.show(payload);
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.hide();

    for (const unsubscribe of this.listeners) {
      try {
        unsubscribe();
      } catch {
        // Ignore already-removed subscriptions.
      }
    }

    this.listeners = [];
    this.root?.remove();
    this.root = null;
    this.destroyed = true;
  }
}