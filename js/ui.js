import { CONFIG, STATE } from './config.js';

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
    this.toast = document.getElementById('mission-toast');
    this.eventBox = document.getElementById('event-box');
    this.eventTitle = document.getElementById('event-title');
    this.eventText = document.getElementById('event-text');
    this.eventChoices = document.getElementById('event-choices');
    this.startScreen = document.getElementById('start-screen');
    this.routeScreen = document.getElementById('route-screen');
    this.overScreen = document.getElementById('over-screen');
    this.bind();
    this.renderRoutes();
    document.getElementById('hs').textContent = game.high;
  }

  bind() {
    document.getElementById('start-btn').onclick = () => this.game.start();
    document.getElementById('retry-btn').onclick = () => this.game.start();
    document.getElementById('home-btn').onclick = () => this.showStart();
    document.getElementById('route-btn').onclick = () => {
      this.startScreen.style.display = 'none';
      this.routeScreen.style.display = 'flex';
    };
    document.getElementById('route-back').onclick = () => {
      this.routeScreen.style.display = 'none';
      this.startScreen.style.display = 'flex';
    };
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
    });
  }

  renderRoutes() {
    const list = document.getElementById('route-list');
    list.innerHTML = '';
    Object.values(CONFIG.ROUTES).forEach((r) => {
      const div = document.createElement('div');
      div.className = 'route-card';
      div.innerHTML = `<div class="rname">${r.name}</div><div class="rdesc">${r.description}</div>`;
      div.onclick = () => {
        this.game.selectedRoute = r.id;
        import('./storage.js').then(({ Storage }) => Storage.setRoute(r.id));
        this.routeScreen.style.display = 'none';
        this.startScreen.style.display = 'flex';
        this.showMissionToast(`Route: ${r.name}`);
      };
      list.appendChild(div);
    });
  }

  showStart() {
    this.game.state = STATE.START;
    this.overScreen.style.display = 'none';
    this.routeScreen.style.display = 'none';
    this.startScreen.style.display = 'flex';
    document.getElementById('hs').textContent = this.game.high;
    this.hideEvent();
  }

  showPlaying() {
    this.startScreen.style.display = 'none';
    this.routeScreen.style.display = 'none';
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

  hideEvent() {
    if (this.eventBox) this.eventBox.style.display = 'none';
  }
}
