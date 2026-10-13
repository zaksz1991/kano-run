const DEFAULT_TRANSITIONS = Object.freeze({
  idle: ["loading", "running", "destroyed"],
  loading: ["ready", "error", "destroyed"],
  ready: ["running", "paused", "destroyed"],
  running: ["paused", "gameover", "error", "destroyed"],
  paused: ["running", "gameover", "destroyed"],
  gameover: ["loading", "ready", "idle", "destroyed"],
  error: ["loading", "idle", "destroyed"],
  destroyed: [],
});

class StateMachine {
  #state;
  #transitions;
  #listeners = new Set();
  #history = [];
  #maxHistory;
  #strict;
  #destroyed = false;

  constructor(options = {}) {
    const {
      initialState = "idle",
      transitions = DEFAULT_TRANSITIONS,
      strict = true,
      maxHistory = 100,
    } = options;

    if (!initialState || typeof initialState !== "string") {
      throw new TypeError("StateMachine requires a valid initialState.");
    }

    this.#state = initialState;
    this.#transitions = new Map();
    this.#strict = Boolean(strict);
    this.#maxHistory = Math.max(1, Math.floor(maxHistory) || 100);

    for (const [state, nextStates] of Object.entries(transitions)) {
      this.#transitions.set(state, new Set(nextStates));
    }

    if (!this.#transitions.has(initialState)) {
      this.#transitions.set(initialState, new Set());
    }

    this.#record(initialState, initialState, "initialize", null);
  }

  get state() {
    return this.#state;
  }

  get destroyed() {
    return this.#destroyed;
  }

  get availableTransitions() {
    return [...(this.#transitions.get(this.#state) || [])];
  }

  is(state) {
    return this.#state === state;
  }

  isAny(...states) {
    return states.flat().includes(this.#state);
  }

  canTransitionTo(nextState) {
    if (this.#destroyed || typeof nextState !== "string") {
      return false;
    }

    if (nextState === this.#state) {
      return true;
    }

    return (
      this.#transitions.get(this.#state)?.has(nextState) === true ||
      !this.#strict
    );
  }

  transition(nextState, metadata = null) {
    this.#assertActive();

    if (typeof nextState !== "string" || !nextState.trim()) {
      throw new TypeError("nextState must be a non-empty string.");
    }

    if (nextState === this.#state) {
      return false;
    }

    const previousState = this.#state;

    if (!this.canTransitionTo(nextState)) {
      throw new Error(
        `Invalid state transition: "${previousState}" -> "${nextState}".`
      );
    }

    if (!this.#transitions.has(nextState)) {
      this.#transitions.set(nextState, new Set());
    }

    this.#state = nextState;
    this.#record(previousState, nextState, "transition", metadata);

    this.#notify({
      type: "transition",
      previousState,
      currentState: nextState,
      metadata,
      timestamp: Date.now(),
    });

    if (nextState === "destroyed") {
      this.#destroyed = true;
    }

    return true;
  }

  forceTransition(nextState, metadata = null) {
    this.#assertActive();

    if (typeof nextState !== "string" || !nextState.trim()) {
      throw new TypeError("nextState must be a non-empty string.");
    }

    if (nextState === this.#state) {
      return false;
    }

    const previousState = this.#state;

    this.#state = nextState;

    if (!this.#transitions.has(nextState)) {
      this.#transitions.set(nextState, new Set());
    }

    this.#record(previousState, nextState, "force", metadata);

    this.#notify({
      type: "force",
      previousState,
      currentState: nextState,
      metadata,
      timestamp: Date.now(),
    });

    if (nextState === "destroyed") {
      this.#destroyed = true;
    }

    return true;
  }

  addTransition(fromState, toState) {
    this.#assertActive();

    if (!fromState || !toState) {
      throw new TypeError("Both fromState and toState are required.");
    }

    if (!this.#transitions.has(fromState)) {
      this.#transitions.set(fromState, new Set());
    }

    this.#transitions.get(fromState).add(toState);

    if (!this.#transitions.has(toState)) {
      this.#transitions.set(toState, new Set());
    }

    return this;
  }

  removeTransition(fromState, toState) {
    this.#assertActive();

    return this.#transitions.get(fromState)?.delete(toState) ?? false;
  }

  onChange(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("onChange expects a function.");
    }

    this.#assertActive();
    this.#listeners.add(listener);

    return () => this.#listeners.delete(listener);
  }

  getHistory(limit = this.#maxHistory) {
    const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));

    return this.#history
      .slice(-safeLimit)
      .map((entry) => ({ ...entry }));
  }

  clearHistory() {
    this.#history.length = 0;
  }

  reset(initialState = "idle", metadata = null) {
    this.#assertActive();

    if (typeof initialState !== "string" || !initialState.trim()) {
      throw new TypeError("initialState must be a non-empty string.");
    }

    const previousState = this.#state;

    if (!this.#transitions.has(initialState)) {
      this.#transitions.set(initialState, new Set());
    }

    this.#state = initialState;

    this.#record(previousState, initialState, "reset", metadata);

    this.#notify({
      type: "reset",
      previousState,
      currentState: initialState,
      metadata,
      timestamp: Date.now(),
    });

    return this;
  }

  destroy() {
    if (this.#destroyed) {
      return;
    }

    if (this.#state !== "destroyed") {
      this.forceTransition("destroyed");
    }

    this.#destroyed = true;
    this.#listeners.clear();
    this.#transitions.clear();
  }

  #record(previousState, currentState, action, metadata) {
    this.#history.push({
      previousState,
      currentState,
      action,
      metadata,
      timestamp: Date.now(),
    });

    if (this.#history.length > this.#maxHistory) {
      this.#history.splice(
        0,
        this.#history.length - this.#maxHistory
      );
    }
  }

  #notify(event) {
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch (error) {
        if (typeof console !== "undefined" && console.error) {
          console.error("StateMachine listener error:", error);
        }
      }
    }
  }

  #assertActive() {
    if (this.#destroyed) {
      throw new Error("StateMachine has been destroyed.");
    }
  }
}

export { StateMachine, DEFAULT_TRANSITIONS };
export default StateMachine;