import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAREER_PROGRESSION_STORAGE_KEY, createDefaultCareerProgressionState, normalizeCareerProgressionState,
  syncCareerEmployment, recordWorkplaceReflection, recoverFromWork, createCareerPerformanceReview,
  careerProgressionReport, exportCareerProgressionReport,
} from '../js/KanoNorthernDriverCareerProgression.js';

const employment = { status: 'active', jobId: 'online-shop-assistant', acceptedDay: 1, role: 'Online Shop Listings Assistant' };
function record(state, day, behaviour = 'safety', challenge = 'none') {
  return recordWorkplaceReflection(state, { day, jobId: employment.jobId, employmentActive: true, attendanceStatus: 'worked', activeShift: false, behaviour, challenge, workPattern: 'balanced' });
}

test('creates a safe default career progression state', () => {
  const state = createDefaultCareerProgressionState({ employment, day: 1 });
  assert.equal(state.employmentKey, 'online-shop-assistant:1');
  assert.equal(state.stress, 12);
  assert.equal(state.wellbeing, 76);
  assert.deepEqual(state.workLogs, []);
});

test('normalization clamps scores and bounds history arrays', () => {
  const input = { stress: 999, wellbeing: -8, experiencePoints: -1, workLogs: Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, day: i + 1, jobId: 'role', behaviour: 'safety', challenge: 'none', score: 130 })) };
  const state = normalizeCareerProgressionState(input);
  assert.equal(state.stress, 100);
  assert.equal(state.wellbeing, 0);
  assert.equal(state.experiencePoints, 0);
  assert.equal(state.workLogs.length, 80);
  assert.equal(state.workLogs.at(-1).score, 100);
});

test('sync opens a fresh employment record when accepted role changes', () => {
  let state = createDefaultCareerProgressionState({ employment, day: 1 });
  state.experiencePoints = 17;
  const nextEmployment = { status: 'active', jobId: 'dawanau-stock-records', acceptedDay: 12, role: 'Grain Stock & Records Assistant' };
  const result = syncCareerEmployment(state, { employment: nextEmployment, day: 12 });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.state.jobId, 'dawanau-stock-records');
  assert.equal(result.state.experiencePoints, 0);
  assert.equal(result.state.priorRoles[0].experiencePoints, 17);
});

test('does not open a second record for the same accepted role', () => {
  const state = createDefaultCareerProgressionState({ employment, day: 1 });
  const result = syncCareerEmployment(state, { employment, day: 2 });
  assert.equal(result.changed, false);
  assert.equal(result.state.employmentKey, state.employmentKey);
  const unbound = syncCareerEmployment(createDefaultCareerProgressionState({ day: 1 }), { employment, day: 1 });
  assert.equal(unbound.changed, true);
  assert.equal(unbound.state.employmentKey, state.employmentKey);
});

test('requires recorded work attendance and an off-shift state for reflections', () => {
  const state = createDefaultCareerProgressionState({ employment, day: 1 });
  assert.equal(recordWorkplaceReflection(state, { day: 2, jobId: employment.jobId, employmentActive: true, attendanceStatus: '', activeShift: false }).reason, 'attendance_required');
  assert.equal(recordWorkplaceReflection(state, { day: 2, jobId: employment.jobId, employmentActive: true, attendanceStatus: 'worked', activeShift: true }).reason, 'active_shift');
  assert.equal(recordWorkplaceReflection(state, { day: 2, jobId: employment.jobId, employmentActive: false, attendanceStatus: 'worked', activeShift: false }).reason, 'not_employed');
});

test('records one workplace reflection per worked day and calculates score', () => {
  let state = createDefaultCareerProgressionState({ employment, day: 1 });
  const result = record(state, 2, 'safety', 'reported_issue');
  assert.equal(result.ok, true);
  assert.equal(result.score, 86);
  assert.equal(result.state.workLogs.length, 1);
  assert.equal(record(result.state, 2).reason, 'already_recorded');
});

test('blocks career writes when the saved in-game clock is ahead', () => {
  let state = createDefaultCareerProgressionState({ employment, day: 10 });
  state.lastSeenDay = 10;
  assert.equal(record(state, 9).reason, 'clock_rollback');
});

test('recovery improves wellbeing and reduces stress without monetary fields', () => {
  const state = createDefaultCareerProgressionState({ employment, day: 4 });
  const result = recoverFromWork(state, { day: 4, jobId: employment.jobId, employmentActive: true, activeShift: false, actionId: 'rest' });
  assert.equal(result.ok, true);
  assert.equal(result.state.stress, 0);
  assert.equal(result.state.wellbeing, 88);
  assert.equal('wallet' in result.state, false);
  assert.equal(recoverFromWork(result.state, { day: 4, jobId: employment.jobId, employmentActive: true, actionId: 'rest' }).reason, 'already_recovered');
});

test('blocks recovery during an active shift and rejects unknown action', () => {
  const state = createDefaultCareerProgressionState({ employment, day: 4 });
  assert.equal(recoverFromWork(state, { day: 4, jobId: employment.jobId, employmentActive: true, activeShift: true, actionId: 'rest' }).reason, 'active_shift');
  assert.equal(recoverFromWork(state, { day: 4, jobId: employment.jobId, employmentActive: true, actionId: 'cash_bonus' }).reason, 'invalid_action');
});

test('requires seven in-game days and at least three reflections before a review', () => {
  let state = createDefaultCareerProgressionState({ employment, day: 1 });
  for (const day of [2, 3]) state = record(state, day, 'safety').state;
  const tooEarly = createCareerPerformanceReview(state, { day: 6, jobId: employment.jobId, employmentActive: true, acceptedDay: 1, attendance: [], daysPerWeek: 5 });
  assert.equal(tooEarly.reason, 'review_too_early');
  const noEvidence = createCareerPerformanceReview(state, { day: 7, jobId: employment.jobId, employmentActive: true, acceptedDay: 1, attendance: [], daysPerWeek: 5 });
  assert.equal(noEvidence.reason, 'insufficient_evidence');
});

test('creates a period review from reflections and actual attendance, then enforces cooldown', () => {
  let state = createDefaultCareerProgressionState({ employment, day: 1 });
  const attendance = [];
  for (const day of [2, 3, 4, 5]) {
    state = record(state, day, 'safety').state;
    attendance.push({ day, jobId: employment.jobId, status: 'worked' });
  }
  const result = createCareerPerformanceReview(state, { day: 7, jobId: employment.jobId, employmentActive: true, acceptedDay: 1, attendance, daysPerWeek: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.review.reflections, 4);
  assert.equal(result.review.attendanceRate, 100);
  assert.equal(result.review.grade, 'advancement_ready');
  assert.equal(result.state.experiencePoints > 0, true);
  assert.equal(createCareerPerformanceReview(result.state, { day: 10, jobId: employment.jobId, employmentActive: true, acceptedDay: 1, attendance, daysPerWeek: 5 }).reason, 'review_cooldown');
});

test('review refuses to create duplicate same-day review', () => {
  let state = createDefaultCareerProgressionState({ employment, day: 1 });
  for (const day of [2, 3, 4]) state = record(state, day, 'safety').state;
  const attendance = [2, 3, 4].map(day => ({ day, jobId: employment.jobId, status: 'worked' }));
  const result = createCareerPerformanceReview(state, { day: 7, jobId: employment.jobId, employmentActive: true, acceptedDay: 1, attendance, daysPerWeek: 5 });
  assert.equal(result.ok, true);
  assert.equal(createCareerPerformanceReview(result.state, { day: 7, jobId: employment.jobId, employmentActive: true, acceptedDay: 1, attendance, daysPerWeek: 5 }).reason, 'review_cooldown');
});

test('exports well-formed report with clear non-binding advancement wording', () => {
  let state = createDefaultCareerProgressionState({ employment, day: 1 });
  state = record(state, 2, 'communication').state;
  const report = careerProgressionReport(state, { day: 2, employment, job: { title: 'Online Shop Listings Assistant' } });
  assert.equal(report.role, 'Online Shop Listings Assistant');
  assert.equal(report.workdayCount, 1);
  assert.match(report.advancementReadiness, /Complete workday reflections/);
  const exported = JSON.parse(exportCareerProgressionReport(state, { day: 2, employment, job: { title: 'Online Shop Listings Assistant' } }));
  assert.equal(exported.version, 1);
  assert.equal(CAREER_PROGRESSION_STORAGE_KEY, 'kano-life-career-progression-v1');
});
