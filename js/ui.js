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
    document.getElementById('hs').textContent = game.high;
    this.syncSettingsButtons();
    this.updateDailyUI(game);
  }

  bind() {
    document.getElementById('start-btn').onclick = () => this.game.start();
    document.getElementById('retry-btn').onclick = () => this.game.start();
    document.getElementById('home-btn').onclick = () => this.showStart();
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) shareBtn.onclick = () => this.shareRun(this.game);
    document.getElementById('route-btn').onclick = () => {
      this.startScreen.style.display = 'none';
      this.routeScreen.style.display = 'flex';
    };
    document.getElementById('route-back').onclick = () => {
      this.routeScreen.style.display = 'none';
      this.startScreen.style.display = 'flex';
    };
    const gBtn = document.getElementById('garage-btn');
    if (gBtn) {
      gBtn.onclick = () => {
        this.startScreen.style.display = 'none';
        this.garageScreen.style.display = 'flex';
        this.renderDrivers();
      };
    }
    const gBack = document.getElementById('garage-back');
    if (gBack) {
      gBack.onclick = () => {
        this.garageScreen.style.display = 'none';
        this.startScreen.style.display = 'flex';
      };
    }
    const radioBtn = document.getElementById('radio-btn');
    if (radioBtn) radioBtn.onclick = () => this.game.cycleRadio();

    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) muteBtn.onclick = () => {
      const next = !Storage.getMuted();
      Storage.setMuted(next);
      import('./audio.js').then(({ Audio }) => {
        Audio.muted = next;
        if (next) Audio.stopEngine();
      });
      this.syncSettingsButtons();
      this.showMissionToast(next ? 'Sound off' : 'Sound on');
    };

    const qBtn = document.getElementById('quality-btn');
    if (qBtn) qBtn.onclick = () => {
      const next = !Storage.getLowQuality();
      Storage.setLowQuality(next);
      if (this.game.renderer3d?.applyQuality) this.game.renderer3d.applyQuality(next);
      this.syncSettingsButtons();
      this.showMissionToast(next ? 'Performance mode' : 'High quality');
    };

    const claimBtn = document.getElementById('claim-daily');
    if (claimBtn) claimBtn.onclick = () => this.game.claimDaily();

    const left = document.getElementById('left-btn');
    const right = document.getElementById('right-btn');
    const horn = document.getElementById('horn-btn');
    const hold = (el, fn) => {
      let t;
      const start = (e) => { e.preventDefault(); fn(); t = setInterval(fn, 140); };
      const end = () => clearInterval(t);
      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('mousedown', start);
      el.addEventListener('touchend', end);
      el.addEventListener('mouseup', end);
      el.addEventListener('mouseleave', end);
    };
    hold(left, () => this.game.changeLane(-1));
    hold(right, () => this.game.changeLane(1));
    horn.addEventListener('click', () => this.game.horn());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') this.game.changeLane(-1);
      if (e.key === 'ArrowRight' || e.key === 'd') this.game.changeLane(1);
      if (e.key === ' ' || e.key === 'h') this.game.horn();
      if (e.key === 'r') this.game.cycleRadio();
    });
  }

  renderRoutes() {
    const list = document.getElementById('route-list');
    list.innerHTML = '';
    Object.values(CONFIG.ROUTES).forEach((r) => {
      const div = document.createElement('div');
      div.className = 'route-card';
      div.innerHTML = `<div class="rname">${r.name}</div><div class="rdesc">${r.description} · Fare ~₦${r.baseFare}</div>`;
      div.onclick = () => {
        this.game.selectedRoute = r.id;
        Storage.setRoute(r.id);
        this.routeScreen.style.display = 'none';
        this.startScreen.style.display = 'flex';
        this.showMissionToast('Route: ' + r.name);
      };
      list.appendChild(div);
    });
  }

  renderDrivers() {
    const list = document.getElementById('driver-list');
    if (!list) return;
    list.innerHTML = '';
    Object.values(CONFIG.DRIVERS).forEach((d) => {
      const selected = this.game.selectedDriver === d.id;
      const div = document.createElement('div');
      div.className = 'route-card';
      if (selected) div.style.borderColor = '#f5c542';
      div.innerHTML = `<div class="rname">${selected ? '✓ ' : ''}${d.name} — ${d.title}</div><div class="rdesc">${d.desc}</div>`;
      div.onclick = () => {
        this.game.selectedDriver = d.id;
        Storage.setDriver(d.id);
        this.renderDrivers();
        this.showMissionToast('Driver: ' + d.name);
      };
      list.appendChild(div);
    });
    this.renderPaints();
    this.renderLeaderboard();
    this.renderAchievements();
  }

  renderPaints() {
    const list = document.getElementById('paint-list');
    if (!list || !CONFIG.PAINTS) return;
    list.innerHTML = '';
    Object.values(CONFIG.PAINTS).forEach((p) => {
      const selected = this.game.selectedPaint === p.id;
      const div = document.createElement('div');
      div.className = 'route-card';
      div.style.padding = '10px';
      if (selected) div.style.borderColor = '#f5c542';
      const hex = '#' + p.color.toString(16).padStart(6, '0');
      div.innerHTML = `<div style="height:22px;border-radius:6px;background:${hex};margin-bottom:6px"></div><div class="rname" style="font-size:0.8rem">${selected ? '✓ ' : ''}${p.name}</div>`;
      div.onclick = () => {
        this.game.selectedPaint = p.id;
        Storage.setPaint(p.id);
        if (this.game.renderer3d?.applyPaint) this.game.renderer3d.applyPaint(p.id);
        this.renderPaints();
        this.showMissionToast('Paint: ' + p.name);
      };
      list.appendChild(div);
    });
  }

  renderLeaderboard() {
    const el = document.getElementById('leaderboard');
    if (!el) return;
    const rows = Storage.getLeaderboard();
    if (!rows.length) {
      el.textContent = 'No runs yet — finish a drive!';
      return;
    }
    el.innerHTML = rows.map((r, i) =>
      `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">#${i + 1} ₦${r.score.toLocaleString()} · ${r.dist}km · ${r.driver}</div>`
    ).join('');
  }

  renderAchievements() {
    const el = document.getElementById('ach-list');
    if (!el || !CONFIG.ACHIEVEMENTS) return;
    const unlocked = Storage.getAchievements();
    el.innerHTML = CONFIG.ACHIEVEMENTS.map((a) => {
      const on = !!unlocked[a.id];
      return `<div style="padding:5px 0;color:${on ? '#f5c542' : '#64748b'}">${on ? '🏆' : '🔒'} ${a.name} — ${a.desc}</div>`;
    }).join('');
  }

  showStart() {
    this.game.state = STATE.START;
    this.overScreen.style.display = 'none';
    this.routeScreen.style.display = 'none';
    if (this.garageScreen) this.garageScreen.style.display = 'none';
    this.startScreen.style.display = 'flex';
    document.getElementById('hs').textContent = this.game.high;
    this.hideEvent();
  }

  showPlaying() {
    this.startScreen.style.display = 'none';
    this.routeScreen.style.display = 'none';
    if (this.garageScreen) this.garageScreen.style.display = 'none';
    this.overScreen.style.display = 'none';
    this.hideEvent();
  }

  showGameOver(game) {
    this.overScreen.style.display = 'flex';
    document.getElementById('final-stats').innerHTML =
      `<b>₦${Math.floor(game.score).toLocaleString()}</b> · ${game.dist.toFixed(1)} km · ${game.totalPax} pax · ${game.dropCount} drops`;
    document.getElementById('final-hs').textContent = game.high;
  }

  updateHUD(game) {
    this.scoreEl.textContent = Math.floor(game.score);
    this.distEl.textContent = game.dist.toFixed(1);
    this.paxEl.textContent = game.paxOnBoard;
    this.capEl.textContent = game.capacity;
    if (this.livesEl) this.livesEl.textContent = game.continuesLeft;
  }

  setMission(t) { if (this.missionLabel) this.missionLabel.textContent = '🎯 ' + t; }
  setRouteLabel(t) { if (this.routeLabel) this.routeLabel.textContent = t || ''; }
  setRadio(t) { if (this.radioLabel) this.radioLabel.textContent = '📻 ' + (t || ''); }
  setDriverLabel(t) { if (this.driverLabel) this.driverLabel.textContent = '👤 ' + (t || ''); }

  showMissionToast(msg) {
    if (!this.toast) return;
    this.toast.textContent = msg;
    this.toast.style.opacity = '1';
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { this.toast.style.opacity = '0'; }, 1600);
  }

  showEvent(title, text, choices) {
    this.eventTitle.textContent = title;
    this.eventText.textContent = text;
    this.eventChoices.innerHTML = '';
    this.eventBox.style.display = 'block';
    this.game.state = STATE.EVENT;
    choices.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = c.label;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.eventBox.style.display = 'none';
        if (typeof c.action === 'function') {
          try { c.action(); } catch (err) { console.error(err); }
        }
      });
      this.eventChoices.appendChild(btn);
    });
  }

  syncSettingsButtons() {
    const muteBtn = document.getElementById('mute-btn');
    const qBtn = document.getElementById('quality-btn');
    if (muteBtn) muteBtn.textContent = Storage.getMuted() ? '🔇 Muted' : '🔊 Sound';
    if (qBtn) qBtn.textContent = Storage.getLowQuality() ? '⚡ Performance' : '✨ Quality';
  }

  updateDailyUI(game) {
    const box = document.getElementById('daily-box');
    const claim = document.getElementById('claim-daily');
    if (!box) return;
    const streak = Storage.getStreak();
    const claimed = Storage.isDailyClaimed();
    if (claimed) {
      box.textContent = `📅 Daily claimed · Streak ${streak} day${streak === 1 ? '' : 's'}`;
      if (claim) claim.style.display = 'none';
    } else {
      box.textContent = `📅 Daily reward ready · Current streak ${streak}`;
      if (claim) claim.style.display = 'inline-block';
    }
  }

  hideEvent() {
    if (this.eventBox) this.eventBox.style.display = 'none';
  }

  async shareRun(game) {
    const route = CONFIG.ROUTES[game.selectedRoute];
    const driver = CONFIG.DRIVERS[game.selectedDriver] || CONFIG.DRIVERS.ruffneck;
    const text = `I just drove ₦${Math.floor(game.score).toLocaleString()} on ${route?.name || 'Kano'} as ${driver.name} in Kano Run 3D! ${game.dist.toFixed(1)} km · ${game.totalPax} passengers. Play: https://kano-run.vercel.app`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Kano Run', text, url: 'https://kano-run.vercel.app' });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        this.showMissionToast('Copied result to clipboard');
      } else {
        prompt('Copy your run:', text);
      }
    } catch (e) {
      try {
        await navigator.clipboard.writeText(text);
        this.showMissionToast('Copied to clipboard');
      } catch {
        this.showMissionToast('Share cancelled');
      }
    }
  }
}
