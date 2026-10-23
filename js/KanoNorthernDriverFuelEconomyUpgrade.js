/** Runtime integration for the existing Career/Free roam fuel gauge. */
import { Game } from './game.js';
import { UI } from './ui.js';
import { save } from './storage.js';
import {
  DRIVING_STYLES, adjustFuelConsumption, appendShiftEconomyReport,
  loadFuelEconomyState, saveFuelEconomyState, sanitizeFuelEconomyState,
  makeShiftEconomyReport,
} from './KanoNorthernDriverFuelEconomy.js';

const TICK_PATCH = Symbol.for('kano.life.fuelEconomy.tick.v1');
const START_PATCH = Symbol.for('kano.life.fuelEconomy.start.v1');
const UI_PATCH = Symbol.for('kano.life.fuelEconomy.ui.v1');
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : 0));
const round = (value, places = 3) => { const m = 10 ** places; return Math.round((Number(value) || 0) * m) / m; };
const isCareerMode = mode => ['career', 'freeroam'].includes(String(mode || '').toLowerCase().replace(/[^a-z]/g, ''));
let activeUI = null;
let economyState = loadFuelEconomyState();
let run = null;
let panelRefreshQueued = false;

function persist() {
  const result = saveFuelEconomyState(economyState);
  if (result.ok) economyState = result.state;
  return result.ok;
}
function context() {
  const ui = activeUI || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null);
  const game = ui?.game || null;
  const s = game?.s || {};
  const day = Math.max(1, Math.floor(Number(s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1) || 1));
  const mode = String(game?.mode || s.mode || '').toLowerCase();
  return { ui, game, s, day, mode };
}
function activeCareerRun(game) {
  return Boolean(game && game.state === 'PLAY' && !game.s?.event && isCareerMode(game.mode || game.s?.mode));
}
function passengerSeats(s) {
  const list = Array.isArray(s?.passengers) ? s.passengers : [];
  return Math.min(8, list.reduce((sum, p) => sum + Math.max(0, Math.floor(Number(p?.seats) || 0)), 0));
}
function beginRun(game) {
  const s = game?.s;
  if (!s || !isCareerMode(game.mode || s.mode)) { run = null; return; }
  run = {
    day: Math.max(1, Math.floor(Number(s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1) || 1)),
    style: economyState.style,
    baselineFuelUsed: 0,
    adjustedFuelUsed: 0,
    distanceStart: Math.max(0, Number(s.distance) || 0),
    lastDistance: Math.max(0, Number(s.distance) || 0),
    seatTicks: 0,
    tickCount: 0,
    peakSeats: 0,
    passengerSeatTicks: 0,
    harshAccelerations: 0,
    harshBrakes: 0,
    accelCooldown: 0,
    brakeCooldown: 0,
    multiplierTotal: 0,
    priceMultiplier: clamp(s.__kanoFuelMarketPriceMultiplier, 0.5, 2) || 1,
    finalized: false,
  };
  queuePanelRefresh();
}
function queuePanelRefresh() {
  if (panelRefreshQueued || typeof window === 'undefined') return;
  panelRefreshQueued = true;
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => setTimeout(fn, 0);
  schedule(() => { panelRefreshQueued = false; refreshPanel(); });
}
function currentStyleDescription(style) {
  if (style === 'smooth') return 'Lower fuel use when you keep acceleration and braking gentle. Driving condition still matters.';
  if (style === 'fast') return 'Higher fuel use, especially with hard acceleration, braking and worn parts.';
  return 'Middle-ground fuel use for an ordinary working shift.';
}
function ensureStyles() {
  if (document.getElementById('kfe-style')) return;
  const style = document.createElement('style');
  style.id = 'kfe-style';
  style.textContent = `
    #kano-fuel-economy-panel{margin-top:16px;padding-top:13px;border-top:1px solid #29465b;min-width:0;color:#e7f0f7}
    #kano-fuel-economy-panel .kfe-note{font-size:12px;line-height:1.5;color:#a9bdcc}
    #kano-fuel-economy-panel .kfe-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:10px 0}
    #kano-fuel-economy-panel .kfe-stat{min-width:0;padding:9px 10px;border:1px solid #29465b;border-radius:9px;background:#0a1723;display:grid;gap:4px}
    #kano-fuel-economy-panel .kfe-stat span{font-size:11px;color:#a9bdcc}#kano-fuel-economy-panel .kfe-stat strong{font-size:14px;overflow-wrap:anywhere}
    #kano-fuel-economy-panel .kfe-form{display:grid;grid-template-columns:1fr;gap:8px;margin:10px 0}
    #kano-fuel-economy-panel label{display:grid;gap:5px;font-size:12px;color:#c5d4df}
    #kano-fuel-economy-panel select{width:100%;min-height:44px;border-radius:8px;padding:8px 10px;background:#0a1723;color:#f2f7fb;border:1px solid #3d6077;font:inherit;font-size:16px;box-sizing:border-box}
    #kano-fuel-economy-panel button{min-height:44px;border-radius:8px;padding:9px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;background:#172d40;color:#f2f7fb;border:1px solid #3d6077}
    #kano-fuel-economy-panel button:disabled{opacity:.5;cursor:not-allowed}
    #kano-fuel-economy-panel [role=status]{min-height:18px;font-size:12px;line-height:1.45;color:#8fe1c5}
    @media(max-width:520px){#kano-fuel-economy-panel .kfe-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.append(style);
}
function ensurePanel() {
  if (typeof document === 'undefined') return null;
  const parent = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!parent) return null;
  let section = document.getElementById('kano-fuel-economy-panel');
  if (section) { attachPanelEvents(section); return section; }
  ensureStyles();
  section = document.createElement('section');
  section.id = 'kano-fuel-economy-panel';
  section.setAttribute('aria-labelledby', 'kfe-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="kfe-title">FUEL ECONOMY & DRIVING STYLE</h3>
    <p class="kfe-note">Your core driving model already uses speed, throttle and passenger-seat load. This layer adds your selected work style, hard acceleration/braking and the actual engine, body and tyre condition. Fuel points are gauge percentage points, not litres. Estimates are gameplay values, not workshop or fuel-market quotes.</p>
    <div class="kfe-form"><label for="kfe-style">Driving approach<select id="kfe-style">${Object.values(DRIVING_STYLES).map(item => `<option value="${item.id}">${item.label}</option>`).join('')}</select></label></div>
    <p class="kfe-note" id="kfe-style-copy"></p>
    <div class="kfe-grid" aria-label="Fuel economy summary">
      <div class="kfe-stat"><span>BASELINE FUEL</span><strong id="kfe-base">—</strong></div>
      <div class="kfe-stat"><span>ACTUAL FUEL USE</span><strong id="kfe-actual">—</strong></div>
      <div class="kfe-stat"><span>FUEL DIFFERENCE</span><strong id="kfe-difference">—</strong></div>
      <div class="kfe-stat"><span>EST. REPLACEMENT COST</span><strong id="kfe-cost">—</strong></div>
      <div class="kfe-stat"><span>PEAK PASSENGER SEATS</span><strong id="kfe-load">—</strong></div>
      <div class="kfe-stat"><span>HARSH INPUTS</span><strong id="kfe-behaviour">—</strong></div>
    </div>
    <p class="kfe-note" id="kfe-summary"></p>
    <button type="button" id="kfe-export">EXPORT FUEL-ECONOMY REPORT</button>
    <p role="status" aria-live="polite" id="kfe-status"></p>
  `;
  parent.append(section);
  attachPanelEvents(section);
  return section;
}
function attachPanelEvents(section) {
  if (!section || section.dataset.kfeBound === '1') return;
  section.dataset.kfeBound = '1';
  section.querySelector('#kfe-style')?.addEventListener('change', event => {
    if (run && !run.finalized) {
      event.currentTarget.value = economyState.style;
      notify('Finish the active shift before changing driving style.', 'warning');
      return;
    }
    economyState = sanitizeFuelEconomyState({ ...economyState, style: event.currentTarget.value });
    persist(); refreshPanel(); emit('style_changed');
  });
  section.querySelector('#kfe-export')?.addEventListener('click', exportReport);
}
function formatFuel(value) { return `${round(value, 2).toFixed(2)} pts`; }
function money(value) { return `₦${Math.round(Number(value) || 0).toLocaleString('en-NG')}`; }
function currentSnapshot() {
  const { game, s, day } = context();
  const liveRun = run && !run.finalized ? run : null;
  const base = liveRun?.baselineFuelUsed ?? economyState.lastShift?.baselineFuelUsed ?? 0;
  const actual = liveRun?.adjustedFuelUsed ?? economyState.lastShift?.adjustedFuelUsed ?? 0;
  const delta = actual - base;
  return {
    version: 1, day, style: economyState.style, active: Boolean(liveRun && activeCareerRun(game)),
    engine: clamp(s.engine ?? 100, 0, 100), condition: clamp(s.condition ?? 100, 0, 100), tyres: clamp(s.tyres ?? 100, 0, 100),
    currentPassengerSeats: passengerSeats(s),
    activeBaselineFuelUsed: round(liveRun?.baselineFuelUsed ?? 0),
    activeAdjustedFuelUsed: round(liveRun?.adjustedFuelUsed ?? 0),
    totalShifts: economyState.totalShifts, totalBaselineFuelUsed: economyState.totalBaselineFuelUsed,
    totalAdjustedFuelUsed: economyState.totalAdjustedFuelUsed, totalExtraFuelUsed: economyState.totalExtraFuelUsed,
    lastShift: economyState.lastShift, activeDifference: round(delta), history: economyState.history,
  };
}
function refreshPanel() {
  const section = ensurePanel();
  if (!section) return;
  const snap = currentSnapshot();
  const selected = section.querySelector('#kfe-style');
  if (selected) { selected.value = economyState.style; selected.disabled = Boolean(snap.active); }
  const set = (id, value) => { const el = section.querySelector(`#${id}`); if (el) el.textContent = value; };
  set('kfe-style-copy', currentStyleDescription(economyState.style));
  const live = run && !run.finalized ? run : null;
  const report = live || economyState.lastShift;
  set('kfe-base', formatFuel(report?.baselineFuelUsed ?? 0));
  set('kfe-actual', formatFuel(report?.adjustedFuelUsed ?? 0));
  const d = Number(report?.extraFuelUsed ?? ((report?.adjustedFuelUsed ?? 0) - (report?.baselineFuelUsed ?? 0)));
  set('kfe-difference', `${d > 0 ? '+' : ''}${round(d, 2).toFixed(2)} pts`);
  set('kfe-cost', money(report?.estimatedReplacementCostDifference ?? d * 8));
  set('kfe-load', `${live?.peakSeats ?? report?.peakPassengerSeats ?? 0} seats`);
  set('kfe-behaviour', `${live?.harshAccelerations ?? report?.harshAccelerations ?? 0} accel. / ${live?.harshBrakes ?? report?.harshBrakes ?? 0} brakes`);
  set('kfe-summary', live
    ? `Shift in progress · engine ${Math.round(snap.engine)}% · body ${Math.round(snap.condition)}% · tyres ${Math.round(snap.tyres)}%. Passenger load increases the core game's baseline fuel rate; this panel does not count that fuel term a second time.`
    : report
      ? `Last shift: day ${report.day}, ${report.style} style, ${round(report.distance, 2)} distance units. The replacement-cost difference is an estimate, not an additional wallet charge.`
      : 'Choose a driving style before beginning a Career or Free roam shift. Your first shift will establish the fuel-use report.');
}
function notify(message, level = 'success') {
  const status = document.getElementById('kfe-status');
  if (status) { status.textContent = message; status.dataset.state = level; }
  activeUI?.game?.ui?.toast?.(message);
}
function exportReport() {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const data = { exportedAt: new Date().toISOString(), fuelEconomy: currentSnapshot(), note: 'Fuel points are gauge percentage points, not litres. Cost differences are estimated and do not trigger a wallet transaction.' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = 'kano-life-fuel-economy.json'; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  notify('Fuel-economy report exported.');
}
function emit(type, detail = {}) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kano:fuel-economy-updated', { detail: { type, ...detail, snapshot: currentSnapshot() } }));
}
function installGameHooks() {
  if (!Game?.prototype) return;
  if (typeof Game.prototype.start === 'function' && !Game.prototype[START_PATCH]) {
    Object.defineProperty(Game.prototype, START_PATCH, { value: true });
    const originalStart = Game.prototype.start;
    Game.prototype.start = function startWithFuelEconomy(...args) {
      const result = originalStart.apply(this, args);
      if (isCareerMode(this.mode || this.s?.mode)) beginRun(this);
      else run = null;
      return result;
    };
  }
  if (typeof Game.prototype.tick === 'function' && !Game.prototype[TICK_PATCH]) {
    Object.defineProperty(Game.prototype, TICK_PATCH, { value: true });
    const originalTick = Game.prototype.tick;
    Game.prototype.tick = function tickWithFuelEconomy(...args) {
      const sBefore = this.s;
      const eligible = activeCareerRun(this) && sBefore && Number.isFinite(Number(sBefore.fuel));
      const beforeFuel = eligible ? clamp(sBefore.fuel, 0, 100) : 0;
      const beforeSpeed = eligible ? clamp(sBefore.speed, 0, 300) : 0;
      const dt = clamp(args[0], 0, 0.045);
      const result = originalTick.apply(this, args);
      if (!eligible || !run || run.finalized || !dt || this.s !== sBefore || !Number.isFinite(Number(sBefore.fuel))) return result;
      const afterFuel = clamp(sBefore.fuel, 0, 100);
      if (afterFuel >= beforeFuel) return result; // Do not reinterpret a refuel/pickup tick.
      const baseFuelUsed = beforeFuel - afterFuel;
      const afterSpeed = clamp(sBefore.speed, 0, 300);
      const acceleration = (afterSpeed - beforeSpeed) / dt;
      const seats = passengerSeats(sBefore);
      const factors = adjustFuelConsumption(baseFuelUsed, {
        style: run.style, speedKmh: afterSpeed, throttle: Boolean(sBefore.gas),
        braking: Boolean(sBefore.brake), reverse: Boolean(sBefore.reverse),
        accelerationKmhPerSecond: acceleration,
        engine: sBefore.engine ?? 100, condition: sBefore.condition ?? 100, tyres: sBefore.tyres ?? 100,
      });
      const adjustedFuelUsed = Math.min(beforeFuel, factors.adjustedFuelUsed);
      sBefore.fuel = Math.max(0, round(beforeFuel - adjustedFuelUsed, 5));
      run.baselineFuelUsed = round(run.baselineFuelUsed + baseFuelUsed, 5);
      run.adjustedFuelUsed = round(run.adjustedFuelUsed + adjustedFuelUsed, 5);
      run.multiplierTotal += factors.multiplier;
      run.tickCount += 1;
      run.seatTicks += seats > 0 ? 1 : 0;
      run.passengerSeatTicks += seats;
      run.peakSeats = Math.max(run.peakSeats, seats);
      run.accelCooldown = Math.max(0, run.accelCooldown - dt);
      run.brakeCooldown = Math.max(0, run.brakeCooldown - dt);
      // Count driving incidents, not every render frame during one manoeuvre.
      if (factors.hardAcceleration && run.accelCooldown <= 0) { run.harshAccelerations += 1; run.accelCooldown = 1.2; }
      if (factors.hardBraking && run.brakeCooldown <= 0) { run.harshBrakes += 1; run.brakeCooldown = 1.2; }
      const distanceNow = Math.max(0, Number(sBefore.distance) || 0);
      run.lastDistance = Math.max(run.lastDistance, distanceNow);
      queuePanelRefresh();
      return result;
    };
  }
}
function finalizeRun(detail = {}) {
  if (!run || run.finalized) return;
  const life = typeof window !== 'undefined' ? window.kanoNorthernDriverLifeSimulation : null;
  const priceMultiplier = clamp(detail.snapshot?.shiftPriceMultiplier ?? detail.priceMultiplier ?? context().s.__kanoFuelMarketPriceMultiplier ?? run.priceMultiplier, 0.5, 2) || 1;
  const baseline = run.baselineFuelUsed;
  const adjusted = run.adjustedFuelUsed;
  const report = makeShiftEconomyReport({
    day: run.day, style: run.style, baselineFuelUsed: baseline, adjustedFuelUsed: adjusted,
    distance: Math.max(0, run.lastDistance - run.distanceStart),
    occupiedTicks: run.seatTicks, passengerSeatTicks: run.passengerSeatTicks, peakPassengerSeats: run.peakSeats,
    harshAccelerations: run.harshAccelerations, harshBrakes: run.harshBrakes,
    pricePerGaugePoint: 8 * priceMultiplier,
  });
  economyState = appendShiftEconomyReport(economyState, report);
  run.finalized = true;
  persist(); emit('shift_ended', { report, fuelMarketSettlement: detail.snapshot || null });
  queuePanelRefresh();
  run = null;
  void life;
}
function installEvents() {
  if (typeof window === 'undefined' || window.__kanoFuelEconomyEventsInstalled) return;
  window.__kanoFuelEconomyEventsInstalled = true;
  window.addEventListener('kano:fuel-market-updated', event => {
    const detail = event?.detail || {};
    if (detail.type === 'shift_started') { beginRun(context().game); queuePanelRefresh(); }
    if (detail.type === 'shift_ended') finalizeRun(detail);
    queuePanelRefresh();
  });
  for (const eventName of ['kano:life-shift-settled', 'kano:daily-day-change', 'kano:vehicle-maintenance-updated']) window.addEventListener(eventName, queuePanelRefresh);
}
function installUIHooks() {
  if (!UI?.prototype || UI.prototype[UI_PATCH]) return;
  Object.defineProperty(UI.prototype, UI_PATCH, { value: true });
  const originalBind = UI.prototype.bind;
  if (typeof originalBind === 'function') {
    UI.prototype.bind = function bindFuelEconomy(...args) {
      const result = originalBind.apply(this, args);
      activeUI = this;
      ensurePanel(); refreshPanel();
      return result;
    };
  }
}
function install() {
  installGameHooks(); installUIHooks(); installEvents();
  if (typeof window !== 'undefined') {
    activeUI = window.__KANO_ACTIVE_UI__ || activeUI;
    window.kanoNorthernDriverFuelEconomy = {
      version: 1,
      snapshot: currentSnapshot,
      setStyle(style) {
        if (run && !run.finalized) return { ok: false, reason: 'shift_active', snapshot: currentSnapshot() };
        if (!Object.hasOwn(DRIVING_STYLES, style)) return { ok: false, reason: 'invalid_style', snapshot: currentSnapshot() };
        economyState = sanitizeFuelEconomyState({ ...economyState, style });
        const ok = persist(); refreshPanel(); emit('style_changed'); return { ok, snapshot: currentSnapshot() };
      },
      export: () => JSON.stringify(currentSnapshot(), null, 2),
      refresh: refreshPanel,
    };
  }
  if (typeof document !== 'undefined') {
    ensurePanel(); refreshPanel();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { ensurePanel(); refreshPanel(); }, { once: true });
  }
}
install();
