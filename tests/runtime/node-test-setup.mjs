// Browser storage shim for Node's built-in test runner.
// Each Node test worker gets an isolated in-memory store; no user/browser data is touched.
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
