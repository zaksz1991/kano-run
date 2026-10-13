export default class DebugOverlay {
  constructor(options = {}) {
    this.options = {
      enabled: false,
      position: "top-left",
      updateInterval: 250,
      showFPS: true,
      showMemory: true,
      showPlayer: true,
      showTraffic: true,
      showWorld: true,
      ...options,
    };

    this.container = null;
    this.content = null;
    this.game = null;
    this.performanceMonitor = null;
    this.interval = null;
    this.visible = false;
    this.destroyed = false;
    this.boundKeydown = this.handleKeydown.bind(this);
  }

  initialize(game, performanceMonitor = null) {
    if (this.destroyed) {
      throw new Error("Cannot initialize a destroyed DebugOverlay.");
    }

    this.game = game;
    this.performanceMonitor = performanceMonitor;

    if (!this.options.enabled || typeof document === "undefined") {
      return this;
    }

    this.createElement();

    document.addEventListener("keydown", this.boundKeydown);

    this.interval = window.setInterval(
      () => this.update(),
      this.options.updateInterval
    );

    return this;
  }

  createElement() {
    if (this.container) return;

    const container = document.createElement("section");

    container.id = "kano-run-debug";
    container.setAttribute("aria-label", "Game diagnostics");

    Object.assign(container.style, {
      position: "fixed",
      top: this.options.position.includes("top") ? "12px" : "auto",
      bottom: this.options.position.includes("bottom") ? "12px" : "auto",
      left: this.options.position.includes("left") ? "12px" : "auto",
      right: this.options.position.includes("right") ? "12px" : "auto",
      zIndex: "10000",
      minWidth: "220px",
      maxWidth: "360px",
      padding: "12px",
      background: "rgba(5, 12, 24, 0.92)",
      color: "#d8f5ff",
      border: "1px solid rgba(0, 180, 216, 0.65)",
      borderRadius: "8px",
      font: "12px/1.6 monospace",
      whiteSpace: "pre-wrap",
      pointerEvents: "none",
      display: "none",
    });

    const heading = document.createElement("div");

    heading.textContent = "KANO RUN · DEBUG";
    heading.style.fontWeight = "bold";
    heading.style.marginBottom = "8px";

    const content = document.createElement("pre");

    Object.assign(content.style, {
      margin: "0",
      font: "inherit",
      whiteSpace: "pre-wrap",
    });

    container.append(heading, content);
    document.body.appendChild(container);

    this.container = container;
    this.content = content;
  }

  handleKeydown(event) {
    if (
      event.code !== "F3" ||
      event.repeat ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    event.preventDefault();
    this.toggle();
  }

  toggle(force = !this.visible) {
    if (!this.container) return;

    this.visible = Boolean(force);
    this.container.style.display = this.visible ? "block" : "none";

    if (this.visible) {
      this.update();
    }
  }

  update() {
    if (!this.visible || !this.content || !this.game) return;

    const lines = [];

    if (this.options.showFPS && this.performanceMonitor) {
      const stats = this.performanceMonitor.getSnapshot();

      lines.push(`FPS: ${stats.fps}`);
      lines.push(`Average FPS: ${stats.averageFps}`);
      lines.push(`Frame time: ${stats.frameTime} ms`);
    }

    if (this.options.showPlayer) {
      const player =
        this.game.getSystem?.("playerVehicle") ??
        this.game.systems?.get?.("playerVehicle");

      const vehicle =
        player?.getPlayerVehicle?.() ??
        player?.playerVehicle ??
        player?.vehicle ??
        null;

      if (vehicle) {
        const position = vehicle.position;

        if (position) {
          lines.push(
            `Player: ${position.x.toFixed(1)}, ` +
              `${position.y.toFixed(1)}, ` +
              `${position.z.toFixed(1)}`
          );
        }
      }
    }

    if (this.options.showTraffic) {
      const traffic =
        this.game.getSystem?.("traffic") ??
        this.game.systems?.get?.("traffic");

      const count =
        traffic?.getVehicleCount?.() ??
        traffic?.vehicles?.length ??
        traffic?.activeVehicles?.length;

      if (Number.isFinite(count)) {
        lines.push(`Traffic vehicles: ${count}`);
      }
    }

    if (this.options.showWorld) {
      lines.push(`Game running: ${Boolean(this.game.isRunning)}`);
      lines.push(`Paused: ${Boolean(this.game.isPaused)}`);
      lines.push(`Systems: ${this.game.systems?.size ?? 0}`);
    }

    if (this.options.showMemory && this.performanceMonitor) {
      const memory = this.performanceMonitor.getSnapshot().memory;

      if (memory.used > 0) {
        lines.push(
          `Memory: ${(memory.used / 1048576).toFixed(1)} MB`
        );
      }
    }

    this.content.textContent = lines.join("\n");
  }

  destroy() {
    if (this.destroyed) return;

    if (this.interval !== null) {
      window.clearInterval(this.interval);
      this.interval = null;
    }

    document.removeEventListener("keydown", this.boundKeydown);
    this.container?.remove();

    this.container = null;
    this.content = null;
    this.game = null;
    this.performanceMonitor = null;
    this.destroyed = true;
  }
}