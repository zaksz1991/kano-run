import './KanoNorthernDriverFamilyResponsibilitiesUpgrade.js';
/** Step 61 UI: household water access, hygiene routines and sanitation. */
import { save, persist } from './storage.js';
import {
  HOUSEHOLD_WATER_STORAGE_KEY, MAX_HOUSEHOLD_WATER_LITRES, WATER_ACCESS_MODES, WATER_BUNDLES, HOUSEHOLD_WATER_TASKS,
  createDefaultHouseholdWaterState, normalizeHouseholdWaterState, householdWaterReport,
  setHouseholdWaterAccess, collectHouseholdWater, buyHouseholdWater,
  completeHouseholdWaterTask, recordHouseholdWaterShortage, exportHouseholdWaterReport,
} from './KanoNorthernDriverHouseholdWater.js';

const SECTION_ID = 'kano-household-water';
const STYLE_ID = 'khw-style';
const INSTALL_KEY = Symbol.for('kano.life.householdWater.installed.v1');
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
let state = loadState();

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(HOUSEHOLD_WATER_STORAGE_KEY);
    return normalizeHouseholdWaterState(raw ? JSON.parse(raw) : createDefaultHouseholdWaterState());
  } catch { return createDefaultHouseholdWaterState(); }
}
function persistState(next) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(HOUSEHOLD_WATER_STORAGE_KEY, JSON.stringify(normalizeHouseholdWaterState(next)));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const society = typeof window !== 'undefined' ? window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? society.day ?? 1;
  return {
    ui, game,
    day: Math.max(1, Math.floor(Number(rawDay) || 1)),
    activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))),
    wallet: Math.max(0, Math.floor(Number(save.money) || 0)),
  };
}
function safeText(value) { return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 200); }
function notify(message, error = false) {
  const node = el('khw-notice');
  if (node) { node.textContent = safeText(message); node.dataset.state = error ? 'error' : 'ok'; }
  context().ui?.toast?.(String(message));
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .khw-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .khw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .khw-card{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .khw-card h4{margin:0 0 8px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} label{display:flex;flex-direction:column;gap:5px;margin:8px 0;color:#dce8f0;font-size:12px;font-weight:750}
    #${SECTION_ID} select{width:100%;min-height:44px;border:1px solid #45677d;border-radius:8px;background:#0b1a27;color:#fff;padding:9px 10px;font:inherit;font-size:16px}
    #${SECTION_ID} button{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .khw-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    #${SECTION_ID} .khw-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .khw-stat{font-size:20px;font-weight:900;margin:6px 0;color:#f8fbff}
    #${SECTION_ID} .khw-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .khw-notice[data-state="error"]{color:#ffb4aa}
    #${SECTION_ID} .khw-log{display:grid;gap:6px;margin-top:9px}
    #${SECTION_ID} .khw-log-item{font-size:11px;line-height:1.45;color:#bdced9;background:#091723;padding:8px;border-radius:7px}
    @media(max-width:520px){#${SECTION_ID} .khw-grid{grid-template-columns:1fr}#${SECTION_ID} .khw-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .khw-actions button{width:100%}}
  `;
  document.head.append(style);
}
function createSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  const anchor = el('kano-household-utilities') || el('kano-festival-economy') || el('kano-society-markets');
  if (!host || !anchor) return null;
  let section = el(SECTION_ID);
  if (section) return section;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">HOUSEHOLD WATER · HYGIENE · SANITATION</h3>
    <p class="khw-note">Manage household water reserves and explicit daily routines. Water is not deducted automatically. All volumes and prices are fictional gameplay values, not market quotations. This panel does not diagnose health conditions.</p>
    <div class="khw-grid">
      <div class="khw-card"><h4>Water access and reserve</h4>
        <label for="khw-access">Household water access<select id="khw-access"></select></label>
        <p id="khw-reserve" class="khw-stat" aria-live="polite"></p><p id="khw-status" class="khw-note"></p>
        <div class="khw-actions"><button type="button" class="khw-primary" data-khw-action="collect">COLLECT AVAILABLE HOUSEHOLD WATER</button><button type="button" data-khw-action="shortage">RECORD WATER SHORTAGE</button></div>
        <p id="khw-collect-note" class="khw-note"></p>
      </div>
      <div class="khw-card"><h4>Buy a water reserve</h4>
        <p class="khw-note">Packaged drinking water: 10 L · ${money(WATER_BUNDLES.find(x => x.id === 'packaged').cost)}. Water vendor: 50 L · ${money(WATER_BUNDLES.find(x => x.id === 'vendor').cost)}. Small tanker: 200 L · ${money(WATER_BUNDLES.find(x => x.id === 'tanker').cost)}.</p>
        <div class="khw-actions"><button type="button" data-khw-buy="packaged">BUY 10 L PACKAGED · ${money(WATER_BUNDLES.find(x => x.id === 'packaged').cost)}</button><button type="button" data-khw-buy="vendor">BUY 50 L VENDOR · ${money(WATER_BUNDLES.find(x => x.id === 'vendor').cost)}</button><button type="button" data-khw-buy="tanker">BUY 200 L TANKER · ${money(WATER_BUNDLES.find(x => x.id === 'tanker').cost)}</button></div>
        <p id="khw-wallet" class="khw-note"></p>
      </div>
    </div>
    <div class="khw-card"><h4>Daily household routines</h4><p class="khw-note">Tasks use stored water and can only be repeated according to each routine's in-game cooldown. They adjust roleplay meters; they do not diagnose or prevent medical conditions.</p>
      <div class="khw-grid" id="khw-task-grid"></div>
      <div id="khw-meter-note" class="khw-note"></div>
    </div>
    <div class="khw-card" style="margin-top:10px"><h4>Household water history</h4><div id="khw-ledger" class="khw-log"></div><div class="khw-actions"><button type="button" data-khw-action="export">EXPORT WATER & SANITATION REPORT (.JSON)</button></div></div>
    <p id="khw-notice" class="khw-notice" role="status" aria-live="polite"></p>
  `;
  anchor.after(section);
  for (const mode of WATER_ACCESS_MODES) {
    const option = document.createElement('option'); option.value = mode.id; option.textContent = mode.label; el('khw-access').append(option);
  }
  section.addEventListener('change', event => {
    if (event.target?.id !== 'khw-access') return;
    const result = setHouseholdWaterAccess(state, { accessMode: event.target.value, activeShift: context().activeShift });
    if (!result.ok) { notify('Finish the current driving segment before changing household water access.', true); render(); return; }
    commit(result.state, context().wallet, 'Household water access preference saved. No money was charged.');
  });
  section.addEventListener('click', event => {
    const taskButton = event.target?.closest?.('[data-khw-task]');
    if (taskButton) { doTask(taskButton.dataset.khwTask); return; }
    const buyButton = event.target?.closest?.('[data-khw-buy]');
    if (buyButton) { doBuy(buyButton.dataset.khwBuy); return; }
    const button = event.target?.closest?.('[data-khw-action]'); if (!button) return;
    const action = button.dataset.khwAction;
    if (action === 'collect') doCollect();
    if (action === 'shortage') doShortage();
    if (action === 'export') exportReport();
  });
  return section;
}
function commit(nextState, nextWallet, message) {
  const ctx = context(); const oldWallet = ctx.wallet; const safeWallet = Math.max(0, Math.floor(Number(nextWallet) || 0));
  try {
    if (safeWallet !== oldWallet) { save.money = safeWallet; if (typeof persist === 'function') persist(); }
    if (!persistState(nextState)) throw new Error('water_storage_unavailable');
    state = normalizeHouseholdWaterState(nextState);
    ctx.ui?.refreshWallet?.();
    window.kanoNorthernDriverLifeSimulation?.refresh?.();
    render(); notify(message); return true;
  } catch {
    if (safeWallet !== oldWallet) { save.money = oldWallet; try { if (typeof persist === 'function') persist(); } catch {} }
    state = loadState(); render(); notify('Could not save the household water action. The wallet was restored where possible.', true); return false;
  }
}
function doCollect() {
  const ctx = context(); const result = collectHouseholdWater(state, { day: ctx.day, activeShift: ctx.activeShift });
  const messages = { shift_active: 'Finish driving before collecting household water.', already_collected_today: 'Water was already collected from this supply today.', paid_only: 'This household setting relies on purchased water; choose a bundle instead.', not_supply_day: 'Scheduled piped supply is not available for collection on this in-game day.', reserve_full: 'The household water reserve is full.' };
  if (!result.ok) { notify(messages[result.reason] || 'Water collection is not available.', true); return; }
  commit(result.state, ctx.wallet, `Collected ${result.litresAdded} L of household water.`);
  window.dispatchEvent(new CustomEvent('kano:household-water-updated', { detail: { day: ctx.day, type: 'collection', litres: result.litresAdded } }));
}
function doBuy(bundleId) {
  const ctx = context(); const result = buyHouseholdWater(state, { bundleId, wallet: ctx.wallet, activeShift: ctx.activeShift, day: ctx.day });
  const messages = { shift_active: 'Finish driving before purchasing household water.', unknown_bundle: 'Choose a listed water bundle.', reserve_full: 'That bundle would exceed the 500 L storage limit. Use some water first.', insufficient_wallet: `You need ${money(result.required)} in the existing wallet.`, };
  if (!result.ok) { notify(messages[result.reason] || 'Water purchase was not completed.', true); return; }
  if (!commit(result.state, result.wallet, `Purchased ${result.litresAdded} L of household water for ${money(result.cost)}.`)) return;
  window.dispatchEvent(new CustomEvent('kano:household-water-updated', { detail: { day: ctx.day, type: 'purchase', litres: result.litresAdded, amount: result.cost } }));
}
function doTask(taskId) {
  const ctx = context(); const result = completeHouseholdWaterTask(state, { taskId, day: ctx.day, activeShift: ctx.activeShift });
  const messages = { shift_active: 'Finish the driving segment before managing household routines.', unknown_task: 'Choose a listed household routine.', cooldown: `This routine is on cooldown until in-game day ${result.nextEligibleDay}.`, insufficient_water: `This routine needs ${result.required} L, but only ${result.available} L remain.` };
  if (!result.ok) { notify(messages[result.reason] || 'The household routine could not be completed.', true); return; }
  commit(result.state, context().wallet, `${HOUSEHOLD_WATER_TASKS[taskId].label}: used ${result.litresUsed} L.`);
  window.dispatchEvent(new CustomEvent('kano:household-water-updated', { detail: { day: ctx.day, type: 'task', taskId, litres: result.litresUsed } }));
}
function doShortage() {
  const ctx = context(); const result = recordHouseholdWaterShortage(state, { day: ctx.day, activeShift: ctx.activeShift });
  const messages = { shift_active: 'Finish driving before recording a household water issue.', already_recorded_today: 'A water-shortage note is already recorded for this in-game day.' };
  if (!result.ok) { notify(messages[result.reason] || 'Water-shortage note was not recorded.', true); return; }
  commit(result.state, ctx.wallet, 'Water-shortage note recorded. No cash or reputation reward was added.');
}
function exportReport() {
  const ctx = context(); const data = exportHouseholdWaterReport(state, ctx.day);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `kano-household-water-day-${ctx.day}.json`; link.click(); URL.revokeObjectURL(url);
  notify('Household water report exported.');
}
function render() {
  const section = el(SECTION_ID); if (!section) return;
  const ctx = context(); state = normalizeHouseholdWaterState(state);
  const report = householdWaterReport(state, ctx.day);
  if (el('khw-access')) { el('khw-access').value = state.accessMode; el('khw-access').disabled = ctx.activeShift; }
  if (el('khw-reserve')) el('khw-reserve').textContent = `${report.waterLitres} / ${report.maxLitres} litres stored`;
  if (el('khw-status')) el('khw-status').textContent = report.status === 'low' ? 'Reserve is low: fewer than 20 L remain.' : report.status === 'watch' ? 'Reserve needs attention: fewer than 60 L remain.' : 'Reserve is currently adequate for some household tasks.';
  if (el('khw-collect-note')) {
    const reasons = { already_collected_today: 'Collection already used today.', paid_only: 'This access mode has no free collection; purchased bundles remain available.', not_supply_day: 'No scheduled pipe collection today. Next simulated supply day follows the three-day cycle.', reserve_full: 'Reserve at capacity.' };
    el('khw-collect-note').textContent = report.collectionAvailable ? `Available today: up to ${report.collectionLitres} L without a cash charge.` : reasons[report.collectionUnavailableReason] || 'No free collection is available today.';
  }
  const collect = section.querySelector('[data-khw-action="collect"]'); if (collect) collect.disabled = ctx.activeShift || !report.collectionAvailable;
  const shortage = section.querySelector('[data-khw-action="shortage"]'); if (shortage) shortage.disabled = ctx.activeShift || state.ledger.some(row => row.day === ctx.day && row.type === 'water-shortage');
  if (el('khw-wallet')) el('khw-wallet').textContent = `Existing wallet: ${money(ctx.wallet)}. Water purchases use this wallet and do not touch savings.`;
  for (const button of section.querySelectorAll('[data-khw-buy]')) {
    const bundle = WATER_BUNDLES.find(x => x.id === button.dataset.khwBuy);
    button.disabled = ctx.activeShift || !bundle || ctx.wallet < bundle.cost || state.waterLitres + (bundle?.litres || 0) > MAX_HOUSEHOLD_WATER_LITRES;
  }
  const taskGrid = el('khw-task-grid');
  if (taskGrid) {
    taskGrid.replaceChildren();
    for (const [taskId, task] of Object.entries(HOUSEHOLD_WATER_TASKS)) {
      const eligibility = report.tasks[taskId];
      const card = document.createElement('div'); card.className = 'khw-card';
      const title = document.createElement('h4'); title.textContent = task.label; card.append(title);
      const detail = document.createElement('p'); detail.className = 'khw-note'; detail.textContent = `${task.litres} L required · ${eligibility.eligible ? 'available by schedule' : `available again on day ${eligibility.lastDoneDay + task.cooldownDays}`}`; card.append(detail);
      const btn = document.createElement('button'); btn.type = 'button'; btn.dataset.khwTask = taskId; btn.textContent = `COMPLETE ROUTINE · ${task.litres} L`; btn.disabled = ctx.activeShift || !eligibility.canComplete; card.append(btn);
      taskGrid.append(card);
    }
  }
  if (el('khw-meter-note')) el('khw-meter-note').textContent = `Roleplay meters — hygiene ${state.meters.hygiene}/100 · clothing care ${state.meters.clothingCare}/100 · household order ${state.meters.householdOrder}/100 · meal readiness ${state.meters.mealReadiness}/100.`;
  const ledger = el('khw-ledger');
  if (ledger) {
    ledger.replaceChildren(); const rows = state.ledger.slice(0, 8);
    if (!rows.length) { const note = document.createElement('div'); note.className = 'khw-log-item'; note.textContent = 'No household water actions recorded yet.'; ledger.append(note); }
    else for (const item of rows) { const row = document.createElement('div'); row.className = 'khw-log-item'; row.textContent = `Day ${item.day} · ${item.text}${item.litres ? ` · ${item.litres} L` : ''}${item.amount ? ` · ${money(Math.abs(item.amount))} ${item.amount < 0 ? 'cost' : 'credit'}` : ''}`; ledger.append(row); }
  }
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  const ensure = () => { installStyles(); const section = createSection(); if (section) render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  for (const id of ['life-career-btn', 'life-career-menu-btn']) el(id)?.addEventListener('click', () => queueMicrotask(ensure));
  if (!el(SECTION_ID) && document.documentElement && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if ((el('kano-household-utilities') || el('kano-festival-economy') || el('kano-society-markets')) && !el(SECTION_ID)) ensure();
      if (el(SECTION_ID)) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:household-utility-updated', 'kano:festival-calendar-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverHouseholdWater = {
    version: 1,
    snapshot: () => ({ ...householdWaterReport(state, context().day), state: normalizeHouseholdWaterState(state) }),
    export: () => JSON.stringify(exportHouseholdWaterReport(state, context().day), null, 2),
    refresh: render,
  };
}
install();
