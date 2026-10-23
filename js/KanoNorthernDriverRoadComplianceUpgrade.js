import './KanoNorthernDriverAureAndCultureUpgrade.js';
/** Additive driver-document and KAROTA-checkpoint layer; core gameplay files are untouched. */
import { Game } from './game.js';
import { UI } from './ui.js';
import { save } from './storage.js';
import {
  DRIVER_DOCUMENTS, DRIVER_COMPLIANCE_STORAGE_KEY, applyCheckpointCompliance,
  defaultDriverComplianceState, loadDriverComplianceState, renewDriverDocument,
  saveDriverComplianceState, summarizeDriverCompliance,
} from './KanoNorthernDriverRoadCompliance.js';

const GAME_PATCH = Symbol.for('kano.life.roadCompliance.resolveEvent.v1');
const UI_PATCH = Symbol.for('kano.life.roadCompliance.uiBind.v1');
const STYLE_ID = 'knrc-style';
let activeUI = null;
let complianceState = loadDriverComplianceState();
let initialized = false;

const clampDay = value => Math.max(1, Math.floor(Number(value) || 1));
function context(gameOverride = null) {
  const ui = activeUI || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null);
  const game = gameOverride || ui?.game || null;
  const s = game?.s || {};
  const day = clampDay(s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1);
  return { ui, game, s, day };
}
function lifeApi() { return typeof window !== 'undefined' ? window.kanoNorthernDriverLifeSimulation : null; }
function lifeSnapshot() { try { return lifeApi()?.snapshot?.() || {}; } catch { return {}; } }
function shiftActive(game) { return Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))); }
function storageWritable() {
  try { const store = globalThis.localStorage; if (!store) return false; const key = `${DRIVER_COMPLIANCE_STORAGE_KEY}-probe`; store.setItem(key, '1'); store.removeItem(key); return true; } catch { return false; }
}
function persist(candidate = complianceState) {
  const saved = saveDriverComplianceState(candidate);
  if (saved.ok) complianceState = saved.state;
  return saved;
}
function emit(type, detail = {}) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kano:driver-compliance-updated', { detail: { type, ...detail, snapshot: snapshot() } }));
}
function snapshot() {
  const { game, day } = context();
  const summary = summarizeDriverCompliance(complianceState, day);
  return {
    version: 1, day, status: summary.status, ready: summary.ready,
    currentCount: summary.currentCount, totalDocuments: summary.documents.length,
    documents: summary.documents.map(({ id, label, status, daysRemaining, expiresOnDay, cost }) => ({ id, label, status, daysRemaining, expiresOnDay, renewalCost: cost })),
    checkpointCount: complianceState.checkpointCount,
    compliantCheckpoints: complianceState.compliantCheckpoints,
    flaggedCheckpoints: complianceState.flaggedCheckpoints,
    lastCheckpoint: complianceState.lastCheckpoint,
    history: complianceState.history,
    wallet: Number(lifeSnapshot().wallet ?? save.money) || 0,
    activeShift: shiftActive(game),
  };
}
function installStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #kano-road-compliance-panel{margin:14px 0;padding:16px;border:1px solid rgba(148,163,184,.35);border-radius:14px;background:rgba(15,23,42,.72);color:#edf5ff;}
    #kano-road-compliance-panel *{box-sizing:border-box;}
    #kano-road-compliance-panel .knrc-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;}
    #kano-road-compliance-panel h3{margin:0;font-size:1rem;font-weight:800;letter-spacing:.04em;}
    #kano-road-compliance-panel .knrc-note{margin:7px 0 12px;color:#bfccd9;font-size:.84rem;line-height:1.45;}
    #kano-road-compliance-panel .knrc-status{padding:7px 10px;border-radius:9px;background:#1e293b;font-size:.78rem;font-weight:800;}
    #kano-road-compliance-panel .knrc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:10px;}
    #kano-road-compliance-panel .knrc-doc{padding:12px;border:1px solid rgba(148,163,184,.28);border-radius:11px;background:rgba(30,41,59,.62);min-width:0;}
    #kano-road-compliance-panel .knrc-doc strong{display:block;font-size:.9rem;}
    #kano-road-compliance-panel .knrc-doc small{display:block;color:#cbd5e1;line-height:1.4;margin:5px 0 9px;overflow-wrap:anywhere;}
    #kano-road-compliance-panel button{min-height:42px;padding:9px 12px;border:1px solid #64748b;border-radius:9px;background:#1e293b;color:#fff;font-weight:750;cursor:pointer;}
    #kano-road-compliance-panel button:disabled{opacity:.5;cursor:not-allowed;}
    #kano-road-compliance-panel .knrc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}
    #kano-road-compliance-panel .knrc-ok{color:#86efac;}#kano-road-compliance-panel .knrc-warn{color:#fcd34d;}#kano-road-compliance-panel .knrc-bad{color:#fca5a5;}
    #kano-road-compliance-panel .knrc-history{margin:12px 0 0;color:#cbd5e1;font-size:.82rem;line-height:1.5;}
    #kano-road-compliance-panel .knrc-status-msg{min-height:1.2em;margin:10px 0 0;font-size:.84rem;color:#dbeafe;overflow-wrap:anywhere;}
  `;
  document.head.append(style);
}
function ensurePanel() {
  if (typeof document === 'undefined') return null;
  let section = document.getElementById('kano-road-compliance-panel');
  if (section) return section;
  const parent = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!parent) return null;
  installStyles();
  section = document.createElement('section');
  section.id = 'kano-road-compliance-panel';
  section.innerHTML = `
    <div class="knrc-head"><h3>DRIVER PAPERS & KAROTA CHECKPOINT READINESS</h3><span id="knrc-status" class="knrc-status">CHECKING</span></div>
    <p class="knrc-note">Manage your in-game permit, inspection, cover and driver identification. Current records can reduce enforcement heat at a KAROTA checkpoint; missing or expired records raise it. Renewal fees and validity periods are fictional gameplay values, not legal advice or verified Kano tariffs.</p>
    <div class="knrc-grid" id="knrc-docs"></div>
    <div class="knrc-actions"><button type="button" id="knrc-export">EXPORT COMPLIANCE HISTORY</button></div>
    <p id="knrc-history" class="knrc-history"></p><p id="knrc-message" class="knrc-status-msg" aria-live="polite"></p>`;
  parent.append(section);
  section.querySelector('#knrc-docs')?.addEventListener('click', event => {
    const button = event.target.closest('[data-renew-document]');
    if (!button) return;
    renewDocument(button.dataset.renewDocument);
  });
  section.querySelector('#knrc-export')?.addEventListener('click', exportHistory);
  return section;
}
function statusClass(status) {
  if (status === 'valid') return 'knrc-ok';
  if (status === 'expiring') return 'knrc-warn';
  return 'knrc-bad';
}
function refreshPanel() {
  const section = ensurePanel();
  if (!section) return;
  const { game, day } = context();
  const summary = summarizeDriverCompliance(complianceState, day);
  const active = shiftActive(game);
  const overall = section.querySelector('#knrc-status');
  if (overall) {
    overall.textContent = summary.ready ? `READY · ${summary.currentCount}/${summary.documents.length}` : `PAPERS NEED ATTENTION · ${summary.currentCount}/${summary.documents.length}`;
    overall.className = `knrc-status ${summary.ready ? 'knrc-ok' : 'knrc-warn'}`;
  }
  const docs = section.querySelector('#knrc-docs');
  if (docs) docs.innerHTML = summary.documents.map(doc => {
    const statusText = doc.status === 'valid' ? `${doc.daysRemaining} days remaining` : doc.status === 'expiring' ? `Expiring soon · ${doc.daysRemaining} days left` : doc.status === 'expired' ? `Expired after day ${doc.expiresOnDay}` : 'Missing record';
    return `<article class="knrc-doc"><strong>${escapeHtml(doc.label)}</strong><small class="${statusClass(doc.status)}">${escapeHtml(statusText)}</small><small>Renewal: ₦${doc.cost.toLocaleString('en-NG')} · Valid for ${doc.validityDays} in-game days</small><button type="button" data-renew-document="${doc.id}" ${active ? 'disabled' : ''}>${doc.status === 'valid' || doc.status === 'expiring' ? 'RENEW RECORD' : 'RENEW / RESTORE'}</button></article>`;
  }).join('');
  const history = section.querySelector('#knrc-history');
  if (history) {
    const last = complianceState.lastCheckpoint;
    history.textContent = `Checkpoints recorded: ${complianceState.checkpointCount} · compliant: ${complianceState.compliantCheckpoints} · flagged: ${complianceState.flaggedCheckpoints}${last ? ` · latest day ${last.day}: ${last.status}, action “${last.action}”, heat ${last.heatBefore} → ${last.heatAfter}` : ''}${active ? ' · Finish the active shift to renew documents.' : ''}`;
  }
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function message(text, type = 'info') {
  const node = document.getElementById('knrc-message');
  if (node) { node.textContent = text; node.dataset.state = type; }
  activeUI?.game?.ui?.toast?.(text);
}
function renewDocument(documentId) {
  const { game, day } = context();
  if (!DRIVER_DOCUMENTS[documentId]) { message('Unknown document. No payment made.', 'error'); return; }
  if (shiftActive(game)) { message('Finish the active shift before renewing papers.', 'error'); refreshPanel(); return; }
  if (!storageWritable()) { message('Browser storage is unavailable. No payment made.', 'error'); return; }
  const life = lifeApi();
  if (typeof life?.chargeExpense !== 'function') { message('Career-wallet transaction hook unavailable. No payment made.', 'error'); return; }
  const before = complianceState;
  const prepared = renewDriverDocument(before, { documentId, day });
  if (!prepared.ok) { message('Renewal could not be prepared. No payment made.', 'error'); return; }
  const saved = saveDriverComplianceState(prepared.state);
  if (!saved.ok) { message('Compliance record could not be saved. No payment made.', 'error'); return; }
  complianceState = saved.state;
  const charge = life.chargeExpense({ amount: prepared.cost, category: 'documents', serviceId: `driver_document_${documentId}`, description: `Renewed ${DRIVER_DOCUMENTS[documentId].label}`, day });
  if (!charge?.ok) {
    const rollback = saveDriverComplianceState(before);
    if (rollback.ok) complianceState = rollback.state;
    const why = charge?.reason === 'insufficient_wallet' ? 'Insufficient wallet balance.' : charge?.reason === 'shift_active' ? 'Finish the active shift first.' : 'Wallet transaction failed.';
    message(`${why} The renewal was not retained.`, 'error');
    refreshPanel();
    return;
  }
  refreshPanel();
  emit('document_renewed', { documentId, day, cost: prepared.cost });
  message(`${DRIVER_DOCUMENTS[documentId].label} renewed for ${prepared.cost.toLocaleString('en-NG')} naira in-game.`, 'success');
}
function exportHistory() {
  try {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), driverCompliance: snapshot(), note: 'All fees, validity periods and checkpoint effects are fictional gameplay rules, not legal advice.' }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'kano-life-driver-compliance.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('Compliance history exported.', 'success');
  } catch { message('Export unavailable in this browser.', 'error'); }
}
function installGameHooks() {
  if (!Game?.prototype || Game.prototype[GAME_PATCH] || typeof Game.prototype.resolveEvent !== 'function') return;
  Object.defineProperty(Game.prototype, GAME_PATCH, { value: true });
  const originalResolve = Game.prototype.resolveEvent;
  Game.prototype.resolveEvent = function resolveEventWithDriverCompliance(action, ...args) {
    const beforeType = this.s?.event;
    const beforeState = this.state;
    const beforeCheckpoints = Number(this.s?.checkpoints) || 0;
    const beforeHeat = Number(this.s?.heat) || 0;
    const result = originalResolve.call(this, action, ...args);
    const s = this.s;
    const checkpointWasResolved = beforeType === 'karota' && beforeState === 'EVENT' && s && (Number(s.checkpoints) || 0) > beforeCheckpoints;
    if (checkpointWasResolved) {
      const { day } = context(this);
      const evaluation = applyCheckpointCompliance(complianceState, { day, action, heatBefore: Number(s.heat) || beforeHeat });
      const saved = saveDriverComplianceState(evaluation.state);
      if (saved.ok) {
        complianceState = saved.state;
        s.heat = evaluation.heatAfter;
        emit('checkpoint_resolved', { day, action, result: evaluation.record, heatAdjustment: evaluation.heatAdjustment });
        refreshPanel();
      }
    }
    return result;
  };
}
function installUIHooks() {
  if (!UI?.prototype || UI.prototype[UI_PATCH]) return;
  Object.defineProperty(UI.prototype, UI_PATCH, { value: true });
  const originalBind = UI.prototype.bind;
  if (typeof originalBind !== 'function') return;
  UI.prototype.bind = function bindDriverCompliance(...args) {
    const result = originalBind.apply(this, args);
    activeUI = this;
    if (typeof window !== 'undefined') window.__KANO_ACTIVE_UI__ = this;
    refreshPanel();
    return result;
  };
}
function install() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  complianceState = loadDriverComplianceState(globalThis.localStorage, context().day);
  installGameHooks(); installUIHooks();
  for (const name of ['kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:fuel-market-updated', 'kano:driver-compliance-updated']) window.addEventListener(name, refreshPanel);
  window.kanoNorthernDriverRoadCompliance = {
    version: 1,
    snapshot,
    refresh: refreshPanel,
    renew: renewDocument,
    export: () => JSON.stringify(snapshot(), null, 2),
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshPanel, { once: true });
    else refreshPanel();
  }
}
install();
