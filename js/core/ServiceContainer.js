export default class ServiceContainer {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
    this.singletons = new Set();
    this.resolving = new Set();
    this.destroyOrder = [];
    this.destroyed = false;
  }

  register(name, instance, options = {}) {
    this.assertAvailable();
    this.assertName(name);

    if (instance === undefined || instance === null) {
      throw new TypeError(
        `[ServiceContainer] Cannot register an empty service: "${name}".`
      );
    }

    if (this.services.has(name) || this.factories.has(name)) {
      throw new Error(
        `[ServiceContainer] Service "${name}" is already registered.`
      );
    }

    this.services.set(name, instance);

    if (options.singleton !== false) {
      this.singletons.add(name);
    }

    this.destroyOrder.push(name);

    return instance;
  }

  registerFactory(name, factory, options = {}) {
    this.assertAvailable();
    this.assertName(name);

    if (typeof factory !== "function") {
      throw new TypeError(
        `[ServiceContainer] Factory for "${name}" must be a function.`
      );
    }

    if (this.services.has(name) || this.factories.has(name)) {
      throw new Error(
        `[ServiceContainer] Service "${name}" is already registered.`
      );
    }

    this.factories.set(name, {
      factory,
      singleton: options.singleton !== false,
    });

    return this;
  }

  has(name) {
    return this.services.has(name) || this.factories.has(name);
  }

  get(name) {
    this.assertAvailable();

    if (this.services.has(name)) {
      return this.services.get(name);
    }

    const definition = this.factories.get(name);

    if (!definition) {
      throw new Error(
        `[ServiceContainer] Unknown service: "${name}".`
      );
    }

    if (this.resolving.has(name)) {
      throw new Error(
        `[ServiceContainer] Circular dependency detected while resolving "${name}".`
      );
    }

    this.resolving.add(name);

    try {
      const instance = definition.factory(this);

      if (instance === undefined || instance === null) {
        throw new Error(
          `[ServiceContainer] Factory for "${name}" returned no instance.`
        );
      }

      if (definition.singleton) {
        this.services.set(name, instance);
        this.singletons.add(name);
        this.destroyOrder.push(name);
      }

      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  getOptional(name, fallback = null) {
    if (!this.has(name)) return fallback;

    try {
      return this.get(name);
    } catch {
      return fallback;
    }
  }

  resolve(names) {
    if (!Array.isArray(names)) {
      throw new TypeError(
        "[ServiceContainer] resolve() expects an array of service names."
      );
    }

    return names.map((name) => this.get(name));
  }

  createScope() {
    this.assertAvailable();

    const parent = this;

    return {
      get(name) {
        return parent.get(name);
      },

      has(name) {
        return parent.has(name);
      },

      resolve(names) {
        return parent.resolve(names);
      },
    };
  }

  list() {
    return [
      ...new Set([
        ...this.services.keys(),
        ...this.factories.keys(),
      ]),
    ];
  }

  unregister(name, options = {}) {
    this.assertAvailable();

    const instance = this.services.get(name);

    if (options.destroy === true && instance) {
      this.destroyInstance(instance);
    }

    this.services.delete(name);
    this.factories.delete(name);
    this.singletons.delete(name);

    this.destroyOrder = this.destroyOrder.filter(
      (serviceName) => serviceName !== name
    );

    return Boolean(instance);
  }

  destroyInstance(instance) {
    if (!instance) return;

    try {
      if (typeof instance.destroy === "function") {
        instance.destroy();
      } else if (typeof instance.dispose === "function") {
        instance.dispose();
      } else if (typeof instance.stop === "function") {
        instance.stop();
      }
    } catch (error) {
      console.error(
        "[ServiceContainer] Service cleanup failed:",
        error
      );
    }
  }

  assertName(name) {
    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError(
        "[ServiceContainer] Service name must be a non-empty string."
      );
    }
  }

  assertAvailable() {
    if (this.destroyed) {
      throw new Error(
        "[ServiceContainer] Container has already been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) return;

    for (const name of [...this.destroyOrder].reverse()) {
      if (!this.singletons.has(name)) continue;

      this.destroyInstance(this.services.get(name));
    }

    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
    this.resolving.clear();
    this.destroyOrder = [];
    this.destroyed = true;
  }
}