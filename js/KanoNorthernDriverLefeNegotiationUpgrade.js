/** Step 70 runtime panel, loaded additively after the current GitHub-main chain. */
import './KanoNorthernDriverAureJourneyUpgrade.js';
import { save, persist } from './storage.js';
import {
  LEFE_STORAGE_KEY, LEFE_ITEMS, createDefaultLefeState, normalizeLefeState,
  getLefeSummary, beginLefeJourney, resumeLefeJourney, pauseLefeJourney,
  saveLefeList, openLefeDiscussion, getLefeScenarioForDay, resolveLefeScenario,
  recordMutualPartnerCommitment, agreeLefeList, purchaseLefeItem,
  completeLefePreparation, exportLefeReport,
} from './KanoNorthernDriverLefeNegotiation.js';

const SECTION_ID = 'kano-lefe-negotiation';
const STYLE_ID = 'kln-style';
const INSTALL_KEY = Symbol.for('kano.life.lefeNegotiation.installed.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const textSafe = (value, max = 240) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, max);
let state = loadState();
let notice = '';
let noticeError = false;
let observer = null;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(LEFE_STORAGE_KEY);
    return normalizeLefeState(raw ? JSON.parse(raw) : createDefaultLefeState());
  } catch { return createDefaultLefeState(); }
}
function persistState(next) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(LEFE_STORAGE_KEY, JSON.stringify(normalizeLefeState(next)));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const aure = typeof window !== 'undefined' ? window.kanoNorthernDriverAureAndCulture?.snapshot?.() || {} : {};
  const life = typeof window !== 'undefined' ? window.kanoNorthernDriverLifeSimulation?.snapshot?.() || {} : {};
  const society = typeof window !== 'undefined' ? window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay
    ?? life.day ?? society.day ?? save.lifestyle?.worldDayNumber ?? 1;
  const parsedDay = Number(rawDay);
  return {
    ui, game,
    day: Math.max(1, Math.floor(Number.isFinite(parsedDay) ? parsedDay : 1)),
    activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))),
    relationshipStatus: String(aure.relationshipStatus || 'single'),
    profile: aure.profile || life.profile || { name: 'Driver', age: 22, gender: 'male' },
    wallet: Math.max(0, Math.floor(Number(save.money) || 0)),
  };
}
function notify(message, error = false) {
  notice = textSafe(message); noticeError = Boolean(error);
  const node = el('kln-notice');
  if (node) { node.textContent = notice; node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function persistOnly(next, message) {
  const normalized = normalizeLefeState(next);
  if (!persistState(normalized)) { notify('Browser storage is unavailable. No change was saved.', true); return false; }
  state = normalized;
  window.dispatchEvent(new CustomEvent('kano:lefe-updated', { detail: { day: context().day, phase: state.phase } }));
  render();
  notify(message || 'Lefe progress saved.');
  return true;
}
function persistWalletTransaction(result) {
  const previousWallet = Math.max(0, Math.floor(Number(save.money) || 0));
  let previousRaw = null;
  try { previousRaw = globalThis.localStorage?.getItem(LEFE_STORAGE_KEY) ?? null; } catch {}
  try {
    if (!globalThis.localStorage) throw new Error('storage_unavailable');
    // Persist the updated purchase ledger first, then the existing authoritative wallet.
    globalThis.localStorage.setItem(LEFE_STORAGE_KEY, JSON.stringify(normalizeLefeState(result.state)));
    save.money = result.wallet;
    persist();
    state = normalizeLefeState(result.state);
    context().ui?.refreshWallet?.();
    window.kanoNorthernDriverLifeSimulation?.refresh?.();
    window.kanoNorthernDriverAureAndCulture?.refresh?.();
    render();
    window.dispatchEvent(new CustomEvent('kano:lefe-updated', { detail: { day: context().day, phase: state.phase, amount: result.amount } }));
    notify(result.message);
    return true;
  } catch {
    save.money = previousWallet;
    try { persist(); } catch {}
    try {
      if (globalThis.localStorage) {
        if (previousRaw == null) globalThis.localStorage.removeItem(LEFE_STORAGE_KEY);
        else globalThis.localStorage.setItem(LEFE_STORAGE_KEY, previousRaw);
      }
    } catch {}
    notify('The Lefe purchase could not be saved. The wallet was restored; no item was recorded.', true);
    return false;
  }
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kln-note{font-size:12px;line-height:1.55;color:#b7cad8;margin:6px 0}
    #${SECTION_ID} .kln-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kln-card,#${SECTION_ID} .kln-row{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .kln-card h4{margin:0 0 7px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .kln-stat{font-size:20px;font-weight:900;color:#f8fbff;margin:7px 0}
    #${SECTION_ID} .kln-row{margin-top:8px;background:#0a1824}
    #${SECTION_ID} .kln-row h5{font-size:13px;margin:0 0 5px;color:#f5f8fb}
    #${SECTION_ID} .kln-row p{font-size:12px;line-height:1.5;color:#c3d3df;margin:5px 0}
    #${SECTION_ID} label{display:flex;flex-direction:column;gap:5px;margin:8px 0;color:#d9e7ef;font-size:12px;font-weight:750}
    #${SECTION_ID} input{box-sizing:border-box;width:100%;min-height:44px;border:1px solid #45677d;border-radius:8px;background:#0b1a27;color:#fff;padding:8px 10px;font:inherit;font-size:16px}
    #${SECTION_ID} button{min-height:44px;max-width:100%;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kln-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
    #${SECTION_ID} .kln-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .kln-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .kln-notice[data-state="error"]{color:#ffb4aa}
    #${SECTION_ID} .kln-meter{height:6px;background:#1b3447;border-radius:8px;overflow:hidden;margin:6px 0 9px}
    #${SECTION_ID} .kln-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} .kln-item-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(66px,88px) minmax(75px,auto);gap:8px;align-items:center}
    #${SECTION_ID} .kln-item-grid .kln-note{margin:0}
    #${SECTION_ID} .kln-item-grid input{min-height:40px}
    #${SECTION_ID} .kln-line-total{font-size:12px;font-weight:850;text-align:right;white-space:nowrap}
    #${SECTION_ID} .kln-event{margin-top:10px;padding:13px;border:1px solid #426178;border-radius:10px;background:#0d2130}
    #${SECTION_ID} .kln-kicker{margin:0 0 5px;color:#f3c861;font-size:10px;font-weight:900;letter-spacing:.12em}
    #${SECTION_ID} .kln-event h4{font-size:17px;margin:0 0 7px}
    #${SECTION_ID} .kln-event p{font-size:13px;line-height:1.5;color:#c6d7e3}
    @media(max-width:520px){#${SECTION_ID} .kln-grid{grid-template-columns:1fr}#${SECTION_ID} .kln-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .kln-actions button{width:100%}#${SECTION_ID} .kln-item-grid{grid-template-columns:minmax(0,1fr) 66px}#${SECTION_ID} .kln-line-total{grid-column:1/-1;text-align:left}}
  `;
  document.head.append(style);
}
function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID); if (section) return section;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">AURE · LEFE LIST · FAMILY NEGOTIATION</h3>
    <p class="kln-note">Lefe is a family-specific marriage-preparation list. It can include fabrics, tailoring, footwear, personal-care items, refreshments or other agreed requests; there is no single list that every family must demand. Values here are fictional gameplay prices, not current market rates. Both adults’ consent matters: neither partner is property, and the game does not force marriage or reward unaffordable debt.</p>
    <div class="kln-grid">
      <div class="kln-card"><h4>Journey status</h4><p id="kln-status" class="kln-stat">Not started</p><p id="kln-status-note" class="kln-note"></p><p id="kln-profile-note" class="kln-note"></p><div class="kln-actions" id="kln-journey-actions"></div></div>
      <div class="kln-card"><h4>Affordability & progress</h4><p id="kln-budget" class="kln-stat">₦0</p><div class="kln-meter" aria-hidden="true"><i id="kln-budget-meter" style="width:0%"></i></div><p id="kln-wallet" class="kln-note"></p><p id="kln-purchases" class="kln-note"></p><p id="kln-relationship-note" class="kln-note"></p></div>
    </div>
    <div class="kln-card" id="kln-list-card"><h4>Customize the family-specific Lefe list</h4><p class="kln-note">Set each quantity to 0–4. Only save and agree to items that this fictional family actually requests and that both partners are comfortable with. Buying is a separate action, after the list is agreed.</p><div id="kln-list-items"></div>
      <div class="kln-grid"><label>Custom item name<input id="kln-custom-name" maxlength="80" value="Family-specific item" /></label><label>Custom item price (game ₦)<input id="kln-custom-cost" type="number" min="0" max="100000" step="1" value="0" /></label></div>
      <div class="kln-actions"><button type="button" class="kln-primary" data-kln-action="save-list">SAVE LIST DRAFT</button><button type="button" data-kln-action="open-discussion">OPEN FAMILY DISCUSSION</button><button type="button" data-kln-action="agree-list">AGREE LIST (ENGAGED ONLY)</button></div>
    </div>
    <div class="kln-card" id="kln-scenario-card"><h4>Today’s Lefe situation</h4><p id="kln-scenario-status" class="kln-note"></p><div id="kln-scenario"></div></div>
    <div class="kln-card"><h4>Buy agreed items</h4><p class="kln-note">Items are purchased one unit at a time using the existing LIFE & CAREER wallet. Purchases are disabled during driving and cannot exceed the agreed quantities.</p><div id="kln-buy-items"></div><div class="kln-actions"><button type="button" class="kln-primary" data-kln-action="complete">MARK PREPARATION COMPLETE</button><button type="button" data-kln-action="export">EXPORT LEFE REPORT (.JSON)</button></div></div>
    <div class="kln-card"><h4>Recent Lefe history</h4><div id="kln-history"></div></div>
    <p id="kln-notice" class="kln-notice" role="status" aria-live="polite"></p>
  `;
  const anchor = el('kano-aure-journey') || el('kano-aure-culture') || el('kano-family-responsibilities');
  if (anchor && anchor.parentElement === host) anchor.after(section); else host.append(section);
  section.addEventListener('click', handleClick);
  section.addEventListener('change', event => {
    if (event.target.matches('input[data-kln-quantity]')) {
      const value = Math.max(0, Math.min(4, Math.floor(Number(event.target.value) || 0)));
      event.target.value = String(value);
    }
  });
  return section;
}
function currentQuantitiesFromForm() {
  const values = {};
  for (const item of LEFE_ITEMS) values[item.id] = Number(el(`kln-qty-${item.id}`)?.value ?? state.plannedQuantities[item.id]);
  return values;
}
function stateMessage() {
  const ctx = context();
  if (!['dating', 'engaged'].includes(ctx.relationshipStatus)) return 'Set Dating or Engaged in the existing Aure profile to begin. The Lefe panel will not change that profile for you.';
  if (ctx.relationshipStatus === 'dating') return 'You can discuss expectations while dating; formal agreement is available only after the existing Aure profile is Engaged.';
  return 'Engaged profile detected. Continue only with mutual consent and a list the family and couple have actually discussed.';
}
function renderListEditor(ctx, summary) {
  const target = el('kln-list-items'); if (!target) return; target.replaceChildren();
  const editable = ['preparing', 'discussion'].includes(state.phase) && !ctx.activeShift;
  for (const row of summary.items) {
    const wrap = document.createElement('div'); wrap.className = 'kln-row';
    const grid = document.createElement('div'); grid.className = 'kln-item-grid';
    const title = document.createElement('div');
    const heading = document.createElement('h5'); heading.textContent = row.label;
    const note = document.createElement('p'); note.className = 'kln-note'; note.textContent = row.note || 'Customise according to the family’s actual request.';
    title.append(heading, note);
    const label = document.createElement('label'); label.textContent = 'Qty'; label.style.margin = '0';
    const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = String(4); input.step = '1'; input.dataset.klnQuantity = row.id; input.id = `kln-qty-${row.id}`; input.value = String(row.quantity); input.disabled = !editable;
    label.append(input);
    const amount = document.createElement('div'); amount.className = 'kln-line-total'; amount.textContent = `${money(row.unitPrice)} × ${row.quantity} = ${money(row.lineTotal)}`;
    grid.append(title, label, amount); wrap.append(grid);
    const status = document.createElement('p'); status.className = 'kln-note';
    status.textContent = `Purchased: ${row.purchased}/${row.quantity}${row.remainingQuantity > 0 ? ` · remaining estimate ${money(row.remainingQuantity * row.unitPrice)}` : ''}`;
    wrap.append(status); target.append(wrap);
  }
  const name = el('kln-custom-name'), cost = el('kln-custom-cost');
  if (name) { name.value = state.customItemName; name.disabled = !editable; }
  if (cost) { cost.value = String(state.customItemCost); cost.disabled = !editable; }
  const listCard = el('kln-list-card'); if (listCard) listCard.hidden = ['inactive', 'ended', 'complete'].includes(state.phase);
  const saveButton = sectionButton('save-list'), openButton = sectionButton('open-discussion'), agreeButton = sectionButton('agree-list');
  if (saveButton) saveButton.disabled = !editable;
  if (openButton) openButton.disabled = !editable || state.phase !== 'preparing';
  if (agreeButton) agreeButton.disabled = ctx.activeShift || state.phase !== 'discussion' || ctx.relationshipStatus !== 'engaged' || state.partnerDecision !== 'committed' || !['open', 'negotiating'].includes(state.familyPosition);
}
function sectionButton(action) { return el(SECTION_ID)?.querySelector(`button[data-kln-action="${action}"]`) || null; }
function renderScenario(ctx) {
  const host = el('kln-scenario'); const status = el('kln-scenario-status'); if (!host || !status) return;
  host.replaceChildren();
  if (ctx.activeShift) { status.textContent = 'Lefe decisions are locked during an active driving shift. Stop safely or finish the shift first.'; return; }
  if (state.phase !== 'discussion') { status.textContent = 'Open a family discussion to receive the relevant Lefe situations. Each resolved situation is recorded once.'; return; }
  const result = getLefeScenarioForDay(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, profileGender: ctx.profile.gender });
  if (result.ok && result.changed && JSON.stringify(result.state) !== JSON.stringify(state)) {
    if (persistState(result.state)) state = normalizeLefeState(result.state);
  }
  if (!result.ok) { status.textContent = result.reason === 'clock_rollback' ? 'The saved in-game day is ahead of the current clock. Lefe actions are paused until the saved day is reached.' : 'The relationship status changed in the Aure profile. Review it before continuing.'; return; }
  const scenario = getLefeScenarioForDay(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, profileGender: ctx.profile.gender }).scenario;
  if (!scenario) {
    status.textContent = state.richerSuitorSeen ? 'No unresolved Lefe scenario is waiting today. Continue only when ready; do not use money to prove worth.' : 'The list discussion has been recorded. The next pressure situation becomes eligible after two in-game days.';
    return;
  }
  status.textContent = `Day ${state.currentScenarioDay} · one response for this situation`;
  const card = document.createElement('article'); card.className = 'kln-event';
  const kicker = document.createElement('p'); kicker.className = 'kln-kicker'; kicker.textContent = scenario.kicker;
  const title = document.createElement('h4'); title.textContent = scenario.title;
  const body = document.createElement('p'); body.textContent = scenario.body;
  const actions = document.createElement('div'); actions.className = 'kln-actions';
  for (const choice of scenario.choices) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.klnChoice = choice.id; button.textContent = choice.label; button.title = choice.summary; actions.append(button);
  }
  card.append(kicker, title, body, actions); host.append(card);
}
function renderBuyItems(ctx, summary) {
  const target = el('kln-buy-items'); if (!target) return; target.replaceChildren();
  const allowedPhase = state.phase === 'agreed' && ['engaged', 'married'].includes(ctx.relationshipStatus);
  for (const row of summary.items) {
    const wrap = document.createElement('div'); wrap.className = 'kln-row';
    const head = document.createElement('h5'); head.textContent = row.label;
    const detail = document.createElement('p'); detail.className = 'kln-note'; detail.textContent = `${row.purchased}/${row.quantity} purchased · unit ${money(row.unitPrice)} · remaining ${money(row.remainingQuantity * row.unitPrice)}`;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.klnBuy = row.id; button.textContent = `BUY ONE · ${money(row.unitPrice)}`;
    button.disabled = !allowedPhase || ctx.activeShift || row.remainingQuantity <= 0 || ctx.wallet < row.unitPrice || (row.id === 'familySpecific' && row.unitPrice <= 0);
    if (ctx.activeShift) button.title = 'Stop driving before a Lefe purchase.';
    else if (ctx.wallet < row.unitPrice) button.title = 'The current wallet cannot cover this item.';
    wrap.append(head, detail, button); target.append(wrap);
  }
  const complete = sectionButton('complete'); if (complete) complete.disabled = ctx.activeShift || state.phase !== 'agreed' || !['engaged', 'married'].includes(ctx.relationshipStatus) || !summary.allPurchased;
}
function renderHistory() {
  const target = el('kln-history'); if (!target) return; target.replaceChildren();
  if (!state.history.length) { const p = document.createElement('p'); p.className = 'kln-note'; p.textContent = 'List changes, family discussions, choices and item purchases will appear here.'; target.append(p); return; }
  for (const row of state.history.slice(0, 8)) {
    const p = document.createElement('p'); p.className = 'kln-note'; p.textContent = `Day ${row.day} · ${row.type.replace(/[-_]/g, ' ')} — ${row.text}`; target.append(p);
  }
}
function render() {
  if (typeof document === 'undefined') return;
  const host = ensureSection(); if (!host) return;
  const ctx = context(); const summary = getLefeSummary(state);
  const statusMap = { inactive: 'Not started', preparing: 'Preparing draft', discussion: 'Family discussion', paused: 'Paused', agreed: 'List agreed', ended: 'Journey ended', complete: 'List preparation complete' };
  const put = (id, value) => { const node = el(id); if (node) node.textContent = String(value ?? ''); };
  put('kln-status', statusMap[state.phase] || 'Not started');
  put('kln-status-note', stateMessage());
  put('kln-profile-note', `Relationship status: ${ctx.relationshipStatus}. This panel reads the Aure profile but never changes it automatically.`);
  put('kln-budget', money(summary.requestedTotal));
  const meter = el('kln-budget-meter'); if (meter) meter.style.width = `${Math.max(0, Math.min(100, Math.round(summary.purchasedTotal / Math.max(1, summary.requestedTotal) * 100)))}%`;
  put('kln-wallet', `Existing LIFE & CAREER wallet: ${money(ctx.wallet)} · no separate Lefe wallet.`);
  put('kln-purchases', `Paid so far ${money(summary.purchasedTotal)} · estimated remaining ${money(summary.remainingTotal)} · ${summary.purchasedCount}/${summary.plannedItemCount} planned item units purchased.`);
  put('kln-relationship-note', `Communication ${state.communication}/100 · family understanding ${state.familyUnderstanding}/100 · partner trust ${state.partnerTrust}/100 · autonomy ${state.autonomy}/100 · wellbeing ${state.wellbeing}/100 · social pressure ${state.socialPressure}/100.`);
  const actions = el('kln-journey-actions'); if (actions) {
    actions.replaceChildren();
    const add = (action, label, disabled = false) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.klnAction = action; button.textContent = label; button.disabled = disabled; actions.append(button); };
    add('start', 'BEGIN LEFE PLANNING', ctx.activeShift || state.phase !== 'inactive' || !['dating', 'engaged'].includes(ctx.relationshipStatus));
    add('resume', 'RESUME PAUSED PLANNING', ctx.activeShift || state.phase !== 'paused' || !['dating', 'engaged'].includes(ctx.relationshipStatus));
    add('mutual-consent', 'RECORD MUTUAL PARTNER COMMITMENT', ctx.activeShift || state.phase !== 'discussion' || !['dating', 'engaged'].includes(ctx.relationshipStatus) || state.partnerDecision === 'chose_other');
    add('pause', 'PAUSE / STEP BACK', ctx.activeShift || !['preparing', 'discussion'].includes(state.phase));
  }
  const scenarioRes = getLefeScenarioForDay(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, profileGender: ctx.profile.gender });
  if (scenarioRes.ok && scenarioRes.changed && JSON.stringify(scenarioRes.state) !== JSON.stringify(state)) {
    if (persistState(scenarioRes.state)) state = normalizeLefeState(scenarioRes.state);
  }
  renderListEditor(ctx, summary); renderScenario(ctx); renderBuyItems(ctx, summary); renderHistory();
  const noticeNode = el('kln-notice'); if (noticeNode) { noticeNode.textContent = notice; noticeNode.dataset.state = noticeError ? 'error' : 'ok'; }
}
function listPayload() {
  return { quantities: currentQuantitiesFromForm(), customItemName: el('kln-custom-name')?.value || 'Family-specific item', customItemCost: Number(el('kln-custom-cost')?.value ?? 0) };
}
function reportExport() {
  const ctx = context();
  const data = exportLefeReport(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, profileGender: ctx.profile.gender });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `kano-life-lefe-day-${ctx.day}.json`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Exported a Lefe report without partner names or private contact details.');
}
function handleClick(event) {
  const ctx = context();
  const choice = event.target.closest('button[data-kln-choice]');
  if (choice) {
    const result = resolveLefeScenario(state, { day: ctx.day, scenarioId: state.currentScenarioId, choiceId: choice.dataset.klnChoice, relationshipStatus: ctx.relationshipStatus });
    if (!result.ok) { notify('This Lefe choice is no longer available. Check the saved day and relationship status.', true); return; }
    persistOnly(result.state, result.message); return;
  }
  const buy = event.target.closest('button[data-kln-buy]');
  if (buy) {
    const result = purchaseLefeItem(state, { itemId: buy.dataset.klnBuy, day: ctx.day, relationshipStatus: ctx.relationshipStatus, activeShift: ctx.activeShift, wallet: ctx.wallet });
    if (!result.ok) {
      const messages = { active_shift: 'Stop driving safely before buying Lefe items.', insufficient_wallet: `This item costs ${money(result.required)}; the current wallet is ${money(result.available)}. No money was taken.`, quantity_already_purchased: 'That planned quantity is already purchased.', engagement_required: 'Purchases are available only for an engaged or married profile.', list_not_agreed: 'Agree on the list with your partner and family discussion first.', custom_item_needs_price: 'Enter a real game price for the custom item before buying.' };
      notify(messages[result.reason] || 'The item could not be purchased.', true); return;
    }
    persistWalletTransaction(result); return;
  }
  const button = event.target.closest('button[data-kln-action]'); if (!button) return;
  const action = button.dataset.klnAction;
  if (action === 'start') {
    const result = beginLefeJourney(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, activeShift: ctx.activeShift });
    if (!result.ok) { notify(result.reason === 'relationship_status_required' ? 'Set Dating or Engaged in the existing Aure profile first.' : 'Lefe planning could not start in the current state.', true); return; }
    persistOnly(result.state, result.message); return;
  }
  if (action === 'resume') {
    const result = resumeLefeJourney(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, activeShift: ctx.activeShift });
    if (!result.ok) { notify('Paused planning cannot be resumed in the current state.', true); return; }
    persistOnly(result.state, result.message); return;
  }
  if (action === 'pause') {
    const result = pauseLefeJourney(state, { day: ctx.day, activeShift: ctx.activeShift });
    if (!result.ok) { notify('Planning cannot be paused in the current state.', true); return; }
    persistOnly(result.state, result.message); return;
  }
  if (action === 'save-list' || action === 'open-discussion') {
    const saved = saveLefeList(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, activeShift: ctx.activeShift, ...listPayload() });
    if (!saved.ok) { notify(saved.reason === 'custom_item_needs_price' ? 'Give the custom item a price above ₦0, or set its quantity to zero.' : 'The list could not be saved in the current state.', true); return; }
    if (action === 'save-list') { persistOnly(saved.state, saved.message); return; }
    const opened = openLefeDiscussion(saved.state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, activeShift: ctx.activeShift });
    if (!opened.ok) { notify(opened.reason === 'empty_list' ? 'Add at least one item before opening the discussion.' : 'A family discussion cannot open in the current state.', true); return; }
    persistOnly(opened.state, opened.message); return;
  }
  if (action === 'mutual-consent') {
    const confirmed = window.confirm('Record this only if BOTH adults have freely agreed to continue the relationship discussion. This is not a marriage decision.');
    if (!confirmed) return;
    const result = recordMutualPartnerCommitment(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, activeShift: ctx.activeShift, mutualConsent: true });
    if (!result.ok) { notify('Mutual commitment could not be recorded.', true); return; }
    persistOnly(result.state, result.message); return;
  }
  if (action === 'agree-list') {
    // Agree to the exact quantities currently visible in the form, not an older draft.
    // Only save them once the current profile is eligible for list discussion.
    if (ctx.relationshipStatus !== 'engaged') {
      notify('Change the existing Aure profile to Engaged only if that status is accurate.', true); return;
    }
    const saved = saveLefeList(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, activeShift: ctx.activeShift, ...listPayload() });
    if (!saved.ok) {
      notify(saved.reason === 'custom_item_needs_price' ? 'Give the custom item a price above ₦0, or set its quantity to zero.' : 'The current list draft could not be saved. No agreement was recorded.', true); return;
    }
    if (!persistState(saved.state)) { notify('Could not save the latest list. No agreement was recorded.', true); return; }
    state = normalizeLefeState(saved.state);
    const result = agreeLefeList(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, activeShift: ctx.activeShift });
    if (!result.ok) {
      const messages = { mutual_partner_commitment_required: 'Both adults must explicitly agree to continue before the list can be accepted.', family_discussion_not_ready: 'Resolve the family discussion before recording an agreement.' };
      persistOnly(state, messages[result.reason] || 'The Lefe list cannot be agreed yet.');
      return;
    }
    persistOnly(result.state, result.message); return;
  }
  if (action === 'complete') {
    const result = completeLefePreparation(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus, activeShift: ctx.activeShift });
    if (!result.ok) { notify(result.reason === 'items_remaining' ? `${result.remainingQuantity} item unit(s) remain; estimate ${money(result.remainingTotal)}.` : 'Preparations cannot be marked complete yet.', true); return; }
    persistOnly(result.state, result.message); return;
  }
  if (action === 'export') reportExport();
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  const ensure = () => { installStyles(); ensureSection(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  for (const id of ['life-career-btn', 'life-career-menu-btn']) el(id)?.addEventListener('click', () => queueMicrotask(ensure));
  if (!el(SECTION_ID) && !observer && document.documentElement && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      if (document.querySelector('#kano-life-career-screen .klc-panel') && !el(SECTION_ID)) ensure();
      if (el(SECTION_ID)) { observer?.disconnect(); observer = null; }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:relationship-status-updated', 'kano:aure-journey-updated', 'kano:family-responsibilities-updated', 'kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:lefe-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverLefeNegotiation = {
    version: 1,
    snapshot: () => ({ ...normalizeLefeState(state), summary: getLefeSummary(state), day: context().day, relationshipStatus: context().relationshipStatus }),
    export: () => JSON.stringify(exportLefeReport(state, { day: context().day, relationshipStatus: context().relationshipStatus, profileGender: context().profile.gender }), null, 2),
    refresh: render,
  };
  ensure();
  console.info('[Kano Life] Step 70 Lefe negotiation registered.');
}
install();
