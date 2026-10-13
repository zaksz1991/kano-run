class GamepadManager {
  constructor(options = {}) {
    this.options = {
      deadzone: 0.18,
      onConnect: null,
      onDisconnect: null,
      ...options,
    };

    this.gamepads = new Map();
    this.previousButtons = new Map();
    this.listeners = new Map();
    this.started = false;

    this.handleConnected = this.handleConnected.bind(this);
    this.handleDisconnected = this.handleDisconnected.bind(this);
  }

  start() {
    if (this.started || typeof window === "undefined") return;

    this.started = true;

    window.addEventListener("gamepadconnected", this.handleConnected);
    window.addEventListener(
      "gamepaddisconnected",
      this.handleDisconnected
    );

    this.poll();
  }

  handleConnected(event) {
    const gamepad = event.gamepad;

    this.gamepads.set(gamepad.index, gamepad);
    this.previousButtons.set(gamepad.index, []);

    this.emit("connected", {
      index: gamepad.index,
      id: gamepad.id,
      mapping: gamepad.mapping,
    });

    if (typeof this.options.onConnect === "function") {
      this.options.onConnect(gamepad);
    }
  }

  handleDisconnected(event) {
    const gamepad = event.gamepad;

    this.gamepads.delete(gamepad.index);
    this.previousButtons.delete(gamepad.index);

    this.emit("disconnected", {
      index: gamepad.index,
      id: gamepad.id,
    });

    if (typeof this.options.onDisconnect === "function") {
      this.options.onDisconnect(gamepad);
    }
  }

  poll() {
    if (typeof navigator === "undefined" ||
        typeof navigator.getGamepads !== "function") {
      return [];
    }

    const connected = Array.from(navigator.getGamepads()).filter(Boolean);

    for (const gamepad of connected) {
      this.gamepads.set(gamepad.index, gamepad);
    }

    for (const index of this.gamepads.keys()) {
      if (!connected.some((gamepad) => gamepad.index === index)) {
        this.gamepads.delete(index);
        this.previousButtons.delete(index);
      }
    }

    return connected;
  }

  update() {
    const connected = this.poll();

    for (const gamepad of connected) {
      const previous = this.previousButtons.get(gamepad.index) || [];
      const current = gamepad.buttons.map((button) => button.pressed);

      current.forEach((pressed, index) => {
        if (pressed && !previous[index]) {
          this.emit("buttondown", {
            gamepadIndex: gamepad.index,
            buttonIndex: index,
            gamepad,
          });
        } else if (!pressed && previous[index]) {
          this.emit("buttonup", {
            gamepadIndex: gamepad.index,
            buttonIndex: index,
            gamepad,
          });
        }
      });

      this.previousButtons.set(gamepad.index, current);
    }
  }

  getGamepads() {
    return this.poll().map((gamepad) => ({
      index: gamepad.index,
      id: gamepad.id,
      mapping: gamepad.mapping,
      axes: Array.from(gamepad.axes),
      buttons: gamepad.buttons.map((button) => ({
        pressed: button.pressed,
        value: button.value,
      })),
    }));
  }

  getAxis(gamepadIndex, axisIndex) {
    const gamepad = this.gamepads.get(gamepadIndex);
    if (!gamepad) return 0;

    const value = gamepad.axes[axisIndex] || 0;

    return Math.abs(value) < this.options.deadzone ? 0 : value;
  }

  isButtonPressed(gamepadIndex, buttonIndex) {
    const gamepad = this.gamepads.get(gamepadIndex);
    return Boolean(gamepad?.buttons[buttonIndex]?.pressed);
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Gamepad callback must be a function.");
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
        console.error("Gamepad listener failed:", error);
      }
    }
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener(
        "gamepadconnected",
        this.handleConnected
      );

      window.removeEventListener(
        "gamepaddisconnected",
        this.handleDisconnected
      );
    }

    this.gamepads.clear();
    this.previousButtons.clear();
    this.listeners.clear();
    this.started = false;
  }
}

export default GamepadManager;