export default class TouchControlsSystem {
  constructor(inputManager, options = {}) {
    this.inputManager = inputManager;

    this.options = {
      rootId: "game-ui",
      buttonSize: 64,
      opacity: 0.72,
      enableSteering: true,
      enablePedals: true,
      enableHorn: true,
      enablePause: true,
      ...options,
    };

    this.root = null;
    this.container = null;
    this.buttons = new Map();
    this.activePointers = new Map();
    this.enabled = true;
    this.visible = true;
    this.disposed = false;

    this.boundResize = this.handleResize.bind(this);
    this.boundContextMenu = (event) => event.preventDefault();

    this.createControls();

    window.addEventListener("resize", this.boundResize, {
      passive: true,
    });

    this.handleResize();
  }

  createControls() {
    if (typeof document === "undefined") return;

    this.root =
      document.getElementById(this.options.rootId) ||
      document.body;

    this.injectStyles();

    this.container = document.createElement("div");
    this.container.className = "kano-touch-controls";

    Object.assign(this.container.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "30",
      display: "none",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
    });

    this.root.appendChild(this.container);

    this.createSteeringControls();
    this.createPedalControls();
    this.createUtilityControls();

    this.container.addEventListener(
      "contextmenu",
      this.boundContextMenu
    );
  }

  injectStyles() {
    if (document.getElementById("kano-touch-styles")) return;

    const style = document.createElement("style");
    style.id = "kano-touch-styles";

    style.textContent = `
      .kano-touch-button {
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        border: 2px solid rgba(255,255,255,.7);
        border-radius: 50%;
        background: rgba(7,25,45,.76);
        color: #fff;
        font-family: Arial, sans-serif;
        font-weight: 900;
        font-size: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,.3);
        pointer-events: auto;
        touch-action: none;
        -webkit-tap-highlight-color: transparent;
        transition: background .08s, transform .08s;
      }

      .kano-touch-button.active {
        background: rgba(0,180,216,.95);
        border-color: #fff;
        transform: scale(.94);
      }

      .kano-touch-button:focus-visible {
        outline: 3px solid #fbbf24;
        outline-offset: 3px;
      }

      .kano-touch-button.pedal {
        border-radius: 18px;
        font-size: 13px;
        letter-spacing: .5px;
      }

      .kano-touch-button.gas {
        background: rgba(20,125,83,.82);
      }

      .kano-touch-button.brake {
        background: rgba(160,45,45,.82);
      }

      .kano-touch-button.utility {
        border-radius: 12px;
        font-size: 12px;
      }

      @media (hover: hover) and (pointer: fine) {
        .kano-touch-controls { display: none !important; }
      }
    `;

    document.head.appendChild(style);
  }

  createButton(id, label, action, styles = {}, className = "") {
    const button = document.createElement("button");

    button.type = "button";
    button.className =
      `kano-touch-button ${className}`.trim();

    button.textContent = label;
    button.setAttribute("aria-label", action);
    button.dataset.control = action;

    Object.assign(button.style, {
      position: "absolute",
      width: `${this.options.buttonSize}px`,
      height: `${this.options.buttonSize}px`,
      opacity: String(this.options.opacity),
      pointerEvents: "auto",
      ...styles,
    });

    this.container.appendChild(button);

    const entry = {
      id,
      action,
      button,
      pointers: new Set(),
    };

    this.buttons.set(id, entry);

    if (this.isHoldAction(action)) {
      this.bindHoldButton(entry);
    } else {
      this.bindTapButton(entry);
    }

    return button;
  }

  createSteeringControls() {
    if (!this.options.enableSteering) return;

    this.createButton(
      "steer-left",
      "◀",
      "left",
      {
        left: "18px",
        bottom: "100px",
      }
    );

    this.createButton(
      "steer-right",
      "▶",
      "right",
      {
        left: "94px",
        bottom: "100px",
      }
    );
  }

  createPedalControls() {
    if (!this.options.enablePedals) return;

    this.createButton(
      "brake",
      "BRAKE",
      "brake",
      {
        right: "96px",
        bottom: "24px",
        width: "74px",
        height: "60px",
      },
      "pedal brake"
    );

    this.createButton(
      "accelerate",
      "GAS",
      "accelerate",
      {
        right: "18px",
        bottom: "92px",
        width: "74px",
        height: "74px",
      },
      "pedal gas"
    );
  }

  createUtilityControls() {
    if (this.options.enableHorn) {
      this.createButton(
        "horn",
        "HORN",
        "horn",
        {
          right: "18px",
          bottom: "174px",
          width: "58px",
          height: "46px",
        },
        "utility"
      );
    }

    if (this.options.enablePause) {
      this.createButton(
        "pause",
        "Ⅱ",
        "pause",
        {
          right: "18px",
          top: "90px",
          width: "48px",
          height: "48px",
        },
        "utility"
      );
    }
  }

  isHoldAction(action) {
    return [
      "left",
      "right",
      "accelerate",
      "brake",
      "horn",
    ].includes(action);
  }

  bindHoldButton(entry) {
    const { button, action } = entry;

    button.addEventListener("pointerdown", (event) => {
      if (!this.enabled || this.disposed) return;

      event.preventDefault();

      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture may be unavailable on some devices.
      }

      entry.pointers.add(event.pointerId);
      this.activePointers.set(event.pointerId, entry);

      button.classList.add("active");
      this.setInput(action, true);
    });

    const release = (event) => {
      if (!entry.pointers.has(event.pointerId)) return;

      entry.pointers.delete(event.pointerId);
      this.activePointers.delete(event.pointerId);

      if (entry.pointers.size === 0) {
        button.classList.remove("active");
        this.setInput(action, false);
      }
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  bindTapButton(entry) {
    const { button, action } = entry;

    button.addEventListener("pointerdown", (event) => {
      if (!this.enabled || this.disposed) return;

      event.preventDefault();
      button.classList.add("active");
    });

    button.addEventListener("pointerup", (event) => {
      event.preventDefault();

      button.classList.remove("active");

      if (!this.enabled || this.disposed) return;

      this.triggerAction(action);
    });

    button.addEventListener("pointercancel", () => {
      button.classList.remove("active");
    });

    button.addEventListener("click", (event) => {
      // Pointer events handle touch and mouse input.
      // Keyboard activation remains available through click.
      if (
        event.detail === 0 &&
        this.enabled &&
        !this.disposed
      ) {
        this.triggerAction(action);
      }
    });
  }

  setInput(action, pressed) {
    if (!this.inputManager) return;

    if (typeof this.inputManager.setButton === "function") {
      this.inputManager.setButton(action, pressed);
      return;
    }

    if (typeof this.inputManager.setInput === "function") {
      this.inputManager.setInput(action, pressed);
      return;
    }

    if (typeof this.inputManager.setAction === "function") {
      this.inputManager.setAction(action, pressed);
      return;
    }

    if (typeof this.inputManager.handleInput === "function") {
      this.inputManager.handleInput(action, pressed);
    }
  }

  triggerAction(action) {
    if (!this.inputManager) return;

    if (typeof this.inputManager.triggerAction === "function") {
      this.inputManager.triggerAction(action);
      return;
    }

    if (typeof this.inputManager.emit === "function") {
      this.inputManager.emit("action", { action });
      return;
    }

    if (typeof this.inputManager.handleAction === "function") {
      this.inputManager.handleAction(action);
    }
  }

  releaseAll() {
    for (const entry of this.buttons.values()) {
      entry.pointers.clear();
      entry.button.classList.remove("active");

      if (this.isHoldAction(entry.action)) {
        this.setInput(entry.action, false);
      }
    }

    this.activePointers.clear();
  }

  handleResize() {
    if (!this.container || this.disposed) return;

    const isTouchDevice =
      window.matchMedia("(pointer: coarse)").matches ||
      navigator.maxTouchPoints > 0;

    this.container.style.display =
      this.visible && isTouchDevice ? "block" : "none";
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);

    if (!this.enabled) {
      this.releaseAll();
    }

    for (const entry of this.buttons.values()) {
      entry.button.style.pointerEvents =
        this.enabled ? "auto" : "none";

      entry.button.style.opacity = this.enabled
        ? String(this.options.opacity)
        : "0.25";
    }
  }

  setVisible(visible) {
    this.visible = Boolean(visible);

    if (!this.visible) {
      this.releaseAll();
    }

    this.handleResize();
  }

  setOpacity(opacity) {
    this.options.opacity = Math.max(
      0.2,
      Math.min(1, Number(opacity) || 0.72)
    );

    for (const entry of this.buttons.values()) {
      entry.button.style.opacity = String(
        this.options.opacity
      );
    }
  }

  getButton(id) {
    return this.buttons.get(id)?.button ?? null;
  }

  dispose() {
    if (this.disposed) return;

    this.releaseAll();

    window.removeEventListener(
      "resize",
      this.boundResize
    );

    this.container?.remove();

    this.buttons.clear();
    this.activePointers.clear();

    this.container = null;
    this.root = null;
    this.inputManager = null;
    this.disposed = true;
  }
}