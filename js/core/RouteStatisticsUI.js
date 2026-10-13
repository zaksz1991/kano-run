import { EventBus } from "./EventBus.js";
import { Logger } from "./Logger.js";

const log = new Logger("RouteStatisticsUI");

export class RouteStatisticsUI {
  constructor({
    statisticsManager,
    container = null,
    documentRef = globalThis.document,
    eventBus = EventBus,
  } = {}) {
    this.statisticsManager = statisticsManager;
    this.container = container;
    this.document = documentRef;
    this.eventBus = eventBus;
    this.root = null;
    this.unsubscribe = [];
    this.visible = false;
    this.disposed = false;
  }

  mount(container = this.container) {
    if (this.disposed) {
      throw new Error("RouteStatisticsUI has been disposed.");
    }

    if (!this.document) {
      log.warn("Cannot mount statistics UI without a document.");
      return null;
    }

    if (!this.statisticsManager) {
      log.warn("Cannot mount statistics UI without a statistics manager.");
      return null;
    }

    if (this.root?.isConnected) {
      return this.root;
    }

    this.container = container || this.document.body;
    this.root = this.document.createElement("section");
    this.root.className = "route-statistics-panel";
    this.root.setAttribute("aria-label", "Route statistics");
    this.root.hidden = true;

    this.injectStyles();
    this.container.appendChild(this.root);
    this.render();
    this.bindEvents();

    return this.root;
  }

  injectStyles() {
    if (this.document.getElementById("route-statistics-ui-styles")) {
      return;
    }

    const style = this.document.createElement("style");
    style.id = "route-statistics-ui-styles";
    style.textContent = `
      .route-statistics-panel {
        box-sizing: border-box;
        width: min(100%, 760px);
        max-height: min(82vh, 760px);
        overflow: auto;
        padding: 20px;
        color: #f1f5f9;
        background: #0b1e3a;
        border: 1px solid rgba(0, 180, 216, .45);
        border-radius: 14px;
        font-family: system-ui, sans-serif;
      }
      .route-statistics-panel *,
      .route-statistics-panel *::before,
      .route-statistics-panel *::after {
        box-sizing: border-box;
      }
      .route-statistics-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 18px;
      }
      .route-statistics-header h2 {
        margin: 0;
        font-size: 1.35rem;
      }
      .route-statistics-subtitle {
        margin: 5px 0 0;
        color: #b8c7d9;
        font-size: .9rem;
      }
      .route-statistics-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .route-statistics-button {
        padding: 8px 12px;
        color: #f8fafc;
        background: #163657;
        border: 1px solid #315779;
        border-radius: 8px;
        cursor: pointer;
        font: inherit;
      }
      .route-statistics-button:hover {
        background: #21496f;
      }
      .route-statistics-button:focus-visible {
        outline: 2px solid #00b4d8;
        outline-offset: 2px;
      }
      .route-statistics-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 22px;
      }
      .route-statistics-card {
        min-width: 0;
        padding: 14px;
        background: #102947;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 10px;
      }
      .route-statistics-label {
        display: block;
        margin-bottom: 7px;
        color: #b8c7d9;
        font-size: .78rem;
      }
      .route-statistics-value {
        display: block;
        overflow-wrap: anywhere;
        color: #00d4f5;
        font-size: 1.25rem;
        font-weight: 700;
      }
      .route-statistics-section-title {
        margin: 22px 0 10px;
        font-size: 1rem;
      }
      .route-statistics-table-wrap {
        overflow-x: auto;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 9px;
      }
      .route-statistics-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: .88rem;
      }
      .route-statistics-table th,
      .route-statistics-table td {
        padding: 11px 12px;
        border-bottom: 1px solid rgba(255,255,255,.08);
        white-space: nowrap;
      }
      .route-statistics-table th {
        color: #cbd5e1;
        background: #102947;
        font-weight: 600;
      }
      .route-statistics-table tr:last-child td {
        border-bottom: 0;
      }
      .route-statistics-empty {
        padding: 20px;
        color: #b8c7d9;
        text-align: center;
      }
      .route-statistics-footer {
        margin-top: 14px;
        color: #94a3b8;
        font-size: .78rem;
      }
      @media (max-width: 520px) {
        .route-statistics-panel { padding: 14px; }
        .route-statistics-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .route-statistics-header {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `;

    this.document.head.appendChild(style);
  }

  bindEvents() {
    if (!this.eventBus || typeof this.eventBus.on !== "function") {
      return;
    }

    const refreshEvents = [
      "route:statistics:updated",
      "route:run:completed",
      "route:progress:updated",
    ];

    for (const eventName of refreshEvents) {
      try {
        const unsubscribe = this.eventBus.on(eventName, () => {
          if (this.visible) {
            this.render();
          }
        });

        if (typeof unsubscribe === "function") {
          this.unsubscribe.push(unsubscribe);
        }
      } catch (error) {
        log.warn(`Could not subscribe to ${eventName}.`, error);
      }
    }
  }

  show() {
    if (!this.root) {
      this.mount();
    }

    if (!this.root) {
      return false;
    }

    this.visible = true;
    this.root.hidden = false;
    this.render();

    this.emit("route:statistics:ui:opened");

    return true;
  }

  hide() {
    if (!this.root) {
      return;
    }

    this.visible = false;
    this.root.hidden = true;
    this.emit("route:statistics:ui:closed");
  }

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  render() {
    if (!this.root || !this.statisticsManager) {
      return;
    }

    const statistics = this.getStatistics();
    const history = this.getHistory(10);

    this.root.replaceChildren();

    const header = this.document.createElement("header");
    header.className = "route-statistics-header";

    const headingGroup = this.document.createElement("div");
    const heading = this.document.createElement("h2");
    heading.textContent = "Route Statistics";

    const subtitle = this.document.createElement("p");
    subtitle.className = "route-statistics-subtitle";
    subtitle.textContent = "Your Adaidaita Sahu driving record";

    headingGroup.append(heading, subtitle);

    const actions = this.document.createElement("div");
    actions.className = "route-statistics-actions";

    const refreshButton = this.createButton("Refresh", () => this.render());
    refreshButton.setAttribute("aria-label", "Refresh route statistics");

    const closeButton = this.createButton("Close", () => this.hide());
    closeButton.setAttribute("aria-label", "Close route statistics");

    actions.append(refreshButton, closeButton);
    header.append(headingGroup, actions);

    const grid = this.document.createElement("div");
    grid.className = "route-statistics-grid";

    const cards = [
      ["Total Runs", this.formatInteger(this.pick(statistics, [
        "totalRuns",
        "total_runs",
        "runs",
      ]))],
      ["Routes Visited", this.formatInteger(this.pick(statistics, [
        "uniqueRoutes",
        "unique_routes",
        "routesVisited",
      ]))],
      ["Distance", this.formatDistance(this.pick(statistics, [
        "totalDistance",
        "total_distance",
        "distance",
      ]))],
      ["Passengers", this.formatInteger(this.pick(statistics, [
        "totalPassengers",
        "total_passengers",
        "passengers",
      ]))],
      ["Total Earnings", this.formatMoney(this.pick(statistics, [
        "totalEarnings",
        "total_earnings",
        "earnings",
        "totalFare",
      ]))],
      ["Best Score", this.formatInteger(this.pick(statistics, [
        "bestScore",
        "best_score",
        "highScore",
      ]))],
    ];

    for (const [label, value] of cards) {
      grid.appendChild(this.createStatCard(label, value));
    }

    const historyTitle = this.document.createElement("h3");
    historyTitle.className = "route-statistics-section-title";
    historyTitle.textContent = "Recent Runs";

    const tableWrap = this.document.createElement("div");
    tableWrap.className = "route-statistics-table-wrap";

    if (history.length === 0) {
      const empty = this.document.createElement("div");
      empty.className = "route-statistics-empty";
      empty.textContent = "No route runs recorded yet.";
      tableWrap.appendChild(empty);
    } else {
      tableWrap.appendChild(this.createHistoryTable(history));
    }

    const footer = this.document.createElement("p");
    footer.className = "route-statistics-footer";
    footer.textContent = "Statistics are based on saved game progress.";

    this.root.append(header, grid, historyTitle, tableWrap, footer);
  }

  getStatistics() {
    try {
      if (typeof this.statisticsManager.getStatistics === "function") {
        return this.statisticsManager.getStatistics() || {};
      }

      if (typeof this.statisticsManager.getSummary === "function") {
        return this.statisticsManager.getSummary() || {};
      }

      if (typeof this.statisticsManager.getStats === "function") {
        return this.statisticsManager.getStats() || {};
      }

      if (typeof this.statisticsManager.getAll === "function") {
        return this.statisticsManager.getAll() || {};
      }

      return {};
    } catch (error) {
      log.error("Failed to load route statistics.", error);
      return {};
    }
  }

  getHistory(limit = 10) {
    try {
      if (typeof this.statisticsManager.getHistory === "function") {
        const result = this.statisticsManager.getHistory({ limit });

        if (Array.isArray(result)) {
          return result.slice(0, limit);
        }

        if (Array.isArray(result?.items)) {
          return result.items.slice(0, limit);
        }
      }

      if (typeof this.statisticsManager.getRecentRuns === "function") {
        const result = this.statisticsManager.getRecentRuns(limit);
        return Array.isArray(result) ? result.slice(0, limit) : [];
      }

      return [];
    } catch (error) {
      log.warn("Failed to load route history.", error);
      return [];
    }
  }

  createStatCard(label, value) {
    const card = this.document.createElement("div");
    card.className = "route-statistics-card";

    const labelElement = this.document.createElement("span");
    labelElement.className = "route-statistics-label";
    labelElement.textContent = label;

    const valueElement = this.document.createElement("strong");
    valueElement.className = "route-statistics-value";
    valueElement.textContent = value;

    card.append(labelElement, valueElement);

    return card;
  }

  createHistoryTable(history) {
    const table = this.document.createElement("table");
    table.className = "route-statistics-table";

    const headers = ["Route", "Date", "Score", "Distance", "Result"];
    const thead = this.document.createElement("thead");
    const headerRow = this.document.createElement("tr");

    for (const label of headers) {
      const th = this.document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);

    const tbody = this.document.createElement("tbody");

    for (const run of history) {
      const row = this.document.createElement("tr");

      const route = this.pick(run, [
        "routeName",
        "route_name",
        "routeTitle",
        "route",
        "routeId",
        "route_id",
      ]);

      const date = this.pick(run, [
        "completedAt",
        "completed_at",
        "timestamp",
        "date",
        "createdAt",
        "created_at",
      ]);

      const score = this.pick(run, ["score", "points", "totalScore"]);
      const distance = this.pick(run, [
        "distance",
        "distanceKm",
        "distance_km",
      ]);

      const crashed = Number(this.pick(run, [
        "crashes",
        "crashCount",
        "crash_count",
      ]) || 0);

      const result = this.pick(run, [
        "result",
        "status",
        "outcome",
        "completed",
      ]);

      const values = [
        this.displayValue(route, "Unknown route"),
        this.formatDate(date),
        this.formatInteger(score),
        this.formatDistance(distance),
        this.formatResult(result, crashed),
      ];

      for (const value of values) {
        const td = this.document.createElement("td");
        td.textContent = value;
        row.appendChild(td);
      }

      tbody.appendChild(row);
    }

    table.append(thead, tbody);

    return table;
  }

  createButton(label, onClick) {
    const button = this.document.createElement("button");
    button.type = "button";
    button.className = "route-statistics-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  pick(object, keys) {
    if (!object || typeof object !== "object") {
      return undefined;
    }

    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null) {
        const value = object[key];

        if (typeof value !== "object") {
          return value;
        }

        if (typeof value?.name === "string") {
          return value.name;
        }

        if (typeof value?.title === "string") {
          return value.title;
        }

        if (typeof value?.id === "string") {
          return value.id;
        }
      }
    }

    return undefined;
  }

  displayValue(value, fallback = "—") {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }

    return String(value);
  }

  formatInteger(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return Math.round(number).toLocaleString();
  }

  formatDistance(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0 km";
    }

    const kilometres = number > 1000 ? number / 1000 : number;

    return `${kilometres.toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })} km`;
  }

  formatMoney(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "₦0";
    }

    return `₦${Math.round(number).toLocaleString()}`;
  }

  formatDate(value) {
    if (value === undefined || value === null || value === "") {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  formatResult(value, crashes = 0) {
    if (typeof value === "boolean") {
      return value ? "Completed" : "Incomplete";
    }

    if (typeof value === "string" && value.trim()) {
      return value.replaceAll("_", " ");
    }

    return crashes > 0 ? "Completed · Crashes" : "Completed";
  }

  emit(eventName, payload = {}) {
    try {
      if (typeof this.eventBus?.emit === "function") {
        this.eventBus.emit(eventName, payload);
      } else if (typeof this.eventBus?.publish === "function") {
        this.eventBus.publish(eventName, payload);
      }
    } catch (error) {
      log.warn(`Failed to emit ${eventName}.`, error);
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    for (const unsubscribe of this.unsubscribe) {
      try {
        unsubscribe();
      } catch (error) {
        log.warn("Failed to unsubscribe from statistics events.", error);
      }
    }

    this.unsubscribe = [];
    this.root?.remove();
    this.root = null;
    this.visible = false;
    this.disposed = true;
  }
}

export default RouteStatisticsUI;