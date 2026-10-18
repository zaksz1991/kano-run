import { save, persist } from './storage.js';

// ============================================================
// KANO LIFE — AUDIO MANAGER
// File: js/audio.js
//
// Features:
// - Browser-safe Web Audio initialisation
// - Low-volume procedural engine sound
// - Forward/reverse engine pitch handling
// - Short UI, pickup, horn and collision effects
// - Persistent mute preference
// - Graceful operation when Web Audio is unavailable
// ============================================================

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.gain = null;
    this.enabled = !Boolean(save?.muted);
    this.disposed = false;
    this.lastSignedSpeed = 0;
    this.activeEffects = new Set();
  }

  // ----------------------------------------------------------
  // AUDIO CONTEXT AND ENGINE INITIALISATION
  // ----------------------------------------------------------

  ensureContext() {
    if (this.disposed) return null;

    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return null;

      try {
        this.ctx = new AudioContextClass();
      } catch (error) {
        console.warn(
          '[Kano Life] Web Audio is unavailable:',
          error,
        );

        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // Browsers may require another user gesture before audio can resume.
      });
    }

    return this.ctx;
  }

  start() {
    if (!this.enabled || this.disposed) return false;

    const ctx = this.ensureContext();

    if (!ctx) return false;

    if (!this.osc || !this.gain) {
      try {
        this.osc = ctx.createOscillator();
        this.gain = ctx.createGain();

        this.osc.type = 'sawtooth';
        this.osc.frequency.value = 48;
        this.gain.gain.value = 0.008;

        this.osc.connect(this.gain);
        this.gain.connect(ctx.destination);

        this.osc.start();
      } catch (error) {
        console.warn(
          '[Kano Life] Could not start the engine sound:',
          error,
        );

        this.osc = null;
        this.gain = null;

        return false;
      }
    }

    return true;
  }

  // ----------------------------------------------------------
  // ENGINE SOUND
  // Positive signedSpeed = forward.
  // Negative signedSpeed = reverse.
  // ----------------------------------------------------------

  engine(signedSpeed = 0) {
    const speedValue = Number(signedSpeed);

    const safeSignedSpeed = Number.isFinite(speedValue)
      ? speedValue
      : 0;

    this.lastSignedSpeed = safeSignedSpeed;

    if (!this.enabled || this.disposed) {
      if (this.gain && this.ctx) {
        try {
          this.gain.gain.setTargetAtTime(
            0,
            this.ctx.currentTime,
            0.06,
          );
        } catch {
          // Ignore updates if the audio context is closing.
        }
      }

      return;
    }

    if (
      !this.start() ||
      !this.ctx ||
      !this.osc ||
      !this.gain
    ) {
      return;
    }

    const speed = Math.abs(safeSignedSpeed);
    const reversing = safeSignedSpeed < -0.05;

    // Reverse gear uses a slightly lower pitch at the same road speed.
    const pitchMultiplier = reversing ? 1.22 : 1.6;

    const frequency = clamp(
      48 + speed * pitchMultiplier,
      42,
      175,
    );

    // Keep an idle hum at a standstill and add volume as the keke moves.
    const targetGain = clamp(
      0.006 + speed * 0.000075,
      0.006,
      0.018,
    );

    try {
      this.osc.frequency.setTargetAtTime(
        frequency,
        this.ctx.currentTime,
        0.08,
      );

      this.gain.gain.setTargetAtTime(
        targetGain,
        this.ctx.currentTime,
        0.08,
      );
    } catch {
      // Ignore parameter changes when the context is closing.
    }
  }

  // ----------------------------------------------------------
  // SHORT SOUND EFFECTS
  // ----------------------------------------------------------

  beep(frequency = 440, duration = 0.09, volume = 0.035) {
    if (!this.enabled || this.disposed) return false;

    const ctx = this.ensureContext();

    if (!ctx) return false;

    let oscillator;
    let envelope;

    try {
      oscillator = ctx.createOscillator();
      envelope = ctx.createGain();

      const safeFrequency = clamp(
        Number(frequency) || 440,
        40,
        2200,
      );

      const safeDuration = clamp(
        Number(duration) || 0.09,
        0.025,
        1.2,
      );

      const safeVolume = clamp(
        Number(volume) || 0.035,
        0.001,
        0.12,
      );

      const now = ctx.currentTime;
      const end = now + safeDuration;

      oscillator.type = 'sine';

      oscillator.frequency.setValueAtTime(
        safeFrequency,
        now,
      );

      envelope.gain.setValueAtTime(0.0001, now);

      envelope.gain.linearRampToValueAtTime(
        safeVolume,
        now + 0.012,
      );

      envelope.gain.exponentialRampToValueAtTime(
        0.0001,
        end,
      );

      oscillator.connect(envelope);
      envelope.connect(ctx.destination);

      const effect = {
        oscillator,
        envelope,
      };

      this.activeEffects.add(effect);

      oscillator.addEventListener(
        'ended',
        () => {
          try {
            oscillator.disconnect();
            envelope.disconnect();
          } catch {
            // Nodes may already be disconnected.
          }

          this.activeEffects.delete(effect);
        },
        { once: true },
      );

      oscillator.start(now);
      oscillator.stop(end + 0.015);

      return true;
    } catch {
      try {
        oscillator?.disconnect();
        envelope?.disconnect();
      } catch {
        // Ignore cleanup errors for partially created nodes.
      }

      return false;
    }
  }

  horn() {
    return this.beep(180, 0.24, 0.07);
  }

  pickup() {
    if (!this.enabled || this.disposed) return;

    this.beep(660, 0.12, 0.035);

    window.setTimeout(() => {
      if (this.enabled && !this.disposed) {
        this.beep(880, 0.1, 0.03);
      }
    }, 90);
  }

  crash() {
    return this.beep(90, 0.25, 0.065);
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
      console.warn(
        '[Kano Life] Could not save audio preference:',
        error,
      );
    }

    if (this.enabled) {
      this.start();
      this.engine(this.lastSignedSpeed);
    } else if (this.gain && this.ctx) {
      try {
        this.gain.gain.setTargetAtTime(
          0,
          this.ctx.currentTime,
          0.04,
        );
      } catch {
        // Ignore updates if the context is closing.
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

    for (const effect of this.activeEffects) {
      try {
        effect.oscillator.stop();
      } catch {
        // Oscillator might have stopped already.
      }

      try {
        effect.oscillator.disconnect();
        effect.envelope.disconnect();
      } catch {
        // Ignore teardown errors.
      }
    }

    this.activeEffects.clear();

    try {
      this.osc?.stop();
    } catch {
      // Engine oscillator may already be stopped.
    }

    try {
      this.osc?.disconnect();
      this.gain?.disconnect();
    } catch {
      // Ignore teardown errors.
    }

    this.osc = null;
    this.gain = null;

    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {
        // Audio context cleanup is best-effort.
      });
    }
  }
}