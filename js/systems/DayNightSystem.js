import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  dayDuration: 300, // 5 minutes for a full 24h cycle
  dayStart: 6,      // 6 AM
  nightStart: 18,   // 6 PM
};

export default class DayNightSystem {
  constructor({ eventBus = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.dayNight ?? {}), ...config };

    this.elapsedTime = 0;
    this.currentHour = 12; // Start at noon
    this.currentMinute = 0;
    this.dayCount = 0;
    this.enabled = false;
    this.paused = false;

    this._disposers = [];
  }

  initialize() {
    this.enabled = true;
    this._subscribe("game:paused", () => { this.paused = true; });
    this._subscribe("game:resumed", () => { this.paused = false; });
    
    // Emit initial state so LightingSystem can set up immediately
    this.eventBus?.emit?.("daynight:timeUpdate", {
      hour: this.currentHour,
      minute: this.currentMinute,
      dayProgress: 0.5,
      isNight: false,
    });
  }

  update(deltaTime) {
    if (!this.enabled || this.paused) return;

    this.elapsedTime += deltaTime;
    
    // Calculate time of day (0 to 1)
    const dayProgress = (this.elapsedTime % this.config.dayDuration) / this.config.dayDuration;
    
    // Convert to 24-hour format
    this.currentHour = Math.floor(this.config.dayStart + dayProgress * 24) % 24;
    this.currentMinute = Math.floor((dayProgress * 24 * 60) % 60);

    // 🔥 Drive LightingSystem via EventBus
    this.eventBus?.emit?.("daynight:timeUpdate", {
      hour: this.currentHour,
      minute: this.currentMinute,
      dayProgress,
      isNight: this.currentHour >= this.config.nightStart || this.currentHour < this.config.dayStart,
    });

    // Track day count
    if (dayProgress < 0.01 && this.elapsedTime > this.config.dayDuration) {
      this.dayCount++;
      this.eventBus?.emit?.("daynight:newDay", { day: this.dayCount });
    }
  }

  setTime(hour, minute = 0) {
    const totalMinutes = hour * 60 + minute;
    this.elapsedTime = (totalMinutes / 60) * (this.config.dayDuration / 24);
  }

  skipToNight() { this.setTime(19, 0); }
  skipToDay() { this.setTime(8, 0); }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}