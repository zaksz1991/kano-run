const DEFAULT_LIMITS = Object.freeze({
  maxStringLength: 2000,
  maxDepth: 12,
  maxArrayLength: 500,
  maxObjectKeys: 500,
  maxPayloadBytes: 256 * 1024,
});

const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|access[_-]?key|credential/i;

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function measureBytes(value) {
  const serialized = JSON.stringify(value);

  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(serialized).length;
  }

  return serialized.length * 2;
}

export class RouteStatisticsDashboardAlertDeliverySanitizer {
  constructor(options = {}) {
    this.limits = Object.freeze({
      ...DEFAULT_LIMITS,
      ...(options.limits || {}),
    });

    this.redactSensitiveKeys =
      options.redactSensitiveKeys !== false;

    this.redactionText =
      typeof options.redactionText === "string"
        ? options.redactionText
        : "[REDACTED]";
  }

  sanitize(value, options = {}) {
    const state = {
      visited: new WeakSet(),
      maxDepth: options.maxDepth ?? this.limits.maxDepth,
      redactSensitiveKeys:
        options.redactSensitiveKeys ?? this.redactSensitiveKeys,
      removeSensitiveFields: options.removeSensitiveFields === true,
    };

    const sanitized = this.sanitizeValue(value, state, 0);

    if (options.maxBytes === undefined) {
      return sanitized;
    }

    try {
      if (measureBytes(sanitized) <= options.maxBytes) {
        return sanitized;
      }

      return {
        truncated: true,
        reason: "maximum_payload_size_exceeded",
        maxBytes: options.maxBytes,
      };
    } catch {
      return {
        truncated: true,
        reason: "payload_serialization_failed",
      };
    }
  }

  sanitizeDelivery(delivery) {
    if (!isPlainObject(delivery)) {
      throw new TypeError("Delivery must be a plain object.");
    }

    const sanitized = this.sanitize(delivery, {
      removeSensitiveFields: false,
    });

    if (!isPlainObject(sanitized)) {
      throw new TypeError("Sanitized delivery must be a plain object.");
    }

    return sanitized;
  }

  sanitizePayload(payload) {
    if (!isPlainObject(payload)) {
      throw new TypeError("Delivery payload must be a plain object.");
    }

    return this.sanitize(payload, {
      maxBytes: this.limits.maxPayloadBytes,
      removeSensitiveFields: true,
    });
  }

  sanitizeText(value, maxLength = this.limits.maxStringLength) {
    if (typeof value !== "string") {
      return "";
    }

    return truncate(
      value.replace(CONTROL_CHARACTERS, "").trim(),
      maxLength,
    );
  }

  sanitizeValue(value, state, depth) {
    if (value === null || value === undefined) {
      return value === undefined ? null : value;
    }

    if (typeof value === "string") {
      return this.sanitizeText(value);
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (
      typeof value === "bigint" ||
      typeof value === "function" ||
      typeof value === "symbol"
    ) {
      return null;
    }

    if (depth >= state.maxDepth) {
      return "[MAX_DEPTH_REACHED]";
    }

    if (state.visited.has(value)) {
      return "[CIRCULAR_REFERENCE]";
    }

    state.visited.add(value);

    try {
      if (Array.isArray(value)) {
        return value
          .slice(0, this.limits.maxArrayLength)
          .map((item) => this.sanitizeValue(item, state, depth + 1));
      }

      if (!isPlainObject(value)) {
        if (value instanceof Date) {
          return Number.isNaN(value.getTime())
            ? null
            : value.toISOString();
        }

        return String(value);
      }

      const result = {};
      const keys = Object.keys(value).slice(
        0,
        this.limits.maxObjectKeys,
      );

      for (const key of keys) {
        if (
          state.redactSensitiveKeys &&
          SENSITIVE_KEY_PATTERN.test(key)
        ) {
          if (!state.removeSensitiveFields) {
            result[key] = this.redactionText;
          }

          continue;
        }

        const safeKey = this.sanitizeText(key, 200);

        if (!safeKey) continue;

        result[safeKey] = this.sanitizeValue(
          value[key],
          state,
          depth + 1,
        );
      }

      return result;
    } finally {
      state.visited.delete(value);
    }
  }
}

export default RouteStatisticsDashboardAlertDeliverySanitizer;