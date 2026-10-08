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
    if (highScore) highScore.textContent = game.high;

    this.syncSettingsButtons();
    this.updateDailyUI(game);
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

        import('./audio.js').then(({ Audio }) => {
          Audio.muted = next;

          if (next && typeof Audio.stopEngine === 'function') {
            Audio.stopEngine();
          }
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

    /*
     * MOBILE / ON-SCREEN DRIVING CONTROLS
     *
     * Important:
     * Do NOT call game.changeLane().
     *
     * Game already exposes moveLeft() and moveRight().
     * Game also owns the keyboard ArrowLeft/ArrowRight handling.
     *
     * Therefore:
     * - buttons call moveLeft/moveRight directly
     * - keyboard handling remains exclusively in game.js
     * - no duplicate keyboard listener is installed here
     */

    const left = document.getElementById('left-btn');
    const right = document.getElementById('right-btn');
    const horn = document.getElementById('horn-btn');

    const stopHold = (event) => {
      if (event) event.preventDefault();
    };

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

        /*
         * One movement immediately.
         */
        movement();

        /*
         * Holding the button continues steering at a controlled rate.
         */
        interval = window.setInterval(() => {
          if (!active) return;
          movement();
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

      /*
       * Prevent the browser from interpreting the button as a
       * text-selection / long-press interaction.
       */
      element.addEventListener('touchstart', stopHold, {
        passive: false
      });

      element.addEventListener('dragstart', stopHold, {
        passive: false
      });
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

    /*
     * DO NOT add ArrowLeft / ArrowRight keyboard listeners here.
     *
     * game.js already handles:
     * ArrowLeft / A
     * ArrowRight / D
     * ArrowUp / W / Space
     * ArrowDown / S
     * P
     * H
     * R
     *
     * Having another keyboard listener here was causing duplicated
     * movement and made debugging the controls harder.
     */
  }

  renderRoutes() {
    const list = document.getElementById('route-list');
    if (!list) return;

    list.innerHTML = '';

    Object.values(CONFIG.ROUTES).forEach((r) => {
      const div = document.createElement('div');

      div.className = 'route-card';

      div.innerHTML = `
        <div class="rname">${r.name}</div>
        <div class="rdesc">
          ${r.description} · Fare ~₦${r.baseFare}
        </div>
      `;

      div.onclick = () => {
        this.game.selectedRoute = r.id;
        Storage.setRoute(r.id);

        if (this.routeScreen) {
          this.routeScreen.style.display = 'none';
        }

        if (this.startScreen) {
          this.startScreen.style.display = 'flex';
        }

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

      if (selected) {
        div.style.borderColor = '#f5c542';
      }

      div.innerHTML = `
        <div class="rname">
          ${selected ? '✓ ' : ''}${d.name} — ${d.title}
        </div>
        <div class="rdesc">${d.desc}</div>
      `;

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

      if (selected) {
        div.style.borderColor = '#f5c542';
      }

      const hex =
        '#' + p.color.toString(16).padStart(6, '0');

      div.innerHTML = `
        <div
          style="
            height:22px;
            border-radius:6px;
            background:${hex};
            margin-bottom:6px
          "
        ></div>

        <div
          class="rname"
          style="font-size:0.8rem"
        >
          ${selected ? '✓ ' : ''}${p.name}
        </div>
      `;

      div.onclick = () => {
        this.game.selectedPaint = p.id;
        Storage.setPaint(p.id);

        if (this.game.renderer3d?.applyPaint) {
          this.game.renderer3d.applyPaint(p.id);
        }

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

    el.innerHTML = rows
      .map(
        (r, i) =>
          `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
            #${i + 1} ₦${r.score.toLocaleString()} · ${r.dist}km · ${r.driver}
          </div>`
      )
      .join('');
  }

  renderAchievements() {
    const el = document.getElementById('ach-list');

    if (!el || !CONFIG.ACHIEVEMENTS) return;

    const unlocked = Storage.getAchievements();

    el.innerHTML = CONFIG.ACHIEVEMENTS
      .map((a) => {
        const on = !!unlocked[a.id];

        return `
          <div
            style="
              padding:5px 0;
              color:${on ? '#f5c542' : '#64748b'}
            "
          >
            ${on ? '🏆' : '🔒'} ${a.name} — ${a.desc}
          </div>
        `;
      })
      .join('');
  }

  showStart() {
    this.game.state = STATE.START;

    if (this.overScreen) {
      this.overScreen.style.display = 'none';
    }

    if (this.routeScreen) {
      this.routeScreen.style.display = 'none';
    }

    if (this.garageScreen) {
      this.garageScreen.style.display = 'none';
    }

    if (this.startScreen) {
      this.startScreen.style.display = 'flex';
    }

    const highScore = document.getElementById('hs');

    if (highScore) {
      highScore.textContent = this.game.high;
    }

    this.hideEvent();
  }

  showPlaying() {
    if (this.startScreen) {
      this.startScreen.style.display = 'none';
    }

    if (this.routeScreen) {
      this.routeScreen.style.display = 'none';
    }

    if (this.garageScreen) {
      this.garageScreen.style.display = 'none';
    }

    if (this.overScreen) {
      this.overScreen.style.display = 'none';
    }

    this.hideEvent();
  }

  showGameOver(game) {
    if (this.overScreen) {
      this.overScreen.style.display = 'flex';
    }

    const finalStats = document.getElementById('final-stats');

    if (finalStats) {
      finalStats.innerHTML =
        `<b>₦${Math.floor(game.score).toLocaleString()}</b>` +
        ` · ${game.dist.toFixed(1)} km` +
        ` · ${game.totalPax} pax` +
        ` · ${game.dropCount} drops`;
    }

    const finalHighScore = document.getElementById('final-hs');

    if (finalHighScore) {
      finalHighScore.textContent = game.high;
    }
  }

  updateHUD(game) {
    if (this.scoreEl) {
      this.scoreEl.textContent =
        Math.floor(game.score);
    }

    if (this.distEl) {
      this.distEl.textContent =
        game.dist.toFixed(1);
    }

    if (this.paxEl) {
      this.paxEl.textContent =
        game.paxOnBoard;
    }

    if (this.capEl) {
      this.capEl.textContent =
        game.capacity;
    }

    if (this.livesEl) {
      this.livesEl.textContent =
        game.continuesLeft;
    }
  }

  setMission(t) {
    if (this.missionLabel) {
      this.missionLabel.textContent =
        '🎯 ' + t;
    }
  }

  setRouteLabel(t) {
    if (this.routeLabel) {
      this.routeLabel.textContent =
        t || '';
    }
  }

  setRadio(t) {
    if (this.radioLabel) {
      this.radioLabel.textContent =
        '📻 ' + (t || '');
    }
  }

  setDriverLabel(t) {
    if (this.driverLabel) {
      this.driverLabel.textContent =
        '👤 ' + (t || '');
    }
  }

  showMissionToast(msg) {
    if (!this.toast) return;

    this.toast.textContent = msg;
    this.toast.style.opacity = '1';

    clearTimeout(this._tt);

    this._tt = setTimeout(() => {
      this.toast.style.opacity = '0';
    }, 1600);
  }

  showEvent(title, text, choices) {
    if (!this.eventTitle ||
        !this.eventText ||
        !this.eventChoices ||
        !this.eventBox) {
      return;
    }

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
          try {
            c.action();
          } catch (err) {
            console.error(err);
          }
        }
      });

      this.eventChoices.appendChild(btn);
    });
  }

  syncSettingsButtons() {
    const muteBtn = document.getElementById('mute-btn');
    const qualityBtn = document.getElementById('quality-btn');

    if (muteBtn) {
      muteBtn.textContent =
        Storage.getMuted()
          ? '🔇 Muted'
          : '🔊 Sound';
    }

    if (qualityBtn) {
      qualityBtn.textContent =
        Storage.getLowQuality()
          ? '⚡ Performance'
          : '✨ Quality';
    }
  }

  updateDailyUI(game) {
    const box = document.getElementById('daily-box');
    const claim = document.getElementById('claim-daily');

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

  hideEvent() {
    if (this.eventBox) {
      this.eventBox.style.display = 'none';
    }
  }

  async shareRun(game) {
    const route =
      CONFIG.ROUTES[game.selectedRoute];

    const driver =
      CONFIG.DRIVERS[game.selectedDriver] ||
      CONFIG.DRIVERS.ruffneck;

    const text =
      `I just drove ₦${Math.floor(game.score).toLocaleString()} ` +
      `on ${route?.name || 'Kano'} as ${driver.name} ` +
      `in Kano Run 3D! ${game.dist.toFixed(1)} km · ` +
      `${game.totalPax} passengers. ` +
      `Play: https://kano-run.vercel.app`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Kano Run',
          text,
          url: 'https://kano-run.vercel.app'
        });

        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        this.showMissionToast(
          'Copied result to clipboard'
        );

        return;
      }

      prompt('Copy your run:', text);
    } catch (e) {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          this.showMissionToast(
            'Copied to clipboard'
          );
        } else {
          this.showMissionToast(
            'Share cancelled'
          );
        }
      } catch {
        this.showMissionToast(
          'Share cancelled'
        );
      }
    }
  }
}