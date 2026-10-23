import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADASHI_SUPPORT_CONTRIBUTIONS,
  ADASHI_SUPPORT_MEMBER_COUNTS,
  createDefaultAdashiSupportState,
  normalizeAdashiSupportState,
  createAdashiCircle,
  closeAdashiCircle,
  getAdashiSnapshot,
  payAdashiContribution,
  settleAdashiWeek,
  offerNeighbourSupport,
  requestNeighbourSupport,
  exportAdashiSupportReport,
} from '../js/KanoNorthernDriverAdashiSupport.js';

function circle(state = createDefaultAdashiSupportState(), opts = {}) {
  return createAdashiCircle(state, { contributionAmount: 250, memberCount: 4, playerPosition: 1, day: 1, ...opts });
}

test('configuration options are bounded and the default has no active circle or wallet', () => {
  assert.deepEqual([...ADASHI_SUPPORT_CONTRIBUTIONS], [100, 250, 500, 1000]);
  assert.deepEqual([...ADASHI_SUPPORT_MEMBER_COUNTS], [4, 5, 6, 7, 8]);
  const state = createDefaultAdashiSupportState();
  assert.equal(state.circle, null);
  assert.equal(state.contacts.length, 6);
  assert.equal('wallet' in state, false);
});

test('creating a circle does not alter or introduce an authoritative wallet', () => {
  const start = createDefaultAdashiSupportState();
  const result = circle(start, { contributionAmount: 500, memberCount: 6, playerPosition: 4, day: 9 });
  assert.equal(result.ok, true);
  assert.equal(result.state.circle.contributionAmount, 500);
  assert.equal(result.state.circle.memberCount, 6);
  assert.equal(result.state.circle.playerPosition, 4);
  assert.equal(result.state.circle.roster.find(row => row.position === 4).isPlayer, true);
  assert.equal(result.state.circle.nextDueDay, 9);
  assert.equal(result.state.stats.totalContributed, 0);
});

test('rejects invalid circle configuration and duplicate active circles', () => {
  const initial = createDefaultAdashiSupportState();
  assert.equal(createAdashiCircle(initial, { contributionAmount: 123, memberCount: 4, playerPosition: 1, day: 1 }).ok, false);
  assert.equal(createAdashiCircle(initial, { contributionAmount: 250, memberCount: 3, playerPosition: 1, day: 1 }).ok, false);
  assert.equal(createAdashiCircle(initial, { contributionAmount: 250, memberCount: 4, playerPosition: 5, day: 1 }).ok, false);
  const started = circle(initial);
  assert.equal(createAdashiCircle(started.state, { contributionAmount: 250, memberCount: 4, playerPosition: 2, day: 1 }).ok, false);
});

test('weekly contribution is wallet-gated, paid once, and cannot be pulled ahead of schedule', () => {
  const started = circle();
  assert.equal(payAdashiContribution(started.state, { day: 1, wallet: 100 }).ok, false);
  const paid = payAdashiContribution(started.state, { day: 1, wallet: 1000 });
  assert.equal(paid.ok, true);
  assert.equal(paid.wallet, 750);
  assert.equal(paid.state.circle.paidThisWeek, true);
  assert.equal(payAdashiContribution(paid.state, { day: 1, wallet: 750 }).ok, false);
  const settled = settleAdashiWeek(paid.state, { day: 1, wallet: paid.wallet });
  assert.equal(settled.ok, true);
  assert.equal(settled.wallet, 1750);
  assert.equal(settled.payout, 1000);
  assert.equal(settled.state.circle.currentWeek, 2);
  assert.equal(settled.state.circle.nextDueDay, 8);
  assert.equal(payAdashiContribution(settled.state, { day: 7, wallet: settled.wallet }).ok, false);
});

test('payout rotates according to the selected position and missed contributions never pay the player', () => {
  const started = circle(createDefaultAdashiSupportState(), { playerPosition: 2 });
  const firstPay = payAdashiContribution(started.state, { day: 1, wallet: 2000 });
  const firstSettle = settleAdashiWeek(firstPay.state, { day: 1, wallet: firstPay.wallet });
  assert.equal(firstSettle.payout, 0);
  assert.equal(firstSettle.wallet, 1750);
  const turn2 = payAdashiContribution(firstSettle.state, { day: 8, wallet: firstSettle.wallet });
  const payout = settleAdashiWeek(turn2.state, { day: 8, wallet: turn2.wallet });
  assert.equal(payout.payout, 1000);
  assert.equal(payout.wallet, 2500);

  const missedCircle = circle();
  const missed = settleAdashiWeek(missedCircle.state, { day: 1, wallet: 500 });
  assert.equal(missed.missed, true);
  assert.equal(missed.payout, 0);
  assert.equal(missed.wallet, 500);
  assert.equal(missed.state.stats.contributionsMissed, 1);
  assert.equal(missed.state.reputation, 42);
  assert.equal(missed.state.circle.payoutEligible, false);
});

test('after the last turn a new cycle begins and schedules the next weekly payment', () => {
  let state = circle(createDefaultAdashiSupportState(), { memberCount: 4, playerPosition: 4 }).state;
  let wallet = 5000;
  let day = 1;
  for (let week = 1; week <= 4; week += 1) {
    const payment = payAdashiContribution(state, { day, wallet });
    assert.equal(payment.ok, true);
    state = payment.state; wallet = payment.wallet;
    const settlement = settleAdashiWeek(state, { day, wallet });
    assert.equal(settlement.ok, true);
    state = settlement.state; wallet = settlement.wallet;
    day += 7;
  }
  assert.equal(state.circle.cycleNumber, 2);
  assert.equal(state.circle.currentWeek, 1);
  assert.equal(state.circle.nextDueDay, 29);
  assert.equal(state.stats.contributionsPaid, 4);
  assert.equal(state.stats.payoutsReceived, 1);
});

test('only one social action per in-game day; offered support changes trust without cash', () => {
  const initial = createDefaultAdashiSupportState();
  const result = offerNeighbourSupport(initial, { contactId: 'musa', offerType: 'road-update', day: 3, activeShift: false });
  assert.equal(result.ok, true);
  assert.equal(result.state.contacts.find(row => row.id === 'musa').trust, 54);
  const blocked = requestNeighbourSupport(result.state, { contactId: 'musa', requestType: 'route-information', day: 3, activeShift: false });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.state.stats.supportRequested, 0);
  const inShift = offerNeighbourSupport(result.state, { contactId: 'amina', offerType: 'customer-referral', day: 4, activeShift: true });
  assert.equal(inShift.ok, false);
});

test('trusted contacts can respond narratively and requests do not create wallet proceeds', () => {
  let state = createDefaultAdashiSupportState();
  state.contacts = state.contacts.map(contact => contact.id === 'amina' ? { ...contact, trust: 80 } : contact);
  state.reputation = 70;
  const result = requestNeighbourSupport(state, { contactId: 'amina', requestType: 'mechanic-information', day: 4 });
  assert.equal(result.ok, true);
  assert.equal(result.received, true);
  assert.equal(result.state.stats.supportReceived, 1);
  assert.match(result.message, /narrative guidance only/);
  const cooldown = requestNeighbourSupport(result.state, { contactId: 'amina', requestType: 'mechanic-information', day: 5 });
  assert.equal(cooldown.ok, false);
});

test('normalization rejects corrupt fields and export declares its gameplay-only limits', () => {
  const state = normalizeAdashiSupportState({ reputation: 1000, stats: { totalContributed: -20 }, contacts: [{ id: '__proto__', trust: 999 }] });
  assert.equal(state.reputation, 100);
  assert.equal(state.stats.totalContributed, 0);
  assert.equal(state.contacts[0].id, 'amina');
  const report = exportAdashiSupportReport(state, { day: 7, now: 0 });
  assert.equal(report.simulationDay, 7);
  assert.match(report.disclosure, /not a financial statement/);
  assert.equal('wallet' in report, false);
  assert.equal('phoneNumber' in report, false);
  assert.equal('bankAccount' in report, false);
});


test('payout eligibility is suspended after a missed contribution and restored only after two timely payments', () => {
  let state = circle(createDefaultAdashiSupportState(), { playerPosition: 2 }).state;
  let wallet = 3000;
  let day = 1;
  // Miss week one while another member is due.
  let result = settleAdashiWeek(state, { day, wallet });
  state = result.state; wallet = result.wallet;
  assert.equal(state.circle.payoutEligible, false);
  day += 7;
  // Pay the player turn, but the prior default blocks the payout.
  result = payAdashiContribution(state, { day, wallet });
  state = result.state; wallet = result.wallet;
  result = settleAdashiWeek(state, { day, wallet });
  state = result.state; wallet = result.wallet;
  assert.equal(result.payout, 0);
  assert.equal(state.circle.consecutivePayments, 1);
  assert.equal(state.circle.payoutEligible, false);
  day += 7;
  result = payAdashiContribution(state, { day, wallet });
  state = result.state; wallet = result.wallet;
  result = settleAdashiWeek(state, { day, wallet });
  state = result.state; wallet = result.wallet;
  assert.equal(state.circle.consecutivePayments, 2);
  assert.equal(state.circle.payoutEligible, true);
});

test('a circle cannot be closed before a complete cycle; closed-cycle history is retained', () => {
  let state = circle(createDefaultAdashiSupportState(), { memberCount: 4, playerPosition: 4 }).state;
  assert.equal(closeAdashiCircle(state, { day: 1 }).ok, false);
  let wallet = 4000;
  let day = 1;
  for (let week = 0; week < 4; week += 1) {
    const payment = payAdashiContribution(state, { day, wallet });
    assert.equal(payment.ok, true);
    state = payment.state; wallet = payment.wallet;
    const settlement = settleAdashiWeek(state, { day, wallet });
    assert.equal(settlement.ok, true);
    state = settlement.state; wallet = settlement.wallet;
    day += 7;
  }
  const closed = closeAdashiCircle(state, { day });
  assert.equal(closed.ok, true);
  assert.equal(closed.state.circle, null);
  assert.equal(closed.state.completedCircles.length, 1);
  assert.equal(closed.state.completedCircles[0].cycleNumber, 1);
  const reopened = circle(closed.state, { day });
  assert.equal(reopened.ok, true);
  assert.equal(reopened.state.completedCircles.length, 1);
});
