/**
 * Phase 9 — Immersion bridge
 * Uses existing core AudioManager (no second audio stack).
 * Radio reports, ambient bed, event cues, prayer-window tones.
 */
const REPORTS = {
  traffic: [
    "Traffic update: heavy movement around Sabon Gari and France Road.",
    "Expect slow traffic on Zoo Road toward Hotoro.",
    "Keke density high near Kurmi Market. Drive carefully.",
  ],
  weather: [
    "Weather desk: clear skies over Kano.",
    "Harmattan haze expected. Reduce speed.",
    "Rain possible. Roads may be slippery.",
  ],
  checkpoint: [
    "KAROTA checkpoint reported ahead. Have your papers ready.",
    "Official stop on this corridor. Keep calm.",
  ],
  market: [
    "Market alert: Kantin Kwari is congested.",
    "Kurmi Market busy. Good fares for patient drivers.",
    "Sabon Gari traders moving. Watch roadside pickups.",
  ],
  night: [
    "Night advisory: stay on main roads and stay alert.",
    "Evening traffic thinning. Watch bus stops.",
  ],
};

export default class ImmersionSystem {
  constructor({ eventBus = null, audio = null } = {}) {
    this.eventBus = eventBus;
    this.audio = audio;
    this.enabled = false;
    this._reportTimer = 25;
    this._lastMosqueHour = -1;
    this._disposers = [];
    this._bind();
  }

  async initialize() {
    // Resolve AudioManager from game if not injected
    return this;
  }

  _audio() {
    return (
      this.audio ||
      this.game?.audio ||
      this.game?.systems?.get?.("audio") ||
      null
    );
  }

  _bind() {
    this._subscribe("game:started", () => {
      this.enabled = true;
      this._reportTimer = 18;
      const a = this._audio();
      a?.startAmbientBed?.();
      a?.startRadio?.(a.radioStations?.[0]?.id || "radio-kano");
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this._audio()?.stopAmbientBed?.();
    });
    this._subscribe("daynight:changed", (p) => {
      const night = Boolean(p?.isNight || p?.phase === "night");
      this._audio()?.setAmbientNight?.(night);
      this._mosqueCue(Number(p?.hour));
    });
    this._subscribe("time:tick", (p) => this._mosqueCue(Number(p?.hour)));
    this._subscribe("audio:horn", () => this._audio()?.playSFX?.("horn"));
    this._subscribe("traffic:honk", () => this._audio()?.playSFX?.("horn"));
    this._subscribe("passenger:boarded", () => {
      this._audio()?.playSFX?.("whistle");
      this._say("Passenger on board.");
    });
    this._subscribe("passenger:dropped", () => {
      this._audio()?.playSFX?.("whistle");
      this._say("Drop complete. God bless.");
    });
    this._subscribe("checkpoint:approach", () => {
      this._audio()?.playTone?.(190, 0.12, "square");
      this._report("checkpoint");
    });
    this._subscribe("chase:started", () => {
      this._audio()?.playSFX?.("siren_on");
      this._say("Police chase. Stay calm.");
    });
    this._subscribe("chase:escaped", () => {
      this._audio()?.playSFX?.("siren_off");
      this._say("Chase cleared.");
    });
    this._subscribe("yandaba:encounter", () => {
      this._audio()?.playTone?.(130, 0.2, "sawtooth");
      this._say("Caution on the roadside.");
    });
    this._subscribe("weather:changed", () => this._report("weather"));
    this._subscribe("busstop:spawned", () => {
      if (Math.random() < 0.3) this._report("market");
    });
  }

  _say(text) {
    this._audio()?.announce?.(text);
    this.eventBus?.emit?.("hud:notify", { text: `📻 ${text}`, type: "info" });
  }

  _report(kind) {
    const pool = REPORTS[kind] || REPORTS.traffic;
    const line = pool[Math.floor(Math.random() * pool.length)];
    this._say(line);
  }

  _mosqueCue(hour) {
    if (!Number.isFinite(hour)) return;
    const h = Math.floor(hour);
    if (![5, 13, 16, 18].includes(h) || this._lastMosqueHour === h) return;
    this._lastMosqueHour = h;
    const a = this._audio();
    a?.playTone?.(392, 0.35, "sine");
    setTimeout(() => a?.playTone?.(440, 0.4, "sine"), 400);
    setTimeout(() => a?.playTone?.(349, 0.45, "sine"), 850);
    this.eventBus?.emit?.("hud:notify", {
      text: "Mosque area — ease your speed",
      type: "info",
    });
  }

  update(dt = 0) {
    if (!this.enabled) return;
    this._reportTimer -= dt;
    if (this._reportTimer <= 0) {
      this._reportTimer = 40 + Math.random() * 30;
      const kinds = ["traffic", "market", "weather", "night"];
      this._report(kinds[Math.floor(Math.random() * kinds.length)]);
    }
  }

  _subscribe(name, h) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, h);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._audio()?.stopAmbientBed?.();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
  }
}
