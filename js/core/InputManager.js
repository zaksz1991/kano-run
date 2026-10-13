const DEFAULT_BINDINGS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  accelerate: ["ArrowUp", "KeyW"],
  brake: ["ArrowDown", "KeyS"],
  handbrake: ["Space"],
  pause: ["Escape", "KeyP"],
  interact: ["KeyE", "Enter"],
  horn: ["KeyH"],
  camera: ["KeyC"],
  radio: ["KeyR"],
  map: ["KeyM"],
};

const BLOCKED_BROWSER_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

export class InputManager {
  constructor(options = {}) {
    this.target = options.target ?? globalThis.window ?? null;
    this.canvas = options.canvas ?? null;
    this.bindings = this.normalizeBindings(
      options.bindings ?? DEFAULT_BINDINGS,
    );

    this.enabled = false;
    this.destroyed = false;

    this.heldKeys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();

    this.actions = new Map();
    this.listeners = new Map();

    this.touchPointers = new Map();
    this.pointerActions = new Map();

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleVisibilityChange =
      this.handleVisibilityChange.bind(this);

    this.buildActionMap();
  }

  normalizeBindings(bindings) {
    const normalized = {};

    for (const [action, keys] of Object.entries(bindings)) {
      normalized[action] = Array.isArray(keys)
        ? [...keys]
        : [keys];
    }

    return normalized;
  }

  buildActionMap() {
    this.actions.clear();

    for (const [action, keys] of Object.entries(this.bindings)) {
      this.actions.set(action, {
        keys: new Set(keys),
        pointers: new Set(),
      });
    }
  }

  enable() {
    this.assertActive();

    if (this.enabled || !this.target) return;

    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("keyup", this.handleKeyUp);
    this.target.addEventListener("blur", this.handleBlur);
    this.target.addEventListener(
      "contextmenu",
      this.handleContextMenu,
    );

    globalThis.document?.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );

    this.enabled = true;
  }

  disable() {
    if (!this.enabled) return;

    this.target?.removeEventListener(
      "keydown",
      this.handleKeyDown,
    );

    this.target?.removeEventListener(
      "keyup",
      this.handleKeyUp,
    );

    this.target?.removeEventListener("blur", this.handleBlur);

    this.target?.removeEventListener(
      "contextmenu",
      this.handleContextMenu,
    );

    globalThis.document?.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );

    this.enabled = false;
    this.releaseAll();
  }

  handleKeyDown(event) {
    if (this.isTypingTarget(event.target)) return;

    if (BLOCKED_BROWSER_KEYS.has(event.code)) {
      event.preventDefault();
    }

    if (event.repeat || this.heldKeys.has(event.code)) return;

    this.heldKeys.add(event.code);
    this.justPressed.add(event.code);

    this.emitActionChanges(event.code, true);
    this.emit("key:down", {
      code: event.code,
      key: event.key,
    });
  }

  handleKeyUp(event) {
    if (!this.heldKeys.has(event.code)) return;

    this.heldKeys.delete(event.code);
    this.justReleased.add(event.code);

    this.emitActionChanges(event.code, false);
    this.emit("key:up", {
      code: event.code,
      key: event.key,
    });
  }

  handleBlur() {
    this.releaseAll();
  }

  handleVisibilityChange() {
    if (globalThis.document?.hidden) {
      this.releaseAll();
    }
  }

  handleContextMenu(event) {
    if (this.enabled) event.preventDefault();
  }

  isTypingTarget(target) {
    if (!target || typeof target !== "object") return false;

    const tag = target.tagName?.toLowerCase();

    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      target.isContentEditable === true
    );
  }

  isDown(action) {
    const state = this.actions.get(action);
    if (!state) return false;

    for (const key of state.keys) {
      if (this.heldKeys.has(key)) return true;
    }

    return state.pointers.size > 0;
  }

  wasPressed(action) {
    const state = this.actions.get(action);
    if (!state) return false;

    for (const key of state.keys) {
      if (this.justPressed.has(key)) return true;
    }

    return [...state.pointers].some(
      (pointerId) =>
        this.touchPointers.get(pointerId)?.justPressed === true,
    );
  }

  wasReleased(action) {
    const state = this.actions.get(action);
    if (!state) return false;

    for (const key of state.keys) {
      if (this.justReleased.has(key)) return true;
    }

    return [...state.pointers].some(
      (pointerId) =>
        this.touchPointers.get(pointerId)?.justReleased === true,
    );
  }

  bindPointer(action, pointerId) {
    this.assertActive();

    if (!this.actions.has(action)) {
      this.actions.set(action, {
        keys: new Set(),
        pointers: new Set(),
      });
    }

    const state = this.actions.get(action);

    if (state.pointers.has(pointerId)) return;

    state.pointers.add(pointerId);

    this.touchPointers.set(pointerId, {
      action,
      justPressed: true,
      justReleased: false,
    });

    this.emit("action:pressed", { action, source: "pointer" });
  }

  releasePointer(pointerId) {
    const pointer = this.touchPointers.get(pointerId);
    if (!pointer) return;

    const state = this.actions.get(pointer.action);
    state?.pointers.delete(pointerId);

    this.touchPointers.delete(pointerId);

    this.emit("action:released", {
      action: pointer.action,
      source: "pointer",
    });
  }

  attachTouchControls(root) {
    this.assertActive();

    if (!root) {
      throw new TypeError("A touch-control root element is required.");
    }

    const cleanups = [];

    root.querySelectorAll("[data-game-action]").forEach((element) => {
      const action = element.dataset.gameAction;

      if (!action) return;

      element.style.touchAction = "none";

      const onPointerDown = (event) => {
        event.preventDefault();

        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture may be unsupported by a host element.
        }

        this.bindPointer(action, event.pointerId);
      };

      const onPointerEnd = (event) => {
        event.preventDefault();
        this.releasePointer(event.pointerId);
      };

      element.addEventListener("pointerdown", onPointerDown);
      element.addEventListener("pointerup", onPointerEnd);
      element.addEventListener("pointercancel", onPointerEnd);
      element.addEventListener("lostpointercapture", onPointerEnd);

      cleanups.push(() => {
        element.removeEventListener("pointerdown", onPointerDown);
        element.removeEventListener("pointerup", onPointerEnd);
        element.removeEventListener("pointercancel", onPointerEnd);
        element.removeEventListener(
          "lostpointercapture",
          onPointerEnd,
        );
      });
    });

    const detach = () => {
      for (const cleanup of cleanups) cleanup();
      this.releaseAll();
    };

    this.pointerActions.set(root, detach);

    return () => {
      detach();
      this.pointerActions.delete(root);
    };
  }

  emitActionChanges(code, pressed) {
    for (const [action, state] of this.actions) {
      if (!state.keys.has(code)) continue;

      this.emit(pressed ? "action:pressed" : "action:released", {
        action,
        source: "keyboard",
        code,
      });
    }
  }

  on(eventName, callback) {
    this.assertActive();

    if (typeof callback !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const listeners = this.listeners.get(eventName);

    if (!listeners) return false;

    const removed = listeners.delete(callback);

    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }

    return removed;
  }

  emit(eventName, payload) {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;

    for (const callback of [...listeners]) {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[InputManager] ${eventName} listener:`, error);
      }
    }
  }

  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();

    for (const pointer of this.touchPointers.values()) {
      pointer.justPressed = false;
      pointer.justReleased = false;
    }
  }

  releaseAll() {
    for (const code of this.heldKeys) {
      this.justReleased.add(code);
      this.emitActionChanges(code, false);
    }

    this.heldKeys.clear();

    for (const pointerId of [...this.touchPointers.keys()]) {
      this.releasePointer(pointerId);
    }

    this.emit("input:cleared");
  }

  setBindings(bindings) {
    this.assertActive();

    this.bindings = this.normalizeBindings(bindings);
    this.buildActionMap();
    this.releaseAll();

    this.emit("bindings:changed", this.bindings);
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("InputManager has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.disable();

    for (const detach of this.pointerActions.values()) {
      detach();
    }

    this.pointerActions.clear();
    this.listeners.clear();
    this.actions.clear();
    this.touchPointers.clear();

    this.destroyed = true;
  }
}

export default InputManager;