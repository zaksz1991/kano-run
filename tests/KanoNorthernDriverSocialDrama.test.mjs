import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOCIAL_DRAMA_SCHEMA,
  SOCIAL_DRAMA_STORAGE_KEY,
  SOCIAL_RELATIONSHIP_LABELS,
  SOCIAL_PREFERENCES,
  createDefaultSocialDramaState,
  normaliseSocialDramaState,
  updateSocialProfile,
  getSocialInteractions,
  getCurrentSocialStory,
  resolveSocialInteraction,
  resolveSocialStoryChoice,
  getSocialDramaSnapshot,
  exportSocialDramaReport,
  socialDramaRules,
} from '../js/KanoNorthernDriverSocialDrama.js';

test('social state starts with bounded metrics, private identities and realistic preferences', () => {
  const state = createDefaultSocialDramaState();
  assert.equal(state.version, 1);
  assert.equal(state.metrics.trust, 48);
  assert.ok(state.metrics.joy >= 0 && state.metrics.joy <= 100);
  assert.ok(SOCIAL_PREFERENCES.footballTeams.includes('Kano Pillars'));
  assert.ok(SOCIAL_PREFERENCES.music.includes('Hausa music'));
  assert.ok(SOCIAL_PREFERENCES.movies.includes('Kannywood drama'));
  assert.ok(SOCIAL_PREFERENCES.religiousInterests.some(item => item.includes('tafsir') || item.includes('Tafsir')));
  assert.ok(SOCIAL_PREFERENCES.religiousSpeakers.includes('Sheikh Nuru Khalid'));
  assert.ok(SOCIAL_PREFERENCES.religiousSpeakers.includes('Sheikh Aminu Daurawa')); 
  assert.equal(SOCIAL_DRAMA_STORAGE_KEY, SOCIAL_DRAMA_SCHEMA);
});

test('normalisation prevents markup injection, overlong names, bad metrics and unknown preferences', () => {
  const state = normaliseSocialDramaState({
    profile: { driverName: '<img src=x onerror=alert(1)>'.repeat(10), partnerName: '  Aisha\u0000  ' },
    metrics: { trust: 900, sadness: -4, nonsense: 55 },
    preferences: { footballTeam: 'not a club', music: 'bad option' },
  });
  assert.ok(!state.profile.driverName.includes('<'));
  assert.ok(state.profile.driverName.length <= 36);
  assert.equal(state.profile.partnerName, 'Aisha');
  assert.equal(state.metrics.trust, 100);
  assert.equal(state.metrics.sadness, 0);
  assert.equal(state.metrics.nonsense, undefined);
  assert.equal(state.preferences.footballTeam, 'Kano Pillars');
  assert.equal(state.preferences.music, 'Hausa music');
});

test('profile update accepts known interests while keeping custom names plain text', () => {
  const state = updateSocialProfile(createDefaultSocialDramaState(), {
    driverName: 'Hassan', partnerName: 'Hauwa', neighbourName: 'Malam Idris', friendName: 'Sani',
    preferences: { footballTeam: 'Arsenal', music: 'Islamic nasheeds', movie: 'Football documentary', religiousInterest: 'Community service and charitable giving', religiousCircle: 'Local mosque lesson', religiousSpeaker: 'Sheikh Nuru Khalid' },
  });
  assert.equal(state.profile.driverName, 'Hassan');
  assert.equal(state.profile.partnerName, 'Hauwa');
  assert.equal(state.preferences.footballTeam, 'Arsenal');
  assert.equal(state.preferences.music, 'Islamic nasheeds');
  assert.equal(state.preferences.movie, 'Football documentary');
  assert.equal(state.preferences.religiousCircle, 'Local mosque lesson');
  assert.equal(state.preferences.religiousSpeaker, 'Sheikh Nuru Khalid');
});

test('relationship stages include single, dating, engaged, married, separated and divorced', () => {
  assert.deepEqual(Object.keys(SOCIAL_RELATIONSHIP_LABELS), ['single', 'dating', 'engaged', 'married', 'separated', 'divorced']);
  for (const status of Object.keys(SOCIAL_RELATIONSHIP_LABELS)) {
    const story = getCurrentSocialStory(createDefaultSocialDramaState(), { relationshipStatus: status });
    assert.ok(story, `story should exist for ${status}`);
    assert.ok(story.choices.length >= 2);
  }
});

test('social activities reflect relationship stage without changing the stage itself', () => {
  const single = getSocialInteractions('single').map(item => item.id);
  const married = getSocialInteractions('married').map(item => item.id);
  assert.ok(!single.includes('family-care-planning'));
  assert.ok(married.includes('family-care-planning'));
  assert.ok(married.includes('listen-and-check-in'));
  assert.ok(single.includes('football-conversation'));
});

test('wallet-backed kindness contribution cannot overdraft and deducts only the requested amount', () => {
  const state = createDefaultSocialDramaState();
  const noMoney = resolveSocialInteraction(state, { actionId: 'small-kindness-gift', day: 1, relationshipStatus: 'single', wallet: 249 });
  assert.equal(noMoney.ok, false);
  assert.equal(noMoney.reason, 'insufficient_funds');
  const result = resolveSocialInteraction(state, { actionId: 'small-kindness-gift', day: 1, relationshipStatus: 'single', wallet: 500 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 250);
  assert.equal(result.action.price, 250);
  assert.equal(result.state.history.at(-1).type, 'interaction');
});

test('normal social interaction changes bounded metrics and records an interaction log', () => {
  let state = createDefaultSocialDramaState();
  state.metrics.compassion = 99;
  const result = resolveSocialInteraction(state, { actionId: 'neighbourhood-help', day: 3, relationshipStatus: 'single', wallet: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.state.metrics.compassion, 100);
  assert.equal(result.state.metrics.neighbourTrust, 49);
  assert.equal(result.state.lastActionId, 'neighbourhood-help');
  assert.equal(result.state.history.at(-1).day, 3);
});

test('stories progress from choice to choice and only accept choices belonging to the current scenario', () => {
  const start = createDefaultSocialDramaState();
  const story = getCurrentSocialStory(start, { relationshipStatus: 'single' });
  const invalid = resolveSocialStoryChoice(start, { scenarioId: story.id, choiceId: 'does-not-exist', day: 1, relationshipStatus: 'single' });
  assert.equal(invalid.ok, false);
  const result = resolveSocialStoryChoice(start, { scenarioId: story.id, choiceId: story.choices[0].id, day: 1, relationshipStatus: 'single' });
  assert.equal(result.ok, true);
  assert.equal(result.state.storyIndex, 1);
  assert.equal(result.state.history.at(-1).type, 'story');
  assert.notEqual(getCurrentSocialStory(result.state, { relationshipStatus: 'single' }).id, story.id);
});

test('female-harassment scenario offers only safety and support choices, never harassment as a reward', () => {
  const scenarios = [];
  let state = createDefaultSocialDramaState();
  for (let i = 0; i < 20; i += 1) {
    const story = getCurrentSocialStory(state, { relationshipStatus: 'single' });
    scenarios.push(story);
    state.storyIndex += 1;
  }
  const harassment = scenarios.find(story => story.id === 'harassment-at-the-park');
  assert.ok(harassment);
  assert.ok(harassment.choices.some(choice => choice.id === 'ask-what-support-she-wants'));
  assert.ok(harassment.choices.some(choice => choice.id === 'get-safe-help'));
  assert.equal(harassment.choices.some(choice => /harass|stalk|coerce/i.test(`${choice.id} ${choice.label}`)), false);
  assert.equal(socialDramaRules().harassmentCanBeRewarded, false);
});

test('separation and divorce scenes prioritise boundaries, safety and voluntary mediation', () => {
  const separated = getCurrentSocialStory(createDefaultSocialDramaState(), { relationshipStatus: 'separated' });
  assert.ok(separated);
  const candidates = [];
  let state = createDefaultSocialDramaState();
  for (let i = 0; i < 30; i += 1) {
    const story = getCurrentSocialStory(state, { relationshipStatus: 'divorced' });
    candidates.push(story);
    state.storyIndex += 1;
  }
  const story = candidates.find(item => item.id === 'separation-and-boundaries');
  assert.ok(story);
  assert.ok(story.choices.some(choice => /safe/i.test(choice.label)));
  assert.ok(story.choices.some(choice => /only if safe and voluntary/i.test(choice.label)));
});

test('exports omit all personal names while preserving aggregate progress and preferences', () => {
  const state = updateSocialProfile(createDefaultSocialDramaState(), {
    driverName: 'Private Driver Name', partnerName: 'Private Partner Name', neighbourName: 'Private Neighbour Name', friendName: 'Private Friend Name',
    preferences: { footballTeam: 'Kano Pillars' },
  });
  const report = exportSocialDramaReport(state, { day: 10, relationshipStatus: 'married' });
  const text = JSON.stringify(report);
  assert.equal(report.schema, SOCIAL_DRAMA_SCHEMA);
  assert.equal(report.relationshipStatus, 'married');
  assert.equal(text.includes('Private Driver Name'), false);
  assert.equal(text.includes('Private Partner Name'), false);
  assert.equal(text.includes('Private Neighbour Name'), false);
  assert.equal(text.includes('Private Friend Name'), false);
  assert.ok(report.privacy.includes('omitted'));
});

test('snapshots include fictional metrics, preferences, current story and recent events', () => {
  const result = resolveSocialInteraction(createDefaultSocialDramaState(), { actionId: 'football-conversation', relationshipStatus: 'single', day: 2, wallet: 0 });
  const snapshot = getSocialDramaSnapshot(result.state, { day: 2, relationshipStatus: 'single' });
  assert.equal(snapshot.relationshipStatus, 'single');
  assert.equal(snapshot.metrics.friendship, 51);
  assert.equal(snapshot.preferences.footballTeam, 'Kano Pillars');
  assert.ok(snapshot.currentStory.id);
  assert.equal(snapshot.recentHistory.length, 1);
});

test('history is bounded at the documented maximum and schema reports single-wallet safeguards', () => {
  let state = createDefaultSocialDramaState();
  for (let i = 0; i < 100; i += 1) {
    const result = resolveSocialInteraction(state, { actionId: 'patient-boundary', relationshipStatus: 'single', day: i + 1, wallet: 0 });
    assert.equal(result.ok, true);
    state = result.state;
  }
  assert.equal(state.history.length, 80);
  assert.equal(socialDramaRules().usesExternalWallet, true);
  assert.equal(socialDramaRules().externalRelationshipStageIsAuthoritative, true);
});

test('love, anger, resentment, sadness and grief are separately tracked and clamped', () => {
  let state = createDefaultSocialDramaState();
  assert.ok(Object.hasOwn(state.metrics, 'affection'));
  assert.ok(Object.hasOwn(state.metrics, 'anger'));
  assert.ok(Object.hasOwn(state.metrics, 'resentment'));
  assert.ok(Object.hasOwn(state.metrics, 'sadness'));
  assert.ok(Object.hasOwn(state.metrics, 'grief'));
  const result = resolveSocialStoryChoice(state, {
    scenarioId: getCurrentSocialStory(state, { relationshipStatus: 'dating' }).id,
    choiceId: 'harsh-reply',
    day: 1,
    relationshipStatus: 'dating',
  });
  // The first dating story is a misunderstanding; a harsh reply should record anger and resentment.
  assert.equal(result.ok, true);
  assert.ok(result.state.metrics.anger > state.metrics.anger);
  assert.ok(result.state.metrics.resentment > state.metrics.resentment);
});

test('profile names personalise story text without becoming HTML', () => {
  const state = updateSocialProfile(createDefaultSocialDramaState(), { partnerName: 'Hauwa' });
  const story = getCurrentSocialStory(state, { relationshipStatus: 'dating' });
  assert.ok(story.scene.includes('Hauwa'));
  assert.equal(story.scene.includes('<'), false);
});

test('married stories include optional household fairness without assuming every family is polygynous', () => {
  let state = createDefaultSocialDramaState();
  let found = null;
  for (let i = 0; i < 40; i += 1) {
    const story = getCurrentSocialStory(state, { relationshipStatus: 'married' });
    if (story.id === 'household-fairness') { found = story; break; }
    state.storyIndex += 1;
  }
  assert.ok(found);
  assert.ok(found.scene.includes('If your family includes co-wives'));
  assert.ok(found.choices.some(choice => /without humiliating anyone/i.test(choice.label)));
});
