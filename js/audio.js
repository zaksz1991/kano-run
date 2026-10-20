import { save, persist } from './storage.js';
import { RADIO } from './config.js';

// ============================================================
// KANO LIFE — AUDIO MANAGER
// File: js/audio.js
//
// Complete replacement for the existing AudioManager.
// Keeps the existing public API used by Game and UI:
// start, engine, beep, horn, pickup, crash, toggle, dispose.
//
// Improvements:
// - More audible, layered procedural keke idle/acceleration audio.
// - Filtered engine harmonics and speed-related road rumble.
// - Strong two-tone horn, pickup chime, and crash effect.
// - Optional local radio MP3 playback when a matching file exists.
// - Searches common local audio folders without assuming every file exists.
// - Detects radio-index changes from the existing save/UI integration.
// - Persistent mute preference and safe cleanup.
//
// Browser autoplay policy still requires user interaction; Game.start()
// calls audio.start() from the game's start-button interaction.
// ============================================================

const clamp = (value, min, max) => {
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
};

const RADIO_ROOTS = [
  '/assets/audio/',
  '/audio/',
  '/assets/sounds/',
  '/sounds/',
  '/assets/sfx/',
];

// A station is only played when one of its local files actually exists.
// This avoids substituting an unrelated station or pretending generated
// tones are real radio programming.
const RADIO_FILES = [
  ['radio-kano.mp3', 'vision-fm.mp3', 'vision.mp3', 'ruffneck.mp3'],
  ['rahama.mp3', 'rahama-radio.mp3'],
  ['freedom.mp3', 'freedom-radio.mp3'],
  ['cool.mp3', 'cool-fm.mp3', 'cool-fm-kano.mp3'],
  ['arewa.mp3', 'arewa-radio.mp3'],
  ['wazobia.mp3', 'express-radio-kano.mp3', 'express.mp3'],
];

export class AudioManager {
  constructor() {
    this.ctx = null;

    // Compatibility properties used by the original engine-sound code.
    this.osc = null;
    this.gain = null;

    this.harmonicOsc = null;
    this.harmonicGain = null;
    this.engineFilter = null;
    this.roadNoiseSource = null;
    this.roadNoiseFilter = null;
    this.roadNoiseGain = null;

    this.enabled = !Boolean(save?.muted);
    this.disposed = false;
    this.started = false;
    this.lastSignedSpeed = 0;
    this.activeEffects = new Set();

    this.radioAudio = null;
    this.radioIndex = -1;
    this.radioRequestIndex = -1;
    this.radioSyncVersion = 0;
    this.radioResolveCache = new Map();
    this.radioWarned = false;
    this.radioUserMuted = false;

    this._effectTimers = new Set();
  }

  // ----------------------------------------------------------
  // AUDIO CONTEXT
  // ----------------------------------------------------------

  ensureContext() {
    if (this.disposed || typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return null;

      try {
        this.ctx = new AudioContextClass();
      } catch (error) {
        console.warn('[Kano Life] Web Audio is unavailable:', error);
        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // A later user gesture may be needed on some browsers.
      });
    }

    return this.ctx;
  }

  start() {
    if (!this.enabled || this.disposed) return false;

    const ctx = this.ensureContext();
    if (!ctx) return false;

    if (!this.started) {
      try {
        this.createEngineLayers(ctx);
        this.started = true;
      } catch (error) {
        console.warn('[Kano Life] Could not initialise engine audio:', error);
        this.cleanupEngineLayers();
        return false;
      }
    }

    this.engine(this.lastSignedSpeed);
    return true;
  }

  createEngineLayers(ctx) {
    // Main engine tone, passed through a low-pass filter to reduce harshness.
    this.osc = ctx.createOscillator();
    this.engineFilter = ctx.createBiquadFilter();
    this.gain = ctx.createGain();

    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 48;
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 360;
    this.engineFilter.Q.value = 0.65;
    this.gain.gain.value = 0.0001;

    this.osc.connect(this.engineFilter);
    this.engineFilter.connect(this.gain);
    this.gain.connect(ctx.destination);

    // Low harmonic adds body to the engine without relying on an external file.
    this.harmonicOsc = ctx.createOscillator();
    this.harmonicGain = ctx.createGain();
    this.harmonicOsc.type = 'triangle';
    this.harmonicOsc.frequency.value = 96;
    this.harmonicGain.gain.value = 0.18;
    this.harmonicOsc.connect(this.harmonicGain);
    this.harmonicGain.connect(this.engineFilter);

    // A quiet filtered noise layer supplies a little mechanical/road texture.
    // Keep the buffer short and reuse a single looping source.
    const length = Math.max(1, Math.floor(ctx.sampleRate * 1.25));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      channel[i] = (Math.random() * 2 - 1) * 0.42;
    }

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
  }

  cleanupEngineLayers() {
    for (const source of [this.osc, this.harmonicOsc, this.roadNoiseSource]) {
      try {
        source?.stop();
      } catch {
        // The source may not have started.
      }
      try {
        source?.disconnect();
      } catch {
        // Ignore partially constructed nodes.
      }
    }

    for (const node of [
      this.engineFilter,
      this.gain,
      this.harmonicGain,
      this.roadNoiseFilter,
      this.roadNoiseGain,
    ]) {
      try {
        node?.disconnect();
      } catch {
        // Ignore partially constructed nodes.
      }
    }

    this.osc = null;
    this.gain = null;
    this.harmonicOsc = null;
    this.harmonicGain = null;
    this.engineFilter = null;
    this.roadNoiseSource = null;
    this.roadNoiseFilter = null;
    this.roadNoiseGain = null;
    this.started = false;
  }

  // ----------------------------------------------------------
  // ENGINE AND ROAD SOUND
  // Positive signedSpeed = forward; negative = reverse.
  // ----------------------------------------------------------

  engine(signedSpeed = 0) {
    const rawSpeed = Number(signedSpeed);
    const safeSpeed = Number.isFinite(rawSpeed) ? rawSpeed : 0;
    this.lastSignedSpeed = safeSpeed;

    // The existing UI changes save.radioIndex before calling beep(). This
    // polling path also catches a station change from other game code.
    this.syncRadioStation(false);

    if (!this.enabled || this.disposed) {
      this.fadeEngineToSilence();
      return;
    }

    if (!this.started && !this.start()) return;
    if (!this.ctx || !this.osc || !this.gain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const speed = Math.abs(safeSpeed);
    const reversing = safeSpeed < -0.05;

    const baseFrequency = reversing ? 43 : 48;
    const speedPitch = reversing ? 0.62 : 0.83;
    const rpmPulse = Math.sin(now * (5.5 + speed * 0.08)) * Math.min(2.4, speed * 0.025);
    const frequency = clamp(baseFrequency + speed * speedPitch + rpmPulse, 38, 158);
    const targetGain = clamp(0.028 + speed * 0.00042, 0.028, 0.082);
    const targetRoadNoise = clamp(speed * 0.000075, 0.0001, 0.009);
    const cutoff = clamp(310 + speed * 5.2, 310, 920);

    try {
      this.osc.frequency.setTargetAtTime(frequency, now, 0.075);
      if (this.harmonicOsc) {
        this.harmonicOsc.frequency.setTargetAtTime(frequency * 2.01, now, 0.09);
      }
      this.gain.gain.setTargetAtTime(targetGain, now, 0.11);
      this.engineFilter?.frequency.setTargetAtTime(cutoff, now, 0.12);
      this.roadNoiseGain?.gain.setTargetAtTime(targetRoadNoise, now, 0.16);
      this.roadNoiseFilter?.frequency.setTargetAtTime(
        clamp(300 + speed * 7, 300, 1250),
        now,
        0.15,
      );
    } catch {
      // AudioContext may be closing during a page transition.
    }
  }

  fadeEngineToSilence() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      this.gain?.gain.setTargetAtTime(0.0001, now, 0.06);
      this.roadNoiseGain?.gain.setTargetAtTime(0.0001, now, 0.06);
    } catch {
      // Ignore changes after context shutdown.
    }
  }

  // ----------------------------------------------------------
  // SYNTHESISED EFFECTS
  // ----------------------------------------------------------

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
      const safeVolume = clamp(volume, 0.0001, 0.2);

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(clamp(frequency, 35, 2600), startAt);
      if (Number.isFinite(endFrequency)) {
        oscillator.frequency.exponentialRampToValueAtTime(
          clamp(endFrequency, 35, 2600),
          stopAt,
        );
      }

      filter.type = 'lowpass';
      filter.frequency.value = clamp(filterFrequency, 200, 9000);
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.linearRampToValueAtTime(safeVolume, startAt + Math.min(0.025, safeDuration * 0.22));
      envelope.gain.setTargetAtTime(0.0001, startAt + safeDuration * 0.62, Math.max(0.012, safeDuration * 0.12));

      oscillator.connect(filter);
      filter.connect(envelope);
      envelope.connect(ctx.destination);

      const effect = { oscillator, envelope, filter };
      this.activeEffects.add(effect);
      oscillator.addEventListener('ended', () => {
        try {
          oscillator.disconnect();
          filter.disconnect();
          envelope.disconnect();
        } catch {
          // Nodes may already be disconnected.
        }
        this.activeEffects.delete(effect);
      }, { once: true });

      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.03);
      return true;
    } catch {
      try {
        oscillator?.disconnect();
        envelope?.disconnect();
        filter?.disconnect();
      } catch {
        // Cleanup after a partially constructed effect.
      }
      return false;
    }
  }

  beep(frequency = 440, duration = 0.09, volume = 0.045) {
    // The radio selection UI increments save.radioIndex and then calls beep.
    this.syncRadioStation(true);

    return this.playTone({
      frequency,
      duration,
      volume,
      type: 'sine',
      filterFrequency: 3200,
    });
  }

  horn() {
    if (!this.enabled || this.disposed) return false;
    // Two overlapping square/saw tones make the horn more audible than a beep.
    const first = this.playTone({
      frequency: 218,
      endFrequency: 205,
      type: 'square',
      duration: 0.34,
      volume: 0.095,
      filterFrequency: 950,
    });
    const second = this.playTone({
      frequency: 276,
      endFrequency: 258,
      type: 'sawtooth',
      duration: 0.30,
      volume: 0.045,
      delay: 0.012,
      filterFrequency: 1150,
    });
    return first || second;
  }

  pickup() {
    if (!this.enabled || this.disposed) return false;
    const a = this.playTone({
      frequency: 590,
      endFrequency: 710,
      duration: 0.12,
      volume: 0.055,
      type: 'sine',
    });
    const b = this.playTone({
      frequency: 790,
      endFrequency: 990,
      duration: 0.14,
      volume: 0.045,
      type: 'sine',
      delay: 0.085,
    });
    return a || b;
  }

  crash() {
    if (!this.enabled || this.disposed) return false;
    const a = this.playTone({
      frequency: 150,
      endFrequency: 48,
      type: 'sawtooth',
      duration: 0.30,
      volume: 0.095,
      filterFrequency: 650,
    });
    const b = this.playTone({
      frequency: 88,
      endFrequency: 42,
      type: 'square',
      duration: 0.22,
      volume: 0.045,
      delay: 0.025,
      filterFrequency: 430,
    });
    return a || b;
  }

  whistle() {
    return this.playTone({
      frequency: 1350,
      endFrequency: 1050,
      type: 'sine',
      duration: 0.24,
      volume: 0.055,
      filterFrequency: 3000,
    });
  }

  // ----------------------------------------------------------
  // OPTIONAL LOCAL RADIO PLAYBACK
  // ----------------------------------------------------------

  currentRadioIndex() {
    const count = Math.max(1, RADIO?.length || RADIO_FILES.length);
    const raw = Number(save?.radioIndex);
    const index = Number.isFinite(raw) ? Math.floor(raw) : 0;
    return ((index % count) + count) % count;
  }

  async resolveLocalAudio(filename) {
    if (!filename || typeof fetch !== 'function' || typeof window === 'undefined') return null;

    if (this.radioResolveCache.has(filename)) {
      return this.radioResolveCache.get(filename);
    }

    const lookup = (async () => {
      for (const root of RADIO_ROOTS) {
        const url = `${root}${encodeURIComponent(filename).replace(/%2F/gi, '/')}`;
        try {
          const response = await fetch(url, {
            method: 'HEAD',
            cache: 'force-cache',
            credentials: 'same-origin',
          });
          if (!response.ok) continue;
          const contentType = response.headers.get('content-type') || '';
          // Ignore SPA fallback responses that masquerade as successful files.
          if (/text\/html/i.test(contentType)) continue;
          return url;
        } catch {
          // Try the next local asset folder.
        }
      }
      return null;
    })();

    this.radioResolveCache.set(filename, lookup);
    return lookup;
  }

  async syncRadioStation(force = false) {
    if (this.disposed || !this.enabled) return false;

    const index = this.currentRadioIndex();
    if (!force && index === this.radioIndex && this.radioAudio) return true;
    if (!force && index === this.radioRequestIndex) return false;

    const requestVersion = ++this.radioSyncVersion;
    this.radioRequestIndex = index;
    this.stopRadio();

    const filenames = RADIO_FILES[index] || [];
    let url = null;
    for (const filename of filenames) {
      url = await this.resolveLocalAudio(filename);
      if (url) break;
    }

    // The station may have changed while the local paths were checked.
    if (
      this.disposed ||
      !this.enabled ||
      requestVersion !== this.radioSyncVersion ||
      index !== this.currentRadioIndex()
    ) return false;

    if (!url) {
      this.radioIndex = index;
      if (!this.radioWarned) {
        console.info('[Kano Life] No local radio programme file was found; engine and effects audio remain enabled.');
        this.radioWarned = true;
      }
      return false;
    }

    try {
      const player = new Audio(url);
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
      if (error?.name === 'NotAllowedError') {
        // A future user tap will retry; browsers can defer media playback.
        this.radioIndex = -1;
        return false;
      }
      this.radioIndex = index;
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
    } catch {
      // Ignore media cleanup failures.
    }
  }

  // ----------------------------------------------------------
  // MUTE SETTINGS
  // ----------------------------------------------------------

  toggle() {
    if (this.disposed) return this.enabled;

    this.enabled = !this.enabled;
    save.muted = !this.enabled;
    try {
      persist();
    } catch (error) {
      console.warn('[Kano Life] Could not save audio preference:', error);
    }

    if (this.enabled) {
      this.start();
      this.syncRadioStation(true);
    } else {
      this.radioSyncVersion += 1;
      this.radioRequestIndex = -1;
      this.fadeEngineToSilence();
      this.stopRadio();
      for (const effect of this.activeEffects) {
        try {
          effect.oscillator.stop();
        } catch {
          // Effect may already have ended.
        }
      }
    }

    return this.enabled;
  }

  // ----------------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------------

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    this.radioSyncVersion += 1;
    this.stopRadio();
    for (const timer of this._effectTimers) {
      try {
        window.clearTimeout(timer);
      } catch {
        // Page may already be closing.
      }
    }
    this._effectTimers.clear();

    for (const effect of this.activeEffects) {
      try {
        effect.oscillator.stop();
      } catch {
        // Oscillator may already have stopped.
      }
      for (const node of [effect.oscillator, effect.filter, effect.envelope]) {
        try {
          node?.disconnect();
        } catch {
          // Node may already be disconnected.
        }
      }
    }
    this.activeEffects.clear();

    this.cleanupEngineLayers();

    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {
        // Context teardown is best-effort.
      });
    }
    this.ctx = null;
  }
}

export default AudioManager;
