import { ROUTES, DRIVERS, RADIO, MODES, DIALECT, PAINTS, DAILY_MISSION_POOL } from './config.js';
import { save, persist, tribeStanding, dailyLoginStatus, claimDaily, getDailyMissions, claimDailyMission } from './storage.js';
import { selectDriver, purchaseDriver, selectPaint, purchasePaint } from './progression.js';

export class UI {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.screens = ['start-screen', 'life-routine-screen', 'menu-screen', 'over-screen', 'help-screen', 'garage-screen'];
    this.morningStage = 0;
    this.morning = { fed: false, cost: 0, food: '', guardGreeted: false };
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

    this.el('start-btn').addEventListener('click', () => this.beginMorningRoutine());

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
    this.el('again-btn').onclick = () => this.beginMorningRoutine();
    this.el('home-btn').onclick = () => {
      this.hide('over-screen');
      this.hide('life-routine-screen');
      this.show('start-screen');
      this.el('hud').style.display = 'none';
      this.el('drive-controls').style.display = 'none';
      this.el('menu-btn').style.display = 'none';
      game.state = 'INTRO';
      window.dispatchEvent(new CustomEvent('kano:life-scene', { detail: { scene: 'road' } }));
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

  beginMorningRoutine() {
    const routeId = this.el('route-select')?.value || save.routeId;
    const driverId = this.el('driver-select')?.value || save.driverId;
    if (!(save.unlocks || []).includes(driverId)) {
      this.toast('That driver is locked. Open the garage to unlock them.');
      this.openGarage();
      return;
    }

    save.routeId = routeId;
    save.driverId = driverId;
    persist();
    this.game.route = ROUTES.find((route) => route.id === routeId) || ROUTES[0];
    this.game.driver = DRIVERS.find((driver) => driver.id === driverId) || DRIVERS[0];
    this.morningStage = 0;
    this.morning = { fed: false, cost: 0, food: '', guardGreeted: false };
    this.hide('start-screen');
    this.hide('over-screen');
    this.hide('garage-screen');
    this.hide('menu-screen');
    this.show('life-routine-screen');
    this.el('hud').style.display = 'none';
    this.el('drive-controls').style.display = 'none';
    this.el('menu-btn').style.display = 'none';
    window.dispatchEvent(new CustomEvent('kano:life-scene', { detail: { scene: 'road' } }));
    this.renderMorningStage();
  }

  renderMorningStage() {
    const stage = this.morningStage;
    const stages = [
      {
        time: '06:05 AM', scene: 'bedroom', label: 'WAKE UP',
        title: 'Morning has come in Kano.',
        copy: 'The sky is turning gold over the compound. Get up, wash, dress, and prepare for a working day behind the handlebar.',
        detail: 'You will need fuel, patience, and enough change to make the first trip worthwhile.',
        art: '<div class="art-sun"></div><div class="art-window"><i></i><i></i><i></i><i></i></div><div class="art-wall-clock"></div><div class="art-bed"><i></i><b></b></div><div class="art-nightstand"></div><div class="art-scene-sign">HOME COMPOUND · KANO</div>',
      },
      {
        time: '06:16 AM', scene: 'street', label: 'STEP OUT',
        title: 'The neighbourhood is waking up.',
        copy: 'A neighbour sweeps the frontage. A tailor opens his shop. The first keke horns carry from the junction while breakfast sellers set up by the road.',
        detail: 'Walk to the roadside food stall before heading to the park.',
        art: '<div class="art-street-sun"></div><div class="art-compound compound-one"></div><div class="art-compound compound-two"></div><div class="art-footpath"></div><div class="art-person art-walker"></div><div class="art-scene-sign">SABON GARI · EARLY MORNING</div>',
      },
      {
        time: '06:22 AM', scene: 'breakfast', label: 'ROADSIDE BREAKFAST',
        title: 'Akara and pap from the roadside.',
        copy: 'The seller lifts hot akara from the oil and pours smooth pap into an enamel cup. The smell of pepper and fried beans fills the morning air.',
        detail: 'Eating before the shift gives a small 5% fare bonus for this run. You can also choose pap only or skip the meal.',
        art: '<div class="art-stall-roof"></div><div class="art-stall-post post-a"></div><div class="art-stall-post post-b"></div><div class="art-stall-counter"></div><div class="art-seller"><i></i><b></b></div><div class="art-akara-bowl"><i></i><i></i><i></i></div><div class="art-pap-cup"><i></i></div><div class="art-scene-sign">FRESH AKARA · WARM PAP</div>',
      },
      {
        time: '06:34 AM', scene: 'walk', label: 'TO THE KEKE PARK',
        title: 'Head towards the parking yard.',
        copy: 'You finish breakfast and cut through the compound lane towards the covered keke park. Your Adaidaita Sahu stayed there overnight under a security guard’s watch.',
        detail: 'The shift starts when you greet the guard, inspect your keke, and unlock it.',
        art: '<div class="art-park-wall"></div><div class="art-gate"><i></i><i></i><i></i><i></i><i></i></div><div class="art-walk-road"></div><div class="art-person art-walker"></div><div class="art-scene-sign">KEKE PARK AHEAD</div>',
      },
      {
        time: '06:43 AM', scene: 'garage', label: 'PARKING GARAGE',
        title: this.morning.guardGreeted ? 'Ina kwana, oga. Kekenka lafiya.' : 'Mallam kept watch overnight.',
        copy: this.morning.guardGreeted
          ? 'The guard greets you and points to your parked Adaidaita Sahu. Check the road, settle into the driver’s seat, and start your shift.'
          : 'Your keke is inside the covered yard. Mallam security has guarded it through the night. Greet him before you take the keys.',
        detail: this.morning.guardGreeted
          ? 'MALLAM SECURITY: “Ina kwana, oga. Na kula da kekenka.” · KEKE READY'
          : 'KANO KEKE PARK · SECURITY ON DUTY · YOUR KEKE IS PARKED INSIDE',
        art: '<div class="art-garage-label">KANO KEKE PARK · MODEL PREVIEW</div>',
      },
    ];
    const data = stages[stage];
    if (!data) return;
    const screen = this.el('life-routine-screen');
    screen.classList.toggle('garage-focus', stage === 4);
    this.el('life-time').textContent = `${data.time} · KANO STATE`;
    this.el('life-step-label').textContent = `STEP ${stage + 1} OF ${stages.length} · ${data.label}`;
    this.el('life-progress-fill').style.width = `${((stage + 1) / stages.length) * 100}%`;
    this.el('life-title').textContent = data.title;
    this.el('life-copy').textContent = data.copy;
    this.el('life-detail').textContent = data.detail;
    const art = this.el('life-scene-art');
    art.className = `life-scene-art scene-${data.scene}`;
    art.innerHTML = data.art;
    this.el('life-wallet').textContent = `Banked wallet · ₦${Math.floor(save.money || 0).toLocaleString()}`;
    window.dispatchEvent(new CustomEvent('kano:life-scene', {
      detail: { scene: stage === 4 ? 'garage' : 'road' },
    }));

    const actions = this.el('life-actions');
    actions.replaceChildren();
    const addButton = (text, action, className = 'primary') => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = text;
      button.addEventListener('click', action, { once: true });
      actions.append(button);
      return button;
    };
    const setStage = (next) => {
      this.morningStage = next;
      this.renderMorningStage();
    };

    if (stage === 0) addButton('WAKE UP · WASH AND DRESS', () => setStage(1));
    if (stage === 1) addButton('WALK TO THE ROADSIDE STALL', () => setStage(2));
    if (stage === 2) {
      const fullMeal = addButton('AKARA + PAP · ₦450', () => this.buyMorningMeal('Akara and pap', 450), 'primary');
      const papOnly = addButton('PAP ONLY · ₦250', () => this.buyMorningMeal('Pap', 250), 'secondary');
      fullMeal.disabled = (save.money || 0) < 450;
      papOnly.disabled = (save.money || 0) < 250;
      addButton('SKIP BREAKFAST', () => setStage(3), 'secondary');
    }
    if (stage === 3) addButton('WALK TO THE PARKING GARAGE', () => setStage(4));
    if (stage === 4 && !this.morning.guardGreeted) {
      addButton('GREET MALLAM SECURITY', () => {
        this.morning.guardGreeted = true;
        this.toast('Mallam: “Ina kwana, oga. Kekenka lafiya.”');
        this.renderMorningStage();
      });
    }
    if (stage === 4 && this.morning.guardGreeted) {
      addButton('UNLOCK KEKE · START SHIFT', () => this.launchMorningShift());
    }
    addButton('BACK TO TITLE', () => {
      this.hide('life-routine-screen');
      this.show('start-screen');
      this.game.state = 'INTRO';
      window.dispatchEvent(new CustomEvent('kano:life-scene', { detail: { scene: 'road' } }));
    }, 'secondary life-back-button');
  }

  buyMorningMeal(food, cost) {
    if ((save.money || 0) < cost) {
      this.toast(`Not enough cash for ${food.toLowerCase()}. Choose pap only or skip breakfast.`);
      return;
    }
    save.money -= cost;
    persist();
    this.morning.fed = true;
    this.morning.cost = cost;
    this.morning.food = food;
    this.refreshWallet();
    this.morningStage = 3;
    this.renderMorningStage();
    this.toast(`${food} bought for ₦${cost.toLocaleString()}. Kai lafiya.`);
  }

  launchMorningShift() {
    window.dispatchEvent(new CustomEvent('kano:life-scene', { detail: { scene: 'road' } }));
    this.hide('life-routine-screen');
    this.game.start(this.el('mode-select')?.value || 'career');
    this.game.s.breakfastEaten = this.morning.fed;
    this.game.s.breakfastCost = this.morning.cost;
    this.game.s.guardedOvernight = this.morning.guardGreeted;
    this.el('hud').style.display = 'block';
    this.el('drive-controls').style.display = 'grid';
    this.el('menu-btn').style.display = 'block';
    if (this.morning.fed) this.toast(`Shift started fed: ${this.morning.food}. Small fare bonus active.`);
    else this.toast('Shift started. Next stop: your first passenger.');
    this.refreshWallet();
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
    this.hide('life-routine-screen');
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
