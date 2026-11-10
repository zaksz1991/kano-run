/**
 * Player-facing cleanup: remove developer tools nobody needs at the wheel - diagnostics, JSON/CSV report exports,
 * backup exports, model audit panels, "integration status" lists. The game logic behind them is untouched.
 */
const STYLE = `
#klc-run-runtime-audit,#klc-export-runtime-report,#klc-runtime-audit-summary,.klc-diagnostics-actions,
#klc-sim-status,#klc-sim-status-card .klc-hub-note,#klc-sim-status-title,.klc-hub-overview,#kano-launch-diagnostics,
#kfe-export,#knrc-export,#kvm-export,#kds-export,#kcs-export,
[data-kcp-action="export"],[data-kem-action="export"],[data-kes-action="export"],[data-khu-action="export"],
[data-kano-workshop-ledger-recovery-export],.kano-workshop-ledger-audit,
#kano-model-audit,.kano-model-audit,.model-audit-panel,#kano-perf-monitor,.kano-debug-panel{display:none !important}
`;
const BAD = /(export|diagnos|json|csv|download|audit report|runtime report|backup copy|recovery copy)/i;

function sweep() {
  document.querySelectorAll('button, a[download]').forEach((el) => {
    if (el.dataset.kanoCleaned) return;
    const text = (el.textContent || '').trim();
    if (text.length < 80 && BAD.test(text) && !/DOWNLOAD (THE )?APP|INSTALL/i.test(text)) {
      el.dataset.kanoCleaned = '1';
      el.style.setProperty('display', 'none', 'important');
    }
  });
}

if (typeof document !== 'undefined' && !window.__kanoPlayerCleanup) {
  window.__kanoPlayerCleanup = true;
  const style = document.createElement('style');
  style.id = 'kano-player-cleanup';
  style.textContent = STYLE;
  document.head.appendChild(style);
  setInterval(() => { try { sweep(); } catch (_) { /* optional */ } }, 1500);
}
