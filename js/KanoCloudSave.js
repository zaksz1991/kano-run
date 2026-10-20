/**
 * KANO LIFE — ACCOUNT-BACKED CLOUD SAVE
 *
 * Uses Supabase Auth + PostgREST with the public anon/publishable key and
 * row-level security. No service_role key is used in the browser.
 * Local saves stay available when cloud sync is not configured or offline.
 */
import { save, persist, normaliseSave } from './storage.js';

const CONFIG_KEY = 'kano-life-cloud-config-v1';
const SESSION_KEY = 'kano-life-cloud-session-v1';
const USER_KEY = 'kano-life-cloud-user-v1';
const TABLE = 'kano_life_cloud_saves';
const PROBE_TABLE = 'kano_life_cloud_save_probes';
const LINK_KEY_PREFIX = 'kano-life-cloud-link-v1-';
const MAX_BACKUP_BYTES = 1_000_000;

let panel = null;
let ui = {};
let config = readJson(CONFIG_KEY, null);
let session = readJson(SESSION_KEY, null);
let user = readJson(USER_KEY, null);
let remoteRevision = null;
let cloudReady = false;
let pausedForConflict = false;
let restoring = false;
let syncTimer = null;
let syncInFlight = false;
let syncQueued = false;
let lastStatus = '';
let remoteSnapshot = null;
let writeProbeInFlight = false;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
function clearKey(key) { try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ } }
function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function readableDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'not available';
}
function localSummary(data = save) {
  return `₦${Math.max(0, Number(data?.money) || 0).toLocaleString()} banked · best ${Math.max(0, Number(data?.highScore) || 0).toLocaleString()} · ${(data?.achievements || []).length} achievements`;
}
function setStatus(message, tone = 'normal') {
  lastStatus = message;
  if (ui.status) {
    ui.status.textContent = message;
    ui.status.dataset.tone = tone;
  }
  if (ui.syncStatus) ui.syncStatus.textContent = message;
  console.info(`[Kano Cloud Save] ${message}`);
}
function savedConfigUrl() {
  const value = String(config?.url || '').trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol)) return '';
    return parsed.origin;
  } catch { return ''; }
}
function savedAnonKey() { return String(config?.anonKey || '').trim(); }
function configured() { return Boolean(savedConfigUrl() && savedAnonKey()); }
function saveConfigFromForm() {
  const url = String(ui.url?.value || '').trim().replace(/\/+$/, '');
  const anonKey = String(ui.anonKey?.value || '').trim();
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Use an https:// Supabase project URL.');
    if (!anonKey || anonKey.length < 20) throw new Error('Paste the Supabase anon/publishable key. Do not use the service_role key.');
    config = { url: parsed.origin, anonKey };
    if (!writeJson(CONFIG_KEY, config)) throw new Error('Browser storage could not save the cloud configuration.');
    setStatus('Supabase configuration saved on this device. Sign in or create an account.', 'success');
    return true;
  } catch (error) {
    setStatus(error.message || 'Invalid Supabase configuration.', 'error');
    return false;
  }
}
function publicHeaders(extra = {}) {
  // Public Auth requests need the API key header but no bearer token. Omitting
  // Authorization here supports both legacy anon JWT keys and newer
  // sb_publishable_ keys. Authenticated database calls use the user's JWT.
  return {
    apikey: savedAnonKey(),
    'Content-Type': 'application/json',
    ...extra,
  };
}
function sessionHeaders(extra = {}) {
  if (!session?.access_token) throw new Error('Sign in to the cloud save first.');
  return {
    apikey: savedAnonKey(),
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
async function requestJson(path, options = {}, auth = 'public', retry = true) {
  if (!configured()) throw new Error('Enter your Supabase Project URL and anon/publishable key first.');
  const headers = { ...(auth === 'session' ? sessionHeaders(options.headers) : publicHeaders(options.headers)) };
  const response = await fetch(`${savedConfigUrl()}${path}`, { ...options, headers });
  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (response.status === 401 && auth === 'session' && retry && await refreshSession()) {
    return requestJson(path, options, auth, false);
  }
  if (!response.ok) {
    const message = typeof payload?.message === 'string'
      ? payload.message
      : typeof payload?.msg === 'string'
        ? payload.msg
        : typeof payload?.error_description === 'string'
          ? payload.error_description
          : typeof payload?.error === 'string'
            ? payload.error
            : `Request failed (${response.status}).`;
    throw new Error(message.slice(0, 260));
  }
  return payload;
}
function persistSession(next) {
  if (!next || typeof next.access_token !== 'string' || typeof next.refresh_token !== 'string') return false;
  session = {
    access_token: next.access_token,
    refresh_token: next.refresh_token,
    token_type: next.token_type || 'bearer',
    expires_at: Number(next.expires_at) || Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600),
    user: next.user || session?.user || null,
  };
  user = session.user || user;
  writeJson(SESSION_KEY, session);
  writeJson(USER_KEY, user);
  updateAccountDisplay();
  return true;
}
async function refreshSession() {
  if (!configured() || !session?.refresh_token) return false;
  try {
    const next = await requestJson('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }, 'public', false);
    return persistSession(next);
  } catch (error) {
    setStatus(`Cloud session expired. Sign in again. (${error.message})`, 'warning');
    clearKey(SESSION_KEY); clearKey(USER_KEY); session = null; user = null;
    updateAccountDisplay();
    return false;
  }
}
async function ensureFreshSession() {
  if (!session?.access_token) throw new Error('Sign in to your cloud account first.');
  if (Number(session.expires_at) < Math.floor(Date.now() / 1000) + 90) {
    if (!await refreshSession()) throw new Error('Your cloud session expired. Sign in again.');
  }
  if (session.user?.id) return session.user;
  const profile = await requestJson('/auth/v1/user', { method: 'GET' }, 'session');
  user = profile;
  session.user = profile;
  writeJson(SESSION_KEY, session); writeJson(USER_KEY, user);
  return user;
}
async function signUp() {
  if (!saveConfigFromForm()) return;
  const email = String(ui.email?.value || '').trim();
  const password = String(ui.password?.value || '');
  if (!email || !email.includes('@') || password.length < 6) {
    setStatus('Enter a valid email address and password of at least 6 characters.', 'error'); return;
  }
  setStatus('Creating account…');
  try {
    const result = await requestJson('/auth/v1/signup', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }, 'public');
    if (result?.access_token && result?.refresh_token) {
      persistSession(result);
      if (ui.password) ui.password.value = '';
      await afterAuthentication();
    } else {
      if (ui.password) ui.password.value = '';
      setStatus('Account request received. Check your email for confirmation, then sign in here.', 'success');
    }
  } catch (error) { setStatus(`Account creation failed: ${error.message}`, 'error'); }
}
async function signIn() {
  if (!saveConfigFromForm()) return;
  const email = String(ui.email?.value || '').trim();
  const password = String(ui.password?.value || '');
  if (!email || !password) { setStatus('Enter your email and password.', 'error'); return; }
  setStatus('Signing in…');
  try {
    const result = await requestJson('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }, 'public');
    persistSession(result);
    if (ui.password) ui.password.value = '';
    await afterAuthentication();
  } catch (error) { setStatus(`Sign-in failed: ${error.message}`, 'error'); }
}
async function signOut() {
  try {
    if (session?.access_token && configured()) {
      await requestJson('/auth/v1/logout', { method: 'POST' }, 'session');
    }
  } catch { /* Local sign-out must still work if network is unavailable. */ }
  session = null; user = null; remoteRevision = null; remoteSnapshot = null;
  cloudReady = false; pausedForConflict = false;
  clearKey(SESSION_KEY); clearKey(USER_KEY);
  updateAccountDisplay();
  setStatus('Signed out. Your local save remains on this device.', 'normal');
}
function updateAccountDisplay() {
  const email = user?.email || session?.user?.email || '';
  if (ui.account) ui.account.textContent = email ? `SIGNED IN · ${email}` : 'NOT SIGNED IN';
  if (ui.signIn) ui.signIn.hidden = Boolean(email);
  if (ui.signUp) ui.signUp.hidden = Boolean(email);
  if (ui.signOut) ui.signOut.hidden = !email;
  if (ui.syncActions) ui.syncActions.hidden = !email;
  if (ui.email) ui.email.value = ui.email.value || email;
}
function cloneSave(data = save) { return JSON.parse(JSON.stringify(data)); }
function linkKey(userId) { return `${LINK_KEY_PREFIX}${userId}`; }
function readLink(userId) {
  return userId ? readJson(linkKey(userId), null) : null;
}
async function fingerprint(data) {
  const text = JSON.stringify(data);
  try {
    if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) { /* Use a non-security comparison hash for older browsers. */ }
  // Fallback is only for detecting accidental divergence, never for security.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return `${text.length.toString(16)}-${first.toString(16)}-${second.toString(16)}`;
}
async function writeLinkBaseline(userId, data, revision) {
  const hash = await fingerprint(data);
  writeJson(linkKey(userId), { userId, hash, revision: Number(revision) || 1, savedAt: Date.now() });
  return hash;
}
async function fetchCloudRow() {
  const activeUser = await ensureFreshSession();
  const query = `?select=user_id,save_data,revision,updated_at&user_id=eq.${encodeURIComponent(activeUser.id)}&limit=1`;
  const rows = await requestJson(`/rest/v1/${TABLE}${query}`, { method: 'GET' }, 'session');
  const row = Array.isArray(rows) ? rows[0] || null : null;
  remoteSnapshot = row;
  remoteRevision = row ? Number(row.revision) || 1 : null;
  return row;
}
function showCloudChoice(row) {
  pausedForConflict = true;
  cloudReady = false;
  ui.choice?.removeAttribute('hidden');
  ui.cloudSummary.textContent = row
    ? `Cloud updated ${readableDate(row.updated_at)} · ${localSummary(row.save_data)} · revision ${row.revision}`
    : 'This account does not have a cloud save yet.';
  ui.localSummary.textContent = `This device · ${localSummary(save)}`;
  ui.choiceTitle.textContent = row ? 'Choose which save to keep' : 'Create your first cloud save';
  ui.download.hidden = !row;
  ui.overwrite.textContent = row ? 'UPLOAD THIS DEVICE (OVERWRITE CLOUD)' : 'CREATE CLOUD SAVE FROM THIS DEVICE';
}
async function restoreCloudRow(row, { prompt = true } = {}) {
  if (!row?.save_data) throw new Error('No saved cloud record was returned.');
  if (prompt && !window.confirm('Replace the save on this device with the cloud save? The current local save will be exported as a JSON backup first.')) return false;
  if (prompt) exportData(cloneSave(), `kano-life-before-cloud-restore-${Date.now()}.json`);
  restoring = true;
  try {
    const normalized = normaliseSave(row.save_data);
    Object.keys(save).forEach((key) => delete save[key]);
    Object.assign(save, normalized);
    const ok = persist();
    if (!ok) throw new Error('The downloaded save could not be written to this browser.');
  } finally { restoring = false; }
  remoteRevision = Number(row.revision) || 1;
  remoteSnapshot = row;
  const activeUser = await ensureFreshSession();
  await writeLinkBaseline(activeUser.id, cloneSave(), remoteRevision);
  setSyncReady('Cloud save restored to this device. Automatic sync is active.');
  refreshSummary();
  return true;
}
async function reconcileLinkedSave(row) {
  const activeUser = await ensureFreshSession();
  if (!row) {
    showCloudChoice(null);
    setStatus('No cloud save exists yet. Create one from this device to enable sync.', 'normal');
    return;
  }
  const baseline = readLink(activeUser.id);
  // First link or a different account on this device: never silently choose.
  if (!baseline?.hash || baseline.userId !== activeUser.id) {
    showCloudChoice(row);
    setStatus('Cloud save found. Choose which copy to keep before automatic sync begins.', 'warning');
    return;
  }
  const localHash = await fingerprint(cloneSave());
  const cloudHash = await fingerprint(normaliseSave(row.save_data));
  if (localHash === cloudHash) {
    remoteSnapshot = row;
    remoteRevision = Number(row.revision) || 1;
    await writeLinkBaseline(activeUser.id, cloneSave(), remoteRevision);
    setSyncReady('This device and cloud save match. Automatic sync is active.');
    refreshSummary();
    return;
  }
  if (localHash === baseline.hash && cloudHash !== baseline.hash) {
    // Only cloud changed since the last common save, so restoring is safe.
    await restoreCloudRow(row, { prompt: false });
    return;
  }
  if (cloudHash === baseline.hash && localHash !== baseline.hash) {
    // Only the local copy changed. A revision-conditional update protects a
    // cloud write that races this upload.
    remoteSnapshot = row;
    remoteRevision = Number(row.revision) || 1;
    const uploaded = await conditionalUpdate(cloneSave());
    if (uploaded) setSyncReady('Local progress uploaded. Automatic cloud sync is active.');
    return;
  }
  showCloudChoice(row);
  setStatus('Both this device and cloud changed since the last sync. Choose which copy to keep; neither was overwritten.', 'warning');
}
async function afterAuthentication() {
  updateAccountDisplay();
  setStatus('Signed in. Checking your cloud save…');
  try {
    const row = await fetchCloudRow();
    await reconcileLinkedSave(row);
  } catch (error) {
    setStatus(`Signed in, but cloud save could not be read: ${error.message}`, 'error');
  }
}
function setSyncReady(message) {
  cloudReady = true;
  pausedForConflict = false;
  ui.choice?.setAttribute('hidden', '');
  setStatus(message, 'success');
}
async function upsertNew(data) {
  const activeUser = await ensureFreshSession();
  const body = { user_id: activeUser.id, save_data: data, revision: 1, updated_at: new Date().toISOString() };
  try {
    const result = await requestJson(`/rest/v1/${TABLE}`, {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
    }, 'session');
    remoteRevision = Number(result?.[0]?.revision) || 1;
    remoteSnapshot = result?.[0] || { ...body };
    await writeLinkBaseline(activeUser.id, data, remoteRevision);
    return true;
  } catch (error) {
    if (/duplicate|already exists|unique/i.test(error.message)) {
      const latest = await fetchCloudRow();
      showCloudChoice(latest);
      setStatus('Another session created the cloud save first. Choose which save to keep.', 'warning');
      return false;
    }
    throw error;
  }
}
async function conditionalUpdate(data) {
  const activeUser = await ensureFreshSession();
  if (remoteRevision == null) return upsertNew(data);
  const nextRevision = remoteRevision + 1;
  const query = `?user_id=eq.${encodeURIComponent(activeUser.id)}&revision=eq.${encodeURIComponent(remoteRevision)}&select=revision,updated_at`;
  const body = { save_data: data, revision: nextRevision, updated_at: new Date().toISOString() };
  const result = await requestJson(`/rest/v1/${TABLE}${query}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
  }, 'session');
  if (!Array.isArray(result) || result.length === 0) {
    const latest = await fetchCloudRow();
    showCloudChoice(latest);
    setStatus('Cloud save changed on another device. Automatic sync paused to protect both copies. Choose which copy to keep.', 'warning');
    return false;
  }
  remoteRevision = Number(result[0].revision) || nextRevision;
  remoteSnapshot = { user_id: activeUser.id, save_data: data, revision: remoteRevision, updated_at: result[0].updated_at };
  await writeLinkBaseline(activeUser.id, data, remoteRevision);
  return true;
}
async function uploadLocal(force = false) {
  if (!session?.access_token) { setStatus('Sign in before uploading a cloud save.', 'error'); return; }
  setStatus('Uploading this device’s complete save…');
  try {
    const row = force ? remoteSnapshot : await fetchCloudRow();
    if (!row) {
      const created = await upsertNew(cloneSave());
      if (!created) return;
    } else {
      remoteRevision = Number(row.revision) || 1;
      const updated = await conditionalUpdate(cloneSave());
      if (!updated) return;
    }
    setSyncReady('Upload complete. This account will now sync local saves automatically.');
    refreshSummary();
  } catch (error) { setStatus(`Upload failed: ${error.message}`, 'error'); }
}
async function downloadCloud() {
  if (!session?.access_token) { setStatus('Sign in before downloading a cloud save.', 'error'); return; }
  try {
    const row = await fetchCloudRow();
    if (!row?.save_data) { setStatus('No cloud save exists to download.', 'error'); return; }
    await restoreCloudRow(row, { prompt: true });
  } catch (error) {
    restoring = false;
    setStatus(`Download failed: ${error.message}`, 'error');
  }
}
async function syncNow() {
  if (!session?.access_token) { setStatus('Sign in first.', 'error'); return; }
  if (pausedForConflict) { setStatus('Resolve the save conflict first.', 'warning'); return; }
  if (syncInFlight) { syncQueued = true; return; }
  syncInFlight = true;
  try {
    const ok = await conditionalUpdate(cloneSave());
    if (ok) setStatus(`Cloud save synchronized · ${new Date().toLocaleTimeString()}`, 'success');
  } catch (error) {
    setStatus(`Cloud sync failed; local progress is still available: ${error.message}`, 'error');
  } finally {
    syncInFlight = false;
    refreshSummary();
    if (syncQueued && cloudReady && !pausedForConflict) {
      syncQueued = false;
      scheduleSync(300);
    }
  }
}
function scheduleSync(delay = 1800) {
  if (!session?.access_token || !cloudReady || pausedForConflict || restoring) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}
function refreshSummary() {
  if (ui.localSummary) ui.localSummary.textContent = `This device · ${localSummary(save)}`;
  if (ui.cloudSummary && remoteSnapshot) {
    ui.cloudSummary.textContent = `Cloud updated ${readableDate(remoteSnapshot.updated_at)} · ${localSummary(remoteSnapshot.save_data)} · revision ${remoteRevision}`;
  }
}
function exportData(data, filename = `kano-life-save-${new Date().toISOString().slice(0, 10)}.json`) {
  const backup = { app: 'Kano Life', schemaVersion: 1, exportedAt: new Date().toISOString(), save: data };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}
function importLocalBackup(file) {
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) { setStatus('Backup is too large (maximum 1 MB).', 'error'); return; }
  const reader = new FileReader();
  reader.onerror = () => setStatus('Could not read that backup file.', 'error');
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ''));
      const raw = parsed?.app === 'Kano Life' ? parsed.save : parsed;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This is not a Kano Life save file.');
      if (!window.confirm('Replace this device’s save with the selected backup? The current save will be exported first.')) return;
      exportData(cloneSave(), `kano-life-before-import-${Date.now()}.json`);
      restoring = true;
      const normalized = normaliseSave(raw);
      Object.keys(save).forEach((key) => delete save[key]);
      Object.assign(save, normalized);
      const ok = persist();
      restoring = false;
      if (!ok) throw new Error('The imported save could not be stored by this browser.');
      if (cloudReady) scheduleSync(250);
      refreshSummary();
      setStatus('Backup imported locally. Cloud sync will send it if an account is linked.', 'success');
    } catch (error) { restoring = false; setStatus(`Import failed: ${error.message}`, 'error'); }
  };
  reader.readAsText(file);
}
function appendDiagnosticResult(titleText, detailText, tone = 'normal') {
  const container = ui.diagnosticResults;
  if (!container) return;
  container.hidden = false;
  let list = container.querySelector('.kcs-diagnostics-list');
  if (!list) {
    list = document.createElement('div');
    list.className = 'kcs-diagnostics-list';
    container.replaceChildren(list);
  }
  const item = document.createElement('div');
  item.className = 'kcs-diagnostic-item';
  item.dataset.tone = tone;
  const title = document.createElement('strong');
  title.textContent = `${tone === 'success' ? '✓' : tone === 'error' ? '✕' : '!'} ${titleText}`;
  const detail = document.createElement('p');
  detail.textContent = detailText;
  item.append(title, detail);
  list.prepend(item);
}

/**
 * Verifies authenticated INSERT + SELECT + DELETE using a dedicated table.
 * It never touches the real cloud save row or the local game save.
 */
async function runCloudWriteProbe() {
  if (writeProbeInFlight) return;
  if (!configured()) {
    const message = 'Save your Supabase project URL and public anon/publishable key first.';
    appendDiagnosticResult('Cloud write test', message, 'warning');
    setStatus(message, 'warning');
    return;
  }
  if (!session?.access_token) {
    const message = 'Sign in to your cloud account before testing database write permissions.';
    appendDiagnosticResult('Cloud write test', message, 'warning');
    setStatus(message, 'warning');
    return;
  }

  writeProbeInFlight = true;
  if (ui.writeProbeButton) ui.writeProbeButton.disabled = true;
  setStatus('Testing a temporary cloud probe record. Your game save and wallet will not be changed…', 'normal');

  let activeUserId = '';
  let probeId = '';
  let wrote = false;
  let readBack = false;
  let deleted = false;
  let testError = null;
  let cleanupError = null;

  try {
    const activeUser = await ensureFreshSession();
    activeUserId = String(activeUser?.id || '');
    if (!activeUserId) throw new Error('Supabase did not return the signed-in user ID.');

    probeId = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `probe-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

    const row = {
      probe_id: probeId,
      user_id: activeUserId,
      checked_at: new Date().toISOString(),
    };

    // Do not request a representation on INSERT: the separate SELECT below
    // independently tests read access rather than making INSERT depend on it.
    await requestJson(`/rest/v1/${PROBE_TABLE}`, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    }, 'session');
    wrote = true;

    const query = `?select=probe_id,checked_at&user_id=eq.${encodeURIComponent(activeUserId)}&probe_id=eq.${encodeURIComponent(probeId)}&limit=1`;
    const rows = await requestJson(`/rest/v1/${PROBE_TABLE}${query}`, { method: 'GET' }, 'session');
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.probe_id !== probeId) {
      throw new Error('The inserted probe could not be read back with the signed-in account. Check SELECT grants and row-level security policies.');
    }
    readBack = true;
  } catch (error) {
    testError = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (wrote && activeUserId && probeId) {
      try {
        const filter = `?user_id=eq.${encodeURIComponent(activeUserId)}&probe_id=eq.${encodeURIComponent(probeId)}`;
        await requestJson(`/rest/v1/${PROBE_TABLE}${filter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, 'session');
        const remaining = await requestJson(`/rest/v1/${PROBE_TABLE}?select=probe_id&user_id=eq.${encodeURIComponent(activeUserId)}&probe_id=eq.${encodeURIComponent(probeId)}&limit=1`, { method: 'GET' }, 'session');
        if (!Array.isArray(remaining) || remaining.some((entry) => entry?.probe_id === probeId)) {
          throw new Error('DELETE returned but the temporary probe still exists. Check the DELETE grant and row-level security policy.');
        }
        deleted = true;
      } catch (error) {
        cleanupError = error instanceof Error ? error : new Error(String(error));
      }
    }
    writeProbeInFlight = false;
    if (ui.writeProbeButton) ui.writeProbeButton.disabled = false;
  }

  if (testError) {
    const cleanup = cleanupError ? ` Cleanup also failed: ${cleanupError.message}.` : '';
    const message = `${testError.message} Check that supabase/kano_life_cloud_write_probes.sql was run and that the authenticated table grants/policies exist.${cleanup}`;
    appendDiagnosticResult('Cloud write/read test failed', message, 'error');
    setStatus(`Cloud write test failed: ${testError.message}`, 'error');
    return;
  }

  if (wrote && readBack && deleted && !cleanupError) {
    const message = 'Authenticated INSERT, SELECT and DELETE all passed. The temporary diagnostic row was removed; your local and cloud game-save records were not modified.';
    appendDiagnosticResult('Cloud write/read test passed', message, 'success');
    setStatus('Cloud write verification passed. Actual saves will still sync through the normal revision-checked flow.', 'success');
    return;
  }

  const message = cleanupError
    ? `The probe could be written and read, but its temporary row could not be confirmed deleted: ${cleanupError.message}. It contains only a diagnostic ID and timestamp, not game-save data.`
    : 'The cloud write test did not complete all required operations.';
  appendDiagnosticResult('Cloud write/read test needs attention', message, 'warning');
  setStatus(message, 'warning');
}

async function runDiagnostics() {
  const checks = [];
  const addCheck = (title, detail, tone = 'success') => checks.push({ title, detail, tone });
  if (ui.diagnosticsButton) ui.diagnosticsButton.disabled = true;
  if (ui.diagnosticResults) {
    ui.diagnosticResults.hidden = false;
    ui.diagnosticResults.replaceChildren();
  }
  setStatus('Checking local save, network, account session and cloud table…', 'normal');

  // 1. Verify this browser can write and read a disposable diagnostic key.
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') {
      throw new Error('Browser localStorage is unavailable.');
    }
    const probe = `kano-life-health-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(probe, 'verified');
    const verified = storage.getItem(probe) === 'verified';
    storage.removeItem(probe);
    if (!verified) throw new Error('The test value did not match after writing.');
    addCheck('Browser storage', 'Read/write test passed. The test value was removed.', 'success');
  } catch (error) {
    addCheck('Browser storage', error?.message || 'The browser could not verify a local write.', 'error');
  }

  // 2. Inspect the game's saved file without modifying it.
  try {
    const raw = globalThis.localStorage?.getItem('kano-life-save-v4');
    if (!raw) {
      addCheck('Local game save', 'No kano-life-save-v4 record exists yet. Start the game and make a successful save.', 'warning');
    } else {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Saved data is not a save object.');
      const money = Math.max(0, Number(parsed.money) || 0);
      const best = Math.max(0, Number(parsed.highScore) || 0);
      const achievements = Array.isArray(parsed.achievements) ? parsed.achievements.length : 0;
      const runs = Array.isArray(parsed.lastRuns) ? parsed.lastRuns.length : 0;
      const transactions = Array.isArray(parsed.banking?.transactions) ? parsed.banking.transactions.length : 0;
      addCheck('Local game save', `Readable save found · ₦${money.toLocaleString()} banked · best ${best.toLocaleString()} · ${achievements} achievements · ${runs} recent runs · ${transactions} banking records.`, 'success');
    }
  } catch (error) {
    addCheck('Local game save', `Saved data could not be parsed: ${error?.message || 'invalid JSON'}`, 'error');
  }

  // 3. Browser/network and configuration checks.
  if (globalThis.navigator && navigator.onLine === false) {
    addCheck('Network', 'This browser reports offline. Cloud tests were skipped.', 'warning');
  } else {
    addCheck('Network', 'Browser reports an online connection. This does not by itself prove that Supabase is reachable.', 'success');
  }

  if (!configured()) {
    addCheck('Supabase configuration', 'Project URL and public anon/publishable key are not both saved. Cloud sync cannot run yet.', 'warning');
    addCheck('Cloud account and table', 'Skipped until Supabase configuration and sign-in are complete.', 'warning');
  } else if (globalThis.navigator && navigator.onLine === false) {
    addCheck('Supabase configuration', `A project URL and public key are saved for ${savedConfigUrl()}.`, 'success');
    addCheck('Cloud account and table', 'Skipped while offline. Your local save remains available.', 'warning');
  } else {
    addCheck('Supabase configuration', `Project URL and public key are saved for ${savedConfigUrl()}. The key value is not displayed.`, 'success');
    if (!session?.access_token) {
      addCheck('Cloud account', 'No signed-in cloud session exists on this device. Sign in through the Cloud Save panel to test account access.', 'warning');
      addCheck('Cloud save table', 'Skipped until an account is signed in.', 'warning');
    } else {
      try {
        const profile = await requestJson('/auth/v1/user', { method: 'GET' }, 'session');
        const activeUserId = String(profile?.id || session?.user?.id || '');
        if (!activeUserId) throw new Error('Supabase did not return an authenticated user ID.');
        user = profile;
        if (session) session.user = profile;
        writeJson(USER_KEY, user);
        if (session) writeJson(SESSION_KEY, session);
        updateAccountDisplay();
        addCheck('Cloud account', `Authenticated session verified${profile.email ? ` for ${profile.email}` : ''}.`, 'success');
        try {
          const query = `?select=user_id,revision,updated_at&user_id=eq.${encodeURIComponent(activeUserId)}&limit=1`;
          const rows = await requestJson(`/rest/v1/${TABLE}${query}`, { method: 'GET' }, 'session');
          if (!Array.isArray(rows)) throw new Error('The cloud table returned an unexpected response.');
          if (!rows.length) {
            addCheck('Cloud save table', 'The table is accessible under this account, but no cloud save exists yet. Use UPLOAD THIS DEVICE to create one.', 'warning');
          } else {
            const row = rows[0];
            const revision = Number(row.revision) || 1;
            addCheck('Cloud save table', `Read access passed · revision ${revision} · last updated ${readableDate(row.updated_at)}.`, 'success');
          }
        } catch (error) {
          addCheck('Cloud save table', `Could not read ${TABLE}: ${error?.message || 'request failed'}. Check that the SQL schema ran successfully and RLS policies/grants are present.`, 'error');
        }
        const baseline = readLink(activeUserId);
        if (cloudReady && !pausedForConflict) {
          addCheck('Automatic sync', 'Active in this session. Local successful saves are debounced before upload.', 'success');
        } else if (pausedForConflict) {
          addCheck('Automatic sync', 'Paused because the local and cloud saves need an explicit conflict choice.', 'warning');
        } else if (baseline?.userId === activeUserId && baseline?.hash) {
          addCheck('Automatic sync', 'A prior link exists, but sync is not active in memory. Reopen Cloud Save and synchronize or resolve any choice shown.', 'warning');
        } else {
          addCheck('Automatic sync', 'Not active yet. Choose USE CLOUD SAVE or UPLOAD THIS DEVICE when prompted to link the two copies.', 'warning');
        }
      } catch (error) {
        addCheck('Cloud account', `Session validation failed: ${error?.message || 'request failed'}. Sign in again if the session has expired.`, 'error');
        addCheck('Cloud save table', 'Skipped because account validation failed.', 'warning');
      }
    }
  }

  if (ui.diagnosticResults) {
    const list = document.createElement('div');
    list.className = 'kcs-diagnostics-list';
    for (const check of checks) {
      const item = document.createElement('div');
      item.className = 'kcs-diagnostic-item';
      item.dataset.tone = check.tone;
      const title = document.createElement('strong');
      title.textContent = `${check.tone === 'success' ? '✓' : check.tone === 'error' ? '✕' : '!' } ${check.title}`;
      const detail = document.createElement('p');
      detail.textContent = check.detail;
      item.append(title, detail);
      list.appendChild(item);
    }
    ui.diagnosticResults.replaceChildren(list);
  }

  const errors = checks.filter((check) => check.tone === 'error').length;
  const warnings = checks.filter((check) => check.tone === 'warning').length;
  setStatus(
    errors ? `Cloud save health check finished with ${errors} error(s). Read the results below.`
      : warnings ? `Health check completed with ${warnings} item(s) requiring attention. Read the results below.`
        : 'Cloud save health checks passed.',
    errors ? 'error' : warnings ? 'warning' : 'success'
  );
  if (ui.diagnosticsButton) ui.diagnosticsButton.disabled = false;
  refreshSummary();
}

function buildPanel() {
  if (panel || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    #kano-cloud-save-panel[hidden]{display:none!important}
    #kano-cloud-save-panel{position:fixed;inset:0;z-index:100050;display:flex;align-items:center;justify-content:center;padding:10px;background:rgba(3,9,18,.78);backdrop-filter:blur(7px);font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#edf5ff}
    #kano-cloud-save-panel .kcs-card{width:min(690px,100%);max-height:min(92dvh,900px);overflow:auto;background:#101d30;border:1px solid #3b5573;border-radius:18px;box-shadow:0 18px 70px #000a;padding:clamp(14px,3vw,24px)}
    #kano-cloud-save-panel .kcs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
    #kano-cloud-save-panel h2{font-size:clamp(20px,4vw,28px);margin:0;color:#f5c542}
    #kano-cloud-save-panel p{line-height:1.45;color:#c5d1e0;margin:7px 0 12px;font-size:13px}
    #kano-cloud-save-panel .kcs-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    #kano-cloud-save-panel label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:#bfcee0;min-width:0}
    #kano-cloud-save-panel input{width:100%;min-width:0;box-sizing:border-box;padding:11px;border-radius:9px;border:1px solid #40536b;background:#071321;color:#fff;font:inherit}
    #kano-cloud-save-panel button{border:1px solid #4a627c;border-radius:10px;padding:10px 12px;background:#1b2d43;color:#f4f7fb;font-size:12px;font-weight:800;cursor:pointer;touch-action:manipulation}
    #kano-cloud-save-panel button.primary{background:#f5c542;color:#182235;border-color:#ffe291}
    #kano-cloud-save-panel button.danger{background:#401e29;border-color:#87374a}
    #kano-cloud-save-panel button:disabled{opacity:.55;cursor:wait}
    #kano-cloud-save-panel .kcs-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    #kano-cloud-save-panel .kcs-status{background:#071321;border:1px solid #34485f;border-radius:10px;padding:11px;margin:12px 0;color:#e0e9f5;font-size:13px;overflow-wrap:anywhere}
    #kano-cloud-save-panel .kcs-status[data-tone=success]{border-color:#287b62;color:#aaf0d8}
    #kano-cloud-save-panel .kcs-status[data-tone=warning]{border-color:#886d2d;color:#ffe09a}
    #kano-cloud-save-panel .kcs-status[data-tone=error]{border-color:#8d3b45;color:#ffb9bf}
    #kano-cloud-save-panel .kcs-info{background:#15243a;border:1px solid #2f4764;border-radius:10px;padding:10px;margin:9px 0;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
    #kano-cloud-save-panel .kcs-diagnostics{margin-top:8px}
    #kano-cloud-save-panel .kcs-diagnostics-list{display:grid;gap:8px;margin-top:8px}
    #kano-cloud-save-panel .kcs-diagnostic-item{padding:10px;border:1px solid #34485f;border-radius:9px;background:#0b1625}
    #kano-cloud-save-panel .kcs-diagnostic-item[data-tone=success]{border-color:#287b62}
    #kano-cloud-save-panel .kcs-diagnostic-item[data-tone=warning]{border-color:#886d2d}
    #kano-cloud-save-panel .kcs-diagnostic-item[data-tone=error]{border-color:#8d3b45}
    #kano-cloud-save-panel .kcs-diagnostic-item strong{font-size:12px;letter-spacing:.02em}
    #kano-cloud-save-panel .kcs-diagnostic-item p{margin:5px 0 0;font-size:12px}
    #kano-cloud-save-panel .kcs-info strong{color:#f5c542}
    #kano-cloud-save-panel .kcs-close{font-size:19px;padding:3px 11px}
    #kano-cloud-save-panel [hidden]{display:none!important}
    @media(max-width:500px){#kano-cloud-save-panel{padding:6px}#kano-cloud-save-panel .kcs-grid{grid-template-columns:1fr}#kano-cloud-save-panel .kcs-actions button{flex:1 1 42%}#kano-cloud-save-panel .kcs-card{max-height:95dvh}}
  `;
  document.head.appendChild(style);
  panel = document.createElement('section');
  panel.id = 'kano-cloud-save-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'kcs-title');
  panel.innerHTML = `
    <div class="kcs-card">
      <div class="kcs-head"><div><p class="eyebrow">KANO LIFE · ACCOUNT & PROGRESSION</p><h2 id="kcs-title">Cloud Save & Recovery</h2></div><button class="kcs-close" id="kcs-close" type="button" aria-label="Close cloud save">×</button></div>
      <p>Link this device to an account so banked cash, achievements, unlocks, scores, language challenges, settings and saved run checkpoints can follow you to another device. Local saving keeps working when cloud sync is unavailable.</p>
      <div class="kcs-grid">
        <label>Supabase Project URL<input id="kcs-url" type="url" inputmode="url" autocomplete="url" placeholder="https://your-project.supabase.co"></label>
        <label>Supabase anon / publishable key<input id="kcs-anon" type="password" autocomplete="off" placeholder="Public anon / publishable key"></label>
      </div>
      <div class="kcs-actions"><button id="kcs-config" type="button">SAVE CLOUD CONFIG</button></div>
      <div class="kcs-grid">
        <label>Email<input id="kcs-email" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <label>Password<input id="kcs-password" type="password" autocomplete="current-password" minlength="6" placeholder="Account password"></label>
      </div>
      <div class="kcs-actions"><button class="primary" id="kcs-signin" type="button">SIGN IN</button><button id="kcs-signup" type="button">CREATE ACCOUNT</button><button class="danger" id="kcs-signout" type="button" hidden>SIGN OUT</button></div>
      <div class="kcs-info"><strong id="kcs-account">NOT SIGNED IN</strong><br><span>Only your authenticated account can access its own cloud save. Never enter a service_role or secret key here.</span></div>
      <div class="kcs-status" id="kcs-status" role="status" aria-live="polite">Cloud save is optional. Configure Supabase and sign in to enable cross-device sync.</div>
      <div class="kcs-diagnostics"><div class="kcs-actions"><button id="kcs-diagnostics-button" type="button">TEST CLOUD SAVE HEALTH</button><button id="kcs-write-probe-button" type="button">TEST CLOUD WRITE + READ</button></div><div id="kcs-diagnostic-results" hidden aria-live="polite"></div></div>
      <div class="kcs-info" id="kcs-sync-actions" hidden>
        <strong>Current progress</strong>
        <div id="kcs-local-summary" style="margin:6px 0">This device · —</div>
        <div id="kcs-cloud-summary" style="margin:6px 0">Cloud save · not checked</div>
        <div class="kcs-actions"><button class="primary" id="kcs-sync-now" type="button">SYNC NOW</button><button id="kcs-export" type="button">EXPORT BACKUP</button><button id="kcs-import-btn" type="button">IMPORT BACKUP</button><button id="kcs-download" type="button" hidden>USE CLOUD SAVE</button></div>
        <input id="kcs-import-file" type="file" accept="application/json,.json" hidden>
      </div>
      <div class="kcs-info" id="kcs-choice" hidden>
        <strong id="kcs-choice-title">Choose which save to keep</strong>
        <p>The saves are not merged automatically, because merging wallets and rewards could duplicate money. Export a backup before choosing. The selected copy will become the account's synchronized save.</p>
        <div class="kcs-actions"><button class="primary" id="kcs-overwrite" type="button">UPLOAD THIS DEVICE</button></div>
      </div>
      <p>Cloud sync requires a Supabase project and the SQL table from the package. Browser-local saving is not replaced. Upload/download choices are explicit when the cloud and this device differ.</p>
    </div>`;
  document.body.appendChild(panel);
  const $ = (id) => panel.querySelector(`#${id}`);
  ui = {
    panel, url: $('kcs-url'), anonKey: $('kcs-anon'), email: $('kcs-email'), password: $('kcs-password'),
    config: $('kcs-config'), signIn: $('kcs-signin'), signUp: $('kcs-signup'), signOut: $('kcs-signout'),
    account: $('kcs-account'), status: $('kcs-status'), syncStatus: $('kcs-status'), syncActions: $('kcs-sync-actions'),
    localSummary: $('kcs-local-summary'), cloudSummary: $('kcs-cloud-summary'), syncNow: $('kcs-sync-now'), export: $('kcs-export'),
    importBtn: $('kcs-import-btn'), importFile: $('kcs-import-file'), download: $('kcs-download'), choice: $('kcs-choice'),
    choiceTitle: $('kcs-choice-title'), overwrite: $('kcs-overwrite'), close: $('kcs-close'),
    diagnosticsButton: $('kcs-diagnostics-button'), writeProbeButton: $('kcs-write-probe-button'), diagnosticResults: $('kcs-diagnostic-results'),
  };
  if (config?.url) ui.url.value = config.url;
  if (config?.anonKey) ui.anonKey.value = config.anonKey;
  ui.config.addEventListener('click', saveConfigFromForm);
  ui.signUp.addEventListener('click', signUp);
  ui.signIn.addEventListener('click', signIn);
  ui.signOut.addEventListener('click', signOut);
  ui.syncNow.addEventListener('click', syncNow);
  ui.diagnosticsButton.addEventListener('click', runDiagnostics);
  ui.writeProbeButton.addEventListener('click', runCloudWriteProbe);
  ui.export.addEventListener('click', () => exportData(cloneSave()));
  ui.importBtn.addEventListener('click', () => ui.importFile.click());
  ui.importFile.addEventListener('change', () => { importLocalBackup(ui.importFile.files?.[0]); ui.importFile.value = ''; });
  ui.download.addEventListener('click', downloadCloud);
  ui.overwrite.addEventListener('click', () => uploadLocal(true));
  ui.close.addEventListener('click', closePanel);
  panel.addEventListener('click', (event) => { if (event.target === panel) closePanel(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) closePanel(); });
  updateAccountDisplay();
  refreshSummary();
  addLaunchButtons();
}
function openPanel() {
  buildPanel();
  if (!panel) return;
  panel.hidden = false;
  document.body.style.overflow = 'hidden';
  refreshSummary();
  ui.close?.focus();
  if (session?.access_token) {
    ensureFreshSession().then(() => {
      updateAccountDisplay();
      if (!cloudReady && !pausedForConflict) fetchCloudRow().then(reconcileLinkedSave).catch((error) => setStatus(error.message, 'error'));
    }).catch((error) => setStatus(error.message, 'error'));
  }
}
function closePanel() {
  if (!panel) return;
  panel.hidden = true;
  document.body.style.overflow = '';
}
function addLaunchButtons() {
  const addButton = (container, label) => {
    if (!container || container.querySelector('[data-kano-cloud-open]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.kanoCloudOpen = 'true';
    button.className = 'secondary';
    button.addEventListener('click', openPanel);
    container.appendChild(button);
  };
  addButton(document.querySelector('#start-screen .start-extra'), 'CLOUD SAVE');
  addButton(document.querySelector('#menu-screen .menu-actions'), 'CLOUD SAVE');
}
function boot() {
  buildPanel();
  // The local storage module emits this event after a verified local save.
  // That event covers wallets, unlocks, achievements, scoreboards and other
  // persisted changes without polling the render loop.
  window.addEventListener('kano:wallet-updated', (event) => {
    if (!event.detail?.stored || restoring) return;
    refreshSummary();
    if (cloudReady && !pausedForConflict) scheduleSync();
  });
  window.addEventListener('online', () => { if (cloudReady && !pausedForConflict) scheduleSync(100); });
  window.addEventListener('pagehide', () => {
    // Local storage is the recovery source if the page closes mid-request.
    if (cloudReady && !pausedForConflict && configured()) scheduleSync(0);
  });
  if (session?.access_token && configured()) {
    ensureFreshSession().then(async () => {
      updateAccountDisplay();
      const row = await fetchCloudRow();
      await reconcileLinkedSave(row);
    }).catch((error) => setStatus(`Cloud account needs attention: ${error.message}`, 'warning'));
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
