/** Step 71 UI layer: seasonal work/household resilience plus calendar-linked world weather. */
import { save, persist } from './storage.js';
import {
  KANO_SEASONAL_STORAGE_KEY,
  KANO_SEASONAL_ACTIONS,
  createDefaultSeasonalResilienceState,
  normalizeSeasonalResilienceState,
  getSeasonalRiskSnapshot,
  actionsForSeason,
  recordSeasonalAction,
  exportSeasonalResilienceReport,
} from './KanoNorthernDriverSeasonalResilience.js';

const SECTION_ID = 'kano-seasonal-resilience';
const STYLE_ID = 'ksr-style';
const INSTALL_KEY = Symbol.for('kano.life.seasonalResilience.uiInstalled.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const textSafe = (value, max = 260) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, max);

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(KANO_SEASONAL_STORAGE_KEY);
    return normalizeSeasonalResilienceState(raw ? JSON.parse(raw) : createDefaultSeasonalResilienceState());
  } catch { return createDefaultSeasonalResilienceState(); }
}
let state = loadState();
let notice = '';
let noticeError = false;
let lastRenderKey = '';
let observer = null;
let refreshTimer = null;

function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const life = typeof window !== 'undefined' ? window.kanoNorthernDriverLifeSimulation?.snapshot?.() || {} : {};
  const society = typeof window !== 'undefined' ? window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? life.day ?? society.day
    ?? s.__kanoSeasonalSimulationDay ?? save?.lifestyle?.seasonalSimulationDay ?? 1;
  const parsed = Number(rawDay);
  const day = Math.max(1, Math.floor(Number.isFinite(parsed) ? parsed : 1));
  const activeShift = Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state)));
  return { ui, game, s, day, activeShift };
}

function snapshot() {
  const ctx = context();
  return getSeasonalRiskSnapshot(ctx.day, state);
}

function persistState(next, message = '') {
  const normalized = normalizeSeasonalResilienceState(next);
  try {
    if (!globalThis.localStorage) throw new Error('storage unavailable');
    globalThis.localStorage.setItem(KANO_SEASONAL_STORAGE_KEY, JSON.stringify(normalized));
    state = normalized;
    window.dispatchEvent(new CustomEvent('kano:seasonal-resilience-updated', { detail: snapshot() }));
    if (message) { notice = textSafe(message); noticeError = false; }
    render();
    return true;
  } catch {
    notify('Browser storage is unavailable. No change was saved.', true);
    return false;
  }
}

function persistAutoSetting(enabled) {
  try {
    if (!save.lifestyle || typeof save.lifestyle !== 'object') save.lifestyle = {};
    save.lifestyle.seasonalAuto = Boolean(enabled);
    const ctx = context();
    if (!Number.isFinite(Number(save.lifestyle.seasonalSimulationDay))) save.lifestyle.seasonalSimulationDay = ctx.day;
    persist();
    if (ctx.s && typeof ctx.s === 'object') {
      try {
        const value = snapshot();
        const desc = Object.getOwnPropertyDescriptor(ctx.s, '__kanoSeasonalContext');
        if (desc) Object.defineProperty(ctx.s, '__kanoSeasonalContext', { value, enumerable: false, configurable: true, writable: true });
        else Object.defineProperty(ctx.s, '__kanoSeasonalContext', { value, enumerable: false, configurable: true, writable: true });
      } catch { /* Optional bridge state; the next game tick will retry. */ }
    }
    window.dispatchEvent(new CustomEvent('kano:seasonal-context-changed', { detail: snapshot() }));
    render();
    notify(enabled ? 'Calendar-linked seasons enabled. Rainy-season road hazards are modestly more likely.' : 'Manual season control restored.');
    return true;
  } catch {
    notify('The season setting could not be saved.', true);
    return false;
  }
}

function notify(message, error = false) {
  notice = textSafe(message); noticeError = Boolean(error);
  const node = el('ksr-notice');
  if (node) { node.textContent = notice; node.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}

function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 8px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .ksr-note{margin:6px 0;font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .ksr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .ksr-card,#${SECTION_ID} .ksr-action{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .ksr-card h4,#${SECTION_ID} .ksr-action h4{margin:0 0 7px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .ksr-stat{margin:5px 0;font-size:20px;font-weight:900;color:#f8fbff}
    #${SECTION_ID} label.ksr-toggle{display:flex;align-items:flex-start;gap:10px;margin:10px 0;color:#e3eef6;font-size:13px;line-height:1.45}
    #${SECTION_ID} input[type=checkbox]{width:20px;height:20px;flex:0 0 auto;accent-color:#00b4d8}
    #${SECTION_ID} .ksr-meter-row{margin:9px 0}
    #${SECTION_ID} .ksr-meter-row small{display:block;margin-bottom:4px;font-size:11px;color:#c3d3df}
    #${SECTION_ID} .ksr-meter{height:7px;border-radius:9px;background:#1b3447;overflow:hidden}
    #${SECTION_ID} .ksr-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} .ksr-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}
    #${SECTION_ID} button{width:100%;min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button.ksr-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .ksr-action p{margin:5px 0 10px;font-size:12px;line-height:1.45;color:#c3d3df}
    #${SECTION_ID} .ksr-pill{display:inline-block;border:1px solid #547388;border-radius:100px;padding:4px 8px;font-size:10px;font-weight:800;color:#e6f3f9;margin:0 4px 4px 0}
    #${SECTION_ID} .ksr-notice{min-height:18px;margin-top:9px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .ksr-notice[data-state=error]{color:#ffb4aa}
    #${SECTION_ID} .ksr-log{padding:9px 0;border-bottom:1px solid #20394b;font-size:12px;line-height:1.45;color:#c6d7e3}
    @media(max-width:560px){#${SECTION_ID} .ksr-grid,#${SECTION_ID} .ksr-actions{grid-template-columns:1fr}}
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

function button(label, action, disabled = false, primary = false, actionId = '') {
  const node = document.createElement('button');
  node.type = 'button'; node.textContent = label; node.dataset.ksrAction = action;
  if (actionId) node.dataset.ksrActionId = actionId;
  node.disabled = Boolean(disabled);
  if (primary) node.classList.add('ksr-primary');
  return node;
}

function ensureSection() {
  if (el(SECTION_ID)) return true;
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return false;
  installStyles();
  const section = document.createElement('section');
  section.id = SECTION_ID;
  section.setAttribute('aria-labelledby', 'ksr-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="ksr-title">SEASONAL LIVING · WORK RESILIENCE</h3>
    <p class="ksr-note">A research-informed seasonal simulation for Kano. The calendar is approximate and is not a live forecast. Readiness values are game-planning scores, not measured health or financial outcomes. Planning actions do not spend money or alter medical/relationship records.</p>
    <div class="ksr-grid">
      <article class="ksr-card"><h4>Seasonal calendar</h4><div class="ksr-stat" id="ksr-season">Loading season…</div><p class="ksr-note" id="ksr-period"></p><span class="ksr-pill" id="ksr-day-pill">SIM DAY</span><span class="ksr-pill" id="ksr-condition-pill">CONDITION</span><p class="ksr-note" id="ksr-guidance"></p>
        <label class="ksr-toggle"><input type="checkbox" id="ksr-auto"><span><b>Apply calendar seasons to the driving world</b><br>In 3D, existing atmosphere visuals follow the simulated year. In rainy season, one in five eligible clear-road zone spawns uses the existing rainy hazard logic. Manual season selection is restored when turned off.</span></label>
      </article>
      <article class="ksr-card"><h4>Seasonal pressure · game indices</h4><div id="ksr-risk-lines"></div><p class="ksr-note">The values are relative tuning indices from 0–1. They are deliberately not labelled as temperature readings, medical risk scores or forecasts.</p></article>
    </div>
    <article class="ksr-card"><h4>Readiness plan</h4><div id="ksr-readiness"></div><p class="ksr-note" id="ksr-score"></p><div id="ksr-action-list" class="ksr-actions"></div><p class="ksr-note">One planning action per simulated day. Actions record preparation only; any actual fuel, meal, repair or household purchase remains in the existing wallet/system.</p></article>
    <article class="ksr-card" style="margin-top:10px"><h4>Recent planning history</h4><div id="ksr-history"></div><div class="ksr-actions"><button type="button" id="ksr-export">EXPORT SEASONAL REPORT (.JSON)</button><button type="button" id="ksr-reset">RESET READINESS PLAN</button></div></article>
    <p id="ksr-notice" class="ksr-notice" role="status" aria-live="polite"></p>
  `;
  host.append(section);
  section.addEventListener('change', event => {
    if (event.target?.id !== 'ksr-auto') return;
    const enabled = event.target.checked;
    const next = normalizeSeasonalResilienceState({ ...state, enabled });
    if (persistState(next)) persistAutoSetting(enabled);
    else event.target.checked = state.enabled;
  });
  section.addEventListener('click', event => {
    const target = event.target.closest('button[data-ksr-action]');
    if (target) { handleAction(target.dataset.ksrAction, target.dataset.ksrActionId || ''); return; }
  });
  el('ksr-export')?.addEventListener('click', exportReport);
  el('ksr-reset')?.addEventListener('click', resetReadiness);
  render();
  return true;
}

function handleAction(actionType, actionId) {
  const ctx = context();
  if (actionType !== 'record') return;
  const result = recordSeasonalAction(state, actionId, { day: ctx.day, activeShift: ctx.activeShift });
  if (!result.ok) { notify(result.message, true); return; }
  if (!persistState(result.state, result.message)) return;
  notify(result.message);
}

function resetReadiness() {
  const ctx = context();
  if (ctx.activeShift) { notify('Finish the driving shift before resetting this plan.', true); return; }
  const fresh = createDefaultSeasonalResilienceState();
  fresh.enabled = state.enabled;
  if (persistState(fresh, 'Readiness plan reset. No wallet or profile data was changed.')) notify('Readiness plan reset.');
}

function exportReport() {
  try {
    const ctx = context();
    const report = exportSeasonalResilienceReport(state, ctx.day);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `kano-seasonal-resilience-day-${ctx.day}.json`;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    notify('Seasonal planning report exported.');
  } catch { notify('The report could not be exported in this browser.', true); }
}

function meter(container, label, value) {
  const row = document.createElement('div'); row.className = 'ksr-meter-row';
  addText(row, 'small', `${label} ${value}/100`);
  const bar = document.createElement('div'); bar.className = 'ksr-meter';
  const fill = document.createElement('i'); fill.style.width = `${clamp(value, 0, 100)}%`;
  bar.append(fill); row.append(bar); container.append(row);
}

function renderActions(ctx, current) {
  const list = el('ksr-action-list'); if (!list) return;
  list.replaceChildren();
  const doneToday = state.lastActionDay === ctx.day;
  const options = actionsForSeason(ctx.day).slice(0, 4);
  for (const action of options) {
    const card = document.createElement('article'); card.className = 'ksr-action';
    addText(card, 'h4', action.title);
    addText(card, 'p', action.description);
    const seasonTag = action.seasons.includes(current.id) ? 'PRIORITY FOR THIS SEASON' : 'GENERAL PREPARATION';
    addText(card, 'small', seasonTag, 'ksr-note');
    card.append(button(doneToday ? 'DONE FOR TODAY' : 'RECORD PLAN', 'record', doneToday || ctx.activeShift, true, action.id));
    list.append(card);
  }
  if (ctx.activeShift) {
    const line = document.createElement('p'); line.className = 'ksr-note';
    line.textContent = 'Planning actions are disabled during an active driving shift.';
    list.prepend(line);
  }
}

function render() {
  if (!el(SECTION_ID)) return;
  const ctx = context();
  const current = getSeasonalRiskSnapshot(ctx.day, state);
  const isAuto = save?.lifestyle?.seasonalAuto === true;
  const key = `${ctx.day}|${current.id}|${state.enabled}|${state.lastActionDay}|${current.readinessScore}|${ctx.activeShift}|${isAuto}|${notice}`;
  const section = el(SECTION_ID);
  lastRenderKey = key;
  const seasonLabel = el('ksr-season'); if (seasonLabel) seasonLabel.textContent = current.label;
  const period = el('ksr-period'); if (period) period.textContent = `${current.period} · ${current.year ? `simulation year ${current.year}` : 'simulation year'}`;
  const dayPill = el('ksr-day-pill'); if (dayPill) dayPill.textContent = `DAY ${current.dayOfYear}/365`;
  const condition = el('ksr-condition-pill'); if (condition) condition.textContent = current.scenario.toUpperCase();
  const guidance = el('ksr-guidance'); if (guidance) guidance.textContent = current.guidance;
  const auto = el('ksr-auto'); if (auto) auto.checked = isAuto;
  const risks = el('ksr-risk-lines');
  if (risks) {
    risks.replaceChildren();
    meter(risks, 'Visibility / dust pressure', Math.round(current.modifiers.visibilityRisk * 100));
    meter(risks, 'Outdoor heat load', Math.round(current.modifiers.heatLoad * 100));
    meter(risks, 'Wet-road pressure', Math.round(current.modifiers.wetRoadRisk * 100));
    meter(risks, 'Household water pressure', Math.round(current.modifiers.householdWaterPressure * 100));
  }
  const readiness = el('ksr-readiness');
  if (readiness) {
    readiness.replaceChildren();
    for (const [keyName, label] of [['vehicle', 'Vehicle readiness'], ['wellbeing', 'Rest and comfort planning'], ['household', 'Household contingency'], ['finances', 'Budget planning'], ['schedule', 'Schedule flexibility']]) {
      meter(readiness, label, state.readiness[keyName]);
    }
  }
  const score = el('ksr-score'); if (score) score.textContent = `Combined planning readiness: ${current.readinessScore}/100 · ${state.actionLog.length} recorded actions`;
  renderActions(ctx, current);
  const history = el('ksr-history');
  if (history) {
    history.replaceChildren();
    const entries = state.actionLog.slice(-5).reverse();
    if (!entries.length) addText(history, 'p', 'No seasonal planning actions recorded yet.', 'ksr-note');
    for (const entry of entries) addText(history, 'div', `Day ${entry.day} · ${entry.title} · ${entry.season}`, 'ksr-log');
  }
  const noticeNode = el('ksr-notice');
  if (noticeNode) { noticeNode.textContent = notice; noticeNode.dataset.state = noticeError ? 'error' : 'ok'; }
  const manualSelect = document.querySelector('#kano-world-life-panel [data-world-season]');
  if (manualSelect) manualSelect.disabled = isAuto;
}

function updateIntegrationState() {
  const ctx = context();
  const enabled = save?.lifestyle?.seasonalAuto === true;
  const current = getSeasonalRiskSnapshot(ctx.day, { ...state, enabled });
  if (ctx.s && typeof ctx.s === 'object') {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(ctx.s, '__kanoSeasonalContext');
      Object.defineProperty(ctx.s, '__kanoSeasonalContext', { value: current, enumerable: false, configurable: true, writable: true });
      if (!descriptor) { /* defineProperty intentionally creates non-enumerable bridge state */ }
    } catch { /* Optional link into the driving simulation. */ }
  }
  if (lastRenderKey === '' || ctx.day !== Number(lastRenderKey.split('|')[0])) render();
}

function boot() {
  if (typeof window === 'undefined' || window[INSTALL_KEY]) return;
  Object.defineProperty(window, INSTALL_KEY, { value: true, configurable: false });
  state = normalizeSeasonalResilienceState({ ...state, enabled: save?.lifestyle?.seasonalAuto === true });
  window.kanoNorthernDriverSeasonalResilience = Object.freeze({
    snapshot: () => getSeasonalRiskSnapshot(context().day, state),
    state: () => normalizeSeasonalResilienceState(state),
    actions: () => KANO_SEASONAL_ACTIONS.map(action => ({ ...action })),
    exportReport: () => exportSeasonalResilienceReport(state, context().day),
  });
  if (!ensureSection()) {
    observer = new MutationObserver(() => {
      if (ensureSection()) { observer?.disconnect(); observer = null; }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { observer?.disconnect(); observer = null; }, 60000);
  }
  updateIntegrationState();
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    const previous = lastRenderKey;
    updateIntegrationState();
    if (previous !== lastRenderKey) render();
  }, 3000);
  window.addEventListener('pagehide', () => {
    if (refreshTimer) clearInterval(refreshTimer);
    observer?.disconnect();
  }, { once: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
