/**
 * KANO LIFE — SHARED RADIO CONTROLLER
 *
 * Uses the same AudioManager instance as the driving engine. The station track
 * is not played by a second HTMLAudioElement, so radio OFF truly stops music
 * without muting engine/horn audio. The selected station remains independent
 * of the global sound/mute setting.
 *
 * Developer: Hassan Zakariya
 */

import { RADIO } from './config.js';
import { save, persist } from './storage.js';

const POWER_EVENT = 'kano:radiochange';
const FRAME_ANNOUNCEMENT_INTERVAL = 900;

function stationList() {
  return Array.isArray(RADIO) && RADIO.length
    ? RADIO
    : [{ name: 'Radio Kano', freq: '' }];
}

function boundedIndex(value, count) {
  const number = Number(value);
  const index = Number.isFinite(number) ? Math.trunc(number) : 0;
  return ((index % count) + count) % count;
}

function sharedAudioManager() {
  if (typeof window === 'undefined') return null;
  return window.__KANO_AUDIO_MANAGER__ || window.kanoAudioManager || null;
}

function tryMethod(target, name, ...args) {
  if (typeof target?.[name] !== 'function') return false;
  try {
    return target[name](...args);
  } catch (error) {
    console.warn(`[Kano Radio] ${name} failed.`, error);
    return false;
  }
}

function displayName(station) {
  if (!station) return 'RADIO';
  return `${station.name || 'RADIO'}${station.freq ? ` ${station.freq}` : ''}`;
}

export const Radio = {
  index: 0,
  timer: 0,
  playing: Boolean(save?.radioEnabled),
  _lastAnnouncementFrame: -1,
  _announcementEnabled: true,
  _uiBound: false,
  _controls: [],
  _radioButton: null,

  stations() {
    return stationList();
  },

  current() {
    const list = this.stations();
    this.index = boundedIndex(save?.radioIndex ?? this.index, list.length);
    return list[this.index];
  },

  isPlaying() {
    const audio = sharedAudioManager();
    this.playing = Boolean(audio?.radioEnabled ?? save?.radioEnabled ?? this.playing);
    return this.playing;
  },

  start() {
    const audio = sharedAudioManager();
    const station = this.current();

    if (!audio) {
      console.warn('[Kano Radio] The game AudioManager is not ready yet.');
      return station;
    }

    // Persist preference even if the selected station file is absent.
    this.playing = true;
    save.radioEnabled = true;
    try { persist(); } catch {}

    tryMethod(audio, 'radioTune', station?.name);
    tryMethod(audio, 'startRadioBed');
    this._emitChange();
    return station;
  },

  stop() {
    const audio = sharedAudioManager();
    this.playing = false;
    this.timer = 0;
    save.radioEnabled = false;
    try { persist(); } catch {}
    if (audio) tryMethod(audio, 'stopRadioBed');
    try {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel?.();
    } catch {}
    this._emitChange();
  },

  toggle() {
    if (this.isPlaying()) this.stop();
    else this.start();
    return this.playing;
  },

  select(value) {
    const list = this.stations();
    if (!list.length) return null;

    let target = -1;
    if (typeof value === 'number' && Number.isFinite(value)) {
      target = Math.trunc(value);
    } else {
      const needle = String(value ?? '').trim().toLowerCase();
      target = list.findIndex((station) =>
        String(station?.id ?? '').toLowerCase() === needle ||
        String(station?.name ?? '').toLowerCase() === needle ||
        String(station?.freq ?? '').toLowerCase() === needle
      );
    }
    if (target < 0 || target >= list.length) return null;

    this.index = target;
    save.radioIndex = target;
    try { persist(); } catch {}

    const station = list[target];
    const audio = sharedAudioManager();
    if (audio) tryMethod(audio, 'radioTune', station?.name);

    this._emitChange();
    return station;
  },

  next() {
    const list = this.stations();
    return list.length ? this.select((this.index + 1) % list.length) : null;
  },

  previous() {
    const list = this.stations();
    return list.length ? this.select((this.index - 1 + list.length) % list.length) : null;
  },

  setAnnouncementsEnabled(enabled) {
    this._announcementEnabled = Boolean(enabled);
  },

  update(frame) {
    if (!this.isPlaying() || !this._announcementEnabled) return;
    const value = Number(frame);
    if (!Number.isFinite(value) || value <= 0 || value % FRAME_ANNOUNCEMENT_INTERVAL !== 0) return;
    if (value === this._lastAnnouncementFrame) return;
    this._lastAnnouncementFrame = value;

    const lines = [
      'Sannu da safe. Traffic heavy near Sabon Gari.',
      'KAROTA active on Zoo Road. Drive carefully.',
      'Mu tafi lafiya. Safe journey in Kano.',
      'Fuel price update coming after this song.',
      'Adaidaita Sahu. Drive carefully and watch the road.',
      'Ina kwana. Good morning Kano State.',
    ];
    const audio = sharedAudioManager();
    tryMethod(audio, 'speak', lines[Math.floor(Math.random() * lines.length)], {
      rate: 0.92, pitch: 1.02, volume: 0.65,
    });
  },

  _emitChange() {
    this._syncUI();
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(POWER_EVENT, {
          detail: {
            playing: this.isPlaying(),
            index: this.index,
            station: this.current(),
          },
        }));
      }
    } catch {}
  },

  _syncUI() {
    const station = this.current();
    const powered = this.isPlaying();
    const label = document.getElementById('radio-label');
    if (label) label.textContent = `${displayName(station)} · ${powered ? 'ON' : 'OFF'}`.toUpperCase();

    if (this._radioButton) {
      this._radioButton.textContent = 'NEXT STATION';
      this._radioButton.setAttribute('aria-label', 'Select next radio station');
    }

    for (const control of this._controls) {
      control.power.textContent = powered ? 'RADIO ON' : 'RADIO OFF';
      control.power.setAttribute('aria-pressed', String(powered));
      control.power.title = powered ? 'Turn radio off' : 'Turn radio on';
      control.select.value = String(this.index);
    }
  },

  _makeControls(parent, className) {
    if (!parent || parent.querySelector(`[data-kano-radio-controls="${className}"]`)) return;

    const group = document.createElement('div');
    group.dataset.kanoRadioControls = className;
    group.style.cssText = 'display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;';

    const power = document.createElement('button');
    power.type = 'button';
    power.className = 'kano-radio-power';
    power.textContent = 'RADIO OFF';
    power.style.cssText = 'min-height:30px;padding:5px 8px;border:1px solid #00b4d8;border-radius:7px;background:#0b1e3a;color:#fff;font:700 11px system-ui;touch-action:manipulation;';
    power.addEventListener('click', () => this.toggle());

    const select = document.createElement('select');
    select.className = 'kano-radio-station';
    select.setAttribute('aria-label', 'Select radio station');
    select.style.cssText = 'max-width:150px;min-width:112px;min-height:30px;padding:4px 6px;border:1px solid #60788b;border-radius:7px;background:#15293b;color:#fff;font:600 11px system-ui;';
    this.stations().forEach((station, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = displayName(station);
      select.append(option);
    });
    select.addEventListener('change', () => this.select(Number(select.value)));

    group.append(power, select);
    parent.append(group);
    this._controls.push({ group, power, select });
  },

  _bindUI() {
    if (this._uiBound || typeof document === 'undefined') return;
    this._uiBound = true;

    this._radioButton = document.getElementById('radio-btn');
    if (this._radioButton) {
      // Capture prevents UI.bind() from also incrementing save.radioIndex.
      this._radioButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.next();
      }, true);
      this._radioButton.textContent = 'NEXT STATION';
    }

    // Controls on the start/menu screen.
    this._makeControls(document.querySelector('.menu-actions'), 'menu');

    // Independent controls inside the live driving HUD.
    const hudBottom = document.querySelector('.hud-bottom');
    if (hudBottom) this._makeControls(hudBottom, 'hud');

    window.addEventListener(POWER_EVENT, () => this._syncUI());
    window.addEventListener('storage', () => this._syncUI());
    this._syncUI();
  },

  dispose() {
    this.stop();
    this._controls = [];
    this._radioButton = null;
    this._uiBound = false;
  },
};

if (typeof window !== 'undefined') {
  window.KanoRadio = Radio;
  const init = () => Radio._bindUI();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

export default Radio;
