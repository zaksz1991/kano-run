import './KanoCloudSave.js';

/**
 * KANO LIFE — GLOBAL LEADERBOARD BRIDGE
 *
 * Observes committed local run records, queues completed scores for the
 * same-origin Vercel API, retries when online, and renders global rankings.
 * No gameplay state is modified and failures never block the driving game.
 */

const SAVE_KEY = 'kano-life-save-v4';
const SESSION_KEY = 'kano-life-global-session-id-v1';
const DISPLAY_NAME_KEY = 'kano-life-global-display-name-v1';
const QUEUE_KEY = 'kano-life-global-score-queue-v1';
const SEEN_KEY = 'kano-life-global-score-seen-v1';
const VALID_TRIBES = new Set(['hausa', 'yoruba', 'igbo']);
const VALID_MODES = new Set(['career', 'timeAttack', 'fuel', 'matchDrop', 'potholes', 'freeRoam']);
const MODE_LABELS = {
  career: 'Career', timeAttack: 'Time Attack', fuel: 'Fuel',
  matchDrop: 'Match Drop', potholes: 'Potholes', freeRoam: 'Free Roam',
};

let nativeSetItem = null;
let localSessionId = '';
let currentlyFlushing = false;
let refreshInFlight = false;
let observer = null;
let retryTimer = null;
let lastStatus = '';

function safeGet(key) {
  try { return globalThis.localStorage?.getItem(key) || ''; } catch { return ''; }
}
function safeSet(key, value) {
  try {
    if (!nativeSetItem) return false;
    nativeSetItem.call(globalThis.localStorage, key, String(value));
    return true;
  } catch { return false; }
}
function safeJson(raw, fallback) {
  try { const value = JSON.parse(raw); return value ?? fallback; } catch { return fallback; }
}
function uuidV4() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch { /* Fall through to the non-cryptographic UUID-shaped fallback. */ }
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(0, 3)}-a${hex().slice(0, 3)}-${hex()}${hex().slice(0, 4)}`;
}
function ensureSessionId() {
  let value = safeGet(SESSION_KEY);
  if (!/^[a-f0-9-]{16,64}$/i.test(value)) {
    value = uuidV4();
    safeSet(SESSION_KEY, value);
  }
  localSessionId = value;
  return value;
}
function cleanDisplayName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}
function currentDisplayName() {
  const saved = cleanDisplayName(safeGet(DISPLAY_NAME_KEY));
  return saved || `Kano Driver ${ensureSessionId().slice(0, 4).toUpperCase()}`;
}
function runSignature(run) {
  return [run?.date || '', run?.score ?? '', run?.distance ?? '', run?.driver || '', run?.mode || ''].join('|');
}
function readQueue() {
  const queue = safeJson(safeGet(QUEUE_KEY), []);
  return Array.isArray(queue) ? queue.filter((item) => item && typeof item === 'object' && item.payload) : [];
}
function writeQueue(queue) {
  return safeSet(QUEUE_KEY, JSON.stringify(queue.slice(-50)));
}
function setStatus(message) {
  if (message === lastStatus) return;
  lastStatus = message;
  document.querySelectorAll('[data-kano-global-status]').forEach((element) => {
    element.textContent = message;
  });
}
function setQueueStatus() {
  const count = readQueue().length;
  if (count > 0) setStatus(`Cloud sync pending · ${count} score${count === 1 ? '' : 's'} waiting for a connection or server response.`);
  else setStatus('Completed runs sync to the shared board when the score service is configured and reachable.');
}

function normalizeRunRecord(run, saveObject) {
  if (!run || typeof run !== 'object') return null;
  const score = Number(run.score);
  const distance = Number(run.distance);
  const mode = VALID_MODES.has(run.mode) ? run.mode : 'career';
  const tribe = VALID_TRIBES.has(saveObject?.dialect) ? saveObject.dialect : 'hausa';
  if (!Number.isFinite(score) || score < 0 || score > 100_000_000) return null;
  if (!Number.isFinite(distance) || distance < 0 || distance > 10_000) return null;
  const dateValue = typeof run.date === 'string' ? Date.parse(run.date) : Number(run.date);
  return {
    score: Math.floor(score),
    distance: Number(distance.toFixed(2)),
    driver: cleanDisplayName(run.driver || 'RuffNeck') || 'RuffNeck',
    mode,
    tribe,
    submittedAt: Number.isFinite(dateValue) && dateValue > 0 ? Math.floor(dateValue) : Date.now(),
  };
}

function enqueueCompletedRuns(saveObject) {
  if (!Array.isArray(saveObject?.lastRuns)) return;
  const known = new Set(safeJson(safeGet(SEEN_KEY), []));
  const queue = readQueue();
  const queueSignatures = new Set(queue.map((item) => item.signature));
  let changed = false;

  // The game's lastRuns array is newest-first. Reversing the short history
  // keeps newly discovered records queued in chronological order.
  for (const run of saveObject.lastRuns.slice(0, 20).reverse()) {
    const signature = runSignature(run);
    if (!signature.replaceAll('|', '') || known.has(signature) || queueSignatures.has(signature)) continue;
    const payloadRecord = normalizeRunRecord(run, saveObject);
    if (!payloadRecord) { known.add(signature); changed = true; continue; }
    const entry = {
      signature,
      queuedAt: Date.now(),
      payload: {
        sessionId: ensureSessionId(),
        runId: uuidV4(),
        displayName: currentDisplayName(),
        score: payloadRecord.score,
        distance: payloadRecord.distance,
        driver: payloadRecord.driver,
        mode: payloadRecord.mode,
        tribe: payloadRecord.tribe,
        submittedAt: payloadRecord.submittedAt,
      },
    };
    queue.push(entry);
    queueSignatures.add(signature);
    known.add(signature);
    changed = true;
  }

  // Preserve only the most recent signatures to keep browser storage small.
  if (known.size > 300) {
    const recent = saveObject.lastRuns.slice(0, 20).map(runSignature);
    safeSet(SEEN_KEY, JSON.stringify([...new Set([...recent, ...known])].slice(-300)));
  } else if (changed) {
    safeSet(SEEN_KEY, JSON.stringify([...known]));
  }
  if (changed) writeQueue(queue);
  if (changed) {
    setQueueStatus();
    void flushQueue();
  }
}

async function flushQueue() {
  if (currentlyFlushing || !globalThis.fetch || !globalThis.navigator?.onLine) return;
  currentlyFlushing = true;
  try {
    let queue = readQueue();
    while (queue.length) {
      const entry = queue[0];
      let response;
      let body;
      try {
        response = await fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          credentials: 'same-origin',
          body: JSON.stringify(entry.payload),
        });
        body = await response.json().catch(() => ({}));
      } catch (error) {
        setStatus('Global leaderboard offline; this score is queued locally and will retry.');
        return;
      }

      if (response.ok && body?.ok) {
        queue.shift();
        writeQueue(queue);
        window.dispatchEvent(new CustomEvent('kano:global-score-submitted', {
          detail: { score: entry.payload.score, tribe: entry.payload.tribe },
        }));
        setQueueStatus();
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        if (body?.error === 'leaderboard_not_configured') {
          setStatus('Global leaderboard server storage is not configured. Local scores remain safe in this browser.');
        } else {
          setStatus('Global leaderboard temporarily unavailable; queued scores will retry.');
        }
        return;
      }

      // Invalid payloads cannot succeed on retry. Drop that individual record,
      // keep later records, and report the failure without blocking gameplay.
      queue.shift();
      writeQueue(queue);
      setStatus(`One score was rejected by the leaderboard (${body?.error || response.status}). Other saved scores remain available locally.`);
    }
  } finally {
    currentlyFlushing = false;
    if (!readQueue().length && lastStatus.includes('queued')) setQueueStatus();
  }
}

function createStyles() {
  if (document.getElementById('kano-global-board-styles')) return;
  const style = document.createElement('style');
  style.id = 'kano-global-board-styles';
  style.textContent = `
    #kano-global-board-dialog{width:min(640px,calc(100vw - 24px));max-width:640px;max-height:88dvh;overflow:auto;border:1px solid #334b63;border-radius:18px;padding:0;background:#101a26;color:#edf5fb;box-shadow:0 24px 90px #000a;font:14px/1.45 system-ui,sans-serif}
    #kano-global-board-dialog::backdrop{background:#030810c9;backdrop-filter:blur(4px)}
    #kano-global-board-dialog[open]{display:block}
    .kano-global-inner{padding:18px;display:grid;gap:12px}
    .kano-global-header{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .kano-global-header h2{font-size:clamp(18px,4vw,24px);margin:0;letter-spacing:.04em}
    .kano-global-close{font-size:24px;line-height:1;min-width:40px;min-height:40px;border-radius:10px;border:1px solid #456078;background:#1d3044;color:#fff}
    .kano-global-profile{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
    .kano-global-profile label,.kano-global-filter{display:grid;gap:5px;color:#afc0d1;font-size:12px;font-weight:700}
    .kano-global-profile input,.kano-global-filter select{box-sizing:border-box;width:100%;min-height:42px;border-radius:9px;border:1px solid #3d536a;background:#08131f;color:#fff;padding:8px 10px;font:inherit}
    .kano-global-button{min-height:42px;border:1px solid #e4ba55;border-radius:9px;padding:8px 12px;background:#f5c542;color:#172333;font-weight:800;cursor:pointer;touch-action:manipulation}
    .kano-global-row{display:flex;gap:8px;align-items:end;justify-content:space-between;flex-wrap:wrap}
    .kano-global-filter{flex:1;min-width:140px}
    .kano-global-status{margin:0;color:#a9c0d1;font-size:12px;min-height:18px;overflow-wrap:anywhere}
    .kano-global-table-wrap{overflow:auto;border:1px solid #2b4053;border-radius:10px}
    .kano-global-table{width:100%;border-collapse:collapse;min-width:360px;font-variant-numeric:tabular-nums}
    .kano-global-table th,.kano-global-table td{padding:9px 8px;border-bottom:1px solid #263b4d;text-align:left;white-space:nowrap}
    .kano-global-table th{position:sticky;top:0;background:#17283a;color:#a9c0d1;font-size:11px}
    .kano-global-table tr:last-child td{border-bottom:0}
    .kano-global-footnote{margin:0;color:#7f96aa;font-size:11px}
    #kano-global-over-button{margin-top:10px;width:100%;min-height:42px;border:1px solid #d3aa4d;border-radius:10px;background:#1d3044;color:#ffda76;font-weight:800}
    @media(max-width:420px){.kano-global-inner{padding:13px}.kano-global-profile{grid-template-columns:1fr}.kano-global-profile .kano-global-button{width:100%}}
  `;
  document.head.append(style);
}

function ensureDialog() {
  let dialog = document.getElementById('kano-global-board-dialog');
  if (dialog) return dialog;
  createStyles();
  dialog = document.createElement('dialog');
  dialog.id = 'kano-global-board-dialog';
  dialog.setAttribute('aria-labelledby', 'kano-global-board-title');
  dialog.innerHTML = `
    <div class="kano-global-inner">
      <header class="kano-global-header">
        <h2 id="kano-global-board-title">KANO LIFE · GLOBAL RANK</h2>
        <button type="button" class="kano-global-close" data-kano-global-close aria-label="Close leaderboard">×</button>
      </header>
      <div class="kano-global-profile">
        <label for="kano-global-display-name">DRIVER NAME <input id="kano-global-display-name" maxlength="24" autocomplete="nickname" /></label>
        <button type="button" class="kano-global-button" id="kano-global-save-name">SAVE NAME</button>
      </div>
      <div class="kano-global-row">
        <label class="kano-global-filter" for="kano-global-board-select">LEADERBOARD
          <select id="kano-global-board-select">
            <option value="all">Overall · All players</option>
            <option value="hausa">Hausa board</option>
            <option value="yoruba">Yoruba board</option>
            <option value="igbo">Igbo board</option>
          </select>
        </label>
        <button type="button" class="kano-global-button" id="kano-global-refresh">REFRESH SCORES</button>
      </div>
      <p class="kano-global-status" data-kano-global-status role="status" aria-live="polite">Loading shared scores…</p>
      <div class="kano-global-table-wrap">
        <table class="kano-global-table">
          <thead><tr><th>RANK</th><th>DRIVER</th><th>SCORE</th><th>DISTANCE</th><th>LANGUAGE</th></tr></thead>
          <tbody id="kano-global-board-rows"><tr><td colspan="5">No scores loaded.</td></tr></tbody>
        </table>
      </div>
      <p class="kano-global-footnote">This board contains completed runs submitted to the shared server. Guest names and client-submitted scores are not identity-verified or cheat-proof. Local wallet and save data remain on this browser.</p>
    </div>`;
  document.body.append(dialog);
  dialog.querySelector('[data-kano-global-close]')?.addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); });
  dialog.querySelector('#kano-global-save-name')?.addEventListener('click', () => {
    const input = dialog.querySelector('#kano-global-display-name');
    const clean = cleanDisplayName(input?.value);
    if (!clean) {
      setStatus('Enter a driver name up to 24 characters.');
      return;
    }
    safeSet(DISPLAY_NAME_KEY, clean);
    if (input) input.value = clean;
    setStatus(`Driver name saved on this browser as ${clean}.`);
  });
  dialog.querySelector('#kano-global-board-select')?.addEventListener('change', () => void refreshBoard());
  dialog.querySelector('#kano-global-refresh')?.addEventListener('click', () => void refreshBoard());
  const input = dialog.querySelector('#kano-global-display-name');
  if (input) input.value = currentDisplayName();
  return dialog;
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') {
    try { dialog.close(); return; } catch { /* fallback */ }
  }
  dialog.removeAttribute('open');
}
function openDialog() {
  const dialog = ensureDialog();
  const input = dialog.querySelector('#kano-global-display-name');
  if (input) input.value = currentDisplayName();
  if (typeof dialog.showModal === 'function') {
    try { if (!dialog.open) dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  } else {
    dialog.setAttribute('open', '');
  }
  void refreshBoard();
  void flushQueue();
}
function formatTribe(tribe) {
  return ({ hausa: 'HAUSA', yoruba: 'YORUBA', igbo: 'IGBO' })[tribe] || String(tribe || '').toUpperCase();
}
function formatDate(value) {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
}

async function refreshBoard() {
  if (refreshInFlight) return;
  const dialog = ensureDialog();
  const select = dialog.querySelector('#kano-global-board-select');
  const board = select?.value || 'all';
  const target = dialog.querySelector('#kano-global-board-rows');
  if (!target) return;
  refreshInFlight = true;
  target.replaceChildren(makeCellRow('Loading shared scores…'));
  setStatus('Connecting to the Kano Life score service…');
  try {
    const response = await fetch(`/api/leaderboard?board=${encodeURIComponent(board)}&limit=10`, {
      method: 'GET', cache: 'no-store', credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) {
      target.replaceChildren(makeCellRow(body?.error === 'leaderboard_not_configured'
        ? 'Server leaderboard is not configured.'
        : 'Global scores are temporarily unavailable.'));
      setStatus(body?.error === 'leaderboard_not_configured'
        ? 'Add the existing Upstash Redis REST environment variables to enable shared scores.'
        : 'Global leaderboard request failed. Local scores remain saved in this browser.');
      return;
    }
    target.replaceChildren();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      target.append(makeCellRow('No global scores yet. Finish a run to submit the first score.'));
    } else {
      rows.forEach((row, index) => {
        const tr = document.createElement('tr');
        const values = [
          ['#' + (index + 1)],
          [String(row.name || 'Kano Driver')],
          ['₦' + Math.floor(Number(row.score) || 0).toLocaleString('en-NG')],
          [(Number(row.distance) || 0).toFixed(2) + ' km'],
          [formatTribe(row.tribe)],
        ];
        for (const [value] of values) {
          const td = document.createElement('td');
          td.textContent = value;
          tr.append(td);
        }
        target.append(tr);
      });
    }
    setStatus(`Loaded ${rows.length} global score${rows.length === 1 ? '' : 's'} · updated ${new Date(body.serverTime || Date.now()).toLocaleTimeString('en-NG')}.`);
  } catch {
    target.replaceChildren(makeCellRow('Cannot connect to the global leaderboard.'));
    setStatus('Network unavailable. Local scores remain on this browser; queued results will retry.');
  } finally {
    refreshInFlight = false;
    const activeDialog = document.getElementById('kano-global-board-dialog');
    const latestBoard = activeDialog?.querySelector('#kano-global-board-select')?.value || 'all';
    if (activeDialog?.open && latestBoard !== board) queueMicrotask(() => void refreshBoard());
  }
}
function makeCellRow(message) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 5;
  td.textContent = message;
  tr.append(td);
  return tr;
}

function attachUi() {
  // Create early so the persistent UI exists before run-over buttons are added.
  ensureDialog();
  const rankButton = document.getElementById('rank-btn');
  if (rankButton && !rankButton.dataset.kanoGlobalBound) {
    rankButton.dataset.kanoGlobalBound = 'true';
    rankButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openDialog();
    }, true);
  }

  const overScreen = document.getElementById('over-screen');
  const overActions = overScreen?.querySelector('.menu-actions');
  if (overActions && !document.getElementById('kano-global-over-button')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'kano-global-over-button';
    button.textContent = 'VIEW GLOBAL LEADERBOARD';
    button.addEventListener('click', openDialog);
    overActions.append(button);
  }
  if (overScreen && !observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      if (!overScreen.classList.contains('hidden')) {
        void refreshBoardCompact();
      }
    });
    observer.observe(overScreen, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  document.querySelectorAll('[data-kano-global-open]').forEach((button) => {
    if (button.dataset.kanoGlobalBound) return;
    button.dataset.kanoGlobalBound = 'true';
    button.addEventListener('click', openDialog);
  });
}

async function refreshBoardCompact() {
  const overScreen = document.getElementById('over-screen');
  if (!overScreen || overScreen.classList.contains('hidden')) return;
  let compact = document.getElementById('kano-global-run-summary');
  if (!compact) {
    compact = document.createElement('details');
    compact.id = 'kano-global-run-summary';
    compact.style.cssText = 'margin:12px 0;padding:10px 12px;border:1px solid #334b63;border-radius:10px;background:#101a26;color:#edf5fb;';
    const summary = document.createElement('summary');
    summary.textContent = 'GLOBAL TOP SCORES';
    summary.style.cssText = 'cursor:pointer;font-weight:800;color:#ffda76;';
    const status = document.createElement('p');
    status.className = 'kano-global-status';
    status.dataset.kanoGlobalStatus = '';
    status.textContent = 'Loading shared scores…';
    const list = document.createElement('ol');
    list.id = 'kano-global-run-top-five';
    list.style.cssText = 'padding-left:24px;margin-bottom:0;';
    compact.append(summary, status, list);
    const standings = document.getElementById('tribe-standing');
    standings?.insertAdjacentElement('afterend', compact);
  }
  try {
    const response = await fetch('/api/leaderboard?board=all&limit=5', { cache: 'no-store', credentials: 'same-origin' });
    const body = await response.json().catch(() => ({}));
    const list = document.getElementById('kano-global-run-top-five');
    if (!response.ok || !body?.ok || !list) {
      setStatus(body?.error === 'leaderboard_not_configured' ? 'Global scores not configured on server.' : 'Global scores temporarily unavailable.');
      return;
    }
    list.replaceChildren();
    (body.rows || []).forEach((row) => {
      const item = document.createElement('li');
      item.textContent = `${row.name} — ₦${Math.floor(row.score).toLocaleString('en-NG')} · ${formatTribe(row.tribe)}`;
      list.append(item);
    });
    if (!list.children.length) {
      const item = document.createElement('li');
      item.textContent = 'No shared scores yet.';
      list.append(item);
    }
    setStatus(`Global top scores loaded · ${list.children.length} row${list.children.length === 1 ? '' : 's'}.`);
  } catch {
    setStatus('Could not reach global leaderboard; local scores are still saved.');
  }
}

function installStorageObserver() {
  const storage = globalThis.localStorage;
  if (!storage) return;
  nativeSetItem = Storage.prototype.setItem;
  const initialSave = safeJson(safeGet(SAVE_KEY), {});
  const initialSeen = Array.isArray(initialSave.lastRuns) ? initialSave.lastRuns.map(runSignature) : [];
  const existingSeen = safeJson(safeGet(SEEN_KEY), []);
  const mergedSeen = [...new Set([...(Array.isArray(existingSeen) ? existingSeen : []), ...initialSeen])].slice(-300);
  safeSet(SEEN_KEY, JSON.stringify(mergedSeen));
  const prototype = Storage.prototype;
  if (prototype.__kanoGlobalLeaderboardHook) return;
  const original = prototype.setItem;
  nativeSetItem = original;
  Object.defineProperty(prototype, '__kanoGlobalLeaderboardHook', { value: true, configurable: false });
  prototype.setItem = function kanoLeaderboardSetItem(key, value) {
    const result = original.call(this, key, value);
    try {
      if (this === globalThis.localStorage && key === SAVE_KEY && typeof value === 'string') {
        const parsed = safeJson(value, null);
        if (parsed) queueMicrotask(() => enqueueCompletedRuns(parsed));
      }
    } catch { /* A cloud-sync hook must never break local save writes. */ }
    return result;
  };
  // Also seed the existing record signatures so historical local scores aren't
  // accidentally presented as fresh cloud submissions after installing this.
  if (initialSeen.length) safeSet(SEEN_KEY, JSON.stringify(mergedSeen));
}

export function installGlobalLeaderboardBridge() {
  try {
    installStorageObserver();
    ensureSessionId();
    attachUi();
    window.addEventListener('online', () => void flushQueue());
    window.addEventListener('focus', () => void flushQueue());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void flushQueue();
    });
    window.addEventListener('kano:global-score-submitted', () => {
      if (document.getElementById('kano-global-board-dialog')?.open) void refreshBoard();
      void refreshBoardCompact();
    });
    retryTimer = setInterval(() => void flushQueue(), 30_000);
    setQueueStatus();
    void flushQueue();
    console.info('[Kano Life] Global leaderboard bridge initialized.');
  } catch (error) {
    console.warn('[Kano Life] Global leaderboard bridge unavailable; local gameplay is unaffected.', error);
  }
}

// Auto-install because this file is loaded as a dedicated module from index.html.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installGlobalLeaderboardBridge, { once: true });
  } else {
    installGlobalLeaderboardBridge();
  }
}
