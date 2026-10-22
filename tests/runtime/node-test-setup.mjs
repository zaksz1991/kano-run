// Browser storage/event shims for Node's built-in test runner.
// Each test worker gets isolated in-memory state; no real browser data is touched.
const memory = new Map();

const localStorageShim = {
  get length() { return memory.size; },
  key(index) { return [...memory.keys()][index] ?? null; },
  getItem(key) {
    const normalized = String(key);
    return memory.has(normalized) ? memory.get(normalized) : null;
  },
  setItem(key, value) {
    memory.set(String(key), String(value));
  },
  removeItem(key) {
    memory.delete(String(key));
  },
  clear() {
    memory.clear();
  },
};

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: localStorageShim,
  });
}

// Some game storage helpers dispatch wallet-update events. Tests often expose
// globalThis as `window`; providing EventTarget prevents misleading warning
// floods while still exercising real dispatch/listener behavior.
if (typeof globalThis.dispatchEvent !== 'function'
  || typeof globalThis.addEventListener !== 'function'
  || typeof globalThis.removeEventListener !== 'function') {
  const target = new EventTarget();
  for (const method of ['dispatchEvent', 'addEventListener', 'removeEventListener']) {
    if (typeof globalThis[method] !== 'function') {
      Object.defineProperty(globalThis, method, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: target[method].bind(target),
      });
    }
  }
}

if (typeof globalThis.CustomEvent !== 'function' && typeof globalThis.Event === 'function') {
  class CustomEventShim extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.detail = init.detail ?? null;
    }
  }
  Object.defineProperty(globalThis, 'CustomEvent', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: CustomEventShim,
  });
}
