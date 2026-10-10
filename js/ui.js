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
    this.bind();
    this.renderRoutes();
    this.renderDrivers();
    document.getElementById('hs').textContent = game.high;
    this.syncSettingsButtons();
    this.updateDailyUI(game);
    this.showLastRun();
    this.updateSelectionStatus();
    this.maybeShowHelpOnBoot();
  }

  bind() {
    document.getElementById('start-btn').onclick = () => this.game.start();
    const helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.onclick = () => this.showHelp();
    const hudHelp = document.getElementById('hud-help');
    if (hudHelp) hudHelp.onclick = () => this.showHelp();
    const got = document.getElementById('help-gotit');
    if (got) got.onclick = () => this.hideHelp(true);
    document.getElementById('retry-btn').onclick = () => this.game.start();
    document.getElementById('home-btn').onclick = () => this.showStart();
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) shareBtn.onclick = () => this.shareRun(this.game);
    document.getElementById('route-btn').onclick = () => {
      this.startScreen.style.display = 'none';
      this.routeScreen.style.display = 'flex';
    };
    const roadBtn = document.getElementById('road-btn');
    if (roadBtn) {
      roadBtn.onclick = () => {
        const next = this.game.selectedRoadMode === 'oneway' ? 'twoway' : 'oneway';
        this.game.selectedRoadMode = next;
        Storage.set('kanoRoadMode', next);
        this.updateSelectionStatus();
        this.showMissionToast(next === 'oneway' ? 'One-way road' : 'Two-way road');
      };
    }
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

    const gas = document.getElementById('gas-btn');
    const brake = document.getElementById('brake-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const holdCtrl = (el, down, up) => {
      if (!el) return;
      const d = (e) => { e.preventDefault(); down(); };
      const u = (e) => { e.preventDefault(); up(); };
      el.addEventListener('touchstart', d, { passive: false });
      el.addEventListener('mousedown', d);
      el.addEventListener('touchend', u);
      el.addEventListener('mouseup', u);
      el.addEventListener('mouseleave', u);
      el.addEventListener('touchcancel', u);
    };
    holdCtrl(gas, () => this.game.setThrottle(1), () => this.game.setThrottle(0.25));
    holdCtrl(brake, () => this.game.setBrake(true), () => this.game.setBrake(false));
    if (pauseBtn) pauseBtn.onclick = () => this.game.togglePause();
    const camBtn = document.getElementById('cam-btn');
    if (camBtn) camBtn.onclick = () => this.game.toggleCabin();

    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) muteBtn.onclick = () => {
      const next = !Storage.getMuted();
      Storage.setMuted(next);
      Audio.muted = next;
      if (next) Audio.stopEngine();
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
      if (e.key === 'ArrowUp' || e.key === 'w') this.game.setThrottle(1);
      if (e.key === 'ArrowDown' || e.key === 's') this.game.setBrake(true);
      if (e.key === 'p' || e.key === 'Escape') this.game.togglePause();
      if (e.key === 'c') this.game.toggleCabin();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w') this.game.setThrottle(0.25);
      if (e.key === 'ArrowDown' || e.key === 's') this.game.setBrake(false);
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
        this.updateSelectionStatus();
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
        this.updateSelectionStatus();
        this.showMissionToast('Driver: ' + d.name);
      };
      list.appendChild(div);
    });
    this.renderPaints();
    this.renderKekes();
    this.renderLeaderboard();
    this.renderAchievements();
  }

  renderKekes() {
    let list = document.getElementById('keke-list');
    if (!list) {
      const garage = document.getElementById('garage-screen');
      if (!garage) return;
      const label = document.createElement('div');
      label.style.cssText = 'font-size:0.75rem;color:#94a3b8;margin:12px 0 8px;text-transform:uppercase;letter-spacing:0.08em';
      label.textContent = 'Keke';
      list = document.createElement('div');
      list.id = 'keke-list';
      list.style.cssText = 'width:100%;max-width:360px;display:grid;grid-template-columns:1fr 1fr;gap:8px';
      const paints = document.getElementById('paint-list');
      if (paints && paints.parentNode) {
        paints.parentNode.insertBefore(label, paints);
        paints.parentNode.insertBefore(list, paints);
      }
    }
    const owned = Storage.get('kanoOwnedKeke', ['starter', 'ruffgold']) || ['starter', 'ruffgold'];
    list.innerHTML = '';
    Object.values(CONFIG.KEKES || {}).forEach((k) => {
      const unlocked = owned.includes(k.id) || k.unlocked;
      const selected = this.game.selectedKeke === k.id;
      const div = document.createElement('div');
      div.className = 'route-card';
      div.style.padding = '10px';
      div.style.opacity = unlocked ? '1' : '0.45';
      if (selected) div.style.borderColor = '#f5c542';
      const hex = '#' + k.color.toString(16).padStart(6, '0');
      div.innerHTML = `<div style="height:20px;border-radius:6px;background:${hex};margin-bottom:6px"></div>
        <div class="rname" style="font-size:0.78rem">${selected ? '✓ ' : ''}${k.name}</div>
        <div class="rdesc">${unlocked ? 'Cap ' + k.capacity : '🔒 Lv unlock'}</div>`;
      div.onclick = () => {
        if (!unlocked) {
          this.showMissionToast('Locked — reach higher level');
          return;
        }
        this.game.selectedKeke = k.id;
        Storage.set('kanoKeke', k.id);
        this.game.capacity = k.capacity || 3;
        if (this.game.renderer3d?.applyPaint) {
          // approximate body color from keke
          const map = { starter: 'classic', ruffgold: 'ruffneck', sky: 'sky', heavy: 'forest', night: 'night', royal: 'royal' };
          this.game.renderer3d.applyPaint(map[k.id] || 'classic');
        }
        this.renderKekes();
        this.showMissionToast('Keke: ' + k.name);
      };
      list.appendChild(div);
    });
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
    const dests = (game.destinationsServed || []).slice(-4).join(', ') || '—';
    document.getElementById('final-stats').innerHTML =
      `<b>₦${Math.floor(game.score).toLocaleString()}</b> · ${game.dist.toFixed(1)} km · Lv ${game.level || 1}<br>` +
      `${game.totalPax} pax · ${game.dropCount} drops · ${game.nearMissCount || 0} near misses<br>` +
      `<span style="color:#94a3b8;font-size:0.8rem">Stops: ${dests}</span>`;
    document.getElementById('final-hs').textContent = game.high;
  }

  updateHUD(game) {
    this.scoreEl.textContent = Math.floor(game.score);
    this.distEl.textContent = game.dist.toFixed(1);
    this.paxEl.textContent = game.paxOnBoard;
    this.capEl.textContent = game.capacity;
    if (this.livesEl) this.livesEl.textContent = game.continuesLeft;
    const speedo = document.getElementById('speedo');
    if (speedo) {
      // map internal speed to ~km/h feel
      speedo.textContent = Math.round((game.speed || 0) * 12);
    }
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const c = document.getElementById('minimap');
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    // road
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(18, 4, 36, h - 8);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(30, 6); ctx.lineTo(30, h - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, 6); ctx.lineTo(42, h - 6); ctx.stroke();
    ctx.setLineDash([]);
    const py = game.playerY || 500;
    const mapY = (y) => {
      const t = 1 - Math.max(0, Math.min(1, y / (py + 80)));
      return 8 + t * (h - 16);
    };
    const mapX = (lane) => 24 + Math.round(lane) * 12;
    // traffic
    for (const o of game.obs || []) {
      ctx.fillStyle = o.type === 'police' || o.type === 'karota' ? '#f59e0b' : '#94a3b8';
      ctx.fillRect(mapX(o.lane) - 3, mapY(o.y) - 4, 6, 8);
    }
    // pax zones
    for (const p of game.paxZones || []) {
      if (p.taken) continue;
      ctx.fillStyle = p.aishat ? '#f472b6' : '#4ade80';
      ctx.beginPath();
      ctx.arc(mapX(p.lane), mapY(p.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // player
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(mapX(game.playerLane) - 4, h - 18, 8, 12);
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

  showHelp() {
    const el = document.getElementById('help-overlay');
    if (el) {
      el.style.display = 'flex';
    }
  }

  hideHelp(remember) {
    const el = document.getElementById('help-overlay');
    if (el) el.style.display = 'none';
    if (remember) {
      try { localStorage.setItem('kanoHelpSeen', '1'); } catch (e) {}
    }
  }

  maybeShowHelpOnBoot() {
    try {
      if (!localStorage.getItem('kanoHelpSeen')) this.showHelp();
    } catch (e) {
      this.showHelp();
    }
  }

  updateSelectionStatus() {
    const el = document.getElementById('selection-status');
    const roadBtn = document.getElementById('road-btn');
    if (!el) return;
    const route = CONFIG.ROUTES[this.game.selectedRoute];
    const driver = CONFIG.DRIVERS[this.game.selectedDriver] || CONFIG.DRIVERS.ruffneck;
    const road = (CONFIG.ROAD_MODES && CONFIG.ROAD_MODES[this.game.selectedRoadMode]) || { name: 'Two-way' };
    el.innerHTML = '<b style="color:#f5c542">' + driver.name + '</b> · ' +
      (route ? route.name : 'Route') + '<br>' + road.name + ' · Cap 5 (2 front + 3 back)';
    if (roadBtn) roadBtn.textContent = 'ROAD: ' + (road.name || 'TWO-WAY').toUpperCase();
  }

  showLastRun() {
    const box = document.getElementById('daily-box');
    if (!box) return;
    const last = Storage.get('kanoLastRun', null);
    if (last && last.score) {
      const prev = box.textContent || '';
      // keep daily text; append last run under daily-box via title
      box.title = 'Last run: ₦' + last.score + ' · ' + last.dist + 'km · Lv' + (last.level || 1);
    }
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

  setCamLabel(mode) {
    const btn = document.getElementById('cam-btn');
    if (!btn) return;
    const short = { chase: 'CAM', driver: 'DRV', passenger: 'PAX', road: 'ROAD' };
    btn.textContent = short[mode] || 'CAM';
  }

  setTyreStatus(punctured, wear) {
    const el = document.getElementById('tyre-status');
    const wrap = document.getElementById('tyre-stat');
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

  setCondition(n) {
    const el = document.getElementById('condition');
    if (!el) return;
    const v = Math.max(0, Math.round(n));
    el.textContent = v;
    el.parentElement.style.color = v < 30 ? '#ef4444' : v < 60 ? '#fb923c' : '#94a3b8';
  }

  setFuel(n) {
    const el = document.getElementById('fuel');
    if (el) el.textContent = Math.max(0, Math.round(n));
  }

  setZone(z) {
    const el = document.getElementById('zone-label');
    if (!el) return;
    if (!z || z === 'road') { el.textContent = ''; return; }
    el.textContent = z === 'market' ? '🛒 MARKET' : '🔀 JUNCTION';
  }

  setLevel(n) {
    const el = document.getElementById('level-label');
    if (el) el.textContent = 'Lv ' + n;
  }

  setOnboardDest(list) {
    const el = document.getElementById('onboard-dest');
    if (!el) return;
    if (!list || !list.length) {
      el.style.opacity = '0';
      el.textContent = '';
      return;
    }
    el.style.opacity = '1';
    el.textContent = 'Onboard: ' + list.map(p => (p.dest || '?') + (p.name === 'VIP' ? '★' : '')).join(' · ');
  }

  setPauseUI(on) {
    const btn = document.getElementById('pause-btn');
    if (btn) btn.textContent = on ? '▶' : '❚❚';
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
