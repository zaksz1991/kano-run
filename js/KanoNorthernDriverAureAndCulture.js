/**
 * Kano Life — Aure, relationships, women's wellbeing and cultural daily life.
 * All events involve adults where romance is concerned. Intimate events are non-graphic,
 * consent-aware roleplay. Health prompts are not diagnosis or treatment advice.
 * Game-only prices are deliberately scaled and are not real Kano market prices.
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));
const safeDay = v => clamp(Math.floor(Number(v) || 1), 1, 999999);
const money = v => Math.max(0, Math.round(Number(v) || 0));
const clean = (v, max = 60) => String(v ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));

export const RELATIONSHIP_STATUSES = Object.freeze([
  { id: 'single', label: 'Single', note: 'More independence and control over time and money; may face questions about marriage from relatives and peers.' },
  { id: 'dating', label: 'Dating', note: 'Companionship and emotional support; requires honesty, boundaries, time and clear expectations.' },
  { id: 'engaged', label: 'Engaged / preparing for Aure', note: 'A shared plan toward marriage; wedding and family expectations can bring pressure and expense.' },
  { id: 'married', label: 'Married', note: 'Shared support and household decisions; also greater coordination around bills, time, care and family obligations.' },
  { id: 'separated', label: 'Separated', note: 'Space to make decisions safely; may involve grief, financial changes, family mediation or gossip.' },
  { id: 'divorced', label: 'Divorced', note: 'A chance to rebuild life and goals; may bring stigma, practical adjustments and difficult conversations.' },
]);
const STATUS_IDS = new Set(RELATIONSHIP_STATUSES.map(x => x.id));

export const FEMALE_KEKE_DRIVERS = Object.freeze([
  { id: 'asabe', name: 'Asabe', base: 'Kofar Ruwa', style: 'calm fare negotiator', detail: 'Experienced with market-hour routes and clear boundaries at the park.' },
  { id: 'talatu', name: 'Talatu', base: 'Yankaba Market', style: 'market specialist', detail: 'Knows busy produce routes and how to plan around loading queues.' },
  { id: 'altine', name: 'Altine', base: 'Hotoro', style: 'steady and safety-minded', detail: 'Checks tyres and lights before accepting a long trip.' },
  { id: 'jummai', name: 'Jummai', base: 'BUK Gate', style: 'student-route regular', detail: 'Balances passenger service with an education goal.' },
  { id: 'laraba', name: 'Laraba', base: 'Kofar Wambai', style: 'community connector', detail: 'Has regular customers among nearby traders and families.' },
  { id: 'hajara', name: 'Hajara', base: 'Kofar Mata', style: 'patient mentor', detail: 'Shares practical advice with new women drivers.' },
  { id: 'hauwa', name: 'Hauwa', base: 'Farm Centre', style: 'business-minded', detail: 'Tracks expenses closely and is saving toward vehicle ownership.' },
  { id: 'hadiza', name: 'Hadiza', base: 'Sabon Gari', style: 'multilingual connector', detail: 'Builds trust with customers from different Nigerian communities.' },
  { id: 'falmata', name: 'Falmata', base: 'Kofar Ruwa', style: 'resilient learner', detail: 'Shares a keke-care checklist with other drivers.' },
  { id: 'binta', name: 'Binta', base: 'Hotoro', style: 'family-first planner', detail: 'Plans work around care responsibilities without treating every family as the same.' },
  { id: 'rabi', name: 'Rabi', base: 'Yankaba Market', style: 'independent owner-in-training', detail: 'Keeps a savings target and asks mechanics questions before authorising work.' },
  { id: 'maryam', name: 'Maryam', base: 'BUK Gate', style: 'customer-care specialist', detail: 'Works to make women, students and older passengers feel safe and respected.' },
]);

export const CULTURAL_MEALS = Object.freeze([
  { id: 'tuwo_kuka', name: 'Tuwo da miyan kuka', note: 'A filling Hausa meal; ingredients vary by household and vendor.', cost: 75, wellbeing: 4 },
  { id: 'shinkafa_wake', name: 'Shinkafa da wake', note: 'Rice and beans with grounded pepper and groundnut oil, as requested by the player.', cost: 60, wellbeing: 4 },
  { id: 'gurasa', name: 'Gurasa', note: 'Kano-associated bread, commonly enjoyed with a suitable sauce or accompaniment.', cost: 55, wellbeing: 3 },
  { id: 'akara_kunu', name: 'Akara da kunu', note: 'A familiar breakfast option when starting the day.', cost: 45, wellbeing: 3 },
]);

export const COSMETIC_CHOICES = Object.freeze([
  { id: 'makeup', name: 'Make-up / cosmetics', cost: 60, confidence: 7, skinWellness: 0, warning: 'Choose products that suit your skin and stop if irritation develops.' },
  { id: 'moisturizer', name: 'Basic moisturizer / gentle skin care', cost: 45, confidence: 2, skinWellness: 3, warning: 'A simple skin-care choice; individual skin reactions vary.' },
  { id: 'bleaching_cream', name: 'Skin-lightening cream of uncertain ingredients', cost: 70, confidence: 2, skinWellness: -8, warning: 'The game represents a risk, not a diagnosis. Unknown or unregulated lightening products can harm skin; stop if irritation occurs and seek qualified advice.' },
  { id: 'avoid_lightening', name: 'Skip the lightening cream; keep the money', cost: 0, confidence: 0, skinWellness: 1, warning: 'You decide not to spend on this product today.' },
]);

const DEFAULTS = Object.freeze({
  version: 1,
  relationshipStatus: 'single',
  partnerName: '',
  relationshipTrust: 55,
  familyUnderstanding: 50,
  socialPressure: 20,
  wellbeing: 55,
  integrity: 60,
  communityRespect: 50,
  aureReadiness: 20,
  privacyMode: true,
  selectedDriverPeer: 'asabe',
  lastScenarioDay: null,
  pendingScenarioId: null,
  resolvedDays: [],
  ledger: [],
  foodPurchases: 0,
  cosmeticsPurchases: 0,
  health: {
    trackingEnabled: false,
    cycleStartDay: null,
    cycleLength: 28,
    pregnancyStatus: 'none',
    pregnancyCheckDueDay: null,
    healthConcern: 'none',
    healthCareVisits: 0,
    treatmentStatus: 'none',
    mood: 55,
    skinWellness: 80,
    confidence: 50,
    lighteningProductUseCount: 0,
    lastHealthDay: null,
    healthReminderDueDay: null,
  },
});
const healthConcerns = new Set(['none', 'unusual_discharge_or_irritation', 'urinary_discomfort', 'possible_pregnancy', 'stress_or_mood']);
const pregnancyStatuses = new Set(['none', 'possible', 'positive', 'negative']);

export function createDefaultAureState() {
  return clone(DEFAULTS);
}

export function normalizeAureState(input = {}) {
  const s = { ...createDefaultAureState(), ...(input && typeof input === 'object' ? input : {}) };
  s.version = 1;
  s.relationshipStatus = STATUS_IDS.has(s.relationshipStatus) ? s.relationshipStatus : 'single';
  s.partnerName = clean(s.partnerName, 40);
  for (const key of ['relationshipTrust', 'familyUnderstanding', 'socialPressure', 'wellbeing', 'integrity', 'communityRespect', 'aureReadiness']) s[key] = clamp(s[key], 0, 100);
  s.privacyMode = s.privacyMode !== false;
  s.selectedDriverPeer = FEMALE_KEKE_DRIVERS.some(x => x.id === s.selectedDriverPeer) ? s.selectedDriverPeer : 'asabe';
  s.lastScenarioDay = s.lastScenarioDay != null && Number.isFinite(Number(s.lastScenarioDay)) ? safeDay(s.lastScenarioDay) : null;
  s.pendingScenarioId = typeof s.pendingScenarioId === 'string' ? s.pendingScenarioId.slice(0, 80) : null;
  s.resolvedDays = Array.isArray(s.resolvedDays) ? [...new Set(s.resolvedDays.map(safeDay))].slice(-180) : [];
  s.ledger = Array.isArray(s.ledger) ? s.ledger.filter(x => x && typeof x === 'object').slice(-120).map(x => ({ ...x })) : [];
  s.foodPurchases = money(s.foodPurchases);
  s.cosmeticsPurchases = money(s.cosmeticsPurchases);
  const h = { ...DEFAULTS.health, ...(s.health && typeof s.health === 'object' ? s.health : {}) };
  h.trackingEnabled = h.trackingEnabled === true;
  h.cycleStartDay = h.cycleStartDay != null && Number.isFinite(Number(h.cycleStartDay)) ? safeDay(h.cycleStartDay) : null;
  h.cycleLength = clamp(Math.floor(Number(h.cycleLength) || 28), 21, 35);
  h.pregnancyStatus = pregnancyStatuses.has(h.pregnancyStatus) ? h.pregnancyStatus : 'none';
  h.pregnancyCheckDueDay = h.pregnancyCheckDueDay != null && Number.isFinite(Number(h.pregnancyCheckDueDay)) ? safeDay(h.pregnancyCheckDueDay) : null;
  h.healthConcern = healthConcerns.has(h.healthConcern) ? h.healthConcern : 'none';
  h.healthCareVisits = money(h.healthCareVisits);
  h.treatmentStatus = ['none', 'clinician_plan_pending', 'plan_followed'].includes(h.treatmentStatus) ? h.treatmentStatus : 'none';
  h.mood = clamp(h.mood, 0, 100);
  h.skinWellness = clamp(h.skinWellness, 0, 100);
  h.confidence = clamp(h.confidence, 0, 100);
  h.lighteningProductUseCount = money(h.lighteningProductUseCount);
  h.lastHealthDay = h.lastHealthDay != null && Number.isFinite(Number(h.lastHealthDay)) ? safeDay(h.lastHealthDay) : null;
  h.healthReminderDueDay = h.healthReminderDueDay != null && Number.isFinite(Number(h.healthReminderDueDay)) ? safeDay(h.healthReminderDueDay) : null;
  s.health = h;
  return s;
}

const C = (id, label, effect = {}, walletDelta = 0, extra = {}) => ({ id, label, effect, walletDelta, ...extra });
const SCENARIOS = Object.freeze({
  aure_family: {
    id: 'aure_family', kicker: 'AURE · FAMILY EXPECTATIONS', title: 'The family asks about marriage',
    body: 'An auntie or older relative asks when you plan to settle down. In Kano, talk about Aure can carry warmth and practical support, but it can also feel intrusive when people assume everyone should follow the same timeline.',
    choices: [
      C('honest_timing', 'Explain your timing and what you are preparing for', { familyUnderstanding: 5, socialPressure: -5, wellbeing: 2, aureReadiness: 3 }, 0, { message: 'You explain your position without promising a date you cannot meet.' }),
      C('small_plan', 'Discuss a realistic, modest marriage plan', { familyUnderstanding: 4, socialPressure: -3, aureReadiness: 8 }, 0, { message: 'The family can see you are thinking carefully about the future.' }),
      C('privacy_boundary', 'Set a respectful boundary around private matters', { familyUnderstanding: -1, socialPressure: -4, wellbeing: 3, integrity: 3 }, 0, { message: 'You protect your privacy while keeping the conversation respectful.' }),
    ],
  },
  male_peer_teasing: {
    id: 'male_peer_teasing', kicker: 'FRIENDS · SOCIAL PRESSURE', title: 'The park boys joke about being unmarried',
    body: 'A few male friends tease you about being old enough for marriage. Their jokes may be ordinary banter to them, but they land differently depending on your circumstances and the day you have had.',
    choices: [
      C('laugh_and_redirect', 'Laugh lightly and change the subject', { socialPressure: 1, wellbeing: 1, communityRespect: 1 }, 0, { message: 'You keep the moment light without disclosing private plans.' }),
      C('clear_boundary', 'Tell them the jokes are getting personal', { socialPressure: -6, wellbeing: 3, integrity: 3 }, 0, { message: 'You state your boundary without humiliating anyone.' }),
      C('ask_for_support', 'Ask a trusted friend for practical advice, not mockery', { familyUnderstanding: 2, socialPressure: -3, wellbeing: 4 }, 0, { message: 'One conversation becomes more supportive and useful.' }),
    ],
  },
  female_peer_gossip: {
    id: 'female_peer_gossip', kicker: 'WOMEN’S SOCIAL CIRCLE · GOSSIP', title: 'A conversation turns into gossip',
    body: 'A group of women begin speculating about why an unmarried woman has not married yet. You can join the backbiting, challenge it, or move the conversation toward something more helpful. This is one social situation, not a statement about all women.',
    choices: [
      C('protect_privacy', 'Say personal timelines are not for public judgement', { socialPressure: -5, integrity: 4, communityRespect: 3, wellbeing: 2 }, 0, { message: 'You protect privacy without making another woman the target.' }),
      C('trusted_friend', 'Check in privately with the woman being discussed', { wellbeing: 4, communityRespect: 5, integrity: 4 }, 0, { message: 'A private, kind conversation replaces some of the speculation.' }),
      C('join_gossip', 'Join the gossip to fit in', { socialPressure: 4, integrity: -8, communityRespect: -6, wellbeing: -2 }, 0, { message: 'The group accepts the joke, but trust is harder to build when people fear becoming the next topic.' }),
    ],
  },
  partner_call: {
    id: 'partner_call', kicker: 'RELATIONSHIP · WORK & HOME', title: 'A call from someone close',
    body: 'Your partner or a close family member calls while you are working. There may be a real concern behind the call, but handling it while driving could put people at risk.',
    choices: [
      C('pull_over_call', 'Pull over safely, then return the call', { relationshipTrust: 6, familyUnderstanding: 3, wellbeing: 2 }, 0, { message: 'You make time to listen without using the phone while the keke is moving.' }),
      C('send_safe_message', 'Send a brief message when safely stopped', { relationshipTrust: 3, wellbeing: 1 }, 0, { message: 'You acknowledge the call and agree when to talk properly.' }),
      C('ignore_call', 'Ignore it until much later', { relationshipTrust: -5, familyUnderstanding: -2, wellbeing: -2 }, 0, { message: 'Work continues, but the other person may feel dismissed.' }),
    ],
  },
  relationship_triangle: {
    id: 'relationship_triangle', kicker: 'BOUNDARIES · TRUST & VALUES', title: 'An adult acquaintance says they already have a partner',
    body: 'An adult you have been getting close to admits they are already in a committed relationship. You decide how to handle attraction, fidelity, consent and the chance of gossip. For a character who follows Islamic beliefs, premarital intimacy may be understood as zina/fornication; the story lets the player follow their own convictions without graphic depiction or a forced sermon.',
    choices: [
      C('respect_existing', 'Respect the existing relationship and step back', { integrity: 6, communityRespect: 3, wellbeing: 2, relationshipTrust: 3 }, 0, { message: 'You avoid becoming part of a secret that could hurt several people.' }),
      C('clarify_boundary', 'Ask for honesty and do not proceed while things are unclear', { integrity: 4, relationshipTrust: 2, wellbeing: 1 }, 0, { message: 'You set a clear boundary and leave responsibility for their existing relationship with them.' }),
      C('secret_affair', 'Proceed secretly with a consenting adult despite the existing commitment', { integrity: -12, communityRespect: -7, relationshipTrust: -8, socialPressure: 8, wellbeing: -5 }, 0, { message: 'The secrecy creates a risk of betrayal, damaged trust and social fallout. Any intimacy must remain between consenting adults.' , flags: { healthFollowUp: true } }),
    ],
  },
  engaged_wedding_costs: {
    id: 'engaged_wedding_costs', kicker: 'AURE · PLANNING', title: 'Family expectations grow around the wedding',
    body: 'Relatives have different ideas about invitations, clothes, food and what a respectable wedding should look like. You can prioritise a plan that the couple can actually afford.',
    choices: [
      C('modest_aure', 'Agree a modest plan the couple can afford', { aureReadiness: 8, relationshipTrust: 5, familyUnderstanding: 4, socialPressure: -3 }, 0, { message: 'You put the couple’s future ahead of a display that would strain them.' }),
      C('family_mediation', 'Ask trusted relatives to mediate calmly', { familyUnderstanding: 6, relationshipTrust: 2 }, 0, { message: 'A calmer conversation starts to bring expectations closer together.' }),
      C('status_spending', 'Agree to spend to impress people', { aureReadiness: -4, socialPressure: 4, wellbeing: -3 }, 0, { message: 'The plan looks impressive but adds avoidable pressure.' }),
    ],
  },
  separation_support: {
    id: 'separation_support', kicker: 'RELATIONSHIP · REBUILDING', title: 'People ask difficult questions about your separation',
    body: 'Someone in the community asks for details that are not theirs to demand. You can protect your privacy, seek support or argue publicly. A separated or divorced person still has a future and choices.',
    choices: [
      C('private_boundary', 'Keep details private and seek trusted support', { wellbeing: 5, integrity: 3, socialPressure: -4 }, 0, { message: 'You keep control over a personal situation and choose a safer support circle.' }),
      C('respectful_mediation', 'Use a trusted mediator if it feels safe and useful', { familyUnderstanding: 3, wellbeing: 3, relationshipTrust: 1 }, 0, { message: 'Support is chosen on your terms; reconciliation is not assumed.' }),
      C('public_argument', 'Respond with a public argument', { socialPressure: 5, wellbeing: -4, communityRespect: -3 }, 0, { message: 'The argument draws attention and may make the situation harder to manage.' }),
    ],
  },
  company_worker: {
    id: 'company_worker', kicker: 'KANO WORKPLACES · DIFFERENT BACKGROUNDS', title: 'A worker has moved to Kano for a company job',
    body: 'Your passenger is an adult worker from another part of Nigeria, now living in Kano for a job. They mention the challenge of finding food, friends, a place to stay and familiar community while learning the city.',
    choices: [
      C('fair_fare_help', 'Agree a fair fare and give respectful local directions', { communityRespect: 5, integrity: 3 }, 85, { message: 'You earn a small game-scaled fare and help someone feel less lost in a new city.' }),
      C('cultural_curiosity', 'Ask about their home state and share useful Kano tips', { communityRespect: 6, wellbeing: 2 }, 55, { message: 'The conversation is friendly without assuming people from one state all behave alike.' }),
      C('stereotype', 'Make assumptions about their state or language', { communityRespect: -8, integrity: -4, wellbeing: -1 }, 0, { message: 'The passenger feels stereotyped; you lose a chance to build trust.' }),
    ],
  },
  female_driver_peer: {
    id: 'female_driver_peer', kicker: 'KEKE PARK · WOMEN AT WORK', title: 'A woman driver shares practical advice',
    body: 'Another woman driving keke arrives at the stand. Some people question her place in the work; others see a colleague. Your response can strengthen solidarity, create rivalry or stay neutral.',
    choices: [
      C('share_advice', 'Exchange vehicle-care and route advice', { communityRespect: 6, integrity: 3, wellbeing: 2 }, 0, { message: 'You share useful knowledge and treat her as a professional colleague.' }),
      C('offer_support', 'Back her when a customer or driver is disrespectful', { communityRespect: 7, integrity: 4, socialPressure: -2 }, 0, { message: 'You support a colleague without pretending every driver has the same experience.' }),
      C('competitive_distance', 'Keep the conversation professional and brief', { communityRespect: 1 }, 0, { message: 'You remain polite; cooperation can grow later.' }),
    ],
  },
  almajiri_support: {
    id: 'almajiri_support', kicker: 'STREET LIFE · COMMUNITY CARE', title: 'Almajiri pupils ask for food or water',
    body: 'You see Almajiri pupils near the market. They are children in a vulnerable situation, not a punchline or a prop. You can offer food or water, support a trusted local effort, or continue to your next passenger.',
    choices: [
      C('buy_gurasa_water', 'Share Gurasa and water · ₦55', { communityRespect: 5, wellbeing: 2, integrity: 2 }, -55, { message: 'You share food and water within your means. No one is shamed for needing help.' }),
      C('trusted_support', 'Contribute to a trusted community support effort · ₦35', { communityRespect: 5, integrity: 3 }, -35, { message: 'You contribute within your means and leave the wider work to people who can provide sustained support.' }),
      C('keep_working', 'Explain that you cannot help today', { communityRespect: 0, wellbeing: 0 }, 0, { message: 'You continue working; helping is voluntary and your limits matter too.' }),
    ],
  },
  food_stall: {
    id: 'food_stall', kicker: 'HAUSA FOOD · EVERYDAY KANO', title: 'A roadside food seller calls out',
    body: 'You have a chance to eat before another shift. Choose a familiar meal or keep the working cash for fuel. Food and vendor prices in this simulation are only balancing values.',
    choices: [
      C('meal_tuwo_kuka', 'Buy tuwo da miyan kuka · ₦75', { wellbeing: 4 }, -75, { message: 'You eat tuwo da miyan kuka before returning to work.', meal: 'tuwo_kuka' }),
      C('meal_shinkafa_wake', 'Buy shinkafa da wake with grounded pepper and groundnut oil · ₦60', { wellbeing: 4 }, -60, { message: 'You take a filling plate of shinkafa da wake.', meal: 'shinkafa_wake' }),
      C('meal_gurasa', 'Buy Gurasa · ₦55', { wellbeing: 3 }, -55, { message: 'You choose Gurasa and keep the rest of the day’s plan in mind.', meal: 'gurasa' }),
      C('skip_meal', 'Keep the money for fuel', { wellbeing: -1 }, 0, { message: 'You keep the cash but may want to make time for food later.' }),
    ],
  },
  adult_intimacy_choice: {
    id: 'adult_intimacy_choice', kicker: 'ADULT RELATIONSHIP · CONSENT & HEALTH', title: 'You and an adult partner discuss intimacy',
    body: 'The decision is private and non-graphic. You can wait, talk openly about consent and protection, or choose consensual adult intimacy without protection. Premarital intimacy may be understood as zina/fornication by characters who follow Islamic beliefs; choices remain player-led. The simulation does not force a sexual event; any pregnancy possibility requires a later test decision.',
    choices: [
      C('wait_talk', 'Wait and talk about your boundaries and values', { relationshipTrust: 4, integrity: 3, wellbeing: 2 }, 0, { message: 'You make room for a clear decision without pressure.' }),
      C('discuss_protection', 'Discuss consent, protection and health before deciding', { relationshipTrust: 5, integrity: 3, wellbeing: 2 }, 0, { message: 'You discuss the decision openly. This does not guarantee that all health risks are removed.' }),
      C('unprotected_consensual', 'Choose consensual adult intimacy without protection', { relationshipTrust: 2, wellbeing: -1 }, 0, { message: 'A private health follow-up is scheduled. If pregnancy is possible, only a test can resolve uncertainty.' , flags: { pregnancyCheck: true } }),
    ],
  },
});

function profileFor(profile = {}) {
  const gender = profile.gender === 'female' ? 'female' : 'male';
  return { gender, age: clamp(Math.floor(Number(profile.age) || 22), 18, 35), name: clean(profile.name || (gender === 'female' ? 'Asabe' : 'Musa'), 32) };
}

export function buildDailyScenario({ day, profile = {}, state: rawState } = {}) {
  const d = safeDay(day);
  const p = profileFor(profile);
  const s = normalizeAureState(rawState || {});
  if (s.resolvedDays.includes(d)) return null;
  if (s.lastScenarioDay === d && s.pendingScenarioId && SCENARIOS[s.pendingScenarioId]) return clone(SCENARIOS[s.pendingScenarioId]);

  let eligible = ['company_worker', 'female_driver_peer', 'almajiri_support', 'food_stall'];
  if (s.relationshipStatus === 'single') {
    eligible.push('aure_family');
    if (p.age >= 25 && p.gender === 'male') eligible.push('male_peer_teasing');
    if (p.age >= 25 && p.gender === 'female') eligible.push('female_peer_gossip');
  } else if (s.relationshipStatus === 'dating') {
    eligible.push('relationship_triangle', 'adult_intimacy_choice');
  } else if (s.relationshipStatus === 'engaged') {
    eligible.push('engaged_wedding_costs', 'adult_intimacy_choice');
  } else if (s.relationshipStatus === 'married') {
    eligible.push('partner_call', 'adult_intimacy_choice');
  } else if (['separated', 'divorced'].includes(s.relationshipStatus)) {
    eligible.push('separation_support');
  }
  if (s.health.pregnancyStatus === 'possible' && s.health.pregnancyCheckDueDay && d >= s.health.pregnancyCheckDueDay) eligible.push('food_stall');
  const index = (d - 1) % eligible.length;
  const id = eligible[index];
  s.lastScenarioDay = d;
  s.pendingScenarioId = id;
  return clone(SCENARIOS[id]);
}

export function setRelationshipStatus(rawState, { status, partnerName = '' } = {}) {
  const state = normalizeAureState(rawState);
  if (!STATUS_IDS.has(status)) return { ok: false, reason: 'invalid_status', state };
  const name = clean(partnerName, 40);
  if (['dating', 'engaged', 'married'].includes(status) && !name) return { ok: false, reason: 'partner_name_required', state };
  state.relationshipStatus = status;
  state.lastScenarioDay = null;
  state.pendingScenarioId = null;
  state.partnerName = ['dating', 'engaged', 'married'].includes(status) ? name : '';
  state.aureReadiness = clamp(state.aureReadiness + (status === 'engaged' ? 6 : status === 'married' ? 8 : 0), 0, 100);
  state.ledger.unshift({ day: null, type: 'relationship_status', text: `Relationship status set to ${RELATIONSHIP_STATUSES.find(x => x.id === status)?.label || status}.`, amount: 0 });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state };
}

export function resolveDailyScenario({ rawState, day, profile = {}, scenarioId, choiceId, wallet = 0 } = {}) {
  const state = normalizeAureState(rawState);
  const d = safeDay(day);
  const cash = money(wallet);
  if (state.resolvedDays.includes(d)) return { ok: false, reason: 'already_resolved', state, wallet: cash };
  const scenario = buildDailyScenario({ day: d, profile, state });
  if (!scenario || scenario.id !== scenarioId) return { ok: false, reason: 'stale_scenario', state, wallet: cash };
  const choice = scenario.choices.find(x => x.id === choiceId);
  if (!choice) return { ok: false, reason: 'invalid_choice', state, wallet: cash };
  const delta = Number(choice.walletDelta) || 0;
  if (delta < 0 && cash < Math.abs(delta)) return { ok: false, reason: 'insufficient_wallet', state, wallet: cash, required: Math.abs(delta) };
  state.resolvedDays.push(d);
  state.resolvedDays = state.resolvedDays.slice(-180);
  state.pendingScenarioId = null;
  state.lastScenarioDay = d;
  for (const [key, amount] of Object.entries(choice.effect || {})) {
    if (key in state && typeof state[key] === 'number') state[key] = clamp(state[key] + Number(amount || 0), 0, 100);
  }
  const healthProfile = profileFor(profile);
  if (healthProfile.gender === 'female' && state.health.trackingEnabled && choice.flags?.healthFollowUp) {
    state.health.healthReminderDueDay = d + 7;
  }
  if (healthProfile.gender === 'female' && state.health.trackingEnabled && choice.flags?.pregnancyCheck) {
    state.health.pregnancyStatus = 'possible';
    state.health.pregnancyCheckDueDay = d + 7;
    state.health.healthConcern = 'possible_pregnancy';
  }
  if (choice.meal) state.foodPurchases += Math.abs(delta);
  state.ledger.unshift({ day: d, type: scenario.id, choiceId, text: choice.message, amount: delta });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state, scenario: clone(scenario), choice: clone(choice), message: choice.message, wallet: Math.max(0, cash + delta), walletDelta: delta };
}

export function toggleHealthTracking(rawState, enabled, profile = {}, day = 1) {
  const state = normalizeAureState(rawState);
  const p = profileFor(profile);
  if (enabled && p.gender !== 'female') return { ok: false, reason: 'female_profile_required', state };
  state.health.trackingEnabled = enabled === true;
  if (state.health.trackingEnabled && state.health.cycleStartDay == null) state.health.cycleStartDay = safeDay(day);
  state.ledger.unshift({ day: safeDay(day), type: 'private_health_tracking', text: state.health.trackingEnabled ? 'Opted into private simulated cycle and wellbeing tracking.' : 'Private simulated health tracking turned off.', amount: 0 });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state };
}

export function femaleHealthSummary(rawState, day, profile = {}) {
  const state = normalizeAureState(rawState);
  const p = profileFor(profile);
  const h = state.health;
  if (p.gender !== 'female' || !h.trackingEnabled || h.cycleStartDay == null) return { enabled: false, trackingEnabled: false, pregnancyStatus: h.pregnancyStatus, healthConcern: h.healthConcern };
  const d = safeDay(day);
  const cycleDay = ((d - h.cycleStartDay) % h.cycleLength + h.cycleLength) % h.cycleLength + 1;
  const flowWindow = h.pregnancyStatus === 'positive' ? false : cycleDay <= 5;
  const daysToDue = h.pregnancyCheckDueDay ? Math.max(0, h.pregnancyCheckDueDay - d) : null;
  const daysToHealthReminder = h.healthReminderDueDay ? Math.max(0, h.healthReminderDueDay - d) : null;
  return { enabled: true, trackingEnabled: true, cycleDay, cycleLength: h.cycleLength, flowWindow, pregnancyStatus: h.pregnancyStatus, pregnancyCheckDue: h.pregnancyStatus === 'possible' && daysToDue === 0, daysToPregnancyCheck: daysToDue, daysToHealthReminder, healthConcern: h.healthConcern, mood: h.mood, confidence: h.confidence, skinWellness: h.skinWellness, healthCareVisits: h.healthCareVisits };
}

export function recordHealthConcern(rawState, { concern, day, profile = {} } = {}) {
  const state = normalizeAureState(rawState);
  const p = profileFor(profile);
  if (!state.health.trackingEnabled || p.gender !== 'female') return { ok: false, reason: 'tracking_disabled', state };
  if (!healthConcerns.has(concern) || concern === 'none') return { ok: false, reason: 'invalid_concern', state };
  state.health.healthConcern = concern;
  if (concern === 'possible_pregnancy') {
    state.health.pregnancyStatus = 'possible';
    state.health.pregnancyCheckDueDay = safeDay(day) + 7;
  }
  state.ledger.unshift({ day: safeDay(day), type: 'health_concern_recorded', text: 'A private health concern was recorded for roleplay tracking; this is not a diagnosis.', amount: 0 });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state };
}

export function seekQualifiedHealthCare(rawState, { day, wallet = 0, cost = 120, profile = {} } = {}) {
  const state = normalizeAureState(rawState);
  const p = profileFor(profile);
  const cash = money(wallet);
  const fee = money(cost);
  if (!state.health.trackingEnabled || p.gender !== 'female') return { ok: false, reason: 'tracking_disabled', state, wallet: cash };
  if (state.health.healthConcern === 'none') return { ok: false, reason: 'no_concern', state, wallet: cash };
  if (cash < fee) return { ok: false, reason: 'insufficient_wallet', state, wallet: cash, required: fee };
  state.health.healthCareVisits += 1;
  state.health.healthConcern = 'none';
  state.health.treatmentStatus = 'clinician_plan_pending';
  state.health.mood = clamp(state.health.mood + 3, 0, 100);
  state.ledger.unshift({ day: safeDay(day), type: 'qualified_health_care', text: 'Recorded a visit to a qualified health provider; no diagnosis or prescription is simulated.', amount: -fee });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state, wallet: cash - fee, amount: fee, message: 'You recorded a visit with a qualified health provider. Follow the professional advice given; this simulation does not prescribe treatment.' };
}

export function recordPregnancyTest(rawState, { result, day, profile = {} } = {}) {
  const state = normalizeAureState(rawState);
  const p = profileFor(profile);
  if (!state.health.trackingEnabled || p.gender !== 'female') return { ok: false, reason: 'tracking_disabled', state };
  if (!['positive', 'negative'].includes(result)) return { ok: false, reason: 'invalid_result', state };
  if (state.health.pregnancyStatus !== 'possible' || !state.health.pregnancyCheckDueDay || safeDay(day) < state.health.pregnancyCheckDueDay) return { ok: false, reason: 'test_not_due', state };
  state.health.pregnancyStatus = result;
  state.health.pregnancyCheckDueDay = null;
  state.health.healthConcern = 'none';
  state.ledger.unshift({ day: safeDay(day), type: 'pregnancy_test_result', text: result === 'positive' ? 'Player recorded a positive pregnancy-test result; seek antenatal care from a qualified provider.' : 'Player recorded a negative pregnancy-test result; follow test instructions and seek qualified care if concerns remain.', amount: 0 });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state, result };
}

export function buyCosmeticOrSkinCare(rawState, { productId, day, wallet = 0, profile = {} } = {}) {
  const state = normalizeAureState(rawState);
  const p = profileFor(profile);
  const cash = money(wallet);
  if (p.gender !== 'female') return { ok: false, reason: 'female_profile_required', state, wallet: cash };
  const item = COSMETIC_CHOICES.find(x => x.id === productId);
  if (!item) return { ok: false, reason: 'invalid_product', state, wallet: cash };
  if (cash < item.cost) return { ok: false, reason: 'insufficient_wallet', state, wallet: cash, required: item.cost };
  state.health.confidence = clamp(state.health.confidence + item.confidence, 0, 100);
  state.health.skinWellness = clamp(state.health.skinWellness + item.skinWellness, 0, 100);
  if (productId === 'bleaching_cream') state.health.lighteningProductUseCount += 1;
  if (item.cost > 0) state.cosmeticsPurchases += item.cost;
  state.ledger.unshift({ day: safeDay(day), type: 'cosmetic_or_skin_care', text: `${item.name}. ${item.warning}`, amount: -item.cost });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state, wallet: cash - item.cost, item, message: item.warning };
}

export function recordClinicianPlanFollowThrough(rawState, { day, profile = {} } = {}) {
  const state = normalizeAureState(rawState);
  const p = profileFor(profile);
  if (!state.health.trackingEnabled || p.gender !== 'female') return { ok: false, reason: 'tracking_disabled', state };
  if (state.health.treatmentStatus !== 'clinician_plan_pending') return { ok: false, reason: 'no_plan_pending', state };
  state.health.treatmentStatus = 'plan_followed';
  state.health.mood = clamp(state.health.mood + 3, 0, 100);
  state.health.healthReminderDueDay = null;
  state.ledger.unshift({ day: safeDay(day), type: 'clinician_plan_followed', text: 'Recorded follow-through on a qualified provider’s plan; this is not a specific medical prescription.', amount: 0 });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state, message: 'Follow-through recorded. Continue the instructions provided by the qualified clinician.' };
}

export function recordWellbeingAction(rawState, { action, day, profile = {} } = {}) {
  const state = normalizeAureState(rawState);
  const p = profileFor(profile);
  if (p.gender !== 'female' || !state.health.trackingEnabled) return { ok: false, reason: 'tracking_disabled', state };
  const actions = {
    quiet_break: { mood: 4, wellbeing: 3, text: 'You took a short quiet break and gave yourself space to reset.' },
    trusted_talk: { mood: 5, wellbeing: 4, text: 'You spoke with a trusted person about how you have been feeling.' },
    gentle_activity: { mood: 3, wellbeing: 3, text: 'You chose a manageable activity and gave yourself time to recover.' },
  };
  const selected = actions[action];
  if (!selected) return { ok: false, reason: 'invalid_action', state };
  state.health.mood = clamp(state.health.mood + selected.mood, 0, 100);
  state.wellbeing = clamp(state.wellbeing + selected.wellbeing, 0, 100);
  state.ledger.unshift({ day: safeDay(day), type: 'wellbeing_action', text: selected.text, amount: 0 });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state, message: selected.text };
}

export function getAureSnapshot(rawState, profile = {}, day = 1) {
  const state = normalizeAureState(rawState);
  const p = profileFor(profile);
  return {
    relationshipStatus: state.relationshipStatus,
    relationshipLabel: RELATIONSHIP_STATUSES.find(x => x.id === state.relationshipStatus)?.label || 'Single',
    partnerName: state.partnerName,
    prosCons: RELATIONSHIP_STATUSES.find(x => x.id === state.relationshipStatus)?.note || '',
    socialPressure: Math.round(state.socialPressure), relationshipTrust: Math.round(state.relationshipTrust),
    familyUnderstanding: Math.round(state.familyUnderstanding), wellbeing: Math.round(state.wellbeing),
    integrity: Math.round(state.integrity), communityRespect: Math.round(state.communityRespect), aureReadiness: Math.round(state.aureReadiness),
    profile: p,
    health: femaleHealthSummary(state, day, p),
    femaleDriverRoster: FEMALE_KEKE_DRIVERS,
    ledger: state.ledger.slice(0, 12).map(x => ({ ...x })),
  };
}

export function buyCulturalMeal(rawState, { mealId, day, wallet = 0 } = {}) {
  const state = normalizeAureState(rawState);
  const meal = CULTURAL_MEALS.find(item => item.id === mealId);
  const cash = money(wallet);
  if (!meal) return { ok: false, reason: 'invalid_meal', state, wallet: cash };
  if (cash < meal.cost) return { ok: false, reason: 'insufficient_wallet', state, wallet: cash, required: meal.cost };
  state.foodPurchases += meal.cost;
  state.wellbeing = clamp(state.wellbeing + meal.wellbeing, 0, 100);
  state.ledger.unshift({ day: safeDay(day), type: 'cultural_meal', text: `Bought ${meal.name}.`, amount: -meal.cost });
  state.ledger = state.ledger.slice(0, 120);
  return { ok: true, state, meal, wallet: cash - meal.cost, amount: meal.cost };
}
