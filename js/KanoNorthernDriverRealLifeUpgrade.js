/** Integrates the persistent daily choices and social relationship simulation. */
import { UI } from './ui.js';
import { save, persist } from './storage.js';
import { KanoNorthernDriverRealLife } from './KanoNorthernDriverRealLife.js';

const PATCH = Symbol.for('kano.life.northernRealLifeUI.v1');
const social = new KanoNorthernDriverRealLife();
const MONEY = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const escapeText = value => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 180);
let activeUI = null;
let lastResultMessage = '';

function context() {
  const game = activeUI?.game || window.__KANO_ACTIVE_UI__?.game || null;
  const state = game?.s || {};
  const day = Math.max(1, Math.floor(Number(state.__kanoScheduleCurrentDay ?? state.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1) || 1));
  const rawMinutes = Number(state.gameClockMinutes ?? state.__kanoScheduleClockMinutes ?? save.lifestyle?.worldClockMinutes ?? 408);
  const minutes = ((Number.isFinite(rawMinutes) ? Math.floor(rawMinutes) : 408) % 1440 + 1440) % 1440;
  const profile = window.kanoNorthernDriverLifeSimulation?.snapshot?.().profile || {};
  return { day, minutes, profile };
}

function formatClock(minutes) {
  const hour24 = Math.floor(minutes / 60) % 24;
  return `${String(hour24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function ensureStyles() {
  if (document.getElementById('kano-real-life-style')) return;
  const style = document.createElement('style');
  style.id = 'kano-real-life-style';
  style.textContent = `
    #kano-real-life-section{margin-top:18px;padding-top:14px;border-top:1px solid #29465b;}
    #kano-real-life-section .klr-meters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 14px;}
    #kano-real-life-section .klr-meter{min-width:0;border:1px solid #29465b;background:#091723;border-radius:9px;padding:9px;}
    #kano-real-life-section .klr-meter small{display:block;color:#adc2d2;font-size:10px;font-weight:800;letter-spacing:.04em;overflow-wrap:anywhere;}
    #kano-real-life-section .klr-meter strong{display:block;margin-top:4px;font-size:16px;}
    #kano-real-life-section .klr-track{height:5px;margin-top:7px;background:#1d3445;border-radius:10px;overflow:hidden;}
    #kano-real-life-section .klr-track i{display:block;height:100%;width:50%;background:#00b4d8;}
    #kano-real-life-section .klr-routine-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:9px;align-items:end;}
    #kano-real-life-section label{display:flex;flex-direction:column;gap:5px;min-width:0;color:#dae8f2;font-size:12px;font-weight:750;}
    #kano-real-life-section select{box-sizing:border-box;width:100%;min-height:44px;border-radius:8px;border:1px solid #45677e;background:#0a1722;color:#f6fbff;padding:8px 10px;font:inherit;font-size:16px;}
    #kano-real-life-section .klr-event{margin-top:12px;padding:12px;border:1px solid #3b596d;border-radius:11px;background:linear-gradient(145deg,#0c1c2a,#112638);}
    #kano-real-life-section .klr-kicker{margin:0 0 5px;font-size:10px;font-weight:900;letter-spacing:.13em;color:#f3c861;}
    #kano-real-life-section .klr-event h4{margin:0 0 7px;font-size:17px;}
    #kano-real-life-section .klr-event p{margin:0;color:#c7d7e4;font-size:13px;line-height:1.5;}
    #kano-real-life-section .klr-choices{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
    #kano-real-life-section .klr-choices button,#kano-real-life-section .klr-routine-action{min-height:44px;max-width:100%;white-space:normal;text-align:left;border-radius:8px;padding:9px 11px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;background:#172d40;color:#f2f7fb;border:1px solid #3d6077;}
    #kano-real-life-section .klr-routine-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:9px;padding:10px;border:1px solid #29465b;border-radius:9px;background:#0a1723;}
    #kano-real-life-section .klr-routine-copy{flex:1 1 180px;color:#bacddb;font-size:12px;line-height:1.45;}
    #kano-real-life-section .klr-ledger{display:grid;gap:5px;margin-top:8px;}
    #kano-real-life-section .klr-ledger-row{font-size:11px;line-height:1.45;color:#b8cbd9;padding:7px 9px;background:#091723;border-radius:7px;overflow-wrap:anywhere;}
    #kano-real-life-section .klr-notice{min-height:18px;margin:8px 0 0;font-size:12px;color:#8fe1c5;}
    @media(max-width:520px){#kano-real-life-section .klr-meters{grid-template-columns:repeat(2,minmax(0,1fr));}#kano-real-life-section .klr-routine-grid{grid-template-columns:1fr;}#kano-real-life-section .klr-choices{display:grid;grid-template-columns:1fr;}#kano-real-life-section .klr-choices button{width:100%;}}
  `;
  document.head.append(style);
}

function ensureSection() {
  const panel = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!panel || document.getElementById('kano-real-life-section')) return;
  const section = document.createElement('section');
  section.id = 'kano-real-life-section';
  section.innerHTML = `
    <h3 class="klc-section-title">DAILY LIFE & SOCIAL REPUTATION</h3>
    <p class="klc-muted">Your choices shape trust at home, relationships at the park, passenger respect and your readiness for another shift.</p>
    <div class="klr-meters" aria-live="polite">
      <div class="klr-meter"><small>FAMILY TRUST</small><strong id="klr-family-value">58/100</strong><div class="klr-track"><i id="klr-family-bar"></i></div></div>
      <div class="klr-meter"><small>PARK STANDING</small><strong id="klr-park-value">52/100</strong><div class="klr-track"><i id="klr-park-bar"></i></div></div>
      <div class="klr-meter"><small>PASSENGER RESPECT</small><strong id="klr-passenger-value">50/100</strong><div class="klr-track"><i id="klr-passenger-bar"></i></div></div>
      <div class="klr-meter"><small>COMMUNITY TRUST</small><strong id="klr-community-value">48/100</strong><div class="klr-track"><i id="klr-community-bar"></i></div></div>
      <div class="klr-meter"><small>VEHICLE CARE</small><strong id="klr-care-value">60/100</strong><div class="klr-track"><i id="klr-care-bar"></i></div></div>
      <div class="klr-meter"><small>WELLBEING</small><strong id="klr-wellbeing-value">55/100</strong><div class="klr-track"><i id="klr-wellbeing-bar"></i></div></div>
    </div>
    <div class="klr-routine-grid">
      <label for="klr-routine-style">Daily routine prompts<select id="klr-routine-style"><option value="islamic_prayer">Islamic prayer-time prompts</option><option value="personal_breaks">Personal quiet-break reminders</option><option value="none">Turn routine prompts off</option></select></label>
      <div><p class="klc-muted" id="klr-routine-count">No routine choices recorded today.</p><button type="button" id="klr-record-routine" class="klr-routine-action">RECORD ROUTINE</button></div>
    </div>
    <div class="klr-routine-row"><div id="klr-routine-copy" class="klr-routine-copy" aria-live="polite">Routine prompt information appears here.</div></div>
    <div class="klr-event" aria-live="polite"><p id="klr-event-kicker" class="klr-kicker">TODAY'S SITUATION</p><h4 id="klr-event-title">A life decision is waiting</h4><p id="klr-event-body">Daily situations appear here.</p><div id="klr-event-choices" class="klr-choices"></div></div>
    <p class="klr-notice" id="klr-notice" role="status" aria-live="polite"></p>
    <h4 class="klc-section-title">RECENT SOCIAL CHOICES</h4><div class="klr-ledger" id="klr-ledger"><p class="klc-muted">Your choices will be recorded here.</p></div>
    <p class="klc-muted">Financial amounts are simplified game values, not claims about current local prices. Routine prompts are optional. Recording a routine does not force the world clock to jump while the game is paused.</p>
  `;
  const before = panel.querySelector('#klc-close-bottom')?.parentElement;
  if (before) panel.insertBefore(section, before);
  else panel.append(section);
}

function notify(text, error = false) {
  const target = document.getElementById('klr-notice');
  if (target) { target.textContent = String(text || ''); target.style.color = error ? '#ffb4aa' : '#8fe1c5'; }
  if (text) activeUI?.toast?.(String(text));
}

function appendChoiceButtons(event) {
  const target = document.getElementById('klr-event-choices');
  if (!target) return;
  target.replaceChildren();
  if (!event) return;
  for (const choice of event.choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.klrChoice = choice.id;
    button.textContent = escapeText(choice.label);
    target.append(button);
  }
}

function renderRoutine(day, minutes) {
  const styleSelect = document.getElementById('klr-routine-style');
  const copy = document.getElementById('klr-routine-copy');
  const count = document.getElementById('klr-routine-count');
  const button = document.getElementById('klr-record-routine');
  if (!styleSelect || !copy || !count || !button) return;
  styleSelect.value = social.state.routineStyle;
  const status = social.getRoutineStatus(day, minutes);
  count.textContent = `${status.recordedToday || 0} routine choice(s) recorded today · world time ${formatClock(minutes)}`;
  button.disabled = false;
  if (status.style === 'none') {
    copy.textContent = 'Routine prompts are off. You can turn them back on at any time.';
    button.disabled = true;
    button.textContent = 'ROUTINE PROMPTS OFF';
  } else if (status.available && status.current) {
    const actionText = status.style === 'islamic_prayer' ? `Record your ${status.current.label} routine (${status.current.display}).` : `Record a ${status.current.label.toLowerCase()} (${status.current.display}).`;
    copy.textContent = `${actionText} This records a life-simulation choice without forcing a clock jump while paused.`;
    button.textContent = status.style === 'islamic_prayer' ? `RECORD ${status.current.label.toUpperCase()}` : 'RECORD BREAK';
    button.disabled = false;
  } else if (status.alreadyRecorded) {
    copy.textContent = 'This routine window is already recorded for today. Keep the day moving at your own pace.';
    button.textContent = 'ALREADY RECORDED';
    button.disabled = true;
  } else if (status.next) {
    copy.textContent = `Next reminder: ${status.next.label}, ${status.next.display}. No routine is required to play or earn money.`;
    button.textContent = 'NOT IN A ROUTINE WINDOW';
    button.disabled = true;
  } else {
    copy.textContent = status.recordedToday >= status.totalToday ? 'All routine windows have been recorded for this day.' : 'No further routine window remains today. Any unrecorded window can be skipped; this does not affect your ability to play or earn.';
    button.textContent = status.recordedToday >= status.totalToday ? 'DAY ROUTINE COMPLETE' : 'NO MORE WINDOWS TODAY';
    button.disabled = true;
  }
}

function refreshSocialPanel() {
  if (typeof document === 'undefined') return null;
  ensureSection();
  const section = document.getElementById('kano-real-life-section');
  if (!section) return null;
  const { day, minutes, profile } = context();
  const snapshot = social.getSnapshot();
  const meters = snapshot.meters;
  const defs = [
    ['family', 'familyTrust'], ['park', 'parkStanding'], ['passenger', 'passengerRespect'],
    ['community', 'communityTrust'], ['care', 'vehicleCare'], ['wellbeing', 'wellbeing'],
  ];
  for (const [prefix, key] of defs) {
    const value = Math.round(meters[key]);
    const text = document.getElementById(`klr-${prefix}-value`);
    const bar = document.getElementById(`klr-${prefix}-bar`);
    if (text) text.textContent = `${value}/100`;
    if (bar) bar.style.width = `${value}%`;
  }
  renderRoutine(day, minutes);

  let event = social.getDailyEvent(day, minutes, profile);
  const alreadyResolved = social.state.resolvedEventDays.includes(day);
  const kicker = document.getElementById('klr-event-kicker');
  const title = document.getElementById('klr-event-title');
  const body = document.getElementById('klr-event-body');
  if (event) {
    if (kicker) kicker.textContent = `${event.kicker} · DAY ${day}`;
    if (title) title.textContent = event.title;
    if (body) body.textContent = event.body;
    appendChoiceButtons(event);
  } else if (alreadyResolved) {
    const last = social.state.ledger.slice().reverse().find(row => row.type === 'daily_choice' && row.details?.day === day);
    if (kicker) kicker.textContent = `DAY ${day} · DECISION RECORDED`;
    if (title) title.textContent = 'Today’s situation has been resolved';
    if (body) body.textContent = last?.details?.message || 'You have made a choice for today. More situations become available as the in-game day advances.';
    appendChoiceButtons(null);
  } else {
    if (kicker) kicker.textContent = `DAY ${day} · DAILY LIFE`;
    if (title) title.textContent = 'No situation available';
    if (body) body.textContent = lastResultMessage || 'Open this panel during your next in-game day for a new household, park, passenger or community situation.';
    appendChoiceButtons(null);
  }

  const ledger = document.getElementById('klr-ledger');
  if (ledger) {
    ledger.replaceChildren();
    const rows = snapshot.ledger;
    if (!rows.length) {
      const empty = document.createElement('p'); empty.className = 'klc-muted'; empty.textContent = 'Your choices will be recorded here.'; ledger.append(empty);
    } else {
      for (const row of rows.slice(0, 5)) {
        const line = document.createElement('div'); line.className = 'klr-ledger-row';
        const delta = Number(row.amount) > 0 ? ` · +${MONEY(row.amount)}` : Number(row.amount) < 0 ? ` · −${MONEY(Math.abs(row.amount))}` : '';
        const description = row.details?.message || row.details?.label || row.details?.style || row.type.replaceAll('_', ' ');
        line.textContent = `${String(row.type).replaceAll('_', ' ')}${delta} — ${String(description).slice(0, 140)}`;
        ledger.append(line);
      }
    }
  }
  return { day, minutes, snapshot, event };
}

function bindSection(ui) {
  activeUI = ui;
  ensureStyles();
  ensureSection();
  const section = document.getElementById('kano-real-life-section');
  if (!section || section.dataset.bound === '1') { refreshSocialPanel(); return; }
  section.dataset.bound = '1';
  const getContext = context;
  const styleSelect = section.querySelector('#klr-routine-style');
  styleSelect?.addEventListener('change', () => {
    const result = social.setRoutineStyle(styleSelect.value);
    if (!result.ok) { notify('That routine setting is not available.', true); return; }
    refreshSocialPanel();
    notify(result.routineStyle === 'none' ? 'Routine prompts are now off.' : 'Your daily routine preference has been saved.');
  });

  section.querySelector('#klr-record-routine')?.addEventListener('click', () => {
    const { day, minutes } = getContext();
    const result = social.recordRoutine({ day, minutes });
    if (!result.ok) {
      const reason = result.reason === 'outside_window' ? 'This is outside the scheduled routine window.'
        : result.reason === 'already_recorded' ? 'This routine has already been recorded today.'
          : result.reason === 'routine_prompts_disabled' ? 'Routine prompts are turned off.' : 'The routine could not be recorded.';
      notify(reason, true);
    } else {
      refreshSocialPanel();
      notify(`${result.slot.label} routine recorded in the life ledger.`);
      window.dispatchEvent(new CustomEvent('kano:life-routine-recorded', { detail: { day, slot: result.slot.id, style: social.state.routineStyle } }));
    }
  });

  section.querySelector('#klr-event-choices')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-klr-choice]');
    if (!button) return;
    const { day } = getContext();
    const result = social.resolveDailyEvent({ day, choiceId: button.dataset.klrChoice, wallet: save.money || 0 });
    if (!result.ok) {
      if (result.reason === 'insufficient_wallet') notify(`You need ${MONEY(result.required)} for that choice; the wallet has ${MONEY(save.money || 0)}. No money was taken.`, true);
      else notify('This situation has already changed. Refresh the panel before choosing.', true);
      return;
    }
    save.money = result.wallet;
    try { persist(); } catch (error) { console.warn('[Kano Life] Could not persist social choice wallet update.', error); }
    lastResultMessage = result.message;
    ui.refreshWallet?.();
    ui.__kanoLifeCareerRefresh?.();
    refreshSocialPanel();
    notify(`${result.message}${result.walletDelta > 0 ? ` Wallet +${MONEY(result.walletDelta)}.` : result.walletDelta < 0 ? ` Wallet −${MONEY(Math.abs(result.walletDelta))}.` : ''}`);
    window.dispatchEvent(new CustomEvent('kano:life-social-choice', { detail: { day, type: result.event.type, choiceId: result.choiceId, walletDelta: result.walletDelta } }));
  });

  for (const id of ['life-career-btn', 'life-career-menu-btn']) {
    document.getElementById(id)?.addEventListener('click', () => queueMicrotask(refreshSocialPanel));
  }
  window.addEventListener('kano:daily-day-change', refreshSocialPanel);
  window.addEventListener('kano:life-shift-settled', refreshSocialPanel);
  ui.__kanoRealLifeRefresh = refreshSocialPanel;
  refreshSocialPanel();
}

function install() {
  if (typeof document === 'undefined') return;
  ensureStyles();
  ensureSection();
  if (UI?.prototype && !UI.prototype[PATCH]) {
    Object.defineProperty(UI.prototype, PATCH, { value: true });
    const originalBind = UI.prototype.bind;
    if (typeof originalBind === 'function') {
      UI.prototype.bind = function bindNorthernRealLife(game, ...args) {
        const result = originalBind.call(this, game, ...args);
        bindSection(this);
        return result;
      };
    }
  }
  if (typeof window !== 'undefined') {
    window.kanoNorthernDriverRealLife = {
      version: 1,
      snapshot: () => social.getSnapshot(),
      getDailyEvent: () => { const ctx = context(); return social.getDailyEvent(ctx.day, ctx.minutes, ctx.profile); },
      setRoutineStyle: style => social.setRoutineStyle(style),
      recordRoutine: () => { const ctx = context(); const result = social.recordRoutine(ctx); refreshSocialPanel(); return result; },
      export: () => JSON.stringify(social.getSnapshot(), null, 2),
      refresh: refreshSocialPanel,
    };
    // Handle hosts where the UI was constructed before this optional module loaded.
    if (window.__KANO_ACTIVE_UI__) bindSection(window.__KANO_ACTIVE_UI__);
    document.addEventListener('DOMContentLoaded', () => {
      ensureStyles(); ensureSection();
      if (window.__KANO_ACTIVE_UI__) bindSection(window.__KANO_ACTIVE_UI__);
    }, { once: true });
  }
}

install();
console.info('[Kano Life] Persistent daily social-life simulation registered.');
