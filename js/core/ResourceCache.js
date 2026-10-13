export default class ResourceCache {
  #cache = new Map();
  #pending = new Map();
  #maxEntries;
  #defaultTTL;
  #disposed = false;

  constructor(options = {}) {
    this.#maxEntries = Math.max(
      1,
      Number.isInteger(options.maxEntries)
        ? options.maxEntries
        : 200
    );

    this.#defaultTTL = Math.max(
      0,
      Number.isFinite(options.ttl)
        ? options.ttl
        : 0
    );
  }

  get size() {
    return this.#cache.size;
  }

  has(key) {
    this.#assertActive();

    const entry = this.#cache.get(key);

    if (!entry) return false;

    if (this.#isExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  get(key, fallback = undefined) {
    this.#assertActive();

    const entry = this.#cache.get(key);

    if (!entry) return fallback;

    if (this.#isExpired(entry)) {
      this.delete(key);
      return fallback;
    }

    entry.lastAccessed = Date.now();
    entry.accessCount += 1;

    // Refresh insertion order for least-recently-used eviction.
    this.#cache.delete(key);
    this.#cache.set(key, entry);

    return entry.value;
  }

  set(key, value, options = {}) {
    this.#assertActive();

    if (key === undefined || key === null) {
      throw new TypeError("Cache key cannot be null or undefined.");
    }

    const ttl = Number.isFinite(options.ttl)
      ? Math.max(0, options.ttl)
      : this.#defaultTTL;

    const now = Date.now();

    this.#cache.delete(key);

    this.#cache.set(key, {
      value,
      createdAt: now,
      lastAccessed: now,
      accessCount: 0,
      expiresAt: ttl > 0 ? now + ttl : 0,
    });

    this.#evictIfNeeded();

    return value;
  }

  getOrCreate(key, factory, options = {}) {
    this.#assertActive();

    if (typeof factory !== "function") {
      throw new TypeError("Factory must be a function.");
    }

    if (this.has(key)) {
      return Promise.resolve(this.get(key));
    }

    if (this.#pending.has(key)) {
      return this.#pending.get(key);
    }

    const pending = Promise.resolve()
      .then(() => factory())
      .then((value) => {
        if (!this.#disposed) {
          this.set(key, value, options);
        }

        return value;
      })
      .finally(() => {
        if (this.#pending.get(key) === pending) {
          this.#pending.delete(key);
        }
      });

    this.#pending.set(key, pending);

    return pending;
  }

  delete(key) {
    this.#assertActive();
    return this.#cache.delete(key);
  }

  clear() {
    this.#assertActive();
    this.#cache.clear();
  }

  prune() {
    this.#assertActive();

    let removed = 0;

    for (const [key, entry] of this.#cache) {
      if (this.#isExpired(entry)) {
        this.#cache.delete(key);
        removed += 1;
      }
    }

    return removed;
  }

  keys() {
    this.#assertActive();
    this.prune();
    return [...this.#cache.keys()];
  }

  entries() {
    this.#assertActive();
    this.prune();

    return [...this.#cache.entries()].map(([key, entry]) => [
      key,
      entry.value,
    ]);
  }

  getStats() {
    this.#assertActive();

    let expired = 0;

    for (const entry of this.#cache.values()) {
      if (this.#isExpired(entry)) expired += 1;
    }

    return {
      size: this.#cache.size,
      pending: this.#pending.size,
      maxEntries: this.#maxEntries,
      expired,
    };
  }

  #isExpired(entry) {
    return entry.expiresAt > 0 && Date.now() >= entry.expiresAt;
  }

  #evictIfNeeded() {
    while (this.#cache.size > this.#maxEntries) {
      const oldestKey = this.#cache.keys().next().value;

      if (oldestKey === undefined) break;

      this.#cache.delete(oldestKey);
    }
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error("ResourceCache has been disposed.");
    }
  }

  dispose() {
    if (this.#disposed) return;

    this.#disposed = true;
    this.#cache.clear();
    this.#pending.clear();
  }
}