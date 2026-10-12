/**
 * Controls — LEFT = screen left, RIGHT = screen right
 * Game Developer: Hassan Zakariya
 */
export class Controls {
  constructor(game, opts = {}) {
    this.game = game;
    this.laneCount = Math.max(2, Math.floor(opts.lanes || 3));
    this.laneLambda = opts.laneLambda ?? 7;
    this.laneLerp = opts.laneLerp ?? 0.18;
    this.swipeMinPx = opts.swipeMinPx ?? 28;

    this.targetLane = 1;
    this.smoothLane = 1;
    this.laneVel = 0;

    this._touchStartX = 0;
    this._touchStartY = 0;
    this._swiping = false;
    this._bound = false;
    this._lastT = 0;

    this._keys = new Set();
    this._cleanups = [];
    this._activePointers = new Map();
    this._gasPressed = false;
    this._brakePressed = false;
    this._destroyed = false;
  }

  bind() {
    if (this._bound || this._destroyed) return;
    this._bound = true;

    const left = document.getElementById("left-btn");
    const right = document.getElementById("right-btn");
    const gas = document.getElementById("gas-btn");
    const brake = document.getElementById("brake-btn");
    const horn = document.getElementById("horn-btn");
    const pauseBtn = document.getElementById("pause-btn");
    const camBtn = document.getElementById("cam-btn");
    const radioBtn = document.getElementById("radio-btn");

    const canvas = this.game.canvas || document.getElementById("c");
    const container =
      document.getElementById("game-container") || canvas?.parentElement;

    // Lane 0 = left, lane 1 = center, lane 2 = right.
    this._hold(left, () => this.steerLeft());
    this._hold(right, () => this.steerRight());

    this._press(
      gas,
      () => this._setGas(true),
      () => this._setGas(false)
    );

    this._press(
      brake,
      () => this._setBrake(true),
      () => this._setBrake(false)
    );

    this._listen(window, "blur", () => this._releaseInputs());

    this._listen(document, "visibilitychange", () => {
      if (document.hidden) this._releaseInputs();
    });

    if (horn) {
      this._listen(horn, "click", (e) => {
        e.preventDefault();
        this.game.horn?.();
      });
    }

    if (pauseBtn) {
      this._listen(pauseBtn, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.togglePause?.();
      });
    }

    if (camBtn) {
      this._listen(camBtn, "click", (e) => {
        e.preventDefault();
        this.game.toggleCabin?.();
      });
    }

    if (radioBtn) this._bindRadio(radioBtn);

    this._listen(window, "keydown", (e) => this._onKeyDown(e));
    this._listen(window, "keyup", (e) => this._onKeyUp(e));

    const surface = container || canvas;

    if (surface) {
      this._listen(
        surface,
        "touchstart",
        (e) => this._onTouchStart(e),
        { passive: true }
      );

      this._listen(
        surface,
        "touchmove",
        (e) => this._onTouchMove(e),
        { passive: false }
      );

      this._listen(
        surface,
        "touchend",
        (e) => this._onTouchEnd(e),
        { passive: true }
      );

      this._listen(
        surface,
        "touchcancel",
        () => {
          this._swiping = false;
        },
        { passive: true }
      );
    }

    if (typeof this.game.playerLane === "number") {
      const lane = this._clampLane(this.game.playerLane);
      this.targetLane = lane;
      this.smoothLane = lane;
    }

    this.game.playerLane = this.targetLane;
    this.game.smoothLane = this.smoothLane;
  }

  _listen(target, event, handler, options) {
    if (!target?.addEventListener) return;

    target.addEventListener(event, handler, options);

    this._cleanups.push(() => {
      target.removeEventListener(event, handler, options);
    });
  }

  _bindRadio(button) {
    let holdTimer = null;
    let longPressTriggered = false;
    let pointerActive = false;

    const clearHold = () => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    this._listen(button, "pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;

      e.preventDefault();
      pointerActive = true;
      longPressTriggered = false;
      clearHold();

      holdTimer = setTimeout(() => {
        if (!pointerActive) return;

        longPressTriggered = true;

        if (this.game.radioOn !== false) {
          this.game.toggleRadio?.();
        }
      }, 450);
    });

    const finish = (e) => {
      if (!pointerActive) return;

      e?.preventDefault?.();
      pointerActive = false;
      clearHold();

      if (!longPressTriggered) {
        this.game.cycleRadio?.();
      }
    };

    this._listen(button, "pointerup", finish);
    this._listen(button, "pointercancel", () => {
      pointerActive = false;
      clearHold();
    });

    this._listen(window, "blur", () => {
      pointerActive = false;
      clearHold();
    });
  }

  _clampLane(lane) {
    return Math.max(0, Math.min(this.laneCount - 1, Math.round(lane)));
  }

  steerLeft() {
    this.setTargetLane(this.targetLane - 1);
  }

  steerRight() {
    this.setTargetLane(this.targetLane + 1);
  }

  setTargetLane(lane) {
    const nextLane = this._clampLane(lane);

    if (nextLane === this.targetLane) return;

    this.targetLane = nextLane;

    if (this.game) {
      this.game.playerLane = nextLane;
      this.game.bounce = Math.max(this.game.bounce || 0, 5);
    }
  }

  reset(lane = 1) {
    const nextLane = this._clampLane(lane);

    this.targetLane = nextLane;
    this.smoothLane = nextLane;
    this.laneVel = 0;
    this._lastT = 0;

    if (this.game) {
      this.game.playerLane = nextLane;
      this.game.smoothLane = nextLane;
      this.game.steerBlend = nextLane - 1;
    }
  }

  /**
   * Frame-rate-independent spring steering.
   * Call once per game update.
   */
  update() {
    if (this._destroyed) return;

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const rawDt = this._lastT
      ? (now - this._lastT) / 1000
      : 1 / 60;

    this._lastT = now;

    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    const target = this.targetLane;

    const stiffness = 18;
    const damping = 11;

    this.laneVel +=
      (stiffness * (target - this.smoothLane) -
        damping * this.laneVel) *
      dt;

    this.smoothLane += this.laneVel * dt;

    if (
      Math.abs(this.smoothLane - target) < 0.002 &&
      Math.abs(this.laneVel) < 0.01
    ) {
      this.smoothLane = target;
      this.laneVel = 0;
    }

    if (this.game) {
      this.game.smoothLane = this.smoothLane;
      this.game.playerLane = this.targetLane;
      this.game.steerBlend = this.smoothLane - 1;
    }
  }

  _hold(element, action) {
    if (!element) return;

    this._listen(element, "pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      action();
    });
  }

  _press(element, down, up) {
    if (!element) return;

    const pointers = new Set();

    const handleDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;

      e.preventDefault();

      const id = e.pointerId ?? "mouse";

      if (pointers.has(id)) return;

      pointers.add(id);
      down();

      try {
        element.setPointerCapture?.(e.pointerId);
      } catch {
        // Pointer capture is optional.
      }
    };

    const handleUp = (e) => {
      const id = e.pointerId ?? "mouse";

      if (!pointers.has(id)) return;

      pointers.delete(id);

      if (pointers.size === 0) up();
    };

    this._listen(element, "pointerdown", handleDown);
    this._listen(element, "pointerup", handleUp);
    this._listen(element, "pointercancel", handleUp);
    this._listen(element, "lostpointercapture", handleUp);

    this._listen(window, "pointerup", handleUp);
    this._listen(window, "pointercancel", handleUp);
    this._listen(window, "blur", () => {
      pointers.clear();
      up();
    });
  }

  _setGas(pressed) {
    this._gasPressed = pressed;

    if (pressed) {
      this.game.setThrottle?.(1);
    } else {
      this.game.setThrottle?.(0.6);
    }
  }

  _setBrake(pressed) {
    this._brakePressed = pressed;
    this.game.setBrake?.(pressed);

    if (!pressed && !this._gasPressed) {
      this.game.setThrottle?.(0.6);
    }
  }

  _onKeyDown(e) {
    if (e.repeat || this._destroyed) return;

    const key = e.key.toLowerCase();
    const gameKeys = [
      "arrowleft",
      "arrowright",
      "arrowup",
      "arrowdown",
      "a",
      "d",
      "w",
      "s",
      " ",
      "h",
      "p",
      "escape",
    ];

    if (gameKeys.includes(key) && !this._isTypingTarget(e.target)) {
      e.preventDefault();
    } else {
      return;
    }

    this._keys.add(key);

    if (key === "arrowleft" || key === "a") this.steerLeft();
    if (key === "arrowright" || key === "d") this.steerRight();

    if (key === "arrowup" || key === "w") this._setGas(true);
    if (key === "arrowdown" || key === "s") this._setBrake(true);

    if (key === " " || key === "h") this.game.horn?.();

    if (key === "p" || key === "escape") {
      this.game.togglePause?.();
    }
  }

  _onKeyUp(e) {
    const key = e.key.toLowerCase();

    this._keys.delete(key);

    if (key === "arrowup" || key === "w") this._setGas(false);
    if (key === "arrowdown" || key === "s") this._setBrake(false);
  }

  _isTypingTarget(target) {
    if (!target) return false;

    return (
      target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    );
  }

  _onTouchStart(e) {
    const touch = e.changedTouches?.[0] || e.touches?.[0];
    if (!touch) return;

    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
    this._swiping = true;
  }

  _onTouchMove(e) {
    if (!this._swiping) return;

    const touch = e.changedTouches?.[0] || e.touches?.[0];
    if (!touch) return;

    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;

    if (Math.abs(dx) > this.swipeMinPx && Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault();
    }
  }

  _onTouchEnd(e) {
    if (!this._swiping) return;

    this._swiping = false;

    const touch = e.changedTouches?.[0];
    if (!touch) return;

    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;

    if (
      Math.abs(dx) < this.swipeMinPx ||
      Math.abs(dx) < Math.abs(dy)
    ) {
      return;
    }

    if (dx < 0) {
      this.steerLeft();
    } else {
      this.steerRight();
    }
  }

  _releaseInputs() {
    this._keys.clear();
    this._gasPressed = false;
    this._brakePressed = false;
    this._swiping = false;

    this.game?.setBrake?.(false);
    this.game?.setThrottle?.(0.6);
  }

  destroy() {
    if (this._destroyed) return;

    this._releaseInputs();

    for (const cleanup of this._cleanups.splice(0)) {
      cleanup();
    }

    this._destroyed = true;
    this._bound = false;
  }
}