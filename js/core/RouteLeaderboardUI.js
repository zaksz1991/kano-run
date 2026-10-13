import { Logger } from "./Logger.js";

const DEFAULTS = {
  containerId: "route-leaderboard",
  title: "Route Leaderboard",
  entriesPerPage: 10,
  routeId: null,
};

export class RouteLeaderboardUI {
  constructor({
    leaderboardManager,
    container = null,
    containerId = DEFAULTS.containerId,
    title = DEFAULTS.title,
    entriesPerPage = DEFAULTS.entriesPerPage,
    routeId = DEFAULTS.routeId,
    documentRef = globalThis.document,
  } = {}) {
    if (!leaderboardManager) {
      throw new Error("RouteLeaderboardUI requires a leaderboardManager.");
    }

    this.leaderboardManager = leaderboardManager;
    this.document = documentRef;
    this.container =
      container ||
      this.document?.getElementById(containerId) ||
      null;

    this.title = title;
    this.entriesPerPage = Math.max(1, Math.floor(entriesPerPage));
    this.routeId = routeId;
    this.currentPage = 0;
    this.destroyed = false;
    this.abortController = null;

    if (this.container) {
      this.mount();
    } else {
      Logger.warn?.(
        `RouteLeaderboardUI: container "${containerId}" was not found.`
      );
    }
  }

  mount() {
    if (!this.container || this.destroyed) return;

    this.abortController?.abort();
    this.abortController = new AbortController();

    this.container.classList.add("kano-leaderboard");
    this.container.setAttribute("aria-label", this.title);

    this.container.innerHTML = `
      <section class="leaderboard-panel">
        <header class="leaderboard-header">
          <div>
            <h2 class="leaderboard-title"></h2>
            <p class="leaderboard-subtitle">Your best driving runs</p>
          </div>
          <button
            type="button"
            class="leaderboard-refresh"
            data-action="refresh"
            aria-label="Refresh leaderboard"
          >Refresh</button>
        </header>

        <div class="leaderboard-stats" aria-live="polite"></div>

        <div class="leaderboard-table-wrap">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Driver</th>
                <th scope="col">Route</th>
                <th scope="col">Score</th>
                <th scope="col">Distance</th>
                <th scope="col">Earnings</th>
              </tr>
            </thead>
            <tbody class="leaderboard-body"></tbody>
          </table>
        </div>

        <div class="leaderboard-empty" hidden>
          No completed runs yet. Complete a route to appear here.
        </div>

        <footer class="leaderboard-footer">
          <button type="button" data-action="previous">Previous</button>
          <span class="leaderboard-page" aria-live="polite"></span>
          <button type="button" data-action="next">Next</button>
        </footer>
      </section>
    `;

    this.container.querySelector(".leaderboard-title").textContent =
      this.title;

    this.container.addEventListener(
      "click",
      (event) => this.handleClick(event),
      { signal: this.abortController.signal }
    );

    this.render();
  }

  handleClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || !this.container?.contains(button)) return;

    switch (button.dataset.action) {
      case "refresh":
        this.refresh();
        break;

      case "previous":
        this.previousPage();
        break;

      case "next":
        this.nextPage();
        break;

      default:
        break;
    }
  }

  setRoute(routeId = null) {
    this.routeId = routeId || null;
    this.currentPage = 0;
    this.render();
  }

  refresh() {
    this.currentPage = 0;
    this.render();
  }

  previousPage() {
    if (this.currentPage <= 0) return;
    this.currentPage -= 1;
    this.render();
  }

  nextPage() {
    const entries = this.getEntries();
    const pageCount = Math.max(
      1,
      Math.ceil(entries.length / this.entriesPerPage)
    );

    if (this.currentPage >= pageCount - 1) return;

    this.currentPage += 1;
    this.render();
  }

  getEntries() {
    return this.leaderboardManager.getEntries({
      routeId: this.routeId,
      limit: Number.MAX_SAFE_INTEGER,
    });
  }

  render() {
    if (!this.container || this.destroyed) return;

    const entries = this.getEntries();
    const totalPages = Math.max(
      1,
      Math.ceil(entries.length / this.entriesPerPage)
    );

    this.currentPage = Math.min(this.currentPage, totalPages - 1);

    const start = this.currentPage * this.entriesPerPage;
    const pageEntries = entries.slice(
      start,
      start + this.entriesPerPage
    );

    this.renderStatistics();
    this.renderRows(pageEntries, start);

    const empty = this.container.querySelector(".leaderboard-empty");
    const table = this.container.querySelector(".leaderboard-table-wrap");

    if (empty) empty.hidden = entries.length > 0;
    if (table) table.hidden = entries.length === 0;

    const pageLabel = this.container.querySelector(".leaderboard-page");
    if (pageLabel) {
      pageLabel.textContent = `Page ${this.currentPage + 1} of ${totalPages}`;
    }

    const previous = this.container.querySelector(
      '[data-action="previous"]'
    );
    const next = this.container.querySelector('[data-action="next"]');

    if (previous) previous.disabled = this.currentPage <= 0;
    if (next) next.disabled = this.currentPage >= totalPages - 1;
  }

  renderStatistics() {
    const element = this.container.querySelector(".leaderboard-stats");
    if (!element) return;

    const stats = this.leaderboardManager.getStatistics(this.routeId);

    element.replaceChildren();

    const cards = [
      ["Runs", stats.runs],
      ["Best score", this.formatNumber(stats.highestScore)],
      ["Average score", this.formatNumber(stats.averageScore)],
      ["Passengers", this.formatNumber(stats.totalPassengers)],
    ];

    for (const [label, value] of cards) {
      const card = this.document.createElement("div");
      card.className = "leaderboard-stat";

      const heading = this.document.createElement("span");
      heading.className = "leaderboard-stat-label";
      heading.textContent = label;

      const number = this.document.createElement("strong");
      number.className = "leaderboard-stat-value";
      number.textContent = String(value);

      card.append(heading, number);
      element.appendChild(card);
    }
  }

  renderRows(entries, offset) {
    const tbody = this.container.querySelector(".leaderboard-body");
    if (!tbody) return;

    tbody.replaceChildren();

    entries.forEach((entry, index) => {
      const row = this.document.createElement("tr");
      row.className = "leaderboard-row";

      if (offset + index === 0) {
        row.classList.add("leaderboard-first-place");
      }

      const values = [
        String(offset + index + 1),
        entry.playerName,
        entry.routeName,
        this.formatNumber(entry.score),
        `${this.formatNumber(entry.distance)} km`,
        `₦${this.formatNumber(entry.earnings)}`,
      ];

      values.forEach((value, cellIndex) => {
        const cell = this.document.createElement("td");
        cell.textContent = value;

        if (cellIndex === 0) {
          cell.className = "leaderboard-rank";
        }

        if (cellIndex === 3) {
          cell.className = "leaderboard-score";
        }

        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });
  }

  formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "0";

    return new Intl.NumberFormat("en-NG", {
      maximumFractionDigits: 1,
    }).format(number);
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;
    this.abortController?.abort();
    this.abortController = null;

    if (this.container) {
      this.container.replaceChildren();
      this.container.classList.remove("kano-leaderboard");
      this.container.removeAttribute("aria-label");
    }

    this.container = null;
    this.leaderboardManager = null;
    this.document = null;
  }
}

export default RouteLeaderboardUI;