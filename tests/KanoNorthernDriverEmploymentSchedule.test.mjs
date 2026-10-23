import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultEmploymentScheduleState, normalizeEmploymentScheduleState,
  isScheduledWorkday, scheduleForJob, estimateDailyWage,
  recordEmploymentAttendance, advanceEmploymentScheduleState, markPayrollPaid,
  employmentScheduleReport,
} from '../js/KanoNorthernDriverEmploymentSchedule.js';

const jobs = {
  office: { id: 'operations-trainee', title: 'Company Operations Support Trainee', salaryMin: 75000, salaryMax: 115000 },
  market: { id: 'dawanau-stock-records', title: 'Grain Stock & Records Assistant', salaryMin: 55000, salaryMax: 78000 },
};
const role = (job, acceptedDay = 1, status = 'active', endedDay = null) => ({
  jobId: job.id, role: job.title, employer: 'Fictional Kano employer', acceptedDay, status, endedDay,
});

test('schedule differentiates weekday office roles from six-day market roles', () => {
  assert.equal(scheduleForJob(jobs.office.id).daysPerWeek, 5);
  assert.equal(scheduleForJob(jobs.market.id).daysPerWeek, 6);
  assert.equal(isScheduledWorkday(jobs.office.id, 5), true);
  assert.equal(isScheduledWorkday(jobs.office.id, 6), false);
  assert.equal(isScheduledWorkday(jobs.market.id, 6), true);
  assert.equal(isScheduledWorkday(jobs.market.id, 7), false);
});

test('daily wage is a safe estimate from the fictional monthly salary range', () => {
  assert.equal(estimateDailyWage(jobs.office), Math.round(95000 / 22));
  assert.equal(estimateDailyWage(null), 0);
});

test('attendance requires accepted role, a later scheduled day, and no active driving shift', () => {
  let state = createDefaultEmploymentScheduleState({ employment: role(jobs.office, 1), day: 1 });
  assert.equal(recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day: 1 }).reason, 'next_day_required');
  assert.equal(recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day: 2, activeShift: true }).reason, 'active_shift');
  assert.equal(recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day: 6 }).reason, 'rest_day');
  const result = recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day: 2 });
  assert.equal(result.ok, true);
  state = result.state;
  assert.equal(recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day: 2 }).reason, 'already_recorded');
});

test('unpaid family leave records the day but earns no salary', () => {
  const state = createDefaultEmploymentScheduleState({ employment: role(jobs.office, 1), day: 1 });
  const result = recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day: 2, status: 'family_leave' });
  assert.equal(result.ok, true);
  assert.equal(result.row.status, 'family_leave');
  assert.equal(result.state.attendance.filter(row => row.status === 'worked').length, 0);
});

test('a completed seven-day period becomes payable once on the following in-game day', () => {
  let state = createDefaultEmploymentScheduleState({ employment: role(jobs.office, 1), day: 1 });
  for (const day of [2, 3, 4, 5]) state = recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day }).state;
  const beforeDue = advanceEmploymentScheduleState(state, { employment: role(jobs.office, 1), job: jobs.office, day: 8 });
  assert.equal(beforeDue.duePayroll.length, 0);
  const due = advanceEmploymentScheduleState(beforeDue.state, { employment: role(jobs.office, 1), job: jobs.office, day: 9 });
  assert.equal(due.duePayroll.length, 1);
  assert.equal(due.duePayroll[0].workedDays, 4);
  assert.equal(due.duePayroll[0].grossPay, estimateDailyWage(jobs.office) * 4);
  const paid = markPayrollPaid(due.state, due.duePayroll[0].id, { day: 9 });
  assert.equal(paid.ok, true);
  assert.equal(markPayrollPaid(paid.state, due.duePayroll[0].id, { day: 9 }).reason, 'already_paid');
});

test('payroll changes do not create income for unrecorded attendance', () => {
  const state = createDefaultEmploymentScheduleState({ employment: role(jobs.office, 1), day: 1 });
  const result = advanceEmploymentScheduleState(state, { employment: role(jobs.office, 1), job: jobs.office, day: 9 });
  assert.equal(result.duePayroll[0].workedDays, 0);
  assert.equal(result.duePayroll[0].grossPay, 0);
});

test('clock rollback pauses rather than duplicating schedule work', () => {
  let state = createDefaultEmploymentScheduleState({ employment: role(jobs.office, 1), day: 1 });
  state = recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day: 3 }).state;
  const result = advanceEmploymentScheduleState(state, { employment: role(jobs.office, 1), job: jobs.office, day: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'clock_rollback');
});

test('leaving a role finalises attended shifts in a partial pay period', () => {
  let state = createDefaultEmploymentScheduleState({ employment: role(jobs.office, 1), day: 1 });
  for (const day of [2, 3, 4]) state = recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day }).state;
  const final = advanceEmploymentScheduleState(state, { employment: role(jobs.office, 1, 'left', 4), job: jobs.office, day: 4 });
  assert.equal(final.duePayroll.length, 1);
  assert.equal(final.duePayroll[0].workedDays, 3);
  assert.equal(final.duePayroll[0].dueDay, 4);
});

test('report totals only completed payroll receipts, not pending amounts', () => {
  let state = createDefaultEmploymentScheduleState({ employment: role(jobs.office, 1), day: 1 });
  state = recordEmploymentAttendance(state, { employment: role(jobs.office, 1), job: jobs.office, day: 2 }).state;
  state = advanceEmploymentScheduleState(state, { employment: role(jobs.office, 1), job: jobs.office, day: 9 }).state;
  const report = employmentScheduleReport(state, { employment: role(jobs.office, 1), job: jobs.office, day: 9 });
  assert.equal(report.workedDays, 1);
  assert.equal(report.paidSalaryTotal, 0);
  assert.ok(report.dueSalaryTotal > 0);
});
