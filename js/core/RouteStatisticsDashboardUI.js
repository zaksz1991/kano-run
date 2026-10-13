export class RouteStatisticsDashboardUI {
  constructor({
    dashboard,
    container,
    documentRef = globalThis.document,
    refreshInterval = 0,
    onError = null,
  } = {}) {
    if (!dashboard) {
      throw new TypeError("RouteStatisticsDashboardUI requires a dashboard.");
    }

    this.dashboard = dashboard;
    this.container =
      typeof container === "string"
        ? documentRef?.querySelector(container)
        : container;

    this.document = documentRef;
    this.refreshInterval = Math.max(0, Number(refreshInterval) || 0);
    this.onError = onError;

    this.timer = null;
    this.abortController = null;
    this.disposed = false;
    this.loading = false;
    this.lastSnapshot = null;
    this.activePeriod = "all";
    this.activeRoute = "all";

    this.handleClick = this.handleClick.bind(this);
    this.handleChange = this.handleChange.bind(this);
  }

  mount() {
    this.assertActive();

    if (!this.container) {
      throw new Error("Statistics dashboard container was not found.");
    }

    this.container.addEventListener("click", this.handleClick);
    this.container.addEventListener("change", this.handleChange);

    this.renderShell();
    this.refresh();

    if (this.refreshInterval > 0) {
      this.timer = globalThis.setInterval(() => {
        this.refresh();
      }, this.refreshInterval);
    }

    return this;
  }

  renderShell() {
    this.container.innerHTML = `
      <section class="route-statistics-dashboard" aria-label="Route statistics">
        <header class="route-statistics-header">
          <div>
            <p class="route-statistics-eyebrow">KANO RUN · PERFORMANCE</p>
            <h2>Route Statistics</h2>
            <p class="route-statistics-subtitle">
              Review driving performance, route progress, and recent runs.
            </p>
          </div>

          <button
            type="button"
            class="route-statistics-refresh"
            data-action="refresh"
            aria-label="Refresh route statistics"
          >
            Refresh
          </button>
        </header>

        <div class="route-statistics-filters">
          <label>
            Period
            <select data-filter="period">
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
            </select>
          </label>

          <label>
            Route
            <select data-filter="route">
              <option value="all">All routes</option>
            </select>
          </label>
        </div>

        <p class="route-statistics-status" data-role="status" role="status">
          Loading statistics…
        </p>

        <div class="route-statistics-metrics" data-role="metrics">
          ${this.renderMetricPlaceholder("Runs")}
          ${this.renderMetricPlaceholder("Distance")}
          ${this.renderMetricPlaceholder("Earnings")}
          ${this.renderMetricPlaceholder("Crashes")}
          ${this.renderMetricPlaceholder("Completion rate")}
          ${this.renderMetricPlaceholder("Average score")}
        </div>

        <section class="route-statistics-section">
          <h3>Route performance</h3>
          <div data-role="routes" class="route-statistics-route-list">
            <p class="route-statistics-empty">Loading route performance…</p>
          </div>
        </section>

        <section class="route-statistics-section">
          <h3>Recent runs</h3>
          <div data-role="history" class="route-statistics-history">
            <p class="route-statistics-empty">Loading run history…</p>
          </div>
        </section>

        <section class="route-statistics-section">
          <h3>Insights</h3>
          <div data-role="insights" class="route-statistics-insights">
            <p class="route-statistics-empty">Insights will appear here.</p>
          </div>
        </section>

        <footer class="route-statistics-footer">
          RuffNeck Entertainment · Kano Run
        </footer>
      </section>
    `;

    this.applyStyles();
  }

  renderMetricPlaceholder(label) {
    return `
      <article class="route-statistics-metric">
        <span class="route-statistics-metric-label">${this.escapeHTML(label)}</span>
        <strong>—</strong>
      </article>
    `;
  }

  applyStyles() {
    if (!this.document || this.document.getElementById("route-statistics-dashboard-styles")) {
      return;
    }

    const style = this.document.createElement("style");
    style.id = "route-statistics-dashboard-styles";

    style.textContent = `
      .route-statistics-dashboard {
        --rsd-navy: #0b1e3a;
        --rsd-cyan: #00b4d8;
        --rsd-gold: #fbbf24;
        --rsd-muted: #64748b;
        --rsd-border: #e2e8f0;
        color: #0f172a;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        width: 100%;
      }

      .route-statistics-dashboard *,
      .route-statistics-dashboard *::before,
      .route-statistics-dashboard *::after {
        box-sizing: border-box;
      }

      .route-statistics-header {
        align-items: flex-start;
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        justify-content: space-between;
        margin-bottom: 24px;
      }

      .route-statistics-header h2 {
        color: var(--rsd-navy);
        font-size: clamp(1.5rem, 3vw, 2rem);
        margin: 4px 0;
      }

      .route-statistics-eyebrow {
        color: #0891b2;
        font-size: .72rem;
        font-weight: 800;
        letter-spacing: .12em;
        margin: 0;
      }

      .route-statistics-subtitle {
        color: var(--rsd-muted);
        margin: 8px 0 0;
      }

      .route-statistics-refresh {
        background: var(--rsd-navy);
        border: 0;
        border-radius: 8px;
        color: white;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        padding: 10px 16px;
      }

      .route-statistics-refresh:disabled {
        cursor: wait;
        opacity: .6;
      }

      .route-statistics-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 14px;
      }

      .route-statistics-filters label {
        color: #334155;
        display: grid;
        font-size: .82rem;
        font-weight: 700;
        gap: 6px;
        min-width: 180px;
      }

      .route-statistics-filters select {
        background: white;
        border: 1px solid var(--rsd-border);
        border-radius: 8px;
        color: #0f172a;
        font: inherit;
        padding: 10px;
      }

      .route-statistics-status {
        color: var(--rsd-muted);
        font-size: .85rem;
        min-height: 20px;
      }

      .route-statistics-status[data-state="error"] {
        color: #b91c1c;
      }

      .route-statistics-metrics {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
        margin: 20px 0 28px;
      }

      .route-statistics-metric {
        background: white;
        border: 1px solid var(--rsd-border);
        border-radius: 12px;
        min-width: 0;
        padding: 16px;
      }

      .route-statistics-metric-label {
        color: var(--rsd-muted);
        display: block;
        font-size: .8rem;
        margin-bottom: 10px;
      }

      .route-statistics-metric strong {
        color: var(--rsd-navy);
        display: block;
        font-size: clamp(1.2rem, 2vw, 1.65rem);
        overflow-wrap: anywhere;
      }

      .route-statistics-section {
        margin: 28px 0;
      }

      .route-statistics-section h3 {
        color: var(--rsd-navy);
        font-size: 1.1rem;
        margin: 0 0 14px;
      }

      .route-statistics-route-list,
      .route-statistics-history,
      .route-statistics-insights {
        display: grid;
        gap: 10px;
      }

      .route-statistics-row {
        align-items: center;
        background: white;
        border: 1px solid var(--rsd-border);
        border-radius: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: space-between;
        padding: 14px;
      }

      .route-statistics-row-main {
        min-width: 0;
      }

      .route-statistics-row-title {
        color: var(--rsd-navy);
        font-weight: 750;
        overflow-wrap: anywhere;
      }

      .route-statistics-row-meta {
        color: var(--rsd-muted);
        font-size: .82rem;
        margin-top: 5px;
      }

      .route-statistics-row-value {
        font-weight: 750;
        text-align: right;
      }

      .route-statistics-badge {
        background: #ecfeff;
        border-radius: 999px;
        color: #155e75;
        display: inline-block;
        font-size: .72rem;
        font-weight: 750;
        margin-top: 7px;
        padding: 4px 8px;
        text-transform: capitalize;
      }

      .route-statistics-empty {
        color: var(--rsd-muted);
        font-size: .9rem;
        padding: 14px 0;
      }

      .route-statistics-footer {
        border-top: 1px solid var(--rsd-border);
        color: var(--rsd-muted);
        font-size: .75rem;
        margin-top: 32px;
        padding-top: 16px;
      }

      @media (max-width: 520px) {
        .route-statistics-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .route-statistics-metric {
          padding: 12px;
        }

        .route-statistics-row-value {
          text-align: left;
        }
      }
    `;

    this.document.head?.appendChild(style);
  }

  async refresh() {
    if (this.disposed || this.loading) {
      return null;
    }

    this.loading = true;
    this.setStatus("Loading statistics…");
    this.setRefreshDisabled(true);

    this.abortController?.abort();
    this.abortController = new AbortController();

    try {
      const snapshot = await this.getSnapshot();

      if (this.disposed) {
        return null;
      }

      this.lastSnapshot = snapshot;
      this.renderSnapshot(snapshot);
      this.setStatus("Statistics updated.");
      return snapshot;
    } catch (error) {
      if (this.disposed) {
        return null;
      }

      this.setStatus("Unable to load statistics.", "error");
      this.reportError(error);
      return null;
    } finally {
      this.loading = false;

      if (!this.disposed) {
        this.setRefreshDisabled(false);
      }
    }
  }

  async getSnapshot() {
    const result = await this.dashboard.getDashboard();

    if (!result || typeof result !== "object") {
      throw new Error("The dashboard returned an invalid statistics snapshot.");
    }

    return result;
  }

  renderSnapshot(snapshot) {
    const metrics = this.extractMetrics(snapshot);
    const routes = this.extractRoutes(snapshot);
    const history = this.extractHistory(snapshot);
    const insights = this.extractInsights(snapshot);

    this.renderMetrics(metrics);
    this.renderRouteFilter(routes);
    this.renderRoutes(this.filterRoutes(routes));
    this.renderHistory(this.filterHistory(history));
    this.renderInsights(insights);
  }

  extractMetrics(snapshot) {
    const source = snapshot.metrics ?? snapshot.statistics ?? snapshot.summary ?? {};

    return {
      runs: this.firstNumber(source, ["runs", "totalRuns", "total_runs", "runCount"]),
      distance: this.firstNumber(source, ["distance", "totalDistance", "total_distance"]),
      earnings: this.firstNumber(source, ["earnings", "totalEarnings", "total_earnings", "money"]),
      crashes: this.firstNumber(source, ["crashes", "totalCrashes", "total_crashes"]),
      completionRate: this.firstNumber(source, [
        "completionRate",
        "completion_rate",
        "completionPercentage",
      ]),
      averageScore: this.firstNumber(source, ["averageScore", "average_score", "avgScore"]),
    };
  }

  extractRoutes(snapshot) {
    const routes =
      snapshot.routes ??
      snapshot.routePerformance ??
      snapshot.route_performance ??
      snapshot.analytics?.routes ??
      [];

    return Array.isArray(routes) ? routes : [];
  }

  extractHistory(snapshot) {
    const history =
      snapshot.history ??
      snapshot.recentRuns ??
      snapshot.recent_runs ??
      snapshot.runs ??
      [];

    return Array.isArray(history) ? history : [];
  }

  extractInsights(snapshot) {
    const insights = snapshot.insights ?? snapshot.recommendations ?? [];

    if (Array.isArray(insights)) {
      return insights;
    }

    if (insights && Array.isArray(insights.insights)) {
      return insights.insights;
    }

    if (insights && Array.isArray(insights.recommendations)) {
      return insights.recommendations;
    }

    return [];
  }

  renderMetrics(metrics) {
    const definitions = [
      ["Runs", this.formatInteger(metrics.runs)],
      ["Distance", this.formatDistance(metrics.distance)],
      ["Earnings", this.formatCurrency(metrics.earnings)],
      ["Crashes", this.formatInteger(metrics.crashes)],
      ["Completion rate", this.formatPercent(metrics.completionRate)],
      ["Average score", this.formatDecimal(metrics.averageScore)],
    ];

    const target = this.container.querySelector('[data-role="metrics"]');

    if (!target) {
      return;
    }

    target.innerHTML = definitions
      .map(
        ([label, value]) => `
          <article class="route-statistics-metric">
            <span class="route-statistics-metric-label">${this.escapeHTML(label)}</span>
            <strong>${this.escapeHTML(value)}</strong>
          </article>
        `,
      )
      .join("");
  }

  renderRouteFilter(routes) {
    const select = this.container.querySelector('[data-filter="route"]');

    if (!select) {
      return;
    }

    const previous = this.activeRoute;
    const options = [
      '<option value="all">All routes</option>',
      ...routes.map((route) => {
        const id = this.getRouteId(route);
        const name = this.getRouteName(route);

        return `<option value="${this.escapeAttribute(id)}">${this.escapeHTML(name)}</option>`;
      }),
    ];

    select.innerHTML = options.join("");

    const valid = [...select.options].some((option) => option.value === previous);
    select.value = valid ? previous : "all";
    this.activeRoute = select.value;
  }

  renderRoutes(routes) {
    const target = this.container.querySelector('[data-role="routes"]');

    if (!target) {
      return;
    }

    if (routes.length === 0) {
      target.innerHTML = '<p class="route-statistics-empty">No route performance data available.</p>';
      return;
    }

    target.innerHTML = routes
      .map((route) => {
        const name = this.getRouteName(route);
        const runs = this.firstNumber(route, ["runs", "totalRuns", "runCount", "count"]);
        const distance = this.firstNumber(route, ["distance", "totalDistance"]);
        const earnings = this.firstNumber(route, ["earnings", "totalEarnings"]);
        const completion = this.firstNumber(route, ["completionRate", "completion_rate"]);

        return `
          <article class="route-statistics-row">
            <div class="route-statistics-row-main">
              <div class="route-statistics-row-title">${this.escapeHTML(name)}</div>
              <div class="route-statistics-row-meta">
                ${this.formatInteger(runs)} runs · ${this.formatDistance(distance)}
                · ${this.formatPercent(completion)} completion
              </div>
            </div>
            <div class="route-statistics-row-value">
              ${this.escapeHTML(this.formatCurrency(earnings))}
            </div>
          </article>
        `;
      })
      .join("");
  }

  renderHistory(history) {
    const target = this.container.querySelector('[data-role="history"]');

    if (!target) {
      return;
    }

    if (history.length === 0) {
      target.innerHTML = '<p class="route-statistics-empty">No recent runs recorded.</p>';
      return;
    }

    target.innerHTML = history
      .slice(0, 20)
      .map((run) => {
        const routeName = this.getRouteName(run);
        const status = String(run.status ?? (run.completed ? "completed" : "recorded"));
        const score = this.firstNumber(run, ["score", "points", "totalScore"]);
        const earnings = this.firstNumber(run, ["earnings", "fare", "moneyEarned"]);
        const date = this.formatDate(
          run.date ?? run.createdAt ?? run.created_at ?? run.timestamp ?? run.startedAt,
        );

        return `
          <article class="route-statistics-row">
            <div class="route-statistics-row-main">
              <div class="route-statistics-row-title">${this.escapeHTML(routeName)}</div>
              <div class="route-statistics-row-meta">
                ${this.escapeHTML(date)} · Score ${this.escapeHTML(this.formatInteger(score))}
              </div>
              <span class="route-statistics-badge">${this.escapeHTML(status)}</span>
            </div>
            <div class="route-statistics-row-value">
              ${this.escapeHTML(this.formatCurrency(earnings))}
            </div>
          </article>
        `;
      })
      .join("");
  }

  renderInsights(insights) {
    const target = this.container.querySelector('[data-role="insights"]');

    if (!target) {
      return;
    }

    if (insights.length === 0) {
      target.innerHTML = '<p class="route-statistics-empty">No new insights available.</p>';
      return;
    }

    target.innerHTML = insights
      .slice(0, 10)
      .map((item) => {
        const title =
          typeof item === "string"
            ? item
            : item.title ?? item.label ?? item.type ?? "Performance insight";

        const description =
          typeof item === "string"
            ? ""
            : item.description ?? item.message ?? item.recommendation ?? "";

        return `
          <article class="route-statistics-row">
            <div class="route-statistics-row-main">
              <div class="route-statistics-row-title">${this.escapeHTML(title)}</div>
              ${
                description
                  ? `<div class="route-statistics-row-meta">${this.escapeHTML(description)}</div>`
                  : ""
              }
            </div>
          </article>
        `;
      })
      .join("");
  }

  filterRoutes(routes) {
    if (this.activeRoute === "all") {
      return routes;
    }

    return routes.filter((route) => this.getRouteId(route) === this.activeRoute);
  }

  filterHistory(history) {
    let filtered = history;

    if (this.activeRoute !== "all") {
      filtered = filtered.filter((run) => this.getRouteId(run) === this.activeRoute);
    }

    if (this.activePeriod !== "all") {
      const cutoff = this.getPeriodCutoff(this.activePeriod);

      if (cutoff) {
        filtered = filtered.filter((run) => {
          const date = this.parseDate(
            run.date ?? run.createdAt ?? run.created_at ?? run.timestamp ?? run.startedAt,
          );

          return date && date >= cutoff;
        });
      }
    }

    return filtered;
  }

  getPeriodCutoff(period) {
    const now = new Date();

    if (period === "today") {
      now.setHours(0, 0, 0, 0);
      return now;
    }

    if (period === "week") {
      now.setDate(now.getDate() - 7);
      return now;
    }

    if (period === "month") {
      now.setDate(now.getDate() - 30);
      return now;
    }

    return null;
  }

  handleClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button || !this.container.contains(button)) {
      return;
    }

    if (button.dataset.action === "refresh") {
      this.refresh();
    }
  }

  handleChange(event) {
    const filter = event.target.dataset.filter;

    if (filter === "period") {
      this.activePeriod = event.target.value;
    } else if (filter === "route") {
      this.activeRoute = event.target.value;
    } else {
      return;
    }

    if (this.lastSnapshot) {
      const routes = this.extractRoutes(this.lastSnapshot);
      const history = this.extractHistory(this.lastSnapshot);

      this.renderRoutes(this.filterRoutes(routes));
      this.renderHistory(this.filterHistory(history));
    } else {
      this.refresh();
    }
  }

  setStatus(message, state = "normal") {
    const status = this.container?.querySelector('[data-role="status"]');

    if (status) {
      status.textContent = message;
      status.dataset.state = state;
    }
  }

  setRefreshDisabled(disabled) {
    const button = this.container?.querySelector('[data-action="refresh"]');

    if (button) {
      button.disabled = disabled;
      button.textContent = disabled ? "Refreshing…" : "Refresh";
    }
  }

  getRouteId(route) {
    const value =
      route.routeId ??
      route.route_id ??
      route.id ??
      route.slug ??
      route.route?.id ??
      route.route?.slug ??
      "unknown";

    return String(value);
  }

  getRouteName(route) {
    return String(
      route.routeName ??
        route.route_name ??
        route.name ??
        route.title ??
        route.route?.name ??
        route.route?.title ??
        route.routeId ??
        route.route_id ??
        route.id ??
        "Unknown route",
    );
  }

  firstNumber(source, keys) {
    for (const key of keys) {
      const value = source?.[key];

      if (value !== null && value !== undefined && value !== "") {
        const number = Number(value);

        if (Number.isFinite(number)) {
          return number;
        }
      }
    }

    return 0;
  }

  formatInteger(value) {
    return new Intl.NumberFormat("en-NG", {
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  formatDecimal(value) {
    return new Intl.NumberFormat("en-NG", {
      maximumFractionDigits: 1,
    }).format(Number(value) || 0);
  }

  formatCurrency(value) {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  formatDistance(value) {
    const distance = Number(value) || 0;
    return `${this.formatDecimal(distance)} km`;
  }

  formatPercent(value) {
    const percentage = Number(value) || 0;
    return `${this.formatDecimal(percentage)}%`;
  }

  formatDate(value) {
    const date = this.parseDate(value);

    if (!date) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  parseDate(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const date = value instanceof Date ? new Date(value) : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  escapeHTML(value) {
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

  escapeAttribute(value) {
    return this.escapeHTML(value);
  }

  reportError(error) {
    if (typeof this.onError === "function") {
      this.onError(error);
      return;
    }

    console.error("[RouteStatisticsDashboardUI]", error);
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsDashboardUI has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    if (this.timer !== null) {
      globalThis.clearInterval(this.timer);
      this.timer = null;
    }

    this.abortController?.abort();
    this.abortController = null;

    this.container?.removeEventListener("click", this.handleClick);
    this.container?.removeEventListener("change", this.handleChange);

    this.lastSnapshot = null;
  }
}

export default RouteStatisticsDashboardUI;