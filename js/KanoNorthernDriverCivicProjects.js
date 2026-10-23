/*
 * Kano Life Step 73 — Civic Projects & Neighbourhood Services
 * Pure state transitions. This module never reads or writes browser storage and
 * never owns the player's money. The UI bridge passes the existing wallet in.
 * All money targets are game-balance assumptions, not real-world cost estimates.
 */

export const CIVIC_SAVE_FIELD = 'northernCivicProjectsV1';
export const CIVIC_STATE_VERSION = 1;
export const CIVIC_CONTRIBUTION_AMOUNTS = Object.freeze([100, 250, 500, 1000, 2500, 5000]);
export const CIVIC_VOLUNTEER_VALUE = 450;
export const CIVIC_DAILY_MATCH_RATE = 0.035;
export const CIVIC_DAILY_MATCH_MIN = 250;
export const CIVIC_DAILY_MATCH_MAX = 1800;
export const CIVIC_MAX_HISTORY = 60;
export const CIVIC_MAX_ISSUES = 30;

export const CIVIC_DISTRICTS = Object.freeze([
  { id: 'kurmi', label: 'Kurmi Market area' },
  { id: 'kofar-mata', label: 'Kofar Mata area' },
  { id: 'dala', label: 'Dala Hill area' },
  { id: 'sabon-gari', label: 'Sabon Gari area' },
  { id: 'unguwar-uku', label: 'Unguwa Uku area' },
  { id: 'buk-road', label: 'BUK Road area' },
]);

export const CIVIC_PROJECT_TYPES = Object.freeze([
  {
    id: 'drainage', title: 'Drain clearing & flood preparation', target: 18000,
    description: 'Organise drain clearing, safe disposal and pre-rain preparation.',
    tags: ['rainy season', 'access', 'safety'], issueTypes: ['blocked-drain', 'flood-risk'],
    effects: { floodResilience: 18, roadSafety: 3, cleanliness: 5 },
  },
  {
    id: 'road-patch', title: 'Road-edge and pothole response', target: 26000,
    description: 'Coordinate hazard marking and a simulated local road-repair request.',
    tags: ['transport', 'market access'], issueTypes: ['pothole', 'unsafe-crossing'],
    effects: { roadSafety: 17, marketAccess: 9, floodResilience: 2 },
  },
  {
    id: 'street-light', title: 'Street-lighting initiative', target: 22000,
    description: 'Coordinate a lighting request and a simulated night-safety walk.',
    tags: ['night safety', 'walking'], issueTypes: ['unlit-road', 'unsafe-crossing'],
    effects: { nightSafety: 20, roadSafety: 5 },
  },
  {
    id: 'water-point', title: 'Shared water-point maintenance', target: 24000,
    description: 'Organise a water-point check, hygiene awareness and a service request.',
    tags: ['water', 'heat resilience'], issueTypes: ['water-shortage'],
    effects: { waterAccess: 18, heatResilience: 8, cleanliness: 4 },
  },
  {
    id: 'market-cleanup', title: 'Market and street clean-up', target: 12000,
    description: 'Coordinate a voluntary clean-up and safer waste handling.',
    tags: ['public health', 'local commerce'], issueTypes: ['waste-hotspot', 'blocked-drain'],
    effects: { cleanliness: 20, marketAccess: 7, floodResilience: 3 },
  },
  {
    id: 'shade-stop', title: 'Shaded driver and pedestrian rest stop', target: 21000,
    description: 'Create a simulated shade/rest-stop initiative for hot periods.',
    tags: ['heat', 'wellbeing'], issueTypes: [],
    effects: { heatResilience: 17, restingPlaces: 20 },
  },
]);

export const CIVIC_ISSUE_TYPES = Object.freeze([
  { id: 'blocked-drain', label: 'Blocked drain', priority: 'high', relatedProjects: ['drainage', 'market-cleanup'] },
  { id: 'flood-risk', label: 'Flood-prone road edge', priority: 'high', relatedProjects: ['drainage'] },
  { id: 'pothole', label: 'Pothole or damaged road edge', priority: 'high', relatedProjects: ['road-patch'] },
  { id: 'unlit-road', label: 'Poorly lit street', priority: 'medium', relatedProjects: ['street-light'] },
  { id: 'unsafe-crossing', label: 'Unsafe pedestrian crossing', priority: 'high', relatedProjects: ['road-patch', 'street-light'] },
  { id: 'water-shortage', label: 'Shared water-point problem', priority: 'high', relatedProjects: ['water-point'] },
  { id: 'waste-hotspot', label: 'Waste collection hotspot', priority: 'medium', relatedProjects: ['market-cleanup'] },
]);

const METRIC_DEFAULTS = Object.freeze({
  floodResilience: 22, roadSafety: 28, nightSafety: 20, waterAccess: 30,
  heatResilience: 24, cleanliness: 35, marketAccess: 34, restingPlaces: 15,
});
const ISSUE_STATUS = new Set(['submitted', 'community-review', 'referred', 'resolved']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const validId = (array, id) => array.some(item => item.id === id);
const validDistrict = id => validId(CIVIC_DISTRICTS, id);
const validProject = id => CIVIC_PROJECT_TYPES.find(item => item.id === id) || null;
const validIssue = id => CIVIC_ISSUE_TYPES.find(item => item.id === id) || null;
const copy = value => JSON.parse(JSON.stringify(value));
const money = value => Math.max(0, Math.floor(number(value)));

function historyEntry(day, type, message) {
  return { day: Math.max(1, Math.floor(number(day, 1))), type: String(type ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 48), message: String(message ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 220) };
}

function addHistory(state, day, type, message) {
  state.history.push(historyEntry(day, type, message));
  if (state.history.length > CIVIC_MAX_HISTORY) state.history.splice(0, state.history.length - CIVIC_MAX_HISTORY);
}

function projectProgress(project) {
  if (!project) return 0;
  const target = Math.max(1, money(project.target));
  const reached = money(project.playerRaised) + money(project.neighbourRaised) + money(project.volunteerValue);
  return Math.max(0, Math.min(100, Math.floor((reached / target) * 100)));
}

function projectRemaining(project) {
  if (!project) return 0;
  return Math.max(0, money(project.target) - money(project.playerRaised) - money(project.neighbourRaised) - money(project.volunteerValue));
}

function projectMatchesIssue(projectType, issueType) {
  const project = validProject(projectType);
  const issue = validIssue(issueType);
  return Boolean(project && issue && project.issueTypes.includes(issue.id));
}

function completeProject(state, day) {
  const project = state.activeProject;
  if (!project || projectRemaining(project) > 0) return false;
  const definition = validProject(project.type);
  if (!definition) return false;
  project.status = 'completed';
  project.completedDay = day;
  project.progress = 100;
  project.totalValue = project.target;
  state.completedProjects.push({
    id: project.id,
    type: project.type,
    title: definition.title,
    district: project.district,
    startedDay: project.startedDay,
    completedDay: day,
    target: project.target,
    playerRaised: project.playerRaised,
    neighbourRaised: project.neighbourRaised,
    volunteerValue: project.volunteerValue,
  });
  if (state.completedProjects.length > 30) state.completedProjects.splice(0, state.completedProjects.length - 30);
  for (const [key, increase] of Object.entries(definition.effects)) {
    state.metrics[key] = clamp(number(state.metrics[key], METRIC_DEFAULTS[key]) + increase, 0, 100);
  }
  state.trust = clamp(state.trust + 6, 0, 100);
  state.serviceConfidence = clamp(state.serviceConfidence + 5, 0, 100);
  state.participation = clamp(state.participation + 8, 0, 100);
  for (const issue of state.issues) {
    if (issue.district === project.district && issue.status !== 'resolved'
      && (validIssue(issue.type)?.relatedProjects || []).includes(project.type)) {
      issue.status = 'resolved';
      issue.resolvedDay = day;
      issue.outcome = 'A matching community initiative was completed in this game scenario.';
    }
  }
  addHistory(state, day, 'project-completed', `${definition.title} completed in the ${CIVIC_DISTRICTS.find(x => x.id === project.district)?.label || 'selected'} scenario.`);
  state.activeProject = null;
  return true;
}

export function createDefaultCivicState({ day = 1 } = {}) {
  const safeDay = clamp(day, 1, 1000000);
  return {
    version: CIVIC_STATE_VERSION,
    nextProjectNumber: 1,
    lastProcessedDay: safeDay,
    trust: 32,
    participation: 18,
    serviceConfidence: 24,
    metrics: { ...METRIC_DEFAULTS },
    activeProject: null,
    completedProjects: [],
    issues: [],
    history: [],
    lastVolunteerDay: 0,
    lastIssueDay: 0,
    volunteerDays: 0,
    volunteerValueTotal: 0,
  };
}

export function normalizeCivicState(input, { day = 1 } = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const initial = createDefaultCivicState({ day });
  const state = {
    ...initial,
    nextProjectNumber: clamp(source.nextProjectNumber, 1, 1000000),
    lastProcessedDay: clamp(source.lastProcessedDay, 1, 1000000) || initial.lastProcessedDay,
    trust: clamp(source.trust ?? initial.trust, 0, 100),
    participation: clamp(source.participation ?? initial.participation, 0, 100),
    serviceConfidence: clamp(source.serviceConfidence ?? initial.serviceConfidence, 0, 100),
    metrics: { ...METRIC_DEFAULTS },
    completedProjects: [], issues: [], history: [],
    lastVolunteerDay: clamp(source.lastVolunteerDay, 0, 1000000),
    lastIssueDay: clamp(source.lastIssueDay, 0, 1000000),
    volunteerDays: clamp(source.volunteerDays, 0, 1000000),
    volunteerValueTotal: money(source.volunteerValueTotal),
  };
  if (source.metrics && typeof source.metrics === 'object' && !Array.isArray(source.metrics)) {
    for (const key of Object.keys(METRIC_DEFAULTS)) state.metrics[key] = clamp(source.metrics[key] ?? METRIC_DEFAULTS[key], 0, 100);
  }
  if (source.activeProject && typeof source.activeProject === 'object' && validProject(source.activeProject.type) && validDistrict(source.activeProject.district)) {
    const definition = validProject(source.activeProject.type);
    state.activeProject = {
      id: String(source.activeProject.id || `civic-${state.nextProjectNumber}`).slice(0, 80),
      type: definition.id,
      district: source.activeProject.district,
      target: definition.target,
      playerRaised: Math.min(definition.target, money(source.activeProject.playerRaised)),
      neighbourRaised: Math.min(definition.target, money(source.activeProject.neighbourRaised)),
      volunteerValue: Math.min(definition.target, money(source.activeProject.volunteerValue)),
      startedDay: clamp(source.activeProject.startedDay, 1, 1000000),
      lastProgressDay: clamp(source.activeProject.lastProgressDay, 1, 1000000),
      status: 'fundraising',
    };
  }
  if (Array.isArray(source.completedProjects)) {
    state.completedProjects = source.completedProjects.slice(-30).filter(row => row && validProject(row.type) && validDistrict(row.district)).map(row => ({
      id: String(row.id || '').slice(0, 80), type: row.type, title: validProject(row.type).title,
      district: row.district, startedDay: clamp(row.startedDay, 1, 1000000),
      completedDay: clamp(row.completedDay, 1, 1000000), target: validProject(row.type).target,
      playerRaised: money(row.playerRaised), neighbourRaised: money(row.neighbourRaised), volunteerValue: money(row.volunteerValue),
    }));
  }
  if (Array.isArray(source.issues)) {
    state.issues = source.issues.slice(-CIVIC_MAX_ISSUES).filter(row => row && validIssue(row.type) && validDistrict(row.district)).map(row => ({
      id: String(row.id || '').slice(0, 80), type: row.type, district: row.district,
      openedDay: clamp(row.openedDay, 1, 1000000), reviewDay: clamp(row.reviewDay, 1, 1000000),
      followUpDay: clamp(row.followUpDay, 1, 1000000), status: ISSUE_STATUS.has(row.status) ? row.status : 'submitted',
      resolvedDay: row.resolvedDay ? clamp(row.resolvedDay, 1, 1000000) : null,
      outcome: String(row.outcome || '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 180),
    }));
  }
  if (Array.isArray(source.history)) state.history = source.history.slice(-CIVIC_MAX_HISTORY).filter(row => row && typeof row === 'object').map(row => historyEntry(row.day, row.type, row.message));
  return state;
}

export function startCivicProject(stateInput, { projectType, district, day = 1 } = {}) {
  const state = normalizeCivicState(stateInput, { day });
  const definition = validProject(projectType);
  const safeDay = clamp(day, 1, 1000000);
  if (!definition) return { ok: false, state, message: 'Choose a recognised community project.' };
  if (!validDistrict(district)) return { ok: false, state, message: 'Choose a recognised neighbourhood area.' };
  if (state.activeProject) return { ok: false, state, message: 'Finish or pause the current project before opening another one.' };
  const id = `civic-${state.nextProjectNumber}`;
  state.nextProjectNumber += 1;
  state.activeProject = { id, type: definition.id, district, target: definition.target, playerRaised: 0, neighbourRaised: 0, volunteerValue: 0, startedDay: safeDay, lastProgressDay: safeDay, status: 'fundraising' };
  addHistory(state, safeDay, 'project-started', `${definition.title} started for the selected neighbourhood scenario.`);
  return { ok: true, state, message: `${definition.title} started. No money was taken to open the initiative.` };
}

export function contributeToCivicProject(stateInput, { amount, wallet, day = 1 } = {}) {
  const state = normalizeCivicState(stateInput, { day });
  const project = state.activeProject;
  const requested = money(amount);
  const available = money(wallet);
  if (!project) return { ok: false, state, wallet: available, amount: 0, message: 'Start a community project first.' };
  if (!CIVIC_CONTRIBUTION_AMOUNTS.includes(requested)) return { ok: false, state, wallet: available, amount: 0, message: 'Choose one of the listed contribution amounts.' };
  if (available < requested) return { ok: false, state, wallet: available, amount: 0, message: 'Your existing banked wallet does not cover that contribution.' };
  const actual = Math.min(requested, projectRemaining(project));
  if (actual <= 0) {
    completeProject(state, clamp(day, 1, 1000000));
    return { ok: true, state, wallet: available, amount: 0, completed: true, message: 'The project is already fully funded.' };
  }
  project.playerRaised += actual;
  project.lastProgressDay = clamp(day, 1, 1000000);
  state.trust = clamp(state.trust + 1, 0, 100);
  addHistory(state, day, 'player-contribution', `Player contributed ₦${actual.toLocaleString('en-NG')} from the existing game wallet.`);
  const completed = projectRemaining(project) === 0 && completeProject(state, clamp(day, 1, 1000000));
  return { ok: true, state, wallet: available - actual, amount: actual, completed, message: completed ? 'Your contribution completed the project.' : `₦${actual.toLocaleString('en-NG')} contributed to the community project.` };
}

export function volunteerForCivicProject(stateInput, { day = 1 } = {}) {
  const state = normalizeCivicState(stateInput, { day });
  const safeDay = clamp(day, 1, 1000000);
  if (state.lastVolunteerDay === safeDay) return { ok: false, state, progressValue: 0, message: 'You have already volunteered today.' };
  state.lastVolunteerDay = safeDay;
  state.volunteerDays += 1;
  state.participation = clamp(state.participation + 3, 0, 100);
  state.trust = clamp(state.trust + 2, 0, 100);
  let progressValue = 0;
  if (state.activeProject) {
    progressValue = Math.min(CIVIC_VOLUNTEER_VALUE, projectRemaining(state.activeProject));
    state.activeProject.volunteerValue += progressValue;
    state.activeProject.lastProgressDay = safeDay;
    state.volunteerValueTotal += progressValue;
  } else {
    state.metrics.cleanliness = clamp(state.metrics.cleanliness + 1, 0, 100);
  }
  addHistory(state, safeDay, 'volunteer', progressValue ? `Volunteer work added ₦${progressValue.toLocaleString('en-NG')} of non-cash project value.` : 'Volunteered in a neighbourhood activity; no money was paid or received.');
  const completed = state.activeProject && projectRemaining(state.activeProject) === 0 && completeProject(state, safeDay);
  return { ok: true, state, progressValue, completed: Boolean(completed), message: progressValue ? 'Volunteer work recorded. It adds project value but does not add or deduct wallet cash.' : 'Volunteer activity recorded without a cash transaction.' };
}

export function reportCivicIssue(stateInput, { issueType, district, day = 1 } = {}) {
  const state = normalizeCivicState(stateInput, { day });
  const issue = validIssue(issueType);
  const safeDay = clamp(day, 1, 1000000);
  if (!issue) return { ok: false, state, message: 'Choose a recognised issue type.' };
  if (!validDistrict(district)) return { ok: false, state, message: 'Choose a recognised neighbourhood area.' };
  if (state.lastIssueDay === safeDay) return { ok: false, state, message: 'One issue report per in-game day keeps the civic board readable.' };
  const duplicate = state.issues.find(row => row.type === issue.id && row.district === district && safeDay - row.openedDay < 7 && row.status !== 'resolved');
  if (duplicate) return { ok: false, state, message: 'A similar report is already open for this area.' };
  const report = {
    id: `issue-${safeDay}-${state.issues.length + 1}`,
    type: issue.id,
    district,
    openedDay: safeDay,
    reviewDay: safeDay + 2,
    followUpDay: safeDay + 4,
    status: 'submitted',
    resolvedDay: null,
    outcome: 'Fictional in-game community report; not a real government submission.',
  };
  state.issues.push(report);
  if (state.issues.length > CIVIC_MAX_ISSUES) state.issues.splice(0, state.issues.length - CIVIC_MAX_ISSUES);
  state.lastIssueDay = safeDay;
  state.participation = clamp(state.participation + 1, 0, 100);
  addHistory(state, safeDay, 'issue-reported', `${issue.label} recorded for the selected neighbourhood scenario.`);
  return { ok: true, state, issue: copy(report), message: 'Issue recorded on the fictional in-game civic board. No real-world report was sent.' };
}

export function advanceCivicState(stateInput, { day = 1 } = {}) {
  const state = normalizeCivicState(stateInput, { day });
  const targetDay = clamp(day, 1, 1000000);
  if (targetDay <= state.lastProcessedDay) return state;
  const steps = Math.min(90, targetDay - state.lastProcessedDay);
  let cursor = state.lastProcessedDay;
  for (let i = 0; i < steps; i += 1) {
    cursor += 1;
    const project = state.activeProject;
    if (project) {
      const amount = Math.min(
        projectRemaining(project),
        clamp(Math.round(project.target * CIVIC_DAILY_MATCH_RATE), CIVIC_DAILY_MATCH_MIN, CIVIC_DAILY_MATCH_MAX),
      );
      if (amount > 0) {
        project.neighbourRaised += amount;
        project.lastProgressDay = cursor;
      }
      if (projectRemaining(project) <= 0) completeProject(state, cursor);
    }
    for (const issue of state.issues) {
      if (issue.status === 'submitted' && cursor >= issue.reviewDay) {
        issue.status = 'community-review';
        issue.outcome = 'The in-game neighbourhood group acknowledged the report.';
      }
      if (issue.status === 'community-review' && cursor >= issue.followUpDay) {
        const matching = state.completedProjects.some(projectDone => projectDone.district === issue.district && (validIssue(issue.type)?.relatedProjects || []).includes(projectDone.type));
        issue.status = matching ? 'resolved' : 'referred';
        issue.resolvedDay = matching ? cursor : null;
        issue.outcome = matching
          ? 'A matching community project was completed in this game scenario.'
          : 'The simulated board referred this issue for external/public-works follow-up; no repair is claimed.';
      }
    }
  }
  state.lastProcessedDay = targetDay;
  return state;
}

export function getCivicSnapshot(stateInput, { day = 1 } = {}) {
  const state = normalizeCivicState(stateInput, { day });
  const project = state.activeProject;
  return {
    day: clamp(day, 1, 1000000), trust: state.trust, participation: state.participation,
    serviceConfidence: state.serviceConfidence, metrics: { ...state.metrics },
    activeProject: project ? {
      id: project.id, type: project.type, title: validProject(project.type)?.title || 'Community project',
      district: project.district, target: project.target, playerRaised: project.playerRaised,
      neighbourRaised: project.neighbourRaised, volunteerValue: project.volunteerValue,
      totalProgress: Math.min(project.target, project.playerRaised + project.neighbourRaised + project.volunteerValue),
      remaining: projectRemaining(project), progressPercent: projectProgress(project),
      startedDay: project.startedDay,
    } : null,
    completedProjects: state.completedProjects.length,
    issuesOpen: state.issues.filter(row => row.status !== 'resolved' && row.status !== 'referred').length,
    issuesReferred: state.issues.filter(row => row.status === 'referred').length,
    issuesResolved: state.issues.filter(row => row.status === 'resolved').length,
    volunteerDays: state.volunteerDays,
  };
}

export function exportCivicReport(stateInput, { day = 1 } = {}) {
  const state = normalizeCivicState(stateInput, { day });
  return {
    schema: 'kano-life-civic-report-v1', generatedForGameDay: clamp(day, 1, 1000000),
    disclaimer: 'This is fictional game activity. It is not a real civic complaint, service request, fundraising account, public-cost estimate or municipal record.',
    snapshot: getCivicSnapshot(state, { day }),
    activeProject: state.activeProject ? copy(state.activeProject) : null,
    completedProjects: copy(state.completedProjects), issues: copy(state.issues), history: copy(state.history),
  };
}
