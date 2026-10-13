export default class PoolManager {
  constructor(options = {}) {
    this.options = {
      initialSize: 8,
      maxSize: 128,
      expandPool: true,
      ...options,
    };

    this.pools = new Map();
    this.destroyed = false;
  }

  createPool(name, factory, options = {}) {
    this.assertActive();

    if (this.pools.has(name)) {
      throw new Error(`Pool "${name}" already exists.`);
    }

    if (typeof factory !== "function") {
      throw new TypeError("Pool factory must be a function.");
    }

    const initialSize = Math.max(
      0,
      Math.floor(options.initialSize ?? this.options.initialSize)
    );

    const maxSize = Math.max(
      initialSize,
      Math.floor(options.maxSize ?? this.options.maxSize)
    );

    const pool = {
      name,
      factory,
      maxSize,
      available: [],
      active: new Set(),
      created: 0,
      acquireCount: 0,
      releaseCount: 0,
    };

    this.pools.set(name, pool);

    try {
      for (let i = 0; i < initialSize; i += 1) {
        pool.available.push(this.createInstance(pool));
      }
    } catch (error) {
      this.destroyPool(name);
      throw error;
    }

    return this;
  }

  createInstance(pool) {
    const instance = pool.factory();

    if (instance == null) {
      throw new Error(
        `Factory for pool "${pool.name}" returned no instance.`
      );
    }

    pool.created += 1;

    if (typeof instance.setActive === "function") {
      instance.setActive(false);
    }

    if (instance.visible !== undefined) {
      instance.visible = false;
    }

    return instance;
  }

  acquire(name, ...args) {
    this.assertActive();

    const pool = this.pools.get(name);

    if (!pool) {
      throw new Error(`Pool "${name}" does not exist.`);
    }

    let instance = pool.available.pop();

    if (!instance) {
      if (
        !this.options.expandPool ||
        pool.created >= pool.maxSize
      ) {
        return null;
      }

      instance = this.createInstance(pool);
    }

    pool.active.add(instance);
    pool.acquireCount += 1;

    try {
      if (typeof instance.reset === "function") {
        instance.reset(...args);
      }

      if (typeof instance.onAcquire === "function") {
        instance.onAcquire(...args);
      }

      if (typeof instance.setActive === "function") {
        instance.setActive(true);
      }

      if (instance.visible !== undefined) {
        instance.visible = true;
      }

      return instance;
    } catch (error) {
      pool.active.delete(instance);
      pool.available.push(instance);
      throw error;
    }
  }

  release(name, instance) {
    const pool = this.pools.get(name);

    if (!pool || !pool.active.has(instance)) {
      return false;
    }

    pool.active.delete(instance);
    pool.releaseCount += 1;

    try {
      if (typeof instance.onRelease === "function") {
        instance.onRelease();
      }

      if (typeof instance.setActive === "function") {
        instance.setActive(false);
      }

      if (instance.visible !== undefined) {
        instance.visible = false;
      }
    } finally {
      pool.available.push(instance);
    }

    return true;
  }

  releaseAll(name) {
    const pool = this.pools.get(name);

    if (!pool) return 0;

    const instances = [...pool.active];
    let released = 0;

    for (const instance of instances) {
      if (this.release(name, instance)) {
        released += 1;
      }
    }

    return released;
  }

  getActive(name) {
    const pool = this.pools.get(name);

    return pool ? [...pool.active] : [];
  }

  getStats(name) {
    const pool = this.pools.get(name);

    if (!pool) return null;

    return {
      name: pool.name,
      created: pool.created,
      active: pool.active.size,
      available: pool.available.length,
      maxSize: pool.maxSize,
      acquireCount: pool.acquireCount,
      releaseCount: pool.releaseCount,
    };
  }

  getAllStats() {
    return [...this.pools.keys()]
      .map((name) => this.getStats(name))
      .filter(Boolean);
  }

  destroyPool(name) {
    const pool = this.pools.get(name);

    if (!pool) return false;

    const instances = [
      ...pool.available,
      ...pool.active,
    ];

    for (const instance of instances) {
      try {
        if (typeof instance.destroy === "function") {
          instance.destroy();
        } else if (typeof instance.dispose === "function") {
          instance.dispose();
        }
      } catch (error) {
        console.error(
          `[Kano Run] Failed to dispose pool "${name}":`,
          error
        );
      }
    }

    pool.available.length = 0;
    pool.active.clear();

    this.pools.delete(name);

    return true;
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("PoolManager has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) return;

    for (const name of [...this.pools.keys()]) {
      this.destroyPool(name);
    }

    this.destroyed = true;
  }
}