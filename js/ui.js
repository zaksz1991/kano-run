import {
  ROUTES,
  DRIVERS,
  RADIO,
  MODES,
  DIALECT,
  PAINTS,
  DAILY_MISSION_POOL,
} from './config.js';

import {
  save,
  persist,
  tribeStanding,
  dailyLoginStatus,
  claimDaily,
  getDailyMissions,
  claimDailyMission,
} from './storage.js';

import {
  selectDriver,
  purchaseDriver,
  selectPaint,
  purchasePaint,
} from './progression.js';

export class UI {
  constructor() {
    this.el = (id) => document.getElementById(id);

    this.screens = [
      'start-screen',
      'life-routine-screen',
      'menu-screen',
      'over-screen',
      'help-screen',
      'garage-screen',
    ];

    this.morningStage = 0;

    this.morning = {
      fed: false,
      cost: 0,
      food: '',
      guardGreeted: false,
      helpedAtHome: false,
    };

    this.toastTimer = 0;
    this.bound = false;
    this.game = null;
    this.reverseButton = null;

    this.initSelects();
    this.refreshWallet();
    this.refreshDailyLogin();
  }

  initSelects() {
    const routes = this.el('route-select');

    if (routes) {
      routes.replaceChildren();

      ROUTES.forEach((route) => {
        const option = document.createElement('option');
        option.value = route.id;
        option.textContent = route.name;
        routes.append(option);
      });

      routes.value = save.routeId || ROUTES[0].id;
    }

    this.refreshDriverSelect();

    const dialect = this.el('dialect-select');
    if (dialect) dialect.value = save.dialect || 'hausa';

    const camera = this.el('camera-select');
    if (camera) camera.value = save.camera || 'chase';

    const road = this.el('road-select');
    if (road) road.value = save.roadMode || 'oneway';

    const mute = this.el('mute-select');
    if (mute) mute.value = save.muted ? 'off' : 'on';

    const quality = this.el('quality-select');
    if (quality) quality.value = save.settings?.quality || 'auto';
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
      : DRIVERS.find((driver) =>
          (save.unlocks || []).includes(driver.id),
        )?.id || DRIVERS[0].id;
  }

  bind(game) {
    if (this.bound) return;

    this.bound = true;
    this.game = game;

    const on = (id, event, handler) => {
      const element = this.el(id);
      if (element) element.addEventListener(event, handler);
      return element;
    };

    on('start-btn', 'click', () => this.beginMorningRoutine());

    on('help-btn', 'click', () => this.show('help-screen'));
    on('garage-btn', 'click', () => this.openGarage());
    on('menu-garage-btn', 'click', () => this.openGarage());

    on('daily-login-btn', 'click', () => this.claimDailyLogin());
    on('daily-login-btn-menu', 'click', () => this.claimDailyLogin());

    on('menu-btn', 'click', () => game.menu());

    on('resume-btn', 'click', () => {
      game.state = 'PLAY';
      this.hide('menu-screen');
    });

    on('radio-btn', 'click', () => {
      save.radioIndex = (save.radioIndex + 1) % RADIO.length;
      persist();

      game.s.radio = RADIO[save.radioIndex];
      game.audio.beep?.(540, 0.1);

      this.toast(`Radio: ${game.s.radio.name} ${game.s.radio.freq}`);
    });

    on('rank-btn', 'click', () => {
      const standings = tribeStanding();

      this.toast(
        `Naija Rank · ${standings
          .map(
            (item, index) =>
              `${index + 1}. ${item.tribe.toUpperCase()} ₦${item.total.toLocaleString()}`,
          )
          .join(' · ')}`,
      );
    });

    on('dialect-select', 'change', (event) => {
      save.dialect = event.target.value;
      game.s.dialect = event.target.value;
      persist();

      this.toast(`Language: ${event.target.value.toUpperCase()}`);
    });

    on('camera-select', 'change', (event) => {
      save.camera = event.target.value;
      game.s.camera = event.target.value;
      persist();
    });

    on('road-select', 'change', (event) => {
      save.roadMode = event.target.value;
      persist();

      game.s.roadMode = event.target.value;

      this.toast(
        `${event.target.value === 'twoway' ? 'Two-way' : 'One-way'} traffic selected for the next run.`,
      );
    });

    on('mute-select', 'change', (event) => {
      const shouldEnable = event.target.value === 'on';

      if (game.audio.enabled !== shouldEnable) {
        game.audio.toggle();
      }
    });

    on('quality-select', 'change', (event) => {
      const quality = event.target.value;

      save.settings.quality = quality;
      persist();

      window.dispatchEvent(
        new CustomEvent('kano:quality-change', {
          detail: { quality },
        }),
      );
    });

    /*
     * Reverse gear
     *
     * This supports an optional HTML button with id="reverse-btn".
     * The game engine must expose game.setReverse().
     *
     * Reverse gear is toggled with a click. While reverse is engaged,
     * the game's brake input acts as the reverse accelerator.
     */
    this.reverseButton = this.el('reverse-btn');

    if (this.reverseButton) {
      this.reverseButton.type = 'button';
      this.reverseButton.setAttribute('aria-pressed', 'false');
      this.reverseButton.textContent = 'REVERSE';

      this.reverseButton.addEventListener('click', () => {
        this.toggleReverse();
      });

      this.updateReverseControl();
    }

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

        if (target === 'menu-screen' && game.state === 'MENU') {
          game.state = 'PLAY';
        }
      });
    });

    on('again-btn', 'click', () => this.beginMorningRoutine());

    on('home-btn', 'click', () => {
      this.hide('over-screen');
      this.hide('life-routine-screen');
      this.show('start-screen');

      const hud = this.el('hud');
      const controls = this.el('drive-controls');
      const menuButton = this.el('menu-btn');

      if (hud) hud.style.display = 'none';
      if (controls) controls.style.display = 'none';
      if (menuButton) menuButton.style.display = 'none';

      game.state = 'INTRO';

      window.dispatchEvent(
        new CustomEvent('kano:life-scene', {
          detail: { scene: 'road' },
        }),
      );
    });

    on('continue-btn', 'click', () => {
      if (game.s.lives > 0) {
        game.continueRun(false);
      } else {
        game.continueRun(true);
      }
    });

    on('route-select', 'change', (event) => {
      save.routeId = event.target.value;
      persist();
    });

    on('driver-select', 'change', (event) => {
      if ((save.unlocks || []).includes(event.target.value)) {
        save.driverId = event.target.value;
        persist();
      }
    });

    this.refreshDailyMissions();
  }

  toggleReverse() {
    if (!this.game || typeof this.game.setReverse !== 'function') {
      this.toast('Reverse gear is not available in the current game engine.');
      return false;
    }

    const currentlyReversing = Boolean(this.game.s?.reverse);
    const result = this.game.setReverse(!currentlyReversing);

    if (result === false) {
      this.updateReverseControl();
      return false;
    }

    this.updateReverseControl();
    return true;
  }

  updateReverseControl(state = this.game?.s) {
    const button = this.reverseButton || this.el('reverse-btn');
    if (!button) return;

    const reversing = Boolean(state?.reverse);

    button.classList.toggle('reverse-engaged', reversing);
    button.setAttribute('aria-pressed', String(reversing));
    button.textContent = reversing ? 'REVERSE ENGAGED' : 'REVERSE';
    button.title = reversing
      ? 'Reverse gear is engaged. Use the brake control to reverse.'
      : 'Engage reverse gear when the keke has stopped.';
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

    this.game.route =
      ROUTES.find((route) => route.id === routeId) || ROUTES[0];

    this.game.driver =
      DRIVERS.find((driver) => driver.id === driverId) || DRIVERS[0];

    this.morningStage = 0;

    this.morning = {
      fed: false,
      cost: 0,
      food: '',
      guardGreeted: false,
      helpedAtHome: false,
    };

    this.hide('start-screen');
    this.hide('over-screen');
    this.hide('garage-screen');
    this.hide('menu-screen');

    this.show('life-routine-screen');

    const hud = this.el('hud');
    const controls = this.el('drive-controls');
    const menuButton = this.el('menu-btn');

    if (hud) hud.style.display = 'none';
    if (controls) controls.style.display = 'none';
    if (menuButton) menuButton.style.display = 'none';

    window.dispatchEvent(
      new CustomEvent('kano:life-scene', {
        detail: { scene: 'road' },
      }),
    );

    this.renderMorningStage();
  }

  renderMorningStage() {
    const stage = this.morningStage;

    const stages = [
      {
        time: '06:05 AM',
        scene: 'bedroom',
        label: 'WAKE UP',
        title: 'Morning has come in Kano.',
        copy: 'A faint call to prayer has passed over the neighbourhood. Wake up, wash, dress, and prepare for another day of fares.',
        detail: 'The day begins at home before you reach the keke park.',
      },
      {
        time: '06:12 AM',
        scene: 'household',
        label: 'HOME COMPOUND',
        title: 'Start the day with the household.',
        copy: 'Water is being carried into the compound. Someone sweeps the frontage while a neighbour checks the water drum. The family is already moving.',
        detail: 'Help carry water or leave on time. Both are valid choices; there is no penalty for heading to work.',
      },
      {
        time: '06:20 AM',
        scene: 'street',
        label: 'NEIGHBOURHOOD',
        title: 'Kano is waking up.',
        copy: 'A provisions shop opens its shutter. School children walk in groups, a tailor raises his stall, and the first okada passes a row of compound walls.',
        detail: 'Keep to the footpath as you make your way towards the food sellers.',
      },
      {
        time: '06:27 AM',
        scene: 'breakfast',
        label: 'ROAD-SIDE FOOD',
        title: 'Choose breakfast for the road.',
        copy: 'The stall has more than one local breakfast today: akara and pap, masa with tea, bread and tea, or a quick cup of pap. The seller knows the regulars.',
        detail: 'Eating gives a small fare bonus. Breakfast is optional, and skipping it never blocks the shift.',
      },
      {
        time: '06:39 AM',
        scene: 'walk',
        label: 'WALK TO THE PARK',
        title: 'Pass the market road.',
        copy: 'Shopkeepers unload baskets. A water seller balances a tray. School traffic builds near the junction, and parked kekes wait for their first passengers.',
        detail: 'Keep walking towards the covered Adaidaita Sahu park where your keke stayed overnight.',
      },
      {
        time: '06:43 AM',
        scene: 'school',
        label: 'SCHOOL & MOSQUE JUNCTION',
        title: 'The morning road has its own rhythm.',
        copy: 'Children gather near the school gate, a few worshippers cross the street, and drivers greet one another before joining the flow of traffic.',
        detail: 'The shift will start at the parking yard. You can proceed without taking an extra activity.',
      },
      {
        time: '06:48 AM',
        scene: 'garage',
        label: 'PARKING GARAGE',
        title: this.morning.guardGreeted
          ? 'Ina kwana, oga. Kekenka lafiya.'
          : 'Mallam kept watch overnight.',
        copy: this.morning.guardGreeted
          ? 'The guard greets you and points to your parked Adaidaita Sahu. Check the tyres, mirrors, fuel and brakes before unlocking it.'
          : 'Your own keke sits in the guarded yard beneath the canopy. Mallam security has watched the park through the night. Greet him before taking the keys.',
        detail: this.morning.guardGreeted
          ? 'MALLAM SECURITY: “Ina kwana, oga. Na kula da kekenka.” · INSPECT & START'
          : 'KANO KEKE PARK · SECURITY ON DUTY · YOUR KEKE IS PARKED INSIDE',
      },
    ];

    const data = stages[stage];
    if (!data) return;

    const screen = this.el('life-routine-screen');
    if (screen) {
      screen.classList.toggle('garage-focus', data.scene === 'garage');
    }

    const setText = (id, value) => {
      const element = this.el(id);
      if (element) element.textContent = value;
    };

    setText('life-time', `${data.time} · KANO STATE`);
    setText(
      'life-step-label',
      `STEP ${stage + 1} OF ${stages.length} · ${data.label}`,
    );

    const progress = this.el('life-progress-fill');
    if (progress) {
      progress.style.width = `${((stage + 1) / stages.length) * 100}%`;
    }

    setText('life-title', data.title);
    setText('life-copy', data.copy);
    setText('life-detail', data.detail);

    const art = this.el('life-scene-art');

    if (art) {
      art.className = `life-scene-art scene-${data.scene} model-backed`;
      art.replaceChildren();
    }

    setText(
      'life-wallet',
      `Banked wallet · ₦${Math.floor(save.money || 0).toLocaleString()}`,
    );

    window.dispatchEvent(
      new CustomEvent('kano:life-scene', {
        detail: { scene: data.scene },
      }),
    );

    const actions = this.el('life-actions');
    if (!actions) return;

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

    if (stage === 0) {
      addButton('WAKE UP · WASH AND DRESS', () => setStage(1));
    }

    if (stage === 1) {
      addButton('HELP CARRY WATER · THEN GO', () => {
        this.morning.helpedAtHome = true;
        setStage(2);
      });

      addButton('HEAD OUT NOW', () => setStage(2), 'secondary');
    }

    if (stage === 2) {
      addButton('WALK TO THE ROAD-SIDE STALL', () => setStage(3));
    }

    if (stage === 3) {
      const choices = [
        ['AKARA + PAP · ₦450', 'Akara and pap', 450],
        ['MASA + TEA · ₦400', 'Masa and tea', 400],
        ['BREAD + TEA · ₦300', 'Bread and tea', 300],
        ['PAP ONLY · ₦250', 'Pap', 250],
      ];

      for (const [label, food, cost] of choices) {
        const button = addButton(
          label,
          () => this.buyMorningMeal(food, cost),
          cost === 450 ? 'primary' : 'secondary',
        );

        button.disabled = (save.money || 0) < cost;
      }

      addButton('SKIP BREAKFAST', () => setStage(4), 'secondary');
    }

    if (stage === 4) {
      addButton('CONTINUE TO THE PARK', () => setStage(5));
    }

    if (stage === 5) {
      addButton('WALK TO THE GUARDED KEKE PARK', () => setStage(6));
    }

    if (stage === 6 && !this.morning.guardGreeted) {
      addButton('GREET MALLAM SECURITY', () => {
        this.morning.guardGreeted = true;

        this.toast('Mallam: “Ina kwana, oga. Kekenka lafiya.”');

        this.renderMorningStage();
      });
    }

    if (stage === 6 && this.morning.guardGreeted) {
      addButton(
        'INSPECT KEKE · UNLOCK · START SHIFT',
        () => this.launchMorningShift(),
      );
    }

    addButton(
      'BACK TO TITLE',
      () => {
        this.hide('life-routine-screen');
        this.show('start-screen');

        this.game.state = 'INTRO';

        window.dispatchEvent(
          new CustomEvent('kano:life-scene', {
            detail: { scene: 'road' },
          }),
        );
      },
      'secondary life-back-button',
    );
  }

  buyMorningMeal(food, cost) {
    if ((save.money || 0) < cost) {
      this.toast(
        `Not enough cash for ${food.toLowerCase()}. Choose pap only or skip breakfast.`,
      );
      return;
    }

    save.money -= cost;
    persist();

    this.morning.fed = true;
    this.morning.cost = cost;
    this.morning.food = food;

    this.refreshWallet();

    this.morningStage = 4;
    this.renderMorningStage();

    this.toast(
      `${food} bought for ₦${cost.toLocaleString()}. Kai lafiya.`,
    );
  }

  launchMorningShift() {
    window.dispatchEvent(
      new CustomEvent('kano:life-scene', {
        detail: { scene: 'road' },
      }),
    );

    this.hide('life-routine-screen');

    this.game.start(this.el('mode-select')?.value || 'career');

    this.game.s.breakfastEaten = this.morning.fed;
    this.game.s.breakfastCost = this.morning.cost;
    this.game.s.guardedOvernight = this.morning.guardGreeted;

    if (this.morning.helpedAtHome) {
      this.game.s.morale = Math.min(
        100,
        (this.game.s.morale || 75) + 5,
      );

      this.game.s.fareMood = 1.025;
    }

    const hud = this.el('hud');
    const controls = this.el('drive-controls');
    const menuButton = this.el('menu-btn');

    if (hud) hud.style.display = 'block';
    if (controls) controls.style.display = 'grid';
    if (menuButton) menuButton.style.display = 'block';

    this.updateReverseControl();

    if (this.morning.fed) {
      this.toast(
        `Shift started fed: ${this.morning.food}. Small fare bonus active.`,
      );
    } else {
      this.toast('Shift started. Next stop: your first passenger.');
    }

    this.refreshWallet();
  }

  show(id) {
    this.el(id)?.classList.remove('hidden');
  }

  hide(id) {
    this.el(id)?.classList.add('hidden');
  }

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

    if (streak) {
      streak.textContent = `Current streak: ${status.streak} day(s)`;
    }
  }

  claimDailyLogin() {
    const result = claimDaily();

    this.refreshDailyLogin();
    this.refreshWallet();

    if (result.ok) {
      this.toast(
        `Daily reward claimed · +₦${result.reward.toLocaleString()} · ${result.streak}-day streak`,
      );
    } else {
      this.toast(result.message || 'Daily reward already claimed.');
    }
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
      progress.textContent =
        `${Math.floor(mission.progress)} / ${mission.target} · reward ₦${mission.reward.toLocaleString()}`;

      copy.append(title, progress);

      const button = document.createElement('button');
      button.className = 'daily-claim';
      button.textContent = mission.claimed
        ? 'CLAIMED'
        : mission.claimable
          ? 'CLAIM'
          : 'IN PROGRESS';

      button.disabled = !mission.claimable;

      button.addEventListener('click', () => {
        const result = claimDailyMission(
          mission.id,
          DAILY_MISSION_POOL,
        );

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

      const buttonText = selected
        ? 'SELECTED'
        : owned
          ? 'SELECT'
          : `UNLOCK · ₦${(driver.price || 0).toLocaleString()}`;

      this.addGarageItem(
        driversHost,
        driver.name,
        `${driver.blurb}${owned ? '' : ` · Cost ₦${(driver.price || 0).toLocaleString()}`}`,
        buttonText,
        selected,
        () => {
          const result = owned
            ? selectDriver(driver.id)
            : purchaseDriver(driver.id);

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

      const buttonText = selected
        ? 'SELECTED'
        : owned
          ? 'SELECT'
          : `UNLOCK · ₦${paint.price.toLocaleString()}`;

      this.addGarageItem(
        paintsHost,
        paint.name,
        `${paint.blurb}${owned ? '' : ` · Cost ₦${paint.price.toLocaleString()}`}`,
        buttonText,
        selected,
        () => {
          const result = owned
            ? selectPaint(paint.id)
            : purchasePaint(paint.id);

          if (result.ok && this.game?.s) {
            this.game.s.paint = save.paint;
          }

          this.toast(result.message);
          this.refreshWallet();
          this.renderGarage();
        },
        paint.color,
      );
    }
  }

  addGarageItem(
    host,
    titleText,
    bodyText,
    buttonText,
    selected,
    action,
    paintColor = null,
  ) {
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
    button.className = selected
      ? 'selected-button'
      : 'garage-action';

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

    const hud = this.el('hud');
    const controls = this.el('drive-controls');
    const menuButton = this.el('menu-btn');

    if (hud) hud.style.display = 'block';
    if (controls) controls.style.display = 'grid';
    if (menuButton) menuButton.style.display = 'block';

    this.refreshWallet();
    this.refreshDailyLogin();
    this.updateReverseControl();
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
    if (!toast) return;

    toast.textContent = text;
    toast.classList.add('show');

    clearTimeout(this.toastTimer);

    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  update(state, route, driver) {
    const set = (id, value) => {
      const element = this.el(id);
      if (element) element.textContent = value;
    };

    set('score', Math.floor(state.score).toLocaleString());
    set('distance', state.distance.toFixed(2));
    set('speed', Math.round(state.speed));
    set(
      'pax',
      state.passengers.reduce(
        (total, passenger) => total + passenger.seats,
        0,
      ),
    );

    set('capacity', state.capacity);
    set('fuel', Math.round(state.fuel));
    set('condition', Math.round(state.condition));
    set('driver-label', driver.name.toUpperCase());

    set(
      'dialect-label',
      (DIALECT[state.dialect] ? state.dialect : 'hausa').toUpperCase(),
    );

    set(
      'route-label',
      `${route.name} · ${state.passengers[0]?.dest || 'looking for fares'}`,
    );

    set(
      'radio-label',
      `${state.radio.name.toUpperCase()} ${state.radio.freq}`,
    );

    set(
      'lives-label',
      '♥ '.repeat(Math.max(0, state.lives)) || 'NO LIVES',
    );

    set('level-label', `LEVEL ${state.level}`);
    set('combo-label', `COMBO ×${state.combo}`);
    set('heat-label', `HEAT ${Math.round(state.heat)}%`);

    const reversing = Boolean(state.reverse);

    /*
     * Keep reverse gear and signed speed visible in the HUD when
     * the corresponding optional HTML elements exist.
     */
    set('gear-label', reversing ? 'GEAR · REVERSE' : 'GEAR · FORWARD');
    set('reverse-label', reversing ? 'REVERSE ENGAGED' : 'FORWARD GEAR');

    const speedElement = this.el('speed');

    if (speedElement) {
      speedElement.dataset.gear = reversing ? 'reverse' : 'forward';
    }

    this.updateReverseControl(state);

    const status =
      state.condition < 30 ||
      state.engine < 30 ||
      state.tyres < 25
        ? 'STATUS · CRITICAL'
        : state.fuel < 18 || state.heat >= 50
          ? 'STATUS · CAUTION'
          : 'STATUS · OK';

    set('status-label', status);
    set('map-label', route.name.toUpperCase());

    const passengerList = this.el('passenger-list');

    if (passengerList) {
      passengerList.replaceChildren();

      passengerList.classList.toggle(
        'hidden',
        state.passengers.length === 0,
      );

      state.passengers.slice(0, 5).forEach((passenger) => {
        const line = document.createElement('div');

        line.textContent =
          `${passenger.name} → ${passenger.dest} · ${passenger.seats} seat${passenger.seats === 1 ? '' : 's'} · ₦${Math.floor(passenger.fare).toLocaleString()}`;

        passengerList.append(line);
      });
    }

    const fuelMeter = this.el('fuel-meter');

    if (fuelMeter) {
      fuelMeter.style.width = `${Math.max(0, state.fuel)}%`;
    }

    const conditionMeter = this.el('condition-meter');

    if (conditionMeter) {
      conditionMeter.style.width =
        `${Math.max(0, state.condition)}%`;
    }

    const mission = state.missions.find((item) => !item.done);

    set(
      'mission-label',
      mission
        ? `MISSION · ${mission.text} (${Math.floor(state.missionProgress[mission.id] || 0)}/${mission.target})`
        : state.mode === 'career'
          ? 'Missions complete · keep earning'
          : `${state.mode.toUpperCase()} · ${state.distance.toFixed(1)} km`,
    );

    set(
      'render-badge',
      window.__KANO_RENDER_MODE__ === '3D'
        ? '3D MODE · WEBGL'
        : '2D MODE · ROAD VISIBLE',
    );

    this.refreshWallet();
  }

  event(kicker, title, copy, choices) {
    const setText = (id, value) => {
      const element = this.el(id);
      if (element) element.textContent = value;
    };

    setText('event-kicker', kicker);
    setText('event-title', title);
    setText('event-copy', copy);

    const box = this.el('event-actions');
    if (!box) return;

    box.replaceChildren();

    choices.forEach((choice) => {
      const button = document.createElement('button');

      button.textContent = choice.label;

      button.addEventListener('click', () => {
        this.game.resolveEvent(choice.action);
      });

      box.append(button);
    });

    this.el('event-card')?.classList.remove('hidden');
  }

  hideEvent() {
    this.el('event-card')?.classList.add('hidden');
  }

  gameOver({
    reason,
    earned,
    run,
    best,
    standing,
    soft = false,
  }) {
    const setText = (id, value) => {
      const element = this.el(id);
      if (element) element.textContent = value;
    };

    setText('over-title', reason);
    setText('over-score', `₦${Math.floor(run.score).toLocaleString()}`);
    setText('over-distance', `${run.distance.toFixed(2)} km`);
    setText('over-drops', run.drops);
    setText('over-best', `₦${Math.floor(best).toLocaleString()}`);

    setText(
      'over-message',
      `${soft
        ? 'Run paused by a crash. Earnings are not banked until the run ends permanently.'
        : `Banked ₦${earned.toLocaleString()} · tribe score submitted.`} · ${run.driver} · ${run.mode} · ${Math.floor(run.elapsed)} seconds · fuel ${Math.round(run.fuel)}% · condition ${Math.round(run.condition)}%.`,
    );

    const standingHost = this.el('tribe-standing');

    if (standingHost) {
      standingHost.replaceChildren();

      const heading = document.createElement('b');
      heading.textContent = 'NAIJA TRIBE STANDING';

      standingHost.append(heading, document.createElement('br'));

      standing.forEach((entry, index) => {
        const line = document.createElement('span');

        line.textContent =
          `${['🥇', '🥈', '🥉'][index] || '•'} ${entry.tribe.toUpperCase()} — ₦${entry.total.toLocaleString()} (${entry.scores.length} top scores)`;

        standingHost.append(line, document.createElement('br'));
      });
    }

    const continueButton = this.el('continue-btn');

    if (
      continueButton &&
      soft &&
      (run.lives > 0 || save.money >= run.paidContinueCost)
    ) {
      continueButton.classList.remove('hidden');

      continueButton.textContent =
        run.lives > 0
          ? `USE LIFE SAVER (${run.lives} LEFT)`
          : `PAID CONTINUE · ₦${run.paidContinueCost.toLocaleString()}`;
    } else {
      continueButton?.classList.add('hidden');
    }

    this.hideEvent();
    this.show('over-screen');

    const controls = this.el('drive-controls');
    const menuButton = this.el('menu-btn');

    if (controls) controls.style.display = 'none';
    if (menuButton) menuButton.style.display = 'none';

    this.refreshWallet();
    this.refreshDailyMissions();
  }
}