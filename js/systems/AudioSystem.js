/**
 * Uses real files under public/assets/models/audio/
 * Radio stations cycle like Kano FM; engine/horn SFX.
 */
const AUDIO_BASE = "/assets/models/audio";

const STATIONS = [
  { id: "arewa", name: "Arewa FM", file: `${AUDIO_BASE}/arewa.mp3` },
  { id: "freedom", name: "Freedom Radio", file: `${AUDIO_BASE}/freedom.mp3` },
  { id: "rahama", name: "Rahama Radio", file: `${AUDIO_BASE}/rahama.mp3` },
  { id: "wazobia", name: "Wazobia", file: `${AUDIO_BASE}/wazobia.mp3` },
  { id: "radio-kano", name: "Radio Kano", file: `${AUDIO_BASE}/radio-kano.mp3` },
  { id: "ruffneck", name: "Ruffneck Mix", file: `${AUDIO_BASE}/ruffneck.mp3` },
  { id: "cool", name: "Cool FM vibe", file: `${AUDIO_BASE}/cool.mp3` },
];

const SFX = {
  engine: `${AUDIO_BASE}/engine.mp3`,
  horn: `${AUDIO_BASE}/horn.mp3`,
  whistle: `${AUDIO_BASE}/whistle.mp3`,
};

export default class AudioSystem {
  constructor({ eventBus = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.config = {
      musicVolume: 0.35,
      sfxVolume: 0.45,
      engineVolume: 0.22,
      ...config,
    };
    this.stationIndex = 0;
    this.radio = null;
    this.engine = null;
    this.enabled = true;
    this.unlocked = false;
    this._disposers = [];

    this._subscribe("game:started", () => this._onStart());
    this._subscribe("game:stopped", () => this.stopAll());
    this._subscribe("game:over", () => this.stopAll());
    this._subscribe("game:paused", () => this.pauseAll());
    this._subscribe("game:resumed", () => this.resumeAll());
    this._subscribe("audio:radio-next", () => this.nextStation());
    this._subscribe("audio:horn", () => this.playSfx("horn"));
    this._subscribe("passenger:boarded", () => this.playSfx("whistle"));
    this._subscribe("passenger:dropped", () => this.playSfx("whistle"));

    this._injectRadioButton();
    this._unlockOnGesture();
  }

  _unlockOnGesture() {
    const unlock = () => {
      this.unlocked = true;
      this._ensureEngine();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  _injectRadioButton() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-radio-fab")) return;
    const fab = document.createElement("button");
    fab.id = "kano-radio-fab";
    fab.type = "button";
    fab.title = "Next radio station (R)";
    fab.textContent = "📻";
    Object.assign(fab.style, {
      position: "fixed",
      bottom: "max(16px, env(safe-area-inset-bottom))",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "1700",
      width: "48px",
      height: "48px",
      borderRadius: "50%",
      border: "1px solid rgba(0,180,216,0.5)",
      background: "rgba(15,23,42,0.9)",
      fontSize: "20px",
      cursor: "pointer",
    });
    fab.addEventListener("click", () => this.nextStation());
    document.body.appendChild(fab);

    this._onKey = (e) => {
      if (e.key === "r" || e.key === "R") this.nextStation();
      if (e.key === "h" || e.key === "H") this.playSfx("horn");
    };
    window.addEventListener("keydown", this._onKey);
  }

  _onStart() {
    this.enabled = true;
    this.playStation(this.stationIndex);
    this._ensureEngine();
    this._setEnginePlaying(true);
  }

  playStation(index) {
    this.stationIndex = ((index % STATIONS.length) + STATIONS.length) % STATIONS.length;
    const st = STATIONS[this.stationIndex];
    if (this.radio) {
      this.radio.pause();
      this.radio.src = "";
    }
    this.radio = new Audio(st.file);
    this.radio.loop = true;
    this.radio.volume = this.config.musicVolume;
    if (this.unlocked || this.enabled) {
      this.radio.play().catch(() => {});
    }
    this.eventBus?.emit?.("audio:station", { ...st });
    this.eventBus?.emit?.("hud:notify", {
      text: `📻 ${st.name}`,
      type: "normal",
    });
  }

  nextStation() {
    this.playStation(this.stationIndex + 1);
  }

  _ensureEngine() {
    if (this.engine) return;
    this.engine = new Audio(SFX.engine);
    this.engine.loop = true;
    this.engine.volume = this.config.engineVolume;
  }

  _setEnginePlaying(on) {
    if (!this.engine) return;
    if (on) this.engine.play().catch(() => {});
    else this.engine.pause();
  }

  update(deltaTime, playerZ = 0, playerSpeed = 0) {
    if (!this.engine) return;
    // Pitch-ish via playbackRate from speed
    const speed = Math.max(0, Number(playerSpeed) || 0);
    this.engine.playbackRate = 0.85 + Math.min(0.55, speed / 40);
    this.engine.volume =
      this.config.engineVolume * (0.35 + Math.min(0.65, speed / 25));
  }

  playSfx(name) {
    const src = SFX[name];
    if (!src) return;
    const a = new Audio(src);
    a.volume = this.config.sfxVolume;
    a.play().catch(() => {});
  }

  pauseAll() {
    this.radio?.pause();
    this.engine?.pause();
  }

  resumeAll() {
    this.radio?.play().catch(() => {});
    this.engine?.play().catch(() => {});
  }

  stopAll() {
    if (this.radio) {
      this.radio.pause();
      this.radio = null;
    }
    if (this.engine) {
      this.engine.pause();
    }
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.stopAll();
    document.getElementById("kano-radio-fab")?.remove();
    if (this._onKey) window.removeEventListener("keydown", this._onKey);
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}

export { STATIONS, SFX };
