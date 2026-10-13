export default class EntityManager {
  constructor() {
    this.entities = new Map();
    this.components = new Map();
    this.systems = new Map();
    this.nextEntityId = 1;
    this.destroyed = false;
  }

  createEntity(name = "entity") {
    this.assertActive();

    const id = this.nextEntityId++;

    const entity = {
      id,
      name,
      active: true,
      tags: new Set(),
      createdAt: performance.now(),
    };

    this.entities.set(id, entity);
    this.components.set(id, new Map());

    return entity;
  }

  getEntity(id) {
    return this.entities.get(id) ?? null;
  }

  hasEntity(id) {
    return this.entities.has(id);
  }

  removeEntity(id) {
    const entity = this.entities.get(id);

    if (!entity) return false;

    for (const system of this.systems.values()) {
      try {
        system.onEntityRemoved?.(entity);
      } catch (error) {
        console.error("[Kano Run] Entity removal failed:", error);
      }
    }

    const components = this.components.get(id);

    if (components) {
      for (const component of components.values()) {
        this.disposeComponent(component);
      }
    }

    this.components.delete(id);
    this.entities.delete(id);

    return true;
  }

  addComponent(entityOrId, componentName, component) {
    this.assertActive();

    const id = this.resolveEntityId(entityOrId);

    if (!this.entities.has(id)) {
      throw new Error(`Entity "${id}" does not exist.`);
    }

    if (!componentName || component == null) {
      throw new TypeError(
        "Component name and component instance are required."
      );
    }

    const entityComponents = this.components.get(id);

    if (entityComponents.has(componentName)) {
      this.removeComponent(id, componentName);
    }

    entityComponents.set(componentName, component);

    for (const system of this.systems.values()) {
      system.onComponentAdded?.(
        this.entities.get(id),
        componentName,
        component
      );
    }

    return component;
  }

  getComponent(entityOrId, componentName) {
    const id = this.resolveEntityId(entityOrId);

    return this.components.get(id)?.get(componentName) ?? null;
  }

  hasComponent(entityOrId, componentName) {
    const id = this.resolveEntityId(entityOrId);

    return this.components.get(id)?.has(componentName) ?? false;
  }

  removeComponent(entityOrId, componentName) {
    const id = this.resolveEntityId(entityOrId);
    const entityComponents = this.components.get(id);

    if (!entityComponents?.has(componentName)) {
      return false;
    }

    const component = entityComponents.get(componentName);

    entityComponents.delete(componentName);

    for (const system of this.systems.values()) {
      system.onComponentRemoved?.(
        this.entities.get(id),
        componentName,
        component
      );
    }

    this.disposeComponent(component);

    return true;
  }

  addTag(entityOrId, tag) {
    const entity = this.resolveEntity(entityOrId);

    if (!entity) {
      throw new Error("Cannot tag an unknown entity.");
    }

    entity.tags.add(String(tag));

    return entity;
  }

  removeTag(entityOrId, tag) {
    const entity = this.resolveEntity(entityOrId);

    return entity ? entity.tags.delete(String(tag)) : false;
  }

  hasTag(entityOrId, tag) {
    const entity = this.resolveEntity(entityOrId);

    return entity ? entity.tags.has(String(tag)) : false;
  }

  query(options = {}) {
    const {
      all = [],
      any = [],
      none = [],
      activeOnly = true,
    } = options;

    const matches = [];

    for (const entity of this.entities.values()) {
      if (activeOnly && !entity.active) continue;

      const components = this.components.get(entity.id);

      if (!all.every((name) => components.has(name))) {
        continue;
      }

      if (
        any.length > 0 &&
        !any.some((name) => components.has(name))
      ) {
        continue;
      }

      if (none.some((name) => components.has(name))) {
        continue;
      }

      matches.push(entity);
    }

    return matches;
  }

  registerSystem(name, system) {
    this.assertActive();

    if (!name || !system) {
      throw new TypeError("System name and instance are required.");
    }

    if (this.systems.has(name)) {
      throw new Error(`System "${name}" is already registered.`);
    }

    this.systems.set(name, system);

    system.initialize?.(this);

    return system;
  }

  getSystem(name) {
    return this.systems.get(name) ?? null;
  }

  update(deltaTime) {
    if (this.destroyed) return;

    for (const system of this.systems.values()) {
      if (system.enabled === false) continue;

      system.update?.(deltaTime, this);
    }
  }

  resolveEntityId(entityOrId) {
    if (typeof entityOrId === "number") {
      return entityOrId;
    }

    if (
      entityOrId &&
      typeof entityOrId === "object" &&
      Number.isInteger(entityOrId.id)
    ) {
      return entityOrId.id;
    }

    throw new TypeError("Expected an entity or numeric entity ID.");
  }

  resolveEntity(entityOrId) {
    try {
      return this.getEntity(this.resolveEntityId(entityOrId));
    } catch {
      return null;
    }
  }

  disposeComponent(component) {
    try {
      if (typeof component?.destroy === "function") {
        component.destroy();
      } else if (typeof component?.dispose === "function") {
        component.dispose();
      }
    } catch (error) {
      console.error("[Kano Run] Component cleanup failed:", error);
    }
  }

  assertActive() {
    if (this.destroyed) {
      throw new Error("EntityManager has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) return;

    for (const id of [...this.entities.keys()]) {
      this.removeEntity(id);
    }

    for (const system of [...this.systems.values()].reverse()) {
      try {
        system.destroy?.();
      } catch (error) {
        console.error("[Kano Run] System cleanup failed:", error);
      }
    }

    this.systems.clear();
    this.components.clear();
    this.entities.clear();
    this.destroyed = true;
  }
}