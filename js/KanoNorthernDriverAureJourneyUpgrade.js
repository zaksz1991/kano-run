/** Step 69 runtime panel. All plans are non-binding and do not change the wallet. */
import './KanoNorthernDriverAureAndCultureUpgrade.js';
import './KanoNorthernDriverFamilyResponsibilitiesUpgrade.js';
import './KanoNorthernDriverCareerProgressionUpgrade.js';
import { save } from './storage.js';
import {
  AURE_JOURNEY_STORAGE_KEY,
  createDefaultAureJourneyState,
  normalizeAureJourneyState,
  actionsForRelationshipStatus,
  resolveAureJourneyAction,
  saveAureJourneyPlans,
  getAureJourneyReport,
  exportAureJourneyReport,
} from './KanoNorthernDriverAureJourney.js';

const SECTION_ID = 'kano-aure-journey';
const STYLE_ID = 'kaj-style';
const INSTALL_KEY = Symbol.for('kano.life.aureJourney.installed.v1');
const WEDDING_FIELDS = [
  ['food', 'Family food & refreshments'], ['outfits', 'Clothes and outfits'], ['venue', 'Venue / preparations'],
  ['familyGifts', 'Family gifts and customary items'], ['transport', 'Transport'], ['contingency', 'Emergency allowance'],
];
const HOUSEHOLD_FIELDS = [
  ['food', 'Food and provisions'], ['rent', 'Rent / housing'], ['utilities', 'Electricity and water'],
  ['transport', 'Transport and work travel'], ['familySupport', 'Family support'], ['savings', 'Savings'], ['personalNeeds', 'Personal needs'],
];
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const safeText = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 220);
let state = loadState();
let notice = '';
let noticeError = false;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(AURE_JOURNEY_STORAGE_KEY);
    return normalizeAureJourneyState(raw ? JSON.parse(raw) : createDefaultAureJourneyState());
  } catch {
    return createDefaultAureJourneyState();
  }
}
function persistState(next) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(AURE_JOURNEY_STORAGE_KEY, JSON.stringify(normalizeAureJourneyState(next)));
    return true;
  } catch { return false; }
}
function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const aure = typeof window !== 'undefined' ? window.kanoNorthernDriverAureAndCulture?.snapshot?.() || {} : {};
  const life = typeof window !== 'undefined' ? window.kanoNorthernDriverLifeSimulation?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay
    ?? life.day ?? save.lifestyle?.worldDayNumber ?? 1;
  const parsedDay = Number(rawDay);
  const day = Math.max(1, Math.floor(Number.isFinite(parsedDay) ? parsedDay : 1));
  return {
    ui, game, day,
    activeShift: Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))),
    relationshipStatus: String(aure.relationshipStatus || 'single'),
    profile: aure.profile || life.profile || { name: 'Driver', age: 22, gender: 'male' },
  };
}
function notify(message, error = false) {
  notice = safeText(message);
  noticeError = Boolean(error);
  const node = el('kaj-notice');
  if (node) { node.textContent = notice; node.dataset.state = error ? 'error' : 'ok'; }
  context().ui?.toast?.(String(message || ''));
}
function persistCommitted(next, message) {
  if (!persistState(next)) { notify('Could not save this update in browser storage. No transaction was made.', true); return false; }
  state = normalizeAureJourneyState(next);
  window.dispatchEvent(new CustomEvent('kano:aure-journey-updated', { detail: { day: context().day } }));
  render();
  window.kanoNorthernDriverAureAndCulture?.refresh?.();
  notify(message || 'Saved.');
  return true;
}
function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 6px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kaj-note{font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kaj-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kaj-card{background:#091723;border:1px solid #29465b;border-radius:10px;padding:12px;overflow-wrap:anywhere}
    #${SECTION_ID} .kaj-card h4{margin:0 0 7px;font-size:14px;color:#f2f7fb}
    #${SECTION_ID} .kaj-stat{font-size:20px;font-weight:900;color:#f8fbff;margin:7px 0}
    #${SECTION_ID} .kaj-meter{height:7px;background:#1b3447;border-radius:8px;overflow:hidden;margin:7px 0 10px}
    #${SECTION_ID} .kaj-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} .kaj-row{border:1px solid #29465b;background:#0a1824;border-radius:9px;padding:11px;margin-top:8px}
    #${SECTION_ID} .kaj-row h5{font-size:13px;margin:0 0 5px;color:#f5f8fb}
    #${SECTION_ID} .kaj-row p{font-size:12px;line-height:1.5;color:#c3d3df;margin:5px 0}
    #${SECTION_ID} label{display:flex;flex-direction:column;gap:5px;margin:7px 0;color:#d9e7ef;font-size:12px;font-weight:750}
    #${SECTION_ID} input,#${SECTION_ID} select{width:100%;min-height:44px;border:1px solid #45677d;border-radius:8px;background:#0b1a27;color:#fff;padding:8px 10px;font:inherit;font-size:16px}
    #${SECTION_ID} button{min-height:44px;max-width:100%;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kaj-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
    #${SECTION_ID} .kaj-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} .kaj-notice{min-height:18px;margin-top:8px;font-size:12px;color:#8fe1c5}
    #${SECTION_ID} .kaj-notice[data-state="error"]{color:#ffb4aa}
    @media(max-width:520px){#${SECTION_ID} .kaj-grid{grid-template-columns:1fr}#${SECTION_ID} .kaj-actions{display:grid;grid-template-columns:1fr}#${SECTION_ID} .kaj-actions button{width:100%}}
  `;
  document.head.append(style);
}
function fieldMarkup(prefix, fields) {
  return fields.map(([key, label]) => `<label>${label}<input type="number" inputmode="numeric" min="0" max="1000000" step="100" data-kaj-plan="${prefix}" data-kaj-key="${key}" aria-label="${label} planned amount"></label>`).join('');
}
function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID); if (section) return section;
  section = document.createElement('section'); section.id = SECTION_ID;
  section.innerHTML = `
    <h3 class="klc-section-title">AURE · RELATIONSHIPS · SHARED LIFE</h3>
    <p class="kaj-note">Aure is an important life path in Kano, but marriage is not a compulsory achievement. This panel follows the status you selected in the existing Aure profile. Actions build conversation and planning milestones; they do not silently change relationship status, diagnose health, or move money.</p>
    <div class="kaj-grid">
      <article class="kaj-card"><h4 id="kaj-status-label">Current life chapter</h4><p class="kaj-stat" id="kaj-status">Single</p><p id="kaj-days" class="kaj-note"></p><p id="kaj-pressure" class="kaj-note"></p></article>
      <article class="kaj-card"><h4>Relationship skills</h4><p id="kaj-communication-label" class="kaj-note">Communication 50/100</p><div class="kaj-meter"><i id="kaj-communication-meter" style="width:50%"></i></div><p id="kaj-family-label" class="kaj-note">Family understanding 50/100</p><div class="kaj-meter"><i id="kaj-family-meter" style="width:50%"></i></div><p id="kaj-planning-label" class="kaj-note">Shared planning 35/100</p><div class="kaj-meter"><i id="kaj-planning-meter" style="width:35%"></i></div><p id="kaj-wellbeing-label" class="kaj-note">Wellbeing 70/100</p><div class="kaj-meter"><i id="kaj-wellbeing-meter" style="width:70%"></i></div><p id="kaj-autonomy-label" class="kaj-note">Personal autonomy 70/100</p><div class="kaj-meter"><i id="kaj-autonomy-meter" style="width:70%"></i></div><p id="kaj-milestones" class="kaj-note"></p></article>
    </div>
    <article class="kaj-card"><h4 id="kaj-action-heading">One meaningful conversation for today</h4><p class="kaj-note">Choose one action per in-game day. Scores describe this fictional relationship journey, not clinical health or real-life compatibility.</p><div id="kaj-actions"></div><p id="kaj-action-status" class="kaj-note"></p></article>
    <div class="kaj-grid" id="kaj-plan-grid">
      <article class="kaj-card" id="kaj-wedding-card"><h4>Aure budget plan</h4><p class="kaj-note">For dating or engaged profiles. Plan-only amounts; saving this form does not spend wallet money or imply that a ceremony must happen.</p><div id="kaj-wedding-fields">${fieldMarkup('wedding', WEDDING_FIELDS)}</div><p class="kaj-stat" id="kaj-wedding-total">Planned total ₦0</p><div class="kaj-actions"><button type="button" class="kaj-primary" data-kaj-save-plan="wedding">SAVE AURE BUDGET PLAN</button></div></article>
      <article class="kaj-card" id="kaj-household-card"><h4>Shared household plan</h4><p class="kaj-note">For married or separated profiles. Review categories and expectations without moving money. Keep each person's safety, privacy and work responsibilities in view.</p><div id="kaj-household-fields">${fieldMarkup('household', HOUSEHOLD_FIELDS)}</div><p class="kaj-stat" id="kaj-household-total">Planned total ₦0</p><div class="kaj-actions"><button type="button" class="kaj-primary" data-kaj-save-plan="household">SAVE HOUSEHOLD PLAN</button></div></article>
    </div>
    <article class="kaj-card"><h4>Recent relationship milestones</h4><p class="kaj-note">Partner names and private health details are intentionally excluded. This log records actions, not private messages.</p><div id="kaj-history"></div><div class="kaj-actions"><button type="button" data-kaj-action="export">EXPORT RELATIONSHIP JOURNEY (.JSON)</button></div></article>
    <p id="kaj-notice" class="kaj-notice" role="status" aria-live="polite"></p>
  `;
  const anchor = el('kano-family-responsibilities') || el('kano-phone-life') || el('kano-aure-culture') || el('kano-career-progression');
  if (anchor) anchor.after(section); else host.append(section);
  section.addEventListener('click', event => {
    const action = event.target.closest('button[data-kaj-action-id]');
    if (action) { handleJourneyAction(action.dataset.kajActionId); return; }
    const savePlan = event.target.closest('button[data-kaj-save-plan]');
    if (savePlan) { handleSavePlan(savePlan.dataset.kajSavePlan); return; }
    if (event.target.closest('button[data-kaj-action="export"]')) exportReport();
  });
  section.addEventListener('input', event => {
    const input = event.target.closest('input[data-kaj-plan]');
    if (!input) return;
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) return;
    renderPlanTotals();
  });
  return section;
}
function report() {
  const ctx = context();
  const result = getAureJourneyReport(state, { relationshipStatus: ctx.relationshipStatus, day: ctx.day, age: ctx.profile.age, gender: ctx.profile.gender });
  if (JSON.stringify(result.state) !== JSON.stringify(state)) {
    state = result.state;
    persistState(state);
  }
  return { ...ctx, ...result };
}
function fillPlanFields(prefix, source) {
  for (const [key] of (prefix === 'wedding' ? WEDDING_FIELDS : HOUSEHOLD_FIELDS)) {
    const input = document.querySelector(`#${SECTION_ID} input[data-kaj-plan="${prefix}"][data-kaj-key="${key}"]`);
    if (!input || document.activeElement === input) continue;
    input.value = String(source[key] ?? 0);
  }
}
function readPlanFields(prefix, fields) {
  const result = {};
  for (const [key] of fields) {
    const input = document.querySelector(`#${SECTION_ID} input[data-kaj-plan="${prefix}"][data-kaj-key="${key}"]`);
    const raw = input?.value ?? '0';
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000 || Math.floor(value) !== value) return { ok: false, key };
    result[key] = value;
  }
  return { ok: true, value: result };
}
function renderPlanTotals() {
  const readTotal = prefix => [...document.querySelectorAll(`#${SECTION_ID} input[data-kaj-plan="${prefix}"]`)].reduce((sum, input) => sum + Math.max(0, Math.min(1_000_000, Math.floor(Number(input.value) || 0))), 0);
  const wedding = el('kaj-wedding-total'); if (wedding) wedding.textContent = `Planned total ${money(readTotal('wedding'))}`;
  const household = el('kaj-household-total'); if (household) household.textContent = `Planned total ${money(readTotal('household'))}`;
}
function renderActions(ctx, current) {
  const target = el('kaj-actions'); if (!target) return;
  target.replaceChildren();
  for (const action of actionsForRelationshipStatus(ctx.relationshipStatus)) {
    const row = document.createElement('div'); row.className = 'kaj-row';
    const title = document.createElement('h5'); title.textContent = action.label; row.append(title);
    const copy = document.createElement('p'); copy.textContent = action.summary; row.append(copy);
    const buttons = document.createElement('div'); buttons.className = 'kaj-actions';
    const button = document.createElement('button'); button.type = 'button'; button.dataset.kajActionId = action.id; button.textContent = `RECORD ACTION · ${action.label.toUpperCase()}`;
    button.disabled = ctx.activeShift || current.state.lastActionDay === ctx.day;
    if (ctx.activeShift) button.title = 'Stop safely or end the driving shift before recording this conversation.';
    else if (current.state.lastActionDay === ctx.day) button.title = 'One relationship action is allowed per simulated day.';
    buttons.append(button); row.append(buttons); target.append(row);
  }
}
function renderHistory(items) {
  const host = el('kaj-history'); if (!host) return; host.replaceChildren();
  if (!items.length) { const p = document.createElement('p'); p.className = 'kaj-note'; p.textContent = 'No relationship milestones recorded yet. Start with one honest conversation when it suits your current life chapter.'; host.append(p); return; }
  for (const item of items.slice(0, 8)) {
    const row = document.createElement('div'); row.className = 'kaj-row';
    const title = document.createElement('h5'); title.textContent = `Day ${item.day} · ${item.type.replace(/[-_]/g, ' ')}`;
    const text = document.createElement('p'); text.textContent = item.text;
    row.append(title, text); host.append(row);
  }
}
function render() {
  if (typeof document === 'undefined') return;
  const ctx = report();
  const section = ensureSection(); if (!section) return;
  const summary = ctx.summary;
  const put = (id, value) => { const node = el(id); if (node) node.textContent = value; };
  put('kaj-status', ctx.statusLabel);
  put('kaj-days', `Recorded in this status for ${ctx.daysInStatus} in-game day(s). Status comes from the existing Aure profile and is not changed by this panel.`);
  put('kaj-pressure', ctx.socialPressureNote);
  for (const [key, label] of [['communication', 'Communication'], ['familyUnderstanding', 'Family understanding'], ['sharedPlanning', 'Shared planning'], ['wellbeing', 'Wellbeing'], ['autonomy', 'Personal autonomy']]) {
    put(`kaj-${key === 'familyUnderstanding' ? 'family' : key === 'sharedPlanning' ? 'planning' : key}`, `${label} ${summary[key]}/100`);
    const slug = key === 'familyUnderstanding' ? 'family' : key === 'sharedPlanning' ? 'planning' : key;
    put(`kaj-${slug}-label`, `${label} ${summary[key]}/100`);
    const meter = el(`kaj-${slug}-meter`);
    if (meter) meter.style.width = `${summary[key]}%`;
  }
  put('kaj-milestones', `${summary.completedMilestones}/${summary.milestoneCount} long-term milestones recorded.`);
  put('kaj-action-status', ctx.activeShift ? 'Driving is active. Relationship actions are locked until the shift is safely stopped or complete.' : state.lastActionDay === ctx.day ? 'Today’s relationship action is already recorded.' : 'Off shift. One relationship action is available today.');
  const weddingAllowed = ['dating', 'engaged'].includes(ctx.relationshipStatus);
  const householdAllowed = ['married', 'separated'].includes(ctx.relationshipStatus);
  if (el('kaj-wedding-card')) el('kaj-wedding-card').hidden = !weddingAllowed;
  if (el('kaj-household-card')) el('kaj-household-card').hidden = !householdAllowed;
  fillPlanFields('wedding', state.weddingPlan); fillPlanFields('household', state.householdPlan); renderPlanTotals();
  renderActions(ctx, ctx); renderHistory(ctx.state.history);
  const noticeNode = el('kaj-notice'); if (noticeNode) { noticeNode.textContent = notice; noticeNode.dataset.state = noticeError ? 'error' : 'ok'; }
}
function handleJourneyAction(actionId) {
  const ctx = context();
  const result = resolveAureJourneyAction(state, { actionId, day: ctx.day, relationshipStatus: ctx.relationshipStatus });
  const messages = {
    daily_action_already_used: 'One relationship action is available each in-game day.',
    invalid_action_for_status: 'That action does not apply to your current Aure profile.',
  };
  if (!result.ok) { if (result.state && JSON.stringify(result.state) !== JSON.stringify(state)) persistCommitted(result.state, 'Relationship status was synchronised from the Aure profile.'); else notify(messages[result.reason] || 'Could not record that action.', true); return; }
  persistCommitted(result.state, result.message);
}
function handleSavePlan(kind) {
  const ctx = context();
  if (ctx.activeShift) { notify('Stop safely or finish the driving shift before editing relationship plans.', true); return; }
  const prefix = kind === 'wedding' ? 'wedding' : 'household';
  const fields = kind === 'wedding' ? WEDDING_FIELDS : HOUSEHOLD_FIELDS;
  const read = readPlanFields(prefix, fields);
  if (!read.ok) { notify(`Enter a whole amount from ₦0 to ₦1,000,000 for ${fields.find(([key]) => key === read.key)?.[1] || 'each category'}.`, true); return; }
  const options = { relationshipStatus: ctx.relationshipStatus, day: ctx.day, ...(kind === 'wedding' ? { weddingPlan: read.value } : { householdPlan: read.value }) };
  const result = saveAureJourneyPlans(state, options);
  if (!result.ok) { notify('This plan is not available for the current relationship status.', true); return; }
  persistCommitted(result.state, result.message);
}
function exportReport() {
  const ctx = context();
  const payload = exportAureJourneyReport(state, { relationshipStatus: ctx.relationshipStatus, day: ctx.day, age: ctx.profile.age, gender: ctx.profile.gender });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `kano-aure-journey-day-${ctx.day}.json`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Relationship journey report exported without partner names or private health details.');
}
function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  const ensure = () => { installStyles(); ensureSection(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true }); else ensure();
  for (const id of ['life-career-btn', 'life-career-menu-btn']) el(id)?.addEventListener('click', () => queueMicrotask(ensure));
  if (!el(SECTION_ID) && document.documentElement && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (document.querySelector('#kano-life-career-screen .klc-panel') && !el(SECTION_ID)) ensure();
      if (el(SECTION_ID)) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const type of ['kano:daily-day-change', 'kano:relationship-status-updated', 'kano:family-responsibilities-updated', 'kano:phone-life-updated', 'kano:life-shift-settled', 'kano:aure-journey-updated']) window.addEventListener(type, render);
  window.kanoNorthernDriverAureJourney = {
    version: 1,
    snapshot: () => getAureJourneyReport(state, { relationshipStatus: context().relationshipStatus, day: context().day, age: context().profile.age, gender: context().profile.gender }),
    export: () => JSON.stringify(exportAureJourneyReport(state, { relationshipStatus: context().relationshipStatus, day: context().day, age: context().profile.age, gender: context().profile.gender }), null, 2),
    refresh: render,
  };
  ensure();
}
install();
console.info('[Kano Life] Step 69 Aure and relationship journey registered.');
