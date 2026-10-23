/**
 * Kano Life — community training, certificates, and career pathways.
 * Training is a time commitment, not a hidden wallet charge. Prices, wages,
 * and guarantees are intentionally absent: this module does not award money.
 */
export const SKILLS_STORAGE_KEY = 'kano-life-skills-pathways-v1';
export const MAX_ACTIVE_COURSES = 2;
export const MAX_SKILLS_HISTORY = 80;

export const SKILLS_COURSES = Object.freeze([
  Object.freeze({
    id: 'keke_safety', title: 'Keke Maintenance & Passenger Safety', sessions: 2,
    provider: 'Park peer-learning circle',
    summary: 'Daily checks, tyre awareness, passenger loading, fatigue and defensive driving.',
  }),
  Object.freeze({
    id: 'market_bookkeeping', title: 'Market Trading & Bookkeeping', sessions: 3,
    provider: 'Neighbourhood trader association',
    summary: 'Separate household money from stock, track buying cost, margin and unsold inventory.',
  }),
  Object.freeze({
    id: 'digital_sales', title: 'Digital Sales & Mobile Business', sessions: 3,
    provider: 'Community digital-skills clinic',
    summary: 'Create clear listings, use mobile data carefully and spot suspicious offers.',
  }),
  Object.freeze({
    id: 'customer_care', title: 'Customer Care & Communication', sessions: 2,
    provider: 'Community learning circle',
    summary: 'Fare clarity, respectful conflict handling and communication across language groups.',
  }),
  Object.freeze({
    id: 'workplace_readiness', title: 'Company Work Readiness', sessions: 4,
    provider: 'Community employment-preparation clinic',
    summary: 'CV basics, punctuality, interview practice, workplace conduct and application follow-up.',
  }),
]);

export const CAREER_PATHWAYS = Object.freeze([
  Object.freeze({
    id: 'keke_owner_operator', title: 'Independent Keke Owner-Operator',
    description: 'Build a disciplined maintenance and passenger-safety routine.',
    requires: ['keke_safety'],
  }),
  Object.freeze({
    id: 'market_inventory_assistant', title: 'Market Inventory Assistant',
    description: 'Support a provisions shop, grain seller or small trader with stock records.',
    requires: ['market_bookkeeping'],
  }),
  Object.freeze({
    id: 'online_sales_assistant', title: 'Online Sales Assistant',
    description: 'Help a local shop prepare product listings and manage customer enquiries.',
    requires: ['digital_sales', 'customer_care'],
  }),
  Object.freeze({
    id: 'dispatch_customer_support', title: 'Dispatch & Customer Support',
    description: 'Coordinate delivery updates and communicate clearly with customers.',
    requires: ['customer_care', 'market_bookkeeping'],
  }),
  Object.freeze({
    id: 'company_operations_assistant', title: 'Entry-Level Company Operations',
    description: 'Prepare for an entry-level support role; selection is never guaranteed.',
    requires: ['workplace_readiness', 'customer_care'],
  }),
]);

const courseById = new Map(SKILLS_COURSES.map(course => [course.id, course]));
const roleById = new Map(CAREER_PATHWAYS.map(role => [role.id, role]));
const clampInt = (value, min, max, fallback = min) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};
const safeDay = value => clampInt(value, 1, 999999, 1);
const safeText = (value, max = 160) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));

export function createDefaultSkillsState({ day = 1 } = {}) {
  return {
    version: 1,
    lastSeenDay: safeDay(day),
    lastTrainingDay: null,
    enrollments: [],
    certificates: [],
    interestedRoles: [],
    history: [],
  };
}

export function normalizeSkillsState(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const fresh = createDefaultSkillsState({ day: input?.lastSeenDay ?? 1 });
  const certSeen = new Set();
  fresh.certificates = (Array.isArray(input.certificates) ? input.certificates : [])
    .filter(row => row && courseById.has(row.courseId) && !certSeen.has(row.courseId) && certSeen.add(row.courseId))
    .slice(0, SKILLS_COURSES.length)
    .map(row => ({
      courseId: row.courseId,
      title: courseById.get(row.courseId).title,
      completedDay: safeDay(row.completedDay),
      certificateCode: safeText(row.certificateCode, 64) || `KL-${row.courseId.toUpperCase()}-D${safeDay(row.completedDay)}`,
    }));
  const certIds = new Set(fresh.certificates.map(row => row.courseId));
  fresh.enrollments = (Array.isArray(input.enrollments) ? input.enrollments : [])
    .filter(row => row && courseById.has(row.courseId))
    .slice(-SKILLS_COURSES.length)
    .map(row => {
      const course = courseById.get(row.courseId);
      const completed = certIds.has(row.courseId);
      const sessionsCompleted = clampInt(row.sessionsCompleted, 0, course.sessions, 0);
      return {
        courseId: row.courseId,
        enrolledDay: safeDay(row.enrolledDay),
        sessionsCompleted: completed ? course.sessions : sessionsCompleted,
        lastAttendedDay: row.lastAttendedDay == null ? null : safeDay(row.lastAttendedDay),
        status: completed || sessionsCompleted >= course.sessions ? 'completed' : 'in_progress',
      };
    });
  fresh.lastTrainingDay = input.lastTrainingDay == null ? null : safeDay(input.lastTrainingDay);
  fresh.interestedRoles = [...new Set((Array.isArray(input.interestedRoles) ? input.interestedRoles : [])
    .filter(id => roleById.has(id)))].slice(0, CAREER_PATHWAYS.length);
  fresh.history = (Array.isArray(input.history) ? input.history : [])
    .filter(row => row && typeof row === 'object')
    .slice(-MAX_SKILLS_HISTORY)
    .map(row => ({ day: safeDay(row.day), type: safeText(row.type, 32), text: safeText(row.text, 180) }));
  fresh.version = 1;
  return fresh;
}

function log(state, day, type, text) {
  state.history.push({ day: safeDay(day), type: safeText(type, 32), text: safeText(text, 180) });
  if (state.history.length > MAX_SKILLS_HISTORY) state.history.splice(0, state.history.length - MAX_SKILLS_HISTORY);
}
function prepareDay(inputState, day) {
  const state = normalizeSkillsState(inputState);
  const currentDay = safeDay(day);
  if (currentDay < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (currentDay > state.lastSeenDay) {
    state.lastSeenDay = currentDay;
    log(state, currentDay, 'day_advanced', `Training record carried forward to day ${currentDay}.`);
  }
  return { ok: true, state, day: currentDay };
}

export function enrollTraining(inputState, { courseId, day = 1, activeShift = false } = {}) {
  const prepared = prepareDay(inputState, day);
  if (!prepared.ok) return { ...prepared };
  const { state, day: currentDay } = prepared;
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  const course = courseById.get(courseId);
  if (!course) return { ok: false, reason: 'invalid_course', state };
  if (state.certificates.some(row => row.courseId === courseId)) return { ok: false, reason: 'already_certified', state };
  const existing = state.enrollments.find(row => row.courseId === courseId && row.status === 'in_progress');
  if (existing) return { ok: false, reason: 'already_enrolled', state };
  const activeCount = state.enrollments.filter(row => row.status === 'in_progress').length;
  if (activeCount >= MAX_ACTIVE_COURSES) return { ok: false, reason: 'course_limit', state };
  state.enrollments.push({ courseId, enrolledDay: currentDay, sessionsCompleted: 0, lastAttendedDay: null, status: 'in_progress' });
  log(state, currentDay, 'enrolled', `Enrolled in ${course.title}; sessions are free but require time and attendance.`);
  return { ok: true, state, course, message: `Enrolled in ${course.title}. First attendance is available on a later in-game day.` };
}

export function attendTraining(inputState, { courseId, day = 1, activeShift = false } = {}) {
  const prepared = prepareDay(inputState, day);
  if (!prepared.ok) return { ...prepared };
  const { state, day: currentDay } = prepared;
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  const course = courseById.get(courseId);
  if (!course) return { ok: false, reason: 'invalid_course', state };
  const enrollment = state.enrollments.find(row => row.courseId === courseId && row.status === 'in_progress');
  if (!enrollment) return { ok: false, reason: 'not_enrolled', state };
  if (currentDay <= enrollment.enrolledDay) return { ok: false, reason: 'next_day_required', state };
  if (state.lastTrainingDay === currentDay) return { ok: false, reason: 'daily_limit', state };
  if (enrollment.lastAttendedDay === currentDay) return { ok: false, reason: 'already_attended', state };
  enrollment.sessionsCompleted = Math.min(course.sessions, enrollment.sessionsCompleted + 1);
  enrollment.lastAttendedDay = currentDay;
  state.lastTrainingDay = currentDay;
  let certificate = null;
  if (enrollment.sessionsCompleted >= course.sessions) {
    enrollment.status = 'completed';
    certificate = {
      courseId,
      title: course.title,
      completedDay: currentDay,
      certificateCode: `KL-${courseId.toUpperCase()}-D${currentDay}`,
    };
    state.certificates.push(certificate);
    log(state, currentDay, 'certificate_earned', `Completed ${course.title}; certificate ${certificate.certificateCode}.`);
  } else {
    log(state, currentDay, 'session_attended', `Attended session ${enrollment.sessionsCompleted}/${course.sessions} for ${course.title}.`);
  }
  return {
    ok: true, state, course, enrollment: { ...enrollment }, certificate,
    message: certificate ? `Certificate earned: ${course.title}.` : `Training attended: ${enrollment.sessionsCompleted}/${course.sessions} sessions.`,
  };
}

export function toggleCareerInterest(inputState, { roleId, day = 1, activeShift = false, passengerTrust = 50, communityTrust = 50, digitalReputation = 50 } = {}) {
  const prepared = prepareDay(inputState, day);
  if (!prepared.ok) return { ...prepared };
  const { state, day: currentDay } = prepared;
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  const role = roleById.get(roleId);
  if (!role) return { ok: false, reason: 'invalid_role', state };
  const eligible = role.requires.every(id => state.certificates.some(cert => cert.courseId === id));
  if (!eligible) return { ok: false, reason: 'qualifications_required', state, required: role.requires };
  if (state.interestedRoles.includes(roleId)) {
    state.interestedRoles = state.interestedRoles.filter(id => id !== roleId);
    log(state, currentDay, 'interest_removed', `Removed career interest: ${role.title}.`);
    return { ok: true, state, role, interested: false, message: `Removed ${role.title} from your saved interests.` };
  }
  state.interestedRoles.push(roleId);
  log(state, currentDay, 'interest_saved', `Saved career interest: ${role.title}.`);
  return { ok: true, state, role, interested: true, message: `Saved ${role.title} as a career interest. This is not a job offer.` };
}

export function skillsPathwayReport(inputState, { day = 1, profile = {}, passengerTrust = 50, communityTrust = 50, digitalReputation = 50 } = {}) {
  const state = normalizeSkillsState(inputState);
  const clampScore = v => Math.max(0, Math.min(100, Math.round(Number.isFinite(Number(v)) ? Number(v) : 50)));
  const trust = (clampScore(passengerTrust) + clampScore(communityTrust) + clampScore(digitalReputation)) / 3;
  const readiness = Math.max(0, Math.min(100, Math.round(25 + state.certificates.length * 9 + (trust - 50) * 0.3)));
  const certificates = state.certificates.map(row => ({ ...row }));
  const pathways = CAREER_PATHWAYS.map(role => ({
    ...role,
    requires: [...role.requires],
    eligible: role.requires.every(id => certificates.some(cert => cert.courseId === id)),
    interested: state.interestedRoles.includes(role.id),
    missing: role.requires.filter(id => !certificates.some(cert => cert.courseId === id)).map(id => courseById.get(id).title),
  }));
  return {
    version: 1, day: safeDay(day), profile: {
      name: safeText(profile.name || 'Driver', 32),
      age: clampInt(profile.age, 18, 100, 22),
      gender: profile.gender === 'female' ? 'female' : 'male',
      longTermGoal: safeText(profile.goal || 'small_business', 40),
    },
    careerReadiness: readiness,
    activeCourses: state.enrollments.filter(row => row.status === 'in_progress').map(row => ({
      ...row,
      title: courseById.get(row.courseId)?.title || row.courseId,
      totalSessions: courseById.get(row.courseId)?.sessions || 0,
    })),
    certificates,
    pathways,
    history: clone(state.history).slice(-MAX_SKILLS_HISTORY),
    financialEffect: 0,
  };
}

export function exportSkillsPathwayReport(state, context = {}) {
  return JSON.stringify(skillsPathwayReport(state, context), null, 2);
}
