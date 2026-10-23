// Kano Life — compatibility guard for the legacy financial panel binding.
// The modern Life & Career hub intentionally uses its own compact markup. The
// old financial panel module reuses the same host ID and then assumes its older
// controls exist, which throws while UI.bind is wrapping the otherwise-ready UI.
import { UI } from './ui.js';

const PATCH_KEY = Symbol.for('kano.life.legacyCareerBindGuard.v1');

function isModernCareerHost() {
  if (typeof document === 'undefined') return false;
  const host = document.getElementById('kano-life-career-screen');
  if (!host) return false;
  const modernSettings = host.querySelector('#klc-settings-body');
  const modernClose = host.querySelector('#life-career-close');
  const legacyProfile = host.querySelector('#klc-profile-form');
  const legacyClose = host.querySelector('#klc-close-top');
  return Boolean(modernSettings && modernClose && !legacyProfile && !legacyClose);
}

if (UI?.prototype && typeof UI.prototype.bind === 'function' && !UI.prototype[PATCH_KEY]) {
  const previousBind = UI.prototype.bind;
  const guardedBind = function kanoLifeCareerBindGuard(game, ...args) {
    try {
      return previousBind.call(this, game, ...args);
    } catch (error) {
      const expectedHostMismatch = isModernCareerHost()
        && error?.name === 'TypeError'
        && /Cannot read properties of null\s*\(reading ['\"]addEventListener['\"]\)/.test(String(error?.message || error))
        && this?.bound === true
        && this?.game === game
        && typeof window !== 'undefined'
        && window.__KANO_UI_BOUND__ === true
        && window.__KANO_ACTIVE_GAME__ === game;

      // Suppress only the known optional legacy-panel failure, and only after
      // the primary UI/game bind has demonstrably completed. All other errors
      // continue to surface normally for the startup audit.
      if (!expectedHostMismatch) throw error;

      window.__KANO_LEGACY_CAREER_PANEL_SKIPPED__ = {
        at: new Date().toISOString(),
        reason: 'modern-life-career-host-does-not-contain-legacy-financial-panel-controls',
      };
      console.warn('[Kano Life] Legacy financial panel controls are not present in the current Life & Career hub; skipped that optional binding. The main game UI remains active.');
      return this;
    }
  };
  Object.defineProperty(guardedBind, PATCH_KEY, { value: true });
  Object.defineProperty(UI.prototype, PATCH_KEY, { value: true });
  UI.prototype.bind = guardedBind;
}

if (typeof window !== 'undefined') {
  window.kanoLifeCareerBindGuard = {
    version: 1,
    snapshot: () => ({
      installed: Boolean(UI?.prototype?.[PATCH_KEY]),
      modernCareerHost: isModernCareerHost(),
      legacyBindingSkipped: Boolean(window.__KANO_LEGACY_CAREER_PANEL_SKIPPED__),
    }),
  };
}
