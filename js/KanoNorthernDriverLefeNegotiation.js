/**
 * Kano Life — Step 70: Lefe (Aure list) negotiation.
 * Pure local-state logic. Prices are fictional game-balancing values, not a
 * universal Hausa list or a statement of current market prices. A partner's
 * decision is explicit and never determined solely by wealth or family pressure.
 */
export const LEFE_STORAGE_KEY = 'kano-life-lefe-negotiation-v1';
export const LEFE_HISTORY_LIMIT = 100;
export const LEFE_QUANTITY_LIMIT = 4;
export const LEFE_CUSTOM_PRICE_LIMIT = 100_000;

export const LEFE_ITEMS = Object.freeze([
  { id: 'fabrics', label: 'Fabric set / wrappers', price: 480, defaultQuantity: 1, optional: false, note: 'A possible clothing item; each family sets its own expectations.' },
  { id: 'tailoring', label: 'Tailoring / sewn outfit', price: 550, defaultQuantity: 1, optional: false, note: 'Can be reduced or supplied in a different agreed form.' },
  { id: 'headscarf', label: 'Headscarf / veil', price: 220, defaultQuantity: 1, optional: false, note: 'Only include what the couple and families agree.' },
  { id: 'footwear', label: 'Footwear / sandals', price: 360, defaultQuantity: 1, optional: false, note: 'A suggested line item, not a rule for every marriage.' },
  { id: 'henna', label: 'Henna / personal-care items', price: 250, defaultQuantity: 1, optional: true, note: 'Optional and dependent on personal preference.' },
  { id: 'fragrance', label: 'Fragrance / toiletries', price: 280, defaultQuantity: 1, optional: true, note: 'Optional; agree on suitable products and cost.' },
  { id: 'accessories', label: 'Jewellery / accessories', price: 500, defaultQuantity: 0, optional: true, note: 'Optional; there is no universal required quantity.' },
  { id: 'householdTextiles', label: 'Household textiles / bedding', price: 650, defaultQuantity: 0, optional: true, note: 'May be part of some family lists and absent from others.' },
  { id: 'familyRefreshments', label: 'Food / refreshments for family', price: 700, defaultQuantity: 1, optional: true, note: 'A planning estimate, not an official fee.' },
  { id: 'transportPacking', label: 'Packing / transport preparation', price: 350, defaultQuantity: 1, optional: true, note: 'A practical preparation allowance.' },
  { id: 'familySpecific', label: 'Family-specific requested item(s)', price: 0, defaultQuantity: 0, optional: true, note: 'Name and price are editable because families differ.' },
]);

const ITEM_IDS = new Set(LEFE_ITEMS.map(item => item.id));
const PHASES = new Set(['inactive', 'preparing', 'discussion', 'paused', 'agreed', 'ended', 'complete']);
const FAMILY_POSITIONS = new Set(['unknown', 'reviewing', 'open', 'negotiating', 'wants_more', 'agreed']);
const PARTNER_DECISIONS = new Set(['undecided', 'considering', 'committed', 'chose_other']);
const SCENARIOS = Object.freeze({
  'family-list-review': {
    id: 'family-list-review',
    kicker: 'AURE · LEFE DISCUSSION',
    title: 'The proposed Lefe list is bigger than your budget',
    body: 'Your partner’s family reviews the proposed items. Some may be important to them, while others may be customary preferences rather than universal requirements. You can request a clear list, suggest a smaller scope, involve trusted elders by mutual agreement, or pause rather than take on unmanageable debt.',
    choices: [
      { id: 'request-breakdown', label: 'Ask which items are essential', summary: 'Request an item-by-item explanation and room to discuss preferences.' },
      { id: 'propose-smaller-list', label: 'Propose a smaller, affordable Lefe', summary: 'Reduce optional quantities instead of pretending the same list costs less.' },
      { id: 'seek-elder-mediation', label: 'Invite trusted elders to mediate', summary: 'Ask for a voluntary family discussion centred on affordability and respect.' },
      { id: 'pause-save', label: 'Pause and save before continuing', summary: 'Avoid rushed borrowing and revisit the plan later.' },
    ],
  },
  'richer-suitor': {
    id: 'richer-suitor',
    kicker: 'AURE · RELATIONSHIP PRESSURE',
    title: 'A better-funded suitor enters the picture',
    body: 'A wealthier suitor offers to meet a larger Lefe. Your partner’s family compares financial capacity, and the relationship comes under pressure. Your partner may stay with the existing relationship, ask for time, or choose the other proposal. A partner is not property: family pressure can shape the situation, but the partner’s own choice matters.',
    choices: [
      { id: 'partner-stays', label: 'Your partner confirms they want to continue', summary: 'Record a clear mutual decision and return to an affordable family discussion.' },
      { id: 'private-partner-conversation', label: 'Talk privately and honestly first', summary: 'Discuss commitment, finances and each person’s wishes without coercion.' },
      { id: 'partner-chooses-richer-suitor', label: 'Your partner chooses the other proposal', summary: 'End this Lefe journey respectfully; record the loss without humiliation or revenge.' },
      { id: 'parents-delay', label: 'The family asks to delay the decision', summary: 'Record further family pressure while keeping the partner’s choice unresolved.' },
      { id: 'parents-refuse-budget', label: 'Her parents refuse the current budget', summary: 'Record family refusal without assuming the partner agrees or ending the relationship automatically.' },
    ],
  },
  'family-pressure-followup': {
    id: 'family-pressure-followup',
    kicker: 'AURE · FAMILY NEGOTIATION',
    title: 'The family still wants more than you can afford',
    body: 'A family member says the current proposal is insufficient. You can request voluntary mediation, keep to a realistic budget, add a specific agreed item, or pause. No option guarantees acceptance, and borrowing beyond your means is not treated as a virtue.',
    choices: [
      { id: 'mediation', label: 'Request voluntary mediation', summary: 'Try another calm discussion with a trusted, mutually acceptable elder.' },
      { id: 'hold-affordable-budget', label: 'Keep the plan within your means', summary: 'Protect working capital and personal dignity while leaving room for consent.' },
      { id: 'increase-offer', label: 'Consider one more specific item', summary: 'Add a custom item for discussion; review its cost before agreeing or buying.' },
      { id: 'pause-save', label: 'Pause instead of borrowing under pressure', summary: 'Keep the relationship decision open while you reassess affordability.' },
    ],
  },
});

const clamp = (value, low, high, fallback = low) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(low, Math.min(high, Math.floor(n))) : fallback;
};
const cleanText = (value, max = 100) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const safeDay = value => clamp(value, 1, 1_000_000, 1);
const clone = value => JSON.parse(JSON.stringify(value));
const stat = value => clamp(value, 0, 100, 50);
const normQuantities = (input, initial = false) => Object.fromEntries(LEFE_ITEMS.map(item => [
  item.id,
  clamp(input?.[item.id], 0, LEFE_QUANTITY_LIMIT, initial ? item.defaultQuantity : 0),
]));

export function createDefaultLefeState() {
  return normalizeLefeState({});
}

export function normalizeLefeState(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const payments = Array.isArray(source.payments) ? source.payments.slice(0, LEFE_HISTORY_LIMIT).map(row => ({
    day: safeDay(row?.day), itemId: ITEM_IDS.has(String(row?.itemId)) ? String(row.itemId) : 'familySpecific',
    quantity: clamp(row?.quantity, 1, LEFE_QUANTITY_LIMIT, 1), amount: clamp(row?.amount, 0, 1_000_000, 0),
    text: cleanText(row?.text, 140),
  })) : [];
  const history = Array.isArray(source.history) ? source.history.slice(0, LEFE_HISTORY_LIMIT).map(row => ({
    day: safeDay(row?.day), type: cleanText(row?.type, 50), text: cleanText(row?.text, 220),
  })) : [];
  const phase = PHASES.has(String(source.phase)) ? String(source.phase) : 'inactive';
  const lastScenarioId = Object.hasOwn(SCENARIOS, String(source.currentScenarioId)) ? String(source.currentScenarioId) : '';
  const resolvedDays = Array.isArray(source.resolvedScenarioDays)
    ? [...new Set(source.resolvedScenarioDays.map(safeDay))].slice(-LEFE_HISTORY_LIMIT) : [];
  const planned = normQuantities(source.plannedQuantities, true);
  const purchasedInput = normQuantities(source.purchasedQuantities);
  const purchased = Object.fromEntries(LEFE_ITEMS.map(item => [item.id, Math.min(planned[item.id], purchasedInput[item.id])]));
  return {
    version: 1,
    phase,
    pausedFromPhase: ['preparing', 'discussion'].includes(String(source.pausedFromPhase)) ? String(source.pausedFromPhase) : 'preparing',
    relationshipStatus: ['dating', 'engaged', 'married', 'single', 'separated', 'divorced'].includes(String(source.relationshipStatus)) ? String(source.relationshipStatus) : 'single',
    startedDay: source.startedDay == null ? null : safeDay(source.startedDay),
    lastSeenDay: safeDay(source.lastSeenDay),
    currentScenarioId: lastScenarioId,
    currentScenarioDay: source.currentScenarioDay == null || Number(source.currentScenarioDay) <= 0 ? 0 : safeDay(source.currentScenarioDay),
    resolvedScenarioDays: resolvedDays,
    familyListScenarioSeen: Boolean(source.familyListScenarioSeen),
    richerSuitorSeen: Boolean(source.richerSuitorSeen),
    familyPosition: FAMILY_POSITIONS.has(String(source.familyPosition)) ? String(source.familyPosition) : 'unknown',
    partnerDecision: PARTNER_DECISIONS.has(String(source.partnerDecision)) ? String(source.partnerDecision) : 'undecided',
    mediationRequested: Boolean(source.mediationRequested),
    plannedQuantities: planned,
    purchasedQuantities: purchased,
    customItemName: cleanText(source.customItemName || 'Family-specific item', 80) || 'Family-specific item',
    customItemCost: clamp(source.customItemCost, 0, LEFE_CUSTOM_PRICE_LIMIT, 0),
    communication: stat(source.communication ?? 50),
    familyUnderstanding: stat(source.familyUnderstanding ?? 50),
    partnerTrust: stat(source.partnerTrust ?? 50),
    autonomy: stat(source.autonomy ?? 50),
    wellbeing: stat(source.wellbeing ?? 55),
    socialPressure: stat(source.socialPressure ?? 30),
    lastActionDay: source.lastActionDay == null ? 0 : safeDay(source.lastActionDay),
    outcome: cleanText(source.outcome, 100),
    payments,
    history,
  };
}

function addHistory(state, day, type, text) {
  state.history.unshift({ day: safeDay(day), type: cleanText(type, 50), text: cleanText(text, 220) });
  state.history = state.history.slice(0, LEFE_HISTORY_LIMIT);
}
function shiftError(activeShift) { return Boolean(activeShift); }
function relationshipEligible(status) { return ['dating', 'engaged'].includes(String(status)); }
function itemUnitPrice(itemId, state) {
  if (itemId === 'familySpecific') return state.customItemCost;
  return LEFE_ITEMS.find(item => item.id === itemId)?.price ?? 0;
}

export function getLefeSummary(rawState = {}) {
  const state = normalizeLefeState(rawState);
  const items = LEFE_ITEMS.map(item => {
    const quantity = state.plannedQuantities[item.id];
    const purchased = state.purchasedQuantities[item.id];
    const unitPrice = itemUnitPrice(item.id, state);
    return { ...item, label: item.id === 'familySpecific' ? state.customItemName : item.label, unitPrice, quantity, purchased, lineTotal: quantity * unitPrice, remainingQuantity: Math.max(0, quantity - purchased) };
  });
  const requestedTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const purchasedTotal = state.payments.reduce((sum, row) => sum + row.amount, 0);
  const plannedItemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const purchasedCount = items.reduce((sum, item) => sum + Math.min(item.quantity, item.purchased), 0);
  const remainingTotal = items.reduce((sum, item) => sum + item.remainingQuantity * item.unitPrice, 0);
  return { items, requestedTotal, purchasedTotal, plannedItemCount, purchasedCount, remainingTotal, allPurchased: plannedItemCount > 0 && items.every(item => item.purchased >= item.quantity) };
}

export function beginLefeJourney(rawState, { day = 1, relationshipStatus = 'single', activeShift = false } = {}) {
  const state = normalizeLefeState(rawState);
  const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (shiftError(activeShift)) return { ok: false, reason: 'active_shift', state };
  if (!relationshipEligible(relationshipStatus)) return { ok: false, reason: 'relationship_status_required', state };
  if (state.phase !== 'inactive') return { ok: false, reason: 'journey_already_started', state };
  state.phase = 'preparing'; state.relationshipStatus = String(relationshipStatus); state.startedDay = d; state.lastSeenDay = d;
  addHistory(state, d, 'journey_started', 'Started a custom Lefe planning journey. No money was deducted.');
  return { ok: true, state, message: 'Lefe planning started. Build a family-specific list that both adults can discuss.' };
}

export function resumeLefeJourney(rawState, { day = 1, relationshipStatus = 'single', activeShift = false } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (state.phase !== 'paused') return { ok: false, reason: 'not_paused', state };
  if (!relationshipEligible(relationshipStatus)) return { ok: false, reason: 'relationship_status_required', state };
  state.phase = state.pausedFromPhase; state.relationshipStatus = String(relationshipStatus); state.lastSeenDay = d;
  addHistory(state, d, 'journey_resumed', 'Resumed the Lefe discussion at the previous stage.');
  return { ok: true, state, message: 'Lefe planning resumed.' };
}

export function pauseLefeJourney(rawState, { day = 1, activeShift = false } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (!['preparing', 'discussion'].includes(state.phase)) return { ok: false, reason: 'not_active', state };
  state.pausedFromPhase = state.phase; state.phase = 'paused'; state.lastSeenDay = d;
  addHistory(state, d, 'journey_paused', 'Paused preparations rather than accept pressure or spend before ready.');
  state.wellbeing = stat(state.wellbeing + 2); state.autonomy = stat(state.autonomy + 2);
  return { ok: true, state, message: 'Preparations paused. You can return when it is practical.' };
}

export function saveLefeList(rawState, { day = 1, relationshipStatus = 'single', activeShift = false, quantities = {}, customItemName = '', customItemCost = 0 } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (!relationshipEligible(relationshipStatus)) return { ok: false, reason: 'relationship_status_required', state };
  if (!['preparing', 'discussion'].includes(state.phase)) return { ok: false, reason: 'list_locked', state };
  const plannedQuantities = normQuantities(quantities);
  const customName = cleanText(customItemName || 'Family-specific item', 80) || 'Family-specific item';
  const customCost = clamp(customItemCost, 0, LEFE_CUSTOM_PRICE_LIMIT, -1);
  if (plannedQuantities.familySpecific > 0 && customCost <= 0) return { ok: false, reason: 'custom_item_needs_price', state };
  state.plannedQuantities = plannedQuantities; state.customItemName = customName; state.customItemCost = customCost < 0 ? 0 : customCost;
  state.relationshipStatus = String(relationshipStatus); state.lastSeenDay = d;
  addHistory(state, d, 'list_saved', 'Saved the editable Lefe list. No items were purchased.');
  return { ok: true, state, summary: getLefeSummary(state), message: 'Lefe list saved. The list is a family-specific proposal, not a universal requirement.' };
}

export function openLefeDiscussion(rawState, { day = 1, relationshipStatus = 'single', activeShift = false } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (!relationshipEligible(relationshipStatus)) return { ok: false, reason: 'relationship_status_required', state };
  if (state.phase !== 'preparing') return { ok: false, reason: 'not_preparing', state };
  const summary = getLefeSummary(state);
  if (summary.requestedTotal <= 0) return { ok: false, reason: 'empty_list', state };
  state.phase = 'discussion'; state.relationshipStatus = String(relationshipStatus); state.familyPosition = 'reviewing'; state.lastSeenDay = d;
  addHistory(state, d, 'family_discussion_opened', 'Opened a voluntary discussion about the proposed Lefe list.');
  return { ok: true, state, message: 'Family discussion opened. Listen, explain your means and protect both partners’ right to choose.' };
}

export function getLefeScenarioForDay(rawState, { day = 1, relationshipStatus = 'single', profileGender = 'male' } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state, scenario: null };
  if (state.phase !== 'discussion') return { ok: true, state, scenario: null, changed: false };
  if (!relationshipEligible(relationshipStatus)) return { ok: false, reason: 'relationship_status_changed', state, scenario: null };
  if (state.currentScenarioId && !state.resolvedScenarioDays.includes(state.currentScenarioDay)) {
    const current = SCENARIOS[state.currentScenarioId];
    return { ok: true, state, scenario: current ? localizeScenario(current, profileGender) : null, changed: false };
  }
  if (state.resolvedScenarioDays.includes(d)) return { ok: true, state, scenario: null, changed: false };
  let scenario = null;
  const elapsed = Math.max(0, d - (state.startedDay || d));
  if (!state.familyListScenarioSeen) scenario = SCENARIOS['family-list-review'];
  else if (!state.richerSuitorSeen && elapsed >= 2) scenario = SCENARIOS['richer-suitor'];
  else if (state.richerSuitorSeen && state.familyPosition === 'wants_more') scenario = SCENARIOS['family-pressure-followup'];
  if (!scenario) {
    const changed = d > state.lastSeenDay;
    if (changed) state.lastSeenDay = d;
    return { ok: true, state, scenario: null, changed };
  }
  state.currentScenarioId = scenario.id; state.currentScenarioDay = d; state.lastSeenDay = d;
  return { ok: true, state, scenario: localizeScenario(scenario, profileGender), changed: true };
}
function localizeScenario(scenario, profileGender) {
  const result = clone(scenario);
  if (scenario.id === 'richer-suitor' && String(profileGender).toLowerCase() === 'female') {
    result.body = 'Your partner’s family compares your financial readiness with a better-funded suitor. You may feel judged because you drive a keke or earn less. Your partner and their family still need to make their own choices; your dignity does not depend on matching another person’s spending.';
  } else if (scenario.id === 'richer-suitor' && !['male', 'female'].includes(String(profileGender).toLowerCase())) {
    result.body = 'A better-funded suitor offers to meet a larger Lefe, and your relationship comes under pressure. Your partner may stay, ask for time or choose the other proposal. Wealth does not decide the relationship by itself; the partner’s own choice matters.';
  }
  return result;
}

function lowerOptionalScope(state) {
  const candidates = ['accessories', 'householdTextiles', 'familyRefreshments', 'transportPacking', 'fragrance', 'henna', 'familySpecific'];
  const reduced = [];
  for (const id of candidates) {
    if (state.plannedQuantities[id] > 0) {
      state.plannedQuantities[id] -= 1;
      reduced.push(id);
    }
  }
  return reduced;
}
function raiseCustomItem(state) {
  if (state.plannedQuantities.familySpecific < LEFE_QUANTITY_LIMIT) state.plannedQuantities.familySpecific += 1;
  if (state.customItemCost <= 0) state.customItemCost = 500;
  if (!state.customItemName || state.customItemName === 'Family-specific item') state.customItemName = 'Additional family-requested item';
}

export function resolveLefeScenario(rawState, { day = 1, scenarioId = '', choiceId = '', relationshipStatus = 'single' } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (state.phase !== 'discussion') return { ok: false, reason: 'journey_not_discussing', state };
  if (!relationshipEligible(relationshipStatus)) return { ok: false, reason: 'relationship_status_changed', state };
  if (!state.currentScenarioId || state.currentScenarioId !== String(scenarioId)) return { ok: false, reason: 'scenario_mismatch', state };
  if (state.resolvedScenarioDays.includes(d)) return { ok: false, reason: 'scenario_already_resolved', state };
  const scenario = SCENARIOS[state.currentScenarioId];
  if (!scenario?.choices.some(item => item.id === String(choiceId))) return { ok: false, reason: 'invalid_choice', state };
  const id = String(choiceId);
  let message = '';
  if (scenario.id === 'family-list-review') {
    state.familyListScenarioSeen = true;
    if (id === 'request-breakdown') {
      state.familyPosition = 'open'; state.familyUnderstanding += 7; state.communication += 6; state.socialPressure -= 2;
      message = 'The family agrees to explain the list item by item. Items can be preferences, not universal requirements.';
    } else if (id === 'propose-smaller-list') {
      const reduced = lowerOptionalScope(state);
      state.familyPosition = 'negotiating'; state.familyUnderstanding += 3; state.communication += 5; state.autonomy += 3;
      message = reduced.length ? `A smaller scope was proposed by reducing optional quantities (${reduced.length} line items). Review and save the list before any purchase.` : 'A smaller scope was proposed, but no optional quantity was available to reduce. Edit the list manually before agreeing.';
    } else if (id === 'seek-elder-mediation') {
      state.familyPosition = 'open'; state.mediationRequested = true; state.familyUnderstanding += 8; state.communication += 4; state.socialPressure -= 5;
      message = 'Voluntary mediation was requested. Both partners and families can state their expectations.';
    } else if (id === 'pause-save') {
      state.pausedFromPhase = 'discussion'; state.phase = 'paused'; state.autonomy += 5; state.wellbeing += 4; state.socialPressure -= 3;
      message = 'You paused preparations to save and reassess. No debt or expense was added.';
    }
  } else if (scenario.id === 'richer-suitor') {
    state.richerSuitorSeen = true;
    if (id === 'partner-stays') {
      state.partnerDecision = 'committed'; state.partnerTrust += 10; state.communication += 4; state.familyPosition = 'negotiating'; state.socialPressure += 2;
      message = 'Your partner explicitly chooses to continue with you. The next step is a fair, affordable family discussion.';
    } else if (id === 'private-partner-conversation') {
      state.partnerDecision = 'considering'; state.communication += 8; state.autonomy += 4; state.wellbeing += 1;
      message = 'You arranged an honest private conversation. The decision remains open until both adults speak clearly.';
    } else if (id === 'partner-chooses-richer-suitor') {
      state.partnerDecision = 'chose_other'; state.phase = 'ended'; state.outcome = 'partner_chose_other'; state.partnerTrust -= 12; state.wellbeing -= 6; state.autonomy += 3;
      message = 'Your partner chose the other proposal. The relationship is not property; the decision hurts, but it is theirs. You can step back without revenge or humiliation.';
    } else if (id === 'parents-delay') {
      state.familyPosition = 'wants_more'; state.partnerDecision = state.partnerDecision === 'committed' ? 'committed' : 'considering'; state.socialPressure += 9; state.familyUnderstanding -= 2;
      message = 'The family delayed its decision. Ask your partner directly what they want instead of treating family pressure as their answer.';
    } else if (id === 'parents-refuse-budget') {
      state.familyPosition = 'wants_more'; state.partnerDecision = state.partnerDecision === 'committed' ? 'committed' : 'considering'; state.socialPressure += 10; state.familyUnderstanding -= 6; state.wellbeing -= 2;
      message = 'Her parents refused the current budget. That is the family’s position, not proof of the woman’s own choice; speak honestly with your partner and do not assume or pressure her.';
    }
  } else if (scenario.id === 'family-pressure-followup') {
    if (id === 'mediation') {
      state.mediationRequested = true; state.familyPosition = 'negotiating'; state.familyUnderstanding += 8; state.communication += 5; state.socialPressure -= 7;
      message = 'A further voluntary mediation was requested. The agreed list remains editable until both sides consent.';
    } else if (id === 'hold-affordable-budget') {
      state.familyPosition = 'negotiating'; state.autonomy += 8; state.wellbeing += 3; state.socialPressure -= 4;
      message = 'You kept the plan within your means. Acceptance is not guaranteed, but the game will not reward unmanageable borrowing.';
    } else if (id === 'increase-offer') {
      raiseCustomItem(state); state.familyPosition = 'negotiating'; state.familyUnderstanding += 2; state.socialPressure += 3;
      message = 'An extra family-specific item was added to the draft. Review its name, quantity and price before agreeing or buying.';
    } else if (id === 'pause-save') {
      state.pausedFromPhase = 'discussion'; state.phase = 'paused'; state.autonomy += 5; state.wellbeing += 4; state.socialPressure -= 3;
      message = 'You paused further negotiation. No expense, loan or promise was created.';
    }
  }
  for (const key of ['communication', 'familyUnderstanding', 'partnerTrust', 'autonomy', 'wellbeing', 'socialPressure']) state[key] = stat(state[key]);
  state.resolvedScenarioDays.push(d); state.resolvedScenarioDays = [...new Set(state.resolvedScenarioDays)].slice(-LEFE_HISTORY_LIMIT);
  const resolvedId = state.currentScenarioId; state.currentScenarioId = ''; state.currentScenarioDay = 0; state.lastSeenDay = d; state.lastActionDay = d;
  addHistory(state, d, 'scenario_resolved', `${resolvedId}: ${message}`);
  return { ok: true, state, message, scenarioId: resolvedId, choiceId: id };
}

export function recordMutualPartnerCommitment(rawState, { day = 1, relationshipStatus = 'single', activeShift = false, mutualConsent = false } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (!relationshipEligible(relationshipStatus) || state.phase !== 'discussion') return { ok: false, reason: 'journey_not_discussing', state };
  if (mutualConsent !== true) return { ok: false, reason: 'mutual_consent_required', state };
  if (state.partnerDecision === 'chose_other') return { ok: false, reason: 'partner_chose_other', state };
  state.partnerDecision = 'committed'; state.communication = stat(state.communication + 4); state.partnerTrust = stat(state.partnerTrust + 3); state.lastSeenDay = d;
  addHistory(state, d, 'mutual_commitment_recorded', 'Recorded a mutual decision by both adults to continue the relationship discussion.');
  return { ok: true, state, message: 'Mutual commitment recorded. The list and marriage decision still need separate agreement.' };
}

export function agreeLefeList(rawState, { day = 1, relationshipStatus = 'single', activeShift = false } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (String(relationshipStatus) !== 'engaged') return { ok: false, reason: 'engaged_status_required', state };
  if (state.phase !== 'discussion') return { ok: false, reason: 'journey_not_discussing', state };
  if (state.partnerDecision !== 'committed') return { ok: false, reason: 'mutual_partner_commitment_required', state };
  if (!['open', 'negotiating'].includes(state.familyPosition)) return { ok: false, reason: 'family_discussion_not_ready', state };
  const summary = getLefeSummary(state);
  if (summary.requestedTotal <= 0) return { ok: false, reason: 'empty_list', state };
  state.phase = 'agreed'; state.familyPosition = 'agreed'; state.relationshipStatus = String(relationshipStatus); state.lastSeenDay = d;
  addHistory(state, d, 'lefe_list_agreed', `Both partners and family discussion agreed on a customized list estimated at ₦${summary.requestedTotal}. This is not a marriage-status change.`);
  return { ok: true, state, summary, message: 'The customized Lefe list is recorded as agreed. This does not automatically change relationship or marriage status.' };
}

export function purchaseLefeItem(rawState, { itemId = '', day = 1, relationshipStatus = 'single', activeShift = false, wallet = 0 } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day); const id = String(itemId);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (!['engaged', 'married'].includes(String(relationshipStatus))) return { ok: false, reason: 'engagement_required', state };
  if (state.phase !== 'agreed') return { ok: false, reason: 'list_not_agreed', state };
  if (!ITEM_IDS.has(id)) return { ok: false, reason: 'invalid_item', state };
  if (state.purchasedQuantities[id] >= state.plannedQuantities[id]) return { ok: false, reason: 'quantity_already_purchased', state };
  const item = LEFE_ITEMS.find(row => row.id === id);
  const unitPrice = itemUnitPrice(id, state);
  if (id === 'familySpecific' && unitPrice <= 0) return { ok: false, reason: 'custom_item_needs_price', state };
  const amount = Math.max(0, unitPrice);
  const available = clamp(wallet, 0, 1_000_000_000, 0);
  if (available < amount) return { ok: false, reason: 'insufficient_wallet', state, required: amount, available };
  state.purchasedQuantities[id] += 1; state.lastSeenDay = d;
  const itemLabel = id === 'familySpecific' ? state.customItemName : item.label;
  state.payments.unshift({ day: d, itemId: id, quantity: 1, amount, text: `Purchased ${itemLabel}.` });
  state.payments = state.payments.slice(0, LEFE_HISTORY_LIMIT);
  addHistory(state, d, 'lefe_item_purchased', `Purchased ${itemLabel} for ₦${amount}.`);
  return { ok: true, state, wallet: available - amount, amount, itemId: id, itemLabel, message: `${itemLabel} purchased for ₦${amount}. Wallet updated; no second charge is recorded.` };
}

export function completeLefePreparation(rawState, { day = 1, relationshipStatus = 'single', activeShift = false } = {}) {
  const state = normalizeLefeState(rawState); const d = safeDay(day);
  if (d < state.lastSeenDay) return { ok: false, reason: 'clock_rollback', state };
  if (activeShift) return { ok: false, reason: 'active_shift', state };
  if (!['engaged', 'married'].includes(String(relationshipStatus))) return { ok: false, reason: 'engagement_required', state };
  if (state.phase !== 'agreed') return { ok: false, reason: 'list_not_agreed', state };
  const summary = getLefeSummary(state);
  if (!summary.allPurchased) return { ok: false, reason: 'items_remaining', state, remainingTotal: summary.remainingTotal, remainingQuantity: summary.items.reduce((sum, row) => sum + row.remainingQuantity, 0) };
  state.phase = 'complete'; state.lastSeenDay = d; state.outcome = 'lefe_list_completed';
  addHistory(state, d, 'lefe_preparation_completed', 'The agreed Lefe list is purchased. Marriage remains a separate mutual decision.');
  return { ok: true, state, message: 'The agreed Lefe list is complete. This records preparations only; it does not force an Aure or alter relationship status.' };
}

export function exportLefeReport(rawState, { day = 1, relationshipStatus = 'single', profileGender = 'private' } = {}) {
  const state = normalizeLefeState(rawState); const summary = getLefeSummary(state);
  return {
    schema: 'kano-life-lefe-report-v1', day: safeDay(day), relationshipStatus: String(relationshipStatus), profileGender: ['male', 'female'].includes(String(profileGender)) ? String(profileGender) : 'private',
    phase: state.phase, familyPosition: state.familyPosition, partnerDecision: state.partnerDecision,
    metrics: { communication: state.communication, familyUnderstanding: state.familyUnderstanding, partnerTrust: state.partnerTrust, autonomy: state.autonomy, wellbeing: state.wellbeing, socialPressure: state.socialPressure },
    summary: { requestedTotal: summary.requestedTotal, purchasedTotal: summary.purchasedTotal, remainingTotal: summary.remainingTotal, plannedItemCount: summary.plannedItemCount, purchasedCount: summary.purchasedCount },
    items: summary.items.map(({ id, label, price, quantity, purchased, lineTotal, remainingQuantity }) => ({ id, label, price, quantity, purchased, lineTotal, remainingQuantity })),
    history: state.history.map(row => ({ ...row })),
    note: 'Game values are fictional balancing values. The report contains no partner name or real personal contact data.',
  };
}
