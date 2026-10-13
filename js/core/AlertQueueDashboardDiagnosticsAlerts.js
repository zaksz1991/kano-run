export class AlertQueueDashboardDiagnosticsAlerts {
  constructor({
    diagnostics = null,
    analytics = null,
    store = null,
    storage = globalThis.localStorage ?? null,
    storageKey = "kano-run-diagnostics-alerts",
    maxAlerts = 500,
    cooldownMs = 60_000,
    clock = () => Date.now(),
    onAlert = null,
    onError = null,
  } = {}) {
    this.diagnostics = diagnostics;
    this.analytics = analytics;
    this.store = store;
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxAlerts = Math.max(1, Number(maxAlerts) || 500);
    this.cooldownMs = Math.max(0, Number(cooldownMs) || 0);
    this.clock = clock;
    this.onAlert = onAlert;
    this.onError = onError;

    this.alerts = [];
    this.listeners = new Set();
    this.unsubscribeDiagnostics = null;
    this.unsubscribeAnalytics = null;
    this.unsubscribeStore = null;
    this.destroyed = false;

    this.load();

    if (this.diagnostics?.subscribe) {
      this.unsubscribeDiagnostics = this.diagnostics.subscribe((event) => {
        this.handleDiagnosticEvent(event);
      });
    }

    if (this.analytics?.subscribe) {
      this.unsubscribeAnalytics = this.analytics.subscribe((event) => {
        this.handleAnalyticsEvent(event);
      });
    }

    if (this.store?.subscribe) {
      this.unsubscribeStore = this.store.subscribe((event) => {
        this.handleStoreEvent(event);
      });
    }
  }

  now() {
    const value = Number(this.clock());
    return Number.isFinite(value) ? value : Date.now();
  }

  createId() {
    const randomPart =
      globalThis.crypto?.randomUUID?.() ??
      `${Math.random().toString(36).slice(2)}${Math.random()
        .toString(36)
        .slice(2)}`;

    return `diag-alert-${this.now()}-${randomPart}`;
  }

  normalizeSeverity(value) {
    const severity = String(value ?? "warning").toLowerCase();

    if (severity === "critical" || severity === "fatal") {
      return "critical";
    }

    if (severity === "error") {
      return "error";
    }

    if (severity === "info" || severity === "notice") {
      return "info";
    }

    return "warning";
  }

  severityRank(value) {
    const ranks = {
      info: 1,
      warning: 2,
      error: 3,
      critical: 4,
    };

    return ranks[this.normalizeSeverity(value)];
  }

  normalizeStatus(value) {
    const status = String(value ?? "active").toLowerCase();

    if (["resolved", "closed", "fixed"].includes(status)) {
      return "resolved";
    }

    if (["acknowledged", "ack", "seen"].includes(status)) {
      return "acknowledged";
    }

    return "active";
  }

  normalizeText(value, fallback = "") {
    if (typeof value === "string") {
      return value.trim().slice(0, 2000);
    }

    if (value === null || value === undefined) {
      return fallback;
    }

    try {
      return JSON.stringify(value).slice(0, 2000);
    } catch {
      return fallback;
    }
  }

  createFingerprint({ component, code, message, severity }) {
    const parts = [
      String(component ?? "system").toLowerCase(),
      String(code ?? "").toLowerCase(),
      String(message ?? "").toLowerCase(),
      this.normalizeSeverity(severity),
    ];

    return parts
      .join("|")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);
  }

  normalizeAlert(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const component = this.normalizeText(
      source.component ?? source.source,
      "system"
    );

    const code = this.normalizeText(
      source.code ?? source.issueCode ?? source.type,
      "DIAGNOSTIC_ISSUE"
    );

    const message = this.normalizeText(
      source.message ?? source.description ?? source.title,
      "A diagnostic issue was detected."
    );

    const severity = this.normalizeSeverity(
      source.severity ?? source.level
    );

    const createdAt = Number(
      source.createdAt ?? source.timestamp ?? this.now()
    );

    return {
      id: source.id ? String(source.id) : this.createId(),
      fingerprint:
        source.fingerprint ||
        this.createFingerprint({
          component,
          code,
          message,
          severity,
        }),
      component,
      code,
      message,
      severity,
      status: this.normalizeStatus(source.status),
      firstSeenAt: Number.isFinite(createdAt) ? createdAt : this.now(),
      lastSeenAt: Number.isFinite(createdAt) ? createdAt : this.now(),
      occurrences: Math.max(1, Number(source.occurrences) || 1),
      acknowledgedAt: source.acknowledgedAt ?? null,
      acknowledgedBy: source.acknowledgedBy ?? null,
      resolvedAt: source.resolvedAt ?? null,
      resolution: source.resolution ?? null,
      sourceReportId: source.sourceReportId ?? source.reportId ?? null,
      metadata:
        source.metadata && typeof source.metadata === "object"
          ? { ...source.metadata }
          : {},
    };
  }

  load() {
    if (!this.storage?.getItem) {
      return this.alerts;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);

      if (!raw) {
        return this.alerts;
      }

      const parsed = JSON.parse(raw);
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.alerts)
          ? parsed.alerts
          : [];

      this.alerts = records
        .filter((item) => item && typeof item === "object")
        .map((item) => this.normalizeAlert(item))
        .slice(-this.maxAlerts);

      return this.alerts;
    } catch (error) {
      this.reportError(error, "load");
      return this.alerts;
    }
  }

  persist() {
    if (!this.storage?.setItem) {
      return false;
    }

    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify(this.alerts.slice(-this.maxAlerts))
      );

      return true;
    } catch (error) {
      this.reportError(error, "persist");
      return false;
    }
  }

  reportError(error, operation) {
    try {
      this.onError?.({
        error,
        operation,
        timestamp: this.now(),
      });
    } catch {
      // Error handlers must not interrupt alert processing.
    }
  }

  emit(type, alert = null, details = {}) {
    if (this.destroyed) {
      return;
    }

    const event = {
      type,
      alert: alert ? { ...alert } : null,
      details,
      timestamp: this.now(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.reportError(error, "listener");
      }
    }

    if (type === "created" || type === "escalated") {
      try {
        this.onAlert?.(event);
      } catch (error) {
        this.reportError(error, "onAlert");
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function" || this.destroyed) {
      return () => {};
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  findById(id) {
    return this.alerts.find((alert) => alert.id === String(id)) ?? null;
  }

  findByFingerprint(fingerprint) {
    return (
      this.alerts.find(
        (alert) =>
          alert.fingerprint === fingerprint && alert.status !== "resolved"
      ) ?? null
    );
  }

  raise(input = {}) {
    if (this.destroyed) {
      return null;
    }

    const incoming = this.normalizeAlert(input);
    const existing = this.findByFingerprint(incoming.fingerprint);

    if (existing) {
      const previousSeverity = existing.severity;
      const escalated =
        this.severityRank(incoming.severity) >
        this.severityRank(existing.severity);

      existing.lastSeenAt = this.now();
      existing.occurrences += 1;
      existing.message = incoming.message || existing.message;
      existing.metadata = {
        ...existing.metadata,
        ...incoming.metadata,
      };

      if (escalated) {
        existing.severity = incoming.severity;
        existing.status = "active";
        existing.acknowledgedAt = null;
        existing.acknowledgedBy = null;
      }

      if (incoming.sourceReportId) {
        existing.sourceReportId = incoming.sourceReportId;
      }

      this.persist();

      if (escalated) {
        this.emit("escalated", existing, {
          previousSeverity,
          currentSeverity: existing.severity,
        });
      } else {
        this.emit("updated", existing, {
          occurrence: existing.occurrences,
        });
      }

      return { ...existing };
    }

    this.alerts.push(incoming);
    this.trim();

    this.persist();
    this.emit("created", incoming);

    return { ...incoming };
  }

  raiseMany(items = []) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((item) => this.raise(item)).filter(Boolean);
  }

  acknowledge(id, acknowledgedBy = null) {
    const alert = this.findById(id);

    if (!alert || alert.status === "resolved") {
      return false;
    }

    if (alert.status === "acknowledged") {
      return true;
    }

    alert.status = "acknowledged";
    alert.acknowledgedAt = this.now();
    alert.acknowledgedBy = acknowledgedBy
      ? String(acknowledgedBy).slice(0, 200)
      : null;

    this.persist();
    this.emit("acknowledged", alert);

    return true;
  }

  acknowledgeMany(ids = [], acknowledgedBy = null) {
    if (!Array.isArray(ids)) {
      return 0;
    }

    return ids.reduce(
      (count, id) =>
        this.acknowledge(id, acknowledgedBy) ? count + 1 : count,
      0
    );
  }

  resolve(id, resolution = "Resolved") {
    const alert = this.findById(id);

    if (!alert) {
      return false;
    }

    if (alert.status === "resolved") {
      return true;
    }

    alert.status = "resolved";
    alert.resolvedAt = this.now();
    alert.resolution = this.normalizeText(resolution, "Resolved");

    this.persist();
    this.emit("resolved", alert);

    return true;
  }

  resolveByFingerprint(fingerprint, resolution = "Resolved") {
    const alert = this.findByFingerprint(fingerprint);

    return alert ? this.resolve(alert.id, resolution) : false;
  }

  resolveMany(ids = [], resolution = "Resolved") {
    if (!Array.isArray(ids)) {
      return 0;
    }

    return ids.reduce(
      (count, id) => (this.resolve(id, resolution) ? count + 1 : count),
      0
    );
  }

  ingestDiagnosticReport(report) {
    if (!report || typeof report !== "object") {
      return [];
    }

    const issues = Array.isArray(report.issues) ? report.issues : [];
    const reportId = report.id ?? report.reportId ?? null;
    const raised = [];

    for (const issue of issues) {
      if (!issue || typeof issue !== "object") {
        continue;
      }

      const alert = this.raise({
        component: issue.component ?? issue.source ?? "system",
        code: issue.code ?? issue.type ?? "DIAGNOSTIC_ISSUE",
        message: issue.message ?? issue.description ?? issue.title,
        severity: issue.severity ?? issue.level ?? "warning",
        sourceReportId: reportId,
        metadata: {
          reportStatus: report.status ?? null,
          reportTimestamp: report.timestamp ?? report.createdAt ?? null,
          ...(issue.metadata && typeof issue.metadata === "object"
            ? issue.metadata
            : {}),
        },
      });

      if (alert) {
        raised.push(alert);
      }
    }

    if (
      issues.length === 0 &&
      ["healthy", "ok", "success"].includes(
        String(report.status ?? "").toLowerCase()
      )
    ) {
      this.resolveRecoveredComponents(report);
    }

    return raised;
  }

  resolveRecoveredComponents(report) {
    const checkedComponents = Array.isArray(report.checks)
      ? report.checks
      : Array.isArray(report.components)
        ? report.components
        : [];

    const recovered = new Set();

    for (const item of checkedComponents) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const status = String(item.status ?? "").toLowerCase();

      if (
        ["healthy", "ok", "success", "passed"].includes(status) &&
        (item.component || item.name)
      ) {
        recovered.add(String(item.component ?? item.name).toLowerCase());
      }
    }

    if (recovered.size === 0) {
      return 0;
    }

    let resolved = 0;

    for (const alert of this.alerts) {
      if (
        alert.status !== "resolved" &&
        recovered.has(alert.component.toLowerCase())
      ) {
        if (this.resolve(alert.id, "Component reported healthy")) {
          resolved += 1;
        }
      }
    }

    return resolved;
  }

  handleDiagnosticEvent(event) {
    if (!event || typeof event !== "object") {
      return;
    }

    const report =
      event.report ??
      event.result ??
      event.diagnostic ??
      (Array.isArray(event.issues) ? event : null);

    if (report) {
      this.ingestDiagnosticReport(report);
    }
  }

  handleAnalyticsEvent(event) {
    if (!event || typeof event !== "object") {
      return;
    }

    const score =
      event.healthScore ??
      event.score ??
      event.details?.healthScore ??
      null;

    if (score === null || score === undefined) {
      return;
    }

    const numericScore = Number(
      typeof score === "object" ? score.score : score
    );

    if (!Number.isFinite(numericScore)) {
      return;
    }

    if (numericScore < 40) {
      this.raise({
        component: "analytics",
        code: "SYSTEM_HEALTH_CRITICAL",
        severity: "critical",
        message: `System health score is critically low (${numericScore}/100).`,
        metadata: { healthScore: numericScore },
      });
    } else if (numericScore < 70) {
      this.raise({
        component: "analytics",
        code: "SYSTEM_HEALTH_WARNING",
        severity: "warning",
        message: `System health score requires attention (${numericScore}/100).`,
        metadata: { healthScore: numericScore },
      });
    } else {
      this.resolveByFingerprint(
        this.createFingerprint({
          component: "analytics",
          code: "SYSTEM_HEALTH_CRITICAL",
          message: `System health score is critically low (${numericScore}/100).`,
          severity: "critical",
        }),
        "System health recovered"
      );

      this.resolveHealthAlerts();
    }
  }

  resolveHealthAlerts() {
    let count = 0;

    for (const alert of this.alerts) {
      if (
        alert.component === "analytics" &&
        ["SYSTEM_HEALTH_CRITICAL", "SYSTEM_HEALTH_WARNING"].includes(
          alert.code
        ) &&
        alert.status !== "resolved"
      ) {
        if (this.resolve(alert.id, "System health recovered")) {
          count += 1;
        }
      }
    }

    return count;
  }

  handleStoreEvent(event) {
    if (!event || typeof event !== "object") {
      return;
    }

    const report =
      event.report ??
      event.details?.report ??
      event.details?.item ??
      null;

    if (report && Array.isArray(report.issues)) {
      this.ingestDiagnosticReport(report);
    }
  }

  getAlerts({
    status = null,
    severity = null,
    component = null,
    search = null,
    since = null,
    until = null,
    limit = null,
    sort = "newest",
  } = {}) {
    let result = this.alerts.slice();

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      const normalized = statuses.map((value) =>
        this.normalizeStatus(value)
      );

      result = result.filter((alert) => normalized.includes(alert.status));
    }

    if (severity) {
      const severities = Array.isArray(severity) ? severity : [severity];
      const normalized = severities.map((value) =>
        this.normalizeSeverity(value)
      );

      result = result.filter((alert) =>
        normalized.includes(alert.severity)
      );
    }

    if (component) {
      const components = (Array.isArray(component) ? component : [component])
        .map((value) => String(value).toLowerCase());

      result = result.filter((alert) =>
        components.includes(alert.component.toLowerCase())
      );
    }

    if (search) {
      const query = String(search).toLowerCase();

      result = result.filter((alert) =>
        [
          alert.message,
          alert.component,
          alert.code,
          alert.severity,
          alert.status,
        ].some((value) => String(value).toLowerCase().includes(query))
      );
    }

    if (since !== null) {
      result = result.filter(
        (alert) => alert.lastSeenAt >= Number(since)
      );
    }

    if (until !== null) {
      result = result.filter(
        (alert) => alert.lastSeenAt <= Number(until)
      );
    }

    result.sort((a, b) => {
      if (sort === "oldest") {
        return a.firstSeenAt - b.firstSeenAt;
      }

      if (sort === "severity") {
        return (
          this.severityRank(b.severity) -
            this.severityRank(a.severity) ||
          b.lastSeenAt - a.lastSeenAt
        );
      }

      if (sort === "occurrences") {
        return (
          b.occurrences - a.occurrences ||
          b.lastSeenAt - a.lastSeenAt
        );
      }

      return b.lastSeenAt - a.lastSeenAt;
    });

    if (limit !== null) {
      result = result.slice(0, Math.max(0, Number(limit) || 0));
    }

    return result.map((alert) => ({ ...alert }));
  }

  getActiveAlerts(options = {}) {
    return this.getAlerts({
      ...options,
      status: ["active", "acknowledged"],
    });
  }

  getSummary() {
    const summary = {
      total: this.alerts.length,
      active: 0,
      acknowledged: 0,
      resolved: 0,
      critical: 0,
      error: 0,
      warning: 0,
      info: 0,
      occurrences: 0,
      lastUpdatedAt: null,
    };

    for (const alert of this.alerts) {
      summary[alert.status] += 1;
      summary[alert.severity] += 1;
      summary.occurrences += alert.occurrences;

      summary.lastUpdatedAt = Math.max(
        summary.lastUpdatedAt ?? 0,
        alert.lastSeenAt
      );
    }

    return summary;
  }

  getTopComponents(limit = 10) {
    const components = new Map();

    for (const alert of this.alerts) {
      const current = components.get(alert.component) ?? {
        component: alert.component,
        total: 0,
        active: 0,
        resolved: 0,
        occurrences: 0,
        highestSeverity: "info",
      };

      current.total += 1;
      current.occurrences += alert.occurrences;

      if (alert.status !== "resolved") {
        current.active += 1;
      } else {
        current.resolved += 1;
      }

      if (
        this.severityRank(alert.severity) >
        this.severityRank(current.highestSeverity)
      ) {
        current.highestSeverity = alert.severity;
      }

      components.set(alert.component, current);
    }

    return [...components.values()]
      .sort(
        (a, b) =>
          b.active - a.active ||
          b.occurrences - a.occurrences
      )
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  pruneResolved(olderThanMs = 7 * 24 * 60 * 60 * 1000) {
    const cutoff = this.now() - Math.max(0, Number(olderThanMs) || 0);
    const before = this.alerts.length;

    this.alerts = this.alerts.filter(
      (alert) =>
        alert.status !== "resolved" ||
        alert.resolvedAt === null ||
        alert.resolvedAt >= cutoff
    );

    const removed = before - this.alerts.length;

    if (removed > 0) {
      this.persist();
      this.emit("pruned", null, { removed });
    }

    return removed;
  }

  trim() {
    if (this.alerts.length <= this.maxAlerts) {
      return 0;
    }

    this.alerts.sort((a, b) => {
      const aResolved = a.status === "resolved" ? 0 : 1;
      const bResolved = b.status === "resolved" ? 0 : 1;

      return (
        aResolved - bResolved ||
        a.lastSeenAt - b.lastSeenAt
      );
    });

    const removed = this.alerts.length - this.maxAlerts;
    this.alerts.splice(0, removed);

    return removed;
  }

  exportJSON({ includeResolved = true } = {}) {
    const alerts = includeResolved
      ? this.alerts
      : this.alerts.filter((alert) => alert.status !== "resolved");

    return JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: this.now(),
        summary: this.getSummary(),
        alerts,
      },
      null,
      2
    );
  }

  exportCSV({ includeResolved = true } = {}) {
    const alerts = includeResolved
      ? this.alerts
      : this.alerts.filter((alert) => alert.status !== "resolved");

    const columns = [
      "id",
      "component",
      "code",
      "severity",
      "status",
      "message",
      "firstSeenAt",
      "lastSeenAt",
      "occurrences",
      "acknowledgedAt",
      "acknowledgedBy",
      "resolvedAt",
      "resolution",
    ];

    const escape = (value) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };

    return [
      columns.join(","),
      ...alerts.map((alert) =>
        columns.map((column) => escape(alert[column])).join(",")
      ),
    ].join("\r\n");
  }

  download(content, filename, type) {
    if (
      typeof document === "undefined" ||
      typeof URL === "undefined" ||
      typeof Blob === "undefined"
    ) {
      return false;
    }

    let url;

    try {
      const blob = new Blob([content], { type });
      url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      link.remove();

      return true;
    } catch (error) {
      this.reportError(error, "download");
      return false;
    } finally {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  }

  downloadJSON() {
    return this.download(
      this.exportJSON(),
      `diagnostic-alerts-${this.now()}.json`,
      "application/json;charset=utf-8"
    );
  }

  downloadCSV() {
    return this.download(
      this.exportCSV(),
      `diagnostic-alerts-${this.now()}.csv`,
      "text/csv;charset=utf-8"
    );
  }

  clear({ includeActive = false } = {}) {
    const before = this.alerts.length;

    this.alerts = this.alerts.filter(
      (alert) => !includeActive && alert.status !== "resolved"
    );

    const removed = before - this.alerts.length;

    if (removed > 0) {
      this.persist();
      this.emit("cleared", null, { removed });
    }

    return removed;
  }

  refresh() {
    if (this.destroyed) {
      return this.getSummary();
    }

    this.load();
    this.emit("refreshed", null, {
      summary: this.getSummary(),
    });

    return this.getSummary();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.unsubscribeDiagnostics?.();
    this.unsubscribeAnalytics?.();
    this.unsubscribeStore?.();

    this.unsubscribeDiagnostics = null;
    this.unsubscribeAnalytics = null;
    this.unsubscribeStore = null;

    this.listeners.clear();
    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsAlerts;