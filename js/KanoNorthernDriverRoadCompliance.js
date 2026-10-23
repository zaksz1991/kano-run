/**
 * Kano Life — driver documents and KAROTA checkpoint readiness.
 * These are fictional gameplay rules and costs, not statements of Nigerian law.
 */
export const DRIVER_COMPLIANCE_STORAGE_KEY = 'kano-life-northern-driver-compliance-v1';

export const DRIVER_DOCUMENTS = Object.freeze({
  operatingPermit: Object.freeze({
    id: 'operatingPermit', label: 'Keke operating permit', cost: 650, validityDays: 30,
    description: 'Operating-permit roleplay record',
  }),
  vehicleInspection: Object.freeze({
    id: 'vehicleInspection', label: 'Vehicle inspection record', cost: 450, validityDays: 14,
    description: 'Roadworthiness inspection roleplay record',
  }),
  thirdPartyCover: Object.freeze({
    id: 'thirdPartyCover', label: 'Third-party cover', cost: 900, validityDays: 30,
    description: 'Insurance roleplay record',
  }),
  driverBadge: Object.freeze({
    id: 'driverBadge', label: 'Driver badge / identification', cost: 350, validityDays: 30,
    description: 'Driver identification roleplay record',
  }),
});

const clamp = (value, min, max) => {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : min));
};
const whole = (value, min, max) => Math.floor(clamp(value, min, max));
const roundMoney = value => Math.round(clamp(value, 0, 1e9));
const safeDay = value => whole(value, 1, 1e8);

export function defaultDriverComplianceState(day = 1) {
  const currentDay = safeDay(day);
  const documents = {};
  for (const meta of Object.values(DRIVER_DOCUMENTS)) {
    documents[meta.id] = {
      issuedOnDay: currentDay,
      expiresOnDay: currentDay + meta.validityDays - 1,
      renewalCount: 0,
    };
  }
  return { version: 1, documents, checkpointCount: 0, compliantCheckpoints: 0, flaggedCheckpoints: 0, history: [], lastCheckpoint: null };
}

export function sanitizeDriverComplianceState(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const defaults = defaultDriverComplianceState(1);
  const documents = {};
  for (const meta of Object.values(DRIVER_DOCUMENTS)) {
    const value = row.documents?.[meta.id];
    if (!value || typeof value !== 'object') {
      documents[meta.id] = { issuedOnDay: 0, expiresOnDay: 0, renewalCount: 0 };
      continue;
    }
    documents[meta.id] = {
      issuedOnDay: whole(value.issuedOnDay, 0, 1e8),
      expiresOnDay: whole(value.expiresOnDay, 0, 1e8),
      renewalCount: whole(value.renewalCount, 0, 1e7),
    };
  }
  return {
    version: 1,
    documents: Object.keys(documents).length ? documents : defaults.documents,
    checkpointCount: whole(row.checkpointCount, 0, 1e8),
    compliantCheckpoints: whole(row.compliantCheckpoints, 0, 1e8),
    flaggedCheckpoints: whole(row.flaggedCheckpoints, 0, 1e8),
    history: Array.isArray(row.history) ? row.history.slice(-60).filter(x => x && typeof x === 'object').map(item => ({
      day: safeDay(item.day), action: String(item.action ?? 'unknown').slice(0, 20),
      status: ['compliant', 'expired', 'missing', 'mixed'].includes(item.status) ? item.status : 'mixed',
      expired: Array.isArray(item.expired) ? item.expired.filter(id => Object.hasOwn(DRIVER_DOCUMENTS, id)).slice(0, 4) : [],
      missing: Array.isArray(item.missing) ? item.missing.filter(id => Object.hasOwn(DRIVER_DOCUMENTS, id)).slice(0, 4) : [],
      heatBefore: whole(item.heatBefore, 0, 100), heatAfter: whole(item.heatAfter, 0, 100),
      heatAdjustment: whole(item.heatAdjustment, -100, 100),
      recordedAt: String(item.recordedAt ?? '').slice(0, 40),
    })) : [],
    lastCheckpoint: row.lastCheckpoint && typeof row.lastCheckpoint === 'object' ? row.lastCheckpoint : null,
  };
}

export function loadDriverComplianceState(storage = globalThis.localStorage ?? null, day = 1) {
  try {
    const raw = storage?.getItem(DRIVER_COMPLIANCE_STORAGE_KEY);
    if (!raw) return defaultDriverComplianceState(day);
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return defaultDriverComplianceState(day);
    return sanitizeDriverComplianceState(parsed);
  } catch {
    return defaultDriverComplianceState(day);
  }
}

export function saveDriverComplianceState(input, storage = globalThis.localStorage ?? null) {
  const state = sanitizeDriverComplianceState(input);
  try {
    if (!storage) return { ok: false, state, reason: 'storage_unavailable' };
    storage.setItem(DRIVER_COMPLIANCE_STORAGE_KEY, JSON.stringify(state));
    return { ok: true, state };
  } catch {
    return { ok: false, state, reason: 'storage_unavailable' };
  }
}

export function documentStatus(input, documentId, day = 1) {
  const state = sanitizeDriverComplianceState(input);
  const meta = DRIVER_DOCUMENTS[documentId];
  if (!meta) return { id: String(documentId ?? ''), status: 'unknown', daysRemaining: 0, expiresOnDay: 0 };
  const record = state.documents[meta.id];
  const expiry = whole(record?.expiresOnDay, 0, 1e8);
  const issued = whole(record?.issuedOnDay, 0, 1e8);
  if (!issued || !expiry) return { id: meta.id, status: 'missing', daysRemaining: 0, expiresOnDay: expiry };
  const today = safeDay(day);
  if (today > expiry) return { id: meta.id, status: 'expired', daysRemaining: 0, expiresOnDay: expiry };
  return { id: meta.id, status: expiry - today + 1 <= 3 ? 'expiring' : 'valid', daysRemaining: expiry - today + 1, expiresOnDay: expiry };
}

export function summarizeDriverCompliance(input, day = 1) {
  const state = sanitizeDriverComplianceState(input);
  const statuses = Object.values(DRIVER_DOCUMENTS).map(meta => ({ ...meta, ...documentStatus(state, meta.id, day) }));
  const missing = statuses.filter(item => item.status === 'missing').map(item => item.id);
  const expired = statuses.filter(item => item.status === 'expired').map(item => item.id);
  const expiring = statuses.filter(item => item.status === 'expiring').map(item => item.id);
  const current = statuses.filter(item => item.status === 'valid' || item.status === 'expiring').length;
  return {
    day: safeDay(day), documents: statuses, currentCount: current,
    missing, expired, expiring,
    ready: missing.length === 0 && expired.length === 0,
    status: missing.length && expired.length ? 'mixed' : missing.length ? 'missing' : expired.length ? 'expired' : 'compliant',
  };
}

export function renewDriverDocument(input, { documentId, day = 1 } = {}) {
  const state = sanitizeDriverComplianceState(input);
  const meta = DRIVER_DOCUMENTS[documentId];
  if (!meta) return { ok: false, reason: 'unknown_document', state };
  const currentDay = safeDay(day);
  const old = state.documents[documentId] || { renewalCount: 0 };
  const next = sanitizeDriverComplianceState({
    ...state,
    documents: {
      ...state.documents,
      [documentId]: {
        issuedOnDay: currentDay,
        expiresOnDay: currentDay + meta.validityDays - 1,
        renewalCount: whole(old.renewalCount, 0, 1e7) + 1,
      },
    },
  });
  return { ok: true, reason: null, cost: roundMoney(meta.cost), documentId, state: next };
}

export function applyCheckpointCompliance(input, { day = 1, action = 'talk', heatBefore = 0, recordedAt = '' } = {}) {
  const previous = sanitizeDriverComplianceState(input);
  const summary = summarizeDriverCompliance(previous, day);
  const heat = whole(heatBefore, 0, 100);
  let heatAdjustment = 0;
  // Running away remains risky regardless of paperwork. This module does not
  // amplify the base game's escape penalty a second time.
  if (String(action) !== 'run') {
    if (summary.ready) heatAdjustment = -5;
    else heatAdjustment = Math.min(12, summary.missing.length * 4 + summary.expired.length * 3);
  }
  const heatAfter = whole(heat + heatAdjustment, 0, 100);
  const item = {
    day: safeDay(day), action: String(action ?? 'unknown').slice(0, 20), status: summary.status,
    expired: summary.expired, missing: summary.missing,
    heatBefore: heat, heatAfter, heatAdjustment: heatAfter - heat,
    recordedAt: String(recordedAt || new Date().toISOString()).slice(0, 40),
  };
  const state = sanitizeDriverComplianceState({
    ...previous,
    checkpointCount: previous.checkpointCount + 1,
    compliantCheckpoints: previous.compliantCheckpoints + (summary.ready ? 1 : 0),
    flaggedCheckpoints: previous.flaggedCheckpoints + (summary.ready ? 0 : 1),
    lastCheckpoint: item,
    history: [...previous.history, item].slice(-60),
  });
  return { state, summary, heatBefore: heat, heatAfter, heatAdjustment: heatAfter - heat, record: item };
}
