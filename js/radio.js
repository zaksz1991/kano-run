/**
 * KANO LIFE — INDEPENDENT RADIO CONTROLS
 *
 * Integrates with the existing AudioManager, UI, save data, and configured
 * RADIO list. The radio can be switched off independently of engine audio.
 * Station playback uses the local station MP3 discovery already implemented
 * by AudioManager; this file does not pretend an absent file is a live stream.
 */
import { AudioManager } from './audio.js';
import { UI } from './ui.js';
import { RADIO } from './config.js';
import { save, persist } from './storage.js';

const audioInstances = new Set();
const stationCount = Math.max(1, Array.isArray(RADIO) ? RADIO.length : 1);
const validIndex = (value) => {
  const number = Number(value);
  const index = Number.isFinite(number) ? Math.trunc(number) : 0;
  return ((index % stationCount) + stationCount) % stationCount;
};
const selectedStation = () => RADIO[validIndex(save.radioIndex)] || RADIO[0] || {
  name: 'Local Radio',
  freq: '',
};
const radioPowerOn = () => save.radioEnabled !== false;

function savePreferences() {
  try {
    persist();
  } catch (error) {
    console.warn('[Kano Radio] Could not save radio preferences.', error);
  }
}

function refreshLabels() {
  const station = selectedStation();
  const powered = radioPowerOn();
  const label = document.getElementById('radio-label');
  if (label) {
    label.textContent = `${station.name.toUpperCase()}${station.freq ? ` ${station.freq}` : ''} · RADIO ${powered ? 'ON' : 'OFF'}`;
  }

  const menuPower = document.getElementById('kano-radio-power');
  const hudPower = document.getElementById('kano-radio-hud-toggle');
  for (const button of [menuPower, hudPower]) {
    if (!button) continue;
    button.textContent = powered ? 'RADIO ON' : 'RADIO OFF';
    button.setAttribute('aria-pressed', String(powered));
    button.classList.toggle('is-on', powered);
    button.classList.toggle('is-off', !powered);
  }

  const select = document.getElementById('kano-radio-station-select');
  if (select) select.value = String(validIndex(save.radioIndex));

  const next = document.getElementById('radio-btn');
  if (next) next.textContent = 'NEXT STATION';
}

function stopRadioInstance(instance) {
  if (!instance) return;
  instance.radioEnabled = false;
  instance.radioSyncVersion = (instance.radioSyncVersion || 0) + 1;
  instance.radioRequestIndex = -1;
  try { instance.stopRadio?.(); } catch (error) {
    console.warn('[Kano Radio] Could not stop station audio.', error);
  }
}

function setRadioPower(enabled) {
  save.radioEnabled = Boolean(enabled);
  savePreferences();

  for (const instance of audioInstances) {
    instance.radioEnabled = save.radioEnabled;
    if (!save.radioEnabled) {
      stopRadioInstance(instance);
    } else if (instance.enabled && !instance.disposed) {
      // This function is called directly from a user gesture so browser
      // media playback has the best chance of being permitted.
      void instance.syncRadioStation?.(true);
    }
  }

  refreshLabels();
  window.dispatchEvent(new CustomEvent('kano:radiochange', {
    detail: { enabled: save.radioEnabled, index: validIndex(save.radioIndex), station: selectedStation() },
  }));
}

function chooseStation(value) {
  save.radioIndex = validIndex(value);
  savePreferences();

  for (const instance of audioInstances) {
    if (instance.radioEnabled !== false && instance.enabled && !instance.disposed) {
      void instance.syncRadioStation?.(true);
    }
  }

  refreshLabels();
  window.dispatchEvent(new CustomEvent('kano:radiochange', {
    detail: { enabled: radioPowerOn(), index: validIndex(save.radioIndex), station: selectedStation() },
  }));
}

function stepStation(amount = 1) {
  chooseStation(validIndex(save.radioIndex) + amount);
}

// Patch the existing AudioManager prototype rather than requiring another
// game object or changing the Game constructor.
const audioPrototype = AudioManager.prototype;
if (!audioPrototype.__kanoIndependentRadioInstalled) {
  const originalStart = audioPrototype.start;
  const originalSyncRadioStation = audioPrototype.syncRadioStation;
  const originalDispose = audioPrototype.dispose;

  audioPrototype.start = function kanoRadioAwareStart(...args) {
    audioInstances.add(this);
    if (typeof this.radioEnabled !== 'boolean') {
      this.radioEnabled = radioPowerOn();
    }
    const result = originalStart.apply(this, args);
    // AudioManager.start() calls syncRadioStation(), which has been wrapped
    // below. Keep the power preference independent from engine audio.
    return result;
  };

  audioPrototype.syncRadioStation = function kanoRadioAwareSync(force = false) {
    if (this.radioEnabled === false || !radioPowerOn()) {
      if (this.radioAudio || this.radioRequestIndex !== -1) {
        this.radioSyncVersion = (this.radioSyncVersion || 0) + 1;
        this.radioRequestIndex = -1;
        try { this.stopRadio?.(); } catch (_) { /* best-effort cleanup */ }
      }
      return Promise.resolve(false);
    }
    return originalSyncRadioStation.call(this, force);
  };

  audioPrototype.dispose = function kanoRadioAwareDispose(...args) {
    audioInstances.delete(this);
    return originalDispose.apply(this, args);
  };

  Object.defineProperty(audioPrototype, '__kanoIndependentRadioInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

// Keep the HUD station text consistent with the saved station choice.
if (!UI.prototype.__kanoRadioLabelInstalled) {
  const originalUpdate = UI.prototype.update;
  UI.prototype.update = function kanoRadioAwareUIUpdate(state, route, driver) {
    if (state) state.radio = selectedStation();
    const result = originalUpdate.call(this, state, route, driver);
    refreshLabels();
    return result;
  };

  Object.defineProperty(UI.prototype, '__kanoRadioLabelInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

function addStyles() {
  if (document.getElementById('kano-radio-control-styles')) return;
  const style = document.createElement('style');
  style.id = 'kano-radio-control-styles';
  style.textContent = `
    .kano-radio-controls {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
      width: 100%; margin: 4px 0 8px; padding: 10px;
      border: 1px solid rgba(0,180,216,.35); border-radius: 12px;
      background: rgba(11,30,58,.94); box-sizing: border-box;
    }
    .kano-radio-controls label { color: #dce8f6; font-size: 11px; font-weight: 800; letter-spacing: .06em; }
    .kano-radio-controls select {
      flex: 1 1 145px; min-width: 130px; max-width: 100%;
      min-height: 38px; padding: 7px 10px; border-radius: 8px;
      color: #f5f8fc; background: #172b43; border: 1px solid #48627b;
      font: inherit;
    }
    .kano-radio-controls button, #kano-radio-hud-toggle {
      border-radius: 8px; min-height: 36px; padding: 7px 11px;
      border: 1px solid #00b4d8; background: #102c43; color: #e7fbff;
      font-size: 11px; font-weight: 900; letter-spacing: .04em;
      cursor: pointer; touch-action: manipulation;
    }
    .kano-radio-controls button.is-on, #kano-radio-hud-toggle.is-on {
      color: #09291f; background: #59d5a8; border-color: #7af0c7;
    }
    .kano-radio-controls button.is-off, #kano-radio-hud-toggle.is-off {
      color: #ffe4e2; background: #632d32; border-color: #e47b7b;
    }
    #kano-radio-hud-toggle { position: relative; z-index: 40; margin-left: 4px; min-height: 28px; padding: 4px 7px; font-size: 9px; pointer-events: auto; }
    #radio-label { white-space: normal; }
    @media (max-width: 520px) {
      .kano-radio-controls { gap: 6px; padding: 8px; }
      .kano-radio-controls select { flex-basis: 100%; width: 100%; }
      .kano-radio-controls button { flex: 1 1 auto; }
      #kano-radio-hud-toggle { font-size: 8px; padding: 3px 5px; }
    }
  `;
  document.head.append(style);
}

function installControls() {
  if (document.getElementById('kano-radio-controls')) {
    refreshLabels();
    return;
  }

  addStyles();

  const existingButton = document.getElementById('radio-btn');
  const actions = existingButton?.parentElement;
  if (actions) {
    const panel = document.createElement('div');
    panel.className = 'kano-radio-controls';
    panel.id = 'kano-radio-controls';
    panel.setAttribute('aria-label', 'Radio controls');

    const label = document.createElement('label');
    label.htmlFor = 'kano-radio-station-select';
    label.textContent = 'STATION';

    const select = document.createElement('select');
    select.id = 'kano-radio-station-select';
    select.setAttribute('aria-label', 'Select radio station');
    RADIO.forEach((station, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${station.name}${station.freq ? ` · ${station.freq}` : ''}`;
      select.append(option);
    });

    const power = document.createElement('button');
    power.type = 'button';
    power.id = 'kano-radio-power';
    power.addEventListener('click', () => setRadioPower(!radioPowerOn()));

    panel.append(label, select, power);
    actions.insertBefore(panel, existingButton);
    select.addEventListener('change', () => chooseStation(Number(select.value)));
  }

  // Compact power control stays available during the drive, independently
  // of the pause menu's station selector.
  const hudLabel = document.getElementById('radio-label');
  if (hudLabel && !document.getElementById('kano-radio-hud-toggle')) {
    const hudPower = document.createElement('button');
    hudPower.id = 'kano-radio-hud-toggle';
    hudPower.type = 'button';
    hudPower.setAttribute('aria-label', 'Toggle radio power');
    hudPower.addEventListener('click', () => setRadioPower(!radioPowerOn()));
    hudLabel.insertAdjacentElement('afterend', hudPower);
  }

  // Intercept the existing CHANGE RADIO handler so it doesn't also beep and
  // mutate a second station state. The button remains the one-tap next-station
  // control for compatibility with the current menu.
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('#radio-btn')
      : null;
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stepStation(1);
  }, true);

  refreshLabels();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installControls, { once: true });
} else {
  installControls();
}

export const RadioControls = {
  powerOn: radioPowerOn,
  select: chooseStation,
  next: () => stepStation(1),
  previous: () => stepStation(-1),
  toggle: () => setRadioPower(!radioPowerOn()),
};

export default RadioControls;
