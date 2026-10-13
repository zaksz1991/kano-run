export class AlertQueueDashboardFilters {
  constructor(options = {}) {
    this.filters = {
      status: options.status ?? "all",
      severity: options.severity ?? "all",
      search: options.search ?? "",
      acknowledged: options.acknowledged ?? "all",
      limit: this.normalizeLimit(options.limit ?? 100),
    };

    this.listeners = new Set();
  }

  setFilters(updates = {}) {
    const next = { ...this.filters };

    if (updates.status !== undefined) {
      next.status = this.normalizeChoice(updates.status, [
        "all",
        "pending",
        "processing",
        "completed",
        "failed",
      ]);
    }

    if (updates.severity !== undefined) {
      next.severity = this.normalizeChoice(updates.severity, [
        "all",
        "info",
        "warning",
        "error",
        "critical",
      ]);
    }

    if (updates.search !== undefined) {
      next.search = String(updates.search ?? "").trim().slice(0, 200);
    }

    if (updates.acknowledged !== undefined) {
      next.acknowledged = this.normalizeChoice(
        updates.acknowledged,
        ["all", "yes", "no"]
      );
    }

    if (updates.limit !== undefined) {
      next.limit = this.normalizeLimit(updates.limit);
    }

    this.filters = next;
    this.notify();

    return this.getFilters();
  }

  getFilters() {
    return { ...this.filters };
  }

  apply(items = []) {
    if (!Array.isArray(items)) return [];

    const { status, severity, search, acknowledged, limit } =
      this.filters;

    const query = search.toLowerCase();

    return items
      .filter((item) => {
        if (!item || typeof item !== "object") return false;

        if (
          status !== "all" &&
          String(item.status ?? "").toLowerCase() !== status
        ) {
          return false;
        }

        if (
          severity !== "all" &&
          String(item.severity ?? "").toLowerCase() !== severity
        ) {
          return false;
        }

        if (acknowledged !== "all") {
          const isAcknowledged = Boolean(item.acknowledged);

          if (
            acknowledged === "yes" &&
            !isAcknowledged
          ) {
            return false;
          }

          if (
            acknowledged === "no" &&
            isAcknowledged
          ) {
            return false;
          }
        }

        if (query) {
          const searchable = [
            item.id,
            item.message,
            item.title,
            item.type,
            item.status,
            item.severity,
          ]
            .filter((value) => value !== undefined && value !== null)
            .join(" ")
            .toLowerCase();

          if (!searchable.includes(query)) return false;
        }

        return true;
      })
      .slice(0, limit);
  }

  reset() {
    this.filters = {
      status: "all",
      severity: "all",
      search: "",
      acknowledged: "all",
      limit: 100,
    };

    this.notify();

    return this.getFilters();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener must be a function.");
    }

    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  notify() {
    const snapshot = this.getFilters();

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("Alert dashboard filter listener failed:", error);
      }
    }
  }

  normalizeChoice(value, allowed) {
    const normalized = String(value ?? "all").toLowerCase();

    return allowed.includes(normalized) ? normalized : "all";
  }

  normalizeLimit(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return 100;

    return Math.min(1000, Math.max(1, Math.floor(number)));
  }

  destroy() {
    this.listeners.clear();
  }
}