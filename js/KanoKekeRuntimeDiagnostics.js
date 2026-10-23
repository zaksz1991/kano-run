/**
 * Opt-in runtime diagnostics for the player's keke.
 * Enabled only with ?debugKeke=1, so production gameplay UI is untouched.
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
  const event = snapshot.lastEvent || {};
  const lines = [
    'KANO LIFE | PLAYER KEKE DIAGNOSTICS',
    `Scene: ${clean(snapshot.scene, 'unknown')} | Device: ${renderer.mobile ? clean(renderer.tier, 'mobile') : 'desktop'}`,
    `Player: ${clean(player.name, 'unnamed')} | Model: ${clean(player.model, 'unknown')}`,
    `Fallback: ${player.fallback ? 'yes' : 'no'} | Root visible: ${player.visible === false ? 'no' : 'yes'}`,
    `Visible path: ${player.visiblePath === false ? 'no' : player.visiblePath === true ? 'yes' : 'unknown'} | Parent: ${clean(player.parent, 'none')}`,
    `Local position: ${tupleText(player.position)} | World position: ${tupleText(player.worldPosition)}`,
    `Scale: ${tupleText(player.scale)} | Renderable meshes: ${Number.isFinite(Number(renderability.renderableMeshCount)) ? Number(renderability.renderableMeshCount) : '—'}`,
    `Vehicle structure: ${structural.ok === true ? 'OK' : structural.ok === false ? `FAIL (${clean(structural.reason, 'unspecified')})` : 'not checked'}`,
    `Health: ${health.ok === true ? 'OK' : health.ok === false ? `FAIL (${clean(health.reason, 'unspecified')})` : 'not checked'} | Recoveries: ${Number(snapshot.recoveryCount) || 0}`,
    `Last event: ${clean(event.phase, 'none')} | ${clean(event.reason, 'no error recorded')}`,
    `Rejected model: ${clean(event.rejectedModel, 'none')} | Last check: ${clean(event.at, 'not checked')}`,
    `Canvas: ${clean(renderer.canvasSize, 'unknown')} | Pixel ratio: ${numberText(renderer.pixelRatio, 2)}`,
    'Enable with ?debugKeke=1. This panel does not change gameplay.',
  ];
  return lines.join('\n');
}

/** Create a DOM overlay only when the explicit debug query parameter is set. */
export function createKekeRuntimeDiagnostics({
  enabled = shouldEnableKekeRuntimeDiagnostics(),
  documentRef = globalThis.document,
  now = () => (globalThis.performance?.now?.() ?? Date.now()),
  refreshMs = 450,
} = {}) {
  if (!enabled || !documentRef?.createElement || !documentRef?.body?.appendChild) {
    return { enabled: false, update() {}, dispose() {} };
  }

  const panel = documentRef.createElement('pre');
  panel.setAttribute?.('aria-label', 'Kano Life player keke diagnostics');
  panel.setAttribute?.('role', 'status');
  panel.style.cssText = [
    'position:fixed',
    'left:8px',
    'top:8px',
    'z-index:2147483000',
    'width:min(370px,calc(100vw - 16px))',
    'max-height:42vh',
    'overflow:auto',
    'margin:0',
    'padding:9px 10px',
    'box-sizing:border-box',
    'border:1px solid rgba(106,220,255,.72)',
    'border-radius:7px',
    'background:rgba(4,13,24,.90)',
    'color:#eaf8ff',
    'font:11px/1.42 ui-monospace,SFMono-Regular,Consolas,monospace',
    'white-space:pre-wrap',
    'overflow-wrap:anywhere',
    'pointer-events:none',
    'contain:layout paint',
  ].join(';');
  documentRef.body.appendChild(panel);

  let lastRenderedAt = -Infinity;
  let disposed = false;
  return {
    enabled: true,
    element: panel,
    update(snapshot, force = false) {
      if (disposed) return;
      const time = Number(now()) || 0;
      if (!force && time - lastRenderedAt < Math.max(100, refreshMs)) return;
      lastRenderedAt = time;
      panel.textContent = formatKekeRuntimeDiagnosticText(snapshot);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (panel.parentNode?.removeChild) panel.parentNode.removeChild(panel);
      else panel.remove?.();
    },
  };
}
