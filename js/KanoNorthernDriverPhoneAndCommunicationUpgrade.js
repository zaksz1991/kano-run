/** Runtime UI for Step 63: phone calls, messages and relationship follow-through. */
import { save, persist } from './storage.js';
import {
  PHONE_LIFE_STORAGE_KEY, PHONE_TOP_UPS, PHONE_AIRTIME_CAP, PHONE_ACTION_COSTS,
  createDefaultPhoneLifeState, normalizePhoneLifeState, ensureDailyPhoneMessages,
  topUpPhoneAirtime, resolvePhoneMessage, getPhoneLifeReport, exportPhoneLifeReport,
} from './KanoNorthernDriverPhoneLife.js';

const SECTION_ID = 'kano-phone-life';
const STYLE_ID = 'kpl-style';
const INSTALL_KEY = Symbol.for('kano.life.phoneLife.installed.v1');
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
let state = loadState();
let activeNotice = '';
let activeNoticeError = false;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(PHONE_LIFE_STORAGE_KEY);
    return normalizePhoneLifeState(raw ? JSON.parse(raw) : createDefaultPhoneLifeState());
  } catch { return createDefaultPhoneLifeState(); }
}
function persistState(next) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(PHONE_LIFE_STORAGE_KEY, JSON.stringify(normalizePhoneLifeState(next)));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const aure = typeof window !== 'undefined' ? window.kanoNorthernDriverAureAndCulture?.snapshot?.() || {} : {};
  const society = typeof window !== 'undefined' ? window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? society.day ?? 1;
  const relationshipStatus = String(aure.relationshipStatus || 'single');
  return {
    ui, game, day: Math.max(1, Math.floor(Number(rawDay) || 1)), relationshipStatus,
    activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))),
    wallet: Math.max(0, Math.floor(Number(save.money) || 0)),
  };
}
function safeText(value) { return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 420); }
function notify(message, error = false) {
  activeNotice = safeText(message); activeNoticeError = error;
  const node = el('kpl-notice');
  if (node) { node.textContent = activeNotice; node.dataset.state = error ? 'error' : 'ok'; }
  context().ui?.toast?.(String(message));
}
function syncDay() {
  const ctx = context();
  const result = ensureDailyPhoneMessages(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  state = result.state;
  if (result.added) persistState(state);
  return ctx;
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kpl-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kpl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kpl-card{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .kpl-card h4{margin:0 0 7px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .kpl-stat{font-size:20px;font-weight:900;color:#f8fbff;margin:7px 0}
    #${SECTION_ID} .kpl-row{border:1px solid #29465b;background:#0a1824;border-radius:9px;padding:11px;margin-top:8px}
    #${SECTION_ID} .kpl-row h5{font-size:13px;margin:0 0 5px;color:#f5f8fb}
    #${SECTION_ID} .kpl-row p{font-size:12px;line-height:1.5;color:#c3d3df;margin:5px 0}
    #${SECTION_ID} button{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kpl-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
    #${SECTION_ID} .kpl-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .kpl-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .kpl-notice[data-state="error"]{color:#ffb4aa}
    #${SECTION_ID} .kpl-bond{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
    #${SECTION_ID} .kpl-chip{border:1px solid #29465b;background:#0a1824;border-radius:7px;padding:7px 9px;font-size:11px;color:#d1e1eb}
    @media(max-width:520px){#${SECTION_ID} .kpl-grid{grid-template-columns:1fr}#${SECTION_ID} .kpl-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .kpl-actions button{width:100%}}
  `;
  document.head.append(style);
}
function createSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  const anchor = el('kano-family-responsibilities') || el('kano-household-water') || el('kano-household-utilities') || el('kano-aure-culture');
  if (!host || !anchor) return null;
  let section = el(SECTION_ID); if (section) return section;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">MOBILE PHONE · CALLS · MESSAGES · RELATIONSHIPS</h3>
    <p class="kpl-note">Calls, family messages, park coordination, market updates and relationships are part of everyday life. Phone actions are disabled during an active shift: stop driving first. Airtime is bought from the existing wallet; reply and call costs are charged only when you choose them. All prices are fictional gameplay values.</p>
    <div class="kpl-grid">
      <div class="kpl-card"><h4>Phone credit</h4><p id="kpl-airtime" class="kpl-stat">₦100</p><p id="kpl-wallet" class="kpl-note"></p><p id="kpl-shift-note" class="kpl-note"></p><div class="kpl-actions" id="kpl-topups"></div></div>
      <div class="kpl-card"><h4>Communication and relationships</h4><p id="kpl-relationship" class="kpl-stat">Single</p><p id="kpl-counts" class="kpl-note"></p><div id="kpl-bonds" class="kpl-bond"></div><p class="kpl-note">Contact scores belong to this phone simulation; they do not overwrite the Aure, family-trust or passenger-trust systems.</p></div>
    </div>
    <div class="kpl-card"><h4>Inbox and missed calls</h4><p class="kpl-note">You can call back, reply, set a respectful boundary or leave a message unanswered. Ignoring a message may affect that contact's trust. Old unanswered messages expire after two in-game days.</p><div id="kpl-inbox" aria-live="polite"></div></div>
    <div class="kpl-card" style="margin-top:10px"><h4>Recent phone activity</h4><div id="kpl-ledger"></div><div class="kpl-actions"><button type="button" class="kpl-primary" data-kpl-action="export">EXPORT PHONE & COMMUNICATION REPORT (.JSON)</button></div></div>
    <p id="kpl-notice" class="kpl-notice" role="status" aria-live="polite"></p>
  `;
  anchor.after(section);
  section.addEventListener('click', event => {
    const topup = event.target.closest('button[data-kpl-topup]');
    if (topup) { handleTopUp(Number(topup.dataset.kplTopup)); return; }
    const choice = event.target.closest('button[data-kpl-message-action]');
    if (choice) { handleMessage(choice.dataset.kplMessageId, choice.dataset.kplMessageAction); return; }
    const action = event.target.closest('button[data-kpl-action]');
    if (action?.dataset.kplAction === 'export') exportReport();
  });
  return section;
}
function renderTopUps(ctx) {
  const target = el('kpl-topups'); if (!target) return; target.replaceChildren();
  for (const topup of PHONE_TOP_UPS) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.kplTopup = String(topup.amount); button.textContent = `BUY ${topup.label.toUpperCase()}`;
    button.disabled = ctx.activeShift || ctx.wallet < topup.amount || state.airtime + topup.amount > PHONE_AIRTIME_CAP;
    target.append(button);
  }
}
function renderInbox(report, ctx) {
  const target = el('kpl-inbox'); if (!target) return; target.replaceChildren();
  const rows = report.state.inbox.slice(0, 10);
  if (!rows.length) { const p = document.createElement('p'); p.className = 'kpl-note'; p.textContent = 'No messages yet. A new everyday-life message can arrive when the simulated day advances.'; target.append(p); return; }
  for (const message of rows) {
    const row = document.createElement('article'); row.className = 'kpl-row';
    const h = document.createElement('h5'); h.textContent = `${message.kind === 'call' ? 'MISSED CALL' : 'MESSAGE'} · ${message.contact} · DAY ${message.day}`; row.append(h);
    const title = document.createElement('p'); title.textContent = message.title; title.style.fontWeight = '800'; row.append(title);
    const body = document.createElement('p'); body.textContent = message.body; row.append(body);
    const status = document.createElement('p'); status.className = 'kpl-note';
    const age = ctx.day - message.day;
    status.textContent = message.status === 'pending' && age > 2 ? 'EXPIRED · too old to act on' : message.status.toUpperCase().replace('_', ' ');
    row.append(status);
    if (message.status === 'pending' && age <= 2) {
      const actions = document.createElement('div'); actions.className = 'kpl-actions';
      const choices = [
        ['call_back', `CALL BACK · ₦${PHONE_ACTION_COSTS.call_back}`],
        ['reply', `REPLY RESPECTFULLY · ₦${PHONE_ACTION_COSTS.reply}`],
        ['boundary', `SET A CLEAR BOUNDARY · ₦${PHONE_ACTION_COSTS.boundary}`],
        ['ignore', 'LEAVE UNANSWERED'],
      ];
      for (const [id, label] of choices) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.kplMessageId = message.id; button.dataset.kplMessageAction = id; button.textContent = label;
        button.disabled = ctx.activeShift || (id !== 'ignore' && state.airtime < PHONE_ACTION_COSTS[id]);
        if (ctx.activeShift) button.title = 'Phone interactions are unavailable during a driving shift.';
        actions.append(button);
      }
      row.append(actions);
    }
    target.append(row);
  }
}
function render() {
  if (typeof document === 'undefined') return;
  const ctx = syncDay();
  const section = el(SECTION_ID); if (!section) return;
  const report = getPhoneLifeReport(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  if (el('kpl-airtime')) el('kpl-airtime').textContent = money(state.airtime);
  if (el('kpl-wallet')) el('kpl-wallet').textContent = `Existing wallet: ${money(ctx.wallet)} · airtime cap: ${money(PHONE_AIRTIME_CAP)}.`;
  if (el('kpl-shift-note')) el('kpl-shift-note').textContent = ctx.activeShift ? 'DRIVING SHIFT ACTIVE — phone controls are locked. Finish or end the shift safely to respond.' : 'OFF SHIFT — you can manage calls and messages.';
  if (el('kpl-relationship')) el('kpl-relationship').textContent = ctx.relationshipStatus.replace(/(^|[-_])([a-z])/g, (_, sep, c) => `${sep ? ' ' : ''}${c.toUpperCase()}`);
  if (el('kpl-counts')) el('kpl-counts').textContent = `${report.unreadCount} pending · ${report.expiredCount} expired · ${state.counters.callsMade} calls made · ${state.counters.messagesSent} replies sent`;
  const bonds = el('kpl-bonds');
  if (bonds) {
    bonds.replaceChildren();
    const labels = { family: 'Family', partner: 'Partner', market: 'Market', park: 'Park peers', work: 'Work contacts', community: 'Community' };
    for (const [key, value] of Object.entries(state.bonds)) { const chip = document.createElement('span'); chip.className = 'kpl-chip'; chip.textContent = `${labels[key] || key}: ${value}/100`; bonds.append(chip); }
  }
  renderTopUps(ctx); renderInbox(report, ctx);
  const ledger = el('kpl-ledger');
  if (ledger) {
    ledger.replaceChildren();
    if (!report.recentLedger.length) { const p = document.createElement('p'); p.className = 'kpl-note'; p.textContent = 'No phone activity recorded yet.'; ledger.append(p); }
    else for (const item of report.recentLedger) { const p = document.createElement('p'); p.className = 'kpl-note'; p.textContent = `Day ${item.day} · ${item.text}${item.amount ? ` · ${item.amount < 0 ? 'cost' : 'value'} ${money(Math.abs(item.amount))}` : ''}`; ledger.append(p); }
  }
  const notice = el('kpl-notice'); if (notice) { notice.textContent = activeNotice; notice.dataset.state = activeNoticeError ? 'error' : 'ok'; }
}
function handleTopUp(amount) {
  const ctx = context();
  const result = topUpPhoneAirtime(state, { amount, wallet: ctx.wallet, activeShift: ctx.activeShift });
  const messages = { shift_active: 'Finish the driving shift before buying airtime.', invalid_top_up: 'Choose one of the listed airtime bundles.', airtime_cap: 'Your airtime balance would exceed the phone-credit limit.', insufficient_wallet: `You need ${money(result.required)} in the wallet. No money was taken.` };
  if (!result.ok) { notify(messages[result.reason] || 'Airtime purchase failed.', true); render(); return; }
  commit(result.state, result.wallet, `Bought ${money(amount)} airtime.`);
}
function handleMessage(messageId, action) {
  const ctx = context();
  const result = resolvePhoneMessage(state, { messageId, action, day: ctx.day, airtime: state.airtime, activeShift: ctx.activeShift });
  const messages = { shift_active: 'Phone interactions are locked while driving. Stop safely or finish the shift first.', message_not_pending: 'That message has already been handled or is unavailable.', message_expired: 'That message has expired. Keep an eye on newer messages.', invalid_action: 'That phone action is unavailable.', insufficient_airtime: `This action needs ${money(result.required)} airtime. Top up after your shift.` };
  if (!result.ok) { state = result.state; if (result.reason === 'message_expired') persistState(state); notify(messages[result.reason] || 'Phone action failed.', true); render(); return; }
  commit(result.state, ctx.wallet, result.message);
}
function commit(next, nextWallet, message) {
  const ctx = context(); const previousWallet = ctx.wallet; const oldState = state;
  try {
    if (nextWallet !== previousWallet) { save.money = nextWallet; persist(); }
    if (!persistState(next)) throw new Error('phone storage unavailable');
    state = normalizePhoneLifeState(next);
    window.dispatchEvent(new CustomEvent('kano:phone-life-updated', { detail: { day: context().day } }));
    render(); notify(message);
  } catch {
    if (nextWallet !== previousWallet) { save.money = previousWallet; try { persist(); } catch {} }
    state = oldState; notify('Could not safely save this phone action. The wallet change was rolled back where possible.', true); render();
  }
}
function exportReport() {
  const ctx = context();
  const payload = exportPhoneLifeReport(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `kano-phone-life-day-${ctx.day}.json`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Phone-life report exported.');
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  const ensure = () => { installStyles(); createSection(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  for (const id of ['life-career-btn', 'life-career-menu-btn']) el(id)?.addEventListener('click', () => queueMicrotask(ensure));
  if (!el(SECTION_ID) && document.documentElement && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (document.querySelector('#kano-life-career-screen .klc-panel') && !el(SECTION_ID)) ensure();
      if (el(SECTION_ID)) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:relationship-status-updated', 'kano:family-responsibilities-updated', 'kano:phone-life-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverPhoneLife = {
    version: 1,
    snapshot: () => getPhoneLifeReport(state, { day: context().day, relationshipStatus: context().relationshipStatus }),
    export: () => JSON.stringify(exportPhoneLifeReport(state, { day: context().day, relationshipStatus: context().relationshipStatus }), null, 2),
    refresh: render,
  };
}
install();
console.info('[Kano Life] Phone, calls and everyday communication registered.');
