/** Step 67 runtime panel: job attendance, work-life choices, and idempotent weekly payroll. */
import './KanoNorthernDriverEmploymentMarketUpgrade.js';
import { save, persist } from './storage.js';
import { EMPLOYMENT_MARKET_STORAGE_KEY, EMPLOYMENT_OPENINGS } from './KanoNorthernDriverEmploymentMarket.js';
import {
  EMPLOYMENT_SCHEDULE_STORAGE_KEY, createDefaultEmploymentScheduleState,
  normalizeEmploymentScheduleState, advanceEmploymentScheduleState,
  recordEmploymentAttendance, markPayrollPaid, employmentScheduleReport,
  exportEmploymentScheduleReport, isScheduledWorkday, estimateDailyWage,
} from './KanoNorthernDriverEmploymentSchedule.js';

const SECTION_ID = 'kano-employment-schedule';
const STYLE_ID = 'kes-style';
const INSTALL_KEY = Symbol.for('kano.life.employmentSchedule.installed.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const clean = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 220);
let state = loadState();
let notice = '';
let noticeError = false;

function safeRead(key, fallback) {
  try { const raw = globalThis.localStorage?.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function loadState() { return normalizeEmploymentScheduleState(safeRead(EMPLOYMENT_SCHEDULE_STORAGE_KEY, createDefaultEmploymentScheduleState())); }
function persistState(next) {
  try { if (!globalThis.localStorage) return false; globalThis.localStorage.setItem(EMPLOYMENT_SCHEDULE_STORAGE_KEY, JSON.stringify(normalizeEmploymentScheduleState(next))); return true; }
  catch { return false; }
}
function employmentState() { return safeRead(EMPLOYMENT_MARKET_STORAGE_KEY, {}); }
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1;
  const parsed = Number(rawDay);
  const day = Math.max(1, Math.floor(Number.isFinite(parsed) ? parsed : 1));
  const emState = employmentState();
  const employment = emState.employment && typeof emState.employment === 'object' ? emState.employment : null;
  const job = employment ? EMPLOYMENT_OPENINGS.find(row => row.id === employment.jobId) || null : null;
  return { ui, game, day, activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))), employment, job };
}
function notify(message, error = false) {
  notice = clean(message); noticeError = Boolean(error);
  const node = el('kes-notice');
  if (node) { node.textContent = notice; node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kes-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kes-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kes-card,#${SECTION_ID} .kes-row{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere;margin-top:8px}
    #${SECTION_ID} .kes-card h4,#${SECTION_ID} .kes-row h4{margin:0 0 7px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .kes-card p,#${SECTION_ID} .kes-row p{margin:6px 0;font-size:12px;line-height:1.5;color:#c3d3df}
    #${SECTION_ID} .kes-stat{font-size:22px;font-weight:900;color:#f8fbff;margin:7px 0}
    #${SECTION_ID} .kes-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
    #${SECTION_ID} button,#${SECTION_ID} select{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kes-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .kes-tag{display:inline-block;border:1px solid #46657a;border-radius:999px;padding:3px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
    #${SECTION_ID} .kes-ledger{display:grid;gap:6px;margin-top:8px}
    #${SECTION_ID} .kes-row{margin-top:6px}
    @media(max-width:520px){#${SECTION_ID} .kes-grid{grid-template-columns:1fr}#${SECTION_ID} .kes-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .kes-actions button{width:100%}}
  `;
  document.head.append(style);
}
function addText(parent, tag, text, cls = '') { const node = document.createElement(tag); if (cls) node.className = cls; node.textContent = String(text ?? ''); parent.append(node); return node; }
function button(label, attrs = {}, disabled = false, primary = false) {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.disabled = Boolean(disabled); if (primary) node.classList.add('kes-primary');
  for (const [key, value] of Object.entries(attrs)) node.dataset[key] = String(value);
  return node;
}
function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel'); if (!host) return null;
  let section = el(SECTION_ID); if (section) return section;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">EMPLOYMENT SHIFT · ATTENDANCE · PAYROLL</h3>
    <p class="kes-note">Fictional employment roleplay. The listed salaries come from the game's simulated job-board ranges, not real payroll data. Only completed scheduled workdays earn simulated pay. Keke-run income remains governed by the existing game settlement.</p>
    <div class="kes-grid"><article class="kes-card"><h4>Current role</h4><p id="kes-role" class="kes-stat">No active role</p><p id="kes-role-meta" class="kes-note"></p></article><article class="kes-card"><h4>Next payday / earned</h4><p id="kes-payday" class="kes-stat">—</p><p id="kes-earned" class="kes-note"></p></article></div>
    <div class="kes-row"><h4>Work-life approach</h4><p class="kes-note">Choose how you plan to balance paid work and keke driving. This records your preference; it does not block the existing driving game.</p><label for="kes-pattern">Preferred balance</label><select id="kes-pattern"><option value="balanced">Balanced: job plus keke when time allows</option><option value="protect_job">Protect the job: prioritise attendance</option><option value="family_evening">Family-first evenings: make room for home after work</option></select></div>
    <div id="kes-today" class="kes-row"><h4>Today's work</h4><p class="kes-note">No schedule loaded.</p><div class="kes-actions" id="kes-today-actions"></div></div>
    <h4 class="klc-section-title">PAYROLL HISTORY</h4><div id="kes-payroll" class="kes-ledger"></div>
    <h4 class="klc-section-title">ATTENDANCE & LEAVE</h4><div id="kes-history" class="kes-ledger"></div>
    <div class="kes-actions"><button type="button" data-kes-action="export">EXPORT EMPLOYMENT REPORT (.JSON)</button></div><p id="kes-notice" class="kem-notice" role="status" aria-live="polite"></p>`;
  const anchor = el('kano-employment-market') || el('kano-skills-pathways') || el('kano-digital-life');
  if (anchor) anchor.after(section); else host.append(section);
  section.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target || !section.contains(target) || target.disabled) return;
    const ctx = context();
    if (target.dataset.kesAttendance) recordAttendance(target.dataset.kesAttendance);
    else if (target.dataset.kesAction === 'export') exportReport();
    else if (target.dataset.kesAction === 'market') el('kano-employment-market')?.scrollIntoView({ block: 'start', behavior: 'auto' });
    else if (target.dataset.kesLeave) recordAttendance(target.dataset.kesLeave);
  });
  const pattern = el('kes-pattern');
  pattern?.addEventListener('change', () => {
    state = normalizeEmploymentScheduleState({ ...state, workPattern: pattern.value }, context());
    if (!persistState(state)) { notify('Browser storage is unavailable. Work-life preference was not saved.', true); return; }
    notify('Work-life preference saved. This does not restrict driving or guarantee salary.'); render();
  });
  return section;
}
function processPayroll(ctx) {
  const { employment, job, day } = ctx;
  if (!employment || !['active', 'left'].includes(String(employment.status)) || !job) return;
  const advanced = advanceEmploymentScheduleState(state, { employment, job, day });
  if (!advanced.ok) { notice = 'Saved work history is ahead of the current game clock. Payroll changes are paused.'; noticeError = true; return; }
  state = advanced.state;
  // Persist the pending payroll cycle before updating the shared wallet. The receipt
  // stored inside the core save makes retries idempotent if the UI reloads mid-payday.
  if (!persistState(state)) { notice = 'Browser storage is unavailable. Payroll has not been credited.'; noticeError = true; return; }
  const hadReceiptValue = Object.prototype.hasOwnProperty.call(save, 'kanoEmploymentPayrollReceipts');
  const previousReceiptValue = save.kanoEmploymentPayrollReceipts;
  const receipts = Array.isArray(previousReceiptValue) ? previousReceiptValue.slice(-120) : [];
  for (const payroll of state.payroll.filter(row => row.status === 'due' && row.dueDay <= day)) {
    if (receipts.some(receipt => receipt?.id === payroll.id)) {
      const marked = markPayrollPaid(state, payroll.id, { day });
      if (marked.ok) {
        state = marked.state;
        if (!persistState(state)) { notice = 'The existing payday receipt prevents duplicate credit, but payroll history could not be refreshed. Storage will retry on the next update.'; noticeError = true; }
      }
      continue;
    }
    // A zero-pay cycle is still closed exactly once; absences must not create money.
    if (payroll.grossPay > 0) {
      const previousMoney = Math.max(0, Math.floor(Number(save.money) || 0));
      save.money = previousMoney + payroll.grossPay;
      const nextReceipts = [...receipts, { id: payroll.id, amount: payroll.grossPay, day, jobId: employment.jobId }].slice(-120);
      save.kanoEmploymentPayrollReceipts = nextReceipts;
      let walletAndReceiptSaved = false;
      let saveFailureReason = 'The wallet storage layer reported that saving did not complete.';
      try {
        walletAndReceiptSaved = persist() === true;
      } catch (error) {
        saveFailureReason = clean(error?.message || error);
      }
      if (!walletAndReceiptSaved) {
        save.money = previousMoney;
        if (hadReceiptValue) save.kanoEmploymentPayrollReceipts = previousReceiptValue;
        else delete save.kanoEmploymentPayrollReceipts;
        notice = `Payroll was not credited because the wallet could not be saved: ${saveFailureReason}`;
        noticeError = true;
        break;
      }
      receipts.splice(0, receipts.length, ...nextReceipts);
      ctx.ui?.refreshWallet?.();
      ctx.ui?.__kanoLifeCareerRefresh?.();
      ctx.ui?.toast?.(`PAYDAY · ${money(payroll.grossPay)} credited for ${payroll.workedDays} attended workday(s).`);
      window.dispatchEvent(new CustomEvent('kano:employment-payday', { detail: { day, amount: payroll.grossPay, payrollId: payroll.id, jobId: employment.jobId } }));
    }
    const marked = markPayrollPaid(state, payroll.id, { day });
    if (marked.ok) state = marked.state;
    if (!persistState(state)) { notice = 'Wallet payday was recorded. Payroll history will reconcile on the next refresh.'; noticeError = true; }
  }
}
function recordAttendance(status) {
  const ctx = context();
  if (!ctx.job || ctx.employment?.status !== 'active') { notify('Accept a simulated job offer before recording work attendance.', true); return; }
  if (ctx.activeShift) { notify('Finish the driving shift before handling employment records.', true); render(); return; }
  const result = recordEmploymentAttendance(state, { employment: ctx.employment, job: ctx.job, day: ctx.day, activeShift: ctx.activeShift, status });
  if (!result.ok) {
    const messages = {
      active_shift: 'Finish or safely stop the driving shift first.', not_employed: 'There is no active accepted role.', next_day_required: 'Your first workday is available on the day after accepting the offer.',
      rest_day: 'Today is a scheduled rest day for this role.', already_recorded: 'Attendance or leave has already been recorded for today.',
      invalid_attendance_status: 'Choose a valid attendance result.', clock_rollback: 'The saved work record is ahead of the game clock.',
    };
    notify(messages[result.reason] || 'Work attendance was not saved.', true); render(); return;
  }
  if (!persistState(result.state)) { notify('Browser storage is unavailable. Attendance was not committed.', true); render(); return; }
  state = result.state;
  window.dispatchEvent(new CustomEvent('kano:employment-schedule-updated', { detail: { day: ctx.day, status } }));
  ctx.ui?.__kanoLifeCareerRefresh?.(); notify(result.message); render();
}
function renderToday(ctx, report) {
  const host = el('kes-today'); const actions = el('kes-today-actions'); if (!host || !actions) return;
  actions.replaceChildren();
  const existing = report.attendance.find(row => row.day === ctx.day && row.jobId === ctx.job?.id);
  const text = host.querySelector('p');
  const title = host.querySelector('h4');
  if (!ctx.employment || ctx.employment.status !== 'active' || !ctx.job) {
    if (title) title.textContent = 'Today’s work';
    if (text) text.textContent = 'No active accepted job. Use the Career Market panel to apply, complete interviews and accept an offer. Nothing is paid automatically until a job and workdays are recorded.';
    actions.append(button('OPEN CAREER MARKET', { kesAction: 'market' }, false));
    return;
  }
  const workday = isScheduledWorkday(ctx.job.id, ctx.day) && ctx.day > Number(ctx.employment.acceptedDay || 0);
  if (title) title.textContent = `Day ${ctx.day} · ${workday ? 'Scheduled workday' : 'Rest / onboarding day'}`;
  if (text) text.textContent = existing
    ? (existing.status === 'worked' ? `Attendance recorded: ${existing.hours}-hour workday. This date cannot be claimed again.` : `${existing.status.replaceAll('_', ' ')} recorded. It is unpaid in this simulation.`)
    : workday ? `The role schedules ${ctx.job.title} today. Complete one workday or record an unpaid family/health day. A single date cannot be paid twice.`
      : `Today is not a scheduled paid day for ${ctx.job.title}, or it is the offer-acceptance day. The rest-day calendar repeats every seven game days.`;
  if (workday && !existing) {
    actions.append(button('CLOCK IN · COMPLETE WORKDAY', { kesAttendance: 'worked' }, ctx.activeShift, true));
    actions.append(button('TAKE UNPAID FAMILY DAY', { kesLeave: 'family_leave' }, ctx.activeShift));
    actions.append(button('TAKE UNPAID HEALTH DAY', { kesLeave: 'health_leave' }, ctx.activeShift));
  }
  const marketButton = button('VIEW JOB APPLICATIONS & OFFERS', {}, false);
  marketButton.addEventListener('click', () => el('kano-employment-market')?.scrollIntoView({ block: 'start', behavior: 'auto' }));
  actions.append(marketButton);
}
function render() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const section = ensureSection(); if (!section) return;
  const ctx = context();
  processPayroll(ctx);
  const refreshed = context();
  const report = employmentScheduleReport(state, { employment: refreshed.employment, job: refreshed.job, day: refreshed.day });
  const role = el('kes-role'); const meta = el('kes-role-meta'); const payday = el('kes-payday'); const earned = el('kes-earned');
  if (role) role.textContent = refreshed.employment?.status === 'active' && refreshed.job ? refreshed.job.title : 'No active role';
  if (meta) meta.textContent = refreshed.employment?.status === 'active' && refreshed.job
    ? `${refreshed.employment.employer} · accepted on day ${refreshed.employment.acceptedDay} · ${report.schedule.daysPerWeek} scheduled days/week · illustrative monthly range ${money(refreshed.job.salaryMin)}–${money(refreshed.job.salaryMax)}`
    : 'Open the Career Market panel to accept a simulated job offer. Job names and pay ranges are fictional.';
  const nextDue = state.payroll.find(row => row.status === 'due');
  if (payday) payday.textContent = refreshed.employment?.status === 'active' && refreshed.job
    ? nextDue ? `Day ${nextDue.dueDay}` : `After first 7-day cycle`
    : '—';
  if (earned) earned.textContent = `Wallet ${money(save.money)} · paid salary ${money(report.paidSalaryTotal)} · due ${money(report.dueSalaryTotal)} · ${report.workedDays} workday(s) logged · ${report.leaveDays} unpaid leave day(s)`;
  const pattern = el('kes-pattern'); if (pattern && pattern.value !== state.workPattern) pattern.value = state.workPattern;
  renderToday(refreshed, report); renderPayroll(report); renderAttendance(report);
  const note = el('kes-notice'); if (note) { note.textContent = notice; note.dataset.state = noticeError ? 'error' : 'ok'; }
}
function renderPayroll(report) {
  const host = el('kes-payroll'); if (!host) return; host.replaceChildren();
  const rows = [...report.payroll].reverse().slice(0, 8);
  if (!rows.length) { addText(host, 'p', 'No weekly payroll cycle yet. Log scheduled workdays after accepting an offer.', 'kes-note'); return; }
  for (const row of rows) {
    const card = document.createElement('article'); card.className = 'kes-row';
    addText(card, 'h4', `Week ${row.cycle} · ${row.status.replaceAll('_', ' ')}`);
    addText(card, 'p', `Days ${row.startDay}–${row.endDay} · ${row.workedDays} attended shift(s) · ${money(row.grossPay)}${row.grossPay === 0 ? ' (no attendance earned pay)' : ''}`, 'kes-note'); host.append(card);
  }
}
function renderAttendance(report) {
  const host = el('kes-history'); if (!host) return; host.replaceChildren();
  const rows = [...report.attendance].reverse().slice(0, 8);
  if (!rows.length) { addText(host, 'p', 'No attendance or leave recorded yet.', 'kes-note'); return; }
  for (const row of rows) {
    const card = document.createElement('article'); card.className = 'kes-row';
    addText(card, 'h4', `Day ${row.day} · ${row.status.replaceAll('_', ' ')}`);
    addText(card, 'p', `${row.hours} hours · ${row.note}`, 'kes-note'); host.append(card);
  }
}
function exportReport() {
  const ctx = context(); const payload = exportEmploymentScheduleReport(state, { employment: ctx.employment, job: ctx.job, day: ctx.day });
  const blob = new Blob([payload], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `kano-life-employment-schedule-day-${ctx.day}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Employment attendance and payroll report exported.');
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true; installStyles(); render();
  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    const observer = new MutationObserver(() => { if (document.querySelector('#kano-life-career-screen .klc-panel')) render(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:employment-market-updated', 'kano:skills-pathways-updated', 'kano:employment-schedule-updated', 'kano:life-shift-settled']) window.addEventListener(type, render);
  window.kanoNorthernDriverEmploymentSchedule = {
    version: 1,
    snapshot: () => employmentScheduleReport(state, { employment: context().employment, job: context().job, day: context().day }),
    export: () => exportEmploymentScheduleReport(state, { employment: context().employment, job: context().job, day: context().day }),
    refresh: render,
  };
  window.setInterval(() => { if (document.querySelector('#kano-life-career-screen:not(.hidden)')) render(); }, 15000);
  console.info('[Kano Life] Employment attendance and weekly payroll registered.');
}
install();
