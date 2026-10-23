/**
 * Kano Life — roadworthiness and mechanic-workshop layer.
 * It persists the game's existing condition/engine/tyres values between shifts.
 * Service costs use the current LIFE & CAREER wallet transaction API.
 */
import { Game } from './game.js';
import { UI } from './ui.js';
import { save } from './storage.js';
import {
  MAINTENANCE_SERVICES,
  loadVehicleMaintenanceState,
  saveVehicleMaintenanceState,
  readVehicleTelemetry,
  assessVehicleRoadworthiness,
  recordVehicleInspection,
  recordVehicleService,
  applyPersistentVehicleState,
  recordVehicleShiftEnd,
  recordVehicleShiftStart,
} from './KanoNorthernDriverVehicleMaintenance.js';

const PATCH = Symbol.for('kano.life.vehicleMaintenance.v1');
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const clampDay = value => Math.max(1, Math.min(999999, Math.floor(Number(value) || 1)));
const finite = value => value != null && value !== '' && Number.isFinite(Number(value));
let activeUI = null;
let state = loadVehicleMaintenanceState();
let initialized = false;
let fallbackRunSerial = 0;

function context(gameOverride = null) {
  const ui = activeUI || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null);
  const game = gameOverride || ui?.game || null;
  const s = game?.s || {};
  const day = clampDay(s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1);
  const mode = String(game?.mode || s.mode || '').toLowerCase();
  return { ui, game, s, day, mode };
}

function isCareerMode(mode) {
  const value = String(mode || '').toLowerCase().replace(/[^a-z]/g, '');
  return value === 'career' || value === 'freeroam';
}

function runIdFor(game, s, mode) {
  if (s?.__kanoVehicleMaintenanceRunId) return String(s.__kanoVehicleMaintenanceRunId);
  const startedAt = Number(s?.runStartedAt);
  if (Number.isFinite(startedAt) && startedAt > 0) return `${String(mode || game?.mode || 'career')}-${startedAt}`;
  return '';
}

function persistState() {
  const result = saveVehicleMaintenanceState(state);
  if (result.ok) state = result.state;
  return result.ok;
}

function emitUpdate(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kano:vehicle-maintenance-updated', { detail: { ...detail, snapshot: snapshot() } }));
}

function telemetry() {
  const { s } = context();
  return readVehicleTelemetry(s, state);
}

function snapshot() {
  const { day, mode, s } = context();
  const currentTelemetry = readVehicleTelemetry(s, state);
  return {
    ...JSON.parse(JSON.stringify(state)),
    day,
    mode,
    liveTelemetryAvailable: ['condition', 'engine', 'tyres'].some(key => finite(s?.[key])),
    liveTelemetry: currentTelemetry,
    assessment: assessVehicleRoadworthiness({ ...state, vehicle: currentTelemetry }, { day }),
    wallet: Math.max(0, Math.round(Number(window.kanoNorthernDriverLifeSimulation?.snapshot?.().wallet ?? save.money) || 0)),
    gameplayEffects: 'condition, engine and tyres are applied to the next Career/Free roam shift',
  };
}

function currentDay() { return context().day; }
function manualChecksFromForm(section) {
  return Object.fromEntries(['brakes', 'steering', 'lights', 'horn'].map(key => [key, section.querySelector(`#kvm-check-${key}`)?.value || 'not_checked']));
}

function ensureStyles() {
  if (document.getElementById('kvm-style')) return;
  const style = document.createElement('style');
  style.id = 'kvm-style';
  style.textContent = `
    #kano-vehicle-maintenance-panel{margin-top:18px;padding-top:14px;border-top:1px solid #29465b;min-width:0}
    #kano-vehicle-maintenance-panel .kvm-note{font-size:12px;line-height:1.5;color:#a9bdcc}
    #kano-vehicle-maintenance-panel .kvm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:10px 0}
    #kano-vehicle-maintenance-panel .kvm-stat{min-width:0;padding:9px 10px;display:grid;gap:4px;border:1px solid #29465b;border-radius:9px;background:#0a1723}
    #kano-vehicle-maintenance-panel .kvm-stat span{font-size:11px;color:#a9bdcc}#kano-vehicle-maintenance-panel .kvm-stat strong{font-size:14px;overflow-wrap:anywhere}
    #kano-vehicle-maintenance-panel .kvm-checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin:10px 0}
    #kano-vehicle-maintenance-panel label{display:grid;gap:5px;min-width:0;color:#c5d4df;font-size:12px}
    #kano-vehicle-maintenance-panel select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border-radius:8px;padding:8px 10px;background:#0a1723;color:#f2f7fb;border:1px solid #3d6077;font:inherit;font-size:16px}
    #kano-vehicle-maintenance-panel .kvm-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
    #kano-vehicle-maintenance-panel button{min-height:44px;max-width:100%;border-radius:8px;padding:9px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;background:#172d40;color:#f2f7fb;border:1px solid #3d6077}
    #kano-vehicle-maintenance-panel .kvm-primary{background:#00b4d8;color:#061724;border:0}
    #kano-vehicle-maintenance-panel [role=status]{min-height:18px;font-size:12px;line-height:1.45;color:#8fe1c5}
    #kano-vehicle-maintenance-panel [data-state=error]{color:#ffb4aa}#kano-vehicle-maintenance-panel [data-state=warning]{color:#ffd09b}
    #kano-vehicle-maintenance-panel .kvm-history{display:grid;gap:5px;margin-top:8px}
    #kano-vehicle-maintenance-panel .kvm-history-row{display:flex;justify-content:space-between;gap:10px;border:1px solid #263e50;background:#0b1925;border-radius:8px;padding:8px 10px;font-size:12px}
    #kano-vehicle-maintenance-panel .kvm-history-row span{overflow-wrap:anywhere}#kano-vehicle-maintenance-panel .kvm-history-row b{flex:0 0 auto;text-align:right;color:#a9bdcc}
    @media(max-width:520px){#kano-vehicle-maintenance-panel .kvm-checks{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function ensurePanel() {
  const parent = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!parent) return null;
  let section = document.getElementById('kano-vehicle-maintenance-panel');
  if (section) { initializePanel(section); return section; }
  section = document.createElement('section');
  section.id = 'kano-vehicle-maintenance-panel';
  section.setAttribute('aria-labelledby', 'kvm-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="kvm-title">KEKE ROADWORTHINESS & MECHANIC</h3>
    <p class="kvm-note">Review the game's condition, engine and tyre readings, complete the manual safety checks, and record workshop work. Workshop amounts are game-balancing values, not quotations for actual Kano repair shops. Service is paid from the existing LIFE & CAREER wallet; it is not deducted from savings.</p>
    <div class="kvm-grid" aria-label="Current vehicle health">
      <div class="kvm-stat"><span>GENERAL CONDITION</span><strong id="kvm-condition">—</strong></div>
      <div class="kvm-stat"><span>ENGINE</span><strong id="kvm-engine">—</strong></div>
      <div class="kvm-stat"><span>TYRES</span><strong id="kvm-tyres">—</strong></div>
      <div class="kvm-stat"><span>ROADWORTHINESS</span><strong id="kvm-status">Inspection needed</strong></div>
      <div class="kvm-stat"><span>AVAILABLE WALLET</span><strong id="kvm-wallet">—</strong></div>
      <div class="kvm-stat"><span>PAID SERVICES</span><strong id="kvm-service-count">0</strong></div>
      <div class="kvm-stat"><span>SHIFTS STARTED WITH CRITICAL WARNING</span><strong id="kvm-risk-count">0</strong></div>
    </div>
    <h4 class="klc-section-title">PRE-SHIFT MANUAL CHECKS</h4>
    <div class="kvm-checks">
      <label for="kvm-check-brakes">Brakes<select id="kvm-check-brakes"><option value="not_checked">Not checked</option><option value="ok">Checked — OK</option><option value="attention">Needs attention</option><option value="urgent">Unsafe — mechanic required</option></select></label>
      <label for="kvm-check-steering">Steering<select id="kvm-check-steering"><option value="not_checked">Not checked</option><option value="ok">Checked — OK</option><option value="attention">Needs attention</option><option value="urgent">Unsafe — mechanic required</option></select></label>
      <label for="kvm-check-lights">Headlamp and indicators<select id="kvm-check-lights"><option value="not_checked">Not checked</option><option value="ok">Checked — OK</option><option value="attention">Needs attention</option><option value="urgent">Unsafe — mechanic required</option></select></label>
      <label for="kvm-check-horn">Horn<select id="kvm-check-horn"><option value="not_checked">Not checked</option><option value="ok">Checked — OK</option><option value="attention">Needs attention</option><option value="urgent">Unsafe — mechanic required</option></select></label>
    </div>
    <div class="kvm-actions"><button class="kvm-primary" id="kvm-inspect" type="button">RECORD PRE-SHIFT INSPECTION</button></div>
    <h4 class="klc-section-title">MECHANIC SERVICES</h4>
    <div class="kvm-checks"><label for="kvm-service-select">Choose service<select id="kvm-service-select"><option value="tyres">Tyre service — ₦450</option><option value="engine">Engine tune-up and oil service — ₦650</option><option value="condition">General mechanical service — ₦500</option><option value="full">Full service package — ₦1,250</option></select></label></div>
    <div class="kvm-actions"><button class="kvm-primary" id="kvm-pay-service" type="button">PAY & RECORD SERVICE</button><button id="kvm-export" type="button">EXPORT MAINTENANCE LOG</button></div>
    <p id="kvm-notice" role="status" aria-live="polite"></p>
    <div class="kvm-history" id="kvm-history" aria-label="Recent mechanic and inspection history"></div>
    <p class="kvm-note">Service restores the persistent Career/Free roam condition, engine or tyre levels used at the start of the next shift. A fresh manual inspection is required after service. The game does not simulate separate brake, steering, lamp or horn physics; those items are kept as explicit roleplay checks.</p>`;
  const budget = parent.querySelector('#kano-household-budget-panel');
  if (budget?.nextSibling) parent.insertBefore(section, budget.nextSibling);
  else if (budget) parent.append(section);
  else parent.append(section);
  ensureStyles();
  initializePanel(section);
  return section;
}

function notify(message, type = 'success') {
  const section = document.getElementById('kano-vehicle-maintenance-panel');
  const node = section?.querySelector('#kvm-notice');
  if (node) { node.textContent = String(message || ''); node.dataset.state = type; }
  if (message && type === 'error') context().ui?.toast?.(String(message));
}

function currentAssessment() {
  const current = telemetry();
  return assessVehicleRoadworthiness({ ...state, vehicle: current }, { day: currentDay(), requireToday: true });
}

function refreshPanel() {
  const section = ensurePanel();
  if (!section) return;
  state = loadVehicleMaintenanceState();
  const live = telemetry();
  const assessment = currentAssessment();
  const put = (id, value) => { const node = section.querySelector(`#${id}`); if (node) node.textContent = value; };
  put('kvm-condition', `${Math.round(live.condition)} / 100`);
  put('kvm-engine', `${Math.round(live.engine)} / 100`);
  put('kvm-tyres', `${Math.round(live.tyres)} / 100`);
  put('kvm-status', ({ roadworthy: 'Inspected — roadworthy', attention: 'Needs attention', critical: 'Critical warning', inspection_required: 'Inspection needed' })[assessment.status] || assessment.status);
  put('kvm-wallet', money(window.kanoNorthernDriverLifeSimulation?.snapshot?.().wallet ?? save.money ?? 0));
  put('kvm-service-count', String(state.serviceHistory.length));
  put('kvm-risk-count', String(state.unsafeShiftStarts));
  for (const key of ['brakes', 'steering', 'lights', 'horn']) {
    const select = section.querySelector(`#kvm-check-${key}`);
    if (select && document.activeElement !== select) select.value = state.manualChecks[key];
  }
  const history = section.querySelector('#kvm-history');
  history?.replaceChildren();
  const rows = [
    ...state.serviceHistory.slice(-4).reverse().map(item => ({ label: MAINTENANCE_SERVICES[item.serviceId]?.label || 'Vehicle service', detail: `Day ${item.day} · ${money(item.cost)}` })),
    ...state.inspectionHistory.slice(-3).reverse().map(item => ({ label: `Pre-shift inspection: ${item.status.replaceAll('_', ' ')}`, detail: `Day ${item.day}` })),
  ].slice(0, 6);
  if (!rows.length && history) {
    const empty = document.createElement('p'); empty.className = 'kvm-note'; empty.textContent = 'No inspection or workshop entries yet.'; history.append(empty);
  } else if (history) {
    for (const rowData of rows) {
      const row = document.createElement('div'); row.className = 'kvm-history-row';
      const label = document.createElement('span'); label.textContent = rowData.label;
      const detail = document.createElement('b'); detail.textContent = rowData.detail;
      row.append(label, detail); history.append(row);
    }
  }
}

function inspectFromForm() {
  const section = ensurePanel();
  if (!section) return;
  state.vehicle = readVehicleTelemetry(context().s, state);
  const result = recordVehicleInspection(state, {
    day: currentDay(),
    gameState: context().s,
    manualChecks: manualChecksFromForm(section),
  });
  state = result.state;
  const saved = persistState();
  emitUpdate({ type: 'inspection_recorded', day: currentDay(), status: result.assessment.status });
  refreshPanel();
  if (!saved) notify('Inspection recorded for this session, but browser storage is unavailable; it may not persist after closing.', 'warning');
  else if (result.assessment.status === 'critical') notify('CRITICAL: vehicle readings or a manual check require mechanic attention. Do not treat this as roadworthy.', 'error');
  else if (result.assessment.status !== 'roadworthy') notify('Inspection saved. Complete every manual check and address any items needing attention before treating the vehicle as roadworthy.', 'warning');
  else notify('Inspection saved. All recorded readings and manual checks are marked roadworthy. Continue to monitor the vehicle.', 'success');
}

function isLifePanelVisible() {
  const panel = document.getElementById('kano-life-career-screen');
  return Boolean(panel && !panel.classList.contains('hidden'));
}

function maintenanceStorageWritable() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const key = 'kano-life-maintenance-storage-probe';
    storage.setItem(key, '1'); storage.removeItem(key); return true;
  } catch { return false; }
}

function performService() {
  const section = ensurePanel();
  if (!section) return;
  if (!isLifePanelVisible()) { notify('Open LIFE & CAREER from the menu before purchasing a service.', 'error'); return; }
  if (context().game && isCareerMode(context().mode) && window.kanoNorthernDriverLifeSimulation?.snapshot?.().activeShift) {
    notify('Finish the active shift before paying for a service.', 'error'); return;
  }
  if (!maintenanceStorageWritable()) { notify('Browser storage is unavailable; no service charge was made.', 'error'); return; }
  state.vehicle = readVehicleTelemetry(context().s, state);
  const serviceId = section.querySelector('#kvm-service-select')?.value || '';
  const service = MAINTENANCE_SERVICES[serviceId];
  if (!service) { notify('Choose a valid service.', 'error'); return; }
  const life = window.kanoNorthernDriverLifeSimulation;
  if (typeof life?.chargeExpense !== 'function') {
    notify('The existing career-wallet transaction hook is unavailable. No service was recorded or charged.', 'error'); return;
  }
  const button = section.querySelector('#kvm-pay-service');
  if (button) button.disabled = true;
  const originalState = state;
  const result = recordVehicleService(state, { serviceId, day: currentDay() });
  if (!result.ok) { notify('The service item was not recognized; no payment was made.', 'error'); return; }
  // Persist the prepared repair first so a storage failure never consumes wallet cash.
  const prepared = saveVehicleMaintenanceState(result.state);
  if (!prepared.ok) { notify('Maintenance storage is unavailable; no service payment was made.', 'error'); return; }
  try {
    const payment = life.chargeExpense({ amount: service.cost, category: 'maintenance', serviceId, description: service.label, day: currentDay() });
    if (!payment?.ok) {
      state = originalState;
      saveVehicleMaintenanceState(originalState);
      const message = payment?.reason === 'insufficient_wallet' ? `Wallet balance ${money(payment.wallet)} is below the ${money(service.cost)} service cost.`
        : payment?.reason === 'shift_active' ? 'Finish the active shift before purchasing service.'
          : 'The service payment was not completed. No repair was kept.';
      notify(message, 'error');
      refreshPanel();
      return;
    }
    state = prepared.state;
    const gameState = context().s;
    // This UI action is only available on the life panel, outside active play.
    if (gameState && !window.kanoNorthernDriverLifeSimulation?.snapshot?.().activeShift) applyPersistentVehicleState(gameState, state);
    emitUpdate({ type: 'service_paid', serviceId, amount: service.cost, day: currentDay() });
    refreshPanel();
    notify(`Service recorded and ${money(service.cost)} paid from the existing wallet. The improvement applies to the next Career/Free roam shift. Complete a fresh inspection after the service.`, 'success');
    life.refresh?.();
  } finally {
    if (button) button.disabled = false;
  }
}

function exportLog() {
  const data = { version: 1, exportedAt: new Date().toISOString(), maintenance: snapshot(), serviceCostsAreGameValues: true, note: 'Gameplay balancing values; not actual mechanic quotations. Does not include passwords or account information.' };
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'kano-life-vehicle-maintenance.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Maintenance log export requested.', 'success');
  } catch { notify('Export is unavailable in this browser.', 'error'); }
}

function installGameHooks() {
  if (!Game?.prototype || Game.prototype[PATCH]) return;
  Object.defineProperty(Game.prototype, PATCH, { value: true, configurable: false });
  const originalStart = Game.prototype.start;
  if (typeof originalStart === 'function') {
    Game.prototype.start = function startWithVehicleMaintenance(mode, ...args) {
      const result = originalStart.call(this, mode, ...args);
      const actualMode = this.mode || mode || '';
      if (!isCareerMode(actualMode) || !this.s) return result;
      state = loadVehicleMaintenanceState();
      applyPersistentVehicleState(this.s, state);
      const day = context(this).day;
      const runId = runIdFor(this, this.s, actualMode) || `${String(actualMode)}-${Date.now()}-${++fallbackRunSerial}`;
      this.s.__kanoVehicleMaintenanceRunId = runId;
      this.s.__kanoVehicleMaintenanceMode = String(actualMode);
      const startRecord = recordVehicleShiftStart(state, { day, runId });
      state = startRecord.state;
      persistState();
      window.kanoNorthernDriverLifeSimulation?.syncActiveShiftStart?.(this.s);
      emitUpdate({ type: 'shift_started', day, runId, roadworthiness: startRecord.assessment.status });
      return result;
    };
  }
  const originalFinish = Game.prototype.finishOrContinue;
  if (typeof originalFinish === 'function') {
    Game.prototype.finishOrContinue = function finishWithVehicleMaintenance(...args) {
      const gameStateAtFinish = this.s;
      const mode = this.mode || gameStateAtFinish?.__kanoVehicleMaintenanceMode || '';
      const runId = runIdFor(this, gameStateAtFinish, mode);
      const result = originalFinish.apply(this, args);
      if (gameStateAtFinish && isCareerMode(mode)) {
        state = loadVehicleMaintenanceState();
        const day = clampDay(gameStateAtFinish.__kanoScheduleCurrentDay ?? gameStateAtFinish.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1);
        const captured = recordVehicleShiftEnd(state, { gameState: gameStateAtFinish, day, runId });
        state = captured.state;
        persistState();
        emitUpdate({ type: 'shift_ended', day, runId, recorded: captured.recorded });
      }
      return result;
    };
  }
}

function installUiHooks() {
  if (!UI?.prototype) return;
  const symbol = Symbol.for('kano.life.vehicleMaintenance.ui.v1');
  if (UI.prototype[symbol]) return;
  Object.defineProperty(UI.prototype, symbol, { value: true });
  const originalBind = UI.prototype.bind;
  if (typeof originalBind === 'function') {
    UI.prototype.bind = function bindVehicleMaintenance(...args) {
      const result = originalBind.apply(this, args);
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
  ensurePanel();
  installGameHooks();
  installUiHooks();
  for (const eventName of ['kano:life-shift-settled', 'kano:daily-day-change', 'kano:day-settlement-closed', 'kano:life-maintenance-expense', 'kano:vehicle-maintenance-updated']) {
    window.addEventListener(eventName, refreshPanel);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshPanel, { once: true });
  window.kanoNorthernDriverVehicleMaintenance = {
    version: 1,
    snapshot,
    inspect: (manualChecks = {}) => {
      const result = recordVehicleInspection(state, { day: currentDay(), gameState: context().s, manualChecks });
      state = result.state; persistState(); emitUpdate({ type: 'inspection_recorded', day: currentDay(), status: result.assessment.status });
      refreshPanel(); return result;
    },
    export: () => JSON.stringify(snapshot(), null, 2),
    refresh: refreshPanel,
  };
  if (activeUI) { ensurePanel(); refreshPanel(); }
  console.info('[Kano Life] Persistent vehicle maintenance and roadworthiness loaded.');
}

install();
