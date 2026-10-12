export const Audio = {
  ctx: null,
  master: null,
  engine: null,
  engineMid: null,
  engineNoise: null,
  engineFilter: null,
  engineMidFilter: null,
  engineGain: null,
  engineMidGain: null,
  engineNoiseGain: null,
  citySource: null,
  cityFilter: null,
  cityGain: null,
  radioOsc: null,
  radioOsc2: null,
  radioGain: null,
  radioSample: null,
  radioToken: 0,
  activeSamples: new Set(),
  speechToken: 0,
  voices: [],
  unlocked: false,
  muted: false,
  volume: 0.75,

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    try {
      this.ctx = new AudioContextClass();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);

      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }

      return this.ctx;
    } catch (error) {
      console.warn("Audio initialization failed:", error);
      return null;
    }
  },

  async unlock() {
    const ctx = this.ensure();
    if (!ctx) return false;

    try {
      if (ctx.state !== "running") {
        await ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.01);

      this.unlocked = ctx.state === "running";
      return this.unlocked;
    } catch {
      this.unlocked = false;
      return false;
    }
  },

  setVolume(value) {
    const volume = Number(value);

    if (!Number.isFinite(volume)) return;

    this.volume = Math.max(0, Math.min(1, volume));

    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.04
      );
    }
  },

  setMuted(value) {
    this.muted = Boolean(value);

    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.04
      );
    }

    for (const sample of this.activeSamples) {
      sample.muted = this.muted;
    }

    if (this.radioSample) {
      this.radioSample.muted = this.muted;
    }
  },

  pickVoice() {
    if (typeof speechSynthesis === "undefined") return null;

    const voices = speechSynthesis.getVoices();
    this.voices = voices;

    const preferred = [
      /english.*nigeria/i,
      /nigeria/i,
      /english.*ghana/i,
      /english.*united kingdom/i,
      /english.*united states/i,
      /english/i,
    ];

    for (const pattern of preferred) {
      const match = voices.find((voice) => pattern.test(voice.name + " " + voice.lang));
      if (match) return match;
    }

    return voices[0] || null;
  },

  speak(text, options = {}) {
    if (
      this.muted ||
      typeof speechSynthesis === "undefined" ||
      !text
    ) {
      return;
    }

    const message = String(text).trim();
    if (!message) return;

    try {
      const token = ++this.speechToken;
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(message);
      const voice = this.pickVoice();

      if (voice) utterance.voice = voice;

      utterance.lang = voice?.lang || "en-NG";
      utterance.rate = Math.max(0.65, Math.min(1.4, options.rate ?? 1));
      utterance.pitch = Math.max(0.6, Math.min(1.5, options.pitch ?? 1));
      utterance.volume = Math.max(
        0,
        Math.min(1, options.volume ?? this.volume)
      );

      utterance.onend = () => {
        if (token === this.speechToken) {
          this.speechToken = 0;
        }
      };

      speechSynthesis.speak(utterance);
    } catch {
      // Speech synthesis is optional; gameplay should continue.
    }
  },

  stopSpeech() {
    this.speechToken++;

    if (typeof speechSynthesis !== "undefined") {
      try {
        speechSynthesis.cancel();
      } catch {
        // Ignore browser speech errors.
      }
    }
  },

  makeOscillator(frequency, type = "sine", gainValue = 0.1) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return null;

    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.value = gainValue;

      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start();

      return { oscillator, gain };
    } catch {
      return null;
    }
  },

  tone(frequency = 440, duration = 0.12, type = "sine", volume = 0.15) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;

    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const length = Math.max(0.025, duration);
      const level = Math.max(0.001, Math.min(1, volume));

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(
        Math.max(20, frequency),
        now
      );

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(level, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length);

      oscillator.connect(gain);
      gain.connect(this.master);

      oscillator.start(now);
      oscillator.stop(now + length + 0.03);

      oscillator.onended = () => {
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          // Already disconnected.
        }
      };
    } catch {
      // Sound effects must never interrupt gameplay.
    }
  },

  noise(duration = 0.25, volume = 0.12, filterFrequency = 900) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;

    try {
      const sampleRate = ctx.sampleRate;
      const frameCount = Math.max(1, Math.floor(sampleRate * duration));
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < frameCount; i++) {
        const fade = 1 - i / frameCount;
        data[i] = (Math.random() * 2 - 1) * fade;
      }

      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.value = Math.max(100, filterFrequency);
      gain.gain.value = Math.max(0, Math.min(1, volume));

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      source.onended = () => {
        try {
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          // Already disconnected.
        }
      };

      source.start();
    } catch {
      // Noise effects are optional.
    }
  },

  startEngine() {
    if (this.engine) return;

    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    try {
      this.engine = ctx.createOscillator();
      this.engineMid = ctx.createOscillator();
      this.engineNoise = ctx.createBufferSource();

      this.engineFilter = ctx.createBiquadFilter();
      this.engineMidFilter = ctx.createBiquadFilter();

      this.engineGain = ctx.createGain();
      this.engineMidGain = ctx.createGain();
      this.engineNoiseGain = ctx.createGain();

      const buffer = ctx.createBuffer(
        1,
        ctx.sampleRate * 2,
        ctx.sampleRate
      );
      const data = buffer.getChannelData(0);

      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.engine.type = "sawtooth";
      this.engine.frequency.value = 48;

      this.engineMid.type = "triangle";
      this.engineMid.frequency.value = 96;

      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 180;

      this.engineMidFilter.type = "lowpass";
      this.engineMidFilter.frequency.value = 450;

      this.engineGain.gain.value = 0.075;
      this.engineMidGain.gain.value = 0.025;
      this.engineNoiseGain.gain.value = 0.012;

      this.engineNoise.buffer = buffer;
      this.engineNoise.loop = true;

      this.engine.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);

      this.engineMid.connect(this.engineMidFilter);
      this.engineMidFilter.connect(this.engineMidGain);
      this.engineMidGain.connect(this.master);

      this.engineNoise.connect(this.engineNoiseGain);
      this.engineNoiseGain.connect(this.master);

      this.engine.start();
      this.engineMid.start();
      this.engineNoise.start();

      this.startCityAmbience();
    } catch (error) {
      console.warn("Engine audio could not start:", error);
      this.stopEngine();
    }
  },

  setEngineSpeed(speed = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.engine || !this.engineMid) return;

    const normalized = Math.max(0, Math.min(1.5, Number(speed) || 0));

    try {
      const now = ctx.currentTime;
      this.engine.frequency.setTargetAtTime(
        38 + normalized * 85,
        now,
        0.12
      );

      this.engineMid.frequency.setTargetAtTime(
        75 + normalized * 150,
        now,
        0.12
      );

      if (this.engineFilter) {
        this.engineFilter.frequency.setTargetAtTime(
          130 + normalized * 500,
          now,
          0.15
        );
      }

      if (this.engineMidFilter) {
        this.engineMidFilter.frequency.setTargetAtTime(
          300 + normalized * 800,
          now,
          0.15
        );
      }

      if (this.engineGain) {
        this.engineGain.gain.setTargetAtTime(
          0.045 + normalized * 0.045,
          now,
          0.15
        );
      }
    } catch {
      // Ignore stale audio nodes.
    }
  },

  stopEngine() {
    const nodes = [
      this.engine,
      this.engineMid,
      this.engineNoise,
    ];

    for (const node of nodes) {
      if (!node) continue;

      try {
        node.stop();
      } catch {
        // Node may already be stopped.
      }

      try {
        node.disconnect();
      } catch {
        // Node may already be disconnected.
      }
    }

    const connections = [
      this.engineFilter,
      this.engineMidFilter,
      this.engineGain,
      this.engineMidGain,
      this.engineNoiseGain,
    ];

    for (const node of connections) {
      try {
        node?.disconnect();
      } catch {
        // Ignore cleanup errors.
      }
    }

    this.engine = null;
    this.engineMid = null;
    this.engineNoise = null;
    this.engineFilter = null;
    this.engineMidFilter = null;
    this.engineGain = null;
    this.engineMidGain = null;
    this.engineNoiseGain = null;

    this.stopCityAmbience();
  },

  startCityAmbience() {
    if (this.citySource) return;

    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    try {
      const buffer = ctx.createBuffer(
        1,
        ctx.sampleRate * 3,
        ctx.sampleRate
      );
      const data = buffer.getChannelData(0);

      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.citySource = ctx.createBufferSource();
      this.cityFilter = ctx.createBiquadFilter();
      this.cityGain = ctx.createGain();

      this.citySource.buffer = buffer;
      this.citySource.loop = true;

      this.cityFilter.type = "lowpass";
      this.cityFilter.frequency.value = 320;

      this.cityGain.gain.value = 0.018;

      this.citySource.connect(this.cityFilter);
      this.cityFilter.connect(this.cityGain);
      this.cityGain.connect(this.master);

      this.citySource.start();
    } catch {
      this.stopCityAmbience();
    }
  },

  stopCityAmbience() {
    if (this.citySource) {
      try {
        this.citySource.stop();
      } catch {
        // Already stopped.
      }

      try {
        this.citySource.disconnect();
      } catch {
        // Already disconnected.
      }
    }

    for (const node of [this.cityFilter, this.cityGain]) {
      try {
        node?.disconnect();
      } catch {
        // Already disconnected.
      }
    }

    this.citySource = null;
    this.cityFilter = null;
    this.cityGain = null;
  },

  startRadioBed() {
    if (this.radioOsc || this.radioOsc2) return;

    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    try {
      this.radioOsc = ctx.createOscillator();
      this.radioOsc2 = ctx.createOscillator();
      this.radioGain = ctx.createGain();

      this.radioOsc.type = "sine";
      this.radioOsc.frequency.value = 440;

      this.radioOsc2.type = "triangle";
      this.radioOsc2.frequency.value = 443;

      this.radioGain.gain.value = 0.012;

      this.radioOsc.connect(this.radioGain);
      this.radioOsc2.connect(this.radioGain);
      this.radioGain.connect(this.master);

      this.radioOsc.start();
      this.radioOsc2.start();
    } catch {
      this.stopRadioBed();
    }
  },

  stopRadioBed() {
    for (const node of [this.radioOsc, this.radioOsc2]) {
      if (!node) continue;

      try {
        node.stop();
      } catch {
        // Already stopped.
      }

      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }

    try {
      this.radioGain?.disconnect();
    } catch {
      // Already disconnected.
    }

    this.radioOsc = null;
    this.radioOsc2 = null;
    this.radioGain = null;
  },

  stationFile(name) {
    const stations = {
      arewa: "/audio/arewa.mp3",
      freedom: "/audio/freedom.mp3",
      dala: "/audio/dala.mp3",
      kano: "/audio/kano.mp3",
      hausa: "/audio/hausa.mp3",
      news: "/audio/news.mp3",
      music: "/audio/music.mp3",
      classic: "/audio/classic.mp3",
      none: "",
      off: "",
    };

    const key = String(name || "").trim().toLowerCase();
    return stations[key] ?? "";
  },

  stopSample(sample) {
    if (!sample) return;

    try {
      sample.pause();
      sample.currentTime = 0;
      sample.removeAttribute("src");
      sample.load();
    } catch {
      // Ignore browser media cleanup errors.
    }

    this.activeSamples.delete(sample);

    if (this.radioSample === sample) {
      this.radioSample = null;
    }
  },

  stopAllSamples() {
    for (const sample of [...this.activeSamples]) {
      this.stopSample(sample);
    }

    this.radioSample = null;
  },

  playSample(url, vol = 0.5, loop = false) {
    if (!url || typeof window === "undefined" || !window.Audio) {
      return null;
    }

    let sample;

    try {
      sample = new window.Audio(url);
      sample.volume = Math.max(0, Math.min(1, vol * this.volume));
      sample.muted = this.muted;
      sample.loop = Boolean(loop);
      sample.preload = "auto";

      this.activeSamples.add(sample);

      sample.addEventListener(
        "ended",
        () => {
          if (!sample.loop) this.activeSamples.delete(sample);
        },
        { once: true }
      );

      sample.addEventListener(
        "error",
        () => {
          this.activeSamples.delete(sample);

          if (this.radioSample === sample) {
            this.radioSample = null;
          }
        },
        { once: true }
      );

      const playback = sample.play();

      if (playback && typeof playback.catch === "function") {
        playback.catch(() => {
          this.activeSamples.delete(sample);

          if (this.radioSample === sample) {
            this.radioSample = null;
          }
        });
      }

      return sample;
    } catch {
      if (sample) this.activeSamples.delete(sample);
      return null;
    }
  },

  radioTune(stationName) {
    const token = ++this.radioToken;

    this.stopRadioBed();

    if (this.radioSample) {
      this.stopSample(this.radioSample);
    }

    const station = String(stationName || "").trim();
    const file = this.stationFile(station);

    if (!file) {
      this.radioSample = null;
      this.tone(520, 0.07, "sine", 0.04);
      return;
    }

    this.tone(650, 0.06, "sine", 0.04);

    const sample = this.playSample(file, 0.45, true);

    if (token !== this.radioToken) {
      if (sample) this.stopSample(sample);
      return;
    }

    if (sample) {
      this.radioSample = sample;
    } else {
      this.startRadioBed();
    }

    this.tone(820, 0.07, "sine", 0.04);

    if (station) {
      this.speak(`Radio ${station}`);
    }
  },

  radioOff() {
    this.radioToken++;
    this.stopRadioBed();

    if (this.radioSample) {
      this.stopSample(this.radioSample);
    }

    this.radioSample = null;
    this.tone(420, 0.07, "sine", 0.035);
  },

  horn() {
    if (this.muted) return;

    const sample = this.playSample("/audio/horn.mp3", 0.7, false);

    if (sample) {
      const fallbackTimer = window.setTimeout(() => {
        if (sample.error || sample.paused) {
          this.tone(390, 0.2, "sawtooth", 0.22);
          this.tone(320, 0.22, "sawtooth", 0.18);
        }
      }, 180);

      sample.addEventListener(
        "playing",
        () => window.clearTimeout(fallbackTimer),
        { once: true }
      );

      sample.addEventListener(
        "error",
        () => {
          window.clearTimeout(fallbackTimer);
          this.tone(390, 0.2, "sawtooth", 0.22);
          this.tone(320, 0.22, "sawtooth", 0.18);
        },
        { once: true }
      );

      return;
    }

    this.tone(390, 0.2, "sawtooth", 0.22);
    this.tone(320, 0.22, "sawtooth", 0.18);
  },

  siren() {
    if (this.muted) return;

    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(650, now);
      oscillator.frequency.linearRampToValueAtTime(1050, now + 0.45);
      oscillator.frequency.linearRampToValueAtTime(650, now + 0.9);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.setValueAtTime(0.08, now + 0.75);
      gain.gain.linearRampToValueAtTime(0.0001, now + 1);

      oscillator.connect(gain);
      gain.connect(this.master);

      oscillator.start(now);
      oscillator.stop(now + 1.05);

      oscillator.onended = () => {
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          // Already disconnected.
        }
      };
    } catch {
      // Siren is optional.
    }
  },

  brake() {
    this.noise(0.24, 0.13, 1500);
    this.tone(180, 0.18, "sawtooth", 0.06);
  },

  crash() {
    this.noise(0.42, 0.28, 1800);
    this.tone(90, 0.35, "sawtooth", 0.18);
    this.tone(55, 0.4, "triangle", 0.15);
  },

  pickup() {
    this.tone(660, 0.08, "sine", 0.12);
    window.setTimeout(() => this.tone(880, 0.1, "sine", 0.12), 70);
  },

  coin() {
    this.tone(880, 0.07, "sine", 0.1);
    window.setTimeout(() => this.tone(1180, 0.09, "sine", 0.1), 55);
  },

  levelUp() {
    this.tone(523, 0.12, "sine", 0.12);
    window.setTimeout(() => this.tone(659, 0.12, "sine", 0.12), 100);
    window.setTimeout(() => this.tone(784, 0.2, "sine", 0.14), 200);
  },

  warning() {
    this.tone(760, 0.12, "square", 0.07);
    window.setTimeout(() => this.tone(600, 0.14, "square", 0.07), 150);
  },

  success() {
    this.tone(523, 0.1, "sine", 0.1);
    window.setTimeout(() => this.tone(659, 0.1, "sine", 0.1), 90);
    window.setTimeout(() => this.tone(784, 0.16, "sine", 0.12), 180);
  },

  failure() {
    this.tone(330, 0.16, "triangle", 0.1);
    window.setTimeout(() => this.tone(247, 0.22, "triangle", 0.1), 150);
  },

  passenger() {
    this.tone(580, 0.08, "sine", 0.08);
    window.setTimeout(() => this.tone(720, 0.1, "sine", 0.08), 80);
  },

  missionComplete() {
    this.success();
    window.setTimeout(() => this.tone(1046, 0.22, "sine", 0.12), 300);
  },

  dispose() {
    this.radioToken++;
    this.stopSpeech();
    this.stopEngine();
    this.stopRadioBed();
    this.stopAllSamples();

    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      this.master = null;
      this.unlocked = false;

      if (ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
    }
  },
};

// Warm up voice list when the browser supports speech synthesis.
if (typeof speechSynthesis !== "undefined") {
  try {
    Audio.voices = speechSynthesis.getVoices();

    speechSynthesis.addEventListener?.("voiceschanged", () => {
      Audio.voices = speechSynthesis.getVoices();
    });
  } catch {
    // Voice support is optional.
  }
}

// Unlock audio after the first real user interaction.
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    Audio.unlock();
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
    window.removeEventListener("touchstart", unlockAudio);
  };

  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);
  window.addEventListener("touchstart", unlockAudio, { passive: true });
}