/** Load this bridge before main's bootstrap so the existing prototypes are patched once. */
import { Game } from './game.js';
import { KanoAtmosphere } from './KanoAtmosphere.js';
import { save } from './storage.js';
import { installSeasonalEnvironmentBridge } from './KanoNorthernDriverSeasonalBridgeCore.js';

const INSTALL_KEY = Symbol.for('kano.life.seasonalResilience.bridgeInstalled.v1');
if (typeof window !== 'undefined' && !window[INSTALL_KEY]) {
  const report = installSeasonalEnvironmentBridge({
    GameClass: Game,
    AtmosphereClass: KanoAtmosphere,
    getAutoEnabled: () => save?.lifestyle?.seasonalAuto === true,
    getFallbackDay: () => save?.lifestyle?.seasonalSimulationDay ?? 1,
    eventTarget: window,
  });
  Object.defineProperty(window, INSTALL_KEY, { value: true, configurable: false });
  window.kanoNorthernDriverSeasonalBridgeReport = () => ({ ...report });
  console.info('[Kano Life] Seasonal calendar bridge registered; automatic effects remain opt-in.');
}
