/** Step 68 runtime panel. Uses the latest employment market and attendance/payroll modules. */
import './KanoNorthernDriverDigitalLifeUpgrade.js';
import './KanoNorthernDriverEmploymentMarketUpgrade.js';
import './KanoNorthernDriverEmploymentScheduleUpgrade.js';
import { save } from './storage.js';
import { EMPLOYMENT_MARKET_STORAGE_KEY, EMPLOYMENT_OPENINGS } from './KanoNorthernDriverEmploymentMarket.js';
import { EMPLOYMENT_SCHEDULE_STORAGE_KEY, scheduleForJob } from './KanoNorthernDriverEmploymentSchedule.js';
import {
  CAREER_PROGRESSION_STORAGE_KEY, WORKPLACE_BEHAVIOURS, WORKPLACE_CHALLENGES, RECOVERY_ACTIONS,
  createDefaultCareerProgressionState, normalizeCareerProgressionState, syncCareerEmployment,
  recordWorkplaceReflection, recoverFromWork, createCareerPerformanceReview,
  careerProgressionReport, exportCareerProgressionReport,
} from './KanoNorthernDriverCareerProgression.js';

const SECTION_ID = 'kano-career-progression';
const STYLE_ID = 'kcp-style';
const INSTALL_KEY = Symbol.for('kano.life.careerProgression.installed.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const moneyDay = value => Math.max(0, Math.floor(Number(value) || 0));
const clean = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 240);
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;

function safeRead(key, fallback) {
  try { const raw = globalThis.localStorage?.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(CAREER_PROGRESSION_STORAGE_KEY);
    return normalizeCareerProgressionState(raw ? JSON.parse(raw) : createDefaultCareerProgressionState());
  } catch { return createDefaultCareerProgressionState(); }
}
let state = loadState();
let notice = '';
let noticeError = false;

function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay
    ?? save.lifestyle?.worldDayNumber ?? window.kanoDayCycle?.state?.day ?? 1;
  const day = Math.max(1, Math.floor(Number(rawDay) || 1));
  const marketState = safeRead(EMPLOYMENT_MARKET_STORAGE_KEY, {});
  const employment = marketState?.employment && typeof marketState.employment === 'object' ? marketState.employment : null;
  const job = employment ? EMPLOYMENT_OPENINGS.find(item => item.id === employment.jobId) || null : null;
  const scheduleState = safeRead(EMPLOYMENT_SCHEDULE_STORAGE_KEY, {});
  const attendance = Array.isArray(scheduleState?.attendance) ? scheduleState.attendance : [];
  const todayAttendance = job ? attendance.find(row => row.jobId === job.id && row.day === day) || null : null;
  return {
    ui, game, day, employment, job, scheduleState, attendance, todayAttendance,
    activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))),
    workPattern: ['balanced', 'protect_job', 'family_evening'].includes(scheduleState?.workPattern) ? scheduleState.workPattern : 'balanced',
    clockRollback: day < state.lastSeenDay,
  };
}
function persistState(next) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(CAREER_PROGRESSION_STORAGE_KEY, JSON.stringify(normalizeCareerProgressionState(next)));
    return true;
  } catch { return false; }
}
function notify(message, error = false) {
  notice = clean(message); noticeError = Boolean(error);
  const node = el('kcp-notice');
  if (node) { node.textContent = notice; node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kcp-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kcp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kcp-card,#${SECTION_ID} .kcp-row{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere;margin-top:8px}
    #${SECTION_ID} .kcp-card h4,#${SECTION_ID} .kcp-row h4{margin:0 0 7px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .kcp-card p,#${SECTION_ID} .kcp-row p{margin:6px 0;font-size:12px;line-height:1.5;color:#c3d3df}
    #${SECTION_ID} .kcp-stat{font-size:21px;font-weight:900;color:#f8fbff;margin:7px 0}
    #${SECTION_ID} .kcp-meter{height:7px;background:#1b3447;border-radius:8px;overflow:hidden;margin:7px 0 10px}
    #${SECTION_ID} .kcp-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} button,#${SECTION_ID} select{min-height:44px;max-width:100%;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kcp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
    #${SECTION_ID} .kcp-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .kcp-field{display:grid;gap:6px;margin:9px 0;font-size:12px;color:#c3d3df}
    #${SECTION_ID} .kcp-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .kcp-notice[data-state="error"]{color:#ffb4aa}
    @media(max-width:520px){#${SECTION_ID} .kcp-grid{grid-template-columns:1fr}#${SECTION_ID} .kcp-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .kcp-actions button{width:100%}}
  `;
  document.head.append(style);
}
function addText(parent, tag, text, className = '') {
  const node = document.createElement(tag); if (className) node.className = className; node.textContent = String(text ?? ''); parent.append(node); return node;
}
function button(label, action, disabled = false, primary = false) {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.dataset.kcpAction = action; node.disabled = Boolean(disabled); if (primary) node.classList.add('kcp-primary'); return node;
}
function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID); if (section) return section;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">WORKPLACE WELLBEING · PERFORMANCE · CAREER GROWTH</h3>
    <p class="kcp-note">Reflect on completed workdays, manage stress, and review progress over time. This is a fictional career-development tool: it does not alter the employer's job record, salary band, payroll, or wallet. Performance scores are self-reflections, not a real employer assessment.</p>
    <div class="kcp-grid">
      <article class="kcp-card"><h4>Work & wellbeing</h4><p id="kcp-role" class="kcp-note">No active accepted job</p><p class="kcp-stat" id="kcp-stress">Stress 12/100</p><div class="kcp-meter" aria-hidden="true"><i id="kcp-stress-meter" style="width:12%"></i></div><p class="kcp-stat" id="kcp-wellbeing">Wellbeing 76/100</p><div class="kcp-meter" aria-hidden="true"><i id="kcp-wellbeing-meter" style="width:76%"></i></div><p id="kcp-growth-title" class="kcp-note"></p></article>
      <article class="kcp-card"><h4>Latest review</h4><p class="kcp-stat" id="kcp-review-score">No review yet</p><p id="kcp-review-summary" class="kcp-note"></p><p id="kcp-review-window" class="kcp-note"></p><div class="kcp-actions"><button id="kcp-review" type="button" class="kcp-primary" data-kcp-action="review">RUN PERFORMANCE REVIEW</button></div></article>
    </div>
    <article class="kcp-card"><h4>Record today's work reflection</h4><p id="kcp-attendance-note" class="kcp-note"></p>
      <label class="kcp-field" for="kcp-behaviour">One work behaviour you practised<select id="kcp-behaviour"></select></label>
      <label class="kcp-field" for="kcp-challenge">A challenge or honest response<select id="kcp-challenge"></select></label>
      <div class="kcp-actions"><button id="kcp-save-reflection" class="kcp-primary" type="button" data-kcp-action="reflection">SAVE WORK REFLECTION</button></div>
    </article>
    <article class="kcp-card"><h4>Recover and protect work-life balance</h4><p class="kcp-note">Choose one recovery activity per in-game day while off shift. These choices change the simulation's stress and wellbeing indicators; they do not buy a medical treatment or alter attendance.</p><div id="kcp-recovery-actions" class="kcp-actions"></div><p id="kcp-recovery-note" class="kcp-note"></p></article>
    <h4 class="klc-section-title">REVIEW HISTORY</h4><div id="kcp-review-history"></div>
    <h4 class="klc-section-title">RECENT WORK & RECOVERY</h4><div id="kcp-history"></div>
    <div class="kcp-actions"><button type="button" data-kcp-action="export">EXPORT CAREER GROWTH REPORT (.JSON)</button></div>
    <p id="kcp-notice" class="kcp-notice" role="status" aria-live="polite"></p>`;
  const anchor = el('kes-section') || el('kano-employment-schedule') || el('kano-employment-market') || el('kano-skills-pathways');
  if (anchor) anchor.after(section); else host.append(section);
  const behaviourSelect = el('kcp-behaviour');
  for (const item of WORKPLACE_BEHAVIOURS) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; behaviourSelect.append(option); }
  const challengeSelect = el('kcp-challenge');
  for (const item of WORKPLACE_CHALLENGES) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; challengeSelect.append(option); }
  section.addEventListener('click', event => {
    const target = event.target.closest('button[data-kcp-action]'); if (!target || !section.contains(target)) return;
    const action = target.dataset.kcpAction;
    if (action === 'reflection') handleReflection();
    else if (action === 'review') handleReview();
    else if (action.startsWith('recover:')) handleRecovery(action.slice('recover:'.length));
    else if (action === 'export') exportReport();
  });
  return section;
}
function syncEmployment(ctx) {
  const result = syncCareerEmployment(state, { employment: ctx.employment, day: ctx.day });
  if (result.ok && result.changed) {
    if (persistState(result.state)) state = normalizeCareerProgressionState(result.state);
  } else if (result.ok && ctx.day > state.lastSeenDay) {
    const next = { ...state, lastSeenDay: ctx.day };
    if (persistState(next)) state = normalizeCareerProgressionState(next);
  }
}
function reviewWindowStart() { return state.lastReviewDay ? state.lastReviewDay + 1 : state.acceptedDay + 1; }
function handleReflection() {
  const ctx = context();
  const result = recordWorkplaceReflection(state, {
    day: ctx.day, jobId: ctx.job?.id || '', employmentActive: ctx.employment?.status === 'active',
    attendanceStatus: ctx.todayAttendance?.status || '', activeShift: ctx.activeShift,
    behaviour: el('kcp-behaviour')?.value || 'prepared', challenge: el('kcp-challenge')?.value || 'none',
    workPattern: ctx.workPattern,
  });
  commit(result);
}
function handleRecovery(actionId) {
  const ctx = context();
  const result = recoverFromWork(state, { day: ctx.day, jobId: ctx.job?.id || '', employmentActive: ctx.employment?.status === 'active', activeShift: ctx.activeShift, actionId });
  commit(result);
}
function handleReview() {
  const ctx = context();
  const result = createCareerPerformanceReview(state, {
    day: ctx.day, jobId: ctx.job?.id || '', employmentActive: ctx.employment?.status === 'active',
    acceptedDay: ctx.employment?.acceptedDay ?? state.acceptedDay, activeShift: ctx.activeShift,
    attendance: ctx.attendance, daysPerWeek: ctx.job ? scheduleForJob(ctx.job.id).daysPerWeek : 5,
  });
  const messages = {
    active_shift: 'Finish or safely stop the driving shift first.', not_employed: 'Accept a simulated job offer before opening an employment review.',
    clock_rollback: 'The saved career record is ahead of the in-game clock. No change was saved.', review_too_early: 'The first review becomes available after seven in-game days in the role.',
    review_cooldown: 'A new review is available after another seven in-game days.', insufficient_evidence: `Record at least three completed workday reflections in the current review window. ${result.count || 0}/3 recorded.`,
  };
  if (!result.ok) { notify(messages[result.reason] || 'The performance review could not be saved.', true); render(); return; }
  commit(result, result.message);
}
function commit(result, successMessage = '') {
  if (!result?.ok) {
    const messages = { active_shift: 'Finish or safely stop the driving shift first.', not_employed: 'Accept a simulated job offer before using this panel.',
      clock_rollback: 'The saved career record is ahead of the in-game clock. No change was saved.', attendance_required: 'Record a worked day in Employment Schedule before saving a reflection.',
      already_recorded: 'A reflection is already saved for this workday.', invalid_choice: 'Choose one of the available reflection options.', already_recovered: 'A recovery activity has already been recorded today.' };
    notify(messages[result?.reason] || successMessage || 'No career-progress change was saved.', true); render(); return;
  }
  if (!persistState(result.state)) { notify('Browser storage is unavailable. No career change was committed.', true); render(); return; }
  state = normalizeCareerProgressionState(result.state);
  window.dispatchEvent(new CustomEvent('kano:career-progression-updated', { detail: { day: context().day } }));
  context().ui?.__kanoLifeCareerRefresh?.();
  notify(successMessage || result.message || 'Career progress saved.'); render();
}
function renderReflection(ctx) {
  const note = el('kcp-attendance-note'); const saveButton = el('kcp-save-reflection');
  const attendance = ctx.todayAttendance;
  if (!ctx.employment || ctx.employment.status !== 'active' || !ctx.job) {
    if (note) note.textContent = 'No active accepted job. Accept a job offer before recording workplace reflections.';
    if (saveButton) saveButton.disabled = true;
    return;
  }
  if (note) note.textContent = attendance?.status === 'worked'
    ? `Day ${ctx.day}: completed workday recorded for ${ctx.job.title}. Save one reflection for today; this does not change pay or attendance.`
    : `Day ${ctx.day}: record a completed workday in Employment Schedule first. Current attendance: ${attendance?.status || 'not yet recorded'}.`;
  if (saveButton) saveButton.disabled = ctx.activeShift || ctx.clockRollback || attendance?.status !== 'worked'
    || state.workLogs.some(row => row.jobId === ctx.job.id && row.day === ctx.day);
  if (ctx.activeShift && saveButton) saveButton.title = 'Finish or safely stop driving before using workplace tools.';
}
function renderReview(ctx, report) {
  const score = el('kcp-review-score'); const summary = el('kcp-review-summary'); const windowNote = el('kcp-review-window'); const buttonNode = el('kcp-review');
  const review = report.latestReview;
  if (score) score.textContent = review ? `${review.score}/100 · ${review.grade.replaceAll('_', ' ')}` : 'No review yet';
  if (summary) summary.textContent = review
    ? `${review.reflections} work reflections · work score ${review.averageWorkScore}/100 · recorded attendance ${review.attendanceRate}% · last reviewed on day ${review.day}. This indicates growth readiness; it is not an automatic promotion or pay rise.`
    : 'A review requires at least three reflections linked to recorded workdays and a minimum of seven in-game days in the role.';
  const start = reviewWindowStart();
  const evidenceCount = state.workLogs.filter(row => row.jobId === ctx.job?.id && row.day >= start && row.day <= ctx.day).length;
  const firstDue = ctx.day >= (Number(ctx.employment?.acceptedDay ?? state.acceptedDay) + 6);
  const cooldown = state.lastReviewDay ? ctx.day >= state.lastReviewDay + 7 : firstDue;
  if (windowNote) windowNote.textContent = `Current review window: days ${start}–${ctx.day} · ${evidenceCount}/3 minimum reflections · review ${cooldown ? 'available to assess' : 'not due yet'}.`;
  if (buttonNode) {
    buttonNode.disabled = !ctx.job || ctx.employment?.status !== 'active' || ctx.activeShift || ctx.clockRollback || !firstDue || !cooldown || evidenceCount < 3;
    buttonNode.title = ctx.activeShift ? 'Finish or safely stop the driving shift first.' : evidenceCount < 3 ? 'Complete at least three workday reflections in the review window.' : !cooldown ? 'Wait for the next seven-day review window.' : '';
  }
}
function renderRecovery(ctx) {
  const host = el('kcp-recovery-actions'); if (!host) return; host.replaceChildren();
  const used = state.lastRecoveryDay === ctx.day;
  for (const action of RECOVERY_ACTIONS) {
    const node = button(`${action.label} · stress ${action.stress}`, `recover:${action.id}`, !ctx.job || ctx.employment?.status !== 'active' || ctx.activeShift || ctx.clockRollback || used);
    node.title = used ? 'One recovery activity is allowed per in-game day.' : ctx.activeShift ? 'Finish or safely stop driving first.' : action.note;
    host.append(node);
  }
  const note = el('kcp-recovery-note');
  if (note) note.textContent = used ? `Recovery already recorded for day ${ctx.day}.` : 'Rest and social support can improve the simulated wellbeing meter. They do not replace professional healthcare.';
}
function renderHistory() {
  const reviewHost = el('kcp-review-history'); const host = el('kcp-history');
  if (reviewHost) {
    reviewHost.replaceChildren();
    const rows = state.reviews.slice(-6).reverse();
    if (!rows.length) addText(reviewHost, 'p', 'No performance reviews recorded yet.', 'kcp-note');
    for (const row of rows) { const card = document.createElement('article'); card.className = 'kcp-row'; addText(card, 'h4', `Day ${row.day} · ${row.score}/100 · ${row.grade.replaceAll('_', ' ')}`); addText(card, 'p', `Days ${row.startDay}–${row.endDay} · ${row.reflections} reflection(s) · attendance ${row.attendanceRate}%.`); reviewHost.append(card); }
  }
  if (host) {
    host.replaceChildren();
    const rows = state.history.slice(-8).reverse();
    if (!rows.length) addText(host, 'p', 'No workplace reflections or recovery activity yet.', 'kcp-note');
    for (const row of rows) addText(host, 'p', `Day ${row.day} · ${row.text}`, 'kcp-note');
  }
}
function render() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (!document.querySelector('#kano-life-career-screen .klc-panel')) return;
  let ctx = context(); syncEmployment(ctx); ctx = context();
  const section = ensureSection(); if (!section) return;
  const report = careerProgressionReport(state, { day: ctx.day, employment: ctx.employment, job: ctx.job });
  const role = el('kcp-role'); if (role) role.textContent = ctx.employment?.status === 'active' && ctx.job ? `${ctx.job.title} · accepted day ${ctx.employment.acceptedDay}` : 'No active accepted job';
  const stress = el('kcp-stress'); if (stress) stress.textContent = `Stress ${report.stress}/100`;
  const stressMeter = el('kcp-stress-meter'); if (stressMeter) stressMeter.style.width = `${report.stress}%`;
  const wellbeing = el('kcp-wellbeing'); if (wellbeing) wellbeing.textContent = `Wellbeing ${report.wellbeing}/100`;
  const wellbeingMeter = el('kcp-wellbeing-meter'); if (wellbeingMeter) wellbeingMeter.style.width = `${report.wellbeing}%`;
  const title = el('kcp-growth-title'); if (title) title.textContent = `${report.growthTitle} · ${report.experiencePoints} growth points · ${report.workdayCount} recorded work reflection(s).`;
  renderReview(ctx, report); renderReflection(ctx); renderRecovery(ctx); renderHistory();
  const noticeNode = el('kcp-notice'); if (noticeNode) { noticeNode.textContent = notice; noticeNode.dataset.state = noticeError || ctx.clockRollback ? 'error' : 'ok'; }
  if (ctx.clockRollback && noticeNode && !notice) noticeNode.textContent = 'The in-game day is earlier than the saved career record. Changes are paused until the clock catches up.';
}
function exportReport() {
  const ctx = context(); const payload = exportCareerProgressionReport(state, { day: ctx.day, employment: ctx.employment, job: ctx.job });
  const blob = new Blob([payload], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `kano-life-career-growth-day-${ctx.day}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Career growth report exported.');
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true; installStyles(); render();
  if (document.documentElement && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => { if (document.querySelector('#kano-life-career-screen .klc-panel')) render(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:employment-market-updated', 'kano:employment-schedule-updated', 'kano:skills-pathways-updated', 'kano:life-shift-settled', 'kano:career-progression-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverCareerProgression = {
    version: 1,
    snapshot: () => careerProgressionReport(state, { day: context().day, employment: context().employment, job: context().job }),
    export: () => exportCareerProgressionReport(state, { day: context().day, employment: context().employment, job: context().job }),
    refresh: render,
  };
  window.setInterval(() => { if (document.querySelector('#kano-life-career-screen:not(.hidden)')) render(); }, 15000);
  console.info('[Kano Life] Workplace wellbeing, performance reviews and career growth registered.');
}
install();
