/**
 * Kano Life Step 66 — fictional employment market and interview lifecycle.
 * Pure state helpers. No real employers, network activity, application fees,
 * wage payments, or guarantees of employment. Salary ranges are gameplay values.
 */
export const EMPLOYMENT_MARKET_STORAGE_KEY = 'kano-life-employment-market-v1';
export const MAX_ACTIVE_APPLICATIONS = 3;
export const MAX_EMPLOYMENT_HISTORY = 80;
export const MAX_APPLICATION_RECORDS = 24;

const freezeList = rows => Object.freeze(rows.map(row => Object.freeze(row)));
export const EMPLOYMENT_OPENINGS = freezeList([
  {
    id: 'dawanau-stock-records',
    title: 'Grain Stock & Records Assistant',
    employer: 'Dawanau Grain Merchant (fictional posting)',
    location: 'Dawanau market area',
    salaryMin: 55000, salaryMax: 78000,
    schedule: 'Day shift · six working days in a typical week',
    summary: 'Count maize, millet and other stock; compare written records; report discrepancies instead of hiding them.',
    requiredCertificates: ['market_bookkeeping'],
    preferredCertificates: ['customer_care'],
    readinessMin: 38,
    roleId: 'market_inventory_assistant',
  },
  {
    id: 'kwari-shop-sales',
    title: 'Textile & Clothing Sales Assistant',
    employer: 'Kwari Textile Shop (fictional posting)',
    location: 'Kantin Kwari area',
    salaryMin: 50000, salaryMax: 72000,
    schedule: 'Shop hours · busiest on market days',
    summary: 'Help customers, keep prices clear and record sales of fabric, clothing and footwear.',
    requiredCertificates: ['customer_care'],
    preferredCertificates: ['market_bookkeeping'],
    readinessMin: 35,
    roleId: 'market_inventory_assistant',
  },
  {
    id: 'online-shop-assistant',
    title: 'Online Shop Listings Assistant',
    employer: 'Kano Small Business Desk (fictional posting)',
    location: 'Hybrid · market and shop work',
    salaryMin: 60000, salaryMax: 90000,
    schedule: 'Negotiable daytime schedule',
    summary: 'Prepare truthful product listings, reply to customers and help sellers avoid fake payment evidence.',
    requiredCertificates: ['digital_sales', 'customer_care'],
    preferredCertificates: ['market_bookkeeping'],
    readinessMin: 45,
    roleId: 'online_sales_assistant',
  },
  {
    id: 'dispatch-desk-trainee',
    title: 'Dispatch Desk & Customer Updates Trainee',
    employer: 'City Dispatch Cooperative (fictional posting)',
    location: 'Kano urban routes',
    salaryMin: 65000, salaryMax: 92000,
    schedule: 'Rotating daytime shifts',
    summary: 'Record orders, relay realistic delivery updates and communicate delays honestly.',
    requiredCertificates: ['customer_care', 'market_bookkeeping'],
    preferredCertificates: ['digital_sales'],
    readinessMin: 43,
    roleId: 'dispatch_customer_support',
  },
  {
    id: 'operations-trainee',
    title: 'Company Operations Support Trainee',
    employer: 'Kano Industrial Services (fictional posting)',
    location: 'Sharada industrial area',
    salaryMin: 75000, salaryMax: 115000,
    schedule: 'Structured weekday shift; attendance matters',
    summary: 'Support basic records, punctuality, internal communication and safe workplace routines.',
    requiredCertificates: ['workplace_readiness', 'customer_care'],
    preferredCertificates: ['market_bookkeeping'],
    readinessMin: 52,
    roleId: 'company_operations_assistant',
  },
  {
    id: 'park-maintenance-helper',
    title: 'Transport Park Safety & Maintenance Helper',
    employer: 'Park Support Association (fictional posting)',
    location: 'Keke park and nearby workshop',
    salaryMin: 48000, salaryMax: 70000,
    schedule: 'Early starts; one rest day by agreement',
    summary: 'Help with basic inspection records, passenger flow and escalating serious vehicle faults.',
    requiredCertificates: ['keke_safety'],
    preferredCertificates: ['customer_care'],
    readinessMin: 34,
    roleId: 'keke_owner_operator',
  },
  {
    id: 'market-loading-assistant',
    title: 'Market Loading Crew Assistant',
    employer: 'Neighbourhood Produce Traders (fictional posting)',
    location: 'Produce and provisions shops',
    salaryMin: 42000, salaryMax: 60000,
    schedule: 'Early morning work; physical activity required',
    summary: 'Assist with deliveries, count packages, keep walkways safe and report damaged items.',
    requiredCertificates: [],
    preferredCertificates: ['market_bookkeeping', 'keke_safety'],
    readinessMin: 25,
    roleId: null,
  },
]);

export const INTERVIEW_QUESTIONS = freezeList([
  {
    id: 'customer-concern',
    prompt: 'A customer is upset about a late delivery. What is your first response?',
    answers: [
      { id: 'listen-and-update', label: 'Listen, confirm the facts and give a realistic next update.', points: 20 },
      { id: 'blame-customer', label: 'Blame the customer before checking the situation.', points: -10 },
      { id: 'promise-anything', label: 'Promise compensation even when you have no authority.', points: 2 },
    ],
  },
  {
    id: 'record-discrepancy',
    prompt: 'The stock count does not match the written record. What do you do?',
    answers: [
      { id: 'recount-and-document', label: 'Recount, document the difference and notify the supervisor.', points: 20 },
      { id: 'change-record-silently', label: 'Change the figures quietly so the totals look right.', points: -12 },
      { id: 'leave-for-later', label: 'Leave it unresolved without telling anyone.', points: 3 },
    ],
  },
  {
    id: 'schedule-and-safety',
    prompt: 'You expect to arrive late, or a task may be unsafe. What is the professional response?',
    answers: [
      { id: 'communicate-and-clarify', label: 'Tell the supervisor early, explain the issue and clarify a safe plan.', points: 20 },
      { id: 'accept-everything', label: 'Accept every request even if it is unsafe or impossible.', points: 1 },
      { id: 'disappear', label: 'Stop replying and hope nobody notices.', points: -10 },
    ],
  },
]);

const jobById = new Map(EMPLOYMENT_OPENINGS.map(job => [job.id, job]));
const statuses = new Set([
  'applied', 'interview_due', 'result_pending', 'offered', 'accepted',
  'declined', 'not_selected', 'expired', 'left',
]);
const clampInt = (value, min, max, fallback = min) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};
const safeDay = value => clampInt(value, 1, 999999, 1);
const safeText = (value, max = 180) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));
const activeStatuses = new Set(['applied', 'interview_due', 'result_pending', 'offered']);

export function createDefaultEmploymentMarketState({ day = 1 } = {}) {
  return {
    version: 1,
    lastSeenDay: safeDay(day),
    sequence: 0,
    applications: [],
    employment: null,
    history: [],
  };
}

export function normalizeEmploymentMarketState(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const fresh = createDefaultEmploymentMarketState({ day: input.lastSeenDay ?? 1 });
  fresh.sequence = clampInt(input.sequence, 0, 9999999, 0);
  fresh.applications = (Array.isArray(input.applications) ? input.applications : [])
    .filter(row => row && jobById.has(row.jobId) && statuses.has(row.status))
    .slice(-MAX_APPLICATION_RECORDS)
    .map(row => {
      const answers = (Array.isArray(row.interviewAnswers) ? row.interviewAnswers : [])
        .slice(0, INTERVIEW_QUESTIONS.length)
        .map((answer, index) => INTERVIEW_QUESTIONS[index]?.answers.some(option => option.id === answer) ? answer : null);
      const job = jobById.get(row.jobId);
      return {
        id: safeText(row.id, 100) || `${job.id}-d${safeDay(row.appliedDay)}`,
        jobId: job.id,
        appliedDay: safeDay(row.appliedDay),
        interviewDay: safeDay(row.interviewDay),
        status: row.status,
        interviewAnswers: answers,
        interviewScore: clampInt(row.interviewScore, -100, 100, 0),
        resultDay: row.resultDay == null ? null : safeDay(row.resultDay),
        offerExpiresDay: row.offerExpiresDay == null ? null : safeDay(row.offerExpiresDay),
        readinessAtApply: clampInt(row.readinessAtApply, 0, 100, 25),
        decisionDay: row.decisionDay == null ? null : safeDay(row.decisionDay),
        decisionReason: safeText(row.decisionReason, 180),
      };
    });
  if (input.employment && jobById.has(input.employment.jobId)
      && ['active', 'left'].includes(input.employment.status)) {
    const job = jobById.get(input.employment.jobId);
    fresh.employment = {
      jobId: job.id,
      role: job.title,
      employer: job.employer,
      acceptedDay: safeDay(input.employment.acceptedDay),
      status: input.employment.status,
      endedDay: input.employment.endedDay == null ? null : safeDay(input.employment.endedDay),
    };
  }
  fresh.history = (Array.isArray(input.history) ? input.history : [])
    .filter(row => row && typeof row === 'object')
    .slice(-MAX_EMPLOYMENT_HISTORY)
    .map(row => ({ day: safeDay(row.day), type: safeText(row.type, 36), text: safeText(row.text, 200) }));
  fresh.version = 1;
  return fresh;
}

function log(state, day, type, text) {
  state.history.push({ day: safeDay(day), type: safeText(type, 36), text: safeText(text, 200) });
  if (state.history.length > MAX_EMPLOYMENT_HISTORY) state.history.splice(0, state.history.length - MAX_EMPLOYMENT_HISTORY);
}

function prepareDay(inputState, day) {
  const state = normalizeEmploymentMarketState(inputState);
  const currentDay = safeDay(day);
  if (currentDay < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state, day: currentDay };
  if (currentDay > state.lastSeenDay) {
    state.lastSeenDay = currentDay;
    log(state, currentDay, 'day_advanced', `Employment records carried forward to in-game day ${currentDay}.`);
  }
  return { ok: true, state, day: currentDay };
}

export function careerReadiness({ certificates = [], digitalReputation = 50, passengerTrust = 50, communityTrust = 50 } = {}) {
  const certificateIds = new Set((Array.isArray(certificates) ? certificates : [])
    .map(row => typeof row === 'string' ? row : row?.courseId).filter(Boolean));
  const certificateScore = Math.min(45, certificateIds.size * 9);
  const reputationScore = ((clampInt(digitalReputation, 0, 100, 50) - 50)
    + (clampInt(passengerTrust, 0, 100, 50) - 50)
    + (clampInt(communityTrust, 0, 100, 50) - 50)) * 0.1;
  return clampInt(25 + certificateScore + reputationScore, 0, 100, 25);
}

export function openingEligibility(jobId, { certificates = [], readiness = 25 } = {}) {
  const job = jobById.get(jobId);
  if (!job) return { ok: false, reason: 'invalid_job', missingCertificates: [] };
  const ids = new Set((Array.isArray(certificates) ? certificates : []).map(row => typeof row === 'string' ? row : row?.courseId).filter(Boolean));
  const missingCertificates = job.requiredCertificates.filter(id => !ids.has(id));
  return {
    ok: missingCertificates.length === 0,
    reason: missingCertificates.length ? 'qualifications_required' : (Number(readiness) < job.readinessMin ? 'readiness_low' : null),
    missingCertificates,
    qualified: missingCertificates.length === 0 && Number(readiness) >= job.readinessMin,
  };
}

export function advanceEmploymentMarketState(inputState, { day = 1 } = {}) {
  const prepared = prepareDay(inputState, day);
  if (!prepared.ok) return { ...prepared, changed: false };
  const { state, day: currentDay } = prepared;
  let changed = currentDay !== normalizeEmploymentMarketState(inputState).lastSeenDay;
  for (const app of state.applications) {
    const job = jobById.get(app.jobId);
    if (app.status === 'applied' && currentDay >= app.interviewDay) {
      app.status = 'interview_due'; changed = true;
      log(state, currentDay, 'interview_due', `Interview is ready for ${job.title}.`);
    }
    if (app.status === 'result_pending' && app.resultDay != null && currentDay >= app.resultDay) {
      const threshold = 40;
      if (app.interviewScore >= threshold && app.readinessAtApply >= job.readinessMin) {
        app.status = 'offered'; app.offerExpiresDay = currentDay + 3;
        log(state, currentDay, 'offer', `A simulated offer is available for ${job.title}.`);
      } else {
        app.status = 'not_selected'; app.decisionDay = currentDay;
        app.decisionReason = app.interviewScore < threshold
          ? 'Interview responses did not meet the simulated role threshold.'
          : 'The recorded readiness score was below this fictional role’s threshold.';
        log(state, currentDay, 'not_selected', `No offer this time for ${job.title}; the outcome is a fictional game result.`);
      }
      changed = true;
    }
    if (app.status === 'offered' && app.offerExpiresDay != null && currentDay > app.offerExpiresDay) {
      app.status = 'expired'; app.decisionDay = currentDay; changed = true;
      log(state, currentDay, 'offer_expired', `The offer window closed for ${job.title}.`);
    }
  }
  return { ok: true, state: normalizeEmploymentMarketState(state), day: currentDay, changed };
}

export function applyForOpening(inputState, { jobId, day = 1, activeShift = false, certificates = [], readiness = 25 } = {}) {
  const prepared = advanceEmploymentMarketState(inputState, { day });
  if (!prepared.ok) return { ...prepared };
  const { state, day: currentDay } = prepared;
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  const job = jobById.get(jobId);
  if (!job) return { ok: false, reason: 'invalid_job', state };
  const qualification = openingEligibility(jobId, { certificates, readiness });
  if (!qualification.ok && qualification.reason === 'qualifications_required') {
    return { ok: false, reason: 'qualifications_required', missingCertificates: qualification.missingCertificates, state };
  }
  const activeCount = state.applications.filter(app => activeStatuses.has(app.status)).length;
  if (activeCount >= MAX_ACTIVE_APPLICATIONS) return { ok: false, reason: 'application_limit', state };
  if (state.applications.some(app => app.jobId === jobId && activeStatuses.has(app.status))) return { ok: false, reason: 'already_active', state };
  const previous = state.applications.filter(app => app.jobId === jobId).sort((a, b) => b.appliedDay - a.appliedDay)[0];
  if (previous && currentDay < previous.appliedDay + 3) return { ok: false, reason: 'retry_cooldown', state };
  state.sequence += 1;
  const app = {
    id: `${jobId}-d${currentDay}-n${state.sequence}`,
    jobId, appliedDay: currentDay, interviewDay: currentDay + 2,
    status: 'applied', interviewAnswers: [], interviewScore: 0,
    resultDay: null, offerExpiresDay: null, readinessAtApply: clampInt(readiness, 0, 100, 25),
    decisionDay: null, decisionReason: '',
  };
  state.applications.push(app);
  if (state.applications.length > MAX_APPLICATION_RECORDS) state.applications.splice(0, state.applications.length - MAX_APPLICATION_RECORDS);
  log(state, currentDay, 'application', `Applied for ${job.title}; interview day ${app.interviewDay}. No application fee was charged.`);
  return { ok: true, state: normalizeEmploymentMarketState(state), application: clone(app), message: `Application recorded. Interview available on in-game day ${app.interviewDay}.` };
}

export function interviewQuestion(index) {
  const i = clampInt(index, 0, INTERVIEW_QUESTIONS.length - 1, 0);
  return clone(INTERVIEW_QUESTIONS[i]);
}

export function submitInterviewAnswer(inputState, { applicationId, day = 1, activeShift = false, answerId } = {}) {
  const prepared = advanceEmploymentMarketState(inputState, { day });
  if (!prepared.ok) return { ...prepared };
  const { state, day: currentDay } = prepared;
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  const app = state.applications.find(row => row.id === applicationId);
  if (!app) return { ok: false, reason: 'invalid_application', state };
  if (app.status !== 'interview_due') return { ok: false, reason: 'interview_not_due', state };
  if (currentDay < app.interviewDay) return { ok: false, reason: 'interview_not_due', state };
  const index = app.interviewAnswers.length;
  const question = INTERVIEW_QUESTIONS[index];
  if (!question) return { ok: false, reason: 'interview_complete', state };
  const answer = question.answers.find(item => item.id === answerId);
  if (!answer) return { ok: false, reason: 'invalid_answer', state };
  app.interviewAnswers.push(answer.id);
  app.interviewScore += answer.points;
  if (app.interviewAnswers.length === INTERVIEW_QUESTIONS.length) {
    app.status = 'result_pending'; app.resultDay = currentDay + 1;
    log(state, currentDay, 'interview_completed', `Interview completed for ${jobById.get(app.jobId).title}; result due day ${app.resultDay}.`);
  } else {
    log(state, currentDay, 'interview_answer', `Answered interview question ${app.interviewAnswers.length} for ${jobById.get(app.jobId).title}.`);
  }
  return { ok: true, state: normalizeEmploymentMarketState(state), application: clone(app), message: app.status === 'result_pending' ? `Interview complete. The simulated result is due on day ${app.resultDay}.` : 'Answer recorded. Continue to the next interview question.' };
}

export function respondToOffer(inputState, { applicationId, decision, day = 1, activeShift = false } = {}) {
  const prepared = advanceEmploymentMarketState(inputState, { day });
  if (!prepared.ok) return { ...prepared };
  const { state, day: currentDay } = prepared;
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  const app = state.applications.find(row => row.id === applicationId);
  if (!app || app.status !== 'offered') return { ok: false, reason: 'offer_unavailable', state };
  if (app.offerExpiresDay != null && currentDay > app.offerExpiresDay) return { ok: false, reason: 'offer_expired', state };
  const job = jobById.get(app.jobId);
  if (decision === 'decline') {
    app.status = 'declined'; app.decisionDay = currentDay;
    log(state, currentDay, 'offer_declined', `Declined the simulated offer for ${job.title}.`);
    return { ok: true, state: normalizeEmploymentMarketState(state), message: 'Offer declined. Your current livelihood is unchanged.' };
  }
  if (decision !== 'accept') return { ok: false, reason: 'invalid_decision', state };
  if (state.employment?.status === 'active') return { ok: false, reason: 'already_employed', state };
  app.status = 'accepted'; app.decisionDay = currentDay;
  state.employment = { jobId: job.id, role: job.title, employer: job.employer, acceptedDay: currentDay, status: 'active', endedDay: null };
  log(state, currentDay, 'offer_accepted', `Accepted a simulated offer for ${job.title}. No wages were automatically credited.`);
  return { ok: true, state: normalizeEmploymentMarketState(state), message: 'Offer accepted in the simulation. The role is recorded; no wages have been credited.' };
}

export function leaveEmployment(inputState, { day = 1, activeShift = false, reason = 'left by choice' } = {}) {
  const prepared = advanceEmploymentMarketState(inputState, { day });
  if (!prepared.ok) return { ...prepared };
  const { state, day: currentDay } = prepared;
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (state.employment?.status !== 'active') return { ok: false, reason: 'not_employed', state };
  state.employment.status = 'left'; state.employment.endedDay = currentDay;
  log(state, currentDay, 'employment_ended', `Left ${state.employment.role}: ${safeText(reason, 120)}.`);
  return { ok: true, state: normalizeEmploymentMarketState(state), message: 'The role has been marked as ended. No wages or penalty were added.' };
}

export function employmentMarketReport(inputState, { day = 1, certificates = [], readiness = 25 } = {}) {
  const state = normalizeEmploymentMarketState(inputState);
  const certificateIds = new Set((Array.isArray(certificates) ? certificates : []).map(row => typeof row === 'string' ? row : row?.courseId));
  return {
    day: safeDay(day),
    readiness: clampInt(readiness, 0, 100, 25),
    certificateCount: certificateIds.size,
    activeApplications: state.applications.filter(app => activeStatuses.has(app.status)).length,
    employment: state.employment ? clone(state.employment) : null,
    applications: clone(state.applications), history: clone(state.history),
  };
}

export function exportEmploymentMarketReport(inputState, options = {}) {
  return JSON.stringify({ schema: 'kano-life-employment-market/v1', report: employmentMarketReport(inputState, options) }, null, 2);
}
