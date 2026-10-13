export default class PauseSystem {
  constructor(options = {}) {
    this.options = {
      rootId: "game-ui",
      onResume: null,
      onRestart: null,
      onQuit: null,
      ...options,
    };

    this.paused = false;
    this.disposed = false;
    this.overlay = null;
    this.menu = null;
    this.previousFocus = null;

    this.callbacks = {
      onResume: this.options.onResume,
      onRestart: this.options.onRestart,
      onQuit: this.options.onQuit,
    };

    this.boundKeyDown = this.handleKeyDown.bind(this);

    this.createOverlay();

    window.addEventListener("keydown", this.boundKeyDown);
  }

  createOverlay() {
    if (typeof document === "undefined") return;

    this.overlay = document.createElement("div");
    this.overlay.className = "kano-pause-overlay";
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.setAttribute("aria-label", "Game paused");
    this.overlay.hidden = true;

    Object.assign(this.overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "1000",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      boxSizing: "border-box",
      background: "rgba(3, 10, 20, .88)",
      backdropFilter: "blur(8px)",
      color: "#fff",
      fontFamily: "Arial, Helvetica, sans-serif",
      pointerEvents: "auto",
    });

    this.injectStyles();

    this.menu = document.createElement("div");
    this.menu.className = "kano-pause-menu";

    Object.assign(this.menu.style, {
      width: "100%",
      maxWidth: "380px",
      padding: "28px",
      boxSizing: "border-box",
      textAlign: "center",
      background: "#0b1e3a",
      border: "1px solid #00b4d8",
      borderRadius: "18px",
      boxShadow: "0 20px 60px rgba(0,0,0,.45)",
    });

    const title = document.createElement("h1");
    title.textContent = "GAME PAUSED";

    Object.assign(title.style, {
      margin: "0 0 6px",
      fontSize: "28px",
      fontWeight: "900",
      letterSpacing: "2px",
    });

    const subtitle = document.createElement("p");
    subtitle.textContent = "KANO RUN · ADAIDAITA SAHU";

    Object.assign(subtitle.style, {
      margin: "0 0 26px",
      fontSize: "11px",
      letterSpacing: "2px",
      color: "#00d4ff",
    });

    this.menu.append(title, subtitle);

    this.createMenuButton(
      "RESUME DRIVING",
      () => this.resume(),
      true
    );

    this.createMenuButton(
      "RESTART TRIP",
      () => this.confirmRestart()
    );

    this.createMenuButton(
      "QUIT TO MENU",
      () => this.confirmQuit()
    );

    const hint = document.createElement("p");
    hint.textContent = "Press ESC or P to resume";

    Object.assign(hint.style, {
      margin: "22px 0 0",
      fontSize: "12px",
      color: "#aebdca",
    });

    this.menu.appendChild(hint);
    this.overlay.appendChild(this.menu);

    const parent =
      document.getElementById(this.options.rootId) ||
      document.body;

    parent.appendChild(this.overlay);
  }

  injectStyles() {
    if (document.getElementById("kano-pause-styles")) return;

    const style = document.createElement("style");
    style.id = "kano-pause-styles";

    style.textContent = `
      .kano-pause-button {
        width: 100%;
        min-height: 48px;
        margin: 6px 0;
        padding: 12px 16px;
        border: 1px solid rgba(255,255,255,.25);
        border-radius: 10px;
        background: #152d4d;
        color: white;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: .5px;
        cursor: pointer;
        transition: background .15s, transform .15s;
      }

      .kano-pause-button:hover {
        background: #17476b;
      }

      .kano-pause-button:active {
        transform: scale(.98);
      }

      .kano-pause-button.primary {
        background: #00b4d8;
        color: #071726;
        border-color: #00d4ff;
      }

      .kano-pause-button.primary:hover {
        background: #4cdef5;
      }

      .kano-pause-button:focus-visible {
        outline: 3px solid #fbbf24;
        outline-offset: 3px;
      }

      .kano-pause-confirmation {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid rgba(255,255,255,.15);
      }

      .kano-pause-confirmation p {
        font-size: 13px;
        line-height: 1.5;
        color: #d4deea;
      }

      .kano-pause-confirmation button {
        margin: 4px;
        padding: 10px 14px;
        border: 0;
        border-radius: 7px;
        cursor: pointer;
        font-weight: 700;
      }
    `;

    document.head.appendChild(style);
  }

  createMenuButton(label, action, primary = false) {
    const button = document.createElement("button");

    button.type = "button";
    button.className =
      `kano-pause-button${primary ? " primary" : ""}`;

    button.textContent = label;
    button.addEventListener("click", action);

    this.menu.appendChild(button);

    return button;
  }

  handleKeyDown(event) {
    if (event.repeat || this.disposed) return;

    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )
    ) {
      return;
    }

    if (event.code === "Escape" || event.code === "KeyP") {
      event.preventDefault();

      if (this.paused) {
        this.resume();
      } else {
        this.pause();
      }
    }
  }

  pause() {
    if (this.paused || this.disposed) return false;

    this.paused = true;
    this.previousFocus = document.activeElement;

    if (this.overlay) {
      this.overlay.hidden = false;
      this.overlay.style.display = "flex";

      const resumeButton =
        this.menu.querySelector(".primary");

      resumeButton?.focus({ preventScroll: true });
    }

    return true;
  }

  resume() {
    if (!this.paused || this.disposed) return false;

    this.paused = false;

    if (this.overlay) {
      this.overlay.style.display = "none";
      this.overlay.hidden = true;
    }

    this.clearConfirmation();

    if (this.previousFocus instanceof HTMLElement) {
      this.previousFocus.focus({ preventScroll: true });
    }

    this.previousFocus = null;

    if (typeof this.callbacks.onResume === "function") {
      this.callbacks.onResume();
    }

    return true;
  }

  confirmRestart() {
    this.showConfirmation(
      "Restart this trip? Current trip progress may be lost.",
      "RESTART",
      () => {
        this.clearConfirmation();

        if (typeof this.callbacks.onRestart === "function") {
          this.callbacks.onRestart();
        }

        this.resume();
      }
    );
  }

  confirmQuit() {
    this.showConfirmation(
      "Leave the current trip and return to the main menu?",
      "QUIT",
      () => {
        this.clearConfirmation();

        if (typeof this.callbacks.onQuit === "function") {
          this.callbacks.onQuit();
        }
      }
    );
  }

  showConfirmation(message, confirmLabel, onConfirm) {
    this.clearConfirmation();

    const section = document.createElement("div");
    section.className = "kano-pause-confirmation";

    const text = document.createElement("p");
    text.textContent = message;

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = confirmLabel;
    confirmButton.style.background = "#fbbf24";
    confirmButton.style.color = "#111827";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "CANCEL";
    cancelButton.style.background = "#243d5b";
    cancelButton.style.color = "#fff";

    confirmButton.addEventListener("click", onConfirm);

    cancelButton.addEventListener("click", () => {
      this.clearConfirmation();
    });

    section.append(text, confirmButton, cancelButton);
    this.menu.appendChild(section);

    confirmButton.focus({ preventScroll: true });
  }

  clearConfirmation() {
    this.menu
      ?.querySelector(".kano-pause-confirmation")
      ?.remove();
  }

  setCallbacks(callbacks = {}) {
    for (const key of ["onResume", "onRestart", "onQuit"]) {
      if (key in callbacks) {
        this.callbacks[key] = callbacks[key];
      }
    }
  }

  isPaused() {
    return this.paused;
  }

  dispose() {
    if (this.disposed) return;

    window.removeEventListener(
      "keydown",
      this.boundKeyDown
    );

    this.overlay?.remove();

    this.overlay = null;
    this.menu = null;
    this.previousFocus = null;
    this.callbacks = {};

    this.paused = false;
    this.disposed = true;
  }
}