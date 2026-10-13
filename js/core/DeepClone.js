export default class DeepClone {
  static clone(value, options = {}) {
    const { preservePrototype = false } = options;
    const seen = new WeakMap();

    const copy = (item) => {
      if (
        item === null ||
        typeof item !== "object"
      ) {
        return item;
      }

      if (seen.has(item)) {
        return seen.get(item);
      }

      if (item instanceof Date) {
        return new Date(item.getTime());
      }

      if (item instanceof RegExp) {
        const result = new RegExp(item.source, item.flags);
        result.lastIndex = item.lastIndex;
        return result;
      }

      if (item instanceof Map) {
        const result = new Map();
        seen.set(item, result);

        for (const [key, entryValue] of item) {
          result.set(copy(key), copy(entryValue));
        }

        return result;
      }

      if (item instanceof Set) {
        const result = new Set();
        seen.set(item, result);

        for (const entry of item) {
          result.add(copy(entry));
        }

        return result;
      }

      if (item instanceof ArrayBuffer) {
        return item.slice(0);
      }

      if (ArrayBuffer.isView(item)) {
        if (item instanceof DataView) {
          return new DataView(
            item.buffer.slice(
              item.byteOffset,
              item.byteOffset + item.byteLength
            )
          );
        }

        return new item.constructor(item);
      }

      if (typeof item === "function") {
        return item;
      }

      if (typeof Node !== "undefined" && item instanceof Node) {
        return item;
      }

      if (Array.isArray(item)) {
        const result = [];
        seen.set(item, result);

        for (const entry of item) {
          result.push(copy(entry));
        }

        return result;
      }

      const prototype = Object.getPrototypeOf(item);

      const result = preservePrototype
        ? Object.create(prototype)
        : Object.create(
            prototype === null ? null : Object.prototype
          );

      seen.set(item, result);

      for (const key of Reflect.ownKeys(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(
          item,
          key
        );

        if (!descriptor) continue;

        if ("value" in descriptor) {
          descriptor.value = copy(descriptor.value);
        }

        try {
          Object.defineProperty(result, key, descriptor);
        } catch {
          result[key] = descriptor.value;
        }
      }

      return result;
    };

    return copy(value);
  }

  static shallowClone(value) {
    if (Array.isArray(value)) {
      return value.slice();
    }

    if (
      value === null ||
      typeof value !== "object"
    ) {
      return value;
    }

    if (value instanceof Map) {
      return new Map(value);
    }

    if (value instanceof Set) {
      return new Set(value);
    }

    return Object.assign(
      Object.create(Object.getPrototypeOf(value)),
      value
    );
  }

  static freezeDeep(value, seen = new WeakSet()) {
    if (
      value === null ||
      typeof value !== "object" ||
      seen.has(value)
    ) {
      return value;
    }

    seen.add(value);

    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(
        value,
        key
      );

      if (descriptor && "value" in descriptor) {
        this.freezeDeep(descriptor.value, seen);
      }
    }

    return Object.freeze(value);
  }

  static isEqual(a, b, seen = new WeakMap()) {
    if (Object.is(a, b)) {
      return true;
    }

    if (
      a === null ||
      b === null ||
      typeof a !== "object" ||
      typeof b !== "object"
    ) {
      return false;
    }

    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) {
      return false;
    }

    if (seen.get(a) === b) {
      return true;
    }

    seen.set(a, b);

    if (a instanceof Date) {
      return a.getTime() === b.getTime();
    }

    if (a instanceof RegExp) {
      return a.source === b.source && a.flags === b.flags;
    }

    if (a instanceof Map) {
      if (a.size !== b.size) return false;

      for (const [key, value] of a) {
        if (!b.has(key) || !this.isEqual(value, b.get(key), seen)) {
          return false;
        }
      }

      return true;
    }

    if (a instanceof Set) {
      if (a.size !== b.size) return false;

      for (const value of a) {
        if (!b.has(value)) return false;
      }

      return true;
    }

    if (ArrayBuffer.isView(a)) {
      if (a.byteLength !== b.byteLength) return false;

      const left = new Uint8Array(
        a.buffer,
        a.byteOffset,
        a.byteLength
      );

      const right = new Uint8Array(
        b.buffer,
        b.byteOffset,
        b.byteLength
      );

      return left.every((value, index) => value === right[index]);
    }

    const keysA = Reflect.ownKeys(a);
    const keysB = Reflect.ownKeys(b);

    if (keysA.length !== keysB.length) {
      return false;
    }

    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) {
        return false;
      }

      const descriptorA = Object.getOwnPropertyDescriptor(a, key);
      const descriptorB = Object.getOwnPropertyDescriptor(b, key);

      if (!descriptorA || !descriptorB) {
        return false;
      }

      if (
        descriptorA.enumerable !== descriptorB.enumerable ||
        descriptorA.configurable !== descriptorB.configurable
      ) {
        return false;
      }

      if ("value" in descriptorA && "value" in descriptorB) {
        if (!this.isEqual(descriptorA.value, descriptorB.value, seen)) {
          return false;
        }
      } else if (
        descriptorA.get !== descriptorB.get ||
        descriptorA.set !== descriptorB.set
      ) {
        return false;
      }
    }

    return true;
  }
}