const DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 0.7,
  musicVolume: 0.35,
  effectsVolume: 0.8,
  radioVolume: 0.45,
  muted: false,
  radioEnabled: true,
  engineEnabled: true,
});

const SOUND_PRESETS = Object.freeze({
  engine: { frequency: 65, type: "sawtooth", volume: 0.12 },
  horn: { frequency: 390, type: "square", volume: 0.25 },
  collision: { frequency: 95, type: "sawtooth", volume: 0.3 },
  pickup: { frequency: 620, type: "sine", volume: 0.18 },
  delivery: { frequency: 780, type: "sine", volume: 0.22 },
  nearMiss: { frequency: 950, type: "triangle", volume: 0.12 },
  levelUp: { frequency: 880, type: "sine", volume: 0.2 },
  unlock: { frequency: 1040, type: "triangle", volume: 0.2 },
  button: { frequency: 440, type: "sine", volume: 0.08 },
  refuel: { frequency: 330, type: "triangle", volume: 0.12 },
  repair: { frequency: 260, type: "sine", volume: 0.12 },
});

export default class AudioSystem {
  constructor({
    eventBus = null,
    saveManager = null,
    settings = {},
    radioTracks = [],
  } = {}) {
    this.eventBus = eventBus;
    this.saveManager = saveManager;

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...settings,
    };

    this.radioTracks = Array.isArray(radioTracks)
      ? radioTracks.filter(
          (track) => track && typeof track.src === "string" && track.src.trim()
        )
      : [];

    this.context = null;
    this.masterGain = null;
    this.effectsGain = null;
    this.musicGain = null;
    this.radioGain = null;

    this.engineOscillator = null;
    this.engineGain = null;
    this.engineFilter = null;

    this.radioAudio = null;
    this.radioObjectUrl = null;

    this.listeners = [];
    this.activeSounds = new Set();
    this.destroyed = false;
    this.initialized = false;
    this.engineRunning = false;
    this.radioIndex = -1;
    this.radioPlaying = false;
    this.radioUnavailable = false;
    this.lastEngineUpdate = 0;

    this.bindEvents();
  }

  bindEvents() {
    this.listen("run:started", () => {
      this.startEngine();
    });

    this.listen("run:finished", () => {
      this.stopEngine();
    });

    this.listen("player:collision", () => {
      this.play("collision");
    });

    this.listen("traffic:near-miss", () => {
      this.play("nearMiss");
    });

    this.listen("passengers:picked-up", () => {
      this.play("pickup");
    });

    this.listen("passengers:delivered", () => {
      this.play("delivery");
    });

    this.listen("progression:level-up", () => {
      this.play("levelUp");
    });

    this.listen("progression:item-unlocked", () => {
      this.play("unlock");
    });

    this.listen("ui:button", () => {
      this.play("button");
    });

    this.listen("economy:vehicle-repaired", () => {
      this.play("repair");
    });

    this.listen("economy:fuel-purchased", () => {
      this.play("refuel");
    });
  }

  listen(eventName, callback) {
    if (!this.eventBus || typeof this.eventBus.on !== "function") return;

    const unsubscribe = this.eventBus.on(eventName, callback);

    if (typeof unsubscribe === "function") {
      this.listeners.push(unsubscribe);
    } else if (typeof this.eventBus.off === "function") {
      this.listeners.push(() => this.eventBus.off(eventName, callback));
    }
  }

  async initialize() {
    if (this.destroyed) return false;
    if (this.initialized) return true;

    const AudioContextClass =
      globalThis.AudioContext || globalThis.webkitAudioContext;

    if (!AudioContextClass) {
      this.initialized = true;
      return false;
    }

    try {
      this.context = new AudioContextClass();

      this.masterGain = this.context.createGain();
      this.effectsGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.radioGain = this.context.createGain();

      this.effectsGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.radioGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);

      this.applyVolumes();
      this.initialized = true;

      if (this.settings.engineEnabled && this.engineRunning) {
        this.createEngineSound();
      }

      return true;
    } catch {
      this.initialized = true;
      return false;
    }
  }

  async resume() {
    if (!this.context) {
      await this.initialize();
    }

    if (!this.context) return false;

    try {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }

      return this.context.state === "running";
    } catch {
      return false;
    }
  }

  applyVolumes() {
    const master = this.settings.muted
      ? 0
      : this.clamp(this.settings.masterVolume, 0, 1);

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        master,
        this.context.currentTime,
        0.03
      );
    }

    if (this.effectsGain) {
      this.effectsGain.gain.setTargetAtTime(
        this.clamp(this.settings.effectsVolume, 0, 1),
        this.context.currentTime,
        0.03
      );
    }

    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(
        this.clamp(this.settings.musicVolume, 0, 1),
        this.context.currentTime,
        0.03
      );
    }

    if (this.radioGain) {
      this.radioGain.gain.setTargetAtTime(
        this.settings.radioEnabled
          ? this.clamp(this.settings.radioVolume, 0, 1)
          : 0,
        this.context.currentTime,
        0.03
      );
    }

    if (this.radioAudio) {
      this.radioAudio.volume = this.settings.muted
        ? 0
        : this.clamp(
            this.settings.masterVolume * this.settings.radioVolume,
            0,
            1
          );
    }
  }

  async play(name, options = {}) {
    if (this.destroyed || this.settings.muted) return false;

    const preset = SOUND_PRESETS[name];

    if (!preset) return false;

    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.context || !(await this.resume())) {
      return false;
    }

    const {
      frequency = preset.frequency,
      duration = 0.16,
      volume = preset.volume,
      type = preset.type,
      endFrequency = null,
    } = options;

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(
      Math.max(20, Number(frequency) || preset.frequency),
      this.context.currentTime
    );

    if (Number.isFinite(endFrequency)) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        this.context.currentTime + Math.max(0.04, duration)
      );
    }

    const soundVolume = this.clamp(Number(volume) || 0, 0, 1);

    gain.gain.setValueAtTime(0.001, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, soundVolume),
      this.context.currentTime + 0.015
    );
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.context.currentTime + Math.max(0.04, duration)
    );

    oscillator.connect(gain);
    gain.connect(this.effectsGain);

    const sound = { oscillator, gain };
    this.activeSounds.add(sound);

    oscillator.onended = () => {
      this.activeSounds.delete(sound);

      try {
        oscillator.disconnect();
        gain.disconnect();
      } catch {
        // Nodes may already be disconnected.
      }
    };

    oscillator.start();
    oscillator.stop(this.context.currentTime + Math.max(0.05, duration));

    return true;
  }

  async playHorn() {
    if (this.destroyed || this.settings.muted) return false;

    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.context || !(await this.resume())) {
      return false;
    }

    return this.play("horn", {
      frequency: 390,
      endFrequency: 340,
      duration: 0.45,
      volume: 0.25,
    });
  }

  createEngineSound() {
    if (
      !this.context ||
      this.engineOscillator ||
      !this.settings.engineEnabled
    ) {
      return;
    }

    this.engineOscillator = this.context.createOscillator();
    this.engineGain = this.context.createGain();
    this.engineFilter = this.context.createBiquadFilter();

    this.engineOscillator.type = "sawtooth";
    this.engineOscillator.frequency.value = 55;

    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 250;

    this.engineGain.gain.value = 0.001;

    this.engineOscillator.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.effectsGain);

    this.engineOscillator.start();
  }

  async startEngine() {
    this.engineRunning = true;

    if (!this.settings.engineEnabled) return;

    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.context || !(await this.resume())) return;

    this.createEngineSound();

    if (this.engineGain) {
      this.engineGain.gain.setTargetAtTime(
        0.08,
        this.context.currentTime,
        0.2
      );
    }
  }

  stopEngine() {
    this.engineRunning = false;

    if (!this.context || !this.engineGain) return;

    this.engineGain.gain.setTargetAtTime(
      0.001,
      this.context.currentTime,
      0.1
    );
  }

  updateEngine({ speed = 0, acceleration = 0 } = {}) {
    if (
      !this.engineRunning ||
      !this.engineOscillator ||
      !this.context ||
      !this.settings.engineEnabled
    ) {
      return;
    }

    const now = this.context.currentTime;

    if (now - this.lastEngineUpdate < 0.04) return;
    this.lastEngineUpdate = now;

    const safeSpeed = this.clamp(Number(speed) || 0, 0, 60);
    const safeAcceleration = this.clamp(
      Number(acceleration) || 0,
      -1,
      1
    );

    const frequency = 48 + safeSpeed * 5 + safeAcceleration * 18;
    const volume = 0.025 + (safeSpeed / 60) * 0.09;

    this.engineOscillator.frequency.setTargetAtTime(
      frequency,
      now,
      0.08
    );

    this.engineFilter.frequency.setTargetAtTime(
      180 + safeSpeed * 16,
      now,
      0.1
    );

    this.engineGain.gain.setTargetAtTime(
      volume,
      now,
      0.08
    );
  }

  async playRadioTrack(index = 0) {
    if (this.destroyed || !this.settings.radioEnabled) return false;
    if (this.radioTracks.length === 0) return false;

    const normalizedIndex =
      ((Math.floor(index) % this.radioTracks.length) +
        this.radioTracks.length) %
      this.radioTracks.length;

    const track = this.radioTracks[normalizedIndex];

    if (!track?.src) return false;

    this.stopRadio();

    const audio = new Audio(track.src);

    audio.preload = "auto";
    audio.loop = Boolean(track.loop);
    audio.volume = this.settings.muted
      ? 0
      : this.clamp(
          this.settings.masterVolume * this.settings.radioVolume,
          0,
          1
        );

    audio.addEventListener("ended", this.handleRadioEnded);

    this.radioAudio = audio;
    this.radioIndex = normalizedIndex;

    try {
      await audio.play();
      this.radioPlaying = true;

      this.emit("radio:track-changed", {
        index: normalizedIndex,
        title: track.title || `Radio Track ${normalizedIndex + 1}`,
        artist: track.artist || "RuffNeck Radio",
        playing: true,
      });

      return true;
    } catch {
      this.radioPlaying = false;

      this.emit("radio:playback-blocked", {
        index: normalizedIndex,
        reason: "browser_policy_or_media_error",
      });

      return false;
    }
  }

  handleRadioEnded = () => {
    this.radioPlaying = false;

    if (this.radioAudio) {
      this.radioAudio.removeEventListener("ended", this.handleRadioEnded);
    }

    if (this.settings.radioEnabled && this.radioTracks.length > 1) {
      this.playNextRadioTrack();
    }
  };

  async playNextRadioTrack() {
    if (this.radioTracks.length === 0) return false;

    const nextIndex = (this.radioIndex + 1) % this.radioTracks.length;
    return this.playRadioTrack(nextIndex);
  }

  async playPreviousRadioTrack() {
    if (this.radioTracks.length === 0) return false;

    const previousIndex =
      (this.radioIndex - 1 + this.radioTracks.length) %
      this.radioTracks.length;

    return this.playRadioTrack(previousIndex);
  }

  stopRadio() {
    if (!this.radioAudio) {
      this.radioPlaying = false;
      return;
    }

    this.radioAudio.removeEventListener("ended", this.handleRadioEnded);
    this.radioAudio.pause();

    try {
      this.radioAudio.currentTime = 0;
    } catch {
      // Some streaming sources do not support seeking.
    }

    this.radioAudio.src = "";
    this.radioAudio.load();
    this.radioAudio = null;
    this.radioPlaying = false;
  }

  toggleRadio() {
    this.settings.radioEnabled = !this.settings.radioEnabled;

    if (!this.settings.radioEnabled) {
      this.stopRadio();
    } else if (this.radioIndex >= 0) {
      this.playRadioTrack(this.radioIndex);
    }

    this.applyVolumes();
    this.persistSettings();

    return this.settings.radioEnabled;
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.applyVolumes();
    this.persistSettings();

    this.emit("audio:mute-changed", {
      muted: this.settings.muted,
    });

    return this.settings.muted;
  }

  setVolume(channel, value) {
    const volume = this.clamp(Number(value) || 0, 0, 1);

    const keys = {
      master: "masterVolume",
      effects: "effectsVolume",
      music: "musicVolume",
      radio: "radioVolume",
    };

    const key = keys[channel];

    if (!key) {
      throw new Error(`Unknown audio channel: ${channel}`);
    }

    this.settings[key] = volume;

    this.applyVolumes();
    this.persistSettings();

    this.emit("audio:volume-changed", {
      channel,
      volume,
    });

    return volume;
  }

  setEngineEnabled(enabled) {
    this.settings.engineEnabled = Boolean(enabled);

    if (!this.settings.engineEnabled) {
      this.stopEngine();
      this.disposeEngineNodes();
    } else if (this.engineRunning) {
      this.startEngine();
    }

    this.persistSettings();
    return this.settings.engineEnabled;
  }

  disposeEngineNodes() {
    if (this.engineOscillator) {
      try {
        this.engineOscillator.stop();
        this.engineOscillator.disconnect();
        this.engineGain?.disconnect();
        this.engineFilter?.disconnect();
      } catch {
        // Nodes may already be stopped.
      }
    }

    this.engineOscillator = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  getSettings() {
    return { ...this.settings };
  }

  getRadioState() {
    const track =
      this.radioIndex >= 0 ? this.radioTracks[this.radioIndex] : null;

    return {
      enabled: this.settings.radioEnabled,
      playing: this.radioPlaying,
      index: this.radioIndex,
      trackCount: this.radioTracks.length,
      title: track?.title || "RuffNeck Radio",
      artist: track?.artist || "Arewa Mix",
    };
  }

  persistSettings() {
    if (
      this.saveManager &&
      typeof this.saveManager.saveSettings === "function"
    ) {
      this.saveManager.saveSettings({
        audio: this.getSettings(),
      });
    }

    this.emit("audio:settings-updated", this.getSettings());
  }

  emit(eventName, payload) {
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit(eventName, payload);
    }
  }

  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  async destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    this.stopRadio();
    this.stopEngine();
    this.disposeEngineNodes();

    for (const sound of this.activeSounds) {
      try {
        sound.oscillator.stop();
        sound.oscillator.disconnect();
        sound.gain.disconnect();
      } catch {
        // Ignore sounds that have already ended.
      }
    }

    this.activeSounds.clear();

    for (const unsubscribe of this.listeners) {
      try {
        unsubscribe();
      } catch {
        // Ignore removed listeners.
      }
    }

    this.listeners.length = 0;

    if (this.context && this.context.state !== "closed") {
      try {
        await this.context.close();
      } catch {
        // Audio context may already be closed.
      }
    }

    this.context = null;
    this.initialized = false;
  }
}