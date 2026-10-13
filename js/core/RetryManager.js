export default class RetryManager {
  #options;
  #disposed = false;
  #activeRetries = new Set();

  constructor(options = {}) {
    this.#options = {
      maxAttempts: options.maxAttempts ?? 3,
      baseDelay: options.baseDelay ?? 500,
      maxDelay: options.maxDelay ?? 10000,
      factor: options.factor ?? 2,
      jitter: options.jitter ?? true,
      shouldRetry: options.shouldRetry ?? (() => true),
      onRetry: options.onRetry ?? null,
    };

    if (
      !Number.isInteger(this.#options.maxAttempts) ||
      this.#options.maxAttempts < 1
    ) {
      throw new RangeError("maxAttempts must be at least 1.");
    }

    if (
      !Number.isFinite(this.#options.baseDelay) ||
      this.#options.baseDelay < 0
    ) {
      throw new RangeError("baseDelay must be non-negative.");
    }

    if (
      !Number.isFinite(this.#options.maxDelay) ||
      this.#options.maxDelay < 0
    ) {
      throw new RangeError("maxDelay must be non-negative.");
    }

    if (
      !Number.isFinite(this.#options.factor) ||
      this.#options.factor < 1
    ) {
      throw new RangeError("factor must be at least 1.");
    }
  }

  async execute(operation, options = {}) {
    this.#assertActive();

    if (typeof operation !== "function") {
      throw new TypeError("operation must be a function.");
    }

    const settings = {
      ...this.#options,
      ...options,
    };

    const controller = new AbortController();
    const retry = { controller };

    this.#activeRetries.add(retry);

    const externalSignal = settings.signal;
    const onExternalAbort = () => controller.abort();

    if (externalSignal?.aborted) {
      this.#activeRetries.delete(retry);
      throw this.#abortError();
    }

    externalSignal?.addEventListener(
      "abort",
      onExternalAbort,
      { once: true }
    );

    try {
      let lastError;

      for (
        let attempt = 1;
        attempt <= settings.maxAttempts;
        attempt += 1
      ) {
        if (this.#disposed || controller.signal.aborted) {
          throw this.#abortError();
        }

        try {
          return await operation({
            attempt,
            signal: controller.signal,
          });
        } catch (error) {
          lastError = error;

          if (
            this.#disposed ||
            controller.signal.aborted
          ) {
            throw this.#abortError();
          }

          if (
            attempt >= settings.maxAttempts ||
            !(await settings.shouldRetry(error, attempt))
          ) {
            throw error;
          }

          const delay = this.#calculateDelay(
            attempt,
            settings
          );

          if (typeof settings.onRetry === "function") {
            await settings.onRetry({
              error,
              attempt,
              nextAttempt: attempt + 1,
              delay,
            });
          }

          await this.#wait(delay, controller.signal);
        }
      }

      throw lastError;
    } finally {
      externalSignal?.removeEventListener(
        "abort",
        onExternalAbort
      );

      this.#activeRetries.delete(retry);
    }
  }

  #calculateDelay(attempt, settings) {
    const exponential = Math.min(
      settings.maxDelay,
      settings.baseDelay *
        Math.pow(settings.factor, attempt - 1)
    );

    if (!settings.jitter) {
      return exponential;
    }

    return Math.random() * exponential;
  }

  #wait(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(this.#abortError());
        return;
      }

      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(this.#abortError());
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, milliseconds);

      signal.addEventListener("abort", onAbort, {
        once: true,
      });
    });
  }

  #abortError() {
    return new DOMException(
      "Retry operation was aborted.",
      "AbortError"
    );
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error("RetryManager has been disposed.");
    }
  }

  cancelAll() {
    for (const retry of this.#activeRetries) {
      retry.controller.abort();
    }

    this.#activeRetries.clear();
  }

  dispose() {
    if (this.#disposed) return;

    this.cancelAll();
    this.#disposed = true;
  }
}