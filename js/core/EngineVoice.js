/**
 * Continuous keke engine voice — oscillators modulated by speed.
 * Never recreate nodes per frame; use setTargetAtTime only.
 */
export default class EngineVoice {
  constructor({ audioContext, destination }) {
    this.ctx = audioContext;
    this.master = destination;

    this.oscA = this.ctx.createOscillator();
    this.oscB = this.ctx.createOscillator();
    this.oscA.type = "sawtooth";
    this.oscB.type = "square";
    this.oscB.detune.value = -14;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 5;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    this.oscA.connect(this.filter);
    this.oscB.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.master);

    try {
      this.oscA.start();
      this.oscB.start();
    } catch (e) {}

    this._lastUpdate = 0;
    this.enabled = false;
  }

  update(speed, maxSpeed, now) {
    if (!this.enabled || !this.ctx) return;
    if (now - this._lastUpdate < 0.05) return;
    this._lastUpdate = now;

    const rpm = Math.min(Math.abs(speed) / (maxSpeed || 40), 1);
    const baseFreq = 42 + rpm * 165;
    const t = this.ctx.currentTime;

    this.oscA.frequency.setTargetAtTime(baseFreq, t, 0.06);
    this.oscB.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.06);
    this.filter.frequency.setTargetAtTime(220 + rpm * 2600, t, 0.08);
    this.gain.gain.setTargetAtTime(0.02 + rpm * 0.14, t, 0.1);
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(on ? 0.04 : 0, t, 0.15);
  }

  shift() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value * 0.3, t);
    this.gain.gain.setTargetAtTime(0.1, t + 0.05, 0.08);
  }

  dispose() {
    try {
      this.oscA.stop();
      this.oscB.stop();
    } catch (e) {}
    try {
      this.oscA.disconnect();
      this.oscB.disconnect();
      this.filter.disconnect();
      this.gain.disconnect();
    } catch (e) {}
  }
}
