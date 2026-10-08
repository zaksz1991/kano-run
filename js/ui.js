// UI Controller - Updated with routes, events, dressing, radio
import { CONFIG, STATE } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';

export class UI {
  constructor(game) {
    this.game = game;

    this.startScreen = document.getElementById('start-screen');
    this.garageScreen = document.getElementById('garage-screen');
    this.overScreen = document.getElementById('over-screen');
    this.routeScreen = document.getElementById('route-screen');
    this.controls = document.getElementById('controls');
    this.missionLabel = document.getElementById('mission-label');
    this.radioBar = document.getElementById('radio-bar');
    this.weatherLabel = document.getElementById('weather-label');
    this.routeLabel = document.getElementById('route-label');
    this.landmarkEl = document.getElementById('landmark');
    this.missionToast = document.getElementById('mission-toast');
    this.eventBox = document.getElementById('event-box');
    this.eventTitle = document.getElementById('event-title');
    this.eventText = document.getElementById('event-text');
    this.eventChoices = document.getElementById('event-choices');

    this.scoreEl = document.getElementById('score');
    this.distEl = document.getElementById('dist');
    this.paxEl = document.getElementById('pax');
    this.capEl = document.getElementById('capacity');
    this.hsEl = document.getElementById('hs');
    this.gMoneyEl = document.getElementById('g-money');
    this.finalStats = document.getElementById('final-stats');
    this.finalHs = document.getElementById('final-hs');
    this.garageMoney = document.getElementById('garage-money');
    this.paintGrid = document.getElementById('paint-grid');
    this.driverGrid = document.getElementById('driver-grid');
    this.upgradeGrid = document.getElementById('upgrade-grid');
    this.radioList = document.getElementById('radio-list');
    this.routeList = document.getElementById('route-list');

    this.bindEvents();
    this.updateStartMoney();
    this.updateRouteLabel();
  }

  bindEvents() {
    document.getElementById('start-btn').onclick = () => this.game.start();
    document.getElementById('retry-btn').onclick = () => this.game.start();
    document.getElementById('garage-btn').onclick = () => this.openGarage();
    document.getElementById('over-garage').onclick = () => this.openGarage();
    document.getElementById('share-btn').onclick = () => this.shareRun(this.game);
    document.getElementById('garage-back').onclick = () => this.closeGarage();
    document.getElementById('route-btn').onclick = () => this.openRouteSelect();
    document.getElementById('route-back').onclick = () => this.closeRouteSelect();

    document.getElementById('left-btn').onclick = () => this.game.changeLane(-1);
    document.getElementById('right-btn').onclick = () => this.game.changeLane(1);
    document.getElementById('horn-btn').onclick = () => this.game.horn();
    document.getElementById('radio-btn').onclick = () => this.game.cycleRadio();

    document.addEventListener('keydown', e => {
      if (this.game.state === STATE.PLAY) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.game.changeLane(-1);
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.game.changeLane(1);
        if (e.key === ' ' || e.key === 'h' || e.key === 'H') this.game.horn();
        if (e.key === 'r' || e.key === 'R') this.game.cycleRadio();
      }
      if ((e.key === 'Enter' || e.key === ' ') &&
          (this.game.state === STATE.START || this.game.state === STATE.OVER)) {
        this.game.start();
      }
    });

    let tx = 0;
    const canvas = this.game.canvas;
    canvas.addEventListener('touchstart', e => { e.preventDefault(); tx = e.touches[0].clientX; }, { passive: false });
    canvas.addEventListener('touchend', e => {
      e.preventDefault();
      if (this.game.state !== STATE.PLAY) return;
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 42) this.game.changeLane(dx > 0 ? 1 : -1);
    }, { passive: false });
  }

  showPlaying() {
    this.startScreen.style.display = 'none';
    this.overScreen.style.display = 'none';
    this.garageScreen.style.display = 'none';
    this.routeScreen.style.display = 'none';
    this.controls.style.display = 'flex';
    this.hideEvent();
    this.updateRouteLabel();
  }

  showGameOver(game) {
    this.controls.style.display = 'none';
    this.radioBar.classList.remove('show');
    this.hideEvent();
    this.finalStats.innerHTML =
      `Drove <b>${game.dist.toFixed(1)} km</b><br>
       Carried <b>${game.totalPax}</b> passengers<br>
       Max Combo: <b>${game.maxCombo || 0}x</b><br>
       Earned ₦ <b>${game.score.toLocaleString()}</b>`;
    this.finalHs.textContent = game.high.toLocaleString();
    this.overScreen.style.display = 'flex';
    this.updateStartMoney();
    if (this.game.initDaily) {
      this.game.initDaily();
      this.updateDailyUI(this.game);
    }
  }

  openGarage() {
    this.game.state = STATE.GARAGE;
    Audio.stopEngine();
    this.startScreen.style.display = 'none';
    this.overScreen.style.display = 'none';
    this.routeScreen.style.display = 'none';
    this.controls.style.display = 'none';
    this.garageScreen.style.display = 'flex';
    this.renderGarage();
  }

  closeGarage() {
    this.garageScreen.style.display = 'none';
    this.startScreen.style.display = 'flex';
    this.game.state = STATE.START;
    this.updateStartMoney();
    if (this.game.initDaily) {
      this.game.initDaily();
      this.updateDailyUI(this.game);
    }
  }

  openRouteSelect() {
    this.game.state = STATE.ROUTE_SELECT;
    this.startScreen.style.display = 'none';
    this.routeScreen.style.display = 'flex';
    this.renderRoutes();
  }

  closeRouteSelect() {
    this.routeScreen.style.display = 'none';
    this.startScreen.style.display = 'flex';
    this.game.state = STATE.START;
  }

  renderRoutes() {
    this.routeList.innerHTML = '';
    const current = Storage.getSelectedRoute();
    for (const [id, route] of Object.entries(CONFIG.ROUTES)) {
      const el = document.createElement('div');
      el.style.cssText = `background:#111827;border:2px solid ${current===id?'#eab308':'#1e293b'};border-radius:12px;padding:12px;cursor:pointer;text-align:left;`;
      el.innerHTML = `
        <div style="font-weight:700;color:#fbbf24;margin-bottom:4px;">${route.name}</div>
        <div style="font-size:0.8rem;color:#94a3b8;">${route.description}</div>
        <div style="font-size:0.75rem;color:#64748b;margin-top:4px;">Difficulty: ${'★'.repeat(Math.round(route.difficulty*3))} • Base fare ₦${route.baseFare}</div>`;
      el.onclick = () => {
        Storage.setSelectedRoute(id);
        this.game.selectedRoute = id;
        this.renderRoutes();
        this.updateRouteLabel();
      };
      this.routeList.appendChild(el);
    }
  }

  renderGarage() {
    const game = this.game;
    this.garageMoney.textContent = `₦${game.money.toLocaleString()} available`;

    // Selectable Drivers
    const charGrid = document.getElementById('driver-char-grid');
    if (charGrid) {
      charGrid.innerHTML = '';
      for (const [id, d] of Object.entries(CONFIG.DRIVERS)) {
        const unlocked = Storage.isDriverUnlocked(id);
        const selected = game.selectedDriver === id;
        const el = document.createElement('div');
        el.className = 'paint-option' + (selected ? ' selected' : '');
        el.innerHTML = `
          <div class="swatch" style="background:${d.color}"></div>
          <div class="name">${d.name}</div>
          <div style="font-size:0.68rem;color:#94a3b8;">${d.title}</div>
          <div style="font-size:0.65rem;color:#64748b;margin-top:2px">${unlocked ? (selected ? 'Selected' : 'Owned') : '₦' + d.price}</div>`;
        el.onclick = () => {
          if (!unlocked) {
            if (game.money < d.price) return;
            game.money -= d.price;
            Storage.setMoney(game.money);
            Storage.unlockDriver(id);
            Audio.purchase();
          }
          game.selectedDriver = id;
          Storage.setSelectedDriver(id);
          game.applyDriverBonuses();
          this.renderGarage();
        };
        charGrid.appendChild(el);
      }
    }

    // Paints + Sponsored Liveries
    this.paintGrid.innerHTML = '';
    const allPaints = { ...CONFIG.PAINTS, ...CONFIG.SPONSORED_LIVERIES };
    for (const [id, p] of Object.entries(allPaints)) {
      const owned = Storage.isOwned(id) || (p.sponsored === true);
      const el = document.createElement('div');
      el.className = 'paint-option' + (game.currentPaint === id ? ' selected' : '');
      el.innerHTML = `<div class="swatch" style="background:${p.body}"></div>
        <div class="name">${p.name}</div>
        <div style="font-size:0.7rem;color:#64748b;margin-top:2px">${owned ? 'Owned' : '₦' + p.price}</div>`;
      el.onclick = () => {
        if (!owned) {
          if (game.money < p.price) return;
          game.money -= p.price;
          Storage.setMoney(game.money);
          Storage.setOwned(id);
          Audio.purchase();
        }
        game.currentPaint = id;
        Storage.setPaint(id);
        this.renderGarage();
      };
      this.paintGrid.appendChild(el);
    }

    // Driver dressing
    this.driverGrid.innerHTML = '';
    for (const [id, d] of Object.entries(CONFIG.DRIVER_STYLES)) {
      const owned = Storage.isDriverOwned(id);
      const el = document.createElement('div');
      el.className = 'paint-option' + (game.driverStyle === id ? ' selected' : '');
      el.innerHTML = `<div class="swatch" style="background:${d.color}"></div>
        <div class="name">${d.name}</div>
        <div style="font-size:0.7rem;color:#64748b;margin-top:2px">${owned ? 'Owned' : '₦' + d.price}</div>`;
      el.onclick = () => {
        if (!owned) {
          if (game.money < d.price) return;
          game.money -= d.price;
          Storage.setMoney(game.money);
          Storage.setDriverOwned(id);
          Audio.purchase();
        }
        game.driverStyle = id;
        Storage.setDriverStyle(id);
        this.renderGarage();
      };
      this.driverGrid.appendChild(el);
    }

    // Upgrades
    this.upgradeGrid.innerHTML = '';
    for (const [key, u] of Object.entries(CONFIG.UPGRADES)) {
      let level = Storage.get(u.key, 0);
      if (key === 'capacity') level = Math.max(0, (game.capacity || 3) - 3);
      const nextPrice = u.prices[level + 1];
      const maxed = level >= u.levels.length - 1;
      const el = document.createElement('div');
      el.className = 'upgrade-option' + (maxed ? ' owned' : '');
      el.innerHTML = `<div class="name">${u.name} (Lv ${level})</div>
        <div class="desc">${u.desc}</div>
        <div style="font-size:0.7rem;color:#64748b;margin-top:3px">${maxed ? 'MAX' : '₦' + nextPrice}</div>`;
      el.onclick = () => {
        if (maxed || game.money < nextPrice) return;
        game.money -= nextPrice;
        Storage.setMoney(game.money);
        const newLevel = level + 1;
        if (key === 'capacity') {
          game.capacity = u.levels[newLevel];
          Storage.setCapacity(game.capacity);
        } else if (key === 'speed') {
          game.speedBoost = newLevel;
          Storage.setSpeedBoost(newLevel);
        } else if (key === 'horn') {
          game.hornPower = newLevel;
          Storage.setHornPower(newLevel);
        }
        Audio.purchase();
        this.renderGarage();
      };
      this.upgradeGrid.appendChild(el);
    }

    // Radio stations
    this.radioList.innerHTML = '';
    const currentRadio = Storage.getRadioStation();
    for (const station of CONFIG.RADIO_STATIONS) {
      const el = document.createElement('div');
      el.style.cssText = `background:#111827;border:2px solid ${currentRadio===station.id?'#a855f7':'#1e293b'};border-radius:10px;padding:8px 12px;cursor:pointer;text-align:left;font-size:0.85rem;`;
      el.innerHTML = `<span style="color:#c084fc;">📻</span> ${station.name}`;
      el.onclick = () => {
        Storage.setRadioStation(station.id);
        game.currentRadio = station.id;
        this.renderGarage();
        this.updateRadioBar();
      };
      this.radioList.appendChild(el);
    }
  }

  updateHUD(game) {
    this.scoreEl.textContent = game.score.toLocaleString();
    this.distEl.textContent = game.dist.toFixed(1);
    this.paxEl.textContent = game.paxOnBoard;
    this.capEl.textContent = game.capacity;
    const livesEl = document.getElementById('lives');
    if (livesEl) livesEl.textContent = game.continuesLeft;

    // Combo display
    const comboEl = document.getElementById('combo-display');
    if (comboEl) {
      if (game.combo >= 2) {
        const mult = game.getComboMultiplier();
        comboEl.textContent = `🔥 ${game.combo}x COMBO  •  ${mult.toFixed(1)}x`;
        comboEl.style.opacity = '1';
      } else {
        comboEl.style.opacity = '0';
      }
    }

    // LASTMA warning
    const lastmaEl = document.getElementById('lastma-warning');
    if (lastmaEl) {
      lastmaEl.style.opacity = (game.lastmaActive && game.lastmaTimer > 0) ? '1' : '0';
    }
  }

  updateStartMoney() {
    this.gMoneyEl.textContent = this.game.money.toLocaleString();
    this.hsEl.textContent = this.game.high.toLocaleString();
  }

  updateRouteLabel() {
    const route = CONFIG.ROUTES[Storage.getSelectedRoute()] || CONFIG.ROUTES.citycenter;
    if (this.routeLabel) this.routeLabel.textContent = '🛣️ ' + route.name;
  }

  updateRadioBar() {
    const station = CONFIG.RADIO_STATIONS.find(s => s.id === Storage.getRadioStation()) || CONFIG.RADIO_STATIONS[0];
    this.radioBar.textContent = `📻 ${station.name}`;
  }

  setMission(text) {
    this.missionLabel.textContent = '🎯 ' + text;
  }

  showMissionToast(text) {
    this.missionToast.textContent = text;
    this.missionToast.classList.add('show');
    setTimeout(() => this.missionToast.classList.remove('show'), 2500);
  }

  showLandmark(name) {
    this.landmarkEl.textContent = '📍 ' + name;
    this.landmarkEl.classList.add('show');
    setTimeout(() => this.landmarkEl.classList.remove('show'), 2500);
  }

  showRadio(on) {
    this.radioBar.classList.toggle('show', on);
    if (on) this.updateRadioBar();
  }

  setWeather(text) {
    this.weatherLabel.textContent = text;
  }

  // Event system (negotiation / payment / KAROTA)
  showEvent(title, text, choices) {
    this.eventTitle.textContent = title;
    this.eventText.textContent = text;
    this.eventChoices.innerHTML = '';
    this.eventBox.style.display = 'block';
    this.eventBox.style.pointerEvents = 'auto';
    this.game.state = STATE.EVENT;

    choices.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.style.cssText = 'padding:10px 14px;font-size:0.85rem;margin:0;pointer-events:auto;cursor:pointer;';
      btn.textContent = c.label;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Run action first, then close (prevents stuck state)
        const act = c.action;
        this.eventBox.style.display = 'none';
        if (typeof act === 'function') {
          try { act(); }
          catch (err) { console.error(err); }
        }
      });
      this.eventChoices.appendChild(btn);
    });
  }

  hideEvent() {
    this.eventBox.style.display = 'none';
  }

  // ========== SHARE RUN FEATURE ==========
  updateDailyUI(game) {
    const el = document.getElementById('daily-mission');
    if (!el || !game.dailyMission) return;

    const m = game.dailyMission;
    const claimed = Storage.isDailyClaimed();
    const done = m.progress >= m.target;

    let text = `📅 ${m.text} (${Math.floor(m.progress)}/${m.target})`;
    if (claimed) text = `📅 Daily claimed! Streak: ${game.streak} day${game.streak > 1 ? 's' : ''}`;
    else if (done) text = `📅 Daily ready to claim! +₦${m.reward}`;

    el.textContent = text;
    el.style.color = claimed ? '#4ade80' : (done ? '#fbbf24' : '#94a3b8');

    const claimBtn = document.getElementById('claim-daily');
    if (claimBtn) {
      claimBtn.style.display = (!claimed && done) ? 'inline-block' : 'none';
    }
  }

  async shareRun(game) {
    const route = CONFIG.ROUTES[game.selectedRoute] || CONFIG.ROUTES.citycenter;
    const station = CONFIG.RADIO_STATIONS.find(s => s.id === game.currentRadio) || CONFIG.RADIO_STATIONS[0];

    const w = 1080;
    const h = 1350;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0c4a6e');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(234, 179, 8, 0.08)';
    ctx.beginPath(); ctx.arc(w * 0.85, 120, 180, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.15, h - 150, 140, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KANO RUN', w / 2, 140);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '32px system-ui, sans-serif';
    ctx.fillText('Adaidaita Sahu', w / 2, 190);

    ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
    roundRect(ctx, w/2 - 280, 230, 560, 60, 30);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('🛣️ ' + route.name, w / 2, 270);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.fillText('SCORE', w / 2, 380);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 110px system-ui, sans-serif';
    ctx.fillText('₦' + game.score.toLocaleString(), w / 2, 500);

    const statsY = 600;
    const stats = [
      { label: 'DISTANCE', value: game.dist.toFixed(1) + ' km' },
      { label: 'PASSENGERS', value: String(game.totalPax) },
      { label: 'TOP SPEED', value: game.speed.toFixed(1) + ' km/h' }
    ];
    stats.forEach((s, i) => {
      const x = 180 + i * 360;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
      roundRect(ctx, x - 140, statsY - 40, 280, 120, 20);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText(s.label, x, statsY);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.fillText(s.value, x, statsY + 50);
    });

    ctx.fillStyle = '#c084fc';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText('📻 ' + station.name, w / 2, 800);

    ctx.fillStyle = '#64748b';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('Centre of Commerce 🇳🇬', w / 2, 920);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('Play free in your browser', w / 2, 970);

    function roundRect(ctx, x, y, width, height, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    }

    return new Promise((resolve) => {
      c.toBlob(async (blob) => {
        if (!blob) return resolve(false);
        const file = new File([blob], 'kano-run-score.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'Kano Run',
              text: `I just scored ₦${game.score.toLocaleString()} on ${route.name} in Kano Run! 🚌`,
              files: [file]
            });
            resolve(true);
            return;
          } catch (e) {}
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kano-run-score.png';
        a.click();
        URL.revokeObjectURL(url);
        resolve(true);
      }, 'image/png', 0.92);
    });
  }
}
