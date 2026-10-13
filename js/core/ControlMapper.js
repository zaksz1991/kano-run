const DEFAULT_BINDINGS = {
  accelerate: ["arrowup", "w", "gamepad:0"],
  brake: ["arrowdown", "s", "gamepad:1"],
  steerLeft: ["arrowleft", "a", "gamepad:14"],
  steerRight: ["arrowright", "d", "gamepad:15"],
  handbrake: ["space", "gamepad:2"],
  pause: ["escape", "p", "gamepad:9"],
  interact: ["e", "enter", "gamepad:0"],
  horn: ["h", "gamepad:3"],
  camera: ["c", "gamepad:4"],
};

class ControlMapper {
  constructor(options = {}) {
    this.bindings = {
      ...DEFAULT_BINDINGS,
      ...(options.bindings || {}),
    };

    this.keyboard = options.keyboard || null;
    this.gamepad = options.gamepad || null;
    this.touchActions = new Map();
    this.customActions = new Map();
  }

  setKeyboardManager(manager) {
    this.keyboard = manager;
  }

  setGamepadManager(manager) {
    this.gamepad = manager;
  }

  bind(action, inputs) {
    if (!action || !Array.isArray(inputs)) {
      throw new TypeError("An action and an array of inputs are required.");
    }

    this.bindings[action] = [...new Set(inputs)];
  }

  addBinding(action, input) {
    if (!this.bindings[action]) {
      this.bindings[action] = [];
    }

    if (!this.bindings[action].includes(input)) {
      this.bindings[action].push(input);
    }
  }

  removeBinding(action, input) {
    if (!this.bindings[action]) return;

    this.bindings[action] = this.bindings[action].filter(
      (binding) => binding !== input
    );
  }

  registerTouchAction(action, getter) {
    if (typeof getter !== "function") {
      throw new TypeError("Touch action getter must be a function.");
    }

    this.touchActions.set(action, getter);

    return () => this.touchActions.delete(action);
  }

  registerAction(action, getter) {
    if (typeof getter !== "function") {
      throw new TypeError("Action getter must be a function.");
    }

    this.customActions.set(action, getter);

    return () => this.customActions.delete(action);
  }

  isActive(action) {
    const custom = this.customActions.get(action);

    if (custom) {
      try {
        if (custom()) return true;
      } catch (error) {
        console.error(`Custom action "${action}" failed:`, error);
      }
    }

    const touch = this.touchActions.get(action);

    if (touch) {
      try {
        if (touch()) return true;
      } catch (error) {
        console.error(`Touch action "${action}" failed:`, error);
      }
    }

    return (this.bindings[action] || []).some((input) =>
      this.isInputActive(input)
    );
  }

  isInputActive(input) {
    if (typeof input !== "string") return false;

    if (input.startsWith("gamepad:")) {
      if (!this.gamepad) return false;

      const buttonIndex = Number(input.slice("gamepad:".length));

      if (!Number.isInteger(buttonIndex)) return false;

      const gamepads = this.gamepad.getGamepads();

      return gamepads.some((gamepad) => {
        const button = gamepad.buttons[buttonIndex];
        return Boolean(button?.pressed);
      });
    }

    return Boolean(this.keyboard?.isDown(input));
  }

  wasPressed(action) {
    const keyboard = this.keyboard;

    return (this.bindings[action] || []).some((input) => {
      if (input.startsWith("gamepad:")) {
        return false;
      }

      return Boolean(keyboard?.wasPressed(input));
    });
  }

  getAxis(action) {
    if (action === "steer") {
      const left = this.isActive("steerLeft");
      const right = this.isActive("steerRight");

      if (left === right) return 0;
      return left ? -1 : 1;
    }

    if (action === "throttle") {
      return this.isActive("accelerate") ? 1 : 0;
    }

    if (action === "brake") {
      return this.isActive("brake") ? 1 : 0;
    }

    return 0;
  }

  getState() {
    const actions = Object.keys(this.bindings);
    const state = {};

    for (const action of actions) {
      state[action] = this.isActive(action);
    }

    state.steer = this.getAxis("steer");
    state.throttle = this.getAxis("throttle");
    state.brakeAmount = this.getAxis("brake");

    return state;
  }

  exportBindings() {
    return JSON.parse(JSON.stringify(this.bindings));
  }

  importBindings(bindings) {
    if (!bindings || typeof bindings !== "object" ||
        Array.isArray(bindings)) {
      throw new TypeError("Bindings must be an object.");
    }

    for (const [action, inputs] of Object.entries(bindings)) {
      if (Array.isArray(inputs) &&
          inputs.every((input) => typeof input === "string")) {
        this.bind(action, inputs);
      }
    }
  }

  resetBindings() {
    this.bindings = { ...DEFAULT_BINDINGS };
  }

  destroy() {
    this.touchActions.clear();
    this.customActions.clear();
    this.keyboard = null;
    this.gamepad = null;
  }
}

export default ControlMapper;