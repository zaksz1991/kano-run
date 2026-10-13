export default class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.oscillators = [];
    
    this.isInitialized = false;
    this.isMuted = false;
    this.volume = 1.0;
    
    this.currentRadioStation = 0;
    this.radioInterval = null;
    this.radioOscillators = [];
    
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
      
      // Engine Audio Graph
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      
      this.engineFilter = this.context.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 200;
      this.engineFilter.Q.value = 5;
      
      this.engineGain.connect(this.engineFilter);
      this.engineFilter.connect(this.masterGain);
      
      this.isInitialized = true;
      
      // Bind mobile unlock
      document.addEventListener('click', this._boundUnlock, { once: true });
      document.addEventListener('touchstart', this._boundUnlock, { once: true });
      
      console.log("[AudioManager] Initialized");
    } catch (e) {
      console.warn("[AudioManager] Web Audio API not supported", e);
    }
  }

  _unlockAudio() {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume().then(() => {
        console.log("[AudioManager] Audio context resumed");
      });
    }
  }

  // 🔥 Dynamic Engine Sound
  updateEngine(speed = 0, maxSpeed = 34) {
    if (!this.isInitialized || this.isMuted) return;

    const rpm = Math.min(speed / maxSpeed, 1);
    const now = this.context.currentTime;

    // Base frequency + RPM multiplier
    const baseFreq = 60 + (rpm * 180);
    
    // If we don't have engine oscillators running, start them
    if (this.oscillators.length === 0) {
      this._startEngine(baseFreq);
    }

    // Update frequency and filter based on speed
    this.oscillators.forEach((osc, index) => {
      const detune = index === 0 ? 0 : -15; // Detune for "roughness"
      osc.frequency.setTargetAtTime(baseFreq + detune, now, 0.1);
    });

    // Open the filter as speed increases (makes it sound louder/brighter)
    this.engineFilter.frequency.setTargetAtTime(200 + (rpm * 2000), now, 0.1);
    
    // Volume based on throttle
    const targetVol = speed > 0 ? 0.15 : 0.05;
    this.engineGain.gain.setTargetAtTime(targetVol, now, 0.1);
  }

  _startEngine(freq) {
    const now = this.context.currentTime;
    
    // Main oscillator (Sawtooth for engine buzz)
    const osc1 = this.context.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = freq;
    
    // Sub oscillator (Square for depth)
    const osc2 = this.context.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = freq / 2;
    osc2.detune.value = -15;
    
    osc1.connect(this.engineGain);
    osc2.connect(this.engineGain);
    
    osc1.start(now);
    osc2.start(now);
    
    this.oscillators = [osc1, osc2];
  }

  stopEngine() {
    if (!this.isInitialized) return;
    const now = this.context.currentTime;
    
    this.engineGain.gain.setTargetAtTime(0, now, 0.5);
    
    this.oscillators.forEach(osc => {
      try { osc.stop(now + 0.5); } catch(e) {}
    });
    this.oscillators = [];
  }

  // 📻 Procedural Radio System
  startRadio(district = "city") {
    if (!this.isInitialized || this.isMuted) return;
    this.stopRadio();

    const now = this.context.currentTime;
    const radioGain = this.context.createGain();
    radioGain.gain.value = 0.05; // Quiet background music
    radioGain.connect(this.masterGain);

    // Different "vibes" based on district
    let freq, type, interval;
    if (district.includes("market") || district.includes("sabon")) {
      freq = 110; type = 'square'; interval = 250; // High energy
    } else if (district.includes("industrial")) {
      freq = 55; type = 'sawtooth'; interval = 400; // Heavy
    } else {
      freq = 82; type = 'sine'; interval = 500; // Smooth city cruise
    }

    // Simple sequencer
    this.radioInterval = setInterval(() => {
      const osc = this.context.createOscillator();
      const env = this.context.createGain();
      
      osc.type = type;
      // Randomize melody slightly
      const note = freq * (1 + Math.random() * 0.5);
      osc.frequency.setValueAtTime(note, this.context.currentTime);
      
      env.gain.setValueAtTime(0.1, this.context.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.3);
      
      osc.connect(env);
      env.connect(radioGain);
      
      osc.start();
      osc.stop(this.context.currentTime + 0.3);
    }, interval);
  }

  stopRadio() {
    if (this.radioInterval) {
      clearInterval(this.radioInterval);
      this.radioInterval = null;
    }
  }

  // 🔊 Sound Effects (SFX)
  playSFX(type) {
    if (!this.isInitialized || this.isMuted) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);

    switch (type) {
      case 'horn':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
        
      case 'coin':
      case 'pickup':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
        
      case 'collision':
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.2);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
        
      case 'akwai': // Drop off sound
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.1);
        osc.frequency.linearRampToValueAtTime(400, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
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
    this.stopEngine();
    this.stopRadio();
    if (this.context) {
      this.context.close();
    }
    document.removeEventListener('click', this._boundUnlock);
    document.removeEventListener('touchstart', this._boundUnlock);
  }
}