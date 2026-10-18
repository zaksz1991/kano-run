import { ROUTES, DRIVERS, RADIO, MODES, DIALECT, PAINTS, DAILY_MISSION_POOL } from './config.js';
import { save, persist, tribeStanding, dailyLoginStatus, claimDaily, getDailyMissions, claimDailyMission } from './storage.js';
import { selectDriver, purchaseDriver, selectPaint, purchasePaint } from './progression.js';

export class UI {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.screens = ['start-screen', 'menu-screen', 'over-screen', 'help-screen', 'garage-screen'];
    this.toastTimer = 0;
    this.bound = false;
    this.initSelects();
    this.refreshWallet();
    this.refreshDailyLogin();
  }

  initSelects() {
    const routes = this.el('route-select');
    routes.replaceChildren();
    ROUTES.forEach((route) => {
      const option = document.createElement('option');
      option.value = route.id;
      option.textContent = route.name;
      routes.append(option);
    });
    routes.value = save.routeId || ROUTES[0].id;
    this.refreshDriverSelect();
    this.el('dialect-select').value = save.dialect || 'hausa';
    this.el('camera-select').value = save.camera || 'chase';
    this.el('road-select').value = save.roadMode || 'oneway';
    this.el('mute-select').value = save.muted ? 'off' : 'on';
    this.el('quality-select').value = save.settings?.quality || 'auto';
  }

  refreshDriverSelect() {
    const select = this.el('driver-select');
    if (!select) return;
    const prior = save.driverId || 'ruffneck';
    select.replaceChildren();
    DRIVERS.forEach((driver) => {
      const option = document.createElement('option');
      const unlocked = (save.unlocks || []).includes(driver.id);
      option.value = driver.id;
      option.textContent = unlocked
        ? `${driver.name} — ${driver.blurb}`
        : `${driver.name} — LOCKED · ₦${(driver.price || 0).toLocaleString()}`;
      option.disabled = !unlocked;
      select.append(option);
    });
    select.value = (save.unlocks || []).includes(prior)
      ? prior
      : DRIVERS.find((driver) => (save.unlocks || []).includes(driver.id))?.id || DRIVERS[0].id;
  }

  bind(game) {
    if (this.bound) return;
    this.bound = true;
    this.game = game;

    this.el('start-btn').addEventListener('click', () => {
      const routeId = this.el('route-select').value;
      const driverId = this.el('driver-select').value;
      if (!(save.unlocks || []).includes(driverId)) {
        this.toast('That driver is locked. Open the garage to unlock them.');
        this.openGarage();
        return;
      }
      save.routeId = routeId;
      save.driverId = driverId;
      game.route = ROUTES.find((route) => route.id === routeId) || ROUTES[0];
      game.driver = DRIVERS.find((driver) => driver.id === driverId) || DRIVERS[0];
      persist();
      game.start(this.el('mode-select').value);
    });

    this.el('help-btn').onclick = () => this.show('help-screen');
    this.el('garage-btn').onclick = () => this.openGarage();
    this.el('menu-garage-btn').onclick = () => this.openGarage();
    this.el('daily-login-btn').onclick = () => this.claimDailyLogin();
    this.el('daily-login-btn-menu').onclick = () => this.claimDailyLogin();
    this.el('menu-btn').onclick = () => game.menu();
    this.el('resume-btn').onclick = () => {
      game.state = 'PLAY';
      this.hide('menu-screen');
    };
    this.el('radio-btn').onclick = () => {
      save.radioIndex = (save.radioIndex + 1) % RADIO.length;
      persist();
      game.s.radio = RADIO[save.radioIndex];
      game.audio.beep?.(540, 0.1);
      this.toast(`Radio: ${game.s.radio.name} ${game.s.radio.freq}`);
    };
    this.el('rank-btn').onclick = () => {
      const standings = tribeStanding();
      this.toast(`Naija Rank · ${standings.map((item, index) => `${index + 1}. ${item.tribe.toUpperCase()} ₦${item.total.toLocaleString()}`).join(' · ')}`);
    };
    this.el('dialect-select').onchange = (event) => {
      save.dialect = event.target.value;
      game.s.dialect = event.target.value;
      persist();
      this.toast(`Language: ${event.target.value.toUpperCase()}`);
    };
    this.el('camera-select').onchange = (event) => {
      save.camera = event.target.value;
      game.s.camera = event.target.value;
      persist();
    };
    this.el('road-select').onchange = (event) => {
      save.roadMode = event.target.value;
      persist();
      game.s.roadMode = event.target.value;
      this.toast(`${event.target.value === 'twoway' ? 'Two-way' : 'One-way'} traffic selected for the next run.`);
    };
    this.el('mute-select').onchange = (event) => {
      const shouldEnable = event.target.value === 'on';
      if (game.audio.enabled !== shouldEnable) game.audio.toggle();
    };
    this.el('quality-select').onchange = (event) => {
      const quality = event.target.value;
      save.settings.quality = quality;
      persist();
      window.dispatchEvent(new CustomEvent('kano:quality-change', { detail: { quality } }));
    };

    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        game.setMode(button.dataset.mode);
        this.hide('menu-screen');
      });
    });
    document.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.close;
        this.hide(target);
        if (target === 'menu-screen' && game.state === 'MENU') game.state = 'PLAY';
      });
    });
    this.el('again-btn').onclick = () => game.start(game.mode);
    this.el('home-btn').onclick = () => {
      this.hide('over-screen');
      this.show('start-screen');
      game.state = 'INTRO';
    };
    this.el('continue-btn').onclick = () => {
      if (game.s.lives > 0) game.continueRun(false);
      else game.continueRun(true);
    };
    this.el('route-select').onchange = (event) => {
      save.routeId = event.target.value;
      persist();
    };
    this.el('driver-select').onchange = (event) => {
      if ((save.unlocks || []).includes(event.target.value)) {
        save.driverId = event.target.value;
        persist();
      }
    };
    this.refreshDailyMissions();
  }

  show(id) { this.el(id)?.classList.remove('hidden'); }
  hide(id) { this.el(id)?.classList.add('hidden'); }

  refreshWallet() {
    const text = `₦${Math.floor(save.money || 0).toLocaleString()}`;
    ['wallet-balance', 'garage-wallet'].forEach((id) => {
      const element = this.el(id);
      if (element) element.textContent = text;
    });
  }

  refreshDailyLogin() {
    const status = dailyLoginStatus();
    const label = status.claimed
      ? `DAILY LOGIN CLAIMED · ${status.streak}-DAY STREAK`
      : `CLAIM DAILY LOGIN · ₦${status.reward.toLocaleString()}`;
    ['daily-login-btn', 'daily-login-btn-menu'].forEach((id) => {
      const button = this.el(id);
      if (!button) return;
      button.textContent = label;
      button.disabled = status.claimed;
      button.setAttribute('aria-disabled', String(status.claimed));
    });
    const streak = this.el('daily-streak');
    if (streak) streak.textContent = `Current streak: ${status.streak} day(s)`;
  }

  claimDailyLogin() {
    const result = claimDaily();
    this.refreshDailyLogin();
    this.refreshWallet();
    if (result.ok) this.toast(`Daily reward claimed · +₦${result.reward.toLocaleString()} · ${result.streak}-day streak`);
    else this.toast(result.message || 'Daily reward already claimed.');
  }

  refreshDailyMissions() {
    const host = this.el('daily-mission-list');
    if (!host) return;
    const missions = getDailyMissions(DAILY_MISSION_POOL);
    host.replaceChildren();
    if (!missions.length) {
      host.textContent = 'No daily missions available.';
      return;
    }
    missions.forEach((mission) => {
      const card = document.createElement('article');
      card.className = 'daily-mission-item';
      const copy = document.createElement('div');
      copy.className = 'daily-mission-copy';
      const title = document.createElement('strong');
      title.textContent = mission.text;
      const progress = document.createElement('small');
      progress.textContent = `${Math.floor(mission.progress)} / ${mission.target} · reward ₦${mission.reward.toLocaleString()}`;
      copy.append(title, progress);
      const button = document.createElement('button');
      button.className = 'daily-claim';
      button.textContent = mission.claimed ? 'CLAIMED' : mission.claimable ? 'CLAIM' : 'IN PROGRESS';
      button.disabled = !mission.claimable;
      button.addEventListener('click', () => {
        const result = claimDailyMission(mission.id, DAILY_MISSION_POOL);
        this.toast(result.message);
        this.refreshDailyMissions();
        this.refreshWallet();
      });
      card.append(copy, button);
      host.append(card);
    });
  }

  openGarage() {
    this.refreshWallet();
    this.renderGarage();
    this.show('garage-screen');
  }

  renderGarage() {
    const driversHost = this.el('garage-drivers');
    const paintsHost = this.el('garage-paints');
    if (!driversHost || !paintsHost) return;
    driversHost.replaceChildren();
    paintsHost.replaceChildren();

    for (const driver of DRIVERS) {
      const owned = (save.unlocks || []).includes(driver.id);
      const selected = save.driverId === driver.id;
      const buttonText = selected ? 'SELECTED' : owned ? 'SELECT' : `UNLOCK · ₦${(driver.price || 0).toLocaleString()}`;
      this.addGarageItem(
        driversHost,
        driver.name,
        `${driver.blurb}${owned ? '' : ` · Cost ₦${(driver.price || 0).toLocaleString()}`}`,
        buttonText,
        selected,
        () => {
          const result = owned ? selectDriver(driver.id) : purchaseDriver(driver.id);
          this.toast(result.message);
          this.refreshDriverSelect();
          this.refreshWallet();
          this.renderGarage();
        },
      );
    }

    for (const paint of PAINTS) {
      const owned = (save.unlockedPaints || ['gold']).includes(paint.id);
      const selected = save.paint === paint.color;
      const buttonText = selected ? 'SELECTED' : owned ? 'SELECT' : `UNLOCK · ₦${paint.price.toLocaleString()}`;
      this.addGarageItem(
        paintsHost,
        paint.name,
        `${paint.blurb}${owned ? '' : ` · Cost ₦${paint.price.toLocaleString()}`}`,
        buttonText,
        selected,
        () => {
          const result = owned ? selectPaint(paint.id) : purchasePaint(paint.id);
          if (result.ok && this.game?.s) this.game.s.paint = save.paint;
          this.toast(result.message);
          this.refreshWallet();
          this.renderGarage();
        },
        paint.color,
      );
    }
  }

  addGarageItem(host, titleText, bodyText, buttonText, selected, action, paintColor = null) {
    const card = document.createElement('article');
    card.className = 'garage-item';
    if (paintColor) {
      const swatch = document.createElement('span');
      swatch.className = 'paint-swatch';
      swatch.style.backgroundColor = paintColor;
      swatch.setAttribute('aria-label', `${titleText} colour`);
      card.append(swatch);
    }
    const copy = document.createElement('div');
    copy.className = 'garage-copy';
    const title = document.createElement('strong');
    title.textContent = titleText;
    const description = document.createElement('small');
    description.textContent = bodyText;
    copy.append(title, description);
    const button = document.createElement('button');
    button.textContent = buttonText;
    button.disabled = selected;
    button.className = selected ? 'selected-button' : 'garage-action';
    button.addEventListener('click', action);
    card.append(copy, button);
    host.append(card);
  }

  startPlay() {
    this.hide('start-screen');
    this.hide('menu-screen');
    this.hide('over-screen');
    this.hide('help-screen');
    this.hide('garage-screen');
    this.el('hud').style.display = 'block';
    this.el('drive-controls').style.display = 'grid';
    this.el('menu-btn').style.display = 'block';
    this.refreshWallet();
    this.refreshDailyLogin();
  }

  setMode(mode) {
    this.game.s.mode = mode;
    this.game.mode = mode;
    const select = this.el('mode-select');
    if (select) select.value = mode;
    this.toast(`${MODES[mode]?.label || 'Free roam'} selected`);
  }

  toast(text) {
    const toast = this.el('toast');
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  update(state, route, driver) {
    const set = (id, value) => {
      const element = this.el(id);
      if (element) element.textContent = value;
    };
    set('score', Math.floor(state.score).toLocaleString());
    set('distance', state.distance.toFixed(2));
    set('speed', Math.round(state.speed));
    set('pax', state.passengers.reduce((total, passenger) => total + passenger.seats, 0));
    set('capacity', state.capacity);
    set('fuel', Math.round(state.fuel));
    set('condition', Math.round(state.condition));
    set('driver-label', driver.name.toUpperCase());
    set('dialect-label', (DIALECT[state.dialect] ? state.dialect : 'hausa').toUpperCase());
    set('route-label', `${route.name} · ${state.passengers[0]?.dest || 'looking for fares'}`);
    set('radio-label', `${state.radio.name.toUpperCase()} ${state.radio.freq}`);
    set('lives-label', '♥ '.repeat(Math.max(0, state.lives)) || 'NO LIVES');
    set('level-label', `LEVEL ${state.level}`);
    set('combo-label', `COMBO ×${state.combo}`);
    set('heat-label', `HEAT ${Math.round(state.heat)}%`);
    const status = state.condition < 30 || state.engine < 30 || state.tyres < 25
      ? 'STATUS · CRITICAL'
      : state.fuel < 18 || state.heat >= 50 ? 'STATUS · CAUTION' : 'STATUS · OK';
    set('status-label', status);
    set('map-label', route.name.toUpperCase());
    const passengerList = this.el('passenger-list');
    if (passengerList) {
      passengerList.replaceChildren();
      passengerList.classList.toggle('hidden', state.passengers.length === 0);
      state.passengers.slice(0, 5).forEach((passenger) => {
        const line = document.createElement('div');
        line.textContent = `${passenger.name} → ${passenger.dest} · ${passenger.seats} seat${passenger.seats === 1 ? '' : 's'} · ₦${Math.floor(passenger.fare).toLocaleString()}`;
        passengerList.append(line);
      });
    }
    this.el('fuel-meter').style.width = `${Math.max(0, state.fuel)}%`;
    this.el('condition-meter').style.width = `${Math.max(0, state.condition)}%`;
    const mission = state.missions.find((item) => !item.done);
    set('mission-label', mission
      ? `MISSION · ${mission.text} (${Math.floor(state.missionProgress[mission.id] || 0)}/${mission.target})`
      : state.mode === 'career' ? 'Missions complete · keep earning' : `${state.mode.toUpperCase()} · ${state.distance.toFixed(1)} km`);
    set('render-badge', window.__KANO_RENDER_MODE__ === '3D' ? '3D MODE · WEBGL' : '2D MODE · ROAD VISIBLE');
    this.refreshWallet();
  }

  event(kicker, title, copy, choices) {
    this.el('event-kicker').textContent = kicker;
    this.el('event-title').textContent = title;
    this.el('event-copy').textContent = copy;
    const box = this.el('event-actions');
    box.replaceChildren();
    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.textContent = choice.label;
      button.addEventListener('click', () => this.game.resolveEvent(choice.action));
      box.append(button);
    });
    this.el('event-card').classList.remove('hidden');
  }

  hideEvent() { this.el('event-card').classList.add('hidden'); }

  gameOver({ reason, earned, run, best, standing, soft = false }) {
    this.el('over-title').textContent = reason;
    this.el('over-score').textContent = `₦${Math.floor(run.score).toLocaleString()}`;
    this.el('over-distance').textContent = `${run.distance.toFixed(2)} km`;
    this.el('over-drops').textContent = run.drops;
    this.el('over-best').textContent = `₦${Math.floor(best).toLocaleString()}`;
    this.el('over-message').textContent = `${soft ? 'Run paused by a crash. Earnings are not banked until the run ends permanently.' : `Banked ₦${earned.toLocaleString()} · tribe score submitted.`} · ${run.driver} · ${run.mode} · ${Math.floor(run.elapsed)} seconds · fuel ${Math.round(run.fuel)}% · condition ${Math.round(run.condition)}%.`;
    this.el('tribe-standing').replaceChildren();
    const heading = document.createElement('b');
    heading.textContent = 'NAIJA TRIBE STANDING';
    this.el('tribe-standing').append(heading, document.createElement('br'));
    standing.forEach((entry, index) => {
      const line = document.createElement('span');
      line.textContent = `${['🥇', '🥈', '🥉'][index] || '•'} ${entry.tribe.toUpperCase()} — ₦${entry.total.toLocaleString()} (${entry.scores.length} top scores)`;
      this.el('tribe-standing').append(line, document.createElement('br'));
    });
    const continueButton = this.el('continue-btn');
    if (soft && (run.lives > 0 || save.money >= run.paidContinueCost)) {
      continueButton.classList.remove('hidden');
      continueButton.textContent = run.lives > 0 ? `USE LIFE SAVER (${run.lives} LEFT)` : `PAID CONTINUE · ₦${run.paidContinueCost.toLocaleString()}`;
    } else continueButton.classList.add('hidden');
    this.hideEvent();
    this.show('over-screen');
    this.el('drive-controls').style.display = 'none';
    this.el('menu-btn').style.display = 'none';
    this.refreshWallet();
    this.refreshDailyMissions();
  }
}
