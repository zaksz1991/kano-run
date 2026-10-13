import "./core/Main.js";

class KanoRunApp {
  constructor() {
    this.game = null;
    this.started = false;
    this.destroyed = false;
    this.startButton = null;
    this.errorElement = null;

    this.handleStart = this.handleStart.bind(this);
    this.handlePageHide = this.handlePageHide.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleRestartEvent = this.handleRestartEvent.bind(this);
  }

  async initialize() {
    if (this.destroyed) return;

    const canvas = document.getElementById("c");

    if (!canvas) {
      throw new Error(
        'Game canvas not found. Add <canvas id="c"></canvas> to index.html.'
      );
    }

    this.createStartScreen();
    this.createErrorDisplay();
    this.createGame(canvas);
    this.bindEvents();

    document.dispatchEvent(
      new CustomEvent("kanorun:initialized")
    );
  }

  createGame(canvas = document.getElementById("c")) {
    if (!canvas) {
      throw new Error("Cannot create the game: canvas #c was not found.");
    }

    this.game = new Game({
      canvas,
      container: canvas.parentElement || document.body,

      onReady: () => {
        document.dispatchEvent(
          new CustomEvent("kanorun:ready")
        );
      },

      onError: (error) => {
        this.showError(error);
      },
    });

    return this.game;
  }

  createStartScreen() {
    if (document.getElementById("kano-run-start-screen")) {
      return;
    }

    const screen = document.createElement("div");
    screen.id = "kano-run-start-screen";

    Object.assign(screen.style, {
      position: "fixed",
      inset: "0",
      zIndex: "15000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      boxSizing: "border-box",
      background:
        "radial-gradient(ellipse at center, #173451 0%, #091626 58%, #040a12 100%)",
      color: "#ffffff",
      fontFamily: "Arial, Helvetica, sans-serif",
      textAlign: "center",
    });

    const panel = document.createElement("div");

    Object.assign(panel.style, {
      width: "min(100%, 520px)",
    });

    const monogram = document.createElement("div");
    monogram.textContent = "RN";

    Object.assign(monogram.style, {
      width: "82px",
      height: "82px",
      display: "grid",
      placeItems: "center",
      margin: "0 auto 24px",
      border: "2px solid #00b4d8",
      borderRadius: "22px",
      color: "#00b4d8",
      fontSize: "36px",
      fontWeight: "900",
      background: "rgba(0, 180, 216, 0.08)",
    });

    const title = document.createElement("h1");
    title.textContent = "KANO RUN";

    Object.assign(title.style, {
      margin: "0",
      fontSize: "clamp(38px, 10vw, 66px)",
      fontWeight: "900",
      letterSpacing: "5px",
      lineHeight: "1.1",
    });

    const subtitle = document.createElement("p");
    subtitle.textContent = "ADAIDAITA SAHU";

    Object.assign(subtitle.style, {
      margin: "14px 0 12px",
      color: "#00b4d8",
      fontSize: "14px",
      fontWeight: "800",
      letterSpacing: "4px",
    });

    const description = document.createElement("p");

    description.textContent =
      "Drive through Kano. Pick up passengers. Earn fares. Build your reputation.";

    Object.assign(description.style, {
      maxWidth: "390px",
      margin: "0 auto 30px",
      color: "#b6c7d9",
      fontSize: "14px",
      lineHeight: "1.8",
    });

    this.startButton = document.createElement("button");
    this.startButton.type = "button";
    this.startButton.textContent = "START DRIVING";

    Object.assign(this.startButton.style, {
      width: "min(100%, 280px)",
      minHeight: "56px",
      border: "none",
      borderRadius: "12px",
      background: "#00b4d8",
      color: "#061421",
      fontSize: "15px",
      fontWeight: "900",
      letterSpacing: "2px",
      cursor: "pointer",
    });

    this.startButton.addEventListener(
      "click",
      this.handleStart
    );

    const controls = document.createElement("p");

    controls.textContent =
      "W / ↑ Accelerate   •   S / ↓ Brake   •   A / D Steer";

    Object.assign(controls.style, {
      margin: "26px 0 0",
      color: "#a9bbd0",
      fontSize: "12px",
      lineHeight: "1.8",
    });

    const credit = document.createElement("p");
    credit.textContent = "RUFFNECK ENTERTAINMENT";

    Object.assign(credit.style, {
      margin: "30px 0 0",
      color: "#71849a",
      fontSize: "10px",
      fontWeight: "800",
      letterSpacing: "3px",
    });

    panel.append(
      monogram,
      title,
      subtitle,
      description,
      this.startButton,
      controls,
      credit
    );

    screen.appendChild(panel);
    document.body.appendChild(screen);
  }

  createErrorDisplay() {
    const existing = document.getElementById("kano-run-error");

    if (existing) {
      this.errorElement = existing;
      return;
    }

    this.errorElement = document.createElement("div");
    this.errorElement.id = "kano-run-error";
    this.errorElement.setAttribute("role", "alert");
    this.errorElement.setAttribute("aria-live", "assertive");

    Object.assign(this.errorElement.style, {
      position: "fixed",
      left: "16px",
      right: "16px",
      bottom: "16px",
      zIndex: "30000",
      display: "none",
      padding: "16px",
      border: "1px solid #ef4444",
      borderRadius: "12px",
      background: "#271016",
      color: "#ffffff",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "13px",
      lineHeight: "1.6",
      overflowWrap: "anywhere",
    });

    document.body.appendChild(this.errorElement);
  }

  bindEvents() {
    window.addEventListener(
      "pagehide",
      this.handlePageHide
    );

    window.addEventListener(
      "keydown",
      this.handleKeyDown
    );

    document.addEventListener(
      "kanorun:restart",
      this.handleRestartEvent
    );
  }

  handleRestartEvent() {
    this.restart();
  }

  async handleStart() {
    if (this.started || this.destroyed) {
      return;
    }

    this.setStartButton("LOADING...", true);
    this.hideError();

    try {
      if (!this.game || this.game.isDestroyed) {
        this.createGame();
      }

      await this.game.initialize();

      if (this.destroyed) {
        return;
      }

      await this.game.start();

      if (this.destroyed) {
        return;
      }

      this.started = true;

      const screen = document.getElementById(
        "kano-run-start-screen"
      );

      if (screen) {
        screen.style.display = "none";
      }

      document.dispatchEvent(
        new CustomEvent("kanorun:started")
      );
    } catch (error) {
      console.error("[Kano Run] Start failed:", error);

      /*
       * Game.initialize() destroys its instance when initialization
       * fails. Replace that instance before the next retry.
       */
      if (this.game?.isDestroyed) {
        this.game = null;
      }

      this.started = false;
      this.setStartButton("TRY AGAIN", false);
      this.showError(error);
    }
  }

  setStartButton(label, disabled) {
    if (!this.startButton) {
      return;
    }

    this.startButton.textContent = label;
    this.startButton.disabled = disabled;
    this.startButton.style.opacity = disabled ? "0.65" : "1";
  }

  async restart() {
    if (!this.game || this.destroyed) {
      return;
    }

    try {
      if (this.game.isDestroyed) {
        this.createGame();
        await this.game.initialize();
      }

      await this.game.restart();

      this.started = true;
      this.hideError();

      const screen = document.getElementById(
        "kano-run-start-screen"
      );

      if (screen) {
        screen.style.display = "none";
      }

      document.dispatchEvent(
        new CustomEvent("kanorun:started")
      );
    } catch (error) {
      console.error("[Kano Run] Restart failed:", error);

      if (this.game?.isDestroyed) {
        this.game = null;
      }

      this.started = false;
      this.showError(error);
    }
  }

  handleKeyDown(event) {
    if (
      !this.started &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      this.handleStart();
    }
  }

  handlePageHide() {
    this.game?.stop?.();
  }

  hideError() {
    if (this.errorElement) {
      this.errorElement.style.display = "none";
      this.errorElement.textContent = "";
    }
  }

  showError(error) {
    console.error("[Kano Run]", error);

    if (!this.errorElement) {
      this.createErrorDisplay();
    }

    const message =
      error instanceof Error
        ? error.message
        : String(error || "An unexpected error occurred.");

    this.errorElement.textContent = `Game error: ${message}`;
    this.errorElement.style.display = "block";

    this.setStartButton("TRY AGAIN", false);

    const screen = document.getElementById(
      "kano-run-start-screen"
    );

    if (screen) {
      screen.style.display = "flex";
    }
  }

  async destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    window.removeEventListener(
      "pagehide",
      this.handlePageHide
    );

    window.removeEventListener(
      "keydown",
      this.handleKeyDown
    );

    document.removeEventListener(
      "kanorun:restart",
      this.handleRestartEvent
    );

    this.startButton?.removeEventListener(
      "click",
      this.handleStart
    );

    await this.game?.destroy?.();

    document.getElementById(
      "kano-run-start-screen"
    )?.remove();

    document.getElementById(
      "kano-run-error"
    )?.remove();

    this.game = null;
    this.startButton = null;
    this.errorElement = null;
  }
}

async function bootstrap() {
  const app = new KanoRunApp();

  window.kanoRun = app;

  try {
    await app.initialize();
  } catch (error) {
    console.error(
      "[Kano Run] Application initialization failed:",
      error
    );

    const message = document.createElement("pre");

    message.textContent =
      `Kano Run could not initialize.\n${error?.message || error}`;

    Object.assign(message.style, {
      position: "fixed",
      inset: "20px",
      zIndex: "50000",
      padding: "20px",
      overflow: "auto",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      background: "#180b10",
      color: "#ffffff",
      border: "1px solid #ef4444",
      borderRadius: "12px",
      fontFamily: "monospace",
    });

    document.body.appendChild(message);
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    bootstrap,
    { once: true }
  );
} else {
  bootstrap();
}