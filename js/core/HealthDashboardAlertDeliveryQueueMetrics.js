import HealthDashboardAlertDeliveryQueue from "./HealthDashboardAlertDeliveryQueue.js";

export class HealthDashboardAlertDeliveryQueueMetrics {
  constructor({
    queue = null,
    clock = () => Date.now(),
    sampleLimit = 300,
  } = {}) {
    this.queue = queue ?? new HealthDashboardAlertDeliveryQueue();
    this.clock = clock;
    this.sampleLimit = Math.max(10, Number(sampleLimit) || 300);

    this.samples = [];
    this.startedAt = this.clock();
    this.lastSampleAt = null;
    this.unsubscribe = null;

    this.totals = {
      enqueued: 0,
      completed: 0,
      failed: 0,
      rejected: 0,
      retried: 0,
    };
  }

  start() {
    if (this.unsubscribe) {
      return this.getMetrics();
    }

    this.unsubscribe = this.queue.subscribe((event) => {
      this.#handleEvent(event);
    });

    this.sample();

    return this.getMetrics();
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    return this.getMetrics();
  }

  sample() {
    const timestamp = this.clock();
    const status = this.queue.getStatus();
    const stats = status.stats ?? {};

    const sample = {
      timestamp,
      queueLength: status.queueLength ?? 0,
      activeWorkers: status.activeWorkers ?? 0,
      trackedJobs: status.trackedJobs ?? 0,
      completed: stats.completed ?? 0,
      failed: stats.failed ?? 0,
      rejected: stats.rejected ?? 0,
      retried: stats.retried ?? 0,
      enqueued: stats.enqueued ?? 0,
    };

    this.samples.push(sample);

    if (this.samples.length > this.sampleLimit) {
      this.samples.splice(
        0,
        this.samples.length - this.sampleLimit,
      );
    }

    this.lastSampleAt = timestamp;

    return { ...sample };
  }

  getMetrics() {
    const status = this.queue.getStatus();
    const stats = status.stats ?? {};
    const enqueued = stats.enqueued ?? 0;
    const completed = stats.completed ?? 0;
    const failed = stats.failed ?? 0;
    const rejected = stats.rejected ?? 0;
    const retried = stats.retried ?? 0;
    const attempted = completed + failed;

    return {
      uptimeMs: Math.max(0, this.clock() - this.startedAt),
      queueLength: status.queueLength ?? 0,
      activeWorkers: status.activeWorkers ?? 0,
      trackedJobs: status.trackedJobs ?? 0,
      enqueued,
      completed,
      failed,
      rejected,
      retried,
      completionRate: enqueued > 0 ? completed / enqueued : 0,
      failureRate: attempted > 0 ? failed / attempted : 0,
      rejectionRate: enqueued + rejected > 0
        ? rejected / (enqueued + rejected)
        : 0,
      retryRate: enqueued > 0 ? retried / enqueued : 0,
      throughputPerMinute: this.#calculateThroughput(),
      lastSampleAt: this.lastSampleAt,
      sampleCount: this.samples.length,
    };
  }

  getSamples({ limit = this.sampleLimit } = {}) {
    const safeLimit = Math.max(
      1,
      Math.min(this.sampleLimit, Number(limit) || this.sampleLimit),
    );

    return this.samples
      .slice(-safeLimit)
      .map((sample) => ({ ...sample }));
  }

  getTrend() {
    if (this.samples.length < 2) {
      return {
        direction: "insufficient_data",
        queueLengthChange: null,
        failureChange: null,
      };
    }

    const midpoint = Math.floor(this.samples.length / 2);
    const earlier = this.samples.slice(0, midpoint);
    const recent = this.samples.slice(midpoint);

    const average = (items, key) =>
      items.reduce((sum, item) => sum + item[key], 0) /
      items.length;

    const queueLengthChange =
      average(recent, "queueLength") -
      average(earlier, "queueLength");

    const failureChange =
      average(recent, "failed") -
      average(earlier, "failed");

    let direction = "stable";

    if (queueLengthChange > 0 || failureChange > 0) {
      direction = "worsening";
    } else if (queueLengthChange < 0 && failureChange <= 0) {
      direction = "improving";
    }

    return {
      direction,
      queueLengthChange,
      failureChange,
    };
  }

  exportReport() {
    return {
      schemaVersion: 1,
      generatedAt: this.clock(),
      metrics: this.getMetrics(),
      trend: this.getTrend(),
      samples: this.getSamples(),
    };
  }

  reset() {
    const removedSamples = this.samples.length;

    this.samples = [];
    this.startedAt = this.clock();
    this.lastSampleAt = null;

    for (const key of Object.keys(this.totals)) {
      this.totals[key] = 0;
    }

    return {
      removedSamples,
      resetAt: this.startedAt,
    };
  }

  #handleEvent(event) {
    switch (event.type) {
      case "job_enqueued":
        this.totals.enqueued += 1;
        break;
      case "job_completed":
        this.totals.completed += 1;
        break;
      case "job_failed":
        this.totals.failed += 1;
        break;
      case "job_retrying":
        this.totals.retried += 1;
        break;
      default:
        break;
    }

    this.sample();
  }

  #calculateThroughput() {
    if (this.samples.length < 2) {
      return 0;
    }

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const elapsedMs = last.timestamp - first.timestamp;

    if (elapsedMs <= 0) {
      return 0;
    }

    const completedDifference = last.completed - first.completed;

    return Math.max(0, completedDifference) / (elapsedMs / 60000);
  }
}

export default HealthDashboardAlertDeliveryQueueMetrics;