/**
 * Activates the persistent driver-life layer in Kano Life without replacing the
 * existing driving model, morning routine, wallet, day clock, or renderer.
 */
import { Game } from './game.js';
import { UI } from './ui.js';
import { save, persist } from './storage.js';
import { DRIVERS } from './config.js';
import { KanoNorthernDriverLifeSimulation } from './KanoNorthernDriverLifeSimulation.js';

const PATCH = Symbol.for('kano.life.northernDriverLifeSimulation.v1');
const safeText = (value, max = 60) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const formatNaira = (value) => `₦${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-NG')}`;
const money = (value) => Math.max(0, Math.round(Number(value) || 0));

const life = new KanoNorthernDriverLifeSimulation();
let injected = false;
let lastHudName = '';
let lastHudSummary = '';

function getWorldDay(game = null) {
  const state = game?.s || {};
  return Math.max(1, Math.floor(Number(
    state.__kanoScheduleCurrentDay ?? state.__kanoScheduleLastDay ?? save.lifestyle?.worldDayNumber ?? 1,
  ) || 1));
}

function getWorldMinutes(game = null) {
  const state = game?.s || {};
  const minute = Number(state.gameClockMinutes ?? state.__kanoScheduleClockMinutes ?? save.lifestyle?.worldClockMinutes ?? 408);
  return ((Number.isFinite(minute) ? Math.floor(minute) : 408) % 1440 + 1440) % 1440;
}

function formatClock(minutes) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function ensureStyle() {
  if (document.getElementById('kano-life-career-style')) return;
  const style = document.createElement('style');
  style.id = 'kano-life-career-style';
  style.textContent = `
    .kano-life-career-trigger{min-height:42px;}
    #kano-life-career-screen{position:absolute;inset:0;z-index:1800;box-sizing:border-box;overflow:auto;padding:clamp(8px,2.5vw,20px);display:flex;align-items:center;justify-content:center;background:rgba(4,12,22,.94);color:#edf5fa;}
    #kano-life-career-screen.hidden{display:none!important;}
    #kano-life-career-screen .klc-panel{width:min(100%,760px);max-height:100%;overflow:auto;box-sizing:border-box;background:linear-gradient(155deg,#14283a,#0b1724);border:1px solid #37546a;border-radius:16px;padding:clamp(14px,3vw,24px);box-shadow:0 18px 60px #0008;}
    #kano-life-career-screen .klc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;}
    #kano-life-career-screen .klc-eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;color:#68d4df;margin:0 0 5px;}
    #kano-life-career-screen h2{margin:0 0 6px;font-size:clamp(22px,4vw,32px);}
    #kano-life-career-screen p{line-height:1.45;color:#c8d8e5;}
    #kano-life-career-screen .klc-muted{font-size:12px;color:#a9bdcc;margin:4px 0 14px;}
    #kano-life-career-screen .klc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
    #kano-life-career-screen label{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:12px;font-weight:750;color:#dae8f2;}
    #kano-life-career-screen input,#kano-life-career-screen select{box-sizing:border-box;min-width:0;width:100%;min-height:44px;border-radius:8px;border:1px solid #45677e;background:#0a1722;color:#f6fbff;padding:8px 10px;font:inherit;font-size:16px;}
    #kano-life-career-screen .klc-card-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:14px 0;}
    #kano-life-career-screen .klc-stat{border:1px solid #29465b;background:#0a1723;border-radius:10px;padding:10px;min-width:0;}
    #kano-life-career-screen .klc-stat small{display:block;color:#a9bdcc;font-size:10px;font-weight:800;letter-spacing:.07em;}
    #kano-life-career-screen .klc-stat strong{display:block;margin-top:5px;font-size:clamp(14px,2.6vw,20px);overflow-wrap:anywhere;}
    #kano-life-career-screen .klc-section-title{font-size:13px;letter-spacing:.08em;color:#f3c861;margin:18px 0 8px;}
    #kano-life-career-screen .klc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
    #kano-life-career-screen .klc-actions button{min-height:44px;border-radius:8px;padding:9px 13px;font-weight:800;cursor:pointer;}
    #kano-life-career-screen .klc-primary{background:#00b4d8;color:#061724;border:0;}
    #kano-life-career-screen .klc-secondary{background:#172d40;color:#f2f7fb;border:1px solid #3d6077;}
    #kano-life-career-screen .klc-ledger{display:grid;gap:6px;margin-top:8px;}
    #kano-life-career-screen .klc-ledger-row{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;background:#0b1925;border:1px solid #263e50;border-radius:8px;font-size:12px;}
    #kano-life-career-screen .klc-ledger-row span{overflow-wrap:anywhere;}
    #kano-life-career-screen .klc-ledger-row b{white-space:nowrap;}
    #kano-life-career-screen .klc-notice{min-height:18px;font-size:12px;color:#8fe1c5;margin:8px 0 0;}
    #kano-life-career-screen .klc-savings-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;}
    @media(max-width:520px){#kano-life-career-screen .klc-grid{grid-template-columns:1fr;}#kano-life-career-screen .klc-card-grid{grid-template-columns:repeat(2,minmax(0,1fr));}#kano-life-career-screen .klc-panel{border-radius:12px;} }
  `;
  document.head.append(style);
}

function ensurePanel() {
  if (document.getElementById('kano-life-career-screen')) return;
  const container = document.getElementById('game-container') || document.body;
  const startExtras = document.querySelector('#start-screen .start-extra');
  if (startExtras && !document.getElementById('life-career-btn')) {
    const button = document.createElement('button');
    button.id = 'life-career-btn';
    button.className = 'secondary kano-life-career-trigger';
    button.type = 'button';
    button.textContent = 'LIFE & CAREER';
    startExtras.append(button);
  }
  const menuActions = document.querySelector('#menu-screen .menu-actions');
  if (menuActions && !document.getElementById('life-career-menu-btn')) {
    const button = document.createElement('button');
    button.id = 'life-career-menu-btn';
    button.type = 'button';
    button.textContent = 'LIFE & CAREER';
    menuActions.insertBefore(button, menuActions.firstChild);
  }

  const panel = document.createElement('section');
  panel.id = 'kano-life-career-screen';
  panel.className = 'screen hidden';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'klc-title');
  panel.innerHTML = `
    <div class="klc-panel">
      <header class="klc-head"><div><p class="klc-eyebrow">KANO LIFE · NORTHERN NIGERIA</p><h2 id="klc-title">Your driving life</h2><p class="klc-muted">A persistent career layer: household choices, daily hire, fuel, wear, savings and the cost of becoming a keke owner.</p></div><button id="klc-close-top" class="klc-secondary" type="button" aria-label="Close life and career panel">CLOSE</button></header>
      <div class="klc-card-grid" aria-live="polite">
        <div class="klc-stat"><small>WORLD DAY / TIME</small><strong id="klc-day">Day 1 · 06:48</strong></div>
        <div class="klc-stat"><small>AVAILABLE WALLET</small><strong id="klc-wallet">₦0</strong></div>
        <div class="klc-stat"><small>PERSONAL SAVINGS</small><strong id="klc-savings">₦0</strong></div>
        <div class="klc-stat"><small>UNPAID BILLS</small><strong id="klc-arrears">₦0</strong></div>
      </div>
      <form id="klc-profile-form">
        <h3 class="klc-section-title">DRIVER PROFILE</h3>
        <div class="klc-grid">
          <label for="klc-name">Name<input id="klc-name" name="name" maxlength="32" required autocomplete="name"></label>
          <label for="klc-gender">Character identity<select id="klc-gender" name="gender"><option value="male">Young man</option><option value="female">Young woman</option></select></label>
          <label for="klc-age">Age (18–35)<input id="klc-age" name="age" type="number" min="18" max="35" step="1" required></label>
          <label for="klc-residence">Living arrangement<select id="klc-residence" name="residence"><option value="family_compound">Family compound</option><option value="single_room">Single room</option><option value="shared_flat">Shared flat</option><option value="married_household">Married household</option></select></label>
          <label for="klc-household">Household responsibility<select id="klc-household" name="householdRole"><option value="independent">Mostly self-supporting</option><option value="contribute">Contributes to family</option><option value="provider">Primary household provider</option></select></label>
          <label for="klc-ownership">Keke arrangement<select id="klc-ownership" name="ownership"><option value="owned">Own keke</option><option value="daily_hire">Daily hire / park remittance</option><option value="hire_purchase">Hire-purchase towards ownership</option></select></label>
          <label for="klc-goal">Long-term goal<select id="klc-goal" name="goal"><option value="own_keke">Save for keke ownership — ₦90,000 target</option><option value="education">Training or further education — ₦25,000</option><option value="small_business">Start a small business — ₦45,000</option><option value="home_upgrade">Improve home or room — ₦60,000</option></select></label>
        </div>
        <p class="klc-muted">This profile changes the story identity and simulated obligations. The existing driver picker still controls the selected gameplay preset; gender selection here switches the default preset to Mama or RuffNeck.</p>
        <div class="klc-actions"><button class="klc-primary" type="submit">SAVE LIFE PROFILE</button></div>
      </form>
      <h3 class="klc-section-title">CAREER AND FINANCIAL POSITION</h3>
      <div class="klc-card-grid">
        <div class="klc-stat"><small>BANKED CAREER INCOME</small><strong id="klc-gross">₦0</strong></div>
        <div class="klc-stat"><small>PAID SIM COSTS</small><strong id="klc-costs">₦0</strong></div>
        <div class="klc-stat"><small>SHIFTS / PASSENGER DROPS</small><strong id="klc-shifts">0 / 0</strong></div>
        <div class="klc-stat"><small>VEHICLE BALANCE</small><strong id="klc-vehicle-balance">₦0</strong></div>
      </div>
      <div class="klc-savings-row">
        <label for="klc-deposit">Move wallet money into personal savings<input id="klc-deposit" type="number" inputmode="numeric" min="100" step="100" value="500"></label>
        <button id="klc-deposit-btn" class="klc-secondary" type="button">SAVE MONEY</button>
      </div>
      <div class="klc-muted" id="klc-goal-copy">Goal progress appears here.</div>
      <div class="klc-actions"><button id="klc-pay-arrears" class="klc-secondary" type="button">PAY OUTSTANDING BILLS</button><button id="klc-close-bottom" class="klc-secondary" type="button">RETURN</button></div>
      <p id="klc-notice" class="klc-notice" role="status" aria-live="polite"></p>
      <h3 class="klc-section-title">RECENT LIFE LEDGER</h3><div id="klc-ledger" class="klc-ledger"><p class="klc-muted">No recorded career transactions yet.</p></div>
      <p class="klc-muted">Operating costs are deliberately scaled for this game's fractional arcade wallet. Vehicle, fuel and household charges affect the existing banked wallet; this layer does not create a second spendable wallet.</p>
    </div>`;
  container.append(panel);
  ensureStyle();
}

function bindPanel(ui) {
  if (ui.__kanoLifeCareerBound) return;
  ui.__kanoLifeCareerBound = true;
  ensurePanel();
  const panel = document.getElementById('kano-life-career-screen');
  const byId = (id) => document.getElementById(id);
  let returnScreen = 'start-screen';

  const showNotice = (text, error = false) => {
    const target = byId('klc-notice');
    if (target) { target.textContent = text; target.style.color = error ? '#ffb4aa' : '#8fe1c5'; }
  };

  const fillForm = () => {
    const p = life.state.profile;
    byId('klc-name').value = p.name;
    byId('klc-gender').value = p.gender;
    byId('klc-age').value = String(p.age);
    byId('klc-residence').value = p.residence;
    byId('klc-household').value = p.householdRole;
    byId('klc-ownership').value = p.ownership;
    byId('klc-goal').value = p.goal;
  };

  const refreshPanel = () => {
    const snapshot = life.getSnapshot(save.money || 0);
    const game = ui.game;
    byId('klc-day').textContent = `Day ${getWorldDay(game)} · ${formatClock(getWorldMinutes(game))}`;
    byId('klc-wallet').textContent = formatNaira(snapshot.wallet);
    byId('klc-savings').textContent = formatNaira(snapshot.savings);
    byId('klc-arrears').textContent = formatNaira(snapshot.totalArrears);
    byId('klc-gross').textContent = formatNaira(snapshot.totals.gross);
    byId('klc-costs').textContent = formatNaira(snapshot.totals.paidExpenses);
    byId('klc-shifts').textContent = `${snapshot.totals.shifts} / ${snapshot.totals.trips}`;
    byId('klc-vehicle-balance').textContent = snapshot.profile.ownership === 'hire_purchase' ? formatNaira(snapshot.vehicleOutstanding) : snapshot.profile.ownership === 'daily_hire' ? 'Daily hire' : 'Owned';
    byId('klc-goal-copy').textContent = `Goal: ${({ own_keke: 'keke ownership', education: 'training or education', small_business: 'small business', home_upgrade: 'home improvement' })[snapshot.goal.id] || 'keke ownership'} · saved ${formatNaira(snapshot.goal.saved)} of ${formatNaira(snapshot.goal.target)} · ${formatNaira(snapshot.goal.remaining)} remaining.`;
    const ledger = byId('klc-ledger');
    ledger.replaceChildren();
    if (!snapshot.ledger.length) {
      const empty = document.createElement('p'); empty.className = 'klc-muted'; empty.textContent = 'No recorded career transactions yet.'; ledger.append(empty);
    } else {
      for (const entry of snapshot.ledger) {
        const row = document.createElement('div'); row.className = 'klc-ledger-row';
        const label = document.createElement('span'); label.textContent = String(entry.type || 'transaction').replaceAll('_', ' ');
        const value = document.createElement('b'); value.textContent = `${entry.amount > 0 ? '+' : ''}${formatNaira(Math.abs(entry.amount))}`; value.style.color = entry.amount < 0 ? '#ffceaa' : '#8fe1c5';
        row.append(label, value); ledger.append(row);
      }
    }
  };

  const openPanel = (from) => {
    returnScreen = from || 'start-screen';
    for (const id of ['start-screen', 'menu-screen', 'garage-screen', 'help-screen', 'over-screen', 'life-routine-screen']) ui.hide(id);
    panel.classList.remove('hidden');
    fillForm(); refreshPanel(); showNotice('Profile and ledger are saved in this browser.');
    byId('klc-close-top').focus({ preventScroll: true });
  };
  const closePanel = () => {
    panel.classList.add('hidden');
    ui.show(returnScreen);
    if (returnScreen === 'menu-screen' && ui.game?.state !== 'PLAY') ui.game.state = 'MENU';
    if (returnScreen === 'start-screen' && ui.game) ui.game.state = 'INTRO';
  };

  byId('life-career-btn')?.addEventListener('click', () => openPanel('start-screen'));
  byId('life-career-menu-btn')?.addEventListener('click', () => openPanel('menu-screen'));
  byId('klc-close-top').addEventListener('click', closePanel);
  byId('klc-close-bottom').addEventListener('click', closePanel);

  byId('klc-gender').addEventListener('change', (event) => {
    const nameInput = byId('klc-name');
    if (['Musa', 'Amina'].includes(nameInput.value.trim())) nameInput.value = event.target.value === 'female' ? 'Amina' : 'Musa';
  });

  byId('klc-profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = safeText(byId('klc-name').value, 32);
    const age = Number(byId('klc-age').value);
    if (!name || !Number.isInteger(age) || age < 18 || age > 35) {
      showNotice('Enter a name and an age from 18 to 35.', true); return;
    }
    const profile = life.updateProfile({
      name, gender: byId('klc-gender').value, age,
      residence: byId('klc-residence').value,
      householdRole: byId('klc-household').value,
      ownership: byId('klc-ownership').value,
      goal: byId('klc-goal').value,
    });
    // Select an already-unlocked matching gameplay preset; the player may still
    // change the Driver selector afterwards if they prefer another preset.
    save.driverId = profile.profile.gender === 'female' ? 'mama' : 'ruffneck';
    persist();
    ui.refreshDriverSelect?.();
    if (ui.game) {
      ui.game.driver = DRIVERS.find((driver) => driver.id === save.driverId) || ui.game.driver;
      if (ui.game.s) ui.game.s.capacity = Math.max(3, 5 + (ui.game.driver.capacityMod || 0));
    }
    lastHudName = '';
    refreshPanel(); showNotice(`Saved ${profile.profile.name}'s life profile. Career costs will apply only to Career and Free roam shifts.`);
  });

  byId('klc-deposit-btn').addEventListener('click', () => {
    const amount = Number(byId('klc-deposit').value);
    if (!Number.isFinite(amount) || amount < 100 || Math.floor(amount) !== amount) { showNotice('Savings deposit must be a whole amount of at least ₦100.', true); return; }
    const result = life.depositSavings(amount, save.money || 0);
    if (!result.ok) { showNotice(result.reason === 'insufficient_wallet' ? `Wallet balance is ${formatNaira(save.money)}.` : 'Minimum deposit is ₦100.', true); return; }
    save.money = result.wallet; persist(); ui.refreshWallet?.(); refreshPanel(); showNotice(`Moved ${formatNaira(result.amount)} into personal savings.`);
  });

  byId('klc-pay-arrears').addEventListener('click', () => {
    const result = life.payArrears(save.money || 0);
    if (!result.amount) { showNotice('No outstanding bills were paid. Wallet funds may be insufficient.'); return; }
    save.money = result.wallet; persist(); ui.refreshWallet?.(); refreshPanel();
    showNotice(`Paid ${formatNaira(result.amount)} toward outstanding bills.`);
  });

  ui.__kanoLifeCareerRefresh = refreshPanel;
  if (typeof window !== 'undefined') window.__KANO_ACTIVE_UI__ = ui;
  ui.__kanoLifeCareerOpen = openPanel;
  ui.__kanoLifeCareerClose = closePanel;
}

function installPrototypePatches() {
  if (Game?.prototype && !Game.prototype[PATCH]) {
    Object.defineProperty(Game.prototype, PATCH, { value: true });
    const originalStart = Game.prototype.start;
    if (typeof originalStart === 'function') {
      Game.prototype.start = function startWithNorthernDriverLife(mode, ...args) {
        const result = originalStart.call(this, mode, ...args);
        const actualMode = this.mode || mode || 'career';
        const day = getWorldDay(this);
        life.beginShift(this.s || {}, day, actualMode);
        if (this.s) this.s.kanoLifeProfile = { ...life.state.profile };
        return result;
      };
    }

    const originalFinish = Game.prototype.finishOrContinue;
    if (typeof originalFinish === 'function') {
      Game.prototype.finishOrContinue = function finishRunWithLifeLedger(reason, allowContinue, ...args) {
        const beforeTransaction = save.banking?.transactions?.[0]?.id || null;
        const beforeState = this.s;
        const mode = this.mode;
        const result = originalFinish.call(this, reason, allowContinue, ...args);
        const afterTransaction = save.banking?.transactions?.[0] || null;
        const isNewBank = Boolean(afterTransaction?.id && afterTransaction.id !== beforeTransaction);
        if (isNewBank && beforeState && ['career', 'freeRoam'].includes(mode)) {
          const settled = life.settleShift({
            earned: afterTransaction.earned,
            gameState: beforeState,
            wallet: save.money || 0,
            dayNumber: getWorldDay({ s: beforeState }),
            mode,
          });
          if (settled.ok) {
            save.money = settled.wallet;
            persist();
            this.ui?.refreshWallet?.();
            this.ui?.__kanoLifeCareerRefresh?.();
            const report = settled.report;
            this.ui?.toast?.(`LIFE LEDGER · banked ${formatNaira(report.gross)} · paid costs ${formatNaira(report.totalPaid)} · wallet ${formatNaira(settled.wallet)}${report.arrears.operating + report.arrears.vehicle + report.arrears.household ? ` · unpaid bills ${formatNaira(report.arrears.operating + report.arrears.vehicle + report.arrears.household)}` : ''}`);
          }
        }
        return result;
      };
    }
  }

  if (UI?.prototype && !UI.prototype[PATCH]) {
    Object.defineProperty(UI.prototype, PATCH, { value: true });
    const originalBind = UI.prototype.bind;
    if (typeof originalBind === 'function') {
      UI.prototype.bind = function bindWithNorthernDriverLife(game, ...args) {
        const result = originalBind.call(this, game, ...args);
        bindPanel(this);
        return result;
      };
    }

    const originalUpdate = UI.prototype.update;
    if (typeof originalUpdate === 'function') {
      UI.prototype.update = function updateWithLifeIdentity(state, route, driver, ...args) {
        const result = originalUpdate.call(this, state, route, driver, ...args);
        const target = this.el?.('driver-label');
        const profile = life.state.profile;
        if (target && profile.name && lastHudName !== profile.name) {
          target.textContent = profile.name.toUpperCase();
          lastHudName = profile.name;
        }
        return result;
      };
    }

    const originalRenderMorning = UI.prototype.renderMorningStage;
    if (typeof originalRenderMorning === 'function') {
      UI.prototype.renderMorningStage = function renderMorningStageForLifeIdentity(...args) {
        const result = originalRenderMorning.apply(this, args);
        const profile = life.state.profile;
        const copy = this.el?.('life-copy');
        const detail = this.el?.('life-detail');
        const title = this.el?.('life-title');
        if (profile.gender === 'female') {
          for (const element of [copy, detail, title]) if (element) element.textContent = element.textContent.replace(/\boga\b/gi, 'madam');
        }
        if (Number(this.morningStage) === 0 && title) title.textContent = `${profile.name}, morning has come in Kano.`;
        if (Number(this.morningStage) === 6 && detail && profile.gender === 'female') detail.textContent = detail.textContent.replace(/Mallam: “Ina kwana, madam\./i, 'MALLAM SECURITY: “Ina kwana, madam.');
        return result;
      };
    }

    const originalMeal = UI.prototype.buyMorningMeal;
    if (typeof originalMeal === 'function') {
      UI.prototype.buyMorningMeal = function buyMorningMealWithCareerLedger(food, cost, ...args) {
        const beforeMoney = money(save.money || 0);
        const result = originalMeal.call(this, food, cost, ...args);
        const paid = Math.max(0, beforeMoney - money(save.money || 0));
        if (paid > 0 && this.morning?.fed) {
          life.recordMeal({ amount: paid, food, day: getWorldDay(this.game) });
          this.__kanoLifeCareerRefresh?.();
        }
        return result;
      };
    }

    const originalStartPlay = UI.prototype.startPlay;
    if (typeof originalStartPlay === 'function') {
      UI.prototype.startPlay = function startPlayHidesLifeCareer(...args) {
        const result = originalStartPlay.apply(this, args);
        this.hide?.('kano-life-career-screen');
        return result;
      };
    }
  }
}

function install() {
  if (typeof document === 'undefined') return;
  ensurePanel();
  installPrototypePatches();
  if (typeof window !== 'undefined') {
    window.kanoNorthernDriverLifeSimulation = {
      version: 1,
      snapshot: () => life.getSnapshot(save.money || 0),
      export: () => JSON.stringify(life.getSnapshot(save.money || 0), null, 2),
      refresh: () => document.getElementById('kano-life-career-screen')?.classList.contains('hidden') ? null : window.__KANO_ACTIVE_UI__?.__kanoLifeCareerRefresh?.(),
      // Authoritative wallet transaction for roleplay services. Savings are not spendable here.
      chargeExpense: ({ amount: requested, category = 'maintenance', serviceId = '', description = 'Vehicle maintenance', day = 1 } = {}) => {
        const cost = money(requested);
        if (!cost || category !== 'maintenance' || !['tyres', 'engine', 'condition', 'full'].includes(String(serviceId))) {
          return { ok: false, reason: 'invalid_maintenance_transaction', wallet: money(save.money || 0) };
        }
        if (life.state.activeShift) return { ok: false, reason: 'shift_active', wallet: money(save.money || 0) };
        const wallet = money(save.money || 0);
        if (cost > wallet) return { ok: false, reason: 'insufficient_wallet', wallet, required: cost };
        save.money = wallet - cost;
        life.state.totals.paidExpenses = money(life.state.totals.paidExpenses + cost);
        life.state.totals.maintenance = money(life.state.totals.maintenance + cost);
        life._record('vehicle_service', -cost, {
          category: 'maintenance', serviceId: String(serviceId), description: safeText(description, 100),
          day: Math.max(1, Math.floor(Number(day) || 1)), paid: cost, walletAfter: save.money,
        });
        life.save();
        persist();
        const ui = window.__KANO_ACTIVE_UI__;
        ui?.refreshWallet?.();
        ui?.__kanoLifeCareerRefresh?.();
        const detail = { amount: cost, wallet: save.money, category: 'maintenance', serviceId: String(serviceId), day: Math.max(1, Math.floor(Number(day) || 1)) };
        window.dispatchEvent(new CustomEvent('kano:life-maintenance-expense', { detail }));
        return { ok: true, amount: cost, wallet: save.money, transaction: detail };
      },
      // Vehicle Maintenance applies stored game condition after Game.start(); update the
      // already-created shift baseline so ordinary settlement only charges actual wear.
      syncActiveShiftStart: (gameState = {}) => {
        const active = life.state.activeShift;
        if (!active || !gameState || typeof gameState !== 'object') return false;
        for (const key of ['fuel', 'condition', 'engine', 'tyres']) {
          if (Number.isFinite(Number(gameState[key]))) active[key] = clamp(gameState[key], 0, 100);
        }
        for (const key of ['distance', 'drops', 'collisions']) {
          if (Number.isFinite(Number(gameState[key]))) active[key] = Math.max(0, Number(gameState[key]));
        }
        life.save();
        return true;
      },
    };
    window.addEventListener('kano:daily-day-change', () => {
      window.__KANO_ACTIVE_UI__?.__kanoLifeCareerRefresh?.();
    });
  }
  const originalBind = UI.prototype.bind;
  if (originalBind && !document.getElementById('life-career-btn')) {
    // This can occur in a custom host page with a changed title-card layout.
    const target = document.querySelector('#start-screen .start-extra');
    if (target) {
      const button = document.createElement('button'); button.id = 'life-career-btn'; button.type = 'button'; button.textContent = 'LIFE & CAREER'; button.className = 'secondary kano-life-career-trigger'; target.append(button);
    }
  }
}

install();
console.info('[Kano Life] Northern driver life-simulation and career ledger registered.');
