const DEFAULT_LIMITS = Object.freeze({
  maxIdLength: 160,
  maxTextLength: 2000,
  maxAttempts: 100,
  maxPayloadBytes: 256 * 1024,
});

const VALID_STATUSES = new Set([
  "queued",
  "pending",
  "running",
  "delivered",
  "failed",
  "retrying",
  "cancelled",
  "dead_letter",
]);

const VALID_CHANNELS = new Set([
  "in_app",
  "email",
  "webhook",
  "push",
  "sms",
  "custom",
]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getByteLength(value) {
  const text = JSON.stringify(value);

  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }

  return text.length * 2;
}

function addError(errors, field, message) {
  errors.push({ field, message });
}

function validateText(value, field, errors, maxLength, required = false) {
  if (required && (typeof value !== "string" || !value.trim())) {
    addError(errors, field, "A non-empty string is required.");
    return;
  }

  if (value !== undefined && value !== null) {
    if (typeof value !== "string") {
      addError(errors, field, "Must be a string.");
      return;
    }

    if (value.length > maxLength) {
      addError(errors, field, `Must not exceed ${maxLength} characters.`);
    }
  }
}

export class RouteStatisticsDashboardAlertDeliveryValidator {
  constructor(options = {}) {
    this.limits = Object.freeze({
      ...DEFAULT_LIMITS,
      ...(options.limits || {}),
    });

    this.allowedStatuses = new Set(
      options.allowedStatuses || VALID_STATUSES,
    );

    this.allowedChannels = new Set(
      options.allowedChannels || VALID_CHANNELS,
    );
  }

  validate(delivery) {
    const errors = [];

    if (!isPlainObject(delivery)) {
      return this.result(false, [
        { field: "delivery", message: "Must be a plain object." },
      ]);
    }

    validateText(
      delivery.id,
      "id",
      errors,
      this.limits.maxIdLength,
      true,
    );

    validateText(
      delivery.alertId,
      "alertId",
      errors,
      this.limits.maxIdLength,
      true,
    );

    validateText(
      delivery.channel,
      "channel",
      errors,
      80,
      true,
    );

    validateText(
      delivery.status,
      "status",
      errors,
      40,
      true,
    );

    validateText(
      delivery.destination,
      "destination",
      errors,
      this.limits.maxTextLength,
    );

    if (
      typeof delivery.channel === "string" &&
      !this.allowedChannels.has(delivery.channel)
    ) {
      addError(errors, "channel", "Unsupported delivery channel.");
    }

    if (
      typeof delivery.status === "string" &&
      !this.allowedStatuses.has(delivery.status)
    ) {
      addError(errors, "status", "Unsupported delivery status.");
    }

    if (delivery.attempts !== undefined) {
      if (
        !Number.isInteger(delivery.attempts) ||
        delivery.attempts < 0 ||
        delivery.attempts > this.limits.maxAttempts
      ) {
        addError(
          errors,
          "attempts",
          `Must be an integer between 0 and ${this.limits.maxAttempts}.`,
        );
      }
    }

    for (const field of ["createdAt", "updatedAt", "nextAttemptAt"]) {
      if (delivery[field] !== undefined && delivery[field] !== null) {
        const timestamp = new Date(delivery[field]).getTime();

        if (!Number.isFinite(timestamp)) {
          addError(errors, field, "Must be a valid date or timestamp.");
        }
      }
    }

    if (delivery.payload !== undefined) {
      if (!isPlainObject(delivery.payload)) {
        addError(errors, "payload", "Must be a plain object.");
      } else {
        try {
          const bytes = getByteLength(delivery.payload);

          if (bytes > this.limits.maxPayloadBytes) {
            addError(
              errors,
              "payload",
              `Must not exceed ${this.limits.maxPayloadBytes} bytes.`,
            );
          }
        } catch {
          addError(errors, "payload", "Must be JSON-serializable.");
        }
      }
    }

    if (delivery.metadata !== undefined && !isPlainObject(delivery.metadata)) {
      addError(errors, "metadata", "Must be a plain object.");
    }

    return this.result(errors.length === 0, errors);
  }

  validateBatch(deliveries) {
    if (!Array.isArray(deliveries)) {
      return this.result(false, [
        { field: "deliveries", message: "Must be an array." },
      ]);
    }

    const errors = [];
    const seenIds = new Set();

    deliveries.forEach((delivery, index) => {
      const validation = this.validate(delivery);

      for (const error of validation.errors) {
        errors.push({
          ...error,
          field: `deliveries[${index}].${error.field}`,
        });
      }

      if (typeof delivery?.id === "string" && delivery.id.trim()) {
        if (seenIds.has(delivery.id)) {
          addError(
            errors,
            `deliveries[${index}].id`,
            "Duplicate delivery ID in batch.",
          );
        }

        seenIds.add(delivery.id);
      }
    });

    return this.result(errors.length === 0, errors);
  }

  assertValid(delivery) {
    const validation = this.validate(delivery);

    if (!validation.valid) {
      const error = new Error(
        `Invalid alert delivery: ${validation.errors
          .map((item) => `${item.field}: ${item.message}`)
          .join("; ")}`,
      );

      error.name = "AlertDeliveryValidationError";
      error.validation = validation;

      throw error;
    }

    return delivery;
  }

  result(valid, errors) {
    return Object.freeze({
      valid,
      errors: Object.freeze(errors.map((error) => Object.freeze(error))),
      errorCount: errors.length,
    });
  }
}

export default RouteStatisticsDashboardAlertDeliveryValidator;