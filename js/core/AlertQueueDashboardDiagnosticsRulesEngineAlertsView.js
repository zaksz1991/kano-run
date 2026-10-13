const SEVERITY_ORDER = Object.freeze({
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
});

const STATUS_LABELS = Object.freeze({
  active: "Active",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  dismissed: "Dismissed",
});

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function formatTimestamp(value) {
  if (!value) {
    return "Unknown time";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString();
}

function normalizeSeverity(value) {
  const severity = String(value ?? "medium").toLowerCase();

  if (severity === "fatal") return "critical";
  if (severity === "error") return "high";
  if (severity === "warning" || severity === "warn") return "medium";
  if (severity === "notice" || severity === "debug") return "info";

  return Object.hasOwn(SEVERITY_ORDER, severity) ? severity : "medium";
}

function normalizeStatus(value) {
  const status = String(value ?? "active").toLowerCase();

  return Object.hasOwn(STATUS_LABELS, status) ? status : "active";
}

export class AlertQueueDashboardDiagnosticsRulesEngineAlertsView {
  constructor({
    alerts,
    container = null,
    document: documentRef = globalThis.document,
    pageSize = 25,
    onError = null,
    autoSubscribe = true,
  } = {}) {
    this.alerts = alerts;
    this.document = documentRef;
    this.container = this.resolveContainer(container);
    this.pageSize = Math.max(1, Number(pageSize) || 25);
    this.onError = typeof onError === "function" ? onError : null;

    this.filters = {
      search: "",
      severity: "all",
      status: "all",
      sort: "newest",
    };

    this.page = 0;
    this.selectedIds = new Set();
    this.unsubscribe = null;
    this.destroyed = false;
    this.boundClick = (event) => this.handleClick(event);
    this.boundInput = (event) => this.handleInput(event);
    this.boundChange = (event) => this.handleChange(event);

    if (this.container) {
      this.container.addEventListener("click", this.boundClick);
      this.container.addEventListener("input", this.boundInput);
      this.container.addEventListener("change", this.boundChange);
    }

    if (autoSubscribe && this.alerts?.subscribe) {
      this.unsubscribe = this.alerts.subscribe(() => this.render());
    }

    this.render();
  }

  resolveContainer(container) {
    if (!container || !this.document) {
      return null;
    }

    if (typeof container === "string") {
      return this.document.querySelector(container);
    }

    return typeof container.replaceChildren === "function"
      ? container
      : null;
  }

  getRecords() {
    if (!this.alerts) {
      return [];
    }

    const options = {
      search: this.filters.search,
      sort: this.filters.sort,
    };

    if (this.filters.severity !== "all") {
      options.severity = this.filters.severity;
    }

    if (this.filters.status !== "all") {
      options.status = this.filters.status;
    }

    let records = [];

    if (typeof this.alerts.getAll === "function") {
      records = this.alerts.getAll(options);
    } else if (typeof this.alerts.list === "function") {
      records = this.alerts.list(options);
    } else if (typeof this.alerts.getHistory === "function") {
      records = this.alerts.getHistory(options);
    }

    if (!Array.isArray(records)) {
      return [];
    }

    return records
      .slice()
      .sort((a, b) => {
        if (this.filters.sort === "severity") {
          return (
            SEVERITY_ORDER[normalizeSeverity(a.severity)] -
              SEVERITY_ORDER[normalizeSeverity(b.severity)] ||
            String(b.createdAt ?? "").localeCompare(
              String(a.createdAt ?? ""),
            )
          );
        }

        if (this.filters.sort === "oldest") {
          return String(a.createdAt ?? "").localeCompare(
            String(b.createdAt ?? ""),
          );
        }

        return String(b.createdAt ?? "").localeCompare(
          String(a.createdAt ?? ""),
        );
      });
  }

  getSummary(records = this.getRecords()) {
    const summary =
      typeof this.alerts?.getSummary === "function"
        ? this.alerts.getSummary()
        : null;

    if (summary && typeof summary === "object") {
      return summary;
    }

    const result = {
      total: records.length,
      active: 0,
      unacknowledged: 0,
      acknowledged: 0,
      resolved: 0,
      dismissed: 0,
      critical: 0,
    };

    for (const record of records) {
      const status = normalizeStatus(record.status);

      if (status === "active" || status === "acknowledged") {
        result.active += 1;
      }

      if (status === "active") {
        result.unacknowledged += 1;
      }

      if (status === "acknowledged") {
        result.acknowledged += 1;
      }

      if (status === "resolved") {
        result.resolved += 1;
      }

      if (status === "dismissed") {
        result.dismissed += 1;
      }

      if (
        normalizeSeverity(record.severity) === "critical" &&
        (status === "active" || status === "acknowledged")
      ) {
        result.critical += 1;
      }
    }

    return result;
  }

  render() {
    if (this.destroyed || !this.container || !this.document) {
      return null;
    }

    try {
      const records = this.getRecords();
      const summary = this.getSummary(records);
      const totalPages = Math.max(
        1,
        Math.ceil(records.length / this.pageSize),
      );

      this.page = Math.min(this.page, totalPages - 1);

      const start = this.page * this.pageSize;
      const pageRecords = records.slice(start, start + this.pageSize);

      this.container.innerHTML = `
        <section class="rqda" aria-label="Rules engine alerts">
          <header class="rqda__header">
            <div>
              <h2 class="rqda__title">Rules Engine Alerts</h2>
              <p class="rqda__subtitle">Monitor, acknowledge, and resolve rule matches.</p>
            </div>
            <div class="rqda__header-actions">
              <button type="button" data-action="refresh">Refresh</button>
              <button type="button" data-action="export">Export JSON</button>
            </div>
          </header>

          <div class="rqda__summary" aria-label="Alert summary">
            ${this.renderMetric("Total", summary.total)}
            ${this.renderMetric("Active", summary.active)}
            ${this.renderMetric("Unacknowledged", summary.unacknowledged)}
            ${this.renderMetric("Critical", summary.critical)}
            ${this.renderMetric("Resolved", summary.resolved)}
          </div>

          <div class="rqda__filters">
            <label>
              <span>Search</span>
              <input
                type="search"
                data-filter="search"
                value="${escapeHTML(this.filters.search)}"
                placeholder="Search alerts or rules"
              >
            </label>

            <label>
              <span>Severity</span>
              <select data-filter="severity">
                ${this.renderOption("all", "All severities", this.filters.severity)}
                ${this.renderOption("critical", "Critical", this.filters.severity)}
                ${this.renderOption("high", "High", this.filters.severity)}
                ${this.renderOption("medium", "Medium", this.filters.severity)}
                ${this.renderOption("low", "Low", this.filters.severity)}
                ${this.renderOption("info", "Info", this.filters.severity)}
              </select>
            </label>

            <label>
              <span>Status</span>
              <select data-filter="status">
                ${this.renderOption("all", "All statuses", this.filters.status)}
                ${this.renderOption("active", "Active", this.filters.status)}
                ${this.renderOption("acknowledged", "Acknowledged", this.filters.status)}
                ${this.renderOption("resolved", "Resolved", this.filters.status)}
                ${this.renderOption("dismissed", "Dismissed", this.filters.status)}
              </select>
            </label>

            <label>
              <span>Sort</span>
              <select data-filter="sort">
                ${this.renderOption("newest", "Newest first", this.filters.sort)}
                ${this.renderOption("oldest", "Oldest first", this.filters.sort)}
                ${this.renderOption("severity", "Severity", this.filters.sort)}
              </select>
            </label>
          </div>

          <div class="rqda__bulk-actions">
            <span>${records.length} matching alert${records.length === 1 ? "" : "s"}</span>
            <div>
              <button type="button" data-action="acknowledge-all">Acknowledge active</button>
              <button type="button" data-action="resolve-all">Resolve active</button>
              <button type="button" data-action="clear-resolved">Clear resolved</button>
            </div>
          </div>

          <div class="rqda__list">
            ${
              pageRecords.length
                ? pageRecords.map((record) => this.renderAlert(record)).join("")
                : '<p class="rqda__empty">No alerts match the selected filters.</p>'
            }
          </div>

          <footer class="rqda__pagination">
            <button type="button" data-action="previous-page" ${this.page === 0 ? "disabled" : ""}>Previous</button>
            <span>Page ${this.page + 1} of ${totalPages}</span>
            <button type="button" data-action="next-page" ${this.page >= totalPages - 1 ? "disabled" : ""}>Next</button>
          </footer>

          <p class="rqda__message" data-role="message" aria-live="polite"></p>
        </section>
      `;

      return {
        records: pageRecords,
        total: records.length,
        page: this.page,
        totalPages,
        summary,
      };
    } catch (error) {
      this.reportError(error, "render");
      return null;
    }
  }

  renderMetric(label, value) {
    return `
      <div class="rqda__metric">
        <span class="rqda__metric-value">${escapeHTML(value ?? 0)}</span>
        <span class="rqda__metric-label">${escapeHTML(label)}</span>
      </div>
    `;
  }

  renderOption(value, label, selected) {
    return `
      <option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""}>
        ${escapeHTML(label)}
      </option>
    `;
  }

  renderAlert(alert) {
    const id = String(alert.id ?? alert.alertId ?? "");
    const severity = normalizeSeverity(alert.severity);
    const status = normalizeStatus(alert.status);
    const canAcknowledge = status === "active";
    const canResolve = status === "active" || status === "acknowledged";
    const canReopen = status === "resolved" || status === "dismissed";

    return `
      <article
        class="rqda__alert rqda__alert--${escapeHTML(severity)}"
        data-alert-id="${escapeHTML(id)}"
      >
        <div class="rqda__alert-main">
          <div class="rqda__alert-heading">
            <span class="rqda__severity">${escapeHTML(severity.toUpperCase())}</span>
            <span class="rqda__status">${escapeHTML(STATUS_LABELS[status])}</span>
            <time datetime="${escapeHTML(alert.createdAt ?? "")}">
              ${escapeHTML(formatTimestamp(alert.createdAt))}
            </time>
          </div>

          <h3>${escapeHTML(alert.title ?? "Rules engine alert")}</h3>
          <p class="rqda__alert-message">${escapeHTML(alert.message ?? "")}</p>

          <div class="rqda__metadata">
            ${
              alert.ruleName
                ? `<span>Rule: ${escapeHTML(alert.ruleName)}</span>`
                : ""
            }
            ${
              alert.ruleId !== null && alert.ruleId !== undefined
                ? `<span>Rule ID: ${escapeHTML(alert.ruleId)}</span>`
                : ""
            }
            <span>Occurrences: ${escapeHTML(alert.occurrenceCount ?? 1)}</span>
          </div>
        </div>

        <div class="rqda__alert-actions">
          ${
            canAcknowledge
              ? `<button type="button" data-action="acknowledge" data-id="${escapeHTML(id)}">Acknowledge</button>`
              : ""
          }
          ${
            canResolve
              ? `<button type="button" data-action="resolve" data-id="${escapeHTML(id)}">Resolve</button>`
              : ""
          }
          ${
            canReopen
              ? `<button type="button" data-action="reopen" data-id="${escapeHTML(id)}">Reopen</button>`
              : ""
          }
          <button type="button" data-action="dismiss" data-id="${escapeHTML(id)}">Dismiss</button>
          <button type="button" data-action="remove" data-id="${escapeHTML(id)}">Remove</button>
        </div>
      </article>
    `;
  }

  handleInput(event) {
    const filter = event.target?.dataset?.filter;

    if (filter !== "search") {
      return;
    }

    this.filters.search = event.target.value;
    this.page = 0;
    this.render();
  }

  handleChange(event) {
    const filter = event.target?.dataset?.filter;

    if (!filter || !Object.hasOwn(this.filters, filter) || filter === "search") {
      return;
    }

    this.filters[filter] = event.target.value;
    this.page = 0;
    this.render();
  }

  handleClick(event) {
    const button = event.target?.closest?.("button[data-action]");

    if (!button || !this.container?.contains(button) || this.destroyed) {
      return;
    }

    const action = button.dataset.action;
    const id = button.dataset.id;

    try {
      switch (action) {
        case "refresh":
          this.alerts?.refresh?.();
          this.render();
          break;

        case "export":
          this.exportAlerts();
          break;

        case "acknowledge":
          this.perform("acknowledge", id);
          break;

        case "resolve":
          this.perform("resolve", id);
          break;

        case "dismiss":
          this.perform("dismiss", id);
          break;

        case "reopen":
          this.perform("reopen", id);
          break;

        case "remove":
          this.perform("remove", id);
          break;

        case "acknowledge-all":
          this.performBulk("acknowledgeAll");
          break;

        case "resolve-all":
          this.performBulk("resolveAll");
          break;

        case "clear-resolved":
          this.clearResolved();
          break;

        case "previous-page":
          this.page = Math.max(0, this.page - 1);
          this.render();
          break;

        case "next-page":
          this.page += 1;
          this.render();
          break;

        default:
          break;
      }
    } catch (error) {
      this.reportError(error, `action:${action}`);
    }
  }

  perform(action, id) {
    if (!id || !this.alerts) {
      return false;
    }

    const method = this.alerts[action];

    if (typeof method !== "function") {
      this.showMessage(`Action unavailable: ${action}`);
      return false;
    }

    const result = method.call(this.alerts, id);

    if (result === null || result === false) {
      this.showMessage("The alert could not be updated.");
      return false;
    }

    this.showMessage(`Alert ${action} completed.`);
    this.render();

    return true;
  }

  performBulk(methodName) {
    if (typeof this.alerts?.[methodName] !== "function") {
      this.showMessage("Bulk action is unavailable.");
      return false;
    }

    const results = this.alerts[methodName]({ activeOnly: true });
    const count = Array.isArray(results) ? results.length : 0;

    this.showMessage(`${count} alert${count === 1 ? "" : "s"} updated.`);
    this.render();

    return true;
  }

  clearResolved() {
    const records = this.getRecords().filter(
      (record) =>
        normalizeStatus(record.status) === "resolved" ||
        normalizeStatus(record.status) === "dismissed",
    );

    let removed = 0;

    for (const record of records) {
      if (this.alerts?.remove?.(record.id ?? record.alertId)) {
        removed += 1;
      }
    }

    this.showMessage(`${removed} resolved or dismissed alert${removed === 1 ? "" : "s"} removed.`);
    this.render();
  }

  exportAlerts() {
    if (typeof this.alerts?.exportJSON !== "function") {
      this.showMessage("JSON export is unavailable.");
      return false;
    }

    const data = this.alerts.exportJSON();

    if (typeof data !== "string") {
      this.showMessage("Export did not return JSON text.");
      return false;
    }

    if (typeof Blob === "undefined" || !this.document) {
      this.showMessage("Export is unavailable in this environment.");
      return false;
    }

    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement("a");

    link.href = url;
    link.download = `kano-run-alerts-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.style.display = "none";

    this.document.body.appendChild(link);
    link.click();
    link.remove();

    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);

    this.showMessage("Alert export started.");
    return true;
  }

  showMessage(message) {
    const element = this.container?.querySelector('[data-role="message"]');

    if (element) {
      element.textContent = String(message ?? "");
    }
  }

  reportError(error, context) {
    if (this.onError) {
      try {
        this.onError(error, context);
      } catch {
        // Keep rendering and user actions isolated from error-handler failures.
      }
    }
  }

  setFilters(filters = {}) {
    for (const key of Object.keys(this.filters)) {
      if (Object.hasOwn(filters, key)) {
        this.filters[key] = String(filters[key]);
      }
    }

    this.page = 0;
    return this.render();
  }

  refresh() {
    this.alerts?.refresh?.();
    return this.render();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
    }

    this.unsubscribe = null;

    if (this.container) {
      this.container.removeEventListener("click", this.boundClick);
      this.container.removeEventListener("input", this.boundInput);
      this.container.removeEventListener("change", this.boundChange);
      this.container.replaceChildren();
    }

    this.selectedIds.clear();
    this.destroyed = true;
    this.alerts = null;
    this.container = null;
    this.document = null;
    this.onError = null;
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineAlertsView;