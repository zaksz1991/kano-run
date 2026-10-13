import { EventEmitter } from "./EventEmitter.js";
import { Logger } from "./Logger.js";

const SUPPORTED_VERSION = 1;
const DEFAULT_MAX_ENTRIES = 10000;
const DEFAULT_MAX_ID_LENGTH = 200;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteTimestamp(value) {
  return Number.isFinite(value) && value >= 0;
}

export class RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreValidator {
  constructor({
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxIdLength = DEFAULT_MAX_ID_LENGTH,
    allowedStatuses = null,
    logger = Logger,
  } = {}) {
    this.maxEntries = Math.max(1, Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES));
    this.maxIdLength = Math.max(1, Math.floor(Number(maxIdLength) || DEFAULT_MAX_ID_LENGTH));
    this.allowedStatuses = allowedStatuses
      ? new Set(allowedStatuses.map(String))
      : null;

    this.logger = logger;
    this.events = new EventEmitter();
    this.validationCount = 0;
    this.failureCount = 0;
    this.lastResult = null;
    this.disposed = false;
  }

  subscribe(listener) {
    return this.events.on("change", listener);
  }

  emit(type, payload = {}) {
    this.events.emit("change", {
      type,
      timestamp: Date.now(),
      ...payload,
    });
  }

  validate(archive) {
    this.assertActive();

    this.validationCount += 1;

    const errors = [];
    const warnings = [];

    if (!isObject(archive)) {
      errors.push("Archive must be a plain object.");
      return this.finish(errors, warnings);
    }

    if (archive.version !== SUPPORTED_VERSION) {
      errors.push(`Unsupported archive version: ${String(archive.version)}.`);
    }

    if (!Array.isArray(archive.entries)) {
      errors.push("Archive entries must be an array.");
      return this.finish(errors, warnings);
    }

    if (archive.entries.length > this.maxEntries) {
      errors.push(
        `Archive contains ${archive.entries.length} entries; maximum is ${this.maxEntries}.`,
      );
    }

    const seenIds = new Set();

    for (let index = 0; index < archive.entries.length; index += 1) {
      const entry = archive.entries[index];
      const prefix = `entries[${index}]`;

      if (!isObject(entry)) {
        errors.push(`${prefix} must be an object.`);
        continue;
      }

      if (typeof entry.id !== "string" || !entry.id.trim()) {
        errors.push(`${prefix}.id must be a non-empty string.`);
      } else {
        if (entry.id.length > this.maxIdLength) {
          errors.push(`${prefix}.id exceeds the maximum length.`);
        }

        if (seenIds.has(entry.id)) {
          errors.push(`${prefix}.id duplicates "${entry.id}".`);
        }

        seenIds.add(entry.id);
      }

      if (
        entry.schedulerId !== undefined &&
        (typeof entry.schedulerId !== "string" ||
          entry.schedulerId.length > this.maxIdLength)
      ) {
        errors.push(`${prefix}.schedulerId must be a valid string.`);
      }

      if (
        entry.status !== undefined &&
        typeof entry.status !== "string"
      ) {
        errors.push(`${prefix}.status must be a string.`);
      } else if (
        typeof entry.status === "string" &&
        this.allowedStatuses &&
        !this.allowedStatuses.has(entry.status)
      ) {
        errors.push(`${prefix}.status "${entry.status}" is not allowed.`);
      }

      if (
        entry.createdAt !== undefined &&
        !isFiniteTimestamp(entry.createdAt)
      ) {
        errors.push(`${prefix}.createdAt must be a valid timestamp.`);
      }

      if (
        entry.updatedAt !== undefined &&
        !isFiniteTimestamp(entry.updatedAt)
      ) {
        errors.push(`${prefix}.updatedAt must be a valid timestamp.`);
      }

      if (
        entry.data !== undefined &&
        !isObject(entry.data)
      ) {
        errors.push(`${prefix}.data must be an object when provided.`);
      }

      if (
        isFiniteTimestamp(entry.createdAt) &&
        isFiniteTimestamp(entry.updatedAt) &&
        entry.updatedAt < entry.createdAt
      ) {
        warnings.push(
          `${prefix}.updatedAt precedes createdAt.`,
        );
      }
    }

    if (
      archive.exportedAt !== undefined &&
      !isFiniteTimestamp(archive.exportedAt)
    ) {
      warnings.push("Archive exportedAt is not a valid timestamp.");
    }

    return this.finish(errors, warnings);
  }

  finish(errors, warnings) {
    const result = {
      valid: errors.length === 0,
      errors,
      warnings,
      checkedAt: Date.now(),
      validationNumber: this.validationCount,
    };

    this.lastResult = result;

    if (!result.valid) {
      this.failureCount += 1;

      this.logger?.warn?.(
        "[SchedulerRestoreValidator] Archive validation failed.",
        { errors },
      );
    }

    this.emit("change", { result });

    return {
      ...result,
      errors: [...errors],
      warnings: [...warnings],
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Scheduler restore validator has been disposed.");
    }
  }

  getStatus() {
    return {
      validationCount: this.validationCount,
      failureCount: this.failureCount,
      successCount: this.validationCount - this.failureCount,
      lastResult: this.lastResult
        ? {
            ...this.lastResult,
            errors: [...this.lastResult.errors],
            warnings: [...this.lastResult.warnings],
          }
        : null,
      disposed: this.disposed,
    };
  }

  resetMetrics() {
    this.assertActive();

    this.validationCount = 0;
    this.failureCount = 0;
    this.lastResult = null;

    this.emit("metrics-reset");
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.events.removeAllListeners?.();
  }
}

export default RouteStatisticsDashboardAlertDeliveryChannelCircuitBreakerRecoverySchedulerRestoreValidator;