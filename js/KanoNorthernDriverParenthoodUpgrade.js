/** Step 70 runtime panel: optional, private family-planning and parenthood story. */
import './KanoNorthernDriverAureJourneyUpgrade.js';
import {
  PARENTHOOD_STORAGE_KEY, PREGNANCY_STORY_DAYS,
  createDefaultParenthoodState, normalizeParenthoodState, enableParenthoodTracking,
  beginFamilyPlanning, startPregnancyStory, actionsForParenthoodMode,
  recordParenthoodAction, recordBirthStory,
  parenthoodReport, exportParenthoodReport,
} from './KanoNorthernDriverParenthood.js';
const SECTION_ID = 'kano-parenthood-journey';
const STYLE_ID = 'knpj-style';
const INSTALL_KEY = Symbol.for('kano.life.parenthoodJourney.installed.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const safeText = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 220);
let state = loadState();
let notice = '';
let noticeError = false;
let observer = null;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(PARENTHOOD_STORAGE_KEY);
    return normalizeParenthoodState(raw ? JSON.parse(raw) : createDefaultParenthoodState());
  } catch { return createDefaultParenthoodState(); }
}
function persistState(next) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(PARENTHOOD_STORAGE_KEY, JSON.stringify(normalizeParenthoodState(next)));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const life = typeof window !== 'undefined' ? window.kanoNorthernDriverLifeSimulation?.snapshot?.() || {} : {};
  const aure = typeof window !== 'undefined' ? window.kanoNorthernDriverAureAndCulture?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? life.day ?? 1;
  const dayValue = Number(rawDay);
  const day = Math.max(1, Math.floor(Number.isFinite(dayValue) ? dayValue : 1));
  return {
    ui, game, day,
    activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))),
    profile: life.profile || aure.profile || { gender: 'male', age: 22 },
    relationshipStatus: String(aure.relationshipStatus || 'single'),
    healthTrackingEnabled: aure.health?.trackingEnabled === true,
    healthPregnancyStatus: String(aure.health?.pregnancyStatus || 'none'),
  };
}
function notify(message, error = false) {
  notice = safeText(message); noticeError = Boolean(error);
  const target = el('knpj-notice');
  if (target) { target.textContent = notice; target.dataset.state = error ? 'error' : 'ok'; }
  if (message) context().ui?.toast?.(String(message));
}
function commit(next, message) {
  const normal = normalizeParenthoodState(next);
  if (!persistState(normal)) { notify('Browser storage could not save this change. No money or existing health data was changed.', true); return false; }
  state = normal;
  window.dispatchEvent(new CustomEvent('kano:parenthood-journey-updated', { detail: { day: context().day, mode: state.mode } }));
  render(); notify(message || 'Saved.');
  return true;
}
function ensureStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .knpj-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .knpj-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .knpj-card,#${SECTION_ID} .knpj-row{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere;margin-top:8px}
    #${SECTION_ID} .knpj-card h4,#${SECTION_ID} .knpj-row h4{margin:0 0 7px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .knpj-card p,#${SECTION_ID} .knpj-row p{margin:6px 0;font-size:12px;line-height:1.5;color:#c3d3df}
    #${SECTION_ID} .knpj-stat{font-size:21px;font-weight:900;color:#f8fbff;margin:7px 0}
    #${SECTION_ID} .knpj-meter{height:7px;background:#1b3447;border-radius:8px;overflow:hidden;margin:7px 0 10px}
    #${SECTION_ID} .knpj-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} button{min-height:44px;max-width:100%;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} input[type=checkbox]{width:20px;height:20px;accent-color:#00b4d8;flex:0 0 auto}
    #${SECTION_ID} .knpj-optin{display:flex;align-items:flex-start;gap:10px;min-height:44px;padding:10px 0;color:#e3eef6;font-size:13px;line-height:1.4}
    #${SECTION_ID} .knpj-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
    #${SECTION_ID} .knpj-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .knpj-meter-row{margin:8px 0}
    #${SECTION_ID} .knpj-meter-row small{display:block;font-size:11px;color:#b7cad8}
    #${SECTION_ID} .knpj-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .knpj-notice[data-state=error]{color:#ffb4aa}
    @media(max-width:520px){#${SECTION_ID} .knpj-grid{grid-template-columns:1fr}#${SECTION_ID} .knpj-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .knpj-actions button{width:100%}}
  `;
  document.head.append(style);
}
function addText(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(text ?? '');
  parent.append(node);
  return node;
}
function button(label, action, disabled = false, primary = false, actionId = '') {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
  node.dataset.knpjAction = action; if (actionId) node.dataset.knpjActionId = actionId;
  node.disabled = Boolean(disabled); if (primary) node.classList.add('knpj-primary'); return node;
}
function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID); if (section) return section;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.setAttribute('aria-labelledby', 'knpj-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="knpj-title">FAMILY GROWTH · PREGNANCY STORY · PARENTHOOD</h3>
    <p class="knpj-note">Optional adult life-simulation chapter. This private story log stays in this browser. Its 84-day pregnancy story is compressed gameplay pacing, not a real medical timeline. It does not diagnose, predict pregnancy, prescribe treatment or replace qualified care. No money moves from this panel.</p>
    <label class="knpj-optin"><input id="knpj-enable" type="checkbox"><span>Enable private family-growth and parenthood story tracking on this browser.</span></label>
    <div id="knpj-content" hidden>
      <div class="knpj-grid">
        <article class="knpj-card"><h4>Current chapter</h4><div class="knpj-stat" id="knpj-mode">Not started</div><p id="knpj-relation-note" class="knpj-note"></p><p id="knpj-stage-note">Choose a chapter to begin. Nothing starts automatically.</p><div class="knpj-actions" id="knpj-start-actions"></div><label id="knpj-partner-confirm-row" class="knpj-optin"><input id="knpj-partner-pregnancy" type="checkbox"><span>I explicitly choose to record an adult partner's pregnancy as part of this fictional story. No partner health details are stored.</span></label></article>
        <article class="knpj-card"><h4>Family support & preparation</h4><p class="knpj-note">These actions record plans and conversations, not completed medical care or actual financial transactions.</p><div class="knpj-meter-row"><small id="knpj-support-label">Support 50/100</small><div class="knpj-meter"><i id="knpj-support-meter" style="width:50%"></i></div></div><div class="knpj-meter-row"><small id="knpj-planning-label">Planning 50/100</small><div class="knpj-meter"><i id="knpj-planning-meter" style="width:50%"></i></div></div><div class="knpj-meter-row"><small id="knpj-wellbeing-label">Wellbeing 60/100</small><div class="knpj-meter"><i id="knpj-wellbeing-meter" style="width:60%"></i></div></div><div class="knpj-meter-row"><small id="knpj-caregiving-label">Caregiving readiness 50/100</small><div class="knpj-meter"><i id="knpj-caregiving-meter" style="width:50%"></i></div></div></article>
      </div>
      <article id="knpj-actions-card" class="knpj-card"><h4 id="knpj-actions-title">Available actions</h4><div id="knpj-actions-list"></div></article>
      <article id="knpj-pregnancy-card" class="knpj-card" hidden><h4>Expecting-parent story</h4><p id="knpj-pregnancy-progress"></p><div class="knpj-meter"><i id="knpj-pregnancy-meter" style="width:0%"></i></div><div class="knpj-actions" id="knpj-birth-actions"></div></article>
      <article class="knpj-card"><h4>Children & milestones</h4><p id="knpj-children-summary" class="knpj-note">No birth story recorded.</p><div id="knpj-children-list"></div></article>
      <article class="knpj-card"><h4>Recent family-life log</h4><p class="knpj-note">No real partner name, test result, symptoms, private messages or clinical details are included in the export.</p><div id="knpj-history"></div><div class="knpj-actions"><button type="button" data-knpj-action="export">EXPORT PRIVATE STORY REPORT (.JSON)</button></div></article>
    </div>
    <p id="knpj-notice" class="knpj-notice" role="status" aria-live="polite"></p>
  `;
  const anchor = el('kano-aure-journey') || el('kano-family-responsibilities') || el('kano-aure-culture') || el('kano-career-progression');
  if (anchor) anchor.after(section); else host.append(section);
  section.addEventListener('change', event => {
    if (event.target?.id !== 'knpj-enable') return;
    const result = enableParenthoodTracking(state, event.target.checked);
    if (!commit(result.state, result.message)) event.target.checked = state.enabled;
  });
  section.addEventListener('click', event => {
    const target = event.target.closest('button[data-knpj-action]'); if (!target) return;
    if (target.dataset.knpjAction === 'export') { exportReport(); return; }
    handleAction(target.dataset.knpjAction, target.dataset.knpjActionId || '');
  });
  return section;
}
function renderMeters(report) {
  for (const [key, label] of [['support', 'Support'], ['planning', 'Planning'], ['wellbeing', 'Wellbeing'], ['caregiving', 'Caregiving readiness']]) {
    const value = report.meters[key];
    const text = el(`knpj-${key}-label`); if (text) text.textContent = `${label} ${value}/100`;
    const meter = el(`knpj-${key}-meter`); if (meter) meter.style.width = `${value}%`;
  }
}
function renderActions(ctx) {
  const list = el('knpj-actions-list'); if (!list) return; list.replaceChildren();
  const report = parenthoodReport(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  const actions = actionsForParenthoodMode(state.mode);
  if (!actions.length) {
    addText(list, 'p', 'Start family planning or record an expecting-parent story to see appropriate actions.', 'knpj-note');
    return;
  }
  for (const action of actions) {
    const row = document.createElement('div'); row.className = 'knpj-row';
    addText(row, 'h4', action.label);
    addText(row, 'p', action.summary);
    const alreadyDone = action.once && state.milestones.some(item => item.id === action.id);
    const locked = ctx.activeShift || state.lastActionDay === ctx.day || alreadyDone;
    const why = ctx.activeShift ? 'Stop safely or end the current shift first.' : state.lastActionDay === ctx.day ? 'Only one family-life action is allowed per in-game day.' : alreadyDone ? 'This one-time milestone is already recorded.' : '';
    const actionsHost = document.createElement('div'); actionsHost.className = 'knpj-actions';
    const btn = button(`RECORD · ${action.label.toUpperCase()}`, 'record-action', locked, true, action.id);
    if (why) btn.title = why;
    actionsHost.append(btn); row.append(actionsHost); list.append(row);
  }
  void report;
}
function render() {
  if (typeof document === 'undefined') return;
  const section = ensureSection(); if (!section) return;
  const ctx = context();
  const enable = el('knpj-enable'); if (enable) enable.checked = state.enabled;
  const content = el('knpj-content'); if (content) content.hidden = !state.enabled;
  if (content && state.enabled) {
    const report = parenthoodReport(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
    const put = (id, value) => { const node = el(id); if (node) node.textContent = String(value ?? ''); };
    put('knpj-mode', report.modeLabel);
    put('knpj-relation-note', report.relationNote);
    put('knpj-stage-note', state.mode === 'none'
      ? 'Start a planning chapter or explicitly record an expecting-parent story. Relationship status is not changed.'
      : state.mode === 'planning'
        ? `Chapter started on in-game day ${state.chapterStartedDay}. Plans do not move money.`
        : state.mode === 'expecting'
          ? `Expecting-parent story started on day ${state.pregnancyStartDay}. Role: ${state.pregnancyStoryRole === 'self' ? 'self' : 'partner story'}. Birth is never recorded automatically.`
          : `Parenthood story active. ${report.children.length} child record(s) saved.`);
    const startActions = el('knpj-start-actions'); if (startActions) {
      startActions.replaceChildren();
      if (report.canStartPlanning) startActions.append(button('START FAMILY-PLANNING CHAPTER', 'start-planning', ctx.activeShift, true));
      if (report.canStartExpecting) startActions.append(button('RECORD EXPECTING-PARENT STORY', 'start-expecting', ctx.activeShift || state.lastActionDay === ctx.day, false));
      if (ctx.activeShift) addText(startActions, 'p', 'Family-life records are locked during a driving segment.', 'knpj-note');
    }
    renderMeters(report);
    const actionTitle = el('knpj-actions-title'); if (actionTitle) actionTitle.textContent = state.mode === 'expecting' ? 'Pregnancy-story support actions' : state.mode === 'parenting' ? 'Parenting and family routines' : 'Planning and support actions';
    renderActions(ctx);
    const pregCard = el('knpj-pregnancy-card'); if (pregCard) pregCard.hidden = state.mode !== 'expecting';
    if (state.mode === 'expecting') {
      const p = report.pregnancy;
      put('knpj-pregnancy-progress', `Compressed story progress: day ${p.elapsedDays} of ${PREGNANCY_STORY_DAYS} · story trimester ${p.storyStage} · ${p.progressPercent}%. This is fictional pacing, not real gestational age or a due-date estimate.`);
      const m = el('knpj-pregnancy-meter'); if (m) m.style.width = `${p.progressPercent}%`;
      const birthActions = el('knpj-birth-actions'); if (birthActions) {
        birthActions.replaceChildren();
        const canBirth = p.readyForBirthStory && !ctx.activeShift && state.lastActionDay !== ctx.day;
        const b = button(p.readyForBirthStory ? 'RECORD BIRTH STORY' : 'BIRTH STORY LOCKED UNTIL STORY TIME & PREPARATION', 'record-birth', !canBirth, true);
        b.title = canBirth ? 'Records a fictional story milestone; no medical outcome is implied.' : ctx.activeShift ? 'Stop safely before recording the story event.' : 'Requires at least 84 in-game story days plus support, budget and birth-preparation milestones.';
        birthActions.append(b);
      }
    }
    const children = report.children;
    put('knpj-children-summary', children.length
      ? children.map(child => `${child.id.replace('-', ' ').toUpperCase()} · story age ${child.ageMonths} in-game month(s)`).join(' · ')
      : 'No birth story recorded. Planning and support remain available without recording pregnancy or parenthood.');
    const childList = el('knpj-children-list'); if (childList) {
      childList.replaceChildren();
      for (const child of children) {
        const row = document.createElement('div'); row.className = 'knpj-row';
        addText(row, 'h4', `${child.id.replace('-', ' ')} · ${child.ageMonths} in-game month(s)`);
        addText(row, 'p', `Birth story day ${child.birthDay}. Ages use a simplified 30-day game month and are not real age or developmental guidance.`);
        childList.append(row);
      }
    }
    const history = el('knpj-history'); if (history) {
      history.replaceChildren();
      if (!report.history.length) addText(history, 'p', 'No family-life actions recorded yet.', 'knpj-note');
      for (const item of report.history.slice(0, 8)) {
        const row = document.createElement('div'); row.className = 'knpj-row';
        addText(row, 'h4', `Day ${item.day} · ${item.type.replace(/[-_]/g, ' ')}`);
        addText(row, 'p', item.text); history.append(row);
      }
    }
  }
  const noticeNode = el('knpj-notice'); if (noticeNode) { noticeNode.textContent = notice; noticeNode.dataset.state = noticeError ? 'error' : 'ok'; }
}
function handleAction(action, actionId) {
  const ctx = context();
  if (ctx.activeShift) { notify('Finish or safely stop the driving segment before recording family-life actions.', true); return; }
  if (action === 'start-planning') {
    const result = beginFamilyPlanning(state, { day: ctx.day });
    if (!result.ok) { notify('Start planning is unavailable in the current chapter.', true); return; }
    commit(result.state, result.message); return;
  }
  if (action === 'start-expecting') {
    const result = startPregnancyStory(state, {
      day: ctx.day,
      profileGender: ctx.profile.gender,
      healthTrackingEnabled: ctx.healthTrackingEnabled,
      healthPregnancyStatus: ctx.healthPregnancyStatus,
      partnerPregnancyConfirmed: el('knpj-partner-pregnancy')?.checked === true,
    });
    if (!result.ok) {
      const message = result.reason === 'explicit_confirmation_required'
        ? 'For a self pregnancy story, the existing private health tracker must have a positive simulated test on a female profile. Otherwise tick the partner-story confirmation for an adult partner.'
        : result.reason === 'action_already_used_today'
          ? 'Only one family-life action is available per in-game day.'
          : 'An expecting-parent story cannot start from this chapter.';
      notify(message, true); return;
    }
    commit(result.state, result.message); return;
  }
  if (action === 'record-action') {
    const result = recordParenthoodAction(state, { actionId, day: ctx.day });
    if (!result.ok) {
      const message = result.reason === 'action_already_used_today' ? 'One family-life action is available per in-game day.'
        : result.reason === 'milestone_already_recorded' ? 'This one-time milestone has already been recorded.' : 'That action is unavailable for the current life stage.';
      notify(message, true); return;
    }
    commit(result.state, result.message); return;
  }
  if (action === 'record-birth') {
    const result = recordBirthStory(state, { day: ctx.day });
    if (!result.ok) { notify('The birth story needs 84 in-game story days and at least three support/preparation milestones, including birth preparation.', true); return; }
    commit(result.state, result.message); return;
  }
}
function exportReport() {
  const ctx = context();
  const payload = exportParenthoodReport(state, { day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `kano-parenthood-story-day-${ctx.day}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Private family-life report exported without partner names or medical details.');
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  const ensure = () => { ensureStyles(); ensureSection(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  if (!el(SECTION_ID) && !observer && document.documentElement && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      if (!el(SECTION_ID) && document.querySelector('#kano-life-career-screen .klc-panel')) ensure();
      if (el(SECTION_ID)) { observer?.disconnect(); observer = null; }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const id of ['life-career-btn', 'life-career-menu-btn']) el(id)?.addEventListener('click', () => queueMicrotask(ensure));
  for (const type of ['kano:daily-day-change', 'kano:aure-journey-updated', 'kano:aure-cultural-choice', 'kano:family-responsibilities-updated', 'kano:life-shift-settled']) window.addEventListener(type, render);
  window.kanoNorthernDriverParenthood = {
    version: 1,
    snapshot: () => parenthoodReport(state, { day: context().day, relationshipStatus: context().relationshipStatus }),
    refresh: render,
    export: () => JSON.stringify(exportParenthoodReport(state, { day: context().day, relationshipStatus: context().relationshipStatus }), null, 2),
  };
}
install();
