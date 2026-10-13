export default class ValidationUtils {
  static isDefined(value) {
    return value !== undefined && value !== null;
  }

  static isString(value) {
    return typeof value === "string";
  }

  static isNonEmptyString(value) {
    return this.isString(value) && value.trim().length > 0;
  }

  static isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  static isInteger(value) {
    return Number.isInteger(value);
  }

  static isPositiveNumber(value) {
    return this.isNumber(value) && value > 0;
  }

  static isNonNegativeNumber(value) {
    return this.isNumber(value) && value >= 0;
  }

  static isBoolean(value) {
    return typeof value === "boolean";
  }

  static isFunction(value) {
    return typeof value === "function";
  }

  static isArray(value) {
    return Array.isArray(value);
  }

  static isPlainObject(value) {
    if (value === null || typeof value !== "object") {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return (
      prototype === Object.prototype ||
      prototype === null
    );
  }

  static isInRange(value, min, max) {
    return (
      this.isNumber(value) &&
      this.isNumber(min) &&
      this.isNumber(max) &&
      min <= max &&
      value >= min &&
      value <= max
    );
  }

  static isOneOf(value, allowedValues) {
    return (
      Array.isArray(allowedValues) &&
      allowedValues.includes(value)
    );
  }

  static isArrayOf(value, validator) {
    return (
      Array.isArray(value) &&
      typeof validator === "function" &&
      value.every(validator)
    );
  }

  static hasKeys(value, keys) {
    if (!this.isPlainObject(value) || !Array.isArray(keys)) {
      return false;
    }

    return keys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key)
    );
  }

  static isValidIdentifier(value) {
    return (
      this.isNonEmptyString(value) &&
      /^[a-zA-Z0-9_-]+$/.test(value)
    );
  }

  static isValidHexColor(value) {
    return (
      this.isString(value) &&
      /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
        value
      )
    );
  }

  static isValidUrl(value) {
    if (!this.isNonEmptyString(value)) {
      return false;
    }

    try {
      const url = new URL(value);

      return (
        url.protocol === "http:" ||
        url.protocol === "https:"
      );
    } catch {
      return false;
    }
  }

  static validate(value, rules = {}) {
    const errors = [];

    for (const [field, rule] of Object.entries(rules)) {
      const fieldValue = value?.[field];

      if (rule.required && !this.isDefined(fieldValue)) {
        errors.push({
          field,
          message: `${field} is required.`,
        });

        continue;
      }

      if (!this.isDefined(fieldValue)) {
        continue;
      }

      if (rule.type && !this.#matchesType(fieldValue, rule.type)) {
        errors.push({
          field,
          message: `${field} must be of type ${rule.type}.`,
        });

        continue;
      }

      if (
        this.isString(fieldValue) &&
        Number.isFinite(rule.minLength) &&
        fieldValue.length < rule.minLength
      ) {
        errors.push({
          field,
          message: `${field} must contain at least ${rule.minLength} characters.`,
        });
      }

      if (
        this.isString(fieldValue) &&
        Number.isFinite(rule.maxLength) &&
        fieldValue.length > rule.maxLength
      ) {
        errors.push({
          field,
          message: `${field} must contain no more than ${rule.maxLength} characters.`,
        });
      }

      if (
        this.isNumber(fieldValue) &&
        Number.isFinite(rule.min) &&
        fieldValue < rule.min
      ) {
        errors.push({
          field,
          message: `${field} must be at least ${rule.min}.`,
        });
      }

      if (
        this.isNumber(fieldValue) &&
        Number.isFinite(rule.max) &&
        fieldValue > rule.max
      ) {
        errors.push({
          field,
          message: `${field} must be no greater than ${rule.max}.`,
        });
      }

      if (
        rule.enum &&
        !this.isOneOf(fieldValue, rule.enum)
      ) {
        errors.push({
          field,
          message: `${field} has an invalid value.`,
        });
      }

      if (
        rule.pattern instanceof RegExp &&
        this.isString(fieldValue) &&
        !rule.pattern.test(fieldValue)
      ) {
        errors.push({
          field,
          message: `${field} has an invalid format.`,
        });
      }

      if (
        typeof rule.custom === "function" &&
        rule.custom(fieldValue, value) !== true
      ) {
        errors.push({
          field,
          message: rule.message ?? `${field} is invalid.`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static assert(condition, message = "Validation failed.") {
    if (!condition) {
      throw new TypeError(message);
    }
  }

  static #matchesType(value, type) {
    switch (type) {
      case "string":
        return this.isString(value);

      case "nonEmptyString":
        return this.isNonEmptyString(value);

      case "number":
        return this.isNumber(value);

      case "integer":
        return this.isInteger(value);

      case "boolean":
        return this.isBoolean(value);

      case "array":
        return this.isArray(value);

      case "object":
        return this.isPlainObject(value);

      case "function":
        return this.isFunction(value);

      default:
        throw new TypeError(`Unknown validation type: ${type}`);
    }
  }
}