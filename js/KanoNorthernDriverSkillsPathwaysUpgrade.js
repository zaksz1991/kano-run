/** Step 65 runtime panel: skills, certificates, and non-binding career interests. */
import {
  SKILLS_STORAGE_KEY, SKILLS_COURSES, CAREER_PATHWAYS, MAX_ACTIVE_COURSES,
  createDefaultSkillsState, normalizeSkillsState, enrollTraining, attendTraining,
  toggleCareerInterest, skillsPathwayReport, exportSkillsPathwayReport,
} from './KanoNorthernDriverSkillsPathways.js';

const SECTION_ID = 'kano-skills-pathways';
const STYLE_ID = 'knsp-style';
const INSTALL_KEY = Symbol.for('kano.life.skillsPathways.installed.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const moneySafeText = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 180);
let state = loadState();
let notice = '';
let noticeError = false;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(SKILLS_STORAGE_KEY);
    return normalizeSkillsState(raw ? JSON.parse(raw) : createDefaultSkillsState());
  } catch {
    return createDefaultSkillsState();
  }
}
function persistState(next) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(normalizeSkillsState(next)));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay
    ?? window.kanoNorthernDriverSocietyMarkets?.snapshot?.().day
    ?? window.kanoNorthernDriverLifeSimulation?.snapshot?.().day
    ?? 1;
  const safeDay = Number(rawDay);
  const day = Math.max(1, Math.floor(Number.isFinite(safeDay) ? safeDay : 1));
  const life = window.kanoNorthernDriverLifeSimulation?.snapshot?.() || {};
  const social = window.kanoNorthernDriverRealLife?.snapshot?.() || {};
  const digital = window.kanoNorthernDriverDigitalLife?.snapshot?.() || {};
  const meters = social.meters || social;
  return {
    ui, game, day,
    activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))),
    profile: life.profile || { name: 'Driver', age: 22, gender: 'male', goal: 'small_business' },
    passengerTrust: Number(meters.passengerRespect ?? meters.passengerTrust ?? 50),
    communityTrust: Number(meters.communityTrust ?? 50),
    digitalReputation: Number(digital.digitalReputation ?? digital.reputation ?? 50),
  };
}
function safeScores(ctx) {
  return {
    day: ctx.day, profile: ctx.profile,
    passengerTrust: ctx.passengerTrust,
    communityTrust: ctx.communityTrust,
    digitalReputation: ctx.digitalReputation,
  };
}
function notify(message, error = false) {
  notice = moneySafeText(message);
  noticeError = Boolean(error);
  const node = el('knsp-notice');
  if (node) { node.textContent = notice; node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .knsp-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .knsp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .knsp-card{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .knsp-card h4{margin:0 0 6px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .knsp-card p{margin:6px 0;font-size:12px;line-height:1.5;color:#c3d3df}
    #${SECTION_ID} .knsp-stat{font-size:22px;font-weight:900;color:#f8fbff;margin:7px 0}
    #${SECTION_ID} .knsp-meter{height:7px;background:#1b3447;border-radius:8px;overflow:hidden;margin:7px 0 10px}
    #${SECTION_ID} .knsp-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} .knsp-row{border:1px solid #29465b;background:#0a1824;border-radius:9px;padding:11px;margin-top:8px}
    #${SECTION_ID} .knsp-row h5{font-size:13px;margin:0 0 5px;color:#f5f8fb}
    #${SECTION_ID} button{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .knsp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
    #${SECTION_ID} .knsp-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .knsp-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .knsp-notice[data-state="error"]{color:#ffb4aa}
    @media(max-width:520px){#${SECTION_ID} .knsp-grid{grid-template-columns:1fr}#${SECTION_ID} .knsp-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .knsp-actions button{width:100%}}
  `;
  document.head.append(style);
}
function addText(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(text ?? '');
  parent.append(node);
  return node;
}
function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID);
  if (section) return section;
  section = document.createElement('section');
  section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">SKILLS · CERTIFICATES · CAREER PATHWAYS</h3>
    <p class="knsp-note">Use community learning sessions to build practical skills while keeping your current livelihood. Sessions are free fictional gameplay opportunities, but each requires a later in-game day and time away from driving. Certificates make pathways eligible; they never guarantee a job or automatically add money.</p>
    <div class="knsp-grid">
      <div class="knsp-card"><h4>Career readiness</h4><p class="knsp-stat" id="knsp-readiness">25/100</p><div class="knsp-meter" aria-hidden="true"><i id="knsp-readiness-meter" style="width:25%"></i></div><p id="knsp-summary" class="knsp-note"></p></div>
      <div class="knsp-card"><h4>Learning record</h4><p class="knsp-stat" id="knsp-certificate-count">0 certificates</p><p id="knsp-learning-status" class="knsp-note"></p><div class="knsp-actions"><button type="button" class="knsp-primary" data-knsp-action="export">EXPORT SKILLS & CAREER REPORT (.JSON)</button></div></div>
    </div>
    <h4>Community training</h4><div id="knsp-courses"></div>
    <h4 class="klc-section-title">CAREER PATHWAYS</h4><p class="knsp-note">Save an interest as a personal goal. It is not a real job application or offer.</p><div id="knsp-pathways"></div>
    <h4 class="klc-section-title">Recent learning history</h4><div id="knsp-history"></div>
    <p id="knsp-notice" class="knsp-notice" role="status" aria-live="polite"></p>
  `;
  const anchor = el('kano-digital-life') || el('kano-family-responsibilities') || el('kano-aure-culture');
  if (anchor) anchor.after(section); else host.append(section);
  section.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !section.contains(button)) return;
    if (button.dataset.knspEnroll) handleEnroll(button.dataset.knspEnroll);
    else if (button.dataset.knspAttend) handleAttend(button.dataset.knspAttend);
    else if (button.dataset.knspInterest) handleInterest(button.dataset.knspInterest);
    else if (button.dataset.knspAction === 'export') exportReport();
  });
  return section;
}
function currentReport(ctx = context(), sourceState = state) {
  return skillsPathwayReport(sourceState, safeScores(ctx));
}
function renderCourses(ctx, report) {
  const host = el('knsp-courses'); if (!host) return;
  host.replaceChildren();
  for (const course of SKILLS_COURSES) {
    const row = document.createElement('article'); row.className = 'knsp-row';
    addText(row, 'h5', course.title);
    addText(row, 'p', course.summary);
    addText(row, 'p', `${course.provider} · ${course.sessions} sessions · no course fee; attendance costs time.`, 'knsp-note');
    const cert = state.certificates.find(item => item.courseId === course.id);
    const enrollment = state.enrollments.find(item => item.courseId === course.id && item.status === 'in_progress');
    const actions = document.createElement('div'); actions.className = 'knsp-actions';
    const button = document.createElement('button'); button.type = 'button';
    if (cert) {
      button.textContent = `CERTIFICATE EARNED · DAY ${cert.completedDay}`;
      button.disabled = true;
      button.title = cert.certificateCode;
    } else if (enrollment) {
      button.dataset.knspAttend = course.id;
      button.textContent = `ATTEND SESSION ${enrollment.sessionsCompleted + 1}/${course.sessions}`;
      button.disabled = ctx.activeShift || ctx.day <= enrollment.enrolledDay || state.lastTrainingDay === ctx.day || ctx.day < state.lastSeenDay;
      if (ctx.activeShift) button.title = 'Finish or safely stop the driving shift first.';
      else if (ctx.day <= enrollment.enrolledDay) button.title = 'The first session can be attended on a later in-game day.';
      else if (state.lastTrainingDay === ctx.day) button.title = 'One community training session per in-game day.';
    } else {
      button.dataset.knspEnroll = course.id;
      button.textContent = 'ENROL IN FREE TRAINING';
      const activeCount = state.enrollments.filter(item => item.status === 'in_progress').length;
      button.disabled = ctx.activeShift || activeCount >= MAX_ACTIVE_COURSES || ctx.day < state.lastSeenDay;
      if (ctx.activeShift) button.title = 'Enroll after the driving shift ends.';
      else if (activeCount >= MAX_ACTIVE_COURSES) button.title = `Complete or leave a course before enrolling in another. Limit: ${MAX_ACTIVE_COURSES}.`;
    }
    actions.append(button); row.append(actions); host.append(row);
  }
}
function renderPathways(ctx, report) {
  const host = el('knsp-pathways'); if (!host) return;
  host.replaceChildren();
  for (const role of report.pathways) {
    const row = document.createElement('article'); row.className = 'knsp-row';
    addText(row, 'h5', role.title);
    addText(row, 'p', role.description);
    addText(row, 'p', role.eligible ? 'Qualifications met in this simulation.' : `Still needed: ${role.missing.join(', ')}.`, 'knsp-note');
    const actions = document.createElement('div'); actions.className = 'knsp-actions';
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.knspInterest = role.id;
    button.textContent = role.interested ? 'REMOVE SAVED INTEREST' : 'SAVE AS CAREER INTEREST';
    button.disabled = !role.eligible || ctx.activeShift || ctx.day < state.lastSeenDay;
    if (!role.eligible) button.title = 'Complete the listed training first.';
    else if (ctx.activeShift) button.title = 'Update career interests after the driving shift.';
    actions.append(button); row.append(actions); host.append(row);
  }
}
function renderHistory() {
  const host = el('knsp-history'); if (!host) return;
  host.replaceChildren();
  const rows = state.history.slice(-6).reverse();
  if (!rows.length) { addText(host, 'p', 'No training recorded yet.', 'knsp-note'); return; }
  for (const row of rows) addText(host, 'p', `Day ${row.day} · ${row.text}`, 'knsp-note');
}
function render() {
  if (typeof document === 'undefined') return;
  const section = ensureSection(); if (!section) return;
  const ctx = context();
  const report = currentReport(ctx);
  const readiness = el('knsp-readiness'); if (readiness) readiness.textContent = `${report.careerReadiness}/100`;
  const meter = el('knsp-readiness-meter'); if (meter) meter.style.width = `${report.careerReadiness}%`;
  const summary = el('knsp-summary');
  if (summary) summary.textContent = `${ctx.profile.name || 'Driver'} · Day ${ctx.day} · ${ctx.activeShift ? 'TRAINING ACTIONS LOCKED WHILE DRIVING' : 'OFF SHIFT · TRAINING AVAILABLE'}. This score is a game estimate, not a real employer assessment.`;
  const count = el('knsp-certificate-count'); if (count) count.textContent = `${state.certificates.length} certificate${state.certificates.length === 1 ? '' : 's'}`;
  const learning = el('knsp-learning-status');
  if (learning) learning.textContent = `${state.enrollments.filter(item => item.status === 'in_progress').length}/${MAX_ACTIVE_COURSES} active courses · ${state.interestedRoles.length} saved career interest(s) · training does not change the wallet.`;
  if (ctx.day < state.lastSeenDay) {
    notice = 'The in-game day is earlier than your saved learning record. Training actions are paused until the clock catches up.';
    noticeError = true;
  }
  renderCourses(ctx, report); renderPathways(ctx, report); renderHistory();
  const noticeNode = el('knsp-notice');
  if (noticeNode) { noticeNode.textContent = notice; noticeNode.dataset.state = noticeError ? 'error' : 'ok'; }
}
function commitResult(result) {
  if (!result?.ok) {
    const messages = {
      active_shift: 'Finish or safely stop the driving shift first.',
      clock_rollback: 'The saved learning day is ahead of the current in-game clock. No change was saved.',
      invalid_course: 'That training course is not available.',
      invalid_role: 'That career path is not available.',
      already_certified: 'You already hold this certificate.',
      already_enrolled: 'You are already enrolled in that course.',
      course_limit: `You can study at most ${MAX_ACTIVE_COURSES} courses at once.`,
      not_enrolled: 'Enroll in this course before attending.',
      next_day_required: 'Your first attendance is available on a later in-game day.',
      daily_limit: 'You can attend one community training session per in-game day.',
      already_attended: 'You already attended this course today.',
      qualifications_required: 'Complete the required courses before saving this pathway.',
    };
    notify(messages[result?.reason] || 'The training action was not saved.', true); render(); return;
  }
  if (!persistState(result.state)) { notify('Browser storage is unavailable. No training change was committed.', true); render(); return; }
  state = normalizeSkillsState(result.state);
  window.dispatchEvent(new CustomEvent('kano:skills-pathways-updated', { detail: { day: context().day } }));
  context().ui?.__kanoLifeCareerRefresh?.();
  notify(result.message || 'Skills record saved.');
  render();
}
function handleEnroll(courseId) {
  const ctx = context();
  commitResult(enrollTraining(state, { courseId, day: ctx.day, activeShift: ctx.activeShift }));
}
function handleAttend(courseId) {
  const ctx = context();
  commitResult(attendTraining(state, { courseId, day: ctx.day, activeShift: ctx.activeShift }));
}
function handleInterest(roleId) {
  const ctx = context();
  commitResult(toggleCareerInterest(state, { roleId, day: ctx.day, activeShift: ctx.activeShift, ...safeScores(ctx) }));
}
function exportReport() {
  const ctx = context();
  const payload = exportSkillsPathwayReport(state, safeScores(ctx));
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `kano-life-skills-pathways-day-${ctx.day}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Skills and career-pathways report exported.');
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  installStyles();
  render();
  // The Life & Career host is part of index.html before this module executes.
  // Do not observe document.documentElement here: render() mutates the panel,
  // so an unconditional document-wide observer creates a self-triggering loop.
  for (const type of [
    'kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed',
    'kano:phone-life-updated', 'kano:relationship-status-updated', 'kano:family-responsibilities-updated',
    'kano:digital-life-updated', 'kano:skills-pathways-updated',
  ]) window.addEventListener(type, render);
  window.kanoNorthernDriverSkillsPathways = {
    version: 1,
    snapshot: () => skillsPathwayReport(state, safeScores(context())),
    export: () => exportSkillsPathwayReport(state, safeScores(context())),
    refresh: render,
  };
}
install();
console.info('[Kano Life] Skills, certificates and career pathways registered.');
