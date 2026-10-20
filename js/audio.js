import { save, persist } from './storage.js';
import { RADIO } from './config.js';

const clamp = (value, min, max) => {
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
};

const ENGINE_AUDIO_URL = '/assets/models/audio/engine.mp3';
const HORN_AUDIO_URL = '/assets/models/audio/horn.mp3';

const RADIO_ROOTS = [
  '/assets/models/audio/',
  '/assets/audio/',
  '/audio/',
  '/assets/sounds/',
  '/sounds/',
  '/assets/sfx/',
];

// Order must match js/config.js RADIO.
const RADIO_FILES = [
  ['vision-fm.mp3', 'vision.mp3', 'radio-kano.mp3', 'ruffneck.mp3'],
  ['rahama.mp3', 'rahama-radio.mp3'],
  ['freedom.mp3', 'freedom-radio.mp3'],
  ['cool.mp3', 'cool-fm.mp3', 'cool-fm-kano.mp3'],
  ['arewa.mp3', 'arewa-radio.mp3'],
  ['express-radio-kano.mp3', 'express.mp3', 'wazobia.mp3'],
];

/**
 * Kano Life AudioManager
 * Keeps the public interface used by Game, UI and the radio controller.
 * The engine recording is pitch/volume modulated by speed and rev changes;
 * a quiet synthesised harmonic layer adds RPM response without replacing MP3.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = !Boolean(save?.muted);
    this.disposed = false;
    this.started = false;

    this.osc = null;
    this.gain = null;
    this.harmonicOsc = null;
    this.harmonicGain = null;
    this.engineFilter = null;
    this.roadNoiseSource = null;
    this.roadNoiseFilter = null;
    this.roadNoiseGain = null;
    this.synthStarted = false;

    this.engineAudio = null;
    this.hornAudio = null;
    this.engineAudioFailed = false;
    this.hornAudioFailed = false;
    this.enginePlayBlocked = false;

    this.lastSignedSpeed = 0;
    this.lastAbsSpeed = 0;
    this.lastEngineSampleAt = 0;
    this.acceleration = 0;
    this.radioAudio = null;
    this.radioEnabled = Boolean(save?.radioEnabled);
    this.radioIndex = -1;
    this.radioRequestIndex = -1;
    this.radioSyncVersion = 0;
    this.radioResolveCache = new Map();
    this.radioWarned = false;
    this.activeEffects = new Set();

    // Radio UI shares this instance; never create a second manager/player.
    if (typeof window !== 'undefined') {
      window.__KANO_AUDIO_MANAGER__ = this;
      window.kanoAudioManager = this;
    }
  }

  ensure() {
    return this.ensureContext();
  }

  ensureContext() {
    if (this.disposed || typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      try {
        this.ctx = new AudioContextClass();
      } catch (error) {
        console.warn('[Kano Life] Web Audio is unavailable:', error);
        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  ensureMediaAudio() {
    if (typeof window === 'undefined' || typeof window.Audio !== 'function') return;

    if (!this.engineAudio && !this.engineAudioFailed) {
      try {
        const player = new window.Audio(ENGINE_AUDIO_URL);
        player.preload = 'auto';
        player.loop = true;
        player.volume = 0.24;
        player.playbackRate = 0.78;
        player.setAttribute('playsinline', '');
        player.addEventListener('error', () => {
          this.engineAudioFailed = true;
          if (this.enabled && !this.disposed && this.started) this.startSynthEngine();
        });
        this.engineAudio = player;
      } catch (error) {
        this.engineAudioFailed = true;
        console.warn('[Kano Life] Could not create engine MP3 player:', error);
      }
    }

    if (!this.hornAudio && !this.hornAudioFailed) {
      try {
        const player = new window.Audio(HORN_AUDIO_URL);
        player.preload = 'auto';
        player.loop = false;
        player.volume = 0.92;
        player.setAttribute('playsinline', '');
        player.addEventListener('error', () => { this.hornAudioFailed = true; });
        this.hornAudio = player;
      } catch (error) {
        this.hornAudioFailed = true;
        console.warn('[Kano Life] Could not create horn MP3 player:', error);
      }
    }
  }

  start() {
    if (!this.enabled || this.disposed) return false;

    this.ensureMediaAudio();
    this.enginePlayBlocked = false;
    this.started = true;

    let mediaStarted = false;
    if (this.engineAudio && !this.engineAudioFailed) {
      mediaStarted = this.playEngineMedia();
    }

    // Start the RPM tone layer as well as the recording. This is what makes
    // the engine respond to changes in vehicle load rather than just playback rate.
    this.startSynthEngine();
    this.syncRadioStation(false);
    this.engine(this.lastSignedSpeed);
    return Boolean(mediaStarted || this.synthStarted || this.engineAudio);
  }

  playEngineMedia() {
    if (!this.enabled || this.disposed || !this.engineAudio || this.engineAudioFailed || this.enginePlayBlocked) {
      return false;
    }
    try {
      if (this.engineAudio.paused || this.engineAudio.ended) {
        const result = this.engineAudio.play();
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            if (this.disposed || !this.enabled) return;
            if (error?.name === 'NotAllowedError') {
              this.enginePlayBlocked = true;
              return;
            }
            this.engineAudioFailed = true;
            this.startSynthEngine();
          });
        }
      }
      return true;
    } catch (error) {
      this.engineAudioFailed = true;
      this.startSynthEngine();
      return false;
    }
  }

  startSynthEngine() {
    if (this.disposed || !this.enabled) return false;
    if (this.synthStarted && this.osc && this.gain) return true;

    const ctx = this.ensureContext();
    if (!ctx) return false;

    try {
      this.osc = ctx.createOscillator();
      this.engineFilter = ctx.createBiquadFilter();
      this.gain = ctx.createGain();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 48;
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 380;
      this.engineFilter.Q.value = 0.72;
      this.gain.gain.value = 0.0001;
      this.osc.connect(this.engineFilter);
      this.engineFilter.connect(this.gain);
      this.gain.connect(ctx.destination);

      this.harmonicOsc = ctx.createOscillator();
      this.harmonicGain = ctx.createGain();
      this.harmonicOsc.type = 'triangle';
      this.harmonicOsc.frequency.value = 96;
      this.harmonicGain.gain.value = 0.12;
      this.harmonicOsc.connect(this.harmonicGain);
      this.harmonicGain.connect(this.engineFilter);

      const length = Math.max(1, Math.floor(ctx.sampleRate * 1.1));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) channel[i] = (Math.random() * 2 - 1) * 0.28;

      this.roadNoiseSource = ctx.createBufferSource();
      this.roadNoiseFilter = ctx.createBiquadFilter();
      this.roadNoiseGain = ctx.createGain();
      this.roadNoiseSource.buffer = buffer;
      this.roadNoiseSource.loop = true;
      this.roadNoiseFilter.type = 'lowpass';
      this.roadNoiseFilter.frequency.value = 520;
      this.roadNoiseGain.gain.value = 0.0001;
      this.roadNoiseSource.connect(this.roadNoiseFilter);
      this.roadNoiseFilter.connect(this.roadNoiseGain);
      this.roadNoiseGain.connect(ctx.destination);

      this.osc.start();
      this.harmonicOsc.start();
      this.roadNoiseSource.start();
      this.synthStarted = true;
      return true;
    } catch (error) {
      console.warn('[Kano Life] Could not initialise RPM layer:', error);
      this.cleanupEngineLayers();
      return false;
    }
  }

  engine(signedSpeed = 0, input = {}) {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const raw = Number(signedSpeed);
    const safeSpeed = Number.isFinite(raw) ? raw : 0;
    const speed = Math.abs(safeSpeed);
    const reversing = safeSpeed < -0.05;
    const elapsed = this.lastEngineSampleAt > 0
      ? Math.max(0.02, (nowMs - this.lastEngineSampleAt) / 1000)
      : 0.05;

    this.acceleration = clamp((speed - this.lastAbsSpeed) / elapsed, -70, 70);
    this.lastAbsSpeed = speed;
    this.lastEngineSampleAt = nowMs;
    this.lastSignedSpeed = safeSpeed;
    this.syncRadioStation(false);

    if (!this.enabled || this.disposed) {
      this.fadeEngineToSilence();
      try { this.engineAudio?.pause(); } catch {}
      return;
    }

    this.ensureMediaAudio();
    if (!this.started) this.started = true;

    const throttle = clamp(input.throttle ?? (this.acceleration > 0 ? this.acceleration / 22 : 0), 0, 1);
    const braking = clamp(input.braking ?? 0, 0, 1);
    const revLoad = clamp(throttle * 0.55 + Math.max(0, this.acceleration) / 48, 0, 1);

    // Stronger speed curve plus a transient RPM rise under acceleration.
    // At zero speed the engine remains at a lower idle pitch, not silent.
    const baseRate = 0.76 + Math.min(speed, 72) * 0.0102;
    const revBoost = revLoad * (speed < 14 ? 0.20 : 0.13);
    const targetRate = clamp(baseRate + revBoost - braking * 0.035, 0.76, 1.72);
    const targetVolume = clamp(
      0.23 + Math.min(speed, 90) * 0.0030 + revLoad * 0.065,
      0.23,
      0.60,
    );

    if (this.engineAudio && !this.engineAudioFailed) {
      try {
        this.engineAudio.volume = targetVolume;
        this.engineAudio.playbackRate = reversing
          ? clamp(targetRate * 0.87, 0.72, 1.48)
          : targetRate;
      } catch {
        // Some browsers restrict playback-rate updates.
      }
      this.playEngineMedia();
    }

    // Blend a quiet mechanical RPM harmonic on top of engine.mp3. The pulse
    // follows speed, acceleration and reverse gear so the sound feels coupled
    // to the keke's movement instead of being a fixed loop.
    if (!this.synthStarted) this.startSynthEngine();
    if (!this.ctx || !this.osc || !this.gain) return;

    const ctx = this.ctx;
    const time = ctx.currentTime;
    const accelRise = Math.max(0, this.acceleration);
    const engineBase = reversing ? 42 : 48;
    const speedPitch = reversing ? 0.72 : 0.94;
    const pulseHz = 5.2 + speed * 0.085 + revLoad * 4.5;
    const rpmPulse = Math.sin(time * pulseHz) * (0.8 + revLoad * 2.8);
    const frequency = clamp(engineBase + speed * speedPitch + revLoad * 13 + rpmPulse, 38, 175);
    const mediaAvailable = this.engineAudio && !this.engineAudioFailed;
    const harmonicGain = mediaAvailable
      ? clamp(0.004 + speed * 0.000075 + accelRise * 0.00020 + revLoad * 0.006, 0.004, 0.026)
      : clamp(0.026 + speed * 0.00055 + revLoad * 0.018, 0.026, 0.095);
    const roadNoise = clamp(speed * 0.00011, 0.0001, 0.012);
    const cutoff = clamp(330 + speed * 6.5 + revLoad * 170, 330, 1300);

    try {
      this.osc.frequency.setTargetAtTime(frequency, time, 0.055);
      if (this.harmonicOsc) this.harmonicOsc.frequency.setTargetAtTime(frequency * 2.03, time, 0.065);
      this.gain.gain.setTargetAtTime(harmonicGain, time, 0.065);
      this.engineFilter?.frequency.setTargetAtTime(cutoff, time, 0.075);
      this.roadNoiseGain?.gain.setTargetAtTime(mediaAvailable ? roadNoise * 0.55 : roadNoise, time, 0.1);
      this.roadNoiseFilter?.frequency.setTargetAtTime(clamp(300 + speed * 8, 300, 1450), time, 0.1);
    } catch {
      // The audio context may be closing during navigation.
    }
  }

  fadeEngineToSilence() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      this.gain?.gain.setTargetAtTime(0.0001, now, 0.06);
      this.roadNoiseGain?.gain.setTargetAtTime(0.0001, now, 0.06);
    } catch {}
  }

  playTone({
    frequency = 440,
    type = 'sine',
    duration = 0.1,
    volume = 0.045,
    endFrequency = null,
    delay = 0,
    filterFrequency = 2600,
  } = {}) {
    if (!this.enabled || this.disposed) return false;
    const ctx = this.ensureContext();
    if (!ctx) return false;

    let oscillator;
    let envelope;
    let filter;
    try {
      oscillator = ctx.createOscillator();
      envelope = ctx.createGain();
      filter = ctx.createBiquadFilter();
      const startAt = ctx.currentTime + Math.max(0, Number(delay) || 0);
      const safeDuration = clamp(duration, 0.025, 1.6);
      const stopAt = startAt + safeDuration;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(clamp(frequency, 35, 2600), startAt);
      if (Number.isFinite(endFrequency)) {
        oscillator.frequency.exponentialRampToValueAtTime(clamp(endFrequency, 35, 2600), stopAt);
      }
      filter.type = 'lowpass';
      filter.frequency.value = clamp(filterFrequency, 200, 9000);
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.linearRampToValueAtTime(clamp(volume, 0.0001, 0.2), startAt + Math.min(0.025, safeDuration * 0.22));
      envelope.gain.setTargetAtTime(0.0001, startAt + safeDuration * 0.62, Math.max(0.012, safeDuration * 0.12));
      oscillator.connect(filter);
      filter.connect(envelope);
      envelope.connect(ctx.destination);

      const effect = { oscillator, envelope, filter };
      this.activeEffects.add(effect);
      oscillator.addEventListener('ended', () => {
        for (const node of [oscillator, filter, envelope]) {
          try { node.disconnect(); } catch {}
        }
        this.activeEffects.delete(effect);
      }, { once: true });
      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.03);
      return true;
    } catch {
      for (const node of [oscillator, filter, envelope]) {
        try { node?.disconnect(); } catch {}
      }
      return false;
    }
  }

  beep(frequency = 440, duration = 0.09, volume = 0.045) {
    return this.playTone({ frequency, duration, volume, type: 'sine', filterFrequency: 3200 });
  }

  horn() {
    if (!this.enabled || this.disposed) return false;
    this.ensureMediaAudio();
    if (this.hornAudio && !this.hornAudioFailed) {
      try {
        this.hornAudio.currentTime = 0;
        this.hornAudio.volume = 0.92;
        const result = this.hornAudio.play();
        if (result?.catch) {
          result.catch((error) => {
            if (this.disposed || !this.enabled) return;
            if (error?.name !== 'NotAllowedError') {
              this.hornAudioFailed = true;
              this.playSyntheticHorn();
            }
          });
        }
        return true;
      } catch {
        this.hornAudioFailed = true;
      }
    }
    return this.playSyntheticHorn();
  }

  playSyntheticHorn() {
    const first = this.playTone({ frequency: 218, endFrequency: 205, type: 'square', duration: 0.34, volume: 0.095, filterFrequency: 950 });
    const second = this.playTone({ frequency: 276, endFrequency: 258, type: 'sawtooth', duration: 0.30, volume: 0.045, delay: 0.012, filterFrequency: 1150 });
    return first || second;
  }

  pickup() {
    const first = this.playTone({ frequency: 590, endFrequency: 710, duration: 0.12, volume: 0.055 });
    const second = this.playTone({ frequency: 790, endFrequency: 990, duration: 0.14, volume: 0.045, delay: 0.085 });
    return first || second;
  }

  crash() {
    const first = this.playTone({ frequency: 150, endFrequency: 48, type: 'sawtooth', duration: 0.30, volume: 0.095, filterFrequency: 650 });
    const second = this.playTone({ frequency: 88, endFrequency: 42, type: 'square', duration: 0.22, volume: 0.045, delay: 0.025, filterFrequency: 430 });
    return first || second;
  }

  whistle() {
    return this.playTone({ frequency: 1350, endFrequency: 1050, duration: 0.24, volume: 0.055, filterFrequency: 3000 });
  }

  currentRadioIndex() {
    const count = Math.max(1, RADIO?.length || RADIO_FILES.length);
    const raw = Number(save?.radioIndex);
    const index = Number.isFinite(raw) ? Math.floor(raw) : 0;
    return ((index % count) + count) % count;
  }

  async resolveLocalAudio(filename) {
    if (!filename || typeof fetch !== 'function' || typeof window === 'undefined') return null;
    if (this.radioResolveCache.has(filename)) return this.radioResolveCache.get(filename);
    const lookup = (async () => {
      for (const root of RADIO_ROOTS) {
        const url = `${root}${encodeURIComponent(filename).replace(/%2F/gi, '/')}`;
        try {
          const response = await fetch(url, { method: 'HEAD', cache: 'force-cache', credentials: 'same-origin' });
          if (!response.ok) continue;
          const contentType = response.headers.get('content-type') || '';
          if (/text\/html/i.test(contentType)) continue;
          return url;
        } catch {}
      }
      return null;
    })();
    this.radioResolveCache.set(filename, lookup);
    return lookup;
  }

  async syncRadioStation(force = false) {
    if (this.disposed || !this.enabled || !this.radioEnabled) return false;
    const index = this.currentRadioIndex();
    if (!force && index === this.radioIndex && this.radioAudio) return true;
    if (!force && index === this.radioRequestIndex) return false;

    const version = ++this.radioSyncVersion;
    this.radioRequestIndex = index;
    this.stopRadio();
    let url = null;
    for (const filename of RADIO_FILES[index] || []) {
      url = await this.resolveLocalAudio(filename);
      if (url) break;
    }
    if (this.disposed || !this.enabled || version !== this.radioSyncVersion || index !== this.currentRadioIndex()) return false;
    if (!url) {
      this.radioIndex = index;
      if (!this.radioWarned) {
        console.info('[Kano Life] No local radio programme file was found; radio music remains silent while engine sound stays available.');
        this.radioWarned = true;
      }
      return false;
    }
    try {
      const player = new window.Audio(url);
      player.preload = 'auto';
      player.loop = true;
      player.volume = 0.16;
      player.setAttribute('playsinline', '');
      this.radioAudio = player;
      this.radioIndex = index;
      await player.play();
      return true;
    } catch (error) {
      this.radioAudio = null;
      this.radioIndex = error?.name === 'NotAllowedError' ? -1 : index;
      return false;
    }
  }

  stopRadio() {
    const player = this.radioAudio;
    this.radioAudio = null;
    if (!player) return;
    try {
      player.pause();
      player.removeAttribute('src');
      player.load();
    } catch {}
  }

  // Compatibility for js/radio.js. This manages only the radio track;
  // it does not start a second engine recording.
  startRadioBed() {
    if (this.disposed) return false;
    this.radioEnabled = true;
    save.radioEnabled = true;
    try { persist(); } catch {}
    if (!this.enabled) return false;
    return this.syncRadioStation(true);
  }

  stopRadioBed() {
    this.radioEnabled = false;
    save.radioEnabled = false;
    try { persist(); } catch {}
    this.radioSyncVersion += 1;
    this.radioRequestIndex = -1;
    this.stopRadio();
    return true;
  }

  radioTune(stationName) {
    const requested = String(stationName || '').trim().toLowerCase();
    const index = (RADIO || []).findIndex((station) => String(station.name).toLowerCase() === requested);
    if (index < 0) return false;
    save.radioIndex = index;
    try { persist(); } catch {}
    this.radioIndex = -1;
    this.radioRequestIndex = -1;
    return this.syncRadioStation(true);
  }

  speak(text, options = {}) {
    if (!this.enabled || this.disposed || typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text || ''));
      utterance.rate = clamp(options.rate ?? 1, 0.65, 1.35);
      utterance.pitch = clamp(options.pitch ?? 1, 0.5, 1.8);
      utterance.volume = clamp(options.volume ?? 0.75, 0, 1);
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  toggle() {
    if (this.disposed) return this.enabled;
    this.enabled = !this.enabled;
    save.muted = !this.enabled;
    try { persist(); } catch (error) { console.warn('[Kano Life] Could not save audio preference:', error); }
    if (this.enabled) {
      this.enginePlayBlocked = false;
      this.start();
      this.syncRadioStation(true);
    } else {
      this.radioSyncVersion += 1;
      this.radioRequestIndex = -1;
      this.fadeEngineToSilence();
      try { this.engineAudio?.pause(); } catch {}
      try { this.hornAudio?.pause(); } catch {}
      this.stopRadio();
      try { window.speechSynthesis?.cancel?.(); } catch {}
      for (const effect of this.activeEffects) {
        try { effect.oscillator.stop(); } catch {}
      }
    }
    return this.enabled;
  }

  cleanupEngineLayers() {
    for (const source of [this.osc, this.harmonicOsc, this.roadNoiseSource]) {
      try { source?.stop(); } catch {}
      try { source?.disconnect(); } catch {}
    }
    for (const node of [this.engineFilter, this.gain, this.harmonicGain, this.roadNoiseFilter, this.roadNoiseGain]) {
      try { node?.disconnect(); } catch {}
    }
    this.osc = null;
    this.gain = null;
    this.harmonicOsc = null;
    this.harmonicGain = null;
    this.engineFilter = null;
    this.roadNoiseSource = null;
    this.roadNoiseFilter = null;
    this.roadNoiseGain = null;
    this.synthStarted = false;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.radioSyncVersion += 1;
    this.stopRadio();
    for (const player of [this.engineAudio, this.hornAudio]) {
      if (!player) continue;
      try { player.pause(); player.removeAttribute('src'); player.load(); } catch {}
    }
    this.engineAudio = null;
    this.hornAudio = null;
    for (const effect of this.activeEffects) {
      try { effect.oscillator.stop(); } catch {}
      for (const node of [effect.oscillator, effect.filter, effect.envelope]) {
        try { node?.disconnect(); } catch {}
      }
    }
    this.activeEffects.clear();
    this.cleanupEngineLayers();
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    this.ctx = null;
    if (typeof window !== 'undefined') {
      if (window.__KANO_AUDIO_MANAGER__ === this) delete window.__KANO_AUDIO_MANAGER__;
      if (window.kanoAudioManager === this) delete window.kanoAudioManager;
    }
  }
}

export default AudioManager;
