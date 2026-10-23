import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKILLS_COURSES, CAREER_PATHWAYS, MAX_ACTIVE_COURSES,
  createDefaultSkillsState, normalizeSkillsState, enrollTraining, attendTraining,
  toggleCareerInterest, skillsPathwayReport, exportSkillsPathwayReport,
} from '../js/KanoNorthernDriverSkillsPathways.js';

test('default state starts empty and exposes recognised community courses', () => {
  const state = createDefaultSkillsState({ day: 3 });
  assert.equal(state.lastSeenDay, 3);
  assert.equal(state.certificates.length, 0);
  assert.equal(SKILLS_COURSES.length, 5);
  assert.equal(CAREER_PATHWAYS.length, 5);
});

test('cannot enroll during an active driving shift', () => {
  const result = enrollTraining(createDefaultSkillsState(), { courseId: 'keke_safety', day: 1, activeShift: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'active_shift');
  assert.equal(result.state.enrollments.length, 0);
});

test('enrollment is free, persistent state changes, and first attendance requires a later day', () => {
  const result = enrollTraining(createDefaultSkillsState(), { courseId: 'keke_safety', day: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.state.enrollments[0].status, 'in_progress');
  const sameDay = attendTraining(result.state, { courseId: 'keke_safety', day: 1 });
  assert.equal(sameDay.ok, false);
  assert.equal(sameDay.reason, 'next_day_required');
});

test('one session per in-game day applies across different courses', () => {
  let state = createDefaultSkillsState();
  state = enrollTraining(state, { courseId: 'keke_safety', day: 1 }).state;
  state = enrollTraining(state, { courseId: 'market_bookkeeping', day: 1 }).state;
  const first = attendTraining(state, { courseId: 'keke_safety', day: 2 });
  assert.equal(first.ok, true);
  const second = attendTraining(first.state, { courseId: 'market_bookkeeping', day: 2 });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'daily_limit');
});

test('successful course completion produces one certificate and unlocks its pathway', () => {
  let state = enrollTraining(createDefaultSkillsState(), { courseId: 'keke_safety', day: 1 }).state;
  state = attendTraining(state, { courseId: 'keke_safety', day: 2 }).state;
  const finish = attendTraining(state, { courseId: 'keke_safety', day: 3 });
  assert.equal(finish.ok, true);
  assert.equal(finish.certificate.courseId, 'keke_safety');
  assert.equal(finish.state.certificates.length, 1);
  const report = skillsPathwayReport(finish.state, { day: 3 });
  assert.equal(report.pathways.find(row => row.id === 'keke_owner_operator').eligible, true);
});

test('cannot repeat enrollment after certification', () => {
  let state = enrollTraining(createDefaultSkillsState(), { courseId: 'keke_safety', day: 1 }).state;
  state = attendTraining(state, { courseId: 'keke_safety', day: 2 }).state;
  state = attendTraining(state, { courseId: 'keke_safety', day: 3 }).state;
  const result = enrollTraining(state, { courseId: 'keke_safety', day: 3 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'already_certified');
});

test('simultaneous active course count is bounded', () => {
  let state = createDefaultSkillsState();
  state = enrollTraining(state, { courseId: 'keke_safety', day: 1 }).state;
  state = enrollTraining(state, { courseId: 'market_bookkeeping', day: 1 }).state;
  const third = enrollTraining(state, { courseId: 'digital_sales', day: 1 });
  assert.equal(MAX_ACTIVE_COURSES, 2);
  assert.equal(third.ok, false);
  assert.equal(third.reason, 'course_limit');
});

test('career interest cannot be saved without the required certificates', () => {
  const result = toggleCareerInterest(createDefaultSkillsState(), { roleId: 'online_sales_assistant', day: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'qualifications_required');
});

test('qualified pathway interest can be saved and removed without altering other state', () => {
  let state = enrollTraining(createDefaultSkillsState(), { courseId: 'keke_safety', day: 1 }).state;
  state = attendTraining(state, { courseId: 'keke_safety', day: 2 }).state;
  state = attendTraining(state, { courseId: 'keke_safety', day: 3 }).state;
  const add = toggleCareerInterest(state, { roleId: 'keke_owner_operator', day: 3 });
  assert.equal(add.ok, true);
  assert.equal(add.interested, true);
  const remove = toggleCareerInterest(add.state, { roleId: 'keke_owner_operator', day: 3 });
  assert.equal(remove.ok, true);
  assert.equal(remove.interested, false);
  assert.deepEqual(remove.state.interestedRoles, []);
});

test('active shift blocks attendance and career-interest actions', () => {
  let state = enrollTraining(createDefaultSkillsState(), { courseId: 'keke_safety', day: 1 }).state;
  assert.equal(attendTraining(state, { courseId: 'keke_safety', day: 2, activeShift: true }).reason, 'active_shift');
  assert.equal(toggleCareerInterest(state, { roleId: 'keke_owner_operator', day: 2, activeShift: true }).reason, 'active_shift');
});

test('clock rollback fails safely without moving the saved day backwards', () => {
  const state = createDefaultSkillsState({ day: 5 });
  const result = enrollTraining(state, { courseId: 'keke_safety', day: 4 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'clock_rollback');
  assert.equal(result.state.lastSeenDay, 5);
});

test('unknown courses, roles and missing enrollment are rejected', () => {
  assert.equal(enrollTraining(createDefaultSkillsState(), { courseId: 'made_up' }).reason, 'invalid_course');
  assert.equal(toggleCareerInterest(createDefaultSkillsState(), { roleId: 'made_up' }).reason, 'invalid_role');
  assert.equal(attendTraining(createDefaultSkillsState(), { courseId: 'keke_safety', day: 2 }).reason, 'not_enrolled');
});

test('normalization clamps counters, de-duplicates certificates, and bounds history', () => {
  const state = normalizeSkillsState({
    lastSeenDay: 2, lastTrainingDay: 2,
    certificates: [
      { courseId: 'keke_safety', completedDay: 2 },
      { courseId: 'keke_safety', completedDay: 2 },
      { courseId: 'unknown', completedDay: 2 },
    ],
    enrollments: [{ courseId: 'market_bookkeeping', enrolledDay: 1, sessionsCompleted: 999 }],
    interestedRoles: ['keke_owner_operator', 'unknown', 'keke_owner_operator'],
    history: Array.from({ length: 100 }, (_, i) => ({ day: i + 1, type: 'test', text: `row ${i}` })),
  });
  assert.equal(state.certificates.length, 1);
  assert.equal(state.enrollments[0].sessionsCompleted, 3);
  assert.deepEqual(state.interestedRoles, ['keke_owner_operator']);
  assert.equal(state.history.length, 80);
});

test('readiness remains bounded and report does not invent earnings', () => {
  let state = createDefaultSkillsState();
  for (const course of SKILLS_COURSES.slice(0, 2)) {
    state = enrollTraining(state, { courseId: course.id, day: state.lastSeenDay }).state;
    while (state.enrollments.find(row => row.courseId === course.id)?.status === 'in_progress') {
      const nextDay = Math.max(state.lastSeenDay, state.lastTrainingDay || state.lastSeenDay) + 1;
      state = attendTraining(state, { courseId: course.id, day: nextDay }).state;
    }
  }
  const report = skillsPathwayReport(state, { day: 8, profile: { name: 'Asabe', age: 27, gender: 'female' }, passengerTrust: 100, communityTrust: 100, digitalReputation: 100 });
  assert.ok(report.careerReadiness >= 0 && report.careerReadiness <= 100);
  assert.equal(report.profile.name, 'Asabe');
  assert.equal(report.financialEffect, 0);
  assert.equal(JSON.parse(exportSkillsPathwayReport(state, { day: 8 })).version, 1);
});
