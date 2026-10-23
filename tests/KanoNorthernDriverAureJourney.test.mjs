import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AURE_JOURNEY_STORAGE_KEY, MAX_AURE_JOURNEY_HISTORY,
  createDefaultAureJourneyState, normalizeAureJourneyState, actionsForRelationshipStatus,
  resolveAureJourneyAction, syncAureJourneyStatus, saveAureJourneyPlans,
  getAureJourneyReport, exportAureJourneyReport,
} from '../js/KanoNorthernDriverAureJourney.js';

test('creates a versioned, isolated default state with no wallet or partner data', () => {
  const state = createDefaultAureJourneyState({ day: 4 });
  assert.equal(AURE_JOURNEY_STORAGE_KEY, 'kano-life-aure-journey-v1');
  assert.equal(state.version, 1);
  assert.equal(state.currentStatus, 'single');
  assert.equal(state.statusSinceDay, 4);
  assert.equal('wallet' in state, false);
  assert.equal('partnerName' in state, false);
});

test('normalization clamps metrics and plans and discards injected private fields', () => {
  const state = normalizeAureJourneyState({
    currentStatus: 'married', partnerName: 'PRIVATE', phoneMessages: ['secret'],
    metrics: { communication: 140, wellbeing: -5 },
    weddingPlan: { food: 2_000_000, outfits: -3 },
    history: [{ day: 2, type: 'note', status: 'married', text: '<script>private</script>' }],
  });
  assert.equal(state.metrics.communication, 100);
  assert.equal(state.metrics.wellbeing, 0);
  assert.equal(state.weddingPlan.food, 1_000_000);
  assert.equal(state.weddingPlan.outfits, 0);
  assert.equal('partnerName' in state, false);
  assert.equal('phoneMessages' in state, false);
  assert.equal(state.history[0].text.includes('<'), false);
});

test('single status has supportive actions and no default penalty', () => {
  const base = createDefaultAureJourneyState({ relationshipStatus: 'single' });
  const result = resolveAureJourneyAction(base, { actionId: 'respectful-boundary', day: 10, relationshipStatus: 'single' });
  assert.equal(result.ok, true);
  assert.equal(result.state.metrics.autonomy, 74);
  assert.equal(result.state.metrics.wellbeing, 72);
  assert.equal(result.state.milestones.personalGoals, true);
  assert.equal(result.state.currentStatus, 'single');
});

test('age-related social pressure is descriptive only and does not alter scores', () => {
  const base = createDefaultAureJourneyState({ relationshipStatus: 'single' });
  const female = getAureJourneyReport(base, { relationshipStatus: 'single', day: 5, age: 29, gender: 'female' });
  const male = getAureJourneyReport(base, { relationshipStatus: 'single', day: 5, age: 29, gender: 'male' });
  assert.match(female.socialPressureNote, /gossip/i);
  assert.match(male.socialPressureNote, /tease/i);
  assert.equal(female.state.metrics.autonomy, 70);
  assert.equal(male.state.metrics.wellbeing, 70);
});

test('relationship action improves bounded metrics and records a milestone', () => {
  let state = createDefaultAureJourneyState({ relationshipStatus: 'dating' });
  const result = resolveAureJourneyAction(state, { actionId: 'future-talk', day: 3, relationshipStatus: 'dating' });
  assert.equal(result.ok, true);
  assert.equal(result.state.metrics.communication, 54);
  assert.equal(result.state.metrics.sharedPlanning, 37);
  assert.equal(result.state.milestones.futureTalk, true);
  assert.equal(result.state.history[0].type, 'relationship-action');
});

test('only one progression action can be recorded per in-game day', () => {
  const first = resolveAureJourneyAction(createDefaultAureJourneyState({ relationshipStatus: 'dating' }), { actionId: 'future-talk', day: 6, relationshipStatus: 'dating' });
  const second = resolveAureJourneyAction(first.state, { actionId: 'boundaries-talk', day: 6, relationshipStatus: 'dating' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'daily_action_already_used');
  assert.equal(second.state.history.length, 1);
});

test('action is rejected if it does not apply to the selected status', () => {
  const result = resolveAureJourneyAction(createDefaultAureJourneyState({ relationshipStatus: 'single' }), { actionId: 'family-meeting', day: 8, relationshipStatus: 'single' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_action_for_status');
});

test('sync follows the existing Aure profile without changing that profile itself', () => {
  const base = createDefaultAureJourneyState({ relationshipStatus: 'single', day: 2 });
  const changed = syncAureJourneyStatus(base, { relationshipStatus: 'engaged', day: 11 });
  assert.equal(changed.changed, true);
  assert.equal(changed.state.currentStatus, 'engaged');
  assert.equal(changed.state.statusSinceDay, 11);
  assert.equal(changed.state.history[0].type, 'status-change');
  const unchanged = syncAureJourneyStatus(changed.state, { relationshipStatus: 'engaged', day: 12 });
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.state.history.length, 1);
});

test('dating and engaged profiles can save a non-binding Aure budget plan', () => {
  const base = createDefaultAureJourneyState({ relationshipStatus: 'engaged' });
  const result = saveAureJourneyPlans(base, {
    relationshipStatus: 'engaged', day: 7,
    weddingPlan: { food: 25000, outfits: 40000, venue: 15000, familyGifts: 5000, transport: 4000, contingency: 6000 },
  });
  assert.equal(result.ok, true);
  const report = getAureJourneyReport(result.state, { relationshipStatus: 'engaged', day: 7 });
  assert.equal(report.summary.weddingPlanTotal, 95000);
  assert.equal(report.state.milestones.aureBudgetReviewed, true);
});

test('single profile cannot save an Aure budget plan', () => {
  const result = saveAureJourneyPlans(createDefaultAureJourneyState(), { relationshipStatus: 'single', day: 3, weddingPlan: { food: 20000 } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'plan_not_available_for_status');
});

test('married profile can save a shared-household plan with no money movement', () => {
  const result = saveAureJourneyPlans(createDefaultAureJourneyState({ relationshipStatus: 'married' }), {
    relationshipStatus: 'married', day: 5,
    householdPlan: { food: 40000, rent: 35000, utilities: 8000, transport: 12000, familySupport: 10000, savings: 8000, personalNeeds: 6000 },
  });
  assert.equal(result.ok, true);
  const report = getAureJourneyReport(result.state, { relationshipStatus: 'married', day: 5 });
  assert.equal(report.summary.householdPlanTotal, 119000);
  assert.equal('wallet' in result.state, false);
});

test('separated and divorced profiles receive practical, non-coercive actions', () => {
  assert.ok(actionsForRelationshipStatus('separated').some(action => action.id === 'safe-boundary'));
  assert.ok(actionsForRelationshipStatus('separated').some(action => /safe/i.test(action.summary)));
  assert.ok(actionsForRelationshipStatus('divorced').some(action => action.id === 'rebuild-goals'));
  assert.ok(actionsForRelationshipStatus('divorced').some(action => action.id === 'co-parenting-plan'));
});

test('status durations never go negative if a saved clock moves backwards', () => {
  const state = createDefaultAureJourneyState({ day: 20, relationshipStatus: 'married' });
  const report = getAureJourneyReport(state, { day: 2, relationshipStatus: 'married' });
  assert.equal(report.daysInStatus, 0);
});

test('history stays bounded after repeated transitions and actions', () => {
  let state = createDefaultAureJourneyState();
  for (let day = 2; day < 145; day += 1) {
    const status = day % 2 ? 'single' : 'dating';
    state = syncAureJourneyStatus(state, { relationshipStatus: status, day }).state;
  }
  assert.ok(state.history.length <= MAX_AURE_JOURNEY_HISTORY);
});

test('export omits partner name and private health details', () => {
  const state = createDefaultAureJourneyState({ relationshipStatus: 'married' });
  const output = exportAureJourneyReport(state, { relationshipStatus: 'married', day: 3 });
  const text = JSON.stringify(output);
  assert.equal(text.includes('partnerName'), false);
  assert.equal(text.includes('pregnancyStatus'), false);
  assert.match(output.privacy, /No partner name/);
});
