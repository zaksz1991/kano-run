import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FAMILY_COMMITMENTS,
  createDefaultFamilyResponsibilitiesState,
  normalizeFamilyResponsibilitiesState,
  familyEventForDay,
  getFamilyResponsibilitiesReport,
  resolveFamilyResponsibilityEvent,
  completeFamilyCommitment,
  renegotiateFamilyCommitment,
  exportFamilyResponsibilitiesReport,
} from '../js/KanoNorthernDriverFamilyResponsibilities.js';

const eventFor = (state, day = 1, relationshipStatus = 'single') => familyEventForDay(state, { day, relationshipStatus });

 test('default state is bounded and starts with no money promises', () => {
  const state = createDefaultFamilyResponsibilitiesState();
  assert.equal(state.version, 1);
  assert.deepEqual(state.commitments, []);
  assert.equal(state.counters.financialSupport, 0);
  assert.equal(MAX_FAMILY_COMMITMENTS, 12);
});

test('normalization strips unsafe text and clamps financial values', () => {
  const state = normalizeFamilyResponsibilitiesState({
    commitments: [{ id: '<bad>', createdDay: -4, dueDay: 0, amount: 999999999, status: 'oops', label: '<script>alert(1)</script>' }],
    ledger: [{ day: 2, text: '<danger>ok', amount: 1000000000 }],
  });
  assert.ok(state.commitments[0].amount <= 1000000);
  assert.equal(state.commitments[0].status, 'pending');
  assert.ok(!state.commitments[0].label.includes('<'));
  assert.ok(!state.ledger[0].text.includes('<'));
  assert.ok(state.ledger[0].amount <= 1000000);
});

test('same day returns the same event, including after reload', () => {
  const one = eventFor(createDefaultFamilyResponsibilitiesState(), 4);
  const two = eventFor(one.state, 4);
  assert.equal(one.event.id, two.event.id);
  assert.equal(two.state.lastEventDay, 4);
});

test('event deck adapts to relationship status without exposing private partner names', () => {
  const dating = eventFor(createDefaultFamilyResponsibilitiesState(), 10, 'dating');
  const single = eventFor(createDefaultFamilyResponsibilitiesState(), 10, 'single');
  assert.equal(dating.event.id, 'partner-check-in');
  assert.equal(single.event.id, 'friend-pressure');
  assert.equal(dating.event.body.includes('partnerName'), false);
});

test('clock rollback cannot reopen an earlier event', () => {
  const one = eventFor(createDefaultFamilyResponsibilitiesState(), 8);
  const rollback = eventFor(one.state, 7);
  assert.equal(rollback.ok, false);
  assert.equal(rollback.reason, 'clock_rollback');
});

test('contribution uses existing wallet and resolves event exactly once', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 1);
  const result = resolveFamilyResponsibilityEvent(current.state, { day: 1, eventId: current.event.id, choiceId: 'contribute', wallet: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 1000 - current.event.amount);
  assert.equal(result.state.counters.financialSupport, current.event.amount);
  const twice = resolveFamilyResponsibilityEvent(result.state, { day: 1, eventId: current.event.id, choiceId: 'contribute', wallet: result.wallet });
  assert.equal(twice.ok, false);
  assert.equal(twice.reason, 'already_resolved');
});

test('insufficient funds do not resolve or deduct money', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 2);
  const result = resolveFamilyResponsibilityEvent(current.state, { day: 2, eventId: current.event.id, choiceId: 'contribute', wallet: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient_wallet');
  assert.equal(result.wallet, 0);
  assert.equal(result.state.resolvedDays.includes(2), false);
});

test('family promises create a visible future commitment without immediate debit', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 3);
  const result = resolveFamilyResponsibilityEvent(current.state, { day: 3, eventId: current.event.id, choiceId: 'promise', wallet: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 20);
  assert.equal(result.state.commitments[0].status, 'pending');
  assert.equal(result.state.commitments[0].dueDay, 3 + current.event.dueDays);
});

test('time offer creates a non-financial commitment', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 2);
  const result = resolveFamilyResponsibilityEvent(current.state, { day: 2, eventId: current.event.id, choiceId: 'time', wallet: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 100);
  assert.equal(result.state.commitments[0].kind, 'time');
  assert.equal(result.state.commitments[0].amount, 0);
});

test('respectful boundary records a decision but no money and no promise', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 2);
  const result = resolveFamilyResponsibilityEvent(current.state, { day: 2, eventId: current.event.id, choiceId: 'boundary', wallet: 10 });
  assert.equal(result.wallet, 10);
  assert.equal(result.state.commitments.length, 0);
  assert.equal(result.state.counters.boundariesSet, 1);
});

test('active shifts block event decisions and commitment payments', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 1);
  const blocked = resolveFamilyResponsibilityEvent(current.state, { day: 1, eventId: current.event.id, choiceId: 'boundary', wallet: 200, activeShift: true });
  assert.equal(blocked.reason, 'shift_active');
  const promise = resolveFamilyResponsibilityEvent(current.state, { day: 1, eventId: current.event.id, choiceId: 'promise', wallet: 200 });
  const payment = completeFamilyCommitment(promise.state, { commitmentId: promise.state.commitments[0].id, day: 2, wallet: 200, activeShift: true });
  assert.equal(payment.reason, 'shift_active');
});

test('commitment can be paid once and wallet only changes on payment', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 1);
  const promise = resolveFamilyResponsibilityEvent(current.state, { day: 1, eventId: current.event.id, choiceId: 'promise', wallet: 900 });
  const commitment = promise.state.commitments[0];
  const paid = completeFamilyCommitment(promise.state, { commitmentId: commitment.id, day: commitment.dueDay, wallet: 900 });
  assert.equal(paid.ok, true);
  assert.equal(paid.wallet, 900 - commitment.amount);
  const twice = completeFamilyCommitment(paid.state, { commitmentId: commitment.id, day: commitment.dueDay + 1, wallet: paid.wallet });
  assert.equal(twice.ok, false);
  assert.equal(twice.reason, 'commitment_not_pending');
});

test('time commitment can be completed without a wallet debit', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 1);
  const time = resolveFamilyResponsibilityEvent(current.state, { day: 1, eventId: current.event.id, choiceId: 'time', wallet: 53 });
  const result = completeFamilyCommitment(time.state, { commitmentId: time.state.commitments[0].id, day: 2, wallet: 53 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 53);
  assert.equal(result.commitment.status, 'completed');
});

test('renegotiating moves the due date and stops after three renegotiations', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 1);
  const promise = resolveFamilyResponsibilityEvent(current.state, { day: 1, eventId: current.event.id, choiceId: 'promise', wallet: 0 });
  let state = promise.state; const id = state.commitments[0].id;
  let result;
  for (let n = 0; n < 3; n += 1) { result = renegotiateFamilyCommitment(state, { commitmentId: id, day: 2 + n }); assert.equal(result.ok, true); state = result.state; }
  assert.equal(renegotiateFamilyCommitment(state, { commitmentId: id, day: 9 }).reason, 'renegotiation_limit');
  assert.equal(state.counters.commitmentsRenegotiated, 3);
});

test('too many open commitments blocks new promises and time obligations', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 1);
  const filled = normalizeFamilyResponsibilitiesState({ ...current.state, commitments: Array.from({ length: MAX_FAMILY_COMMITMENTS }, (_, i) => ({ id: `c${i}`, createdDay: 1, dueDay: 3, amount: 10, label: 'test', status: 'pending' })) });
  assert.equal(resolveFamilyResponsibilityEvent(filled, { day: 1, eventId: current.event.id, choiceId: 'promise', wallet: 0 }).reason, 'too_many_commitments');
  assert.equal(resolveFamilyResponsibilityEvent(filled, { day: 1, eventId: current.event.id, choiceId: 'time', wallet: 0 }).reason, 'too_many_commitments');
});

test('next day lapses an unanswered situation without financial penalty', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 1);
  const next = eventFor(current.state, 2);
  assert.notEqual(next.event.id, '');
  assert.ok(next.state.ledger.some(item => item.type === 'event-lapsed'));
  assert.equal(next.state.resolvedDays.includes(1), true);
});

test('report lists overdue promises and export omits raw internal state field', () => {
  const current = eventFor(createDefaultFamilyResponsibilitiesState(), 1);
  const promise = resolveFamilyResponsibilityEvent(current.state, { day: 1, eventId: current.event.id, choiceId: 'promise', wallet: 0 });
  const report = getFamilyResponsibilitiesReport(promise.state, { day: promise.state.commitments[0].dueDay + 1 });
  assert.equal(report.summary.overdue, 1);
  const exported = exportFamilyResponsibilitiesReport(promise.state, { day: 8 });
  assert.equal('state' in exported, false);
  assert.ok(Array.isArray(exported.pendingCommitments));
});
