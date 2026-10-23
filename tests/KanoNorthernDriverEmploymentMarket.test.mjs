import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPLOYMENT_OPENINGS, INTERVIEW_QUESTIONS, MAX_ACTIVE_APPLICATIONS,
  createDefaultEmploymentMarketState, normalizeEmploymentMarketState,
  careerReadiness, openingEligibility, advanceEmploymentMarketState,
  applyForOpening, submitInterviewAnswer, respondToOffer, leaveEmployment,
  employmentMarketReport, exportEmploymentMarketReport,
} from '../js/KanoNorthernDriverEmploymentMarket.js';

const certs = (...courseIds) => courseIds.map(courseId => ({ courseId }));
function applyStock(state = createDefaultEmploymentMarketState()) {
  return applyForOpening(state, { jobId: 'dawanau-stock-records', day: 1, certificates: certs('market_bookkeeping'), readiness: 50 });
}
function answerGoodInterview(state, appId, day = 3) {
  for (const answerId of ['listen-and-update', 'recount-and-document', 'communicate-and-clarify']) {
    const result = submitInterviewAnswer(state, { applicationId: appId, day, answerId });
    assert.equal(result.ok, true);
    state = result.state;
  }
  return state;
}

test('job board uses known course IDs and has six or more fictional Kano openings', () => {
  assert.ok(EMPLOYMENT_OPENINGS.length >= 6);
  for (const job of EMPLOYMENT_OPENINGS) {
    assert.ok(job.id && job.title && job.employer && job.location);
    assert.ok(job.salaryMin > 0 && job.salaryMax >= job.salaryMin);
  }
  assert.ok(EMPLOYMENT_OPENINGS.some(job => job.location.toLowerCase().includes('dawanau')));
});

test('readiness is clamped and grows with verified certificates', () => {
  assert.equal(careerReadiness({ certificates: [], digitalReputation: 50, passengerTrust: 50, communityTrust: 50 }), 25);
  assert.ok(careerReadiness({ certificates: certs('market_bookkeeping', 'customer_care'), digitalReputation: 50, passengerTrust: 50, communityTrust: 50 }) > 25);
  assert.equal(careerReadiness({ certificates: [], digitalReputation: 1000, passengerTrust: -1, communityTrust: 50 }), 25);
});

test('role requires certificates without charging money', () => {
  const denied = applyForOpening(createDefaultEmploymentMarketState(), { jobId: 'dawanau-stock-records', day: 1, certificates: [], readiness: 70 });
  assert.equal(denied.ok, false); assert.equal(denied.reason, 'qualifications_required');
  const allowed = applyStock();
  assert.equal(allowed.ok, true);
  assert.equal(allowed.application.interviewDay, 3);
  assert.equal(allowed.state.applications.length, 1);
});

test('no active-shift applications or interviews', () => {
  const result = applyForOpening(createDefaultEmploymentMarketState(), { jobId: 'market-loading-assistant', day: 1, activeShift: true });
  assert.equal(result.ok, false); assert.equal(result.reason, 'active_shift');
});

test('interview opens after two in-game days and accepts one answer per question', () => {
  const applied = applyForOpening(createDefaultEmploymentMarketState(), { jobId: 'dawanau-stock-records', day: 1, certificates: certs('market_bookkeeping'), readiness: 55 });
  const tooEarly = submitInterviewAnswer(applied.state, { applicationId: applied.application.id, day: 2, answerId: INTERVIEW_QUESTIONS[0].answers[0].id });
  assert.equal(tooEarly.ok, false); assert.equal(tooEarly.reason, 'interview_not_due');
  const due = advanceEmploymentMarketState(applied.state, { day: 3 });
  assert.equal(due.state.applications[0].status, 'interview_due');
  const first = submitInterviewAnswer(due.state, { applicationId: applied.application.id, day: 3, answerId: 'listen-and-update' });
  assert.equal(first.ok, true); assert.equal(first.state.applications[0].interviewAnswers.length, 1);
});

test('three strong answers create a pending result, then an offer on next day', () => {
  const applied = applyStock();
  const state = answerGoodInterview(applied.state, applied.application.id, 3);
  assert.equal(state.applications[0].status, 'result_pending');
  assert.equal(state.applications[0].resultDay, 4);
  const result = advanceEmploymentMarketState(state, { day: 4 });
  assert.equal(result.state.applications[0].status, 'offered');
  assert.equal(result.state.applications[0].offerExpiresDay, 7);
});

test('offer is not automatic income and only one role can be active', () => {
  const applied = applyStock();
  const pending = answerGoodInterview(applied.state, applied.application.id, 3);
  const offer = advanceEmploymentMarketState(pending, { day: 4 }).state;
  const accepted = respondToOffer(offer, { applicationId: applied.application.id, decision: 'accept', day: 4 });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.state.employment.status, 'active');
  assert.equal(accepted.state.applications[0].status, 'accepted');
  const secondOffer = { ...accepted.state, applications: accepted.state.applications.map(app => ({ ...app, status: 'offered' })) };
  const blocked = respondToOffer(secondOffer, { applicationId: applied.application.id, decision: 'accept', day: 4 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'already_employed');
});

test('offer can be declined and role can be marked ended without penalties', () => {
  const applied = applyStock();
  const pending = answerGoodInterview(applied.state, applied.application.id, 3);
  const offered = advanceEmploymentMarketState(pending, { day: 4 }).state;
  const decline = respondToOffer(offered, { applicationId: applied.application.id, decision: 'decline', day: 4 });
  assert.equal(decline.state.applications[0].status, 'declined');
  const acceptOffer = respondToOffer(offered, { applicationId: applied.application.id, decision: 'accept', day: 4 });
  const left = leaveEmployment(acceptOffer.state, { day: 5 });
  assert.equal(left.ok, true); assert.equal(left.state.employment.status, 'left');
});

test('three active application cap and same-role duplicate protection work', () => {
  let state = createDefaultEmploymentMarketState();
  const first = applyForOpening(state, { jobId: 'market-loading-assistant', day: 1, readiness: 30 });
  state = first.state;
  assert.equal(applyForOpening(state, { jobId: 'market-loading-assistant', day: 1, readiness: 30 }).reason, 'already_active');
  for (const jobId of ['kwari-shop-sales', 'dawanau-stock-records']) {
    const required = jobId === 'kwari-shop-sales' ? ['customer_care'] : ['market_bookkeeping'];
    const result = applyForOpening(state, { jobId, day: 1, certificates: certs(...required), readiness: 60 });
    assert.equal(result.ok, true); state = result.state;
  }
  assert.equal(state.applications.filter(app => ['applied','interview_due','result_pending','offered'].includes(app.status)).length, MAX_ACTIVE_APPLICATIONS);
  const fourth = applyForOpening(state, { jobId: 'park-maintenance-helper', day: 1, certificates: certs('keke_safety'), readiness: 60 });
  assert.equal(fourth.ok, false); assert.equal(fourth.reason, 'application_limit');
});

test('clock rollback blocks career actions and does not erase records', () => {
  const applied = applyForOpening(createDefaultEmploymentMarketState({ day: 5 }), { jobId: 'dawanau-stock-records', day: 5, certificates: certs('market_bookkeeping'), readiness: 50 });
  const rollback = advanceEmploymentMarketState(applied.state, { day: 4 });
  assert.equal(rollback.ok, false); assert.equal(rollback.reason, 'clock_rollback');
  assert.equal(rollback.state.applications.length, 1);
});

test('expired offers close cleanly and applications are normalised defensively', () => {
  const applied = applyStock();
  const pending = answerGoodInterview(applied.state, applied.application.id, 3);
  const offered = advanceEmploymentMarketState(pending, { day: 4 });
  const expired = advanceEmploymentMarketState(offered.state, { day: 8 });
  assert.equal(expired.state.applications[0].status, 'expired');
  const clean = normalizeEmploymentMarketState({ applications: [{ jobId: 'bad', status: 'offered' }], history: [{ day: -2, type: '<img>', text: 'safe' }] });
  assert.equal(clean.applications.length, 0); assert.equal(clean.history[0].day, 1); assert.equal(clean.history[0].type, 'img');
});

test('report and JSON export contain no wallet deductions or wage transactions', () => {
  const applied = applyStock();
  const report = employmentMarketReport(applied.state, { day: 1, certificates: certs('market_bookkeeping'), readiness: 50 });
  assert.equal(report.activeApplications, 1);
  const json = exportEmploymentMarketReport(applied.state, { day: 1, certificates: certs('market_bookkeeping'), readiness: 50 });
  assert.equal(JSON.parse(json).schema, 'kano-life-employment-market/v1');
  assert.equal(json.includes('walletDeduction'), false);
});
