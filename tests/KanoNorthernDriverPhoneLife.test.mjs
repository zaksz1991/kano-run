import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHONE_AIRTIME_CAP, PHONE_ACTION_COSTS, createDefaultPhoneLifeState,
  normalizePhoneLifeState, phoneScenarioForDay, ensureDailyPhoneMessages,
  topUpPhoneAirtime, resolvePhoneMessage, getPhoneLifeReport, exportPhoneLifeReport,
} from '../js/KanoNorthernDriverPhoneLife.js';

test('default state is bounded and includes separate relationship/contact bonds', () => {
  const state = createDefaultPhoneLifeState();
  assert.equal(state.airtime, 100);
  assert.equal(state.lastGeneratedDay, 0);
  assert.deepEqual(Object.keys(state.bonds), ['family','partner','market','park','work','community']);
  assert.equal(normalizePhoneLifeState({ airtime: 99999 }).airtime, PHONE_AIRTIME_CAP);
});

test('daily scenarios cover family, adult relationship, market, park, work and community life', () => {
  assert.equal(phoneScenarioForDay(1, 'single').category, 'family');
  assert.equal(phoneScenarioForDay(2, 'single').category, 'social_pressure');
  assert.equal(phoneScenarioForDay(2, 'married').category, 'relationship');
  assert.equal(phoneScenarioForDay(2, 'divorced').category, 'relationship_boundary');
  assert.equal(phoneScenarioForDay(3, 'single').contact, 'Talatu');
  assert.equal(phoneScenarioForDay(4, 'single').contact, 'Asabe');
  assert.equal(phoneScenarioForDay(5, 'single').contact, 'Emeka');
  assert.equal(phoneScenarioForDay(7, 'single').category, 'community');
});

test('ensureDailyPhoneMessages is idempotent, bounded and does not replay the same day', () => {
  const first = ensureDailyPhoneMessages(createDefaultPhoneLifeState(), { day: 4, relationshipStatus: 'single' });
  assert.equal(first.added, 3);
  const second = ensureDailyPhoneMessages(first.state, { day: 4, relationshipStatus: 'single' });
  assert.equal(second.added, 0);
  assert.equal(second.state.inbox.length, first.state.inbox.length);
  assert.equal(new Set(second.state.inbox.map(x => x.id)).size, second.state.inbox.length);
});

test('airtime top-ups spend only the supplied wallet, block during shifts and respect the cap', () => {
  const state = createDefaultPhoneLifeState();
  const blocked = topUpPhoneAirtime(state, { amount: 100, wallet: 500, activeShift: true });
  assert.equal(blocked.reason, 'shift_active');
  const low = topUpPhoneAirtime(state, { amount: 500, wallet: 200 });
  assert.equal(low.reason, 'insufficient_wallet');
  const ok = topUpPhoneAirtime(state, { amount: 250, wallet: 500 });
  assert.equal(ok.wallet, 250);
  assert.equal(ok.airtime, 350);
  const cap = topUpPhoneAirtime({ ...ok.state, airtime: PHONE_AIRTIME_CAP }, { amount: 100, wallet: 500 });
  assert.equal(cap.reason, 'airtime_cap');
});

test('phone interactions are blocked during active driving without changing state', () => {
  const generated = ensureDailyPhoneMessages(createDefaultPhoneLifeState(), { day: 1, relationshipStatus: 'single' }).state;
  const result = resolvePhoneMessage(generated, { messageId: generated.inbox[0].id, action: 'reply', day: 1, airtime: 100, activeShift: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'shift_active');
  assert.equal(result.state.inbox[0].status, 'pending');
  assert.equal(result.airtime, 100);
});

test('reply, call-back and boundary choices cost airtime and change only contact-specific trust', () => {
  const generated = ensureDailyPhoneMessages(createDefaultPhoneLifeState(), { day: 3, relationshipStatus: 'single' }).state;
  const msg = generated.inbox.find(x => x.day === 3);
  const result = resolvePhoneMessage(generated, { messageId: msg.id, action: 'call_back', day: 3, airtime: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.airtime, 100 - PHONE_ACTION_COSTS.call_back);
  assert.equal(result.state.bonds.market, 54);
  assert.equal(result.state.counters.callsMade, 1);
  assert.equal(result.state.inbox.find(x => x.id === msg.id).status, 'resolved');
});

test('ignoring is free, records the outcome, and does not affect unrelated bonds', () => {
  const generated = ensureDailyPhoneMessages(createDefaultPhoneLifeState(), { day: 1, relationshipStatus: 'single' }).state;
  const result = resolvePhoneMessage(generated, { messageId: generated.inbox[0].id, action: 'ignore', day: 1, airtime: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.airtime, 100);
  assert.equal(result.state.bonds.family, 47);
  assert.equal(result.state.bonds.partner, 50);
  assert.equal(result.state.counters.ignored, 1);
});

test('stale messages expire after two days and can no longer be handled', () => {
  const generated = ensureDailyPhoneMessages(createDefaultPhoneLifeState(), { day: 1, relationshipStatus: 'single' }).state;
  const result = resolvePhoneMessage(generated, { messageId: generated.inbox[0].id, action: 'reply', day: 4, airtime: 100 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'message_expired');
  assert.equal(result.state.inbox[0].status, 'expired');
});

test('report and export omit unrelated health details and provide bounded communication history', () => {
  const generated = ensureDailyPhoneMessages(createDefaultPhoneLifeState(), { day: 3, relationshipStatus: 'dating' }).state;
  generated.ledger = Array.from({ length: 100 }, (_, i) => ({ day: i + 1, text: `action ${i}`, amount: 0 }));
  const report = getPhoneLifeReport(generated, { day: 3, relationshipStatus: 'dating' });
  assert.equal(report.pending.length, 3);
  assert.equal(report.recentLedger.length, 8);
  const exported = exportPhoneLifeReport(generated, { day: 3, relationshipStatus: 'dating' });
  assert.equal(exported.relationshipStatus, 'dating');
  assert.equal('healthSummary' in exported, false);
  assert.equal(exported.ledger.length, 80);
});
