// js/core/TransitionManager.js

export class TransitionManager {
  constructor(options = {}) {
    this.options = {
      duration: 250,
      easing: "ease",
      classPrefix: "transition",
      ...options,
    };

    this.activeTransitions = new Map();
    this.listeners = new Map();
    this.destroyed = false;
  }

  run(element, options = {}) {
    if (this.destroyed) {
      return Promise.reject(
        new Error("TransitionManager has been destroyed.")
      );
    }

    if (!element || typeof element !== "object") {
      return Promise.reject(
        new TypeError("A valid element is required.")
      );
    }

    const config = {
      property: "opacity",
      from: null,
      to: null,
      duration: this.options.duration,
      easing: this.options.easing,
      delay: 0,
      fill: "both",
      ...options,
    };

    if (
      typeof config.duration !== "number" ||
      !Number.isFinite(config.duration) ||
      config.duration < 0
    ) {
      return Promise.reject(
        new RangeError("Transition duration must be a non-negative number.")
      );
    }

    this.cancel(element);

    const transitionId = Symbol("transition");
    const startedAt = performance.now();

    let resolvePromise;
    let rejectPromise;

    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const transition = {
      id: transitionId,
      element,
      config,
      startedAt,
      animation: null,
      timeoutId: null,
      settled: false,
      resolve: resolvePromise,
      reject: rejectPromise,
    };

    this.activeTransitions.set(element, transition);

    const finish = (status, error = null) => {
      if (transition.settled) {
        return;
      }

      transition.settled = true;

      if (transition.timeoutId !== null) {
        clearTimeout(transition.timeoutId);
      }

      if (this.activeTransitions.get(element) === transition) {
        this.activeTransitions.delete(element);
      }

      const result = {
        element,
        status,
        duration: performance.now() - startedAt,
        error,
      };

      if (status === "finished") {
        this.emit("finish", result);
        transition.resolve(result);
      } else if (status === "cancelled") {
        this.emit("cancel", result);
        transition.resolve(result);
      } else {
        this.emit("error", result);
        transition.reject(error ?? new Error("Transition failed."));
      }
    };

    transition.finish = finish;

    try {
      if (
        typeof element.animate === "function" &&
        config.from !== null &&
        config.to !== null
      ) {
        transition.animation = element.animate(
          [
            { [config.property]: config.from },
            { [config.property]: config.to },
          ],
          {
            duration: config.duration,
            delay: config.delay,
            easing: config.easing,
            fill: config.fill,
          }
        );

        transition.animation.onfinish = () => {
          if (config.fill !== "forwards" && config.fill !== "both") {
            element.style[config.property] = config.to;
          }

          finish("finished");
        };

        transition.animation.oncancel = () => {
          finish("cancelled");
        };
      } else {
        this.runCssTransition(transition, finish);
      }

      this.emit("start", {
        element,
        property: config.property,
        duration: config.duration,
      });
    } catch (error) {
      finish("error", error);
    }

    return promise;
  }

  runCssTransition(transition, finish) {
    const { element, config } = transition;
    const property = config.property;

    const previousTransition = element.style.transition;
    const previousValue = element.style[property];

    transition.previousTransition = previousTransition;
    transition.previousValue = previousValue;

    if (config.from !== null) {
      element.style[property] = String(config.from);
    }

    // Force the browser to apply the initial value.
    void element.offsetHeight;

    const duration = Math.max(0, config.duration);
    const delay = Math.max(0, config.delay);

    element.style.transition =
      `${property} ${duration}ms ${config.easing} ${delay}ms`;

    if (config.to !== null) {
      requestAnimationFrame(() => {
        if (
          this.activeTransitions.get(element) !== transition ||
          transition.settled
        ) {
          return;
        }

        element.style[property] = String(config.to);
      });
    }

    transition.timeoutId = setTimeout(() => {
      if (config.to !== null) {
        element.style[property] = String(config.to);
      }

      element.style.transition = previousTransition;
      finish("finished");
    }, duration + delay + 50);
  }

  fadeIn(element, options = {}) {
    if (!element) {
      return Promise.reject(new TypeError("Element is required."));
    }

    element.hidden = false;

    return this.run(element, {
      property: "opacity",
      from: 0,
      to: 1,
      ...options,
    });
  }

  fadeOut(element, options = {}) {
    if (!element) {
      return Promise.reject(new TypeError("Element is required."));
    }

    return this.run(element, {
      property: "opacity",
      from: 1,
      to: 0,
      ...options,
    }).then((result) => {
      if (result.status === "finished" && options.hide !== false) {
        element.hidden = true;
      }

      return result;
    });
  }

  slideIn(element, direction = "down", options = {}) {
    const offsets = {
      up: ["translateY(16px)", "translateY(0)"],
      down: ["translateY(-16px)", "translateY(0)"],
      left: ["translateX(16px)", "translateX(0)"],
      right: ["translateX(-16px)", "translateX(0)"],
    };

    const [from, to] = offsets[direction] ?? offsets.down;

    if (!element) {
      return Promise.reject(new TypeError("Element is required."));
    }

    element.hidden = false;

    return this.run(element, {
      property: "transform",
      from,
      to,
      ...options,
    });
  }

  slideOut(element, direction = "down", options = {}) {
    const offsets = {
      up: ["translateY(0)", "translateY(-16px)"],
      down: ["translateY(0)", "translateY(16px)"],
      left: ["translateX(0)", "translateX(-16px)"],
      right: ["translateX(0)", "translateX(16px)"],
    };

    const [from, to] = offsets[direction] ?? offsets.down;

    if (!element) {
      return Promise.reject(new TypeError("Element is required."));
    }

    return this.run(element, {
      property: "transform",
      from,
      to,
      ...options,
    }).then((result) => {
      if (result.status === "finished" && options.hide !== false) {
        element.hidden = true;
      }

      return result;
    });
  }

  cancel(element) {
    const transition = this.activeTransitions.get(element);

    if (!transition) {
      return false;
    }

    if (transition.animation) {
      transition.animation.cancel();
    } else {
      if (transition.timeoutId !== null) {
        clearTimeout(transition.timeoutId);
      }

      if (transition.previousTransition !== undefined) {
        element.style.transition = transition.previousTransition;
      }

      transition.finish("cancelled");
    }

    return true;
  }

  cancelAll() {
    for (const element of [...this.activeTransitions.keys()]) {
      this.cancel(element);
    }
  }

  isTransitioning(element) {
    return this.activeTransitions.has(element);
  }

  getActiveCount() {
    return this.activeTransitions.size;
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Transition listener must be a function.");
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) {
      return false;
    }

    const removed = callbacks.delete(callback);

    if (callbacks.size === 0) {
      this.listeners.delete(eventName);
    }

    return removed;
  }

  emit(eventName, payload) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) {
      return;
    }

    for (const callback of [...callbacks]) {
      try {
        callback(payload);
      } catch (error) {
        console.error(
          `[TransitionManager] ${eventName} listener failed:`,
          error
        );
      }
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.cancelAll();
    this.listeners.clear();
    this.destroyed = true;
  }
}

export default TransitionManager;