// ============================================================
// KANO LIFE — SOCIAL NETWORK UI & PERSISTENT CONSEQUENCES
// Appends to the existing People & Relationships panel. No second wallet,
// relationship-stage state, game loop, real messages, or external reporting.
// ============================================================
import {
  SOCIAL_DRAMA_STORAGE_KEY,
  SOCIAL_RELATIONSHIP_LABELS,
  createDefaultSocialDramaState,
  normaliseSocialDramaState,
  updateSocialProfile,
} from './KanoNorthernDriverSocialDrama.js';
import {
  SOCIAL_NETWORK_STORAGE_KEY,
  createDefaultSocialNetworkState,
  normaliseSocialNetworkState,
  getSocialNetworkSnapshot,
  resolveSocialNetworkChoice,
  skipSocialNetworkScene,
  exportSocialNetworkReport,
} from './KanoNorthernDriverSocialNetwork.js';

const INSTALL_KEY = Symbol.for('kano.life.socialNetwork.installed.v1');
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const safeText = (value, limit = 36) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
const html = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
let noticeTimer = 0;
let observer = null;

function readSocial() {
  try {
    const raw = globalThis.localStorage?.getItem(SOCIAL_DRAMA_STORAGE_KEY);
    return normaliseSocialDramaState(raw ? JSON.parse(raw) : createDefaultSocialDramaState());
  } catch {
    return createDefaultSocialDramaState();
  }
}
function readNetwork(social = readSocial()) {
  try {
    const raw = globalThis.localStorage?.getItem(SOCIAL_NETWORK_STORAGE_KEY);
    return normaliseSocialNetworkState(raw ? JSON.parse(raw) : createDefaultSocialNetworkState(social), social);
  } catch {
    return createDefaultSocialNetworkState(social);
  }
}
function relationshipStatus(social = readSocial()) {
  try {
    const external = String(window.kanoNorthernDriverAureJourney?.snapshot?.()?.status
      || window.kanoNorthernDriverAureJourney?.snapshot?.()?.relationshipStatus || '');
    if (Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, external)) return external;
  } catch { /* optional Aure milestone module */ }
  try {
    const raw = globalThis.localStorage?.getItem('kano-life-aure-journey-v1');
    const record = raw ? JSON.parse(raw) : null;
    const status = String(record?.currentStatus || record?.status || '');
    if (Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, status)) return status;
  } catch { /* damaged optional save is ignored */ }
  try {
    const status = String(window.kanoNorthernDriverSocialDrama?.snapshot?.()?.relationshipStatus || '');
    if (Object.hasOwn(SOCIAL_RELATIONSHIP_LABELS, status)) return status;
  } catch { /* social drama screen may load just after this module */ }
  return 'single';
}
function gameContext() {
  const ui = window.__KANO_ACTIVE_UI__ || null;
  const game = ui?.game || window.__KANO_ACTIVE_GAME__ || null;
  const gameState = String(game?.state || 'INTRO');
  const s = game?.s || {};
  const runWasStarted = Boolean(s.runStartedAt || Number(s.distance) > 0 || Number(s.score) > 0);
  return {
    ui, game, state: gameState,
    activeShift: gameState === 'PLAY' || gameState === 'EVENT' || (gameState === 'MENU' && runWasStarted),
    day: Math.max(1, Math.floor(Number(s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? s.gameDay ?? s.day ?? 1) || 1)),
  };
}
function announce(message, error = false) {
  const panel = $('#ksn-workspace');
  const node = $('#ksn-notice', panel || document);
  if (node) {
    node.textContent = message;
    node.hidden = false;
    node.dataset.state = error ? 'error' : 'ok';
  }
  if (noticeTimer) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { const current = $('#ksn-notice'); if (current) current.hidden = true; }, 5000);
}
function writeNetworkOnly(network, social) {
  try {
    const storage = globalThis.localStorage;
    if (!storage?.getItem || !storage?.setItem) return false;
    const beforeNetwork = storage.getItem(SOCIAL_NETWORK_STORAGE_KEY);
    const networkText = JSON.stringify(normaliseSocialNetworkState(network, social));
    storage.setItem(SOCIAL_NETWORK_STORAGE_KEY, networkText);
    if (storage.getItem(SOCIAL_NETWORK_STORAGE_KEY) !== networkText) {
      if (beforeNetwork === null) storage.removeItem(SOCIAL_NETWORK_STORAGE_KEY);
      else storage.setItem(SOCIAL_NETWORK_STORAGE_KEY, beforeNetwork);
      return false;
    }
    window.dispatchEvent(new CustomEvent('kano:social-network-updated', { detail: { turn: network.storyCursor + 1 } }));
    return true;
  } catch { return false; }
}
function writeSocialTransaction(network, social) {
  let beforeNetwork = null;
  let beforeSocial = null;
  let storage;
  try {
    storage = globalThis.localStorage;
    if (!storage?.getItem || !storage?.setItem) return false;
    beforeNetwork = storage.getItem(SOCIAL_NETWORK_STORAGE_KEY);
    beforeSocial = storage.getItem(SOCIAL_DRAMA_STORAGE_KEY);
    const networkText = JSON.stringify(normaliseSocialNetworkState(network, social));
    const socialText = JSON.stringify(normaliseSocialDramaState(social));
    storage.setItem(SOCIAL_NETWORK_STORAGE_KEY, networkText);
    storage.setItem(SOCIAL_DRAMA_STORAGE_KEY, socialText);
    if (storage.getItem(SOCIAL_NETWORK_STORAGE_KEY) !== networkText || storage.getItem(SOCIAL_DRAMA_STORAGE_KEY) !== socialText) {
      throw new Error('saved social state could not be verified');
    }
    window.dispatchEvent(new CustomEvent('kano:social-network-updated', { detail: { turn: network.storyCursor + 1 } }));
    window.dispatchEvent(new CustomEvent('kano:social-drama-updated', { detail: { storyIndex: social.storyIndex, lastActionId: social.lastActionId } }));
    return true;
  } catch {
    try {
      if (beforeNetwork === null) storage?.removeItem(SOCIAL_NETWORK_STORAGE_KEY); else storage?.setItem(SOCIAL_NETWORK_STORAGE_KEY, beforeNetwork);
      if (beforeSocial === null) storage?.removeItem(SOCIAL_DRAMA_STORAGE_KEY); else storage?.setItem(SOCIAL_DRAMA_STORAGE_KEY, beforeSocial);
    } catch { /* browser quota / private mode may reject rollback too */ }
    return false;
  }
}
function ensureWidget() {
  const panel = $('#social-drama-screen .kds-panel');
  if (!panel) return false;
  if ($('#ksn-card', panel)) return true;
  const card = html('section', 'kds-card ksn-card');
  card.id = 'ksn-card';
  card.setAttribute('aria-labelledby', 'ksn-title');
  card.innerHTML = `
    <div class="kds-section-title"><div><p class="eyebrow">STEP 75 · SOCIAL MEMORY</p><h3 id="ksn-title">Your wider circle</h3></div><span class="kds-tag">PERSISTENT NPCS</span></div>
    <p class="ksn-lead">People remember how you treat them. Repeated conversations change trust, closeness, respect and tension. Choices are fictional and stored on this device.</p>
    <button id="ksn-toggle" type="button" class="secondary ksn-toggle" aria-expanded="false" aria-controls="ksn-workspace">OPEN SOCIAL NETWORK &amp; LONG-TERM STORIES</button>
    <div id="ksn-workspace" class="ksn-workspace" hidden>
      <div class="kds-status-strip"><span id="ksn-stage">Relationship stage: Single</span><span id="ksn-turn">Social moment 1</span></div>
      <div id="ksn-safety" class="kds-safety-note">Social stories are only available off shift. The existing relationship timeline remains authoritative.</div>
      <section class="ksn-inner" aria-labelledby="ksn-roster-title"><div class="kds-section-title"><div><p class="eyebrow">CONTACT ROSTER</p><h4 id="ksn-roster-title">Names and relationship health</h4></div></div><div id="ksn-roster" class="ksn-roster"></div><div class="kds-row-actions"><button id="ksn-save-names" class="primary" type="button">SAVE CONTACT NAMES</button><button id="ksn-export" class="secondary" type="button">EXPORT ANONYMOUS SUMMARY</button></div><p class="kds-footnote">These are fictional NPCs. Names can be changed; the game does not read your contacts or send messages.</p></section>
      <section class="ksn-inner" aria-labelledby="ksn-scene-heading"><div class="kds-section-title"><div><p class="eyebrow">CONNECTED STORYLINES</p><h4 id="ksn-scene-heading">A situation needs your response</h4></div><span id="ksn-category" class="kds-tag">SOCIAL LIFE</span></div><h4 id="ksn-scene-title">A conversation is waiting.</h4><p id="ksn-scene-copy" class="kds-story-copy"></p><div id="ksn-choice-list" class="kds-choice-list"></div><button id="ksn-skip" class="secondary ksn-skip" type="button">SKIP THIS SCENE</button><p class="kds-footnote">Each selected outcome can change both the contact’s memory and the shared wellbeing indicators. There is no wallet transaction for these conversations.</p></section>
      <section class="ksn-inner" aria-labelledby="ksn-history-heading"><div class="kds-section-title"><div><p class="eyebrow">SOCIAL MEMORY</p><h4 id="ksn-history-heading">Recent consequences</h4></div></div><div id="ksn-history" class="ksn-history"></div></section>
      <div id="ksn-notice" class="kds-notice" role="status" hidden></div>
      <p class="kds-disclaimer">Safety and consent come first. The harassment-response story never rewards harassment and never files a real-world report. Faith and football discussions are optional; no sect or team is scored as morally superior.</p>
    </div>`;
  const historyNode = $('#kds-history', panel);
  const historyCard = historyNode?.closest('.kds-card') || null;
  if (historyCard && historyCard.parentElement === panel) panel.insertBefore(card, historyCard);
  else panel.append(card);
  bindWidget(card);
  render();
  return true;
}
function bindWidget(card) {
  $('#ksn-toggle', card)?.addEventListener('click', () => {
    const workspace = $('#ksn-workspace', card);
    const button = $('#ksn-toggle', card);
    if (!workspace || !button) return;
    workspace.hidden = !workspace.hidden;
    button.setAttribute('aria-expanded', String(!workspace.hidden));
    button.textContent = workspace.hidden ? 'OPEN SOCIAL NETWORK & LONG-TERM STORIES' : 'CLOSE SOCIAL NETWORK & LONG-TERM STORIES';
    if (!workspace.hidden) render();
  });
  $('#ksn-save-names', card)?.addEventListener('click', saveContactNames);
  $('#ksn-choice-list', card)?.addEventListener('click', event => {
    const button = event.target.closest('[data-ksn-choice]');
    if (button) resolveChoice(button.dataset.ksnScene, button.dataset.ksnChoice);
  });
  $('#ksn-skip', card)?.addEventListener('click', skipScene);
  $('#ksn-export', card)?.addEventListener('click', exportReport);
}
function saveContactNames() {
  const ctx = gameContext();
  if (ctx.activeShift) return announce('Finish the driving shift before editing social contacts.', true);
  const social = readSocial();
  const network = readNetwork(social);
  const names = {};
  for (const contact of Object.values(network.contacts)) {
    const input = $(`#ksn-name-${contact.id}`);
    names[contact.id] = safeText(input?.value || contact.name, 36) || contact.name;
    network.contacts[contact.id].name = names[contact.id];
  }
  const nextSocial = updateSocialProfile(social, {
    partnerName: names.partner,
    friendName: names.friend,
    neighbourName: names.neighbour,
  });
  if (!writeSocialTransaction(network, nextSocial)) {
    announce('Browser storage rejected the update. No contact names were saved.', true);
    return;
  }
  announce('Contact names saved. Existing relationship stages were unchanged.');
  render();
}
function resolveChoice(sceneId, choiceId) {
  const ctx = gameContext();
  if (ctx.activeShift) return announce('Finish the driving shift before resolving social stories.', true);
  const social = readSocial();
  const network = readNetwork(social);
  const status = relationshipStatus(social);
  const result = resolveSocialNetworkChoice(network, social, { sceneId, choiceId, day: ctx.day, relationshipStatus: status });
  if (!result.ok) {
    announce('The story changed before this choice was saved. Review the current scene.', true);
    render();
    return;
  }
  if (!writeSocialTransaction(result.network, result.social)) {
    announce('Browser storage could not save both sides of the interaction. No outcome was recorded.', true);
    return;
  }
  announce(result.message || 'Social outcome saved.');
  render();
}
function skipScene() {
  const ctx = gameContext();
  if (ctx.activeShift) return announce('Finish the driving shift before changing social stories.', true);
  const social = readSocial();
  const network = readNetwork(social);
  const result = skipSocialNetworkScene(network, social, { relationshipStatus: relationshipStatus(social) });
  if (!result.ok || !writeNetworkOnly(result.state, social)) {
    announce('The next social scene could not be saved.', true);
    return;
  }
  announce('Scene skipped. No relationship or wellbeing values changed.');
  render();
}
function exportReport() {
  const social = readSocial();
  const network = readNetwork(social);
  const report = exportSocialNetworkReport(network, social, { day: gameContext().day, relationshipStatus: relationshipStatus(social) });
  try {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = html('a');
    link.href = url;
    link.download = `kano-life-social-network-summary-day-${report.day}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Anonymous social summary exported. Contact names are excluded.');
  } catch { announce('This browser could not create the summary file.', true); }
}
function bar(label, value, negative = false) {
  const row = html('div', 'ksn-bar');
  const top = html('div', 'ksn-bar-head');
  top.append(html('span', '', label), html('strong', '', `${value}%`));
  const track = html('div', 'ksn-bar-track');
  const fill = html('i', negative ? 'is-negative' : '');
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  track.append(fill);
  row.append(top, track);
  return row;
}
function renderRoster(snapshot, activeShift) {
  const roster = $('#ksn-roster');
  if (!roster) return;
  roster.replaceChildren();
  for (const person of snapshot.contacts) {
    const card = html('article', 'ksn-person');
    const heading = html('div', 'ksn-person-heading');
    heading.append(html('strong', '', person.role), html('span', 'ksn-person-count', `${person.interactions} interaction${person.interactions === 1 ? '' : 's'}`));
    const label = html('label', 'ksn-name-label', 'CONTACT NAME');
    const input = html('input', 'ksn-name-input');
    input.type = 'text';
    input.id = `ksn-name-${person.id}`;
    input.maxLength = 36;
    input.autocomplete = 'off';
    input.value = person.name;
    input.disabled = activeShift;
    input.setAttribute('aria-label', `${person.role} name`);
    label.append(input);
    const bars = html('div', 'ksn-person-bars');
    bars.append(bar('Trust', person.trust), bar('Closeness', person.bond), bar('Respect', person.respect), bar('Tension', person.tension, true));
    card.append(heading, label, bars);
    roster.append(card);
  }
}
function render() {
  const card = $('#ksn-card');
  if (!card) return;
  const social = readSocial();
  const network = readNetwork(social);
  const ctx = gameContext();
  const status = relationshipStatus(social);
  const snapshot = getSocialNetworkSnapshot(network, social, { day: ctx.day, relationshipStatus: status });
  const stage = $('#ksn-stage');
  const turn = $('#ksn-turn');
  if (stage) stage.textContent = `Relationship stage: ${snapshot.relationshipLabel}`;
  if (turn) turn.textContent = `Social moment ${snapshot.turn}`;
  const safety = $('#ksn-safety');
  if (safety) {
    safety.textContent = ctx.activeShift
      ? 'Driving shift active. Choices and name edits are locked until you finish or safely leave the shift.'
      : 'Off shift. Choose a response, then review how trust, closeness, respect and tension changed.';
    safety.dataset.active = String(ctx.activeShift);
  }
  renderRoster(snapshot, ctx.activeShift);
  const scene = snapshot.currentScene;
  const category = $('#ksn-category');
  const title = $('#ksn-scene-title');
  const copy = $('#ksn-scene-copy');
  const list = $('#ksn-choice-list');
  const skip = $('#ksn-skip');
  if (category) category.textContent = scene?.category || 'SOCIAL LIFE';
  if (title) title.textContent = scene?.title || 'No situation available';
  if (copy) copy.textContent = scene ? `${scene.contactName} · ${scene.contactRole}\n\n${scene.scene}` : 'No scene is currently available for this relationship stage.';
  if (list) {
    list.replaceChildren();
    for (const choice of scene?.choices || []) {
      const button = html('button', 'kds-choice ksn-choice');
      button.type = 'button';
      button.dataset.ksnScene = scene.id;
      button.dataset.ksnChoice = choice.id;
      button.disabled = ctx.activeShift;
      button.append(html('strong', '', choice.label), html('span', '', choice.result));
      list.append(button);
    }
  }
  if (skip) skip.disabled = ctx.activeShift;
  const history = $('#ksn-history');
  if (history) {
    history.replaceChildren();
    if (!snapshot.recentHistory.length) history.append(html('p', 'kds-empty', 'No social network outcomes recorded yet. Resolve a situation to build a memory trail.'));
    for (const entry of snapshot.recentHistory) {
      const article = html('article', 'ksn-history-entry');
      article.append(html('div', 'kds-history-meta', `DAY ${entry.day} · ${entry.category}`), html('strong', '', entry.title), html('p', '', entry.result));
      history.append(article);
    }
  }
  const saveNames = $('#ksn-save-names');
  const exportButton = $('#ksn-export');
  if (saveNames) saveNames.disabled = ctx.activeShift;
  if (exportButton) exportButton.disabled = false;
  const notice = $('#ksn-notice');
  if (notice && !notice.textContent) notice.hidden = true;
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  const attach = () => {
    if (!ensureWidget()) return false;
    if (observer) { observer.disconnect(); observer = null; }
    for (const eventName of [
      'kano:social-network-updated', 'kano:social-drama-updated', 'kano:aure-journey-updated',
      'kano:relationship-status-updated', 'kano:family-responsibilities-updated', 'kano:parenthood-updated',
      'kano:wallet-updated', 'kano:app-ui-ready',
    ]) window.addEventListener(eventName, render);
    window.kanoNorthernDriverSocialNetwork = {
      version: 1,
      snapshot: () => getSocialNetworkSnapshot(readNetwork(), readSocial(), { day: gameContext().day, relationshipStatus: relationshipStatus() }),
      export: () => exportSocialNetworkReport(readNetwork(), readSocial(), { day: gameContext().day, relationshipStatus: relationshipStatus() }),
      refresh: render,
    };
    console.info('[Kano Life] Step 75 social network and relationship memory registered.');
    return true;
  };
  if (!attach() && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => { attach(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}
if (typeof document !== 'undefined') {
  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
}
