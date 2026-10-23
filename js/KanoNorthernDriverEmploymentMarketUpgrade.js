/** Step 66 runtime UI: simulated Kano job board, interviews, offers, and career transitions. */
import {
  EMPLOYMENT_MARKET_STORAGE_KEY, EMPLOYMENT_OPENINGS, INTERVIEW_QUESTIONS,
  createDefaultEmploymentMarketState, normalizeEmploymentMarketState,
  careerReadiness, openingEligibility, advanceEmploymentMarketState, applyForOpening,
  submitInterviewAnswer, respondToOffer, leaveEmployment, exportEmploymentMarketReport,
} from './KanoNorthernDriverEmploymentMarket.js';
import { SKILLS_STORAGE_KEY, normalizeSkillsState, createDefaultSkillsState } from './KanoNorthernDriverSkillsPathways.js';

const SECTION_ID = 'kano-employment-market';
const STYLE_ID = 'kem-style';
const INSTALL_KEY = Symbol.for('kano.life.employmentMarket.installed.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const clean = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 220);
let state = loadState();
let notice = '';
let noticeError = false;

function safeRead(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function loadState() { return normalizeEmploymentMarketState(safeRead(EMPLOYMENT_MARKET_STORAGE_KEY, createDefaultEmploymentMarketState())); }
function persist(next) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(EMPLOYMENT_MARKET_STORAGE_KEY, JSON.stringify(normalizeEmploymentMarketState(next)));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const societyDay = window.kanoNorthernDriverSocietyMarkets?.snapshot?.().day;
  const lifeDay = window.kanoNorthernDriverLifeSimulation?.snapshot?.().day;
  const social = window.kanoNorthernDriverRealLife?.snapshot?.() || {};
  const digital = window.kanoNorthernDriverDigitalLife?.snapshot?.() || {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? societyDay ?? lifeDay ?? 1;
  const safeDay = Number(rawDay);
  const day = Math.max(1, Math.floor(Number.isFinite(safeDay) ? safeDay : 1));
  const skillsRaw = safeRead(SKILLS_STORAGE_KEY, createDefaultSkillsState({ day }));
  const skills = normalizeSkillsState(skillsRaw);
  const meters = social.meters || social;
  const certs = skills.certificates;
  const digitalReputation = Number(digital.digitalReputation ?? digital.reputation ?? 50);
  const passengerTrust = Number(meters.passengerRespect ?? meters.passengerTrust ?? 50);
  const communityTrust = Number(meters.communityTrust ?? 50);
  const readiness = careerReadiness({ certificates: certs, digitalReputation, passengerTrust, communityTrust });
  return {
    ui, game, day,
    activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))),
    skills, certificates: certs, readiness,
    digitalReputation, passengerTrust, communityTrust,
  };
}
function notify(message, error = false) {
  notice = clean(message); noticeError = Boolean(error);
  const node = el('kem-notice');
  if (node) { node.textContent = notice; node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kem-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kem-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kem-card,#${SECTION_ID} .kem-row{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere;margin-top:8px}
    #${SECTION_ID} .kem-card h4,#${SECTION_ID} .kem-row h4{margin:0 0 7px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .kem-card p,#${SECTION_ID} .kem-row p{margin:6px 0;font-size:12px;line-height:1.5;color:#c3d3df}
    #${SECTION_ID} .kem-stat{font-size:22px;font-weight:900;color:#f8fbff;margin:7px 0}
    #${SECTION_ID} .kem-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
    #${SECTION_ID} button{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kem-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .kem-tag{display:inline-block;border:1px solid #46657a;border-radius:999px;padding:3px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
    #${SECTION_ID} .kem-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .kem-notice[data-state="error"]{color:#ffb4aa}
    @media(max-width:520px){#${SECTION_ID} .kem-grid{grid-template-columns:1fr}#${SECTION_ID} .kem-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .kem-actions button{width:100%}}
  `;
  document.head.append(style);
}
function addText(parent, tag, text, cls = '') {
  const node = document.createElement(tag); if (cls) node.className = cls; node.textContent = String(text ?? ''); parent.append(node); return node;
}
function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID); if (section) return section;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">CAREER MARKET · APPLICATIONS · INTERVIEWS</h3>
    <p class="kem-note">Fictional Kano job board for roleplay. Employers, vacancies, salaries, selection thresholds and dates are invented gameplay content, not live vacancies or current salary data. There is no application fee and no salary is added automatically.</p>
    <div class="kem-grid"><div class="kem-card"><h4>Career readiness estimate</h4><p class="kem-stat" id="kem-readiness">25/100</p><p id="kem-summary" class="kem-note"></p></div><div class="kem-card"><h4>Current employment</h4><p id="kem-employment" class="kem-note">No accepted role recorded.</p><div class="kem-actions" id="kem-employment-actions"></div></div></div>
    <h4 class="klc-section-title">Openings across Kano</h4><div id="kem-openings"></div>
    <h4 class="klc-section-title">Your applications and interviews</h4><div id="kem-applications"></div>
    <h4 class="klc-section-title">Recent career history</h4><div id="kem-history"></div>
    <div class="kem-actions"><button type="button" data-kem-action="export">EXPORT CAREER REPORT (.JSON)</button></div>
    <p id="kem-notice" class="kem-notice" role="status" aria-live="polite"></p>`;
  const anchor = el('kano-skills-pathways') || el('kano-digital-life') || el('kano-family-responsibilities') || el('kano-aure-culture');
  if (anchor) anchor.after(section); else host.append(section);
  section.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !section.contains(button) || button.disabled) return;
    if (button.dataset.kemApply) apply(button.dataset.kemApply);
    else if (button.dataset.kemAnswer) answer(button.dataset.kemApplication, button.dataset.kemAnswer);
    else if (button.dataset.kemOffer) offer(button.dataset.kemApplication, button.dataset.kemOffer);
    else if (button.dataset.kemAction === 'leave') leave();
    else if (button.dataset.kemAction === 'export') exportReport();
  });
  return section;
}
function saveResult(result) {
  if (!result?.ok) {
    const messages = {
      active_shift: 'Finish or safely stop the driving shift first. Career actions are locked while driving.',
      clock_rollback: 'The saved career record is ahead of the current in-game clock. No change was saved.',
      invalid_job: 'That simulated opening is not available.',
      qualifications_required: 'Complete the listed training certificates before applying.',
      application_limit: 'You already have three active applications. Resolve an interview or offer first.',
      already_active: 'You already have an active application for this role.',
      retry_cooldown: 'Wait three in-game days before reapplying to this role.',
      invalid_application: 'That application could not be found.',
      interview_not_due: 'The interview is not available yet.',
      interview_complete: 'This interview is already complete.',
      invalid_answer: 'Choose one of the displayed interview responses.',
      offer_unavailable: 'There is no active offer for that application.',
      offer_expired: 'That offer has expired.',
      already_employed: 'End your current recorded role before accepting another one.',
      invalid_decision: 'Choose accept or decline.',
      not_employed: 'There is no active role to leave.',
    };
    notify(messages[result.reason] || 'The career action was not saved.', true); render(); return;
  }
  const next = normalizeEmploymentMarketState(result.state);
  if (!persist(next)) { notify('Browser storage is unavailable. No career change was committed.', true); render(); return; }
  state = next;
  window.dispatchEvent(new CustomEvent('kano:employment-market-updated', { detail: { day: context().day } }));
  context().ui?.__kanoLifeCareerRefresh?.();
  notify(result.message || 'Career record updated.'); render();
}
function apply(jobId) {
  const ctx = context();
  saveResult(applyForOpening(state, { jobId, day: ctx.day, activeShift: ctx.activeShift, certificates: ctx.certificates, readiness: ctx.readiness }));
}
function answer(applicationId, answerId) {
  const ctx = context();
  saveResult(submitInterviewAnswer(state, { applicationId, day: ctx.day, activeShift: ctx.activeShift, answerId }));
}
function offer(applicationId, decision) {
  const ctx = context();
  saveResult(respondToOffer(state, { applicationId, decision, day: ctx.day, activeShift: ctx.activeShift }));
}
function leave() {
  const ctx = context();
  saveResult(leaveEmployment(state, { day: ctx.day, activeShift: ctx.activeShift, reason: 'left by player choice' }));
}
function button(label, attrs = {}, disabled = false, primary = false) {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.disabled = disabled;
  if (primary) node.classList.add('kem-primary');
  for (const [key, value] of Object.entries(attrs)) node.dataset[key] = String(value);
  return node;
}
function jobFor(jobId) { return EMPLOYMENT_OPENINGS.find(job => job.id === jobId); }
function renderOpenings(ctx) {
  const host = el('kem-openings'); if (!host) return; host.replaceChildren();
  const activeForJob = jobId => state.applications.find(app => app.jobId === jobId && ['applied','interview_due','result_pending','offered'].includes(app.status));
  for (const job of EMPLOYMENT_OPENINGS) {
    const row = document.createElement('article'); row.className = 'kem-row';
    addText(row, 'h4', job.title);
    addText(row, 'p', `${job.employer} · ${job.location}`);
    addText(row, 'p', `Illustrative monthly range: ${money(job.salaryMin)}–${money(job.salaryMax)} · ${job.schedule}. Not real wage data.`, 'kem-note');
    addText(row, 'p', job.summary);
    addText(row, 'p', job.requiredCertificates.length ? `Required certificates: ${job.requiredCertificates.join(', ')}.` : 'Entry-level posting; no course certificate required.', 'kem-note');
    const existing = activeForJob(job.id);
    const eligibility = openingEligibility(job.id, { certificates: ctx.certificates, readiness: ctx.readiness });
    const actions = document.createElement('div'); actions.className = 'kem-actions';
    if (existing) {
      const tag = addText(actions, 'span', `Application: ${existing.status.replaceAll('_', ' ')}`, 'kem-tag');
      tag.title = `Applied day ${existing.appliedDay}; interview day ${existing.interviewDay}`;
    } else {
      const applyButton = button('APPLY · NO FEE', { kemApply: job.id }, ctx.activeShift || !eligibility.ok || state.applications.filter(app => ['applied','interview_due','result_pending','offered'].includes(app.status)).length >= 3, true);
      if (ctx.activeShift) applyButton.title = 'Career actions are locked while driving.';
      else if (!eligibility.ok) applyButton.title = `Still needed: ${eligibility.missingCertificates.join(', ')}`;
      actions.append(applyButton);
      if (!eligibility.ok) addText(row, 'p', `Complete training first: ${eligibility.missingCertificates.join(', ')}.`, 'kem-note');
      else if (ctx.readiness < job.readinessMin) addText(row, 'p', `Your readiness estimate is ${ctx.readiness}/100; this posting uses a fictional threshold of ${job.readinessMin}. You may apply, but the final outcome will reflect it.`, 'kem-note');
    }
    row.append(actions); host.append(row);
  }
}
function renderInterview(row, app, ctx) {
  const job = jobFor(app.jobId);
  const index = app.interviewAnswers.length;
  if (index >= INTERVIEW_QUESTIONS.length) return;
  const question = INTERVIEW_QUESTIONS[index];
  addText(row, 'p', `Interview ${index + 1}/${INTERVIEW_QUESTIONS.length} · ${question.prompt}`);
  const actions = document.createElement('div'); actions.className = 'kem-actions';
  for (const option of question.answers) {
    const b = button(option.label, { kemApplication: app.id, kemAnswer: option.id }, ctx.activeShift, false);
    actions.append(b);
  }
  row.append(actions);
}
function renderApplications(ctx) {
  const host = el('kem-applications'); if (!host) return; host.replaceChildren();
  if (!state.applications.length) { addText(host, 'p', 'No applications yet. Complete relevant community training, then apply off shift.', 'kem-note'); return; }
  for (const app of state.applications.slice(-8).reverse()) {
    const job = jobFor(app.jobId); if (!job) continue;
    const row = document.createElement('article'); row.className = 'kem-row';
    addText(row, 'h4', job.title);
    addText(row, 'p', `Applied day ${app.appliedDay} · ${app.status.replaceAll('_', ' ')} · interview scheduled day ${app.interviewDay}.`, 'kem-note');
    if (app.status === 'applied') addText(row, 'p', `Prepare and return on or after in-game day ${app.interviewDay}.`, 'kem-note');
    if (app.status === 'interview_due') renderInterview(row, app, ctx);
    if (app.status === 'result_pending') addText(row, 'p', `Interview recorded. Result is due on in-game day ${app.resultDay}.`, 'kem-note');
    if (app.status === 'offered') {
      addText(row, 'p', `Simulated offer expires after day ${app.offerExpiresDay}. Accepting records the role but does not add wages automatically.`, 'kem-note');
      const actions = document.createElement('div'); actions.className = 'kem-actions';
      actions.append(button('ACCEPT OFFER', { kemApplication: app.id, kemOffer: 'accept' }, ctx.activeShift || state.employment?.status === 'active', true));
      actions.append(button('DECLINE OFFER', { kemApplication: app.id, kemOffer: 'decline' }, ctx.activeShift)); row.append(actions);
    }
    if (app.status === 'not_selected') addText(row, 'p', `${app.decisionReason} You may reapply after the cooldown; this outcome is not a judgement of your real-world ability.`, 'kem-note');
    if (app.status === 'accepted') addText(row, 'p', 'You accepted this simulated role. Real wages and shifts are not automated by this feature.', 'kem-note');
    if (app.status === 'declined' || app.status === 'expired') addText(row, 'p', 'This application is closed; it did not change your wallet.', 'kem-note');
    row.append(document.createElement('div')); host.append(row);
  }
}
function renderEmployment(ctx) {
  const host = el('kem-employment'); const actions = el('kem-employment-actions');
  if (!host || !actions) return;
  actions.replaceChildren();
  if (state.employment?.status === 'active') {
    host.textContent = `${state.employment.role} · ${state.employment.employer} · accepted on day ${state.employment.acceptedDay}. This is a simulated role record; wages are not automatic.`;
    actions.append(button('MARK ROLE AS ENDED', { kemAction: 'leave' }, ctx.activeShift));
  } else if (state.employment?.status === 'left') {
    host.textContent = `Last recorded role: ${state.employment.role} · ended on day ${state.employment.endedDay}.`;
  } else {
    host.textContent = 'No accepted role recorded. You can continue keke work while exploring job opportunities.';
  }
}
function renderHistory() {
  const host = el('kem-history'); if (!host) return; host.replaceChildren();
  const rows = state.history.slice(-5).reverse();
  if (!rows.length) { addText(host, 'p', 'No career activity recorded yet.', 'kem-note'); return; }
  for (const entry of rows) addText(host, 'p', `Day ${entry.day} · ${entry.text}`, 'kem-note');
}
function render() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const section = ensureSection(); if (!section) return;
  const ctx = context();
  const advanced = advanceEmploymentMarketState(state, { day: ctx.day });
  if (advanced.ok && advanced.changed) {
    if (persist(advanced.state)) state = normalizeEmploymentMarketState(advanced.state);
  }
  const readiness = el('kem-readiness'); if (readiness) readiness.textContent = `${ctx.readiness}/100`;
  const summary = el('kem-summary'); if (summary) summary.textContent = `Day ${ctx.day} · ${ctx.certificates.length} training certificate(s) · ${ctx.activeShift ? 'Career actions locked while driving' : 'Off shift: applications and interviews available'}. This is a game estimate, not a real employer assessment.`;
  renderEmployment(ctx); renderOpenings(ctx); renderApplications(ctx); renderHistory();
  const note = el('kem-notice'); if (note) { note.textContent = notice; note.dataset.state = noticeError ? 'error' : 'ok'; }
}
function exportReport() {
  const ctx = context();
  const text = exportEmploymentMarketReport(state, { day: ctx.day, certificates: ctx.certificates, readiness: ctx.readiness });
  const blob = new Blob([text], { type: 'application/json' }); const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `kano-life-career-market-day-${ctx.day}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Career-market report exported.');
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true; installStyles(); render();
  const observer = typeof MutationObserver !== 'undefined' && document.documentElement
    ? new MutationObserver(() => { if (document.querySelector('#kano-life-career-screen .klc-panel')) render(); }) : null;
  observer?.observe(document.documentElement, { childList: true, subtree: true });
  for (const eventName of [
    'kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed',
    'kano:skills-pathways-updated', 'kano:digital-life-updated', 'kano:relationship-status-updated',
    'kano:family-responsibilities-updated', 'kano:employment-market-updated',
  ]) window.addEventListener(eventName, render);
  window.kanoNorthernDriverEmploymentMarket = {
    version: 1,
    snapshot: () => employmentMarketReportForContext(),
    export: () => exportEmploymentMarketReport(state, { day: context().day, certificates: context().certificates, readiness: context().readiness }),
    refresh: render,
  };
}
function employmentMarketReportForContext() {
  const ctx = context();
  const advanced = advanceEmploymentMarketState(state, { day: ctx.day });
  if (advanced.ok && advanced.changed && persist(advanced.state)) state = normalizeEmploymentMarketState(advanced.state);
  return {
    day: ctx.day, readiness: ctx.readiness, certificates: ctx.certificates.map(row => row.courseId),
    applications: state.applications.map(row => ({ ...row })), employment: state.employment ? { ...state.employment } : null,
    history: state.history.map(row => ({ ...row })),
  };
}
install();
console.info('[Kano Life] Simulated career market, applications and interview lifecycle registered.');
