const DEFAULTS = Object.freeze({
  containerId: "alert-rules-engine-alerts-rules",
  title: "Alert Rules",
  emptyMessage: "No alert rules configured.",
  pageSize: 10,
  maxSearchLength: 160,
});

const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const formatDate = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return "Never";

  try {
    return new Date(Number(value)).toLocaleString();
  } catch {
    return "Unknown";
  }
};

const formatNumber = (value) =>
  new Intl.NumberFormat().format(Number(value) || 0);

export class AlertQueueDashboardDiagnosticsRulesEngineAlertsRulesView {
  constructor(options = {}) {
    this.options = {
      ...DEFAULTS,
      ...options,
    };

    this.manager = options.manager
      ?? options.rules
      ?? options.rulesManager
      ?? null;

    this.container = options.container
      ?? this.findContainer(options.containerId ?? DEFAULTS.containerId);

    this.document = options.document
      ?? (typeof document !== "undefined" ? document : null);

    this.onEdit = typeof options.onEdit === "function"
      ? options.onEdit
      : null;

    this.onDelete = typeof options.onDelete === "function"
      ? options.onDelete
      : null;

    this.onToggle = typeof options.onToggle === "function"
      ? options.onToggle
      : null;

    this.onCreate = typeof options.onCreate === "function"
      ? options.onCreate
      : null;

    this.onError = typeof options.onError === "function"
      ? options.onError
      : null;

    this.state = {
      search: "",
      status: "all",
      severity: "all",
      sortBy: "updated",
      page: 1,
      pageSize: Math.max(
        1,
        Math.floor(Number(options.pageSize) || DEFAULTS.pageSize),
      ),
      selectedIds: new Set(),
      loading: false,
      error: null,
    };

    this.unsubscribe = null;
    this.bound = false;
    this.destroyed = false;
    this.handleClick = this.handleClick.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);

    if (options.autoSubscribe !== false) {
      this.connect();
    }
  }

  findContainer(id) {
    if (typeof document === "undefined") return null;

    return document.getElementById(id);
  }

  getRoot() {
    if (this.container) return this.container;

    this.container = this.findContainer(
      this.options.containerId ?? DEFAULTS.containerId,
    );

    return this.container;
  }

  reportError(error, operation = "render") {
    this.state.error = error instanceof Error
      ? error.message
      : String(error);

    if (this.onError) {
      try {
        this.onError(error, { operation });
      } catch {
        // A consumer error handler must not break the view.
      }
    }
  }

  connect() {
    if (this.destroyed || this.unsubscribe) return false;

    if (!this.manager || typeof this.manager.subscribe !== "function") {
      return false;
    }

    try {
      this.unsubscribe = this.manager.subscribe(() => {
        if (!this.destroyed) this.render();
      });

      return true;
    } catch (error) {
      this.reportError(error, "subscribe");
      return false;
    }
  }

  bind() {
    const root = this.getRoot();

    if (!root || this.bound) return Boolean(root);

    root.addEventListener("click", this.handleClick);
    root.addEventListener("input", this.handleInput);
    root.addEventListener("change", this.handleChange);
    root.addEventListener("submit", this.handleSubmit);

    this.bound = true;

    return true;
  }

  unbind() {
    const root = this.getRoot();

    if (!root || !this.bound) return;

    root.removeEventListener("click", this.handleClick);
    root.removeEventListener("input", this.handleInput);
    root.removeEventListener("change", this.handleChange);
    root.removeEventListener("submit", this.handleSubmit);

    this.bound = false;
  }

  getRules() {
    if (!this.manager) return [];

    try {
      if (typeof this.manager.getRules === "function") {
        return this.manager.getRules();
      }

      if (Array.isArray(this.manager.rules)) {
        return this.manager.rules;
      }

      if (this.manager.rules instanceof Map) {
        return [...this.manager.rules.values()];
      }

      return [];
    } catch (error) {
      this.reportError(error, "get-rules");
      return [];
    }
  }

  getFilteredRules() {
    const query = this.state.search.trim().toLowerCase();

    let rules = this.getRules().filter((rule) => {
      if (!rule || typeof rule !== "object") return false;

      if (this.state.status === "enabled" && rule.enabled !== true) {
        return false;
      }

      if (this.state.status === "disabled" && rule.enabled !== false) {
        return false;
      }

      if (
        this.state.severity !== "all" &&
        String(rule.severity ?? "warning").toLowerCase() !==
          this.state.severity
      ) {
        return false;
      }

      if (!query) return true;

      const searchable = [
        rule.name,
        rule.description,
        rule.eventType,
        rule.severity,
        ...(Array.isArray(rule.tags) ? rule.tags : []),
        ...(Array.isArray(rule.conditions)
          ? rule.conditions.map((condition) =>
              `${condition.field ?? ""} ${condition.operator ?? ""}`,
            )
          : []),
      ].join(" ").toLowerCase();

      return searchable.includes(query);
    });

    switch (this.state.sortBy) {
      case "name":
        rules.sort((a, b) =>
          String(a.name ?? "").localeCompare(String(b.name ?? "")),
        );
        break;

      case "matches":
        rules.sort(
          (a, b) => (Number(b.matchCount) || 0) -
            (Number(a.matchCount) || 0),
        );
        break;

      case "evaluations":
        rules.sort(
          (a, b) => (Number(b.evaluationCount) || 0) -
            (Number(a.evaluationCount) || 0),
        );
        break;

      case "severity": {
        const severityOrder = {
          critical: 0,
          error: 1,
          warning: 2,
          info: 3,
          success: 4,
          debug: 5,
        };

        rules.sort(
          (a, b) =>
            (severityOrder[a.severity] ?? 6) -
            (severityOrder[b.severity] ?? 6),
        );
        break;
      }

      default:
        rules.sort(
          (a, b) => (Number(b.updatedAt) || 0) -
            (Number(a.updatedAt) || 0),
        );
    }

    return rules;
  }

  getPageData(rules) {
    const pageSize = this.state.pageSize;
    const totalPages = Math.max(1, Math.ceil(rules.length / pageSize));

    this.state.page = Math.min(
      Math.max(1, this.state.page),
      totalPages,
    );

    const start = (this.state.page - 1) * pageSize;

    return {
      totalPages,
      start,
      end: Math.min(start + pageSize, rules.length),
      items: rules.slice(start, start + pageSize),
    };
  }

  render() {
    if (this.destroyed) return false;

    const root = this.getRoot();

    if (!root) return false;

    this.bind();

    try {
      const rules = this.getFilteredRules();
      const page = this.getPageData(rules);
      const statistics = this.getStatistics(rules);

      root.innerHTML = `
        <section class="aq-rules-view" aria-label="${escapeHTML(this.options.title)}">
          <header class="aq-rules-header">
            <div class="aq-rules-heading">
              <h2>${escapeHTML(this.options.title)}</h2>
              <p>Configure, filter, and manage alert rules.</p>
            </div>

            <div class="aq-rules-header-actions">
              <button type="button" data-action="refresh">
                Refresh
              </button>
              <button type="button" data-action="create" class="aq-rules-primary">
                Create rule
              </button>
            </div>
          </header>

          ${this.renderStatistics(statistics)}

          ${this.state.error ? `
            <div class="aq-rules-error" role="alert">
              ${escapeHTML(this.state.error)}
              <button type="button" data-action="clear-error" aria-label="Dismiss error">
                ×
              </button>
            </div>
          ` : ""}

          <form class="aq-rules-toolbar" data-role="filters">
            <label>
              <span>Search rules</span>
              <input
                type="search"
                name="search"
                maxlength="${DEFAULTS.maxSearchLength}"
                value="${escapeHTML(this.state.search)}"
                placeholder="Name, event, field, or tag"
              />
            </label>

            <label>
              <span>Status</span>
              <select name="status">
                ${this.option("all", "All statuses", this.state.status)}
                ${this.option("enabled", "Enabled", this.state.status)}
                ${this.option("disabled", "Disabled", this.state.status)}
              </select>
            </label>

            <label>
              <span>Severity</span>
              <select name="severity">
                ${this.option("all", "All severities", this.state.severity)}
                ${this.option("critical", "Critical", this.state.severity)}
                ${this.option("error", "Error", this.state.severity)}
                ${this.option("warning", "Warning", this.state.severity)}
                ${this.option("info", "Info", this.state.severity)}
                ${this.option("success", "Success", this.state.severity)}
                ${this.option("debug", "Debug", this.state.severity)}
              </select>
            </label>

            <label>
              <span>Sort by</span>
              <select name="sortBy">
                ${this.option("updated", "Recently updated", this.state.sortBy)}
                ${this.option("name", "Name", this.state.sortBy)}
                ${this.option("matches", "Most matches", this.state.sortBy)}
                ${this.option("evaluations", "Most evaluated", this.state.sortBy)}
                ${this.option("severity", "Severity", this.state.sortBy)}
              </select>
            </label>

            <button type="button" data-action="reset-filters">
              Reset
            </button>
          </form>

          <div class="aq-rules-bulk-actions">
            <label>
              <input
                type="checkbox"
                data-action="select-page"
                ${page.items.length > 0 && page.items.every(
                  (rule) => this.state.selectedIds.has(String(rule.id)),
                ) ? "checked" : ""}
              />
              Select current page
            </label>

            <span>${formatNumber(this.state.selectedIds.size)} selected</span>

            <button type="button" data-action="enable-selected"
              ${this.state.selectedIds.size ? "" : "disabled"}>
              Enable selected
            </button>

            <button type="button" data-action="disable-selected"
              ${this.state.selectedIds.size ? "" : "disabled"}>
              Disable selected
            </button>

            <button type="button" data-action="delete-selected"
              ${this.state.selectedIds.size ? "" : "disabled"}>
              Delete selected
            </button>

            <button type="button" data-action="export">
              Export JSON
            </button>
          </div>

          <div class="aq-rules-table-wrap">
            <table class="aq-rules-table">
              <thead>
                <tr>
                  <th scope="col">Select</th>
                  <th scope="col">Rule</th>
                  <th scope="col">Event</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Conditions</th>
                  <th scope="col">Evaluations</th>
                  <th scope="col">Matches</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${page.items.length
                  ? page.items.map((rule) => this.renderRule(rule)).join("")
                  : `<tr><td colspan="10" class="aq-rules-empty">
                      ${escapeHTML(this.options.emptyMessage)}
                    </td></tr>`
                }
              </tbody>
            </table>
          </div>

          <footer class="aq-rules-pagination">
            <span>
              ${rules.length
                ? `${formatNumber(page.start + 1)}–${formatNumber(page.end)} of ${formatNumber(rules.length)} rules`
                : "0 rules"}
            </span>

            <div>
              <button type="button" data-action="previous-page"
                ${this.state.page <= 1 ? "disabled" : ""}>
                Previous
              </button>

              <span>Page ${this.state.page} of ${page.totalPages}</span>

              <button type="button" data-action="next-page"
                ${this.state.page >= page.totalPages ? "disabled" : ""}>
                Next
              </button>
            </div>
          </footer>
        </section>
      `;

      return true;
    } catch (error) {
      this.reportError(error, "render");

      root.textContent = `Unable to render alert rules: ${this.state.error}`;

      return false;
    }
  }

  option(value, label, selected) {
    return `
      <option value="${escapeHTML(value)}"
        ${value === selected ? "selected" : ""}>
        ${escapeHTML(label)}
      </option>
    `;
  }

  renderStatistics(statistics) {
    const items = [
      ["Total rules", statistics.total],
      ["Enabled", statistics.enabled],
      ["Disabled", statistics.disabled],
      ["Evaluations", statistics.evaluations],
      ["Matches", statistics.matches],
    ];

    return `
      <div class="aq-rules-statistics" aria-label="Rule statistics">
        ${items.map(([label, value]) => `
          <article class="aq-rules-stat-card">
            <span>${escapeHTML(label)}</span>
            <strong>${formatNumber(value)}</strong>
          </article>
        `).join("")}
      </div>
    `;
  }

  getStatistics(filteredRules = this.getRules()) {
    return {
      total: filteredRules.length,
      enabled: filteredRules.filter((rule) => rule.enabled === true).length,
      disabled: filteredRules.filter((rule) => rule.enabled === false).length,
      evaluations: filteredRules.reduce(
        (sum, rule) => sum + (Number(rule.evaluationCount) || 0),
        0,
      ),
      matches: filteredRules.reduce(
        (sum, rule) => sum + (Number(rule.matchCount) || 0),
        0,
      ),
    };
  }

  renderRule(rule) {
    const id = String(rule.id ?? "");
    const enabled = rule.enabled !== false;
    const severity = String(rule.severity ?? "warning").toLowerCase();
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    const tags = Array.isArray(rule.tags) ? rule.tags : [];

    return `
      <tr data-rule-id="${escapeHTML(id)}">
        <td>
          <input
            type="checkbox"
            data-action="select-rule"
            value="${escapeHTML(id)}"
            aria-label="Select ${escapeHTML(rule.name)}"
            ${this.state.selectedIds.has(id) ? "checked" : ""}
          />
        </td>

        <td>
          <div class="aq-rules-name">${escapeHTML(rule.name)}</div>
          <div class="aq-rules-description">
            ${escapeHTML(rule.description || "No description")}
          </div>
          ${tags.length ? `
            <div class="aq-rules-tags">
              ${tags.map((tag) => `
                <span>${escapeHTML(tag)}</span>
              `).join("")}
            </div>
          ` : ""}
        </td>

        <td><code>${escapeHTML(rule.eventType || "*")}</code></td>

        <td>
          <span class="aq-rules-severity aq-severity-${escapeHTML(severity)}">
            ${escapeHTML(severity)}
          </span>
        </td>

        <td>
          ${conditions.length
            ? `${conditions.length} condition${conditions.length === 1 ? "" : "s"} · ${escapeHTML(rule.matchMode || "all")}`
            : "No conditions"}
        </td>

        <td>${formatNumber(rule.evaluationCount)}</td>
        <td>${formatNumber(rule.matchCount)}</td>
        <td>${escapeHTML(formatDate(rule.updatedAt))}</td>

        <td>
          <span class="aq-rules-status ${enabled ? "is-enabled" : "is-disabled"}">
            ${enabled ? "Enabled" : "Disabled"}
          </span>
        </td>

        <td>
          <div class="aq-rules-row-actions">
            <button type="button" data-action="toggle" data-id="${escapeHTML(id)}">
              ${enabled ? "Disable" : "Enable"}
            </button>

            <button type="button" data-action="edit" data-id="${escapeHTML(id)}">
              Edit
            </button>

            <button type="button" data-action="delete" data-id="${escapeHTML(id)}">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  getActionTarget(event) {
    const target = event.target;

    if (!target || typeof target.closest !== "function") return null;

    const button = target.closest("[data-action]");

    if (!button) return null;

    const root = this.getRoot();

    if (!root || !root.contains(button)) return null;

    return button;
  }

  async handleClick(event) {
    const target = this.getActionTarget(event);

    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    try {
      switch (action) {
        case "refresh":
          if (this.manager && typeof this.manager.refresh === "function") {
            this.manager.refresh();
          }

          this.state.error = null;
          this.render();
          break;

        case "create":
          await this.invokeCreate();
          break;

        case "edit":
          await this.invokeEdit(id);
          break;

        case "delete":
          await this.deleteRule(id);
          break;

        case "toggle":
          await this.toggleRule(id);
          break;

        case "previous-page":
          this.state.page = Math.max(1, this.state.page - 1);
          this.render();
          break;

        case "next-page":
          this.state.page += 1;
          this.render();
          break;

        case "reset-filters":
          this.state.search = "";
          this.state.status = "all";
          this.state.severity = "all";
          this.state.sortBy = "updated";
          this.state.page = 1;
          this.state.selectedIds.clear();
          this.render();
          break;

        case "enable-selected":
          await this.setSelectedEnabled(true);
          break;

        case "disable-selected":
          await this.setSelectedEnabled(false);
          break;

        case "delete-selected":
          await this.deleteSelected();
          break;

        case "export":
          await this.exportRules();
          break;

        case "clear-error":
          this.state.error = null;
          this.render();
          break;

        default:
          break;
      }
    } catch (error) {
      this.reportError(error, `action:${action}`);
      this.render();
    }
  }

  handleInput(event) {
    const target = event.target;

    if (!target || target.name !== "search") return;

    this.state.search = String(target.value ?? "")
      .slice(0, DEFAULTS.maxSearchLength);

    this.state.page = 1;

    const root = this.getRoot();
    if (!root) return;

    const cursorStart = target.selectionStart;

    this.render();

    const input = root.querySelector('input[name="search"]');

    if (input) {
      input.focus();

      if (typeof cursorStart === "number") {
        try {
          input.setSelectionRange(cursorStart, cursorStart);
        } catch {
          // Selection APIs are not available for every input type.
        }
      }
    }
  }

  handleChange(event) {
    const target = event.target;

    if (!target) return;

    if (target.name === "status") {
      this.state.status = target.value;
      this.state.page = 1;
      this.render();
      return;
    }

    if (target.name === "severity") {
      this.state.severity = target.value;
      this.state.page = 1;
      this.render();
      return;
    }

    if (target.name === "sortBy") {
      this.state.sortBy = target.value;
      this.state.page = 1;
      this.render();
      return;
    }

    if (target.dataset.action === "select-rule") {
      const id = String(target.value);

      if (target.checked) {
        this.state.selectedIds.add(id);
      } else {
        this.state.selectedIds.delete(id);
      }

      this.render();
      return;
    }

    if (target.dataset.action === "select-page") {
      const visibleRules = this.getPageData(this.getFilteredRules()).items;

      for (const rule of visibleRules) {
        const id = String(rule.id);

        if (target.checked) {
          this.state.selectedIds.add(id);
        } else {
          this.state.selectedIds.delete(id);
        }
      }

      this.render();
    }
  }

  async handleSubmit(event) {
    const form = event.target;

    if (!form || form.dataset.role !== "filters") return;

    event.preventDefault();

    const formData = new FormData(form);

    this.state.search = String(formData.get("search") ?? "")
      .slice(0, DEFAULTS.maxSearchLength);

    this.state.status = String(formData.get("status") ?? "all");
    this.state.severity = String(formData.get("severity") ?? "all");
    this.state.sortBy = String(formData.get("sortBy") ?? "updated");
    this.state.page = 1;

    this.render();
  }

  async invokeCreate() {
    if (this.onCreate) {
      await this.onCreate();
      return;
    }

    this.emitCustomEvent("alert-rules:create", {});
  }

  async invokeEdit(id) {
    if (!id) return;

    const rule = this.getRule(id);

    if (!rule) {
      throw new Error(`Rule not found: ${id}`);
    }

    if (this.onEdit) {
      await this.onEdit(rule);
      return;
    }

    this.emitCustomEvent("alert-rules:edit", { rule });
  }

  getRule(id) {
    if (this.manager && typeof this.manager.getRule === "function") {
      return this.manager.getRule(id);
    }

    return this.getRules().find(
      (rule) => String(rule.id) === String(id),
    ) ?? null;
  }

  async deleteRule(id) {
    if (!id) return false;

    const rule = this.getRule(id);

    if (!rule) return false;

    if (this.onDelete) {
      await this.onDelete(rule);
    } else {
      this.emitCustomEvent("alert-rules:delete", { rule });
    }

    this.state.selectedIds.delete(String(id));
    this.render();

    return true;
  }

  async toggleRule(id) {
    const rule = this.getRule(id);

    if (!rule) return false;

    if (this.onToggle) {
      await this.onToggle(rule, !rule.enabled);
    } else {
      const method = rule.enabled === false
        ? "enableRule"
        : "disableRule";

      if (!this.manager || typeof this.manager[method] !== "function") {
        this.emitCustomEvent("alert-rules:toggle", {
          rule,
          enabled: rule.enabled === false,
        });
        return true;
      }

      this.manager[method](id);
    }

    this.render();

    return true;
  }

  async setSelectedEnabled(enabled) {
    const ids = [...this.state.selectedIds];

    for (const id of ids) {
      const rule = this.getRule(id);

      if (!rule || rule.enabled === enabled) continue;

      if (this.onToggle) {
        await this.onToggle(rule, enabled);
      } else if (this.manager) {
        const method = enabled ? "enableRule" : "disableRule";

        if (typeof this.manager[method] === "function") {
          this.manager[method](id);
        } else {
          this.emitCustomEvent("alert-rules:toggle", { rule, enabled });
        }
      }
    }

    this.render();
  }

  async deleteSelected() {
    const ids = [...this.state.selectedIds];

    for (const id of ids) {
      const rule = this.getRule(id);

      if (!rule) continue;

      if (this.onDelete) {
        await this.onDelete(rule);
      } else {
        this.emitCustomEvent("alert-rules:delete", { rule });
      }
    }

    this.state.selectedIds.clear();
    this.render();
  }

  async exportRules() {
    const rules = this.getRules();
    const payload = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      rules,
    }, null, 2);

    this.emitCustomEvent("alert-rules:export", {
      rules,
      json: payload,
    });

    if (
      !this.document ||
      typeof Blob === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return payload;
    }

    let url;

    try {
      const blob = new Blob([payload], {
        type: "application/json;charset=utf-8",
      });

      url = URL.createObjectURL(blob);

      const link = this.document.createElement("a");
      link.href = url;
      link.download = `kano-run-alert-rules-${Date.now()}.json`;
      link.hidden = true;

      this.document.body.appendChild(link);
      link.click();
      link.remove();

      return payload;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  emitCustomEvent(name, detail) {
    const root = this.getRoot();

    if (!root || typeof CustomEvent === "undefined") return false;

    root.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      detail,
    }));

    return true;
  }

  setManager(manager) {
    if (this.destroyed) return false;

    if (typeof this.unsubscribe === "function") {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.manager = manager ?? null;

    this.connect();
    this.render();

    return true;
  }

  setContainer(container) {
    if (this.destroyed) return false;

    this.unbind();

    this.container = typeof container === "string"
      ? this.findContainer(container)
      : container;

    this.bind();
    this.render();

    return Boolean(this.container);
  }

  setFilters(filters = {}) {
    if (typeof filters.search === "string") {
      this.state.search = filters.search.slice(
        0,
        DEFAULTS.maxSearchLength,
      );
    }

    if (["all", "enabled", "disabled"].includes(filters.status)) {
      this.state.status = filters.status;
    }

    if ([
      "all",
      "critical",
      "error",
      "warning",
      "info",
      "success",
      "debug",
    ].includes(filters.severity)) {
      this.state.severity = filters.severity;
    }

    if ([
      "updated",
      "name",
      "matches",
      "evaluations",
      "severity",
    ].includes(filters.sortBy)) {
      this.state.sortBy = filters.sortBy;
    }

    this.state.page = 1;

    return this.render();
  }

  clearSelection() {
    this.state.selectedIds.clear();
    this.render();

    return true;
  }

  getState() {
    return {
      search: this.state.search,
      status: this.state.status,
      severity: this.state.severity,
      sortBy: this.state.sortBy,
      page: this.state.page,
      pageSize: this.state.pageSize,
      selectedIds: [...this.state.selectedIds],
      loading: this.state.loading,
      error: this.state.error,
    };
  }

  destroy() {
    if (this.destroyed) return;

    this.unbind();

    if (typeof this.unsubscribe === "function") {
      try {
        this.unsubscribe();
      } catch {
        // Continue cleanup.
      }
    }

    this.unsubscribe = null;
    this.destroyed = true;
    this.container = null;
    this.manager = null;
    this.state.selectedIds.clear();
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineAlertsRulesView;