export default class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.engineGain = null;
    this.radioGain = null;
    this.sfxGain = null;

    this.isInitialized = false;
    this.isMuted = false;
    this.volume = 1;
    this.buffers = {};
    this.isLoading = false;

    this.engineSource = null;
    this.radioSource = null;
    this.currentRadioTrack = null;

    this._engineSpeed = 0;
    this._engineMaxSpeed = 34;
    this._radioVolume = 0.4;

    this.radioStations = Object.freeze([
      { id: "radio-kano", name: "Radio Kano" },
      { id: "arewa", name: "Arewa Radio" },
      { id: "wazobia", name: "Wazobia FM" },
      { id: "rahama", name: "Rahama Radio" },
      { id: "freedom", name: "Freedom Radio" },
      { id: "ruffneck", name: "RuffNeck Radio" },
      { id: "cool", name: "Cool Radio" },
    ]);

    this._boundUnlock = this._unlockAudio.bind(this);
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("Web Audio API is not supported.");
      }

      this.context = new AudioContextClass();

      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.context.destination);

      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engineGain.connect(this.masterGain);

      this.radioGain = this.context.createGain();
      this.radioGain.gain.value = 0;
      this.radioGain.connect(this.masterGain);

      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = 1;
      this.sfxGain.connect(this.masterGain);

      await this._loadAssets();

      this.isInitialized = true;

      document.addEventListener("click", this._boundUnlock);
      document.addEventListener("touchstart", this._boundUnlock);

      if (this.context.state === "running") {
        console.log("[AudioManager] Audio context ready.");
      }

      console.log(
        `[AudioManager] Initialized. ${Object.keys(this.buffers).length} audio assets loaded.`
      );
    } catch (error) {
      console.warn("[AudioManager] Initialization failed:", error);
    }
  }

  async _loadAssets() {
    this.isLoading = true;

    const assets = [
      "engine",
      "horn",
      "whistle",
      "collision",
      "pickup",
      "coin",
      ...this.radioStations.map((station) => station.id),
    ];

    try {
      await Promise.all(
        assets.map((name) =>
          this._loadBuffer(`/assets/models/audio/${name}.mp3`, name)
        )
      );
    } finally {
      this.isLoading = false;
    }
  }

  async _loadBuffer(url, name) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(
          `[AudioManager] Missing asset: ${url} (${response.status})`
        );
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

      this.buffers[name] = audioBuffer;
      console.log(`[AudioManager] Loaded ${name}`);
    } catch (error) {
      console.warn(`[AudioManager] Could not load ${name}:`, error);
    }
  }

  async _unlockAudio() {
    if (!this.context || this.context.state === "closed") return;

    try {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }

      if (this._engineSpeed > 0 && !this.isMuted) {
        this._startEngineNode();
      }
    } catch (error) {
      console.warn("[AudioManager] Could not resume audio:", error);
    }
  }

  updateEngine(speed = 0, maxSpeed = 34) {
    if (!this.isInitialized || this.isMuted || !this.buffers.engine) {
      return;
    }

    this._engineSpeed = Math.max(0, speed);
    this._engineMaxSpeed = Math.max(1, maxSpeed);

    const rpm = Math.min(this._engineSpeed / this._engineMaxSpeed, 1);

    if (!this.engineSource && this._engineSpeed > 0.5) {
      this._startEngineNode();
    } else if (this.engineSource && this._engineSpeed <= 0.5) {
      this._stopEngineNode();
    }

    if (this.engineSource) {
      const now = this.context.currentTime;

      this.engineSource.playbackRate.setTargetAtTime(
        0.8 + rpm * 1.7,
        now,
        0.1
      );

      this.engineGain.gain.setTargetAtTime(
        this._engineSpeed > 0 ? 0.3 + rpm * 0.4 : 0,
        now,
        0.1
      );
    }
  }

  _startEngineNode() {
    if (
      this.engineSource ||
      !this.context ||
      !this.buffers.engine ||
      this.context.state !== "running"
    ) {
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = this.buffers.engine;
    source.loop = true;
    source.playbackRate.value = 0.8;
    source.connect(this.engineGain);
    source.start();

    this.engineSource = source;
  }

  _stopEngineNode() {
    if (this.engineSource) {
      try {
        this.engineSource.stop();
        this.engineSource.disconnect();
      } catch {}

      this.engineSource = null;
    }

    if (this.engineGain && this.context?.state !== "closed") {
      this.engineGain.gain.setTargetAtTime(
        0,
        this.context.currentTime,
        0.1
      );
    }
  }

  startRadio(station = "radio-kano") {
    if (!this.isInitialized || this.isMuted || !this.context) {
      return false;
    }

    const requested = String(station).toLowerCase();

    // Preserve support for the previous district-based call.
    const districtStations = {
      city: "radio-kano",
      citycenter: "wazobia",
      sabongari: "arewa",
      market: "arewa",
      industrial: "cool",
      outskirts: "freedom",
    };

    const trackName = districtStations[requested] || requested;

    if (!this.buffers[trackName]) {
      console.warn(`[AudioManager] Station unavailable: ${trackName}`);
      return false;
    }

    if (this.currentRadioTrack === trackName && this.radioSource) {
      return true;
    }

    this.stopRadio();

    const source = this.context.createBufferSource();
    source.buffer = this.buffers[trackName];
    source.loop = true;
    source.connect(this.radioGain);
    source.start();

    this.radioSource = source;
    this.currentRadioTrack = trackName;

    this.radioGain.gain.setTargetAtTime(
      this._radioVolume,
      this.context.currentTime,
      0.35
    );

    console.log(`[AudioManager] Radio tuned to ${trackName}`);
    return true;
  }

  nextRadioStation() {
    const stations = this.radioStations;
    const currentIndex = stations.findIndex(
      (station) => station.id === this.currentRadioTrack
    );

    const nextIndex = (currentIndex + 1) % stations.length;
    return this.startRadio(stations[nextIndex].id);
  }

  previousRadioStation() {
    const stations = this.radioStations;
    const currentIndex = stations.findIndex(
      (station) => station.id === this.currentRadioTrack
    );

    const previousIndex =
      currentIndex <= 0 ? stations.length - 1 : currentIndex - 1;

    return this.startRadio(stations[previousIndex].id);
  }

  setRadioVolume(value) {
    this._radioVolume = Math.max(0, Math.min(1, Number(value) || 0));

    if (this.radioGain && this.context?.state !== "closed") {
      this.radioGain.gain.setTargetAtTime(
        this.isMuted || !this.radioSource ? 0 : this._radioVolume,
        this.context.currentTime,
        0.1
      );
    }
  }

  stopRadio() {
    if (this.radioSource) {
      try {
        this.radioSource.stop();
        this.radioSource.disconnect();
      } catch {}

      this.radioSource = null;
    }

    if (this.radioGain && this.context?.state !== "closed") {
      this.radioGain.gain.setTargetAtTime(
        0,
        this.context.currentTime,
        0.1
      );
    }

    this.currentRadioTrack = null;
  }

  playSFX(type) {
    if (!this.isInitialized || this.isMuted || !this.context) return;

    const aliases = {
      pickup: "coin",
      coin: "coin",
      horn: "horn",
      whistle: "whistle",
      collision: "collision",
    };

    const bufferName = aliases[type] || type;
    const buffer = this.buffers[bufferName];

    if (!buffer) {
      console.warn(`[AudioManager] Sound unavailable: ${bufferName}`);
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain);
    source.start();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));

    if (this.masterGain && this.context?.state !== "closed") {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0 : this.volume,
        this.context.currentTime,
        0.1
      );
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.masterGain && this.context?.state !== "closed") {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0 : this.volume,
        this.context.currentTime,
        0.1
      );
    }

    if (this.isMuted) {
      this._stopEngineNode();
      this.stopRadio();
    } else if (this._engineSpeed > 0) {
      this._startEngineNode();
    }

    return this.isMuted;
  }

  destroy() {
    this._stopEngineNode();
    this.stopRadio();

    document.removeEventListener("click", this._boundUnlock);
    document.removeEventListener("touchstart", this._boundUnlock);

    if (this.context && this.context.state !== "closed") {
      this.context.close();
    }

    this.context = null;
    this.isInitialized = false;
  }
}