import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVER_DOCUMENTS, DRIVER_COMPLIANCE_STORAGE_KEY, defaultDriverComplianceState,
  sanitizeDriverComplianceState, loadDriverComplianceState, saveDriverComplianceState,
  documentStatus, summarizeDriverCompliance, renewDriverDocument, applyCheckpointCompliance,
} from '../js/KanoNorthernDriverRoadCompliance.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values };
}

test('default driver starts with plausible starter documents but validity expires on schedule', () => {
  const state = defaultDriverComplianceState(1);
  assert.equal(summarizeDriverCompliance(state, 1).ready, true);
  assert.equal(documentStatus(state, 'vehicleInspection', 14).status, 'expiring');
  assert.equal(documentStatus(state, 'vehicleInspection', 15).status, 'expired');
  assert.equal(DRIVER_DOCUMENTS.operatingPermit.validityDays, 30);
});

test('missing and expired records are distinguished and invalid inputs are clamped', () => {
  const state = sanitizeDriverComplianceState({ version: 1, documents: { driverBadge: { issuedOnDay: 2, expiresOnDay: 2, renewalCount: -9 } } });
  const summary = summarizeDriverCompliance(state, 3);
  assert.equal(summary.status, 'mixed');
  assert.ok(summary.missing.includes('operatingPermit'));
  assert.ok(summary.expired.includes('driverBadge'));
  assert.equal(state.documents.driverBadge.renewalCount, 0);
});

test('renewal changes only selected document dates and returns a fictional game cost', () => {
  const before = defaultDriverComplianceState(1);
  const result = renewDriverDocument(before, { documentId: 'vehicleInspection', day: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.cost, DRIVER_DOCUMENTS.vehicleInspection.cost);
  assert.equal(result.state.documents.vehicleInspection.issuedOnDay, 20);
  assert.equal(result.state.documents.vehicleInspection.expiresOnDay, 33);
  assert.equal(result.state.documents.operatingPermit.expiresOnDay, before.documents.operatingPermit.expiresOnDay);
  assert.equal(renewDriverDocument(before, { documentId: 'unknown', day: 20 }).ok, false);
});

test('current papers lower enforcement heat, incomplete papers raise it, running does not stack a penalty', () => {
  const ready = defaultDriverComplianceState(1);
  const compliant = applyCheckpointCompliance(ready, { day: 3, action: 'talk', heatBefore: 30, recordedAt: 'test' });
  assert.equal(compliant.heatAfter, 25);
  assert.equal(compliant.state.compliantCheckpoints, 1);
  const incomplete = sanitizeDriverComplianceState({ ...ready, documents: { ...ready.documents, driverBadge: { issuedOnDay: 0, expiresOnDay: 0, renewalCount: 0 } } });
  const flagged = applyCheckpointCompliance(incomplete, { day: 3, action: 'talk', heatBefore: 30, recordedAt: 'test' });
  assert.ok(flagged.heatAfter > 30);
  const fleeing = applyCheckpointCompliance(incomplete, { day: 3, action: 'run', heatBefore: 30, recordedAt: 'test' });
  assert.equal(fleeing.heatAfter, 30);
});

test('checkpoint history persists safely and is capped at 60 records', () => {
  const storage = memoryStorage();
  let state = defaultDriverComplianceState(1);
  for (let day = 1; day <= 65; day++) state = applyCheckpointCompliance(state, { day, action: 'talk', heatBefore: 10, recordedAt: `d${day}` }).state;
  assert.equal(state.history.length, 60);
  assert.equal(state.history[0].day, 6);
  assert.equal(saveDriverComplianceState(state, storage).ok, true);
  assert.equal(storage.values.has(DRIVER_COMPLIANCE_STORAGE_KEY), true);
  assert.equal(loadDriverComplianceState(storage).history.length, 60);
});
