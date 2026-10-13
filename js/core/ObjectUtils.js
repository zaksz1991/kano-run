export default class ObjectUtils {
  static get(object, path, fallback = undefined) {
    if (object == null) return fallback;

    const keys = Array.isArray(path)
      ? path
      : String(path)
          .replace(/\[(\d+)\]/g, ".$1")
          .replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
          .split(".")
          .filter(Boolean);

    let current = object;

    for (const key of keys) {
      if (
        current == null ||
        !Object.prototype.hasOwnProperty.call(current, key)
      ) {
        return fallback;
      }

      current = current[key];
    }

    return current === undefined ? fallback : current;
  }

  static set(object, path, value) {
    if (
      object === null ||
      typeof object !== "object" ||
      Array.isArray(path) && path.length === 0
    ) {
      return false;
    }

    const keys = Array.isArray(path)
      ? path
      : String(path)
          .replace(/\[(\d+)\]/g, ".$1")
          .replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
          .split(".")
          .filter(Boolean);

    if (keys.length === 0) return false;

    let current = object;

    for (let index = 0; index < keys.length - 1; index += 1) {
      const key = keys[index];

      if (
        key === "__proto__" ||
        key === "constructor" ||
        key === "prototype"
      ) {
        return false;
      }

      if (
        current[key] === null ||
        typeof current[key] !== "object"
      ) {
        current[key] = /^\d+$/.test(String(keys[index + 1]))
          ? []
          : {};
      }

      current = current[key];
    }

    const finalKey = keys[keys.length - 1];

    if (
      finalKey === "__proto__" ||
      finalKey === "constructor" ||
      finalKey === "prototype"
    ) {
      return false;
    }

    current[finalKey] = value;
    return true;
  }

  static unset(object, path) {
    if (object === null || typeof object !== "object") {
      return false;
    }

    const keys = Array.isArray(path)
      ? path
      : String(path)
          .replace(/\[(\d+)\]/g, ".$1")
          .replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
          .split(".")
          .filter(Boolean);

    if (keys.length === 0) return false;

    let current = object;

    for (let index = 0; index < keys.length - 1; index += 1) {
      current = current?.[keys[index]];

      if (current == null || typeof current !== "object") {
        return false;
      }
    }

    const finalKey = keys[keys.length - 1];

    if (!Object.prototype.hasOwnProperty.call(current, finalKey)) {
      return false;
    }

    return delete current[finalKey];
  }

  static pick(object, keys = []) {
    if (object === null || typeof object !== "object") {
      return {};
    }

    const result = {};

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        result[key] = object[key];
      }
    }

    return result;
  }

  static omit(object, keys = []) {
    if (object === null || typeof object !== "object") {
      return {};
    }

    const excluded = new Set(keys);
    const result = {};

    for (const key of Object.keys(object)) {
      if (!excluded.has(key)) {
        result[key] = object[key];
      }
    }

    return result;
  }

  static has(object, path) {
    if (object == null) return false;

    const keys = Array.isArray(path)
      ? path
      : String(path)
          .replace(/\[(\d+)\]/g, ".$1")
          .replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
          .split(".")
          .filter(Boolean);

    let current = object;

    for (const key of keys) {
      if (
        current == null ||
        !Object.prototype.hasOwnProperty.call(current, key)
      ) {
        return false;
      }

      current = current[key];
    }

    return true;
  }

  static merge(target, ...sources) {
    if (
      target === null ||
      typeof target !== "object" ||
      Array.isArray(target)
    ) {
      target = {};
    }

    for (const source of sources) {
      if (
        source === null ||
        typeof source !== "object" ||
        Array.isArray(source)
      ) {
        continue;
      }

      for (const key of Object.keys(source)) {
        if (
          key === "__proto__" ||
          key === "constructor" ||
          key === "prototype"
        ) {
          continue;
        }

        const sourceValue = source[key];
        const targetValue = target[key];

        if (
          sourceValue !== null &&
          typeof sourceValue === "object" &&
          !Array.isArray(sourceValue)
        ) {
          target[key] = this.merge(
            targetValue !== null &&
              typeof targetValue === "object" &&
              !Array.isArray(targetValue)
              ? targetValue
              : {},
            sourceValue
          );
        } else {
          target[key] = Array.isArray(sourceValue)
            ? sourceValue.slice()
            : sourceValue;
        }
      }
    }

    return target;
  }

  static entries(object) {
    if (object === null || typeof object !== "object") {
      return [];
    }

    return Object.entries(object);
  }

  static values(object) {
    if (object === null || typeof object !== "object") {
      return [];
    }

    return Object.values(object);
  }

  static isEmpty(object) {
    if (object == null) return true;

    if (typeof object === "string" || Array.isArray(object)) {
      return object.length === 0;
    }

    if (object instanceof Map || object instanceof Set) {
      return object.size === 0;
    }

    if (typeof object === "object") {
      return Reflect.ownKeys(object).length === 0;
    }

    return true;
  }

  static mapValues(object, mapper) {
    if (
      object === null ||
      typeof object !== "object" ||
      typeof mapper !== "function"
    ) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(object).map(([key, value]) => [
        key,
        mapper(value, key, object),
      ])
    );
  }

  static mapKeys(object, mapper) {
    if (
      object === null ||
      typeof object !== "object" ||
      typeof mapper !== "function"
    ) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(object).map(([key, value]) => [
        mapper(value, key, object),
        value,
      ])
    );
  }
}