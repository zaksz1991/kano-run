import { CONFIG, STATE } from './config.js';

/**
 * Kano Run UI controller.
 *
 * Defensive by design: optional DOM elements are common when the game HTML is
 * edited or deployed at a different revision. No event handler is ever assigned
 * directly to a possibly-null element.
 */
export class UI {
  constructor(game) {
    this.game = game;
    this.toastTimer = null;
    this.toastSerial = 0;
    this.pauseOverlay = null;
    this.pauseButton = null;
    this.bound = false;

    if (typeof this.game?.setUI === 'function') this.game.setUI(this);
    else if (this.game) this.game.ui = this;

    // Purchased upgrades are reapplied after each new run because Game.start()
    // resets run-specific speed and passenger capacity.
    this.installStartUpgradeHook();
    this.bind();
    this.showStart();
    this.updateHUD(this.game?._hudPayload?.() || {});
    this.updateDailyMission(this.game?.getDailyStatus?.() || {});
    this.renderRoutes();
    this.renderGarage();
  }

  el(id) {
    if (typeof document === 'undefined' || !id) return null;
    return document.getElementById(id);
  }

  on(id, eventName, handler, options) {
    const element = this.el(id);
    if (!element || typeof element.addEventListener !== 'function') return false;
    element.addEventListener(eventName, handler, options);
    return true;
  }

  click(id, handler) {
    return this.on(id, 'click', (event) => {
      event?.preventDefault?.();
      try {
        handler(event);
      } catch (error) {
        console.error(`Kano Run UI action failed (${id}).`, error);
        this.showToast('That action could not be completed. Please try again.');
      }
    });
  }

  bind() {
    if (this.bound || typeof document === 'undefined') return;
    this.bound = true;

    this.click('start-btn', () => this.game?.start?.());
    this.click('route-btn', () => this.showRouteSelect());
    this.click('garage-btn', () => this.showGarage());
    this.click('route-back', () => this.showStart());
    this.click('garage-back', () => this.showStart());
    this.click('over-garage', () => this.showGarage());
    this.click('claim-daily', () => {
      const succeeded = this.game?.claimDailyReward?.();
      this.updateDailyMission(this.game?.getDailyStatus?.() || {});
      if (succeeded) this.updateHUD(this.game?._hudPayload?.() || {});
    });
    this.click('retry-btn', () => this.game?.retry?.());
    this.click('left-btn', () => this.game?.moveLeft?.());
    this.click('right-btn', () => this.game?.moveRight?.());
    this.click('horn-btn', () => this.game?.horn?.());
    this.click('radio-btn', () => this.game?.nextRadio?.());
    this.click('share-btn', () => this.shareRun());

    this.on('controls', 'touchmove', (event) => event.preventDefault(), { passive: false });
    this.on('event-choices', 'click', (event) => event.stopPropagation());

    // Escape closes an open dialogue or resumes from the custom pause overlay.
    this.onDocument('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (this.game?.eventOpen) {
        this.game.closeEvent?.();
        return;
      }
      if (this.game?.state === STATE.PLAY) this.game.togglePause?.();
      else if (this.pauseOverlay) this.hidePauseOverlay();
    });
  }

  onDocument(eventName, handler, options) {
    if (typeof document === 'undefined') return false;
    document.addEventListener(eventName, handler, options);
    return true;
  }

  screenIds() {
    return ['start-screen', 'route-screen', 'garage-screen', 'over-screen'];
  }

  showOnlyScreen(activeId = null) {
    for (const id of this.screenIds()) {
      const element = this.el(id);
      if (!element) continue;

      const active = id === activeId;

      // `hidden` removes an inactive screen from the accessibility tree.
      // `inert` additionally prevents keyboard/pointer focus inside it.
      // Do not combine aria-hidden="true" with descendant buttons: that is
      // what triggers axe's aria-hidden-focus rule.
      if (!active && element.contains(document.activeElement)) {
        document.activeElement.blur?.();
      }

      element.inert = !active;
      element.hidden = !active;
      element.style.display = active ? 'flex' : 'none';
      element.removeAttribute('aria-hidden');
    }
  }

  showStart() {
    this.hideEvent();
    this.hidePauseOverlay();
    this.showOnlyScreen('start-screen');
    if (this.game && this.game.state !== STATE.OVER && this.game.state !== STATE.PLAY) {
      this.game.state = STATE.START;
      this.game.paused = false;
    }
    this.renderRoutes();
    this.renderGarage();
    this.updateHUD(this.game?._hudPayload?.() || {});
  }

  showRouteSelect() {
    this.hideEvent();
    this.hidePauseOverlay();
    this.showOnlyScreen('route-screen');
    if (this.game && this.game.state !== STATE.PLAY) this.game.state = STATE.ROUTE_SELECT;
    this.renderRoutes();
  }

  showGarage() {
    this.hideEvent();
    this.hidePauseOverlay();
    this.showOnlyScreen('garage-screen');
    if (this.game && this.game.state !== STATE.PLAY) this.game.state = STATE.GARAGE;
    this.renderGarage();
  }

  showPlaying() {
    this.showOnlyScreen(null);
    this.hidePauseOverlay();
    const controls = this.el('controls');
    if (controls) controls.style.display = 'flex';
    this.updateHUD(this.game?._hudPayload?.() || {});
  }

  showPaused() {
    this.showOnlyScreen(null);
    this.hideEvent();
    this.ensurePauseOverlay();
    if (this.pauseOverlay) {
      this.pauseOverlay.inert = false;
      this.pauseOverlay.hidden = false;
      this.pauseOverlay.style.display = 'flex';
    }
  }

  ensurePauseOverlay() {
    if (this.pauseOverlay || typeof document === 'undefined') return;
    const host = this.el('game-container') || document.body;
    const overlay = document.createElement('section');
    overlay.id = 'kano-run-pause-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Game paused');
    overlay.hidden = true;
    overlay.inert = true;
    overlay.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:60', 'display:none',
      'flex-direction:column', 'align-items:center', 'justify-content:center',
      'gap:12px', 'padding:24px', 'background:rgba(7,11,20,.94)',
      'color:#f1f5f9', 'text-align:center', 'pointer-events:auto'
    ].join(';');

    const title = document.createElement('h2');
    title.textContent = 'PAUSED';
    title.style.cssText = 'color:#f5c542;font-size:2rem;margin:0 0 8px';
    overlay.appendChild(title);

    const makeButton = (label, handler, secondary = false) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.className = secondary ? 'btn secondary' : 'btn';
      button.style.maxWidth = '280px';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        handler();
      });
      overlay.appendChild(button);
      return button;
    };

    makeButton('RESUME DRIVING', () => this.game?.resume?.());
    makeButton('RESTART RUN', () => this.game?.restart?.(), true);
    makeButton('RETURN TO MENU', () => {
      if (this.game) {
        this.game.paused = false;
        if (this.game.state === STATE.PLAY || this.game.state === STATE.EVENT) {
          this.game.state = STATE.START;
          this.game.eventOpen = false;
        }
      }
      this.showStart();
    }, true);

    host.appendChild(overlay);
    this.pauseOverlay = overlay;
  }

  hidePauseOverlay() {
    if (!this.pauseOverlay) return;
    this.pauseOverlay.inert = true;
    this.pauseOverlay.hidden = true;
    this.pauseOverlay.style.display = 'none';
  }

  showEvent(event = {}) {
    this.showOnlyScreen(null);
    this.hidePauseOverlay();
    const box = this.el('event-box');
    const title = this.el('event-title');
    const text = this.el('event-text');
    const choices = this.el('event-choices');

    if (title) title.textContent = String(event.title || 'Kano Run');
    if (text) text.textContent = String(event.text || 'Choose an action to continue.');
    if (choices) {
      choices.replaceChildren();
      const actions = Array.isArray(event.actions) ? event.actions : [];
      for (const action of actions) {
        if (!action) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = String(action.label || 'Continue');
        button.addEventListener('click', (clickEvent) => {
          clickEvent.preventDefault();
          if (button.disabled) return;
          button.disabled = true;
          try {
            if (typeof action.onClick === 'function') action.onClick();
            else this.game?.closeEvent?.();
          } catch (error) {
            console.error('Kano Run event action failed.', error);
            button.disabled = false;
            this.showToast('Unable to complete that action.');
          }
        });
        choices.appendChild(button);
      }
    }

    if (box) {
      box.hidden = false;
      box.style.display = 'block';
      box.setAttribute('aria-hidden', 'false');
    }
  }

  hideEvent() {
    const box = this.el('event-box');
    if (box) {
      box.hidden = true;
      box.style.display = 'none';
      box.setAttribute('aria-hidden', 'true');
    }
    const choices = this.el('event-choices');
    if (choices) choices.replaceChildren();
  }

  showToast(message) {
    const toast = this.el('mission-toast');
    if (!toast) return;
    const serial = ++this.toastSerial;
    toast.textContent = String(message ?? '');
    toast.style.opacity = '1';
    toast.setAttribute('role', 'status');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      if (serial !== this.toastSerial) return;
      toast.style.opacity = '0';
    }, 2300);
  }

  showCombo(combo) {
    const element = this.el('combo-display');
    if (!element) return;
    element.textContent = combo ? `COMBO ×${combo}` : '';
    element.style.opacity = combo ? '1' : '0';
  }

  showLandmark(landmark) {
    const element = this.el('landmark');
    if (element) element.textContent = landmark ? `📍 ${String(landmark)}` : '';
  }

  updateHUD(data = {}) {
    const setText = (id, value) => {
      const element = this.el(id);
      if (element && value !== undefined && value !== null) element.textContent = String(value);
    };
    const number = (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

    setText('score', Math.round(number(data.score, number(this.game?.score))));
    setText('dist', number(data.dist, number(this.game?.dist)).toFixed(1));
    setText('pax', number(data.pax, number(this.game?.paxCount)));
    setText('capacity', number(data.capacity, number(this.game?.capacity, 3)));
    setText('lives', number(data.lives, number(this.game?.continuesLeft, 3)));
    setText('hs', Math.round(number(this.readNumber('kanoHigh', 0))));
    setText('g-money', Math.round(number(data.money, number(this.game?.money))));
    setText('final-hs', Math.round(number(this.readNumber('kanoHigh', 0))));

    if (data.mission) {
      const missionText = data.mission.text || data.mission.name || 'Mission active';
      setText('mission-label', `🎯 ${missionText}`);
    }
    if (data.route) this.setRoute(data.route);
    if (data.radio) this.setRadio(data.radio);
    if (data.weather !== undefined) this.setWeather(data.weather);
    if (data.combo !== undefined) this.showCombo(data.combo);

    const warning = this.el('lastma-warning');
    if (warning) warning.style.opacity = data.karotaWanted ? '1' : '0';
  }

  readNumber(key, fallback = 0) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  setWeather(weather) {
    const element = this.el('weather-label');
    if (!element) return;
    const key = typeof weather === 'string' ? weather : weather?.id || weather?.type || '';
    const labels = CONFIG.WEATHER || {};
    element.textContent = labels[key] || (typeof weather === 'object' && weather?.name) || (key ? String(key) : '☀️ Clear');
  }

  updateDailyMission(status = {}) {
    const mission = this.el('daily-mission');
    if (mission) {
      const progress = Math.max(0, Math.min(1, Number(status.progress) || 0));
      const percent = Math.round(progress * 100);
      const label = status.description || 'Drive 1.5 km today to unlock your daily reward.';
      mission.textContent = `${label} (${percent}%)`;
      mission.setAttribute('aria-live', 'polite');
    }
    const button = this.el('claim-daily');
    if (button) {
      button.disabled = Boolean(status.claimed);
      button.textContent = status.claimed ? 'DAILY REWARD CLAIMED' : `CLAIM ₦${Number(status.reward) || 500} REWARD`;
      button.style.opacity = status.claimed ? '0.55' : '1';
    }
  }

  setRoute(route) {
    const element = this.el('route-label');
    if (element && route) element.textContent = route.name || route.title || String(route.id || '');
  }

  setDriver(driver) {
    if (driver?.name) this.showToast(`Driver selected: ${driver.name}`);
    this.renderGarage();
  }

  setPaint(paint) {
    if (paint?.name) this.showToast(`Paint selected: ${paint.name}`);
    this.renderGarage();
  }

  setKeke(keke) {
    if (keke?.name) this.showToast(`Keke selected: ${keke.name}`);
    this.renderGarage();
  }

  setRadio(station) {
    const element = this.el('radio-bar');
    if (!element) return;
    let label = station;
    if (station && typeof station === 'object') {
      label = station.name || station.label || station.title || station.id || 'Radio';
    }
    element.textContent = `📻 ${String(label || 'Radio')}`;
  }

  showOver(stats = {}) {
    this.hideEvent();
    this.hidePauseOverlay();
    this.showOnlyScreen('over-screen');
    this.updateFinalStats(stats);
  }

  updateFinalStats(stats = {}) {
    const element = this.el('final-stats');
    if (!element) return;
    const lines = [
      `Score: ₦${Math.round(Number(stats.score) || 0).toLocaleString('en-NG')}`,
      `Money: ₦${Math.round(Number(stats.money) || 0).toLocaleString('en-NG')}`,
      `Distance: ${(Number(stats.dist) || 0).toFixed(2)} km`,
      `Passengers: ${Math.round(Number(stats.passengers) || 0)}`,
      `Completed trips: ${Math.round(Number(stats.drops) || 0)}`,
      `Best combo: ×${Math.round(Number(stats.bestCombo) || 0)}`,
      `Near misses: ${Math.round(Number(stats.nearMisses) || 0)}`,
      `Level: ${Math.round(Number(stats.level) || 1)}`
    ];
    if (stats.route) lines.push(`Route: ${String(stats.route)}`);
    if (stats.driver) lines.push(`Driver: ${String(stats.driver)}`);
    if (stats.keke) lines.push(`Keke: ${String(stats.keke)}`);
    if (Number(stats.achievementReward) > 0) {
      lines.push(`Achievement rewards: ₦${Math.round(Number(stats.achievementReward)).toLocaleString('en-NG')}`);
    }
    element.textContent = lines.join('\n');
  }

  renderRoutes() {
    const list = this.el('route-list');
    if (!list) return;
    list.replaceChildren();
    const routes = this.game?.getRouteCatalog?.() || Object.values(CONFIG.ROUTES || {});

    for (const route of routes) {
      if (!route) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'route-card';
      button.setAttribute('aria-pressed', String(Boolean(route.selected)));

      const title = document.createElement('div');
      title.className = 'rname';
      title.textContent = `${route.selected ? '✓ ' : ''}${route.name || route.id || 'Route'}`;
      const description = document.createElement('div');
      description.className = 'rdesc';
      description.textContent = route.description || 'Kano transport corridor';
      button.append(title, description);
      button.addEventListener('click', () => {
        if (this.game?.selectRoute?.(route.id)) {
          this.showToast(`Route selected: ${route.name || route.id}`);
          this.showStart();
        }
      });
      list.appendChild(button);
    }
  }

  renderGarage() {
    if (typeof document === 'undefined' || !this.game) return;
    this.renderPaints();
    this.renderDrivers();
    this.renderDriverStyles();
    this.renderKekes();
    this.renderUpgrades();
    this.renderRadios();
    const money = this.el('garage-money');
    if (money) money.textContent = `₦${Math.round(Number(this.game.money) || 0).toLocaleString('en-NG')} available`;
  }

  renderOptionButton(containerId, label, detail, selected, action, disabled = false) {
    const container = this.el(containerId);
    if (!container) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'garage-option';
    button.disabled = Boolean(disabled);
    button.setAttribute('aria-pressed', String(Boolean(selected)));
    button.style.cssText = [
      'min-height:44px', 'padding:9px 10px', 'border-radius:10px',
      `border:1px solid ${selected ? 'rgba(245,197,66,.8)' : 'rgba(255,255,255,.12)'}`,
      `background:${selected ? 'rgba(245,197,66,.18)' : 'rgba(12,18,32,.92)'}`,
      `color:${selected ? '#f5c542' : '#f1f5f9'}`,
      'font:600 12px system-ui,sans-serif', 'text-align:left',
      'cursor:pointer', 'overflow-wrap:anywhere', 'opacity:1'
    ].join(';');
    const title = document.createElement('span');
    title.textContent = String(label || 'Option');
    title.style.display = 'block';
    const sub = document.createElement('small');
    sub.textContent = String(detail || (selected ? 'Selected' : 'Tap to select'));
    sub.style.cssText = 'display:block;margin-top:3px;font-size:10px;line-height:1.35;opacity:.75';
    button.append(title, sub);
    if (disabled) {
      button.style.opacity = '.45';
      button.style.cursor = 'not-allowed';
    } else {
      button.addEventListener('click', action);
    }
    container.appendChild(button);
    return button;
  }

  renderPaints() {
    const container = this.el('paint-grid');
    if (!container) return;
    container.replaceChildren();
    const paints = { ...(CONFIG.PAINTS || {}), ...(CONFIG.SPONSORED_LIVERIES || {}) };
    const owned = this.readOwnedSet('kano-run-owned-paints', ['classic', this.game.selectedPaint || 'classic']);
    for (const [id, paint] of Object.entries(paints)) {
      const price = Math.max(0, Number(paint.price) || 0);
      const selected = this.game.selectedPaint === id;
      const isOwned = owned.has(id) || price === 0;
      const disabled = !isOwned && (Number(this.game.money) || 0) < price;
      this.renderOptionButton('paint-grid', paint.name || id,
        isOwned ? (selected ? 'Selected' : 'Owned') : `₦${price.toLocaleString('en-NG')}`,
        selected, () => {
          if (!isOwned) {
            this.game.money -= price;
            owned.add(id);
            this.writeOwnedSet('kano-run-owned-paints', owned);
            this.game._saveSelection?.();
          }
          this.game.selectPaint?.(id);
          this.renderGarage();
        }, disabled);
    }
  }

  renderDrivers() {
    const container = this.el('driver-char-grid');
    if (!container) return;
    container.replaceChildren();
    const drivers = this.game.getDriverCatalog?.() || Object.values(CONFIG.DRIVERS || {});
    const owned = this.readOwnedSet('kano-run-owned-drivers', ['ruffneck', this.game.selectedDriver || 'ruffneck']);
    for (const driver of drivers) {
      if (!driver) continue;
      const id = driver.id;
      const price = Math.max(0, Number(driver.price) || 0);
      const selected = this.game.selectedDriver === id;
      const isOwned = owned.has(id) || price === 0;
      const disabled = !isOwned && (Number(this.game.money) || 0) < price;
      this.renderOptionButton('driver-char-grid', driver.name || id,
        isOwned ? (driver.title || (selected ? 'Selected' : 'Owned')) : `₦${price.toLocaleString('en-NG')}`,
        selected, () => {
          if (!isOwned) {
            this.game.money -= price;
            owned.add(id);
            driver.unlocked = true;
            this.writeOwnedSet('kano-run-owned-drivers', owned);
          }
          const success = this.game.selectDriver?.(id);
          if (success === false) {
            if (!isOwned) {
              this.game.money += price;
              owned.delete(id);
              this.writeOwnedSet('kano-run-owned-drivers', owned);
            }
            this.showToast('This driver is not available in the current game build.');
          }
          this.game._saveSelection?.();
          this.renderGarage();
        }, disabled);
    }
  }

  renderDriverStyles() {
    const container = this.el('driver-grid');
    if (!container) return;
    container.replaceChildren();
    const styles = CONFIG.DRIVER_STYLES || {};
    const selected = this.readString('kano-run-driver-style', 'classic');
    const owned = this.readOwnedSet('kano-run-owned-driver-styles', ['classic']);
    for (const [id, style] of Object.entries(styles)) {
      const price = Math.max(0, Number(style.price) || 0);
      const isSelected = selected === id;
      const isOwned = owned.has(id) || price === 0;
      const disabled = !isOwned && (Number(this.game.money) || 0) < price;
      this.renderOptionButton('driver-grid', style.name || id,
        isOwned ? (isSelected ? 'Selected' : 'Owned') : `₦${price.toLocaleString('en-NG')}`,
        isSelected, () => {
          if (!isOwned) {
            this.game.money -= price;
            owned.add(id);
            this.writeOwnedSet('kano-run-owned-driver-styles', owned);
            this.game._saveSelection?.();
          }
          this.writeString('kano-run-driver-style', id);
          this.game.selectedDriverStyle = id;
          this.game.renderer3d?.applyDriverStyle?.(id, style);
          this.showToast(`Driver dressing: ${style.name || id}`);
          this.renderGarage();
        }, disabled);
    }
  }

  renderKekes() {
    const container = this.el('keke-grid');
    if (!container) return;
    container.replaceChildren();
    const kekes = this.game.getKekeCatalog?.() || [];
    for (const keke of kekes) {
      if (!keke) continue;
      const selected = this.game.selectedKeke === keke.id;
      const locked = keke.unlocked === false || (Number(this.game.level) || 1) < (Number(keke.unlockLevel) || 1);
      this.renderOptionButton('keke-grid', keke.name || keke.id,
        locked ? `Unlock at level ${Number(keke.unlockLevel) || 1}` : (selected ? 'Selected keke' : `Capacity: ${Number(keke.capacity) || 3}`),
        selected, () => {
          const ok = this.game.selectKeke?.(keke.id);
          if (ok !== false) this.renderGarage();
        }, locked);
    }

    // If this game build does not provide a keke catalog, explain why the slot
    // is empty instead of leaving an apparently broken panel.
    if (!kekes.length) {
      const fallback = document.createElement('p');
      fallback.textContent = 'Keke options are unavailable in this build.';
      fallback.style.cssText = 'color:#94a3b8;font-size:12px';
      container.appendChild(fallback);
    }
  }

  readUpgradeLevels() {
    const defaults = { capacity: 0, speed: 0, horn: 0 };
    try {
      const value = JSON.parse(localStorage.getItem('kano-run-upgrade-levels') || 'null');
      if (!value || typeof value !== 'object') return defaults;
      for (const key of Object.keys(defaults)) {
        const max = Math.max(0, (CONFIG.UPGRADES?.[key]?.levels?.length || 1) - 1);
        defaults[key] = Math.max(0, Math.min(max, Math.floor(Number(value[key]) || 0)));
      }
      return defaults;
    } catch {
      return defaults;
    }
  }

  writeUpgradeLevels(levels) {
    try { localStorage.setItem('kano-run-upgrade-levels', JSON.stringify(levels)); } catch {}
  }

  installStartUpgradeHook() {
    const game = this.game;
    if (!game || typeof game.start !== 'function' || game.__kanoStartUpgradeHook) return;
    const originalStart = game.start.bind(game);
    game.start = (...args) => {
      const result = originalStart(...args);
      this.applyPurchasedUpgrades();
      return result;
    };
    game.__kanoStartUpgradeHook = true;
  }

  applyPurchasedUpgrades() {
    const levels = this.readUpgradeLevels();
    const capacityUpgrade = CONFIG.UPGRADES?.capacity;
    if (capacityUpgrade?.levels?.length) {
      const target = Number(capacityUpgrade.levels[levels.capacity]) || Number(this.game.capacity) || 3;
      this.game.capacity = Math.max(Number(this.game.capacity) || 3, target);
    }
    const speedUpgrade = CONFIG.UPGRADES?.speed;
    if (speedUpgrade?.levels?.length) {
      const level = Number(speedUpgrade.levels[levels.speed]) || 0;
      this.game.maxSpeed = Math.max(5.5, Number(this.game.maxSpeed) || 5.5) + level * 0.75;
    }
    this.game.hornUpgradeLevel = levels.horn || 0;
  }

  renderUpgrades() {
    const container = this.el('upgrade-grid');
    if (!container) return;
    container.replaceChildren();
    const upgrades = CONFIG.UPGRADES || {};
    const current = this.readUpgradeLevels();

    for (const [id, upgrade] of Object.entries(upgrades)) {
      if (!upgrade || !Array.isArray(upgrade.levels)) continue;
      const index = Math.min(current[id] || 0, upgrade.levels.length - 1);
      const nextIndex = index + 1;
      const maxed = nextIndex >= upgrade.levels.length;
      const price = maxed ? 0 : Math.max(0, Number(upgrade.prices?.[nextIndex]) || 0);
      const detail = maxed
        ? `MAX LEVEL — ${upgrade.desc || upgrade.name || id}`
        : `Next upgrade: ₦${price.toLocaleString('en-NG')} — ${upgrade.desc || upgrade.name || id}`;
      this.renderOptionButton('upgrade-grid', upgrade.name || id,
        `Level ${index + 1}${maxed ? ' / MAX' : ''}`, maxed,
        () => {
          if (maxed) return;
          if ((Number(this.game.money) || 0) < price) {
            this.showToast(`You need ₦${price.toLocaleString('en-NG')} for this upgrade.`);
            return;
          }
          this.game.money -= price;
          current[id] = nextIndex;
          this.writeUpgradeLevels(current);
          this.game._saveSelection?.();
          this.renderGarage();
          this.showToast(`${upgrade.name || id} upgrade saved for your next run.`);
        }, maxed || (Number(this.game.money) || 0) < price);
      const created = container.lastElementChild;
      if (created) {
        const small = created.querySelector('small');
        if (small) small.textContent = detail;
      }
    }
  }

  renderRadios() {
    const container = this.el('radio-list');
    if (!container) return;
    container.replaceChildren();
    const radios = CONFIG.RADIO || CONFIG.RADIO_STATIONS || [];
    for (const station of radios) {
      if (!station) continue;
      const selected = this.game.selectedRadio === station.id;
      this.renderOptionButton('radio-list', station.name || station.label || station.id,
        selected ? 'Now selected' : (station.freq ? `${station.freq} FM` : 'Tap to select'),
        selected, () => {
          this.game.selectRadio?.(station.id);
          this.renderGarage();
        });
    }
  }

  readOwnedSet(key, fallback = []) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return new Set(Array.isArray(parsed) ? parsed : fallback);
    } catch {
      return new Set(fallback);
    }
  }

  writeOwnedSet(key, values) {
    try { localStorage.setItem(key, JSON.stringify([...values])); } catch {}
  }

  readString(key, fallback = '') {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  }

  writeString(key, value) {
    try { localStorage.setItem(key, String(value)); } catch {}
  }

  async shareRun() {
    const text = `I just played Kano Run! Score: ₦${Math.round(Number(this.game?.score) || 0).toLocaleString('en-NG')} — Kano street driving simulator.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Kano Run', text, url: location.href });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.showToast('Run summary copied to clipboard.');
        return;
      }
      this.showToast(text);
    } catch (error) {
      if (error?.name !== 'AbortError') this.showToast('Sharing is not available on this device.');
    }
  }
}
