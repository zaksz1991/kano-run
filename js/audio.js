// Audio system for Kano Run
let audioCtx = null;
let engineOsc = null;
let engineGain = null;

export const Audio = {
  ensure() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio not supported');
      }
    }
    return audioCtx;
  },

  playTone(freq, dur = 0.1, type = 'square', vol = 0.08) {
    const ac = this.ensure();
    if (!ac) return;
    try {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g);
      g.connect(ac.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, ac.currentTime);
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.start();
      o.stop(ac.currentTime + dur);
    } catch (e) {}
  },

  startEngine() {
    const ac = this.ensure();
    if (!ac || engineOsc) return;
    try {
      engineOsc = ac.createOscillator();
      engineGain = ac.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0.018;
      engineOsc.connect(engineGain);
      engineGain.connect(ac.destination);
      engineOsc.start();
    } catch (e) {}
  },

  stopEngine() {
    if (engineOsc) {
      try { engineOsc.stop(); } catch (e) {}
      engineOsc = null;
      engineGain = null;
    }
  },

  updateEngine(speed) {
    if (engineOsc && engineGain && audioCtx) {
      engineOsc.frequency.setTargetAtTime(48 + speed * 4.5, audioCtx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.012 + speed * 0.0018, audioCtx.currentTime, 0.1);
    }
  },

  horn(power = 0) {
    this.playTone(340 + power * 50, 0.16, 'square', 0.12);
    setTimeout(() => this.playTone(260 + power * 20, 0.1, 'square', 0.08), 50);
    setTimeout(() => this.playTone(200, 0.08, 'triangle', 0.05), 110);
  },

  laneChange() {
    this.playTone(180, 0.06, 'triangle', 0.04);
  },

  pickup() {
    this.playTone(420, 0.06, 'sine', 0.07);
    setTimeout(() => this.playTone(520, 0.08, 'sine', 0.05), 50);
  },

  drop() {
    this.playTone(500, 0.07, 'sine', 0.08);
    setTimeout(() => this.playTone(620, 0.09, 'sine', 0.07), 60);
    setTimeout(() => this.playTone(740, 0.1, 'sine', 0.05), 130);
  },

  coin() {
    this.playTone(720, 0.06, 'sine', 0.05);
  },

  missionComplete() {
    this.playTone(523, 0.1, 'sine', 0.08);
    setTimeout(() => this.playTone(659, 0.12, 'sine', 0.08), 100);
  },

  crash() {
    this.playTone(120, 0.3, 'sawtooth', 0.1);
  },

  purchase() {
    this.playTone(600, 0.12, 'sine', 0.07);
  },

  radioOn() {
    this.playTone(440, 0.08, 'sine', 0.05);
  }
};
