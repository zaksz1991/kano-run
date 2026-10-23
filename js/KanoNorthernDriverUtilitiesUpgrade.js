/** Step 60 runtime panel: household NEPA reality and backup generator management. */
import { save, persist } from './storage.js';
import {
  UTILITIES_STORAGE_KEY, GENERATOR_FUEL_BUNDLE, POWER_PLANS,
  createDefaultUtilitiesState, normalizeUtilitiesState, householdPowerReport,
  setSupplyPlan, buyGeneratorFuel, runGeneratorHour, recordUtilityComplaint,
  exportUtilitiesReport,
} from './KanoNorthernDriverHouseholdUtilities.js';

const SECTION_ID = 'kano-household-utilities';
const STYLE_ID = 'khu-style';
const INSTALL_KEY = Symbol.for('kano.life.householdUtilities.installed.v1');
const ISSUE_OPTIONS = Object.freeze([
  { id: 'no-supply', label: 'Power outage / no supply' },
  { id: 'meter-billing', label: 'Meter or billing question' },
  { id: 'low-voltage', label: 'Low voltage' },
]);
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
let state = loadState();
let observer = null;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(UTILITIES_STORAGE_KEY);
    return normalizeUtilitiesState(raw ? JSON.parse(raw) : createDefaultUtilitiesState());
  } catch { return createDefaultUtilitiesState(); }
}
function persistState(next) {
  try {
    globalThis.localStorage?.setItem(UTILITIES_STORAGE_KEY, JSON.stringify(normalizeUtilitiesState(next)));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const society = typeof window !== 'undefined' ? window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? society.day ?? 1;
  const day = Math.max(1, Math.floor(Number(rawDay) || 1));
  const activeShift = Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state)));
  return { ui, game, day, activeShift, wallet: Math.max(0, Math.floor(Number(save.money) || 0)) };
}
function safeText(value) { return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 200); }
function notify(message, error = false) {
  const node = el('khu-notice');
  if (node) { node.textContent = safeText(message); node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .khu-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .khu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .khu-card{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .khu-card h4{margin:0 0 8px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} label{display:flex;flex-direction:column;gap:5px;margin:8px 0;color:#dce8f0;font-size:12px;font-weight:750}
    #${SECTION_ID} select{width:100%;min-height:44px;border:1px solid #45677d;border-radius:8px;background:#0b1a27;color:#fff;padding:9px 10px;font:inherit;font-size:16px}
    #${SECTION_ID} button{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .khu-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    #${SECTION_ID} .khu-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .khu-stat{font-size:20px;font-weight:900;margin:6px 0;color:#f8fbff}
    #${SECTION_ID} .khu-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .khu-notice[data-state="error"]{color:#ffb4aa}
    #${SECTION_ID} .khu-log{display:grid;gap:6px;margin-top:9px}
    #${SECTION_ID} .khu-log-item{font-size:11px;line-height:1.45;color:#bdced9;background:#091723;padding:8px;border-radius:7px}
    @media(max-width:520px){#${SECTION_ID} .khu-grid{grid-template-columns:1fr}#${SECTION_ID} .khu-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .khu-actions button{width:100%}}
  `;
  document.head.append(style);
}
function createSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  const anchor = el('kano-festival-economy') || el('kano-society-markets');
  if (!host || !anchor) return null;
  let section = el(SECTION_ID);
  if (!section) {
    section = document.createElement('section'); section.id = SECTION_ID;
    section.innerHTML = `
      <h3 class="klc-section-title">HOUSEHOLD POWER · NEPA · GENERATOR RESERVE</h3>
      <p class="khu-note">Manage fictional in-game household electricity reliability during outages. This is separate from the keke's fuel tank and from the generator; fuel is paid when purchased and is not charged again when used.</p>
      <div class="khu-grid">
        <div class="khu-card"><h4>Public electricity supply</h4>
          <label for="khu-plan">Household supply pattern<select id="khu-plan"></select></label>
          <p id="khu-supply-hours" class="khu-stat" aria-live="polite"></p>
          <p id="khu-outage-note" class="khu-note"></p>
          <p id="khu-food-risk" class="khu-note"></p>
        </div>
        <div class="khu-card"><h4>Backup generator reserve</h4>
          <p id="khu-generator-hours" class="khu-stat"></p>
          <p id="khu-generator-use" class="khu-note"></p>
          <div class="khu-actions"><button type="button" class="khu-primary" data-khu-action="buy-fuel">BUY 5 GENERATOR-HOURS · ${money(GENERATOR_FUEL_BUNDLE.cost)}</button><button type="button" data-khu-action="run-generator">RUN GENERATOR · 1 HOUR</button></div>
          <p class="khu-note">Game price only. Up to ${GENERATOR_FUEL_BUNDLE.dailyUseLimitHours} simulated generator-hours can be used per in-game day.</p>
        </div>
      </div>
      <div class="khu-card"><h4>Electricity service complaint</h4>
        <p class="khu-note">Record an issue for roleplay and civic history. This does not award money, guarantee a repair or automatically accuse a real person or company.</p>
        <label for="khu-issue">Issue<select id="khu-issue"></select></label>
        <div id="khu-ticket-note" class="khu-note"></div>
        <div class="khu-actions"><button type="button" data-khu-action="complaint">RECORD COMPLAINT</button><button type="button" data-khu-action="export">EXPORT UTILITY REPORT (.JSON)</button></div>
      </div>
      <div class="khu-card" style="margin-top:10px"><h4>Recent household utility history</h4><div id="khu-ledger" class="khu-log"></div></div>
      <p class="khu-note">Important: the existing Society & Markets panel remains responsible for the weekly NEPA / household electricity contribution. This feature does not create a second electricity bill or duplicate that payment. Supply hours, generator costs and outages are simulated, not live data or official tariffs.</p>
      <p id="khu-notice" class="khu-notice" role="status" aria-live="polite"></p>
    `;
    anchor.after(section);
    for (const plan of POWER_PLANS) { const option = document.createElement('option'); option.value = plan.id; option.textContent = plan.label; el('khu-plan').append(option); }
    for (const issue of ISSUE_OPTIONS) { const option = document.createElement('option'); option.value = issue.id; option.textContent = issue.label; el('khu-issue').append(option); }
    el('khu-plan')?.addEventListener('change', () => {
      const result = setSupplyPlan(state, { supplyPlan: el('khu-plan')?.value, activeShift: context().activeShift });
      if (!result.ok) { notify('Finish driving before changing the household supply plan.', true); render(); return; }
      state = result.state;
      if (!persistState(state)) { notify('Could not save the supply choice.', true); state = loadState(); }
      else notify('Household supply pattern saved. Existing bills are unchanged.');
      render();
    });
    section.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-khu-action]'); if (!button) return;
      const action = button.dataset.khuAction;
      if (action === 'buy-fuel') doBuyFuel();
      if (action === 'run-generator') doRunGenerator();
      if (action === 'complaint') doComplaint();
      if (action === 'export') exportReport();
    });
  }
  return section;
}
function commit(nextState, nextWallet, message) {
  const ctx = context(); const oldWallet = ctx.wallet; const safeWallet = Math.max(0, Math.floor(Number(nextWallet) || 0));
  try {
    if (safeWallet !== oldWallet) { save.money = safeWallet; if (typeof persist === 'function') persist(); }
    if (!persistState(nextState)) throw new Error('utilities_storage_unavailable');
    state = normalizeUtilitiesState(nextState);
    ctx.ui?.refreshWallet?.();
    window.kanoNorthernDriverLifeSimulation?.refresh?.();
    render(); notify(message); return true;
  } catch {
    if (safeWallet !== oldWallet) { save.money = oldWallet; try { if (typeof persist === 'function') persist(); } catch {} }
    state = loadState(); render(); notify('Could not save the utility action. The wallet was restored where possible.', true); return false;
  }
}
function doBuyFuel() {
  const ctx = context(); const result = buyGeneratorFuel(state, { wallet: ctx.wallet, activeShift: ctx.activeShift, day: ctx.day });
  const messages = { shift_active: 'Finish the driving segment before buying household generator fuel.', reserve_full: 'The generator fuel reserve is already at capacity.', insufficient_wallet: `You need ${money(result.required)} for this simulated fuel bundle.` };
  if (!result.ok) { notify(messages[result.reason] || 'Generator fuel could not be purchased.', true); return; }
  commit(result.state, result.wallet, `Bought ${result.hoursAdded} generator-hours for ${money(result.cost)}. This cost is charged once at purchase.`);
}
function doRunGenerator() {
  const ctx = context(); const result = runGeneratorHour(state, { day: ctx.day, activeShift: ctx.activeShift });
  const messages = { shift_active: 'Household generator controls are locked while a driving segment is active.', no_generator_fuel: 'Buy household generator fuel before using the generator.', daily_limit: 'The daily simulated generator-use limit has been reached.' };
  if (!result.ok) { notify(messages[result.reason] || 'Generator could not be used.', true); return; }
  commit(result.state, ctx.wallet, `Generator used for one simulated hour. ${result.fuelHoursRemaining} hour(s) remain in reserve.`);
}
function doComplaint() {
  const ctx = context(); const result = recordUtilityComplaint(state, { day: ctx.day, issue: el('khu-issue')?.value, activeShift: ctx.activeShift });
  const messages = { shift_active: 'Finish the driving segment before recording a household utility complaint.', already_recorded_today: 'You already recorded a utility complaint today.', unknown_issue: 'Choose a listed issue.' };
  if (!result.ok) { notify(messages[result.reason] || 'Complaint could not be recorded.', true); return; }
  commit(result.state, ctx.wallet, 'Utility complaint recorded. No compensation or reputation reward was added.');
  window.dispatchEvent(new CustomEvent('kano:household-utility-updated', { detail: { day: ctx.day, issue: result.ticket.issue } }));
}
function exportReport() {
  const ctx = context(); const data = exportUtilitiesReport(state, ctx.day);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `kano-household-utilities-day-${ctx.day}.json`; link.click(); URL.revokeObjectURL(url);
  notify('Household utility report exported.');
}
function render() {
  if (typeof document === 'undefined' || !el(SECTION_ID)) return;
  const ctx = context(); const nextState = normalizeUtilitiesState(state); state = nextState;
  const report = householdPowerReport(state, ctx.day);
  if (el('khu-plan')) el('khu-plan').value = state.supplyPlan;
  const changeLocked = ctx.activeShift;
  if (el('khu-plan')) el('khu-plan').disabled = changeLocked;
  if (el('khu-supply-hours')) el('khu-supply-hours').textContent = `${report.supplyHours} / 24 estimated supply hours`;
  if (el('khu-outage-note')) el('khu-outage-note').textContent = `Simulated interruption allowance: about ${report.outageHours} hour(s) today (in-game day ${ctx.day}).`;
  if (el('khu-food-risk')) el('khu-food-risk').textContent = `Perishable-food / temperature-sensitive storage disruption risk: ${report.foodRisk}. This is a reminder only; the panel does not destroy pantry items or apply an automatic loss.`;
  if (el('khu-generator-hours')) el('khu-generator-hours').textContent = `${report.generatorFuelHours} generator-hour(s) in reserve`;
  if (el('khu-generator-use')) el('khu-generator-use').textContent = `Used today: ${report.generatorHoursUsedToday} / ${GENERATOR_FUEL_BUNDLE.dailyUseLimitHours} hours. Wallet: ${money(ctx.wallet)}. The keke fuel tank is separate.`;
  const buy = el('khu-generator-fuel');
  const buyButton = el(SECTION_ID)?.querySelector('[data-khu-action="buy-fuel"]');
  if (buyButton) buyButton.disabled = ctx.activeShift || !report.canBuyFuel || ctx.wallet < GENERATOR_FUEL_BUNDLE.cost;
  const runButton = el(SECTION_ID)?.querySelector('[data-khu-action="run-generator"]');
  if (runButton) runButton.disabled = ctx.activeShift || !report.canRunGenerator;
  const complaintButton = el(SECTION_ID)?.querySelector('[data-khu-action="complaint"]');
  if (complaintButton) complaintButton.disabled = ctx.activeShift || !report.canFileComplaint;
  if (el('khu-ticket-note')) el('khu-ticket-note').textContent = report.openTicket ? `Latest recorded ticket: ${report.openTicket.issue}, day ${report.openTicket.day}, status ${report.openTicket.status}. Tickets are roleplay records only.` : 'No household utility complaint recorded yet.';
  const ledger = el('khu-ledger');
  if (ledger) { ledger.replaceChildren(); const rows = state.ledger.slice(0, 8); if (!rows.length) { const note = document.createElement('div'); note.className = 'khu-log-item'; note.textContent = 'No household utility actions recorded yet.'; ledger.append(note); } else for (const item of rows) { const row = document.createElement('div'); row.className = 'khu-log-item'; row.textContent = `Day ${item.day} · ${item.text}${item.amount ? ` · ${money(Math.abs(item.amount))} ${item.amount < 0 ? 'cost' : 'credit'}` : ''}`; ledger.append(row); } }
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  const ensure = () => { installStyles(); createSection(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  for (const id of ['life-career-btn', 'life-career-menu-btn']) el(id)?.addEventListener('click', () => queueMicrotask(ensure));
  if (document.documentElement && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => { if ((el('kano-festival-economy') || el('kano-society-markets')) && !el(SECTION_ID)) ensure(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:fuel-market-updated', 'kano:driver-compliance-updated', 'kano:festival-calendar-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverHouseholdUtilities = {
    version: 1,
    snapshot: () => ({ ...householdPowerReport(state, context().day), state: normalizeUtilitiesState(state) }),
    export: () => JSON.stringify(exportUtilitiesReport(state, context().day), null, 2),
    refresh: render,
  };
}
install();
