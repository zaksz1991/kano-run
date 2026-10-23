import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CIVIC_SAVE_FIELD, CIVIC_CONTRIBUTION_AMOUNTS, CIVIC_PROJECT_TYPES,
  createDefaultCivicState, normalizeCivicState, startCivicProject,
  contributeToCivicProject, volunteerForCivicProject, reportCivicIssue,
  advanceCivicState, getCivicSnapshot, exportCivicReport,
} from '../js/KanoNorthernDriverCivicProjects.js';

const start = (type = 'drainage', day = 1, district = 'kurmi') => {
  const result = startCivicProject(createDefaultCivicState({ day }), { projectType: type, district, day });
  assert.equal(result.ok, true, result.message);
  return result.state;
};

test('default state uses a namespaced save field and bounded public-service indicators', () => {
  const state = createDefaultCivicState({ day: 3 });
  assert.equal(CIVIC_SAVE_FIELD, 'northernCivicProjectsV1');
  assert.equal(state.lastProcessedDay, 3);
  assert.equal(getCivicSnapshot(state, { day: 3 }).metrics.floodResilience, 22);
  assert.equal(state.activeProject, null);
});

test('normalizer removes unknown projects, districts, malformed arrays, and out-of-range values', () => {
  const result = normalizeCivicState({
    trust: 999, participation: -4, metrics: { roadSafety: 400, injected: 999 },
    activeProject: { type: 'unknown', district: 'invented', playerRaised: 100 },
    issues: [{ type: 'unknown', district: 'kurmi' }, { type: 'pothole', district: 'kurmi', status: 'corrupt' }],
    history: [{ day: 1, type: '<bad>', message: '<unsafe>' }],
  });
  assert.equal(result.trust, 100);
  assert.equal(result.participation, 0);
  assert.equal(result.metrics.roadSafety, 100);
  assert.equal(Object.hasOwn(result.metrics, 'injected'), false);
  assert.equal(result.activeProject, null);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].status, 'submitted');
  assert.equal(result.history[0].message.includes('<'), false);
});

test('starting a project does not deduct wallet money and only one can be active', () => {
  const state = createDefaultCivicState({ day: 2 });
  const first = startCivicProject(state, { projectType: 'water-point', district: 'sabon-gari', day: 2 });
  assert.equal(first.ok, true);
  assert.equal(first.state.activeProject.target, CIVIC_PROJECT_TYPES.find(x => x.id === 'water-point').target);
  const second = startCivicProject(first.state, { projectType: 'street-light', district: 'dala', day: 2 });
  assert.equal(second.ok, false);
  assert.equal(second.state.activeProject.type, 'water-point');
});

test('player contributions use allowlisted values and never permit an overdraft', () => {
  let state = start('drainage');
  assert.ok(CIVIC_CONTRIBUTION_AMOUNTS.includes(500));
  const insufficient = contributeToCivicProject(state, { amount: 1000, wallet: 999, day: 1 });
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.wallet, 999);
  assert.equal(insufficient.state.activeProject.playerRaised, 0);
  const invalid = contributeToCivicProject(state, { amount: 333, wallet: 5000, day: 1 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.wallet, 5000);
  const paid = contributeToCivicProject(state, { amount: 2500, wallet: 5000, day: 1 });
  assert.equal(paid.ok, true);
  assert.equal(paid.amount, 2500);
  assert.equal(paid.wallet, 2500);
  assert.equal(paid.state.activeProject.playerRaised, 2500);
});

test('funded project closes once, updates neighbourhood metrics, and records completion', () => {
  let state = start('drainage');
  let wallet = 25000;
  for (const amount of [5000, 5000, 5000, 2500, 500]) {
    const result = contributeToCivicProject(state, { amount, wallet, day: 1 });
    assert.equal(result.ok, true, result.message);
    state = result.state;
    wallet = result.wallet;
  }
  assert.equal(wallet, 7000);
  assert.equal(state.activeProject, null);
  assert.equal(state.completedProjects.length, 1);
  assert.ok(state.metrics.floodResilience > 22);
  assert.equal(getCivicSnapshot(state).completedProjects, 1);
});

test('daily simulated neighbourhood matching progresses a project but never changes player cash', () => {
  const state = start('road-patch');
  const next = advanceCivicState(state, { day: 6 });
  assert.equal(next.activeProject.neighbourRaised, 4550);
  assert.equal(next.lastProcessedDay, 6);
  assert.equal(next.activeProject.playerRaised, 0);
  assert.equal(state.activeProject.neighbourRaised, 0, 'input state remains unchanged');
});

test('volunteering adds non-cash project value and is limited to one action per day', () => {
  const state = start('shade-stop');
  const first = volunteerForCivicProject(state, { day: 1 });
  assert.equal(first.ok, true);
  assert.equal(first.progressValue, 450);
  assert.equal(first.state.activeProject.volunteerValue, 450);
  const second = volunteerForCivicProject(first.state, { day: 1 });
  assert.equal(second.ok, false);
  assert.equal(second.state.activeProject.volunteerValue, 450);
});

test('one report per in-game day and delayed review does not claim a real service response', () => {
  let state = createDefaultCivicState({ day: 1 });
  const first = reportCivicIssue(state, { issueType: 'blocked-drain', district: 'kurmi', day: 1 });
  assert.equal(first.ok, true);
  const duplicateSameDay = reportCivicIssue(first.state, { issueType: 'pothole', district: 'dala', day: 1 });
  assert.equal(duplicateSameDay.ok, false);
  state = advanceCivicState(first.state, { day: 3 });
  assert.equal(state.issues[0].status, 'community-review');
  state = advanceCivicState(state, { day: 5 });
  assert.equal(state.issues[0].status, 'referred');
  assert.match(state.issues[0].outcome, /no repair is claimed/i);
});

test('a matching completed project resolves an issue only in the same neighbourhood scenario', () => {
  let state = createDefaultCivicState({ day: 1 });
  state = reportCivicIssue(state, { issueType: 'blocked-drain', district: 'kurmi', day: 1 }).state;
  state = startCivicProject(state, { projectType: 'drainage', district: 'kurmi', day: 1 }).state;
  let wallet = 25000;
  for (const amount of [5000, 5000, 5000, 2500, 500]) {
    const result = contributeToCivicProject(state, { amount, wallet, day: 2 });
    state = result.state; wallet = result.wallet;
  }
  assert.equal(state.issues[0].status, 'resolved');
  assert.equal(state.issues[0].resolvedDay, 2);
});

test('day progression is bounded, deterministic and idempotent', () => {
  const state = start('water-point');
  const once = advanceCivicState(state, { day: 8 });
  const twice = advanceCivicState(once, { day: 8 });
  assert.deepEqual(twice, once);
  assert.equal(once.lastProcessedDay, 8);
  assert.ok(once.activeProject.neighbourRaised > 0);
});

test('JSON report is exportable and clearly labels fictional activity', () => {
  const report = exportCivicReport(start('market-cleanup'), { day: 4 });
  assert.equal(report.schema, 'kano-life-civic-report-v1');
  assert.match(report.disclaimer, /fictional game activity/i);
  assert.equal(report.generatedForGameDay, 4);
  assert.equal(JSON.parse(JSON.stringify(report)).activeProject.type, 'market-cleanup');
});
