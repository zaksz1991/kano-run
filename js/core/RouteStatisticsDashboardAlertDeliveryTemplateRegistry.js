const DEFAULT_TEMPLATES = {
  default: {
    title: "{{title}}",
    message: "{{message}}",
  },

  critical: {
    title: "Critical Alert: {{title}}",
    message: "{{message}}\n\nImmediate attention is required.",
  },

  warning: {
    title: "Warning: {{title}}",
    message: "{{message}}\n\nPlease review this alert.",
  },

  success: {
    title: "Success: {{title}}",
    message: "{{message}}",
  },

  email: {
    subject: "[{{severityLabel}}] {{title}}",
    body: [
      "{{message}}",
      "",
      "Severity: {{severityLabel}}",
      "Status: {{status}}",
      "Time: {{timestamp}}",
    ].join("\n"),
  },

  webhook: {
    event: "dashboard.alert.delivery",
    version: 1,
    payload: {
      title: "{{title}}",
      message: "{{message}}",
      severity: "{{severity}}",
      status: "{{status}}",
      timestamp: "{{timestamp}}",
    },
  },
};

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  if (Array.isArray(value)) {
    return value.map(clone);
  }

  if (isPlainObject(value)) {
    const result = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] = clone(item);
    }

    return result;
  }

  return value;
}

function normalizeName(name) {
  if (typeof name !== "string") {
    throw new TypeError("Template name must be a string.");
  }

  const normalized = name.trim().toLowerCase();

  if (!normalized || normalized.length > 120) {
    throw new Error("Template name must contain 1–120 characters.");
  }

  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new Error("Template name contains unsupported characters.");
  }

  return normalized;
}

function interpolateString(template, variables) {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (match, path) => {
      const value = path.split(".").reduce((current, key) => {
        if (current === null || current === undefined) {
          return undefined;
        }

        return current[key];
      }, variables);

      if (value === null || value === undefined) {
        return "";
      }

      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return String(value);
      }

      return "";
    },
  );
}

function renderValue(template, variables) {
  if (typeof template === "string") {
    return interpolateString(template, variables);
  }

  if (Array.isArray(template)) {
    return template.map((item) => renderValue(item, variables));
  }

  if (isPlainObject(template)) {
    const result = {};

    for (const [key, value] of Object.entries(template)) {
      result[key] = renderValue(value, variables);
    }

    return result;
  }

  return template;
}

export class RouteStatisticsDashboardAlertDeliveryTemplateRegistry {
  constructor(options = {}) {
    this.templates = new Map();
    this.maxTemplates = options.maxTemplates ?? 200;
    this.maxTemplateBytes = options.maxTemplateBytes ?? 64 * 1024;

    if (
      !Number.isInteger(this.maxTemplates) ||
      this.maxTemplates < 1
    ) {
      throw new RangeError("maxTemplates must be a positive integer.");
    }

    if (
      !Number.isFinite(this.maxTemplateBytes) ||
      this.maxTemplateBytes < 1
    ) {
      throw new RangeError("maxTemplateBytes must be positive.");
    }

    const defaults = options.includeDefaults === false
      ? {}
      : DEFAULT_TEMPLATES;

    for (const [name, template] of Object.entries(defaults)) {
      this.register(name, template);
    }

    if (options.templates) {
      if (!isPlainObject(options.templates)) {
        throw new TypeError("templates must be a plain object.");
      }

      for (const [name, template] of Object.entries(options.templates)) {
        this.register(name, template, { replace: true });
      }
    }
  }

  register(name, template, options = {}) {
    const key = normalizeName(name);

    if (!isPlainObject(template)) {
      throw new TypeError("Template must be a plain object.");
    }

    if (this.templates.has(key) && options.replace !== true) {
      throw new Error(`Template "${key}" is already registered.`);
    }

    if (
      !this.templates.has(key) &&
      this.templates.size >= this.maxTemplates
    ) {
      throw new Error("Maximum registered template count reached.");
    }

    const normalized = clone(template);
    const serialized = JSON.stringify(normalized);

    if (serialized.length > this.maxTemplateBytes) {
      throw new Error("Template exceeds the maximum allowed size.");
    }

    this.templates.set(key, normalized);

    return this.get(key);
  }

  get(name) {
    const key = normalizeName(name);
    const template = this.templates.get(key);

    return template === undefined ? null : clone(template);
  }

  has(name) {
    return this.templates.has(normalizeName(name));
  }

  render(name, variables = {}) {
    const key = normalizeName(name);
    const template = this.templates.get(key);

    if (!template) {
      throw new Error(`Template "${key}" is not registered.`);
    }

    if (!isPlainObject(variables)) {
      throw new TypeError("Template variables must be a plain object.");
    }

    return renderValue(template, variables);
  }

  renderForSeverity(severity, variables = {}) {
    const normalizedSeverity = normalizeName(severity);

    const templateName = this.templates.has(normalizedSeverity)
      ? normalizedSeverity
      : "default";

    return this.render(templateName, variables);
  }

  remove(name) {
    return this.templates.delete(normalizeName(name));
  }

  list() {
    return Array.from(this.templates.keys()).sort();
  }

  clear() {
    this.templates.clear();
  }

  exportData() {
    const templates = {};

    for (const [name, template] of this.templates.entries()) {
      templates[name] = clone(template);
    }

    return {
      version: 1,
      templates,
    };
  }

  importData(data, options = {}) {
    if (!isPlainObject(data) || !isPlainObject(data.templates)) {
      throw new TypeError("Invalid template registry data.");
    }

    const entries = Object.entries(data.templates);

    if (entries.length > this.maxTemplates) {
      throw new Error("Imported template count exceeds the configured limit.");
    }

    const imported = new Map();

    for (const [name, template] of entries) {
      const key = normalizeName(name);

      if (!isPlainObject(template)) {
        throw new TypeError(`Template "${key}" must be a plain object.`);
      }

      const serialized = JSON.stringify(template);

      if (serialized.length > this.maxTemplateBytes) {
        throw new Error(`Template "${key}" exceeds the size limit.`);
      }

      imported.set(key, clone(template));
    }

    if (options.merge === true) {
      if (this.templates.size + imported.size > this.maxTemplates) {
        throw new Error("Merged template count exceeds the configured limit.");
      }

      for (const [name, template] of imported.entries()) {
        this.templates.set(name, template);
      }
    } else {
      this.templates = imported;
    }

    return this.list();
  }
}

export default RouteStatisticsDashboardAlertDeliveryTemplateRegistry;