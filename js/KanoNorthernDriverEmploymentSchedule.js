/**
 * Kano Life Step 67 — employment attendance and weekly payroll helpers.
 * Pure functions only: no DOM, wallet writes, randomness, or real employer data.
 */
export const EMPLOYMENT_SCHEDULE_STORAGE_KEY = 'kano-life-employment-schedule-v1';
export const MAX_EMPLOYMENT_SCHEDULE_HISTORY = 120;
export const MAX_EMPLOYMENT_PAYROLL_RECORDS = 80;
const clampInt = (value, min, max, fallback = min) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
};
const safeText = (value, max = 160) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));
export const safeWorldDay = value => clampInt(value, 1, 10000000, 1);

export function scheduleForJob(jobId) {
  const fiveDayRoles = new Set(['online-shop-assistant', 'dispatch-desk-trainee', 'operations-trainee']);
  const sixDayRoles = new Set(['dawanau-stock-records', 'kwari-shop-sales', 'park-maintenance-helper', 'market-loading-crew']);
  const daysPerWeek = fiveDayRoles.has(String(jobId)) ? 5 : sixDayRoles.has(String(jobId)) ? 6 : 5;
  return {
    daysPerWeek,
    restDays: 7 - daysPerWeek,
    paidDaysPerMonth: daysPerWeek === 6 ? 26 : 22,
    dailyHours: String(jobId) === 'park-maintenance-helper' ? 6 : 8,
    scheduleLabel: daysPerWeek === 6 ? 'Six scheduled days; one weekly rest day' : 'Five scheduled days; two weekly rest days',
  };
}

export function isScheduledWorkday(jobId, day) {
  const weekday = ((safeWorldDay(day) - 1) % 7) + 1; // in-game day 1 is Monday
  return weekday <= scheduleForJob(jobId).daysPerWeek;
}

export function estimateDailyWage(job, { monthlyTarget = null } = {}) {
  if (!job || !Number.isFinite(Number(job.salaryMin)) || !Number.isFinite(Number(job.salaryMax))) return 0;
  const min = Math.max(0, Number(job.salaryMin));
  const max = Math.max(min, Number(job.salaryMax));
  const target = monthlyTarget == null ? (min + max) / 2 : Math.max(min, Math.min(max, Number(monthlyTarget) || 0));
  const divisor = scheduleForJob(job.id).paidDaysPerMonth;
  return Math.max(0, Math.round(target / divisor));
}

function blankState({ employment = null, day = 1 } = {}) {
  const acceptedDay = safeWorldDay(employment?.acceptedDay ?? day);
  const jobId = safeText(employment?.jobId, 100);
  return {
    version: 1,
    employmentKey: jobId && employment?.status === 'active' ? `${jobId}:${acceptedDay}` : '',
    jobId,
    acceptedDay,
    lastSeenDay: safeWorldDay(day),
    workPattern: 'balanced',
    attendance: [],
    payroll: [],
    history: [],
  };
}

export function createDefaultEmploymentScheduleState(options = {}) {
  return blankState(options);
}

export function normalizeEmploymentScheduleState(input = {}, options = {}) {
  const fallback = blankState(options);
  const raw = input && typeof input === 'object' ? input : {};
  const pattern = ['balanced', 'protect_job', 'family_evening'].includes(raw.workPattern) ? raw.workPattern : 'balanced';
  const attendance = (Array.isArray(raw.attendance) ? raw.attendance : []).slice(-MAX_EMPLOYMENT_SCHEDULE_HISTORY).map(row => ({
    id: safeText(row?.id, 180),
    day: safeWorldDay(row?.day),
    jobId: safeText(row?.jobId, 100),
    status: ['worked', 'family_leave', 'health_leave'].includes(row?.status) ? row.status : 'worked',
    hours: clampInt(row?.hours, 0, 12, 8),
    note: safeText(row?.note, 120),
  })).filter(row => row.id && row.jobId);
  const payroll = (Array.isArray(raw.payroll) ? raw.payroll : []).slice(-MAX_EMPLOYMENT_PAYROLL_RECORDS).map(row => ({
    id: safeText(row?.id, 180),
    cycle: clampInt(row?.cycle, 1, 100000, 1),
    startDay: safeWorldDay(row?.startDay),
    endDay: safeWorldDay(row?.endDay),
    dueDay: safeWorldDay(row?.dueDay),
    workedDays: clampInt(row?.workedDays, 0, 7, 0),
    grossPay: clampInt(row?.grossPay, 0, 100000000, 0),
    status: row?.status === 'paid' ? 'paid' : 'due',
  })).filter(row => row.id);
  const history = (Array.isArray(raw.history) ? raw.history : []).slice(-MAX_EMPLOYMENT_SCHEDULE_HISTORY).map(row => ({
    id: safeText(row?.id, 180), day: safeWorldDay(row?.day), type: safeText(row?.type, 60),
    text: safeText(row?.text, 220), amount: clampInt(row?.amount, 0, 100000000, 0),
  })).filter(row => row.id && row.type);
  return {
    version: 1,
    employmentKey: safeText(raw.employmentKey, 180) || fallback.employmentKey,
    jobId: safeText(raw.jobId, 100) || fallback.jobId,
    acceptedDay: safeWorldDay(raw.acceptedDay ?? fallback.acceptedDay),
    lastSeenDay: safeWorldDay(raw.lastSeenDay ?? fallback.lastSeenDay),
    workPattern: pattern,
    attendance,
    payroll,
    history,
  };
}

function log(state, day, type, text, amount = 0) {
  state.history.push({ id: `${type}:${safeWorldDay(day)}:${state.history.length + 1}`, day: safeWorldDay(day), type, text: safeText(text, 220), amount: clampInt(amount, 0, 100000000, 0) });
  if (state.history.length > MAX_EMPLOYMENT_SCHEDULE_HISTORY) state.history.splice(0, state.history.length - MAX_EMPLOYMENT_SCHEDULE_HISTORY);
}

function stateForEmployment(inputState, employment, day) {
  const currentDay = safeWorldDay(day);
  const acceptedDay = safeWorldDay(employment?.acceptedDay ?? currentDay);
  const jobId = safeText(employment?.jobId, 100);
  const key = jobId && employment?.status === 'active' ? `${jobId}:${acceptedDay}` : '';
  const normalized = normalizeEmploymentScheduleState(inputState, { employment, day: currentDay });
  if (key && normalized.employmentKey !== key) {
    const next = blankState({ employment, day: currentDay });
    next.workPattern = normalized.workPattern;
    log(next, currentDay, 'role_started', `Work schedule opened for ${safeText(employment.role || jobId)}.`, 0);
    return next;
  }
  return normalized;
}

function createPayrollCycles(state, job, employment, currentDay) {
  const acceptedDay = safeWorldDay(employment.acceptedDay);
  const dueCycles = Math.max(0, Math.floor((currentDay - acceptedDay - 1) / 7));
  const ids = new Set(state.payroll.map(row => row.id));
  const dailyWage = estimateDailyWage(job);
  for (let cycle = 1; cycle <= dueCycles; cycle += 1) {
    const id = `${employment.jobId}:${acceptedDay}:week-${cycle}`;
    if (ids.has(id)) continue;
    const startDay = acceptedDay + (cycle - 1) * 7 + 1;
    const endDay = acceptedDay + cycle * 7;
    const workedDays = state.attendance.filter(row => row.jobId === employment.jobId && row.status === 'worked' && row.day >= startDay && row.day <= endDay).length;
    const grossPay = dailyWage * workedDays;
    state.payroll.push({ id, cycle, startDay, endDay, dueDay: endDay + 1, workedDays, grossPay, status: 'due' });
    log(state, currentDay, 'payroll_due', `Week ${cycle} payroll is due for ${workedDays} attended workday(s).`, grossPay);
    ids.add(id);
  }
  if (state.payroll.length > MAX_EMPLOYMENT_PAYROLL_RECORDS) state.payroll.splice(0, state.payroll.length - MAX_EMPLOYMENT_PAYROLL_RECORDS);
}

function finalizePayrollOnExit(state, job, employment, currentDay) {
  const acceptedDay = safeWorldDay(employment.acceptedDay);
  const endedDay = Math.max(acceptedDay, safeWorldDay(employment.endedDay ?? currentDay));
  const completeCycles = Math.floor((endedDay - acceptedDay) / 7);
  const ids = new Set(state.payroll.map(row => row.id));
  const dailyWage = estimateDailyWage(job);
  for (let cycle = 1; cycle <= completeCycles; cycle += 1) {
    const id = `${employment.jobId}:${acceptedDay}:week-${cycle}`;
    const existing = state.payroll.find(row => row.id === id);
    if (existing) {
      if (existing.status === 'due') existing.dueDay = Math.min(existing.dueDay, currentDay);
      continue;
    }
    const startDay = acceptedDay + (cycle - 1) * 7 + 1;
    const endDay = acceptedDay + cycle * 7;
    const workedDays = state.attendance.filter(row => row.jobId === employment.jobId && row.status === 'worked' && row.day >= startDay && row.day <= endDay).length;
    const grossPay = dailyWage * workedDays;
    state.payroll.push({ id, cycle, startDay, endDay, dueDay: currentDay, workedDays, grossPay, status: 'due' });
    log(state, currentDay, 'payroll_due', `Final payroll for week ${cycle} is due for ${workedDays} attended workday(s).`, grossPay);
    ids.add(id);
  }
  const remainder = (endedDay - acceptedDay) % 7;
  if (remainder > 0) {
    const cycle = completeCycles + 1;
    const startDay = acceptedDay + completeCycles * 7 + 1;
    const endDay = endedDay;
    const id = `${employment.jobId}:${acceptedDay}:partial-week-${cycle}-end-${endDay}`;
    if (!ids.has(id)) {
      const workedDays = state.attendance.filter(row => row.jobId === employment.jobId && row.status === 'worked' && row.day >= startDay && row.day <= endDay).length;
      const grossPay = dailyWage * workedDays;
      state.payroll.push({ id, cycle, startDay, endDay, dueDay: currentDay, workedDays, grossPay, status: 'due' });
      log(state, currentDay, 'final_payroll_due', `Final partial-week payroll is due for ${workedDays} attended workday(s).`, grossPay);
    }
  }
  // If leaving on a payday, all completed unpaid periods are settled now.
  for (const payroll of state.payroll) {
    if (payroll.status === 'due' && payroll.endDay <= endedDay) payroll.dueDay = Math.min(payroll.dueDay, currentDay);
  }
  if (state.payroll.length > MAX_EMPLOYMENT_PAYROLL_RECORDS) state.payroll.splice(0, state.payroll.length - MAX_EMPLOYMENT_PAYROLL_RECORDS);
}

export function advanceEmploymentScheduleState(inputState, { employment = null, job = null, day = 1 } = {}) {
  const currentDay = safeWorldDay(day);
  if (!employment?.jobId || !job || !['active', 'left'].includes(String(employment.status))) {
    return { ok: true, reason: null, changed: false, state: normalizeEmploymentScheduleState(inputState, { day: currentDay }), duePayroll: [] };
  }
  const state = stateForEmployment(inputState, employment, currentDay);
  if (currentDay < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', changed: false, state, duePayroll: [] };
  const originalLastSeen = state.lastSeenDay;
  state.lastSeenDay = currentDay;
  if (employment.status === 'active') createPayrollCycles(state, job, employment, currentDay);
  else finalizePayrollOnExit(state, job, employment, currentDay);
  const duePayroll = state.payroll.filter(row => row.status === 'due' && row.dueDay <= currentDay).map(row => clone(row));
  return { ok: true, state: normalizeEmploymentScheduleState(state, { employment, day: currentDay }), changed: originalLastSeen !== currentDay || duePayroll.length > 0, duePayroll };
}

export function recordEmploymentAttendance(inputState, { employment = null, job = null, day = 1, activeShift = false, status = 'worked' } = {}) {
  const currentDay = safeWorldDay(day);
  const advanced = advanceEmploymentScheduleState(inputState, { employment, job, day: currentDay });
  if (!advanced.ok) return advanced;
  const state = advanced.state;
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (employment?.status !== 'active' || !job) return { ok: false, reason: 'not_employed', state };
  if (currentDay <= safeWorldDay(employment.acceptedDay)) return { ok: false, reason: 'next_day_required', state };
  if (!isScheduledWorkday(job.id, currentDay)) return { ok: false, reason: 'rest_day', state };
  if (state.attendance.some(row => row.jobId === job.id && row.day === currentDay)) return { ok: false, reason: 'already_recorded', state };
  if (!['worked', 'family_leave', 'health_leave'].includes(status)) return { ok: false, reason: 'invalid_attendance_status', state };
  const hours = status === 'worked' ? scheduleForJob(job.id).dailyHours : 0;
  const note = status === 'worked' ? 'Scheduled workday completed.' : status === 'family_leave' ? 'Unpaid family/personal day.' : 'Unpaid health/recovery day.';
  const row = { id: `${job.id}:${currentDay}`, day: currentDay, jobId: job.id, status, hours, note };
  state.attendance.push(row);
  if (state.attendance.length > MAX_EMPLOYMENT_SCHEDULE_HISTORY) state.attendance.splice(0, state.attendance.length - MAX_EMPLOYMENT_SCHEDULE_HISTORY);
  log(state, currentDay, status === 'worked' ? 'attendance' : status, status === 'worked' ? `Completed a ${hours}-hour workday for ${job.title}.` : `${note} ${job.title} attendance was not paid.`, 0);
  return { ok: true, state: normalizeEmploymentScheduleState(state, { employment, day: currentDay }), row, message: status === 'worked' ? 'Workday recorded. Pay is calculated at the weekly payday.' : 'Unpaid leave recorded. No salary was earned for this date.' };
}

export function markPayrollPaid(inputState, payrollId, { day = 1 } = {}) {
  const state = normalizeEmploymentScheduleState(inputState, { day });
  const record = state.payroll.find(row => row.id === payrollId);
  if (!record) return { ok: false, reason: 'invalid_payroll', state };
  if (record.status === 'paid') return { ok: false, reason: 'already_paid', state, payroll: clone(record) };
  record.status = 'paid';
  log(state, day, 'payroll_paid', `Weekly salary paid for days ${record.startDay}–${record.endDay}.`, record.grossPay);
  return { ok: true, state, payroll: clone(record) };
}

export function employmentScheduleReport(inputState, { employment = null, job = null, day = 1 } = {}) {
  const state = normalizeEmploymentScheduleState(inputState, { employment, day });
  const worked = state.attendance.filter(row => row.status === 'worked');
  const leave = state.attendance.filter(row => row.status !== 'worked');
  const paidPayroll = state.payroll.filter(row => row.status === 'paid');
  return {
    day: safeWorldDay(day),
    employment: employment ? { jobId: safeText(employment.jobId, 100), role: safeText(employment.role, 160), employer: safeText(employment.employer, 160), acceptedDay: safeWorldDay(employment.acceptedDay), status: safeText(employment.status, 30) } : null,
    job: job ? { id: job.id, title: job.title, salaryMin: job.salaryMin, salaryMax: job.salaryMax } : null,
    schedule: job ? scheduleForJob(job.id) : null,
    workedDays: worked.length,
    leaveDays: leave.length,
    paidSalaryTotal: paidPayroll.reduce((sum, row) => sum + row.grossPay, 0),
    dueSalaryTotal: state.payroll.filter(row => row.status === 'due').reduce((sum, row) => sum + row.grossPay, 0),
    attendance: clone(state.attendance),
    payroll: clone(state.payroll),
    history: clone(state.history),
  };
}

export function exportEmploymentScheduleReport(state, options = {}) {
  return JSON.stringify({ schema: 'kano-life-employment-schedule/v1', report: employmentScheduleReport(state, options) }, null, 2);
}
