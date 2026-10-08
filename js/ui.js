```javascript
import { CONFIG, STATE } from './config.js';
import { Storage } from './storage.js';

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

    this.bind();
    this.renderRoutes();
    this.renderDrivers();

    const highScore = document.getElementById('hs');
    if (highScore) highScore.textContent = game.high ?? 0;

    this.syncSettingsButtons();
    this.updateDailyUI(game);
    this.addGarageStyles();
  }

  bind() {
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
      startBtn.onclick = () => this.game.start();
    }

    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.onclick = () => this.game.start();
    }

    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
      homeBtn.onclick = () => this.showStart();
    }

    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
      shareBtn.onclick = () => this.shareRun(this.game);
    }

    const routeBtn = document.getElementById('route-btn');
    if (routeBtn) {
      routeBtn.onclick = () => {
        if (this.startScreen) this.startScreen.style.display = 'none';
        if (this.routeScreen) this.routeScreen.style.display = 'flex';
        this.renderRoutes();
      };
    }

    const routeBack = document.getElementById('route-back');
    if (routeBack) {
      routeBack.onclick = () => {
        if (this.routeScreen) this.routeScreen.style.display = 'none';
        if (this.startScreen) this.startScreen.style.display = 'flex';
      };
    }

    const garageBtn = document.getElementById('garage-btn');
    if (garageBtn) {
      garageBtn.onclick = () => {
        if (this.startScreen) this.startScreen.style.display = 'none';
        if (this.garageScreen) this.garageScreen.style.display = 'flex';

        this.renderDrivers();
        this.renderPaints();
        this.renderGarageDressing();
        this.renderUpgrades();
      };
    }

    const garageBack = document.getElementById('garage-back');
    if (garageBack) {
      garageBack.onclick = () => {
        if (this.garageScreen) this.garageScreen.style.display = 'none';
        if (this.startScreen) this.startScreen.style.display = 'flex';
      };
    }

    const radioBtn = document.getElementById('radio-btn');
    if (radioBtn) {
      radioBtn.onclick = () => {
        if (typeof this.game.cycleRadio === 'function') {
          this.game.cycleRadio();
        }
      };
    }

    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.onclick = () => {
        const next = !Storage.getMuted();
        Storage.setMuted(next);

        import('./audio.js')
          .then(({ Audio }) => {
            Audio.muted = next;

            if (next && typeof Audio.stopEngine === 'function') {
              Audio.stopEngine();
            }
          })
          .catch((error) => {
            console.error('Could not update audio settings:', error);
          });

        this.syncSettingsButtons();
        this.showMissionToast(next ? 'Sound off' : 'Sound on');
      };
    }

    const qualityBtn = document.getElementById('quality-btn');
    if (qualityBtn) {
      qualityBtn.onclick = () => {
        const next = !Storage.getLowQuality();
        Storage.setLowQuality(next);

        if (this.game.renderer3d?.applyQuality) {
          this.game.renderer3d.applyQuality(next);
        }

        this.syncSettingsButtons();
        this.showMissionToast(
          next ? 'Performance mode' : 'High quality'
        );
      };
    }

    const claimBtn = document.getElementById('claim-daily');
    if (claimBtn) {
      claimBtn.onclick = () => {
        if (typeof this.game.claimDaily === 'function') {
          this.game.claimDaily();
        }
      };
    }

    // On-screen steering controls.
    // game.js remains responsible for keyboard controls.

    const left = document.getElementById('left-btn');
    const right = document.getElementById('right-btn');
    const horn = document.getElementById('horn-btn');

    const bindLaneButton = (element, movement) => {
      if (!element) return;

      let interval = null;
      let active = false;

      const stop = (event) => {
        if (event) event.preventDefault();

        active = false;

        if (interval !== null) {
          clearInterval(interval);
          interval = null;
        }
      };

      const press = (event) => {
        if (event) event.preventDefault();
        if (active) return;

        active = true;
        movement();

        interval = window.setInterval(() => {
          if (active) movement();
        }, 180);
      };

      element.addEventListener('pointerdown', press, {
        passive: false
      });

      element.addEventListener('pointerup', stop, {
        passive: false
      });

      element.addEventListener('pointercancel', stop, {
        passive: false
      });

      element.addEventListener('pointerleave', stop, {
        passive: false
      });

      element.addEventListener('pointerout', stop, {
        passive: false
      });

      element.addEventListener('contextmenu', stop, {
        passive: false
      });

      element.addEventListener(
        'dragstart',
        (event) => event.preventDefault(),
        { passive: false }
      );

      window.addEventListener('blur', stop);
    };

    bindLaneButton(left, () => {
      if (typeof this.game.moveLeft === 'function') {
        this.game.moveLeft();
      }
    });

    bindLaneButton(right, () => {
      if (typeof this.game.moveRight === 'function') {
        this.game.moveRight();
      }
    });

    if (horn) {
      horn.addEventListener('click', (event) => {
        event.preventDefault();

        if (typeof this.game.horn === 'function') {
          this.game.horn();
        }
      });
    }

    // Do not register another keyboard listener here.
  }

  // ---------------------------------------------------------------------------
  // Safe helpers
  // ---------------------------------------------------------------------------

  escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };

      return entities[character];
    });
  }

  getEntryId(entry, fallbackId) {
    if (entry && entry.id !== undefined && entry.id !== null) {
      return entry.id;
    }

    return fallbackId;
  }

  getCollectionEntries(collection) {
    if (Array.isArray(collection)) {
      return collection.map((entry, index) => [
        String(index),
        entry
      ]);
    }

    if (collection && typeof collection === 'object') {
      return Object.entries(collection);
    }

    return [];
  }

  addGarageStyles() {
    if (document.getElementById('kano-run-garage-card-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'kano-run-garage-card-styles';

    style.textContent = `
      #garage-screen {
        box-sizing: border-box;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      #garage-screen .garage-section {
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }

      #garage-screen .garage-grid,
      #garage-screen .garage-card-grid {
        display: grid !important;
        grid-template-columns: repeat(
          auto-fit,
          minmax(min(145px, 100%), 1fr)
        );
        gap: 12px;
        width: 100%;
        align-content: start;
        box-sizing: border-box;
      }

      #garage-screen .garage-selection-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 140px;
        padding: 12px;
        color: #f8fafc;
        background: rgba(15, 23, 42, 0.96);
        border: 2px solid rgba(148, 163, 184, 0.28);
        border-radius: 12px;
        text-align: left;
        overflow-wrap: anywhere;
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          transform 0.15s ease,
          background 0.15s ease;
      }

      #garage-screen .garage-selection-card:hover {
        border-color: #38bdf8;
        background: rgba(30, 41, 59, 0.98);
        transform: translateY(-2px);
      }

      #garage-screen .garage-selection-card:focus-visible {
        outline: 3px solid #38bdf8;
        outline-offset: 2px;
      }

      #garage-screen .garage-selection-card.is-selected {
        border-color: #f5c542;
        box-shadow: 0 0 0 1px rgba(245, 197, 66, 0.2);
      }

      #garage-screen .garage-card-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 46px;
        height: 46px;
        margin-bottom: 10px;
        border-radius: 50%;
        background: rgba(148, 163, 184, 0.14);
        font-size: 25px;
      }

      #garage-screen .garage-paint-swatch {
        display: block;
        width: 100%;
        height: 50px;
        margin-bottom: 10px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 8px;
      }

      #garage-screen .garage-selection-card .rname {
        color: #f8fafc;
        font-size: 0.9rem;
        font-weight: 800;
        line-height: 1.35;
      }

      #garage-screen .garage-selection-card .rdesc {
        margin-top: 4px;
        color: #cbd5e1;
        font-size: 0.78rem;
        line-height: 1.45;
      }

      #garage-screen .garage-selection-status {
        margin-top: auto;
        padding-top: 12px;
        color: #f5c542;
        font-size: 0.67rem;
        font-weight: 900;
        letter-spacing: 0.07em;
      }

      #garage-screen .garage-selection-card.is-selected
      .garage-selection-status {
        color: #fcd34d;
      }

      #garage-screen .garage-empty-state {
        padding: 12px;
        color: #cbd5e1;
        font-size: 0.9rem;
      }

      @media (max-width: 480px) {
        #garage-screen .garage-grid,
        #garage-screen .garage-card-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        #garage-screen .garage-selection-card {
          min-height: 125px;
          padding: 10px;
        }

        #garage-screen .garage-paint-swatch {
          height: 40px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  renderRoutes() {
    const list = document.getElementById('route-list');
    if (!list) return;

    list.innerHTML = '';

    const routes = this.getCollectionEntries(CONFIG.ROUTES);

    routes.forEach(([key, route]) => {
      if (!route || typeof route !== 'object') return;

      const id = this.getEntryId(route, key);
      const name = route.name || 'Kano Route';
      const description = route.description || 'Drive this route.';
      const fare = Number(route.baseFare);
      const selected = String(this.game.selectedRoute) === String(id);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'route-card garage-selection-card';

      if (selected) card.classList.add('is-selected');

      card.setAttribute('aria-pressed', String(selected));

      card.innerHTML = `
        <div class="garage-card-icon" aria-hidden="true">🛺</div>
        <div class="rname">${selected ? '✓ ' : ''}${this.escapeHTML(name)}</div>
        <div class="rdesc">${this.escapeHTML(description)}</div>
        <div class="rdesc">
          Fare estimate: ₦${Number.isFinite(fare) ? fare.toLocaleString() : '—'}
        </div>
        <div class="garage-selection-status">
          ${selected ? 'SELECTED ROUTE' : 'SELECT ROUTE'}
        </div>
      `;

      card.addEventListener('click', () => {
        this.game.selectedRoute = id;

        if (typeof Storage.setRoute === 'function') {
          Storage.setRoute(id);
        }

        if (this.routeScreen) {
          this.routeScreen.style.display = 'none';
        }

        if (this.startScreen) {
          this.startScreen.style.display = 'flex';
        }

        if (typeof this.game.renderer3d?.setRoute === 'function') {
          this.game.renderer3d.setRoute(route);
        }

        this.renderRoutes();
        this.showMissionToast('Route: ' + name);
      });

      list.appendChild(card);
    });

    this.addGarageStyles();
  }

  // ---------------------------------------------------------------------------
  // Driver selection
  // ---------------------------------------------------------------------------

  renderDrivers() {
    const list =
      document.getElementById('driver-char-grid') ||
      document.getElementById('driver-list') ||
      document.getElementById('driver-grid');

    if (list) {
      list.innerHTML = '';
      list.classList.add('garage-card-grid');

      const drivers = this.getCollectionEntries(CONFIG.DRIVERS);

      drivers.forEach(([key, driver], index) => {
        if (!driver || typeof driver !== 'object') return;

        const id = this.getEntryId(driver, key);
        const name = driver.name || `Driver ${index + 1}`;
        const title = driver.title || 'Keke Driver';
        const description =
          driver.desc || driver.description || 'Available driver';

        const selected =
          String(this.game.selectedDriver) === String(id);

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'route-card garage-selection-card';
        card.setAttribute('aria-pressed', String(selected));

        if (selected) card.classList.add('is-selected');

        card.innerHTML = `
          <div class="garage-card-icon" aria-hidden="true">👤</div>
          <div class="rname">
            ${selected ? '✓ ' : ''}${this.escapeHTML(name)}
          </div>
          <div class="rdesc">${this.escapeHTML(title)}</div>
          <div class="rdesc">${this.escapeHTML(description)}</div>
          <div class="garage-selection-status">
            ${selected ? 'SELECTED' : 'SELECT DRIVER'}
          </div>
        `;

        card.addEventListener('click', () => {
          this.game.selectedDriver = id;

          if (typeof Storage.setDriver === 'function') {
            Storage.setDriver(id);
          }

          this.renderDrivers();
          this.showMissionToast('Driver: ' + name);
        });

        list.appendChild(card);
      });

      if (!list.children.length) {
        list.innerHTML =
          '<div class="garage-empty-state">No drivers are configured.</div>';
      }
    }

    this.renderPaints();
    this.renderGarageDressing();
    this.renderUpgrades();
    this.renderLeaderboard();
    this.renderAchievements();
  }

  // ---------------------------------------------------------------------------
  // Paint selection
  // ---------------------------------------------------------------------------

  renderPaints() {
    const list =
      document.getElementById('paint-grid') ||
      document.getElementById('paint-list');

    if (!list) return;

    list.innerHTML = '';
    list.classList.add('garage-card-grid');

    const paints = this.getCollectionEntries(CONFIG.PAINTS);

    paints.forEach(([key, paint], index) => {
      if (!paint || typeof paint !== 'object') return;

      const id = this.getEntryId(paint, key);
      const name = paint.name || `Paint ${index + 1}`;

      // Support several common colour formats. A missing colour must
      // never cause a .toString() runtime exception.
      const colorValue =
        paint.color ??
        paint.hex ??
        paint.colour ??
        paint.value;

      let hex = '#16a085';

      if (
        typeof colorValue === 'number' &&
        Number.isFinite(colorValue)
      ) {
        const numericColor = Math.max(
          0,
          Math.min(0xffffff, Math.floor(colorValue))
        );

        hex = '#' + numericColor.toString(16).padStart(6, '0');
      } else if (
        typeof colorValue === 'string' &&
        colorValue.trim() !== ''
      ) {
        const value = colorValue.trim();

        if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) {
          hex = value;
        } else if (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) {
          hex = '#' + value;
        } else {
          const numericColor = Number(value);

          if (Number.isFinite(numericColor)) {
            hex =
              '#' +
              Math.max(
                0,
                Math.min(0xffffff, Math.floor(numericColor))
              )
                .toString(16)
                .padStart(6, '0');
          }
        }
      }

      const selected =
        String(this.game.selectedPaint) === String(id);

      const card = document.createElement('button');
      card.type = 'button';
      card.className =
        'route-card garage-selection-card paint-card';

      card.setAttribute('aria-pressed', String(selected));

      if (selected) card.classList.add('is-selected');

      const swatch = document.createElement('div');
      swatch.className = 'garage-paint-swatch';
      swatch.style.backgroundColor = hex;
      swatch.setAttribute('aria-label', name + ' paint colour');

      const title = document.createElement('div');
      title.className = 'rname';
      title.textContent = (selected ? '✓ ' : '') + name;

      const status = document.createElement('div');
      status.className = 'garage-selection-status';
      status.textContent = selected ? 'SELECTED' : 'SELECT PAINT';

      card.append(swatch, title, status);

      card.addEventListener('click', () => {
        this.game.selectedPaint = id;

        if (typeof Storage.setPaint === 'function') {
          Storage.setPaint(id);
        }

        if (typeof this.game.renderer3d?.applyPaint === 'function') {
          this.game.renderer3d.applyPaint(id);
        }

        this.renderPaints();
        this.showMissionToast('Paint: ' + name);
      });

      list.appendChild(card);
    });

    if (!list.children.length) {
      list.innerHTML =
        '<div class="garage-empty-state">No paint options are configured.</div>';
    }

    this.addGarageStyles();
  }

  // ---------------------------------------------------------------------------
  // Driver dressing
  // ---------------------------------------------------------------------------

  renderGarageDressing() {
    const list = document.getElementById('driver-grid');
    if (!list) return;

    list.innerHTML = '';
    list.classList.add('garage-card-grid');

    const collection = this.getCollectionEntries(CONFIG.DRESSING);

    if (!collection.length) {
      list.innerHTML =
        '<div class="garage-empty-state">Driver dressing options are not configured yet.</div>';
      return;
    }

    collection.forEach(([key, item], index) => {
      if (!item || typeof item !== 'object') return;

      const id = this.getEntryId(item, key);
      const name = item.name || `Dressing ${index + 1}`;
      const description =
        item.description || item.desc || 'Driver appearance option';

      const selected =
        String(this.game.selectedDressing) === String(id);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'route-card garage-selection-card';

      if (selected) card.classList.add('is-selected');

      card.innerHTML = `
        <div class="garage-card-icon" aria-hidden="true">🧢</div>
        <div class="rname">${selected ? '✓ ' : ''}${this.escapeHTML(name)}</div>
        <div class="rdesc">${this.escapeHTML(description)}</div>
        <div class="garage-selection-status">
          ${selected ? 'SELECTED' : 'DRESSING'}
        </div>
      `;

      card.addEventListener('click', () => {
        this.game.selectedDressing = id;

        if (typeof Storage.setDressing === 'function') {
          Storage.setDressing(id);
        }

        this.renderGarageDressing();
        this.showMissionToast('Dressing: ' + name);
      });

      list.appendChild(card);
    });

    if (!list.children.length) {
      list.innerHTML =
        '<div class="garage-empty-state">No valid dressing options are configured.</div>';
    }
  }

  // ---------------------------------------------------------------------------
  // Upgrades
  // ---------------------------------------------------------------------------

  renderUpgrades() {
    const list = document.getElementById('upgrade-grid');
    if (!list) return;

    list.innerHTML = '';
    list.classList.add('garage-card-grid');

    const collection = this.getCollectionEntries(CONFIG.UPGRADES);

    if (!collection.length) {
      list.innerHTML =
        '<div class="garage-empty-state">Upgrade options are not configured yet.</div>';
      return;
    }

    collection.forEach(([key, upgrade], index) => {
      if (!upgrade || typeof upgrade !== 'object') return;

      const id = this.getEntryId(upgrade, key);
      const name = upgrade.name || `Upgrade ${index + 1}`;
      const description =
        upgrade.description || upgrade.desc || 'Vehicle upgrade';

      const selected =
        String(this.game.selectedUpgrade) === String(id);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'route-card garage-selection-card';

      if (selected) card.classList.add('is-selected');

      card.innerHTML = `
        <div class="garage-card-icon" aria-hidden="true">🔧</div>
        <div class="rname">${selected ? '✓ ' : ''}${this.escapeHTML(name)}</div>
        <div class="rdesc">${this.escapeHTML(description)}</div>
        <div class="garage-selection-status">
          ${selected ? 'SELECTED' : 'UPGRADE'}
        </div>
      `;

      card.addEventListener('click', () => {
        this.game.selectedUpgrade = id;

        if (typeof Storage.setUpgrade === 'function') {
          Storage.setUpgrade(id);
        }

        this.renderUpgrades();
        this.showMissionToast('Upgrade: ' + name);
      });

      list.appendChild(card);
    });

    if (!list.children.length) {
      list.innerHTML =
        '<div class="garage-empty-state">No valid upgrades are configured.</div>';
    }
  }

  // ---------------------------------------------------------------------------
  // Leaderboard and achievements
  // ---------------------------------------------------------------------------

  renderLeaderboard() {
    const el = document.getElementById('leaderboard');
    if (!el) return;

    const rows =
      typeof Storage.getLeaderboard === 'function'
        ? Storage.getLeaderboard()
        : [];

    if (!Array.isArray(rows) || !rows.length) {
      el.textContent = 'No runs yet — finish a drive!';
      return;
    }

    el.innerHTML = rows
      .map((row, index) => {
        const score = Number(row?.score) || 0;
        const distance = Number(row?.dist) || 0;
        const driver = this.escapeHTML(row?.driver || 'Driver');

        return `
          <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
            #${index + 1} ₦${score.toLocaleString()} ·
            ${distance.toFixed(1)} km · ${driver}
          </div>
        `;
      })
      .join('');
  }

  renderAchievements() {
    const el = document.getElementById('ach-list');
    if (!el || !CONFIG.ACHIEVEMENTS) return;

    const unlocked =
      typeof Storage.getAchievements === 'function'
        ? Storage.getAchievements()
        : {};

    const achievements = Array.isArray(CONFIG.ACHIEVEMENTS)
      ? CONFIG.ACHIEVEMENTS
      : Object.values(CONFIG.ACHIEVEMENTS);

    el.innerHTML = achievements
      .filter((achievement) => achievement && typeof achievement === 'object')
      .map((achievement) => {
        const on = !!unlocked?.[achievement.id];

        return `
          <div style="
            padding:5px 0;
            color:${on ? '#f5c542' : '#64748b'}
          ">
            ${on ? '🏆' : '🔒'}
            ${this.escapeHTML(achievement.name || 'Achievement')} —
            ${this.escapeHTML(achievement.desc || '')}
          </div>
        `;
      })
      .join('');
  }

  // ---------------------------------------------------------------------------
  // Screens and game state
  // ---------------------------------------------------------------------------

  showStart() {
    this.game.state = STATE.START;
    this.game.eventOpen = false;
    this.game.paused = false;

    if (this.overScreen) this.overScreen.style.display = 'none';
    if (this.routeScreen) this.routeScreen.style.display = 'none';
    if (this.garageScreen) this.garageScreen.style.display = 'none';
    if (this.startScreen) this.startScreen.style.display = 'flex';

    const highScore = document.getElementById('hs');
    if (highScore) highScore.textContent = this.game.high ?? 0;

    this.hideEvent();
  }

  showPlaying() {
    if (this.startScreen) this.startScreen.style.display = 'none';
    if (this.routeScreen) this.routeScreen.style.display = 'none';
    if (this.garageScreen) this.garageScreen.style.display = 'none';
    if (this.overScreen) this.overScreen.style.display = 'none';

    this.hideEvent();
  }

  showGameOver(game) {
    if (this.overScreen) {
      this.overScreen.style.display = 'flex';
    }

    const finalStats = document.getElementById('final-stats');

    if (finalStats) {
      finalStats.innerHTML =
        `<b>₦${Math.floor(Number(game.score) || 0).toLocaleString()}</b>` +
        ` · ${(Number(game.dist) || 0).toFixed(1)} km` +
        ` · ${Number(game.totalPax) || 0} pax` +
        ` · ${Number(game.dropCount) || 0} drops`;
    }

    const finalHighScore = document.getElementById('final-hs');

    if (finalHighScore) {
      finalHighScore.textContent = game.high ?? 0;
    }
  }

  updateHUD(game) {
    if (this.scoreEl) {
      this.scoreEl.textContent = Math.floor(Number(game.score) || 0);
    }

    if (this.distEl) {
      this.distEl.textContent = (Number(game.dist) || 0).toFixed(1);
    }

    if (this.paxEl) {
      this.paxEl.textContent = game.paxOnBoard ?? 0;
    }

    if (this.capEl) {
      this.capEl.textContent = game.capacity ?? 0;
    }

    if (this.livesEl) {
      this.livesEl.textContent = game.continuesLeft ?? 0;
    }
  }

  setMission(text) {
    if (this.missionLabel) {
      this.missionLabel.textContent = '🎯 ' + (text || '');
    }
  }

  setRouteLabel(text) {
    if (this.routeLabel) {
      this.routeLabel.textContent = text || '';
    }
  }

  setRadio(text) {
    if (this.radioLabel) {
      this.radioLabel.textContent = '📻 ' + (text || '');
    }
  }

  setDriverLabel(text) {
    if (this.driverLabel) {
      this.driverLabel.textContent = '👤 ' + (text || '');
    }
  }

  showMissionToast(message) {
    if (!this.toast) return;

    this.toast.textContent = String(message ?? '');
    this.toast.style.opacity = '1';

    clearTimeout(this._tt);

    this._tt = setTimeout(() => {
      this.toast.style.opacity = '0';
    }, 1600);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  showEvent(eventOrTitle, text, choices) {
    if (
      !this.eventTitle ||
      !this.eventText ||
      !this.eventChoices ||
      !this.eventBox
    ) {
      return;
    }

    let title;
    let body;
    let options;

    if (
      eventOrTitle &&
      typeof eventOrTitle === 'object' &&
      !Array.isArray(eventOrTitle)
    ) {
      title = eventOrTitle.title || 'Kano Run';
      body = eventOrTitle.text || '';

      const actions = Array.isArray(eventOrTitle.actions)
        ? eventOrTitle.actions
        : Array.isArray(eventOrTitle.choices)
          ? eventOrTitle.choices
          : [];

      options = actions.map((item) => ({
        label: item?.label || 'Continue',
        action:
          typeof item?.onClick === 'function'
            ? item.onClick
            : typeof item?.action === 'function'
              ? item.action
              : null
      }));
    } else {
      title = eventOrTitle || 'Kano Run';
      body = text || '';

      options = Array.isArray(choices)
        ? choices.map((item) => ({
            label: item?.label || 'Continue',
            action:
              typeof item?.onClick === 'function'
                ? item.onClick
                : typeof item?.action === 'function'
                  ? item.action
                  : null
          }))
        : [];
    }

    this.eventTitle.textContent = title;
    this.eventText.textContent = body;
    this.eventChoices.innerHTML = '';
    this.eventBox.style.display = 'block';

    this.game.eventOpen = true;
    this.game.eventType = this.game.eventType || 'generic';
    this.game._resumeStateAfterEvent = STATE.PLAY;
    this.game.state = STATE.EVENT;

    options.forEach((option) => {
      const button = document.createElement('button');

      button.type = 'button';
      button.textContent = option.label;

      button.addEventListener('click', (event) => {
        event.preventDefault();

        if (typeof option.action === 'function') {
          try {
            option.action();
          } catch (error) {
            console.error('Kano Run event action failed:', error);
          }
        } else if (typeof this.game.closeEvent === 'function') {
          this.game.closeEvent();
        } else {
          this.hideEvent();
          this.game.eventOpen = false;
          this.game.state = STATE.PLAY;
        }
      });

      this.eventChoices.appendChild(button);
    });
  }

  hideEvent() {
    if (this.eventBox) {
      this.eventBox.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Settings and daily rewards
  // ---------------------------------------------------------------------------

  syncSettingsButtons() {
    const muteBtn = document.getElementById('mute-btn');
    const qualityBtn = document.getElementById('quality-btn');

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

  updateDailyUI(game) {
    const box = document.getElementById('daily-box');
    const claim = document.getElementById('claim-daily');

    if (!box) return;

    const streak =
      typeof Storage.getStreak === 'function'
        ? Storage.getStreak()
        : 0;

    const claimed =
      typeof Storage.isDailyClaimed === 'function'
        ? Storage.isDailyClaimed()
        : false;

    if (claimed) {
      box.textContent =
        `📅 Daily claimed · Streak ${streak} day${streak === 1 ? '' : 's'}`;

      if (claim) claim.style.display = 'none';
    } else {
      box.textContent =
        `📅 Daily reward ready · Current streak ${streak}`;

      if (claim) claim.style.display = 'inline-block';
    }
  }

  // ---------------------------------------------------------------------------
  // Share results
  // ---------------------------------------------------------------------------

  async shareRun(game) {
    const route =
      CONFIG.ROUTES?.[game.selectedRoute] ||
      Object.values(CONFIG.ROUTES || {}).find(
        (item) => String(item?.id) === String(game.selectedRoute)
      );

    const driver =
      CONFIG.DRIVERS?.[game.selectedDriver] ||
      Object.values(CONFIG.DRIVERS || {}).find(
        (item) => String(item?.id) === String(game.selectedDriver)
      ) ||
      CONFIG.DRIVERS?.ruffneck ||
      { name: 'Keke Driver' };

    const score = Math.floor(Number(game.score) || 0);
    const distance = (Number(game.dist) || 0).toFixed(1);

    const message =
      `I just drove ₦${score.toLocaleString()} ` +
      `on ${route?.name || 'Kano'} as ${driver.name || 'Keke Driver'} ` +
      `in Kano Run 3D! ${distance} km · ` +
      `${Number(game.totalPax) || 0} passengers. ` +
      `Play: https://kano-run.vercel.app`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Kano Run',
          text: message,
          url: 'https://kano-run.vercel.app'
        });

        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        this.showMissionToast('Copied result to clipboard');
        return;
      }

      window.prompt('Copy your run:', message);
    } catch (error) {
      if (error?.name === 'AbortError') return;

      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(message);
          this.showMissionToast('Copied to clipboard');
        } else {
          this.showMissionToast('Share cancelled');
        }
      } catch {
        this.showMissionToast('Share cancelled');
      }
    }
  }
}
```
