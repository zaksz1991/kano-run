import EngineVoice from "./EngineVoice.js";
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  musicEnabled: true,
  soundEnabled: true,
  masterVolume: 0.7,
  musicVolume: 0.35,
  soundVolume: 0.8,
});

const SOUND_PRESETS = Object.freeze({
  horn: { frequency: 420, duration: 0.32, waveform: "sawtooth" },
  pickup: { frequency: 660, duration: 0.12, waveform: "sine" },
  delivery: { frequency: 880, duration: 0.24, waveform: "sine" },
  collision: { frequency: 95, duration: 0.3, waveform: "sawtooth" },
  nearMiss: { frequency: 520, duration: 0.1, waveform: "triangle" },
  coin: { frequency: 1040, duration: 0.1, waveform: "sine" },
  unlock: { frequency: 740, duration: 0.25, waveform: "triangle" },
  button: { frequency: 460, duration: 0.055, waveform: "sine" },
  engineStart: { frequency: 65, duration: 0.55, waveform: "sawtooth" },
  brake: { frequency: 180, duration: 0.15, waveform: "triangle" },
  warning: { frequency: 330, duration: 0.2, waveform: "square" },
});

export default class AudioManager {
  constructor(options = {}) {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(options.settings ?? {}),
    };

    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.soundGain = null;
    this.engineOscillator = null;
    this.engineGain = null;
    this.engineFilter = null;

    this.initialized = false;
    this.destroyed = false;
    this.musicPlaying = false;
    this.engineRunning = false;
    this.activeNodes = new Set();
    this.eventUnsubscribers = [];
    this.radioTracks = [];
    this.currentTrackIndex = -1;

    this._handleVisibility = () => {
      if (typeof document !== "undefined" && document.hidden) {
        this.stopEngine();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener(
        "visibilitychange",
        this._handleVisibility
      );
    }
  }

  async initialize() {
    if (this.destroyed) return false;
    if (this.initialized) return true;

    const AudioContextClass =
      globalThis.AudioContext ??
      globalThis.webkitAudioContext;

    if (!AudioContextClass) {
      return false;
    }

    try {
      this.context = new AudioContextClass();

      this.masterGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.soundGain = this.context.createGain();

      this.musicGain.connect(this.masterGain);
      this.soundGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);

      this.applySettings();
      this.initialized = true;

      return true;
    } catch (error) {
      console.warn("[Kano Run] Audio initialization failed:", error);
      this.destroyNodes();
      return false;
    }
  }

  async resume() {
    if (!this.initialized && !(await this.initialize())) {
      return false;
    }

    try {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }

      return true;
    } catch {
      return false;
    }
  }

  applySettings() {
    if (!this.initialized) return;

    const now = this.context.currentTime;

    this.masterGain.gain.setTargetAtTime(
      this.settings.enabled
        ? this.clamp(this.settings.masterVolume, 0, 1)
        : 0,
      now,
      0.025
    );

    this.musicGain.gain.setTargetAtTime(
      this.settings.musicEnabled
        ? this.clamp(this.settings.musicVolume, 0, 1)
        : 0,
      now,
      0.025
    );

    this.soundGain.gain.setTargetAtTime(
      this.settings.soundEnabled
        ? this.clamp(this.settings.soundVolume, 0, 1)
        : 0,
      now,
      0.025
    );
  }

  setSettings(updates = {}) {
    if (this.destroyed || !updates || typeof updates !== "object") {
      return this.getSettings();
    }

    const volumeKeys = [
      "masterVolume",
      "musicVolume",
      "soundVolume",
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (!Object.prototype.hasOwnProperty.call(this.settings, key)) {
        continue;
      }

      if (volumeKeys.includes(key)) {
        const number = Number(value);

        if (Number.isFinite(number)) {
          this.settings[key] = this.clamp(number, 0, 1);
        }
      } else {
        this.settings[key] = Boolean(value);
      }
    }

    this.applySettings();
    return this.getSettings();
  }

  getSettings() {
    return { ...this.settings };
  }

  playSound(name, options = {}) {
    if (
      this.destroyed ||
      !this.settings.enabled ||
      !this.settings.soundEnabled
    ) {
      return false;
    }

    if (!this.initialized) {
      return false;
    }

    const preset = SOUND_PRESETS[name];

    if (!preset) return false;

    const frequency = this.clamp(
      Number(options.frequency ?? preset.frequency),
      20,
      12000
    );

    const duration = this.clamp(
      Number(options.duration ?? preset.duration),
      0.025,
      3
    );

    const volume = this.clamp(
      Number(options.volume ?? 0.22),
      0,
      1
    );

    try {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();

      oscillator.type = options.waveform ?? preset.waveform;
      oscillator.frequency.setValueAtTime(
        frequency,
        this.context.currentTime
      );

      gain.gain.setValueAtTime(
        Math.max(0.0001, volume),
        this.context.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        this.context.currentTime + duration
      );

      oscillator.connect(gain);
      gain.connect(this.soundGain);

      this.trackNode(oscillator);
      this.trackNode(gain);

      oscillator.onended = () => {
        this.releaseNode(oscillator);
        this.releaseNode(gain);

        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          // Nodes may already be disconnected.
        }
      };

      oscillator.start();
      oscillator.stop(this.context.currentTime + duration);

      return true;
    } catch {
      return false;
    }
  }

  startEngine() {
    if (
      this.destroyed ||
      !this.initialized ||
      this.engineRunning ||
      !this.settings.enabled ||
      !this.settings.soundEnabled
    ) {
      return false;
    }

    try {
      const oscillator = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();

      oscillator.type = "sawtooth";
      oscillator.frequency.value = 55;

      filter.type = "lowpass";
      filter.frequency.value = 280;

      gain.gain.value = 0.0001;

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.soundGain);

      oscillator.start();

      this.engineOscillator = oscillator;
      this.engineFilter = filter;
      this.engineGain = gain;
      this.engineRunning = true;

      this.trackNode(oscillator);
      this.trackNode(filter);
      this.trackNode(gain);

      gain.gain.setTargetAtTime(
        0.12,
        this.context.currentTime,
        0.15
      );

      return true;
    } catch {
      this.stopEngine();
      return false;
    }
  }

  updateEngine(speed = 0, acceleration = 0) {
    if (!this.engineRunning || !this.initialized) return;

    const safeSpeed = this.clamp(Number(speed) || 0, 0, 100);
    const safeAcceleration = this.clamp(
      Number(acceleration) || 0,
      -1,
      1
    );

    const now = this.context.currentTime;
    const frequency = 48 + safeSpeed * 5.2;
    const volume = 0.035 + (safeSpeed / 100) * 0.11;

    this.engineOscillator.frequency.setTargetAtTime(
      frequency + safeAcceleration * 16,
      now,
      0.08
    );

    this.engineFilter.frequency.setTargetAtTime(
      180 + safeSpeed * 18,
      now,
      0.12
    );

    this.engineGain.gain.setTargetAtTime(
      volume,
      now,
      0.1
    );
  }

  stopEngine() {
    if (!this.engineRunning) return;

    const oscillator = this.engineOscillator;
    const filter = this.engineFilter;
    const gain = this.engineGain;

    this.engineRunning = false;
    this.engineOscillator = null;
    this.engineFilter = null;
    this.engineGain = null;

    try {
      if (gain && this.context) {
        gain.gain.setTargetAtTime(
          0.0001,
          this.context.currentTime,
          0.04
        );
      }

      if (oscillator) {
        oscillator.stop(
          this.context
            ? this.context.currentTime + 0.2
            : undefined
        );

        oscillator.onended = () => {
          this.releaseNode(oscillator);
          this.releaseNode(filter);
          this.releaseNode(gain);

          try {
            oscillator.disconnect();
            filter?.disconnect();
            gain?.disconnect();
          } catch {
            // Already disconnected.
          }
        };
      }
    } catch {
      this.releaseNode(oscillator);
      this.releaseNode(filter);
      this.releaseNode(gain);
    }
  }

  setRadioTracks(tracks = []) {
    this.radioTracks = Array.isArray(tracks)
      ? tracks.filter(
          (track) =>
            track &&
            typeof track === "object" &&
            typeof track.name === "string"
        )
      : [];

    this.currentTrackIndex = this.radioTracks.length ? 0 : -1;

    return this.getRadioStatus();
  }

  nextRadioTrack() {
    if (!this.radioTracks.length) {
      this.currentTrackIndex = -1;
      return null;
    }

    this.currentTrackIndex =
      (this.currentTrackIndex + 1) % this.radioTracks.length;

    return this.getCurrentTrack();
  }

  previousRadioTrack() {
    if (!this.radioTracks.length) {
      this.currentTrackIndex = -1;
      return null;
    }

    this.currentTrackIndex =
      (this.currentTrackIndex - 1 + this.radioTracks.length) %
      this.radioTracks.length;

    return this.getCurrentTrack();
  }

  getCurrentTrack() {
    if (
      this.currentTrackIndex < 0 ||
      this.currentTrackIndex >= this.radioTracks.length
    ) {
      return null;
    }

    return { ...this.radioTracks[this.currentTrackIndex] };
  }

  getRadioStatus() {
    return {
      trackCount: this.radioTracks.length,
      currentTrack: this.getCurrentTrack(),
      enabled: this.settings.musicEnabled,
      volume: this.settings.musicVolume,
    };
  }

  bindEventBus(eventBus) {
    if (!eventBus || typeof eventBus.on !== "function") {
      return false;
    }

    const bindings = [
      ["audio:horn", () => this.playSound("horn")],
      ["audio:pickup", () => this.playSound("pickup")],
      ["audio:delivery", () => this.playSound("delivery")],
      ["audio:collision", () => this.playSound("collision")],
      ["audio:near-miss", () => this.playSound("nearMiss")],
      ["audio:coin", () => this.playSound("coin")],
      ["audio:unlock", () => this.playSound("unlock")],
      ["audio:button", () => this.playSound("button")],
      ["audio:engine-start", () => this.startEngine()],
      ["audio:engine-stop", () => this.stopEngine()],
    ];

    for (const [eventName, handler] of bindings) {
      const unsubscribe = eventBus.on(eventName, handler);

      if (typeof unsubscribe === "function") {
        this.eventUnsubscribers.push(unsubscribe);
      }
    }

    return true;
  }

  trackNode(node) {
    if (node) this.activeNodes.add(node);
  }

  releaseNode(node) {
    if (node) this.activeNodes.delete(node);
  }

  destroyNodes() {
    for (const node of this.activeNodes) {
      try {
        if (typeof node.stop === "function") {
          node.stop();
        }
      } catch {
        // Node may already be stopped.
      }

      try {
        node.disconnect();
      } catch {
        // Node may already be disconnected.
      }
    }

    this.activeNodes.clear();
  }

  clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    for (const unsubscribe of this.eventUnsubscribers) {
      try {
        unsubscribe();
      } catch {
        // Continue cleaning up other listeners.
      }
    }

    this.eventUnsubscribers = [];
    this.stopEngine();
    this.destroyNodes();

    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this._handleVisibility
      );
    }

    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
    }

    this.initialized = false;
    this.musicPlaying = false;
  }
  ensureEngineVoice() {
    if (this.engineVoice || !this.context || !this.soundGain) return;
    try {
      this.engineVoice = new EngineVoice({
        audioContext: this.context,
        destination: this.soundGain || this.masterGain,
      });
    } catch (e) {
      console.warn("[Kano Run] EngineVoice failed", e);
    }
  }

  updateEngine(speed = 0, maxSpeed = 34) {
    this.ensureEngineVoice();
    if (!this.engineVoice) return;
    if (!this.engineVoice.enabled) {
      this.engineVoice.setEnabled(true);
    }
    this.engineVoice.update(
      speed,
      maxSpeed,
      this.context?.currentTime ?? performance.now() / 1000
    );
  }

  setEngineEnabled(on) {
    this.ensureEngineVoice();
    this.engineVoice?.setEnabled(on);
  }

  crossfadeAmbient(theme = "city", duration = 2.0) {
    if (!this.context || this.destroyed) return;
    this.ensureContext?.();

    if (this.currentAmbientTheme === theme) return;
    this.currentAmbientTheme = theme;

    const t = this.context.currentTime;
    const fade = Math.max(0.3, duration / 2);

    // Fade out previous ambient gain
    if (this.ambientGain) {
      this.ambientGain.gain.setTargetAtTime(0.001, t, fade);
    }

    // Lightweight procedural ambient (no external files)
    try {
      if (this.ambientOsc) {
        try { this.ambientOsc.stop(); } catch (e) {}
        this.ambientOsc.disconnect();
      }
      if (!this.ambientGain) {
        this.ambientGain = this.context.createGain();
        this.ambientGain.connect(this.musicGain || this.masterGain);
      }
      this.ambientGain.gain.setValueAtTime(0.001, t);

      const osc = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";

      // Theme "vibe"
      if (theme === "city" || theme === "market") {
        osc.frequency.value = 55;
        filter.frequency.value = 400;
        this.ambientGain.gain.setTargetAtTime(0.04, t, fade);
      } else if (theme === "industrial") {
        osc.frequency.value = 40;
        filter.frequency.value = 250;
        this.ambientGain.gain.setTargetAtTime(0.035, t, fade);
      } else {
        osc.frequency.value = 70;
        filter.frequency.value = 180;
        this.ambientGain.gain.setTargetAtTime(0.025, t, fade);
      }

      osc.type = "sawtooth";
      osc.connect(filter);
      filter.connect(this.ambientGain);
      osc.start();
      this.ambientOsc = osc;
      this.ambientFilter = filter;
    } catch (e) {
      console.warn("[Kano Run] ambient crossfade failed", e);
    }
  }

  bindDistrictAudio() {
    if (!this.eventBus?.on || this._districtAudioBound) return;
    this._districtAudioBound = true;
    this.eventBus.on("scenery:districtChanged", (payload) => {
      const theme = payload?.theme || payload?.district || "city";
      this.crossfadeAmbient(String(theme).toLowerCase(), 2.0);
    });
  }

}