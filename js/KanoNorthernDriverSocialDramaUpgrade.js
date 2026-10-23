// ============================================================
// KANO LIFE — SOCIAL DRAMA UI & SAFE GAME INTEGRATION
// Add-on panel. The existing Game, save schema, wallet and Aure Journey remain authoritative.
// ============================================================
import { UI } from './ui.js';
import { save, persist } from './storage.js';
import {
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
} from './KanoNorthernDriverSocialDrama.js';

const INSTALL_KEY = Symbol.for('kano.life.socialDrama.installed.v1');
const UI_PATCH_KEY = Symbol.for('kano.life.socialDrama.uiReferencePatch.v1');
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const safeDay = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(1_000_000, Math.floor(n))) : 1;
};
const html = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};

let state = readState();
let lastNotice = '';
let noticeTimer = 0;
let careerObserver = null;

function readState() {
  try {
    const raw = globalThis.localStorage?.getItem(SOCIAL_DRAMA_STORAGE_KEY);
    return normaliseSocialDramaState(raw ? JSON.parse(raw) : createDefaultSocialDramaState());
  } catch {
    return createDefaultSocialDramaState();
  }
}

function writeState(next) {
  const normalized = normaliseSocialDramaState(next);
  try {
    if (!globalThis.localStorage?.setItem || !globalThis.localStorage?.getItem) return false;
    const serialised = JSON.stringify(normalized);
    globalThis.localStorage.setItem(SOCIAL_DRAMA_STORAGE_KEY, serialised);
    if (globalThis.localStorage.getItem(SOCIAL_DRAMA_STORAGE_KEY) !== serialised) return false;
    state = normalized;
    window.dispatchEvent(new CustomEvent('kano:social-drama-updated', {
      detail: { storyIndex: state.storyIndex, lastActionId: state.lastActionId },
    }));
    return true;
  } catch {
    return false;
  }
}

function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_GAME__ || null : null);
  const s = game?.s || {};
  const dayFromGame = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay
    ?? s.gameDay ?? s.day ?? save?.lifestyle?.worldDayNumber ?? state.lastActionDay ?? 1;
  const status = getRelationshipStatus();
  const gameState = String(game?.state || 'INTRO');
  const runWasStarted = Boolean(s.runStartedAt || Number(s.distance) > 0 || Number(s.score) > 0);
  const activeShift = gameState === 'PLAY' || gameState === 'EVENT'
    || (gameState === 'MENU' && runWasStarted);
  return {
    ui,
    game,
    s,
    day: safeDay(dayFromGame),
    relationshipStatus: status,
    activeShift,
    wallet: Math.max(0, Math.floor(Number(save?.money) || 0)),
  };
}

function getRelationshipStatus() {
  try {
    const report = window.kanoNorthernDriverAureJourney?.snapshot?.();
    const fromJourney = String(report?.status || report?.relationshipStatus || '');
    if (Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, fromJourney)) return fromJourney;
  } catch { /* the life/career panel may not have loaded yet */ }
  try {
    const aureRaw = globalThis.localStorage?.getItem('kano-life-aure-journey-v1');
    const aure = aureRaw ? JSON.parse(aureRaw) : null;
    const fromStoredJourney = String(aure?.currentStatus || '');
    if (Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, fromStoredJourney)) return fromStoredJourney;
  } catch { /* corrupted optional relationship save is ignored */ }
  try {
    const profile = window.kanoNorthernDriverAureAndCulture?.snapshot?.();
    const fromProfile = String(profile?.relationshipStatus || '');
    if (Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, fromProfile)) return fromProfile;
  } catch { /* optional compatibility layer */ }
  return 'single';
}

function ensureUIReferenceHook() {
  if (UI.prototype[UI_PATCH_KEY]) return;
  const originalInitSelects = UI.prototype.initSelects;
  if (typeof originalInitSelects === 'function') {
    UI.prototype.initSelects = function kanoSocialTrackInitSelects(...args) {
      window.__KANO_ACTIVE_UI__ = this;
      try {
        const result = originalInitSelects.apply(this, args);
        window.__KANO_ACTIVE_UI__ = this;
        window.__KANO_UI_INIT_SELECTS_COMPLETE__ = true;
        return result;
      } catch (error) {
        window.__KANO_ACTIVE_UI__ = this;
        throw error;
      }
    };
  }
  const originalBind = UI.prototype.bind;
  if (typeof originalBind === 'function') {
    UI.prototype.bind = function kanoSocialTrackBind(game, ...args) {
      const result = originalBind.call(this, game, ...args);
      window.__KANO_ACTIVE_UI__ = this;
      window.__KANO_ACTIVE_GAME__ = game;
      window.__KANO_UI_BOUND__ = Boolean(this.bound);
      window.dispatchEvent(new CustomEvent('kano:app-ui-ready', { detail: { gameState: game?.state || 'INTRO' } }));
      render();
      return result;
    };
  }
  Object.defineProperty(UI.prototype, UI_PATCH_KEY, { value: true, configurable: false });
}

function notify(message, error = false) {
  lastNotice = String(message || '');
  const node = $('#kds-notice');
  if (node) {
    node.textContent = lastNotice;
    node.dataset.state = error ? 'error' : 'ok';
    node.hidden = !lastNotice;
  }
  const ui = context().ui;
  if (ui && typeof ui.toast === 'function') ui.toast(lastNotice);
  if (noticeTimer) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    const current = $('#kds-notice');
    if (current) current.hidden = true;
  }, 6000);
}

function appendOptions(select, options, currentValue) {
  if (!select) return;
  select.replaceChildren();
  for (const value of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  select.value = options.includes(currentValue) ? currentValue : (options[0] || '');
}

function ensurePanel() {
  if ($('#social-drama-screen')) return $('#social-drama-screen');
  const root = $('#game-container') || $('#app') || document.body;
  const panel = html('section', 'screen hidden kds-screen');
  panel.id = 'social-drama-screen';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'kds-title');
  panel.innerHTML = `
    <div class="panel kds-panel">
      <button class="close-x" id="kds-close" type="button" aria-label="Close people and relationships">×</button>
      <p class="eyebrow">KANO LIFE · PEOPLE &amp; RELATIONSHIPS</p>
      <h2 id="kds-title">People make the story.</h2>
      <p class="kds-intro">Build trust, repair misunderstandings, talk football, share music and films, listen to religious lessons, support neighbours and navigate family changes. These are fictional, private in-game interactions.</p>
      <div class="kds-status-strip"><span id="kds-stage">Relationship stage: Single</span><span id="kds-turn">Story 1</span></div>
      <div class="kds-safety-note" id="kds-safety-note">Social interactions are unavailable while a driving shift is active. A separate-life panel never writes real messages or reports.</div>
      <section class="kds-card" aria-labelledby="kds-profile-title">
        <div class="kds-section-title"><div><p class="eyebrow">PROFILE &amp; PREFERENCES</p><h3 id="kds-profile-title">Your people, your interests</h3></div></div>
        <div class="kds-fields">
          <label>Driver name<input id="kds-driver-name" maxlength="36" autocomplete="off"></label>
          <label>Partner name<input id="kds-partner-name" maxlength="36" autocomplete="off"></label>
          <label>Neighbour name<input id="kds-neighbour-name" maxlength="36" autocomplete="off"></label>
          <label>Friend name<input id="kds-friend-name" maxlength="36" autocomplete="off"></label>
          <label>Football team<select id="kds-football"></select></label>
          <label>Music / radio taste<select id="kds-music"></select></label>
          <label>Movie choice<select id="kds-movie"></select></label>
          <label>Religious topic<select id="kds-religious-interest"></select></label>
          <label>Lesson / gathering interest<select id="kds-religious-circle"></select></label>
          <label>Preacher / speaker interest<select id="kds-religious-speaker"></select></label>
        </div>
        <div class="kds-row-actions"><button id="kds-save-profile" type="button" class="primary">SAVE PROFILE</button><button id="kds-open-journey" type="button" class="secondary">LIFE &amp; CAREER MILESTONES</button></div>
        <p class="kds-footnote">Choose interests, not a mandatory identity. References to Islamic teaching circles are neutral discussion preferences, not doctrinal ratings or endorsements.</p>
      </section>
      <section class="kds-card" aria-labelledby="kds-story-heading">
        <div class="kds-section-title"><div><p class="eyebrow">ONGOING SOCIAL STORY</p><h3 id="kds-story-heading">Today’s situation</h3></div><span class="kds-tag" id="kds-story-category">RELATIONSHIP</span></div>
        <h4 id="kds-story-title">A conversation is waiting.</h4>
        <p id="kds-story-copy" class="kds-story-copy"></p>
        <div id="kds-story-choices" class="kds-choice-list"></div>
        <p class="kds-footnote">Each choice changes the fictional relationship and wellbeing indicators. Stories continue as you resolve them; they do not depend on a calendar counter advancing correctly.</p>
      </section>
      <section class="kds-card" aria-labelledby="kds-activities-heading">
        <div class="kds-section-title"><div><p class="eyebrow">EVERYDAY INTERACTIONS</p><h3 id="kds-activities-heading">Choose an activity</h3></div></div>
        <div class="kds-metrics" id="kds-metrics"></div>
        <div class="kds-activity-list" id="kds-activities"></div>
      </section>
      <section class="kds-card" aria-labelledby="kds-history-heading">
        <div class="kds-section-title"><div><p class="eyebrow">RELATIONSHIP HISTORY</p><h3 id="kds-history-heading">Recent moments</h3></div></div>
        <div id="kds-history" class="kds-history"></div>
        <div class="kds-row-actions"><button id="kds-export" type="button" class="secondary">EXPORT PRIVACY-SAFE REPORT</button><button id="kds-back" type="button" class="secondary">BACK TO MENU</button></div>
        <div id="kds-notice" class="kds-notice" role="status" hidden></div>
      </section>
      <p class="kds-disclaimer">Harassment is never offered as a playable reward. Safety scenes prioritise consent, the woman’s choices and safe support. Separation or divorce does not automatically mean failure, and mediation is never compulsory.</p>
    </div>`;
  root.append(panel);
  appendOptions($('#kds-football', panel), SOCIAL_PREFERENCES.footballTeams, state.preferences.footballTeam);
  appendOptions($('#kds-music', panel), SOCIAL_PREFERENCES.music, state.preferences.music);
  appendOptions($('#kds-movie', panel), SOCIAL_PREFERENCES.movies, state.preferences.movie);
  appendOptions($('#kds-religious-interest', panel), SOCIAL_PREFERENCES.religiousInterests, state.preferences.religiousInterest);
  appendOptions($('#kds-religious-circle', panel), SOCIAL_PREFERENCES.religiousCircles, state.preferences.religiousCircle);
  appendOptions($('#kds-religious-speaker', panel), SOCIAL_PREFERENCES.religiousSpeakers, state.preferences.religiousSpeaker);
  bindPanel(panel);
  render();
  return panel;
}

function bindPanel(panel) {
  $('#kds-close', panel)?.addEventListener('click', closePanel);
  $('#kds-back', panel)?.addEventListener('click', closePanel);
  $('#kds-save-profile', panel)?.addEventListener('click', saveProfile);
  $('#kds-open-journey', panel)?.addEventListener('click', openRelationshipJourney);
  $('#kds-export', panel)?.addEventListener('click', exportReport);
  $('#kds-story-choices', panel)?.addEventListener('click', event => {
    const button = event.target.closest('[data-kds-choice]');
    if (!button) return;
    chooseStory(button.dataset.kdsStory, button.dataset.kdsChoice);
  });
  $('#kds-activities', panel)?.addEventListener('click', event => {
    const button = event.target.closest('[data-kds-action]');
    if (!button) return;
    doActivity(button.dataset.kdsAction);
  });
}

function openPanel(source = 'start') {
  const panel = ensurePanel();
  const ctx = context();
  if (source === 'menu') ctx.ui?.hide?.('menu-screen');
  else ctx.ui?.hide?.('start-screen');
  panel.classList.remove('hidden');
  panel.scrollTop = 0;
  render();
  $('#kds-close', panel)?.focus?.();
}

function closePanel() {
  $('#social-drama-screen')?.classList.add('hidden');
  const ctx = context();
  if (ctx.ui) {
    if (ctx.game?.state === 'MENU') ctx.ui.show('menu-screen');
    else if (ctx.game?.state === 'INTRO' || !ctx.game) ctx.ui.show('start-screen');
  } else {
    $('#start-screen')?.classList.remove('hidden');
  }
}

function ensureStartButton() {
  const startExtras = $('.start-extra');
  if (!startExtras || $('#kano-social-drama-btn')) return;
  const button = html('button', 'secondary kds-launch-button', 'PEOPLE · RELATIONSHIPS & SOCIAL LIFE');
  button.type = 'button';
  button.id = 'kano-social-drama-btn';
  startExtras.insertAdjacentElement('afterend', button);
}

function ensureMenuButton() {
  const menuActions = $('.menu-actions', $('#menu-screen') || document);
  if (!menuActions || $('#kds-social-menu-btn')) return;
  const button = html('button', '', 'PEOPLE & RELATIONSHIPS');
  button.type = 'button';
  button.id = 'kds-social-menu-btn';
  button.addEventListener('click', () => openPanel('menu'));
  menuActions.insertBefore(button, menuActions.firstChild);
}

function saveProfile() {
  const ctx = context();
  if (ctx.activeShift) {
    notify('Finish the driving shift before saving relationship and household interactions.', true);
    return;
  }
  const next = updateSocialProfile(state, {
    driverName: $('#kds-driver-name')?.value,
    partnerName: $('#kds-partner-name')?.value,
    neighbourName: $('#kds-neighbour-name')?.value,
    friendName: $('#kds-friend-name')?.value,
    preferences: {
      footballTeam: $('#kds-football')?.value,
      music: $('#kds-music')?.value,
      movie: $('#kds-movie')?.value,
      religiousInterest: $('#kds-religious-interest')?.value,
      religiousCircle: $('#kds-religious-circle')?.value,
      religiousSpeaker: $('#kds-religious-speaker')?.value,
    },
  });
  if (!writeState(next)) {
    notify('Browser storage is unavailable. No profile change was saved.', true);
    return;
  }
  // The existing name field used by the game's global display may be updated; other relationship names remain local to this panel.
  try {
    globalThis.localStorage?.setItem('kano-life-global-display-name-v1', next.profile.driverName);
    window.dispatchEvent(new CustomEvent('kano:profile-updated', { detail: { displayName: next.profile.driverName } }));
  } catch { /* social profile storage remains authoritative for this optional panel */ }
  notify('Profile and social preferences saved on this device.');
  render();
}

function persistActionTransaction(nextState, result, expectedWallet) {
  const cost = Math.max(0, Math.floor(Number(result.action?.price) || 0));
  const ctx = context();
  if (cost > 0) {
    const beforeWallet = Math.max(0, Math.floor(Number(save.money) || 0));
    if (beforeWallet !== expectedWallet || beforeWallet < cost) {
      notify('The banked wallet changed or has insufficient funds. No contribution was made.', true);
      return false;
    }
    const previousSocialRaw = (() => {
      try { return globalThis.localStorage?.getItem(SOCIAL_DRAMA_STORAGE_KEY) ?? null; } catch { return null; }
    })();
    save.money = beforeWallet - cost;
    if (!persist()) {
      save.money = beforeWallet;
      persist();
      notify('The wallet could not save the purchase. No contribution was recorded.', true);
      return false;
    }
    if (!writeState(nextState)) {
      save.money = beforeWallet;
      persist();
      try {
        if (previousSocialRaw === null) globalThis.localStorage?.removeItem(SOCIAL_DRAMA_STORAGE_KEY);
        else globalThis.localStorage?.setItem(SOCIAL_DRAMA_STORAGE_KEY, previousSocialRaw);
      } catch { /* best-effort rollback */ }
      notify('The social record could not be saved; the wallet transaction was rolled back.', true);
      return false;
    }
    window.dispatchEvent(new CustomEvent('kano:wallet-updated', {
      detail: { money: save.money, reason: 'social-kindness' },
    }));
    return true;
  }
  if (!writeState(nextState)) {
    notify('Browser storage is unavailable. No interaction was recorded.', true);
    return false;
  }
  return true;
}

function doActivity(actionId) {
  const ctx = context();
  if (ctx.activeShift) {
    notify('People and household activities are locked while a driving shift is active. Finish the shift or return home first.', true);
    return;
  }
  const result = resolveSocialInteraction(state, {
    actionId,
    day: ctx.day,
    relationshipStatus: ctx.relationshipStatus,
    wallet: ctx.wallet,
  });
  if (!result.ok) {
    if (result.reason === 'insufficient_funds') notify(`This activity costs ₦${result.required.toLocaleString()}; the banked wallet has ₦${ctx.wallet.toLocaleString()}.`, true);
    else notify('This activity is not available for the current relationship stage.', true);
    return;
  }
  if (!persistActionTransaction(result.state, result, ctx.wallet)) return;
  notify(result.message || 'Interaction recorded.');
  render();
}

function chooseStory(scenarioId, choiceId) {
  const ctx = context();
  if (ctx.activeShift) {
    notify('Finish or safely return from the driving shift before resolving a social situation.', true);
    return;
  }
  const result = resolveSocialStoryChoice(state, {
    scenarioId,
    choiceId,
    day: ctx.day,
    relationshipStatus: ctx.relationshipStatus,
  });
  if (!result.ok) {
    notify('The story changed or that choice is unavailable. Review the current situation.', true);
    render();
    return;
  }
  if (!writeState(result.state)) {
    notify('Browser storage is unavailable. The story choice was not saved.', true);
    return;
  }
  notify(result.message || 'Story choice recorded.');
  render();
}

function openRelationshipJourney() {
  const ctx = context();
  $('#social-drama-screen')?.classList.add('hidden');
  const button = $('#life-career-btn') || $('#life-career-menu-btn');
  if (button) button.click();
  else {
    ctx.ui?.toast?.('Open LIFE & CAREER from the main menu to manage relationship stages and Aure milestones.');
    $('#start-screen')?.classList.remove('hidden');
  }
}

function exportReport() {
  const ctx = context();
  const report = exportSocialDramaReport(state, {
    day: ctx.day,
    relationshipStatus: ctx.relationshipStatus,
  });
  try {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kano-life-social-drama-day-${ctx.day}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Privacy-safe social story report exported. Personal names are omitted.');
  } catch {
    notify('This browser could not create the report file.', true);
  }
}

function metricBar(label, value, negative = false) {
  const row = html('div', 'kds-metric');
  const heading = html('div', 'kds-metric-heading');
  heading.append(html('span', '', label), html('strong', '', `${value}%`));
  const track = html('div', 'kds-metric-track');
  const fill = html('i', negative ? 'is-negative' : '');
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  track.append(fill);
  row.append(heading, track);
  return row;
}

function render() {
  const panel = $('#social-drama-screen');
  if (!panel) return;
  state = normaliseSocialDramaState(state);
  const ctx = context();
  const snapshot = getSocialDramaSnapshot(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  const activeStory = getCurrentSocialStory(state, { relationshipStatus: ctx.relationshipStatus });
  const driverName = $('#kds-driver-name', panel);
  const partnerName = $('#kds-partner-name', panel);
  const neighbourName = $('#kds-neighbour-name', panel);
  const friendName = $('#kds-friend-name', panel);
  // Keep typed fields stable while the user edits them; populate on first render only.
  if (driverName && !driverName.dataset.initialised) { driverName.value = state.profile.driverName; driverName.dataset.initialised = '1'; }
  if (partnerName && !partnerName.dataset.initialised) { partnerName.value = state.profile.partnerName; partnerName.dataset.initialised = '1'; }
  if (neighbourName && !neighbourName.dataset.initialised) { neighbourName.value = state.profile.neighbourName; neighbourName.dataset.initialised = '1'; }
  if (friendName && !friendName.dataset.initialised) { friendName.value = state.profile.friendName; friendName.dataset.initialised = '1'; }
  if ($('#kds-football', panel)) $('#kds-football', panel).value = state.preferences.footballTeam;
  if ($('#kds-music', panel)) $('#kds-music', panel).value = state.preferences.music;
  if ($('#kds-movie', panel)) $('#kds-movie', panel).value = state.preferences.movie;
  if ($('#kds-religious-interest', panel)) $('#kds-religious-interest', panel).value = state.preferences.religiousInterest;
  if ($('#kds-religious-circle', panel)) $('#kds-religious-circle', panel).value = state.preferences.religiousCircle;
  if ($('#kds-religious-speaker', panel)) $('#kds-religious-speaker', panel).value = state.preferences.religiousSpeaker;

  const stage = $('#kds-stage', panel);
  if (stage) stage.textContent = `Relationship stage: ${snapshot.relationshipLabel}`;
  const turn = $('#kds-turn', panel);
  if (turn) turn.textContent = `Story ${snapshot.storyIndex + 1}`;
  const safety = $('#kds-safety-note', panel);
  if (safety) {
    safety.textContent = ctx.activeShift
      ? 'Driving shift active. Social choices are locked until the shift is safely finished. Use the pause menu to return when ready.'
      : 'Off shift. Relationship scenes and everyday interactions are available. Money-based gifts use the existing banked wallet.';
    safety.dataset.active = ctx.activeShift ? 'true' : 'false';
  }
  const storyCategory = $('#kds-story-category', panel);
  if (storyCategory) storyCategory.textContent = activeStory ? activeStory.category.toUpperCase() : 'SOCIAL LIFE';
  const storyTitle = $('#kds-story-title', panel);
  if (storyTitle) storyTitle.textContent = activeStory?.title || 'No situation available';
  const storyCopy = $('#kds-story-copy', panel);
  if (storyCopy) storyCopy.textContent = activeStory?.scene || 'Choose a different relationship stage in Life & Career to see related situations.';
  const storyChoices = $('#kds-story-choices', panel);
  if (storyChoices) {
    storyChoices.replaceChildren();
    for (const choice of activeStory?.choices || []) {
      const button = html('button', 'kds-choice');
      button.type = 'button';
      button.dataset.kdsStory = activeStory.id;
      button.dataset.kdsChoice = choice.id;
      button.disabled = ctx.activeShift;
      button.append(html('strong', '', choice.label), html('span', '', choice.result));
      storyChoices.append(button);
    }
  }
  const metrics = $('#kds-metrics', panel);
  if (metrics) {
    metrics.replaceChildren();
    const labels = [
      ['affection', 'Love / affection'], ['trust', 'Trust'], ['patience', 'Patience'],
      ['compassion', 'Compassion'], ['respect', 'Respect'], ['joy', 'Joy'],
      ['anger', 'Anger'], ['resentment', 'Resentment'], ['sadness', 'Sadness'],
      ['grief', 'Grief'], ['stress', 'Stress'], ['neighbourTrust', 'Neighbour trust'],
    ];
    for (const [key, label] of labels) metrics.append(metricBar(label, snapshot.metrics[key] || 0, ['sadness', 'grief', 'stress', 'anger', 'resentment'].includes(key)));
  }
  const activities = $('#kds-activities', panel);
  if (activities) {
    activities.replaceChildren();
    const actions = getSocialInteractions(ctx.relationshipStatus);
    for (const action of actions) {
      const card = html('div', 'kds-activity');
      const detail = html('div', 'kds-activity-copy');
      detail.append(html('strong', '', action.label), html('p', '', action.description));
      const button = html('button', 'secondary', action.price ? `DO IT · ₦${action.price.toLocaleString()}` : 'DO ACTIVITY');
      button.type = 'button';
      button.dataset.kdsAction = action.id;
      button.disabled = ctx.activeShift || (action.price || 0) > ctx.wallet;
      card.append(detail, button);
      activities.append(card);
    }
  }
  const history = $('#kds-history', panel);
  if (history) {
    history.replaceChildren();
    if (!snapshot.recentHistory.length) history.append(html('p', 'kds-empty', 'No interactions recorded yet. Start with a conversation or today’s situation.'));
    for (const entry of snapshot.recentHistory) {
      const row = html('article', 'kds-history-entry');
      row.append(html('div', 'kds-history-meta', `Day ${entry.day} · ${entry.type === 'story' ? 'SOCIAL STORY' : 'INTERACTION'}`));
      row.append(html('strong', '', entry.title), html('p', '', entry.result));
      history.append(row);
    }
  }
  if ($('#kds-notice', panel) && lastNotice) {
    $('#kds-notice', panel).textContent = lastNotice;
    $('#kds-notice', panel).hidden = false;
  }
}

function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  ensureUIReferenceHook();
  ensureStartButton();
  ensureMenuButton();
  ensurePanel();
  $('#kano-social-drama-btn')?.addEventListener('click', () => openPanel('start'));
  for (const eventName of [
    'kano:aure-journey-updated', 'kano:relationship-status-updated',
    'kano:family-responsibilities-updated', 'kano:parenthood-updated',
    'kano:social-drama-updated', 'kano:wallet-updated', 'kano:app-ui-ready',
  ]) window.addEventListener(eventName, render);
  if (document.documentElement && typeof MutationObserver !== 'undefined') {
    careerObserver = new MutationObserver(() => ensureMenuButton());
    careerObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.kanoNorthernDriverSocialDrama = {
    version: 1,
    snapshot: () => getSocialDramaSnapshot(readState(), { day: context().day, relationshipStatus: context().relationshipStatus }),
    export: () => exportSocialDramaReport(readState(), { day: context().day, relationshipStatus: context().relationshipStatus }),
    refresh: () => { state = readState(); render(); },
  };
  render();
  console.info('[Kano Life] People, relationships and social drama registered.');
}

if (typeof document !== 'undefined') {
  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
}
