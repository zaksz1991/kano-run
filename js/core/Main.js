import Game from "./Game.js";

class KanoRunApp {
  constructor() {
    this.game = null;
    this.started = false;
    this.destroyed = false;
    this.startButton = null;
    this.loadingScreen = null;
    this.loadingProgress = null;
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
      throw new Error('Game canvas not found. Add <canvas id="c"></canvas> to index.html.');
    }

    console.log("[Kano Run] App initializing...");

    //  Use the existing HTML elements from index.html
    this.loadingScreen = document.getElementById("loading-screen");
    this.startButton = document.getElementById("start-btn");
    this.loadingProgress = document.getElementById("loading-progress");

    if (this.startButton) {
      this.startButton.addEventListener("click", this.handleStart);
      console.log("[Kano Run] Start button found and wired up.");
    } else {
      console.warn("[Kano Run] Start button not found in HTML.");
    }

    if (this.loadingProgress) {
      this.loadingProgress.classList.add("active");
    }

    this.createErrorDisplay();
    this.createGame(canvas);
    this.bindEvents();

    document.dispatchEvent(new CustomEvent("kanorun:initialized"));
    console.log("[Kano Run] App initialized successfully.");
  }

  createGame(canvas = document.getElementById("c")) {
    if (!canvas) {
      throw new Error("Cannot create the game: canvas #c was not found.");
    }

    this.game = new Game({
      canvas,
      container: canvas.parentElement || document.body,
      onReady: () => {
        console.log("[Kano Run] Game engine is ready.");
        if (this.loadingProgress) {
          this.loadingProgress.style.width = "100%";
          this.loadingProgress.classList.remove("active");
        }
        document.dispatchEvent(new CustomEvent("kanorun:ready"));
      },
      onError: (error) => {
        console.error("[Kano Run] Game engine error:", error);
        this.showError(error);
      },
    });

    return this.game;
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
    window.addEventListener("pagehide", this.handlePageHide);
    window.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("kanorun:restart", this.handleRestartEvent);
  }

  handleRestartEvent() {
    this.restart();
  }

  async handleStart() {
    if (this.started || this.destroyed) {
      return;
    }

    console.log("[Kano Run] Start button clicked. Preparing game instance...");

    if (this.startButton) {
      this.startButton.disabled = true;
      this.startButton.textContent = "LOADING...";
      this.startButton.style.opacity = "0.65";
    }
    this.setStatus("Loading world… this can take a minute on first run");
    this.setProgress(8);

    this.hideError();

    try {
      // Always use a fresh Game instance after a failed start
      if (!this.game || this.game.isDestroyed || this.game.isInitialized === false) {
        try {
          this.game?.destroy?.();
        } catch (e) {
          console.warn("[Kano Run] Cleanup failed:", e);
        }
        this.createGame();
      }

      console.log("[Kano Run] Calling game.initialize()...");
      this.setStatus("Initializing systems…");
      this.setProgress(15);

      // Progress pulse while init runs (checkpoint can be slow)
      let fake = 15;
      const pulse = setInterval(() => {
        fake = Math.min(88, fake + 2);
        this.setProgress(fake);
        if (fake > 40) this.setStatus("Loading scenery & vehicles…");
        if (fake > 70) this.setStatus("Almost ready…");
      }, 800);

      const initPromise = this.game.initialize();
      // Soft timeout warning only — do not kill init
      const warn = setTimeout(() => {
        this.setStatus("Still loading large assets — please wait…");
      }, 20000);

      await initPromise;
      clearInterval(pulse);
      clearTimeout(warn);
      this.setProgress(92);
      this.setStatus("Starting run…");
      console.log("[Kano Run] game.initialize() finished. Calling game.start()...");

      if (this.destroyed) return;

      await this.game.start();
      this.setProgress(100);
      console.log("[Kano Run] game.start() finished successfully.");

      if (this.destroyed) return;

      this.started = true;

      //  Hide the HTML loading screen
      if (this.loadingScreen) {
        this.loadingScreen.classList.add("hidden");
      }

      document.dispatchEvent(new CustomEvent("kanorun:started"));
      console.log("[Kano Run] Game started! Loading screen hidden.");
    } catch (error) {
      console.error("[Kano Run] Start failed with error:", error);

      // Game.initialize() destroys its instance when initialization fails.
      if (this.game?.isDestroyed) {
        this.game = null;
      }

      this.started = false;
      this.setStartButton("TRY AGAIN", false);
      this.setStatus("Load failed — try again");
      this.showError(error);
    }
  }

  setStartButton(label, disabled) {
    if (!this.startButton) return;

    this.startButton.textContent = label;
    this.startButton.disabled = disabled;
    this.startButton.style.opacity = disabled ? "0.65" : "1";
  }

  async restart() {
    if (!this.game || this.destroyed) return;

    try {
      if (this.game.isDestroyed) {
        this.createGame();
        await this.game.initialize();
      }

      await this.game.restart();

      this.started = true;
      this.hideError();

      if (this.loadingScreen) {
        this.loadingScreen.classList.add("hidden");
      }

      document.dispatchEvent(new CustomEvent("kanorun:started"));
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
    if (!this.started && (event.key === "Enter" || event.key === " ")) {
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
    console.error("[Kano Run] Displaying error:", error);

    if (!this.errorElement) {
      this.createErrorDisplay();
    }

    const message = error instanceof Error ? error.message : String(error || "An unexpected error occurred.");
    this.errorElement.textContent = `Game error: ${message}`;
    this.errorElement.style.display = "block";

    this.setStartButton("TRY AGAIN", false);

    // Show the loading screen again if there's an error
    if (this.loadingScreen) {
      this.loadingScreen.classList.remove("hidden");
    }
  }

  async destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    window.removeEventListener("pagehide", this.handlePageHide);
    window.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("kanorun:restart", this.handleRestartEvent);

    if (this.startButton) {
      this.startButton.removeEventListener("click", this.handleStart);
    }

    await this.game?.destroy?.();

    this.game = null;
    this.startButton = null;
    this.loadingScreen = null;
    this.loadingProgress = null;
    this.errorElement = null;
  }
}

async function bootstrap() {
  const app = new KanoRunApp();
  window.kanoRun = app;

  try {
    await app.initialize();
  } catch (error) {
    console.error("[Kano Run] Application initialization failed:", error);

    const message = document.createElement("pre");
    message.textContent = `Kano Run could not initialize.\n${error?.message || error}`;

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
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}

export default KanoRunApp;