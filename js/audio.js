/**
 * Kano Run audio — realistic-leaning engine + browser voice
 * Game Developer: Hassan Zakariya
 * Free stack only: Web Audio API + SpeechSynthesis (no paid APIs)
 */
export const Audio = {
  ctx: null,
  eng: null,
  engGain: null,
  eng2: null,
  noise: null,
  noiseGain: null,
  radioOsc: null,
  radioGain: null,
  muted: false,
  voiceReady: false,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  },

  /** Prefer Nigerian / African English; fall back to any English */
  pickVoice() {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const prefer = (v) =>
      /en-NG|en-GH|en-ZA|en-KE|en-GB|en_US|en-/i.test(v.lang) ||
      /Nigeria|Africa|UK|English/i.test(v.name || '');
    return voices.find(prefer) || voices.find((v) => /^en/i.test(v.lang)) || voices[0] || null;
  },

  speak(text, opts = {}) {
    if (this.muted || !text || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.rate = opts.rate ?? 0.95;
      u.pitch = opts.pitch ?? 1;
      u.volume = opts.volume ?? 0.9;
      const v = this.pickVoice();
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* ignore */
    }
  },

  /** Short Hausa / Kano street cues (spoken by browser TTS) */
  speakHausa(key) {
    const lines = {
      go: 'Mu tafi. Let\'s go.',
      stop: 'Tsaya. Stop.',
      fare: 'Nawa ne. How much is the fare?',
      karota: 'KAROTA check. Akwai parking.',
      passenger: 'Ina so in hau. I want to board.',
      drop: 'Akwai. Drop here.',
      thank: 'Na gode. Thank you.',
      radio: 'Radio Kano. Kai.',
      horn: 'Kai! Move!',
      police: 'Yan sanda. Police.'
    };
    this.speak(lines[key] || key, { rate: 0.9, pitch: 1.05 });
  },

  beep(freq, dur, type = 'square', vol = 0.04) {
    this.ensure();
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.stop(this.ctx.currentTime + dur);
  },

  /** Filtered noise burst (road / skid / whoosh) */
  noiseBurst(dur = 0.2, vol = 0.04, freq = 800) {
    this.ensure();
    if (!this.ctx || this.muted) return;
    const sr = this.ctx.sampleRate;
    const n = Math.max(1, Math.floor(sr * dur));
    const buf = this.ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.ctx.destination);
    src.start();
  },

  startEngine() {
    this.ensure();
    if (!this.ctx || this.eng || this.muted) return;

    // Layer 1: low rumble
    this.eng = this.ctx.createOscillator();
    this.engGain = this.ctx.createGain();
    this.eng.type = 'sawtooth';
    this.eng.frequency.value = 42;
    this.engGain.gain.value = 0.018;
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'lowpass';
    f1.frequency.value = 180;
    this.eng.connect(f1);
    f1.connect(this.engGain);
    this.engGain.connect(this.ctx.destination);
    this.eng.start();

    // Layer 2: mid mechanical
    this.eng2 = this.ctx.createOscillator();
    this.eng2.type = 'square';
    this.eng2.frequency.value = 84;
    const eng2Gain = this.ctx.createGain();
    eng2Gain.gain.value = 0.006;
    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 220;
    f2.Q.value = 1.2;
    this.eng2.connect(f2);
    f2.connect(eng2Gain);
    eng2Gain.connect(this.ctx.destination);
    this.eng2.start();
    this._eng2Gain = eng2Gain;

    // Layer 3: road noise
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.008;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 400;
    this.noise.connect(nf);
    nf.connect(this.noiseGain);
    this.noiseGain.connect(this.ctx.destination);
    this.noise.start();
    this.startCityAmbience();
  },

  stopEngine() {
    try {
      this.eng?.stop();
      this.eng?.disconnect();
      this.eng2?.stop();
      this.eng2?.disconnect();
      this.noise?.stop();
      this.noise?.disconnect();
    } catch (e) {}
    this.eng = null;
    this.eng2 = null;
    this.noise = null;
    this.stopCityAmbience();
    this.engGain = null;
    this.noiseGain = null;
    this._eng2Gain = null;
  },

  updateEngine(speed = 4) {
    if (this.muted) {
      this.stopEngine();
      return;
    }
    if (!this.eng || !this.engGain) return;
    const s = Math.max(0, speed);
    const idle = s < 0.4;
    this.eng.frequency.value = idle ? 36 : 38 + s * 9;
    this.engGain.gain.value = idle ? 0.008 : 0.01 + Math.min(0.03, s * 0.0028);
    if (this.eng2) this.eng2.frequency.value = idle ? 55 : 70 + s * 14;
    if (this._eng2Gain) this._eng2Gain.gain.value = idle ? 0.002 : 0.004 + Math.min(0.012, s * 0.0012);
    if (this.noiseGain) this.noiseGain.gain.value = idle ? 0.003 : 0.005 + Math.min(0.02, s * 0.002);
  },

  startCityAmbience() {
    this.ensure();
    if (!this.ctx || this.muted || this.cityHum) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * 2, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
    this.cityHum = this.ctx.createBufferSource();
    this.cityHum.buffer = buf;
    this.cityHum.loop = true;
    this.cityGain = this.ctx.createGain();
    this.cityGain.gain.value = 0.012;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 350;
    this.cityHum.connect(f);
    f.connect(this.cityGain);
    this.cityGain.connect(this.ctx.destination);
    this.cityHum.start();
  },

  stopCityAmbience() {
    try { this.cityHum?.stop(); this.cityHum?.disconnect(); } catch (e) {}
    this.cityHum = null;
  },

  startRadioBed() {
    this.ensure();
    if (!this.ctx || this.muted || this.radioOsc) return;
    // Two-tone "station" bed so radio is clearly audible
    this.radioOsc = this.ctx.createOscillator();
    this.radioOsc2 = this.ctx.createOscillator();
    this.radioGain = this.ctx.createGain();
    this.radioOsc.type = 'triangle';
    this.radioOsc2.type = 'sine';
    this.radioOsc.frequency.value = 196 + Math.random() * 40;
    this.radioOsc2.frequency.value = 294 + Math.random() * 50;
    this.radioGain.gain.value = 0.028;
    this.radioOsc.connect(this.radioGain);
    this.radioOsc2.connect(this.radioGain);
    this.radioGain.connect(this.ctx.destination);
    this.radioOsc.start();
    this.radioOsc2.start();
  },

  stopRadioBed() {
    try {
      this.radioOsc?.stop();
      this.radioOsc?.disconnect();
      this.radioOsc2?.stop();
      this.radioOsc2?.disconnect();
    } catch (e) {}
    this.radioOsc = null;
    this.radioOsc2 = null;
    this.radioGain = null;
  },

  /** Map station names → public/audio/*.mp3 */
  stationFile(name) {
    const n = String(name || '').toLowerCase();
    if (n.includes('freedom')) return '/audio/freedom.mp3';
    if (n.includes('arewa')) return '/audio/arewa.mp3';
    if (n.includes('rahama')) return '/audio/rahama.mp3';
    if (n.includes('cool')) return '/audio/cool.mp3';
    if (n.includes('wazobia')) return '/audio/wazobia.mp3';
    if (n.includes('ruffneck')) return '/audio/ruffneck.mp3';
    if (n.includes('kano') || n.includes('radio')) return '/audio/radio-kano.mp3';
    return '/audio/radio-kano.mp3';
  },

  playSample(url, vol = 0.5, loop = false) {
    if (this.muted) return null;
    try {
      const a = new window.Audio(url);
      a.volume = vol;
      a.loop = loop;
      a.play().catch(() => {});
      return a;
    } catch (e) {
      return null;
    }
  },

  stopSample(a) {
    try {
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
    } catch (e) {}
  },

  radioTune(stationName) {
    this.stopRadioBed();
    this.stopSample(this._radioEl);
    this.beep(600, 0.06, 'sine', 0.04);
    this.beep(800, 0.06, 'sine', 0.04);
    const name = stationName || 'Radio Kano';
    const file = this.stationFile(name);
    this._radioEl = this.playSample(file, 0.35, true);
    if (!this._radioEl) setTimeout(() => this.startRadioBed(), 100);
    this.speak(name + '. Kai.', { rate: 0.95, volume: 0.7 });
  },

  horn() {
    this.ensure();
    if (this.muted) return;
    // Prefer uploaded horn.mp3
    if (this.playSample('/audio/horn.mp3', 0.7, false)) return;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const freq of [380, 480]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + 0.35);
    }
  },

  brake() {
    this.noiseBurst(0.25, 0.05, 1200);
    this.beep(120, 0.15, 'sawtooth', 0.03);
  },

  crash() {
    this.noiseBurst(0.4, 0.1, 500);
    this.beep(70, 0.35, 'sawtooth', 0.09);
    this.beep(40, 0.4, 'square', 0.05);
  },

  pickup() {
    this.beep(520, 0.08, 'sine', 0.05);
    this.beep(660, 0.06, 'sine', 0.03);
  },

  coin() {
    this.beep(880, 0.06, 'sine', 0.04);
  },

  negotiate() {
    this.beep(320, 0.1, 'triangle', 0.05);
  },

  success() {
    this.beep(523, 0.08, 'sine', 0.05);
    this.beep(659, 0.1, 'sine', 0.04);
  },

  alert() {
    this.beep(400, 0.08, 'square', 0.05);
    this.beep(400, 0.08, 'square', 0.05);
  },

  siren() {
    this.ensure();
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'siren' in { siren: 1 } ? 'square' : 'square';
    o.frequency.setValueAtTime(600, t);
    o.frequency.linearRampToValueAtTime(900, t + 0.2);
    o.frequency.linearRampToValueAtTime(600, t + 0.4);
    g.gain.value = 0.035;
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + 0.45);
  },

  // ——— Voices (SpeechSynthesis) ———
  voicePickup() {
    this.speak('Sannu', { rate: 0.95, pitch: 1.05 });
  },

  voiceSannu() {
    this.speak('Sannu, ina zuwa', { rate: 0.92, pitch: 1 });
  },

  voiceDrop() {
    this.speak('Akwai', { rate: 0.95, pitch: 1.05 });
  },

  voiceAkwai() {
    this.speak('Akwai! Na gode', { rate: 0.93, pitch: 1 });
  },

  voiceYau() {
    this.speak('Yau', { rate: 1, pitch: 1 });
  },

  voiceKarota() {
    this.speak('KAROTA checkpoint. No parking.', { rate: 0.95, pitch: 0.95 });
  },

  voiceYanDaba() {
    this.speak('Danger! Yan daba!', { rate: 1.05, pitch: 1.1 });
  },

  voiceLowFuel() {
    this.speak('Low fuel', { rate: 1, pitch: 0.95 });
  },

  voiceRefuel() {
    this.speak('Petrol station. Refueled.', { rate: 1, pitch: 1 });
  }
};

// Warm up voices list (Chrome loads async)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}
