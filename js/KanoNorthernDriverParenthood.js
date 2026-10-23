/**
 * Kano Life — Step 70: optional pregnancy-story and parenthood progression.
 * Pure local story state. It is not a health tracker, diagnosis, or medical timeline.
 * Pregnancy chapter pacing is deliberately compressed for gameplay and must not
 * be interpreted as real gestational timing.
 */
export const PARENTHOOD_STORAGE_KEY = 'kano-life-parenthood-v1';
export const PARENTHOOD_HISTORY_LIMIT = 90;
export const PREGNANCY_STORY_DAYS = 84;
export const STORY_TRIMESTER_DAYS = 28;

const MODES = new Set(['none', 'planning', 'expecting', 'parenting']);
const ACTIONS = Object.freeze({
  planning: Object.freeze([
    { id: 'family-support-talk', label: 'Discuss family support', summary: 'Talk about who can help while respecting the couple’s preferences.', effects: { support: 7, wellbeing: 2 }, once: false },
    { id: 'baby-budget-plan', label: 'Draft a baby and household budget', summary: 'Estimate food, transport, supplies and a reserve without moving money.', effects: { planning: 8 }, once: true },
    { id: 'work-rest-plan', label: 'Plan work and rest boundaries', summary: 'Consider how driving hours, company work and household duties can fit together.', effects: { wellbeing: 7, planning: 2 }, once: true },
    { id: 'care-support-map', label: 'Map a trusted support network', summary: 'Identify trusted relatives or friends who could help if asked.', effects: { support: 6, wellbeing: 2 }, once: true },
  ]),
  expecting: Object.freeze([
    { id: 'antenatal-transport-plan', label: 'Plan transport for a clinic visit', summary: 'Record a transport plan for a qualified antenatal-care provider; this does not book or pay for a real appointment.', effects: { planning: 5, support: 2 }, once: true },
    { id: 'expecting-support-talk', label: 'Have a support conversation', summary: 'Discuss practical support, privacy, work and respectful boundaries.', effects: { support: 6, wellbeing: 2 }, once: false },
    { id: 'expecting-budget-plan', label: 'Review baby and household costs', summary: 'Review planned costs and contingencies. No money is deducted.', effects: { planning: 7 }, once: true },
    { id: 'expecting-rest-plan', label: 'Review rest and work adjustments', summary: 'Plan safer shifts and time to rest with help from trusted people.', effects: { wellbeing: 7, support: 1 }, once: true },
    { id: 'birth-preparation', label: 'Prepare a birth-support plan', summary: 'Record a practical plan for transport, contacts and support. This is not a medical birth plan.', effects: { planning: 7, support: 4 }, once: true },
    { id: 'suna-name-plan', label: 'Discuss naming / Suna preferences', summary: 'Plan how family wishes, faith and the parents’ choices can be discussed respectfully.', effects: { support: 4, planning: 2 }, once: true },
  ]),
  parenting: Object.freeze([
    { id: 'share-care', label: 'Agree a shared-care rota', summary: 'Plan a fair division of everyday care and rest between trusted adults.', effects: { support: 5, wellbeing: 3, caregiving: 3 }, once: false },
    { id: 'record-suna', label: 'Plan or record a Suna gathering', summary: 'Record a modest, optional naming-gathering plan. It is not a required religious or cultural step.', effects: { support: 5, planning: 2 }, once: true },
    { id: 'child-clinic-plan', label: 'Plan a child-health appointment', summary: 'Record a plan to contact a qualified child-health provider. No vaccine or treatment advice is generated.', effects: { caregiving: 5, support: 2 }, once: true },
    { id: 'baby-supplies-plan', label: 'Review household supplies', summary: 'Plan food, clothing, hygiene items and transport within the household budget.', effects: { planning: 5, caregiving: 2 }, once: true },
    { id: 'caregiver-rest', label: 'Protect a caregiver rest period', summary: 'Arrange a rest break or trusted support rather than expecting one person to manage everything.', effects: { wellbeing: 7, support: 2 }, once: false },
    { id: 'school-savings-plan', label: 'Set a future education goal', summary: 'Record a future savings intention. No money moves into savings automatically.', effects: { planning: 6 }, once: true },
  ]),
});
const clamp = (value, min, max, fallback = min) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};
const safeDay = value => clamp(value, 1, 1_000_000, 1);
const cleanId = value => String(value ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 48);
const clone = value => JSON.parse(JSON.stringify(value));
const cleanText = (value, max = 120) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);

export function createDefaultParenthoodState() {
  return {
    version: 1,
    enabled: false,
    mode: 'none',
    chapterStartedDay: null,
    pregnancyStartDay: null,
    pregnancyStoryRole: null,
    birthRecordedDay: null,
    children: [],
    lastActionDay: null,
    milestones: [],
    history: [],
    meters: { support: 50, planning: 50, wellbeing: 60, caregiving: 50 },
  };
}

export function normalizeParenthoodState(input = {}) {
  const base = createDefaultParenthoodState();
  const raw = input && typeof input === 'object' ? input : {};
  const mode = MODES.has(String(raw.mode)) ? String(raw.mode) : 'none';
  const milestones = Array.isArray(raw.milestones) ? raw.milestones.slice(-80).map(item => ({
    id: cleanId(item?.id), day: safeDay(item?.day), type: cleanId(item?.type),
  })).filter(item => item.id && item.type) : [];
  const children = Array.isArray(raw.children) ? raw.children.slice(0, 4).map((child, index) => ({
    id: cleanId(child?.id) || `child-${index + 1}`,
    birthDay: safeDay(child?.birthDay),
    storyMilestones: Array.isArray(child?.storyMilestones) ? child.storyMilestones.map(cleanId).filter(Boolean).slice(-20) : [],
  })) : [];
  const history = Array.isArray(raw.history) ? raw.history.slice(0, PARENTHOOD_HISTORY_LIMIT).map(item => ({
    day: safeDay(item?.day), type: cleanId(item?.type), text: cleanText(item?.text, 180),
  })).filter(item => item.type && item.text) : [];
  return {
    ...base,
    enabled: raw.enabled === true,
    mode,
    chapterStartedDay: raw.chapterStartedDay == null ? null : safeDay(raw.chapterStartedDay),
    pregnancyStartDay: raw.pregnancyStartDay == null ? null : safeDay(raw.pregnancyStartDay),
    pregnancyStoryRole: ['self', 'partner', 'family-story'].includes(String(raw.pregnancyStoryRole)) ? String(raw.pregnancyStoryRole) : null,
    birthRecordedDay: raw.birthRecordedDay == null ? null : safeDay(raw.birthRecordedDay),
    children,
    lastActionDay: raw.lastActionDay == null ? null : safeDay(raw.lastActionDay),
    milestones,
    history,
    meters: {
      support: clamp(raw.meters?.support, 0, 100, 50),
      planning: clamp(raw.meters?.planning, 0, 100, 50),
      wellbeing: clamp(raw.meters?.wellbeing, 0, 100, 60),
      caregiving: clamp(raw.meters?.caregiving, 0, 100, 50),
    },
  };
}

function addHistory(state, day, type, text) {
  state.history.unshift({ day: safeDay(day), type: cleanId(type), text: cleanText(text, 180) });
  state.history = state.history.slice(0, PARENTHOOD_HISTORY_LIMIT);
}
function addMilestone(state, day, id, type) {
  if (state.milestones.some(item => item.id === id)) return false;
  state.milestones.unshift({ id: cleanId(id), day: safeDay(day), type: cleanId(type) });
  state.milestones = state.milestones.slice(0, 80);
  return true;
}
function applyMeters(state, effects = {}) {
  for (const [key, delta] of Object.entries(effects)) {
    if (Object.hasOwn(state.meters, key)) state.meters[key] = clamp(state.meters[key] + Number(delta || 0), 0, 100, state.meters[key]);
  }
}

export function enableParenthoodTracking(rawState, enabled) {
  const state = normalizeParenthoodState(rawState);
  state.enabled = enabled === true;
  return { ok: true, state, message: state.enabled ? 'Private family-life story tracking enabled in this browser.' : 'Family-life story tracking paused. Its local story data is retained.' };
}

export function beginFamilyPlanning(rawState, { day = 1 } = {}) {
  const state = normalizeParenthoodState(rawState); const d = safeDay(day);
  if (!state.enabled) return { ok: false, reason: 'tracking_disabled', state };
  if (state.mode !== 'none') return { ok: false, reason: 'chapter_already_started', state };
  state.mode = 'planning'; state.chapterStartedDay = d; state.lastActionDay = d;
  addMilestone(state, d, `planning-start-${d}`, 'chapter');
  addHistory(state, d, 'family-planning-started', 'Started an optional family-planning chapter.');
  return { ok: true, state, message: 'Family-planning chapter started. Plans do not move money or change relationship status.' };
}

export function startPregnancyStory(rawState, {
  day = 1, profileGender = 'male', healthTrackingEnabled = false,
  healthPregnancyStatus = 'none', partnerPregnancyConfirmed = false,
} = {}) {
  const state = normalizeParenthoodState(rawState); const d = safeDay(day);
  if (!state.enabled) return { ok: false, reason: 'tracking_disabled', state };
  if (!['none', 'planning'].includes(state.mode)) return { ok: false, reason: 'story_not_available', state };
  if (state.lastActionDay === d) return { ok: false, reason: 'action_already_used_today', state };
  const selfStory = String(profileGender) === 'female' && healthTrackingEnabled === true && String(healthPregnancyStatus) === 'positive';
  if (!selfStory && partnerPregnancyConfirmed !== true) return { ok: false, reason: 'explicit_confirmation_required', state };
  state.mode = 'expecting';
  state.chapterStartedDay = state.chapterStartedDay ?? d;
  state.pregnancyStartDay = d;
  state.pregnancyStoryRole = selfStory ? 'self' : 'partner';
  state.lastActionDay = d;
  addHistory(state, d, 'expecting-story-started', selfStory
    ? 'Started an optional expecting-parent story using the existing life-simulation health status.'
    : 'Started an optional story in which an adult partner is expecting; no partner health data was recorded.');
  return { ok: true, state, message: 'Expecting-parent story started. The countdown is compressed game pacing, not real pregnancy timing.' };
}

export function actionsForParenthoodMode(mode) {
  return (ACTIONS[String(mode)] || []).map(action => ({ ...action, effects: { ...action.effects } }));
}

export function recordParenthoodAction(rawState, { actionId, day = 1 } = {}) {
  const state = normalizeParenthoodState(rawState); const d = safeDay(day);
  if (!state.enabled) return { ok: false, reason: 'tracking_disabled', state };
  if (!['planning', 'expecting', 'parenting'].includes(state.mode)) return { ok: false, reason: 'no_active_chapter', state };
  if (state.lastActionDay === d) return { ok: false, reason: 'action_already_used_today', state };
  const action = actionsForParenthoodMode(state.mode).find(item => item.id === String(actionId));
  if (!action) return { ok: false, reason: 'invalid_action_for_stage', state };
  if (action.once && state.milestones.some(item => item.id === action.id)) return { ok: false, reason: 'milestone_already_recorded', state };
  state.lastActionDay = d;
  applyMeters(state, action.effects);
  if (action.once) addMilestone(state, d, action.id, state.mode);
  addHistory(state, d, action.id, action.label);
  return { ok: true, state, action, message: `${action.label} recorded. No money was deducted.` };
}

export function pregnancyStoryProgress(stateInput, day = 1) {
  const state = normalizeParenthoodState(stateInput);
  if (state.mode !== 'expecting' || state.pregnancyStartDay == null) return { active: false, elapsedDays: 0, storyStage: null, readyForBirthStory: false, progressPercent: 0 };
  const d = safeDay(day); const elapsedDays = Math.max(0, d - state.pregnancyStartDay);
  const storyStage = elapsedDays < STORY_TRIMESTER_DAYS ? 1 : elapsedDays < STORY_TRIMESTER_DAYS * 2 ? 2 : 3;
  const birthPrepared = state.milestones.some(item => item.id === 'birth-preparation');
  const supportPlans = state.milestones.filter(item => ['antenatal-transport-plan', 'expecting-support-talk', 'expecting-budget-plan', 'expecting-rest-plan', 'birth-preparation', 'suna-name-plan'].includes(item.id)).length;
  return {
    active: true,
    elapsedDays,
    storyStage,
    readyForBirthStory: elapsedDays >= PREGNANCY_STORY_DAYS && birthPrepared && supportPlans >= 3,
    progressPercent: Math.min(100, Math.round(elapsedDays / PREGNANCY_STORY_DAYS * 100)),
    birthPrepared,
    supportPlans,
  };
}

export function recordBirthStory(rawState, { day = 1 } = {}) {
  const state = normalizeParenthoodState(rawState); const d = safeDay(day);
  if (!state.enabled) return { ok: false, reason: 'tracking_disabled', state };
  if (state.lastActionDay === d) return { ok: false, reason: 'action_already_used_today', state };
  const progress = pregnancyStoryProgress(state, d);
  if (state.mode !== 'expecting' || !progress.readyForBirthStory) return { ok: false, reason: 'preparation_not_complete', state, progress };
  if (state.children.length >= 4) return { ok: false, reason: 'child_limit_reached', state };
  const child = { id: `child-${state.children.length + 1}`, birthDay: d, storyMilestones: [] };
  state.children.push(child);
  state.mode = 'parenting'; state.birthRecordedDay = d; state.lastActionDay = d;
  addMilestone(state, d, `birth-recorded-${child.id}`, 'parenting');
  addHistory(state, d, 'birth-story-recorded', 'Recorded a fictional birth milestone. It is a story event, not a medical record.');
  return { ok: true, state, child, message: 'Birth story recorded. Parent and child support choices are now available.' };
}

export function childStoryAgeMonths(child, day = 1) {
  const birthDay = safeDay(child?.birthDay);
  return Math.max(0, Math.floor((safeDay(day) - birthDay) / 30));
}

export function parenthoodReport(rawState, { day = 1, relationshipStatus = 'single' } = {}) {
  const state = normalizeParenthoodState(rawState); const d = safeDay(day);
  const progress = pregnancyStoryProgress(state, d);
  const status = String(relationshipStatus || 'single');
  const relationNote = ({
    single: 'Family-planning choices remain optional; there is no relationship-status penalty.',
    dating: 'Discuss expectations and boundaries honestly; neither partner is entitled to force a decision.',
    engaged: 'Planning can include Aure expectations, household support and agreed timing.',
    married: 'Share care and household responsibilities; do not assume one partner must do everything.',
    separated: 'Prioritise safe boundaries and practical arrangements where relevant.',
    divorced: 'Support networks and respectful co-parenting may be relevant if the player chooses.',
  })[status] || 'Family decisions are optional and should reflect the player’s chosen story.';
  return {
    enabled: state.enabled,
    mode: state.mode,
    modeLabel: ({ none: 'Not started', planning: 'Family planning', expecting: 'Expecting-parent story', parenting: 'Parenthood' })[state.mode],
    relationshipStatus: status,
    relationNote,
    chapterStartedDay: state.chapterStartedDay,
    pregnancy: progress,
    children: state.children.map(child => ({ ...child, ageMonths: childStoryAgeMonths(child, d) })),
    meters: { ...state.meters },
    milestones: state.milestones.length,
    lastActionDay: state.lastActionDay,
    canStartPlanning: state.enabled && state.mode === 'none',
    canStartExpecting: state.enabled && ['none', 'planning'].includes(state.mode),
    canRecordBirth: state.enabled && state.mode === 'expecting' && progress.readyForBirthStory,
    history: state.history.slice(0, 12).map(item => ({ ...item })),
  };
}

export function exportParenthoodReport(rawState, options = {}) {
  const state = normalizeParenthoodState(rawState);
  const report = parenthoodReport(state, options);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    report,
    state: {
      enabled: state.enabled,
      mode: state.mode,
      chapterStartedDay: state.chapterStartedDay,
      pregnancyStartDay: state.pregnancyStartDay,
      pregnancyStoryRole: state.pregnancyStoryRole,
      birthRecordedDay: state.birthRecordedDay,
      children: state.children,
      lastActionDay: state.lastActionDay,
      milestones: state.milestones,
      history: state.history,
      meters: state.meters,
    },
    privacy: 'Contains no partner name, health symptoms, pregnancy-test details, real contacts, or real-world medical records. All timelines are fictional game story data.',
  };
}
