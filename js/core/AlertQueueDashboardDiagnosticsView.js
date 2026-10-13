export default class AlertQueueDashboardDiagnosticsView {
  constructor({
    root,
    diagnostics,
    document: doc = globalThis.document,
    autoRun = false,
    refreshInterval = 0,
  } = {}) {
    if (!root) {
      throw new TypeError("A root element is required.");
    }

    if (!diagnostics) {
      throw new TypeError("A diagnostics instance is required.");
    }

    this.root = root;
    this.diagnostics = diagnostics;
    this.document = doc;
    this.autoRun = Boolean(autoRun);
    this.refreshInterval = Math.max(
      0,
      Number(refreshInterval) || 0
    );

    this.unsubscribe = null;
    this.refreshTimer = null;
    this.mounted = false;
    this.busy = false;
    this.report = null;
    this.error = null;

    this.handleClick = this.handleClick.bind(this);
  }

  mount() {
    if (this.mounted) {
      return this;
    }

    this.mounted = true;

    this.root.addEventListener("click", this.handleClick);

    if (typeof this.diagnostics.subscribe === "function") {
      this.unsubscribe = this.diagnostics.subscribe((report) => {
        this.report = report;
        this.render();
      });
    }

    this.report =
      typeof this.diagnostics.getLastReport === "function"
        ? this.diagnostics.getLastReport()
        : null;

    this.render();

    if (this.autoRun) {
      this.runDiagnostics();
    }

    if (this.refreshInterval > 0) {
      this.refreshTimer = setInterval(() => {
        if (!this.busy && this.mounted) {
          this.runDiagnostics();
        }
      }, this.refreshInterval);
    }

    return this;
  }

  render() {
    if (!this.mounted) {
      return;
    }

    const report = this.report;
    const summary = report?.summary ?? {
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
    };

    const status = report?.status ?? "not-run";
    const issues = Array.isArray(report?.issues)
      ? report.issues
      : [];

    this.root.innerHTML = `
      <section class="aqdv" aria-label="Dashboard diagnostics">
        <header class="aqdv__header">
          <div>
            <p class="aqdv__eyebrow">KANO RUN · SYSTEM MONITOR</p>
            <h2 class="aqdv__title">Alert Dashboard Diagnostics</h2>
            <p class="aqdv__subtitle">
              Inspect dashboard components and runtime health.
            </p>
          </div>

          <span class="aqdv__badge aqdv__badge--${this.escape(status)}">
            ${this.escape(this.formatStatus(status))}
          </span>
        </header>

        <div class="aqdv__actions">
          <button
            type="button"
            data-action="run"
            ${this.busy ? "disabled" : ""}
          >
            ${this.busy ? "Running checks…" : "Run diagnostics"}
          </button>

          <button
            type="button"
            data-action="export"
            ${report ? "" : "disabled"}
          >
            Export JSON
          </button>

          <button
            type="button"
            data-action="clear"
            ${this.busy ? "disabled" : ""}
          >
            Clear display
          </button>
        </div>

        ${this.error ? `
          <div class="aqdv__error" role="alert">
            ${this.escape(this.error)}
          </div>
        ` : ""}

        <div class="aqdv__metrics">
          ${this.metricCard("Total issues", summary.total, "total")}
          ${this.metricCard("Errors", summary.errors, "error")}
          ${this.metricCard("Warnings", summary.warnings, "warning")}
          ${this.metricCard("Information", summary.info, "info")}
        </div>

        <section class="aqdv__section">
          <div class="aqdv__section-heading">
            <h3>Component checks</h3>
            <span>${report?.checks?.length ?? 0} checks</span>
          </div>

          ${this.renderChecks(report?.checks ?? [])}
        </section>

        <section class="aqdv__section">
          <div class="aqdv__section-heading">
            <h3>Issues</h3>
            <span>${issues.length} found</span>
          </div>

          ${this.renderIssues(issues)}
        </section>

        <footer class="aqdv__footer">
          <span>
            Last run:
            ${this.escape(this.formatDate(report?.completedAt))}
          </span>
          <span>
            Duration:
            ${Number.isFinite(report?.durationMs)
              ? `${Math.round(report.durationMs)} ms`
              : "—"}
          </span>
        </footer>
      </section>
    `;

    this.applyStyles();
  }

  metricCard(label, value, type) {
    return `
      <article class="aqdv__metric aqdv__metric--${type}">
        <span>${this.escape(label)}</span>
        <strong>${this.escape(value ?? 0)}</strong>
      </article>
    `;
  }

  renderChecks(checks) {
    if (!Array.isArray(checks) || checks.length === 0) {
      return `
        <p class="aqdv__empty">
          Run diagnostics to inspect dashboard components.
        </p>
      `;
    }

    return `
      <div class="aqdv__check-list">
        ${checks.map((check) => `
          <article class="aqdv__check">
            <div class="aqdv__check-main">
              <span class="aqdv__status-dot aqdv__status-dot--${this.escape(check.status)}"></span>
              <strong>${this.escape(this.humanize(check.name))}</strong>
            </div>

            <span class="aqdv__check-status">
              ${this.escape(this.formatStatus(check.status))}
            </span>

            ${check.details && Object.keys(check.details).length
              ? `
                <details class="aqdv__details">
                  <summary>Details</summary>
                  <pre>${this.escape(
                    JSON.stringify(check.details, null, 2)
                  )}</pre>
                </details>
              `
              : ""}
          </article>
        `).join("")}
      </div>
    `;
  }

  renderIssues(issues) {
    if (!Array.isArray(issues) || issues.length === 0) {
      return `
        <div class="aqdv__empty aqdv__empty--success">
          No issues reported.
        </div>
      `;
    }

    return `
      <div class="aqdv__issue-list">
        ${issues.map((issue) => `
          <article class="aqdv__issue aqdv__issue--${this.escape(issue.severity)}">
            <div class="aqdv__issue-heading">
              <strong>${this.escape(issue.code ?? "UNKNOWN")}</strong>
              <span>${this.escape(issue.severity ?? "info")}</span>
            </div>

            <p>${this.escape(issue.message ?? "No description provided.")}</p>

            <div class="aqdv__issue-meta">
              <span>${this.escape(issue.component ?? "general")}</span>
              <time>${this.escape(this.formatDate(issue.timestamp))}</time>
            </div>

            ${issue.metadata && Object.keys(issue.metadata).length
              ? `
                <details class="aqdv__details">
                  <summary>Metadata</summary>
                  <pre>${this.escape(
                    JSON.stringify(issue.metadata, null, 2)
                  )}</pre>
                </details>
              `
              : ""}
          </article>
        `).join("")}
      </div>
    `;
  }

  async runDiagnostics() {
    if (this.busy || !this.mounted) {
      return null;
    }

    this.busy = true;
    this.error = null;
    this.render();

    try {
      const runner =
        typeof this.diagnostics.runAsync === "function"
          ? this.diagnostics.runAsync.bind(this.diagnostics)
          : this.diagnostics.run.bind(this.diagnostics);

      const report = await runner();

      if (!this.mounted) {
        return report;
      }

      this.report = report ?? this.report;
      return this.report;
    } catch (error) {
      this.error = error instanceof Error
        ? error.message
        : String(error);

      return null;
    } finally {
      this.busy = false;

      if (this.mounted) {
        this.render();
      }
    }
  }

  handleClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button || !this.root.contains(button)) {
      return;
    }

    switch (button.dataset.action) {
      case "run":
        this.runDiagnostics();
        break;

      case "export":
        this.exportReport();
        break;

      case "clear":
        this.clearDisplay();
        break;

      default:
        break;
    }
  }

  exportReport() {
    if (!this.report) {
      return false;
    }

    if (
      typeof this.diagnostics.downloadReport === "function"
    ) {
      return this.diagnostics.downloadReport(
        "kano-run-diagnostics.json"
      );
    }

    const payload = JSON.stringify(this.report, null, 2);

    if (
      typeof this.document === "undefined" ||
      typeof Blob === "undefined" ||
      typeof URL === "undefined"
    ) {
      return payload;
    }

    const blob = new Blob([payload], {
      type: "application/json;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement("a");

    anchor.href = url;
    anchor.download = "kano-run-diagnostics.json";
    anchor.style.display = "none";

    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return true;
  }

  clearDisplay() {
    if (this.busy) {
      return;
    }

    this.report = null;
    this.error = null;
    this.render();
  }

  applyStyles() {
    if (!this.document || this.document.getElementById("aqdv-styles")) {
      return;
    }

    const style = this.document.createElement("style");
    style.id = "aqdv-styles";

    style.textContent = `
      .aqdv {
        color: #172033;
        font: 14px/1.5 system-ui, sans-serif;
        width: 100%;
      }

      .aqdv * { box-sizing: border-box; }

      .aqdv__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        flex-wrap: wrap;
      }

      .aqdv__eyebrow {
        margin: 0 0 5px;
        color: #64748b;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .12em;
      }

      .aqdv__title {
        margin: 0;
        font-size: clamp(20px, 3vw, 28px);
      }

      .aqdv__subtitle {
        margin: 6px 0 0;
        color: #64748b;
      }

      .aqdv__badge,
      .aqdv__check-status {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 5px 10px;
        background: #e2e8f0;
        font-size: 12px;
        font-weight: 700;
      }

      .aqdv__badge--healthy,
      .aqdv__badge--ok {
        background: #dcfce7;
        color: #166534;
      }

      .aqdv__badge--warning {
        background: #fef3c7;
        color: #92400e;
      }

      .aqdv__badge--error {
        background: #fee2e2;
        color: #991b1b;
      }

      .aqdv__actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 20px 0;
      }

      .aqdv__actions button {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #fff;
        color: #172033;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
        padding: 9px 13px;
      }

      .aqdv__actions button:first-child {
        background: #0b1e3a;
        border-color: #0b1e3a;
        color: #fff;
      }

      .aqdv__actions button:disabled {
        cursor: not-allowed;
        opacity: .5;
      }

      .aqdv__metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 24px;
      }

      .aqdv__metric {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 15px;
        min-width: 0;
      }

      .aqdv__metric span {
        display: block;
        color: #64748b;
        font-size: 12px;
      }

      .aqdv__metric strong {
        display: block;
        font-size: 27px;
        margin-top: 5px;
      }

      .aqdv__metric--error strong { color: #b91c1c; }
      .aqdv__metric--warning strong { color: #b45309; }
      .aqdv__metric--info strong { color: #0369a1; }

      .aqdv__section { margin: 24px 0; }

      .aqdv__section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .aqdv__section-heading h3 {
        margin: 0;
        font-size: 17px;
      }

      .aqdv__section-heading > span {
        color: #64748b;
        font-size: 12px;
      }

      .aqdv__check-list,
      .aqdv__issue-list {
        display: grid;
        gap: 10px;
      }

      .aqdv__check,
      .aqdv__issue {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 13px;
        min-width: 0;
      }

      .aqdv__check-main {
        display: flex;
        align-items: center;
        gap: 9px;
      }

      .aqdv__check {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
      }

      .aqdv__status-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #94a3b8;
        flex-shrink: 0;
      }

      .aqdv__status-dot--ok { background: #16a34a; }
      .aqdv__status-dot--warning { background: #d97706; }
      .aqdv__status-dot--error { background: #dc2626; }

      .aqdv__check-status {
        align-self: start;
        text-transform: capitalize;
      }

      .aqdv__issue--error { border-left: 4px solid #dc2626; }
      .aqdv__issue--warning { border-left: 4px solid #d97706; }
      .aqdv__issue--info { border-left: 4px solid #0284c7; }

      .aqdv__issue-heading,
      .aqdv__issue-meta,
      .aqdv__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .aqdv__issue-heading span {
        font-size: 11px;
        text-transform: uppercase;
        font-weight: 700;
      }

      .aqdv__issue p {
        margin: 8px 0;
        overflow-wrap: anywhere;
      }

      .aqdv__issue-meta,
      .aqdv__footer {
        color: #64748b;
        font-size: 12px;
      }

      .aqdv__details {
        grid-column: 1 / -1;
        margin-top: 6px;
      }

      .aqdv__details summary {
        cursor: pointer;
        color: #475569;
        font-size: 12px;
      }

      .aqdv__details pre {
        overflow: auto;
        max-height: 240px;
        padding: 10px;
        border-radius: 8px;
        background: #f1f5f9;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: 12px;
      }

      .aqdv__empty {
        padding: 20px;
        border: 1px dashed #cbd5e1;
        border-radius: 10px;
        color: #64748b;
        text-align: center;
      }

      .aqdv__empty--success {
        color: #166534;
        background: #f0fdf4;
        border-color: #bbf7d0;
      }

      .aqdv__error {
        margin: 12px 0;
        padding: 10px 12px;
        border-radius: 8px;
        color: #991b1b;
        background: #fee2e2;
        overflow-wrap: anywhere;
      }

      .aqdv__footer {
        border-top: 1px solid #e2e8f0;
        padding-top: 14px;
        margin-top: 24px;
      }

      @media (max-width: 640px) {
        .aqdv__metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .aqdv__check {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `;

    this.document.head.appendChild(style);
  }

  formatStatus(status) {
    const labels = {
      healthy: "Healthy",
      ok: "OK",
      warning: "Warning",
      error: "Error",
      "not-run": "Not run",
    };

    return labels[status] ?? this.humanize(status ?? "unknown");
  }

  humanize(value) {
    return String(value ?? "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  formatDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString();
  }

  escape(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]
    );
  }

  destroy() {
    if (!this.mounted) {
      return;
    }

    this.mounted = false;

    this.root.removeEventListener("click", this.handleClick);

    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
    }

    this.unsubscribe = null;

    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = null;
    this.root.replaceChildren();
  }
}