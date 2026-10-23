import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RELATIONSHIP_STATUSES, FEMALE_KEKE_DRIVERS, CULTURAL_MEALS, COSMETIC_CHOICES,
  createDefaultAureState, normalizeAureState, buildDailyScenario, setRelationshipStatus,
  resolveDailyScenario, toggleHealthTracking, femaleHealthSummary, recordHealthConcern,
  seekQualifiedHealthCare, recordPregnancyTest, buyCosmeticOrSkinCare, buyCulturalMeal,
  recordClinicianPlanFollowThrough, recordWellbeingAction,
} from '../js/KanoNorthernDriverAureAndCulture.js';

const female = { gender: 'female', age: 27, name: 'Asabe' };
const male = { gender: 'male', age: 28, name: 'Musa' };

test('relationship status catalogue covers single, dating, engaged, married, separated and divorced', () => {
  assert.deepEqual(RELATIONSHIP_STATUSES.map(x => x.id), ['single', 'dating', 'engaged', 'married', 'separated', 'divorced']);
  assert.ok(RELATIONSHIP_STATUSES.every(x => x.note.length > 30));
});

test('dating, engaged and married require a partner first name', () => {
  for (const status of ['dating', 'engaged', 'married']) {
    assert.equal(setRelationshipStatus(createDefaultAureState(), { status }).reason, 'partner_name_required');
  }
  assert.equal(setRelationshipStatus(createDefaultAureState(), { status: 'single' }).ok, true);
});

test('relationship changes sanitize partner names and reset a stale pending story', () => {
  const first = setRelationshipStatus(createDefaultAureState(), { status: 'dating', partnerName: '<Aisha>' });
  assert.equal(first.ok, true);
  assert.equal(first.state.partnerName, 'Aisha');
  assert.equal(first.state.relationshipStatus, 'dating');
  assert.equal(first.state.pendingScenarioId, null);
});

test('the named women driver roster includes all requested names plus a wider roster', () => {
  const names = FEMALE_KEKE_DRIVERS.map(x => x.name);
  for (const name of ['Asabe', 'Talatu', 'Altine', 'Jummai', 'Laraba']) assert.ok(names.includes(name));
  assert.ok(names.length >= 10);
  assert.ok(FEMALE_KEKE_DRIVERS.every(x => x.base && x.style && x.detail));
});

test('Aure questions appear in the single-person event pool without automatic status punishment', () => {
  const event = buildDailyScenario({ day: 5, profile: { gender: 'male', age: 22 }, state: createDefaultAureState() });
  assert.equal(event.id, 'aure_family');
  const result = resolveDailyScenario({ rawState: createDefaultAureState(), day: 5, profile: { gender: 'male', age: 22 }, scenarioId: event.id, choiceId: 'honest_timing', wallet: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.state.relationshipStatus, 'single');
  assert.ok(result.state.socialPressure < 20);
});

test('adult single men and women can encounter different gendered peer-pressure situations', () => {
  const man = buildDailyScenario({ day: 6, profile: male, state: createDefaultAureState() });
  const woman = buildDailyScenario({ day: 6, profile: female, state: createDefaultAureState() });
  assert.equal(man.id, 'male_peer_teasing');
  assert.equal(woman.id, 'female_peer_gossip');
  assert.match(woman.body, /not a statement about all women/i);
});

test('the same in-game day cannot award a second cultural-life scenario', () => {
  const state = createDefaultAureState();
  const event = buildDailyScenario({ day: 4, profile: { gender: 'male', age: 22 }, state });
  const result = resolveDailyScenario({ rawState: state, day: 4, profile: { gender: 'male', age: 22 }, scenarioId: event.id, choiceId: 'meal_gurasa', wallet: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 45);
  const duplicate = resolveDailyScenario({ rawState: result.state, day: 4, profile: { gender: 'male', age: 22 }, scenarioId: event.id, choiceId: 'meal_gurasa', wallet: result.wallet });
  assert.equal(duplicate.reason, 'already_resolved');
  assert.equal(duplicate.wallet, 45);
});

test('food and fare choices reject insufficient wallet without changing state', () => {
  const state = createDefaultAureState();
  const event = buildDailyScenario({ day: 4, profile: { gender: 'male', age: 22 }, state });
  const result = resolveDailyScenario({ rawState: state, day: 4, profile: { gender: 'male', age: 22 }, scenarioId: event.id, choiceId: 'meal_tuwo_kuka', wallet: 20 });
  assert.equal(result.reason, 'insufficient_wallet');
  assert.equal(result.wallet, 20);
  assert.deepEqual(result.state.resolvedDays, []);
});

test('cultural meals include tuwo kuka, shinkafa da wake and Gurasa', () => {
  const names = CULTURAL_MEALS.map(x => x.name.toLowerCase());
  assert.ok(names.some(x => x.includes('tuwo') && x.includes('kuka')));
  assert.ok(names.some(x => x.includes('shinkafa') && x.includes('wake')));
  assert.ok(names.some(x => x.includes('gurasa')));
});

test('buying a cultural meal debits wallet and records one local-ledger entry', () => {
  const result = buyCulturalMeal(createDefaultAureState(), { mealId: 'shinkafa_wake', day: 2, wallet: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 40);
  assert.equal(result.state.foodPurchases, 60);
  assert.equal(result.state.ledger[0].type, 'cultural_meal');
});

test('private menstrual tracking is off by default and requires a female profile to enable', () => {
  const state = createDefaultAureState();
  assert.equal(state.health.trackingEnabled, false);
  assert.equal(toggleHealthTracking(state, true, male, 10).reason, 'female_profile_required');
  const enabled = toggleHealthTracking(state, true, female, 10);
  assert.equal(enabled.ok, true);
  assert.equal(femaleHealthSummary(enabled.state, 10, female).cycleDay, 1);
});

test('the fictional cycle estimate only shows its first five simulated days as a flow window', () => {
  let state = toggleHealthTracking(createDefaultAureState(), true, female, 10).state;
  assert.equal(femaleHealthSummary(state, 14, female).flowWindow, true);
  assert.equal(femaleHealthSummary(state, 15, female).flowWindow, false);
  state.health.trackingEnabled = false;
  assert.equal(femaleHealthSummary(state, 15, female).enabled, false);
});

test('health concerns require opt-in and qualified-care visits have a real wallet check', () => {
  const off = recordHealthConcern(createDefaultAureState(), { concern: 'urinary_discomfort', day: 5, profile: female });
  assert.equal(off.reason, 'tracking_disabled');
  const state = toggleHealthTracking(createDefaultAureState(), true, female, 1).state;
  const issue = recordHealthConcern(state, { concern: 'urinary_discomfort', day: 5, profile: female });
  assert.equal(issue.ok, true);
  assert.equal(seekQualifiedHealthCare(issue.state, { day: 5, wallet: 50, cost: 120, profile: female }).reason, 'insufficient_wallet');
  const cared = seekQualifiedHealthCare(issue.state, { day: 5, wallet: 200, cost: 120, profile: female });
  assert.equal(cared.ok, true);
  assert.equal(cared.wallet, 80);
  assert.equal(cared.state.health.healthCareVisits, 1);
  assert.match(cared.message, /qualified health provider/i);
});

test('pregnancy risk is opt-in, and a result cannot be recorded before the simulated check date', () => {
  let state = toggleHealthTracking(createDefaultAureState(), true, female, 1).state;
  state = setRelationshipStatus(state, { status: 'dating', partnerName: 'Aminu' }).state;
  const event = buildDailyScenario({ day: 6, profile: female, state });
  assert.equal(event.id, 'adult_intimacy_choice');
  const result = resolveDailyScenario({ rawState: state, day: 6, profile: female, scenarioId: event.id, choiceId: 'unprotected_consensual', wallet: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.state.health.pregnancyStatus, 'possible');
  assert.equal(recordPregnancyTest(result.state, { result: 'positive', day: 12, profile: female }).reason, 'test_not_due');
  const due = recordPregnancyTest(result.state, { result: 'positive', day: 13, profile: female });
  assert.equal(due.ok, true);
  assert.equal(due.state.health.pregnancyStatus, 'positive');
});

test('cosmetic and skin-care choices are female-profile gated and lightening cream carries a simulated risk', () => {
  assert.equal(buyCosmeticOrSkinCare(createDefaultAureState(), { productId: 'makeup', day: 1, wallet: 100, profile: male }).reason, 'female_profile_required');
  const state = createDefaultAureState();
  const result = buyCosmeticOrSkinCare(state, { productId: 'bleaching_cream', day: 1, wallet: 100, profile: female });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 30);
  assert.equal(result.state.health.skinWellness, 72);
  assert.equal(result.state.health.lighteningProductUseCount, 1);
  assert.match(result.item.warning, /not a diagnosis/i);
  assert.ok(COSMETIC_CHOICES.some(x => x.id === 'makeup'));
});

test('secret-relationship story makes consequences about trust and privacy, not automatic infection diagnosis', () => {
  let state = toggleHealthTracking(createDefaultAureState(), true, female, 1).state;
  state = setRelationshipStatus(state, { status: 'dating', partnerName: 'Abdullahi' }).state;
  const event = buildDailyScenario({ day: 5, profile: female, state });
  assert.equal(event.id, 'relationship_triangle');
  const result = resolveDailyScenario({ rawState: state, day: 5, profile: female, scenarioId: event.id, choiceId: 'secret_affair', wallet: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.state.health.healthConcern, 'none');
  assert.equal(result.state.health.healthReminderDueDay, 12);
  assert.ok(result.state.integrity < state.integrity);
});

test('Almajiri scenario is a community-care scene and does not introduce romance involving children', () => {
  const event = buildDailyScenario({ day: 3, profile: male, state: createDefaultAureState() });
  assert.equal(event.id, 'almajiri_support');
  assert.match(event.body, /children in a vulnerable situation/i);
  assert.doesNotMatch(event.body, /date|intimacy|romance/i);
});


test('health-care follow-through records a clinician plan without prescribing a medication', () => {
  let state = toggleHealthTracking(createDefaultAureState(), true, female, 1).state;
  state = recordHealthConcern(state, { concern: 'unusual_discharge_or_irritation', day: 3, profile: female }).state;
  state = seekQualifiedHealthCare(state, { day: 3, wallet: 200, cost: 120, profile: female }).state;
  assert.equal(state.health.treatmentStatus, 'clinician_plan_pending');
  const followed = recordClinicianPlanFollowThrough(state, { day: 4, profile: female });
  assert.equal(followed.ok, true);
  assert.equal(followed.state.health.treatmentStatus, 'plan_followed');
  assert.match(followed.message, /qualified clinician/i);
});

test('mood and wellbeing choices are opt-in, player-led and do not automatically follow the cycle', () => {
  const state = toggleHealthTracking(createDefaultAureState(), true, female, 1).state;
  const beforeMood = state.health.mood;
  const result = recordWellbeingAction(state, { action: 'trusted_talk', day: 2, profile: female });
  assert.equal(result.ok, true);
  assert.ok(result.state.health.mood > beforeMood);
  assert.match(result.message, /trusted person/i);
  assert.equal(recordWellbeingAction(state, { action: 'not-an-action', day: 2, profile: female }).reason, 'invalid_action');
});
