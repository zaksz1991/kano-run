const DEFAULT_POLICY = {
  enabled: true,
  maxAttempts: 5,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 60000,
  retryMultiplier: 2,
  retryJitter: 0.2,
  deliveryTimeoutMs: 15000,
  deduplicate: true,
  deduplicationWindowMs: 60000,
  allowedChannels: ["in_app", "browser", "console"],
  blockedChannels: [],
  requireAlertId: true,
  requireDeliveryId: true,
  allowRetryAfterSuccess: false,
  allowRetryAfterCancellation: false,
  retainHistory: true,
  auditEnabled: true,
};

const TERMINAL_STATUSES = new Set([
  "succeeded",
  "delivered",
  "cancelled",
  "expired",
  "rejected",
]);

const RETRYABLE_STATUSES = new Set([
  "failed",
  "retry_scheduled",
  "scheduled",
  "pending",
]);

export class RouteStatisticsDashboardAlertDeliveryPolicy {
  constructor({
    config = {},
    channelPolicies = {},
    clock = () => Date.now(),
    logger = console,
  } = {}) {
    this.config = this.normalizeConfig({
      ...DEFAULT_POLICY,
      ...config,
    });

    this.channelPolicies = new Map(
      Object.entries(channelPolicies).map(([channel, policy]) => [
        channel,
        { ...policy },
      ])
    );

    this.clock = clock;
    this.logger = logger;
    this.disposed = false;
  }

  evaluate(delivery, context = {}) {
    this.assertActive();

    const violations = [];
    const warnings = [];
    const normalized = this.normalizeDelivery(delivery);
    const channelPolicy = this.channelPolicies.get(normalized.channel) || {};

    if (!this.config.enabled) {
      violations.push(this.violation("policy_disabled"));
    }

    if (
      this.config.requireDeliveryId &&
      !normalized.id
    ) {
      violations.push(this.violation("delivery_id_required"));
    }

    if (
      this.config.requireAlertId &&
      !normalized.alertId
    ) {
      violations.push(this.violation("alert_id_required"));
    }

    if (!normalized.channel || normalized.channel === "unknown") {
      violations.push(this.violation("delivery_channel_required"));
    }

    if (
      this.config.allowedChannels.length > 0 &&
      !this.config.allowedChannels.includes(normalized.channel)
    ) {
      violations.push(
        this.violation("channel_not_allowed", {
          channel: normalized.channel,
        })
      );
    }

    if (this.config.blockedChannels.includes(normalized.channel)) {
      violations.push(
        this.violation("channel_blocked", {
          channel: normalized.channel,
        })
      );
    }

    if (channelPolicy.enabled === false) {
      violations.push(
        this.violation("channel_policy_disabled", {
          channel: normalized.channel,
        })
      );
    }

    if (channelPolicy.allowed === false) {
      violations.push(
        this.violation("channel_policy_denied", {
          channel: normalized.channel,
        })
      );
    }

    if (context.enabled === false) {
      violations.push(this.violation("delivery_disabled_by_context"));
    }

    if (context.isDuplicate === true && this.config.deduplicate) {
      violations.push(this.violation("duplicate_delivery"));
    }

    if (
      context.rateLimitExceeded === true ||
      context.quotaExceeded === true
    ) {
      violations.push(this.violation("delivery_limit_exceeded"));
    }

    if (
      TERMINAL_STATUSES.has(normalized.status) &&
      normalized.status !== "succeeded" &&
      normalized.status !== "delivered"
    ) {
      violations.push(
        this.violation("delivery_terminal_state", {
          status: normalized.status,
        })
      );
    }

    if (
      normalized.status === "succeeded" ||
      normalized.status === "delivered"
    ) {
      if (!this.config.allowRetryAfterSuccess) {
        violations.push(this.violation("delivery_already_succeeded"));
      }
    }

    if (
      normalized.status === "cancelled" &&
      !this.config.allowRetryAfterCancellation
    ) {
      violations.push(this.violation("delivery_cancelled"));
    }

    if (normalized.attempts >= this.config.maxAttempts) {
      violations.push(
        this.violation("maximum_attempts_reached", {
          attempts: normalized.attempts,
          maxAttempts: this.config.maxAttempts,
        })
      );
    }

    if (channelPolicy.maxAttempts != null) {
      const channelMax = this.toPositiveInteger(
        channelPolicy.maxAttempts,
        this.config.maxAttempts
      );

      if (normalized.attempts >= channelMax) {
        violations.push(
          this.violation("channel_maximum_attempts_reached", {
            attempts: normalized.attempts,
            maxAttempts: channelMax,
          })
        );
      }
    }

    if (
      normalized.createdAt != null &&
      this.clock() - normalized.createdAt >
        this.config.deliveryTimeoutMs
    ) {
      warnings.push(
        this.violation("delivery_age_exceeds_timeout", {
          ageMs: this.clock() - normalized.createdAt,
          timeoutMs: this.config.deliveryTimeoutMs,
        })
      );
    }

    if (
      context.retryAfterSuccess === true &&
      !this.config.allowRetryAfterSuccess
    ) {
      violations.push(this.violation("retry_after_success_denied"));
    }

    if (
      context.retryAfterCancellation === true &&
      !this.config.allowRetryAfterCancellation
    ) {
      violations.push(this.violation("retry_after_cancellation_denied"));
    }

    const allowed = violations.length === 0;

    return {
      allowed,
      decision: allowed ? "allow" : "deny",
      deliveryId: normalized.id,
      alertId: normalized.alertId,
      channel: normalized.channel,
      status: normalized.status,
      violations,
      warnings,
      evaluatedAt: this.clock(),
      policy: this.getConfig(),
    };
  }

  canDeliver(delivery, context = {}) {
    return this.evaluate(delivery, context).allowed;
  }

  evaluateRetry(delivery, context = {}) {
    this.assertActive();

    const normalized = this.normalizeDelivery(delivery);
    const violations = [];
    const status = normalized.status;

    if (!this.config.enabled) {
      violations.push(this.violation("policy_disabled"));
    }

    if (!RETRYABLE_STATUSES.has(status)) {
      violations.push(
        this.violation("status_not_retryable", { status })
      );
    }

    if (
      TERMINAL_STATUSES.has(status) &&
      !(
        status === "succeeded" &&
        this.config.allowRetryAfterSuccess
      )
    ) {
      violations.push(
        this.violation("terminal_delivery_cannot_retry", { status })
      );
    }

    if (
      status === "succeeded" &&
      !this.config.allowRetryAfterSuccess
    ) {
      violations.push(this.violation("retry_after_success_denied"));
    }

    if (
      status === "cancelled" &&
      !this.config.allowRetryAfterCancellation
    ) {
      violations.push(this.violation("retry_after_cancellation_denied"));
    }

    if (normalized.attempts >= this.config.maxAttempts) {
      violations.push(
        this.violation("maximum_attempts_reached", {
          attempts: normalized.attempts,
          maxAttempts: this.config.maxAttempts,
        })
      );
    }

    if (context.retryable === false) {
      violations.push(this.violation("failure_not_retryable"));
    }

    const allowed = violations.length === 0;

    return {
      allowed,
      decision: allowed ? "allow" : "deny",
      deliveryId: normalized.id,
      attempts: normalized.attempts,
      maxAttempts: this.config.maxAttempts,
      nextDelayMs: allowed
        ? this.calculateRetryDelay(normalized.attempts)
        : null,
      violations,
      evaluatedAt: this.clock(),
    };
  }

  calculateRetryDelay(attempts = 0, overrides = {}) {
    const baseDelayMs = Math.max(
      0,
      Number(overrides.baseDelayMs ?? this.config.retryBaseDelayMs) || 0
    );

    const maxDelayMs = Math.max(
      baseDelayMs,
      Number(overrides.maxDelayMs ?? this.config.retryMaxDelayMs) ||
        this.config.retryMaxDelayMs
    );

    const multiplier = Math.max(
      1,
      Number(overrides.multiplier ?? this.config.retryMultiplier) || 1
    );

    const jitter = Math.max(
      0,
      Math.min(
        1,
        Number(overrides.jitter ?? this.config.retryJitter) || 0
      )
    );

    const exponent = Math.max(
      0,
      Math.floor(Number(attempts) || 0)
    );

    const delay = Math.min(
      maxDelayMs,
      baseDelayMs * Math.pow(multiplier, exponent)
    );

    const randomFactor = 1 - jitter + Math.random() * jitter * 2;

    return Math.max(
      0,
      Math.min(maxDelayMs, Math.round(delay * randomFactor))
    );
  }

  getChannelPolicy(channel) {
    const policy = this.channelPolicies.get(String(channel));

    return policy ? { ...policy } : null;
  }

  setChannelPolicy(channel, policy = {}) {
    this.assertActive();

    const key = String(channel || "").trim();

    if (!key) {
      throw new TypeError("A channel name is required.");
    }

    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      throw new TypeError("Channel policy must be an object.");
    }

    this.channelPolicies.set(key, { ...policy });

    return this.getChannelPolicy(key);
  }

  removeChannelPolicy(channel) {
    this.assertActive();

    return this.channelPolicies.delete(String(channel));
  }

  updateConfig(changes = {}) {
    this.assertActive();

    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new TypeError("Policy updates must be an object.");
    }

    this.config = this.normalizeConfig({
      ...this.config,
      ...changes,
    });

    return this.getConfig();
  }

  getConfig() {
    return {
      ...this.config,
      allowedChannels: [...this.config.allowedChannels],
      blockedChannels: [...this.config.blockedChannels],
    };
  }

  normalizeConfig(config) {
    return {
      ...config,
      enabled: config.enabled !== false,
      maxAttempts: this.toPositiveInteger(config.maxAttempts, 5),
      retryBaseDelayMs: Math.max(
        0,
        Number(config.retryBaseDelayMs) || 0
      ),
      retryMaxDelayMs: Math.max(
        Number(config.retryBaseDelayMs) || 0,
        Number(config.retryMaxDelayMs) || DEFAULT_POLICY.retryMaxDelayMs
      ),
      retryMultiplier: Math.max(
        1,
        Number(config.retryMultiplier) || DEFAULT_POLICY.retryMultiplier
      ),
      retryJitter: Math.max(
        0,
        Math.min(1, Number(config.retryJitter) || 0)
      ),
      deliveryTimeoutMs: Math.max(
        1,
        Number(config.deliveryTimeoutMs) ||
          DEFAULT_POLICY.deliveryTimeoutMs
      ),
      deduplicate: config.deduplicate !== false,
      deduplicationWindowMs: Math.max(
        0,
        Number(config.deduplicationWindowMs) || 0
      ),
      allowedChannels: Array.isArray(config.allowedChannels)
        ? config.allowedChannels.map(String)
        : [],
      blockedChannels: Array.isArray(config.blockedChannels)
        ? config.blockedChannels.map(String)
        : [],
      requireAlertId: config.requireAlertId !== false,
      requireDeliveryId: config.requireDeliveryId !== false,
      allowRetryAfterSuccess: config.allowRetryAfterSuccess === true,
      allowRetryAfterCancellation:
        config.allowRetryAfterCancellation === true,
      retainHistory: config.retainHistory !== false,
      auditEnabled: config.auditEnabled !== false,
    };
  }

  normalizeDelivery(delivery = {}) {
    const safe = delivery && typeof delivery === "object"
      ? delivery
      : {};

    return {
      id: safe.id == null ? "" : String(safe.id).trim(),
      alertId:
        safe.alertId == null ? "" : String(safe.alertId).trim(),
      channel: String(safe.channel || "unknown"),
      status: String(safe.status || "pending").toLowerCase(),
      attempts: Math.max(
        0,
        Math.floor(Number(safe.attempts ?? safe.attempt) || 0)
      ),
      createdAt: this.normalizeOptionalTimestamp(
        safe.createdAt ?? safe.created_at
      ),
    };
  }

  normalizeOptionalTimestamp(value) {
    if (value == null || value === "") return null;

    if (value instanceof Date) {
      const time = value.getTime();
      return Number.isFinite(time) ? time : null;
    }

    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;
  }

  toPositiveInteger(value, fallback) {
    const number = Math.floor(Number(value));

    return Number.isFinite(number) && number > 0
      ? number
      : fallback;
  }

  violation(code, details = {}) {
    return {
      code,
      details,
    };
  }

  assertActive() {
    if (this.disposed) {
      throw new Error("Delivery policy has been disposed.");
    }
  }

  dispose() {
    this.channelPolicies.clear();
    this.disposed = true;
  }
}

export default RouteStatisticsDashboardAlertDeliveryPolicy;