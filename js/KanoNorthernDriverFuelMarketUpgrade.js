/** Kano Life — persistent fuel market, station choice and fuel-price complaints. */
import './KanoNorthernDriverFuelEconomyUpgrade.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { save } from './storage.js';
import {
  FUEL_STATIONS, loadFuelMarketState, saveFuelMarketState,
  sanitizeFuelMarketState, dailyFuelPriceMultiplier, stationPricePerGaugePoint,
  recordFuelPurchase, recordFuelPriceComplaint, recordFuelShiftEnd,
} from './KanoNorthernDriverFuelMarket.js';

const PATCH = Symbol.for('kano.life.northernDriverFuelMarket.v1');
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const percent = value => `${Math.round(Math.max(0, Math.min(100, Number(value) || 0)))}%`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const safeDay = value => Math.max(1, Math.min(999999, Math.floor(Number(value) || 1)));
const isCareerMode = mode => ['career', 'freeroam'].includes(String(mode || '').toLowerCase().replace(/[^a-z]/g, ''));
let activeUI = null;
let marketState = loadFuelMarketState();
let initialized = false;
let fallbackRunSerial = 0;

function context(gameOverride = null) {
  const ui = activeUI || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null);
  const game = gameOverride || ui?.game || null;
  const s = game?.s || {};
  const day = safeDay(s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? marketState.lastDay ?? 1);
  const mode = String(game?.mode || s.mode || '').toLowerCase();
  return { ui, game, s, day, mode };
}
function lifeApi() { return typeof window !== 'undefined' ? window.kanoNorthernDriverLifeSimulation : null; }
function lifeSnapshot() { try { return lifeApi()?.snapshot?.() || {}; } catch { return {}; } }
function currentFuel() {
  const { s } = context();
  const live = Number(s?.fuel);
  if (Number.isFinite(live) && live >= 0 && live <= 100) return Math.round(live * 10) / 10;
  return marketState.fuelPercent == null ? 100 : marketState.fuelPercent;
}
function persist(next = marketState) {
  const result = saveFuelMarketState(next);
  if (result.ok) marketState = result.state;
  return result.ok;
}
function notify(message, level = 'success') {
  const section = ensurePanel();
  const notice = section?.querySelector('#kfm-notice');
  if (notice) { notice.textContent = message; notice.dataset.state = level; }
  activeUI?.game?.ui?.toast?.(message);
}
function stationOptions() {
  return Object.values(FUEL_STATIONS).map(station => `<option value="${station.id}">${station.label}</option>`).join('');
}
function ensureStyles() {
  if (document.getElementById('kfm-style')) return;
  const style = document.createElement('style');
  style.id = 'kfm-style';
  style.textContent = `
    #kano-fuel-market-panel{margin-top:18px;padding-top:14px;border-top:1px solid #29465b;min-width:0}
    #kano-fuel-market-panel .kfm-note{font-size:12px;line-height:1.5;color:#a9bdcc}
    #kano-fuel-market-panel .kfm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:10px 0}
    #kano-fuel-market-panel .kfm-stat{min-width:0;padding:9px 10px;display:grid;gap:4px;border:1px solid #29465b;border-radius:9px;background:#0a1723}
    #kano-fuel-market-panel .kfm-stat span{font-size:11px;color:#a9bdcc}#kano-fuel-market-panel .kfm-stat strong{font-size:14px;overflow-wrap:anywhere}
    #kano-fuel-market-panel .kfm-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:9px;margin:10px 0}
    #kano-fuel-market-panel label{display:grid;gap:5px;min-width:0;color:#c5d4df;font-size:12px}
    #kano-fuel-market-panel select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border-radius:8px;padding:8px 10px;background:#0a1723;color:#f2f7fb;border:1px solid #3d6077;font:inherit;font-size:16px}
    #kano-fuel-market-panel .kfm-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
    #kano-fuel-market-panel button{min-height:44px;max-width:100%;border-radius:8px;padding:9px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;background:#172d40;color:#f2f7fb;border:1px solid #3d6077}
    #kano-fuel-market-panel .kfm-primary{background:#00b4d8;color:#061724;border:0}
    #kano-fuel-market-panel button:disabled{opacity:.48;cursor:not-allowed}
    #kano-fuel-market-panel [role=status]{min-height:18px;font-size:12px;line-height:1.45;color:#8fe1c5}
    #kano-fuel-market-panel [data-state=error]{color:#ffb4aa}#kano-fuel-market-panel [data-state=warning]{color:#ffd09b}
    #kano-fuel-market-panel .kfm-history{display:grid;gap:5px;margin-top:8px}
    #kano-fuel-market-panel .kfm-history-row{display:flex;justify-content:space-between;gap:10px;border:1px solid #263e50;background:#0b1925;border-radius:8px;padding:8px 10px;font-size:12px}
    #kano-fuel-market-panel .kfm-history-row span{overflow-wrap:anywhere}#kano-fuel-market-panel .kfm-history-row b{flex:0 0 auto;text-align:right;color:#a9bdcc}
    @media(max-width:520px){#kano-fuel-market-panel .kfm-form{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}
function ensurePanel() {
  const parent = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!parent) return null;
  let section = document.getElementById('kano-fuel-market-panel');
  if (section) { attachPanelEvents(section); return section; }
  ensureStyles();
  section = document.createElement('section');
  section.id = 'kano-fuel-market-panel';
  section.setAttribute('aria-labelledby', 'kfm-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="kfm-title">FUEL MARKET & PRICE PRESSURE</h3>
    <p class="kfm-note">Buy fuel before the next shift and carry any unused prepaid fuel forward. Quantities are fuel-gauge percentage points, not litres. Prices are fictional game-balancing values, not live Kano filling-station quotes. Unpaid fuel used during the shift remains part of the normal career settlement.</p>
    <div class="kfm-grid" aria-label="Fuel market position">
      <div class="kfm-stat"><span>FUEL IN TANK</span><strong id="kfm-fuel">—</strong></div>
      <div class="kfm-stat"><span>PREPAID FUEL CREDIT</span><strong id="kfm-prepaid">—</strong></div>
      <div class="kfm-stat"><span>TODAY'S MARKET</span><strong id="kfm-market">—</strong></div>
      <div class="kfm-stat"><span>AVAILABLE WALLET</span><strong id="kfm-wallet">—</strong></div>
    </div>
    <h4 class="klc-section-title">BUY FUEL BEFORE YOUR NEXT SHIFT</h4>
    <div class="kfm-form">
      <label for="kfm-station">Choose supplier<select id="kfm-station">${stationOptions()}</select></label>
      <label for="kfm-units">Amount to add<select id="kfm-units"><option value="5">5 fuel points</option><option value="10" selected>10 fuel points</option><option value="20">20 fuel points</option><option value="40">40 fuel points</option></select></label>
    </div>
    <p class="kfm-note" id="kfm-quote">Today's quote will appear here.</p>
    <div class="kfm-actions"><button class="kfm-primary" id="kfm-buy" type="button">PAY & REFUEL</button><button id="kfm-complain" type="button">RECORD FUEL-PRICE COMPLAINT</button><button id="kfm-export" type="button">EXPORT FUEL LEDGER</button></div>
    <p id="kfm-notice" role="status" aria-live="polite"></p>
    <div class="kfm-history" id="kfm-history" aria-label="Recent fuel purchases and complaints"></div>
    <p class="kfm-note">The simulated market varies by in-game day. A complaint records the driver's experience but does not create free money or automatically change park reputation. Purchases use the existing LIFE & CAREER wallet and cannot be made during an active shift.</p>
  `;
  parent.append(section);
  attachPanelEvents(section);
  return section;
}
function currentSelectedStation(section) { return section?.querySelector('#kfm-station')?.value || 'major_station'; }
function currentSelectedUnits(section) { return Number(section?.querySelector('#kfm-units')?.value || 10); }
function attachPanelEvents(section) {
  if (!section || section.dataset.kfmBound === '1') return;
  section.dataset.kfmBound = '1';
  section.querySelector('#kfm-station')?.addEventListener('change', () => refreshPanel());
  section.querySelector('#kfm-units')?.addEventListener('change', () => refreshPanel());
  section.querySelector('#kfm-buy')?.addEventListener('click', purchaseFuel);
  section.querySelector('#kfm-complain')?.addEventListener('click', fileComplaint);
  section.querySelector('#kfm-export')?.addEventListener('click', exportLog);
}
function priceLabel(day, stationId) { return stationPricePerGaugePoint(day, stationId); }
function snapshot() {
  const { day, mode, s } = context();
  const state = sanitizeFuelMarketState(marketState);
  const multiplier = dailyFuelPriceMultiplier(day);
  return {
    ...state,
    day,
    mode,
    fuelPercent: state.fuelPercent == null ? currentFuel() : state.fuelPercent,
    wallet: Math.max(0, Math.round(Number(lifeSnapshot().wallet ?? save.money) || 0)),
    activeShift: Boolean(lifeSnapshot().activeShift),
    marketMultiplier: multiplier,
    pricePressure: multiplier >= 1.15 ? 'high' : multiplier <= 0.92 ? 'low' : 'normal',
    quotes: Object.fromEntries(Object.keys(FUEL_STATIONS).map(id => [id, priceLabel(day, id)])),
    liveFuelAvailable: Number.isFinite(Number(s?.fuel)),
    valuesAreGameBalanceNotLiveQuotes: true,
  };
}
function refreshPanel() {
  const section = ensurePanel();
  if (!section) return;
  const snap = snapshot();
  const put = (id, value) => { const node = section.querySelector(`#${id}`); if (node) node.textContent = value; };
  put('kfm-fuel', percent(snap.fuelPercent));
  put('kfm-prepaid', `${snap.prepaidUnits.toFixed(1)} points`);
  put('kfm-market', `${snap.pricePressure.toUpperCase()} · ${Math.round(snap.marketMultiplier * 100)}%`);
  put('kfm-wallet', money(snap.wallet));
  const station = currentSelectedStation(section);
  const rate = priceLabel(snap.day, station);
  const chosen = currentSelectedUnits(section);
  const available = Math.max(0, 100 - snap.fuelPercent);
  const fill = Math.round(Math.min(chosen, available) * 10) / 10;
  put('kfm-quote', fill > 0
    ? `Today's simulated quote: ${money(rate)} per fuel point · ${fill} points cost ${money(fill * rate)}. Tank capacity remaining: ${available.toFixed(1)} points.`
    : 'Tank is full; no additional fuel can be purchased.');
  const active = snap.activeShift || context().game?.state === 'PLAY';
  const buy = section.querySelector('#kfm-buy');
  if (buy) buy.disabled = active || fill <= 0;
  const complain = section.querySelector('#kfm-complain');
  if (complain) complain.disabled = marketState.lastComplaintDay === snap.day;
  const history = section.querySelector('#kfm-history');
  if (history) history.innerHTML = marketState.history.slice(-5).reverse().map(row => {
    const title = row.type === 'purchase' ? `Bought ${row.units.toFixed(1)} fuel points` : row.type === 'complaint' ? 'Fuel-price complaint recorded' : 'Shift fuel recorded';
    const detail = row.type === 'purchase' ? money(row.cost) : row.type === 'complaint' ? `${money(row.pricePerGaugePoint)} / point` : `${row.fuelStart.toFixed(1)}% → ${row.fuelEnd.toFixed(1)}%`;
    return `<div class="kfm-history-row"><span>${title}<br><small>Day ${row.day}${row.stationId ? ` · ${FUEL_STATIONS[row.stationId]?.label || row.stationId}` : ''}</small></span><b>${detail}</b></div>`;
  }).join('');
}
function isStorageWritable() {
  try { const storage = globalThis.localStorage; if (!storage) return false; const key = 'kfm-probe'; storage.setItem(key, '1'); storage.removeItem(key); return true; }
  catch { return false; }
}
function shiftIsActive() {
  return Boolean(lifeSnapshot().activeShift || context().game?.state === 'PLAY');
}
function purchaseFuel() {
  const section = ensurePanel();
  if (!section) return;
  if (!document.getElementById('kano-life-career-screen') || document.getElementById('kano-life-career-screen').classList.contains('hidden')) {
    notify('Open LIFE & CAREER before buying fuel.', 'error'); return;
  }
  if (shiftIsActive()) { notify('Finish the active shift before buying fuel.', 'error'); return; }
  if (!isStorageWritable()) { notify('Browser storage is unavailable; no fuel was purchased.', 'error'); return; }
  const life = lifeApi();
  if (typeof life?.chargeExpense !== 'function') { notify('The existing career-wallet transaction hook is unavailable. No charge was made.', 'error'); return; }
  const { day, s, game } = context();
  const liveFuel = Number(s?.fuel);
  if (marketState.fuelPercent == null) marketState.fuelPercent = Number.isFinite(liveFuel) ? clamp(liveFuel, 0, 100) : 100;
  const before = sanitizeFuelMarketState(marketState);
  const selectedStation = currentSelectedStation(section);
  const result = recordFuelPurchase(before, { day, stationId: selectedStation, requestedUnits: currentSelectedUnits(section), wallet: lifeSnapshot().wallet ?? save.money ?? 0 });
  if (!result.ok) {
    const messages = {
      insufficient_wallet: `Your wallet cannot cover ${money(result.required)}. Savings are not spendable for fuel purchases.`,
      tank_full: 'The tank is already full.',
      storage_unavailable: 'Fuel storage is unavailable.',
      fuel_level_unknown: 'Fuel level is not yet available. Start a Career or Free roam shift once, then return to the market.',
    };
    notify(messages[result.reason] || 'Fuel purchase failed; no charge was made.', 'error'); return;
  }
  const prepared = saveFuelMarketState(result.state);
  if (!prepared.ok) { notify('Fuel-market storage is unavailable; no money was charged.', 'error'); return; }
  const charge = life.chargeExpense({ amount: result.cost, category: 'fuel', serviceId: 'fuel_purchase', description: `Prepaid fuel at ${result.station.label}`, day });
  if (!charge?.ok) {
    saveFuelMarketState(before);
    marketState = before;
    const message = charge?.reason === 'insufficient_wallet' ? `Wallet balance ${money(charge.wallet)} is below ${money(result.cost)}.`
      : charge?.reason === 'shift_active' ? 'Finish the active shift before buying fuel.' : 'Fuel transaction failed; purchase was rolled back.';
    notify(message, 'error'); refreshPanel(); return;
  }
  marketState = prepared.state;
  // The current scene is not playing; update its stored state for clarity. The next
  // career/free-roam start applies the persistent fuel level after Game.resetRun().
  if (game?.s && game.state !== 'PLAY') game.s.fuel = marketState.fuelPercent;
  persist(marketState);
  emitUpdate({ type: 'purchase', day, stationId: selectedStation, units: result.units, cost: result.cost });
  refreshPanel();
  notify(`Added ${result.units.toFixed(1)} fuel points for ${money(result.cost)} from your existing wallet. Purchased units will not be charged twice at shift settlement.`, 'success');
}
function fileComplaint() {
  const section = ensurePanel();
  if (!section) return;
  const { day } = context();
  const result = recordFuelPriceComplaint(marketState, { day, stationId: currentSelectedStation(section) });
  if (!result.ok) { notify('A fuel-price complaint is already recorded for this in-game day.', 'warning'); return; }
  const saved = saveFuelMarketState(result.state);
  if (!saved.ok) { notify('Fuel ledger could not be saved; the complaint was not recorded.', 'error'); return; }
  marketState = saved.state;
  emitUpdate({ type: 'complaint', day, stationId: currentSelectedStation(section), pricePerGaugePoint: result.pricePerGaugePoint });
  refreshPanel();
  notify(`Recorded your complaint about ${money(result.pricePerGaugePoint)} per fuel point at ${result.station.label}. No wallet or reputation change was awarded.`, 'success');
}
function exportLog() {
  const data = { exportedAt: new Date().toISOString(), fuelMarket: snapshot(), note: 'Prices and quantities are fictional gameplay values. Fuel units are fuel-gauge percentage points, not litres. No passwords or account credentials are included.' };
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'kano-life-fuel-market.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Fuel-market history export requested.', 'success');
  } catch { notify('Export is unavailable in this browser.', 'error'); }
}
function emitUpdate(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kano:fuel-market-updated', { detail: { ...detail, snapshot: snapshot() } }));
}
function installGameHooks() {
  if (!Game?.prototype || Game.prototype[PATCH]) return;
  Object.defineProperty(Game.prototype, PATCH, { value: true });
  const originalStart = Game.prototype.start;
  if (typeof originalStart === 'function') {
    Game.prototype.start = function startWithPersistentFuelMarket(mode, ...args) {
      const result = originalStart.call(this, mode, ...args);
      const actualMode = this.mode || mode || '';
      if (!isCareerMode(actualMode) || !this.s) return result;
      marketState = loadFuelMarketState();
      const day = context(this).day;
      const live = Number(this.s.fuel);
      if (marketState.fuelPercent == null) {
        marketState.fuelPercent = Number.isFinite(live) ? clamp(live, 0, 100) : 100;
        persist(marketState);
      }
      const startingFuel = clamp(marketState.fuelPercent, 0, 100);
      this.s.fuel = startingFuel;
      const prepaidAtStart = Math.min(marketState.prepaidUnits, startingFuel);
      this.s.__kanoFuelMarketStartFuel = startingFuel;
      this.s.__kanoFuelMarketCreditsAtStart = prepaidAtStart;
      this.s.__kanoFuelMarketPriceMultiplier = dailyFuelPriceMultiplier(day);
      // Maintenance has already synchronized condition/engine/tyres; synchronize the
      // real fuel gauge, then apply a lower billing baseline for prepaid units.
      lifeApi()?.syncActiveShiftStart?.(this.s);
      lifeApi()?.syncFuelMarketShiftStart?.({
        fuelBaseline: Math.max(0, startingFuel - prepaidAtStart),
        fuelGaugeAtShiftStart: startingFuel,
        prepaidFuelAtStart: prepaidAtStart,
        fuelPriceMultiplier: dailyFuelPriceMultiplier(day),
      });
      marketState.lastDay = day;
      persist(marketState);
      emitUpdate({ type: 'shift_started', day, startingFuel, prepaidAtStart });
      return result;
    };
  }
  const originalFinish = Game.prototype.finishOrContinue;
  if (typeof originalFinish === 'function') {
    Game.prototype.finishOrContinue = function finishWithPersistentFuelMarket(...args) {
      const trackedState = this.s;
      const mode = this.mode || trackedState?.__kanoVehicleMaintenanceMode || '';
      const markerStart = Number(trackedState?.__kanoFuelMarketStartFuel);
      const markerCredits = Number(trackedState?.__kanoFuelMarketCreditsAtStart) || 0;
      const result = originalFinish.apply(this, args);
      if (!trackedState || !isCareerMode(mode) || !Number.isFinite(markerStart)) return result;
      // A life-ledger shift is settled only when its activeShift has been cleared.
      // Keep credits intact if the game is continuing the same run.
      if (lifeSnapshot().activeShift) return result;
      const endFuel = Number(trackedState.fuel);
      if (!Number.isFinite(endFuel)) return result;
      marketState = loadFuelMarketState();
      const startFuel = Number.isFinite(markerStart) ? clamp(markerStart, 0, 100) : (marketState.fuelPercent ?? endFuel);
      const captured = recordFuelShiftEnd(marketState, {
        day: context({ s: trackedState, mode }).day,
        fuelStart: startFuel,
        fuelEnd: clamp(endFuel, 0, 100),
        prepaidAtStart: markerCredits,
      });
      marketState = captured.state;
      persist(marketState);
      delete trackedState.__kanoFuelMarketStartFuel;
      delete trackedState.__kanoFuelMarketCreditsAtStart;
      delete trackedState.__kanoFuelMarketPriceMultiplier;
      emitUpdate({ type: 'shift_ended', fuelUsed: captured.fuelUsed, prepaidUsed: captured.prepaidUsed, billableUnits: captured.billableUnits });
      return result;
    };
  }
}
function installUiHooks() {
  if (!UI?.prototype) return;
  const symbol = Symbol.for('kano.life.fuelMarket.ui.v1');
  if (UI.prototype[symbol]) return;
  Object.defineProperty(UI.prototype, symbol, { value: true });
  const oldBind = UI.prototype.bind;
  if (typeof oldBind === 'function') {
    UI.prototype.bind = function bindFuelMarket(...args) {
      const result = oldBind.apply(this, args);
      activeUI = this;
      ensurePanel(); refreshPanel();
      return result;
    };
  }
}
function install() {
  if (initialized || typeof document === 'undefined' || typeof window === 'undefined') return;
  initialized = true;
  activeUI = window.__KANO_ACTIVE_UI__ || null;
  marketState = loadFuelMarketState();
  ensurePanel();
  installGameHooks();
  installUiHooks();
  for (const event of ['kano:life-shift-settled', 'kano:daily-day-change', 'kano:day-settlement-closed', 'kano:life-fuel-expense', 'kano:fuel-market-updated']) window.addEventListener(event, refreshPanel);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshPanel, { once: true });
  window.kanoNorthernDriverFuelMarket = { version: 1, snapshot, refresh: refreshPanel, export: () => JSON.stringify(snapshot(), null, 2) };
  if (activeUI) { ensurePanel(); refreshPanel(); }
  console.info('[Kano Life] Persistent fuel market, prepaid fuel and daily price pressure loaded.');
}
install();
