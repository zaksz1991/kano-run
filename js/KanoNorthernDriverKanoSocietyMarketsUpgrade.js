/** Runtime UI and wallet integration for Kano civic, market and street-commerce life. */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { UI } from './ui.js';
import { save, persist } from './storage.js';
import {
  SOCIETY_STORAGE_KEY, KANO_MARKETS, STREET_COMMERCE_DENSITY, FAITH_PREFERENCES,
  STYLE_CATALOG, MARKET_GOODS, CIVIC_SCENARIOS, TRADING_BUSINESSES, WEEKLY_BILLS,
  createDefaultSocietyState, normalizeSocietyState, marketPriceIndex, marketGoodPrice,
  buyStyle, buyMarketStock, sellMarketStock, buyPantryGoods, equipOwnedStyle,
  setFaithPreference, currentCommunityCalendar, scenarioForDay, resolveCivicScenario,
  payWeeklyBill, snapshotSociety,
} from './KanoNorthernDriverKanoSocietyMarkets.js';

const STYLE_ID = 'knsm-style';
const SECTION_ID = 'kano-society-markets';
const PATCH = Symbol.for('kano.life.societyMarkets.ui.v1');
let activeUI = null;
let state = loadState();
let observer = null;
let lastDayRendered = 0;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(SOCIETY_STORAGE_KEY);
    return raw ? normalizeSocietyState(JSON.parse(raw)) : createDefaultSocietyState();
  } catch { return createDefaultSocietyState(); }
}
function saveState(next = state) {
  try {
    const normalized = normalizeSocietyState(next);
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(SOCIETY_STORAGE_KEY, JSON.stringify(normalized));
    state = normalized;
    return true;
  } catch { return false; }
}
function element(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }
function safeText(value) { return String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 240); }
function money(value) { return `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`; }
function context() {
  const ui = activeUI || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null);
  const game = ui?.game || null;
  const s = game?.s || {};
  const day = Math.max(1, Math.floor(Number(s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1) || 1));
  const activeShift = Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state)));
  return { ui, game, s, day, activeShift, wallet: Math.max(0, Math.floor(Number(save.money) || 0)) };
}
function notify(message, error = false) {
  const target = element('knsm-notice');
  if (target) { target.textContent = String(message || ''); target.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function commit(nextState, nextWallet, message) {
  const previousWallet = Math.max(0, Math.floor(Number(save.money) || 0));
  const nextCash = Math.max(0, Math.floor(Number(nextWallet) || 0));
  try {
    save.money = nextCash;
    if (typeof persist === 'function') persist();
    if (!saveState(nextState)) throw new Error('society_storage_unavailable');
    context().ui?.refreshWallet?.();
    window.kanoNorthernDriverLifeSimulation?.refresh?.();
    render();
    notify(message || 'Saved.');
    return true;
  } catch {
    save.money = previousWallet;
    try { if (typeof persist === 'function') persist(); } catch {}
    notify('Could not save the change. The wallet was restored where possible.', true);
    return false;
  }
}
function installStyles() {
  if (element(STYLE_ID) || !document.head) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .knsm-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .knsm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .knsm-card{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .knsm-card h4{margin:0 0 8px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} label{display:flex;flex-direction:column;gap:5px;margin:8px 0;color:#dce8f0;font-size:12px;font-weight:750}
    #${SECTION_ID} select,#${SECTION_ID} input{width:100%;min-height:44px;border:1px solid #45677d;border-radius:8px;background:#0b1a27;color:#fff;padding:9px 10px;font:inherit;font-size:16px}
    #${SECTION_ID} button{min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .knsm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    #${SECTION_ID} .knsm-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .knsm-event{background:#0d1e2c;border:1px solid #3b596d;border-radius:10px;padding:12px;margin:10px 0}
    #${SECTION_ID} .knsm-event h4{font-size:17px;margin:0 0 7px}
    #${SECTION_ID} .knsm-event p{font-size:13px;line-height:1.5;color:#cbd9e3;margin:0}
    #${SECTION_ID} .knsm-choices{display:grid;gap:7px;margin-top:10px}
    #${SECTION_ID} .knsm-meter{height:8px;background:#1d3445;border-radius:6px;overflow:hidden;margin:8px 0}
    #${SECTION_ID} .knsm-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} .knsm-mix-row{display:grid;grid-template-columns:minmax(120px,1fr) 2fr 44px;gap:8px;align-items:center;margin:6px 0;font-size:11px;color:#bdced9}
    #${SECTION_ID} .knsm-mix-row .knsm-meter{margin:0}
    #${SECTION_ID} .knsm-logs{display:grid;gap:6px;margin-top:8px}
    #${SECTION_ID} .knsm-logs div{font-size:11px;line-height:1.45;color:#bdced9;background:#091723;padding:8px;border-radius:7px}
    #${SECTION_ID} .knsm-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .knsm-notice[data-state="error"]{color:#ffb4aa}
    @media(max-width:520px){#${SECTION_ID} .knsm-grid{grid-template-columns:1fr}#${SECTION_ID} .knsm-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .knsm-actions button{width:100%}#${SECTION_ID} .knsm-mix-row{grid-template-columns:110px 1fr 34px}}
  `;
  document.head.append(style);
}
function fillSelect(select, items, getId, getLabel, current) {
  if (!select) return;
  const desired = current ?? select.value;
  select.replaceChildren();
  for (const item of items) {
    const option = document.createElement('option'); option.value = getId(item); option.textContent = getLabel(item); select.append(option);
  }
  if (items.some(item => getId(item) === desired)) select.value = desired;
}
function renderGoodsOptions() {
  const ctx = context(); const marketId = element('knsm-market')?.value || state.selectedMarket;
  state.selectedMarket = KANO_MARKETS.some(x => x.id === marketId) ? marketId : 'dawanau';
  const filtered = MARKET_GOODS.filter(good => good.market === state.selectedMarket);
  fillSelect(element('knsm-good'), filtered, x => x.id, x => `${x.name} · buy ${money(marketGoodPrice(x.id, ctx.day, 'buy'))} / sale ${money(marketGoodPrice(x.id, ctx.day, 'sell'))}`, element('knsm-good')?.value);
  const market = KANO_MARKETS.find(x => x.id === state.selectedMarket);
  const marketInfo = element('knsm-market-info');
  if (marketInfo && market) marketInfo.textContent = `${market.specialty}. Typical goods: ${market.goods.join(', ')}. ${market.note}`;
}
function renderScenario() {
  const ctx = context(); const scenario = scenarioForDay(ctx.day); const already = state.lastScenarioDay === ctx.day;
  const title = element('knsm-scenario-title'); const body = element('knsm-scenario-body'); const label = element('knsm-scenario-label'); const choices = element('knsm-scenario-choices');
  if (!title || !body || !choices) return;
  title.textContent = scenario.title; body.textContent = scenario.body; if (label) label.textContent = `${scenario.category.toUpperCase()} · IN-GAME DAY ${ctx.day}`;
  choices.replaceChildren();
  for (const choice of scenario.choices) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.knsmScenario = choice.id;
    const amount = Number(choice.walletDelta) || 0; button.textContent = `${choice.label}${amount < 0 ? ` · ${money(-amount)}` : ''}`;
    button.disabled = already || ctx.activeShift; choices.append(button);
  }
  if (already) body.textContent += ' This situation has already been resolved today.';
  else if (ctx.activeShift) body.textContent += ' Finish or safely stop the active driving segment before choosing.';
}
function renderStyles() {
  const select = element('knsm-style-choice'); const current = select?.value;
  fillSelect(select, STYLE_CATALOG, x => x.id, x => `${x.name} · ${money(x.cost)}`, current || state.equipped.clothing);
  const item = STYLE_CATALOG.find(x => x.id === select?.value); const owned = state.ownedStyles.includes(item?.id);
  const button = element('knsm-style-buy'); if (button) button.textContent = owned ? `EQUIP OWNED ${item?.name || 'ITEM'} · FREE` : `BUY & WEAR · ${money(item?.cost || 0)}`;
  const equipped = element('knsm-equipped'); if (equipped) {
    const byId = id => STYLE_CATALOG.find(x => x.id === id)?.name || 'Default';
    equipped.textContent = `Equipped preferences — Clothing: ${byId(state.equipped.clothing)}; footwear: ${byId(state.equipped.footwear)}; grooming: ${byId(state.equipped.grooming)}.`;
  }
}
function renderBusinessOptions() {
  const select = element('knsm-business'); fillSelect(select, TRADING_BUSINESSES, x => x.id, x => x.label, state.tradingBusiness);
  const business = TRADING_BUSINESSES.find(x => x.id === select?.value) || TRADING_BUSINESSES[0];
  const good = MARKET_GOODS.find(x => x.id === element('knsm-good')?.value);
  const allowed = business.eligibleGroups.includes(good?.group);
  const buy = element('knsm-buy-stock'); const sell = element('knsm-sell-stock');
  if (buy) buy.disabled = context().activeShift || !allowed;
  if (sell) sell.disabled = context().activeShift || !allowed || !state.stockLots.some(lot => lot.goodId === good?.id && lot.qty > 0);
  const stockInfo = element('knsm-stock-info');
  if (stockInfo) {
    const totalUnits = state.stockLots.reduce((sum, lot) => sum + lot.qty, 0);
    stockInfo.textContent = `${business.label}. Stock on hand: ${totalUnits} unit(s).${business.id !== 'none' ? ' Sales can make a margin or a loss as simulated prices change.' : ' Choose a side trade to buy stock for resale.'}`;
  }
}
function renderBills() {
  const ctx = context(); const box = element('knsm-bills'); if (!box) return;
  box.replaceChildren();
  for (const bill of WEEKLY_BILLS) {
    const week = Math.floor((ctx.day - 1) / 7) + 1; const key = `${bill.id}:${week}`; const paid = Boolean(state.billsPaid[key]);
    const card = document.createElement('div'); card.className = 'knsm-card';
    const title = document.createElement('h4'); title.textContent = `${bill.label} · ${money(bill.amount)}`;
    const note = document.createElement('p'); note.className = 'knsm-note'; note.textContent = `${bill.description} ${paid ? 'Already recorded as paid this week.' : bill.id === 'shop-levy' && state.tradingBusiness === 'none' ? 'Choose a side business first to enable this optional reserve.' : 'Payment is optional and requires the wallet to cover the amount.'}`;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.knsmBill = bill.id; button.textContent = paid ? 'PAID THIS WEEK' : 'PAY / RECORD PAYMENT'; button.disabled = paid || ctx.activeShift || (bill.id === 'shop-levy' && state.tradingBusiness === 'none');
    card.append(title, note, button); box.append(card);
  }
  const arrears = element('knsm-arrears'); if (arrears) arrears.textContent = `Recorded simulated arrears: ${money(state.arrears)}.`;
}
function render() {
  if (typeof document === 'undefined' || !element(SECTION_ID)) return;
  const ctx = context(); const nextState = normalizeSocietyState(state); state = nextState;
  if (lastDayRendered !== ctx.day) lastDayRendered = ctx.day;
  const faith = element('knsm-faith'); fillSelect(faith, FAITH_PREFERENCES, x => x.id, x => x.label, state.faithPreference);
  const calendar = currentCommunityCalendar(state, ctx.day); const calendarTitle = element('knsm-calendar-title'); const calendarNote = element('knsm-calendar-note');
  if (calendarTitle) calendarTitle.textContent = calendar.label; if (calendarNote) calendarNote.textContent = calendar.note;
  const index = marketPriceIndex(ctx.day); const indexLabel = element('knsm-price-index'); if (indexLabel) indexLabel.textContent = `Simulated cost-of-living index: ${(index * 100).toFixed(1)} (base 100). This is a gameplay index, not live price data.`;
  const mix = element('knsm-frontage-mix');
  if (mix && !mix.childElementCount) for (const entry of STREET_COMMERCE_DENSITY.frontageMix) {
    const row = document.createElement('div'); row.className = 'knsm-mix-row';
    const name = document.createElement('span'); name.textContent = entry.label;
    const meter = document.createElement('div'); meter.className = 'knsm-meter'; meter.setAttribute('role', 'img'); meter.setAttribute('aria-label', `${Math.round(entry.share * 100)} percent target share`);
    const bar = document.createElement('i'); bar.style.width = `${entry.share * 100}%`; meter.append(bar);
    const percent = document.createElement('b'); percent.textContent = `${Math.round(entry.share * 100)}%`;
    row.append(name, meter, percent); mix.append(row);
  }
  const chosenMarket = element('knsm-market'); fillSelect(chosenMarket, KANO_MARKETS, x => x.id, x => x.name, state.selectedMarket);
  renderGoodsOptions(); renderBusinessOptions(); renderStyles(); renderBills(); renderScenario();
  const wallet = element('knsm-wallet'); if (wallet) wallet.textContent = money(ctx.wallet);
  const stats = element('knsm-stats'); if (stats) stats.innerHTML = `<div class="knsm-card"><h4>Community trust</h4><div class="knsm-meter"><i style="width:${state.communityTrust}%"></i></div><p class="knsm-note">${state.communityTrust}/100</p></div><div class="knsm-card"><h4>Market trust</h4><div class="knsm-meter"><i style="width:${state.marketTrust}%"></i></div><p class="knsm-note">${state.marketTrust}/100</p></div><div class="knsm-card"><h4>Civic confidence</h4><div class="knsm-meter"><i style="width:${state.civicConfidence}%"></i></div><p class="knsm-note">${state.civicConfidence}/100</p></div><div class="knsm-card"><h4>Wellbeing</h4><div class="knsm-meter"><i style="width:${state.wellbeing}%"></i></div><p class="knsm-note">${state.wellbeing}/100</p></div>`;
  const logBox = element('knsm-ledger'); if (logBox) {
    logBox.replaceChildren();
    const recent = state.ledger.slice(0, 8);
    if (!recent.length) { const p = document.createElement('div'); p.textContent = 'No market or civic actions recorded yet.'; logBox.append(p); }
    for (const entry of recent) { const line = document.createElement('div'); line.textContent = `Day ${entry.day} · ${entry.type} · ${entry.text}${entry.amount ? ` · ${entry.amount < 0 ? '−' : '+'}${money(Math.abs(entry.amount))}` : ''}`; logBox.append(line); }
  }
  const shiftNote = element('knsm-shift-note'); if (shiftNote) shiftNote.textContent = ctx.activeShift ? 'Driving is active: shopping, bill payments, style purchases and market trading are locked until the segment ends.' : 'Shopping, bill payments and trading are available while not driving.';
}
function createSection() {
  const panel = document.querySelector('#kano-life-career-screen .klc-panel'); if (!panel) return null;
  const culture = element('kano-aure-culture'); let section = element(SECTION_ID);
  if (!section) {
    section = document.createElement('section'); section.id = SECTION_ID;
    section.innerHTML = `
      <h3 class="klc-section-title">KANO SOCIETY · MARKETS · STREET COMMERCE</h3>
      <p class="knsm-note">Daily life includes faith and community occasions, neighbourhood shops, open stalls, market errands, clothing, utility bills, rising prices and public-service conversations. Religion and political participation are optional. Political scenarios use fictional local actors; allegations are framed as unverified until evidence is available.</p>
      <div class="knsm-grid">
        <div class="knsm-card"><h4>Faith and community calendar</h4><label for="knsm-faith">Preferred routine<select id="knsm-faith"></select></label><div class="knsm-actions"><button type="button" class="knsm-primary" data-knsm-action="save-faith">SAVE PREFERENCE</button></div><h4 id="knsm-calendar-title" style="margin-top:14px"></h4><p class="knsm-note" id="knsm-calendar-note"></p><p class="knsm-note">Festival windows are simulated and do not match actual lunar or liturgical dates. No faith, attendance or observance is compulsory.</p></div>
        <div class="knsm-card"><h4>Cost-of-living pressure</h4><p id="knsm-price-index" class="knsm-note"></p><p id="knsm-wallet" style="font-size:22px;font-weight:900"></p><p class="knsm-note">Wallet uses the existing LIFE & CAREER balance. Bills are never deducted automatically; the player chooses when to pay.</p><div id="knsm-bills" class="knsm-grid"></div><p id="knsm-arrears" class="knsm-note"></p></div>
      </div>
      <div class="knsm-grid">
        <div class="knsm-card"><h4>Kano market guide and errands</h4><label for="knsm-market">Select market<select id="knsm-market"></select></label><p id="knsm-market-info" class="knsm-note"></p><div class="knsm-actions"><button type="button" data-knsm-action="visit-market">RECORD MARKET VISIT</button></div><label for="knsm-good">Good / trading unit<select id="knsm-good"></select></label><label for="knsm-qty">Quantity<select id="knsm-qty"><option value="1">1 unit</option><option value="3">3 units</option><option value="5">5 units</option></select></label><div class="knsm-actions"><button type="button" class="knsm-primary" data-knsm-action="buy-pantry">BUY FOR HOUSEHOLD</button></div><p class="knsm-note">Price changes are simulated. Stock packs are abstract units, not stated real-world bag weights or current prices.</p></div>
        <div class="knsm-card"><h4>Side trade: kiosk, grains or market table</h4><label for="knsm-business">Choose a side-trade profile<select id="knsm-business"></select></label><p id="knsm-stock-info" class="knsm-note"></p><div class="knsm-actions"><button type="button" id="knsm-buy-stock" data-knsm-action="buy-stock">BUY WHOLESALE STOCK</button><button type="button" id="knsm-sell-stock" data-knsm-action="sell-stock">SELL SELECTED STOCK</button></div><p class="knsm-note">The player must own stock before selling it. Simulated wholesale/retail prices can produce a profit or a loss; this is a compact side-trade loop, not a claim about current market margins.</p></div>
      </div>
      <div class="knsm-grid">
        <div class="knsm-card"><h4>Clothes, shoes and grooming</h4><label for="knsm-style-choice">Choose an outfit, footwear or service<select id="knsm-style-choice"></select></label><p id="knsm-equipped" class="knsm-note"></p><div class="knsm-actions"><button type="button" id="knsm-style-buy" class="knsm-primary" data-knsm-action="buy-style">BUY & WEAR</button></div><p class="knsm-note">Prices are game-balancing values. This step saves appearance preferences but does not change 3D character meshes or animations.</p></div>
        <div class="knsm-card"><h4>Streetfront commerce target</h4><p class="knsm-note">Design target: approximately ${Math.round(STREET_COMMERCE_DENSITY.targetCommercialFrontageShare * 100)}% of road-facing lots act as active commerce in the world-building plan.</p><div id="knsm-frontage-mix"></div><p class="knsm-note">This target mix decorates selected 3D building slots with simple procedural shopfronts, awnings, shutters and display tables. It does not replace renderer3d.js; inspect the running game to verify alignment with your installed GLB buildings.</p></div>
      </div>
      <div class="knsm-card"><h4>Community and civic life</h4><p class="knsm-note">Respond to a fictional local situation each in-game day. Decisions affect community trust, market relationships, civic confidence and wellbeing. No tribe has an inherent character penalty; discrimination is represented as a player's choice with social consequences. Tax and levy amounts are fictional, and requests for receipts/verification are valid choices.</p><div class="knsm-event" aria-live="polite"><p class="knsm-note" id="knsm-scenario-label"></p><h4 id="knsm-scenario-title"></h4><p id="knsm-scenario-body"></p><div id="knsm-scenario-choices" class="knsm-choices"></div></div><div id="knsm-stats" class="knsm-grid"></div><p id="knsm-shift-note" class="knsm-note"></p></div>
      <p id="knsm-notice" class="knsm-notice" role="status" aria-live="polite"></p>
      <h4 class="klc-section-title">RECENT MARKET, STYLE & CIVIC LOG</h4><div id="knsm-ledger" class="knsm-logs"></div>
    `;
    if (culture?.parentElement === panel) culture.after(section); else panel.append(section);
    bindSection(section);
  } else if (culture?.parentElement === panel && section.previousElementSibling !== culture) {
    culture.after(section);
  }
  return section;
}
function bindSection(section) {
  if (section.dataset.bound === '1') return;
  section.dataset.bound = '1';
  section.addEventListener('change', event => {
    if (event.target.id === 'knsm-market') { state.selectedMarket = event.target.value; saveState(); renderGoodsOptions(); renderBusinessOptions(); }
    if (event.target.id === 'knsm-business') { state.tradingBusiness = event.target.value; saveState(); renderBusinessOptions(); renderBills(); }
    if (event.target.id === 'knsm-good') renderBusinessOptions();
    if (event.target.id === 'knsm-style-choice') renderStyles();
  });
  section.addEventListener('click', event => {
    const button = event.target.closest('button[data-knsm-action],button[data-knsm-scenario],button[data-knsm-bill]'); if (!button || !section.contains(button)) return;
    const action = button.dataset.knsmAction;
    const ctx = context();
    if (button.dataset.knsmScenario) {
      const scenario = scenarioForDay(ctx.day);
      const outcome = resolveCivicScenario(state, { day: ctx.day, scenarioId: scenario.id, choiceId: button.dataset.knsmScenario, wallet: ctx.wallet, activeShift: ctx.activeShift });
      if (!outcome.ok) { notify(outcome.reason === 'insufficient_wallet' ? `You need ${money(outcome.required)} for that option.` : outcome.reason === 'already_resolved_today' ? 'Today’s situation is already resolved.' : 'Finish driving or choose a valid option.', true); return; }
      if (!commit(outcome.state, outcome.wallet, outcome.choice.log)) return;
      return;
    }
    if (button.dataset.knsmBill) {
      const outcome = payWeeklyBill(state, { billId: button.dataset.knsmBill, day: ctx.day, wallet: ctx.wallet, activeShift: ctx.activeShift });
      if (!outcome.ok) {
        if (outcome.reason === 'insufficient_wallet' && outcome.stateWithArrears && saveState(outcome.stateWithArrears)) { state = outcome.stateWithArrears; render(); notify(`Not enough money to pay this bill. Simulated arrears of ${money(outcome.required)} were recorded.`, true); }
        else notify(outcome.reason === 'already_paid_this_week' ? 'This bill is already recorded as paid this week.' : outcome.reason === 'business_not_selected' ? 'Choose a side-trade profile before recording a trader levy.' : 'This bill cannot be paid during an active shift.', true);
        return;
      }
      commit(outcome.state, outcome.wallet, `Paid ${outcome.bill.label} for ${money(outcome.cost)}.`); return;
    }
    if (action === 'save-faith') {
      const outcome = setFaithPreference(state, { preferenceId: element('knsm-faith')?.value, day: ctx.day });
      if (!outcome.ok) { notify('Select a valid calendar preference.', true); return; }
      saveState(outcome.state); render(); notify('Community calendar preference saved.'); return;
    }
    if (action === 'visit-market') {
      const marketId = element('knsm-market')?.value; const last = Number(state.visitCounts[marketId]) || 0;
      if (last === ctx.day) { notify('This market visit is already recorded for today.', true); return; }
      const next = normalizeSocietyState(state); next.selectedMarket = marketId; next.visitCounts[marketId] = ctx.day; next.marketTrust = Math.min(100, next.marketTrust + 1);
      next.ledger.unshift({ day: ctx.day, type: 'market_visit', text: `Visited ${KANO_MARKETS.find(x => x.id === marketId)?.name || 'a Kano market'}; explored local sellers and products.`, amount: 0 }); next.ledger = next.ledger.slice(0, 100);
      saveState(next); state = next; render(); notify('Market visit recorded. No wallet transaction was made.'); return;
    }
    if (action === 'buy-pantry' || action === 'buy-stock' || action === 'sell-stock') {
      const params = { goodId: element('knsm-good')?.value, qty: Number(element('knsm-qty')?.value) || 1, day: ctx.day, wallet: ctx.wallet, activeShift: ctx.activeShift, marketId: element('knsm-market')?.value };
      const outcome = action === 'buy-pantry' ? buyPantryGoods(state, params) : action === 'buy-stock' ? buyMarketStock(state, params) : sellMarketStock(state, params);
      if (!outcome.ok) {
        const messages = { shift_active: 'Finish or safely stop the driving segment first.', wrong_business: 'This good does not match the selected side-trade type.', wrong_market: 'Choose the market that sells this item.', insufficient_stock: `Not enough stock. Available units: ${outcome.available || 0}.`, insufficient_wallet: `You need ${money(outcome.required)}. No purchase was made.`, unknown_good: 'Select a valid market good.' };
        notify(messages[outcome.reason] || 'That market transaction could not be completed.', true); return;
      }
      const detail = action === 'sell-stock' ? `Sold ${outcome.qty} unit(s) of ${outcome.good.name} for ${money(outcome.revenue)}; ${outcome.profit >= 0 ? 'margin' : 'loss'} ${money(Math.abs(outcome.profit))}.` : action === 'buy-stock' ? `Bought ${outcome.qty} wholesale unit(s) of ${outcome.good.name} for ${money(outcome.total)}.` : `Bought ${outcome.qty} household unit(s) of ${outcome.good.name} for ${money(outcome.total)}.`;
      commit(outcome.state, outcome.wallet, detail); return;
    }
    if (action === 'buy-style') {
      if (ctx.activeShift) { notify('Finish driving before shopping or grooming.', true); return; }
      const styleId = element('knsm-style-choice')?.value; const currentlyOwned = state.ownedStyles.includes(styleId);
      if (currentlyOwned) {
        const equipped = equipOwnedStyle(state, { styleId });
        if (!equipped.ok) { notify('That style is not available.', true); return; }
        saveState(equipped.state); state = equipped.state; render(); notify('Previously purchased style equipped at no cost.'); return;
      }
      const outcome = buyStyle(state, { styleId, day: ctx.day, wallet: ctx.wallet, activeShift: ctx.activeShift });
      if (!outcome.ok) { notify(outcome.reason === 'insufficient_wallet' ? `You need ${money(outcome.required)}.` : outcome.reason === 'shift_active' ? 'Finish driving before shopping or grooming.' : 'Select a valid style.', true); return; }
      commit(outcome.state, outcome.wallet, `Bought ${outcome.item.name} for ${money(outcome.cost)}. Appearance preferences are saved; the 3D model is unchanged.`); return;
    }
  });
}
const WORLD_BUILD_PATCH = Symbol.for('kano.life.societyMarkets.rendererBuildWorld.v1');
const WORLD_UPGRADE_PATCH = Symbol.for('kano.life.societyMarkets.rendererUpgradeWorld.v1');
const SHOPFRONT_TYPES = Object.freeze([
  { id: 'provisions', label: 'Provisions shop', colors: [0x176b4d, 0xe9bd55, 0x8b5e3c, 0xd8c7a5] },
  { id: 'grain-trader', label: 'Grain and roots trader', colors: [0x8b5b35, 0xe5bf63, 0x657d43, 0xbca078] },
  { id: 'textiles', label: 'Textiles and fabrics', colors: [0x7a3154, 0xe7b54c, 0x3c7189, 0xe8d7b8] },
  { id: 'thrift-footwear', label: 'Second-hand clothes and footwear', colors: [0x315b83, 0xe5bc49, 0x9f4c35, 0xd5c1a0] },
  { id: 'electronics', label: 'Electronics and repair kiosk', colors: [0x2d566b, 0xf0bc45, 0x687b8e, 0xdfd9bd] },
  { id: 'fruit-vegetables', label: 'Fruit and vegetable seller', colors: [0x2d7745, 0xe8b64b, 0xa44838, 0xdbd0aa] },
  { id: 'roadside-table', label: 'Roadside table and display', colors: [0xa64834, 0xf1c54d, 0x55774f, 0xe1d1ac] },
  { id: 'general-goods', label: 'General goods and household items', colors: [0x3c6379, 0xe4b74a, 0x8d593d, 0xe0d1b2] },
]);
function boxPartsGeometry(parts) {
  const positions = []; const normals = []; const colors = [];
  for (const part of parts) {
    const geometry = new THREE.BoxGeometry(part.sx, part.sy, part.sz);
    const p = geometry.getAttribute('position'); const n = geometry.getAttribute('normal');
    const color = new THREE.Color(part.color);
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i) + part.x, p.getY(i) + part.y, p.getZ(i) + part.z);
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(color.r, color.g, color.b);
    }
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}
function evenlySelectedSlots(count, share) {
  const target = Math.max(0, Math.min(count, Math.round(count * share)));
  const selected = new Set();
  for (let n = 0; n < target; n += 1) selected.add(Math.min(count - 1, Math.floor(((n + 0.5) * count) / target)));
  return selected;
}
function makeShopfrontParts({ width, depth, height, side, replaced, palette }) {
  const frontageWidth = Math.max(2.45, Math.min(4.9, width || 3));
  const frontageDepth = Math.max(2.5, Math.min(4.8, depth || 3));
  const fasciaY = Math.max(1.48, Math.min(1.92, (height || 3) - 0.36));
  const sign = palette[0]; const awning = palette[1]; const shutter = palette[2]; const counter = palette[3];
  const parts = [];
  if (!replaced) {
    const outward = side < 0 ? 1 : -1;
    const faceX = outward * (frontageDepth / 2 + 0.045);
    parts.push(
      { sx: 0.10, sy: 0.25, sz: frontageWidth * 0.88, x: faceX, y: fasciaY, z: 0, color: sign },
      { sx: 0.68, sy: 0.11, sz: frontageWidth * 0.98, x: faceX + outward * 0.30, y: fasciaY - 0.23, z: 0, color: awning },
      { sx: 0.09, sy: 1.20, sz: Math.min(0.78, frontageWidth * 0.27), x: faceX + outward * 0.02, y: 0.68, z: -frontageWidth * 0.19, color: shutter },
      { sx: 0.09, sy: 1.22, sz: Math.min(0.66, frontageWidth * 0.23), x: faceX + outward * 0.02, y: 0.68, z: frontageWidth * 0.18, color: 0x79543a },
      { sx: 0.58, sy: 0.13, sz: frontageWidth * 0.47, x: faceX + outward * 0.31, y: 0.55, z: 0, color: counter },
      { sx: 0.34, sy: 0.34, sz: 0.34, x: faceX + outward * 0.40, y: 0.26, z: -0.42, color: 0x6f8a52 },
      { sx: 0.34, sy: 0.34, sz: 0.34, x: faceX + outward * 0.40, y: 0.26, z: 0.42, color: 0xc69a52 },
    );
  } else {
    const faceZ = frontageDepth / 2 + 0.045;
    parts.push(
      { sx: frontageWidth * 0.88, sy: 0.25, sz: 0.10, x: 0, y: fasciaY, z: faceZ, color: sign },
      { sx: frontageWidth * 0.98, sy: 0.11, sz: 0.68, x: 0, y: fasciaY - 0.23, z: faceZ + 0.30, color: awning },
      { sx: Math.min(0.78, frontageWidth * 0.27), sy: 1.20, sz: 0.09, x: -frontageWidth * 0.19, y: 0.68, z: faceZ + 0.02, color: shutter },
      { sx: Math.min(0.66, frontageWidth * 0.23), sy: 1.22, sz: 0.09, x: frontageWidth * 0.18, y: 0.68, z: faceZ + 0.02, color: 0x79543a },
      { sx: frontageWidth * 0.47, sy: 0.13, sz: 0.58, x: 0, y: 0.55, z: faceZ + 0.31, color: counter },
      { sx: 0.34, sy: 0.34, sz: 0.34, x: -0.42, y: 0.26, z: faceZ + 0.40, color: 0x6f8a52 },
      { sx: 0.34, sy: 0.34, sz: 0.34, x: 0.42, y: 0.26, z: faceZ + 0.40, color: 0xc69a52 },
    );
  }
  return parts;
}
function decorateCommercialFrontages(renderer) {
  try {
    if (!renderer || renderer.disposed || !Array.isArray(renderer.buildingSlots) || !renderer.world) return { decorated: 0, slots: 0, targetShare: STREET_COMMERCE_DENSITY.targetCommercialFrontageShare };
    const slots = renderer.buildingSlots;
    const selected = evenlySelectedSlots(slots.length, STREET_COMMERCE_DENSITY.targetCommercialFrontageShare);
    let decorated = 0;
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      if (!selected.has(index) || !slot?.actor) continue;
      if (slot.commerceActor?.parent === slot.actor) { decorated += 1; continue; }
      if (slot.actor.parent == null) continue;
      let bounds; let size;
      try { bounds = new THREE.Box3().setFromObject(slot.actor); size = bounds.getSize(new THREE.Vector3()); } catch { continue; }
      if (!(size.x > 0.5 && size.y > 0.5 && size.z > 0.5)) continue;
      const type = SHOPFRONT_TYPES[index % SHOPFRONT_TYPES.length];
      const parts = makeShopfrontParts({ width: size.z, depth: size.x, height: size.y, side: Number(slot.side) || -1, replaced: Boolean(slot.replaced), palette: type.colors });
      const geometry = boxPartsGeometry(parts);
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide });
      const frontage = new THREE.Mesh(geometry, material);
      frontage.name = `KanoShopfront-${type.id}-${index}`;
      frontage.frustumCulled = true;
      frontage.castShadow = false;
      frontage.receiveShadow = false;
      frontage.userData.proceduralKanoShopfront = true;
      frontage.userData.commerceType = type.id;
      slot.actor.add(frontage);
      slot.commerceActor = frontage;
      slot.commerceType = type.id;
      slot.actor.userData ||= {};
      slot.actor.userData.kanoCommercialFrontage = { type: type.id, label: type.label, roadFacing: true };
      decorated += 1;
    }
    renderer.kanoCommerceDressing = { decorated, slots: slots.length, targetShare: STREET_COMMERCE_DENSITY.targetCommercialFrontageShare, targetReached: decorated >= Math.round(slots.length * STREET_COMMERCE_DENSITY.targetCommercialFrontageShare) };
    if (typeof window !== 'undefined') window.__KANO_COMMERCE_DRESSING__ = { ...renderer.kanoCommerceDressing };
    return renderer.kanoCommerceDressing;
  } catch (error) {
    if (typeof console !== 'undefined' && console.debug) console.debug('[Kano Life] Optional storefront dressing skipped safely.', error?.message || error);
    return { decorated: 0, slots: renderer?.buildingSlots?.length || 0, targetShare: STREET_COMMERCE_DENSITY.targetCommercialFrontageShare, failed: true };
  }
}
function installRendererHooks() {
  if (!Renderer3D?.prototype) return;
  const proto = Renderer3D.prototype;
  if (typeof proto.buildWorld === 'function' && !proto[WORLD_BUILD_PATCH]) {
    Object.defineProperty(proto, WORLD_BUILD_PATCH, { value: true });
    const original = proto.buildWorld;
    proto.buildWorld = function buildWorldWithKanoCommerce(...args) {
      const value = original.apply(this, args);
      decorateCommercialFrontages(this);
      return value;
    };
  }
  if (typeof proto.upgradeWorldAssets === 'function' && !proto[WORLD_UPGRADE_PATCH]) {
    Object.defineProperty(proto, WORLD_UPGRADE_PATCH, { value: true });
    const original = proto.upgradeWorldAssets;
    proto.upgradeWorldAssets = function upgradeWorldAssetsWithKanoCommerce(...args) {
      const value = original.apply(this, args);
      decorateCommercialFrontages(this);
      return value;
    };
  }
  try { decorateCommercialFrontages(globalThis.window?.__KANO_LIFE_ACTIVE_RENDERER__); } catch {}
}
function install() {
  installRendererHooks();
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  installStyles();
  if (UI?.prototype && !UI.prototype[PATCH]) {
    Object.defineProperty(UI.prototype, PATCH, { value: true });
    const originalBind = UI.prototype.bind;
    if (typeof originalBind === 'function') UI.prototype.bind = function bindSocietyMarkets(...args) {
      const value = originalBind.apply(this, args); activeUI = this; window.__KANO_ACTIVE_UI__ = this;
      queueMicrotask(() => { createSection(); render(); }); return value;
    };
  }
  const ensure = () => { installStyles(); createSection(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  for (const id of ['life-career-btn', 'life-career-menu-btn']) element(id)?.addEventListener('click', () => queueMicrotask(ensure));
  if (!observer && document.documentElement && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => { if (document.querySelector('#kano-life-career-screen .klc-panel') && !element(SECTION_ID)) ensure(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:fuel-market-updated', 'kano:driver-compliance-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverSocietyMarkets = {
    version: 1,
    snapshot: () => snapshotSociety(state, context().day),
    markets: () => KANO_MARKETS.map(x => ({ ...x, goods: [...x.goods] })),
    streetCommerceDensity: () => ({ ...STREET_COMMERCE_DENSITY, frontageMix: STREET_COMMERCE_DENSITY.frontageMix.map(x => ({ ...x })) }),
    dressingStatus: () => ({ ...(window.__KANO_COMMERCE_DRESSING__ || { decorated: 0, slots: 0, targetShare: STREET_COMMERCE_DENSITY.targetCommercialFrontageShare }) }),
    refresh: render,
    export: () => JSON.stringify(snapshotSociety(state, context().day), null, 2),
  };
}
install();
console.info('[Kano Life] Society, markets, street commerce and cost-of-living simulation registered.');
