/**
 * Opt-in runtime diagnostics for the player's keke.
 * Enabled only with ?debugKeke=1, so production gameplay UI is untouched.
 * The panel supports touch-friendly copy/download actions so phone reports can
 * be captured without reading values manually from a screenshot.
 */
export function shouldEnableKekeRuntimeDiagnostics(search = globalThis.location?.search || '') {
  try {
    return new URLSearchParams(String(search || '')).get('debugKeke') === '1';
  } catch {
    return false;
  }
}

function numberText(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : '—';
}

function tupleText(value, keys = ['x', 'y', 'z']) {
  if (!value) return '—';
  return keys.map((key) => numberText(value[key])).join(', ');
}

function clean(value, fallback = '—') {
  const text = String(value ?? '').trim();
  return text ? text.replace(/[\r\n\t]+/g, ' ').slice(0, 180) : fallback;
}

/** Format a deterministic, copyable report for tests and support screenshots. */
export function formatKekeRuntimeDiagnosticText(snapshot = {}) {
  const player = snapshot.player || {};
  const health = snapshot.health || {};
  const renderability = snapshot.renderability || health.renderability || {};
  const structural = snapshot.structural || health.structural || {};
  const renderer = snapshot.renderer || {};
  const camera = snapshot.camera || {};
  const event = snapshot.lastEvent || {};
  const cameraView = camera.inFrustum === true
    ? 'inside frustum'
    : camera.inFrustum === false
      ? 'outside frustum'
      : 'unknown';
  const bounds = camera.boundsValid === true ? tupleText(camera.boundsSize) : 'unavailable';
  const boundsCenter = camera.boundsValid === true ? tupleText(camera.boundsCenter) : '—';
  const cameraPosition = camera.available === true ? tupleText(camera.cameraWorldPosition) : '—';
  const meshNames = Array.isArray(renderability.meshNames) && renderability.meshNames.length
    ? renderability.meshNames.map((name) => clean(name, '')).filter(Boolean).slice(0, 8).join(', ')
    : 'none reported';
  const lines = [
    'KANO LIFE | PLAYER KEKE DIAGNOSTICS',
    `Scene: ${clean(snapshot.scene, 'unknown')} | Device: ${renderer.mobile ? clean(renderer.tier, 'mobile') : 'desktop'}`,
    `Player: ${clean(player.name, 'unnamed')} | Model: ${clean(player.model, 'unknown')}`,
    `Fallback: ${player.fallback ? 'yes' : 'no'} | Root visible: ${player.visible === false ? 'no' : 'yes'}`,
    `Visible path: ${player.visiblePath === false ? 'no' : player.visiblePath === true ? 'yes' : 'unknown'} | Parent: ${clean(player.parent, 'none')}`,
    `Local position: ${tupleText(player.position)} | World position: ${tupleText(player.worldPosition)}`,
    `Scale: ${tupleText(player.scale)} | Renderable meshes: ${Number.isFinite(Number(renderability.renderableMeshCount)) ? Number(renderability.renderableMeshCount) : '—'}`,
    `Mesh samples: ${meshNames}`,
    `Camera frustum: ${cameraView} | Distance to vehicle bounds centre: ${numberText(camera.distanceToCenter, 2)}`,
    `Vehicle world bounds W/H/D: ${bounds} | Bounds centre: ${boundsCenter}`,
    `Camera world position: ${cameraPosition} | Measurement: ${clean(camera.reason, 'not measured')}`,
    `Vehicle structure: ${structural.ok === true ? 'OK' : structural.ok === false ? `FAIL (${clean(structural.reason, 'unspecified')})` : 'not checked'}`,
    `Health: ${health.ok === true ? 'OK' : health.ok === false ? `FAIL (${clean(health.reason, 'unspecified')})` : 'not checked'} | Recoveries: ${Number(snapshot.recoveryCount) || 0}`,
    `Last event: ${clean(event.phase, 'none')} | ${clean(event.reason, 'no error recorded')}`,
    `Rejected model: ${clean(event.rejectedModel, 'none')} | Last check: ${clean(event.at, 'not checked')}`,
    `Canvas: ${clean(renderer.canvasSize, 'unknown')} | Pixel ratio: ${numberText(renderer.pixelRatio, 2)}`,
    'Frustum is a geometric camera check; it does not detect occlusion or shader failures.',
    'Enable with ?debugKeke=1. This panel does not change gameplay.',
  ];
  return lines.join('\n');
}

function attachClick(node, callback) {
  if (typeof node?.addEventListener === 'function') node.addEventListener('click', callback);
  else if (node) node.onclick = callback;
}

function makeButton(documentRef, label) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute?.('type', 'button');
  button.setAttribute?.('aria-label', label);
  button.style.cssText = [
    'appearance:none', 'border:1px solid rgba(106,220,255,.8)',
    'border-radius:5px', 'padding:6px 9px', 'min-height:32px',
    'background:#113047', 'color:#f3fbff', 'font:600 11px/1.2 system-ui,sans-serif',
    'cursor:pointer', 'touch-action:manipulation', 'pointer-events:auto',
  ].join(';');
  return button;
}

function safeFilenameDate(date = new Date()) {
  try {
    return date.toISOString().replace(/[:.]/g, '-');
  } catch {
    return String(Date.now());
  }
}

/** Create a DOM overlay only when the explicit debug query parameter is set. */
export function createKekeRuntimeDiagnostics({
  enabled = shouldEnableKekeRuntimeDiagnostics(),
  documentRef = globalThis.document,
  now = () => (globalThis.performance?.now?.() ?? Date.now()),
  refreshMs = 450,
  clipboardRef = globalThis.navigator?.clipboard,
  urlRef = globalThis.URL,
  BlobRef = globalThis.Blob,
  setTimeoutRef = globalThis.setTimeout?.bind(globalThis),
} = {}) {
  if (!enabled || !documentRef?.createElement || !documentRef?.body?.appendChild) {
    return { enabled: false, update() {}, dispose() {}, copyReport: async () => false, downloadReport: () => false };
  }

  const container = documentRef.createElement('section');
  container.setAttribute?.('aria-label', 'Kano Life player keke diagnostics panel');
  container.style.cssText = [
    'position:fixed', 'left:8px', 'top:8px', 'z-index:2147483000',
    'width:min(390px,calc(100vw - 16px))', 'max-height:48vh', 'overflow:hidden',
    'margin:0', 'padding:0', 'box-sizing:border-box', 'pointer-events:none',
    'contain:layout paint',
  ].join(';');

  const toolbar = documentRef.createElement('div');
  toolbar.setAttribute?.('aria-label', 'Diagnostic report actions');
  toolbar.style.cssText = [
    'display:flex', 'gap:6px', 'align-items:center', 'flex-wrap:wrap',
    'margin:0 0 5px', 'pointer-events:auto',
  ].join(';');
  const copyButton = makeButton(documentRef, 'Copy report');
  const downloadButton = makeButton(documentRef, 'Save report .txt');
  toolbar.appendChild?.(copyButton);
  toolbar.appendChild?.(downloadButton);

  const status = documentRef.createElement('span');
  status.setAttribute?.('role', 'status');
  status.setAttribute?.('aria-live', 'polite');
  status.style.cssText = [
    'color:#eaf8ff', 'font:10px/1.2 system-ui,sans-serif',
    'text-shadow:0 1px 2px #000', 'pointer-events:none',
  ].join(';');
  toolbar.appendChild?.(status);

  const panel = documentRef.createElement('pre');
  panel.setAttribute?.('aria-label', 'Kano Life player keke diagnostic report');
  panel.setAttribute?.('role', 'status');
  panel.style.cssText = [
    'width:100%', 'max-height:calc(48vh - 42px)', 'overflow:auto',
    'margin:0', 'padding:9px 10px', 'box-sizing:border-box',
    'border:1px solid rgba(106,220,255,.72)', 'border-radius:7px',
    'background:rgba(4,13,24,.90)', 'color:#eaf8ff',
    'font:11px/1.42 ui-monospace,SFMono-Regular,Consolas,monospace',
    'white-space:pre-wrap', 'overflow-wrap:anywhere', 'pointer-events:none',
  ].join(';');

  container.appendChild?.(toolbar);
  container.appendChild?.(panel);
  documentRef.body.appendChild(container);

  let lastRenderedAt = -Infinity;
  let latestSnapshot = null;
  let latestReport = '';
  let disposed = false;
  let lastObjectUrl = null;
  const setStatus = (message) => {
    if (!disposed) status.textContent = message;
  };
  const buildReport = () => latestReport || formatKekeRuntimeDiagnosticText(latestSnapshot || {});

  async function copyReport() {
    if (disposed || !latestSnapshot) {
      setStatus('No report yet');
      return false;
    }
    const report = buildReport();
    try {
      if (clipboardRef?.writeText) {
        await clipboardRef.writeText(report);
        setStatus('Report copied');
        return true;
      }
    } catch {
      // Clipboard permission can be unavailable on mobile; try the selection fallback.
    }
    try {
      if (documentRef.createElement && typeof documentRef.execCommand === 'function') {
        const area = documentRef.createElement('textarea');
        area.value = report;
        area.setAttribute?.('aria-label', 'Diagnostic report text for copying');
        area.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;';
        documentRef.body.appendChild(area);
        area.focus?.();
        area.select?.();
        const copied = documentRef.execCommand('copy');
        area.parentNode?.removeChild?.(area);
        if (copied) {
          setStatus('Report copied');
          return true;
        }
      }
    } catch {
      // Return the failure state below without affecting gameplay.
    }
    setStatus('Copy blocked; use Save report');
    return false;
  }

  function downloadReport() {
    if (disposed || !latestSnapshot) {
      setStatus('No report yet');
      return false;
    }
    if (typeof BlobRef !== 'function' || typeof urlRef?.createObjectURL !== 'function' ||
        typeof documentRef.createElement !== 'function') {
      setStatus('Save unavailable; use Copy report');
      return false;
    }
    try {
      const blob = new BlobRef([buildReport()], { type: 'text/plain;charset=utf-8' });
      const objectUrl = urlRef.createObjectURL(blob);
      const link = documentRef.createElement('a');
      link.href = objectUrl;
      link.download = `kano-keke-diagnostics-${safeFilenameDate()}.txt`;
      link.setAttribute?.('aria-label', 'Download Kano keke diagnostic report');
      link.style.cssText = 'position:fixed;left:-10000px;top:0;';
      documentRef.body.appendChild(link);
      link.click?.();
      link.parentNode?.removeChild?.(link);
      if (lastObjectUrl && typeof urlRef.revokeObjectURL === 'function') {
        try { urlRef.revokeObjectURL(lastObjectUrl); } catch { /* ignored */ }
      }
      lastObjectUrl = objectUrl;
      if (typeof urlRef.revokeObjectURL === 'function') {
        const urlToRevoke = objectUrl;
        const revoke = () => {
          try { urlRef.revokeObjectURL(urlToRevoke); } catch { /* ignored */ }
          if (lastObjectUrl === urlToRevoke) lastObjectUrl = null;
        };
        if (typeof setTimeoutRef === 'function') setTimeoutRef(revoke, 1500);
      }
      setStatus('Report saved');
      return true;
    } catch {
      setStatus('Save failed; use Copy report');
      return false;
    }
  }

  attachClick(copyButton, () => { void copyReport(); });
  attachClick(downloadButton, () => { downloadReport(); });

  return {
    enabled: true,
    element: panel,
    container,
    copyButton,
    downloadButton,
    copyReport,
    downloadReport,
    update(snapshot, force = false) {
      if (disposed) return;
      const time = Number(now()) || 0;
      if (!force && time - lastRenderedAt < Math.max(100, refreshMs)) return;
      lastRenderedAt = time;
      latestSnapshot = snapshot || {};
      latestReport = formatKekeRuntimeDiagnosticText(latestSnapshot);
      panel.textContent = latestReport;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (lastObjectUrl && typeof urlRef?.revokeObjectURL === 'function') {
        try { urlRef.revokeObjectURL(lastObjectUrl); } catch { /* ignored */ }
      }
      lastObjectUrl = null;
      if (container.parentNode?.removeChild) container.parentNode.removeChild(container);
      else container.remove?.();
    },
  };
}
