/** Connects the park-life ledger to Career/Free roam shifts and actual passenger events. */
import { Game } from './game.js';
import { UI } from './ui.js';
import { save, persist } from './storage.js';
import { ROUTES } from './config.js';
import { KanoNorthernDriverParkOperations, KANO_PARK_STANDS, KANO_PARK_WORK_STYLES, KANO_PARK_DAILY_TOKEN } from './KanoNorthernDriverParkOperations.js';

const PATCH = Symbol.for('kano.life.northernDriverParkOperations.v1');
const operations = new KanoNorthernDriverParkOperations();
let activeUI = null;
let lastNotice = '';
const MONEY = value => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;

function context() {
  const ui = activeUI || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_UI__ : null);
  const game = ui?.game || null;
  const state = game?.s || {};
  const day = Math.max(1, Math.floor(Number(state.__kanoScheduleCurrentDay ?? state.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1) || 1));
  const raw = Number(state.gameClockMinutes ?? state.__kanoScheduleClockMinutes ?? save.lifestyle?.worldClockMinutes ?? 408);
  const minute = ((Number.isFinite(raw) ? Math.floor(raw) : 408) % 1440 + 1440) % 1440;
  return { ui, game, state, day, minute };
}

function notify(message, isError = false) {
  lastNotice = String(message || '');
  const node = document.getElementById('kpo-notice');
  if (node) {
    node.textContent = lastNotice;
    node.dataset.state = isError ? 'error' : 'success';
  }
  const ui = context().ui;
  if (message && typeof ui?.toast === 'function') ui.toast(message);
}

function emitUpdate(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kano:park-operations-updated', { detail: { ...detail, snapshot: operations.getSnapshot(context().day) } }));
}

function standById(id) { return KANO_PARK_STANDS.find(stand => stand.id === id) || KANO_PARK_STANDS[0]; }
function styleById(id) { return KANO_PARK_WORK_STYLES.find(style => style.id === id) || KANO_PARK_WORK_STYLES[0]; }

function ensureStyles() {
  if (document.getElementById('kano-park-operations-style')) return;
  const style = document.createElement('style');
  style.id = 'kano-park-operations-style';
  style.textContent = `
    #kano-park-operations-panel{margin-top:18px;padding-top:14px;border-top:1px solid #29465b;min-width:0}
    #kano-park-operations-panel .kpo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:10px 0}
    #kano-park-operations-panel label{display:flex;flex-direction:column;gap:5px;min-width:0;color:#dae8f2;font-size:12px;font-weight:750}
    #kano-park-operations-panel select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border-radius:8px;border:1px solid #45677e;background:#0a1722;color:#f6fbff;padding:8px 10px;font:inherit;font-size:16px}
    #kano-park-operations-panel .kpo-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    #kano-park-operations-panel .kpo-actions button{min-height:44px;max-width:100%;border-radius:8px;padding:9px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;white-space:normal;text-align:left;background:#172d40;color:#f2f7fb;border:1px solid #3d6077}
    #kano-park-operations-panel .kpo-actions .kpo-primary{background:#00b4d8;color:#061724;border:0}
    #kano-park-operations-panel .kpo-stand-note{border-left:3px solid #d7ad47;padding:7px 10px;margin:8px 0;background:#0a1723;color:#b8cad7;font-size:12px;line-height:1.45}
    #kano-park-operations-panel .kpo-status{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:9px 10px;background:#0a1723;border:1px solid #29465b;border-radius:9px;margin:8px 0;font-size:12px}
    #kano-park-operations-panel .kpo-status span{color:#a9bdcc}
    #kano-park-operations-panel .kpo-status strong{text-align:right;overflow-wrap:anywhere}
    #kano-park-operations-panel .kpo-history{display:grid;gap:6px;margin-top:8px}
    #kano-park-operations-panel .kpo-history-row{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;background:#0b1925;border:1px solid #263e50;border-radius:8px;font-size:12px;min-width:0}
    #kano-park-operations-panel .kpo-history-row span{min-width:0;overflow-wrap:anywhere;color:#d8e5ee}
    #kano-park-operations-panel .kpo-history-row b{font-size:11px;text-align:right;color:#a9bdcc;flex:0 0 auto}
    #kano-park-operations-panel #kpo-notice{min-height:18px;font-size:12px;color:#8fe1c5;margin:8px 0 0}
    #kano-park-operations-panel #kpo-notice[data-state="error"]{color:#ffb4aa}
    @media(max-width:520px){#kano-park-operations-panel .kpo-grid{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function ensurePanel() {
  const panel = document.querySelector('#kano-life-career-screen .klc-panel');
  if (!panel) return null;
  let section = document.getElementById('kano-park-operations-panel');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'kano-park-operations-panel';
  section.setAttribute('aria-labelledby', 'kpo-title');
  section.innerHTML = `
    <h3 class="klc-section-title" id="kpo-title">KEKE PARK & DAILY DISPATCH</h3>
    <p class="klc-muted">Choose a Kano operating base and how you load passengers. Workdays, successful boardings, completed trips and service-based park standing are recorded from play. The optional daily queue token is a balance-tuned game value, not a statement of real park tariffs.</p>
    <div class="kpo-grid">
      <label for="kpo-stand">Preferred operating stand<select id="kpo-stand"></select></label>
      <label for="kpo-style">Work style<select id="kpo-style"></select></label>
    </div>
    <div id="kpo-stand-note" class="kpo-stand-note">Stand details appear here.</div>
    <div class="kpo-actions">
      <button class="kpo-primary" id="kpo-save-plan" type="button">SAVE WORK PLAN</button>
      <button id="kpo-use-route" type="button">USE STAND FOR NEXT START</button>
      <button id="kpo-start-day" type="button">JOIN TODAY'S DUTY</button>
      <button id="kpo-pay-token" type="button">PAY DAILY PARK TOKEN</button>
    </div>
    <div class="klc-card-grid">
      <div class="klc-stat"><small>PARK STANDING</small><strong id="kpo-standing">50/100</strong></div>
      <div class="klc-stat"><small>TODAY'S BOARDINGS</small><strong id="kpo-boardings">0</strong></div>
      <div class="klc-stat"><small>COMPLETED TRIPS</small><strong id="kpo-trips">0</strong></div>
      <div class="klc-stat"><small>SAFE TRIPS</small><strong id="kpo-safe">0</strong></div>
    </div>
    <div class="kpo-status"><span>Today's work status</span><strong id="kpo-duty-status">Not on duty</strong></div>
    <div class="kpo-status"><span>Queue / token</span><strong id="kpo-queue-status">Not joined</strong></div>
    <div class="kpo-status"><span>Actual fare total recorded</span><strong id="kpo-fares">₦0</strong></div>
    <p class="klc-muted" id="kpo-notice" role="status" aria-live="polite"></p>
    <h4 class="klc-section-title">RECENT PARK & WORK RECORDS</h4>
    <div id="kpo-history" class="kpo-history"><p class="klc-muted">Work records appear after you choose a plan or drive a shift.</p></div>`;
  const before = panel.querySelector('#kano-passenger-relationships-panel');
  if (before) panel.insertBefore(section, before); else panel.append(section);

  const standSelect = section.querySelector('#kpo-stand');
  for (const stand of KANO_PARK_STANDS) {
    const option = document.createElement('option'); option.value = stand.id; option.textContent = stand.label; standSelect.append(option);
  }
  const styleSelect = section.querySelector('#kpo-style');
  for (const style of KANO_PARK_WORK_STYLES) {
    const option = document.createElement('option'); option.value = style.id; option.textContent = style.label; styleSelect.append(option);
  }
  ensureStyles();
  bindPanel(section);
  return section;
}

function bindPanel(section) {
  if (section.dataset.bound === '1') return;
  section.dataset.bound = '1';
  section.querySelector('#kpo-stand')?.addEventListener('change', () => { section.dataset.planDirty = '1'; updateStandNote(); });
  section.querySelector('#kpo-style')?.addEventListener('change', () => { section.dataset.planDirty = '1'; updateStandNote(); });
  section.querySelector('#kpo-save-plan')?.addEventListener('click', () => {
    const result = operations.setWorkPlan({ standId: section.querySelector('#kpo-stand').value, workStyle: section.querySelector('#kpo-style').value });
    if (!result.ok) { notify('Select a valid stand and work style.', true); return; }
    section.dataset.planDirty = '0';
    notify(`Work plan saved: ${standById(result.plan.standId).label} · ${styleById(result.plan.workStyle).label}.`);
    emitUpdate({ type: 'work_plan_saved' });
    refreshPanel();
  });
  section.querySelector('#kpo-use-route')?.addEventListener('click', () => {
    const standId = section.querySelector('#kpo-stand').value;
    const workStyle = section.querySelector('#kpo-style').value;
    const result = operations.setWorkPlan({ standId, workStyle });
    if (!result.ok) { notify('Select a valid stand and work style first.', true); return; }
    section.dataset.planDirty = '0';
    const stand = standById(standId);
    const route = ROUTES.find(item => item.name.toLocaleLowerCase('en-US') === stand.routeName.toLocaleLowerCase('en-US'));
    if (!route) { notify('This stand does not match a route in the current game catalogue.', true); return; }
    save.routeId = route.id;
    try { persist(); } catch (error) { console.warn('[Kano Park Operations] Could not persist the preferred route.', error); }
    const routeSelect = document.getElementById('route-select');
    if (routeSelect) routeSelect.value = route.id;
    notify(`${stand.label} is saved as the next start route. It will not teleport an active run.`);
    emitUpdate({ type: 'next_route_selected', routeId: route.id, standId });
    refreshPanel();
  });
  section.querySelector('#kpo-start-day')?.addEventListener('click', () => {
    if (section.dataset.planDirty === '1') {
      const planResult = operations.setWorkPlan({ standId: section.querySelector('#kpo-stand').value, workStyle: section.querySelector('#kpo-style').value });
      if (!planResult.ok) { notify('Select a valid stand and work style.', true); return; }
      section.dataset.planDirty = '0';
    }
    const { day, minute } = context();
    const result = operations.startWorkday({ day, minute });
    if (!result.ok) {
      notify(result.reason === 'already_on_duty' ? "Today's workday is already active." : 'Could not join today’s work plan.', result.reason !== 'already_on_duty');
    } else {
      const stand = standById(result.day.standId);
      notify(result.day.workStyle === 'official_queue'
        ? `Joined the ${stand.label} queue. Simulated opening position: ${result.day.queuePosition}.`
        : `Today's ${styleById(result.day.workStyle).label.toLowerCase()} plan is active.`);
      emitUpdate({ type: 'workday_started', day, standId: result.day.standId });
    }
    refreshPanel();
  });
  section.querySelector('#kpo-pay-token')?.addEventListener('click', () => {
    if (section.dataset.planDirty === '1') {
      const planResult = operations.setWorkPlan({ standId: section.querySelector('#kpo-stand').value, workStyle: section.querySelector('#kpo-style').value });
      if (!planResult.ok) { notify('Select a valid stand and work style.', true); return; }
      section.dataset.planDirty = '0';
    }
    const { day, ui } = context();
    const result = operations.payDailyToken({ day, wallet: save.money || 0 });
    if (!result.ok) {
      const messages = {
        not_on_duty: "Join today's work plan before paying a park token.",
        token_not_required: 'This work style does not require an organised-queue token.',
        already_paid: "Today's park token has already been paid.",
        insufficient_wallet: `Insufficient banked wallet. The game token costs ${MONEY(result.required)}; wallet balance is ${MONEY(result.wallet)}.`,
      };
      notify(messages[result.reason] || 'The park token was not paid.', true);
      return;
    }
    save.money = result.wallet;
    try { persist(); } catch (error) { console.warn('[Kano Park Operations] Could not persist wallet update.', error); }
    ui?.refreshWallet?.();
    ui?.__kanoLifeCareerRefresh?.();
    notify(`Daily park token paid: ${MONEY(result.amount)}. No second charge will be taken today.`);
    emitUpdate({ type: 'park_token_paid', day, amount: result.amount });
    refreshPanel();
  });
}

function updateStandNote() {
  const section = document.getElementById('kano-park-operations-panel');
  if (!section) return;
  const stand = standById(section.querySelector('#kpo-stand')?.value);
  const style = styleById(section.querySelector('#kpo-style')?.value);
  const note = section.querySelector('#kpo-stand-note');
  if (note) note.textContent = `${stand.note} ${style.description}`;
}

function refreshPanel() {
  const section = ensurePanel();
  if (!section) return null;
  const { day } = context();
  const snapshot = operations.getSnapshot(day);
  const today = snapshot.today;
  if (section.dataset.planDirty !== '1') {
    section.querySelector('#kpo-stand').value = snapshot.plan.standId;
    section.querySelector('#kpo-style').value = snapshot.plan.workStyle;
  }
  updateStandNote();
  const text = (id, value) => { const node = section.querySelector(`#${id}`); if (node) node.textContent = String(value); };
  text('kpo-standing', `${snapshot.standing}/100`);
  text('kpo-boardings', today.boardings);
  text('kpo-trips', today.completedTrips);
  text('kpo-safe', today.safeTrips);
  text('kpo-duty-status', today.onDuty ? `On duty · Day ${today.day}` : 'Not on duty');
  let queueLabel = 'Not joined';
  if (today.workStyle === 'official_queue' && today.onDuty) {
    const queueState = today.dispatched ? 'Dispatched from queue' : today.queuePosition != null ? `Opening queue position ${today.queuePosition}` : 'Queue duty active';
    const tokenState = today.tokenPaid ? `token paid ${MONEY(today.tokenAmount)}` : 'token unpaid';
    queueLabel = `${queueState} · ${tokenState}`;
  } else if (today.workStyle === 'roadside_loading' && today.onDuty) queueLabel = 'Roadside loading · no token required';
  else if (today.workStyle === 'independent_roaming' && today.onDuty) queueLabel = 'Independent roaming · no queue token';
  text('kpo-queue-status', queueLabel);
  text('kpo-fares', MONEY(today.grossFares));
  const notice = section.querySelector('#kpo-notice');
  if (notice && lastNotice) notice.textContent = lastNotice;
  const history = section.querySelector('#kpo-history');
  if (history) {
    history.replaceChildren();
    const rows = snapshot.ledger.slice(0, 6);
    if (!rows.length) {
      const empty = document.createElement('p'); empty.className = 'klc-muted'; empty.textContent = 'Work records appear after you choose a plan or drive a shift.'; history.append(empty);
    } else {
      for (const row of rows) {
        const line = document.createElement('div'); line.className = 'kpo-history-row';
        const label = document.createElement('span');
        const name = row.details?.stand || row.details?.routeName || row.details?.name || row.details?.destination || '';
        label.textContent = `Day ${row.details?.day ?? day} · ${row.type.replaceAll('_', ' ')}${name ? ` · ${name}` : ''}`;
        const amount = document.createElement('b');
        if (row.type === 'park_token_paid') amount.textContent = `−${MONEY(Math.abs(row.amount))}`;
        else if (row.type === 'passenger_trip_completed') amount.textContent = `${row.details?.safeTrip ? 'Safe' : 'Rough'} · ${row.details?.matched ? 'matched' : 'unmatched'}`;
        else amount.textContent = row.details?.queuePosition ? `Queue #${row.details.queuePosition}` : 'Recorded';
        line.append(label, amount); history.append(line);
      }
    }
  }
  return snapshot;
}

function getDayMinute(game) {
  const state = game?.s || {};
  const day = Math.max(1, Math.floor(Number(state.__kanoScheduleCurrentDay ?? state.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1) || 1));
  const raw = Number(state.gameClockMinutes ?? state.__kanoScheduleClockMinutes ?? save.lifestyle?.worldClockMinutes ?? 408);
  const minute = ((Number.isFinite(raw) ? Math.floor(raw) : 408) % 1440 + 1440) % 1440;
  return { day, minute };
}

function installGameHooks() {
  if (!Game?.prototype || Game.prototype[PATCH]) return;
  Object.defineProperty(Game.prototype, PATCH, { value: true });
  const originalStart = Game.prototype.start;
  if (typeof originalStart === 'function') {
    Game.prototype.start = function startWithKekeParkOperations(mode, ...args) {
      const result = originalStart.call(this, mode, ...args);
      const actualMode = this.mode || mode || 'career';
      if (['career', 'freeRoam'].includes(actualMode)) {
        const { day, minute } = getDayMinute(this);
        const runId = Number(this.s?.runStartedAt) || Date.now();
        const shift = operations.startShift({ day, minute, runId: `${actualMode}-${runId}`, routeName: this.route?.name || '', mode: actualMode });
        if (shift.ok) {
          emitUpdate({ type: 'shift_started', day, runId, routeName: this.route?.name || '' });
          refreshPanel();
        }
      }
      return result;
    };
  }
}

function installUiHooks() {
  if (!UI?.prototype) return;
  const symbol = Symbol.for('kano.life.northernDriverParkOperations.ui.v1');
  if (UI.prototype[symbol]) return;
  Object.defineProperty(UI.prototype, symbol, { value: true });
  const originalBind = UI.prototype.bind;
  if (typeof originalBind === 'function') {
    UI.prototype.bind = function bindKekeParkOperations(game, ...args) {
      const result = originalBind.call(this, game, ...args);
      activeUI = this;
      ensurePanel();
      refreshPanel();
      return result;
    };
  }
}

function onRelationshipUpdate(event) {
  const detail = event?.detail || {};
  const current = context();
  const game = current.game;
  if (!game || !['career', 'freeRoam'].includes(game.mode)) return;
  if (detail.type === 'boarding') {
    const result = operations.recordBoarding({ day: current.day, name: detail.name || '', returning: Boolean(detail.returning) });
    emitUpdate({ type: 'boarding_recorded', day: current.day, dispatchedNow: result.dispatchedNow });
    refreshPanel();
    return;
  }
  if (detail.type === 'trip_completed' && detail.trip) {
    const trip = detail.trip;
    const result = operations.recordTrip({
      tripId: trip.id,
      day: trip.day || current.day,
      matched: trip.matched,
      safeTrip: trip.safeTrip,
      fareEarned: trip.fareEarned,
      distance: trip.distance,
      destination: trip.destination,
      returning: trip.returning,
      name: trip.name,
    });
    if (result.ok) emitUpdate({ type: 'trip_recorded', day: trip.day || current.day, tripId: trip.id, standingDelta: result.standingDelta });
    refreshPanel();
  }
}

function install() {
  if (typeof document === 'undefined') return;
  ensurePanel();
  installGameHooks();
  installUiHooks();
  if (typeof window !== 'undefined') {
    window.kanoNorthernDriverParkOperations = {
      version: 1,
      snapshot: () => operations.getSnapshot(context().day),
      setWorkPlan: plan => { const result = operations.setWorkPlan(plan); refreshPanel(); return result; },
      startWorkday: () => { const { day, minute } = context(); const result = operations.startWorkday({ day, minute }); refreshPanel(); return result; },
      payDailyToken: () => { const { day } = context(); const result = operations.payDailyToken({ day, wallet: save.money || 0 }); if (result.ok) { save.money = result.wallet; persist(); context().ui?.refreshWallet?.(); } refreshPanel(); return result; },
      exportReport: () => operations.exportReport(context().day),
      refresh: refreshPanel,
    };
    window.addEventListener('kano:passenger-relationship-updated', onRelationshipUpdate);
    window.addEventListener('kano:daily-day-change', refreshPanel);
    window.addEventListener('kano:life-shift-settled', refreshPanel);
    window.addEventListener('kano:park-operations-updated', refreshPanel);
    for (const id of ['life-career-btn', 'life-career-menu-btn']) document.getElementById(id)?.addEventListener('click', () => queueMicrotask(refreshPanel));
    if (window.__KANO_ACTIVE_UI__) { activeUI = window.__KANO_ACTIVE_UI__; ensurePanel(); refreshPanel(); }
  }
}

install();
console.info('[Kano Life] Keke park operations and passenger dispatch ledger registered.');
export { operations as kanoNorthernDriverParkOperationsService };
