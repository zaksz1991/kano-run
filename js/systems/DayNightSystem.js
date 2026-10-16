import { GAME_CONFIG } from "../core/config.js";

/**
 * dayProgress 0 = midnight, 0.5 = noon, 1 = next midnight.
 * LightingSystem reads dayProgress as timeOfDay — must stay consistent.
 * Previous bug: elapsedTime started at 0 → first frame dayProgress≈0 (pitch black)
 * while UI still said "Sunny".
 */
const DEFAULTS = {
  dayDuration: 900, // 15 real minutes per full 24h (was 300 = too fast)
  dayStart: 6,
  nightStart: 19,
  startHour: 12, // noon
  lockDay: false, // set true to freeze daylight forever
};

export default class DayNightSystem {
  constructor({ eventBus = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.dayNight ?? {}), ...config };

    this.elapsedTime = 0;
    this.currentHour = this.config.startHour;
    this.currentMinute = 0;
    this.dayCount = 0;
    this.enabled = false;
    this.paused = false;
    this._disposers = [];

    // Align elapsed so first update is NOT midnight
    this._syncElapsedFromHour(this.config.startHour, 0);
  }

  _syncElapsedFromHour(hour, minute = 0) {
    const h = ((Number(hour) % 24) + 24) % 24;
    const m = Math.max(0, Math.min(59, Number(minute) || 0));
    const progress = (h + m / 60) / 24; // 0..1, midnight=0, noon=0.5
    this.elapsedTime = progress * this.config.dayDuration;
    this.currentHour = Math.floor(h);
    this.currentMinute = Math.floor(m);
  }

  initialize() {
    this.enabled = true;
    this._subscribe("game:paused", () => {
      this.paused = true;
    });
    this._subscribe("game:resumed", () => {
      this.paused = false;
    });
    this._subscribe("game:started", () => {
      // Re-assert noon (or startHour) every new run
      this._syncElapsedFromHour(this.config.startHour, 0);
      this._emit();
    });
    this._subscribe("daynight:lock-day", () => {
      this.config.lockDay = true;
      this._syncElapsedFromHour(12, 0);
      this._emit();
    });
    this._subscribe("daynight:unlock", () => {
      this.config.lockDay = false;
    });

    this._emit();
    return this;
  }

  _emit() {
    const dayProgress =
      (this.elapsedTime % this.config.dayDuration) / this.config.dayDuration;
    const hourFloat = dayProgress * 24;
    this.currentHour = Math.floor(hourFloat) % 24;
    this.currentMinute = Math.floor((hourFloat * 60) % 60);
    const isNight =
      this.currentHour >= this.config.nightStart ||
      this.currentHour < this.config.dayStart;

    this.eventBus?.emit?.("daynight:timeUpdate", {
      hour: this.currentHour,
      minute: this.currentMinute,
      dayProgress,
      isNight,
      phase: isNight ? "night" : "day",
    });
  }

  update(deltaTime) {
    if (!this.enabled || this.paused) return;

    if (this.config.lockDay) {
      // Stay near noon
      this._syncElapsedFromHour(12, 0);
      this._emit();
      return;
    }

    this.elapsedTime += Math.max(0, Number(deltaTime) || 0);

    const dayProgress =
      (this.elapsedTime % this.config.dayDuration) / this.config.dayDuration;
    const hourFloat = dayProgress * 24;
    this.currentHour = Math.floor(hourFloat) % 24;
    this.currentMinute = Math.floor((hourFloat * 60) % 60);

    const isNight =
      this.currentHour >= this.config.nightStart ||
      this.currentHour < this.config.dayStart;

    this.eventBus?.emit?.("daynight:timeUpdate", {
      hour: this.currentHour,
      minute: this.currentMinute,
      dayProgress,
      isNight,
      phase: isNight ? "night" : "day",
    });

    if (dayProgress < 0.002 && this.elapsedTime > this.config.dayDuration) {
      this.dayCount += 1;
      this.eventBus?.emit?.("daynight:newDay", { day: this.dayCount });
    }
  }

  setTime(hour, minute = 0) {
    this._syncElapsedFromHour(hour, minute);
    this._emit();
  }

  skipToNight() {
    this.setTime(20, 0);
  }

  skipToDay() {
    this.setTime(12, 0);
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    for (const unsub of this._disposers) {
      try {
        unsub();
      } catch {}
    }
    this._disposers = [];
  }
}
