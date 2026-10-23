// ============================================================
// KANO LIFE — PEOPLE, RELATIONSHIPS & SOCIAL DRAMA
// Pure simulation rules; no DOM, wallet writes, audio, or real-world messaging.
// The existing Aure Journey remains the authoritative relationship stage.
// ============================================================

export const SOCIAL_DRAMA_SCHEMA = 'kano-life-social-drama-v1';
export const SOCIAL_DRAMA_STORAGE_KEY = 'kano-life-social-drama-v1';
export const MAX_SOCIAL_HISTORY = 80;

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
const validChoice = value => /^[a-z0-9-]{1,60}$/i.test(String(value ?? ''));

export const SOCIAL_RELATIONSHIP_LABELS = Object.freeze({
  single: 'Single',
  dating: 'Dating · boyfriend / girlfriend / partner',
  engaged: 'Engaged · preparing for Aure',
  married: 'Married · spouse / wife / husband',
  separated: 'Separated · boundaries and practical support',
  divorced: 'Divorced · rebuilding and co-parenting if relevant',
});

const METRIC_DEFAULTS = Object.freeze({
  affection: 48,
  trust: 48,
  patience: 52,
  compassion: 50,
  joy: 48,
  sadness: 18,
  stress: 22,
  respect: 52,
  neighbourTrust: 45,
  friendship: 48,
  autonomy: 52,
  anger: 20,
  resentment: 12,
  grief: 10,
});

const FOOTBALL_TEAMS = Object.freeze([
  'Kano Pillars', 'Rangers International', 'Enyimba', 'Remo Stars',
  'Bendel Insurance', 'Manchester United', 'Arsenal', 'Chelsea',
  'Liverpool', 'Manchester City', 'Real Madrid', 'Barcelona', 'Bayern Munich',
]);
const MUSIC_CHOICES = Object.freeze([
  'Hausa music', 'Arewa hip-hop', 'Islamic nasheeds', 'Afrobeats',
  'Classic highlife', 'Radio news and talk', 'Quiet / no music',
]);
const MOVIE_CHOICES = Object.freeze([
  'Kannywood drama', 'Kannywood comedy', 'Historical film', 'Football documentary',
  'Action film', 'Family drama', 'Educational documentary', 'No movie today',
]);
const RELIGIOUS_INTERESTS = Object.freeze([
  'Qur’an tafsir and reflection', 'Hadith, character and everyday conduct',
  'Family responsibilities and kindness', 'Youth and everyday challenges',
  'Community service and charitable giving', 'Ask a trusted scholar a question',
  'Listen quietly; discuss later',
]);
const RELIGIOUS_CIRCLES = Object.freeze([
  'No group preference', 'Izala / JIBWIS-oriented lesson', 'Tijaniyya gathering',
  'Qadiriyya gathering', 'Ahlussunnah teacher', 'Independent scholar',
  'Women’s tafsir circle', 'Local mosque lesson',
]);
const RELIGIOUS_SPEAKERS = Object.freeze([
  'No named speaker — choose a topic', 'Sheikh Nuru Khalid', 'Sheikh Jabar Sani Mai Hula',
  'Dr Bashir Aliyu', 'Sheikh Aminu Daurawa', 'Dr Isa Ali Pantami',
  'Women scholars and local teachers',
]);

export const SOCIAL_PREFERENCES = Object.freeze({
  footballTeams: FOOTBALL_TEAMS,
  music: MUSIC_CHOICES,
  movies: MOVIE_CHOICES,
  religiousInterests: RELIGIOUS_INTERESTS,
  religiousCircles: RELIGIOUS_CIRCLES,
  religiousSpeakers: RELIGIOUS_SPEAKERS,
});

export function createDefaultSocialDramaState() {
  return {
    version: 1,
    profile: {
      driverName: 'Aminu',
      partnerName: 'Aisha',
      neighbourName: 'Malam Musa',
      friendName: 'Sani',
    },
    preferences: {
      footballTeam: 'Kano Pillars',
      music: 'Hausa music',
      movie: 'Kannywood drama',
      religiousInterest: 'Hadith, character and everyday conduct',
      religiousCircle: 'No group preference',
      religiousSpeaker: 'No named speaker — choose a topic',
    },
    metrics: { ...METRIC_DEFAULTS },
    storyIndex: 0,
    lastActionId: '',
    lastActionDay: 0,
    history: [],
  };
}

function normaliseAllowed(value, allowed, fallback) {
  const text = String(value ?? '');
  return allowed.includes(text) ? text : fallback;
}

export function normaliseSocialDramaState(input) {
  const defaults = createDefaultSocialDramaState();
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const rawProfile = source.profile && typeof source.profile === 'object' ? source.profile : {};
  const rawPreferences = source.preferences && typeof source.preferences === 'object' ? source.preferences : {};
  const rawMetrics = source.metrics && typeof source.metrics === 'object' ? source.metrics : {};
  const history = Array.isArray(source.history) ? source.history.slice(-MAX_SOCIAL_HISTORY) : [];
  return {
    version: 1,
    profile: {
      driverName: cleanText(rawProfile.driverName, 36, defaults.profile.driverName) || defaults.profile.driverName,
      partnerName: cleanText(rawProfile.partnerName, 36, defaults.profile.partnerName) || defaults.profile.partnerName,
      neighbourName: cleanText(rawProfile.neighbourName, 36, defaults.profile.neighbourName) || defaults.profile.neighbourName,
      friendName: cleanText(rawProfile.friendName, 36, defaults.profile.friendName) || defaults.profile.friendName,
    },
    preferences: {
      footballTeam: normaliseAllowed(rawPreferences.footballTeam, FOOTBALL_TEAMS, defaults.preferences.footballTeam),
      music: normaliseAllowed(rawPreferences.music, MUSIC_CHOICES, defaults.preferences.music),
      movie: normaliseAllowed(rawPreferences.movie, MOVIE_CHOICES, defaults.preferences.movie),
      religiousInterest: normaliseAllowed(rawPreferences.religiousInterest, RELIGIOUS_INTERESTS, defaults.preferences.religiousInterest),
      religiousCircle: normaliseAllowed(rawPreferences.religiousCircle, RELIGIOUS_CIRCLES, defaults.preferences.religiousCircle),
      religiousSpeaker: normaliseAllowed(rawPreferences.religiousSpeaker, RELIGIOUS_SPEAKERS, defaults.preferences.religiousSpeaker),
    },
    metrics: Object.fromEntries(Object.keys(METRIC_DEFAULTS).map(key => [
      key, clamp(rawMetrics[key], 0, 100, METRIC_DEFAULTS[key]),
    ])),
    storyIndex: clamp(source.storyIndex, 0, 1_000_000, 0),
    lastActionId: cleanText(source.lastActionId, 60),
    lastActionDay: safeDay(source.lastActionDay),
    history: history.filter(item => item && typeof item === 'object').map(item => ({
      id: cleanText(item.id, 60),
      day: safeDay(item.day),
      type: item.type === 'story' ? 'story' : 'interaction',
      title: cleanText(item.title, 100),
      result: cleanText(item.result, 240),
      effects: item.effects && typeof item.effects === 'object'
        ? Object.fromEntries(Object.entries(item.effects)
          .filter(([key, value]) => Object.hasOwn(METRIC_DEFAULTS, key) && Number.isFinite(Number(value)))
          .map(([key, value]) => [key, clamp(value, -100, 100, 0)]))
        : {},
    })),
  };
}

const STORY_SCENARIOS = Object.freeze([
  {
    id: 'misunderstood-message',
    statuses: ['dating', 'engaged', 'married'],
    category: 'relationship',
    title: 'A message was misunderstood',
    scene: 'Your partner reads a short message as dismissive. Both of you are tired after a long day. The next response can repair or worsen the misunderstanding.',
    choices: [
      { id: 'listen-first', label: 'Listen, clarify what you meant, and ask how it felt', result: 'The conversation becomes calmer. Listening does not mean agreeing on everything.', effects: { trust: 5, affection: 3, patience: 4, joy: 2, stress: -5, respect: 3 } },
      { id: 'harsh-reply', label: 'Reply harshly and dismiss the concern', result: 'The argument grows. A later apology can repair some, but not all, of the damage.', effects: { trust: -5, affection: -3, patience: -6, joy: -3, sadness: 3, stress: 8, respect: -5, anger: 6, resentment: 5, grief: 1 } },
      { id: 'pause-return', label: 'Ask for a pause, then agree on a time to return', result: 'A respectful pause helps both people settle before continuing.', effects: { trust: 3, patience: 4, joy: 1, stress: -4, respect: 3, anger: -3 } },
    ],
  },
  {
    id: 'commitment-forgotten',
    statuses: ['dating', 'engaged', 'married'],
    category: 'relationship',
    title: 'A promise was forgotten',
    scene: 'A promised visit or call did not happen. Your partner feels unimportant, while you were under pressure from work.',
    choices: [
      { id: 'own-the-mistake', label: 'Acknowledge it and agree on a realistic plan', result: 'You took responsibility without making a promise you cannot keep.', effects: { trust: 5, affection: 2, patience: 3, stress: -3, respect: 3 } },
      { id: 'explain-without-listening', label: 'Explain your workload but do not hear them out', result: 'The reason is understood only partly; the hurt remains.', effects: { trust: -1, patience: -2, stress: 3 } },
      { id: 'make-a-grand-promise', label: 'Make a grand promise just to end the argument', result: 'The immediate tension falls, but expectations may be harder to meet later.', effects: { joy: 1, trust: -2, stress: 2 } },
    ],
  },
  {
    id: 'gossip-and-rumour',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    category: 'reputation',
    title: 'Neighbourhood gossip spreads',
    scene: 'A neighbour repeats an unverified story about your private life. Other people are waiting to see whether you will repeat it or set a boundary.',
    choices: [
      { id: 'check-privately', label: 'Check facts privately and refuse to spread it', result: 'You protected privacy and avoided escalating an unverified claim.', effects: { trust: 2, patience: 4, compassion: 2, respect: 4, stress: -2 } },
      { id: 'public-insult', label: 'Insult everyone involved in public', result: 'The response may feel satisfying briefly, but the dispute spreads.', effects: { patience: -5, respect: -4, joy: -2, stress: 6, anger: 5, resentment: 3 } },
      { id: 'set-a-boundary', label: 'Say calmly that private matters are not community entertainment', result: 'You kept a firm boundary without humiliating the neighbour.', effects: { patience: 2, respect: 4, trust: 1, stress: -2 } },
    ],
  },
  {
    id: 'embarrassing-moment',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    category: 'emotion',
    title: 'An embarrassing moment in public',
    scene: 'You mispronounce a name at the park and several people laugh. A friend looks at you to see whether you will laugh it off, lash out, or blame someone else.',
    choices: [
      { id: 'laugh-with-care', label: 'Smile at yourself and move on', result: 'You recovered without making another person the target.', effects: { joy: 4, patience: 3, respect: 2, stress: -4 } },
      { id: 'snap-back', label: 'Snap at the people who laughed', result: 'The embarrassment turns into a public argument.', effects: { patience: -4, respect: -3, stress: 5, sadness: 2 } },
      { id: 'blame-a-friend', label: 'Blame a friend to draw attention away from yourself', result: 'The joke lands on your friend, who may not trust you with a vulnerable moment next time.', effects: { friendship: -5, trust: -2, compassion: -3, respect: -2, stress: 3 } },
    ],
  },
  {
    id: 'football-banter',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    category: 'football',
    title: 'Football talk gets heated',
    scene: 'Your friends are debating Kano Pillars and their favourite Nigerian or European clubs. A teasing remark risks becoming a personal insult.',
    choices: [
      { id: 'playful-banter', label: 'Use playful banter and respect the other supporter', result: 'The football argument stays playful; friends can support different teams and remain close.', effects: { joy: 5, friendship: 3, patience: 2, respect: 3, stress: -2 } },
      { id: 'attack-the-person', label: 'Attack the supporter instead of discussing football', result: 'The discussion turns personal and the bond weakens.', effects: { joy: -2, friendship: -5, patience: -4, respect: -4, stress: 4, anger: 4, resentment: 4 } },
      { id: 'change-the-topic', label: 'Agree to disagree and ask about their week', result: 'You protect the friendship and learn what else is happening in their life.', effects: { friendship: 3, compassion: 2, trust: 2, stress: -2 } },
    ],
  },
  {
    id: 'religious-discussion',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    category: 'faith-and-values',
    title: 'A discussion about a sermon',
    scene: 'A friend shares a lecture or tafsir clip about family duties, youth concerns or charitable work. The people listening have different teachers and backgrounds; the conversation does not need to become a contest.',
    choices: [
      { id: 'listen-respectfully', label: 'Listen, ask what they found useful, and discuss the practical point', result: 'You discussed the lesson without claiming that one social group is superior or humiliating a person for their tradition.', effects: { patience: 4, compassion: 3, friendship: 2, respect: 3, stress: -2 } },
      { id: 'share-without-pressure', label: 'Share a lesson you value, then let others choose whether to listen', result: 'You shared an interest without pressuring friends to adopt your preference.', effects: { friendship: 2, trust: 2, patience: 2, respect: 2 } },
      { id: 'mock-their-choice', label: 'Mock the teacher or group they follow', result: 'The other person feels insulted and the conversation stops being constructive.', effects: { friendship: -5, patience: -5, respect: -6, stress: 5 } },
    ],
  },
  {
    id: 'harassment-at-the-park',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    category: 'safety-and-respect',
    title: 'A woman is being harassed at the park',
    scene: 'A woman waiting for transport is being pestered after she has made it clear that the attention is unwanted. Your response should prioritise her safety and choices. The game never rewards harassment.',
    choices: [
      { id: 'ask-what-support-she-wants', label: 'Give her space and ask what support she wants', result: 'You respected her agency and helped create a safer space without speaking over her.', effects: { compassion: 6, respect: 5, patience: 3, neighbourTrust: 3, joy: 1, stress: -2 } },
      { id: 'get-safe-help', label: 'Alert a trusted park official or security person if safe', result: 'You used a safer support route instead of escalating the confrontation. Immediate danger calls for urgent local help.', effects: { compassion: 5, respect: 4, patience: 2, neighbourTrust: 2, stress: -1 } },
      { id: 'leave-and-check-safely', label: 'Avoid escalating physically; check from a safe distance and seek help', result: 'You prioritised safety and sought support rather than risking a violent confrontation.', effects: { compassion: 2, respect: 2, patience: 2, neighbourTrust: 1 } },
    ],
  },
  {
    id: 'music-and-film-choice',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    category: 'media',
    title: 'You disagree about music or movies',
    scene: 'A friend or partner wants a different radio station or film. Preferences differ: Hausa music, nasheeds, Arewa hip-hop, Afrobeats, Kannywood, comedy and documentaries can all be part of different people’s routines.',
    choices: [
      { id: 'take-turns-choosing', label: 'Take turns choosing and listen without mocking', result: 'You made room for two tastes instead of treating one preference as the only acceptable one.', effects: { joy: 4, patience: 3, friendship: 2, affection: 2, respect: 2, stress: -2 } },
      { id: 'mock-their-taste', label: 'Mock their taste to win the argument', result: 'A small disagreement becomes a personal jab.', effects: { joy: -2, patience: -4, friendship: -3, respect: -3, stress: 4, anger: 3, resentment: 2 } },
      { id: 'choose-a-third-option', label: 'Choose a neutral film, radio programme or quiet time', result: 'You found a third option and kept the evening calm.', effects: { joy: 3, patience: 2, stress: -3, respect: 1 } },
    ],
  },
  {
    id: 'neighbour-needs-help',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    category: 'neighbourhood',
    title: 'A neighbour needs practical help',
    scene: 'A neighbour is short of transport after an appointment and asks for assistance. You have your own work and household limits, so kindness should be realistic rather than performative.',
    choices: [
      { id: 'offer-realistic-help', label: 'Offer the help you can safely manage', result: 'A realistic offer builds trust without promising more than your time or money allows.', effects: { compassion: 5, neighbourTrust: 5, friendship: 2, joy: 3, respect: 2, stress: -2 } },
      { id: 'connect-support', label: 'Connect them to another trusted person or service', result: 'You helped by connecting the neighbour to a useful support route.', effects: { compassion: 4, neighbourTrust: 3, friendship: 1, respect: 2 } },
      { id: 'decline-kindly', label: 'Explain that you cannot help today, without shaming them', result: 'You kept a boundary without turning someone’s need into a public embarrassment.', effects: { patience: 2, respect: 2, compassion: 1 } },
    ],
  },
  {
    id: 'sadness-and-setbacks',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    category: 'wellbeing',
    title: 'A difficult day brings sadness',
    scene: 'Fares were poor and a private worry follows you home. Someone notices you are quiet. You can speak with a trusted person, take time to settle, or pretend you are fine when you need support.',
    choices: [
      { id: 'talk-to-trusted-person', label: 'Talk honestly with someone you trust', result: 'You shared only what you felt comfortable sharing and received support without being judged.', effects: { sadness: -5, stress: -5, joy: 3, friendship: 3, trust: 2 } },
      { id: 'take-rest-and-return', label: 'Take a short rest and return to the conversation later', result: 'Rest became a deliberate pause rather than an attempt to punish someone with silence.', effects: { sadness: -3, stress: -4, patience: 3, joy: 1 } },
      { id: 'snap-at-everyone', label: 'Take your frustration out on family or neighbours', result: 'Other people absorb the stress. Repair is possible, but the behaviour has a cost.', effects: { sadness: 2, stress: 5, compassion: -4, respect: -3, friendship: -2, anger: 4, resentment: 3 } },
    ],
  },
  {
    id: 'separation-and-boundaries',
    statuses: ['separated', 'divorced'],
    category: 'family-and-boundaries',
    title: 'A difficult separation needs practical boundaries',
    scene: 'A message about belongings, family visits or shared responsibilities arrives. Reconciliation is not compulsory; safety, dignity and clear arrangements matter. Mediation is only an option if it is safe and freely chosen.',
    choices: [
      { id: 'clear-safe-boundary', label: 'Write a clear, calm boundary and keep a copy', result: 'You recorded a practical boundary without using humiliation as leverage.', effects: { autonomy: 4, patience: 3, respect: 3, stress: -3, anger: -2, grief: -1 } },
      { id: 'trusted-mediation', label: 'Consider a trusted mediator only if safe and voluntary', result: 'You considered support while preserving each person’s right to decline.', effects: { trust: 1, patience: 2, respect: 2, stress: -2 } },
      { id: 'avoid-gossip', label: 'Decline to discuss private details with neighbours', result: 'You protected privacy and focused on practical next steps.', effects: { autonomy: 3, respect: 3, stress: -2, neighbourTrust: 1 } },
    ],
  },
  {
    id: 'household-fairness',
    statuses: ['married'],
    category: 'family-and-household',
    title: 'Household expectations need clarity',
    scene: 'Work schedules, extended-family requests and household responsibilities are colliding. If your family includes co-wives or a wider household, this can be a conversation about fair time, resources and respectful communication; if not, treat it as a shared-budget and workload discussion.',
    choices: [
      { id: 'agree-clear-arrangement', label: 'Discuss a realistic, fair arrangement without humiliating anyone', result: 'You made room for people to explain their needs and recorded a practical arrangement to revisit.', effects: { trust: 4, patience: 3, compassion: 4, respect: 4, stress: -3, resentment: -2, anger: -1 } },
      { id: 'listen-to-each-person', label: 'Listen to each person privately and protect confidentiality', result: 'You avoided turning a private household concern into public gossip.', effects: { trust: 3, patience: 4, compassion: 3, respect: 4, stress: -2, resentment: -1 } },
      { id: 'impose-without-discussion', label: 'Impose a rule without listening to affected family members', result: 'The immediate decision is made, but resentment and mistrust rise.', effects: { trust: -4, patience: -4, respect: -4, anger: 3, resentment: 5, stress: 5 } },
    ],
  },
  {
    id: 'shared-care',
    statuses: ['married', 'separated', 'divorced'],
    category: 'family-and-care',
    title: 'Household care needs attention',
    scene: 'Work, family visits and home responsibilities have collided. If children are already part of the household, predictable care matters; otherwise this is a conversation about shared household duties. This scene never creates a child or changes a health record.',
    choices: [
      { id: 'make-a-care-plan', label: 'Agree on a realistic schedule and who will do each task', result: 'The plan turns vague expectations into responsibilities that can be reviewed.', effects: { trust: 4, patience: 3, compassion: 3, respect: 3, stress: -4 } },
      { id: 'ask-for-help', label: 'Ask a trusted relative for practical support if appropriate', result: 'You asked for help without assuming every relative is available or entitled to private details.', effects: { compassion: 2, neighbourTrust: 1, stress: -3, respect: 2 } },
      { id: 'blame-the-other-person', label: 'Blame the other person without discussing what is realistic', result: 'The practical problem remains and resentment increases.', effects: { trust: -4, patience: -4, stress: 5, respect: -3, anger: 4, resentment: 4 } },
    ],
  },
]);

const INTERACTIONS = Object.freeze([
  {
    id: 'listen-and-check-in', label: 'Listen and check in', category: 'Relationships',
    statuses: ['dating', 'engaged', 'married', 'separated', 'divorced'],
    description: 'Give your partner or former partner room to speak, where contact is welcome and safe.',
    result: 'You made time to listen and asked before trying to solve the problem.',
    effects: { trust: 3, affection: 2, patience: 3, respect: 2, stress: -2 },
  },
  {
    id: 'apologise-genuinely', label: 'Make a genuine apology', category: 'Relationships',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    description: 'Name the harm, avoid excuses, and say what will change.',
    result: 'You acknowledged the impact of your words and identified a better next step.',
    effects: { trust: 3, affection: 1, patience: 3, compassion: 3, respect: 3, stress: -2, anger: -3, resentment: -2 },
  },
  {
    id: 'patient-boundary', label: 'Set a patient boundary', category: 'Relationships',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    description: 'Be clear without shaming, threatening or manipulating the other person.',
    result: 'You communicated a boundary without degrading anyone.',
    effects: { patience: 4, respect: 4, autonomy: 3, stress: -2, anger: -2, resentment: -1 },
  },
  {
    id: 'neighbourhood-help', label: 'Help a neighbour', category: 'Neighbourhood',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    description: 'Offer directions, a small errand or a practical connection you can safely manage.',
    result: 'You offered practical help without taking over the neighbour’s choices.',
    effects: { compassion: 4, neighbourTrust: 4, joy: 2, respect: 2, stress: -1 },
  },
  {
    id: 'small-kindness-gift', label: 'Give a small kindness gift · ₦250', category: 'Generosity',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'], price: 250,
    description: 'Buy a modest snack or transport support using the existing banked wallet.',
    result: 'You gave a modest gift without expecting affection, loyalty or a favour in return.',
    effects: { compassion: 3, neighbourTrust: 2, joy: 3, respect: 2, stress: -1 },
  },
  {
    id: 'football-conversation', label: 'Talk football without attacking supporters', category: 'Football',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    description: 'Discuss Kano Pillars, Nigerian league clubs or European teams; banter is optional, humiliation is not.',
    result: 'You discussed teams, favourite players or a memorable match while keeping the friendship intact.',
    effects: { joy: 4, friendship: 3, patience: 2, respect: 2, stress: -2 },
  },
  {
    id: 'listen-to-lesson', label: 'Listen to a religious lesson', category: 'Faith & values',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    description: 'Listen to the optional speaker/topic you selected, or choose tafsir, hadith and character, family responsibilities, youth issues or community service. No audio is downloaded or played by this panel.',
    result: 'You made time to listen and reflect. The game does not grade faith or declare one movement superior.',
    effects: { patience: 3, compassion: 2, respect: 2, stress: -2, joy: 1 },
  },
  {
    id: 'shared-music-film', label: 'Share a music or movie choice', category: 'Culture & media',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    description: 'Offer a preferred track, nasheed, film or documentary; accept that another person may decline.',
    result: 'You shared a preference without demanding that everyone enjoy the same thing.',
    effects: { joy: 4, patience: 2, friendship: 2, affection: 1, respect: 2, stress: -2 },
  },
  {
    id: 'family-care-planning', label: 'Coordinate household or child care', category: 'Family',
    statuses: ['married', 'separated', 'divorced'],
    description: 'Talk about chores, school runs, appointments or shared responsibilities only where they apply to your existing household.',
    result: 'You made a practical care plan. No child, pregnancy or health record was created or changed.',
    effects: { trust: 3, patience: 2, compassion: 3, respect: 3, stress: -3 },
  },
  {
    id: 'support-sad-friend', label: 'Support a friend having a difficult day', category: 'Compassion',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'],
    description: 'Listen, ask what would help, and respect if the friend wants privacy.',
    result: 'You offered support without making the friend explain more than they wanted.',
    effects: { friendship: 4, compassion: 4, joy: 2, sadness: -3, stress: -3, respect: 2 },
  },
  {
    id: 'community-contribution', label: 'Contribute to neighbourhood help · ₦200', category: 'Generosity',
    statuses: ['single', 'dating', 'engaged', 'married', 'separated', 'divorced'], price: 200,
    description: 'Make a small fictional contribution to a community relief effort. Payment uses the existing game wallet.',
    result: 'You made a voluntary contribution within your means. The game does not promise a real-world service.',
    effects: { compassion: 4, neighbourTrust: 3, joy: 2, respect: 3, stress: -1 },
  },
]);

export function getSocialInteractions(relationshipStatus = 'single') {
  const status = Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, relationshipStatus) ? relationshipStatus : 'single';
  return INTERACTIONS.filter(item => item.statuses.includes(status)).map(item => ({
    ...item,
    effects: { ...item.effects },
  }));
}

function applyEffects(state, effects) {
  const next = normaliseSocialDramaState(state);
  const applied = {};
  for (const [key, rawDelta] of Object.entries(effects || {})) {
    if (!Object.hasOwn(next.metrics, key)) continue;
    const delta = clamp(rawDelta, -100, 100, 0);
    const previous = next.metrics[key];
    const updated = clamp(previous + delta, 0, 100, previous);
    applied[key] = updated - previous;
    next.metrics[key] = updated;
  }
  return { state: next, effects: applied };
}

function recordHistory(state, { id, day, type, title, result, effects }) {
  state.history.push({
    id: cleanText(id, 60),
    day: safeDay(day),
    type: type === 'story' ? 'story' : 'interaction',
    title: cleanText(title, 100),
    result: cleanText(result, 240),
    effects: effects && typeof effects === 'object' ? { ...effects } : {},
  });
  state.history = state.history.slice(-MAX_SOCIAL_HISTORY);
  return state;
}

export function updateSocialProfile(input, profile = {}) {
  const state = normaliseSocialDramaState(input);
  state.profile = {
    driverName: cleanText(profile.driverName ?? state.profile.driverName, 36, state.profile.driverName) || state.profile.driverName,
    partnerName: cleanText(profile.partnerName ?? state.profile.partnerName, 36, state.profile.partnerName) || state.profile.partnerName,
    neighbourName: cleanText(profile.neighbourName ?? state.profile.neighbourName, 36, state.profile.neighbourName) || state.profile.neighbourName,
    friendName: cleanText(profile.friendName ?? state.profile.friendName, 36, state.profile.friendName) || state.profile.friendName,
  };
  const preferences = profile.preferences && typeof profile.preferences === 'object' ? profile.preferences : {};
  state.preferences = {
    footballTeam: normaliseAllowed(preferences.footballTeam ?? state.preferences.footballTeam, FOOTBALL_TEAMS, state.preferences.footballTeam),
    music: normaliseAllowed(preferences.music ?? state.preferences.music, MUSIC_CHOICES, state.preferences.music),
    movie: normaliseAllowed(preferences.movie ?? state.preferences.movie, MOVIE_CHOICES, state.preferences.movie),
    religiousInterest: normaliseAllowed(preferences.religiousInterest ?? state.preferences.religiousInterest, RELIGIOUS_INTERESTS, state.preferences.religiousInterest),
    religiousCircle: normaliseAllowed(preferences.religiousCircle ?? state.preferences.religiousCircle, RELIGIOUS_CIRCLES, state.preferences.religiousCircle),
    religiousSpeaker: normaliseAllowed(preferences.religiousSpeaker ?? state.preferences.religiousSpeaker, RELIGIOUS_SPEAKERS, state.preferences.religiousSpeaker),
  };
  return normaliseSocialDramaState(state);
}

export function resolveSocialInteraction(input, { actionId, day = 1, relationshipStatus = 'single', wallet = 0 } = {}) {
  const state = normaliseSocialDramaState(input);
  const status = Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, relationshipStatus) ? relationshipStatus : 'single';
  const action = INTERACTIONS.find(item => item.id === String(actionId) && item.statuses.includes(status));
  if (!action) return { ok: false, reason: 'interaction_not_available_for_status', state };
  const availableWallet = clamp(wallet, 0, 1_000_000_000, 0);
  if ((action.price || 0) > availableWallet) return { ok: false, reason: 'insufficient_funds', state, required: action.price || 0, wallet: availableWallet };
  const changed = applyEffects(state, action.effects);
  const next = changed.state;
  next.lastActionId = action.id;
  next.lastActionDay = safeDay(day);
  recordHistory(next, { id: action.id, day, type: 'interaction', title: action.label, result: action.result, effects: changed.effects });
  return {
    ok: true,
    state: normaliseSocialDramaState(next),
    action: { id: action.id, label: action.label, price: action.price || 0, effects: changed.effects },
    wallet: availableWallet - (action.price || 0),
    message: action.result,
  };
}

export function getCurrentSocialStory(input, { relationshipStatus = 'single' } = {}) {
  const state = normaliseSocialDramaState(input);
  const status = Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, relationshipStatus) ? relationshipStatus : 'single';
  const available = STORY_SCENARIOS.filter(scenario => scenario.statuses.includes(status));
  if (!available.length) return null;
  const index = state.storyIndex % available.length;
  const scenario = available[index];
  return {
    id: scenario.id,
    category: scenario.category,
    title: scenario.title,
    scene: scenario.scene
      .replace(/\byour partner\b/gi, state.profile.partnerName)
      .replace(/\ba neighbour\b/gi, state.profile.neighbourName)
      .replace(/\ba friend\b/gi, state.profile.friendName)
      .replace(/\byour friends\b/gi, `${state.profile.friendName} and others`),
    position: index + 1,
    total: available.length,
    turn: state.storyIndex + 1,
    choices: scenario.choices.map(choice => ({
      id: choice.id,
      label: choice.label,
      result: choice.result,
      effects: { ...choice.effects },
    })),
  };
}

export function resolveSocialStoryChoice(input, { scenarioId, choiceId, day = 1, relationshipStatus = 'single' } = {}) {
  const state = normaliseSocialDramaState(input);
  const story = getCurrentSocialStory(state, { relationshipStatus });
  if (!story || story.id !== String(scenarioId)) return { ok: false, reason: 'story_changed', state };
  if (!validChoice(choiceId)) return { ok: false, reason: 'invalid_choice', state };
  const sourceScenario = STORY_SCENARIOS.find(item => item.id === story.id);
  const choice = sourceScenario?.choices.find(item => item.id === String(choiceId));
  if (!choice) return { ok: false, reason: 'invalid_choice', state };
  const changed = applyEffects(state, choice.effects);
  const next = changed.state;
  next.storyIndex += 1;
  next.lastActionId = `${story.id}:${choice.id}`;
  next.lastActionDay = safeDay(day);
  recordHistory(next, {
    id: `${story.id}:${choice.id}`,
    day,
    type: 'story',
    title: story.title,
    result: choice.result,
    effects: changed.effects,
  });
  return {
    ok: true,
    state: normaliseSocialDramaState(next),
    story: { id: story.id, title: story.title, choiceId: choice.id },
    message: choice.result,
    effects: changed.effects,
  };
}

export function getSocialDramaSnapshot(input, { day = 1, relationshipStatus = 'single' } = {}) {
  const state = normaliseSocialDramaState(input);
  const status = Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, relationshipStatus) ? relationshipStatus : 'single';
  return {
    schema: SOCIAL_DRAMA_SCHEMA,
    day: safeDay(day),
    relationshipStatus: status,
    relationshipLabel: SOCIAL_RELATIONSHIP_LABELS[status],
    profile: { ...state.profile },
    preferences: { ...state.preferences },
    metrics: { ...state.metrics },
    storyIndex: state.storyIndex,
    currentStory: getCurrentSocialStory(state, { relationshipStatus: status }),
    recentHistory: state.history.slice(-8).reverse(),
  };
}

export function exportSocialDramaReport(input, { day = 1, relationshipStatus = 'single' } = {}) {
  const state = normaliseSocialDramaState(input);
  const status = Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, relationshipStatus) ? relationshipStatus : 'single';
  return {
    schema: SOCIAL_DRAMA_SCHEMA,
    exportedAt: new Date().toISOString(),
    day: safeDay(day),
    relationshipStatus: status,
    relationshipLabel: SOCIAL_RELATIONSHIP_LABELS[status],
    metrics: { ...state.metrics },
    preferences: {
      footballTeam: state.preferences.footballTeam,
      music: state.preferences.music,
      movie: state.preferences.movie,
      religiousInterest: state.preferences.religiousInterest,
      religiousCircle: state.preferences.religiousCircle,
      religiousSpeaker: state.preferences.religiousSpeaker,
    },
    storyProgress: { resolvedScenes: state.storyIndex },
    history: state.history.slice(-40).map(item => ({ ...item, effects: { ...item.effects } })),
    privacy: 'Fictional in-game records only. Player, partner, friend and neighbour names are omitted. No real messages or reports were sent.',
  };
}

export function socialDramaRules() {
  return {
    metrics: Object.keys(METRIC_DEFAULTS),
    maxHistory: MAX_SOCIAL_HISTORY,
    relationshipStatuses: Object.keys(SOCIAL_RELATIONSHIP_LABELS),
    dailyStoryGate: false,
    harassmentCanBeRewarded: false,
    usesExternalWallet: true,
    externalRelationshipStageIsAuthoritative: true,
  };
}
