/** Audio — developer RuffNeck */
export const Audio = {
  ctx: null,
  eng: null,
  engGain: null,
  radioOsc: null,
  radioGain: null,
  muted: false,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
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

  startEngine() {
    this.ensure();
    if (!this.ctx || this.eng || this.muted) return;
    this.eng = this.ctx.createOscillator();
    this.engGain = this.ctx.createGain();
    this.eng.type = 'sawtooth';
    this.eng.frequency.value = 55;
    this.engGain.gain.value = 0.014;
    this.eng.connect(this.engGain);
    this.engGain.connect(this.ctx.destination);
    this.eng.start();
  },

  stopEngine() {
    try { this.eng?.stop(); this.eng?.disconnect(); } catch {}
    this.eng = null;
    this.engGain = null;
  },

  updateEngine(speed = 4) {
    if (this.muted) { this.stopEngine(); return; }
    if (!this.eng || !this.engGain) return;
    this.eng.frequency.value = 48 + speed * 7;
    this.engGain.gain.value = 0.01 + Math.min(0.025, speed * 0.0025);
  },

  startRadioBed() {
    this.ensure();
    if (!this.ctx || this.muted || this.radioOsc) return;
    this.radioOsc = this.ctx.createOscillator();
    this.radioGain = this.ctx.createGain();
    this.radioOsc.type = 'triangle';
    this.radioOsc.frequency.value = 220 + Math.random() * 80;
    this.radioGain.gain.value = 0.008;
    this.radioOsc.connect(this.radioGain);
    this.radioGain.connect(this.ctx.destination);
    this.radioOsc.start();
  },

  stopRadioBed() {
    try { this.radioOsc?.stop(); this.radioOsc?.disconnect(); } catch {}
    this.radioOsc = null;
    this.radioGain = null;
  },

  radioTune() {
    this.stopRadioBed();
    this.beep(600, 0.05, 'sine', 0.03);
    this.beep(800, 0.05, 'sine', 0.03);
    setTimeout(() => this.startRadioBed(), 120);
  },

  horn() { this.beep(180, 0.18, 'sawtooth', 0.07); this.beep(220, 0.12, 'square', 0.03); },
  crash() { this.beep(70, 0.35, 'sawtooth', 0.09); this.beep(40, 0.4, 'square', 0.05); },
  pickup() { this.beep(520, 0.08, 'sine', 0.05); this.beep(660, 0.06, 'sine', 0.03); },
  coin() { this.beep(880, 0.06, 'sine', 0.04); },
  negotiate() { this.beep(320, 0.1, 'triangle', 0.05); },
  success() { this.beep(523, 0.08, 'sine', 0.05); this.beep(659, 0.1, 'sine', 0.04); },
  alert() { this.beep(400, 0.08, 'square', 0.05); },
  siren() { this.beep(500, 0.15, 'square', 0.04); this.beep(650, 0.15, 'square', 0.04); },
  voicePickup() { this.beep(280, 0.06, 'triangle', 0.04); this.beep(340, 0.08, 'triangle', 0.03); },
  voiceDrop() { this.beep(340, 0.06, 'triangle', 0.04); this.beep(260, 0.09, 'triangle', 0.03); }
};
