const DEFAULT_OPTIONS = Object.freeze({
  locale: "en-NG",
  timeZone: "Africa/Lagos",
  maxTitleLength: 180,
  maxMessageLength: 2000,
  includeTimestamp: true,
  includeDeliveryId: false,
});

const SEVERITY_LABELS = Object.freeze({
  critical: "CRITICAL",
  error: "ERROR",
  warning: "WARNING",
  info: "INFO",
  success: "SUCCESS",
});

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function toValidDate(value) {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function capitalize(value) {
  const text = cleanText(value, 80);

  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export class RouteStatisticsDashboardAlertDeliveryFormatter {
  constructor(options = {}) {
    this.options = Object.freeze({
      ...DEFAULT_OPTIONS,
      ...options,
    });

    this.dateFormatter = new Intl.DateTimeFormat(
      this.options.locale,
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: this.options.timeZone,
      },
    );
  }

  format(delivery, options = {}) {
    if (!delivery || typeof delivery !== "object") {
      throw new TypeError("A delivery object is required.");
    }

    const settings = {
      ...this.options,
      ...options,
    };

    const alert = delivery.alert || delivery.payload || {};

    const severity = this.normalizeSeverity(
      alert.severity ?? delivery.severity,
    );

    const title = this.formatTitle(alert, delivery, settings);
    const message = this.formatMessage(alert, delivery, settings);
    const timestamp = this.formatTimestamp(
      delivery.createdAt ?? delivery.timestamp,
    );

    const result = {
      title,
      message,
      severity,
      severityLabel: SEVERITY_LABELS[severity] || "INFO",
      channel: cleanText(delivery.channel || "in_app", 80),
      status: cleanText(delivery.status || "pending", 40),
    };

    if (settings.includeTimestamp && timestamp) {
      result.timestamp = timestamp;
    }

    if (settings.includeDeliveryId && delivery.id) {
      result.deliveryId = cleanText(delivery.id, 160);
    }

    return Object.freeze(result);
  }

  formatTitle(alert, delivery, settings = this.options) {
    const title = cleanText(
      alert.title ??
        alert.name ??
        delivery.title ??
        "Dashboard Alert",
      settings.maxTitleLength,
    );

    return title || "Dashboard Alert";
  }

  formatMessage(alert, delivery, settings = this.options) {
    const message = cleanText(
      alert.message ??
        alert.description ??
        delivery.message ??
        delivery.error ??
        "A dashboard alert requires your attention.",
      settings.maxMessageLength,
    );

    return message || "A dashboard alert requires your attention.";
  }

  formatTimestamp(value) {
    const date = toValidDate(value);

    if (!date) return null;

    try {
      return this.dateFormatter.format(date);
    } catch {
      return date.toISOString();
    }
  }

  formatForEmail(delivery, options = {}) {
    const formatted = this.format(delivery, options);

    const lines = [
      formatted.title,
      "=".repeat(Math.min(formatted.title.length, 80)),
      "",
      formatted.message,
      "",
      `Severity: ${formatted.severityLabel}`,
      `Channel: ${formatted.channel}`,
      `Status: ${formatted.status}`,
    ];

    if (formatted.timestamp) {
      lines.push(`Time: ${formatted.timestamp}`);
    }

    if (formatted.deliveryId) {
      lines.push(`Delivery ID: ${formatted.deliveryId}`);
    }

    return lines.join("\n");
  }

  formatForWebhook(delivery, options = {}) {
    const formatted = this.format(delivery, options);

    return {
      event: "dashboard.alert.delivery",
      version: 1,
      alert: {
        title: formatted.title,
        message: formatted.message,
        severity: formatted.severity,
        severityLabel: formatted.severityLabel,
      },
      delivery: {
        channel: formatted.channel,
        status: formatted.status,
        ...(formatted.deliveryId
          ? { id: formatted.deliveryId }
          : {}),
      },
      ...(formatted.timestamp
        ? { timestamp: formatted.timestamp }
        : {}),
    };
  }

  normalizeSeverity(value) {
    const severity = cleanText(value || "info", 40).toLowerCase();

    if (severity === "fatal") return "critical";
    if (severity === "high") return "error";
    if (severity === "medium") return "warning";
    if (severity === "low") return "info";

    return Object.hasOwn(SEVERITY_LABELS, severity)
      ? severity
      : "info";
  }

  static create(options = {}) {
    return new RouteStatisticsDashboardAlertDeliveryFormatter(options);
  }
}

export default RouteStatisticsDashboardAlertDeliveryFormatter;