class TouchManager {
  constructor(element = document?.body, options = {}) {
    this.element = element;

    this.options = {
      preventDefaults: true,
      swipeThreshold: 40,
      tapThreshold: 12,
      ...options,
    };

    this.touches = new Map();
    this.listeners = new Map();
    this.started = false;

    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleTouchCancel = this.handleTouchCancel.bind(this);
  }

  start() {
    if (this.started || !this.element) return;

    this.started = true;

    this.element.addEventListener(
      "touchstart",
      this.handleTouchStart,
      { passive: !this.options.preventDefaults }
    );

    this.element.addEventListener(
      "touchmove",
      this.handleTouchMove,
      { passive: !this.options.preventDefaults }
    );

    this.element.addEventListener(
      "touchend",
      this.handleTouchEnd,
      { passive: true }
    );

    this.element.addEventListener(
      "touchcancel",
      this.handleTouchCancel,
      { passive: true }
    );
  }

  handleTouchStart(event) {
    if (this.options.preventDefaults && event.cancelable) {
      event.preventDefault();
    }

    for (const touch of event.changedTouches) {
      this.touches.set(touch.identifier, {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        x: touch.clientX,
        y: touch.clientY,
        startTime: performance.now(),
        deltaX: 0,
        deltaY: 0,
        moved: false,
      });
    }

    this.emit("start", this.getActiveTouches());
  }

  handleTouchMove(event) {
    if (this.options.preventDefaults && event.cancelable) {
      event.preventDefault();
    }

    for (const touch of event.changedTouches) {
      const state = this.touches.get(touch.identifier);
      if (!state) continue;

      state.x = touch.clientX;
      state.y = touch.clientY;
      state.deltaX = state.x - state.startX;
      state.deltaY = state.y - state.startY;

      if (
        Math.abs(state.deltaX) > this.options.tapThreshold ||
        Math.abs(state.deltaY) > this.options.tapThreshold
      ) {
        state.moved = true;
      }
    }

    this.emit("move", this.getActiveTouches());
  }

  handleTouchEnd(event) {
    for (const touch of event.changedTouches) {
      const state = this.touches.get(touch.identifier);
      if (!state) continue;

      state.x = touch.clientX;
      state.y = touch.clientY;
      state.deltaX = state.x - state.startX;
      state.deltaY = state.y - state.startY;

      const duration = performance.now() - state.startTime;
      const absX = Math.abs(state.deltaX);
      const absY = Math.abs(state.deltaY);

      if (
        !state.moved &&
        absX <= this.options.tapThreshold &&
        absY <= this.options.tapThreshold
      ) {
        this.emit("tap", { ...state, duration });
      } else if (
        Math.max(absX, absY) >= this.options.swipeThreshold
      ) {
        let direction;

        if (absX > absY) {
          direction = state.deltaX > 0 ? "right" : "left";
        } else {
          direction = state.deltaY > 0 ? "down" : "up";
        }

        this.emit("swipe", {
          ...state,
          direction,
          duration,
        });
      }

      this.touches.delete(touch.identifier);
    }

    this.emit("end", this.getActiveTouches());
  }

  handleTouchCancel(event) {
    for (const touch of event.changedTouches) {
      this.touches.delete(touch.identifier);
    }

    this.emit("cancel", this.getActiveTouches());
  }

  getActiveTouches() {
    return Array.from(this.touches.values()).map((touch) => ({
      ...touch,
    }));
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Touch callback must be a function.");
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    this.listeners.get(eventName)?.delete(callback);
  }

  emit(eventName, payload) {
    for (const callback of this.listeners.get(eventName) || []) {
      try {
        callback(payload);
      } catch (error) {
        console.error("Touch listener failed:", error);
      }
    }
  }

  destroy() {
    if (this.element) {
      this.element.removeEventListener(
        "touchstart",
        this.handleTouchStart
      );
      this.element.removeEventListener(
        "touchmove",
        this.handleTouchMove
      );
      this.element.removeEventListener(
        "touchend",
        this.handleTouchEnd
      );
      this.element.removeEventListener(
        "touchcancel",
        this.handleTouchCancel
      );
    }

    this.touches.clear();
    this.listeners.clear();
    this.started = false;
  }
}

export default TouchManager;