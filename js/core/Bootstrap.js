import Game from "./Game.js";

export default class Bootstrap {
  constructor(options = {}) {
    this.options = {
      autoStart: false,
      showErrors: true,
      container: "#game-container",
      ...options,
    };

    this.game = null;
    this.started = false;
    this.destroyed = false;
    this.container = null;

    this.handleVisibilityChange =
      this.handleVisibilityChange.bind(this);

    this.handlePageHide = this.handlePageHide.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  async initialize() {
    if (this.destroyed) {
      throw new Error("Bootstrap has been destroyed.");
    }

    if (this.started) {
      return this.game;
    }

    this.container = this.resolveContainer();

    window.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange
    );

    window.addEventListener("pagehide", this.handlePageHide);

    window.addEventListener("error", this.handleError);

    try {
      this.game = new Game(this.options.gameOptions ?? {});

      await this.game.initialize();

      this.started = true;

      this.dispatch("game:initialized", {
        game: this.game,
      });

      if (this.options.autoStart) {
        await this.start();
      }

      return this.game;
    } catch (error) {
      this.showError(error);
      this.dispatch("game:initialization-failed", { error });
      throw error;
    }
  }

  async start() {
    if (this.destroyed) {
      throw new Error("Bootstrap has been destroyed.");
    }

    if (!this.game) {
      await this.initialize();
    }

    if (!this.game || this.game.isRunning) {
      return this.game;
    }

    try {
      await this.game.start();

      this.dispatch("game:started", {
        game: this.game,
      });

      return this.game;
    } catch (error) {
      this.showError(error);
      this.dispatch("game:start-failed", { error });
      throw error;
    }
  }

  pause() {
    if (!this.game) return;

    this.game.pause?.();

    this.dispatch("game:paused", {
      game: this.game,
    });
  }

  resume() {
    if (!this.game) return;

    this.game.resume?.();

    this.dispatch("game:resumed", {
      game: this.game,
    });
  }

  async restart() {
    if (!this.game) {
      return this.initialize();
    }

    this.game.stop?.();

    await this.game.initialize();
    await this.game.start();

    this.dispatch("game:restarted", {
      game: this.game,
    });

    return this.game;
  }

  resolveContainer() {
    const container =
      typeof this.options.container === "string"
        ? document.querySelector(this.options.container)
        : this.options.container;

    if (!container) {
      throw new Error(
        `Game container not found: ${this.options.container}`
      );
    }

    return container;
  }

  handleVisibilityChange() {
    if (!this.game) return;

    if (document.hidden) {
      this.game.pause?.();
    }
  }

  handlePageHide() {
    this.game?.saveManager?.save?.();
  }

  handleError(event) {
    if (event?.error) {
      this.showError(event.error);
    }
  }

  showError(error) {
    if (!this.options.showErrors || !this.container) {
      return;
    }

    let panel = this.container.querySelector(
      "[data-game-error]"
    );

    if (!panel) {
      panel = document.createElement("div");
      panel.dataset.gameError = "true";

      Object.assign(panel.style, {
        position: "absolute",
        inset: "12px",
        zIndex: "9999",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "rgba(12, 18, 30, 0.96)",
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        overflowWrap: "anywhere",
      });

      this.container.appendChild(panel);
    }

    panel.textContent =
      `Kano Run could not continue. ${
        error?.message || "An unexpected error occurred."
      }`;
  }

  dispatch(name, detail = {}) {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail,
      })
    );
  }

  async destroy() {
    if (this.destroyed) return;

    window.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange
    );

    window.removeEventListener(
      "pagehide",
      this.handlePageHide
    );

    window.removeEventListener("error", this.handleError);

    try {
      this.game?.destroy?.();
    } finally {
      this.game = null;
      this.started = false;
      this.destroyed = true;
    }
  }
}