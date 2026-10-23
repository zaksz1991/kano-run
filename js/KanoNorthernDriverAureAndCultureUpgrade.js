import './KanoNorthernDriverKanoSocietyMarketsUpgrade.js';
/** Runtime UI for Aure, relationships, women drivers and everyday Kano cultural life. */
import { UI } from './ui.js';
import { save, persist } from './storage.js';
import {
  RELATIONSHIP_STATUSES, FEMALE_KEKE_DRIVERS, CULTURAL_MEALS, COSMETIC_CHOICES,
  createDefaultAureState, normalizeAureState, buildDailyScenario, setRelationshipStatus,
  resolveDailyScenario, toggleHealthTracking, femaleHealthSummary, recordHealthConcern,
  seekQualifiedHealthCare, recordPregnancyTest, buyCosmeticOrSkinCare, buyCulturalMeal,
  recordClinicianPlanFollowThrough, recordWellbeingAction,
} from './KanoNorthernDriverAureAndCulture.js';

const STORAGE_KEY = 'kano-life-aure-and-cultural-life-v1';
const HOOK = Symbol.for('kano.life.aureCulture.ui.v1');
const STYLE_ID = 'kac-style';
let activeUI = null;
let state = loadState();
let observer = null;

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? normalizeAureState(JSON.parse(raw)) : createDefaultAureState();
  } catch { return createDefaultAureState(); }
}
function saveState(next = state) {
  state = normalizeAureState(next);
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
const el = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const money = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const safeText = (value, max = 160) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, max);
function context() {
  const ui = activeUI || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null);
  const game = ui?.game || null;
  const s = game?.s || {};
  const day = Math.max(1, Math.floor(Number(s.__kanoScheduleCurrentDay ?? s.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1) || 1));
  const rawMinutes = Number(s.gameClockMinutes ?? s.__kanoScheduleClockMinutes ?? save.lifestyle?.worldClockMinutes ?? 420);
  const minutes = ((Number.isFinite(rawMinutes) ? Math.floor(rawMinutes) : 420) % 1440 + 1440) % 1440;
  const profile = window.kanoNorthernDriverLifeSimulation?.snapshot?.().profile || { name: 'Musa', gender: 'male', age: 22 };
  return { ui, game, s, day, minutes, profile, wallet: Math.max(0, Math.round(Number(save.money) || 0)) };
}
function shiftActive() {
  const { game } = context();
  return Boolean(game && ['PLAY', 'EVENT'].includes(String(game.state)));
}
function notify(message, error = false) {
  const target = el('kac-notice');
  if (target) { target.textContent = String(message || ''); target.style.color = error ? '#ffb4aa' : '#8fe1c5'; }
  if (message) context().ui?.toast?.(String(message));
}
function commitWalletAndCulture(nextState, nextWallet, message) {
  const previousWallet = Math.max(0, Math.round(Number(save.money) || 0));
  const next = Math.max(0, Math.round(Number(nextWallet) || 0));
  try {
    save.money = next;
    if (typeof persist === 'function') persist();
    saveState(nextState);
    context().ui?.refreshWallet?.();
    window.kanoNorthernDriverLifeSimulation?.refresh?.();
    refreshPanel();
    notify(message || 'Saved.');
    return true;
  } catch (error) {
    save.money = previousWallet;
    try { if (typeof persist === 'function') persist(); } catch {}
    notify('The change could not be saved. No further transaction was made.', true);
    return false;
  }
}

function ensureStyles() {
  if (el(STYLE_ID) || !document.head) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #kano-aure-culture{margin-top:18px;padding-top:14px;border-top:1px solid #29465b;color:#e7f0f7}
    #kano-aure-culture .kac-note{color:#b7cad8;font-size:12px;line-height:1.5}
    #kano-aure-culture .kac-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}
    #kano-aure-culture .kac-card{min-width:0;background:#091723;border:1px solid #29465b;border-radius:10px;padding:11px}
    #kano-aure-culture .kac-card h4{margin:0 0 7px;font-size:14px}
    #kano-aure-culture label{display:flex;flex-direction:column;gap:5px;margin:7px 0;color:#d9e7ef;font-size:12px;font-weight:750;min-width:0}
    #kano-aure-culture input,#kano-aure-culture select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid #45677d;border-radius:8px;background:#0b1a27;color:#fff;padding:8px 10px;font:inherit;font-size:16px}
    #kano-aure-culture .kac-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    #kano-aure-culture button{min-height:44px;max-width:100%;border:1px solid #43657c;border-radius:8px;background:#172f42;color:#f3f8fc;padding:9px 11px;font:inherit;font-size:12px;font-weight:800;white-space:normal;text-align:left;cursor:pointer}
    #kano-aure-culture button:disabled{opacity:.45;cursor:not-allowed}
    #kano-aure-culture .kac-primary{background:#184a5a;border-color:#00b4d8}
    #kano-aure-culture .kac-meter{height:5px;background:#1d3445;overflow:hidden;border-radius:8px;margin:5px 0 10px}
    #kano-aure-culture .kac-meter i{display:block;height:100%;background:#00b4d8}
    #kano-aure-culture .kac-event{border:1px solid #3b596d;border-radius:10px;background:#0d1e2c;padding:12px;margin:10px 0}
    #kano-aure-culture .kac-kicker{font-size:10px;font-weight:900;letter-spacing:.09em;color:#f3c861;margin:0 0 5px}
    #kano-aure-culture .kac-event h4{font-size:17px;margin:0 0 7px}
    #kano-aure-culture .kac-event p{font-size:13px;line-height:1.5;color:#cbd9e3;margin:0}
    #kano-aure-culture .kac-choices{display:grid;gap:7px;margin-top:10px}
    #kano-aure-culture .kac-roster{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}
    #kano-aure-culture .kac-peer{background:#091723;border:1px solid #29465b;border-radius:8px;padding:8px;min-width:0}
    #kano-aure-culture .kac-peer b{display:block;font-size:12px}
    #kano-aure-culture .kac-peer small{display:block;color:#b7cad8;font-size:11px;line-height:1.4;margin-top:3px}
    #kano-aure-culture .kac-ledger{display:grid;gap:5px;margin-top:8px}
    #kano-aure-culture .kac-ledger div{font-size:11px;line-height:1.45;color:#b7cad8;background:#091723;padding:7px 9px;border-radius:7px;overflow-wrap:anywhere}
    #kano-aure-culture .kac-notice{min-height:18px;font-size:12px;margin-top:8px;color:#8fe1c5}
    @media(max-width:520px){#kano-aure-culture .kac-grid,#kano-aure-culture .kac-roster{grid-template-columns:1fr}#kano-aure-culture .kac-actions{display:grid;grid-template-columns:1fr}#kano-aure-culture button{width:100%}}
  `;
  document.head.append(style);
}

function ensureSection() {
  if (typeof document === 'undefined') return null;
  const panel = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!panel) return null;
  let section = el('kano-aure-culture');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'kano-aure-culture';
  section.innerHTML = `
    <h3 class="klc-section-title">AURE, RELATIONSHIPS & EVERYDAY KANO LIFE</h3>
    <p class="kac-note">Aure means marriage. Relationship paths bring different forms of support, duty, independence, pressure and change. No status is treated as a failure; choices and circumstances shape outcomes.</p>
    <div class="kac-grid">
      <div class="kac-card">
        <h4>Relationship & Aure profile</h4>
        <label for="kac-status">Current relationship status<select id="kac-status"></select></label>
        <label for="kac-partner">Partner's first name (private)<input id="kac-partner" maxlength="40" autocomplete="off" placeholder="Optional unless dating, engaged or married"></label>
        <label for="kac-privacy">Privacy setting<select id="kac-privacy"><option value="private">Keep relationship details private</option><option value="share">Allow details in local life-story summaries</option></select></label>
        <p class="kac-note" id="kac-status-note"></p>
        <div class="kac-actions"><button type="button" class="kac-primary" id="kac-save-relationship">SAVE RELATIONSHIP PROFILE</button></div>
      </div>
      <div class="kac-card">
        <h4>Social and relationship standing</h4>
        <div id="kac-meters"></div>
        <p class="kac-note">Age-related pressure is represented through occasional story events, not an automatic penalty. Friends, family, religion, privacy and personal choices affect how a moment feels.</p>
      </div>
    </div>
    <div class="kac-event" aria-live="polite"><p id="kac-event-kicker" class="kac-kicker">TODAY'S LIFE SITUATION</p><h4 id="kac-event-title">A life decision is waiting</h4><p id="kac-event-body">A situation will appear for the current in-game day.</p><div id="kac-event-choices" class="kac-choices"></div></div>
    <h4 class="klc-section-title">WOMEN KEKE DRIVERS AT THE PARK</h4>
    <p class="kac-note">These are persistent roleplay colleagues with different routes and strengths. The roster adds named social characters; it does not claim every entry has a unique 3D model.</p>
    <label for="kac-female-peer">Choose a woman driver to learn about<select id="kac-female-peer"></select></label>
    <div class="kac-card" id="kac-peer-detail"></div>
    <div class="kac-actions"><button type="button" id="kac-use-driver-name">USE THIS NAME FOR MY FEMALE LIFE PROFILE</button></div>
    <h4 class="klc-section-title">HAUSA FOOD & ROADSIDE STALLS</h4>
    <p class="kac-note">Game-balanced meal costs, not current market-price claims. Purchases use the existing wallet and are blocked during an active driving segment.</p>
    <div class="kac-grid" id="kac-meals"></div>
    <div id="kac-health-gate" class="kac-card">
      <h4>Private women's health & wellbeing</h4>
      <p class="kac-note">This optional roleplay tracker appears only when the active life profile is a woman. It is off by default and stores data only in this browser. It does not diagnose symptoms or prescribe treatments.</p>
      <label><span><input id="kac-health-enable" type="checkbox" style="width:20px;min-height:20px;vertical-align:middle;margin-right:6px"> Enable private simulated menstrual and wellbeing tracking</span></label>
      <div id="kac-health-details" hidden>
        <p id="kac-health-summary" class="kac-note"></p>
        <label for="kac-health-concern">Record a health concern<select id="kac-health-concern"><option value="none">No concern to record</option><option value="unusual_discharge_or_irritation">Unusual discharge or irritation</option><option value="urinary_discomfort">Urinary discomfort / possible infection</option><option value="possible_pregnancy">Possible pregnancy</option><option value="stress_or_mood">Stress or mood concern</option></select></label>
        <div class="kac-actions"><button type="button" id="kac-record-concern">RECORD CONCERN</button><button type="button" id="kac-seek-care">SEEK QUALIFIED HEALTH CARE · ₦120</button></div>
        <div class="kac-actions"><button type="button" id="kac-follow-treatment">RECORD FOLLOW-THROUGH ON CLINICIAN'S PLAN</button></div>
        <h4>Wellbeing & mood</h4><p class="kac-note">Mood changes vary from person to person; this tracker does not assume a cycle always causes mood swings.</p>
        <div class="kac-actions"><button type="button" data-kac-wellbeing="quiet_break">TAKE A QUIET BREAK</button><button type="button" data-kac-wellbeing="trusted_talk">TALK TO A TRUSTED PERSON</button><button type="button" data-kac-wellbeing="gentle_activity">CHOOSE A GENTLE ACTIVITY</button></div>
        <div id="kac-pregnancy-result-row" class="kac-actions" hidden><button type="button" data-kac-pregnancy="positive">Record positive test result</button><button type="button" data-kac-pregnancy="negative">Record negative test result</button></div>
        <div class="kac-actions"><button type="button" data-kac-prenatal="1">RECORD ANTENATAL VISIT · ₦100</button></div>
        <p class="kac-note">The cycle estimate is fictional and should not be used as a real menstrual calendar. Unusual discharge, irritation, urinary pain or pregnancy concerns should be discussed with a qualified health professional. The game does not recommend antibiotics or self-medication.</p>
      </div>
    </div>
    <div id="kac-cosmetics" class="kac-card" hidden><h4>Cosmetics & skin-care choices</h4><p class="kac-note">Appearance, confidence and spending are personal. The lightening-product option carries a simulated skin-wellness risk; effects are not a medical diagnosis.</p><div class="kac-grid" id="kac-cosmetic-options"></div></div>
    <p id="kac-notice" class="kac-notice" role="status" aria-live="polite"></p>
    <h4 class="klc-section-title">RECENT AURE & CULTURAL-LIFE LOG</h4><div id="kac-ledger" class="kac-ledger"></div>
    <p class="kac-note">Romance and intimacy events are non-graphic and apply only to consenting adults. This simulation does not sexualise children. Almajiri scenes portray pupils as children who may need food or community support. Health tracking is optional and private on this device.</p>
  `;
  const footer = panel.querySelector('#klc-close-bottom')?.parentElement;
  if (footer) panel.insertBefore(section, footer); else panel.append(section);
  fillOptions(); bindControls(section);
  return section;
}
function fillOptions() {
  const status = el('kac-status');
  if (status && !status.options.length) for (const item of RELATIONSHIP_STATUSES) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; status.append(option); }
  const peer = el('kac-female-peer');
  if (peer && !peer.options.length) for (const item of FEMALE_KEKE_DRIVERS) { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.name} · ${item.base}`; peer.append(option); }
  const meals = el('kac-meals');
  if (meals && !meals.childElementCount) for (const meal of CULTURAL_MEALS) {
    const card = document.createElement('div'); card.className = 'kac-card';
    const title = document.createElement('h4'); title.textContent = `${meal.name} · ${money(meal.cost)}`;
    const note = document.createElement('p'); note.className = 'kac-note'; note.textContent = meal.note;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.kacMeal = meal.id; button.textContent = 'BUY MEAL';
    card.append(title, note, button); meals.append(card);
  }
  const cosmetics = el('kac-cosmetic-options');
  if (cosmetics && !cosmetics.childElementCount) for (const product of COSMETIC_CHOICES) {
    const card = document.createElement('div'); card.className = 'kac-card';
    const title = document.createElement('h4'); title.textContent = `${product.name} · ${money(product.cost)}`;
    const note = document.createElement('p'); note.className = 'kac-note'; note.textContent = product.warning;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.kacCosmetic = product.id; button.textContent = product.cost ? 'CHOOSE / BUY' : 'SKIP PRODUCT';
    card.append(title, note, button); cosmetics.append(card);
  }
}
function currentProfile() { return context().profile || { name: 'Musa', gender: 'male', age: 22 }; }
function renderRoster() {
  const peerId = el('kac-female-peer')?.value || state.selectedDriverPeer;
  const peer = FEMALE_KEKE_DRIVERS.find(item => item.id === peerId) || FEMALE_KEKE_DRIVERS[0];
  const target = el('kac-peer-detail');
  if (target) {
    target.replaceChildren();
    const heading = document.createElement('h4'); heading.textContent = `${peer.name} — ${peer.base}`;
    const style = document.createElement('p'); style.className = 'kac-note'; style.textContent = `Working style: ${peer.style}. ${peer.detail}`;
    const line = document.createElement('p'); line.className = 'kac-note'; line.textContent = 'A colleague in the life simulation—not a guarantee of a separately rigged 3D model.';
    target.append(heading, style, line);
  }
  state.selectedDriverPeer = peer.id;
  saveState(state);
}
function renderScenario() {
  const { day, profile } = context();
  const event = buildDailyScenario({ day, profile, state });
  const kicker = el('kac-event-kicker'), title = el('kac-event-title'), body = el('kac-event-body'), choices = el('kac-event-choices');
  if (!kicker || !title || !body || !choices) return;
  choices.replaceChildren();
  if (!event) {
    kicker.textContent = `DAY ${day} · DECISION RECORDED`;
    title.textContent = 'Today’s situation has been resolved';
    body.textContent = 'One cultural-life situation is available per in-game day, so revisiting the panel cannot repeat its reward.';
    return;
  }
  kicker.textContent = `${event.kicker} · DAY ${day}`;
  title.textContent = event.title;
  body.textContent = event.body;
  for (const choice of event.choices) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.kacChoice = choice.id; button.textContent = choice.label;
    choices.append(button);
  }
}
function renderMeters() {
  const target = el('kac-meters'); if (!target) return;
  target.replaceChildren();
  const entries = [['Relationship trust', state.relationshipTrust], ['Family understanding', state.familyUnderstanding], ['Community respect', state.communityRespect], ['Personal wellbeing', state.wellbeing], ['Integrity / values', state.integrity], ['Aure readiness', state.aureReadiness], ['Social pressure', state.socialPressure]];
  for (const [name, value] of entries) {
    const label = document.createElement('div'); label.className = 'kac-note'; label.textContent = `${name}: ${Math.round(value)}/100`;
    const track = document.createElement('div'); track.className = 'kac-meter'; const fill = document.createElement('i'); fill.style.width = `${Math.round(value)}%`; track.append(fill); target.append(label, track);
  }
}
function renderHealth() {
  const { profile, day } = context();
  const isFemale = profile.gender === 'female';
  const gate = el('kac-health-gate'), details = el('kac-health-details'), toggle = el('kac-health-enable'), summary = el('kac-health-summary');
  if (!gate || !toggle || !details) return;
  gate.hidden = !isFemale;
  const cosmetics = el('kac-cosmetics'); if (cosmetics) cosmetics.hidden = !isFemale;
  if (!isFemale) return;
  toggle.checked = state.health.trackingEnabled;
  details.hidden = !state.health.trackingEnabled;
  if (summary) {
    const status = femaleHealthSummary(state, day, profile);
    const cycle = status.enabled ? `Simulated cycle day ${status.cycleDay}/${status.cycleLength}${status.flowWindow ? ' · estimated flow window' : ''}.` : 'Tracking is off.';
    const treatment = state.health.treatmentStatus === 'clinician_plan_pending' ? ' Clinician plan follow-through is pending.' : state.health.treatmentStatus === 'plan_followed' ? ' Clinician plan follow-through recorded.' : '';
    const preg = status.pregnancyStatus === 'possible' ? (status.pregnancyCheckDue ? ' A pregnancy test can be recorded now.' : ` Pregnancy test reminder in about ${status.daysToPregnancyCheck} in-game days.`) : status.pregnancyStatus === 'positive' ? ' Pregnancy recorded in the story; consider antenatal care.' : status.pregnancyStatus === 'negative' ? ' Latest recorded pregnancy test was negative.' : '';
    const reminder = status.daysToHealthReminder === 0 ? ' A private health follow-up reminder is due.' : status.daysToHealthReminder > 0 ? ` A private health follow-up reminder is in ${status.daysToHealthReminder} in-game days.` : '';
    summary.textContent = `${cycle}${preg}${reminder}${treatment} Concern: ${String(status.healthConcern || 'none').replaceAll('_', ' ')}. Mood ${Math.round(status.mood ?? 55)}/100 · skin wellness ${Math.round(status.skinWellness ?? 80)}/100 · confidence ${Math.round(status.confidence ?? 50)}/100 · qualified-care visits ${status.healthCareVisits ?? 0}.`;
  }
  const resultRow = el('kac-pregnancy-result-row'); if (resultRow) resultRow.hidden = !(state.health.trackingEnabled && state.health.pregnancyStatus === 'possible' && state.health.pregnancyCheckDueDay && day >= state.health.pregnancyCheckDueDay);
  const prenatal = gate.querySelector('[data-kac-prenatal]'); if (prenatal) prenatal.hidden = state.health.pregnancyStatus !== 'positive';
}
function renderLedger() {
  const target = el('kac-ledger'); if (!target) return;
  target.replaceChildren();
  if (!state.ledger.length) { const p = document.createElement('p'); p.className = 'kac-note'; p.textContent = 'Relationship, meal, health and social choices will appear here.'; target.append(p); return; }
  for (const row of state.ledger.slice(0, 8)) {
    const line = document.createElement('div');
    const day = row.day ? `Day ${row.day} · ` : '';
    const amt = Number(row.amount) < 0 ? ` · −${money(Math.abs(row.amount))}` : Number(row.amount) > 0 ? ` · +${money(row.amount)}` : '';
    line.textContent = `${day}${String(row.type || 'life event').replaceAll('_', ' ')}${amt} — ${safeText(row.text || '', 140)}`;
    target.append(line);
  }
}
function refreshPanel() {
  const section = ensureSection(); if (!section) return;
  const profile = currentProfile();
  const status = el('kac-status'), partner = el('kac-partner'), privacy = el('kac-privacy'), note = el('kac-status-note');
  if (status && status.value !== state.relationshipStatus) status.value = state.relationshipStatus;
  if (partner && partner.value !== state.partnerName) partner.value = state.partnerName;
  if (privacy) privacy.value = state.privacyMode ? 'private' : 'share';
  if (note) note.textContent = RELATIONSHIP_STATUSES.find(x => x.id === state.relationshipStatus)?.note || '';
  const nameUse = el('kac-use-driver-name'); if (nameUse) nameUse.textContent = profile.gender === 'female' ? 'USE SELECTED NAME FOR MY FEMALE LIFE PROFILE' : 'USE THIS NAME FOR A FEMALE LIFE PROFILE';
  renderMeters(); renderScenario(); renderRoster(); renderHealth(); renderLedger();
}
function applyProfileName() {
  const peer = FEMALE_KEKE_DRIVERS.find(item => item.id === (el('kac-female-peer')?.value || state.selectedDriverPeer)) || FEMALE_KEKE_DRIVERS[0];
  const nameInput = el('klc-name'), genderInput = el('klc-gender');
  if (!nameInput || !genderInput) { notify('Open LIFE & CAREER and save a profile first. The current screen does not expose the profile fields.', true); return; }
  nameInput.value = peer.name; genderInput.value = 'female'; genderInput.dispatchEvent(new Event('change', { bubbles: true }));
  notify(`Filled ${peer.name} into the female life profile. Press SAVE LIFE PROFILE in the profile section to apply it.`);
}
function bindControls(section) {
  if (section.dataset.bound === '1') return;
  section.dataset.bound = '1';
  section.querySelector('#kac-save-relationship')?.addEventListener('click', () => {
    const result = setRelationshipStatus(state, { status: el('kac-status')?.value, partnerName: el('kac-partner')?.value });
    if (!result.ok) { notify('Dating, engaged or married status needs a partner first name. You can leave it blank for other statuses.', true); return; }
    result.state.privacyMode = el('kac-privacy')?.value !== 'share';
    saveState(result.state); refreshPanel(); notify('Relationship status saved. It can be changed as the story evolves.');
  });
  section.querySelector('#kac-female-peer')?.addEventListener('change', renderRoster);
  section.querySelector('#kac-use-driver-name')?.addEventListener('click', applyProfileName);
  section.querySelector('#kac-event-choices')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-kac-choice]'); if (!button) return;
    const ctx = context();
    if (shiftActive() && button.dataset.kacChoice && ['buy_gurasa_water', 'trusted_support', 'meal_tuwo_kuka', 'meal_shinkafa_wake', 'meal_gurasa', 'fair_fare_help', 'cultural_curiosity'].includes(button.dataset.kacChoice)) {
      notify('Finish the current driving segment or stop safely before recording a wallet transaction.', true); return;
    }
    const scenario = buildDailyScenario({ day: ctx.day, profile: ctx.profile, state });
    if (!scenario) { notify('Today’s cultural-life choice has already been recorded.'); return; }
    const result = resolveDailyScenario({ rawState: state, day: ctx.day, profile: ctx.profile, scenarioId: scenario.id, choiceId: button.dataset.kacChoice, wallet: ctx.wallet });
    if (!result.ok) { notify(result.reason === 'insufficient_wallet' ? `You need ${money(result.required)} for that choice. No money was taken.` : 'That choice is no longer available. Refresh the panel.', true); return; }
    commitWalletAndCulture(result.state, result.wallet, result.message);
    window.dispatchEvent(new CustomEvent('kano:aure-cultural-choice', { detail: { day: ctx.day, scenarioId: result.scenario.id, choiceId: result.choice.id } }));
  });
  section.querySelector('#kac-meals')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-kac-meal]'); if (!button) return;
    if (shiftActive()) { notify('Stop safely or end the driving segment before buying food.', true); return; }
    const ctx = context(); const result = buyCulturalMeal(state, { mealId: button.dataset.kacMeal, day: ctx.day, wallet: ctx.wallet });
    if (!result.ok) { notify(result.reason === 'insufficient_wallet' ? `You need ${money(result.required)} for this meal.` : 'That meal is unavailable.', true); return; }
    commitWalletAndCulture(result.state, result.wallet, `Bought ${result.meal.name} for ${money(result.amount)}.`);
  });
  section.querySelector('#kac-health-enable')?.addEventListener('change', () => {
    const ctx = context(); const result = toggleHealthTracking(state, el('kac-health-enable').checked, ctx.profile, ctx.day);
    if (!result.ok) { notify('Select and save a female life profile before enabling private menstrual tracking.', true); refreshPanel(); return; }
    saveState(result.state); refreshPanel(); notify(result.state.health.trackingEnabled ? 'Private simulated health tracking enabled on this browser.' : 'Private health tracking paused. Existing local history is retained.');
  });
  section.querySelector('#kac-record-concern')?.addEventListener('click', () => {
    const ctx = context(); const result = recordHealthConcern(state, { concern: el('kac-health-concern')?.value, day: ctx.day, profile: ctx.profile });
    if (!result.ok) { notify('Enable private tracking on a female profile before recording a concern.', true); return; }
    saveState(result.state); refreshPanel(); notify('Recorded privately in the roleplay log. This is not a diagnosis.');
  });
  section.querySelector('#kac-seek-care')?.addEventListener('click', () => {
    if (shiftActive()) { notify('Stop safely or end the driving segment before recording a clinic visit.', true); return; }
    const ctx = context(); const result = seekQualifiedHealthCare(state, { day: ctx.day, wallet: ctx.wallet, cost: 120, profile: ctx.profile });
    if (!result.ok) { notify(result.reason === 'insufficient_wallet' ? `You need ${money(result.required)}; no money was taken.` : 'Record a concern first and enable private tracking.', true); return; }
    commitWalletAndCulture(result.state, result.wallet, result.message);
  });
  section.querySelector('#kac-pregnancy-result-row')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-kac-pregnancy]'); if (!button) return;
    const ctx = context(); const result = recordPregnancyTest(state, { result: button.dataset.kacPregnancy, day: ctx.day, profile: ctx.profile });
    if (!result.ok) { notify('The simulated pregnancy check is not due yet.', true); return; }
    saveState(result.state); refreshPanel(); notify(result.result === 'positive' ? 'Recorded. Arrange antenatal care with a qualified provider.' : 'Recorded. Follow the test instructions and seek qualified care if concerns remain.');
  });
  section.querySelector('#kac-follow-treatment')?.addEventListener('click', () => {
    const ctx = context(); const result = recordClinicianPlanFollowThrough(state, { day: ctx.day, profile: ctx.profile });
    if (!result.ok) { notify('Record a qualified-care visit first, with private tracking enabled.', true); return; }
    saveState(result.state); refreshPanel(); notify(result.message);
  });
  section.querySelector('#kac-health-details')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-kac-wellbeing]'); if (!button) return;
    const ctx = context(); const result = recordWellbeingAction(state, { action: button.dataset.kacWellbeing, day: ctx.day, profile: ctx.profile });
    if (!result.ok) { notify('Enable the private wellbeing tracker first.', true); return; }
    saveState(result.state); refreshPanel(); notify(result.message);
  });
  section.querySelector('[data-kac-prenatal]')?.addEventListener('click', () => {
    if (shiftActive()) { notify('Stop safely before recording an antenatal visit.', true); return; }
    const ctx = context(); const fee = 100;
    if (state.health.pregnancyStatus !== 'positive') { notify('Antenatal visit records are available after a positive test is recorded.', true); return; }
    if (ctx.wallet < fee) { notify(`You need ${money(fee)} for this visit.`, true); return; }
    const next = normalizeAureState(state); next.health.healthCareVisits += 1; next.wellbeing = Math.min(100, next.wellbeing + 2);
    next.ledger.unshift({ day: ctx.day, type: 'antenatal_visit', text: 'Recorded an antenatal-care visit. Follow qualified clinical advice.', amount: -fee });
    next.ledger = next.ledger.slice(0, 120); commitWalletAndCulture(next, ctx.wallet - fee, 'Antenatal visit recorded. Continue following qualified care.');
  });
  section.querySelector('#kac-cosmetics')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-kac-cosmetic]'); if (!button) return;
    if (shiftActive()) { notify('Stop safely before recording a personal-care purchase.', true); return; }
    const ctx = context(); const result = buyCosmeticOrSkinCare(state, { productId: button.dataset.kacCosmetic, day: ctx.day, wallet: ctx.wallet, profile: ctx.profile });
    if (!result.ok) { notify(result.reason === 'insufficient_wallet' ? `You need ${money(result.required)} for this choice.` : 'Personal-care choices are available on a female life profile.', true); return; }
    commitWalletAndCulture(result.state, result.wallet, result.message);
  });
}

function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  ensureStyles();
  if (UI?.prototype && !UI.prototype[HOOK]) {
    Object.defineProperty(UI.prototype, HOOK, { value: true });
    const originalBind = UI.prototype.bind;
    if (typeof originalBind === 'function') {
      UI.prototype.bind = function bindAureCulture(...args) {
        const result = originalBind.apply(this, args);
        activeUI = this; window.__KANO_ACTIVE_UI__ = this;
        queueMicrotask(() => { ensureSection(); refreshPanel(); });
        return result;
      };
    }
  }
  const ensureSoon = () => { ensureStyles(); fillOptions(); ensureSection(); refreshPanel(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureSoon, { once: true }); else ensureSoon();
  if (!el(SECTION_ID) && !observer && document.documentElement && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      if (!el(SECTION_ID) && document.querySelector('#kano-life-career-screen .klc-panel')) ensureSoon();
      if (el(SECTION_ID)) { observer?.disconnect(); observer = null; }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  for (const id of ['life-career-btn', 'life-career-menu-btn']) document.getElementById(id)?.addEventListener('click', () => queueMicrotask(ensureSoon));
  for (const type of ['kano:daily-day-change', 'kano:life-shift-settled', 'kano:day-settlement-closed', 'kano:fuel-market-updated', 'kano:driver-compliance-updated']) window.addEventListener(type, refreshPanel);
  window.kanoNorthernDriverAureAndCulture = {
    version: 1,
    snapshot: () => {
      const ctx = context();
      const safe = normalizeAureState(state); if (safe.privacyMode) safe.partnerName = ''; return { ...safe, profile: ctx.profile, day: ctx.day, healthSummary: femaleHealthSummary(state, ctx.day, ctx.profile) };
    },
    roster: () => FEMALE_KEKE_DRIVERS.map(item => ({ ...item })),
    meals: () => CULTURAL_MEALS.map(item => ({ ...item })),
    export: () => { const safe = normalizeAureState(state); if (safe.privacyMode) safe.partnerName = ''; return JSON.stringify({ ...safe, profile: context().profile }, null, 2); },
    refresh: refreshPanel,
  };
}
install();
console.info('[Kano Life] Aure, relationships and northern cultural-life simulation registered.');
