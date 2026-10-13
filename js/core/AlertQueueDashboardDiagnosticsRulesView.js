export class AlertQueueDashboardDiagnosticsRulesView {
  constructor({
    root = null,
    rules = null,
    document: doc = globalThis.document ?? null,
    autoMount = true,
    pageSize = 20,
    onError = null,
  } = {}) {
    this.root = root;
    this.rules = rules;
    this.document = doc;
    this.pageSize = Math.max(5, Number(pageSize) || 20);
    this.onError = onError;

    this.state = {
      search: "",
      enabledFilter: "all",
      eventFilter: "all",
      page: 0,
      selectedRuleId: null,
      showForm: false,
      editingRuleId: null,
      message: "",
      messageType: "info",
    };

    this.unsubscribeRules = null;
    this.destroyed = false;
    this.boundHandlers = [];

    if (autoMount) {
      this.mount();
    }
  }

  reportError(error, operation) {
    try {
      this.onError?.({ error, operation });
    } catch {
      // UI error handlers must not interrupt rendering.
    }
  }

  escape(value) {
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

  mount() {
    if (this.destroyed || !this.root || !this.document) {
      return false;
    }

    this.injectStyles();
    this.bindEvents();

    if (this.rules?.subscribe) {
      this.unsubscribeRules = this.rules.subscribe((event) => {
        this.handleRulesEvent(event);
      });
    }

    this.render();
    return true;
  }

  injectStyles() {
    if (this.document.getElementById("diagnostic-rules-view-styles")) {
      return;
    }

    const style = this.document.createElement("style");
    style.id = "diagnostic-rules-view-styles";
    style.textContent = `
      .drv-root {
        color: #e5e7eb;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        width: 100%;
      }
      .drv-root * { box-sizing: border-box; }
      .drv-header, .drv-toolbar, .drv-card-header, .drv-actions,
      .drv-pagination, .drv-stats {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .drv-header, .drv-card-header {
        justify-content: space-between;
      }
      .drv-title { margin: 0; font-size: 1.35rem; font-weight: 750; }
      .drv-subtitle { color: #94a3b8; font-size: .9rem; margin: 5px 0 0; }
      .drv-stats { margin: 18px 0; }
      .drv-stat {
        flex: 1 1 130px;
        min-width: 0;
        padding: 14px;
        background: #111827;
        border: 1px solid #273449;
        border-radius: 12px;
      }
      .drv-stat-label { color: #94a3b8; font-size: .8rem; }
      .drv-stat-value { font-size: 1.45rem; font-weight: 750; margin-top: 5px; }
      .drv-toolbar { margin: 16px 0; }
      .drv-input, .drv-select, .drv-textarea {
        background: #0b1220;
        color: #e5e7eb;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 9px 11px;
        font: inherit;
        min-width: 0;
      }
      .drv-search { flex: 1 1 220px; }
      .drv-select { flex: 0 1 180px; }
      .drv-button {
        cursor: pointer;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 9px 12px;
        background: #172033;
        color: #e5e7eb;
        font: inherit;
        font-size: .88rem;
      }
      .drv-button:hover { filter: brightness(1.15); }
      .drv-button-primary { background: #0369a1; border-color: #0284c7; }
      .drv-button-danger { background: #7f1d1d; border-color: #b91c1c; }
      .drv-button:disabled { opacity: .45; cursor: not-allowed; }
      .drv-list { display: grid; gap: 10px; }
      .drv-card {
        background: #111827;
        border: 1px solid #273449;
        border-radius: 12px;
        padding: 15px;
        min-width: 0;
      }
      .drv-card-selected { border-color: #38bdf8; }
      .drv-rule-name { font-size: 1rem; font-weight: 700; overflow-wrap: anywhere; }
      .drv-description { color: #94a3b8; font-size: .87rem; margin-top: 6px; overflow-wrap: anywhere; }
      .drv-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
      .drv-badge {
        display: inline-flex;
        align-items: center;
        border: 1px solid #334155;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: .73rem;
        text-transform: uppercase;
        letter-spacing: .03em;
      }
      .drv-severity-critical, .drv-severity-error { color: #fca5a5; border-color: #7f1d1d; }
      .drv-severity-warning { color: #fcd34d; border-color: #854d0e; }
      .drv-severity-info { color: #7dd3fc; border-color: #075985; }
      .drv-enabled { color: #86efac; border-color: #166534; }
      .drv-disabled { color: #cbd5e1; border-color: #475569; }
      .drv-card-header { align-items: flex-start; }
      .drv-card-body { margin-top: 12px; }
      .drv-condition {
        padding: 8px 10px;
        background: #0b1220;
        border: 1px solid #253349;
        border-radius: 7px;
        margin-top: 7px;
        font-size: .82rem;
        overflow-wrap: anywhere;
      }
      .drv-empty {
        padding: 30px 15px;
        text-align: center;
        border: 1px dashed #334155;
        border-radius: 12px;
        color: #94a3b8;
      }
      .drv-pagination { justify-content: space-between; margin-top: 16px; }
      .drv-form { display: grid; gap: 13px; margin-top: 16px; }
      .drv-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .drv-field { display: grid; gap: 6px; min-width: 0; }
      .drv-field label { color: #cbd5e1; font-size: .83rem; }
      .drv-field .drv-input, .drv-field .drv-select, .drv-field .drv-textarea { width: 100%; }
      .drv-textarea { min-height: 75px; resize: vertical; }
      .drv-checkbox { display: inline-flex; gap: 8px; align-items: center; }
      .drv-message { margin: 12px 0; padding: 10px 12px; border-radius: 8px; font-size: .88rem; }
      .drv-message-info { background: #172554; color: #bfdbfe; }
      .drv-message-success { background: #052e16; color: #bbf7d0; }
      .drv-message-error { background: #450a0a; color: #fecaca; }
      .drv-history { margin-top: 24px; }
      .drv-history-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 10px 0; border-bottom: 1px solid #273449; }
      .drv-muted { color: #94a3b8; font-size: .82rem; }
      @media (max-width: 640px) {
        .drv-form-grid { grid-template-columns: 1fr; }
        .drv-header { align-items: flex-start; }
        .drv-card-header { flex-direction: column; }
        .drv-card-header .drv-actions { width: 100%; }
      }
    `;

    this.document.head?.appendChild(style);
  }

  bindEvents() {
    if (!this.root || this.root.dataset.drvBound === "true") {
      return;
    }

    this.root.dataset.drvBound = "true";

    const handleClick = (event) => {
      const target = event.target.closest("[data-drv-action]");
      if (!target || !this.root.contains(target)) return;

      const action = target.dataset.drvAction;
      const id = target.dataset.ruleId;

      try {
        this.handleAction(action, id, target);
      } catch (error) {
        this.reportError(error, `action:${action}`);
        this.setMessage(error?.message ?? "Action failed.", "error");
        this.render();
      }
    };

    const handleInput = (event) => {
      const target = event.target;

      if (target.matches("[data-drv-search]")) {
        this.state.search = target.value;
        this.state.page = 0;
        this.renderPreservingFocus(target, "data-drv-search");
      }
    };

    const handleChange = (event) => {
      const target = event.target;

      if (target.matches("[data-drv-enabled-filter]")) {
        this.state.enabledFilter = target.value;
        this.state.page = 0;
        this.render();
      }

      if (target.matches("[data-drv-event-filter]")) {
        this.state.eventFilter = target.value;
        this.state.page = 0;
        this.render();
      }
    };

    this.root.addEventListener("click", handleClick);
    this.root.addEventListener("input", handleInput);
    this.root.addEventListener("change", handleChange);

    this.boundHandlers.push(
      ["click", handleClick],
      ["input", handleInput],
      ["change", handleChange]
    );
  }

  renderPreservingFocus(previous, selector) {
    const start = previous.selectionStart;
    const end = previous.selectionEnd;
    const value = previous.value;

    this.render();

    const replacement = this.root.querySelector(`[${selector}]`);

    if (replacement) {
      replacement.focus();

      try {
        replacement.setSelectionRange(start, end);
      } catch {
        // Selection ranges are unavailable on some input types.
      }

      replacement.value = value;
    }
  }

  handleRulesEvent(event) {
    if (this.destroyed) return;

    if (event?.type === "rule-removed") {
      const removedId = event.details?.rule?.id;

      if (removedId && this.state.selectedRuleId === removedId) {
        this.state.selectedRuleId = null;
      }

      if (removedId && this.state.editingRuleId === removedId) {
        this.state.editingRuleId = null;
        this.state.showForm = false;
      }
    }

    this.render();
  }

  handleAction(action, id, target) {
    switch (action) {
      case "create":
        this.openForm();
        break;

      case "cancel-form":
        this.closeForm();
        break;

      case "save-rule":
        this.saveForm();
        break;

      case "edit":
        this.openForm(id);
        break;

      case "delete":
        this.deleteRule(id);
        break;

      case "toggle":
        this.toggleRule(id);
        break;

      case "select":
        this.state.selectedRuleId =
          this.state.selectedRuleId === id ? null : id;
        this.render();
        break;

      case "previous-page":
        this.state.page = Math.max(0, this.state.page - 1);
        this.render();
        break;

      case "next-page":
        this.state.page += 1;
        this.render();
        break;

      case "export":
        this.exportRules();
        break;

      case "import":
        this.importRules();
        break;

      case "clear-message":
        this.state.message = "";
        this.render();
        break;

      case "clear-history":
        this.clearHistory();
        break;

      case "export-history":
        this.exportHistory();
        break;

      case "add-condition":
        this.addConditionRow();
        break;

      case "remove-condition":
        target.closest("[data-drv-condition-row]")?.remove();
        break;

      default:
        break;
    }
  }

  setMessage(message, type = "info") {
    this.state.message = String(message ?? "");
    this.state.messageType = type;
  }

  openForm(id = null) {
    this.state.showForm = true;
    this.state.editingRuleId = id ? String(id) : null;
    this.setMessage("");

    this.render();

    const field = this.root?.querySelector("[data-drv-form-name]");
    field?.focus();
  }

  closeForm() {
    this.state.showForm = false;
    this.state.editingRuleId = null;
    this.render();
  }

  addConditionRow(condition = {}) {
    const container = this.root?.querySelector("[data-drv-conditions]");
    if (!container) return;

    container.insertAdjacentHTML(
      "beforeend",
      this.renderCondition(condition)
    );
  }

  renderCondition(condition = {}) {
    const operators = [
      ["equals", "Equals"],
      ["not_equals", "Does not equal"],
      ["contains", "Contains"],
      ["not_contains", "Does not contain"],
      ["starts_with", "Starts with"],
      ["ends_with", "Ends with"],
      ["gt", "Greater than"],
      ["gte", "Greater than or equal"],
      ["lt", "Less than"],
      ["lte", "Less than or equal"],
      ["exists", "Exists"],
      ["not_exists", "Does not exist"],
      ["is_true", "Is true"],
      ["is_false", "Is false"],
      ["matches", "Matches regular expression"],
    ];

    const selectedOperator = String(condition.operator ?? "equals");

    return `
      <div class="drv-condition" data-drv-condition-row>
        <div class="drv-form-grid">
          <div class="drv-field">
            <label>Event field path</label>
            <input class="drv-input" name="conditionField" placeholder="alert.severity" value="${this.escape(condition.field ?? "")}">
          </div>
          <div class="drv-field">
            <label>Operator</label>
            <select class="drv-select" name="conditionOperator">
              ${operators
                .map(
                  ([value, label]) => `
                    <option value="${value}" ${value === selectedOperator ? "selected" : ""}>${label}</option>
                  `
                )
                .join("")}
            </select>
          </div>
          <div class="drv-field">
            <label>Expected value</label>
            <input class="drv-input" name="conditionValue" value="${this.escape(
              typeof condition.value === "object"
                ? JSON.stringify(condition.value)
                : condition.value ?? ""
            )}">
          </div>
          <div class="drv-field">
            <label>Comparison</label>
            <label class="drv-checkbox">
              <input type="checkbox" name="conditionCaseSensitive" ${condition.caseSensitive ? "checked" : ""}>
              Case-sensitive
            </label>
          </div>
        </div>
        <div class="drv-actions" style="margin-top:8px">
          <button type="button" class="drv-button drv-button-danger" data-drv-action="remove-condition">Remove condition</button>
        </div>
      </div>
    `;
  }

  collectConditions() {
    const rows = [
      ...(this.root?.querySelectorAll("[data-drv-condition-row]") ?? []),
    ];

    const conditions = [];

    for (const row of rows) {
      const field = row.querySelector('[name="conditionField"]')?.value.trim();
      const operator =
        row.querySelector('[name="conditionOperator"]')?.value ?? "equals";
      const rawValue =
        row.querySelector('[name="conditionValue"]')?.value ?? "";
      const caseSensitive = Boolean(
        row.querySelector('[name="conditionCaseSensitive"]')?.checked
      );

      if (!field) continue;

      let value = rawValue;

      if (["gt", "gte", "lt", "lte"].includes(operator)) {
        value = Number(rawValue);

        if (!Number.isFinite(value)) {
          throw new Error(`Expected a valid number for "${field}".`);
        }
      } else if (["exists", "not_exists", "is_true", "is_false"].includes(operator)) {
        value = null;
      } else if (["in", "not_in"].includes(operator)) {
        try {
          value = JSON.parse(rawValue);
        } catch {
          throw new Error(`Expected a JSON array for "${field}".`);
        }

        if (!Array.isArray(value)) {
          throw new Error(`The value for "${field}" must be an array.`);
        }
      }

      conditions.push({
        field,
        operator,
        value,
        caseSensitive,
      });
    }

    return conditions;
  }

  saveForm() {
    if (!this.rules) {
      this.setMessage("The diagnostic rules engine is unavailable.", "error");
      this.render();
      return false;
    }

    const name =
      this.root.querySelector("[data-drv-form-name]")?.value.trim() ?? "";

    const description =
      this.root.querySelector("[data-drv-form-description]")?.value.trim() ?? "";

    const message =
      this.root.querySelector("[data-drv-form-message]")?.value.trim() ?? "";

    const severity =
      this.root.querySelector("[data-drv-form-severity]")?.value ?? "warning";

    const action =
      this.root.querySelector("[data-drv-form-action]")?.value ?? "alert";

    const eventTypesRaw =
      this.root.querySelector("[data-drv-form-events]")?.value ?? "*";

    const conditionMode =
      this.root.querySelector("[data-drv-form-mode]")?.value ?? "all";

    const cooldownMs = Number(
      this.root.querySelector("[data-drv-form-cooldown]")?.value ?? 0
    );

    const enabled = Boolean(
      this.root.querySelector("[data-drv-form-enabled]")?.checked
    );

    const stopProcessing = Boolean(
      this.root.querySelector("[data-drv-form-stop]")?.checked
    );

    try {
      if (!name) {
        throw new Error("Enter a rule name.");
      }

      if (!message) {
        throw new Error("Enter the message to use when the rule matches.");
      }

      if (!Number.isFinite(cooldownMs) || cooldownMs < 0) {
        throw new Error("Cooldown must be a non-negative number.");
      }

      const eventTypes = eventTypesRaw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      if (eventTypes.length === 0) {
        throw new Error("Enter at least one event type or *.");
      }

      const rule = {
        name,
        description,
        message,
        severity,
        action,
        eventTypes,
        conditionMode,
        cooldownMs,
        enabled,
        stopProcessing,
        conditions: this.collectConditions(),
      };

      if (this.state.editingRuleId) {
        this.rules.updateRule(this.state.editingRuleId, rule);
        this.setMessage("Diagnostic rule updated.", "success");
      } else {
        this.rules.addRule(rule);
        this.setMessage("Diagnostic rule created.", "success");
      }

      this.state.showForm = false;
      this.state.editingRuleId = null;
      this.state.page = 0;
      this.render();

      return true;
    } catch (error) {
      this.reportError(error, "save-form");
      this.setMessage(error?.message ?? "Could not save the rule.", "error");
      this.render();
      return false;
    }
  }

  deleteRule(id) {
    const rule = this.rules?.getRule?.(id);
    if (!rule) return false;

    const confirmed =
      typeof globalThis.confirm !== "function" ||
      globalThis.confirm(`Delete diagnostic rule "${rule.name}"?`);

    if (!confirmed) return false;

    const deleted = this.rules.removeRule(id);

    if (deleted) {
      this.setMessage("Diagnostic rule deleted.", "success");
      this.render();
    }

    return deleted;
  }

  toggleRule(id) {
    const rule = this.rules?.getRule?.(id);
    if (!rule) return false;

    const updated = this.rules.enableRule(id, !rule.enabled);

    if (updated) {
      this.setMessage(
        updated.enabled ? "Rule enabled." : "Rule disabled.",
        "success"
      );
      this.render();
    }

    return Boolean(updated);
  }

  exportRules() {
    const content = this.rules?.exportRules?.();
    if (!content) return false;

    return this.download(
      content,
      `diagnostic-rules-${Date.now()}.json`,
      "application/json;charset=utf-8"
    );
  }

  importRules() {
    const input = this.document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";

    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const result = this.rules.importRules(text);

          this.setMessage(
            `Imported ${result.imported} rule(s). ${
              result.errors.length
                ? result.errors.join(" ")
                : ""
            }`,
            result.errors.length ? "error" : "success"
          );
        } catch (error) {
          this.reportError(error, "import-rules");
          this.setMessage(error?.message ?? "Import failed.", "error");
        }

        this.render();
      },
      { once: true }
    );

    input.click();
  }

  clearHistory() {
    const removed = this.rules?.clearHistory?.() ?? 0;
    this.setMessage(`Cleared ${removed} rule match record(s).`, "success");
    this.render();
  }

  exportHistory() {
    const history = this.rules?.getHistory?.() ?? [];

    return this.download(
      JSON.stringify(
        {
          exportedAt: Date.now(),
          count: history.length,
          history,
        },
        null,
        2
      ),
      `diagnostic-rule-history-${Date.now()}.json`,
      "application/json;charset=utf-8"
    );
  }

  download(content, filename, type) {
    if (
      !this.document ||
      typeof URL === "undefined" ||
      typeof Blob === "undefined"
    ) {
      return false;
    }

    let url;

    try {
      url = URL.createObjectURL(new Blob([content], { type }));

      const anchor = this.document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";

      this.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      return true;
    } catch (error) {
      this.reportError(error, "download");
      this.setMessage("Could not download the export.", "error");
      return false;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  getFilteredRules() {
    const enabled =
      this.state.enabledFilter === "all"
        ? null
        : this.state.enabledFilter === "enabled";

    let result = this.rules?.getRules?.({
      enabled,
      search: this.state.search,
    }) ?? [];

    if (this.state.eventFilter !== "all") {
      result = result.filter(
        (rule) =>
          rule.eventTypes.includes("*") ||
          rule.eventTypes.includes(this.state.eventFilter)
      );
    }

    return result;
  }

  renderStats() {
    const summary = this.rules?.getSummary?.() ?? {
      totalRules: 0,
      enabledRules: 0,
      disabledRules: 0,
      totalMatches: 0,
    };

    const items = [
      ["Total rules", summary.totalRules],
      ["Enabled", summary.enabledRules],
      ["Disabled", summary.disabledRules],
      ["Match history", summary.totalMatches],
    ];

    return `
      <div class="drv-stats">
        ${items
          .map(
            ([label, value]) => `
              <div class="drv-stat">
                <div class="drv-stat-label">${this.escape(label)}</div>
                <div class="drv-stat-value">${this.escape(value)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  renderRule(rule) {
    const selected = this.state.selectedRuleId === rule.id;

    return `
      <article class="drv-card ${selected ? "drv-card-selected" : ""}">
        <div class="drv-card-header">
          <div>
            <div class="drv-rule-name">${this.escape(rule.name)}</div>
            <div class="drv-description">${this.escape(
              rule.description || "No description provided."
            )}</div>
            <div class="drv-badges">
              <span class="drv-badge drv-severity-${this.escape(rule.severity)}">${this.escape(rule.severity)}</span>
              <span class="drv-badge ${rule.enabled ? "drv-enabled" : "drv-disabled"}">${rule.enabled ? "Enabled" : "Disabled"}</span>
              <span class="drv-badge">${this.escape(rule.action)}</span>
              <span class="drv-badge">${rule.conditions.length} condition(s)</span>
            </div>
          </div>
          <div class="drv-actions">
            <button class="drv-button" data-drv-action="select" data-rule-id="${this.escape(rule.id)}">${selected ? "Hide details" : "Details"}</button>
            <button class="drv-button" data-drv-action="toggle" data-rule-id="${this.escape(rule.id)}">${rule.enabled ? "Disable" : "Enable"}</button>
            <button class="drv-button" data-drv-action="edit" data-rule-id="${this.escape(rule.id)}">Edit</button>
            <button class="drv-button drv-button-danger" data-drv-action="delete" data-rule-id="${this.escape(rule.id)}">Delete</button>
          </div>
        </div>
        ${
          selected
            ? `
              <div class="drv-card-body">
                <div class="drv-muted">Rule ID: ${this.escape(rule.id)}</div>
                <p>${this.escape(rule.message)}</p>
                <div class="drv-muted">Event types: ${this.escape(rule.eventTypes.join(", "))}</div>
                <div class="drv-muted">Condition mode: ${this.escape(rule.conditionMode)}</div>
                <div class="drv-muted">Cooldown: ${this.escape(rule.cooldownMs)} ms</div>
                ${
                  rule.conditions.length
                    ? rule.conditions
                        .map(
                          (condition) => `
                            <div class="drv-condition">
                              <strong>${this.escape(condition.field)}</strong>
                              ${this.escape(condition.operator)}
                              <code>${this.escape(
                                typeof condition.value === "object"
                                  ? JSON.stringify(condition.value)
                                  : condition.value
                              )}</code>
                            </div>
                          `
                        )
                        .join("")
                    : `<div class="drv-condition">No conditions: every matching event type triggers this rule.</div>`
                }
              </div>
            `
            : ""
        }
      </article>
    `;
  }

  renderForm() {
    if (!this.state.showForm) return "";

    const existing = this.state.editingRuleId
      ? this.rules?.getRule?.(this.state.editingRuleId)
      : null;

    const rule = existing ?? {
      name: "",
      description: "",
      message: "",
      severity: "warning",
      action: "alert",
      eventTypes: ["*"],
      conditionMode: "all",
      cooldownMs: 0,
      enabled: true,
      stopProcessing: false,
      conditions: [],
    };

    const severityOptions = ["info", "warning", "error", "critical"];
    const actionOptions = ["alert", "log", "callback"];

    return `
      <section class="drv-card">
        <h3>${existing ? "Edit diagnostic rule" : "Create diagnostic rule"}</h3>
        <form class="drv-form" data-drv-form>
          <div class="drv-form-grid">
            <div class="drv-field">
              <label for="drv-name">Rule name</label>
              <input id="drv-name" class="drv-input" data-drv-form-name maxlength="160" required value="${this.escape(rule.name)}">
            </div>
            <div class="drv-field">
              <label for="drv-severity">Severity</label>
              <select id="drv-severity" class="drv-select" data-drv-form-severity>
                ${severityOptions
                  .map(
                    (value) => `
                      <option value="${value}" ${rule.severity === value ? "selected" : ""}>${value}</option>
                    `
                  )
                  .join("")}
              </select>
            </div>
            <div class="drv-field">
              <label for="drv-description">Description</label>
              <input id="drv-description" class="drv-input" data-drv-form-description maxlength="1000" value="${this.escape(rule.description)}">
            </div>
            <div class="drv-field">
              <label for="drv-action">Action</label>
              <select id="drv-action" class="drv-select" data-drv-form-action>
                ${actionOptions
                  .map(
                    (value) => `
                      <option value="${value}" ${rule.action === value ? "selected" : ""}>${value}</option>
                    `
                  )
                  .join("")}
              </select>
            </div>
            <div class="drv-field">
              <label for="drv-events">Event types</label>
              <input id="drv-events" class="drv-input" data-drv-form-events value="${this.escape(rule.eventTypes.join(", "))}" placeholder="*, alert.created">
            </div>
            <div class="drv-field">
              <label for="drv-mode">Condition mode</label>
              <select id="drv-mode" class="drv-select" data-drv-form-mode>
                <option value="all" ${rule.conditionMode === "all" ? "selected" : ""}>All conditions must match</option>
                <option value="any" ${rule.conditionMode === "any" ? "selected" : ""}>Any condition may match</option>
              </select>
            </div>
            <div class="drv-field">
              <label for="drv-cooldown">Cooldown (milliseconds)</label>
              <input id="drv-cooldown" type="number" min="0" step="1000" class="drv-input" data-drv-form-cooldown value="${this.escape(rule.cooldownMs)}">
            </div>
            <div class="drv-field">
              <label class="drv-checkbox">
                <input type="checkbox" data-drv-form-enabled ${rule.enabled ? "checked" : ""}>
                Rule enabled
              </label>
              <label class="drv-checkbox">
                <input type="checkbox" data-drv-form-stop ${rule.stopProcessing ? "checked" : ""}>
                Stop after this rule matches
              </label>
            </div>
          </div>

          <div class="drv-field">
            <label for="drv-message">Match message</label>
            <textarea id="drv-message" class="drv-textarea" data-drv-form-message maxlength="2000" required>${this.escape(rule.message)}</textarea>
          </div>

          <div>
            <div class="drv-card-header">
              <strong>Conditions</strong>
              <button type="button" class="drv-button" data-drv-action="add-condition">Add condition</button>
            </div>
            <div data-drv-conditions>
              ${rule.conditions.map((condition) => this.renderCondition(condition)).join("")}
            </div>
          </div>

          <div class="drv-actions">
            <button type="button" class="drv-button drv-button-primary" data-drv-action="save-rule">Save rule</button>
            <button type="button" class="drv-button" data-drv-action="cancel-form">Cancel</button>
          </div>
        </form>
      </section>
    `;
  }

  renderHistory() {
    const history = this.rules?.getHistory?.({ limit: 10 }) ?? [];

    return `
      <section class="drv-history">
        <div class="drv-card-header">
          <div>
            <h3 style="margin:0">Recent rule matches</h3>
            <div class="drv-muted">Latest 10 recorded matches</div>
          </div>
          <div class="drv-actions">
            <button class="drv-button" data-drv-action="export-history">Export history</button>
            <button class="drv-button" data-drv-action="clear-history">Clear history</button>
          </div>
        </div>
        ${
          history.length
            ? history
                .map(
                  (record) => `
                    <div class="drv-history-row">
                      <div>
                        <strong>${this.escape(record.ruleName)}</strong>
                        <div class="drv-muted">${this.escape(record.eventType)} · ${this.escape(record.action)}</div>
                      </div>
                      <div class="drv-muted">${this.escape(
                        new Date(record.timestamp).toLocaleString()
                      )}</div>
                    </div>
                  `
                )
                .join("")
            : `<div class="drv-empty">No rule matches recorded yet.</div>`
        }
      </section>
    `;
  }

  render() {
    if (this.destroyed || !this.root) return;

    try {
      const allRules = this.getFilteredRules();
      const totalPages = Math.max(
        1,
        Math.ceil(allRules.length / this.pageSize)
      );

      this.state.page = Math.min(this.state.page, totalPages - 1);

      const start = this.state.page * this.pageSize;
      const visibleRules = allRules.slice(start, start + this.pageSize);

      const eventTypes = new Set(["all"]);

      for (const rule of this.rules?.getRules?.() ?? []) {
        for (const eventType of rule.eventTypes) {
          if (eventType !== "*") eventTypes.add(eventType);
        }
      }

      this.root.classList.add("drv-root");

      this.root.innerHTML = `
        <header class="drv-header">
          <div>
            <h2 class="drv-title">Diagnostic Rules</h2>
            <p class="drv-subtitle">Manage automated rules for Kano Run diagnostics.</p>
          </div>
          <div class="drv-actions">
            <button class="drv-button" data-drv-action="import">Import</button>
            <button class="drv-button" data-drv-action="export">Export</button>
            <button class="drv-button drv-button-primary" data-drv-action="create">New rule</button>
          </div>
        </header>

        ${this.renderStats()}

        ${
          this.state.message
            ? `
              <div class="drv-message drv-message-${this.escape(this.state.messageType)}" role="status">
                ${this.escape(this.state.message)}
                <button class="drv-button" data-drv-action="clear-message" style="float:right;padding:2px 7px">Dismiss</button>
              </div>
            `
            : ""
        }

        ${this.renderForm()}

        <div class="drv-toolbar">
          <input class="drv-input drv-search" data-drv-search placeholder="Search rules..." value="${this.escape(this.state.search)}" aria-label="Search diagnostic rules">
          <select class="drv-select" data-drv-enabled-filter aria-label="Filter by enabled state">
            <option value="all" ${this.state.enabledFilter === "all" ? "selected" : ""}>All states</option>
            <option value="enabled" ${this.state.enabledFilter === "enabled" ? "selected" : ""}>Enabled</option>
            <option value="disabled" ${this.state.enabledFilter === "disabled" ? "selected" : ""}>Disabled</option>
          </select>
          <select class="drv-select" data-drv-event-filter aria-label="Filter by event type">
            ${[...eventTypes]
              .map(
                (value) => `
                  <option value="${this.escape(value)}" ${this.state.eventFilter === value ? "selected" : ""}>${this.escape(value === "all" ? "All event types" : value)}</option>
                `
              )
              .join("")}
          </select>
        </div>

        <div class="drv-muted" style="margin-bottom:10px">
          Showing ${allRules.length ? start + 1 : 0}–${Math.min(start + this.pageSize, allRules.length)} of ${allRules.length} rule(s)
        </div>

        <div class="drv-list">
          ${
            visibleRules.length
              ? visibleRules.map((rule) => this.renderRule(rule)).join("")
              : `<div class="drv-empty">No diagnostic rules match the current filters.</div>`
          }
        </div>

        <div class="drv-pagination">
          <button class="drv-button" data-drv-action="previous-page" ${this.state.page === 0 ? "disabled" : ""}>Previous</button>
          <span class="drv-muted">Page ${this.state.page + 1} of ${totalPages}</span>
          <button class="drv-button" data-drv-action="next-page" ${this.state.page >= totalPages - 1 ? "disabled" : ""}>Next</button>
        </div>

        ${this.renderHistory()}
      `;

      const form = this.root.querySelector("[data-drv-form]");

      if (form) {
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          this.saveForm();
        });
      }
    } catch (error) {
      this.reportError(error, "render");
      this.root.innerHTML = `
        <div class="drv-empty" role="alert">
          Unable to render diagnostic rules.
          <button class="drv-button" data-drv-action="retry-render">Retry</button>
        </div>
      `;
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.unsubscribeRules?.();
    this.unsubscribeRules = null;

    for (const [eventName, handler] of this.boundHandlers) {
      this.root?.removeEventListener(eventName, handler);
    }

    this.boundHandlers = [];

    if (this.root) {
      delete this.root.dataset.drvBound;
    }

    this.destroyed = true;
  }
}

export default AlertQueueDashboardDiagnosticsRulesView;