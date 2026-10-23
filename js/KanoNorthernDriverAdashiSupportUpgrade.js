/** Kano Life Step 72 — UI and atomic bridge to the existing save wallet. */
import { save, persist } from './storage.js';
import {
  ADASHI_SUPPORT_SAVE_FIELD,
  ADASHI_SUPPORT_CONTRIBUTIONS,
  ADASHI_SUPPORT_MEMBER_COUNTS,
  ADASHI_CONTACTS,
  ADASHI_SUPPORT_OFFER_TYPES,
  ADASHI_SUPPORT_REQUEST_TYPES,
  createDefaultAdashiSupportState,
  normalizeAdashiSupportState,
  createAdashiCircle,
  closeAdashiCircle,
  getAdashiSnapshot,
  payAdashiContribution,
  settleAdashiWeek,
  offerNeighbourSupport,
  requestNeighbourSupport,
  exportAdashiSupportReport,
} from './KanoNorthernDriverAdashiSupport.js';

const SECTION_ID = 'kano-adashi-support';
const STYLE_ID = 'kano-adashi-support-style';
const INSTALL_KEY = Symbol.for('kano.life.adashiSupport.uiInstalled.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const safeText = (value, max = 260) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, max);
const money = value => `₦${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-NG')}`;

let state = readState();
let notice = '';
let noticeIsError = false;
let observer = null;
let refreshTimer = null;

function readState() {
  return normalizeAdashiSupportState(save?.lifestyle?.[ADASHI_SUPPORT_SAVE_FIELD] || createDefaultAdashiSupportState());
}

function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const life = typeof window !== 'undefined' ? window.kanoNorthernDriverLifeSimulation?.snapshot?.() || {} : {};
  const society = typeof window !== 'undefined' ? window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? life.day ?? society.day
    ?? save?.lifestyle?.worldDayNumber ?? save?.lifestyle?.seasonalSimulationDay ?? 1;
  const parsed = Number(rawDay);
  const day = Math.max(1, Math.floor(Number.isFinite(parsed) ? parsed : 1));
  const activeShift = Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state)));
  return { ui, game, s, day, activeShift, wallet: Math.max(0, Math.floor(Number(save?.money) || 0)) };
}

function commit(nextState, nextWallet, successMessage = '') {
  const ctx = context();
  const beforeWallet = Number(save.money) || 0;
  const hadLifestyle = Object.prototype.hasOwnProperty.call(save, 'lifestyle');
  let beforeLifestyle;
  try { beforeLifestyle = JSON.parse(JSON.stringify(save.lifestyle || {})); }
  catch { beforeLifestyle = {}; }
  try {
    if (!globalThis.localStorage || typeof globalThis.localStorage.setItem !== 'function') throw new Error('storage-unavailable');
    if (!save.lifestyle || typeof save.lifestyle !== 'object' || Array.isArray(save.lifestyle)) save.lifestyle = {};
    save.money = Math.max(0, Math.floor(Number(nextWallet) || 0));
    save.lifestyle[ADASHI_SUPPORT_SAVE_FIELD] = normalizeAdashiSupportState(nextState);
    if (persist() !== true) throw new Error('save-failed');
    state = normalizeAdashiSupportState(save.lifestyle[ADASHI_SUPPORT_SAVE_FIELD]);
    ctx.ui?.refreshWallet?.();
    window.kanoNorthernDriverLifeSimulation?.refresh?.();
    window.kanoNorthernDriverAureAndCulture?.refresh?.();
    window.dispatchEvent(new CustomEvent('kano:adashi-support-updated', {
      detail: { day: ctx.day, wallet: save.money, circleActive: Boolean(state.circle), reputation: state.reputation },
    }));
    render();
    if (successMessage) notify(successMessage);
    return true;
  } catch {
    save.money = beforeWallet;
    if (hadLifestyle) save.lifestyle = beforeLifestyle;
    else delete save.lifestyle;
    state = readState();
    notify('The save was not confirmed. No contribution or payout was committed.', true);
    render();
    return false;
  }
}

function notify(message, error = false) {
  notice = safeText(message);
  noticeIsError = Boolean(error);
  const node = el('kas-notice');
  if (node) { node.textContent = notice; node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}

function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 8px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kas-note{margin:6px 0;font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kas-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kas-card{padding:13px;background:#091723;border:1px solid #29465b;border-radius:10px;overflow-wrap:anywhere}
    #${SECTION_ID} .kas-card h4{margin:0 0 7px;color:#f2f7fb;font-size:14px}
    #${SECTION_ID} .kas-stat{margin:5px 0;color:#f8fbff;font-size:21px;font-weight:900}
    #${SECTION_ID} .kas-pill{display:inline-block;margin:0 5px 6px 0;padding:4px 8px;border:1px solid #547388;border-radius:100px;color:#e6f3f9;font-size:10px;font-weight:800}
    #${SECTION_ID} .kas-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}
    #${SECTION_ID} label{display:block;color:#e3eef6;font-size:12px;line-height:1.4}
    #${SECTION_ID} select{display:block;width:100%;min-height:42px;margin-top:5px;padding:8px;border:1px solid #43657c;border-radius:7px;background:#102637;color:#f4f8fc;font:inherit}
    #${SECTION_ID} button{width:100%;min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button.kas-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kas-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}
    #${SECTION_ID} .kas-meter{height:7px;margin:7px 0 10px;background:#1b3447;border-radius:9px;overflow:hidden}
    #${SECTION_ID} .kas-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} .kas-row{padding:9px 0;border-bottom:1px solid #20394b;color:#c6d7e3;font-size:12px;line-height:1.45;overflow-wrap:anywhere}
    #${SECTION_ID} .kas-row:last-child{border-bottom:0}
    #${SECTION_ID} .kas-notice{min-height:18px;margin-top:9px;color:#8fe1c5;font-size:12px;line-height:1.45}
    #${SECTION_ID} .kas-notice[data-state=error]{color:#ffb4aa}
    #${SECTION_ID} .kas-disclosure{border-left:3px solid #fbbf24;padding:8px 10px;background:#211d10;color:#e8dfc3;font-size:12px;line-height:1.5}
    @media(max-width:620px){#${SECTION_ID} .kas-grid,#${SECTION_ID} .kas-form,#${SECTION_ID} .kas-actions{grid-template-columns:1fr}#${SECTION_ID} button,#${SECTION_ID} select{min-height:46px}}
  `;
  document.head.append(style);
}

function addText(parent, tag, value, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(value ?? '');
  parent.append(node);
  return node;
}

function makeButton(label, action, disabled = false, primary = false) {
  const node = document.createElement('button');
  node.type = 'button'; node.textContent = label; node.dataset.kasAction = action; node.disabled = Boolean(disabled);
  if (primary) node.classList.add('kas-primary');
  return node;
}

function makeSelect(id, label, options, currentValue) {
  const wrap = document.createElement('label');
  wrap.append(document.createTextNode(label));
  const select = document.createElement('select'); select.id = id;
  for (const item of options) {
    const option = document.createElement('option');
    option.value = String(item.value); option.textContent = item.label;
    if (String(item.value) === String(currentValue)) option.selected = true;
    select.append(option);
  }
  wrap.append(select); return wrap;
}

function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID);
  if (section) return section;
  installStyles();
  section = document.createElement('section');
  section.id = SECTION_ID;
  section.setAttribute('aria-labelledby', 'kas-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="kas-title">ADASHI · NEIGHBOURHOOD SUPPORT</h3>
    <p class="kas-note">A local-life simulation of rotating community savings and practical neighbourhood relationships. Adashi and similar savings groups vary by community and by group agreement. These are fictional in-game amounts, not current prices, banking services, lending offers or financial advice.</p>
    <div id="kas-content"></div>
    <p class="kas-notice" id="kas-notice" role="status" aria-live="polite"></p>
  `;
  const anchor = el('kano-seasonal-resilience') || el('kano-parenthood') || el('kano-lefe-negotiation') || el('kano-aure-journey');
  if (anchor && anchor.parentElement === host) anchor.after(section); else host.append(section);
  section.addEventListener('click', event => {
    const button = event.target.closest('button[data-kas-action]');
    if (button) handleAction(button.dataset.kasAction);
  });
  section.addEventListener('change', event => {
    if (event.target?.id !== 'kas-new-members') return;
    const count = Math.max(4, Math.min(8, Number(event.target.value) || 6));
    const position = el('kas-new-position');
    if (!position) return;
    const previous = Math.min(count, Math.max(1, Number(position.value) || 1));
    position.replaceChildren();
    for (let week = 1; week <= count; week += 1) {
      const option = document.createElement('option'); option.value = String(week); option.textContent = `Week ${week}`;
      option.selected = week === previous; position.append(option);
    }
  });
  return section;
}

function renderContacts(ctx) {
  const host = el('kas-network');
  if (!host) return;
  host.replaceChildren();
  const grid = document.createElement('div'); grid.className = 'kas-grid';
  for (const contact of state.contacts) {
    const card = document.createElement('article'); card.className = 'kas-card';
    addText(card, 'h4', contact.name);
    addText(card, 'p', contact.role, 'kas-note');
    addText(card, 'p', `Trust ${contact.trust}/100`, 'kas-stat');
    const meter = document.createElement('div'); meter.className = 'kas-meter';
    const fill = document.createElement('i'); fill.style.width = `${clamp(contact.trust, 0, 100)}%`;
    meter.append(fill); card.append(meter);
    addText(card, 'p', `Support offered: ${contact.helpOffered} · Responses received: ${contact.helpReceived}`, 'kas-note');
    grid.append(card);
  }
  host.append(grid);
  const form = document.createElement('div'); form.className = 'kas-form';
  const contactOptions = state.contacts.map(contact => ({ value: contact.id, label: `${contact.name} · ${contact.role}` }));
  const offerOptions = ADASHI_SUPPORT_OFFER_TYPES.map(item => ({ value: item.id, label: item.label }));
  const requestOptions = ADASHI_SUPPORT_REQUEST_TYPES.map(item => ({ value: item.id, label: item.label }));
  form.append(makeSelect('kas-contact', 'Contact', contactOptions, el('kas-contact')?.value || state.contacts[0].id));
  form.append(makeSelect('kas-offer', 'Offer practical support', offerOptions, el('kas-offer')?.value || offerOptions[0].value));
  form.append(makeSelect('kas-request', 'Request practical help', requestOptions, el('kas-request')?.value || requestOptions[0].value));
  host.append(form);
  const actions = document.createElement('div'); actions.className = 'kas-actions';
  actions.append(makeButton('OFFER SUPPORT', 'offer-support', ctx.activeShift || state.lastSocialActionDay === ctx.day, true));
  actions.append(makeButton('REQUEST SUPPORT', 'request-support', ctx.activeShift || state.lastSocialActionDay === ctx.day, false));
  host.append(actions);
  addText(host, 'p', 'One social action per simulation day. Support responses are narrative only; they do not award cash, spawn a customer, or repair the vehicle automatically.', 'kas-note');
}

function renderCircle(ctx) {
  const host = el('kas-circle'); if (!host) return;
  host.replaceChildren();
  if (!state.circle) {
    const intro = document.createElement('div'); intro.className = 'kas-card';
    addText(intro, 'h4', 'Start a fictional Adashi circle');
    addText(intro, 'p', 'Choose the weekly game contribution and payout order. Creating a circle does not deduct money. Each recorded contribution uses the existing banked wallet. Only your scheduled payout is credited back to that same wallet.', 'kas-note');
    const form = document.createElement('div'); form.className = 'kas-form';
    form.append(makeSelect('kas-new-amount', 'Weekly contribution', ADASHI_SUPPORT_CONTRIBUTIONS.map(value => ({ value, label: money(value) })), 250));
    form.append(makeSelect('kas-new-members', 'Circle size', ADASHI_SUPPORT_MEMBER_COUNTS.map(value => ({ value, label: `${value} members` })), 6));
    form.append(makeSelect('kas-new-position', 'Your payout position', [1,2,3,4,5,6].map(value => ({ value, label: `Week ${value}` })), 3));
    intro.append(form);
    intro.append(makeButton('CREATE CIRCLE', 'create-circle', ctx.activeShift, true));
    host.append(intro);
    return;
  }
  const circle = state.circle;
  const snapshot = getAdashiSnapshot(state, { day: ctx.day, wallet: ctx.wallet });
  const card = document.createElement('article'); card.className = 'kas-card';
  addText(card, 'h4', circle.name);
  addText(card, 'p', `${circle.memberCount} members · ${money(circle.contributionAmount)} weekly contribution`, 'kas-stat');
  const playerTurn = snapshot.playerTurn ? 'YOUR PAYOUT TURN' : `${snapshot.currentRecipient?.name || 'Circle member'} receives this turn`;
  addText(card, 'span', `Cycle ${circle.cycleNumber}`, 'kas-pill');
  addText(card, 'span', `Week ${circle.currentWeek} of ${circle.memberCount}`, 'kas-pill');
  addText(card, 'span', `Your position: ${circle.playerPosition}`, 'kas-pill');
  addText(card, 'p', playerTurn, 'kas-stat');
  addText(card, 'p', `Illustrative pot: ${money(snapshot.pot)} · Banked wallet: ${money(ctx.wallet)}`, 'kas-note');
  const paid = circle.paidThisWeek;
  const dueText = snapshot.due ? (paid ? 'Contribution paid; settle the turn.' : 'Weekly turn is due.') : `Next turn due on simulation day ${circle.nextDueDay} (${snapshot.daysUntilDue} day(s) remaining).`;
  addText(card, 'p', dueText, 'kas-note');
  const actions = document.createElement('div'); actions.className = 'kas-actions';
  actions.append(makeButton(paid ? 'CONTRIBUTION RECORDED' : `PAY ${money(circle.contributionAmount)} CONTRIBUTION`, 'pay-contribution', ctx.activeShift || !snapshot.canPay, true));
  actions.append(makeButton('SETTLE CURRENT WEEK', 'settle-week', ctx.activeShift || !snapshot.canSettle, false));
  card.append(actions);
  if (circle.currentWeek === 1 && !circle.paidThisWeek) {
    card.append(makeButton('CLOSE CIRCLE BETWEEN CYCLES', 'close-circle', ctx.activeShift, false));
  } else {
    addText(card, 'p', 'Finish the current cycle before closing the circle. Closing is available between cycles, before the next contribution is paid.', 'kas-note');
  }
  addText(card, 'p', 'A missed contribution can reduce trust, block payout eligibility, and forfeit a payout turn. NPC payouts are simulated records; they are not credited to the player. Payout proceeds rotate existing group contributions and are not new external income.', 'kas-note');
  host.append(card);
  const progress = document.createElement('div'); progress.className = 'kas-card';
  addText(progress, 'h4', 'Payout order');
  for (const member of circle.roster) {
    addText(progress, 'p', `${member.position}. ${member.name}${member.position === circle.currentWeek ? ' · CURRENT TURN' : ''}${member.isPlayer ? ' · PLAYER' : ''}`, 'kas-row');
  }
  host.append(progress);
}

function renderHistory() {
  const host = el('kas-history'); if (!host) return;
  host.replaceChildren();
  const rows = [...state.history].slice(-8).reverse();
  if (!rows.length) { addText(host, 'p', 'No community or savings activity recorded yet.', 'kas-note'); return; }
  for (const event of rows) addText(host, 'p', `Day ${event.day} · ${event.message}`, 'kas-row');
}

function render() {
  const section = ensureSection(); if (!section) return;
  const ctx = context();
  const content = el('kas-content'); if (!content) return;
  content.replaceChildren();
  const wallet = document.createElement('article'); wallet.className = 'kas-card';
  addText(wallet, 'h4', 'Existing game wallet');
  addText(wallet, 'p', money(ctx.wallet), 'kas-stat');
  addText(wallet, 'p', `Community reputation ${state.reputation}/100 · Contributions paid ${state.stats.contributionsPaid} · Missed ${state.stats.contributionsMissed}`, 'kas-note');
  addText(wallet, 'p', `Player contributions ${money(state.stats.totalContributed)} · Rotating payouts received ${money(state.stats.totalPayouts)}`, 'kas-note');
  content.append(wallet);
  const circleHost = document.createElement('div'); circleHost.id = 'kas-circle'; content.append(circleHost); renderCircle(ctx);
  const networkCard = document.createElement('article'); networkCard.className = 'kas-card'; networkCard.style.marginTop = '10px';
  addText(networkCard, 'h4', 'Neighbourhood relationships');
  addText(networkCard, 'p', 'Help with route knowledge, customer leads and practical information. The game models trust and availability; it does not promise that every request is accepted.', 'kas-note');
  const network = document.createElement('div'); network.id = 'kas-network'; networkCard.append(network); content.append(networkCard); renderContacts(ctx);
  const historyCard = document.createElement('article'); historyCard.className = 'kas-card'; historyCard.style.marginTop = '10px';
  addText(historyCard, 'h4', 'Recent community history');
  const history = document.createElement('div'); history.id = 'kas-history'; historyCard.append(history);
  const exportButton = makeButton('EXPORT ADASHI & SUPPORT REPORT (.JSON)', 'export-report');
  historyCard.append(exportButton); content.append(historyCard); renderHistory();
  if (notice) { const node = el('kas-notice'); if (node) { node.textContent = notice; node.dataset.state = noticeIsError ? 'error' : 'ok'; } }
}

function handleAction(action) {
  const ctx = context();
  if (ctx.activeShift && action !== 'export-report') { notify('Finish the driving shift before using Adashi or community actions.', true); return; }
  if (action === 'create-circle') {
    const result = createAdashiCircle(state, {
      contributionAmount: Number(el('kas-new-amount')?.value),
      memberCount: Number(el('kas-new-members')?.value),
      playerPosition: Number(el('kas-new-position')?.value),
      day: ctx.day,
    });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, ctx.wallet, result.message);
    return;
  }
  if (action === 'close-circle') {
    const result = closeAdashiCircle(state, { day: ctx.day });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, ctx.wallet, result.message);
    return;
  }
  if (action === 'pay-contribution') {
    const result = payAdashiContribution(state, { day: ctx.day, wallet: ctx.wallet });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, result.wallet, result.message);
    return;
  }
  if (action === 'settle-week') {
    const result = settleAdashiWeek(state, { day: ctx.day, wallet: ctx.wallet });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, result.wallet, result.message);
    return;
  }
  if (action === 'offer-support') {
    const result = offerNeighbourSupport(state, {
      contactId: el('kas-contact')?.value,
      offerType: el('kas-offer')?.value,
      day: ctx.day,
      activeShift: ctx.activeShift,
    });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, ctx.wallet, result.message);
    return;
  }
  if (action === 'request-support') {
    const result = requestNeighbourSupport(state, {
      contactId: el('kas-contact')?.value,
      requestType: el('kas-request')?.value,
      day: ctx.day,
      activeShift: ctx.activeShift,
    });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, ctx.wallet, result.message);
    return;
  }
  if (action === 'export-report') {
    try {
      const report = exportAdashiSupportReport(state, { day: ctx.day });
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `kano-adashi-support-day-${ctx.day}.json`;
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      notify('Community report exported. It contains fictional game activity only.');
    } catch { notify('Could not export the report in this browser.', true); }
  }
}

function install() {
  if (typeof window === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  installStyles();
  const ensure = () => { installStyles(); if (ensureSection()) render(); };
  ensure();
  if (document.documentElement && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      if (document.querySelector('#kano-life-career-screen .klc-panel') && !el(SECTION_ID)) ensure();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.addEventListener('kano:wallet-updated', render);
  window.addEventListener('kano:adashi-support-updated', render);
  window.addEventListener('kano:seasonal-resilience-updated', render);
  window.addEventListener('kano:life-day-updated', render);
  refreshTimer = window.setInterval(() => { const fresh = readState(); if (JSON.stringify(fresh) !== JSON.stringify(state)) { state = fresh; render(); } else if (!el(SECTION_ID)) ensure(); }, 2500);
  window.kanoNorthernDriverAdashiSupport = {
    snapshot: () => ({ ...state, day: context().day, wallet: context().wallet }),
    refresh: () => { state = readState(); render(); },
    export: () => exportAdashiSupportReport(state, { day: context().day }),
    dispose: () => { if (observer) observer.disconnect(); if (refreshTimer) clearInterval(refreshTimer); window.removeEventListener('kano:wallet-updated', render); },
  };
}

install();
