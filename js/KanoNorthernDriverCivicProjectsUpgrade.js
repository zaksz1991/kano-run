/** Kano Life Step 73 — UI adapter for community civic projects. */
import { save, persist } from './storage.js';
import {
  CIVIC_SAVE_FIELD, CIVIC_CONTRIBUTION_AMOUNTS, CIVIC_DISTRICTS,
  CIVIC_PROJECT_TYPES, CIVIC_ISSUE_TYPES,
  createDefaultCivicState, normalizeCivicState, startCivicProject,
  contributeToCivicProject, volunteerForCivicProject, reportCivicIssue,
  advanceCivicState, getCivicSnapshot, exportCivicReport,
} from './KanoNorthernDriverCivicProjects.js';

const SECTION_ID = 'kano-civic-projects';
const STYLE_ID = 'kano-civic-projects-style';
const INSTALL_KEY = Symbol.for('kano.life.civicProjects.uiInstalled.v1');
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const safeText = (value, max = 220) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, max);
const money = value => `₦${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-NG')}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

let state = readState();
let notice = '';
let noticeIsError = false;
let observer = null;
let refreshTimer = null;

function readState() {
  return normalizeCivicState(save?.lifestyle?.[CIVIC_SAVE_FIELD] || createDefaultCivicState());
}

function context() {
  const ui = typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ || null : null;
  const game = ui?.game || null;
  const s = game?.s || {};
  const life = typeof window !== 'undefined' ? window.kanoNorthernDriverLifeSimulation?.snapshot?.() || {} : {};
  const society = typeof window !== 'undefined' ? window.kanoNorthernDriverSocietyMarkets?.snapshot?.() || {} : {};
  const adashi = typeof window !== 'undefined' ? window.kanoNorthernDriverAdashiSupport?.snapshot?.() || {} : {};
  const rawDay = s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? life.day ?? society.day
    ?? adashi.day ?? save?.lifestyle?.worldDayNumber ?? save?.lifestyle?.seasonalSimulationDay ?? 1;
  const parsed = Number(rawDay);
  const day = Math.max(1, Math.floor(Number.isFinite(parsed) ? parsed : 1));
  const activeShift = Boolean(game && ['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state)));
  return { ui, game, s, day, activeShift, wallet: Math.max(0, Math.floor(Number(save?.money) || 0)) };
}

function dispatchUpdated(ctx, completed = false) {
  try {
    window.dispatchEvent(new CustomEvent('kano:civic-project-updated', {
      detail: { day: ctx.day, wallet: Number(save?.money) || 0, activeProject: Boolean(state.activeProject),
        completedProjects: state.completedProjects.length, trust: state.trust },
    }));
    if (completed) window.dispatchEvent(new CustomEvent('kano:civic-project-completed', {
      detail: { day: ctx.day, latest: state.completedProjects.at(-1) || null },
    }));
  } catch { /* CustomEvent may be unavailable in a non-browser test harness. */ }
}

function commit(nextState, nextWallet, successMessage = '', completed = false) {
  const ctx = context();
  const beforeWallet = Number(save.money) || 0;
  const hadLifestyle = Object.prototype.hasOwnProperty.call(save, 'lifestyle');
  let beforeLifestyle;
  try { beforeLifestyle = JSON.parse(JSON.stringify(save.lifestyle || {})); }
  catch { beforeLifestyle = {}; }
  try {
    if (!globalThis.localStorage || typeof globalThis.localStorage.setItem !== 'function') throw new Error('storage-unavailable');
    if (!save.lifestyle || typeof save.lifestyle !== 'object' || Array.isArray(save.lifestyle)) save.lifestyle = {};
    save.money = Math.max(0, Math.floor(Number(nextWallet) || 0));
    save.lifestyle[CIVIC_SAVE_FIELD] = normalizeCivicState(nextState, { day: ctx.day });
    if (persist() !== true) throw new Error('save-failed');
    state = normalizeCivicState(save.lifestyle[CIVIC_SAVE_FIELD], { day: ctx.day });
    ctx.ui?.refreshWallet?.();
    window.kanoNorthernDriverLifeSimulation?.refresh?.();
    window.kanoNorthernDriverAdashiSupport?.refresh?.();
    dispatchUpdated(ctx, completed);
    render();
    if (successMessage) notify(successMessage);
    return true;
  } catch {
    save.money = beforeWallet;
    if (hadLifestyle) save.lifestyle = beforeLifestyle;
    else delete save.lifestyle;
    state = readState();
    notify('The save was not confirmed. No civic contribution was committed.', true);
    render();
    return false;
  }
}

function notify(message, error = false) {
  notice = safeText(message);
  noticeIsError = Boolean(error);
  const node = el('kcp-notice');
  if (node) { node.textContent = notice; node.dataset.state = error ? 'error' : 'ok'; }
  context().ui?.toast?.(String(message));
}

function installStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${SECTION_ID}{margin-top:18px;padding:16px 0 8px;border-top:1px solid #29465b;color:#e7f0f7}
    #${SECTION_ID} *{box-sizing:border-box;min-width:0}
    #${SECTION_ID} .kcp-note{margin:6px 0;font-size:12px;line-height:1.5;color:#b7cad8}
    #${SECTION_ID} .kcp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #${SECTION_ID} .kcp-card{padding:13px;background:#091723;border:1px solid #29465b;border-radius:10px;overflow-wrap:anywhere}
    #${SECTION_ID} .kcp-card h4{margin:0 0 7px;color:#f2f7fb;font-size:14px}
    #${SECTION_ID} .kcp-stat{margin:5px 0;color:#f8fbff;font-size:20px;font-weight:900}
    #${SECTION_ID} .kcp-pill{display:inline-block;margin:0 5px 6px 0;padding:4px 8px;border:1px solid #547388;border-radius:100px;color:#e6f3f9;font-size:10px;font-weight:800}
    #${SECTION_ID} .kcp-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}
    #${SECTION_ID} label{display:block;color:#e3eef6;font-size:12px;line-height:1.4}
    #${SECTION_ID} select{display:block;width:100%;min-height:42px;margin-top:5px;padding:8px;border:1px solid #43657c;border-radius:7px;background:#102637;color:#f4f8fc;font:inherit}
    #${SECTION_ID} button{width:100%;min-height:44px;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:10px 12px;font:inherit;font-size:12px;font-weight:800;text-align:left;white-space:normal;cursor:pointer}
    #${SECTION_ID} button.kcp-primary{background:#184a5a;border-color:#00b4d8}
    #${SECTION_ID} button:disabled{opacity:.45;cursor:not-allowed}
    #${SECTION_ID} .kcp-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}
    #${SECTION_ID} .kcp-meter{height:8px;margin:7px 0 10px;background:#1b3447;border-radius:9px;overflow:hidden}
    #${SECTION_ID} .kcp-meter i{display:block;height:100%;background:#00b4d8}
    #${SECTION_ID} .kcp-row{padding:9px 0;border-bottom:1px solid #20394b;color:#c6d7e3;font-size:12px;line-height:1.45;overflow-wrap:anywhere}
    #${SECTION_ID} .kcp-row:last-child{border-bottom:0}
    #${SECTION_ID} .kcp-notice{min-height:18px;margin-top:9px;color:#8fe1c5;font-size:12px;line-height:1.45}
    #${SECTION_ID} .kcp-notice[data-state=error]{color:#ffb4aa}
    #${SECTION_ID} .kcp-disclosure{border-left:3px solid #fbbf24;padding:8px 10px;background:#211d10;color:#e8dfc3;font-size:12px;line-height:1.5}
    @media(max-width:620px){#${SECTION_ID} .kcp-grid,#${SECTION_ID} .kcp-form,#${SECTION_ID} .kcp-actions{grid-template-columns:1fr}#${SECTION_ID} button,#${SECTION_ID} select{min-height:46px}}
  `;
  document.head.append(style);
}

function addText(parent, tag, value, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(value ?? '');
  parent.append(node);
  return node;
}

function makeButton(label, action, disabled = false, primary = false) {
  const node = document.createElement('button');
  node.type = 'button'; node.textContent = label; node.dataset.kcpAction = action; node.disabled = Boolean(disabled);
  if (primary) node.classList.add('kcp-primary');
  return node;
}

function makeSelect(id, label, options, currentValue) {
  const wrap = document.createElement('label');
  wrap.append(document.createTextNode(label));
  const select = document.createElement('select'); select.id = id;
  for (const item of options) {
    const option = document.createElement('option'); option.value = String(item.value); option.textContent = item.label;
    if (String(item.value) === String(currentValue)) option.selected = true;
    select.append(option);
  }
  wrap.append(select); return wrap;
}

function ensureSection() {
  const host = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!host) return null;
  let section = el(SECTION_ID);
  if (section) return section;
  installStyles();
  section = document.createElement('section');
  section.id = SECTION_ID;
  section.setAttribute('aria-labelledby', 'kcp-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="kcp-title">CIVIC LIFE · NEIGHBOURHOOD PROJECTS</h3>
    <p class="kcp-note">Build community projects, volunteer, and track fictional neighbourhood service reports. Project targets are game-balance values, not real construction estimates. Reports never leave the game and are not sent to any authority.</p>
    <div id="kcp-content"></div>
    <p class="kcp-notice" id="kcp-notice" role="status" aria-live="polite"></p>
  `;
  const anchor = el('kano-adashi-support') || el('kano-seasonal-resilience') || el('kano-parenthood') || el('kano-lefe-negotiation') || el('kano-aure-journey');
  if (anchor && anchor.parentElement === host) anchor.after(section); else host.append(section);
  section.addEventListener('click', event => {
    const button = event.target.closest('button[data-kcp-action]');
    if (button) handleAction(button.dataset.kcpAction);
  });
  return section;
}

function syncDay(ctx) {
  const advanced = advanceCivicState(state, { day: ctx.day });
  if (JSON.stringify(advanced) === JSON.stringify(state)) return false;
  const previous = state;
  const hadLifestyle = Object.prototype.hasOwnProperty.call(save, 'lifestyle');
  let previousLifestyle;
  try { previousLifestyle = JSON.parse(JSON.stringify(save.lifestyle || {})); }
  catch { previousLifestyle = {}; }
  // Publish the new in-memory state before persist(): storage.js emits a
  // synchronous wallet-update event during persistence, which can call render.
  // Setting state first prevents a re-entrant render from processing the same
  // in-game day repeatedly.
  state = normalizeCivicState(advanced, { day: ctx.day });
  try {
    if (!save.lifestyle || typeof save.lifestyle !== 'object' || Array.isArray(save.lifestyle)) save.lifestyle = {};
    save.lifestyle[CIVIC_SAVE_FIELD] = state;
    if (persist() !== true) throw new Error('save-failed');
    dispatchUpdated(ctx, state.completedProjects.length > previous.completedProjects.length);
    return true;
  } catch {
    state = previous;
    if (hadLifestyle) save.lifestyle = previousLifestyle;
    else delete save.lifestyle;
    return false;
  }
}

function renderMetrics(snapshot, parent) {
  const labels = [
    ['floodResilience', 'Flood resilience'], ['roadSafety', 'Road safety'], ['nightSafety', 'Night safety'],
    ['waterAccess', 'Water access'], ['heatResilience', 'Heat resilience'], ['cleanliness', 'Cleanliness'],
    ['marketAccess', 'Market access'], ['restingPlaces', 'Rest / shade access'],
  ];
  const grid = document.createElement('div'); grid.className = 'kcp-grid';
  for (const [key, label] of labels) {
    const card = document.createElement('article'); card.className = 'kcp-card';
    addText(card, 'h4', label);
    addText(card, 'p', `${snapshot.metrics[key]}/100`, 'kcp-stat');
    const meter = document.createElement('div'); meter.className = 'kcp-meter';
    const fill = document.createElement('i'); fill.style.width = `${clamp(snapshot.metrics[key], 0, 100)}%`;
    meter.append(fill); card.append(meter); grid.append(card);
  }
  parent.append(grid);
}

function render() {
  const section = ensureSection();
  const content = el('kcp-content');
  if (!section || !content) return;
  const ctx = context();
  syncDay(ctx);
  const snapshot = getCivicSnapshot(state, { day: ctx.day });
  content.replaceChildren();

  const summary = document.createElement('div'); summary.className = 'kcp-grid';
  const summaryItems = [
    ['Neighbourhood trust', `${snapshot.trust}/100`],
    ['Participation', `${snapshot.participation}/100`],
    ['Completed projects', String(snapshot.completedProjects)],
    ['Reports resolved / referred', `${snapshot.issuesResolved} / ${snapshot.issuesReferred}`],
  ];
  for (const [label, value] of summaryItems) {
    const card = document.createElement('article'); card.className = 'kcp-card';
    addText(card, 'h4', label); addText(card, 'p', value, 'kcp-stat'); summary.append(card);
  }
  content.append(summary);
  renderMetrics(snapshot, content);

  const form = document.createElement('div'); form.className = 'kcp-form';
  form.append(makeSelect('kcp-project-type', 'Community project', CIVIC_PROJECT_TYPES.map(p => ({ value: p.id, label: `${p.title} · ${money(p.target)} target` })), el('kcp-project-type')?.value || 'drainage'));
  form.append(makeSelect('kcp-district', 'Neighbourhood scenario', CIVIC_DISTRICTS.map(d => ({ value: d.id, label: d.label })), el('kcp-district')?.value || 'kurmi'));
  form.append(makeSelect('kcp-amount', 'Contribution from existing wallet', CIVIC_CONTRIBUTION_AMOUNTS.map(amount => ({ value: amount, label: money(amount) })), el('kcp-amount')?.value || 500));
  content.append(form);
  const projectActions = document.createElement('div'); projectActions.className = 'kcp-actions';
  projectActions.append(makeButton(snapshot.activeProject ? 'PROJECT ALREADY ACTIVE' : 'START COMMUNITY PROJECT', 'start-project', ctx.activeShift || Boolean(snapshot.activeProject), true));
  projectActions.append(makeButton(snapshot.activeProject ? `CONTRIBUTE ${money(Number(el('kcp-amount')?.value) || 500)}` : 'CONTRIBUTE', 'contribute', ctx.activeShift || !snapshot.activeProject, true));
  projectActions.append(makeButton('VOLUNTEER TODAY', 'volunteer', ctx.activeShift || state.lastVolunteerDay === ctx.day));
  content.append(projectActions);

  if (snapshot.activeProject) {
    const active = document.createElement('article'); active.className = 'kcp-card'; active.style.marginTop = '10px';
    addText(active, 'h4', `${snapshot.activeProject.title} · ${CIVIC_DISTRICTS.find(d => d.id === snapshot.activeProject.district)?.label || ''}`);
    addText(active, 'p', `${snapshot.activeProject.progressPercent}% funded by player contributions, simulated neighbour support and volunteer value.`, 'kcp-note');
    const meter = document.createElement('div'); meter.className = 'kcp-meter';
    const fill = document.createElement('i'); fill.style.width = `${snapshot.activeProject.progressPercent}%`; meter.append(fill); active.append(meter);
    addText(active, 'p', `Target ${money(snapshot.activeProject.target)} · Player ${money(snapshot.activeProject.playerRaised)} · Neighbours ${money(snapshot.activeProject.neighbourRaised)} · Volunteer value ${money(snapshot.activeProject.volunteerValue)}`, 'kcp-note');
    addText(active, 'p', `Remaining project value: ${money(snapshot.activeProject.remaining)}`, 'kcp-stat');
    content.append(active);
  }

  const reportForm = document.createElement('div'); reportForm.className = 'kcp-form';
  reportForm.append(makeSelect('kcp-issue-type', 'Issue to record', CIVIC_ISSUE_TYPES.map(issue => ({ value: issue.id, label: `${issue.label} · ${issue.priority} priority` })), el('kcp-issue-type')?.value || 'blocked-drain'));
  reportForm.append(makeSelect('kcp-issue-district', 'Issue area', CIVIC_DISTRICTS.map(d => ({ value: d.id, label: d.label })), el('kcp-issue-district')?.value || 'kurmi'));
  const issueActions = document.createElement('div'); issueActions.append(makeButton('RECORD IN-GAME ISSUE', 'report-issue', ctx.activeShift || state.lastIssueDay === ctx.day, true)); reportForm.append(issueActions);
  content.append(reportForm);
  addText(content, 'p', 'One report per in-game day. The board is fictional: a report is saved locally and never contacts a real agency.', 'kcp-note');

  const historyCard = document.createElement('article'); historyCard.className = 'kcp-card'; historyCard.style.marginTop = '10px';
  addText(historyCard, 'h4', 'Recent projects and civic board');
  const feed = document.createElement('div');
  const rows = [];
  for (const issue of state.issues.slice(-6).reverse()) {
    const issueDef = CIVIC_ISSUE_TYPES.find(x => x.id === issue.type);
    const area = CIVIC_DISTRICTS.find(x => x.id === issue.district)?.label || issue.district;
    rows.push({ day: issue.openedDay, text: `Day ${issue.openedDay} · Issue: ${issueDef?.label || issue.type} · ${area} · ${issue.status.replace('-', ' ')}` });
  }
  for (const row of state.history.slice(-8).reverse()) rows.push({ day: row.day, text: `Day ${row.day} · ${row.message}` });
  rows.sort((a, b) => b.day - a.day);
  if (!rows.length) addText(feed, 'p', 'No community projects or civic board activity recorded yet.', 'kcp-note');
  else for (const row of rows.slice(0, 10)) addText(feed, 'div', row.text, 'kcp-row');
  historyCard.append(feed);
  historyCard.append(makeButton('EXPORT CIVIC ACTIVITY REPORT (.JSON)', 'export-report'));
  content.append(historyCard);
  addText(content, 'p', 'Simulated neighbour funding is project progress, not an addition to the player wallet. Contributions from the player are deducted only from the existing saved wallet after storage confirms the full update.', 'kcp-disclosure');
  if (notice) { const node = el('kcp-notice'); if (node) { node.textContent = notice; node.dataset.state = noticeIsError ? 'error' : 'ok'; } }
}

function handleAction(action) {
  const ctx = context();
  if (ctx.activeShift && action !== 'export-report') { notify('Finish the driving shift before using community projects or civic actions.', true); return; }
  if (action === 'start-project') {
    const result = startCivicProject(state, { projectType: el('kcp-project-type')?.value, district: el('kcp-district')?.value, day: ctx.day });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, ctx.wallet, result.message);
    return;
  }
  if (action === 'contribute') {
    const result = contributeToCivicProject(state, { amount: Number(el('kcp-amount')?.value), wallet: ctx.wallet, day: ctx.day });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, result.wallet, result.message, Boolean(result.completed));
    return;
  }
  if (action === 'volunteer') {
    const result = volunteerForCivicProject(state, { day: ctx.day });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, ctx.wallet, result.message, Boolean(result.completed));
    return;
  }
  if (action === 'report-issue') {
    const result = reportCivicIssue(state, { issueType: el('kcp-issue-type')?.value, district: el('kcp-issue-district')?.value, day: ctx.day });
    if (!result.ok) { notify(result.message, true); return; }
    commit(result.state, ctx.wallet, result.message);
    return;
  }
  if (action === 'export-report') {
    try {
      const report = exportCivicReport(state, { day: ctx.day });
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `kano-life-civic-report-day-${ctx.day}.json`;
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      notify('Civic activity report exported. It contains fictional game activity only.');
    } catch { notify('Could not export the civic activity report in this browser.', true); }
  }
}

function install() {
  if (typeof window === 'undefined' || window[INSTALL_KEY]) return;
  window[INSTALL_KEY] = true;
  installStyles();
  const ensure = () => { installStyles(); if (ensureSection()) render(); };
  ensure();
  if (document.documentElement && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      if (document.querySelector('#kano-life-career-screen .klc-panel') && !el(SECTION_ID)) ensure();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const eventName of ['kano:wallet-updated', 'kano:adashi-support-updated', 'kano:seasonal-resilience-updated', 'kano:life-day-updated', 'kano:civic-project-updated']) {
    window.addEventListener(eventName, render);
  }
  refreshTimer = window.setInterval(() => {
    const fresh = readState();
    if (JSON.stringify(fresh) !== JSON.stringify(state)) { state = fresh; render(); }
    else if (!el(SECTION_ID)) ensure();
    else if (context().day !== state.lastProcessedDay) render();
  }, 2500);
  window.kanoNorthernDriverCivicProjects = {
    snapshot: () => ({ ...getCivicSnapshot(state, { day: context().day }), wallet: context().wallet }),
    refresh: () => { state = readState(); render(); },
    export: () => exportCivicReport(state, { day: context().day }),
    dispose: () => {
      if (observer) observer.disconnect();
      if (refreshTimer) clearInterval(refreshTimer);
      for (const eventName of ['kano:wallet-updated', 'kano:adashi-support-updated', 'kano:seasonal-resilience-updated', 'kano:life-day-updated', 'kano:civic-project-updated']) window.removeEventListener(eventName, render);
      delete window.kanoNorthernDriverCivicProjects;
      delete window[INSTALL_KEY];
    },
  };
}

install();
