import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_SEASONAL_ACTIONS,
  createDefaultSeasonalResilienceState,
  normalizeSeasonalResilienceState,
  getDayOfYear,
  getKanoSeasonForDay,
  getSeasonalRiskSnapshot,
  actionsForSeason,
  recordSeasonalAction,
  exportSeasonalResilienceReport,
} from '../js/KanoNorthernDriverSeasonalResilience.js';

test('calendar uses approximate Kano seasonal windows and wraps a 365-day year', () => {
  assert.equal(getKanoSeasonForDay(1).id, 'harmattan');
  assert.equal(getKanoSeasonForDay(59).id, 'harmattan');
  assert.equal(getKanoSeasonForDay(60).id, 'hotDry');
  assert.equal(getKanoSeasonForDay(134).id, 'hotDry');
  assert.equal(getKanoSeasonForDay(135).id, 'rainy');
  assert.equal(getKanoSeasonForDay(288).id, 'rainy');
  assert.equal(getKanoSeasonForDay(289).id, 'cool');
  assert.equal(getKanoSeasonForDay(304).id, 'cool');
  assert.equal(getKanoSeasonForDay(305).id, 'harmattan');
  assert.equal(getKanoSeasonForDay(366).id, 'harmattan');
  assert.equal(getDayOfYear(731), 1);
});

test('seasonal snapshot is deterministic and every model index stays within 0–1', () => {
  const first = getSeasonalRiskSnapshot(210, createDefaultSeasonalResilienceState());
  const second = getSeasonalRiskSnapshot(210, createDefaultSeasonalResilienceState());
  assert.deepEqual(first, second);
  for (const value of Object.values(first.modifiers)) assert.ok(value >= 0 && value <= 1);
  assert.match(first.scenario, /Rain|road|showers/i);
});

test('readiness can only reduce the relative planning index, not exceed bounds', () => {
  const low = createDefaultSeasonalResilienceState();
  const high = normalizeSeasonalResilienceState({ readiness: { vehicle: 100, wellbeing: 100, household: 100 } });
  const lowSnapshot = getSeasonalRiskSnapshot(170, low);
  const highSnapshot = getSeasonalRiskSnapshot(170, high);
  assert.ok(highSnapshot.modifiers.visibilityRisk < lowSnapshot.modifiers.visibilityRisk);
  assert.ok(highSnapshot.modifiers.wetRoadRisk < lowSnapshot.modifiers.wetRoadRisk);
  assert.ok(highSnapshot.modifiers.heatLoad < lowSnapshot.modifiers.heatLoad);
  assert.ok(highSnapshot.modifiers.householdWaterPressure < lowSnapshot.modifiers.householdWaterPressure);
});

test('action availability prioritizes relevant seasonal tasks', () => {
  const rainy = actionsForSeason(170);
  assert.equal(rainy[0].priority, 0);
  assert.ok(rainy.findIndex(action => action.id === 'rain-route-check') < 4);
  assert.ok(KANO_SEASONAL_ACTIONS.every(action => action.seasons.length > 0));
});

test('planning is one action per simulated day and does not contain a wallet transaction', () => {
  const initial = createDefaultSeasonalResilienceState();
  const first = recordSeasonalAction(initial, 'rain-route-check', { day: 170, activeShift: false });
  assert.equal(first.ok, true);
  assert.equal(first.state.lastActionDay, 170);
  assert.ok(first.state.readiness.vehicle > initial.readiness.vehicle);
  assert.equal(first.message.includes('No money was spent.'), true);
  const second = recordSeasonalAction(first.state, 'plan-cash-buffer', { day: 170, activeShift: false });
  assert.equal(second.ok, false);
  const nextDay = recordSeasonalAction(first.state, 'plan-cash-buffer', { day: 171, activeShift: false });
  assert.equal(nextDay.ok, true);
  assert.equal(recordSeasonalAction(initial, 'plan-water-and-shade', { day: 1, activeShift: true }).ok, false);
});

test('malformed saved state is bounded and report excludes personal profile fields', () => {
  const malformed = normalizeSeasonalResilienceState({
    enabled: true,
    readiness: { vehicle: 999, wellbeing: -8, household: 'bad' },
    actionLog: [{ day: -5, actionId: 'unknown' }, { day: 5, actionId: 'rain-route-check', partnerName: 'Private' }],
  });
  assert.equal(malformed.readiness.vehicle, 100);
  assert.equal(malformed.readiness.wellbeing, 0);
  assert.equal(malformed.actionLog.length, 1);
  const report = exportSeasonalResilienceReport(malformed, 170);
  assert.equal(report.schema, 'kano-life-seasonal-resilience/v1');
  assert.equal(JSON.stringify(report).includes('partnerName'), false);
  assert.equal(report.simulation.id, 'rainy');
});
