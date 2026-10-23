/**
 * Kano Life Step 68 — workplace performance, wellbeing, and growth readiness.
 * Pure functions only. Does not modify payroll, job status, or wallet balances.
 */
export const CAREER_PROGRESSION_STORAGE_KEY = 'kano-life-career-progression-v1';
export const MAX_CAREER_PROGRESS_HISTORY = 80;
export const MAX_CAREER_PROGRESS_REVIEWS = 24;

const clamp = (value, min, max, fallback = min) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const safeInt = (value, min, max, fallback = min) => Math.floor(clamp(value, min, max, fallback));
const safeText = (value, max = 180) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));

export const WORKPLACE_BEHAVIOURS = Object.freeze([
  { id: 'prepared', label: 'Arrived prepared and organised', score: 5, stress: 0 },
  { id: 'safety', label: 'Followed safety and work procedures', score: 12, stress: -1 },
  { id: 'accuracy', label: 'Checked records, stock, or task details', score: 8, stress: 0 },
  { id: 'communication', label: 'Communicated clearly and respectfully', score: 8, stress: -1 },
  { id: 'teamwork', label: 'Helped a colleague or customer', score: 7, stress: -1 },
  { id: 'initiative', label: 'Solved a problem and explained the fix', score: 9, stress: 1 },
]);
export const WORKPLACE_CHALLENGES = Object.freeze([
  { id: 'none', label: 'No major setback', score: 0, stress: 0 },
  { id: 'reported_issue', label: 'Reported a mistake or safety concern honestly', score: 4, stress: 1 },
  { id: 'rushed', label: 'Rushed under pressure', score: -10, stress: 8 },
  { id: 'miscommunication', label: 'A misunderstanding slowed the work', score: -5, stress: 5 },
  { id: 'conflict', label: 'An argument affected the workday', score: -12, stress: 9 },
]);
export const RECOVERY_ACTIONS = Object.freeze([
  { id: 'rest', label: 'Rest and get proper sleep', stress: -16, wellbeing: 12, note: 'Rested before the next workday.' },
  { id: 'family_evening', label: 'Protect an evening with family or partner', stress: -10, wellbeing: 10, note: 'Protected personal and family time.' },
  { id: 'community_time', label: 'Spend time with a trusted friend or community', stress: -8, wellbeing: 8, note: 'Made time for trusted social support.' },
  { id: 'quiet_break', label: 'Take a quiet personal break', stress: -7, wellbeing: 6, note: 'Made space for a quiet reset.' },
]);

function blankState({ employment = null, day = 1 } = {}) {
  const jobId = safeText(employment?.jobId, 100);
  const acceptedDay = safeInt(employment?.acceptedDay ?? day, 1, 10000000, 1);
  return {
    version: 1,
    employmentKey: jobId && employment?.status === 'active' ? `${jobId}:${acceptedDay}` : '',
    jobId,
    acceptedDay,
    lastSeenDay: safeInt(day, 1, 10000000, 1),
    stress: 12,
    wellbeing: 76,
    experiencePoints: 0,
    lastReviewDay: 0,
    lastRecoveryDay: 0,
    workLogs: [],
    reviews: [],
    history: [],
    priorRoles: [],
  };
}

export function createDefaultCareerProgressionState(options = {}) {
  return blankState(options);
}

export function normalizeCareerProgressionState(input = {}, options = {}) {
  const fallback = blankState(options);
  const raw = input && typeof input === 'object' ? input : {};
  const workLogs = (Array.isArray(raw.workLogs) ? raw.workLogs : []).slice(-MAX_CAREER_PROGRESS_HISTORY).map(row => ({
    id: safeText(row?.id, 180),
    day: safeInt(row?.day, 1, 10000000, 1),
    jobId: safeText(row?.jobId, 100),
    behaviour: WORKPLACE_BEHAVIOURS.some(item => item.id === row?.behaviour) ? row.behaviour : 'prepared',
    challenge: WORKPLACE_CHALLENGES.some(item => item.id === row?.challenge) ? row.challenge : 'none',
    score: safeInt(row?.score, 0, 100, 70),
    stressAfter: safeInt(row?.stressAfter, 0, 100, 12),
    note: safeText(row?.note, 180),
  })).filter(row => row.id && row.jobId);
  const reviews = (Array.isArray(raw.reviews) ? raw.reviews : []).slice(-MAX_CAREER_PROGRESS_REVIEWS).map(row => ({
    id: safeText(row?.id, 180),
    jobId: safeText(row?.jobId, 100),
    startDay: safeInt(row?.startDay, 1, 10000000, 1),
    endDay: safeInt(row?.endDay, 1, 10000000, 1),
    day: safeInt(row?.day, 1, 10000000, 1),
    score: safeInt(row?.score, 0, 100, 0),
    averageWorkScore: safeInt(row?.averageWorkScore, 0, 100, 0),
    attendanceRate: safeInt(row?.attendanceRate, 0, 100, 0),
    reflections: safeInt(row?.reflections, 0, 1000, 0),
    grade: ['advancement_ready', 'steady_progress', 'coaching_recommended', 'support_plan'].includes(row?.grade) ? row.grade : 'support_plan',
    experienceAwarded: safeInt(row?.experienceAwarded, 0, 1000, 0),
  })).filter(row => row.id && row.jobId);
  const history = (Array.isArray(raw.history) ? raw.history : []).slice(-MAX_CAREER_PROGRESS_HISTORY).map(row => ({
    id: safeText(row?.id, 180), day: safeInt(row?.day, 1, 10000000, 1), type: safeText(row?.type, 60),
    text: safeText(row?.text, 220),
  })).filter(row => row.id && row.type);
  const priorRoles = (Array.isArray(raw.priorRoles) ? raw.priorRoles : []).slice(-12).map(row => ({
    jobId: safeText(row?.jobId, 100), acceptedDay: safeInt(row?.acceptedDay, 1, 10000000, 1),
    lastDay: safeInt(row?.lastDay, 1, 10000000, 1), reflections: safeInt(row?.reflections, 0, 10000, 0),
    reviews: safeInt(row?.reviews, 0, 1000, 0), experiencePoints: safeInt(row?.experiencePoints, 0, 100000, 0),
  })).filter(row => row.jobId);
  return {
    version: 1,
    employmentKey: safeText(raw.employmentKey, 180) || fallback.employmentKey,
    jobId: safeText(raw.jobId, 100) || fallback.jobId,
    acceptedDay: safeInt(raw.acceptedDay ?? fallback.acceptedDay, 1, 10000000, 1),
    lastSeenDay: safeInt(raw.lastSeenDay ?? fallback.lastSeenDay, 1, 10000000, 1),
    stress: safeInt(raw.stress, 0, 100, 12),
    wellbeing: safeInt(raw.wellbeing, 0, 100, 76),
    experiencePoints: safeInt(raw.experiencePoints, 0, 100000, 0),
    lastReviewDay: safeInt(raw.lastReviewDay, 0, 10000000, 0),
    lastRecoveryDay: safeInt(raw.lastRecoveryDay, 0, 10000000, 0),
    workLogs, reviews, history, priorRoles,
  };
}

function log(state, day, type, text) {
  state.history.push({ id: `${type}:${safeInt(day, 1, 10000000, 1)}:${state.history.length + 1}`, day: safeInt(day, 1, 10000000, 1), type, text: safeText(text, 220) });
  if (state.history.length > MAX_CAREER_PROGRESS_HISTORY) state.history.splice(0, state.history.length - MAX_CAREER_PROGRESS_HISTORY);
}

export function syncCareerEmployment(inputState, { employment = null, day = 1 } = {}) {
  const state = normalizeCareerProgressionState(inputState, { employment, day });
  const jobId = safeText(employment?.jobId, 100);
  const acceptedDay = safeInt(employment?.acceptedDay ?? day, 1, 10000000, 1);
  const key = jobId && employment?.status === 'active' ? `${jobId}:${acceptedDay}` : '';
  const sourceKey = safeText(inputState?.employmentKey, 180);
  if (!key) {
    state.lastSeenDay = Math.max(state.lastSeenDay, safeInt(day, 1, 10000000, 1));
    return { ok: true, state, changed: false };
  }
  if (sourceKey === key && state.employmentKey === key) {
    state.lastSeenDay = Math.max(state.lastSeenDay, safeInt(day, 1, 10000000, 1));
    return { ok: true, state, changed: false };
  }
  if (state.employmentKey && state.jobId && state.employmentKey !== key) {
    state.priorRoles.push({ jobId: state.jobId, acceptedDay: state.acceptedDay, lastDay: state.lastSeenDay,
      reflections: state.workLogs.length, reviews: state.reviews.length, experiencePoints: state.experiencePoints });
    if (state.priorRoles.length > 12) state.priorRoles.splice(0, state.priorRoles.length - 12);
  }
  const next = blankState({ employment, day });
  next.workLogs = state.workLogs.filter(row => row.jobId !== state.jobId);
  next.reviews = state.reviews.filter(row => row.jobId !== state.jobId);
  next.history = state.history;
  next.priorRoles = state.priorRoles;
  log(next, day, 'role_started', `Career growth record opened for ${safeText(employment?.role || jobId)}.`);
  return { ok: true, state: next, changed: true };
}

export function recordWorkplaceReflection(inputState, {
  day = 1, jobId = '', employmentActive = false, attendanceStatus = '', activeShift = false,
  behaviour = 'prepared', challenge = 'none', workPattern = 'balanced',
} = {}) {
  const state = normalizeCareerProgressionState(inputState);
  const currentDay = safeInt(day, 1, 10000000, 1);
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (!employmentActive || !safeText(jobId, 100)) return { ok: false, reason: 'not_employed', state };
  if (currentDay < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (attendanceStatus !== 'worked') return { ok: false, reason: 'attendance_required', state };
  if (state.workLogs.some(row => row.day === currentDay && row.jobId === String(jobId))) return { ok: false, reason: 'already_recorded', state };
  const good = WORKPLACE_BEHAVIOURS.find(item => item.id === behaviour);
  const setback = WORKPLACE_CHALLENGES.find(item => item.id === challenge);
  if (!good || !setback) return { ok: false, reason: 'invalid_choice', state };
  const pattern = ['balanced', 'protect_job', 'family_evening'].includes(workPattern) ? workPattern : 'balanced';
  const patternStress = pattern === 'protect_job' ? 8 : pattern === 'family_evening' ? 3 : 5;
  const stressAfter = safeInt(state.stress + patternStress + good.stress + setback.stress, 0, 100, state.stress);
  const score = safeInt(70 + good.score + setback.score, 35, 100, 70);
  state.stress = stressAfter;
  state.wellbeing = safeInt(state.wellbeing + (stressAfter < 35 ? 2 : stressAfter >= 80 ? -5 : -2), 0, 100, state.wellbeing);
  state.lastSeenDay = currentDay;
  state.workLogs.push({ id: `work:${jobId}:${currentDay}`, day: currentDay, jobId: String(jobId), behaviour: good.id, challenge: setback.id, score, stressAfter,
    note: `${good.label}; ${setback.label}.` });
  if (state.workLogs.length > MAX_CAREER_PROGRESS_HISTORY) state.workLogs.splice(0, state.workLogs.length - MAX_CAREER_PROGRESS_HISTORY);
  log(state, currentDay, 'work_reflection', `Workday reflection recorded: ${score}/100. Stress is ${stressAfter}/100.`);
  return { ok: true, state, score, stress: stressAfter, message: 'Workday reflection saved. The record does not change payroll.' };
}

export function recoverFromWork(inputState, { day = 1, jobId = '', employmentActive = false, activeShift = false, actionId = 'rest' } = {}) {
  const state = normalizeCareerProgressionState(inputState);
  const currentDay = safeInt(day, 1, 10000000, 1);
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (!employmentActive || !safeText(jobId, 100)) return { ok: false, reason: 'not_employed', state };
  if (currentDay < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (state.lastRecoveryDay === currentDay) return { ok: false, reason: 'already_recovered', state };
  const action = RECOVERY_ACTIONS.find(item => item.id === actionId);
  if (!action) return { ok: false, reason: 'invalid_action', state };
  state.stress = safeInt(state.stress + action.stress, 0, 100, state.stress);
  state.wellbeing = safeInt(state.wellbeing + action.wellbeing, 0, 100, state.wellbeing);
  state.lastRecoveryDay = currentDay;
  state.lastSeenDay = currentDay;
  log(state, currentDay, 'recovery', action.note);
  return { ok: true, state, message: `${action.note} Stress is now ${state.stress}/100.` };
}

const countScheduledDays = (jobId, fromDay, toDay, daysPerWeek) => {
  let count = 0;
  const start = safeInt(fromDay, 1, 10000000, 1);
  const end = safeInt(toDay, start, 10000000, start);
  for (let day = start; day <= end; day += 1) {
    const weekday = ((day - 1) % 7) + 1;
    const activeDays = daysPerWeek || (String(jobId).includes('market') || String(jobId).includes('park') ? 6 : 5);
    if (weekday <= activeDays) count += 1;
  }
  return count;
};

export function createCareerPerformanceReview(inputState, {
  day = 1, jobId = '', employmentActive = false, acceptedDay = 1, activeShift = false,
  attendance = [], daysPerWeek = 5,
} = {}) {
  const state = normalizeCareerProgressionState(inputState);
  const currentDay = safeInt(day, 1, 10000000, 1);
  const firstEligible = safeInt(acceptedDay, 1, 10000000, 1) + 6;
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (!employmentActive || !safeText(jobId, 100)) return { ok: false, reason: 'not_employed', state };
  if (currentDay < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (currentDay < firstEligible) return { ok: false, reason: 'review_too_early', state };
  if (state.lastReviewDay && currentDay < state.lastReviewDay + 7) return { ok: false, reason: 'review_cooldown', state };
  const startDay = state.lastReviewDay ? state.lastReviewDay + 1 : safeInt(acceptedDay, 1, 10000000, 1) + 1;
  const reflections = state.workLogs.filter(row => row.jobId === String(jobId) && row.day >= startDay && row.day <= currentDay);
  if (reflections.length < 3) return { ok: false, reason: 'insufficient_evidence', state, required: 3, count: reflections.length };
  const averageWorkScore = Math.round(reflections.reduce((sum, row) => sum + row.score, 0) / reflections.length);
  const scheduledDays = countScheduledDays(jobId, startDay, currentDay, daysPerWeek);
  const workedDays = (Array.isArray(attendance) ? attendance : []).filter(row => row.jobId === String(jobId) && row.status === 'worked' && row.day >= startDay && row.day <= currentDay).length;
  const attendanceRate = scheduledDays ? safeInt(workedDays / scheduledDays * 100, 0, 100, 0) : 100;
  const score = safeInt(averageWorkScore * 0.8 + attendanceRate * 0.2, 0, 100, 0);
  const grade = score >= 85 ? 'advancement_ready' : score >= 72 ? 'steady_progress' : score >= 58 ? 'coaching_recommended' : 'support_plan';
  const award = safeInt(score / 15, 3, 8, 3);
  const review = { id: `review:${jobId}:${currentDay}`, jobId: String(jobId), startDay, endDay: currentDay, day: currentDay,
    score, averageWorkScore, attendanceRate, reflections: reflections.length, grade, experienceAwarded: award };
  state.reviews.push(review);
  if (state.reviews.length > MAX_CAREER_PROGRESS_REVIEWS) state.reviews.splice(0, state.reviews.length - MAX_CAREER_PROGRESS_REVIEWS);
  state.experiencePoints = safeInt(state.experiencePoints + award, 0, 100000, 0);
  state.lastReviewDay = currentDay;
  state.lastSeenDay = currentDay;
  log(state, currentDay, 'performance_review', `Performance review ${score}/100: ${grade.replaceAll('_', ' ')}. No salary or job status changed.`);
  return { ok: true, state, review: clone(review), message: `Review saved: ${score}/100 (${grade.replaceAll('_', ' ')}).` };
}

export function careerProgressionReport(inputState, { day = 1, job = null, employment = null } = {}) {
  const state = normalizeCareerProgressionState(inputState, { employment, day });
  const score = state.reviews.length ? state.reviews[state.reviews.length - 1].score : (state.workLogs.length ? Math.round(state.workLogs.reduce((sum, row) => sum + row.score, 0) / state.workLogs.length) : 0);
  const latestReview = state.reviews[state.reviews.length - 1] || null;
  const title = state.experiencePoints >= 60 ? 'Mentor track' : state.experiencePoints >= 35 ? 'Senior contributor track' : state.experiencePoints >= 15 ? 'Reliable contributor track' : 'Learning on the job';
  const start = state.lastReviewDay ? state.lastReviewDay + 1 : state.acceptedDay + 1;
  const recentReflections = state.workLogs.filter(row => row.jobId === state.jobId && row.day >= start && row.day <= safeInt(day, 1, 10000000, 1)).length;
  return {
    version: 1, day: safeInt(day, 1, 10000000, 1), jobId: state.jobId, role: safeText(job?.title || employment?.role || state.jobId, 150),
    employmentActive: employment?.status === 'active', stress: state.stress, wellbeing: state.wellbeing,
    experiencePoints: state.experiencePoints, growthTitle: title, workdayCount: state.workLogs.length,
    reviewCount: state.reviews.length, latestReview, latestScore: score, recentReflections,
    advancementReadiness: latestReview?.grade === 'advancement_ready' ? 'Ready to discuss development opportunities' : latestReview?.grade === 'steady_progress' ? 'Building consistent performance' : latestReview ? 'Focus on the latest review actions' : 'Complete workday reflections to establish evidence',
    workLogs: state.workLogs.slice(-12), reviews: state.reviews.slice(-8), history: state.history.slice(-12), priorRoles: state.priorRoles,
  };
}

export function exportCareerProgressionReport(inputState, context = {}) {
  return JSON.stringify(careerProgressionReport(inputState, context), null, 2);
}
