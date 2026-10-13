import { Logger } from "./Logger.js";

const log = new Logger("RouteStatisticsCharts");

const DEFAULT_OPTIONS = Object.freeze({
  width: 640,
  height: 280,
  padding: 44,
  background: "#0b1e3a",
  gridColor: "rgba(255,255,255,0.12)",
  textColor: "#cbd5e1",
  accentColor: "#00b4d8",
  secondaryColor: "#fbbf24",
  maxBars: 12,
});

export class RouteStatisticsCharts {
  constructor({
    container = null,
    documentRef = globalThis.document,
    options = {},
  } = {}) {
    this.container = container;
    this.document = documentRef;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.charts = new Map();
    this.resizeObserver = null;
    this.disposed = false;

    if (typeof globalThis.ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const canvas = entry.target;
          const chart = this.charts.get(canvas);

          if (chart) {
            chart.draw();
          }
        }
      });
    }
  }

  mount(container = this.container) {
    this.ensureActive();

    if (!this.document) {
      log.warn("Cannot mount charts without a browser document.");
      return null;
    }

    this.container = container || this.document.body;

    let root = this.container.querySelector(
      "[data-route-statistics-charts]"
    );

    if (root) {
      return root;
    }

    root = this.document.createElement("section");
    root.dataset.routeStatisticsCharts = "true";
    root.className = "route-statistics-charts";

    const title = this.document.createElement("h2");
    title.textContent = "Driving Analytics";

    const grid = this.document.createElement("div");
    grid.className = "route-statistics-chart-grid";

    root.append(title, grid);
    this.container.appendChild(root);

    this.injectStyles();

    return root;
  }

  injectStyles() {
    if (this.document.getElementById("route-statistics-charts-styles")) {
      return;
    }

    const style = this.document.createElement("style");
    style.id = "route-statistics-charts-styles";
    style.textContent = `
      .route-statistics-charts {
        width: 100%;
        color: #f1f5f9;
        font-family: system-ui, sans-serif;
      }
      .route-statistics-charts h2 {
        margin: 0 0 16px;
        font-size: 1.25rem;
      }
      .route-statistics-chart-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .route-statistics-chart-card {
        min-width: 0;
        padding: 14px;
        background: #0b1e3a;
        border: 1px solid rgba(0,180,216,.3);
        border-radius: 12px;
      }
      .route-statistics-chart-card h3 {
        margin: 0 0 10px;
        font-size: .95rem;
      }
      .route-statistics-chart-canvas {
        display: block;
        width: 100%;
        height: auto;
        border-radius: 6px;
      }
      .route-statistics-chart-empty {
        padding: 30px 12px;
        color: #cbd5e1;
        text-align: center;
      }
      @media (max-width: 640px) {
        .route-statistics-chart-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `;

    this.document.head.appendChild(style);
  }

  renderOverview(container, records = []) {
    this.ensureActive();

    const root = this.mount(container);
    if (!root) return null;

    const grid = root.querySelector(".route-statistics-chart-grid");
    grid.replaceChildren();

    if (!Array.isArray(records) || records.length === 0) {
      const empty = this.document.createElement("p");
      empty.className = "route-statistics-chart-empty";
      empty.textContent = "Complete a run to start building your analytics.";
      grid.appendChild(empty);
      return root;
    }

    const routeTotals = this.aggregateByRoute(records);
    const scoreTrend = this.buildTrend(records, "score");
    const distanceTrend = this.buildTrend(records, "distance");
    const earningsTotals = this.aggregateByRoute(records, "earnings");

    this.renderBarChart(grid, {
      id: "route-distance",
      title: "Distance by Route",
      labels: routeTotals.map((item) => item.label),
      values: routeTotals.map((item) => item.value),
      color: this.options.accentColor,
      valueSuffix: " km",
    });

    this.renderLineChart(grid, {
      id: "score-trend",
      title: "Score Trend",
      labels: scoreTrend.map((item) => item.label),
      values: scoreTrend.map((item) => item.value),
      color: this.options.secondaryColor,
    });

    this.renderLineChart(grid, {
      id: "distance-trend",
      title: "Distance per Run",
      labels: distanceTrend.map((item) => item.label),
      values: distanceTrend.map((item) => item.value),
      color: this.options.accentColor,
    });

    this.renderBarChart(grid, {
      id: "route-earnings",
      title: "Earnings by Route",
      labels: earningsTotals.map((item) => item.label),
      values: earningsTotals.map((item) => item.value),
      color: this.options.secondaryColor,
      valuePrefix: "₦",
    });

    return root;
  }

  renderBarChart(container, {
    id,
    title,
    labels = [],
    values = [],
    color = this.options.accentColor,
    valuePrefix = "",
    valueSuffix = "",
  } = {}) {
    const card = this.createCard(container, title);
    if (!card) return null;

    const canvas = this.createCanvas(card, id);
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      this.showCanvasFallback(card, labels, values);
      return card;
    }

    const draw = () => {
      const width = this.getCanvasWidth(canvas);
      const height = this.options.height;
      const ratio = Math.max(1, globalThis.devicePixelRatio || 1);

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.clearCanvas(ctx, width, height);

      const data = this.limitData(labels, values);
      if (!data.length) {
        this.drawEmpty(ctx, width, height);
        return;
      }

      const padding = this.options.padding;
      const plotWidth = width - padding - 14;
      const plotHeight = height - padding - 38;
      const baseline = height - padding;

      const maximum = Math.max(1, ...data.map((item) => item.value));
      this.drawGrid(ctx, padding, baseline, plotWidth, plotHeight, maximum);

      const slot = plotWidth / data.length;
      const barWidth = Math.max(4, Math.min(42, slot * 0.62));

      data.forEach((item, index) => {
        const barHeight = (item.value / maximum) * plotHeight;
        const x = padding + index * slot + (slot - barWidth) / 2;
        const y = baseline - barHeight;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = this.options.textColor;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";

        if (barHeight > 20) {
          ctx.fillText(
            `${valuePrefix}${this.compactNumber(item.value)}${valueSuffix}`,
            x + barWidth / 2,
            y - 5
          );
        }

        ctx.save();
        ctx.translate(x + barWidth / 2, baseline + 13);
        ctx.rotate(-Math.PI / 5);
        ctx.textAlign = "right";
        ctx.fillText(this.truncate(item.label, 18), 0, 0);
        ctx.restore();
      });
    };

    this.registerChart(canvas, draw);
    draw();

    return card;
  }

  renderLineChart(container, {
    id,
    title,
    labels = [],
    values = [],
    color = this.options.accentColor,
  } = {}) {
    const card = this.createCard(container, title);
    if (!card) return null;

    const canvas = this.createCanvas(card, id);
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      this.showCanvasFallback(card, labels, values);
      return card;
    }

    const draw = () => {
      const width = this.getCanvasWidth(canvas);
      const height = this.options.height;
      const ratio = Math.max(1, globalThis.devicePixelRatio || 1);

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.clearCanvas(ctx, width, height);

      const data = this.limitData(labels, values);
      if (!data.length) {
        this.drawEmpty(ctx, width, height);
        return;
      }

      const padding = this.options.padding;
      const plotWidth = width - padding - 14;
      const plotHeight = height - padding - 38;
      const baseline = height - padding;
      const maximum = Math.max(1, ...data.map((item) => item.value));

      this.drawGrid(ctx, padding, baseline, plotWidth, plotHeight, maximum);

      const points = data.map((item, index) => {
        const x = data.length === 1
          ? padding + plotWidth / 2
          : padding + (index / (data.length - 1)) * plotWidth;

        const y = baseline - (item.value / maximum) * plotHeight;

        return { ...item, x, y };
      });

      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.fillStyle = this.options.textColor;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          this.compactNumber(point.value),
          point.x,
          Math.max(12, point.y - 9)
        );
      }

      const labelStep = Math.max(1, Math.ceil(points.length / 6));

      points.forEach((point, index) => {
        if (index % labelStep !== 0 && index !== points.length - 1) {
          return;
        }

        ctx.fillStyle = this.options.textColor;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          this.truncate(point.label, 12),
          point.x,
          baseline + 18
        );
      });
    };

    this.registerChart(canvas, draw);
    draw();

    return card;
  }

  createCard(container, title) {
    if (!container || !this.document) return null;

    const card = this.document.createElement("article");
    card.className = "route-statistics-chart-card";

    const heading = this.document.createElement("h3");
    heading.textContent = title || "Statistics";

    card.appendChild(heading);
    container.appendChild(card);

    return card;
  }

  createCanvas(card, id) {
    const canvas = this.document.createElement("canvas");
    canvas.className = "route-statistics-chart-canvas";
    canvas.dataset.chartId = id || `chart-${this.charts.size + 1}`;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", card.querySelector("h3")?.textContent || "Statistics chart");
    canvas.height = this.options.height;

    card.appendChild(canvas);

    return canvas;
  }

  registerChart(canvas, draw) {
    this.unregisterChart(canvas);

    this.charts.set(canvas, { draw });

    if (this.resizeObserver) {
      this.resizeObserver.observe(canvas);
    }
  }

  unregisterChart(canvas) {
    if (this.resizeObserver) {
      this.resizeObserver.unobserve(canvas);
    }

    this.charts.delete(canvas);
  }

  aggregateByRoute(records, metric = "distance") {
    const totals = new Map();

    for (const record of records) {
      const label = this.getRouteName(record);
      const value = this.getMetric(record, metric);

      totals.set(label, (totals.get(label) || 0) + value);
    }

    return [...totals.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, this.options.maxBars);
  }

  buildTrend(records, metric) {
    return records
      .map((record, index) => ({
        label: this.getRunLabel(record, index),
        value: this.getMetric(record, metric),
        timestamp: this.getTimestamp(record),
      }))
      .sort((a, b) => {
        if (a.timestamp === null && b.timestamp === null) return 0;
        if (a.timestamp === null) return 1;
        if (b.timestamp === null) return -1;
        return a.timestamp - b.timestamp;
      })
      .slice(-this.options.maxBars);
  }

  getRouteName(record) {
    const value =
      record?.routeName ??
      record?.route_name ??
      record?.routeTitle ??
      record?.route?.name ??
      record?.route?.title ??
      record?.route ??
      record?.routeId ??
      record?.route_id;

    return value === undefined || value === null
      ? "Unknown route"
      : String(value);
  }

  getMetric(record, metric) {
    const keys = {
      distance: ["distance", "distanceKm", "distance_km"],
      score: ["score", "points", "totalScore"],
      earnings: ["earnings", "fare", "totalFare", "total_earnings"],
    }[metric] || [metric];

    for (const key of keys) {
      const value = record?.[key];

      if (value !== undefined && value !== null && value !== "") {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, number) : 0;
      }
    }

    return 0;
  }

  getTimestamp(record) {
    const value =
      record?.completedAt ??
      record?.completed_at ??
      record?.timestamp ??
      record?.date ??
      record?.createdAt ??
      record?.created_at;

    if (value === undefined || value === null) return null;

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  getRunLabel(record, index) {
    const timestamp = this.getTimestamp(record);

    if (timestamp === null) {
      return `Run ${index + 1}`;
    }

    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  limitData(labels, values) {
    if (!Array.isArray(labels) || !Array.isArray(values)) {
      return [];
    }

    return labels
      .slice(0, this.options.maxBars)
      .map((label, index) => ({
        label: String(label ?? `Item ${index + 1}`),
        value: Number.isFinite(Number(values[index]))
          ? Math.max(0, Number(values[index]))
          : 0,
      }));
  }

  clearCanvas(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.options.background;
    ctx.fillRect(0, 0, width, height);
  }

  drawGrid(ctx, left, baseline, width, height, maximum) {
    ctx.strokeStyle = this.options.gridColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = this.options.textColor;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";

    const steps = 4;

    for (let i = 0; i <= steps; i += 1) {
      const y = baseline - (i / steps) * height;
      const value = (maximum * i) / steps;

      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();

      ctx.fillText(this.compactNumber(value), left - 8, y + 3);
    }
  }

  drawEmpty(ctx, width, height) {
    ctx.fillStyle = this.options.textColor;
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data available", width / 2, height / 2);
  }

  showCanvasFallback(card, labels, values) {
    const list = this.document.createElement("ul");
    list.className = "route-statistics-chart-empty";

    const limit = Math.min(labels.length, values.length, 10);

    for (let index = 0; index < limit; index += 1) {
      const item = this.document.createElement("li");
      item.textContent = `${labels[index]}: ${values[index]}`;
      list.appendChild(item);
    }

    if (limit === 0) {
      list.textContent = "No data available.";
    }

    card.appendChild(list);
  }

  getCanvasWidth(canvas) {
    const parentWidth = canvas.parentElement?.clientWidth || 320;

    return Math.max(
      240,
      Math.min(this.options.width, parentWidth)
    );
  }

  compactNumber(value) {
    if (!Number.isFinite(value)) return "0";

    return Intl.NumberFormat(undefined, {
      notation: Math.abs(value) >= 10000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(value);
  }

  truncate(value, maxLength = 16) {
    const text = String(value ?? "");

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 1)}…`;
  }

  clear(container = this.container) {
    this.ensureActive();

    if (!container) return;

    for (const canvas of [...this.charts.keys()]) {
      this.unregisterChart(canvas);
    }

    const root = container.querySelector?.(
      "[data-route-statistics-charts]"
    );

    root?.remove();
  }

  ensureActive() {
    if (this.disposed) {
      throw new Error("RouteStatisticsCharts has been disposed.");
    }
  }

  dispose() {
    if (this.disposed) return;

    for (const canvas of [...this.charts.keys()]) {
      this.unregisterChart(canvas);
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.charts.clear();
    this.container = null;
    this.disposed = true;
  }
}

export { DEFAULT_OPTIONS };
export default RouteStatisticsCharts;