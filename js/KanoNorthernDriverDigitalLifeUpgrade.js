/**
 * Step 64 runtime panel. Additive UI loaded from the current GitHub-main index.
 * Uses the existing wallet and persistent storage; all internet/data values are
 * fictional gameplay values. It never uses real contacts or network services.
 */
import { save, persist } from './storage.js';
import {
  DIGITAL_DATA_CAP_MB, DIGITAL_DATA_BUNDLES, DIGITAL_SCENARIOS,
  DIGITAL_LIFE_STORAGE_KEY, createDefaultDigitalLifeState, normalizeDigitalLifeState,
  buyDigitalData, ensureDailyDigitalScenario, resolveDigitalScenario, digitalLifeReport,
} from './KanoNorthernDriverDigitalLife.js';

const SECTION_ID = 'kano-digital-life';
const STYLE_ID = 'kdl-style';
const INSTALL_KEY = Symbol.for('kano.life.digitalLife.installed.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const safeText = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 240);
let state = loadState();
let noticeText = '';
let noticeError = false;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(DIGITAL_LIFE_STORAGE_KEY);
    return normalizeDigitalLifeState(raw ? JSON.parse(raw) : createDefaultDigitalLifeState());
  } catch { return createDefaultDigitalLifeState(); }
}
function persistState(next) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(DIGITAL_LIFE_STORAGE_KEY, JSON.stringify(normalizeDigitalLifeState(next)));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const society = typeof window !== 'undefined' ? window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? society.day ?? 1;
  return {
    ui, game,
    day: Math.max(1, Math.floor(Number(rawDay) || 1)),
    activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))),
    wallet: Math.max(0, Math.floor(Number(save.money) || 0)),
    relationshipStatus: String(window.kanoNorthernDriverAureAndCulture?.snapshot?.().relationshipStatus || 'single'),
    faithPreference: String(society.faithPreference || 'private'),
  };
}
function notify(message, error = false) {
  noticeText = safeText(message); noticeError = Boolean(error);
  const node = el('kdl-notice');
  if (node) { node.textContent = noticeText; node.dataset.state = error ? 'error' : 'ok'; }
  context().ui?.toast?.(String(message || ''));
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kdl-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kdl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kdl-card{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .kdl-card h4{margin:0 0 8px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .kdl-stat{font-size:20px;font-weight:900;color:#f8fbff;margin:7px 0}
    #${SECTION_ID} .kdl-meter{height:7px;background:#1b3447;border-radius:8px;overflow:hidden;margin:7px 0 10px}
    #${SECTION_ID} .kdl-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} .kdl-row{border:1px solid #29465b;background:#0a1824;border-radius:9px;padding:11px;margin-top:8px}
    #${SECTION_ID} .kdl-row h5{font-size:13px;margin:0 0 5px;color:#f5f8fb}
    #${SECTION_ID} .kdl-row p{font-size:12px;line-height:1.5;color:#c3d3df;margin:5px 0}
    #${SECTION_ID} button{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kdl-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
    #${SECTION_ID} .kdl-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .kdl-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .kdl-notice[data-state="error"]{color:#ffb4aa}
    @media(max-width:520px){#${SECTION_ID} .kdl-grid{grid-template-columns:1fr}#${SECTION_ID} .kdl-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .kdl-actions button{width:100%}}
  `;
  document.head.append(style);
}
function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID); if (section) return section;
  const anchor = el('kano-phone-life') || el('kano-family-responsibilities') || el('kano-aure-culture') || host.lastElementChild;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">DIGITAL LIFE · MOBILE DATA · ONLINE OPPORTUNITIES</h3>
    <p class="kdl-note">Use affordable data to support market trading, check work opportunities, verify public claims and protect relationships. The prices and data amounts are fictional game values. This is an offline simulation: no real social accounts, contacts, posts or messages are accessed.</p>
    <div class="kdl-grid">
      <div class="kdl-card"><h4>Mobile data balance</h4><p id="kdl-data" class="kdl-stat">0 MB</p><div class="kdl-meter" aria-hidden="true"><i id="kdl-data-meter" style="width:0%"></i></div><p id="kdl-wallet" class="kdl-note"></p><p id="kdl-shift-note" class="kdl-note"></p><div id="kdl-bundles" class="kdl-actions"></div></div>
      <div class="kdl-card"><h4>Digital reputation & safety</h4><p id="kdl-rep" class="kdl-stat">50/100</p><div class="kdl-meter" aria-hidden="true"><i id="kdl-rep-meter" style="width:50%"></i></div><p id="kdl-metrics" class="kdl-note"></p><p id="kdl-relationship" class="kdl-note"></p></div>
    </div>
    <div class="kdl-card"><h4>Today's online situation</h4><p id="kdl-scenario-status" class="kdl-note"></p><div id="kdl-scenario"></div></div>
    <div class="kdl-grid">
      <div class="kdl-card"><h4>Market and work opportunities</h4><div id="kdl-opportunities"></div></div>
      <div class="kdl-card"><h4>Recent digital-life history</h4><div id="kdl-ledger"></div><div class="kdl-actions"><button type="button" class="kdl-primary" data-kdl-action="export">EXPORT DIGITAL-LIFE REPORT (.JSON)</button></div></div>
    </div>
    <p id="kdl-notice" class="kdl-notice" role="status" aria-live="polite"></p>
  `;
  if (anchor && anchor !== host.lastElementChild) anchor.after(section); else host.append(section);
  section.addEventListener('click', event => {
    const bundle = event.target.closest('button[data-kdl-bundle]');
    if (bundle) { handleBundle(bundle.dataset.kdlBundle); return; }
    const choice = event.target.closest('button[data-kdl-choice]');
    if (choice) { handleChoice(choice.dataset.kdlChoice); return; }
    if (event.target.closest('button[data-kdl-action="export"]')) exportReport();
  });
  return section;
}
function syncDay() {
  const ctx = context();
  const result = ensureDailyDigitalScenario(state, { day: ctx.day });
  if (result.ok) {
    if (JSON.stringify(result.state) !== JSON.stringify(state)) { state = result.state; persistState(state); }
  }
  return { ...ctx, scenario: result.scenario, clockError: result.reason === 'clock_rollback' };
}
function renderBundles(ctx) {
  const host = el('kdl-bundles'); if (!host) return; host.replaceChildren();
  for (const bundle of DIGITAL_DATA_BUNDLES) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.kdlBundle = bundle.id;
    button.textContent = `${bundle.label} · ${bundle.mb} MB · ${money(bundle.price)}`;
    button.disabled = ctx.activeShift || ctx.wallet < bundle.price || state.dataMb + bundle.mb > DIGITAL_DATA_CAP_MB;
    if (ctx.activeShift) button.title = 'Finish or safely stop the driving shift before buying data.';
    host.append(button);
  }
}
function renderScenario(ctx) {
  const host = el('kdl-scenario'); const status = el('kdl-scenario-status');
  if (!host || !status) return; host.replaceChildren();
  const scenario = DIGITAL_SCENARIOS.find(item => item.id === state.currentScenarioId) || ctx.scenario;
  if (ctx.clockError) { status.textContent = 'The in-game clock moved backwards. Digital-life actions are paused until the saved day is reached again.'; return; }
  if (!scenario) { status.textContent = 'No online situation is available.'; return; }
  status.textContent = `DAY ${state.currentScenarioDay} · ${state.currentScenarioStatus.toUpperCase()} · ${ctx.activeShift ? 'PHONE ACTIONS LOCKED WHILE DRIVING' : 'OFF SHIFT'}`;
  const row = document.createElement('article'); row.className = 'kdl-row';
  const title = document.createElement('h5'); title.textContent = scenario.title; row.append(title);
  const body = document.createElement('p'); body.textContent = scenario.body; row.append(body);
  if (state.currentScenarioStatus === 'pending' && state.currentScenarioDay === ctx.day) {
    const actions = document.createElement('div'); actions.className = 'kdl-actions';
    for (const choice of scenario.choices) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.kdlChoice = choice.id;
      const fee = choice.walletCost ? ` · ${money(choice.walletCost)}` : '';
      button.textContent = `${choice.label} · ${choice.dataMb} MB${fee}`;
      button.disabled = ctx.activeShift || state.dataMb < choice.dataMb || ctx.wallet < (choice.walletCost || 0);
      if (state.dataMb < choice.dataMb) button.title = `This action needs ${choice.dataMb} MB. Buy a data bundle after the shift.`;
      actions.append(button);
    }
    row.append(actions);
  } else {
    const p = document.createElement('p'); p.className = 'kdl-note'; p.textContent = state.currentScenarioStatus === 'resolved' ? 'Today's decision has been recorded. A new situation becomes available when the simulated day advances.' : 'This situation has expired. No automatic wallet penalty was applied.'; row.append(p);
  }
  host.append(row);
}
function renderOpportunities() {
  const host = el('kdl-opportunities'); if (!host) return; host.replaceChildren();
  const entries = [
    ...state.applications.slice(0, 5).map(item => ({ title: item.title, copy: `Submitted day ${item.day} · result day ${item.dueDay} · ${item.status.replace('-', ' ')}` })),
    ...state.listings.slice(0, 5).map(item => ({ title: 'Online market listing', copy: `Day ${item.day} · ${item.category} · listed, no sale is assumed` })),
  ].slice(0, 8);
  if (!entries.length) { const p = document.createElement('p'); p.className = 'kdl-note'; p.textContent = 'No applications or listings recorded yet. Verified applications can receive an interview or not-selected result after two in-game days; no wages are awarded automatically.'; host.append(p); return; }
  for (const item of entries) { const p = document.createElement('p'); p.className = 'kdl-note'; p.textContent = `${item.title} — ${item.copy}`; host.append(p); }
}
function renderLedger() {
  const host = el('kdl-ledger'); if (!host) return; host.replaceChildren();
  if (!state.ledger.length) { const p = document.createElement('p'); p.className = 'kdl-note'; p.textContent = 'No digital-life activity yet.'; host.append(p); return; }
  for (const item of state.ledger.slice(0, 8)) {
    const p = document.createElement('p'); p.className = 'kdl-note';
    p.textContent = `Day ${item.day} · ${item.text}${item.dataMb ? ` · ${item.dataMb} MB` : ''}${item.amount ? ` · ${item.amount < 0 ? 'cost ' : 'value '}${money(Math.abs(item.amount))}` : ''}`;
    host.append(p);
  }
}
function render() {
  if (typeof document === 'undefined') return;
  const ctx = syncDay();
  if (!el(SECTION_ID)) ensureSection();
  if (!el(SECTION_ID)) return;
  if (el('kdl-data')) el('kdl-data').textContent = `${state.dataMb.toLocaleString('en-NG')} MB`;
  if (el('kdl-data-meter')) el('kdl-data-meter').style.width = `${Math.round(state.dataMb / DIGITAL_DATA_CAP_MB * 100)}%`;
  if (el('kdl-wallet')) el('kdl-wallet').textContent = `Existing wallet: ${money(ctx.wallet)} · data cap: ${DIGITAL_DATA_CAP_MB.toLocaleString('en-NG')} MB.`;
  if (el('kdl-shift-note')) el('kdl-shift-note').textContent = ctx.activeShift ? 'DRIVING SHIFT ACTIVE — online actions and purchases are locked. Finish or stop safely first.' : 'OFF SHIFT — data bundles and online-life choices are available.';
  if (el('kdl-rep')) el('kdl-rep').textContent = `${state.digitalReputation}/100`;
  if (el('kdl-rep-meter')) el('kdl-rep-meter').style.width = `${state.digitalReputation}%`;
  if (el('kdl-metrics')) el('kdl-metrics').textContent = `Community trust ${state.communityTrust}/100 · civic literacy ${state.civicLiteracy}/100 · scam awareness ${state.scamAwareness}/100 · work contacts ${state.workConnections}/100.`;
  if (el('kdl-relationship')) el('kdl-relationship').textContent = `Current relationship status: ${ctx.relationshipStatus.replace(/[-_]/g, ' ')} · faith preference: ${ctx.faithPreference.replace(/[-_]/g, ' ')}. Both are displayed only as context; digital choices do not override those systems.`;
  renderBundles(ctx); renderScenario(ctx); renderOpportunities(); renderLedger();
  const notice = el('kdl-notice'); if (notice) { notice.textContent = noticeText; notice.dataset.state = noticeError ? 'error' : 'ok'; }
}
function commit(result, successMessage) {
  const ctx = context(); const previousWallet = ctx.wallet; const previousState = state;
  try {
    if (result.wallet !== previousWallet) { save.money = result.wallet; persist(); }
    if (!persistState(result.state)) throw new Error('digital-life storage unavailable');
    state = normalizeDigitalLifeState(result.state);
    window.dispatchEvent(new CustomEvent('kano:digital-life-updated', { detail: { day: context().day } }));
    context().ui?.refreshWallet?.();
    window.kanoNorthernDriverLifeSimulation?.refresh?.();
    render(); notify(successMessage || result.message || 'Digital-life update saved.');
  } catch {
    if (result.wallet !== previousWallet) { save.money = previousWallet; try { persist(); } catch {} }
    state = previousState;
    notify('Could not safely save this action. The wallet was restored where possible.', true); render();
  }
}
function handleBundle(bundleId) {
  const ctx = context();
  const result = buyDigitalData(state, { bundleId, wallet: ctx.wallet, activeShift: ctx.activeShift });
  const messages = { active_shift: 'Finish the driving shift first.', invalid_bundle: 'Choose one of the listed data bundles.', insufficient_wallet: `You need ${money(result.required)}. No money was taken.`, data_cap: `Your data balance cannot exceed ${DIGITAL_DATA_CAP_MB} MB.` };
  if (!result.ok) { notify(messages[result.reason] || 'Data purchase could not be completed.', true); render(); return; }
  commit(result, result.message);
}
function handleChoice(choiceId) {
  const ctx = context();
  const result = resolveDigitalScenario(state, { choiceId, day: ctx.day, activeShift: ctx.activeShift, wallet: ctx.wallet });
  const messages = { active_shift: 'Online actions are locked while driving. Stop safely first.', clock_rollback: 'The simulated clock moved backwards; no action was recorded.', scenario_not_pending: 'This situation has already been resolved or expired.', invalid_choice: 'That choice is not available.', insufficient_data: `This choice needs ${result.requiredDataMb} MB. Buy data after the shift.`, insufficient_wallet: `You need ${money(result.required)}. No money was taken.` };
  if (!result.ok) { notify(messages[result.reason] || 'Action could not be completed.', true); render(); return; }
  commit(result, result.message);
}
function exportReport() {
  const payload = digitalLifeReport(state, { day: context().day });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `kano-digital-life-day-${context().day}.json`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Digital-life report exported.');
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  const ensure = () => { installStyles(); ensureSection(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  for (const id of ['life-career-btn', 'life-career-menu-btn']) el(id)?.addEventListener('click', () => queueMicrotask(ensure));
  if (document.documentElement && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => { if (document.querySelector('#kano-life-career-screen .klc-panel') && !el(SECTION_ID)) ensure(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:phone-life-updated', 'kano:relationship-status-updated', 'kano:family-responsibilities-updated', 'kano:society-markets-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverDigitalLife = {
    version: 1,
    snapshot: () => digitalLifeReport(state, { day: context().day }),
    export: () => JSON.stringify(digitalLifeReport(state, { day: context().day }), null, 2),
    refresh: render,
  };
  ensure();
}
install();
console.info('[Kano Life] Digital life, data bundles and online-opportunity simulation registered.');
