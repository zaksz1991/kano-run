import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOCIAL_NETWORK_SCHEMA,
  SOCIAL_NETWORK_STORAGE_KEY,
  SOCIAL_NETWORK_CONTACTS,
  createDefaultSocialNetworkState,
  normaliseSocialNetworkState,
  getCurrentSocialNetworkScene,
  resolveSocialNetworkChoice,
  skipSocialNetworkScene,
  getSocialNetworkSnapshot,
  exportSocialNetworkReport,
  socialNetworkRules,
} from '../js/KanoNorthernDriverSocialNetwork.js';
import {
  createDefaultSocialDramaState,
  normaliseSocialDramaState,
  updateSocialProfile,
  SOCIAL_RELATIONSHIP_LABELS,
} from '../js/KanoNorthernDriverSocialDrama.js';

test('network defaults create distinct persistent contacts seeded from the shared social profile', () => {
  const social = updateSocialProfile(createDefaultSocialDramaState(), {
    partnerName: 'Hauwa', friendName: 'Sani Bello', neighbourName: 'Malam Idris',
  });
  const state = createDefaultSocialNetworkState(social);
  assert.equal(SOCIAL_NETWORK_SCHEMA, SOCIAL_NETWORK_STORAGE_KEY);
  assert.equal(state.contacts.partner.name, 'Hauwa');
  assert.equal(state.contacts.friend.name, 'Sani Bello');
  assert.equal(state.contacts.neighbour.name, 'Malam Idris');
  assert.equal(Object.keys(state.contacts).length, 8);
  assert.ok(Object.keys(state.contacts).includes('footballFriend'));
});

test('network normalisation blocks markup, bad state, arbitrary NPCs and unbounded metrics', () => {
  const normalized = normaliseSocialNetworkState({
    storyCursor: -50,
    lastSceneId: 'made-up-scene',
    contacts: {
      partner: { name: '<script>hack</script>Aisha\u0000', trust: 900, tension: -6, mystery: 999 },
      extraHacker: { name: 'Unexpected' },
    },
    history: [{ sceneId: 'not-real', contactId: 'extraHacker', day: -100, result: '<b>wrong</b>' }],
  });
  assert.equal(normalized.storyCursor, 0);
  assert.equal(normalized.lastSceneId, '');
  assert.equal(normalized.contacts.partner.trust, 100);
  assert.equal(normalized.contacts.partner.tension, 0);
  assert.ok(!normalized.contacts.partner.name.includes('<'));
  assert.equal(normalized.contacts.partner.mystery, undefined);
  assert.equal(normalized.contacts.extraHacker, undefined);
  assert.equal(normalized.history[0].contactId, 'friend');
  assert.equal(normalized.history[0].sceneId, '');
  assert.ok(!normalized.history[0].result.includes('<'));
});

test('every existing relationship stage has a context-appropriate social story', () => {
  const network = createDefaultSocialNetworkState();
  const social = createDefaultSocialDramaState();
  for (const status of Object.keys(SOCIAL_RELATIONSHIP_LABELS)) {
    const scene = getCurrentSocialNetworkScene(network, { relationshipStatus: status, socialState: social });
    assert.ok(scene, `expected scene for ${status}`);
    assert.ok(scene.choices.length >= 3);
    if (status === 'single') assert.notEqual(scene.id, 'couple-misunderstanding');
    if (status === 'divorced') assert.notEqual(scene.id, 'couple-misunderstanding');
  }
});

test('saved preferences are reflected in football, music, film and Islamic discussion scenes', () => {
  const social = updateSocialProfile(createDefaultSocialDramaState(), {
    preferences: {
      footballTeam: 'Kano Pillars', music: 'Islamic nasheeds', movie: 'Kannywood comedy',
      religiousInterest: 'Community service and charitable giving', religiousCircle: 'Tijaniyya gathering',
      religiousSpeaker: 'Sheikh Aminu Daurawa',
    },
  });
  let network = createDefaultSocialNetworkState(social);
  let current;
  const found = new Set();
  for (let i = 0; i < 60; i += 1) {
    current = getCurrentSocialNetworkScene(network, { relationshipStatus: 'married', socialState: social });
    if (current) found.add(current.id);
    network = skipSocialNetworkScene(network, social, { relationshipStatus: 'married' }).state;
  }
  assert.ok(found.has('football-banter'));
  assert.ok(found.has('movie-choice'));
  assert.ok(found.has('faith-discussion'));
  assert.ok(found.has('music-volume'));
  const faith = getCurrentSocialNetworkScene({ ...network, storyCursor: findCursorFor(network, social, 'faith-discussion') }, { relationshipStatus: 'married', socialState: social });
  assert.match(faith.scene, /Tijaniyya gathering|Community service and charitable giving/);
});

function findCursorFor(state, social, sceneId) {
  const status = 'married';
  for (let cursor = 0; cursor < 200; cursor += 1) {
    const probe = { ...state, storyCursor: cursor, lastSceneId: '' };
    if (getCurrentSocialNetworkScene(probe, { relationshipStatus: status, socialState: social })?.id === sceneId) return cursor;
  }
  return 0;
}

test('resolving a story updates NPC memory and the shared wellbeing save together', () => {
  const social = createDefaultSocialDramaState();
  const network = createDefaultSocialNetworkState(social);
  const scene = getCurrentSocialNetworkScene(network, { relationshipStatus: 'single', socialState: social });
  const before = network.contacts[scene.contactId];
  const choice = scene.choices.find(item => item.contact.trust > 0 || item.contact.bond > 0 || item.contact.support > 0);
  assert.ok(choice);
  const result = resolveSocialNetworkChoice(network, social, {
    sceneId: scene.id, choiceId: choice.id, day: 5, relationshipStatus: 'single',
  });
  assert.equal(result.ok, true);
  assert.equal(result.network.history.at(-1).sceneId, scene.id);
  assert.equal(result.network.contacts[scene.contactId].interactions, 1);
  assert.equal(result.network.contacts[scene.contactId].lastInteractionDay, 5);
  assert.equal(result.social.storyIndex, social.storyIndex + 1);
  assert.equal(result.social.history.at(-1).type, 'story');
  assert.ok(Object.values(result.network.contacts[scene.contactId]).some(value => typeof value === 'number' && value !== before.trust));
});

test('choice validation rejects a forged option and stale scene without changing state', () => {
  const social = createDefaultSocialDramaState();
  const network = createDefaultSocialNetworkState(social);
  const scene = getCurrentSocialNetworkScene(network, { relationshipStatus: 'single', socialState: social });
  const invalid = resolveSocialNetworkChoice(network, social, {
    sceneId: scene.id, choiceId: 'admin-grant-reward', day: 1, relationshipStatus: 'single',
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, 'invalid_choice');
  const stale = resolveSocialNetworkChoice(network, social, {
    sceneId: 'women-harassment-bystander', choiceId: 'ask-her-preference', day: 1, relationshipStatus: 'single',
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'scene_changed');
  assert.equal(network.storyCursor, 0);
  assert.equal(social.storyIndex, 0);
});

test('scene skipping advances narrative without changing social wellbeing or logging a consequence', () => {
  const social = createDefaultSocialDramaState();
  const network = createDefaultSocialNetworkState(social);
  const scene = getCurrentSocialNetworkScene(network, { relationshipStatus: 'single', socialState: social });
  const skipped = skipSocialNetworkScene(network, social, { relationshipStatus: 'single' });
  assert.equal(skipped.ok, true);
  assert.equal(skipped.state.storyCursor, 1);
  assert.equal(getCurrentSocialNetworkScene(skipped.state, { relationshipStatus: 'single', socialState: social }).id === scene.id, false);
  assert.equal(social.metrics.trust, 48);
  assert.equal(social.storyIndex, 0);
  assert.equal(network.history.length, 0);
});

test('NPC memory changes subsequent snapshots and values remain bounded', () => {
  let social = createDefaultSocialDramaState();
  let network = createDefaultSocialNetworkState(social);
  for (let i = 0; i < 40; i += 1) {
    const scene = getCurrentSocialNetworkScene(network, { relationshipStatus: 'married', socialState: social });
    const choice = scene.choices[i % scene.choices.length];
    const outcome = resolveSocialNetworkChoice(network, social, {
      sceneId: scene.id, choiceId: choice.id, day: i + 1, relationshipStatus: 'married',
    });
    assert.equal(outcome.ok, true);
    network = outcome.network;
    social = outcome.social;
  }
  const snapshot = getSocialNetworkSnapshot(network, social, { day: 40, relationshipStatus: 'married' });
  assert.equal(snapshot.recentHistory.length, 12);
  assert.ok(snapshot.contacts.every(person => ['trust', 'bond', 'respect', 'tension', 'support'].every(key => person[key] >= 0 && person[key] <= 100)));
  assert.ok(Object.values(snapshot.wellbeing).every(value => value >= 0 && value <= 100));
  assert.equal(network.history.length, 40);
});

test('harassment scenario offers only response choices centred on safety and support', () => {
  const social = createDefaultSocialDramaState();
  const network = createDefaultSocialNetworkState(social);
  let state = { ...network, storyCursor: 0, lastSceneId: '' };
  let found = null;
  for (let i = 0; i < 100; i += 1) {
    found = getCurrentSocialNetworkScene(state, { relationshipStatus: 'single', socialState: social });
    if (found.id === 'women-harassment-bystander') break;
    state = skipSocialNetworkScene(state, social, { relationshipStatus: 'single' }).state;
  }
  assert.equal(found.id, 'women-harassment-bystander');
  assert.ok(found.choices.some(choice => choice.id === 'ask-her-preference'));
  assert.ok(found.choices.some(choice => choice.id === 'get-safe-help'));
  assert.ok(found.choices.every(choice => !/harass.*reward|reward.*harass|join.*harass/i.test(`${choice.label} ${choice.result}`)));
});

test('co-parenting story is available only when the authoritative stage is separated or divorced', () => {
  const social = createDefaultSocialDramaState();
  let network = createDefaultSocialNetworkState(social);
  const contains = status => {
    const ids = new Set();
    for (let i = 0; i < 120; i += 1) {
      const scene = getCurrentSocialNetworkScene(network, { relationshipStatus: status, socialState: social });
      if (scene) ids.add(scene.id);
      network = skipSocialNetworkScene(network, social, { relationshipStatus: status }).state;
    }
    return ids;
  };
  assert.ok(contains('divorced').has('co-parenting-plan'));
  assert.ok(!contains('single').has('co-parenting-plan'));
});

test('anonymous report omits contact names and the rules forbid wallet, message and external report writes', () => {
  const social = updateSocialProfile(createDefaultSocialDramaState(), { partnerName: 'Private Test Name' });
  const network = createDefaultSocialNetworkState(social);
  const report = exportSocialNetworkReport(network, social, { day: 7, relationshipStatus: 'single' });
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('Private Test Name'));
  assert.ok(!report.contacts.some(contact => Object.hasOwn(contact, 'name')));
  const rules = socialNetworkRules();
  assert.equal(rules.walletWrites, false);
  assert.equal(rules.duplicateRelationshipStage, false);
  assert.equal(rules.harassmentRewarded, false);
  assert.equal(rules.realMessagesSent, false);
  assert.equal(rules.externalReportsSent, false);
});

test('network choice changes shared metrics without ever writing a wallet field', () => {
  const social = createDefaultSocialDramaState();
  const network = createDefaultSocialNetworkState(social);
  const scene = getCurrentSocialNetworkScene(network, { relationshipStatus: 'single', socialState: social });
  const choice = scene.choices[0];
  const result = resolveSocialNetworkChoice(network, social, {
    sceneId: scene.id, choiceId: choice.id, day: 2, relationshipStatus: 'single',
  });
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.social, 'money'), false);
  assert.equal(Object.hasOwn(result.network, 'money'), false);
  assert.equal(result.network.storyCursor, 1);
});
