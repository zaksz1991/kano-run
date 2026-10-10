import { CONFIG, STATE } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';

export class UI {
  constructor(game) {
    this.game = game;

    this.scoreEl = document.getElementById('score');
    this.distEl = document.getElementById('dist');
    this.paxEl = document.getElementById('pax');
    this.capEl = document.getElementById('capacity');
    this.livesEl = document.getElementById('lives');

    this.missionLabel = document.getElementById('mission-label');
    this.routeLabel = document.getElementById('route-label');
    this.radioLabel = document.getElementById('radio-label');
    this.driverLabel = document.getElementById('driver-label');
    this.toast = document.getElementById('mission-toast');

    this.eventBox = document.getElementById('event-box');
    this.eventTitle = document.getElementById('event-title');
    this.eventText = document.getElementById('event-text');
    this.eventChoices = document.getElementById('event-choices');

    this.startScreen = document.getElementById('start-screen');
    this.routeScreen = document.getElementById('route-screen');
    this.garageScreen = document.getElementById('garage-screen');
    this.overScreen = document.getElementById('over-screen');

    this._tt = null;
    this.eventOpen = false;

    this.bind();
    this.renderRoutes();
    this.renderDrivers();
    this.renderQuickDrivers();

    this.setText('hs', game.high ?? 0);

    this.syncSettingsButtons();
    this.updateDailyUI(game);
    this.showLastRun();
    this.updateSelectionStatus();
    this.maybeShowHelpOnBoot();
  }

  /* =====================================================
     DOM HELPERS
     ===================================================== */

  getElement(id) {
    return document.getElementById(id);
  }

  setText(id, value) {
    const el = this.getElement(id);
    if (el) el.textContent = String(value ?? '');
  }

  setDisplay(element, display) {
    if (element) element.style.display = display;
  }

  bindClick(id, callback) {
    const el = this.getElement(id);
    if (!el) return;

    el.addEventListener('click', (event) => {
      callback(event);
    });
  }

  /* =====================================================
     BUTTONS AND CONTROLS
     ===================================================== */

  bind() {
    this.bindClick('start-btn', () => this.game.start());

    this.bindClick('help-btn', () => this.showHelp());
    this.bindClick('hud-help', () => this.showHelp());

    this.bindClick('help-gotit', () => this.hideHelp(true));

    this.bindClick('retry-btn', () => this.game.start());
    this.bindClick('home-btn', () => this.goMainMenu());
    this.bindClick('menu-btn', () => this.goMainMenu());

    this.bindClick('share-btn', () => this.shareRun(this.game));

    this.bindClick('route-btn', () => {
      this.setDisplay(this.startScreen, 'none');
      this.setDisplay(this.routeScreen, 'flex');
    });

    this.bindClick('road-btn', () => {
      const next =
        this.game.selectedRoadMode === 'oneway'
          ? 'twoway'
          : 'oneway';

      this.game.selectedRoadMode = next;

      Storage.set('kanoRoadMode', next);

      this.updateSelectionStatus();

      this.showMissionToast(
        next === 'oneway'
          ? 'One-way road'
          : 'Two-way road'
      );
    });

    this.bindClick('route-back', () => {
      this.setDisplay(this.routeScreen, 'none');
      this.setDisplay(this.startScreen, 'flex');
    });

    this.bindClick('garage-btn', () => {
      this.setDisplay(this.startScreen, 'none');
      this.setDisplay(this.garageScreen, 'flex');
      this.renderDrivers();
    });

    this.bindClick('garage-back', () => {
      this.setDisplay(this.garageScreen, 'none');
      this.setDisplay(this.startScreen, 'flex');
    });

    this.bindClick('radio-btn', () => {
      if (typeof this.game.cycleRadio === 'function') {
        this.game.cycleRadio();
      }
    });

    this.bindHoldControl(
      'gas-btn',
      () => {
        if (typeof this.game.setThrottle === 'function') {
          this.game.setThrottle(1);
        }
      },
      () => {
        if (typeof this.game.setThrottle === 'function') {
          this.game.setThrottle(0.45);
        }
      }
    );

    this.bindHoldControl(
      'brake-btn',
      () => {
        if (typeof this.game.setBrake === 'function') {
          this.game.setBrake(true);
        }
      },
      () => {
        if (typeof this.game.setBrake === 'function') {
          this.game.setBrake(false);
        }
      }
    );

    this.bindPauseButton();

    this.bindClick('cam-btn', () => {
      if (typeof this.game.toggleCabin === 'function') {
        this.game.toggleCabin();
      }
    });

    this.bindClick('mute-btn', () => {
      const next = !Storage.getMuted();

      Storage.setMuted(next);
      Audio.muted = next;

      if (next && typeof Audio.stopEngine === 'function') {
        Audio.stopEngine();
      }

      this.syncSettingsButtons();

      this.showMissionToast(
        next ? 'Sound off' : 'Sound on'
      );
    });

    this.bindClick('quality-btn', () => {
      const next = !Storage.getLowQuality();

      Storage.setLowQuality(next);

      if (
        this.game.renderer3d &&
        typeof this.game.renderer3d.applyQuality === 'function'
      ) {
        this.game.renderer3d.applyQuality(next);
      }

      this.syncSettingsButtons();

      this.showMissionToast(
        next ? 'Performance mode' : 'High quality'
      );
    });

    this.bindClick('claim-daily', () => {
      if (typeof this.game.claimDaily === 'function') {
        this.game.claimDaily();
        this.updateDailyUI(this.game);
      }
    });
  }

  bindHoldControl(id, onPress, onRelease) {
    const el = this.getElement(id);
    if (!el) return;

    let pressed = false;

    const press = (event) => {
      if (pressed) return;

      pressed = true;

      if (event.cancelable) {
        event.preventDefault();
      }

      onPress();
    };

    const release = (event) => {
      if (!pressed) return;

      pressed = false;

      if (event && event.cancelable) {
        event.preventDefault();
      }

      onRelease();
    };

    el.addEventListener('touchstart', press, {
      passive: false
    });

    el.addEventListener('touchend', release, {
      passive: false
    });

    el.addEventListener('touchcancel', release, {
      passive: false
    });

    el.addEventListener('mousedown', press);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', release);

    window.addEventListener('blur', release);
  }

  bindPauseButton() {
    const btn = this.getElement('pause-btn');
    if (!btn) return;

    let holdTimer = null;

    btn.addEventListener('click', () => {
      if (typeof this.game.togglePause === 'function') {
        this.game.togglePause();
      }
    });

    btn.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    const startHold = () => {
      clearTimeout(holdTimer);

      holdTimer = setTimeout(() => {
        this.goMainMenu();
      }, 650);
    };

    const endHold = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
    };

    btn.addEventListener('touchstart', startHold, {
      passive: true
    });

    btn.addEventListener('touchend', endHold);
    btn.addEventListener('touchcancel', endHold);
    btn.addEventListener('mousedown', startHold);
    btn.addEventListener('mouseup', endHold);
    btn.addEventListener('mouseleave', endHold);
  }

  /* =====================================================
     ROUTE SELECTION
     ===================================================== */

  renderRoutes() {
    const list = this.getElement('route-list');
    if (!list) return;

    list.replaceChildren();

    Object.values(CONFIG.ROUTES || {}).forEach((route) => {
      const card = document.createElement('button');

      card.type = 'button';
      card.className = 'route-card';

      if (route.id === this.game.selectedRoute) {
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
      } else {
        card.setAttribute('aria-pressed', 'false');
      }

      const name = document.createElement('div');
      name.className = 'rname';
      name.textContent = route.name;

      const description = document.createElement('div');
      description.className = 'rdesc';

      description.textContent =
        `${route.description || ''} · Fare ~₦${route.baseFare ?? 0}`;

      card.append(name, description);

      card.addEventListener('click', () => {
        this.game.selectedRoute = route.id;

        Storage.setRoute(route.id);

        this.setDisplay(this.routeScreen, 'none');
        this.setDisplay(this.startScreen, 'flex');

        this.updateSelectionStatus();

        this.showMissionToast(
          `Route: ${route.name}`
        );

        this.renderRoutes();
      });

      list.appendChild(card);
    });
  }

  /* =====================================================
     DRIVER GARAGE
     ===================================================== */

  renderDrivers() {
    const list = this.getElement('driver-list');

    if (list) {
      list.replaceChildren();

      Object.values(CONFIG.DRIVERS || {}).forEach((driver) => {
        const selected =
          this.game.selectedDriver === driver.id;

        const card = document.createElement('button');

        card.type = 'button';
        card.className = 'route-card';

        card.setAttribute(
          'aria-pressed',
          selected ? 'true' : 'false'
        );

        if (selected) {
          card.classList.add('selected');
        }

        const name = document.createElement('div');
        name.className = 'rname';

        name.textContent =
          `${selected ? '✓ ' : ''}${driver.name} — ${driver.title || ''}`;

        const description = document.createElement('div');
        description.className = 'rdesc';
        description.textContent = driver.desc || '';

        card.append(name, description);

        card.addEventListener('click', () => {
          this.game.selectedDriver = driver.id;

          Storage.setDriver(driver.id);

          this.renderDrivers();
          this.renderQuickDrivers();
          this.updateSelectionStatus();

          this.showMissionToast(
            `Driver: ${driver.name}`
          );
        });

        list.appendChild(card);
      });
    }

    this.renderPaints();
    this.renderKekes();
    this.renderLeaderboard();
    this.renderAchievements();
  }

  renderQuickDrivers() {
    const box = this.getElement('quick-drivers');
    if (!box) return;

    box.replaceChildren();

    Object.values(CONFIG.DRIVERS || {}).forEach((driver) => {
      const selected =
        this.game.selectedDriver === driver.id;

      const btn = document.createElement('button');

      btn.type = 'button';
      btn.className = 'quick-driver';
      btn.textContent = driver.name;

      btn.style.padding = '8px 12px';
      btn.style.borderRadius = '20px';

      btn.style.border = selected
        ? '1px solid #fbbf24'
        : '1px solid rgba(255,255,255,0.12)';

      btn.style.background = selected
        ? 'rgba(251,191,36,0.18)'
        : 'rgba(255,255,255,0.05)';

      btn.style.color = selected
        ? '#fbbf24'
        : '#e2e8f0';

      btn.style.fontSize = '0.75rem';
      btn.style.fontWeight = '600';

      btn.addEventListener('click', () => {
        this.game.selectedDriver = driver.id;

        Storage.setDriver(driver.id);

        this.renderQuickDrivers();
        this.renderDrivers();
        this.updateSelectionStatus();

        this.showMissionToast(
          `Driver: ${driver.name}`
        );
      });

      box.appendChild(btn);
    });
  }

  /* =====================================================
     KEKE SELECTION
     ===================================================== */

  renderKekes() {
    let list = this.getElement('keke-list');

    if (!list) {
      const garage = this.garageScreen;
      if (!garage) return;

      const label = document.createElement('div');

      label.className = 'garage-section-label';
      label.textContent = 'Keke';

      list = document.createElement('div');
      list.id = 'keke-list';

      const paints = this.getElement('paint-list');

      if (paints && paints.parentNode) {
        paints.parentNode.insertBefore(label, paints);
        paints.parentNode.insertBefore(list, paints);
      } else {
        garage.append(label, list);
      }
    }

    const owned =
      Storage.get('kanoOwnedKeke', ['starter', 'ruffgold']) ||
      ['starter', 'ruffgold'];

    list.replaceChildren();

    Object.values(CONFIG.KEKES || {}).forEach((keke) => {
      const unlocked =
        owned.includes(keke.id) || Boolean(keke.unlocked);

      const selected =
        this.game.selectedKeke === keke.id;

      const card = document.createElement('button');

      card.type = 'button';
      card.className = 'route-card';

      card.disabled = !unlocked;

      if (selected) {
        card.classList.add('selected');
      }

      card.style.opacity = unlocked ? '1' : '0.5';

      const swatch = document.createElement('div');

      swatch.className = 'paint-swatch';
      swatch.style.width = '100%';
      swatch.style.height = '22px';
      swatch.style.borderRadius = '6px';

      const color =
        Number(keke.color ?? 0xfbbf24) & 0xffffff;

      swatch.style.background =
        `#${color.toString(16).padStart(6, '0')}`;

      const name = document.createElement('div');

      name.className = 'rname';
      name.textContent =
        `${selected ? '✓ ' : ''}${keke.name}`;

      const details = document.createElement('div');

      details.className = 'rdesc';

      details.textContent = unlocked
        ? `Capacity: ${keke.capacity || 3}`
        : 'Locked — reach a higher level';

      card.append(swatch, name, details);

      card.addEventListener('click', () => {
        if (!unlocked) {
          this.showMissionToast(
            'Locked — reach a higher level'
          );
          return;
        }

        this.game.selectedKeke = keke.id;

        Storage.set('kanoKeke', keke.id);

        this.game.capacity = keke.capacity || 3;

        if (
          this.game.renderer3d &&
          typeof this.game.renderer3d.applyPaint === 'function'
        ) {
          const paintMap = {
            starter: 'classic',
            ruffgold: 'ruffneck',
            sky: 'sky',
            heavy: 'forest',
            night: 'night',
            royal: 'royal'
          };

          this.game.renderer3d.applyPaint(
            paintMap[keke.id] || 'classic'
          );
        }

        this.renderKekes();

        this.showMissionToast(
          `Keke: ${keke.name}`
        );
      });

      list.appendChild(card);
    });
  }

  /* =====================================================
     PAINT SELECTION
     ===================================================== */

  renderPaints() {
    const list = this.getElement('paint-list');

    if (!list || !CONFIG.PAINTS) return;

    list.replaceChildren();

    Object.values(CONFIG.PAINTS).forEach((paint) => {
      const selected =
        this.game.selectedPaint === paint.id;

      const card = document.createElement('button');

      card.type = 'button';
      card.className = 'route-card';

      if (selected) {
        card.classList.add('selected');
      }

      const swatch = document.createElement('div');

      swatch.className = 'paint-swatch';

      const color =
        Number(paint.color ?? 0xffffff) & 0xffffff;

      swatch.style.background =
        `#${color.toString(16).padStart(6, '0')}`;

      const name = document.createElement('div');

      name.className = 'rname';
      name.textContent =
        `${selected ? '✓ ' : ''}${paint.name}`;

      card.append(swatch, name);

      card.addEventListener('click', () => {
        this.game.selectedPaint = paint.id;

        Storage.setPaint(paint.id);

        if (
          this.game.renderer3d &&
          typeof this.game.renderer3d.applyPaint === 'function'
        ) {
          this.game.renderer3d.applyPaint(paint.id);
        }

        this.renderPaints();

        this.showMissionToast(
          `Paint: ${paint.name}`
        );
      });

      list.appendChild(card);
    });
  }

  /* =====================================================
     LEADERBOARD AND ACHIEVEMENTS
     ===================================================== */

  renderLeaderboard() {
    const el = this.getElement('leaderboard');
    if (!el) return;

    const rows = Storage.getLeaderboard() || [];

    el.replaceChildren();

    if (!rows.length) {
      el.textContent = 'No runs yet — finish a drive!';
      return;
    }

    rows.forEach((row, index) => {
      const line = document.createElement('div');

      line.className = 'leaderboard-row';

      const score = Number(row.score || 0).toLocaleString();
      const distance = Number(row.dist || 0);

      line.textContent =
        `#${index + 1} ₦${score} · ${distance}km · ${row.driver || 'Driver'}`;

      el.appendChild(line);
    });
  }

  renderAchievements() {
    const el = this.getElement('ach-list');

    if (!el || !CONFIG.ACHIEVEMENTS) return;

    const unlocked = Storage.getAchievements() || {};

    el.replaceChildren();

    CONFIG.ACHIEVEMENTS.forEach((achievement) => {
      const isUnlocked = Boolean(unlocked[achievement.id]);

      const line = document.createElement('div');

      line.className = isUnlocked
        ? 'achievement unlocked'
        : 'achievement locked';

      line.textContent =
        `${isUnlocked ? '🏆' : '🔒'} ${achievement.name} — ${achievement.desc}`;

      line.style.color = isUnlocked
        ? '#fbbf24'
        : '#64748b';

      el.appendChild(line);
    });
  }

  /* =====================================================
     SCREEN MANAGEMENT
     ===================================================== */

  showStart() {
    this.game.state = STATE.START;

    this.setDisplay(this.startScreen, 'flex');
    this.setDisplay(this.routeScreen, 'none');
    this.setDisplay(this.garageScreen, 'none');
    this.setDisplay(this.overScreen, 'none');

    this.hideEvent();

    this.setText('hs', this.game.high ?? 0);

    this.updateSelectionStatus();
  }

  showPlaying() {
    this.setDisplay(this.startScreen, 'none');
    this.setDisplay(this.routeScreen, 'none');
    this.setDisplay(this.garageScreen, 'none');
    this.setDisplay(this.overScreen, 'none');

    this.hideEvent();
  }

  showGameOver(game) {
    this.setDisplay(this.overScreen, 'flex');

    const finalStats = this.getElement('final-stats');

    const destinations =
      (game.destinationsServed || []).slice(-4).join(', ') || '—';

    if (finalStats) {
      finalStats.replaceChildren();

      const score = document.createElement('strong');

      score.textContent =
        `₦${Math.floor(game.score || 0).toLocaleString()}`;

      const summary = document.createElement('div');

      summary.textContent =
        ` · ${Number(game.dist || 0).toFixed(1)} km · Lv ${game.level || 1}`;

      const passengerStats = document.createElement('div');

      passengerStats.textContent =
        `${game.totalPax || 0} passengers · ${game.dropCount || 0} drops · ${game.nearMissCount || 0} near misses`;

      const stops = document.createElement('div');

      stops.className = 'final-stops';
      stops.textContent = `Stops: ${destinations}`;

      finalStats.append(
        score,
        summary,
        passengerStats,
        stops
      );
    }

    this.setText('final-hs', game.high ?? 0);
  }

  goMainMenu() {
    try {
      this.game.state = STATE.START;
      this.game.speed = 0;
      this.game.throttle = 0;

      try {
        Audio.stopEngine();
        Audio.stopRadioBed();
      } catch (error) {
        console.warn('Audio cleanup:', error);
      }

      this.hideEvent();

      const pauseBar = this.getElement('pause-menu-bar');

      if (pauseBar) {
        pauseBar.style.display = 'none';
      }

      this.showStart();

      this.showMissionToast('Main menu');
    } catch (error) {
      console.error('Could not return to main menu:', error);
    }
  }

  /* =====================================================
     HUD AND MINIMAP
     ===================================================== */

  updateHUD(game) {
    if (this.scoreEl) {
      this.scoreEl.textContent =
        Math.floor(game.score || 0).toLocaleString();
    }

    if (this.distEl) {
      this.distEl.textContent =
        Number(game.dist || 0).toFixed(1);
    }

    if (this.paxEl) {
      this.paxEl.textContent = game.paxOnBoard ?? 0;
    }

    if (this.capEl) {
      this.capEl.textContent = game.capacity ?? 3;
    }

    if (this.livesEl) {
      this.livesEl.textContent = game.continuesLeft ?? 0;
    }

    const speedo = this.getElement('speedo');

    if (speedo) {
      speedo.textContent =
        Math.round((game.speed || 0) * 12);
    }

    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const canvas = this.getElement('minimap');

    if (!canvas || typeof canvas.getContext !== 'function') {
      return;
    }

    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Road background.
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(18, 4, 36, height - 8);

    // Lane markings.
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(30, 6);
    ctx.lineTo(30, height - 6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(42, 6);
    ctx.lineTo(42, height - 6);
    ctx.stroke();

    ctx.setLineDash([]);

    const playerY = game.playerY || 500;

    const mapY = (y) => {
      const ratio = 1 - Math.max(
        0,
        Math.min(1, y / (playerY + 80))
      );

      return 8 + ratio * (height - 16);
    };

    const mapX = (lane) =>
      24 + Math.round(Number(lane) || 0) * 12;

    // Traffic.
    for (const obstacle of game.obs || []) {
      ctx.fillStyle =
        obstacle.type === 'police' ||
        obstacle.type === 'karota'
          ? '#f59e0b'
          : '#94a3b8';

      ctx.fillRect(
        mapX(obstacle.lane) - 3,
        mapY(obstacle.y) - 4,
        6,
        8
      );
    }

    // Passenger pickup zones.
    for (const passenger of game.paxZones || []) {
      if (passenger.taken) continue;

      ctx.fillStyle = passenger.aishat
        ? '#f472b6'
        : '#4ade80';

      ctx.beginPath();

      ctx.arc(
        mapX(passenger.lane),
        mapY(passenger.y),
        3,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    // Player.
    ctx.fillStyle = '#fbbf24';

    ctx.fillRect(
      mapX(game.playerLane) - 4,
      height - 18,
      8,
      12
    );
  }

  /* =====================================================
     LABELS AND STATUS
     ===================================================== */

  setMission(text) {
    if (this.missionLabel) {
      this.missionLabel.textContent = `🎯 ${text || ''}`;
    }
  }

  setRouteLabel(text) {
    if (this.routeLabel) {
      this.routeLabel.textContent = text || '';
    }
  }

  setRadio(text) {
    if (this.radioLabel) {
      this.radioLabel.textContent = `📻 ${text || ''}`;
    }
  }

  setDriverLabel(text) {
    if (this.driverLabel) {
      this.driverLabel.textContent = `👤 ${text || ''}`;
    }
  }

  showMissionToast(message) {
    if (!this.toast) return;

    this.toast.textContent = message || '';
    this.toast.style.opacity = '1';

    clearTimeout(this._tt);

    this._tt = setTimeout(() => {
      if (this.toast) {
        this.toast.style.opacity = '0';
      }
    }, 1600);
  }

  updateSelectionStatus() {
    const el = this.getElement('selection-status');
    const roadBtn = this.getElement('road-btn');

    const route =
      (CONFIG.ROUTES || {})[this.game.selectedRoute];

    const drivers = CONFIG.DRIVERS || {};

    const driver =
      drivers[this.game.selectedDriver] ||
      drivers.ruffneck ||
      Object.values(drivers)[0];

    const roadModes = CONFIG.ROAD_MODES || {};

    const road =
      roadModes[this.game.selectedRoadMode] ||
      { name: 'Two-way' };

    const routeCount =
      Object.keys(CONFIG.ROUTES || {}).length;

    if (el) {
      el.replaceChildren();

      const driverName = document.createElement('strong');

      driverName.style.color = '#fbbf24';
      driverName.textContent = driver?.name || 'Driver';

      const routeText = document.createElement('span');

      routeText.textContent =
        ` · ${route?.name || 'Route'}`;

      const details = document.createElement('div');

      details.textContent =
        `${road.name} · ${routeCount} routes`;

      el.append(driverName, routeText, details);
    }

    if (roadBtn) {
      roadBtn.textContent =
        `ROAD: ${(road.name || 'TWO-WAY').toUpperCase()}`;
    }
  }

  syncSettingsButtons() {
    const muteBtn = this.getElement('mute-btn');
    const qualityBtn = this.getElement('quality-btn');

    if (muteBtn) {
      muteBtn.textContent = Storage.getMuted()
        ? '🔇 Muted'
        : '🔊 Sound';
    }

    if (qualityBtn) {
      qualityBtn.textContent = Storage.getLowQuality()
        ? '⚡ Performance'
        : '✨ Quality';
    }
  }

  setCamLabel(mode) {
    const btn = this.getElement('cam-btn');
    if (!btn) return;

    const labels = {
      chase: 'CAM',
      driver: 'DRV',
      passenger: 'PAX',
      road: 'ROAD'
    };

    btn.textContent = labels[mode] || 'CAM';
  }

  setTyreStatus(punctured, wear) {
    const el = this.getElement('tyre-status');
    const wrap = this.getElement('tyre-stat');

    if (!el) return;

    if (punctured) {
      el.textContent = 'FLAT';

      if (wrap) wrap.style.color = '#ef4444';
    } else if (wear > 70) {
      el.textContent = 'WORN';

      if (wrap) wrap.style.color = '#f59e0b';
    } else if (wear > 40) {
      el.textContent = 'FAIR';

      if (wrap) wrap.style.color = '#fbbf24';
    } else {
      el.textContent = 'OK';

      if (wrap) wrap.style.color = '#94a3b8';
    }
  }

  setCondition(value) {
    const el = this.getElement('condition');
    if (!el) return;

    const condition = Math.max(
      0,
      Math.round(Number(value) || 0)
    );

    el.textContent = condition;

    if (el.parentElement) {
      el.parentElement.style.color =
        condition < 30
          ? '#ef4444'
          : condition < 60
            ? '#fb923c'
            : '#94a3b8';
    }
  }

  setFuel(value) {
    const el = this.getElement('fuel');

    if (el) {
      el.textContent = Math.max(
        0,
        Math.round(Number(value) || 0)
      );
    }
  }

  setZone(zone) {
    const el = this.getElement('zone-label');
    if (!el) return;

    if (!zone || zone === 'road') {
      el.textContent = '';
      return;
    }

    el.textContent =
      zone === 'market'
        ? '🛒 MARKET'
        : '🔀 JUNCTION';
  }

  setLevel(level) {
    this.setText('level-label', `Lv ${level}`);
  }

  setOnboardDest(passengers) {
    const el = this.getElement('onboard-dest');
    if (!el) return;

    if (!passengers || !passengers.length) {
      el.style.opacity = '0';
      el.textContent = '';
      return;
    }

    el.style.opacity = '1';

    el.textContent =
      'Onboard: ' +
      passengers
        .map((passenger) => {
          const destination = passenger.dest || '?';

          return destination +
            (passenger.name === 'VIP' ? '★' : '');
        })
        .join(' · ');
  }

  /* =====================================================
     EVENTS AND CHOICES
     ===================================================== */

  showEvent(titleOrEvent, text, choices) {
    let eventData;

    // Current object-based event format.
    if (
      titleOrEvent &&
      typeof titleOrEvent === 'object'
    ) {
      eventData = titleOrEvent;
    } else {
      // Legacy three-argument event format.
      eventData = {
        title: titleOrEvent,
        text,
        actions: choices
      };
    }

    const title = eventData.title || 'Event';
    const description = eventData.text || '';

    const actions =
      eventData.actions ||
      eventData.choices ||
      [];

    if (!this.eventBox) return;

    if (this.eventTitle) {
      this.eventTitle.textContent = title;
    }

    if (this.eventText) {
      this.eventText.textContent = description;
    }

    if (this.eventChoices) {
      this.eventChoices.replaceChildren();

      actions.forEach((choice) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.textContent =
          choice.label || choice.title || 'Continue';

        button.addEventListener('click', (event) => {
          event.preventDefault();

          this.hideEvent();

          try {
            if (typeof choice.onClick === 'function') {
              choice.onClick();
            } else if (typeof choice.action === 'function') {
              choice.action();
            } else if (typeof choice.callback === 'function') {
              choice.callback();
            }
          } catch (error) {
            console.error('Event choice failed:', error);
          }
        });

        this.eventChoices.appendChild(button);
      });
    }

    this.eventOpen = true;
    this.eventBox.style.display = 'block';

    // Preserve the existing game state. The game may
    // manage event state itself.
    if (eventData.setEventState === true) {
      this.game.state = STATE.EVENT;
    }
  }

  hideEvent() {
    this.eventOpen = false;

    if (this.eventBox) {
      this.eventBox.style.display = 'none';
    }
  }

  /* =====================================================
     HELP OVERLAY
     ===================================================== */

  showHelp() {
    const el = this.getElement('help-overlay');

    if (el) {
      el.style.display = 'flex';
    }
  }

  hideHelp(remember = false) {
    const el = this.getElement('help-overlay');

    if (el) {
      el.style.display = 'none';
    }

    if (remember) {
      try {
        localStorage.setItem('kanoHelpSeen', '1');
      } catch (error) {
        // Storage may be disabled by the browser.
      }
    }
  }

  maybeShowHelpOnBoot() {
    try {
      if (!localStorage.getItem('kanoHelpSeen')) {
        this.showHelp();
      }
    } catch (error) {
      this.showHelp();
    }
  }

  /* =====================================================
     DAILY REWARD AND LAST RUN
     ===================================================== */

  showLastRun() {
    const box = this.getElement('daily-box');
    if (!box) return;

    const lastRun = Storage.get('kanoLastRun', null);

    if (lastRun && lastRun.score) {
      box.title =
        `Last run: ₦${lastRun.score} · ${lastRun.dist}km · Lv${lastRun.level || 1}`;
    }
  }

  updateDailyUI(game) {
    const box = this.getElement('daily-box');
    const claim = this.getElement('claim-daily');

    if (!box) return;

    const streak = Storage.getStreak();
    const claimed = Storage.isDailyClaimed();

    if (claimed) {
      box.textContent =
        `📅 Daily claimed · Streak ${streak} day${streak === 1 ? '' : 's'}`;

      if (claim) {
        claim.style.display = 'none';
      }
    } else {
      box.textContent =
        `📅 Daily reward ready · Current streak ${streak}`;

      if (claim) {
        claim.style.display = 'inline-block';
      }
    }
  }

  /* =====================================================
     PAUSE MENU
     ===================================================== */

  setPauseUI(paused) {
    const pauseBtn = this.getElement('pause-btn');

    if (pauseBtn) {
      pauseBtn.textContent = paused ? '▶' : '❚❚';
    }

    let bar = this.getElement('pause-menu-bar');

    if (paused) {
      if (!bar) {
        bar = document.createElement('div');

        bar.id = 'pause-menu-bar';
        bar.className = 'pause-menu-bar';

        const title = document.createElement('div');

        title.className = 'pause-menu-title';
        title.textContent = 'PAUSED';

        const resume = document.createElement('button');

        resume.type = 'button';
        resume.className = 'btn';
        resume.textContent = 'RESUME';

        resume.addEventListener('click', () => {
          if (typeof this.game.togglePause === 'function') {
            this.game.togglePause();
          }
        });

        const menu = document.createElement('button');

        menu.type = 'button';
        menu.className = 'btn secondary';
        menu.id = 'menu-btn';
        menu.textContent = 'MAIN MENU';

        menu.addEventListener('click', () => {
          this.goMainMenu();
        });

        bar.append(title, resume, menu);

        document.body.appendChild(bar);
      }

      bar.style.display = 'flex';
    } else if (bar) {
      bar.style.display = 'none';
    }
  }

  /* =====================================================
     SHARE RUN
     ===================================================== */

  async shareRun(game) {
    const routes = CONFIG.ROUTES || {};
    const drivers = CONFIG.DRIVERS || {};

    const route = routes[game.selectedRoute];

    const driver =
      drivers[game.selectedDriver] ||
      drivers.ruffneck ||
      Object.values(drivers)[0];

    const text =
      `I just drove ₦${Math.floor(game.score || 0).toLocaleString()} ` +
      `on ${route?.name || 'Kano'} as ${driver?.name || 'a driver'} ` +
      `in Kano Run 3D! ` +
      `${Number(game.dist || 0).toFixed(1)} km · ` +
      `${game.totalPax || 0} passengers. ` +
      'Play: https://kano-run.vercel.app';

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Kano Run',
          text,
          url: 'https://kano-run.vercel.app'
        });

        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);

        this.showMissionToast(
          'Copied result to clipboard'
        );

        return;
      }

      window.prompt('Copy your run:', text);
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);

          this.showMissionToast(
            'Copied result to clipboard'
          );
        } else {
          window.prompt('Copy your run:', text);
        }
      } catch (clipboardError) {
        console.error(
          'Could not share run:',
          clipboardError
        );

        this.showMissionToast(
          'Unable to share run'
        );
      }
    }
  }
}