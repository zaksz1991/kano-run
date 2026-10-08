export const Audio = {
  ctx: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  },
  beep(freq, dur, type = 'square', vol = 0.04) {
    this.ensure();
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(this.ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.stop(this.ctx.currentTime + dur);
  },
  startEngine() { this.ensure(); },
  stopEngine() {},
  updateEngine() {},
  horn() { this.beep(180, 0.15, 'sawtooth', 0.06); },
  crash() { this.beep(80, 0.3, 'sawtooth', 0.08); },
  pickup() { this.beep(520, 0.08, 'sine', 0.05); },
  coin() { this.beep(880, 0.06, 'sine', 0.04); }
};
