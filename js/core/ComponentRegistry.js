export default class ComponentRegistry {
  constructor() {
    this.factories = new Map();
    this.metadata = new Map();
    this.destroyed = false;
  }

  register(name, factory, options = {}) {
    this.assertActive();

    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("Component name must be a non-empty string.");
    }

    if (typeof factory !== "function") {
      throw new TypeError("Component factory must be a function.");
    }

    const key = name.trim();

    if (this.factories.has(key)) {
      throw new Error(`Component "${key}" is already registered.`);
    }

    this.factories.set(key, factory);

    this.metadata.set(key, {
      name: key,
      category: options.category ?? "general",
      version: options.version ?? "1.0.0",
      description: options.description ?? "",
      registeredAt: Date.now(),
    });

    return this;
  }

  replace(name, factory, options = {}) {
    this.assertActive();

    const key = String(name).trim();

    if (!key) {
      throw new TypeError("Component name cannot be empty.");
    }

    if (typeof factory !== "function") {
      throw new TypeError("Component factory must be a function.");
    }

    this.factories.set(key, factory);

    this.metadata.set(key, {
      name: key,
      category: options.category ?? "general",
      version: options.version ?? "1.0.0",
      description: options.description ?? "",
      registeredAt: Date.now(),
    });

    return this;
  }

  create(name, ...args) {
    this.assertActive();

    const factory = this.factories.get(name);

    if (!factory) {
      throw new Error(`Component "${name}" is not registered.`);
    }

    const component = factory(...args);

    if (component == null) {
      throw new Error(
        `Factory for component "${name}" returned no component.`
      );
    }

    return component;
  }

  has(name) {
    return this.factories.has(name);
  }

  unregister(name) {
    this.assertActive();

    const removedFactory = this.factories.delete(name);
    this.metadata.delete(name);

    return removedFactory;
  }

  getMetadata(name) {
    const metadata = this.metadata.get(name);

    return metadata ? { ...metadata } : null;
  }

  list(options = {}) {
    const { category } = options;

    return [...this.metadata.values()]
      .filter((item) => !category || item.category === category)
      .map((item) => ({ ...item }));
  }

  registerDefaults() {
    this.register("entity", (options = {}) => ({
      id: options.id ?? crypto.randomUUID(),
      name: options.name ?? "entity",
      active: true,
      ...options,
    }), {
      category: "ecs",
      description: "Basic game entity.",
    });

    this.register("transform", (options = {}) => ({
      position: { x: 0, y: 0, z: 0, ...options.position },
      rotation: { x: 0, y: 0, z: 0, ...options.rotation },
      scale: { x: 1, y: 1, z: 1, ...options.scale },
    }), {
      category: "ecs",
      description: "Position, rotation and scale component.",
    });

    this.register("velocity", (options = {}) => ({
      x: options.x ?? 0,
      y: options.y ?? 0,
      z: options.z ?? 0,
      acceleration: options.acceleration ?? 0,
    }), {
      category: "physics",
      description: "Movement velocity component.",
    });

    this.register("health", (options = {}) => ({
      current: options.current ?? 100,
      maximum: options.maximum ?? 100,
      invulnerable: options.invulnerable ?? false,
    }), {
      category: "gameplay",
      description: "Health and damage state.",
    });

    this.register("vehicle", (options = {}) => ({
      type: options.type ?? "keke",
      speed: options.speed ?? 0,
      maxSpeed: options.maxSpeed ?? 30,
      lane: options.lane ?? 1,
      occupied: options.occupied ?? false,
    }), {
      category: "gameplay",
      description: "Vehicle gameplay properties.",
    });

    return this;
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("ComponentRegistry has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.factories.clear();
    this.metadata.clear();
    this.destroyed = true;
  }
}