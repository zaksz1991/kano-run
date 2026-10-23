import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEFE_ITEMS, LEFE_HISTORY_LIMIT,
  createDefaultLefeState, normalizeLefeState, getLefeSummary,
  beginLefeJourney, resumeLefeJourney, pauseLefeJourney,
  saveLefeList, openLefeDiscussion, getLefeScenarioForDay, resolveLefeScenario,
  recordMutualPartnerCommitment, agreeLefeList, purchaseLefeItem,
  completeLefePreparation, exportLefeReport,
} from '../js/KanoNorthernDriverLefeNegotiation.js';

function makeDiscussion({ day = 1, status = 'dating', quantities = null, custom = {} } = {}) {
  let state = createDefaultLefeState();
  const started = beginLefeJourney(state, { day, relationshipStatus: status });
  assert.equal(started.ok, true);
  state = started.state;
  const q = quantities || Object.fromEntries(LEFE_ITEMS.map(item => [item.id, item.id === 'familySpecific' ? 0 : item.defaultQuantity]));
  const saved = saveLefeList(state, { day, relationshipStatus: status, quantities: q, ...custom });
  assert.equal(saved.ok, true);
  state = saved.state;
  const opened = openLefeDiscussion(state, { day, relationshipStatus: status });
  assert.equal(opened.ok, true);
  state = opened.state;
  const scenario = getLefeScenarioForDay(state, { day, relationshipStatus: status, profileGender: 'male' });
  assert.equal(scenario.ok, true);
  state = scenario.state;
  return { state, scenario: scenario.scenario };
}

function resolveCurrent(state, day, choiceId, relationshipStatus = 'dating') {
  return resolveLefeScenario(state, { day, scenarioId: state.currentScenarioId, choiceId, relationshipStatus });
}

test('default state uses a customisable list and safe initial metrics', () => {
  const state = createDefaultLefeState();
  assert.equal(state.phase, 'inactive');
  assert.equal(state.relationshipStatus, 'single');
  assert.equal(state.communication, 50);
  assert.ok(getLefeSummary(state).requestedTotal > 0);
  assert.equal(state.plannedQuantities.familySpecific, 0);
});

test('normalization clamps quantities, stats, names and purchase counts to the planned scope', () => {
  const state = normalizeLefeState({
    phase: 'bad-phase', communication: 999, socialPressure: -20,
    plannedQuantities: { fabrics: 1, tailoring: 99, familySpecific: 1 },
    purchasedQuantities: { fabrics: 4, tailoring: 99, familySpecific: 2 },
    customItemName: '<img src=x>', customItemCost: 1000000,
  });
  assert.equal(state.phase, 'inactive');
  assert.equal(state.communication, 100);
  assert.equal(state.socialPressure, 0);
  assert.equal(state.plannedQuantities.tailoring, 4);
  assert.equal(state.purchasedQuantities.fabrics, 1);
  assert.equal(state.purchasedQuantities.tailoring, 4);
  assert.equal(state.customItemName.includes('<'), false);
  assert.equal(state.customItemCost, 100000);
});

test('journey only starts for dating or engaged profiles and while off shift', () => {
  const state = createDefaultLefeState();
  assert.equal(beginLefeJourney(state, { day: 1, relationshipStatus: 'single' }).reason, 'relationship_status_required');
  assert.equal(beginLefeJourney(state, { day: 1, relationshipStatus: 'dating', activeShift: true }).reason, 'active_shift');
  assert.equal(beginLefeJourney(state, { day: 1, relationshipStatus: 'engaged' }).ok, true);
});

test('list costs are transparent and changing quantities does not spend money', () => {
  const state = createDefaultLefeState();
  const before = getLefeSummary(state).requestedTotal;
  const begun = beginLefeJourney(state, { day: 1, relationshipStatus: 'dating' });
  const quantities = Object.fromEntries(LEFE_ITEMS.map(item => [item.id, 0]));
  quantities.fabrics = 2;
  const result = saveLefeList(begun.state, { day: 1, relationshipStatus: 'dating', quantities });
  assert.equal(result.ok, true);
  assert.equal(getLefeSummary(result.state).requestedTotal, 960);
  assert.equal(result.state.payments.length, 0);
  assert.ok(before > getLefeSummary(result.state).requestedTotal);
});

test('custom item requires a positive price when its quantity is above zero', () => {
  let state = beginLefeJourney(createDefaultLefeState(), { day: 1, relationshipStatus: 'engaged' }).state;
  const quantities = Object.fromEntries(LEFE_ITEMS.map(item => [item.id, 0]));
  quantities.familySpecific = 1;
  assert.equal(saveLefeList(state, { day: 1, relationshipStatus: 'engaged', quantities, customItemName: 'Family item', customItemCost: 0 }).reason, 'custom_item_needs_price');
  const good = saveLefeList(state, { day: 1, relationshipStatus: 'engaged', quantities, customItemName: 'Family item', customItemCost: 600 });
  assert.equal(good.ok, true);
  assert.equal(getLefeSummary(good.state).requestedTotal, 600);
});

test('a list cannot open if no line items have been selected', () => {
  let state = beginLefeJourney(createDefaultLefeState(), { day: 1, relationshipStatus: 'dating' }).state;
  const quantities = Object.fromEntries(LEFE_ITEMS.map(item => [item.id, 0]));
  state = saveLefeList(state, { day: 1, relationshipStatus: 'dating', quantities }).state;
  assert.equal(openLefeDiscussion(state, { day: 1, relationshipStatus: 'dating' }).reason, 'empty_list');
});

test('opening a discussion creates one family list review scenario', () => {
  const { state, scenario } = makeDiscussion();
  assert.equal(scenario.id, 'family-list-review');
  assert.match(scenario.body, /universal requirements/i);
  const duplicate = getLefeScenarioForDay(state, { day: 1, relationshipStatus: 'dating' });
  assert.equal(duplicate.scenario.id, 'family-list-review');
  assert.equal(duplicate.changed, false);
});

test('asking for a clear breakdown improves communication without changing wallet data', () => {
  const { state } = makeDiscussion();
  const result = resolveCurrent(state, 1, 'request-breakdown');
  assert.equal(result.ok, true);
  assert.equal(result.state.familyPosition, 'open');
  assert.equal(result.state.familyListScenarioSeen, true);
  assert.ok(result.state.communication > state.communication);
  assert.equal(result.state.payments.length, 0);
  assert.equal(getLefeScenarioForDay(result.state, { day: 1, relationshipStatus: 'dating' }).scenario, null);
});

test('proposing a smaller Lefe reduces optional quantities, not the price of every item', () => {
  const { state } = makeDiscussion();
  const oldFabricQty = state.plannedQuantities.fabrics;
  const oldOptional = state.plannedQuantities.henna + state.plannedQuantities.fragrance + state.plannedQuantities.familyRefreshments + state.plannedQuantities.transportPacking;
  const result = resolveCurrent(state, 1, 'propose-smaller-list');
  const newOptional = result.state.plannedQuantities.henna + result.state.plannedQuantities.fragrance + result.state.plannedQuantities.familyRefreshments + result.state.plannedQuantities.transportPacking;
  assert.equal(result.state.plannedQuantities.fabrics, oldFabricQty);
  assert.ok(newOptional < oldOptional);
  assert.equal(result.state.familyPosition, 'negotiating');
});

test('clock follows the saved day and a day with no event is recorded monotonically', () => {
  const { state } = makeDiscussion();
  const first = resolveCurrent(state, 1, 'request-breakdown');
  const day2 = getLefeScenarioForDay(first.state, { day: 2, relationshipStatus: 'dating' });
  assert.equal(day2.ok, true);
  assert.equal(day2.scenario, null);
  assert.equal(day2.state.lastSeenDay, 2);
  assert.equal(getLefeScenarioForDay(day2.state, { day: 1, relationshipStatus: 'dating' }).reason, 'clock_rollback');
});

test('an unresolved scenario can still be answered after the player returns on a later in-game day', () => {
  const { state } = makeDiscussion();
  assert.equal(state.currentScenarioId, 'family-list-review');
  const later = resolveLefeScenario(state, { day: 2, scenarioId: 'family-list-review', choiceId: 'request-breakdown', relationshipStatus: 'dating' });
  assert.equal(later.ok, true);
  assert.equal(later.state.familyListScenarioSeen, true);
  assert.equal(later.state.lastSeenDay, 2);
});

test('the richer-suitor pressure scenario arrives only after two in-game days', () => {
  const { state } = makeDiscussion();
  const first = resolveCurrent(state, 1, 'request-breakdown');
  const day2 = getLefeScenarioForDay(first.state, { day: 2, relationshipStatus: 'dating' });
  assert.equal(day2.scenario, null);
  const day3 = getLefeScenarioForDay(day2.state, { day: 3, relationshipStatus: 'dating', profileGender: 'male' });
  assert.equal(day3.scenario.id, 'richer-suitor');
  assert.match(day3.scenario.body, /wealthier suitor/i);
  assert.match(day3.scenario.body, /not property/i);
});

test('richer-suitor story copy adapts to a female driver without assuming she must leave transport work', () => {
  const { state } = makeDiscussion();
  const first = resolveCurrent(state, 1, 'request-breakdown');
  const day2 = getLefeScenarioForDay(first.state, { day: 2, relationshipStatus: 'dating' });
  const day3 = getLefeScenarioForDay(day2.state, { day: 3, relationshipStatus: 'dating', profileGender: 'female' });
  assert.match(day3.scenario.body, /financial readiness/i);
  assert.match(day3.scenario.body, /dignity/i);
});

test('partner may choose the better-funded proposal; the outcome is recorded without coercion', () => {
  const { state } = makeDiscussion();
  const first = resolveCurrent(state, 1, 'request-breakdown');
  const day2 = getLefeScenarioForDay(first.state, { day: 2, relationshipStatus: 'dating' });
  const day3 = getLefeScenarioForDay(day2.state, { day: 3, relationshipStatus: 'dating' });
  const lost = resolveCurrent(day3.state, 3, 'partner-chooses-richer-suitor');
  assert.equal(lost.ok, true);
  assert.equal(lost.state.phase, 'ended');
  assert.equal(lost.state.partnerDecision, 'chose_other');
  assert.equal(lost.state.outcome, 'partner_chose_other');
  assert.match(lost.message, /not property/i);
});

test('parental delay produces a follow-up negotiation rather than deciding for the partner', () => {
  const { state } = makeDiscussion();
  const first = resolveCurrent(state, 1, 'request-breakdown');
  const day2 = getLefeScenarioForDay(first.state, { day: 2, relationshipStatus: 'dating' });
  const day3 = getLefeScenarioForDay(day2.state, { day: 3, relationshipStatus: 'dating' });
  const delayed = resolveCurrent(day3.state, 3, 'parents-delay');
  assert.equal(delayed.state.familyPosition, 'wants_more');
  assert.equal(delayed.state.partnerDecision, 'considering');
  const day4 = getLefeScenarioForDay(delayed.state, { day: 4, relationshipStatus: 'dating' });
  assert.equal(day4.scenario.id, 'family-pressure-followup');
});

test('family refusal records parental pressure without assigning the partner a choice', () => {
  const { state } = makeDiscussion();
  const first = resolveCurrent(state, 1, 'request-breakdown');
  const day2 = getLefeScenarioForDay(first.state, { day: 2, relationshipStatus: 'dating' });
  const day3 = getLefeScenarioForDay(day2.state, { day: 3, relationshipStatus: 'dating' });
  const refused = resolveCurrent(day3.state, 3, 'parents-refuse-budget');
  assert.equal(refused.state.familyPosition, 'wants_more');
  assert.equal(refused.state.partnerDecision, 'considering');
  assert.match(refused.message, /not proof of the woman.s own choice/i);
});

test('mutual partner commitment cannot be recorded without explicit confirmation', () => {
  const { state } = makeDiscussion();
  assert.equal(recordMutualPartnerCommitment(state, { day: 1, relationshipStatus: 'dating', mutualConsent: false }).reason, 'mutual_consent_required');
  assert.equal(recordMutualPartnerCommitment(state, { day: 1, relationshipStatus: 'dating', activeShift: true, mutualConsent: true }).reason, 'active_shift');
  const accepted = recordMutualPartnerCommitment(state, { day: 1, relationshipStatus: 'dating', mutualConsent: true });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.state.partnerDecision, 'committed');
});

test('the list cannot be agreed without engaged status and a recorded partner commitment', () => {
  const { state } = makeDiscussion();
  const opened = resolveCurrent(state, 1, 'request-breakdown');
  assert.equal(agreeLefeList(opened.state, { day: 1, relationshipStatus: 'dating' }).reason, 'engaged_status_required');
  assert.equal(agreeLefeList(opened.state, { day: 1, relationshipStatus: 'engaged' }).reason, 'mutual_partner_commitment_required');
  const committed = recordMutualPartnerCommitment(opened.state, { day: 1, relationshipStatus: 'engaged', mutualConsent: true });
  assert.equal(agreeLefeList(committed.state, { day: 1, relationshipStatus: 'engaged' }).ok, true);
});

test('agreement is blocked while family position is still refusing or reviewing', () => {
  const { state } = makeDiscussion();
  const committed = recordMutualPartnerCommitment(state, { day: 1, relationshipStatus: 'engaged', mutualConsent: true });
  assert.equal(agreeLefeList(committed.state, { day: 1, relationshipStatus: 'engaged' }).reason, 'family_discussion_not_ready');
});

test('purchases use the supplied existing wallet and obey shift, engagement and quantity checks', () => {
  const quantities = Object.fromEntries(LEFE_ITEMS.map(item => [item.id, 0])); quantities.fabrics = 1;
  let { state } = makeDiscussion({ status: 'engaged', quantities });
  state = resolveCurrent(state, 1, 'request-breakdown', 'engaged').state;
  state = recordMutualPartnerCommitment(state, { day: 1, relationshipStatus: 'engaged', mutualConsent: true }).state;
  state = agreeLefeList(state, { day: 1, relationshipStatus: 'engaged' }).state;
  assert.equal(purchaseLefeItem(state, { itemId: 'fabrics', day: 1, relationshipStatus: 'engaged', activeShift: true, wallet: 1200 }).reason, 'active_shift');
  assert.equal(purchaseLefeItem(state, { itemId: 'fabrics', day: 1, relationshipStatus: 'engaged', wallet: 100 }).reason, 'insufficient_wallet');
  const bought = purchaseLefeItem(state, { itemId: 'fabrics', day: 1, relationshipStatus: 'engaged', wallet: 1200 });
  assert.equal(bought.ok, true);
  assert.equal(bought.wallet, 720);
  assert.equal(bought.amount, 480);
  assert.equal(getLefeSummary(bought.state).purchasedTotal, 480);
  assert.equal(purchaseLefeItem(bought.state, { itemId: 'fabrics', day: 1, relationshipStatus: 'engaged', wallet: 720 }).reason, 'quantity_already_purchased');
});

test('family-specific item purchase requires valid cost and cannot exceed planned quantity', () => {
  const quantities = Object.fromEntries(LEFE_ITEMS.map(item => [item.id, 0])); quantities.familySpecific = 1;
  let state = beginLefeJourney(createDefaultLefeState(), { day: 1, relationshipStatus: 'engaged' }).state;
  state = saveLefeList(state, { day: 1, relationshipStatus: 'engaged', quantities, customItemName: 'Cloth package', customItemCost: 600 }).state;
  state = openLefeDiscussion(state, { day: 1, relationshipStatus: 'engaged' }).state;
  const scenario = getLefeScenarioForDay(state, { day: 1, relationshipStatus: 'engaged' }); state = scenario.state;
  state = resolveLefeScenario(state, { day: 1, scenarioId: scenario.scenario.id, choiceId: 'request-breakdown', relationshipStatus: 'engaged' }).state;
  state = recordMutualPartnerCommitment(state, { day: 1, relationshipStatus: 'engaged', mutualConsent: true }).state;
  state = agreeLefeList(state, { day: 1, relationshipStatus: 'engaged' }).state;
  const bought = purchaseLefeItem(state, { itemId: 'familySpecific', day: 1, relationshipStatus: 'engaged', wallet: 1000 });
  assert.equal(bought.amount, 600);
  assert.equal(purchaseLefeItem(bought.state, { itemId: 'familySpecific', day: 1, relationshipStatus: 'engaged', wallet: 400 }).reason, 'quantity_already_purchased');
});

test('preparation completion requires every agreed quantity, but never changes Aure status', () => {
  const quantities = Object.fromEntries(LEFE_ITEMS.map(item => [item.id, 0])); quantities.fabrics = 1;
  let { state } = makeDiscussion({ status: 'engaged', quantities });
  state = resolveCurrent(state, 1, 'request-breakdown', 'engaged').state;
  state = recordMutualPartnerCommitment(state, { day: 1, relationshipStatus: 'engaged', mutualConsent: true }).state;
  state = agreeLefeList(state, { day: 1, relationshipStatus: 'engaged' }).state;
  assert.equal(completeLefePreparation(state, { day: 1, relationshipStatus: 'engaged' }).reason, 'items_remaining');
  state = purchaseLefeItem(state, { itemId: 'fabrics', day: 1, relationshipStatus: 'engaged', wallet: 1200 }).state;
  const completed = completeLefePreparation(state, { day: 1, relationshipStatus: 'engaged' });
  assert.equal(completed.ok, true);
  assert.equal(completed.state.phase, 'complete');
  assert.equal(completed.state.relationshipStatus, 'engaged');
  assert.match(completed.message, /does not force an Aure/i);
});

test('pausing and resuming retains the stage without creating a wallet charge', () => {
  const { state } = makeDiscussion();
  const paused = pauseLefeJourney(state, { day: 1 });
  assert.equal(paused.ok, true);
  assert.equal(paused.state.phase, 'paused');
  const resumed = resumeLefeJourney(paused.state, { day: 2, relationshipStatus: 'dating' });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.state.phase, 'discussion');
  assert.equal(resumed.state.payments.length, 0);
});

test('actions are locked if the profile changes to a non-eligible status or the in-game clock rolls back', () => {
  const { state } = makeDiscussion();
  assert.equal(getLefeScenarioForDay(state, { day: 1, relationshipStatus: 'single' }).reason, 'relationship_status_changed');
  const advanced = normalizeLefeState({ ...state, lastSeenDay: 3 });
  assert.equal(pauseLefeJourney(advanced, { day: 2 }).reason, 'clock_rollback');
});

test('history stays bounded and the exported report omits partner names and private contacts', () => {
  const seed = createDefaultLefeState(); seed.history = Array.from({ length: LEFE_HISTORY_LIMIT + 20 }, (_, i) => ({ day: i + 1, type: 'test', text: 'entry' }));
  const state = normalizeLefeState(seed);
  assert.equal(state.history.length, LEFE_HISTORY_LIMIT);
  const report = exportLefeReport(state, { day: 5, relationshipStatus: 'dating', profileGender: 'male' });
  assert.equal(report.schema, 'kano-life-lefe-report-v1');
  assert.equal('partnerName' in report, false);
  assert.equal('phoneNumber' in report, false);
});
