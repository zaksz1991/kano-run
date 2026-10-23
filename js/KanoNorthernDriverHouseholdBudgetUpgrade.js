/**
 * Adds an editable household budget planner to LIFE & CAREER.
 * Estimates and plans only. It never debits the wallet, moves savings, or
 * changes per-shift settlement. The financial ledger remains authoritative.
 */
import { UI } from './ui.js';
import {
  loadHouseholdBudgetPlan,
  projectHouseholdBudget,
  saveHouseholdBudgetPlan,
  suggestHouseholdBudgetPlan,
} from './KanoNorthernDriverHouseholdBudget.js';

const PATCH = Symbol.for('kano.life.householdBudget.bindHook.v1');
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const FIELD_IDS = Object.freeze({
  netPerShift: 'khb-net-shift',
  workDaysPerWeek: 'khb-days',
  operatingReserveWeekly: 'khb-operating',
  maintenanceReserveWeekly: 'khb-maintenance',
  vehicleReserveWeekly: 'khb-vehicle',
  extraHouseholdSupportWeekly: 'khb-family',
  emergencyContributionWeekly: 'khb-emergency-weekly',
  longTermSavingsWeekly: 'khb-goal-savings',
  emergencyTarget: 'khb-emergency-target',
  emergencyAlreadySetAside: 'khb-emergency-existing',
});

let activeUI = null;
let initialized = false;
let savedState = loadHouseholdBudgetPlan();
let plan = null;

function lifeSnapshot() {
  try { return window.kanoNorthernDriverLifeSimulation?.snapshot?.() || {}; }
  catch { return {}; }
}

function readForm(section) {
  const data = {};
  for (const [key, id] of Object.entries(FIELD_IDS)) {
    const input = section.querySelector(`#${id}`);
    data[key] = input ? input.value : 0;
  }
  return data;
}

function writeForm(section, input) {
  for (const [key, id] of Object.entries(FIELD_IDS)) {
    const element = section.querySelector(`#${id}`);
    if (element) element.value = String(input[key] ?? 0);
  }
}

function refreshBalances(section) {
  const snapshot = lifeSnapshot();
  const wallet = Math.max(0, Math.round(Number(snapshot.wallet) || 0));
  const savings = Math.max(0, Math.round(Number(snapshot.savings) || 0));
  const arrears = Math.max(0, Math.round(Number(snapshot.totalArrears) || 0));
  section.querySelector('#khb-wallet').textContent = money(wallet);
  section.querySelector('#khb-savings').textContent = money(savings);
  section.querySelector('#khb-arrears').textContent = money(arrears);
}

function ensureStyles() {
  if (document.getElementById('khb-style')) return;
  const style = document.createElement('style');
  style.id = 'khb-style';
  style.textContent = `
    #kano-household-budget-panel{margin-top:18px;padding-top:14px;border-top:1px solid #29465b;min-width:0}
    #kano-household-budget-panel .khb-note{font-size:12px;line-height:1.5;color:#a9bdcc}
    #kano-household-budget-panel .khb-balance,#kano-household-budget-panel .khb-result{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:7px;margin:10px 0}
    #kano-household-budget-panel .khb-stat{padding:9px 10px;background:#0a1723;border:1px solid #29465b;border-radius:9px;min-width:0;display:grid;gap:4px}
    #kano-household-budget-panel .khb-stat span{font-size:11px;color:#a9bdcc}#kano-household-budget-panel .khb-stat strong{font-size:14px;overflow-wrap:anywhere}
    #kano-household-budget-panel .khb-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:12px 0}
    #kano-household-budget-panel label{display:grid;gap:5px;font-size:12px;color:#c5d4df;min-width:0}
    #kano-household-budget-panel input{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border-radius:8px;padding:9px 10px;background:#0a1723;color:#f2f7fb;border:1px solid #3d6077;font:inherit;font-size:16px}
    #kano-household-budget-panel .khb-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    #kano-household-budget-panel button{min-height:44px;max-width:100%;border-radius:8px;padding:9px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;background:#172d40;color:#f2f7fb;border:1px solid #3d6077}
    #kano-household-budget-panel .khb-primary{background:#00b4d8;color:#061724;border:0}
    #kano-household-budget-panel [role=status]{min-height:18px;color:#8fe1c5;font-size:12px;line-height:1.45}
    #kano-household-budget-panel .khb-warning{color:#ffd09b}#kano-household-budget-panel .khb-good{color:#8fe1c5}
  `;
  document.head.append(style);
}

function ensurePanel() {
  const parent = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!parent) return null;
  let section = document.getElementById('kano-household-budget-panel');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'kano-household-budget-panel';
  section.setAttribute('aria-labelledby', 'khb-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="khb-title">HOUSEHOLD BUDGET & RAINY-DAY PLAN</h3>
    <p class="khb-note">Plan for a realistic working week: keep the keke earning, support your household, prepare for repairs, build an emergency buffer and work toward your long-term goal. Amounts are editable gameplay estimates, not current Kano market prices.</p>
    <div class="khb-balance" aria-label="Current financial position">
      <div class="khb-stat"><span>AVAILABLE WALLET</span><strong id="khb-wallet">₦0</strong></div>
      <div class="khb-stat"><span>PERSONAL SAVINGS</span><strong id="khb-savings">₦0</strong></div>
      <div class="khb-stat"><span>OUTSTANDING ARREARS</span><strong id="khb-arrears">₦0</strong></div>
    </div>
    <form id="khb-form">
      <div class="khb-form">
        <label for="khb-net-shift">Expected take-home per shift (after recorded shift costs)<input id="khb-net-shift" name="netPerShift" type="number" inputmode="numeric" min="0" max="100000000" step="50" required></label>
        <label for="khb-days">Working days per week<input id="khb-days" name="workDaysPerWeek" type="number" inputmode="numeric" min="1" max="7" step="1" required></label>
        <label for="khb-operating">Weekly fuel / operating reserve<input id="khb-operating" name="operatingReserveWeekly" type="number" inputmode="numeric" min="0" max="100000000" step="50" required></label>
        <label for="khb-maintenance">Weekly repair / maintenance reserve<input id="khb-maintenance" name="maintenanceReserveWeekly" type="number" inputmode="numeric" min="0" max="100000000" step="50" required></label>
        <label for="khb-vehicle">Weekly vehicle hire / repayment reserve<input id="khb-vehicle" name="vehicleReserveWeekly" type="number" inputmode="numeric" min="0" max="100000000" step="50" required></label>
        <label for="khb-family">Extra family support each week<input id="khb-family" name="extraHouseholdSupportWeekly" type="number" inputmode="numeric" min="0" max="100000000" step="50" required></label>
        <label for="khb-emergency-weekly">Weekly emergency-fund contribution<input id="khb-emergency-weekly" name="emergencyContributionWeekly" type="number" inputmode="numeric" min="0" max="100000000" step="50" required></label>
        <label for="khb-goal-savings">Weekly long-term-goal savings plan<input id="khb-goal-savings" name="longTermSavingsWeekly" type="number" inputmode="numeric" min="0" max="100000000" step="50" required></label>
        <label for="khb-emergency-target">Emergency-fund target<input id="khb-emergency-target" name="emergencyTarget" type="number" inputmode="numeric" min="0" max="100000000" step="50" required></label>
        <label for="khb-emergency-existing">Emergency cash already set aside (manual estimate)<input id="khb-emergency-existing" name="emergencyAlreadySetAside" type="number" inputmode="numeric" min="0" max="100000000" step="50" required></label>
      </div>
      <div class="khb-actions"><button class="khb-primary" id="khb-calculate" type="submit">CALCULATE WEEKLY PLAN</button><button id="khb-save" type="button">SAVE PLAN</button><button id="khb-export" type="button">EXPORT PLAN</button></div>
    </form>
    <div class="khb-result" aria-label="Weekly budget projection">
      <div class="khb-stat"><span>PROJECTED WEEKLY TAKE-HOME</span><strong id="khb-weekly-net">₦0</strong></div>
      <div class="khb-stat"><span>PLANNED SET-ASIDES</span><strong id="khb-weekly-planned">₦0</strong></div>
      <div class="khb-stat"><span>REMAINS AFTER PLAN</span><strong id="khb-weekly-remainder">₦0</strong></div>
      <div class="khb-stat"><span>INCOME COMMITTED</span><strong id="khb-commitment">—</strong></div>
      <div class="khb-stat"><span>EMERGENCY-FUND GAP</span><strong id="khb-emergency-gap">₦0</strong></div>
      <div class="khb-stat"><span>WEEKS TO EMERGENCY TARGET</span><strong id="khb-emergency-weeks">—</strong></div>
    </div>
    <p id="khb-notice" role="status" aria-live="polite"></p>
    <p class="khb-note">This is a plan, not a transaction. Saving or calculating it does not deduct cash, transfer money into savings, repay arrears or change the end-of-day statement. Use the existing LIFE & CAREER financial controls to perform actual transactions.</p>`;
  const settlement = parent.querySelector('#kano-day-settlement-panel');
  if (settlement?.nextSibling) parent.insertBefore(section, settlement.nextSibling);
  else if (settlement) parent.append(section);
  else parent.append(section);
  ensureStyles();
  initializePanel(section);
  return section;
}

function initializePanel(section) {
  if (section.dataset.khbInitialized === '1') return;
  section.dataset.khbInitialized = '1';
  const persisted = savedState?.plan || null;
  plan = suggestHouseholdBudgetPlan(lifeSnapshot(), persisted);
  writeForm(section, plan);
  refreshBalances(section);
  renderProjection(section);
  section.querySelector('#khb-form')?.addEventListener('submit', event => {
    event.preventDefault();
    plan = readForm(section);
    renderProjection(section);
  });
  section.querySelector('#khb-save')?.addEventListener('click', () => {
    plan = readForm(section);
    const result = saveHouseholdBudgetPlan(plan);
    const notice = section.querySelector('#khb-notice');
    if (!result.ok) { notice.textContent = 'Browser storage is unavailable; the plan remains editable but was not saved.'; notice.className = 'khb-warning'; return; }
    savedState = result.record;
    plan = result.record.plan;
    writeForm(section, plan);
    renderProjection(section);
    notice.textContent = `Budget plan saved ${new Date(result.record.savedAt).toLocaleString()}. No money was moved or deducted.`;
    notice.className = 'khb-good';
    window.dispatchEvent(new CustomEvent('kano:household-budget-saved', { detail: { plan, savedAt: result.record.savedAt } }));
  });
  section.querySelector('#khb-export')?.addEventListener('click', () => {
    plan = readForm(section);
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      plan,
      projection: projectHouseholdBudget(plan),
      financialEffectsApplied: false,
      note: 'Planning estimate only. No wallet or savings transaction was performed.',
    };
    try {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'kano-life-household-budget-plan.json';
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      const notice = section.querySelector('#khb-notice');
      notice.textContent = 'Budget plan export requested. It contains planning data only.'; notice.className = 'khb-good';
    } catch {
      const notice = section.querySelector('#khb-notice'); notice.textContent = 'Export is unavailable in this browser.'; notice.className = 'khb-warning';
    }
  });
}

function renderProjection(section) {
  const projection = projectHouseholdBudget(plan || readForm(section));
  const put = (id, value) => { const element = section.querySelector(`#${id}`); if (element) element.textContent = value; };
  put('khb-weekly-net', money(projection.weeklyExpectedNet));
  put('khb-weekly-planned', money(projection.weeklyPlanned));
  put('khb-weekly-remainder', `${projection.weeklyRemainder < 0 ? '−' : ''}${money(Math.abs(projection.weeklyRemainder))}`);
  put('khb-commitment', projection.commitmentPercent == null ? 'Enter income' : `${projection.commitmentPercent.toFixed(1)}%`);
  put('khb-emergency-gap', money(projection.emergencyGap));
  put('khb-emergency-weeks', projection.weeksToEmergencyTarget == null ? 'Add weekly contribution' : String(projection.weeksToEmergencyTarget));
  const notice = section.querySelector('#khb-notice');
  if (projection.status === 'income_estimate_required') {
    notice.textContent = 'Enter a positive expected take-home amount per shift to calculate a useful weekly plan.';
    notice.className = 'khb-warning';
  } else if (projection.status === 'overcommitted') {
    notice.textContent = `The plan exceeds projected weekly take-home by ${money(Math.abs(projection.weeklyRemainder))}. Reduce set-asides or adjust the income estimate.`;
    notice.className = 'khb-warning';
  } else if (projection.status === 'fully_allocated') {
    notice.textContent = 'Every projected naira is assigned. There is no spare buffer for unexpected needs.';
    notice.className = 'khb-warning';
  } else {
    notice.textContent = `The plan leaves ${money(projection.weeklyRemainder)} unassigned as a flexible buffer.`;
    notice.className = 'khb-good';
  }
}

function refresh() {
  const section = ensurePanel();
  if (section) refreshBalances(section);
}

function install() {
  if (initialized || typeof document === 'undefined' || typeof window === 'undefined') return;
  initialized = true;
  activeUI = window.__KANO_ACTIVE_UI__ || null;
  ensurePanel();
  if (UI?.prototype && !UI.prototype[PATCH]) {
    Object.defineProperty(UI.prototype, PATCH, { value: true, configurable: false });
    const oldBind = UI.prototype.bind;
    if (typeof oldBind === 'function') {
      UI.prototype.bind = function bindWithHouseholdBudget(...args) {
        const result = oldBind.apply(this, args);
        activeUI = this;
        ensurePanel();
        refresh();
        return result;
      };
    }
  }
  for (const name of ['kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:life-social-choice', 'kano:park-operations-updated']) {
    window.addEventListener(name, refresh);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  window.kanoNorthernDriverHouseholdBudget = {
    version: 1,
    snapshot: () => ({ plan: projectHouseholdBudget(readPlanFromPanel()), saved: Boolean(savedState), financialEffectsApplied: false }),
    refresh,
  };
}

function readPlanFromPanel() {
  const section = document.getElementById('kano-household-budget-panel');
  return section ? readForm(section) : (plan || suggestHouseholdBudgetPlan(lifeSnapshot(), savedState?.plan));
}

install();
console.info('[Kano Life] Household budget planner ready; calculations never alter the wallet.');

// Step 53: attach the mechanic/roadworthiness layer after the career wallet API exists.
await import('./KanoNorthernDriverVehicleMaintenanceUpgrade.js');

// Step 54: add prepaid fuel and daily fuel-price pressure after the wallet and maintenance APIs exist.
await import('./KanoNorthernDriverFuelMarketUpgrade.js');
