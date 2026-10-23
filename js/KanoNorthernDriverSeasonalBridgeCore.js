/** Pure integration hooks for Kano's existing Game and KanoAtmosphere classes. */
import { getKanoSeasonForDay, getSeasonalRiskSnapshot } from './KanoNorthernDriverSeasonalResilience.js';

const GAME_PATCH = Symbol.for('kano.life.seasonalResilience.gamePatch.v1');
const ATMOSPHERE_UPDATE_PATCH = Symbol.for('kano.life.seasonalResilience.atmosphereUpdatePatch.v1');
const ATMOSPHERE_PANEL_PATCH = Symbol.for('kano.life.seasonalResilience.atmospherePanelPatch.v1');
const MANUAL_SEASON_BY_ATMOSPHERE = new WeakMap();

const DAY_KEYS = [
  '__kanoScheduleCurrentDay', '__kanoScheduleLastDay', '__kanoSeasonalSimulationDay',
  'gameDay', 'worldDay', 'dayNumber', 'day',
];

export function resolveSimulationDay(state, fallbackDay = 1) {
  const source = state && typeof state === 'object' ? state : {};
  for (const key of DAY_KEYS) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 1) return Math.floor(value);
  }
  const fallback = Number(fallbackDay);
  return Number.isFinite(fallback) && fallback >= 1 ? Math.floor(fallback) : 1;
}

function attachSnapshot(state, snapshot) {
  if (!state || typeof state !== 'object') return;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(state, '__kanoSeasonalContext');
    if (descriptor?.writable) state.__kanoSeasonalContext = snapshot;
    else if (!descriptor) Object.defineProperty(state, '__kanoSeasonalContext', {
      value: snapshot, enumerable: false, configurable: true, writable: true,
    });
    else Object.defineProperty(state, '__kanoSeasonalContext', {
      value: snapshot, enumerable: false, configurable: true, writable: true,
    });
  } catch { /* The game remains playable if a host state is sealed. */ }
}

function dispatchSeasonChange(target, snapshot) {
  if (!target || typeof target.dispatchEvent !== 'function' || typeof target.CustomEvent !== 'function') return;
  try {
    target.dispatchEvent(new target.CustomEvent('kano:seasonal-context-changed', { detail: snapshot }));
  } catch { /* Custom events are optional integration hooks. */ }
}

export function installSeasonalEnvironmentBridge({
  GameClass,
  AtmosphereClass,
  getAutoEnabled = () => false,
  getFallbackDay = () => 1,
  eventTarget = typeof window !== 'undefined' ? window : null,
} = {}) {
  const report = {
    version: 1,
    gameSpawnZonePatched: false,
    atmosphereUpdatePatched: false,
    atmospherePanelPatched: false,
    rainyZoneChecks: 0,
    rainyZoneOverrides: 0,
    lastSeason: null,
    lastDay: null,
  };

  const readEnabled = () => {
    try { return getAutoEnabled() === true; } catch { return false; }
  };
  const snapshotFor = state => getSeasonalRiskSnapshot(resolveSimulationDay(state, getFallbackDay()), {
    enabled: readEnabled(),
  });

  const gameProto = GameClass?.prototype;
  if (gameProto && typeof gameProto.spawnZone === 'function' && !gameProto[GAME_PATCH]) {
    const originalSpawnZone = gameProto.spawnZone;
    Object.defineProperty(gameProto, GAME_PATCH, { value: true, configurable: false });
    gameProto.spawnZone = function seasonalSpawnZone(...args) {
      const state = this?.s;
      if (!state || typeof state !== 'object' || !readEnabled()) return originalSpawnZone.apply(this, args);
      const snapshot = state.__kanoSeasonalContext || snapshotFor(state);
      attachSnapshot(state, snapshot);
      const previousEnvironment = state.environment;
      if (snapshot.id !== 'rainy' || previousEnvironment !== 'clear') {
        return originalSpawnZone.apply(this, args);
      }

      // Keep the established zone generator and all of its fields. Only one of
      // every five clear-environment zone spawns receives the existing rainy
      // road condition during generation; this modestly raises pothole odds.
      const spawnCount = Math.max(0, Number(state.__kanoSeasonalZoneSpawnCount) || 0);
      state.__kanoSeasonalZoneSpawnCount = spawnCount + 1;
      report.rainyZoneChecks += 1;
      const sampledZone = ((spawnCount + snapshot.dayOfYear) % 5) === 0;
      if (!sampledZone) return originalSpawnZone.apply(this, args);

      state.environment = 'rainPuddles';
      report.rainyZoneOverrides += 1;
      try {
        return originalSpawnZone.apply(this, args);
      } finally {
        state.environment = previousEnvironment;
      }
    };
    report.gameSpawnZonePatched = true;
  }

  const atmosphereProto = AtmosphereClass?.prototype;
  if (atmosphereProto && typeof atmosphereProto.update === 'function' && !atmosphereProto[ATMOSPHERE_UPDATE_PATCH]) {
    const originalUpdate = atmosphereProto.update;
    Object.defineProperty(atmosphereProto, ATMOSPHERE_UPDATE_PATCH, { value: true, configurable: false });
    atmosphereProto.update = function seasonalAtmosphereUpdate(dt, state = {}, gameState = this?.game?.state) {
      const sourceState = state && typeof state === 'object' ? state : this?.game?.s || {};
      const snapshot = snapshotFor(sourceState);
      attachSnapshot(sourceState, snapshot);
      if (this?.game?.s && this.game.s !== sourceState) attachSnapshot(this.game.s, snapshot);

      const autoEnabled = readEnabled();
      if (autoEnabled && this?.settings) {
        if (!MANUAL_SEASON_BY_ATMOSPHERE.has(this)) {
          MANUAL_SEASON_BY_ATMOSPHERE.set(this, {
            manualSeason: this.settings.season || 'cool',
            autoApplied: false,
          });
        }
        const manualRecord = MANUAL_SEASON_BY_ATMOSPHERE.get(this);
        if (this.settings.season !== snapshot.atmosphereSeason) {
          this.settings.season = snapshot.atmosphereSeason;
          this.lastProfileKey = '';
          manualRecord.autoApplied = true;
          report.lastSeason = snapshot.id;
          report.lastDay = snapshot.absoluteDay;
          dispatchSeasonChange(eventTarget, snapshot);
        }
      } else if (!autoEnabled && this?.settings && MANUAL_SEASON_BY_ATMOSPHERE.has(this)) {
        const manualRecord = MANUAL_SEASON_BY_ATMOSPHERE.get(this);
        if (manualRecord?.autoApplied) {
          this.settings.season = manualRecord.manualSeason || 'cool';
          this.lastProfileKey = '';
        }
        MANUAL_SEASON_BY_ATMOSPHERE.delete(this);
      }
      if (report.lastSeason !== snapshot.id || report.lastDay !== snapshot.absoluteDay) {
        report.lastSeason = snapshot.id;
        report.lastDay = snapshot.absoluteDay;
        dispatchSeasonChange(eventTarget, snapshot);
      }
      this.__kanoSeasonalContext = snapshot;
      syncAtmosphereControls(this, readEnabled());
      return originalUpdate.call(this, dt, sourceState, gameState);
    };
    report.atmosphereUpdatePatched = true;
  }

  if (atmosphereProto && typeof atmosphereProto.createWorldLifePanel === 'function' && !atmosphereProto[ATMOSPHERE_PANEL_PATCH]) {
    const originalCreatePanel = atmosphereProto.createWorldLifePanel;
    Object.defineProperty(atmosphereProto, ATMOSPHERE_PANEL_PATCH, { value: true, configurable: false });
    atmosphereProto.createWorldLifePanel = function seasonalCreateWorldLifePanel(...args) {
      const result = originalCreatePanel.apply(this, args);
      try {
        const select = this.panel?.querySelector?.('[data-world-season]');
        if (select && !this.panel.querySelector('[data-seasonal-calendar-note]')) {
          const note = document.createElement('small');
          note.dataset.seasonalCalendarNote = 'true';
          note.textContent = 'Seasonal Resilience can link this visual setting to the simulated year.';
          select.closest('label')?.after(note);
        }
        syncAtmosphereControls(this, readEnabled());
      } catch { /* A non-DOM renderer must not fail because of an optional note. */ }
      return result;
    };
    report.atmospherePanelPatched = true;
  }

  return report;
}

function syncAtmosphereControls(atmosphere, enabled) {
  try {
    const select = atmosphere?.panel?.querySelector?.('[data-world-season]');
    if (!select) return;
    select.disabled = Boolean(enabled);
    select.setAttribute('aria-describedby', 'kano-seasonal-calendar-note');
    const note = atmosphere.panel.querySelector('[data-seasonal-calendar-note]');
    if (note) {
      note.id = 'kano-seasonal-calendar-note';
      note.textContent = enabled
        ? 'Season is following the simulation calendar. Turn it off in Seasonal Resilience to choose manually.'
        : 'Manual season is active. Seasonal Resilience can link it to the simulated year.';
    }
  } catch { /* UI synchronisation is non-critical. */ }
}
