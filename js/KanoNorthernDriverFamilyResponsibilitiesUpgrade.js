import './KanoNorthernDriverPhoneAndCommunicationUpgrade.js';
/** Runtime UI for Step 62: family commitments and unexpected life events. */
import { save, persist } from './storage.js';
import {
  FAMILY_RESPONSIBILITIES_STORAGE_KEY, MAX_FAMILY_COMMITMENTS,
  createDefaultFamilyResponsibilitiesState, normalizeFamilyResponsibilitiesState,
  familyEventForDay, getFamilyResponsibilitiesReport, resolveFamilyResponsibilityEvent,
  completeFamilyCommitment, renegotiateFamilyCommitment, exportFamilyResponsibilitiesReport,
} from './KanoNorthernDriverFamilyResponsibilities.js';

const SECTION_ID = 'kano-family-responsibilities';
const STYLE_ID = 'kfr-style';
const INSTALL_KEY = Symbol.for('kano.life.familyResponsibilities.installed.v1');
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
let state = loadState();
let activeNotice = '';
let activeNoticeError = false;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(FAMILY_RESPONSIBILITIES_STORAGE_KEY);
    return normalizeFamilyResponsibilitiesState(raw ? JSON.parse(raw) : createDefaultFamilyResponsibilitiesState());
  } catch { return createDefaultFamilyResponsibilitiesState(); }
}
function persistState(next) {
  try {
    globalThis.localStorage?.setItem(FAMILY_RESPONSIBILITIES_STORAGE_KEY, JSON.stringify(normalizeFamilyResponsibilitiesState(next)));
    return Boolean(globalThis.localStorage);
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null;
  const game = ui?.game || null;
  const gameState = game?.s || {};
  const aure = typeof window !== 'undefined' ? window.kanoNorthernDriverAureAndCulture?.snapshot?.() || {} : {};
  const social = typeof window !== 'undefined' ? window.kanoNorthernDriverRealLife?.snapshot?.() || {} : {};
  const society = typeof window !== 'undefined' ? window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {} : {};
  const rawDay = gameState.__kanoScheduleCurrentDay ?? gameState.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? society.day ?? 1;
  const day = Math.max(1, Math.floor(Number(rawDay) || 1));
  const activeShift = Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state)));
  const relationshipStatus = String(aure.relationshipStatus || 'single');
  const familyTrust = Number.isFinite(Number(social.meters?.familyTrust)) ? Math.round(Number(social.meters.familyTrust))
    : Number.isFinite(Number(aure.familyUnderstanding)) ? Math.round(Number(aure.familyUnderstanding)) : null;
  return { ui, game, gameState, day, activeShift, relationshipStatus, familyTrust, wallet: Math.max(0, Math.floor(Number(save.money) || 0)) };
}
function safeText(value) { return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 200); }
function ensureDailyEvent() {
  const ctx = context();
  const beforeDay = state.lastEventDay;
  const beforeId = state.currentEventId;
  const result = familyEventForDay(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  if (!result.ok && result.reason === 'clock_rollback') return;
  state = result.state;
  if (state.lastEventDay !== beforeDay || state.currentEventId !== beforeId) {
    if (!persistState(state)) activeNotice = 'Browser storage is unavailable; daily family events cannot be safely saved.';
  }
}
function notify(message, error = false) {
  activeNotice = safeText(message);
  activeNoticeError = error;
  const node = el('kfr-notice');
  if (node) { node.textContent = activeNotice; node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kfr-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kfr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kfr-card{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .kfr-card h4{margin:0 0 7px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .kfr-stat{font-size:18px;font-weight:900;color:#f8fbff;margin:6px 0}
    #${SECTION_ID} .kfr-event{margin-top:11px;padding:13px;border:1px solid #426178;border-radius:10px;background:#0d2130}
    #${SECTION_ID} .kfr-kicker{margin:0 0 5px;color:#f3c861;font-size:10px;font-weight:900;letter-spacing:.12em}
    #${SECTION_ID} .kfr-event h4{font-size:17px;margin:0 0 7px}
    #${SECTION_ID} .kfr-event p{font-size:13px;line-height:1.5;color:#c6d7e3}
    #${SECTION_ID} button{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kfr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    #${SECTION_ID} .kfr-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .kfr-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:11px}
    #${SECTION_ID} .kfr-log{display:grid;gap:7px;margin-top:9px}
    #${SECTION_ID} .kfr-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;padding:9px;border:1px solid #29465b;border-radius:8px;background:#0a1824}
    #${SECTION_ID} .kfr-row-copy{flex:1 1 180px;font-size:12px;line-height:1.45;color:#c0d0dc}
    #${SECTION_ID} .kfr-notice{min-height:18px;margin-top:9px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .kfr-notice[data-state="error"]{color:#ffb4aa}
    @media(max-width:520px){#${SECTION_ID} .kfr-grid,#${SECTION_ID} .kfr-choices{grid-template-columns:1fr}#${SECTION_ID} .kfr-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .kfr-actions button,#${SECTION_ID} .kfr-row button{width:100%}}
  `;
  document.head.append(style);
}
function createSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID);
  if (section) return section;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">FAMILY RESPONSIBILITIES · PROMISES · UNEXPECTED EVENTS</h3>
    <p class="kfr-note">Family life includes care, ceremonies, calls, bills and boundaries. Each day's situation can be answered once. Contributions are optional; a promise creates a visible commitment but does not take money until you pay it. Values are fictional gameplay tuning.</p>
    <div class="kfr-grid">
      <div class="kfr-card"><h4>Family and social context</h4><p id="kfr-relationship" class="kfr-stat">Single</p><p id="kfr-context-note" class="kfr-note"></p><p id="kfr-family-trust" class="kfr-note"></p></div>
      <div class="kfr-card"><h4>Your commitments</h4><p id="kfr-summary" class="kfr-stat"></p><p id="kfr-wallet" class="kfr-note"></p><p class="kfr-note">No promise is automatically debited. Complete it, pay it or renegotiate it while safely off shift.</p></div>
    </div>
    <div class="kfr-event" aria-live="polite"><p id="kfr-kicker" class="kfr-kicker">TODAY'S FAMILY SITUATION</p><h4 id="kfr-event-title">A family decision is waiting</h4><p id="kfr-event-body">Today's situation will appear here.</p><div id="kfr-choices" class="kfr-choices"></div></div>
    <div class="kfr-card" style="margin-top:11px"><h4>Open promises and time commitments</h4><p class="kfr-note">Financial commitments are not bills until you choose to pay them. Time commitments can be marked complete after you make the call, visit or agreed arrangement.</p><div id="kfr-commitments" class="kfr-log"></div></div>
    <div class="kfr-card" style="margin-top:11px"><h4>Recent family-responsibility history</h4><div id="kfr-ledger" class="kfr-log"></div><div class="kfr-actions"><button type="button" data-kfr-action="export">EXPORT FAMILY REPORT (.JSON)</button></div></div>
    <p id="kfr-notice" class="kfr-notice" role="status" aria-live="polite"></p>
    <p class="kfr-note">This panel does not replace the existing Aure relationship profile or the DAILY LIFE & SOCIAL REPUTATION meters. It tracks specific promises and decisions; existing relationship systems remain the source for their own relationship indicators.</p>
  `;
  const anchor = el('kano-household-water') || el('kano-household-utilities') || el('kano-aure-culture') || el('kano-society-markets');
  if (anchor?.parentElement === host) anchor.after(section);
  else {
    const footer = host.querySelector('#klc-close-bottom')?.parentElement;
    if (footer) host.insertBefore(section, footer); else host.append(section);
  }
  section.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-kfr-choice],[data-kfr-action],[data-kfr-commit],[data-kfr-renegotiate]');
    if (!button) return;
    if (button.dataset.kfrChoice) handleResolve(button.dataset.kfrChoice);
    else if (button.dataset.kfrCommit) handleComplete(button.dataset.kfrCommit);
    else if (button.dataset.kfrRenegotiate) handleRenegotiate(button.dataset.kfrRenegotiate);
    else if (button.dataset.kfrAction === 'export') exportReport();
  });
  return section;
}
function commit(nextState, nextWallet, message) {
  const ctx = context(); const previousWallet = ctx.wallet; const normalized = normalizeFamilyResponsibilitiesState(nextState);
  const safeWallet = Math.max(0, Math.floor(Number(nextWallet) || 0));
  try {
    if (safeWallet !== previousWallet) { save.money = safeWallet; persist(); }
    if (!persistState(normalized)) throw new Error('family_storage_unavailable');
    state = normalized;
    ctx.ui?.refreshWallet?.();
    window.kanoNorthernDriverLifeSimulation?.refresh?.();
    window.kanoNorthernDriverRealLife?.refresh?.();
    window.kanoNorthernDriverAureAndCulture?.refresh?.();
    render(); notify(message);
    window.dispatchEvent(new CustomEvent('kano:family-responsibilities-updated', { detail: { day: ctx.day } }));
    return true;
  } catch {
    if (safeWallet !== previousWallet) { save.money = previousWallet; try { persist(); } catch {} }
    state = loadState(); render(); notify('Could not save this family action. No new promise was recorded; wallet rollback was attempted.', true); return false;
  }
}
function handleResolve(choiceId) {
  const ctx = context(); ensureDailyEvent();
  const report = getFamilyResponsibilitiesReport(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  const result = resolveFamilyResponsibilityEvent(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, eventId: report.event?.id, choiceId, wallet: ctx.wallet, activeShift: ctx.activeShift });
  const messages = {
    shift_active: 'Finish the driving segment or stop safely before making a family decision.',
    stale_event: 'This situation changed with the in-game day. Refresh the panel and check the current event.',
    already_resolved: 'Today’s family situation has already been resolved.',
    invalid_choice: 'That choice is not available.',
    insufficient_wallet: `You need ${money(result.required)} for that contribution. No money was taken.`,
    too_many_commitments: `You already have ${MAX_FAMILY_COMMITMENTS} open commitments. Complete or renegotiate one before making another promise.`,
    duplicate_commitment: 'This commitment has already been recorded.',
  };
  if (!result.ok) { state = result.state; notify(messages[result.reason] || 'The family action could not be completed.', true); render(); return; }
  commit(result.state, result.wallet, result.message);
}
function handleComplete(commitmentId) {
  const ctx = context();
  const result = completeFamilyCommitment(state, { commitmentId, day: ctx.day, wallet: ctx.wallet, activeShift: ctx.activeShift });
  const messages = { shift_active: 'Finish driving before settling a family commitment.', commitment_not_pending: 'This commitment is no longer open.', insufficient_wallet: `You need ${money(result.required)}. No money was taken.` };
  if (!result.ok) { notify(messages[result.reason] || 'This commitment could not be completed.', true); return; }
  commit(result.state, result.wallet, result.message);
}
function handleRenegotiate(commitmentId) {
  const ctx = context(); const result = renegotiateFamilyCommitment(state, { commitmentId, day: ctx.day, activeShift: ctx.activeShift });
  const messages = { shift_active: 'Finish driving before changing a family commitment.', commitment_not_pending: 'This commitment is no longer open.', renegotiation_limit: 'This promise has already been renegotiated three times. Choose a realistic plan and keep it.' };
  if (!result.ok) { notify(messages[result.reason] || 'The due date could not be changed.', true); return; }
  commit(result.state, ctx.wallet, result.message);
}
function exportReport() {
  const ctx = context(); const payload = exportFamilyResponsibilitiesReport(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `kano-family-responsibilities-day-${ctx.day}.json`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Family-responsibility report exported.');
}
function renderChoices(event, resolved, ctx) {
  const target = el('kfr-choices'); if (!target) return; target.replaceChildren();
  if (!event) return;
  if (resolved) { const note = document.createElement('p'); note.className = 'kfr-note'; note.textContent = 'Today’s situation is resolved. Another situation can appear after the in-game day advances.'; target.append(note); return; }
  for (const choice of event.choices) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = choice.label; button.dataset.kfrChoice = choice.id;
    button.disabled = ctx.activeShift || ((choice.id === 'contribute') && ctx.wallet < event.amount) || ((choice.id === 'promise' || choice.id === 'time') && state.commitments.filter(item => item.status === 'pending').length >= MAX_FAMILY_COMMITMENTS);
    if (ctx.activeShift) button.title = 'Available when not driving.';
    target.append(button);
  }
}
function renderCommitments(items, ctx) {
  const target = el('kfr-commitments'); if (!target) return; target.replaceChildren();
  if (!items.length) { const note = document.createElement('p'); note.className = 'kfr-note'; note.textContent = 'No open family commitments. You have not made any outstanding money or time promises.'; target.append(note); return; }
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'kfr-row';
    const copy = document.createElement('div'); copy.className = 'kfr-row-copy';
    const when = item.overdue ? `OVERDUE · due day ${item.dueDay}` : item.dueDay === ctx.day ? 'DUE TODAY' : `due day ${item.dueDay}`;
    copy.textContent = `${item.kind === 'time' ? 'TIME' : 'FINANCIAL'} · ${item.label} · ${when} · ${item.amount ? money(item.amount) : 'no payment'}`;
    const actions = document.createElement('div'); actions.className = 'kfr-actions';
    const complete = document.createElement('button'); complete.type = 'button'; complete.dataset.kfrCommit = item.id;
    complete.textContent = item.kind === 'time' ? 'MARK DONE' : `PAY ${money(item.amount)}`;
    complete.disabled = ctx.activeShift || ctx.wallet < item.amount;
    const renegotiate = document.createElement('button'); renegotiate.type = 'button'; renegotiate.dataset.kfrRenegotiate = item.id; renegotiate.textContent = 'AGREE A NEW DATE';
    renegotiate.disabled = ctx.activeShift || item.renegotiations >= 3;
    actions.append(complete, renegotiate); row.append(copy, actions); target.append(row);
  }
}
function render() {
  if (typeof document === 'undefined') return;
  ensureDailyEvent();
  const section = el(SECTION_ID); if (!section) return;
  const ctx = context();
  const report = getFamilyResponsibilitiesReport(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  state = report.state;
  if (el('kfr-relationship')) el('kfr-relationship').textContent = String(ctx.relationshipStatus).replace(/(^|[-_])(\w)/g, (_, sep, c) => `${sep ? ' ' : ''}${c.toUpperCase()}`);
  if (el('kfr-context-note')) el('kfr-context-note').textContent = ctx.relationshipStatus === 'single'
    ? 'Today’s events can focus on kinship, friends, ceremonies and managing your own time. Being single is not a failure.'
    : 'Today’s event takes your recorded relationship status into account where relevant; it does not reveal a partner name or private health information.';
  if (el('kfr-family-trust')) el('kfr-family-trust').textContent = ctx.familyTrust == null ? 'Family trust: using the existing social-life system when available.' : `Family trust in the existing social-life system: ${Math.max(0, Math.min(100, ctx.familyTrust))}/100 (read-only here).`;
  if (el('kfr-summary')) el('kfr-summary').textContent = `${report.summary.pending} open · ${report.summary.overdue} overdue · ${report.summary.completed} completed`;
  if (el('kfr-wallet')) el('kfr-wallet').textContent = `Available wallet: ${money(ctx.wallet)} · cash changes only when you explicitly contribute or pay a commitment.`;
  const event = report.event;
  if (el('kfr-kicker')) el('kfr-kicker').textContent = event ? `${event.category.toUpperCase()} · DAY ${ctx.day}` : 'FAMILY SITUATION';
  if (el('kfr-event-title')) el('kfr-event-title').textContent = event?.title || 'No family situation available';
  if (el('kfr-event-body')) el('kfr-event-body').textContent = event?.body || 'Check again after the in-game day changes.';
  renderChoices(event, report.eventResolved, ctx); renderCommitments(report.pendingCommitments, ctx);
  const ledger = el('kfr-ledger');
  if (ledger) {
    ledger.replaceChildren();
    if (!report.ledger.length) { const note = document.createElement('p'); note.className = 'kfr-note'; note.textContent = 'No family decisions have been recorded yet.'; ledger.append(note); }
    else for (const item of report.ledger.slice(0, 8)) { const row = document.createElement('div'); row.className = 'kfr-row'; const text = document.createElement('div'); text.className = 'kfr-row-copy'; text.textContent = `Day ${item.day} · ${item.text}${item.amount ? ` · ${item.amount < 0 ? 'cost' : 'value'} ${money(Math.abs(item.amount))}` : ''}`; ledger.append(text); }
  }
  const notice = el('kfr-notice'); if (notice) { notice.textContent = activeNotice; notice.dataset.state = activeNoticeError ? 'error' : 'ok'; }
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  const ensure = () => { installStyles(); createSection(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  for (const id of ['life-career-btn', 'life-career-menu-btn']) el(id)?.addEventListener('click', () => queueMicrotask(ensure));
  if (document.documentElement && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => { if (document.querySelector('#kano-life-career-screen .klc-panel') && !el(SECTION_ID)) ensure(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:family-responsibilities-updated', 'kano:relationship-status-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverFamilyResponsibilities = {
    version: 1,
    snapshot: () => getFamilyResponsibilitiesReport(state, { day: context().day, relationshipStatus: context().relationshipStatus }),
    export: () => JSON.stringify(exportFamilyResponsibilitiesReport(state, { day: context().day, relationshipStatus: context().relationshipStatus }), null, 2),
    refresh: render,
  };
}
install();
