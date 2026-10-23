/**
 * Kano Life — Step 69: long-term Aure and relationship progression.
 * Pure, privacy-conscious state logic. This module plans conversations and
 * household expectations; it never changes the base relationship status,
 * health status, wallet, payroll, or any real-world account.
 */
export const AURE_JOURNEY_STORAGE_KEY = 'kano-life-aure-journey-v1';
export const MAX_AURE_JOURNEY_HISTORY = 100;
export const MAX_PLAN_AMOUNT = 1_000_000;

export const AURE_RELATIONSHIP_LABELS = Object.freeze({
  single: 'Single',
  dating: 'Dating',
  engaged: 'Engaged · preparing for Aure',
  married: 'Married',
  separated: 'Separated',
  divorced: 'Divorced',
});

const STATUS_IDS = new Set(Object.keys(AURE_RELATIONSHIP_LABELS));
const METRIC_IDS = ['communication', 'familyUnderstanding', 'sharedPlanning', 'wellbeing', 'autonomy'];
const MILESTONE_IDS = [
  'personalGoals', 'futureTalk', 'familyIntroduction', 'boundariesDiscussed',
  'familyMeeting', 'aureBudgetReviewed', 'householdExpectations', 'householdPlan',
  'qualityTime', 'parentingPlan', 'safeBoundary', 'practicalPlan', 'supportNetwork',
  'rebuildGoals', 'coParentingPlan',
];
const WEDDING_KEYS = ['food', 'outfits', 'venue', 'familyGifts', 'transport', 'contingency'];
const HOUSEHOLD_KEYS = ['food', 'rent', 'utilities', 'transport', 'familySupport', 'savings', 'personalNeeds'];
const clampInt = (value, min, max, fallback = min) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};
const safeDay = value => clampInt(value, 1, 1_000_000, 1);
const clean = (value, max = 180) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));
const statusOf = value => STATUS_IDS.has(String(value)) ? String(value) : 'single';
const money = value => clampInt(value, 0, MAX_PLAN_AMOUNT, 0);
const normalizedMap = (source, keys) => Object.fromEntries(keys.map(key => [key, money(source?.[key])]));

const ACTIONS = Object.freeze({
  single: Object.freeze([
    { id: 'respectful-boundary', label: 'Answer marriage questions respectfully', summary: 'Set a calm boundary with friends or relatives while recognising their concern.', effects: { autonomy: 4, wellbeing: 2, familyUnderstanding: 1 }, milestone: 'personalGoals', result: 'You gave a respectful answer and kept your own goals in view.' },
    { id: 'personal-goal-checkin', label: 'Review my own goals', summary: 'Make time for livelihood, education, friendship or personal growth without treating marriage as a deadline.', effects: { autonomy: 4, wellbeing: 3, sharedPlanning: 1 }, milestone: 'personalGoals', result: 'You clarified a personal goal. Being single is not a failure.' },
    { id: 'trusted-friend-chat', label: 'Talk with a trusted friend', summary: 'Choose a friend who listens without pressuring you or spreading private information.', effects: { communication: 2, wellbeing: 3 }, result: 'A supportive conversation was recorded.' },
  ]),
  dating: Object.freeze([
    { id: 'future-talk', label: 'Discuss future expectations honestly', summary: 'Talk about commitment, work, money, faith or values without forcing a decision today.', effects: { communication: 4, sharedPlanning: 2, wellbeing: 1 }, milestone: 'futureTalk', result: 'You recorded an honest conversation about expectations.' },
    { id: 'family-introduction', label: 'Plan a respectful family introduction', summary: 'Discuss whether, when and how to introduce a partner, with both adults agreeing.', effects: { familyUnderstanding: 4, communication: 2 }, milestone: 'familyIntroduction', result: 'A family introduction was planned by mutual agreement.' },
    { id: 'boundaries-talk', label: 'Agree on boundaries and privacy', summary: 'Talk through fidelity, consent, private information and what each person is comfortable with.', effects: { communication: 4, autonomy: 2, wellbeing: 1 }, milestone: 'boundariesDiscussed', result: 'You recorded a conversation about boundaries and privacy.' },
    { id: 'respectful-space', label: 'Take space without humiliation', summary: 'If expectations differ, pause the conversation respectfully rather than manipulating or shaming the other person.', effects: { wellbeing: 4, autonomy: 3 }, result: 'You chose a respectful pause and protected both people’s dignity.' },
  ]),
  engaged: Object.freeze([
    { id: 'family-meeting', label: 'Arrange a family expectations meeting', summary: 'Discuss roles, customs, timing and who should be involved. Family consent and the couple’s wishes both matter.', effects: { familyUnderstanding: 5, communication: 2 }, milestone: 'familyMeeting', result: 'You planned a family meeting around shared expectations.' },
    { id: 'aure-budget-review', label: 'Review the Aure budget plan', summary: 'Compare planned food, clothes, family gifts, venue and transport with what is realistically affordable.', effects: { sharedPlanning: 5, communication: 1 }, milestone: 'aureBudgetReviewed', result: 'You reviewed the Aure budget. No money was deducted.' },
    { id: 'household-expectations', label: 'Discuss life after Aure', summary: 'Talk about chores, work schedules, privacy, family visits and the handling of money before the ceremony.', effects: { sharedPlanning: 4, communication: 3 }, milestone: 'householdExpectations', result: 'You discussed responsibilities after marriage.' },
    { id: 'adjust-aure-timeline', label: 'Adjust the timeline respectfully', summary: 'It is acceptable to delay plans to avoid unmanageable debt, coercion or an unsafe situation.', effects: { wellbeing: 3, autonomy: 3, communication: 1 }, result: 'You revisited timing without treating delay as disgrace.' },
  ]),
  married: Object.freeze([
    { id: 'weekly-checkin', label: 'Have a weekly relationship check-in', summary: 'Discuss how both people are doing and listen before trying to solve every disagreement.', effects: { communication: 3, wellbeing: 2, sharedPlanning: 2 }, milestone: 'qualityTime', result: 'You recorded time for an attentive relationship check-in.' },
    { id: 'household-budget', label: 'Plan the household budget together', summary: 'Review food, rent, electricity, transport, savings and family support without assuming only one partner should decide.', effects: { sharedPlanning: 5, communication: 2 }, milestone: 'householdPlan', result: 'You updated the household planning milestone. No money was transferred.' },
    { id: 'extended-family-boundaries', label: 'Agree on extended-family boundaries', summary: 'Discuss how to respond to relatives’ requests while protecting respect, privacy and household needs.', effects: { familyUnderstanding: 2, communication: 4, autonomy: 1 }, milestone: 'boundariesDiscussed', result: 'You recorded a conversation about family boundaries.' },
    { id: 'quality-time', label: 'Protect time together', summary: 'Plan shared time around driving shifts, rest, faith or personal practice and family duties.', effects: { wellbeing: 4, communication: 2 }, milestone: 'qualityTime', result: 'You made space for shared time and recovery.' },
    { id: 'parenting-care-talk', label: 'Discuss care and parenting responsibilities', summary: 'If children are part of the household or future plans, discuss time, costs and shared care. This does not change pregnancy or health records.', effects: { sharedPlanning: 4, communication: 2 }, milestone: 'parentingPlan', result: 'You recorded a care-planning conversation, without changing health records.' },
  ]),
  separated: Object.freeze([
    { id: 'safe-boundary', label: 'Set safe and clear boundaries', summary: 'Choose respectful communication, privacy and practical safety. Mediation is optional, not compulsory.', effects: { wellbeing: 3, autonomy: 4 }, milestone: 'safeBoundary', result: 'You recorded a personal boundary and support plan.' },
    { id: 'practical-arrangements', label: 'Plan practical arrangements', summary: 'List outstanding bills, belongings, housing or care responsibilities without creating a new financial transaction.', effects: { sharedPlanning: 4, communication: 1 }, milestone: 'practicalPlan', result: 'You recorded practical arrangements to review.' },
    { id: 'optional-mediation', label: 'Consider trusted mediation if safe', summary: 'Only proceed if both people freely want it and it is safe. Either person can decline.', effects: { communication: 2, familyUnderstanding: 2, wellbeing: 1 }, result: 'You considered a safe, voluntary route for a difficult conversation.' },
    { id: 'support-network', label: 'Contact a trusted support person', summary: 'Seek practical support from someone who will respect privacy and not pressure you.', effects: { wellbeing: 4, autonomy: 1 }, milestone: 'supportNetwork', result: 'You recorded reaching out to a trusted support person.' },
  ]),
  divorced: Object.freeze([
    { id: 'support-network', label: 'Reconnect with a trusted support network', summary: 'Choose support that respects privacy and does not reduce your identity to marital status.', effects: { wellbeing: 4, autonomy: 2 }, milestone: 'supportNetwork', result: 'You recorded a supportive connection.' },
    { id: 'rebuild-goals', label: 'Set a personal rebuilding goal', summary: 'Choose a livelihood, education, health, housing or friendship goal at your own pace.', effects: { autonomy: 4, sharedPlanning: 2, wellbeing: 2 }, milestone: 'rebuildGoals', result: 'You set a personal goal for rebuilding your next chapter.' },
    { id: 'co-parenting-plan', label: 'Plan respectful co-parenting if relevant', summary: 'If children are involved, consider predictable routines and child-centred communication. This is optional and does not assume children exist.', effects: { sharedPlanning: 4, communication: 2 }, milestone: 'coParentingPlan', result: 'You recorded a co-parenting plan if it applies to your life.' },
    { id: 'healthy-boundary', label: 'Respond to gossip with a boundary', summary: 'You can correct misinformation, decline to discuss private matters or seek support rather than escalating rumours.', effects: { autonomy: 3, wellbeing: 2, communication: 1 }, milestone: 'safeBoundary', result: 'You chose a calm boundary around private information.' },
  ]),
});

export function createDefaultAureJourneyState({ day = 1, relationshipStatus = 'single' } = {}) {
  const status = statusOf(relationshipStatus);
  return {
    version: 1,
    currentStatus: status,
    statusSinceDay: safeDay(day),
    lastActionDay: 0,
    lastActionId: '',
    metrics: { communication: 50, familyUnderstanding: 50, sharedPlanning: 35, wellbeing: 70, autonomy: 70 },
    milestones: Object.fromEntries(MILESTONE_IDS.map(id => [id, false])),
    weddingPlan: { food: 0, outfits: 0, venue: 0, familyGifts: 0, transport: 0, contingency: 0 },
    householdPlan: { food: 0, rent: 0, utilities: 0, transport: 0, familySupport: 0, savings: 0, personalNeeds: 0 },
    history: [],
  };
}

export function normalizeAureJourneyState(input) {
  const base = createDefaultAureJourneyState();
  const source = input && typeof input === 'object' ? input : {};
  const metrics = source.metrics && typeof source.metrics === 'object' ? source.metrics : {};
  const milestones = source.milestones && typeof source.milestones === 'object' ? source.milestones : {};
  const history = Array.isArray(source.history) ? source.history.slice(0, MAX_AURE_JOURNEY_HISTORY) : [];
  return {
    ...base,
    currentStatus: statusOf(source.currentStatus),
    statusSinceDay: safeDay(source.statusSinceDay),
    lastActionDay: clampInt(source.lastActionDay, 0, 1_000_000, 0),
    lastActionId: clean(source.lastActionId, 80),
    metrics: Object.fromEntries(METRIC_IDS.map(key => [key, clampInt(metrics[key], 0, 100, base.metrics[key])])),
    milestones: Object.fromEntries(MILESTONE_IDS.map(key => [key, Boolean(milestones[key])])),
    weddingPlan: normalizedMap(source.weddingPlan, WEDDING_KEYS),
    householdPlan: normalizedMap(source.householdPlan, HOUSEHOLD_KEYS),
    history: history.map(row => ({
      day: safeDay(row?.day),
      type: clean(row?.type || 'note', 40),
      status: statusOf(row?.status),
      actionId: clean(row?.actionId, 80),
      text: clean(row?.text, 180),
      deltas: Object.fromEntries(METRIC_IDS.filter(key => Number.isFinite(Number(row?.deltas?.[key]))).map(key => [key, clampInt(row.deltas[key], -100, 100, 0)])),
    })).slice(0, MAX_AURE_JOURNEY_HISTORY),
  };
}

function record(state, entry) {
  state.history.unshift({
    day: safeDay(entry.day),
    type: clean(entry.type || 'note', 40),
    status: statusOf(entry.status ?? state.currentStatus),
    actionId: clean(entry.actionId || '', 80),
    text: clean(entry.text || '', 180),
    deltas: Object.fromEntries(METRIC_IDS.filter(key => Number.isFinite(Number(entry.deltas?.[key]))).map(key => [key, clampInt(entry.deltas[key], -100, 100, 0)])),
  });
  state.history = state.history.slice(0, MAX_AURE_JOURNEY_HISTORY);
}

export function syncAureJourneyStatus(input, { relationshipStatus = 'single', day = 1 } = {}) {
  const state = normalizeAureJourneyState(input);
  const nextStatus = statusOf(relationshipStatus);
  const currentDay = safeDay(day);
  if (state.currentStatus === nextStatus) return { ok: true, changed: false, state };
  const previous = state.currentStatus;
  state.currentStatus = nextStatus;
  state.statusSinceDay = currentDay;
  record(state, { day: currentDay, type: 'status-change', status: nextStatus, text: `Recorded relationship status change: ${AURE_RELATIONSHIP_LABELS[previous]} → ${AURE_RELATIONSHIP_LABELS[nextStatus]}.` });
  return { ok: true, changed: true, state };
}

export function actionsForRelationshipStatus(relationshipStatus) {
  const status = statusOf(relationshipStatus);
  return ACTIONS[status].map(action => ({ ...action, effects: { ...action.effects } }));
}

export function resolveAureJourneyAction(input, { actionId, day = 1, relationshipStatus = 'single' } = {}) {
  const synced = syncAureJourneyStatus(input, { relationshipStatus, day });
  const state = synced.state;
  const currentDay = safeDay(day);
  if (state.lastActionDay === currentDay) return { ok: false, reason: 'daily_action_already_used', state };
  const action = ACTIONS[state.currentStatus].find(item => item.id === String(actionId));
  if (!action) return { ok: false, reason: 'invalid_action_for_status', state };
  state.lastActionDay = currentDay;
  state.lastActionId = action.id;
  for (const [key, delta] of Object.entries(action.effects)) state.metrics[key] = clampInt(state.metrics[key] + delta, 0, 100, state.metrics[key]);
  if (action.milestone) state.milestones[action.milestone] = true;
  record(state, { day: currentDay, type: 'relationship-action', status: state.currentStatus, actionId: action.id, text: action.result, deltas: action.effects });
  return { ok: true, state: normalizeAureJourneyState(state), action: { ...action, effects: { ...action.effects } }, message: action.result };
}

export function saveAureJourneyPlans(input, { relationshipStatus = 'single', day = 1, weddingPlan, householdPlan } = {}) {
  const synced = syncAureJourneyStatus(input, { relationshipStatus, day });
  const state = synced.state;
  let changed = false;
  if (weddingPlan && ['engaged', 'dating'].includes(state.currentStatus)) {
    state.weddingPlan = normalizedMap(weddingPlan, WEDDING_KEYS);
    state.milestones.aureBudgetReviewed = true;
    changed = true;
  }
  if (householdPlan && ['married', 'separated'].includes(state.currentStatus)) {
    state.householdPlan = normalizedMap(householdPlan, HOUSEHOLD_KEYS);
    state.milestones.householdPlan = true;
    changed = true;
  }
  if (!changed) return { ok: false, reason: 'plan_not_available_for_status', state };
  record(state, { day, type: 'planning', status: state.currentStatus, text: 'Saved a non-binding relationship / household plan. No wallet transaction occurred.' });
  return { ok: true, state: normalizeAureJourneyState(state), message: 'Plan saved. This is planning only; no money was deducted.' };
}

export function getAureJourneyReport(input, { relationshipStatus = 'single', day = 1, age = 22, gender = 'male' } = {}) {
  const synced = syncAureJourneyStatus(input, { relationshipStatus, day });
  const state = synced.state;
  const currentDay = safeDay(day);
  const weddingTotal = Object.values(state.weddingPlan).reduce((sum, value) => sum + value, 0);
  const householdTotal = Object.values(state.householdPlan).reduce((sum, value) => sum + value, 0);
  const oldEnoughForPressure = state.currentStatus === 'single' && clampInt(age, 18, 100, 22) >= 25;
  let socialPressureNote = 'Relationship choices are personal. The simulation records your decisions without treating any status as inherently better.';
  if (oldEnoughForPressure && String(gender) === 'female') socialPressureNote = 'In this scenario, relatives or neighbours may gossip about an unmarried woman. You can set a boundary or focus on your own goals; no penalty is applied for being single.';
  else if (oldEnoughForPressure && String(gender) === 'male') socialPressureNote = 'In this scenario, some friends or relatives may tease an unmarried man. You can answer calmly or focus on your goals; no penalty is applied for being single.';
  return {
    state,
    status: state.currentStatus,
    statusLabel: AURE_RELATIONSHIP_LABELS[state.currentStatus],
    day: currentDay,
    daysInStatus: Math.max(0, currentDay - state.statusSinceDay),
    actions: actionsForRelationshipStatus(state.currentStatus),
    socialPressureNote,
    summary: {
      communication: state.metrics.communication,
      familyUnderstanding: state.metrics.familyUnderstanding,
      sharedPlanning: state.metrics.sharedPlanning,
      wellbeing: state.metrics.wellbeing,
      autonomy: state.metrics.autonomy,
      completedMilestones: Object.values(state.milestones).filter(Boolean).length,
      milestoneCount: MILESTONE_IDS.length,
      weddingPlanTotal: weddingTotal,
      householdPlanTotal: householdTotal,
      lastActionDay: state.lastActionDay,
      latestHistory: state.history.slice(0, 8),
    },
  };
}

export function exportAureJourneyReport(input, context = {}) {
  const report = getAureJourneyReport(input, context);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    currentStatus: report.status,
    day: report.day,
    daysInStatus: report.daysInStatus,
    metrics: { ...report.state.metrics },
    milestones: { ...report.state.milestones },
    weddingPlan: { ...report.state.weddingPlan },
    householdPlan: { ...report.state.householdPlan },
    history: report.state.history.slice(0, MAX_AURE_JOURNEY_HISTORY),
    privacy: 'No partner name, private health record, message content, or actual contact is included.',
  };
}
