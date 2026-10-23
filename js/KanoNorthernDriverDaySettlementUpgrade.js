/**
 * Adds a persistent day-end statement to the existing LIFE & CAREER screen.
 * No replacement for main.js/game.js; no additional financial deductions.
 */
import { UI } from './ui.js';
import { Game } from './game.js';
import { save } from './storage.js';
import { KanoNorthernDriverDaySettlementLedger } from './KanoNorthernDriverDaySettlement.js';

const PATCH = Symbol.for('kano.life.dailySettlement.ui.v1');
const ledger = new KanoNorthernDriverDaySettlementLedger();
let activeUI = null;
let pendingPreviousDay = null;
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;

function context() {
  const ui = activeUI || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null);
  const game = ui?.game || null;
  const state = game?.s || {};
  const rawDay = state.__kanoScheduleCurrentDay ?? state.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1;
  const day = Math.max(1, Math.floor(Number(rawDay) || 1));
  return { ui, game, state, day };
}

function hasActiveRun(game) {
  return Boolean(game && ['PLAY', 'EVENT'].includes(game.state) && game.s && !game.s.runEnded);
}

function pullSnapshots(day) {
  const parkApi = window.kanoNorthernDriverParkOperations;
  const lifeApi = window.kanoNorthernDriverLifeSimulation;
  if (!parkApi || typeof parkApi.exportReport !== 'function' || !lifeApi || typeof lifeApi.snapshot !== 'function') {
    return { ok: false, reason: 'systems_not_ready' };
  }
  let parkReport;
  try { parkReport = JSON.parse(parkApi.exportReport(day)); } catch { return { ok: false, reason: 'park_report_unavailable' }; }
  const lifeSnapshot = lifeApi.snapshot();
  if (!parkReport || !parkReport.today || !lifeSnapshot) return { ok: false, reason: 'snapshot_unavailable' };
  return { ok: true, parkReport, lifeSnapshot };
}

function closeDay(day, source = 'manual', { allowActiveRun = false } = {}) {
  const { game } = context();
  if (!allowActiveRun && hasActiveRun(game)) return { ok: false, reason: 'active_run' };
  const snapshots = pullSnapshots(day);
  if (!snapshots.ok) return snapshots;
  return ledger.closeDay({ day, ...snapshots, source });
}

function ensureStyles() {
  if (document.getElementById('kds-style')) return;
  const style = document.createElement('style');
  style.id = 'kds-style';
  style.textContent = `
    #kano-day-settlement-panel{margin-top:18px;padding-top:14px;border-top:1px solid #29465b;min-width:0}
    #kano-day-settlement-panel .kds-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    #kano-day-settlement-panel button{min-height:44px;max-width:100%;border-radius:8px;padding:9px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;background:#172d40;color:#f2f7fb;border:1px solid #3d6077}
    #kano-day-settlement-panel .kds-primary{background:#00b4d8;color:#061724;border:0}
    #kano-day-settlement-panel .kds-stat{padding:9px 10px;background:#0a1723;border:1px solid #29465b;border-radius:9px;margin:7px 0;font-size:12px;display:flex;justify-content:space-between;gap:10px}
    #kano-day-settlement-panel .kds-stat span{color:#a9bdcc}#kano-day-settlement-panel .kds-stat strong{text-align:right;overflow-wrap:anywhere}
    #kano-day-settlement-panel .kds-history{display:grid;gap:7px;margin-top:8px}
    #kano-day-settlement-panel .kds-row{background:#0b1925;border:1px solid #263e50;border-radius:8px;padding:9px 10px;font-size:12px;display:grid;gap:4px}
    #kano-day-settlement-panel .kds-row b{color:#f0d083}#kano-day-settlement-panel .kds-note{font-size:12px;line-height:1.45;color:#a9bdcc}#kano-day-settlement-panel [role=status]{min-height:18px;color:#8fe1c5;font-size:12px}
  `;
  document.head.append(style);
}

function ensurePanel() {
  const parent = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!parent) return null;
  let section = document.getElementById('kano-day-settlement-panel');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'kano-day-settlement-panel';
  section.setAttribute('aria-labelledby', 'kds-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="kds-title">END-OF-DAY SETTLEMENT</h3>
    <p class="kds-note">Close a daily statement of trips, fares, park activity, savings and outstanding bills. This report does not charge the wallet again; per-shift expenses remain part of the existing career ledger.</p>
    <div class="kds-stat"><span>Current in-game day</span><strong id="kds-current-day">Day 1</strong></div>
    <div class="kds-stat"><span>Most recent closed statement</span><strong id="kds-latest-day">No statement yet</strong></div>
    <div class="kds-stat"><span>Latest day's recorded fares</span><strong id="kds-latest-fares">₦0</strong></div>
    <div class="kds-stat"><span>Trips / safe trips</span><strong id="kds-latest-trips">0 / 0</strong></div>
    <div class="kds-actions"><button class="kds-primary" id="kds-close-day" type="button">CLOSE TODAY'S BOOKS</button><button id="kds-export" type="button">EXPORT LATEST STATEMENT</button></div>
    <p id="kds-notice" role="status" aria-live="polite"></p>
    <h4 class="klc-section-title">RECENT DAILY STATEMENTS</h4><div class="kds-history" id="kds-history"><p class="kds-note">No day has been closed yet.</p></div>`;
  const parkPanel = parent.querySelector('#kano-park-operations-panel');
  if (parkPanel?.nextSibling) parent.insertBefore(section, parkPanel.nextSibling); else parent.append(section);
  ensureStyles();
  section.querySelector('#kds-close-day')?.addEventListener('click', () => {
    const { day } = context();
    const result = closeDay(day, 'manual');
    const notice = section.querySelector('#kds-notice');
    if (!result.ok) {
      const message = result.reason === 'active_run' ? 'Finish the active driving run before closing today’s books.'
        : result.reason === 'already_closed' ? `Day ${day} already has a closing statement. It will not charge the wallet twice.`
          : 'The daily records are not ready or browser storage is unavailable.';
      if (notice) notice.textContent = message;
    } else if (notice) {
      notice.textContent = `Day ${day} statement saved. No additional money was deducted.`;
      window.dispatchEvent(new CustomEvent('kano:day-settlement-closed', { detail: { day, report: result.report } }));
    }
    refreshPanel();
  });
  section.querySelector('#kds-export')?.addEventListener('click', () => {
    const reportText = ledger.exportReport();
    const notice = section.querySelector('#kds-notice');
    if (!reportText) { if (notice) notice.textContent = 'There is no saved statement to export.'; return; }
    try {
      const blob = new Blob([reportText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `kano-life-day-settlement-${context().day}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (notice) notice.textContent = 'The latest daily statement export was requested.';
    } catch { if (notice) notice.textContent = 'Export is unavailable in this browser.'; }
  });
  return section;
}

function refreshPanel() {
  const section = ensurePanel();
  if (!section) return;
  const { day } = context();
  const snapshot = ledger.getSnapshot();
  const latest = snapshot.latest;
  section.querySelector('#kds-current-day').textContent = `Day ${day}`;
  section.querySelector('#kds-latest-day').textContent = latest ? `Day ${latest.day} · ${new Date(latest.closedAt).toLocaleString()}` : 'No statement yet';
  section.querySelector('#kds-latest-fares').textContent = money(latest?.work?.grossFares || 0);
  section.querySelector('#kds-latest-trips').textContent = `${Number(latest?.work?.completedTrips || 0)} / ${Number(latest?.work?.safeTrips || 0)}`;
  const closeButton = section.querySelector('#kds-close-day');
  const closed = ledger.getReport(day);
  closeButton.disabled = Boolean(closed) || hasActiveRun(context().game);
  closeButton.textContent = closed ? 'TODAY ALREADY CLOSED' : hasActiveRun(context().game) ? 'FINISH ACTIVE RUN FIRST' : "CLOSE TODAY'S BOOKS";
  const history = section.querySelector('#kds-history');
  history.replaceChildren();
  if (!snapshot.reports.length) {
    const empty = document.createElement('p'); empty.className = 'kds-note'; empty.textContent = 'No day has been closed yet.'; history.append(empty); return;
  }
  for (const report of snapshot.reports.slice(0, 5)) {
    const row = document.createElement('div'); row.className = 'kds-row';
    const heading = document.createElement('b'); heading.textContent = `DAY ${report.day} · ${money(report.work.grossFares)} recorded fares`;
    const details = document.createElement('span'); details.textContent = `${report.work.completedTrips} trips · ${report.work.safeTrips} safe · ${report.work.repeatCustomerTrips} repeat · ${report.work.distanceKm.toFixed(2)} km`;
    const position = document.createElement('span'); position.textContent = `Wallet ${money(report.financialPosition.wallet)} · Savings ${money(report.financialPosition.savings)} · Arrears ${money(report.financialPosition.totalArrears)}`;
    row.append(heading, details, position); history.append(row);
  }
}

function handleDayChange(event) {
  const previousDay = Number(event?.detail?.previousDay);
  if (!Number.isFinite(previousDay) || previousDay < 1) return;
  if (hasActiveRun(context().game)) {
    pendingPreviousDay = Math.floor(previousDay);
    return;
  }
  const result = closeDay(Math.floor(previousDay), 'automatic_day_rollover', { allowActiveRun: true });
  if (result.ok || result.reason === 'already_closed') pendingPreviousDay = null;
  refreshPanel();
}

function finishPendingPreviousDay() {
  if (pendingPreviousDay == null || hasActiveRun(context().game)) return;
  const result = closeDay(pendingPreviousDay, 'automatic_day_rollover', { allowActiveRun: true });
  if (result.ok || result.reason === 'already_closed') pendingPreviousDay = null;
  refreshPanel();
}

function install() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const existingUI = window.__KANO_ACTIVE_UI__;
  if (existingUI) activeUI = existingUI;
  ensurePanel();
  if (UI?.prototype && !UI.prototype[PATCH]) {
    Object.defineProperty(UI.prototype, PATCH, { value: true });
    const originalBind = UI.prototype.bind;
    if (typeof originalBind === 'function') {
      UI.prototype.bind = function bindWithDaySettlement(game, ...args) {
        const result = originalBind.call(this, game, ...args);
        activeUI = this;
        ensurePanel(); refreshPanel();
        return result;
      };
    }
  }
  window.addEventListener('kano:daily-day-change', handleDayChange);
  for (const name of ['kano:park-operations-updated', 'kano:life-shift-settled', 'kano:passenger-relationship-updated', 'kano:day-settlement-closed']) {
    window.addEventListener(name, refreshPanel);
  }
  // The existing life-ledger wrapper is already installed before this module.
  // Wrap Game.finishOrContinue once, after it has returned, to archive a
  // deferred day rollover without replacing the underlying driving logic.
  if (Game?.prototype && !Game.prototype.__kanoDaySettlementFinishHook) {
    const prevFinish = Game.prototype.finishOrContinue;
    if (typeof prevFinish === 'function') {
      Game.prototype.finishOrContinue = function finishWithDailyStatement(...args) {
        const result = prevFinish.apply(this, args);
        if (this.state === 'OVER') queueMicrotask(finishPendingPreviousDay);
        return result;
      };
      Object.defineProperty(Game.prototype, '__kanoDaySettlementFinishHook', { value: true });
    }
  }
  window.kanoNorthernDriverDaySettlement = {
    version: 1,
    snapshot: () => ledger.getSnapshot(),
    closeToday: () => closeDay(context().day, 'manual'),
    export: day => ledger.exportReport(day),
    refresh: refreshPanel,
  };
  if (existingUI) { activeUI = existingUI; ensurePanel(); refreshPanel(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshPanel, { once: true });
}

install();
console.info('[Kano Life] Persistent daily settlement statement registered; no additional financial deductions are applied.');
