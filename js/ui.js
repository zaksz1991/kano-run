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

    this.toastTimer = null;
    this.helpShown = false;

    this.bind();
    this.renderRoutes();
    this.renderDrivers();
    this.renderQuickDrivers();

    const highScore = document.getElementById('hs');
    if (highScore) highScore.textContent = game.high ?? 0;

    this.syncSettingsButtons();
    this.updateDailyUI(game);
    this.showLastRun();
    this.updateSelectionStatus();
    this.maybeShowHelpOnBoot();
  }

  // ------------------------------------------------------------
  // DOM helpers
  // ------------------------------------------------------------

  $(id) {
    return document.getElementById(id);
  }

  setText(id, value) {
    const element = this.$(id);
    if (element) element.textContent = String(value ?? '');
  }

  show(element, display = 'flex') {
    if (element) element.style.display = display;
  }

  hide(element) {
    if (element) element.style.display = 'none';
  }

  makeCard(title, description = '') {
    const card = document.createElement('div');
    card.className = 'route-card';

    const heading = document.createElement('div');
    heading.className = 'rname';
    heading.textContent = title;
    card.appendChild(heading);

    if (description) {
      const detail = document.createElement('div');
      detail.className = 'rdesc';
      detail.textContent = description;
      card.appendChild(detail);
    }

    return card;
  }

  // ------------------------------------------------------------
  // Controls and event bindings
  // ------------------------------------------------------------

  bind() {
    const startBtn = this.$('start-btn');
    if (startBtn) startBtn.onclick = () => this.game.start();

    const helpBtn = this.$('help-btn');
    if (helpBtn) helpBtn.onclick = () => this.showHelp();

    const hudHelp = this.$('hud-help');
    if (hudHelp) hudHelp.onclick = () => this.showHelp();

    const helpGotIt = this.$('help-gotit');
    if (helpGotIt) helpGotIt.onclick = () => this.hideHelp(true);

    const retryBtn = this.$('retry-btn');
    if (retryBtn) retryBtn.onclick = () => this.game.start();

    const homeBtn = this.$('home-btn');
    if (homeBtn) homeBtn.onclick = () => this.goMainMenu();

    const shareBtn = this.$('share-btn');
    if (shareBtn) {
      shareBtn.onclick = () => this.shareRun(this.game);
    }

    const routeBtn = this.$('route-btn');
    if (routeBtn) {
      routeBtn.onclick = () => {
        this.hide(this.startScreen);
        this.show(this.routeScreen);
      };
    }

    const routeBack = this.$('route-back');
    if (routeBack) {
      routeBack.onclick = () => {
        this.hide(this.routeScreen);
        this.showStart();
      };
    }

    const garageBtn = this.$('garage-btn');
    if (garageBtn) {
      garageBtn.onclick = () => {
        this.hide(this.startScreen);
        this.show(this.garageScreen);
        this.renderDrivers();
      };
    }

    const garageBack = this.$('garage-back');
    if (garageBack) {
      garageBack.onclick = () => {
        this.hide(this.garageScreen);
        this.showStart();
      };
    }

    const roadBtn = this.$('road-btn');
    if (roadBtn) {
      roadBtn.onclick = () => {
        const current = this.game.selectedRoadMode || 'oneway';
        const next = current === 'oneway' ? 'twoway' : 'oneway';

        this.game.selectedRoadMode = next;
        Storage.set('kanoRoadMode', next);

        this.updateSelectionStatus();
        this.showMissionToast(
          next === 'oneway' ? 'One-way road' : 'Two-way road'
        );
      };
    }

    const radioBtn = this.$('radio-btn');
    if (radioBtn) {
      radioBtn.onclick = () => {
        if (typeof this.game.cycleRadio === 'function') {
          this.game.cycleRadio();
        }
      };
    }

    const gas = this.$('gas-btn');
    const brake = this.$('brake-btn');

    const holdControl = (element, onDown, onUp) => {
      if (!element) return;

      let pressed = false;

      const down = (event) => {
        if (event.type === 'mousedown' && event.button !== 0) return;
        event.preventDefault();

        if (pressed) return;
        pressed = true;
        onDown();
      };

      const up = (event) => {
        if (event) event.preventDefault();
        if (!pressed) return;

        pressed = false;
        onUp();
      };

      element.addEventListener('touchstart', down, { passive: false });
      element.addEventListener('mousedown', down);
      element.addEventListener('touchend', up, { passive: false });
      element.addEventListener('touchcancel', up, { passive: false });
      element.addEventListener('mouseup', up);
      element.addEventListener('mouseleave', up);

      window.addEventListener('blur', up);
    };

    holdControl(
      gas,
      () => this.game.setThrottle(1),
      () => this.game.setThrottle(0.45)
    );

    holdControl(
      brake,
      () => this.game.setBrake(true),
      () => this.game.setBrake(false)
    );

    // Pause is handled by the Controls module to avoid duplicate toggles.

    const camBtn = this.$('cam-btn');
    if (camBtn) {
      camBtn.onclick = () => {
        if (typeof this.game.toggleCabin === 'function') {
          this.game.toggleCabin();
        }
      };
    }

    const muteBtn = this.$('mute-btn');
    if (muteBtn) {
      muteBtn.onclick = () => {
        const muted = !Storage.getMuted();

        Storage.setMuted(muted);
        Audio.muted = muted;

        if (muted && typeof Audio.stopEngine === 'function') {
          Audio.stopEngine();
        }

        this.syncSettingsButtons();
        this.showMissionToast(muted ? 'Sound off' : 'Sound on');
      };
    }

    const qualityBtn = this.$('quality-btn');
    if (qualityBtn) {
      qualityBtn.onclick = () => {
        const lowQuality = !Storage.getLowQuality();

        Storage.setLowQuality(lowQuality);

        if (this.game.renderer3d?.applyQuality) {
          this.game.renderer3d.applyQuality(lowQuality);
        }

        this.syncSettingsButtons();
        this.showMissionToast(
          lowQuality ? 'Performance mode' : 'High quality'
        );
      };
    }

    const claimDaily = this.$('claim-daily');
    if (claimDaily) {
      claimDaily.onclick = () => {
        if (typeof this.game.claimDaily === 'function') {
          this.game.claimDaily();
          this.updateDailyUI(this.game);
        }
      };
    }
  }

  // ------------------------------------------------------------
  // Route selection
  // ------------------------------------------------------------

  renderRoutes() {
    const list = this.$('route-list');
    if (!list) return;

    list.replaceChildren();
    list.style.maxHeight = '55vh';
    list.style.overflowY = 'auto';

    const routes = Object.values(CONFIG.ROUTES || {});

    const heading = document.createElement('div');
    heading.style.cssText =
      'font-size:.8rem;color:#f5c542;margin-bottom:10px;font-weight:700';
    heading.textContent = `${routes.length} Kano State routes — select a route`;
    list.appendChild(heading);

    routes.forEach((route, index) => {
      const card = document.createElement('div');
      card.className = 'route-card';

      const name = document.createElement('div');
      name.className = 'rname';
      name.textContent = `${index + 1}. ${route.name || route.id}`;
      card.appendChild(name);

      const description = document.createElement('div');
      description.className = 'rdesc';

      const details = [
        route.description || '',
        `Fare: ₦${Number(route.baseFare || 0).toLocaleString()}`
      ];

      description.textContent = details.filter(Boolean).join(' · ');
      card.appendChild(description);

      if (Array.isArray(route.landmarks) && route.landmarks.length) {
        const landmarks = document.createElement('div');
        landmarks.style.cssText =
          'color:#94a3b8;font-size:.75rem;margin-top:4px';
        landmarks.textContent = route.landmarks.slice(0, 3).join(' · ');
        card.appendChild(landmarks);
      }

      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      const selectRoute = () => {
        this.game.selectedRoute = route.id;
        Storage.setRoute(route.id);

        this.hide(this.routeScreen);
        this.showStart();
        this.updateSelectionStatus();
        this.showMissionToast(`Route: ${route.name || route.id}`);
      };

      card.addEventListener('click', selectRoute);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectRoute();
        }
      });

      list.appendChild(card);
    });
  }

  // ------------------------------------------------------------
  // Driver selection
  // ------------------------------------------------------------

  renderDrivers() {
    const list = this.$('driver-list');

    if (list) {
      list.replaceChildren();

      Object.values(CONFIG.DRIVERS || {}).forEach((driver) => {
        const selected = this.game.selectedDriver === driver.id;
        const card = this.makeCard(
          `${selected ? '✓ ' : ''}${driver.name} — ${driver.title || 'Driver'}`,
          driver.desc || ''
        );

        if (selected) card.style.borderColor = '#f5c542';

        card.tabIndex = 0;
        card.setAttribute('role', 'button');

        const selectDriver = () => this.selectDriver(driver);

        card.addEventListener('click', selectDriver);
        card.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectDriver();
          }
        });

        list.appendChild(card);
      });
    }

    this.renderPaints();
    this.renderKekes();
    this.renderLeaderboard();
    this.renderAchievements();
  }

  selectDriver(driver) {
    this.game.selectedDriver = driver.id;
    Storage.setDriver(driver.id);

    this.renderDrivers();
    this.renderQuickDrivers();
    this.updateSelectionStatus();
    this.showMissionToast(`Driver: ${driver.name}`);
  }

  renderQuickDrivers() {
    const box = this.$('quick-drivers');
    if (!box) return;

    box.replaceChildren();

    Object.values(CONFIG.DRIVERS || {}).forEach((driver) => {
      const selected = this.game.selectedDriver === driver.id;
      const button = document.createElement('button');

      button.type = 'button';
      button.textContent = driver.name;

      button.style.cssText = [
        'padding:8px 12px',
        'border-radius:20px',
        `border:1px solid ${selected ? '#f5c542' : 'rgba(255,255,255,.12)'}`,
        `background:${selected ? 'rgba(245,197,66,.2)' : 'rgba(255,255,255,.05)'}`,
        `color:${selected ? '#f5c542' : '#e2e8f0'}`,
        'font-size:.75rem',
        'font-weight:600',
        'cursor:pointer',
        'font-family:inherit'
      ].join(';');

      button.onclick = () => this.selectDriver(driver);
      box.appendChild(button);
    });
  }

  // ------------------------------------------------------------
  // Keke selection
  // ------------------------------------------------------------

  renderKekes() {
    let list = this.$('keke-list');

    if (!list) {
      const garage = this.$('garage-screen');
      const paints = this.$('paint-list');

      if (!garage || !paints || !paints.parentNode) return;

      const label = document.createElement('div');
      label.style.cssText =
        'font-size:.75rem;color:#94a3b8;margin:12px 0 8px;text-transform:uppercase;letter-spacing:.08em';
      label.textContent = 'Keke selection';

      list = document.createElement('div');
      list.id = 'keke-list';
      list.style.cssText =
        'width:100%;max-width:360px;display:grid;grid-template-columns:1fr 1fr;gap:8px';

      paints.parentNode.insertBefore(label, paints);
      paints.parentNode.insertBefore(list, paints);
    }

    list.replaceChildren();

    const owned = Storage.get('kanoOwnedKeke', ['starter', 'ruffgold'])
      || ['starter', 'ruffgold'];

    Object.values(CONFIG.KEKES || {}).forEach((keke) => {
      const unlocked = owned.includes(keke.id) || Boolean(keke.unlocked);
      const selected = this.game.selectedKeke === keke.id;

      const card = document.createElement('div');
      card.className = 'route-card';
      card.style.padding = '10px';
      card.style.opacity = unlocked ? '1' : '.45';

      if (selected) card.style.borderColor = '#f5c542';

      const swatch = document.createElement('div');
      swatch.style.cssText =
        'height:20px;border-radius:6px;margin-bottom:6px';

      const color = Number(keke.color);
      swatch.style.background = Number.isFinite(color)
        ? `#${color.toString(16).padStart(6, '0').slice(-6)}`
        : '#64748b';

      card.appendChild(swatch);

      const name = document.createElement('div');
      name.className = 'rname';
      name.style.fontSize = '.78rem';
      name.textContent = `${selected ? '✓ ' : ''}${keke.name}`;
      card.appendChild(name);

      const detail = document.createElement('div');
      detail.className = 'rdesc';
      detail.textContent = unlocked
        ? `Capacity: ${keke.capacity || 3}`
        : `Locked${keke.level ? ` — Level ${keke.level}` : ''}`;
      card.appendChild(detail);

      card.onclick = () => {
        if (!unlocked) {
          this.showMissionToast('Locked — reach a higher level');
          return;
        }

        this.game.selectedKeke = keke.id;
        Storage.set('kanoKeke', keke.id);
        this.game.capacity = keke.capacity || 3;

        const paintMap = {
          starter: 'classic',
          ruffgold: 'ruffneck',
          sky: 'sky',
          heavy: 'forest',
          night: 'night',
          royal: 'royal'
        };

        const paint = paintMap[keke.id] || 'classic';

        if (this.game.renderer3d?.applyPaint) {
          this.game.renderer3d.applyPaint(paint);
        }

        this.renderKekes();
        this.updateSelectionStatus();
        this.showMissionToast(`Keke: ${keke.name}`);
      };

      list.appendChild(card);
    });
  }

  // ------------------------------------------------------------
  // Paint selection
  // ------------------------------------------------------------

  renderPaints() {
    const list = this.$('paint-list');
    if (!list || !CONFIG.PAINTS) return;

    list.replaceChildren();

    Object.values(CONFIG.PAINTS).forEach((paint) => {
      const selected = this.game.selectedPaint === paint.id;
      const card = document.createElement('div');

      card.className = 'route-card';
      card.style.padding = '10px';

      if (selected) card.style.borderColor = '#f5c542';

      const swatch = document.createElement('div');
      swatch.style.cssText =
        'height:22px;border-radius:6px;margin-bottom:6px';

      const color = Number(paint.color);
      swatch.style.background = Number.isFinite(color)
        ? `#${color.toString(16).padStart(6, '0').slice(-6)}`
        : '#64748b';

      card.appendChild(swatch);

      const name = document.createElement('div');
      name.className = 'rname';
      name.style.fontSize = '.8rem';
      name.textContent = `${selected ? '✓ ' : ''}${paint.name}`;
      card.appendChild(name);

      card.onclick = () => {
        this.game.selectedPaint = paint.id;
        Storage.setPaint(paint.id);

        if (this.game.renderer3d?.applyPaint) {
          this.game.renderer3d.applyPaint(paint.id);
        }

        this.renderPaints();
        this.showMissionToast(`Paint: ${paint.name}`);
      };

      list.appendChild(card);
    });
  }

  // ------------------------------------------------------------
  // Leaderboard and achievements
  // ------------------------------------------------------------

  renderLeaderboard() {
    const element = this.$('leaderboard');
    if (!element) return;

    const rows = Storage.getLeaderboard() || [];
    element.replaceChildren();

    if (!rows.length) {
      element.textContent = 'No runs yet — finish a drive!';
      return;
    }

    rows.forEach((row, index) => {
      const item = document.createElement('div');
      item.style.cssText =
        'padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)';

      const score = Number(row.score || 0).toLocaleString();
      const distance = Number(row.dist || 0).toFixed(1);
      const driver = row.driver || 'Driver';

      item.textContent =
        `#${index + 1} ₦${score} · ${distance} km · ${driver}`;

      element.appendChild(item);
    });
  }

  renderAchievements() {
    const element = this.$('ach-list');
    if (!element || !CONFIG.ACHIEVEMENTS) return;

    const unlocked = Storage.getAchievements() || {};
    element.replaceChildren();

    CONFIG.ACHIEVEMENTS.forEach((achievement) => {
      const isUnlocked = Boolean(unlocked[achievement.id]);
      const item = document.createElement('div');

      item.style.cssText =
        `padding:5px 0;color:${isUnlocked ? '#f5c542' : '#64748b'}`;

      item.textContent =
        `${isUnlocked ? '🏆' : '🔒'} ${achievement.name} — ${achievement.desc}`;

      element.appendChild(item);
    });
  }

  // ------------------------------------------------------------
  // Screen transitions
  // ------------------------------------------------------------

  showStart() {
    this.game.state = STATE.START;

    this.hide(this.overScreen);
    this.hide(this.routeScreen);
    this.hide(this.garageScreen);
    this.show(this.startScreen);

    this.setText('hs', this.game.high ?? 0);
    this.hideEvent();
    this.updateSelectionStatus();
  }

  showPlaying() {
    this.hide(this.startScreen);
    this.hide(this.routeScreen);
    this.hide(this.garageScreen);
    this.hide(this.overScreen);
    this.hideEvent();
    this.setPauseUI(false);
  }

  showGameOver(game) {
    this.show(this.overScreen);

    const destinations = (game.destinationsServed || [])
      .slice(-4)
      .join(', ') || '—';

    const stats = this.$('final-stats');

    if (stats) {
      stats.replaceChildren();

      const score = document.createElement('strong');
      score.textContent = `₦${Math.floor(game.score || 0).toLocaleString()}`;
      stats.appendChild(score);

      stats.appendChild(
        document.createTextNode(
          ` · ${Number(game.dist || 0).toFixed(1)} km · Lv ${game.level || 1}`
        )
      );

      stats.appendChild(document.createElement('br'));

      stats.appendChild(
        document.createTextNode(
          `${game.totalPax || 0} passengers · ${game.dropCount || 0} drops · ${game.nearMissCount || 0} near misses`
        )
      );

      stats.appendChild(document.createElement('br'));

      const stops = document.createElement('span');
      stops.style.cssText = 'color:#94a3b8;font-size:.8rem';
      stops.textContent = `Stops: ${destinations}`;
      stats.appendChild(stops);
    }

    this.setText('final-hs', game.high ?? 0);
    this.hideEvent();
    this.setPauseUI(false);
  }

  goMainMenu() {
    this.game.state = STATE.START;
    this.game.speed = 0;
    this.game.throttle = 0;

    try {
      if (typeof Audio.stopEngine === 'function') Audio.stopEngine();
      if (typeof Audio.stopRadioBed === 'function') Audio.stopRadioBed();
    } catch (error) {
      console.warn('Unable to stop audio:', error);
    }

    this.hideEvent();
    this.setPauseUI(false);
    this.showStart();
    this.showMissionToast('Main menu');
  }

  // ------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------

  updateHUD(game) {
    if (this.scoreEl) {
      this.scoreEl.textContent = Math.floor(game.score || 0).toLocaleString();
    }

    if (this.distEl) {
      this.distEl.textContent = Number(game.dist || 0).toFixed(1);
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

    const speedometer = this.$('speedo');
    if (speedometer) {
      speedometer.textContent = Math.round((game.speed || 0) * 14);
    }

    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const canvas = this.$('minimap');
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const width = canvas.width;
    const height = canvas.height;

    context.clearRect(0, 0, width, height);

    context.fillStyle = '#1e293b';
    context.fillRect(18, 4, 36, height - 8);

    context.strokeStyle = '#eab308';
    context.lineWidth = 1;
    context.setLineDash([4, 4]);

    for (const x of [30, 42]) {
      context.beginPath();
      context.moveTo(x, 6);
      context.lineTo(x, height - 6);
      context.stroke();
    }

    context.setLineDash([]);

    const playerY = Number(game.playerY) || 500;
    const denominator = Math.max(1, playerY + 80);

    const mapY = (y) => {
      const normalized = Math.max(
        0,
        Math.min(1, Number(y || 0) / denominator)
      );

      return 8 + (1 - normalized) * (height - 16);
    };

    const mapX = (lane) => {
      const index = Math.max(0, Math.min(2, Math.round(Number(lane) || 0)));
      return 24 + index * 12;
    };

    for (const obstacle of game.obs || []) {
      context.fillStyle =
        obstacle.type === 'police' || obstacle.type === 'karota'
          ? '#f59e0b'
          : '#94a3b8';

      context.fillRect(
        mapX(obstacle.lane) - 3,
        mapY(obstacle.y) - 4,
        6,
        8
      );
    }

    for (const passengerZone of game.paxZones || []) {
      if (passengerZone.taken) continue;

      context.fillStyle = passengerZone.aishat ? '#f472b6' : '#4ade80';
      context.beginPath();
      context.arc(
        mapX(passengerZone.lane),
        mapY(passengerZone.y),
        3,
        0,
        Math.PI * 2
      );
      context.fill();
    }

    context.fillStyle = '#fbbf24';
    context.fillRect(
      mapX(game.playerLane) - 4,
      height - 18,
      8,
      12
    );
  }

  // ------------------------------------------------------------
  // Labels and notifications
  // ------------------------------------------------------------

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

    this.toast.textContent = String(message ?? '');
    this.toast.style.opacity = '1';

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      if (this.toast) this.toast.style.opacity = '0';
      this.toastTimer = null;
    }, 1800);
  }

  // Alias for older game code that may call showToast().
  showToast(message) {
    this.showMissionToast(message);
  }

  // Alias for code that uses a weather notification.
  uiWeatherToast(message) {
    this.showMissionToast(message);
  }

  // ------------------------------------------------------------
  // Events and choices
  // ------------------------------------------------------------

  showEvent(title, text, choices = []) {
    if (!this.eventBox || !this.eventTitle || !this.eventText || !this.eventChoices) {
      console.warn('Event UI elements are missing.');
      return;
    }

    this.eventTitle.textContent = title || '';
    this.eventText.textContent = text || '';
    this.eventChoices.replaceChildren();
    this.eventBox.style.display = 'block';
    this.game.state = STATE.EVENT;

    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label || 'Continue';

      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.hideEvent();

        if (typeof choice.action === 'function') {
          try {
            choice.action();
          } catch (error) {
            console.error('Event action failed:', error);
          }
        }
      });

      this.eventChoices.appendChild(button);
    });
  }

  hideEvent() {
    this.hide(this.eventBox);
  }

  // ------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------

  syncSettingsButtons() {
    const muteButton = this.$('mute-btn');
    const qualityButton = this.$('quality-btn');

    if (muteButton) {
      muteButton.textContent = Storage.getMuted() ? '🔇 Muted' : '🔊 Sound';
    }

    if (qualityButton) {
      qualityButton.textContent = Storage.getLowQuality()
        ? '⚡ Performance'
        : '✨ Quality';
    }
  }

  setCamLabel(mode) {
    const button = this.$('cam-btn');
    if (!button) return;

    const labels = {
      chase: 'CAM',
      driver: 'DRV',
      passenger: 'PAX',
      road: 'ROAD'
    };

    button.textContent = labels[mode] || 'CAM';
  }

  setPauseUI(paused) {
    const pauseButton = this.$('pause-btn');

    if (pauseButton) {
      pauseButton.textContent = paused ? '▶' : '❚❚';
    }

    let bar = this.$('pause-menu-bar');

    if (!paused) {
      if (bar) bar.style.display = 'none';
      return;
    }

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pause-menu-bar';

      bar.style.cssText = [
        'position:fixed',
        'top:50%',
        'left:50%',
        'transform:translate(-50%,-50%)',
        'z-index:500',
        'display:flex',
        'flex-direction:column',
        'gap:10px',
        'align-items:center',
        'background:rgba(10,15,28,.96)',
        'padding:20px 28px',
        'border-radius:16px',
        'border:1px solid rgba(245,197,66,.35)'
      ].join(';');

      const heading = document.createElement('div');
      heading.style.cssText =
        'color:#f5c542;font-weight:700;margin-bottom:4px';
      heading.textContent = 'Paused';

      const resumeButton = document.createElement('button');
      resumeButton.className = 'btn';
      resumeButton.type = 'button';
      resumeButton.textContent = 'RESUME';
      resumeButton.onclick = () => {
        if (typeof this.game.togglePause === 'function') {
          this.game.togglePause();
        }
      };

      const menuButton = document.createElement('button');
      menuButton.className = 'btn secondary';
      menuButton.type = 'button';
      menuButton.id = 'menu-btn';
      menuButton.textContent = 'MAIN MENU';
      menuButton.onclick = () => this.goMainMenu();

      bar.append(heading, resumeButton, menuButton);
      document.body.appendChild(bar);
    }

    bar.style.display = 'flex';
  }

  // ------------------------------------------------------------
  // Help overlay
  // ------------------------------------------------------------

  showHelp() {
    const overlay = this.$('help-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      this.helpShown = true;
    }
  }

  hideHelp(remember = false) {
    const overlay = this.$('help-overlay');
    if (overlay) overlay.style.display = 'none';

    if (remember) {
      try {
        localStorage.setItem('kanoHelpSeen', '1');
      } catch {
        // Storage may be unavailable in private browsing.
      }
    }
  }

  maybeShowHelpOnBoot() {
    try {
      if (!localStorage.getItem('kanoHelpSeen')) {
        this.showHelp();
      }
    } catch {
      this.showHelp();
    }
  }

  // ------------------------------------------------------------
  // Selection status
  // ------------------------------------------------------------

  updateSelectionStatus() {
    const element = this.$('selection-status');
    const roadButton = this.$('road-btn');

    const routes = CONFIG.ROUTES || {};
    const drivers = CONFIG.DRIVERS || {};
    const roadModes = CONFIG.ROAD_MODES || {};

    const route = routes[this.game.selectedRoute];
    const driver =
      drivers[this.game.selectedDriver] || drivers.ruffneck;

    const road = roadModes[this.game.selectedRoadMode] || {
      name: this.game.selectedRoadMode === 'oneway'
        ? 'One-way'
        : 'Two-way'
    };

    const routeCount = Object.keys(routes).length;

    if (element) {
      element.replaceChildren();

      const driverName = document.createElement('strong');
      driverName.style.color = '#f5c542';
      driverName.textContent = driver?.name || 'Driver';

      element.appendChild(driverName);
      element.appendChild(
        document.createTextNode(` · ${route?.name || 'Route'}`)
      );
      element.appendChild(document.createElement('br'));
      element.appendChild(
        document.createTextNode(`${road.name} · ${routeCount} routes`)
      );
    }

    if (roadButton) {
      roadButton.textContent =
        `ROAD: ${(road.name || 'TWO-WAY').toUpperCase()}`;
    }
  }

  // ------------------------------------------------------------
  // Daily reward and previous run
  // ------------------------------------------------------------

  showLastRun() {
    const box = this.$('daily-box');
    if (!box) return;

    const lastRun = Storage.get('kanoLastRun', null);

    if (lastRun && lastRun.score) {
      box.title =
        `Last run: ₦${Number(lastRun.score).toLocaleString()} · ` +
        `${Number(lastRun.dist || 0).toFixed(1)} km · Lv${lastRun.level || 1}`;
    }
  }

  updateDailyUI() {
    const box = this.$('daily-box');
    const claimButton = this.$('claim-daily');

    if (!box) return;

    const streak = Storage.getStreak();
    const claimed = Storage.isDailyClaimed();

    if (claimed) {
      box.textContent =
        `📅 Daily claimed · Streak ${streak} day${streak === 1 ? '' : 's'}`;

      if (claimButton) claimButton.style.display = 'none';
    } else {
      box.textContent = `📅 Daily reward ready · Current streak ${streak}`;

      if (claimButton) claimButton.style.display = 'inline-block';
    }
  }

  // ------------------------------------------------------------
  // Vehicle condition HUD
  // ------------------------------------------------------------

  setTyreStatus(punctured, wear = 0) {
    const label = this.$('tyre-status');
    const wrapper = this.$('tyre-stat');

    if (!label) return;

    if (punctured) {
      label.textContent = 'FLAT';
      if (wrapper) wrapper.style.color = '#ef4444';
    } else if (wear > 70) {
      label.textContent = 'WORN';
      if (wrapper) wrapper.style.color = '#f59e0b';
    } else if (wear > 40) {
      label.textContent = 'FAIR';
      if (wrapper) wrapper.style.color = '#fbbf24';
    } else {
      label.textContent = 'OK';
      if (wrapper) wrapper.style.color = '#94a3b8';
    }
  }

  setCondition(value) {
    const element = this.$('condition');
    if (!element) return;

    const condition = Math.max(0, Math.round(Number(value) || 0));
    element.textContent = condition;

    if (element.parentElement) {
      element.parentElement.style.color =
        condition < 30
          ? '#ef4444'
          : condition < 60
            ? '#fb923c'
            : '#94a3b8';
    }
  }

  setFuel(value) {
    const element = this.$('fuel');
    if (element) {
      element.textContent = Math.max(0, Math.round(Number(value) || 0));
    }
  }

  setZone(zone) {
    const element = this.$('zone-label');
    if (!element) return;

    if (!zone || zone === 'road') {
      element.textContent = '';
      return;
    }

    element.textContent =
      zone === 'market' ? '🛒 MARKET' : '🔀 JUNCTION';
  }

  setLevel(level) {
    this.setText('level-label', `Lv ${level}`);
  }

  setOnboardDestinations(passengers) {
    this.setOnboardDest(passengers);
  }

  setOnboardDest(passengers) {
    const element = this.$('onboard-dest');
    if (!element) return;

    if (!Array.isArray(passengers) || passengers.length === 0) {
      element.style.opacity = '0';
      element.textContent = '';
      return;
    }

    element.style.opacity = '1';
    element.textContent =
      'Onboard: ' +
      passengers
        .map((passenger) => {
          const destination = passenger.dest || '?';
          const vip = passenger.name === 'VIP' ? '★' : '';
          return `${destination}${vip}`;
        })
        .join(' · ');
  }

  // ------------------------------------------------------------
  // Share results
  // ------------------------------------------------------------

  async shareRun(game) {
    const route = CONFIG.ROUTES?.[game.selectedRoute];
    const driver =
      CONFIG.DRIVERS?.[game.selectedDriver] ||
      CONFIG.DRIVERS?.ruffneck ||
      { name: 'Driver' };

    const url = 'https://kano-run.vercel.app';

    const text =
      `I just earned ₦${Math.floor(game.score || 0).toLocaleString()} ` +
      `on ${route?.name || 'Kano'} as ${driver.name} in Kano Run 3D! ` +
      `${Number(game.dist || 0).toFixed(1)} km · ` +
      `${game.totalPax || 0} passengers. Play: ${url}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Kano Run 3D',
          text,
          url
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.showMissionToast('Run result copied');
        return;
      }

      window.prompt('Copy your run result:', text);
    } catch (error) {
      if (error?.name === 'AbortError') return;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          this.showMissionToast('Run result copied');
        } else {
          window.prompt('Copy your run result:', text);
        }
      } catch {
        window.prompt('Copy your run result:', text);
      }
    }
  }
}