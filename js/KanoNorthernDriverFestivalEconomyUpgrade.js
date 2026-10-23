/** Runtime forecast and festival-budget panel for the existing Kano Society UI. */
import { save } from './storage.js';
import {
  marketSeasonForDay, seasonalMarketMultiplier, seasonalPriceEffectPercent,
  nextMarketSeason, normalizeFestivalBudget, festivalBudgetSummary,
} from './KanoNorthernDriverFestivalEconomy.js';

const SECTION_ID = 'kano-festival-economy';
const STORAGE_KEY = 'kano-life-festival-economy-budget-v1';
const STYLE_ID = 'kfe-style';
const INSTALL_KEY = Symbol.for('kano.life.festivalEconomy.installed.v1');
let observer = null;
let state = loadState();

const OCCASIONS = Object.freeze([
  { id: 'general', label: 'General household / community occasion' },
  { id: 'family-gathering', label: 'Family gathering or naming ceremony' },
  { id: 'wedding', label: 'Aure / wedding celebration' },
  { id: 'eid-sallah', label: 'Eid / Sallah family visits' },
  { id: 'ramadan', label: 'Ramadan household planning' },
  { id: 'christian-celebration', label: 'Christmas or Christian community celebration' },
  { id: 'harvest-market', label: 'Harvest / market restocking season' },
  { id: 'school-term', label: 'School-term and household costs' },
]);
const GROUPS = Object.freeze([
  { id: 'grains-roots', label: 'Grains, maize, millet and roots' },
  { id: 'fresh-produce', label: 'Vegetables and fresh produce' },
  { id: 'provisions', label: 'Provisions and household food' },
  { id: 'textiles', label: 'Fabrics and textiles' },
  { id: 'thrift', label: 'Second-hand clothes and footwear' },
]);
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { budget: normalizeFestivalBudget({}) };
    const value = JSON.parse(raw);
    return { budget: normalizeFestivalBudget(value?.budget || value) };
  } catch { return { budget: normalizeFestivalBudget({}) }; }
}
function persistState() {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const society = window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? society.day ?? 1;
  const day = Math.max(1, Math.floor(Number(rawDay) || 1));
  const faithPreference = ['private', 'muslim', 'christian', 'other', 'none'].includes(society.faithPreference) ? society.faithPreference : 'private';
  return { ui, game, day, faithPreference, wallet: Math.max(0, Math.floor(Number(save.money) || 0)) };
}
function safeText(value) { return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 180); }
function notify(message, error = false) {
  const node = el('kfe-notice');
  if (node) { node.textContent = safeText(message); node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kfe-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kfe-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kfe-card{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .kfe-card h4{margin:0 0 8px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} label{display:flex;flex-direction:column;gap:5px;margin:8px 0;color:#dce8f0;font-size:12px;font-weight:750}
    #${SECTION_ID} select,#${SECTION_ID} input{width:100%;min-height:44px;border:1px solid #45677d;border-radius:8px;background:#0b1a27;color:#fff;padding:9px 10px;font:inherit;font-size:16px}
    #${SECTION_ID} button{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} .kfe-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    #${SECTION_ID} .kfe-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .kfe-line{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #203849;font-size:12px}
    #${SECTION_ID} .kfe-delta{font-weight:900;text-align:right;white-space:nowrap}
    #${SECTION_ID} .kfe-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .kfe-notice[data-state="error"]{color:#ffb4aa}
    @media(max-width:520px){#${SECTION_ID} .kfe-grid{grid-template-columns:1fr}#${SECTION_ID} .kfe-line{grid-template-columns:minmax(0,1fr) auto}#${SECTION_ID} .kfe-delta:last-child{grid-column:2}}
  `;
  document.head.append(style);
}
function createSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  const society = el('kano-society-markets');
  if (!host || !society) return null;
  let section = el(SECTION_ID);
  if (!section) {
    section = document.createElement('section'); section.id = SECTION_ID;
    section.innerHTML = `
      <h3 class="klc-section-title">FESTIVAL SEASONS · FAMILY OCCASIONS · MARKET RHYTHM</h3>
      <p class="kfe-note">This optional planner connects the game's illustrative community calendar to seasonal market demand. Food, fabrics and second-hand goods can become more expensive or sell at a different simulated price as supply and occasion demand change. No religious observance or celebration is compulsory.</p>
      <div class="kfe-grid">
        <div class="kfe-card"><h4 id="kfe-season-title">Current market season</h4><p id="kfe-season-note" class="kfe-note"></p><p id="kfe-calendar-note" class="kfe-note"></p><p id="kfe-next-season" class="kfe-note"></p></div>
        <div class="kfe-card"><h4>Seasonal market price pressure</h4><p class="kfe-note">Percentages below are the additional seasonal modifier only. The existing market index and weekly demand swing still apply.</p><div id="kfe-market-effects"></div><p class="kfe-note">All seasonal factors and prices are fictional gameplay balancing values, not live quotes or a real religious calendar.</p></div>
      </div>
      <div class="kfe-card"><h4>Prepare a family or festival budget</h4>
        <label for="kfe-occasion">Occasion<select id="kfe-occasion"></select></label>
        <div class="kfe-grid">
          <label for="kfe-food">Food and hosting reserve (₦)<input id="kfe-food" type="number" min="0" max="250000" step="100" inputmode="numeric"></label>
          <label for="kfe-clothing">Clothes, shoes and grooming (₦)<input id="kfe-clothing" type="number" min="0" max="250000" step="100" inputmode="numeric"></label>
          <label for="kfe-transport">Transport, fuel and phone credit (₦)<input id="kfe-transport" type="number" min="0" max="250000" step="100" inputmode="numeric"></label>
          <label for="kfe-gifts">Gifts and family visits (₦)<input id="kfe-gifts" type="number" min="0" max="250000" step="100" inputmode="numeric"></label>
          <label for="kfe-household">Household contribution (₦)<input id="kfe-household" type="number" min="0" max="250000" step="100" inputmode="numeric"></label>
        </div>
        <div id="kfe-budget-summary" aria-live="polite" class="kfe-note"></div>
        <div class="kfe-actions"><button type="button" class="kfe-primary" data-kfe-action="save">SAVE PLAN</button><button type="button" data-kfe-action="export">EXPORT PLAN (.JSON)</button></div>
        <p class="kfe-note">Saving this plan does not reserve, transfer or deduct wallet money. It is an estimate to help balance working costs, family obligations and occasion spending.</p>
      </div>
      <p id="kfe-notice" class="kfe-notice" role="status" aria-live="polite"></p>
    `;
    society.after(section);
    for (const item of OCCASIONS) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; el('kfe-occasion').append(option); }
    for (const [id, key] of [['kfe-food','food'],['kfe-clothing','clothing'],['kfe-transport','transport'],['kfe-gifts','gifts'],['kfe-household','household']]) {
      el(id)?.addEventListener('input', renderBudgetSummary);
    }
    section.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-kfe-action]'); if (!button) return;
      const action = button.dataset.kfeAction;
      if (action === 'save') saveBudget();
      if (action === 'export') exportBudget();
    });
  }
  return section;
}
function readBudgetInputs() {
  const current = state.budget;
  const read = (id, fallback) => {
    const input = el(id); const raw = input?.value;
    if (raw === '' || raw == null) return fallback;
    const n = Number(raw); return Number.isFinite(n) ? Math.max(0, Math.min(250000, Math.floor(n))) : fallback;
  };
  return normalizeFestivalBudget({
    occasion: el('kfe-occasion')?.value || current.occasion,
    food: read('kfe-food', current.food), clothing: read('kfe-clothing', current.clothing),
    transport: read('kfe-transport', current.transport), gifts: read('kfe-gifts', current.gifts),
    household: read('kfe-household', current.household), updatedDay: context().day,
  });
}
function renderBudgetSummary() {
  const box = el('kfe-budget-summary'); if (!box) return;
  const summary = festivalBudgetSummary(readBudgetInputs(), context().wallet);
  box.textContent = `Planned total: ${money(summary.total)} · Current wallet: ${money(summary.wallet)} · ${summary.affordable ? `After planned spending: ${money(summary.remainingIfPaid)}` : `Shortfall against wallet: ${money(summary.gap)}`}. Planning only; no money has been deducted.`;
}
function render() {
  if (typeof document === 'undefined') return;
  const section = createSection(); if (!section) return;
  const ctx = context(); const season = marketSeasonForDay(ctx.day, ctx.faithPreference);
  const society = window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {};
  const cal = society.communityCalendar;
  if (el('kfe-season-title')) el('kfe-season-title').textContent = `${season.label} · Day ${ctx.day}`;
  if (el('kfe-season-note')) el('kfe-season-note').textContent = season.note;
  if (el('kfe-calendar-note')) el('kfe-calendar-note').textContent = cal ? `Community calendar: ${cal.label}. ${cal.note}` : 'Community calendar preference is optional; the price cycle remains an illustrative game system.';
  const next = nextMarketSeason(ctx.day, ctx.faithPreference);
  if (el('kfe-next-season')) el('kfe-next-season').textContent = next ? `Next event window: ${next.label} in ${next.daysUntil} in-game day(s).` : 'No seasonal event in the next simulation window.';
  const list = el('kfe-market-effects');
  if (list) {
    list.replaceChildren();
    for (const group of GROUPS) {
      const row = document.createElement('div'); row.className = 'kfe-line';
      const label = document.createElement('span'); label.textContent = group.label;
      const buy = document.createElement('span'); buy.className = 'kfe-delta';
      const sell = document.createElement('span'); sell.className = 'kfe-delta';
      const buyPct = seasonalPriceEffectPercent(group.id, ctx.day, 'buy', ctx.faithPreference);
      const sellPct = seasonalPriceEffectPercent(group.id, ctx.day, 'sell', ctx.faithPreference);
      buy.textContent = `Buy ${buyPct > 0 ? '+' : ''}${buyPct}%`;
      sell.textContent = `Sell ${sellPct > 0 ? '+' : ''}${sellPct}%`;
      row.append(label, buy, sell); list.append(row);
    }
  }
  const occasion = el('kfe-occasion');
  if (occasion && document.activeElement !== occasion && OCCASIONS.some(x => x.id === state.budget.occasion)) occasion.value = state.budget.occasion;
  for (const [id, key] of [['kfe-food','food'],['kfe-clothing','clothing'],['kfe-transport','transport'],['kfe-gifts','gifts'],['kfe-household','household']]) {
    const input = el(id); if (input && document.activeElement !== input) input.value = String(state.budget[key]);
  }
  renderBudgetSummary();
}
function saveBudget() {
  const budget = readBudgetInputs();
  state = { budget };
  if (!persistState()) { notify('The plan could not be saved in this browser. No wallet transaction occurred.', true); return false; }
  render(); notify(`Saved ${OCCASIONS.find(x => x.id === budget.occasion)?.label || 'occasion'} plan for in-game day ${budget.updatedDay}. No money was deducted.`); return true;
}
function exportBudget() {
  const payload = { ...festivalBudgetSummary(readBudgetInputs(), context().wallet), season: marketSeasonForDay(context().day, context().faithPreference), note: 'Illustrative game budget and market cycle; no real currency or religious calendar advice.' };
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `kano-life-festival-budget-day-${context().day}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Festival budget exported. No wallet transaction occurred.');
  } catch { notify('Export is unavailable in this browser. The saved budget remains unchanged.', true); }
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  installStyles();
  const ensure = () => { installStyles(); createSection(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  for (const id of ['life-career-btn', 'life-career-menu-btn']) el(id)?.addEventListener('click', () => queueMicrotask(ensure));
  if (document.documentElement && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      if (el('kano-society-markets') && !el(SECTION_ID)) ensure();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change','kano:life-shift-settled','kano:day-settlement-closed','kano:fuel-market-updated','kano:driver-compliance-updated','kano:festival-calendar-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverFestivalEconomy = {
    version: 1,
    snapshot: () => ({ ...festivalBudgetSummary(state.budget, context().wallet), season: marketSeasonForDay(context().day, context().faithPreference), nextSeason: nextMarketSeason(context().day, context().faithPreference) }),
    seasonForDay: marketSeasonForDay,
    priceMultiplier: seasonalMarketMultiplier,
    budget: () => ({ ...state.budget }),
    export: () => JSON.stringify({ ...festivalBudgetSummary(state.budget, context().wallet), season: marketSeasonForDay(context().day, context().faithPreference) }, null, 2),
    refresh: render,
  };
}
install();
