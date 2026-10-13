export default class AlertQueueDashboardDiagnostics {
  constructor({
    state = null,
    controller = null,
    logger = null,
    events = null,
    persistence = null,
    sync = null,
    scheduler = null,
    storageKey = "kano-run-alert-dashboard",
    maxHistory = 100,
    onDiagnostic = null,
  } = {}) {
    this.state = state;
    this.controller = controller;
    this.logger = logger;
    this.events = events;
    this.persistence = persistence;
    this.sync = sync;
    this.scheduler = scheduler;

    this.storageKey = storageKey;
    this.maxHistory = Math.max(10, Number(maxHistory) || 100);
    this.onDiagnostic =
      typeof onDiagnostic === "function" ? onDiagnostic : null;

    this.history = [];
    this.listeners = new Set();
    this.running = false;
    this.lastReport = null;
    this.runCount = 0;
    this.destroyed = false;
  }

  run() {
    if (this.destroyed) {
      return this.createReport([
        this.issue(
          "diagnostics",
          "error",
          "DESTROYED",
          "Diagnostics has been destroyed."
        ),
      ]);
    }

    this.running = true;
    this.runCount += 1;

    const startedAt = this.now();
    const checks = [];

    checks.push(this.checkEnvironment());
    checks.push(this.checkState());
    checks.push(this.checkController());
    checks.push(this.checkLogger());
    checks.push(this.checkEvents());
    checks.push(this.checkPersistence());
    checks.push(this.checkSync());
    checks.push(this.checkScheduler());

    const report = this.createReport(
      checks.flatMap((check) => check.issues),
      {
        startedAt,
        completedAt: this.now(),
        checks: checks.map((check) => ({
          name: check.name,
          status: check.status,
          details: check.details,
        })),
      }
    );

    this.running = false;
    this.lastReport = report;

    this.record({
      type: "diagnostics_completed",
      timestamp: report.completedAt,
      status: report.status,
      issueCount: report.summary.total,
    });

    this.notify(report);

    return report;
  }

  async runAsync() {
    if (this.destroyed) {
      return this.run();
    }

    const startedAt = this.now();
    const report = this.run();

    const asynchronousChecks = [];

    if (
      this.persistence &&
      typeof this.persistence.hasSavedState === "function"
    ) {
      asynchronousChecks.push(
        this.runCheck("persistence_async", async () => {
          const saved = await this.persistence.hasSavedState();

          return {
            savedStateAvailable: Boolean(saved),
          };
        })
      );
    }

    if (asynchronousChecks.length === 0) {
      return report;
    }

    const results = await Promise.allSettled(asynchronousChecks);

    const issues = [...report.issues];
    const checks = [...report.checks];

    for (const result of results) {
      if (result.status === "fulfilled") {
        checks.push(result.value);
        issues.push(...result.value.issues);
      } else {
        issues.push(
          this.issue(
            "diagnostics_async",
            "warning",
            "ASYNC_CHECK_FAILED",
            this.errorMessage(result.reason)
          )
        );
      }
    }

    const completedReport = this.createReport(issues, {
      startedAt,
      completedAt: this.now(),
      checks,
    });

    this.lastReport = completedReport;
    this.notify(completedReport);

    return completedReport;
  }

  checkEnvironment() {
    const issues = [];
    const details = {
      browser: typeof window !== "undefined",
      document: typeof document !== "undefined",
      localStorageAvailable: false,
      broadcastChannelAvailable: false,
      online: null,
      visibilityState: null,
    };

    if (typeof window === "undefined") {
      issues.push(
        this.issue(
          "environment",
          "info",
          "NON_BROWSER_RUNTIME",
          "Browser APIs are unavailable in this runtime."
        )
      );

      return this.result("environment", issues, details);
    }

    details.online =
      typeof navigator !== "undefined" &&
      typeof navigator.onLine === "boolean"
        ? navigator.onLine
        : null;

    details.visibilityState =
      typeof document !== "undefined"
        ? document.visibilityState
        : null;

    details.broadcastChannelAvailable =
      typeof window.BroadcastChannel === "function";

    try {
      const storage = window.localStorage;
      const testKey = `${this.storageKey}:diagnostic-test`;

      storage.setItem(testKey, "1");
      storage.removeItem(testKey);

      details.localStorageAvailable = true;
    } catch (error) {
      issues.push(
        this.issue(
          "environment",
          "warning",
          "LOCAL_STORAGE_UNAVAILABLE",
          this.errorMessage(error)
        )
      );
    }

    if (details.online === false) {
      issues.push(
        this.issue(
          "environment",
          "warning",
          "OFFLINE",
          "The browser reports that it is offline."
        )
      );
    }

    if (!details.broadcastChannelAvailable) {
      issues.push(
        this.issue(
          "environment",
          "info",
          "BROADCAST_CHANNEL_UNAVAILABLE",
          "Cross-tab BroadcastChannel synchronization is unavailable."
        )
      );
    }

    return this.result("environment", issues, details);
  }

  checkState() {
    const issues = [];
    const details = {
      available: Boolean(this.state),
      status: null,
      loading: null,
      notificationCount: 0,
      historyCount: 0,
    };

    if (!this.state) {
      issues.push(
        this.issue(
          "state",
          "warning",
          "STATE_MISSING",
          "No dashboard state instance was provided."
        )
      );

      return this.result("state", issues, details);
    }

    const snapshot =
      typeof this.state.getState === "function"
        ? this.safeCall(() => this.state.getState())
        : this.state;

    if (!snapshot || typeof snapshot !== "object") {
      issues.push(
        this.issue(
          "state",
          "error",
          "INVALID_STATE",
          "Dashboard state did not return a valid object."
        )
      );

      return this.result("state", issues, details);
    }

    details.status = snapshot.status ?? null;
    details.loading = snapshot.loading ?? null;
    details.notificationCount = Array.isArray(snapshot.notifications)
      ? snapshot.notifications.length
      : 0;
    details.historyCount = Array.isArray(snapshot.history)
      ? snapshot.history.length
      : 0;

    if (
      snapshot.error &&
      String(snapshot.error).trim().length > 0
    ) {
      issues.push(
        this.issue(
          "state",
          "warning",
          "STATE_HAS_ERROR",
          String(snapshot.error)
        )
      );
    }

    if (
      snapshot.updatedAt &&
      Number.isNaN(Date.parse(snapshot.updatedAt))
    ) {
      issues.push(
        this.issue(
          "state",
          "warning",
          "INVALID_UPDATED_AT",
          "The state's updatedAt value is not a valid date."
        )
      );
    }

    if (
      snapshot.notifications !== undefined &&
      !Array.isArray(snapshot.notifications)
    ) {
      issues.push(
        this.issue(
          "state",
          "warning",
          "INVALID_NOTIFICATIONS",
          "The notifications field should be an array."
        )
      );
    }

    return this.result("state", issues, details);
  }

  checkController() {
    const issues = [];
    const details = {
      available: Boolean(this.controller),
      methods: {},
    };

    if (!this.controller) {
      issues.push(
        this.issue(
          "controller",
          "info",
          "CONTROLLER_MISSING",
          "No dashboard controller was provided."
        )
      );

      return this.result("controller", issues, details);
    }

    const expectedMethods = [
      "refresh",
      "start",
      "stop",
      "subscribe",
    ];

    for (const method of expectedMethods) {
      details.methods[method] =
        typeof this.controller[method] === "function";
    }

    if (!details.methods.refresh) {
      issues.push(
        this.issue(
          "controller",
          "warning",
          "REFRESH_METHOD_MISSING",
          "The controller does not expose refresh()."
        )
      );
    }

    if (!details.methods.subscribe) {
      issues.push(
        this.issue(
          "controller",
          "info",
          "SUBSCRIBE_METHOD_MISSING",
          "The controller does not expose subscribe()."
        )
      );
    }

    return this.result("controller", issues, details);
  }

  checkLogger() {
    const issues = [];
    const details = {
      available: Boolean(this.logger),
      methods: {},
      entryCount: null,
    };

    if (!this.logger) {
      issues.push(
        this.issue(
          "logger",
          "info",
          "LOGGER_MISSING",
          "No diagnostic logger was provided."
        )
      );

      return this.result("logger", issues, details);
    }

    for (const method of [
      "debug",
      "info",
      "warn",
      "error",
      "getEntries",
      "exportJSON",
    ]) {
      details.methods[method] =
        typeof this.logger[method] === "function";
    }

    if (typeof this.logger.getEntries === "function") {
      const entries = this.safeCall(() =>
        this.logger.getEntries()
      );

      if (Array.isArray(entries)) {
        details.entryCount = entries.length;
      }
    }

    return this.result("logger", issues, details);
  }

  checkEvents() {
    const issues = [];
    const details = {
      available: Boolean(this.events),
      methods: {},
    };

    if (!this.events) {
      issues.push(
        this.issue(
          "events",
          "info",
          "EVENTS_MISSING",
          "No dashboard event emitter was provided."
        )
      );

      return this.result("events", issues, details);
    }

    for (const method of ["on", "off", "emit"]) {
      details.methods[method] =
        typeof this.events[method] === "function";
    }

    if (!details.methods.on || !details.methods.emit) {
      issues.push(
        this.issue(
          "events",
          "warning",
          "EVENT_API_INCOMPLETE",
          "The event emitter is missing on() or emit()."
        )
      );
    }

    return this.result("events", issues, details);
  }

  checkPersistence() {
    const issues = [];
    const details = {
      available: Boolean(this.persistence),
      methods: {},
      savedStateAvailable: null,
    };

    if (!this.persistence) {
      issues.push(
        this.issue(
          "persistence",
          "info",
          "PERSISTENCE_MISSING",
          "No persistence adapter was provided."
        )
      );

      return this.result("persistence", issues, details);
    }

    for (const method of [
      "save",
      "restore",
      "clear",
      "hasSavedState",
      "getMetadata",
    ]) {
      details.methods[method] =
        typeof this.persistence[method] === "function";
    }

    if (
      typeof this.persistence.hasSavedState === "function"
    ) {
      try {
        const saved = this.persistence.hasSavedState();

        if (saved && typeof saved.then === "function") {
          details.savedStateAvailable = "async";
        } else {
          details.savedStateAvailable = Boolean(saved);
        }
      } catch (error) {
        issues.push(
          this.issue(
            "persistence",
            "warning",
            "PERSISTENCE_READ_FAILED",
            this.errorMessage(error)
          )
        );
      }
    }

    if (
      !details.methods.save ||
      !details.methods.restore
    ) {
      issues.push(
        this.issue(
          "persistence",
          "warning",
          "PERSISTENCE_API_INCOMPLETE",
          "Persistence should expose save() and restore()."
        )
      );
    }

    return this.result("persistence", issues, details);
  }

  checkSync() {
    const issues = [];
    const details = {
      available: Boolean(this.sync),
      running: null,
      methods: {},
    };

    if (!this.sync) {
      issues.push(
        this.issue(
          "sync",
          "info",
          "SYNC_MISSING",
          "No cross-tab synchronization adapter was provided."
        )
      );

      return this.result("sync", issues, details);
    }

    for (const method of ["start", "stop"]) {
      details.methods[method] =
        typeof this.sync[method] === "function";
    }

    if (typeof this.sync.isRunning === "function") {
      details.running = Boolean(
        this.safeCall(() => this.sync.isRunning())
      );
    } else if (typeof this.sync.running === "boolean") {
      details.running = this.sync.running;
    }

    if (
      !details.methods.start ||
      !details.methods.stop
    ) {
      issues.push(
        this.issue(
          "sync",
          "warning",
          "SYNC_API_INCOMPLETE",
          "The synchronization adapter should expose start() and stop()."
        )
      );
    }

    return this.result("sync", issues, details);
  }

  checkScheduler() {
    const issues = [];
    const details = {
      available: Boolean(this.scheduler),
      running: null,
      methods: {},
    };

    if (!this.scheduler) {
      issues.push(
        this.issue(
          "scheduler",
          "info",
          "SCHEDULER_MISSING",
          "No refresh scheduler was provided."
        )
      );

      return this.result("scheduler", issues, details);
    }

    for (const method of ["start", "stop"]) {
      details.methods[method] =
        typeof this.scheduler[method] === "function";
    }

    if (typeof this.scheduler.isRunning === "function") {
      details.running = Boolean(
        this.safeCall(() => this.scheduler.isRunning())
      );
    } else if (typeof this.scheduler.running === "boolean") {
      details.running = this.scheduler.running;
    }

    if (
      !details.methods.start ||
      !details.methods.stop
    ) {
      issues.push(
        this.issue(
          "scheduler",
          "warning",
          "SCHEDULER_API_INCOMPLETE",
          "The scheduler should expose start() and stop()."
        )
      );
    }

    return this.result("scheduler", issues, details);
  }

  async runCheck(name, callback) {
    const startedAt = this.now();

    try {
      const details = await callback();

      return {
        name,
        status: "ok",
        details: details ?? {},
        issues: [],
        durationMs: this.elapsed(startedAt),
      };
    } catch (error) {
      const issue = this.issue(
        name,
        "warning",
        "CHECK_FAILED",
        this.errorMessage(error)
      );

      return {
        name,
        status: "warning",
        details: {},
        issues: [issue],
        durationMs: this.elapsed(startedAt),
      };
    }
  }

  result(name, issues = [], details = {}) {
    const status = issues.some(
      (item) => item.severity === "error"
    )
      ? "error"
      : issues.some(
            (item) => item.severity === "warning"
          )
        ? "warning"
        : "ok";

    return {
      name,
      status,
      details,
      issues,
    };
  }

  issue(
    component,
    severity,
    code,
    message,
    metadata = {}
  ) {
    return {
      id: this.createId(),
      component,
      severity,
      code,
      message,
      metadata,
      timestamp: this.now(),
    };
  }

  createReport(issues = [], metadata = {}) {
    const summary = {
      total: issues.length,
      errors: issues.filter(
        (item) => item.severity === "error"
      ).length,
      warnings: issues.filter(
        (item) => item.severity === "warning"
      ).length,
      info: issues.filter(
        (item) => item.severity === "info"
      ).length,
    };

    const status = summary.errors > 0
      ? "error"
      : summary.warnings > 0
        ? "warning"
        : "healthy";

    return {
      id: this.createId(),
      name: "Kano Run Alert Queue Dashboard Diagnostics",
      version: 1,
      status,
      summary,
      issues,
      checks: metadata.checks ?? [],
      startedAt: metadata.startedAt ?? this.now(),
      completedAt: metadata.completedAt ?? this.now(),
      durationMs:
        metadata.startedAt && metadata.completedAt
          ? Math.max(
              0,
              Date.parse(metadata.completedAt) -
                Date.parse(metadata.startedAt)
            )
          : 0,
      runCount: this.runCount,
    };
  }

  record(entry) {
    this.history.push({
      id: this.createId(),
      ...entry,
    });

    if (this.history.length > this.maxHistory) {
      this.history.splice(
        0,
        this.history.length - this.maxHistory
      );
    }
  }

  getHistory(limit = 20) {
    const count = Math.max(
      0,
      Math.floor(Number(limit) || 0)
    );

    return this.history.slice(-count).map((entry) => ({
      ...entry,
    }));
  }

  getLastReport() {
    if (!this.lastReport) {
      return null;
    }

    return JSON.parse(JSON.stringify(this.lastReport));
  }

  getStatus() {
    return {
      running: this.running,
      destroyed: this.destroyed,
      runCount: this.runCount,
      lastRunAt: this.lastReport?.completedAt ?? null,
      lastStatus: this.lastReport?.status ?? "unknown",
      issueCount: this.lastReport?.summary?.total ?? 0,
    };
  }

  exportJSON({ pretty = true } = {}) {
    const payload = {
      exportedAt: this.now(),
      status: this.getStatus(),
      report: this.lastReport,
      history: this.getHistory(this.maxHistory),
    };

    return JSON.stringify(
      payload,
      null,
      pretty ? 2 : 0
    );
  }

  downloadReport(filename = "kano-run-diagnostics.json") {
    if (
      typeof document === "undefined" ||
      typeof URL === "undefined" ||
      typeof Blob === "undefined"
    ) {
      return false;
    }

    try {
      const blob = new Blob([this.exportJSON()], {
        type: "application/json;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      return true;
    } catch (error) {
      this.log("warn", "Diagnostics download failed.", {
        error: this.errorMessage(error),
      });

      return false;
    }
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "Diagnostics subscriber must be a function."
      );
    }

    if (this.destroyed) {
      return () => {};
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(report) {
    for (const listener of this.listeners) {
      try {
        listener(report);
      } catch (error) {
        this.log(
          "warn",
          "Diagnostics subscriber failed.",
          {
            error: this.errorMessage(error),
          }
        );
      }
    }

    if (this.onDiagnostic) {
      try {
        this.onDiagnostic(report);
      } catch (error) {
        this.log(
          "warn",
          "Diagnostics callback failed.",
          {
            error: this.errorMessage(error),
          }
        );
      }
    }

    if (
      this.events &&
      typeof this.events.emit === "function"
    ) {
      try {
        this.events.emit("diagnostics:completed", report);
      } catch {
        // Event listeners must not interrupt diagnostics.
      }
    }
  }

  log(level, message, metadata = {}) {
    if (
      this.logger &&
      typeof this.logger[level] === "function"
    ) {
      try {
        this.logger[level](message, metadata);
      } catch {
        // Logging failures must not interrupt diagnostics.
      }
    }
  }

  safeCall(callback) {
    try {
      return callback();
    } catch {
      return null;
    }
  }

  errorMessage(error) {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }

  createId() {
    return `diag-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  now() {
    return new Date().toISOString();
  }

  elapsed(startedAt) {
    return Math.max(
      0,
      Date.now() - Date.parse(startedAt)
    );
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.listeners.clear();
    this.lastReport = null;
    this.history.length = 0;
    this.destroyed = true;
  }
}