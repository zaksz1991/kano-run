import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARENTHOOD_HISTORY_LIMIT, PREGNANCY_STORY_DAYS,
  createDefaultParenthoodState, normalizeParenthoodState, enableParenthoodTracking,
  beginFamilyPlanning, startPregnancyStory, actionsForParenthoodMode,
  recordParenthoodAction, pregnancyStoryProgress, recordBirthStory,
  childStoryAgeMonths, parenthoodReport, exportParenthoodReport,
} from '../js/KanoNorthernDriverParenthood.js';

function enabledState() {
  return enableParenthoodTracking(createDefaultParenthoodState(), true).state;
}
function expectingState(startDay = 1) {
  const first = startPregnancyStory(enabledState(), {
    day: startDay, profileGender: 'female', healthTrackingEnabled: true, healthPregnancyStatus: 'positive',
  });
  assert.equal(first.ok, true);
  let state = first.state;
  const ids = ['antenatal-transport-plan', 'expecting-support-talk', 'expecting-budget-plan', 'expecting-rest-plan', 'birth-preparation', 'suna-name-plan'];
  ids.forEach((actionId, index) => {
    const result = recordParenthoodAction(state, { actionId, day: startDay + index + 1 });
    assert.equal(result.ok, true, actionId);
    state = result.state;
  });
  return state;
}

test('default state is disabled, empty and does not assume pregnancy or children', () => {
  const state = createDefaultParenthoodState();
  assert.equal(state.enabled, false);
  assert.equal(state.mode, 'none');
  assert.equal(state.pregnancyStartDay, null);
  assert.deepEqual(state.children, []);
});

test('tracking must be opted in before a family chapter can start', () => {
  const result = beginFamilyPlanning(createDefaultParenthoodState(), { day: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tracking_disabled');
});

test('family planning is explicit and does not change relationships or wallet state', () => {
  const result = beginFamilyPlanning(enabledState(), { day: 4 });
  assert.equal(result.ok, true);
  assert.equal(result.state.mode, 'planning');
  assert.equal(result.state.chapterStartedDay, 4);
  assert.equal(Object.hasOwn(result.state, 'wallet'), false);
});

test('one action per in-game day is enforced', () => {
  const started = beginFamilyPlanning(enabledState(), { day: 4 });
  const sameDay = recordParenthoodAction(started.state, { actionId: 'baby-budget-plan', day: 4 });
  assert.equal(sameDay.ok, false);
  assert.equal(sameDay.reason, 'action_already_used_today');
  const nextDay = recordParenthoodAction(started.state, { actionId: 'baby-budget-plan', day: 5 });
  assert.equal(nextDay.ok, true);
});

test('self pregnancy story requires female profile, enabled existing health tracker and positive simulated test', () => {
  const state = enabledState();
  assert.equal(startPregnancyStory(state, { day: 2, profileGender: 'female', healthTrackingEnabled: false, healthPregnancyStatus: 'positive' }).reason, 'explicit_confirmation_required');
  assert.equal(startPregnancyStory(state, { day: 2, profileGender: 'female', healthTrackingEnabled: true, healthPregnancyStatus: 'possible' }).reason, 'explicit_confirmation_required');
  assert.equal(startPregnancyStory(state, { day: 2, profileGender: 'male', healthTrackingEnabled: true, healthPregnancyStatus: 'positive' }).reason, 'explicit_confirmation_required');
});

test('starting a planning chapter and starting an expecting story cannot both happen on the same day', () => {
  const started = beginFamilyPlanning(enabledState(), { day: 7 });
  const result = startPregnancyStory(started.state, { day: 7, profileGender: 'female', healthTrackingEnabled: true, healthPregnancyStatus: 'positive' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'action_already_used_today');
});

test('an adult partner pregnancy can be recorded only after explicit player confirmation', () => {
  const noConfirm = startPregnancyStory(enabledState(), { day: 2, profileGender: 'male' });
  assert.equal(noConfirm.ok, false);
  const yesConfirm = startPregnancyStory(enabledState(), { day: 2, profileGender: 'male', partnerPregnancyConfirmed: true });
  assert.equal(yesConfirm.ok, true);
  assert.equal(yesConfirm.state.pregnancyStoryRole, 'partner');
});

test('expecting story uses compressed narrative stages and exposes no real due date', () => {
  const state = expectingState(10);
  assert.equal(pregnancyStoryProgress(state, 10).storyStage, 1);
  assert.equal(pregnancyStoryProgress(state, 10 + 28).storyStage, 2);
  assert.equal(pregnancyStoryProgress(state, 10 + 56).storyStage, 3);
  const report = parenthoodReport(state, { day: 10 + PREGNANCY_STORY_DAYS, relationshipStatus: 'married' });
  assert.equal(report.pregnancy.readyForBirthStory, true);
  assert.equal(Object.hasOwn(report.pregnancy, 'dueDate'), false);
});

test('birth story remains locked until time, support-plan count and birth preparation are complete', () => {
  let state = startPregnancyStory(enabledState(), { day: 1, profileGender: 'female', healthTrackingEnabled: true, healthPregnancyStatus: 'positive' }).state;
  assert.equal(recordBirthStory(state, { day: 1 + PREGNANCY_STORY_DAYS }).reason, 'preparation_not_complete');
  state = expectingState(1);
  const result = recordBirthStory(state, { day: 1 + PREGNANCY_STORY_DAYS });
  assert.equal(result.ok, true);
  assert.equal(result.state.mode, 'parenting');
  assert.equal(result.state.children.length, 1);
});

test('parenting timeline uses clearly named fictional 30-day story months', () => {
  assert.equal(childStoryAgeMonths({ birthDay: 10 }, 10), 0);
  assert.equal(childStoryAgeMonths({ birthDay: 10 }, 39), 0);
  assert.equal(childStoryAgeMonths({ birthDay: 10 }, 40), 1);
});

test('one-time preparation milestone cannot be repeatedly farmed', () => {
  const state = expectingState(1);
  const duplicate = recordParenthoodAction(state, { actionId: 'birth-preparation', day: 10 });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'milestone_already_recorded');
});

test('birth recording is capped and does not itself award or remove funds', () => {
  const state = expectingState(1);
  const result = recordBirthStory(state, { day: 1 + PREGNANCY_STORY_DAYS });
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.state, 'wallet'), false);
  assert.equal(result.state.children.length, 1);
});

test('normalization clamps meters, limits history and accepts only supported modes', () => {
  const state = normalizeParenthoodState({ mode: 'corrupted', meters: { support: 900, planning: -5, wellbeing: 'x', caregiving: 70 }, history: Array.from({ length: 110 }, (_, i) => ({ day: i + 1, type: 'test', text: 'entry' })) });
  assert.equal(state.mode, 'none');
  assert.equal(state.meters.support, 100);
  assert.equal(state.meters.planning, 0);
  assert.equal(state.meters.wellbeing, 60);
  assert.equal(state.history.length, PARENTHOOD_HISTORY_LIMIT);
});

test('export deliberately excludes names, partner details and raw health tracker data', () => {
  const state = expectingState(1);
  const exported = exportParenthoodReport(state, { day: 100, relationshipStatus: 'married' });
  const serialized = JSON.stringify(exported);
  assert.match(serialized, /fictional game story data/);
  assert.doesNotMatch(serialized, /partnerName|healthPregnancyStatus|cycleStartDay/i);
});

test('disabled tracking retains local chapter but reports tracking disabled', () => {
  const state = beginFamilyPlanning(enabledState(), { day: 1 }).state;
  const paused = enableParenthoodTracking(state, false).state;
  assert.equal(paused.enabled, false);
  assert.equal(paused.mode, 'planning');
  assert.equal(parenthoodReport(paused, { day: 2 }).enabled, false);
});
