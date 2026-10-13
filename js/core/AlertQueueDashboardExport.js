export class AlertQueueDashboardExport {
  constructor(options = {}) {
    this.dashboard = options.dashboard ?? null;
    this.state = options.state ?? null;
    this.report = options.report ?? null;
    this.clock = options.clock ?? (() => new Date());
  }

  exportJSON(options = {}) {
    try {
      const payload = this.buildPayload(options);
      const content = JSON.stringify(payload, null, 2);

      return {
        ok: true,
        format: "json",
        filename: this.createFilename("json"),
        content,
        data: payload,
      };
    } catch (error) {
      return {
        ok: false,
        format: "json",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  exportCSV(options = {}) {
    try {
      const payload = this.buildPayload(options);
      const rows = this.flattenPayload(payload);
      const headers = ["section", "field", "value"];

      const content = [
        headers.map((value) => this.escapeCSV(value)).join(","),
        ...rows.map((row) =>
          row.map((value) => this.escapeCSV(value)).join(",")
        ),
      ].join("\r\n");

      return {
        ok: true,
        format: "csv",
        filename: this.createFilename("csv"),
        content,
        rows: rows.length,
      };
    } catch (error) {
      return {
        ok: false,
        format: "csv",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  download(format = "json", options = {}) {
    const result = format === "csv"
      ? this.exportCSV(options)
      : this.exportJSON(options);

    if (!result.ok) return result;

    const BlobClass = options.Blob ?? globalThis.Blob;
    const URLObject = options.URL ?? globalThis.URL;
    const documentObject = options.document ?? globalThis.document;

    if (
      typeof BlobClass !== "function" ||
      !URLObject?.createObjectURL ||
      !documentObject?.createElement
    ) {
      return {
        ...result,
        downloaded: false,
        reason: "download_unavailable",
      };
    }

    let objectURL;

    try {
      const blob = new BlobClass(
        [result.content],
        {
          type: format === "csv"
            ? "text/csv;charset=utf-8"
            : "application/json;charset=utf-8",
        }
      );

      objectURL = URLObject.createObjectURL(blob);

      const anchor = documentObject.createElement("a");
      anchor.href = objectURL;
      anchor.download = result.filename;
      anchor.style.display = "none";

      documentObject.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      return {
        ...result,
        downloaded: true,
      };
    } catch (error) {
      return {
        ...result,
        downloaded: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (objectURL) {
        URLObject.revokeObjectURL(objectURL);
      }
    }
  }

  buildPayload(options = {}) {
    let dashboardData = {};

    if (typeof this.dashboard?.getDashboardData === "function") {
      dashboardData = this.dashboard.getDashboardData() ?? {};
    }

    const stateData = typeof this.state?.getState === "function"
      ? this.state.getState()
      : {};

    const reportData = typeof this.report?.generate === "function"
      ? this.report.generate(options)
      : null;

    return {
      application: "Kano Run Alert Queue Dashboard",
      exportedAt: this.clock().toISOString(),
      version: 1,
      status: dashboardData.status ?? stateData.status ?? "unknown",
      metrics: {
        ...(stateData.metrics ?? {}),
        ...(dashboardData.metrics ?? {}),
      },
      notifications: Array.isArray(dashboardData.notifications)
        ? dashboardData.notifications
        : Array.isArray(stateData.notifications)
          ? stateData.notifications
          : [],
      history: Array.isArray(stateData.history)
        ? stateData.history
        : [],
      report: reportData,
    };
  }

  flattenPayload(payload) {
    const rows = [];

    const visit = (section, value, prefix = "") => {
      if (value === null || value === undefined) {
        rows.push([section, prefix || "value", ""]);
        return;
      }

      if (Array.isArray(value)) {
        if (value.length === 0) {
          rows.push([section, prefix || "value", "[]"]);
          return;
        }

        value.forEach((item, index) => {
          visit(section, item, `${prefix}[${index}]`);
        });

        return;
      }

      if (typeof value === "object") {
        const entries = Object.entries(value);

        if (entries.length === 0) {
          rows.push([section, prefix || "value", "{}"]);
          return;
        }

        for (const [key, item] of entries) {
          const nextPrefix = prefix ? `${prefix}.${key}` : key;
          visit(section, item, nextPrefix);
        }

        return;
      }

      rows.push([section, prefix || "value", String(value)]);
    };

    for (const [key, value] of Object.entries(payload)) {
      if (key === "application" || key === "exportedAt" || key === "version") {
        rows.push(["metadata", key, String(value)]);
      } else {
        visit(key, value);
      }
    }

    return rows;
  }

  escapeCSV(value) {
    const text = String(value ?? "");

    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  }

  createFilename(extension) {
    const date = this.clock().toISOString().replace(/[:.]/g, "-");
    return `alert-queue-dashboard-${date}.${extension}`;
  }
}