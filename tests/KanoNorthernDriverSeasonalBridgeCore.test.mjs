import test from 'node:test';
import assert from 'node:assert/strict';
import { installSeasonalEnvironmentBridge } from '../js/KanoNorthernDriverSeasonalBridgeCore.js';

function fakeClasses() {
  class FakeGame {
    constructor(day = 135) { this.s = { __kanoScheduleCurrentDay: day, environment: 'clear', zones: [] }; }
    spawnZone() {
      const type = this.s.environment === 'rainPuddles' ? 'pothole' : 'pickup';
      this.s.zones.push({ type });
      return type;
    }
  }
  class FakeAtmosphere {
    constructor(day = 135) { this.settings = { season: 'hotDry' }; this.game = { s: { __kanoScheduleCurrentDay: day } }; }
    update(dt, state = {}, gameState = 'PLAY') { this.lastState = state; return { dt, gameState }; }
    createWorldLifePanel() { return true; }
  }
  return { FakeGame, FakeAtmosphere };
}

test('bridge maps calendar season into existing atmosphere and attaches non-invasive context', () => {
  const { FakeGame, FakeAtmosphere } = fakeClasses();
  const report = installSeasonalEnvironmentBridge({
    GameClass: FakeGame, AtmosphereClass: FakeAtmosphere, getAutoEnabled: () => true,
  });
  const game = new FakeGame(135);
  const atmosphere = new FakeAtmosphere(135);
  atmosphere.game.s = game.s;
  const output = atmosphere.update(0.016, game.s, 'PLAY');
  assert.equal(output.gameState, 'PLAY');
  assert.equal(atmosphere.settings.season, 'rainy');
  assert.equal(game.s.__kanoSeasonalContext.id, 'rainy');
  assert.equal(Object.keys(game.s).includes('__kanoSeasonalContext'), false);
  assert.equal(report.gameSpawnZonePatched, true);
  assert.equal(report.atmosphereUpdatePatched, true);
});

test('rainy season adds a modest sampled hazard without permanently changing environment', () => {
  const { FakeGame, FakeAtmosphere } = fakeClasses();
  installSeasonalEnvironmentBridge({ GameClass: FakeGame, AtmosphereClass: FakeAtmosphere, getAutoEnabled: () => true });
  const game = new FakeGame(135);
  const first = game.spawnZone();
  assert.equal(first, 'pothole');
  assert.equal(game.s.environment, 'clear');
  const next = game.spawnZone();
  assert.equal(next, 'pickup');
  assert.equal(game.s.environment, 'clear');
});

test('disabled automation preserves manual season and existing clear-road zone generation', () => {
  const { FakeGame, FakeAtmosphere } = fakeClasses();
  installSeasonalEnvironmentBridge({ GameClass: FakeGame, AtmosphereClass: FakeAtmosphere, getAutoEnabled: () => false });
  const game = new FakeGame(135);
  assert.equal(game.spawnZone(), 'pickup');
  const atmosphere = new FakeAtmosphere(135);
  atmosphere.update(0.02, atmosphere.game.s, 'PLAY');
  assert.equal(atmosphere.settings.season, 'hotDry');
});

test('turning automatic seasons off restores the pre-automation manual season', () => {
  const { FakeGame, FakeAtmosphere } = fakeClasses();
  let enabled = true;
  installSeasonalEnvironmentBridge({ GameClass: FakeGame, AtmosphereClass: FakeAtmosphere, getAutoEnabled: () => enabled });
  const atmosphere = new FakeAtmosphere(135);
  atmosphere.update(0.02, atmosphere.game.s, 'PLAY');
  assert.equal(atmosphere.settings.season, 'rainy');
  enabled = false;
  atmosphere.update(0.02, atmosphere.game.s, 'PLAY');
  assert.equal(atmosphere.settings.season, 'hotDry');
});

test('prototype wrappers are idempotent', () => {
  const { FakeGame, FakeAtmosphere } = fakeClasses();
  const first = installSeasonalEnvironmentBridge({ GameClass: FakeGame, AtmosphereClass: FakeAtmosphere });
  const wrapped = FakeGame.prototype.spawnZone;
  const second = installSeasonalEnvironmentBridge({ GameClass: FakeGame, AtmosphereClass: FakeAtmosphere });
  assert.equal(FakeGame.prototype.spawnZone, wrapped);
  assert.equal(first.gameSpawnZonePatched, true);
  assert.equal(second.gameSpawnZonePatched, false);
});
