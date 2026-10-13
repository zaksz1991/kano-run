const DEFAULT_PREFIX = "kano";
const COUNTER_KEY = "__kanoRunIdCounter";

function createRandomSegment() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }

  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }

  return `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2)}${Math.random().toString(36).slice(2)}`;
}

class IdGenerator {
  static #counter = 0;
  static #usedIds = new Set();

  static next(prefix = DEFAULT_PREFIX) {
    const normalizedPrefix = this.#normalizePrefix(prefix);
    const timestamp = Date.now().toString(36);
    const counter = (++this.#counter).toString(36);
    const random = createRandomSegment();

    const id = `${normalizedPrefix}_${timestamp}_${counter}_${random}`;

    this.#usedIds.add(id);

    return id;
  }

  static short(prefix = DEFAULT_PREFIX, length = 8) {
    const normalizedPrefix = this.#normalizePrefix(prefix);
    const safeLength = Math.max(
      4,
      Math.min(32, Math.floor(Number(length) || 8))
    );

    return `${normalizedPrefix}_${createRandomSegment().slice(
      0,
      safeLength
    )}`;
  }

  static uuid() {
    if (
      typeof globalThis.crypto !== "undefined" &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return globalThis.crypto.randomUUID();
    }

    const hex = createRandomSegment();

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      `4${hex.slice(13, 16)}`,
      `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(
        17,
        20
      )}`,
      hex.slice(20, 32),
    ].join("-");
  }

  static entity(type = "entity") {
    return this.next(type);
  }

  static session() {
    return this.next("session");
  }

  static vehicle() {
    return this.next("vehicle");
  }

  static passenger() {
    return this.next("passenger");
  }

  static mission() {
    return this.next("mission");
  }

  static event() {
    return this.next("event");
  }

  static resetCounter() {
    this.#counter = 0;
  }

  static hasBeenGenerated(id) {
    return this.#usedIds.has(String(id));
  }

  static release(id) {
    return this.#usedIds.delete(String(id));
  }

  static clearRegistry() {
    this.#usedIds.clear();
  }

  static getRegistrySize() {
    return this.#usedIds.size;
  }

  static #normalizePrefix(prefix) {
    const normalized = String(prefix || DEFAULT_PREFIX)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");

    return normalized || DEFAULT_PREFIX;
  }
}

export { IdGenerator };
export default IdGenerator;