export class AlertQueueDashboardDiagnosticsRulesEngineView {
  constructor({
    root = null,
    engine = null,
    document: doc = globalThis.document,
    autoMount = true,
    pageSize = 10,
    onError = null,
  } = {}) {
    this.root = root;
    this.engine = engine;
    this.document = doc;
    this.pageSize = Math.max(1, Number(pageSize) || 10);
    this.onError = onError;

    this.mounted = false;
    this.destroyed = false;
    this.currentPage = 0;
    this.filter = "all";
    this.searchQuery = "";
    this.expandedMatchId = null;
    this.unsubscribe = null;
    this.elements = {};
    this.boundClick = this.handleClick.bind(this);
    this.boundInput = this.handleInput.bind(this);
    this.boundChange = this.handleChange.bind(this);

    if (autoMount && this.root) {
      this.mount();
    }
  }

  mount() {
    if (this.destroyed || this.mounted || !this.root) {
      return this;
    }

    try {
      this.renderShell();

      this.root.addEventListener("click", this.boundClick);
      this.root.addEventListener("input", this.boundInput);
      this.root.addEventListener("change", this.boundChange);

      if (this.engine && typeof this.engine.subscribe === "function") {
        this.unsubscribe = this.engine.subscribe(() => {
          if (!this.destroyed) {
            this.render();
          }
        });
      }

      this.mounted = true;
      this.render();

      return this;
    } catch (error) {
      this.handleError(error, "mount");
      return this;
    }
  }

  renderShell() {
    if (!this.root || !this.document) {
      return;
    }

    this.root.replaceChildren();

    const container = this.document.createElement("section");
    container.className = "aqd-rules-engine-view";
    container.dataset.component = "rules-engine-view";

    const header = this.document.createElement("header");
    header.className = "aqd-rev-header";

    const titleGroup = this.document.createElement("div");

    const title = this.document.createElement("h2");
    title.textContent = "Rules Engine";

    const subtitle = this.document.createElement("p");
    subtitle.textContent =
      "Monitor rule evaluations, matches, and execution health.";

    titleGroup.append(title, subtitle);

    const status = this.document.createElement("span");
    status.className = "aqd-rev-status";
    status.dataset.role = "engine-status";
    status.textContent = "Unknown";

    header.append(titleGroup, status);

    const stats = this.document.createElement("div");
    stats.className = "aqd-rev-stats";
    stats.dataset.role = "stats";

    const toolbar = this.document.createElement("div");
    toolbar.className = "aqd-rev-toolbar";

    const search = this.document.createElement("input");
    search.type = "search";
    search.className = "aqd-rev-search";
    search.placeholder = "Search rules and matches";
    search.setAttribute("aria-label", "Search rules and matches");
    search.dataset.action = "search";

    const filter = this.document.createElement("select");
    filter.className = "aqd-rev-filter";
    filter.setAttribute("aria-label", "Filter matches");
    filter.dataset.action = "filter";

    [
      ["all", "All matches"],
      ["critical", "Critical"],
      ["error", "Errors"],
      ["warning", "Warnings"],
      ["info", "Info"],
    ].forEach(([value, label]) => {
      const option = this.document.createElement("option");
      option.value = value;
      option.textContent = label;
      filter.appendChild(option);
    });

    const refresh = this.createButton("Refresh", "refresh");
    const clear = this.createButton("Clear history", "clear-history");

    toolbar.append(search, filter, refresh, clear);

    const summary = this.document.createElement("p");
    summary.className = "aqd-rev-summary";
    summary.dataset.role = "summary";

    const list = this.document.createElement("div");
    list.className = "aqd-rev-list";
    list.dataset.role = "matches";
    list.setAttribute("aria-live", "polite");

    const pagination = this.document.createElement("nav");
    pagination.className = "aqd-rev-pagination";
    pagination.setAttribute("aria-label", "Match history pagination");

    const previous = this.createButton("Previous", "previous-page");
    const pageLabel = this.document.createElement("span");
    pageLabel.dataset.role = "page-label";

    const next = this.createButton("Next", "next-page");

    pagination.append(previous, pageLabel, next);

    const message = this.document.createElement("p");
    message.className = "aqd-rev-message";
    message.dataset.role = "message";
    message.hidden = true;

    container.append(
      header,
      stats,
      toolbar,
      summary,
      list,
      pagination,
      message
    );

    this.root.appendChild(container);

    this.elements = {
      container,
      status,
      stats,
      search,
      filter,
      summary,
      list,
      pagination,
      previous,
      pageLabel,
      next,
      message,
    };
  }

  render() {
    if (this.destroyed || !this.root || !this.document) {
      return;
    }

    try {
      if (!this.elements.container) {
        this.renderShell();
      }

      const summary = this.getEngineSummary();
      const history = this.getHistory();
      const filtered = this.filterMatches(history);
      const pageCount = Math.max(
        1,
        Math.ceil(filtered.length / this.pageSize)
      );

      this.currentPage = Math.min(
        this.currentPage,
        pageCount - 1
      );

      const start = this.currentPage * this.pageSize;
      const visible = filtered.slice(
        start,
        start + this.pageSize
      );

      this.renderStatus(summary);
      this.renderStats(summary);
      this.renderMatches(visible);
      this.renderPagination(filtered.length, pageCount);
      this.renderSummary(filtered.length, history.length);
      this.showMessage(
        filtered.length === 0
          ? "No matches found for the selected filters."
          : "",
        filtered.length === 0
      );
    } catch (error) {
      this.handleError(error, "render");
    }
  }

  renderStatus(summary) {
    const status = this.elements.status;

    if (!status) {
      return;
    }

    const label = summary.destroyed
      ? "Destroyed"
      : summary.running
        ? "Evaluating"
        : "Ready";

    status.textContent = label;
    status.dataset.status = label.toLowerCase();
  }

  renderStats(summary) {
    const stats = this.elements.stats;

    if (!stats) {
      return;
    }

    const items = [
      ["Rules", summary.ruleCount],
      ["Enabled", summary.enabledRuleCount],
      ["Evaluations", summary.evaluationCount],
      ["Matches", summary.matchCount],
      ["Errors", summary.errorCount],
    ];

    stats.replaceChildren();

    items.forEach(([label, value]) => {
      const card = this.document.createElement("div");
      card.className = "aqd-rev-stat";

      const name = this.document.createElement("span");
      name.className = "aqd-rev-stat-label";
      name.textContent = label;

      const number = this.document.createElement("strong");
      number.className = "aqd-rev-stat-value";
      number.textContent = String(Number(value) || 0);

      card.append(name, number);
      stats.appendChild(card);
    });
  }

  renderMatches(matches) {
    const list = this.elements.list;

    if (!list) {
      return;
    }

    list.replaceChildren();

    if (matches.length === 0) {
      const empty = this.document.createElement("p");
      empty.className = "aqd-rev-empty";
      empty.textContent = "No matching rule events.";
      list.appendChild(empty);
      return;
    }

    matches.forEach((match) => {
      list.appendChild(this.createMatchCard(match));
    });
  }

  createMatchCard(match) {
    const card = this.document.createElement("article");
    card.className = "aqd-rev-match";
    card.dataset.matchId = String(match.id || "");
    card.dataset.severity = String(
      match.severity || "info"
    ).toLowerCase();

    const heading = this.document.createElement("div");
    heading.className = "aqd-rev-match-heading";

    const title = this.document.createElement("h3");
    title.textContent =
      match.ruleName || match.ruleId || "Unnamed rule";

    const severity = this.document.createElement("span");
    severity.className = "aqd-rev-severity";
    severity.textContent = String(
      match.severity || "info"
    ).toUpperCase();

    heading.append(title, severity);

    const message = this.document.createElement("p");
    message.className = "aqd-rev-match-message";
    message.textContent = String(
      match.message || "Rule matched."
    );

    const metadata = this.document.createElement("div");
    metadata.className = "aqd-rev-match-meta";

    const timestamp = this.document.createElement("time");
    const date = this.toDate(match.timestamp);

    if (date) {
      timestamp.dateTime = date.toISOString();
      timestamp.textContent = date.toLocaleString();
    } else {
      timestamp.textContent = "Unknown time";
    }

    const ruleId = this.document.createElement("span");
    ruleId.textContent = `Rule ID: ${match.ruleId || "N/A"}`;

    metadata.append(timestamp, ruleId);
    card.append(heading, message, metadata);

    const toggle = this.createButton(
      this.expandedMatchId === String(match.id)
        ? "Hide details"
        : "Show details",
      "toggle-details"
    );

    toggle.dataset.matchId = String(match.id || "");
    toggle.setAttribute(
      "aria-expanded",
      String(this.expandedMatchId === String(match.id))
    );

    card.appendChild(toggle);

    if (this.expandedMatchId === String(match.id)) {
      card.appendChild(this.createDetails(match));
    }

    return card;
  }

  createDetails(match) {
    const details = this.document.createElement("pre");
    details.className = "aqd-rev-details";

    const payload = {
      matchId: match.id ?? null,
      ruleId: match.ruleId ?? null,
      reason: match.reason ?? null,
      conditionResults: match.conditionResults ?? [],
      event: match.event ?? null,
    };

    try {
      details.textContent = JSON.stringify(payload, null, 2);
    } catch {
      details.textContent = "Match details could not be displayed.";
    }

    return details;
  }

  renderPagination(total, pageCount) {
    const { previous, next, pageLabel } = this.elements;

    if (!previous || !next || !pageLabel) {
      return;
    }

    previous.disabled = this.currentPage <= 0;
    next.disabled = this.currentPage >= pageCount - 1;

    pageLabel.textContent =
      `Page ${this.currentPage + 1} of ${pageCount} · ${total} matches`;
  }

  renderSummary(filteredCount, totalCount) {
    if (!this.elements.summary) {
      return;
    }

    this.elements.summary.textContent =
      `Showing ${filteredCount} of ${totalCount} recorded matches.`;
  }

  filterMatches(history) {
    const query = this.searchQuery.trim().toLowerCase();

    return history.filter((match) => {
      const severity = String(
        match.severity || "info"
      ).toLowerCase();

      if (
        this.filter !== "all" &&
        severity !== this.filter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = [
        match.ruleName,
        match.ruleId,
        match.message,
        match.severity,
        match.reason,
      ]
        .filter((value) => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }

  getHistory() {
    if (!this.engine) {
      return [];
    }

    try {
      if (typeof this.engine.getHistory === "function") {
        const history = this.engine.getHistory({
          limit: 10000,
        });

        if (Array.isArray(history)) {
          return history.slice().reverse();
        }
      }

      if (Array.isArray(this.engine.history)) {
        return this.engine.history.slice().reverse();
      }
    } catch (error) {
      this.handleError(error, "get-history");
    }

    return [];
  }

  getEngineSummary() {
    const fallback = {
      running: false,
      destroyed: false,
      ruleCount: 0,
      enabledRuleCount: 0,
      disabledRuleCount: 0,
      evaluationCount: 0,
      matchCount: 0,
      errorCount: 0,
      historyCount: 0,
    };

    if (!this.engine || typeof this.engine.getSummary !== "function") {
      return fallback;
    }

    try {
      return {
        ...fallback,
        ...this.engine.getSummary(),
      };
    } catch (error) {
      this.handleError(error, "get-summary");
      return fallback;
    }
  }

  handleClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button || !this.root.contains(button)) {
      return;
    }

    const action = button.dataset.action;

    switch (action) {
      case "refresh":
        this.refresh();
        break;

      case "clear-history":
        this.clearHistory();
        break;

      case "previous-page":
        this.currentPage = Math.max(0, this.currentPage - 1);
        this.render();
        break;

      case "next-page":
        this.currentPage += 1;
        this.render();
        break;

      case "toggle-details":
        this.toggleDetails(button.dataset.matchId);
        break;

      default:
        break;
    }
  }

  handleInput(event) {
    const target = event.target;

    if (target?.dataset?.action !== "search") {
      return;
    }

    this.searchQuery = target.value || "";
    this.currentPage = 0;
    this.render();
  }

  handleChange(event) {
    const target = event.target;

    if (target?.dataset?.action !== "filter") {
      return;
    }

    this.filter = target.value || "all";
    this.currentPage = 0;
    this.render();
  }

  toggleDetails(matchId) {
    const id = String(matchId || "");

    this.expandedMatchId =
      this.expandedMatchId === id ? null : id;

    this.render();
  }

  refresh() {
    if (this.destroyed) {
      return;
    }

    try {
      if (this.engine && typeof this.engine.refresh === "function") {
        this.engine.refresh();
      }

      this.render();
    } catch (error) {
      this.handleError(error, "refresh");
    }
  }

  clearHistory() {
    if (!this.engine) {
      return;
    }

    try {
      if (typeof this.engine.clearHistory === "function") {
        this.engine.clearHistory();
      } else if (
        this.engine.rulesStore &&
        typeof this.engine.rulesStore.clearHistory === "function"
      ) {
        this.engine.rulesStore.clearHistory();
      }

      this.currentPage = 0;
      this.expandedMatchId = null;
      this.render();
    } catch (error) {
      this.handleError(error, "clear-history");
    }
  }

  createButton(label, action) {
    const button = this.document.createElement("button");
    button.type = "button";
    button.className = "aqd-rev-button";
    button.textContent = label;
    button.dataset.action = action;

    return button;
  }

  showMessage(message, visible = true) {
    const element = this.elements.message;

    if (!element) {
      return;
    }

    element.textContent = message;
    element.hidden = !visible || !message;
  }

  toDate(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const date =
      typeof value === "number"
        ? new Date(value)
        : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  handleError(error, operation) {
    const payload = {
      operation,
      message: error instanceof Error
        ? error.message
        : String(error),
    };

    if (typeof this.onError === "function") {
      try {
        this.onError(payload, error);
      } catch {
        // Prevent UI error handlers from interrupting cleanup.
      }
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    if (typeof this.unsubscribe === "function") {
      try {
        this.unsubscribe();
      } catch (error) {
        this.handleError(error, "unsubscribe");
      }
    }

    this.unsubscribe = null;

    if (this.root) {
      this.root.removeEventListener("click", this.boundClick);
      this.root.removeEventListener("input", this.boundInput);
      this.root.removeEventListener("change", this.boundChange);
    }

    this.elements = {};
    this.mounted = false;
  }
}

export default AlertQueueDashboardDiagnosticsRulesEngineView;