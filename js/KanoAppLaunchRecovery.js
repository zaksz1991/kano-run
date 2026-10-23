// ============================================================
// KANO LIFE — START-PAGE / APP-BOOT RECOVERY
// The primary main.js remains the only game engine. This module only ensures
// it is imported, surfaces boot failures and keeps route/driver selectors usable.
// ============================================================
import { UI } from './ui.js';
import { ROUTES, DRIVERS } from './config.js';
import { save } from './storage.js';

const PATCH_KEY = Symbol.for('kano.life.appLaunchRecovery.uiPatched.v1');
let mainPromise = null;
let retryButtonBound = false;

function setGlobal(name, value) {
  try { window[name] = value; } catch { /* readonly host global */ }
}

function patchUIReferences() {
  if (UI.prototype[PATCH_KEY]) return;
  const originalInit = UI.prototype.initSelects;
  if (typeof originalInit === 'function') {
    UI.prototype.initSelects = function kanoLaunchTrackInit(...args) {
      setGlobal('__KANO_ACTIVE_UI__', this);
      const result = originalInit.apply(this, args);
      setGlobal('__KANO_ACTIVE_UI__', this);
      setGlobal('__KANO_UI_INIT_SELECTS_COMPLETE__', true);
      return result;
    };
  }
  const originalBind = UI.prototype.bind;
  if (typeof originalBind === 'function') {
    UI.prototype.bind = function kanoLaunchTrackBind(game, ...args) {
      const result = originalBind.call(this, game, ...args);
      setGlobal('__KANO_ACTIVE_UI__', this);
      setGlobal('__KANO_ACTIVE_GAME__', game);
      setGlobal('__KANO_UI_BOUND__', Boolean(this.bound));
      window.dispatchEvent(new CustomEvent('kano:app-ui-ready', { detail: { gameState: game?.state || 'INTRO' } }));
      hideBootAlert();
      return result;
    };
  }
  Object.defineProperty(UI.prototype, PATCH_KEY, { value: true, configurable: false });
}

function fillSelectIfEmpty(id, records, { valueKey = 'id', labelFor = item => item.name, disabledFor = () => false } = {}) {
  const select = document.getElementById(id);
  if (!select) return;
  const staticFallback = select.dataset.kanoStaticFallback === 'true';
  if (select.options.length && !staticFallback) return;
  if (staticFallback) {
    // Keep the safe HTML choice if a partially loaded configuration has no data.
    if (!Array.isArray(records) || records.length === 0) return;
    select.replaceChildren();
    delete select.dataset.kanoStaticFallback;
  }
  for (const record of records || []) {
    const option = document.createElement('option');
    option.value = String(record?.[valueKey] ?? '');
    option.textContent = String(labelFor(record));
    option.disabled = Boolean(disabledFor(record));
    select.append(option);
  }
  const desired = id === 'route-select'
    ? save?.routeId
    : save?.driverId;
  if (desired && [...select.options].some(option => option.value === desired && !option.disabled)) {
    select.value = desired;
  } else {
    const firstAvailable = [...select.options].find(option => !option.disabled);
    if (firstAvailable) select.value = firstAvailable.value;
  }
}

function ensureSelectsHaveOptions() {
  fillSelectIfEmpty('route-select', ROUTES, {
    labelFor: item => item?.name || 'Kano route',
  });
  const unlocked = Array.isArray(save?.unlocks) ? save.unlocks : ['ruffneck'];
  fillSelectIfEmpty('driver-select', DRIVERS, {
    labelFor: item => unlocked.includes(item?.id)
      ? `${item?.name || 'Driver'}${item?.blurb ? ` — ${item.blurb}` : ''}`
      : `${item?.name || 'Driver'} — LOCKED · ₦${Math.max(0, Math.floor(Number(item?.price) || 0)).toLocaleString()}`,
    disabledFor: item => !unlocked.includes(item?.id),
  });
}

function hideBootAlert() {
  const alert = document.getElementById('kano-launch-recovery-alert');
  if (alert) alert.hidden = true;
}

function showBootAlert(error) {
  let alert = document.getElementById('kano-launch-recovery-alert');
  const startCard = document.querySelector('#start-screen .start-card');
  if (!alert && startCard) {
    alert = document.createElement('div');
    alert.id = 'kano-launch-recovery-alert';
    alert.className = 'kano-launch-recovery-alert';
    alert.setAttribute('role', 'alert');
    alert.innerHTML = '<strong>Game startup needs attention.</strong><p id="kano-launch-recovery-message"></p><button type="button" id="kano-launch-retry">RETRY STARTUP</button>';
    const target = document.querySelector('.start-actions', startCard) || startCard;
    target.insertAdjacentElement('afterend', alert);
  }
  const message = document.getElementById('kano-launch-recovery-message');
  if (message) {
    const detail = String(error?.message || error || 'Unknown module-loading error')
      .replace(/[\u0000-\u001f]/g, ' ').slice(0, 240);
    message.textContent = `The game engine did not finish initialising. ${detail}`;
  }
  const retry = document.getElementById('kano-launch-retry');
  if (retry && !retryButtonBound) {
    retryButtonBound = true;
    retry.addEventListener('click', () => window.location.reload());
  }
  if (alert) alert.hidden = false;
}

async function loadMain() {
  if (window.__KANO_UI_BOUND__ && window.__KANO_ACTIVE_GAME__) return true;
  if (!mainPromise) {
    mainPromise = import('./main.js').then(() => {
      if (window.__KANO_UI_BOUND__ && window.__KANO_ACTIVE_GAME__) {
        hideBootAlert();
        return true;
      }
      throw new Error('main.js loaded but the UI did not bind to the game.');
    }).catch(error => {
      mainPromise = null;
      console.error('[Kano Life] startup recovery could not load main.js', error);
      showBootAlert(error);
      throw error;
    });
  }
  return mainPromise;
}

function scheduleStartProgressCheck() {
  window.setTimeout(() => {
    const start = document.getElementById('start-screen');
    const routine = document.getElementById('life-routine-screen');
    const game = window.__KANO_ACTIVE_GAME__ || window.__KANO_ACTIVE_UI__?.game || null;
    const startVisible = Boolean(start && !start.classList.contains('hidden'));
    const routineVisible = Boolean(routine && !routine.classList.contains('hidden'));
    const state = String(game?.state || 'INTRO');
    const progressed = !startVisible || routineVisible || state === 'PLAY' || state === 'EVENT';
    if (startVisible && !progressed) {
      showBootAlert(new Error('Start Driving was clicked, but the game stayed on the start page. The main game state did not advance.'));
    } else {
      hideBootAlert();
    }
  }, 1800);
}

function bindStartRecovery() {
  const button = document.getElementById('start-btn');
  if (!button || button.dataset.kanoLaunchRecovery === '1') return;
  button.dataset.kanoLaunchRecovery = '1';
  button.addEventListener('click', async event => {
    ensureSelectsHaveOptions();
    if (window.__KANO_UI_BOUND__ && window.__KANO_ACTIVE_GAME__) {
      scheduleStartProgressCheck();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      ensureSelectsHaveOptions();
      await loadMain();
      const ui = window.__KANO_ACTIVE_UI__;
      if (ui?.bound && typeof ui.beginMorningRoutine === 'function') {
        ui.beginMorningRoutine();
      } else {
        throw new Error('The game engine loaded without a bound start handler.');
      }
    } catch (error) {
      showBootAlert(error);
    }
  }, true);
}

function install() {
  patchUIReferences();
  ensureSelectsHaveOptions();
  bindStartRecovery();
  // If an optional visual/bootstrap wrapper fails, load the canonical game entry directly.
  // This never creates a second Game instance: ES modules are cached by URL.
  window.setTimeout(() => {
    if (window.__KANO_UI_BOUND__ && window.__KANO_ACTIVE_GAME__) return;
    loadMain().then(() => {
      ensureSelectsHaveOptions();
    }).catch(() => {
      // The visible alert explains why the game cannot progress past the start page.
    });
  }, 1400);
  window.addEventListener('kano:app-ui-ready', () => {
    ensureSelectsHaveOptions();
    hideBootAlert();
  });
  console.info('[Kano Life] start-page recovery registered; canonical main.js remains authoritative.');
}

if (typeof document !== 'undefined') {
  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
}
