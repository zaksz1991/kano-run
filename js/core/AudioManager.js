export default class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.engineGain = null;
    this.radioGain = null;
    this.sfxGain = null;
    
    this.isInitialized = false;
    this.isMuted = false;
    this.volume = 1.0;
    
    // Audio Buffers (Loaded MP3s)
    this.buffers = {};
    this.isLoading = false;
    
    // Active Nodes
    this.engineSource = null;
    this.radioSource = null;
    this.currentRadioTrack = null;
    
    // Engine specific
    this._engineSpeed = 0;
    this._engineMaxSpeed = 34;
    
    this._boundUnlock = this._unlockAudio.bind(this);
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContext();
      
      // Master Gain
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.context.destination);
      
      // Sub-mixers
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engineGain.connect(this.masterGain);

      this.radioGain = this.context.createGain();
      this.radioGain.gain.value = 0;
      this.radioGain.connect(this.masterGain);

      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.masterGain);

      // Load all assets
      await this._loadAssets();
      
      this.isInitialized = true;
      
      // Bind mobile unlock
      document.addEventListener('click', this._boundUnlock, { once: true });
      document.addEventListener('touchstart', this._boundUnlock, { once: true });
      
      console.log("[AudioManager] Initialized with real assets.");
    } catch (e) {
      console.warn("[AudioManager] Web Audio API failed:", e);
    }
  }

  async _loadAssets() {
    this.isLoading = true;
    const assets = [
      'engine', 'horn', 'whistle', 'collision', 'pickup', 'coin',
      'radio-kano', 'arewa', 'cool', 'freedom', 'rahama', 'ruffneck', 'wazobia'
    ];
    
    const promises = assets.map(name => this._loadBuffer(`/assets/audio/${name}.mp3`, name));
    await Promise.all(promises);
    this.isLoading = false;
  }

  _loadBuffer(url, name) {
    return fetch(url)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => this.context.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        this.buffers[name] = audioBuffer;
        console.log(`[AudioManager] Loaded ${name}`);
      })
      .catch(e => console.warn(`[AudioManager] Failed to load ${name}:`, e));
  }

  _unlockAudio() {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume().then(() => {
        console.log("[AudioManager] Audio context resumed");
        // Auto-start engine if game is running
        if (this._engineSpeed > 0) this._startEngineNode();
      });
    }
  }

  // 🔥 DYNAMIC ENGINE SOUND
  updateEngine(speed = 0, maxSpeed = 34) {
    if (!this.isInitialized || this.isMuted || !this.buffers['engine']) return;

    this._engineSpeed = speed;
    this._engineMaxSpeed = maxSpeed;
    const rpm = Math.min(speed / maxSpeed, 1);

    // Start engine node if not running
    if (!this.engineSource && speed > 0.5) {
      this._startEngineNode();
    } 
    // Stop engine node if stopped
    else if (this.engineSource && speed <= 0.5) {
      this._stopEngineNode();
    }

    if (this.engineSource) {
      const now = this.context.currentTime;
      // Pitch shift based on speed (0.8x to 2.5x speed)
      const playbackRate = 0.8 + (rpm * 1.7); 
      this.engineSource.playbackRate.setTargetAtTime(playbackRate, now, 0.1);
      
      // Volume based on throttle
      const targetVol = speed > 0 ? 0.3 + (rpm * 0.4) : 0;
      this.engineGain.gain.setTargetAtTime(targetVol, now, 0.1);
    }
  }

  _startEngineNode() {
    if (this.engineSource) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffers['engine'];
    source.loop = true;
    source.playbackRate.value = 0.8; // Idle speed
    
    source.connect(this.engineGain);
    source.start(0);
    this.engineSource = source;
  }

  _stopEngineNode() {
    if (this.engineSource) {
      try {
        this.engineSource.stop();
        this.engineSource.disconnect();
      } catch(e) {}
      this.engineSource = null;
    }
    this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.1);
  }

  // 📻 RADIO SYSTEM
  startRadio(district = "city") {
    if (!this.isInitialized || this.isMuted) return;
    this.stopRadio();

    // Map district to a radio station file
    let trackName = 'radio-kano'; // Default
    const d = district.toLowerCase();
    if (d.includes('sabon') || d.includes('market')) trackName = 'arewa';
    else if (d.includes('industrial')) trackName = 'cool';
    else if (d.includes('outskirt')) trackName = 'freedom';
    else if (d.includes('city')) trackName = 'wazobia';

    if (this.buffers[trackName]) {
      const source = this.context.createBufferSource();
      source.buffer = this.buffers[trackName];
      source.loop = true;
      source.connect(this.radioGain);
      source.start(0);
      this.radioSource = source;
      this.currentRadioTrack = trackName;
      
      this.radioGain.gain.setTargetAtTime(0.4, this.context.currentTime, 0.5); // Fade in
    }
  }

  stopRadio() {
    if (this.radioSource) {
      try {
        this.radioSource.stop();
        this.radioSource.disconnect();
      } catch(e) {}
      this.radioSource = null;
    }
    this.radioGain.gain.setTargetAtTime(0, this.context.currentTime, 0.1);
    this.currentRadioTrack = null;
  }

  // 🔊 SOUND EFFECTS (SFX)
  playSFX(type) {
    if (!this.isInitialized || this.isMuted) return;
    
    let bufferName = type;
    if (type === 'horn') bufferName = 'horn';
    if (type === 'whistle') bufferName = 'whistle';
    if (type === 'collision') bufferName = 'collision'; // You might need to add a crash.mp3 later
    if (type === 'pickup' || type === 'coin') bufferName = 'coin';

    if (this.buffers[bufferName]) {
      const source = this.context.createBufferSource();
      source.buffer = this.buffers[bufferName];
      source.connect(this.sfxGain);
      source.start(0);
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.1);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.context.currentTime, 0.1);
    }
  }

  destroy() {
    this._stopEngineNode();
    this.stopRadio();
    if (this.context) {
      this.context.close();
    }
    document.removeEventListener('click', this._boundUnlock);
    document.removeEventListener('touchstart', this._boundUnlock);
  }
}