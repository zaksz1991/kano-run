/**
 * KANO LIFE — LOCAL RADIO PLAYBACK
 *
 * Plays the project's local radio MP3s when available, supports power on/off,
 * station selection, previous/next station, and optional Hausa announcements.
 *
 * Expected local audio location:
 *   public/assets/models/audio/
 *
 * The module retains the Radio API used by the existing UI.
 * Developer: Hassan Zakariya
 */

import * as AudioModule from './audio.js';
import { CONFIG } from './config.js';
import { save, persist } from './storage.js';

const AUDIO_ROOTS = [
  '/assets/models/audio/',
  '/assets/audio/',
  '/audio/',
];

const STATION_CATALOG = [
  { id: 'freedom', name: 'Freedom Radio', tag: "Kano's voice", file: 'freedom.mp3' },
  { id: 'arewa', name: 'Arewa Radio', tag: 'Arewa daidai', file: 'arewa.mp3' },
  { id: 'rahama', name: 'Rahama Radio', tag: 'Rahama', file: 'rahama.mp3' },
  { id: 'kanoradio', name: 'Radio Kano', tag: 'Hausa radio', file: 'radio-kano.mp3' },
  { id: 'coolfm', name: 'Cool FM', tag: 'The cool one', file: 'cool.mp3' },
  { id: 'wazobia', name: 'Wazobia FM', tag: 'Naija pidgin radio', file: 'wazobia.mp3' },
  { id: 'ruffneck', name: 'RuffNeck Radio', tag: 'RuffNeck Entertainment', file: 'ruffneck.mp3' },
];

const ANNOUNCEMENTS = [
  'Sannu da safe. Traffic heavy near Sabon Gari.',
  'KAROTA active on Zoo Road. Drive carefully.',
  'Mu tafi lafiya. Safe journey in Kano.',
  'Fuel price update coming after this track.',
  'Adaidaita Sahu. Drive carefully and watch the road.',
  'Na gode for listening. This is Kano Life radio.',
  'Ina kwana. Good morning Kano State.',
  'Please drive safely and watch for pedestrians.',
];

const ANNOUNCEMENT_INTERVAL = 900;
const STORAGE_KEY = 'kano-life-radio-v1';

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function assetForStation(station) {
  const id = normalize(station?.id);
  const name = normalize(station?.name);
  const explicit = station?.file || station?.audioFile || station?.src || station?.url;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const match = STATION_CATALOG.find((item) => {
    const catalogId = normalize(item.id);
    const catalogName = normalize(item.name);
    return id === catalogId || name === catalogName ||
      (catalogId === 'kanoradio' && (id.includes('radio-kano') || name.includes('radiokano'))) ||
      (catalogId === 'coolfm' && (id.includes('cool') || name.includes('coolfm')));
  });

  return match?.file || null;
}

function normalizeStation(station, index) {
  if (typeof station === 'string') {
    const key = normalize(station);
    const match = STATION_CATALOG.find((item) =>
      normalize(item.id) === key || normalize(item.name) === key
    );
    return match || {
      id: key || `station-${index}`,
      name: station,
      tag: 'Local station',
      file: null,
    };
  }

  const value = station && typeof station === 'object' ? station : {};
  const normalized = {
    ...value,
    id: String(value.id || value.key || `station-${index}`),
    name: String(value.name || value.title || `Radio ${index + 1}`),
    tag: String(value.tag || value.description || ''),
  };
  normalized.file = assetForStation(normalized);
  return normalized;
}

function safeInvoke(target, methodNames, ...args) {
  if (!target) return false;
  for (const methodName of methodNames) {
    if (typeof target[methodName] !== 'function') continue;
    try {
      target[methodName](...args);
      return true;
    } catch (error) {
      console.warn(`[Kano Radio] ${methodName} failed.`, error);
      return false;
    }
  }
  return false;
}

function resolveAudioManager() {
  const candidate = AudioModule.AudioManager || AudioModule.Audio || AudioModule.default;
  if (!candidate) return null;
  if (typeof candidate === 'object') return candidate;
  if (typeof candidate === 'function') {
    try {
      if (candidate.prototype && typeof candidate.prototype.startRadioBed === 'function') {
        return new candidate();
      }
    } catch (error) {
      console.warn('[Kano Radio] Audio manager initialisation failed.', error);
    }
  }
  return candidate;
}

function candidatesFor(path) {
  if (!path) return [];
  if (/^(https?:|blob:|data:|\/)/i.test(path)) return [path];
  return AUDIO_ROOTS.map((root) => `${root}${encodeURIComponent(path)}`);
}

export const Radio = {
  index: 0,
  timer: 0,
  playing: false,

  _audioManager: null,
  _element: null,
  _generation: 0,
  _sources: [],
  _sourceIndex: -1,
  _lastAnnouncementFrame: -1,
  _announcementEnabled: true,
  _reportedUnavailable: new Set(),

  stations() {
    const configured = Array.isArray(CONFIG?.RADIO) ? CONFIG.RADIO : [];
    const list = (configured.length ? configured : STATION_CATALOG)
      .map(normalizeStation);
    return list.length ? list : STATION_CATALOG.map(normalizeStation);
  },

  current() {
    const list = this.stations();
    if (!list.length) return null;
    this.index = ((Math.trunc(Number(this.index) || 0) % list.length) + list.length) % list.length;
    return list[this.index];
  },

  isPlaying() {
    return this.playing;
  },

  _getManager() {
    if (!this._audioManager) this._audioManager = resolveAudioManager();
    return this._audioManager;
  },

  _ensureElement() {
    if (this._element || typeof window === 'undefined') return this._element;
    const element = new window.Audio();
    element.preload = 'auto';
    element.loop = true;
    element.volume = 0.48;
    element.setAttribute('playsinline', '');
    element.addEventListener('error', () => {
      this._tryNextSource(this._generation);
    });
    this._element = element;
    return element;
  },

  _persistSelection() {
    try {
      if (save && typeof save === 'object') {
        save.radioIndex = this.index;
        const station = this.current();
        if (station) save.radioStation = station.id;
        persist?.();
      }
    } catch (error) {
      console.warn('[Kano Radio] Could not persist station selection.', error);
    }

    try {
      const station = this.current();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        index: this.index,
        stationId: station?.id || null,
      }));
    } catch (_) {
      // Storage may be unavailable in private browsing modes.
    }
  },

  _restoreSelection() {
    try {
      const bySave = Number(save?.radioIndex);
      if (Number.isFinite(bySave) && bySave >= 0) {
        this.index = Math.trunc(bySave);
        return;
      }
    } catch (_) {
      // Continue to local storage.
    }
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
      if (!stored) return;
      const list = this.stations();
      const matchIndex = list.findIndex((station) => station.id === stored.stationId);
      this.index = matchIndex >= 0 ? matchIndex : Math.max(0, Number(stored.index) || 0);
    } catch (_) {
      this.index = 0;
    }
  },

  _clearBedAudio() {
    const manager = this._getManager();
    safeInvoke(manager, ['stopRadioBed', 'stopRadio', 'radioStop']);
  },

  _startSourceList(generation) {
    if (!this.playing || generation !== this._generation) return;
    const station = this.current();
    const element = this._ensureElement();
    if (!station || !element) return;

    this._sources = candidatesFor(station.file);
    this._sourceIndex = -1;

    if (!this._sources.length) {
      this._reportUnavailable(station);
      return;
    }
    this._tryNextSource(generation);
  },

  _tryNextSource(generation) {
    if (!this.playing || generation !== this._generation) return;
    const element = this._element;
    if (!element) return;

    this._sourceIndex += 1;
    if (this._sourceIndex >= this._sources.length) {
      this._reportUnavailable(this.current());
      return;
    }

    const source = this._sources[this._sourceIndex];
    element.pause();
    element.src = source;
    element.load();

    let playResult;
    try {
      playResult = element.play();
    } catch (error) {
      this._tryNextSource(generation);
      return;
    }

    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch((error) => {
        if (!this.playing || generation !== this._generation) return;
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
          this._emit('kano:radioerror', {
            reason: 'user-gesture-required',
            station: this.current(),
          });
          return;
        }
        this._tryNextSource(generation);
      });
    }
  },

  _reportUnavailable(station) {
    const id = station?.id || 'unknown';
    if (this._reportedUnavailable.has(id)) return;
    this._reportedUnavailable.add(id);
    console.warn(`[Kano Radio] No playable local audio found for ${station?.name || id}. Checked ${AUDIO_ROOTS.join(', ')}.`);
    this._emit('kano:radioerror', {
      reason: 'station-audio-unavailable',
      station,
    });
    const manager = this._getManager();
    safeInvoke(manager, ['radioTune', 'tuneRadio', 'selectStation'], station?.name || 'Kano Radio');
  },

  start() {
    if (!this.stations().length) return null;
    this._restoreSelection();
    this.playing = true;
    this.timer = 0;
    this._lastAnnouncementFrame = -1;
    this._clearBedAudio();

    const manager = this._getManager();
    safeInvoke(manager, ['ensure', 'init', 'initialize', 'resume']);

    this._generation += 1;
    this._startSourceList(this._generation);
    this._emit('kano:radiochange');
    return this.current();
  },

  stop() {
    this.playing = false;
    this.timer = 0;
    this._generation += 1;

    if (this._element) {
      try {
        this._element.pause();
      } catch (_) {}
    }

    const manager = this._getManager();
    safeInvoke(manager, ['stopRadioBed', 'stopRadio', 'radioStop', 'stopSpeech', 'cancelSpeech']);
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (_) {}

    this._emit('kano:radiochange');
  },

  toggle() {
    if (this.playing) this.stop();
    else this.start();
    return this.playing;
  },

  select(value) {
    const list = this.stations();
    if (!list.length) return null;

    let targetIndex = -1;
    if (typeof value === 'number' && Number.isFinite(value)) {
      targetIndex = Math.trunc(value);
    } else {
      const key = normalize(value);
      targetIndex = list.findIndex((station) =>
        normalize(station.id) === key || normalize(station.name) === key
      );
    }
    if (targetIndex < 0 || targetIndex >= list.length) return null;

    this.index = targetIndex;
    this._persistSelection();
    const station = this.current();

    if (this.playing) {
      this._generation += 1;
      this._clearBedAudio();
      this._startSourceList(this._generation);
    }

    this._emit('kano:radiochange');
    return station;
  },

  next() {
    const list = this.stations();
    if (!list.length) return null;
    return this.select((this.index + 1) % list.length);
  },

  previous() {
    const list = this.stations();
    if (!list.length) return null;
    return this.select((this.index - 1 + list.length) % list.length);
  },

  setAnnouncementsEnabled(enabled) {
    this._announcementEnabled = Boolean(enabled);
  },

  update(frame) {
    if (!this.playing || !this._announcementEnabled) return;
    const value = Number(frame);
    if (!Number.isFinite(value) || value <= 0 || value % ANNOUNCEMENT_INTERVAL !== 0) return;
    if (value === this._lastAnnouncementFrame) return;
    this._lastAnnouncementFrame = value;

    const line = ANNOUNCEMENTS[Math.floor(Math.random() * ANNOUNCEMENTS.length)];
    const manager = this._getManager();
    if (safeInvoke(manager, ['speak', 'announce'], line, {
      rate: 0.92,
      pitch: 1.02,
      volume: 0.75,
    })) return;

    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
        const utterance = new SpeechSynthesisUtterance(line);
        utterance.rate = 0.92;
        utterance.pitch = 1.02;
        utterance.volume = 0.75;
        window.speechSynthesis.speak(utterance);
      }
    } catch (_) {
      // Voice announcements are optional.
    }
  },

  _emit(eventName, detail = null) {
    try {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent(eventName, {
        detail: detail || {
          playing: this.playing,
          index: this.index,
          station: this.current(),
        },
      }));
    } catch (_) {}
  },

  dispose() {
    this.stop();
    if (this._element) {
      this._element.removeAttribute('src');
      this._element.load();
    }
    this._element = null;
    this._audioManager = null;
    this._sources = [];
    this._sourceIndex = -1;
  },
};

export default Radio;
