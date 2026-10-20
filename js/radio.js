/**

* KANO LIFE — RADIO CONTROLLER
*
* Features:
* * Reliable radio ON/OFF control
* * Selectable Kano and Arewa radio stations
* * Next and previous station navigation
* * Compatibility with Audio and AudioManager exports
* * Hausa traffic announcements while the radio is playing
* * Safe station switching without unexpectedly enabling the radio
*
* Developer: Hassan Zakariya
  */

import * as AudioModule from './audio.js';
import { CONFIG } from './config.js';

const DEFAULT_STATIONS = [
{ id: 'freedom', name: 'Freedom Radio', tag: "Kano's voice" },
{ id: 'arewa', name: 'Arewa Radio', tag: 'Arewa daidai' },
{ id: 'rahama', name: 'Rahama Radio', tag: 'Rahama' },
{ id: 'kanoradio', name: 'Radio Kano', tag: 'Hausa radio' },
{ id: 'coolfm', name: 'Cool FM', tag: 'The cool one' },
{ id: 'express', name: 'Express Radio', tag: 'Express news' }
];

const ANNOUNCEMENTS = [
'Sannu da safe. Traffic heavy near Sabon Gari.',
'KAROTA active on Zoo Road. Drive carefully.',
'Mu tafi lafiya. Safe journey in Kano.',
'Fuel price update coming after this song.',
'Adaidaita Sahu. Drive carefully and watch the road.',
'Na gode for listening. This is Radio Kano.',
'Ina kwana. Good morning Kano State.',
'Please drive safely and watch for pedestrians.'
];

const ANNOUNCEMENT_INTERVAL = 900;

function resolveAudio() {
const candidate =
AudioModule.Audio ||
AudioModule.AudioManager ||
AudioModule.default;

if (!candidate) return null;

// Support either a ready-to-use audio object or an exported class.
if (typeof candidate === 'function') {
try {
if (typeof candidate.startRadioBed === 'function') {
return candidate;
}

```
  if (
    candidate.prototype &&
    (
      typeof candidate.prototype.startRadioBed === 'function' ||
      typeof candidate.prototype.start === 'function'
    )
  ) {
    return new candidate();
  }
} catch (error) {
  console.warn('[Kano Radio] Could not initialise audio manager.', error);
  return null;
}
```

}

return candidate;
}

function invoke(target, methodNames, ...args) {
if (!target) return false;

for (const name of methodNames) {
if (typeof target[name] !== 'function') continue;

```
try {
  target[name](...args);
  return true;
} catch (error) {
  console.warn(`[Kano Radio] Audio operation "${name}" failed.`, error);
  return false;
}
```

}

return false;
}

function normalizeStation(station, index) {
if (typeof station === 'string') {
return {
id: station.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
name: station,
tag: ''
};
}

if (!station || typeof station !== 'object') {
return DEFAULT_STATIONS[index % DEFAULT_STATIONS.length];
}

return {
...station,
id: String(station.id || station.key || `station-${index}`),
name: String(station.name || station.title || `Radio ${index + 1}`),
tag: String(station.tag || station.description || '')
};
}

export const Radio = {
index: 0,
timer: 0,
playing: false,

_audio: null,
_lastAnnouncementFrame: 0,
_announcementEnabled: true,

_getAudio() {
if (!this._audio) {
this._audio = resolveAudio();
}

```
return this._audio;
```

},

stations() {
const configured = CONFIG?.RADIO;

```
const source =
  Array.isArray(configured) && configured.length > 0
    ? configured
    : DEFAULT_STATIONS;

return source.map(normalizeStation);
```

},

current() {
const list = this.stations();

```
if (!list.length) return null;

this.index = ((this.index % list.length) + list.length) % list.length;

return list[this.index];
```

},

isPlaying() {
return this.playing;
},

/**

* Turn the radio on.
* Audio playback may require a user interaction on mobile browsers.
  */
  start() {
  if (this.playing) return this.current();

```
const audio = this._getAudio();
```

```
this.playing = true;
this.timer = 0;
this._lastAnnouncementFrame = 0;

if (audio) {
  invoke(audio, ['ensure', 'init', 'initialize', 'resume']);
  invoke(audio, ['startRadioBed', 'startRadio', 'radioStart']);

  const station = this.current();

  if (station) {
    invoke(audio, ['radioTune', 'tuneRadio', 'selectStation'], station.name);
  }
} else {
  console.warn('[Kano Radio] No compatible audio export was found.');
}

this._emitChange();

return this.current();
```

},

/**

* Turn the radio off without changing the selected station.
  */
  stop() {
  if (!this.playing) return;

```
this.playing = false;
```

```
this.timer = 0;

const audio = this._getAudio();

if (audio) {
  invoke(audio, ['stopRadioBed', 'stopRadio', 'radioStop']);
  invoke(audio, ['stopSpeech', 'cancelSpeech']);
}

// Also cancel announcements if this browser supports SpeechSynthesis.
try {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
} catch (_) {
  // Speech synthesis is optional.
}

this._emitChange();
```

},

/**

* Toggle radio power.
* Returns the resulting power state.
  */
  toggle() {
  if (this.playing) {
  this.stop();
  } else {
  this.start();
  }

```
return this.playing;
```

},

/**

* Select a station by its index or ID.
* Selecting a station does not turn on a radio that is switched off.
  */
  select(value) {
  const list = this.stations();

```
if (!list.length) return null;
```

```
let nextIndex = -1;

if (typeof value === 'number' && Number.isFinite(value)) {
  nextIndex = Math.trunc(value);
} else {
  const id = String(value ?? '').trim().toLowerCase();

  nextIndex = list.findIndex(
    station =>
      station.id.toLowerCase() === id ||
      station.name.toLowerCase() === id
  );
}

if (nextIndex < 0 || nextIndex >= list.length) {
  return null;
}

this.index = nextIndex;

const station = this.current();

if (this.playing) {
  const audio = this._getAudio();

  if (audio) {
    invoke(audio, ['radioTune', 'tuneRadio', 'selectStation'], station.name);
  }
}

this._emitChange();

return station;
```

},

next() {
const list = this.stations();

```
if (!list.length) return null;

return this.select((this.index + 1) % list.length);
```

},

previous() {
const list = this.stations();

```
if (!list.length) return null;

return this.select((this.index - 1 + list.length) % list.length);
```

},

setAnnouncementsEnabled(enabled) {
this._announcementEnabled = Boolean(enabled);
},

/**

* Call from the main game update loop.
* Frame should be the current game frame counter.
  */
  update(frame) {
  if (!this.playing || !this._announcementEnabled) return;

```
const currentFrame = Number(frame);
```

```
if (!Number.isFinite(currentFrame) || currentFrame <= 0) return;

if (currentFrame % ANNOUNCEMENT_INTERVAL !== 0) return;

// Prevent duplicate announcements if update runs more than once
// during the same frame.
if (currentFrame === this._lastAnnouncementFrame) return;

this._lastAnnouncementFrame = currentFrame;

const line =
  ANNOUNCEMENTS[Math.floor(Math.random() * ANNOUNCEMENTS.length)];

const audio = this._getAudio();

if (audio) {
  const spoken = invoke(audio, ['speak', 'announce'], line, {
    rate: 0.92,
    pitch: 1.02,
    volume: 0.75
  });

  if (spoken) return;
}

// Fallback when the audio manager does not provide speech.
try {
  if (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  ) {
    const utterance = new SpeechSynthesisUtterance(line);

    utterance.rate = 0.92;
    utterance.pitch = 1.02;
    utterance.volume = 0.75;

    window.speechSynthesis.speak(utterance);
  }
} catch (_) {
  // Speech synthesis is optional.
}
```

},

/**

* Notify any radio UI that listens for state changes.
  */
  *emitChange() {
  try {
  if (typeof window !== 'undefined') {
  window.dispatchEvent(
  new CustomEvent('kano:radiochange', {
  detail: {
  playing: this.playing,
  index: this.index,
  station: this.current()
  }
  })
  );
  }
  } catch (*) {
  // Event notifications are optional.
  }
  },

dispose() {
this.stop();
this.timer = 0;
this._lastAnnouncementFrame = 0;
this._audio = null;
}
};

export default Radio;
