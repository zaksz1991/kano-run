// ============================================================
// KANO LIFE — PERSISTENT SOCIAL NETWORK & RELATIONSHIP MEMORY
// Step 75. Pure simulation rules; the existing social-drama save remains the
// sole source of wellbeing metrics and the Aure Journey owns relationship stage.
// No wallet writes, real messaging, online contact, or external reporting.
// ============================================================

import {
  SOCIAL_DRAMA_SCHEMA,
  SOCIAL_DRAMA_STORAGE_KEY,
  SOCIAL_RELATIONSHIP_LABELS,
  createDefaultSocialDramaState,
  normaliseSocialDramaState,
} from './KanoNorthernDriverSocialDrama.js';

export const SOCIAL_NETWORK_SCHEMA = 'kano-life-social-network-v1';
export const SOCIAL_NETWORK_STORAGE_KEY = SOCIAL_NETWORK_SCHEMA;
export const MAX_SOCIAL_NETWORK_HISTORY = 80;

const clamp = (value, min, max, fallback = min) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
};
const cleanText = (value, limit = 48, fallback = '') => String(value ?? fallback)
  .replace(/[<>\u0000-\u001f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);
const safeDay = value => clamp(value, 1, 1_000_000, 1);
const safeStatus = value => Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, String(value)) ? String(value) : 'single';
const SOCIAL_METRICS = Object.freeze([
  'affection', 'trust', 'patience', 'compassion', 'joy', 'sadness', 'stress',
  'respect', 'neighbourTrust', 'friendship', 'autonomy', 'anger', 'resentment', 'grief',
]);
const CONTACT_METRICS = Object.freeze(['trust', 'bond', 'respect', 'tension', 'support']);

export const SOCIAL_NETWORK_CONTACTS = Object.freeze([
  { id: 'partner', role: 'Partner / important relationship', profileKey: 'partnerName', name: 'Aisha', personality: 'thoughtful', trust: 48, bond: 48, respect: 52, tension: 18, support: 45 },
  { id: 'friend', role: 'Close friend', profileKey: 'friendName', name: 'Sani', personality: 'witty', trust: 52, bond: 54, respect: 50, tension: 12, support: 58 },
  { id: 'neighbour', role: 'Neighbour', profileKey: 'neighbourName', name: 'Malam Musa', personality: 'practical', trust: 45, bond: 40, respect: 54, tension: 18, support: 42 },
  { id: 'family', role: 'Parent / elder in the family', profileKey: '', name: 'Hajiya Zainab', personality: 'protective', trust: 58, bond: 62, respect: 60, tension: 15, support: 63 },
  { id: 'sibling', role: 'Sibling / cousin', profileKey: '', name: 'Yusuf', personality: 'direct', trust: 48, bond: 52, respect: 48, tension: 20, support: 48 },
  { id: 'footballFriend', role: 'Football friend', profileKey: '', name: 'Kabiru', personality: 'competitive-but-playful', trust: 49, bond: 48, respect: 46, tension: 15, support: 40 },
  { id: 'community', role: 'Community contact / local teacher', profileKey: '', name: 'Malam Bashir', personality: 'calm', trust: 50, bond: 42, respect: 58, tension: 8, support: 55 },
  { id: 'colleague', role: 'Workmate / fellow driver', profileKey: '', name: 'Safiya', personality: 'independent', trust: 46, bond: 42, respect: 50, tension: 14, support: 46 },
]);

const SCENES = Object.freeze([
  {
    id: 'couple-misunderstanding', category: 'LOVE & COMMUNICATION', contactId: 'partner', statuses: ['dating', 'engaged', 'married'],
    title: 'A short message sounded harsh',
    scene: '{name} says a quick reply felt dismissive after a tiring day. The meaning was not clear, and both people need a chance to speak.',
    choices: [
      { id: 'listen-clarify', label: 'Listen first, explain calmly, and ask how it felt', result: 'The conversation slowed down enough for both people to be heard.', global: { trust: 4, affection: 3, patience: 4, respect: 3, stress: -4, anger: -3 }, contact: { trust: 5, bond: 3, respect: 3, tension: -5, support: 3 }, repair: true },
      { id: 'blame-back', label: 'Blame them for misunderstanding', result: 'The issue remains unresolved and the tension grows.', global: { trust: -3, affection: -2, patience: -5, respect: -4, stress: 5, anger: 5, resentment: 3 }, contact: { trust: -4, bond: -2, respect: -4, tension: 7, support: -2 } },
      { id: 'pause-return', label: 'Ask for a pause and agree when to return', result: 'The pause was framed as a plan rather than silent punishment.', global: { patience: 4, respect: 2, stress: -3, anger: -3 }, contact: { trust: 3, respect: 2, tension: -4 }, repair: true },
    ],
  },
  {
    id: 'forgotten-promise', category: 'LOVE & RESPONSIBILITY', contactId: 'partner', statuses: ['dating', 'engaged', 'married'],
    title: 'A promise was forgotten',
    scene: '{name} expected a call or visit that did not happen. Work was demanding, but the disappointment is still real.',
    choices: [
      { id: 'own-it', label: 'Own the mistake and agree on a realistic plan', result: 'Responsibility replaced a promise that might not be kept.', global: { trust: 4, affection: 2, patience: 3, respect: 3, stress: -2 }, contact: { trust: 5, bond: 2, respect: 3, tension: -3 }, repair: true },
      { id: 'excuse-only', label: 'Explain the workload without listening', result: 'The reason was offered, but the hurt was not fully addressed.', global: { trust: -1, patience: -2, stress: 2 }, contact: { trust: -1, respect: -1, tension: 3 } },
      { id: 'overpromise', label: 'Make an unrealistic promise just to end the argument', result: 'The argument quietened, but the expectation is now harder to meet.', global: { joy: 1, trust: -2, stress: 2 }, contact: { trust: -2, tension: 2 } },
    ],
  },
  {
    id: 'phone-privacy', category: 'LOVE & BOUNDARIES', contactId: 'partner', statuses: ['dating', 'engaged', 'married', 'separated'],
    title: 'A disagreement about phone privacy',
    scene: '{name} wants reassurance after seeing an ambiguous notification. Neither person is entitled to force access to the other person’s private accounts.',
    choices: [
      { id: 'talk-boundaries', label: 'Discuss the worry and mutually agreed boundaries', result: 'Reassurance and privacy were discussed without surveillance.', global: { trust: 3, affection: 2, respect: 4, autonomy: 3, patience: 3, stress: -2 }, contact: { trust: 3, respect: 4, tension: -3 }, repair: true },
      { id: 'demand-password', label: 'Demand passwords as proof of love', result: 'Pressure reduced autonomy and did not resolve the underlying worry.', global: { trust: -3, respect: -4, autonomy: -6, stress: 4, resentment: 3 }, contact: { trust: -3, respect: -5, tension: 5 } },
      { id: 'dismiss-concern', label: 'Dismiss the concern without discussion', result: 'The uncertainty remained and the conversation closed badly.', global: { trust: -2, patience: -2, stress: 3 }, contact: { trust: -2, tension: 3 } },
    ],
  },
  {
    id: 'household-fairness', category: 'MARRIAGE & FAMILY', contactId: 'partner', statuses: ['married', 'separated'],
    title: 'Household duties feel uneven',
    scene: 'Both of you have competing demands. {name} feels that chores or care duties are falling unevenly on one person.',
    choices: [
      { id: 'shared-plan', label: 'List the tasks and agree a fair, realistic plan', result: 'Responsibilities became specific rather than an argument about character.', global: { trust: 3, patience: 3, compassion: 3, respect: 4, stress: -4 }, contact: { trust: 4, bond: 2, respect: 4, tension: -4, support: 3 }, repair: true },
      { id: 'traditional-assumption', label: 'Assume the other person must do everything', result: 'The assumption was not negotiated and resentment increased.', global: { patience: -3, respect: -4, resentment: 4, stress: 4 }, contact: { respect: -4, tension: 5 } },
      { id: 'trade-duties', label: 'Offer to swap tasks this week and review later', result: 'A small practical experiment made the workload easier to discuss.', global: { compassion: 2, trust: 2, patience: 3, stress: -2 }, contact: { trust: 3, bond: 2, tension: -2 }, repair: true },
    ],
  },
  {
    id: 'co-parenting-plan', category: 'FAMILY & CO-PARENTING', contactId: 'partner', statuses: ['separated', 'divorced'],
    title: 'A family schedule needs agreement',
    scene: 'A school run, appointment or family commitment needs coordination. The discussion can stay focused on practical needs and the child’s wellbeing where co-parenting applies.',
    choices: [
      { id: 'child-centred-plan', label: 'Agree logistics in clear, respectful language', result: 'The plan focused on predictable care and avoided using family members as messengers.', global: { patience: 3, compassion: 4, respect: 4, stress: -3, anger: -2 }, contact: { trust: 3, respect: 4, tension: -4, support: 3 }, repair: true },
      { id: 'use-as-messenger', label: 'Ask a child or relative to carry an angry message', result: 'The conflict was pushed onto someone who should not have to manage it.', global: { compassion: -4, respect: -4, stress: 5, resentment: 3 }, contact: { respect: -4, tension: 6 } },
      { id: 'pause-to-calm', label: 'Pause the discussion and propose a calm time', result: 'A pause created room to return to the practical issue safely.', global: { patience: 3, autonomy: 2, stress: -3 }, contact: { respect: 2, tension: -3 }, repair: true },
    ],
  },
  {
    id: 'post-separation-boundaries', category: 'SEPARATION & RECOVERY', contactId: 'partner', statuses: ['separated', 'divorced'],
    title: 'A boundary after separation',
    scene: '{name} wants to discuss a personal topic while you are trying to keep contact limited to agreed matters.',
    choices: [
      { id: 'clear-kind-boundary', label: 'State the boundary clearly without humiliation', result: 'The boundary was stated without threats or public embarrassment.', global: { autonomy: 4, respect: 3, patience: 3, stress: -2 }, contact: { respect: 3, tension: -3 }, repair: true },
      { id: 'public-shaming', label: 'Shame the person in front of others', result: 'The public conflict made future practical contact harder.', global: { respect: -5, stress: 5, anger: 4, resentment: 4 }, contact: { respect: -5, tension: 7 } },
      { id: 'use-mediator', label: 'Suggest a mutually acceptable trusted mediator if needed', result: 'Support was offered as an option, not a forced reconciliation.', global: { patience: 3, compassion: 2, respect: 3 }, contact: { trust: 2, respect: 3, tension: -2 }, repair: true },
    ],
  },
  {
    id: 'respectful-introduction', category: 'DATING & CONSENT', contactId: 'partner', statuses: ['single', 'dating'],
    title: 'Someone you are getting to know replies slowly',
    scene: 'You are unsure what a slow reply means. You can communicate honestly while giving the other person room to respond freely.',
    choices: [
      { id: 'low-pressure-message', label: 'Send one kind, low-pressure message and wait', result: 'Interest was expressed without demanding immediate attention.', global: { patience: 4, autonomy: 3, respect: 3, stress: -2 }, contact: { respect: 3, tension: -2 }, repair: true },
      { id: 'repeated-pressure', label: 'Keep sending messages until they reply', result: 'Repeated pressure can make someone feel unsafe or controlled.', global: { patience: -4, respect: -5, autonomy: -4, stress: 4 }, contact: { respect: -5, trust: -3, tension: 6 } },
      { id: 'ask-clear-question', label: 'Ask once whether they want to continue talking', result: 'A clear question left room for an honest yes or no.', global: { patience: 3, respect: 4, autonomy: 4 }, contact: { respect: 4, trust: 2 }, repair: true },
    ],
  },
  {
    id: 'accept-no', category: 'DATING & CONSENT', contactId: 'friend', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A person declines an invitation',
    scene: 'An invitation to meet or attend an event is declined. You can be disappointed without treating a refusal as an insult.',
    choices: [
      { id: 'accept-answer', label: 'Accept the answer and leave the door open without pressure', result: 'The refusal was respected and no one was pushed to justify it.', global: { patience: 4, autonomy: 4, respect: 4, stress: -2 }, contact: { respect: 4, tension: -2 }, repair: true },
      { id: 'guilt-trip', label: 'Use guilt or friends to pressure them', result: 'Pressure undermined trust and the person’s freedom to decide.', global: { respect: -5, autonomy: -5, trust: -3, resentment: 3 }, contact: { respect: -5, trust: -3, tension: 5 } },
      { id: 'manage-disappointment', label: 'Talk to a trusted friend about the disappointment', result: 'You made room for your feelings without trying to control another person.', global: { compassion: 2, patience: 3, sadness: -1, stress: -2 }, contact: { tension: -1 }, repair: true },
    ],
  },
  {
    id: 'friend-grief', category: 'FRIENDSHIP & SADNESS', contactId: 'friend', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A friend is grieving',
    scene: '{name} has had a loss and does not know what to say. Advice may not be what they need first.',
    choices: [
      { id: 'listen-quietly', label: 'Listen, offer practical help and let them choose what to share', result: 'Support was offered without demanding details or a quick recovery.', global: { compassion: 5, friendship: 4, patience: 3, grief: -2, sadness: -2, stress: -2 }, contact: { bond: 4, trust: 3, support: 5 }, repair: true },
      { id: 'rush-the-grief', label: 'Tell them to stop being sad', result: 'The response dismissed grief rather than helping the person feel heard.', global: { compassion: -4, friendship: -3, respect: -3, sadness: 3, resentment: 2 }, contact: { bond: -3, trust: -2, tension: 4 } },
      { id: 'check-back', label: 'Ask whether a check-in tomorrow would help', result: 'A specific offer made support easier to accept or decline.', global: { compassion: 3, patience: 3, friendship: 3, stress: -1 }, contact: { bond: 3, support: 3 }, repair: true },
    ],
  },
  {
    id: 'friend-apology', category: 'FRIENDSHIP & REPAIR', contactId: 'friend', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A friend says a joke went too far',
    scene: 'A joke made in front of others embarrassed {name}. You meant to be funny, but intent does not erase impact.',
    choices: [
      { id: 'apologise-no-excuse', label: 'Apologise plainly and avoid repeating the joke', result: 'The apology acknowledged impact without demanding instant forgiveness.', global: { friendship: 4, trust: 3, respect: 4, patience: 3, anger: -2 }, contact: { trust: 4, bond: 2, respect: 4, tension: -3 }, repair: true },
      { id: 'double-down', label: 'Say they are too sensitive', result: 'The dismissal repeated the embarrassment and harmed trust.', global: { friendship: -4, respect: -4, anger: 4, resentment: 3 }, contact: { trust: -4, respect: -4, tension: 5 } },
      { id: 'private-follow-up', label: 'Ask privately what would make things right', result: 'A private follow-up gave your friend control over the next step.', global: { friendship: 3, compassion: 3, patience: 2, respect: 3 }, contact: { trust: 3, bond: 2, tension: -2 }, repair: true },
    ],
  },
  {
    id: 'family-elder-care', category: 'FAMILY & PATIENCE', contactId: 'family', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'An elder needs help with an errand',
    scene: '{name} asks for help on a day when your own schedule is crowded. You can be caring and still be honest about your limits.',
    choices: [
      { id: 'help-with-plan', label: 'Help now if possible or agree a specific alternative', result: 'A realistic offer balanced care with your own responsibilities.', global: { compassion: 4, patience: 3, joy: 2, stress: -2, respect: 3 }, contact: { bond: 3, trust: 3, support: 4 }, repair: true },
      { id: 'harsh-dismissal', label: 'Dismiss the request harshly', result: 'The request was refused without care or explanation.', global: { compassion: -3, patience: -3, respect: -3, anger: 3, resentment: 2 }, contact: { bond: -2, trust: -2, tension: 4 } },
      { id: 'ask-for-help', label: 'Ask another trusted relative to share the task', result: 'Responsibility was distributed instead of assumed by one person.', global: { compassion: 3, patience: 3, stress: -2, respect: 2 }, contact: { bond: 2, support: 3 }, repair: true },
    ],
  },
  {
    id: 'sibling-money-boundary', category: 'FAMILY & MONEY', contactId: 'sibling', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A sibling asks for financial help',
    scene: '{name} asks to borrow money while you also have bills to manage. This story concerns the conversation only; it will not move wallet funds.',
    choices: [
      { id: 'honest-limit', label: 'Explain what you can afford and offer non-financial help', result: 'Your limit was clear without humiliating your relative.', global: { trust: 3, patience: 3, compassion: 2, autonomy: 2, stress: -1 }, contact: { trust: 3, respect: 3, tension: -2 }, repair: true },
      { id: 'shame-relative', label: 'Shame them for needing help', result: 'The response damaged dignity and made future discussion harder.', global: { compassion: -4, respect: -4, resentment: 4, stress: 3 }, contact: { trust: -3, respect: -4, tension: 5 } },
      { id: 'make-unclear-promise', label: 'Promise help without checking your budget', result: 'The promise may create a second conflict if you cannot fulfil it.', global: { joy: 1, trust: -2, stress: 3 }, contact: { trust: -2, tension: 2 } },
    ],
  },
  {
    id: 'neighbour-gossip', category: 'NEIGHBOURS & PRIVACY', contactId: 'neighbour', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A rumour is circulating on the street',
    scene: '{name} repeats an unverified story about another household. Other neighbours are waiting to see whether you will spread it.',
    choices: [
      { id: 'check-privately', label: 'Avoid repeating it and check facts privately', result: 'You reduced the chance of turning a rumour into a larger dispute.', global: { patience: 3, respect: 4, neighbourTrust: 3, compassion: 2, stress: -2 }, contact: { trust: 3, respect: 4, tension: -2 }, repair: true },
      { id: 'public-insult', label: 'Insult the people involved in public', result: 'The public insult drew more people into the disagreement.', global: { patience: -4, respect: -4, neighbourTrust: -3, stress: 5, anger: 4, resentment: 3 }, contact: { respect: -4, trust: -2, tension: 6 } },
      { id: 'clear-boundary', label: 'Say you will not spread private claims', result: 'A clear boundary was set without exposing anyone’s private information.', global: { respect: 3, patience: 3, autonomy: 2, neighbourTrust: 2 }, contact: { respect: 3, tension: -2 }, repair: true },
    ],
  },
  {
    id: 'neighbour-noise', category: 'NEIGHBOURS & PATIENCE', contactId: 'neighbour', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'Noise is disturbing the household',
    scene: 'Late music or a generator has disturbed rest. {name} may not know how much the noise carries into the next compound.',
    choices: [
      { id: 'polite-request', label: 'Explain the problem and agree a reasonable time', result: 'The request focused on a shared practical problem.', global: { patience: 4, respect: 3, neighbourTrust: 3, stress: -3 }, contact: { respect: 3, trust: 2, tension: -3 }, repair: true },
      { id: 'retaliate', label: 'Make noise in retaliation', result: 'Retaliation widened the disturbance instead of resolving it.', global: { patience: -4, respect: -3, stress: 4, anger: 4 }, contact: { respect: -3, tension: 5 } },
      { id: 'trusted-mediator', label: 'Ask a trusted neutral person to help if direct talk fails', result: 'A neutral conversation remained an option if direct discussion failed.', global: { patience: 2, compassion: 2, stress: -2 }, contact: { tension: -2 }, repair: true },
    ],
  },
  {
    id: 'water-queue', category: 'NEIGHBOURS & SHARED SERVICES', contactId: 'neighbour', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A dispute at the shared water point',
    scene: 'A crowded water point leads to an argument about whose turn comes next. People have different needs and limited time.',
    choices: [
      { id: 'fair-queue', label: 'Suggest a clear queue and check urgent needs fairly', result: 'A transparent arrangement reduced confusion without ranking people’s worth.', global: { patience: 3, compassion: 3, neighbourTrust: 4, respect: 2 }, contact: { trust: 3, bond: 2, tension: -3 }, repair: true },
      { id: 'cut-in', label: 'Push ahead because your time matters more', result: 'The shortcut increased conflict at a shared service.', global: { patience: -3, respect: -3, neighbourTrust: -4, anger: 3 }, contact: { trust: -2, respect: -3, tension: 4 } },
      { id: 'coordinate-turns', label: 'Help organise turns for people who want assistance', result: 'Voluntary coordination helped people move through the queue.', global: { compassion: 4, patience: 3, neighbourTrust: 3, joy: 1 }, contact: { bond: 2, support: 3 }, repair: true },
    ],
  },
  {
    id: 'football-banter', category: 'FOOTBALL & FRIENDS', contactId: 'footballFriend', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'Football banter is getting personal',
    scene: 'You and {name} support different teams. Your favourite is {team}. The jokes are turning from the match toward family and identity.',
    choices: [
      { id: 'keep-match-focused', label: 'Keep the jokes about the match and enjoy the rivalry', result: 'The rivalry stayed playful and left room to watch another game together.', global: { joy: 4, friendship: 3, patience: 2, respect: 2, stress: -2 }, contact: { bond: 3, respect: 2, tension: -2 }, repair: true },
      { id: 'personal-attack', label: 'Attack their family or community', result: 'A match disagreement became a personal dispute.', global: { joy: -2, friendship: -4, respect: -4, anger: 4, resentment: 3 }, contact: { bond: -3, respect: -4, tension: 5 } },
      { id: 'host-watch-party', label: 'Invite them to watch a match and agree on respectful banter', result: 'A shared activity turned rivalry into a reason to spend time together.', global: { joy: 5, friendship: 4, patience: 2, compassion: 1 }, contact: { bond: 4, trust: 2, tension: -2 }, repair: true },
    ],
  },
  {
    id: 'movie-choice', category: 'MOVIES & TASTE', contactId: 'friend', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'You disagree about what to watch',
    scene: '{name} prefers a different film. Your current selection is {movie}. Shared time does not require identical taste.',
    choices: [
      { id: 'alternate-choice', label: 'Take turns choosing what to watch', result: 'Both preferences got space and the disagreement became small.', global: { joy: 3, patience: 3, friendship: 2, respect: 2, stress: -2 }, contact: { bond: 2, respect: 2, tension: -2 }, repair: true },
      { id: 'mock-taste', label: 'Mock their taste in front of friends', result: 'The public joke made sharing interests less comfortable.', global: { joy: -2, patience: -2, friendship: -3, respect: -3, resentment: 2 }, contact: { bond: -3, respect: -3, tension: 3 } },
      { id: 'choose-together', label: 'Find a film or documentary both can accept', result: 'The compromise kept the evening shared without erasing either preference.', global: { joy: 3, patience: 3, friendship: 3, respect: 2 }, contact: { bond: 3, respect: 2 }, repair: true },
    ],
  },
  {
    id: 'music-volume', category: 'MUSIC & HOME', contactId: 'partner', statuses: ['dating', 'engaged', 'married', 'separated'],
    title: 'Music tastes clash at home',
    scene: '{name} wants a different listening choice. Your preference is {music}. Volume, timing and consent matter as much as the genre.',
    choices: [
      { id: 'take-turns-music', label: 'Take turns choosing and agree on volume', result: 'Both tastes were respected and the shared space became easier to manage.', global: { patience: 3, affection: 2, respect: 3, joy: 3, stress: -2 }, contact: { bond: 2, respect: 3, tension: -2 }, repair: true },
      { id: 'force-music', label: 'Insist that only your choice should be heard', result: 'Control over a shared space made the disagreement worse.', global: { patience: -3, respect: -3, stress: 3, resentment: 3 }, contact: { respect: -3, tension: 4 } },
      { id: 'quiet-option', label: 'Agree on quiet time if either person needs it', result: 'Quiet was treated as a valid preference rather than rejection.', global: { patience: 3, respect: 3, stress: -3 }, contact: { trust: 2, tension: -2 }, repair: true },
    ],
  },
  {
    id: 'faith-discussion', category: 'FAITH & VALUES', contactId: 'community', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A discussion about an Islamic lesson',
    scene: 'You and {name} have different views on a lesson, preacher or gathering such as {faithCircle}. Your interest is {faithTopic}. Ask for context instead of assuming every listener agrees.',
    choices: [
      { id: 'ask-for-context', label: 'Ask what source or context they are discussing', result: 'The conversation focused on the topic and left room for different interpretations.', global: { patience: 4, respect: 4, compassion: 2, stress: -2 }, contact: { trust: 2, respect: 4, tension: -2 }, repair: true },
      { id: 'declare-enemies', label: 'Treat everyone who disagrees as an enemy', result: 'The disagreement became group hostility rather than an exchange of views.', global: { patience: -4, respect: -5, compassion: -3, anger: 4, resentment: 3 }, contact: { trust: -3, respect: -5, tension: 5 } },
      { id: 'focus-on-conduct', label: 'Bring the discussion back to kindness and everyday conduct', result: 'The conversation returned to conduct instead of ranking people or movements.', global: { compassion: 3, patience: 3, respect: 3 }, contact: { bond: 1, respect: 3, tension: -2 }, repair: true },
    ],
  },
  {
    id: 'naming-ceremony', category: 'CULTURE & FAMILY EVENTS', contactId: 'family', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A family naming ceremony is approaching',
    scene: 'Relatives are coordinating a naming ceremony or another family gathering. Some people feel pressure about money, clothes or who should be invited.',
    choices: [
      { id: 'share-practical-help', label: 'Offer time or a specific practical task', result: 'Your contribution was clear and did not depend on spending beyond your means.', global: { compassion: 3, joy: 3, family: 0, patience: 2, respect: 2, stress: -2 }, contact: { bond: 3, support: 3 }, repair: true },
      { id: 'compare-status', label: 'Compare the family’s event with richer households', result: 'The comparison added pressure without helping the preparations.', global: { joy: -2, respect: -2, stress: 3, resentment: 2 }, contact: { bond: -1, tension: 3 } },
      { id: 'agree-budget', label: 'Help agree realistic expectations and keep the event welcoming', result: 'The plan focused on inclusion rather than proving status.', global: { compassion: 3, patience: 3, joy: 2, stress: -3 }, contact: { trust: 2, bond: 3, tension: -2 }, repair: true },
    ],
  },
  {
    id: 'wedding-invitation', category: 'CULTURE & FRIENDSHIP', contactId: 'friend', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A friend is upset about a wedding invitation',
    scene: '{name} feels overlooked after an event invitation was not received. You do not know whether it was intentional.',
    choices: [
      { id: 'check-gently', label: 'Ask what happened without accusing the host', result: 'The uncertainty was checked before being treated as an insult.', global: { friendship: 3, patience: 3, respect: 3, stress: -2 }, contact: { bond: 2, trust: 2, tension: -2 }, repair: true },
      { id: 'spread-retaliation', label: 'Start a counter-rumour about the host', result: 'The response multiplied uncertainty and involved more people.', global: { friendship: -3, respect: -4, neighbourTrust: -2, resentment: 3 }, contact: { trust: -2, tension: 4 } },
      { id: 'offer-comfort', label: 'Listen and remind them that one invitation does not define them', result: 'The person received support without an invented explanation.', global: { compassion: 3, joy: 1, sadness: -2, friendship: 2 }, contact: { bond: 3, support: 3 }, repair: true },
    ],
  },
  {
    id: 'driver-breakdown-help', category: 'GENEROSITY & WORKMATES', contactId: 'colleague', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A fellow driver has a breakdown',
    scene: '{name} has stopped with a mechanical problem in a safe place. You have limited time but may be able to share information or help organise assistance.',
    choices: [
      { id: 'safe-check-help', label: 'Check they are safe and share a trusted mechanic lead', result: 'Help was offered without promising repairs you could not provide.', global: { compassion: 4, friendship: 2, neighbourTrust: 2, joy: 2 }, contact: { trust: 3, support: 4, bond: 2 }, repair: true },
      { id: 'mock-breakdown', label: 'Mock the driver for having a problem', result: 'Mockery damaged trust without solving the situation.', global: { compassion: -3, respect: -3, friendship: -2 }, contact: { respect: -3, bond: -2, tension: 3 } },
      { id: 'share-information', label: 'Send a useful route or workshop detail with permission', result: 'Practical information helped while respecting the other driver’s choice.', global: { compassion: 3, patience: 2, respect: 2 }, contact: { trust: 3, support: 3 }, repair: true },
    ],
  },
  {
    id: 'women-harassment-bystander', category: 'SAFETY & COMPASSION', contactId: 'colleague', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A woman is being harassed at a public stop',
    scene: 'You notice a woman being harassed in a public place. Prioritise safety, ask what support she wants, and avoid actions that might increase danger or take control away from her.',
    choices: [
      { id: 'ask-her-preference', label: 'Ask her what support she wants and listen', result: 'Her wishes and safety guided the next step; no one was forced to make a report.', global: { compassion: 5, respect: 4, patience: 3, autonomy: 4, stress: -1 }, contact: { respect: 3, support: 4, trust: 2 }, repair: true },
      { id: 'get-safe-help', label: 'If safe, involve trusted nearby people or appropriate help', result: 'Support was sought with attention to safety and her preferences where possible.', global: { compassion: 4, respect: 3, autonomy: 3, patience: 2 }, contact: { support: 4, trust: 2 }, repair: true },
      { id: 'ignore-her', label: 'Walk away without checking whether she needs support', result: 'The moment passed without offering help; you can choose differently in a future situation.', global: { compassion: -2, respect: -1, sadness: 1 }, contact: { support: -1 } },
    ],
  },
  {
    id: 'public-embarrassment', category: 'EMBARRASSMENT & HUMILITY', contactId: 'friend', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'An embarrassing moment becomes a joke',
    scene: 'You mispronounced a name or made a mistake in front of others. {name} notices how you handle the moment.',
    choices: [
      { id: 'laugh-own-it', label: 'Acknowledge it lightly and move on', result: 'You showed humility without making the room responsible for reassuring you.', global: { joy: 3, patience: 2, friendship: 2, stress: -2 }, contact: { bond: 2, respect: 2, tension: -1 }, repair: true },
      { id: 'blame-someone', label: 'Blame another person to save face', result: 'A small error became an avoidable conflict.', global: { respect: -3, patience: -2, resentment: 2 }, contact: { respect: -2, trust: -1, tension: 2 } },
      { id: 'defend-others', label: 'Stop others from humiliating someone else over a similar mistake', result: 'You kept the humour from turning into a pile-on.', global: { compassion: 3, respect: 3, patience: 2, joy: 1 }, contact: { respect: 2, support: 2 }, repair: true },
    ],
  },
  {
    id: 'patient-queue', category: 'PATIENCE & PUBLIC LIFE', contactId: 'community', statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    title: 'A crowded queue tests your patience',
    scene: 'Several people are waiting for a service and the order is unclear. You are already late for something important.',
    choices: [
      { id: 'calm-clarify', label: 'Ask calmly how the queue is organised', result: 'A practical question reduced confusion without insulting anyone.', global: { patience: 4, respect: 3, stress: -2 }, contact: { respect: 2, tension: -2 }, repair: true },
      { id: 'shout-and-push', label: 'Shout and push past people', result: 'The rush created more confusion and anger.', global: { patience: -4, respect: -4, anger: 4, stress: 3 }, contact: { respect: -3, tension: 4 } },
      { id: 'help-organise', label: 'Volunteer to help organise turns if people agree', result: 'Voluntary coordination made the process fairer.', global: { patience: 3, compassion: 3, respect: 3, joy: 1 }, contact: { trust: 2, support: 3 }, repair: true },
    ],
  },
]);

const CONTACT_BY_ID = new Map(SOCIAL_NETWORK_CONTACTS.map(contact => [contact.id, contact]));
const SCENE_BY_ID = new Map(SCENES.map(scene => [scene.id, scene]));

export function createDefaultSocialNetworkState(socialInput = createDefaultSocialDramaState()) {
  const social = normaliseSocialDramaState(socialInput);
  return {
    version: 1,
    storyCursor: 0,
    lastSceneId: '',
    lastChoiceId: '',
    contacts: Object.fromEntries(SOCIAL_NETWORK_CONTACTS.map(contact => [contact.id, {
      id: contact.id,
      name: contact.profileKey ? social.profile[contact.profileKey] : contact.name,
      personality: contact.personality,
      trust: contact.trust,
      bond: contact.bond,
      respect: contact.respect,
      tension: contact.tension,
      support: contact.support,
      lastInteractionDay: 0,
      interactions: 0,
    }])),
    history: [],
  };
}

export function normaliseSocialNetworkState(input, socialInput = createDefaultSocialDramaState()) {
  const defaults = createDefaultSocialNetworkState(socialInput);
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const rawContacts = source.contacts && typeof source.contacts === 'object' && !Array.isArray(source.contacts) ? source.contacts : {};
  const contacts = {};
  for (const descriptor of SOCIAL_NETWORK_CONTACTS) {
    const raw = rawContacts[descriptor.id] && typeof rawContacts[descriptor.id] === 'object'
      ? rawContacts[descriptor.id]
      : {};
    const base = defaults.contacts[descriptor.id];
    contacts[descriptor.id] = {
      id: descriptor.id,
      name: cleanText(raw.name, 36, base.name) || base.name,
      personality: descriptor.personality,
      trust: clamp(raw.trust, 0, 100, base.trust),
      bond: clamp(raw.bond, 0, 100, base.bond),
      respect: clamp(raw.respect, 0, 100, base.respect),
      tension: clamp(raw.tension, 0, 100, base.tension),
      support: clamp(raw.support, 0, 100, base.support),
      lastInteractionDay: clamp(raw.lastInteractionDay, 0, 1_000_000, 0),
      interactions: clamp(raw.interactions, 0, 1_000_000, 0),
    };
  }
  const history = Array.isArray(source.history) ? source.history.slice(-MAX_SOCIAL_NETWORK_HISTORY) : [];
  return {
    version: 1,
    storyCursor: clamp(source.storyCursor, 0, 1_000_000, 0),
    lastSceneId: SCENE_BY_ID.has(String(source.lastSceneId ?? '')) ? String(source.lastSceneId) : '',
    lastChoiceId: cleanText(source.lastChoiceId, 60),
    contacts,
    history: history.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry)).map(entry => ({
      id: cleanText(entry.id, 120),
      day: safeDay(entry.day),
      sceneId: SCENE_BY_ID.has(String(entry.sceneId ?? '')) ? String(entry.sceneId) : '',
      choiceId: cleanText(entry.choiceId, 60),
      contactId: CONTACT_BY_ID.has(String(entry.contactId ?? '')) ? String(entry.contactId) : 'friend',
      category: cleanText(entry.category, 60),
      title: cleanText(entry.title, 100),
      result: cleanText(entry.result, 240),
      relationshipStatus: safeStatus(entry.relationshipStatus),
      globalEffects: entry.globalEffects && typeof entry.globalEffects === 'object'
        ? Object.fromEntries(Object.entries(entry.globalEffects)
          .filter(([key, value]) => SOCIAL_METRICS.includes(key) && Number.isFinite(Number(value)))
          .map(([key, value]) => [key, clamp(value, -100, 100, 0)]))
        : {},
      contactEffects: entry.contactEffects && typeof entry.contactEffects === 'object'
        ? Object.fromEntries(Object.entries(entry.contactEffects)
          .filter(([key, value]) => CONTACT_METRICS.includes(key) && Number.isFinite(Number(value)))
          .map(([key, value]) => [key, clamp(value, -100, 100, 0)]))
        : {},
    })),
  };
}

function sceneAvailable(scene, status) {
  return scene.statuses.includes(safeStatus(status));
}

function sceneText(template, contact, socialState) {
  const social = normaliseSocialDramaState(socialState);
  const replacements = {
    '{name}': contact?.name || 'Your contact',
    '{team}': social.preferences.footballTeam,
    '{music}': social.preferences.music,
    '{movie}': social.preferences.movie,
    '{faithCircle}': social.preferences.religiousCircle,
    '{faithTopic}': social.preferences.religiousInterest,
  };
  return String(template || '').replace(/\{name\}|\{team\}|\{music\}|\{movie\}|\{faithCircle\}|\{faithTopic\}/g, token => replacements[token] ?? '');
}

export function getCurrentSocialNetworkScene(input, { relationshipStatus = 'single', socialState = createDefaultSocialDramaState() } = {}) {
  const state = normaliseSocialNetworkState(input, socialState);
  const status = safeStatus(relationshipStatus);
  const available = SCENES.filter(scene => sceneAvailable(scene, status) && state.contacts[scene.contactId]);
  if (!available.length) return null;
  let index = state.storyCursor % available.length;
  if (available.length > 1 && available[index].id === state.lastSceneId) index = (index + 1) % available.length;
  const scene = available[index];
  const contact = state.contacts[scene.contactId];
  return {
    id: scene.id,
    category: scene.category,
    title: scene.title,
    scene: sceneText(scene.scene, contact, socialState),
    contactId: scene.contactId,
    contactName: contact.name,
    contactRole: CONTACT_BY_ID.get(scene.contactId)?.role || 'Social contact',
    relationshipStatus: status,
    position: index + 1,
    total: available.length,
    turn: state.storyCursor + 1,
    contactSnapshot: { trust: contact.trust, bond: contact.bond, respect: contact.respect, tension: contact.tension, support: contact.support },
    choices: scene.choices.map(choice => ({
      id: choice.id,
      label: choice.label,
      result: choice.result,
      global: { ...(choice.global || {}) },
      contact: { ...(choice.contact || {}) },
    })),
  };
}

function applyMetrics(socialInput, deltas) {
  const social = normaliseSocialDramaState(socialInput);
  const applied = {};
  for (const [key, rawDelta] of Object.entries(deltas || {})) {
    if (!SOCIAL_METRICS.includes(key)) continue;
    const delta = clamp(rawDelta, -100, 100, 0);
    const before = social.metrics[key];
    const after = clamp(before + delta, 0, 100, before);
    social.metrics[key] = after;
    applied[key] = after - before;
  }
  return { social, applied };
}

function applyContactEffects(contactInput, deltas, { repair = false } = {}) {
  const contact = { ...contactInput };
  const applied = {};
  for (const [key, rawDelta] of Object.entries(deltas || {})) {
    if (!CONTACT_METRICS.includes(key)) continue;
    let delta = clamp(rawDelta, -100, 100, 0);
    // Repair attempts are a little more effective when trust is already fragile.
    if (repair && key === 'trust' && contact.trust < 40 && delta > 0) delta += 1;
    // Existing high tension makes harsh interactions more destabilising.
    if (key === 'tension' && delta > 0 && contact.tension >= 55) delta += 1;
    const before = contact[key];
    const after = clamp(before + delta, 0, 100, before);
    contact[key] = after;
    applied[key] = after - before;
  }
  return { contact, applied };
}

export function resolveSocialNetworkChoice(networkInput, socialInput, {
  sceneId, choiceId, day = 1, relationshipStatus = 'single',
} = {}) {
  const network = normaliseSocialNetworkState(networkInput, socialInput);
  const social = normaliseSocialDramaState(socialInput);
  const scene = getCurrentSocialNetworkScene(network, { relationshipStatus, socialState: social });
  if (!scene || scene.id !== String(sceneId)) return { ok: false, reason: 'scene_changed', network, social };
  const sourceScene = SCENE_BY_ID.get(scene.id);
  const choice = sourceScene?.choices.find(item => item.id === String(choiceId));
  if (!choice) return { ok: false, reason: 'invalid_choice', network, social };

  const contactBefore = network.contacts[scene.contactId];
  const contactChanged = applyContactEffects(contactBefore, choice.contact, { repair: choice.repair === true });
  network.contacts[scene.contactId] = {
    ...contactChanged.contact,
    lastInteractionDay: safeDay(day),
    interactions: clamp(contactBefore.interactions + 1, 0, 1_000_000, 1),
  };
  const globalChanged = applyMetrics(social, choice.global);
  const entry = {
    id: `${scene.id}:${choice.id}`,
    day: safeDay(day),
    sceneId: scene.id,
    choiceId: choice.id,
    contactId: scene.contactId,
    category: scene.category,
    title: scene.title,
    result: choice.result,
    relationshipStatus: safeStatus(relationshipStatus),
    globalEffects: globalChanged.applied,
    contactEffects: contactChanged.applied,
  };
  network.history.push(entry);
  network.history = network.history.slice(-MAX_SOCIAL_NETWORK_HISTORY);
  network.storyCursor += 1;
  network.lastSceneId = scene.id;
  network.lastChoiceId = choice.id;
  globalChanged.social.lastActionId = `network:${scene.id}:${choice.id}`;
  globalChanged.social.lastActionDay = safeDay(day);
  globalChanged.social.storyIndex += 1;
  globalChanged.social.history.push({
    id: `network:${scene.id}:${choice.id}`,
    day: safeDay(day),
    type: 'story',
    title: scene.title,
    result: choice.result,
    effects: globalChanged.applied,
  });
  globalChanged.social.history = globalChanged.social.history.slice(-80);

  return {
    ok: true,
    network: normaliseSocialNetworkState(network, globalChanged.social),
    social: normaliseSocialDramaState(globalChanged.social),
    entry,
    message: choice.result,
  };
}

export function skipSocialNetworkScene(networkInput, socialInput, { relationshipStatus = 'single' } = {}) {
  const state = normaliseSocialNetworkState(networkInput, socialInput);
  const current = getCurrentSocialNetworkScene(state, { relationshipStatus, socialState: socialInput });
  if (!current) return { ok: false, reason: 'no_scene', state };
  state.storyCursor += 1;
  return { ok: true, state: normaliseSocialNetworkState(state, socialInput), skippedSceneId: current.id };
}

export function getSocialNetworkSnapshot(networkInput, socialInput, { day = 1, relationshipStatus = 'single' } = {}) {
  const network = normaliseSocialNetworkState(networkInput, socialInput);
  const social = normaliseSocialDramaState(socialInput);
  const scene = getCurrentSocialNetworkScene(network, { relationshipStatus, socialState: social });
  return {
    schema: SOCIAL_NETWORK_SCHEMA,
    day: safeDay(day),
    relationshipStatus: safeStatus(relationshipStatus),
    relationshipLabel: SOCIAL_RELATIONSHIP_LABELS[safeStatus(relationshipStatus)],
    turn: network.storyCursor + 1,
    contactCount: SOCIAL_NETWORK_CONTACTS.length,
    contacts: SOCIAL_NETWORK_CONTACTS.map(descriptor => ({
      ...descriptor,
      ...network.contacts[descriptor.id],
      trust: network.contacts[descriptor.id].trust,
      bond: network.contacts[descriptor.id].bond,
      respect: network.contacts[descriptor.id].respect,
      tension: network.contacts[descriptor.id].tension,
      support: network.contacts[descriptor.id].support,
    })),
    currentScene: scene,
    recentHistory: network.history.slice(-12).reverse().map(entry => ({ ...entry, globalEffects: { ...entry.globalEffects }, contactEffects: { ...entry.contactEffects } })),
    wellbeing: { ...social.metrics },
    privacy: 'Fictional local simulation. No real people are contacted, no wallet transaction is made, and no report is sent externally.',
  };
}

export function exportSocialNetworkReport(networkInput, socialInput, options = {}) {
  const snapshot = getSocialNetworkSnapshot(networkInput, socialInput, options);
  return {
    schema: snapshot.schema,
    day: snapshot.day,
    relationshipStatus: snapshot.relationshipStatus,
    relationshipLabel: snapshot.relationshipLabel,
    contactCount: snapshot.contactCount,
    contacts: snapshot.contacts.map(contact => ({
      id: contact.id, role: contact.role, trust: contact.trust, bond: contact.bond,
      respect: contact.respect, tension: contact.tension, support: contact.support,
      interactions: contact.interactions, lastInteractionDay: contact.lastInteractionDay,
    })),
    turn: snapshot.turn,
    wellbeing: snapshot.wellbeing,
    recentHistory: snapshot.recentHistory.map(entry => ({
      day: entry.day, sceneId: entry.sceneId, choiceId: entry.choiceId, contactId: entry.contactId,
      category: entry.category, title: entry.title, result: entry.result,
      globalEffects: entry.globalEffects, contactEffects: entry.contactEffects,
    })),
    privacy: snapshot.privacy,
  };
}

export function socialNetworkRules() {
  return {
    schema: SOCIAL_NETWORK_SCHEMA,
    contacts: SOCIAL_NETWORK_CONTACTS.map(({ id, role, personality }) => ({ id, role, personality })),
    sceneCount: SCENES.length,
    relationshipStatuses: Object.keys(SOCIAL_RELATIONSHIP_LABELS),
    walletWrites: false,
    duplicateRelationshipStage: false,
    harassmentRewarded: false,
    realMessagesSent: false,
    externalReportsSent: false,
    usesSharedWellbeingMetrics: SOCIAL_DRAMA_STORAGE_KEY === SOCIAL_DRAMA_SCHEMA,
  };
}
