class KeyboardManager {
  constructor(options = {}) {
    this.options = {
      preventDefaults: true,
      ignoreInputs: true,
      ...options,
    };

    this.keys = new Map();
    this.pressedKeys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.listeners = new Map();
    this.started = false;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
  }

  start() {
    if (this.started || typeof window === "undefined") return;

    this.started = true;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
  }

  handleKeyDown(event) {
    if (this.options.ignoreInputs && this.isEditable(event.target)) {
      return;
    }

    const key = this.normalizeKey(event.key);

    if (this.options.preventDefaults && this.isGameKey(key)) {
      event.preventDefault();
    }

    if (!this.keys.get(key)) {
      this.justPressed.add(key);
      this.emit("keydown", { key, event });
    }

    this.keys.set(key, true);
    this.pressedKeys.add(key);
  }

  handleKeyUp(event) {
    const key = this.normalizeKey(event.key);

    if (this.options.ignoreInputs && this.isEditable(event.target)) {
      this.keys.set(key, false);
      this.pressedKeys.delete(key);
      return;
    }

    if (this.keys.get(key)) {
      this.justReleased.add(key);
      this.emit("keyup", { key, event });
    }

    this.keys.set(key, false);
    this.pressedKeys.delete(key);
  }

  handleBlur() {
    for (const key of this.pressedKeys) {
      this.justReleased.add(key);
      this.emit("keyup", { key, event: null });
    }

    this.keys.clear();
    this.pressedKeys.clear();
  }

  normalizeKey(key) {
    if (key === " ") return "space";
    return String(key).toLowerCase();
  }

  isEditable(target) {
    if (!target) return false;

    const tag = target.tagName?.toLowerCase();

    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      target.isContentEditable
    );
  }

  isGameKey(key) {
    return [
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      " ",
      "space",
      "w",
      "a",
      "s",
      "d",
      "escape",
    ].includes(key);
  }

  isDown(key) {
    return this.pressedKeys.has(this.normalizeKey(key));
  }

  wasPressed(key) {
    return this.justPressed.has(this.normalizeKey(key));
  }

  wasReleased(key) {
    return this.justReleased.has(this.normalizeKey(key));
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Keyboard callback must be a function.");
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
        console.error("Keyboard listener failed:", error);
      }
    }
  }

  update() {
    this.justPressed.clear();
    this.justReleased.clear();
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleKeyDown);
      window.removeEventListener("keyup", this.handleKeyUp);
      window.removeEventListener("blur", this.handleBlur);
    }

    this.keys.clear();
    this.pressedKeys.clear();
    this.justPressed.clear();
    this.justReleased.clear();
    this.listeners.clear();
    this.started = false;
  }
}

export default KeyboardManager;