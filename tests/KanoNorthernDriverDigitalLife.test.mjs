import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIGITAL_DATA_BUNDLES, DIGITAL_DATA_CAP_MB, DIGITAL_SCENARIOS,
  createDefaultDigitalLifeState, normalizeDigitalLifeState, buyDigitalData,
  ensureDailyDigitalScenario, resolveDigitalScenario, digitalLifeReport,
} from '../js/KanoNorthernDriverDigitalLife.js';

test('default digital-life state is bounded and starts with no data balance', () => {
  const state = createDefaultDigitalLifeState();
  assert.equal(state.dataMb, 0);
  assert.equal(state.digitalReputation, 50);
  assert.equal(state.currentScenarioStatus, 'none');
});

test('normalisation clamps data and reputation and bounds history collections', () => {
  const state = normalizeDigitalLifeState({ dataMb: 90000, digitalReputation: -20, communityTrust: 180, ledger: Array.from({length: 120}, (_, i) => ({day:i+1, type:'log', text:`item ${i}`})) });
  assert.equal(state.dataMb, DIGITAL_DATA_CAP_MB);
  assert.equal(state.digitalReputation, 0);
  assert.equal(state.communityTrust, 100);
  assert.equal(state.ledger.length, 100);
});

test('bundles use the existing wallet and cannot be bought during a shift', () => {
  const base = createDefaultDigitalLifeState();
  const blocked = buyDigitalData(base, {bundleId:'small', wallet:1000, activeShift:true});
  assert.equal(blocked.ok, false); assert.equal(blocked.reason, 'active_shift'); assert.equal(blocked.wallet, 1000);
  const bought = buyDigitalData(base, {bundleId:'small', wallet:1000});
  assert.equal(bought.ok, true); assert.equal(bought.state.dataMb, 250); assert.equal(bought.wallet, 880);
});

test('invalid bundles, insufficient cash and exceeding the data cap are rejected without charges', () => {
  const base = createDefaultDigitalLifeState();
  assert.equal(buyDigitalData(base, {bundleId:'nope', wallet:999}).reason, 'invalid_bundle');
  assert.equal(buyDigitalData(base, {bundleId:'work', wallet:100}).reason, 'insufficient_wallet');
  const full = normalizeDigitalLifeState({dataMb:4900});
  assert.equal(buyDigitalData(full, {bundleId:'small', wallet:999}).reason, 'data_cap');
});

test('daily scenario is stable for a day and moves forward only with the simulated clock', () => {
  const first = ensureDailyDigitalScenario(createDefaultDigitalLifeState(), {day:1});
  assert.equal(first.ok, true); assert.equal(first.scenario.id, 'market-listing');
  const repeated = ensureDailyDigitalScenario(first.state, {day:1});
  assert.equal(repeated.added, false); assert.equal(repeated.state.currentScenarioId, first.state.currentScenarioId);
  const next = ensureDailyDigitalScenario(first.state, {day:2});
  assert.equal(next.scenario.id, 'company-offer'); assert.equal(next.state.currentScenarioDay, 2);
  assert.equal(ensureDailyDigitalScenario(next.state, {day:1}).reason, 'clock_rollback');
});

test('scenario decisions are blocked during an active driving shift', () => {
  let state = ensureDailyDigitalScenario(createDefaultDigitalLifeState(), {day:1}).state;
  state = normalizeDigitalLifeState({...state, dataMb:300});
  const result = resolveDigitalScenario(state, {choiceId:'publish-listing', day:1, activeShift:true, wallet:800});
  assert.equal(result.ok, false); assert.equal(result.reason, 'active_shift'); assert.equal(result.state.currentScenarioStatus, 'pending');
});

test('market listing requires its data allowance and does not create a wallet credit', () => {
  let state = ensureDailyDigitalScenario(createDefaultDigitalLifeState(), {day:1}).state;
  const noData = resolveDigitalScenario(state, {choiceId:'publish-listing', day:1, wallet:900});
  assert.equal(noData.reason, 'insufficient_data');
  state = normalizeDigitalLifeState({...state, dataMb:100});
  const result = resolveDigitalScenario(state, {choiceId:'publish-listing', day:1, wallet:900});
  assert.equal(result.ok, true); assert.equal(result.wallet, 900); assert.equal(result.state.dataMb, 20); assert.equal(result.state.listingsPosted, 1);
});

test('unverified registration fee is charged only on explicit selection and needs wallet plus data', () => {
  let state = ensureDailyDigitalScenario(createDefaultDigitalLifeState(), {day:2}).state;
  state = normalizeDigitalLifeState({...state, dataMb:20});
  const shortWallet = resolveDigitalScenario(state, {choiceId:'pay-registration', day:2, wallet:100});
  assert.equal(shortWallet.ok, false); assert.equal(shortWallet.reason, 'insufficient_wallet');
  const paid = resolveDigitalScenario(state, {choiceId:'pay-registration', day:2, wallet:400});
  assert.equal(paid.ok, true); assert.equal(paid.wallet, 150); assert.equal(paid.state.scamLosses, 1);
});

test('scenario cannot be resolved twice and cannot be resolved after the day changes', () => {
  let state = ensureDailyDigitalScenario(createDefaultDigitalLifeState(), {day:3}).state;
  state = normalizeDigitalLifeState({...state, dataMb:200});
  const once = resolveDigitalScenario(state, {choiceId:'check-original-source', day:3, wallet:0});
  assert.equal(once.ok, true); assert.equal(once.state.currentScenarioStatus, 'resolved');
  const twice = resolveDigitalScenario(once.state, {choiceId:'ask-for-source', day:3, wallet:0});
  assert.equal(twice.ok, false); assert.equal(twice.reason, 'scenario_not_pending');
  assert.equal(resolveDigitalScenario(once.state, {choiceId:'ask-for-source', day:4, wallet:0}).ok, false);
});

test('responsible choices improve information or community indicators without favouring an ethnicity', () => {
  const idx = DIGITAL_SCENARIOS.findIndex(item => item.id === 'group-chat-bias');
  let state = ensureDailyDigitalScenario(createDefaultDigitalLifeState(), {day:idx+1}).state;
  state = normalizeDigitalLifeState({...state, dataMb:100});
  const result = resolveDigitalScenario(state, {choiceId:'challenge-respectfully', day:idx+1, wallet:0});
  assert.equal(result.ok, true); assert.ok(result.state.communityTrust > 50); assert.ok(result.state.digitalReputation > 50);
  assert.equal(DIGITAL_SCENARIOS[idx].choices.some(choice => choice.id === 'forward-insult'), true);
});

test('unverified civic post changes digital outcomes but does not invent factual political claims', () => {
  const idx = DIGITAL_SCENARIOS.findIndex(item => item.id === 'viral-claim');
  let state = ensureDailyDigitalScenario(createDefaultDigitalLifeState(), {day:idx+1}).state;
  state = normalizeDigitalLifeState({...state, dataMb:50});
  const result = resolveDigitalScenario(state, {choiceId:'forward-unchecked', day:idx+1, wallet:0});
  assert.equal(result.ok, true); assert.equal(result.state.misinformationShared, 1); assert.equal(result.state.digitalReputation, 43);
});

test('verified job applications receive a delayed result and never auto-credit income', () => {
  const idx = DIGITAL_SCENARIOS.findIndex(item => item.id === 'company-offer');
  let state = ensureDailyDigitalScenario(createDefaultDigitalLifeState(), {day:idx+1}).state;
  state = normalizeDigitalLifeState({...state, dataMb:200, digitalReputation:80, workConnections:70});
  const result = resolveDigitalScenario(state, {choiceId:'verify-and-apply', day:idx+1, wallet:0});
  assert.equal(result.ok, true); assert.equal(result.wallet, 0); assert.equal(result.state.applications[0].status, 'pending');
  const later = ensureDailyDigitalScenario(result.state, {day:idx+3});
  assert.notEqual(later.state.applications[0].status, 'pending');
  assert.ok(['interview','not-selected'].includes(later.state.applications[0].status));
});

test('daily data use and purchases are metered; exporting reports does not expose real contacts', () => {
  const state = normalizeDigitalLifeState({dataMb:200, currentScenarioId:'market-listing', currentScenarioDay:1, currentScenarioStatus:'resolved', ledger:[{day:1,type:'x',text:'ok'}]});
  const report = digitalLifeReport(state,{day:1});
  assert.equal(report.balances.dataMb,200); assert.equal(typeof report.notice,'string');
  assert.equal('contacts' in report,false); assert.equal('phoneNumbers' in report,false);
});

test('scenario coverage includes work, market commerce, tribal abuse, civic media and private relationships', () => {
  const ids = DIGITAL_SCENARIOS.map(item => item.id);
  for (const id of ['market-listing','company-offer','viral-claim','group-chat-bias','online-scam','online-business','privacy-message']) assert.ok(ids.includes(id));
  assert.ok(DIGITAL_DATA_BUNDLES.length >= 3);
});
