// KANO LIFE — FEATURE ACTIVATION BRIDGE.
// Several ChatGPT "Task" modules were delivered as standalone files plus
// integration diffs that were never applied, so they were not running. This
// bridge activates the ones that need a per-instance hook. Pure side-effect
// imports are listed in KanoWorldPerformanceInstancingUpgrade.js and
// KanoTrafficMix.js.
import { Renderer3D } from './renderer3d.js';
import { installKanoFuelStationForecourtUpgrade } from './KanoFuelStationForecourtUpgrade.js';

const BRIDGE_KEY = Symbol.for('kano.life.featureActivationBridge.v1');
const FORECOURT_FLAG = Symbol.for('kano.life.featureActivationBridge.forecourt');

const failures = (typeof window !== 'undefined')
  ? (window.__KANO_FEATURE_BRIDGE_ERRORS__ = window.__KANO_FEATURE_BRIDGE_ERRORS__ || [])
  : [];

function installForecourtOnPrototype() {
  const proto = Renderer3D?.prototype;
  if (!proto || proto[BRIDGE_KEY] || typeof proto.syncZones !== 'function') return;
  const originalSyncZones = proto.syncZones;
  proto.syncZones = function syncZonesWithForecourtBridge(state, ...args) {
    if (!this[FORECOURT_FLAG]) {
      this[FORECOURT_FLAG] = true;
      try {
        installKanoFuelStationForecourtUpgrade(this);
        // The instance wrapper now owns syncZones; it calls back into this
        // prototype wrapper, which (flag set) falls through to the original.
        if (this.syncZones !== syncZonesWithForecourtBridge) return this.syncZones(state, ...args);
      } catch (error) {
        failures.push({ name: 'fuel-station-forecourt', message: String(error?.message || error) });
      }
    }
    return originalSyncZones.call(this, state, ...args);
  };
  Object.defineProperty(proto, BRIDGE_KEY, { value: true, configurable: false });
}

installForecourtOnPrototype();
