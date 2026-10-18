import {
  getModelAssetAuditReport,
  MODEL_KEYS,
} from './ModelManager.js';

const PANEL_ID = 'kano-model-audit-panel';
const BUTTON_ID = 'kano-model-audit-toggle';
const STYLE_ID = 'kano-model-audit-styles';
const REFRESH_INTERVAL_MS = 1500;
const VERIFY_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 10000;
const BASE_PATH = '/assets/models/';

const STYLES = `
  #${BUTTON_ID} {
    position: fixed; top: 16px; right: 16px; z-index: 10001;
    display: inline-flex; align-items: center; gap: 8px;
    min-height: 40px; padding: 10px 13px;
    border: 1px solid rgba(255,255,255,.2); border-radius: 10px;
    background: #0b1e3a; color: #fff;
    box-shadow: 0 8px 24px rgba(0,0,0,.28);
    font: 700 11px/1.2 system-ui, sans-serif;
    letter-spacing: .055em; cursor: pointer;
  }
  #${BUTTON_ID}:hover { background: #12325c; }
  #${BUTTON_ID}:focus-visible,
  #${PANEL_ID} button:focus-visible,
  #${PANEL_ID} select:focus-visible {
    outline: 2px solid #00b4d8; outline-offset: 3px;
  }
  #${BUTTON_ID} .rn-audit-indicator {
    width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%;
    background: #fbbf24; box-shadow: 0 0 0 3px rgba(251,191,36,.15);
  }
  #${PANEL_ID} {
    position: fixed; top: 66px; right: 16px; z-index: 10000;
    display: flex; flex-direction: column;
    width: min(470px, calc(100vw - 32px));
    max-height: calc(100vh - 82px); overflow: hidden;
    border: 1px solid rgba(148,163,184,.35); border-radius: 14px;
    background: #071426; color: #e5edf7;
    box-shadow: 0 18px 54px rgba(0,0,0,.4);
    font: 12px/1.45 system-ui, sans-serif;
  }
  #${PANEL_ID}[hidden] { display: none !important; }
  #${PANEL_ID} * { box-sizing: border-box; }
  #${PANEL_ID} .rn-audit-header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    padding: 15px; border-bottom: 1px solid rgba(148,163,184,.2);
    background: linear-gradient(120deg, #102a4c, #071426 72%);
  }
  #${PANEL_ID} .rn-audit-heading { margin: 0; color: #fff; font-size: 14px; font-weight: 800; }
  #${PANEL_ID} .rn-audit-subtitle { margin: 4px 0 0; color: #9eb1c9; font-size: 11px; }
  #${PANEL_ID} .rn-audit-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
  #${PANEL_ID} .rn-audit-action {
    min-height: 30px; padding: 6px 8px;
    border: 1px solid rgba(148,163,184,.28); border-radius: 7px;
    background: rgba(255,255,255,.06); color: #e5edf7;
    font: 700 10px/1.2 system-ui, sans-serif; cursor: pointer;
  }
  #${PANEL_ID} .rn-audit-action:hover { background: rgba(255,255,255,.13); }
  #${PANEL_ID} .rn-audit-action:disabled { opacity: .55; cursor: wait; }
  #${PANEL_ID} .rn-audit-summary {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px; padding: 12px; border-bottom: 1px solid rgba(148,163,184,.16);
  }
  #${PANEL_ID} .rn-audit-stat {
    min-width: 0; padding: 9px 10px; border: 1px solid rgba(148,163,184,.17);
    border-radius: 9px; background: rgba(255,255,255,.035);
  }
  #${PANEL_ID} .rn-audit-stat-value { display: block; color: #fff; font-size: 19px; font-weight: 800; line-height: 1.1; }
  #${PANEL_ID} .rn-audit-stat-label { display: block; margin-top: 4px; color: #9eb1c9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  #${PANEL_ID} .rn-audit-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 12px; border-bottom: 1px solid rgba(148,163,184,.16);
  }
  #${PANEL_ID} .rn-audit-count { color: #a9bbd1; font-size: 10px; }
  #${PANEL_ID} .rn-audit-filter {
    max-width: 60%; min-height: 31px; padding: 5px 8px;
    border: 1px solid rgba(148,163,184,.3); border-radius: 7px;
    background: #10213a; color: #e5edf7; font: 600 11px system-ui, sans-serif;
  }
  #${PANEL_ID} .rn-audit-list { min-height: 90px; overflow: auto; padding: 7px 10px 10px; overscroll-behavior: contain; }
  #${PANEL_ID} .rn-audit-section-title {
    margin: 0; padding: 12px 12px 8px; border-top: 1px solid rgba(148,163,184,.2);
    color: #dce9f7; font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase;
  }
  #${PANEL_ID} .rn-audit-progress { padding: 8px 12px; color: #f5d780; font-size: 11px; }
  #${PANEL_ID} .rn-audit-row { padding: 10px; border-bottom: 1px solid rgba(148,163,184,.13); }
  #${PANEL_ID} .rn-audit-row:last-child { border-bottom: 0; }
  #${PANEL_ID} .rn-audit-row-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 9px; }
  #${PANEL_ID} .rn-audit-key { color: #fff; font-size: 12px; font-weight: 800; overflow-wrap: anywhere; }
  #${PANEL_ID} .rn-audit-status {
    flex: 0 0 auto; padding: 3px 6px; border: 1px solid transparent;
    border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: .035em; text-transform: uppercase;
  }
  #${PANEL_ID} .status-loaded, #${PANEL_ID} .status-available {
    background: rgba(34,197,94,.13); border-color: rgba(34,197,94,.28); color: #86efac;
  }
  #${PANEL_ID} .status-loading, #${PANEL_ID} .status-checking, #${PANEL_ID} .status-pending {
    background: rgba(251,191,36,.13); border-color: rgba(251,191,36,.28); color: #fde68a;
  }
  #${PANEL_ID} .status-failed, #${PANEL_ID} .status-rejected,
  #${PANEL_ID} .status-missing, #${PANEL_ID} .status-http-error {
    background: rgba(248,113,113,.13); border-color: rgba(248,113,113,.3); color: #fca5a5;
  }
  #${PANEL_ID} .status-unconfigured, #${PANEL_ID} .status-unreachable,
  #${PANEL_ID} .status-unverified {
    background: rgba(148,163,184,.13); border-color: rgba(148,163,184,.28); color: #cbd5e1;
  }
  #${PANEL_ID} .rn-audit-path { margin-top: 4px; color: #91a8c2; overflow-wrap: anywhere; word-break: break-word; }
  #${PANEL_ID} .rn-audit-details { margin-top: 5px; color: #c2d0e1; overflow-wrap: anywhere; }
  #${PANEL_ID} .rn-audit-metadata { display: flex; flex-wrap: wrap; gap: 5px 10px; margin-top: 6px; color: #8198b3; font-size: 10px; }
  #${PANEL_ID} .rn-audit-empty { padding: 24px 12px; color: #a9bbd1; text-align: center; }
  #${PANEL_ID} .rn-audit-footer { padding: 9px 12px; border-top: 1px solid rgba(148,163,184,.16); color: #8198b3; font-size: 10px; }
  @media (max-width: 520px) {
    #${BUTTON_ID} { top: auto; right: 12px; bottom: 12px; }
    #${PANEL_ID} { top: 12px; right: 12px; bottom: 64px; width: calc(100vw - 24px); max-height: none; }
    #${PANEL_ID} .rn-audit-summary { gap: 5px; padding: 9px; }
    #${PANEL_ID} .rn-audit-stat { padding: 8px; }
    #${PANEL_ID} .rn-audit-stat-value { font-size: 17px; }
  }
`;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function statusLabel(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

function badgeClass(status) {
  const known = new Set([
    'loaded', 'loading', 'failed', 'rejected', 'unconfigured',
    'available', 'checking', 'pending', 'missing', 'http-error',
    'unreachable', 'unverified',
  ]);

  return known.has(status) ? `status-${status}` : 'status-unverified';
}

function relativeToUrl(relativePath) {
  const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${BASE_PATH}${encoded}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function checkAssetPath(relativePath) {
  const url = relativeToUrl(relativePath);

  try {
    let response = await fetchWithTimeout(url, { method: 'HEAD' });

    if (response.status === 405 || response.status === 501) {
      response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
      });

      if (response.body && response.status !== 206) {
        response.body.cancel().catch(() => {});
      }
    }

    if (response.status === 404) {
      return {
        status: 'missing',
        httpStatus: 404,
        url,
        error: 'File not found (HTTP 404).',
      };
    }

    if (response.ok || response.status === 206) {
      return {
        status: 'available',
        httpStatus: response.status,
        url,
        error: null,
      };
    }

    return {
      status: 'http-error',
      httpStatus: response.status,
      url,
      error: `Server responded with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`,
    };
  } catch (error) {
    const timedOut = error?.name === 'AbortError';

    return {
      status: 'unreachable',
      httpStatus: null,
      url,
      error: timedOut
        ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`
        : (error?.message || 'Network request failed.'),
    };
  }
}

function getCatalogPaths() {
  const items = [];

  for (const [key, value] of Object.entries(MODEL_KEYS || {})) {
    const paths = Array.isArray(value) ? value : [];

    if (!paths.length) {
      items.push({
        key,
        path: '',
        status: 'unconfigured',
        httpStatus: null,
        url: null,
        error: 'No candidate model path is configured for this category.',
      });

      continue;
    }

    for (const path of paths) {
      items.push({
        key,
        path,
        status: 'pending',
        httpStatus: null,
        url: relativeToUrl(path),
        error: null,
      });
    }
  }

  return items;
}

function getRuntimeStatusClass(status) {
  if (status === 'loaded') return 'loaded';
  if (status === 'loading') return 'loading';
  if (status === 'failed') return 'failed';
  if (status === 'rejected') return 'rejected';
  if (status === 'unconfigured') return 'unconfigured';

  return 'unverified';
}

function renderRuntimeRow(asset) {
  const status = getRuntimeStatusClass(asset.status);
  const path = asset.path || '(no candidate path configured)';
  const metadata = [];

  if (asset.failureType) {
    metadata.push(`Type: ${statusLabel(asset.failureType)}`);
  }

  if (Number.isFinite(asset.httpStatus)) {
    metadata.push(`HTTP ${asset.httpStatus}`);
  }

  if (Number.isFinite(asset.durationMs)) {
    metadata.push(`${asset.durationMs} ms`);
  }

  if (asset.status === 'loaded' && Number.isFinite(asset.meshCount)) {
    metadata.push(`${asset.meshCount} meshes`);
  }

  const details = asset.error
    ? `<div class="rn-audit-details">${escapeHTML(asset.error)}</div>`
    : '';

  return `
    <article class="rn-audit-row">
      <div class="rn-audit-row-top">
        <div class="rn-audit-key">${escapeHTML(asset.key)}</div>
        <span class="rn-audit-status ${badgeClass(status)}">${escapeHTML(statusLabel(asset.status))}</span>
      </div>
      <div class="rn-audit-path">${escapeHTML(path)}</div>
      ${details}
      <div class="rn-audit-metadata">${metadata.map((item) => `<span>${escapeHTML(item)}</span>`).join('')}</div>
    </article>
  `;
}

function renderFileRow(asset) {
  const metadata = [];

  if (Number.isFinite(asset.httpStatus)) {
    metadata.push(`HTTP ${asset.httpStatus}`);
  }

  const details = asset.error
    ? `<div class="rn-audit-details">${escapeHTML(asset.error)}</div>`
    : '';

  return `
    <article class="rn-audit-row">
      <div class="rn-audit-row-top">
        <div class="rn-audit-key">${escapeHTML(asset.key)}</div>
        <span class="rn-audit-status ${badgeClass(asset.status)}">${escapeHTML(statusLabel(asset.status))}</span>
      </div>
      <div class="rn-audit-path">${escapeHTML(asset.path || '(no path configured)')}</div>
      ${details}
      <div class="rn-audit-metadata">${metadata.map((item) => `<span>${escapeHTML(item)}</span>`).join('')}</div>
    </article>
  `;
}

function filterItems(items, filter, kind) {
  if (filter === 'all') return items;

  if (filter === 'problems') {
    if (kind === 'runtime') {
      return items.filter((item) =>
        ['failed', 'rejected', 'unconfigured'].includes(item.status),
      );
    }

    return items.filter((item) =>
      ['missing', 'http-error', 'unreachable', 'unconfigured'].includes(item.status),
    );
  }

  return items.filter((item) => item.status === filter);
}

function renderPanel(panel, state) {
  const report = getModelAssetAuditReport();

  const runtimeAssets = filterItems(
    report.assets || [],
    state.filter,
    'runtime',
  );

  const fileAssets = filterItems(
    state.fileResults,
    state.filter,
    'files',
  );

  const fileCounts = state.fileResults.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});

  const runtimeTotal = (report.assets || []).length;
  const configuredPaths = state.catalogItems.filter((item) => item.path).length;

  const complete = state.fileResults.filter(
    (item) => item.status !== 'pending' && item.status !== 'checking',
  ).length;

  const statCards = [
    ['loaded', 'Runtime loaded', report.loaded || 0],
    ['failed', 'Runtime failed', report.failed || 0],
    ['rejected', 'Invalid models', report.rejected || 0],
    ['available', 'Files found', fileCounts.available || 0],
    ['missing', 'HTTP 404', fileCounts.missing || 0],
    ['unconfigured', 'No path', report.unconfigured || fileCounts.unconfigured || 0],
  ];

  panel.innerHTML = `
    <header class="rn-audit-header">
      <div>
        <h2 class="rn-audit-heading">3D Model Asset Audit</h2>
        <p class="rn-audit-subtitle">Runtime loading and actual server-path checks</p>
      </div>

      <div class="rn-audit-actions">
        <button type="button" class="rn-audit-action" data-action="verify" ${state.verifying ? 'disabled' : ''}>
          ${state.verifying ? 'Checking…' : 'Verify files'}
        </button>

        <button type="button" class="rn-audit-action" data-action="refresh">Refresh</button>

        <button type="button" class="rn-audit-action" data-action="close" aria-label="Close audit">✕</button>
      </div>
    </header>

    <section class="rn-audit-summary" aria-label="Audit summary">
      ${statCards.map(([, label, value]) => `
        <div class="rn-audit-stat">
          <span class="rn-audit-stat-value">${Number.isFinite(value) ? value : 0}</span>
          <span class="rn-audit-stat-label">${escapeHTML(label)}</span>
        </div>
      `).join('')}
    </section>

    ${state.verifying
      ? `<div class="rn-audit-progress">Checking file paths: ${complete} of ${state.catalogItems.length} entries processed…</div>`
      : ''}

    ${state.lastVerifiedAt
      ? `<div class="rn-audit-progress">Last path check: ${escapeHTML(state.lastVerifiedAt)}</div>`
      : ''}

    <div class="rn-audit-toolbar">
      <span class="rn-audit-count">${runtimeTotal} runtime entries · ${configuredPaths} configured paths</span>

      <select class="rn-audit-filter" data-role="filter" aria-label="Filter audit rows">
        <option value="all" ${state.filter === 'all' ? 'selected' : ''}>All entries</option>
        <option value="problems" ${state.filter === 'problems' ? 'selected' : ''}>Problems only</option>
        <option value="loaded" ${state.filter === 'loaded' ? 'selected' : ''}>Runtime loaded</option>
        <option value="loading" ${state.filter === 'loading' ? 'selected' : ''}>Runtime loading</option>
        <option value="failed" ${state.filter === 'failed' ? 'selected' : ''}>Runtime failed</option>
        <option value="rejected" ${state.filter === 'rejected' ? 'selected' : ''}>Runtime rejected</option>
        <option value="available" ${state.filter === 'available' ? 'selected' : ''}>Files found</option>
        <option value="missing" ${state.filter === 'missing' ? 'selected' : ''}>Missing files</option>
        <option value="http-error" ${state.filter === 'http-error' ? 'selected' : ''}>HTTP errors</option>
        <option value="unreachable" ${state.filter === 'unreachable' ? 'selected' : ''}>Unreachable</option>
        <option value="unconfigured" ${state.filter === 'unconfigured' ? 'selected' : ''}>Unconfigured</option>
        <option value="pending" ${state.filter === 'pending' ? 'selected' : ''}>Not checked</option>
      </select>
    </div>

    <h3 class="rn-audit-section-title">Runtime load attempts</h3>

    <div class="rn-audit-list" role="region" aria-label="Runtime model load attempts" tabindex="0">
      ${runtimeAssets.length
        ? runtimeAssets.map(renderRuntimeRow).join('')
        : '<div class="rn-audit-empty">No runtime entries match this filter.</div>'}
    </div>

    <h3 class="rn-audit-section-title">Catalog path verification</h3>

    <div class="rn-audit-list" role="region" aria-label="Catalog model file checks" tabindex="0">
      ${fileAssets.length
        ? fileAssets.map(renderFileRow).join('')
        : '<div class="rn-audit-empty">No file paths match this filter. Select “Verify files” to check the complete catalog.</div>'}
    </div>

    <footer class="rn-audit-footer">
      File checks request response headers where possible. “Files found” confirms a successful HTTP response; it does not prove the GLB parses or looks correct in-game.
    </footer>
  `;
}

export function createModelAuditPanel() {
  if (typeof document === 'undefined') {
    return {
      refresh() {},
      destroy() {},
    };
  }

  const oldPanel = document.getElementById(PANEL_ID);
  const oldButton = document.getElementById(BUTTON_ID);

  if (oldPanel && oldButton) {
    return {
      panel: oldPanel,
      button: oldButton,
      refresh() {},
      destroy() {
        oldPanel.remove();
        oldButton.remove();
        document.getElementById(STYLE_ID)?.remove();
      },
    };
  }

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.setAttribute('aria-controls', PANEL_ID);
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `
    <span class="rn-audit-indicator" aria-hidden="true"></span>
    <span>3D MODEL AUDIT</span>
  `;
  button.title = 'Open the 3D model asset audit';

  const panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.setAttribute('aria-label', '3D model asset audit panel');
  panel.setAttribute('aria-live', 'polite');

  document.body.append(button, panel);

  const catalogItems = getCatalogPaths();

  const state = {
    filter: 'all',
    catalogItems,
    fileResults: catalogItems.map((item) => ({ ...item })),
    verifying: false,
    lastVerifiedAt: null,
  };

  let refreshTimer = null;
  let verifyRun = 0;

  const refresh = () => {
    if (panel.isConnected) {
      renderPanel(panel, state);
    }
  };

  const stopAutoRefresh = () => {
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  const openPanel = () => {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    refresh();

    stopAutoRefresh();
    refreshTimer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
  };

  const closePanel = () => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    stopAutoRefresh();
  };

  const verifyAllPaths = async () => {
    if (state.verifying) return;

    const thisRun = ++verifyRun;

    state.verifying = true;

    state.fileResults = state.catalogItems.map((item) => ({
      ...item,
      status: item.path ? 'pending' : 'unconfigured',
      httpStatus: null,
      error: item.path ? null : item.error,
    }));

    refresh();

    const work = state.fileResults
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => Boolean(item.path));

    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < work.length) {
        const current = work[nextIndex++];
        const { item, index } = current;

        if (thisRun !== verifyRun) return;

        state.fileResults[index] = {
          ...item,
          status: 'checking',
          error: null,
        };

        refresh();

        const result = await checkAssetPath(item.path);

        if (thisRun !== verifyRun) return;

        state.fileResults[index] = {
          ...item,
          ...result,
        };

        refresh();
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(VERIFY_CONCURRENCY, work.length) },
          () => worker(),
        ),
      );
    } finally {
      if (thisRun === verifyRun) {
        state.verifying = false;
        state.lastVerifiedAt = new Date().toLocaleTimeString();
        refresh();
      }
    }
  };

  button.addEventListener('click', () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });

  panel.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;

    if (action === 'close') closePanel();
    if (action === 'refresh') refresh();
    if (action === 'verify') verifyAllPaths();
  });

  panel.addEventListener('change', (event) => {
    if (event.target.matches('[data-role="filter"]')) {
      state.filter = event.target.value || 'all';
      refresh();
    }
  });

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
      button.focus();
    }
  };

  const onPageHide = () => stopAutoRefresh();

  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('pagehide', onPageHide);

  refresh();

  return {
    panel,
    button,
    refresh,
    verify: verifyAllPaths,

    destroy() {
      verifyRun += 1;
      stopAutoRefresh();

      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', onPageHide);

      panel.remove();
      button.remove();

      document.getElementById(STYLE_ID)?.remove();
    },
  };
}