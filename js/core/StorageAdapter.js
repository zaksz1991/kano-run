export default class StorageAdapter {
  #storage;
  #prefix;
  #disposed = false;

  constructor(options = {}) {
    this.#prefix = options.prefix ?? "kano-run:";
    this.#storage = options.storage ?? this.#getStorage();

    if (!this.#storage) {
      throw new Error("Browser storage is unavailable.");
    }
  }

  get(key, fallback = null) {
    this.#assertActive();

    const raw = this.#storage.getItem(this.#key(key));

    if (raw === null) return fallback;

    try {
      const record = JSON.parse(raw);

      if (
        record &&
        typeof record === "object" &&
        Object.hasOwn(record, "value")
      ) {
        if (
          record.expiresAt > 0 &&
          Date.now() >= record.expiresAt
        ) {
          this.delete(key);
          return fallback;
        }

        return record.value;
      }

      return record;
    } catch {
      return fallback;
    }
  }

  set(key, value, options = {}) {
    this.#assertActive();

    const ttl = Number.isFinite(options.ttl)
      ? Math.max(0, options.ttl)
      : 0;

    const record = {
      value,
      savedAt: Date.now(),
      expiresAt: ttl > 0 ? Date.now() + ttl : 0,
    };

    try {
      this.#storage.setItem(
        this.#key(key),
        JSON.stringify(record)
      );

      return true;
    } catch (error) {
      console.error("[StorageAdapter] Save failed:", error);
      return false;
    }
  }

  has(key) {
    this.#assertActive();

    const storageKey = this.#key(key);
    const raw = this.#storage.getItem(storageKey);

    if (raw === null) return false;

    try {
      const record = JSON.parse(raw);

      if (
        record &&
        typeof record === "object" &&
        record.expiresAt > 0 &&
        Date.now() >= record.expiresAt
      ) {
        this.#storage.removeItem(storageKey);
        return false;
      }

      return true;
    } catch {
      return true;
    }
  }

  delete(key) {
    this.#assertActive();

    try {
      this.#storage.removeItem(this.#key(key));
      return true;
    } catch (error) {
      console.error("[StorageAdapter] Delete failed:", error);
      return false;
    }
  }

  clear() {
    this.#assertActive();

    const keysToRemove = [];

    for (let index = 0; index < this.#storage.length; index += 1) {
      const key = this.#storage.key(index);

      if (key?.startsWith(this.#prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.#storage.removeItem(key);
    }

    return keysToRemove.length;
  }

  keys() {
    this.#assertActive();

    const result = [];

    for (let index = 0; index < this.#storage.length; index += 1) {
      const key = this.#storage.key(index);

      if (key?.startsWith(this.#prefix)) {
        result.push(key.slice(this.#prefix.length));
      }
    }

    return result;
  }

  getAll() {
    this.#assertActive();

    const result = {};

    for (const key of this.keys()) {
      if (this.has(key)) {
        result[key] = this.get(key);
      }
    }

    return result;
  }

  setAll(values) {
    this.#assertActive();

    if (!values || typeof values !== "object" || Array.isArray(values)) {
      throw new TypeError("setAll() expects a plain object.");
    }

    const results = {};

    for (const [key, value] of Object.entries(values)) {
      results[key] = this.set(key, value);
    }

    return results;
  }

  get size() {
    return this.keys().length;
  }

  #key(key) {
    if (key === undefined || key === null || String(key).length === 0) {
      throw new TypeError("Storage key must not be empty.");
    }

    return `${this.#prefix}${String(key)}`;
  }

  #getStorage() {
    try {
      if (typeof globalThis === "undefined") return null;

      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error("StorageAdapter has been disposed.");
    }
  }

  dispose() {
    this.#disposed = true;
  }
}