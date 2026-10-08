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

    this.missionLabel =
      document.getElementById('mission-label');

    this.routeLabel =
      document.getElementById('route-label');

    this.radioLabel =
      document.getElementById('radio-label');

    this.driverLabel =
      document.getElementById('driver-label');

    this.toast =
      document.getElementById('mission-toast');

    this.eventBox =
      document.getElementById('event-box');

    this.eventTitle =
      document.getElementById('event-title');

    this.eventText =
      document.getElementById('event-text');

    this.eventChoices =
      document.getElementById('event-choices');

    this.startScreen =
      document.getElementById('start-screen');

    this.routeScreen =
      document.getElementById('route-screen');

    this.garageScreen =
      document.getElementById('garage-screen');

    this.overScreen =
      document.getElementById('over-screen');

    this.bind();
    this.renderRoutes();
    this.renderDrivers();

    const highScore =
      document.getElementById('hs');

    if (highScore) {
      highScore.textContent =
        String(game.high ?? 0);
    }

    this.syncSettingsButtons();
    this.updateDailyUI(game);
  }

  bind() {
    const startBtn =
      document.getElementById('start-btn');

    if (startBtn) {
      startBtn.onclick = () => {
        this.game.start();
      };
    }

    const retryBtn =
      document.getElementById('retry-btn');

    if (retryBtn) {
      retryBtn.onclick = () => {
        this.game.start();
      };
    }

    const homeBtn =
      document.getElementById('home-btn');

    if (homeBtn) {
      homeBtn.onclick = () => {
        this.showStart();
      };
    }

    const shareBtn =
      document.getElementById('share-btn');

    if (shareBtn) {
      shareBtn.onclick = () =>
        this.shareRun(this.game);
    }

    const routeBtn =
      document.getElementById('route-btn');

    if (routeBtn) {
      routeBtn.onclick = () => {
        if (this.startScreen) {
          this.startScreen.style.display =
            'none';
        }

        if (this.routeScreen) {
          this.routeScreen.style.display =
            'flex';
        }
      };
    }

    const routeBack =
      document.getElementById('route-back');

    if (routeBack) {
      routeBack.onclick = () => {
        if (this.routeScreen) {
          this.routeScreen.style.display =
            'none';
        }

        if (this.startScreen) {
          this.startScreen.style.display =
            'flex';
        }
      };
    }

    const garageBtn =
      document.getElementById('garage-btn');

    if (garageBtn) {
      garageBtn.onclick = () => {
        if (this.startScreen) {
          this.startScreen.style.display =
            'none';
        }

        if (this.garageScreen) {
          this.garageScreen.style.display =
            'flex';
        }

        this.renderDrivers();
      };
    }

    const garageBack =
      document.getElementById('garage-back');

    if (garageBack) {
      garageBack.onclick = () => {
        if (this.garageScreen) {
          this.garageScreen.style.display =
            'none';
        }

        if (this.startScreen) {
          this.startScreen.style.display =
            'flex';
        }
      };
    }

    const radioBtn =
      document.getElementById('radio-btn');

    if (radioBtn) {
      radioBtn.onclick = () => {
        this.game.cycleRadio();
      };
    }

    const muteBtn =
      document.getElementById('mute-btn');

    if (muteBtn) {
      muteBtn.onclick = () => {
        const next =
          !Storage.getMuted();

        Storage.setMuted(next);

        import('./audio.js')
          .then(({ Audio }) => {
            Audio.muted = next;

            if (next) {
              Audio.stopEngine?.();
            }
          })
          .catch(() => {});

        this.syncSettingsButtons();

        this.showMissionToast(
          next
            ? 'Sound off'
            : 'Sound on'
        );
      };
    }

    const qualityBtn =
      document.getElementById('quality-btn');

    if (qualityBtn) {
      qualityBtn.onclick = () => {
        const low =
          !Storage.getLowQuality();

        Storage.setLowQuality(low);

        if (
          this.game.renderer3d &&
          typeof this.game.renderer3d.applyQuality ===
            'function'
        ) {
          this.game.renderer3d.applyQuality(
            low ? 'low' : 'high'
          );
        }

        this.syncSettingsButtons();

        this.showMissionToast(
          low
            ? 'Performance mode'
            : 'High quality'
        );
      };
    }

    const claimBtn =
      document.getElementById('claim-daily');

    if (claimBtn) {
      claimBtn.onclick = () => {
        this.game.claimDaily();
      };
    }

    const left =
      document.getElementById('left-btn');

    const right =
      document.getElementById('right-btn');

    const horn =
      document.getElementById('horn-btn');

    const hold = (
      element,
      fn
    ) => {
      if (!element) {
        return;
      }

      let timer = null;

      const start = (event) => {
        event.preventDefault();

        fn();

        clearInterval(timer);

        timer =
          window.setInterval(
            fn,
            140
          );
      };

      const end = () => {
        if (timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      };

      element.addEventListener(
        'touchstart',
        start,
        { passive: false }
      );

      element.addEventListener(
        'mousedown',
        start
      );

      element.addEventListener(
        'touchend',
        end
      );

      element.addEventListener(
        'touchcancel',
        end
      );

      element.addEventListener(
        'mouseup',
        end
      );

      element.addEventListener(
        'mouseleave',
        end
      );
    };

    hold(
      left,
      () => this.game.changeLane(-1)
    );

    hold(
      right,
      () => this.game.changeLane(1)
    );

    if (horn) {
      horn.addEventListener(
        'click',
        () => this.game.horn()
      );
    }

    window.addEventListener(
      'keydown',
      (event) => {
        const key =
          String(
            event.key || ''
          ).toLowerCase();

        if (
          key === 'arrowleft' ||
          key === 'a'
        ) {
          this.game.changeLane(-1);
        }

        if (
          key === 'arrowright' ||
          key === 'd'
        ) {
          this.game.changeLane(1);
        }

        if (
          key === ' ' ||
          key === 'h'
        ) {
          this.game.horn();
        }

        if (key === 'r') {
          this.game.cycleRadio();
        }
      }
    );
  }

  renderRoutes() {
    const list =
      document.getElementById('route-list');

    if (!list) {
      return;
    }

    list.innerHTML = '';

    const routes =
      CONFIG.ROUTES &&
      typeof CONFIG.ROUTES === 'object'
        ? Object.values(CONFIG.ROUTES)
        : [];

    routes.forEach((route) => {
      if (!route) {
        return;
      }

      const div =
        document.createElement('div');

      div.className =
        'route-card';

      const name =
        String(
          route.name || 'Kano Route'
        );

      const description =
        String(
          route.description || ''
        );

      const baseFare =
        Number(
          route.baseFare
        ) || 0;

      div.innerHTML =
        `<div class="rname">${name}</div>` +
        `<div class="rdesc">${description} · Fare ~₦${baseFare}</div>`;

      div.onclick = () => {
        const routeId =
          route.id ||
          route.slug ||
          route.name;

        if (!routeId) {
          return;
        }

        this.game.selectedRoute =
          routeId;

        Storage.setRoute(
          routeId
        );

        if (this.routeScreen) {
          this.routeScreen.style.display =
            'none';
        }

        if (this.startScreen) {
          this.startScreen.style.display =
            'flex';
        }

        this.showMissionToast(
          'Route: ' +
          name
        );
      };

      list.appendChild(div);
    });
  }

  renderDrivers() {
    const list =
      document.getElementById('driver-list');

    if (!list) {
      return;
    }

    list.innerHTML = '';

    const drivers =
      CONFIG.DRIVERS &&
      typeof CONFIG.DRIVERS === 'object'
        ? Object.values(CONFIG.DRIVERS)
        : [];

    drivers.forEach((driver) => {
      if (!driver) {
        return;
      }

      const selected =
        this.game.selectedDriver ===
        driver.id;

      const div =
        document.createElement('div');

      div.className =
        'route-card';

      if (selected) {
        div.style.borderColor =
          '#f5c542';
      }

      const prefix =
        selected
          ? '✓ '
          : '';

      div.innerHTML =
        `<div class="rname">${prefix}${driver.name || driver.id || 'Driver'} — ${driver.title || ''}</div>` +
        `<div class="rdesc">${driver.desc || ''}</div>`;

      div.onclick = () => {
        if (!driver.id) {
          return;
        }

        this.game.selectedDriver =
          driver.id;

        Storage.setDriver(
          driver.id
        );

        this.renderDrivers();

        this.showMissionToast(
          'Driver: ' +
          String(
            driver.name ||
            driver.id
          )
        );
      };

      list.appendChild(div);
    });

    this.renderPaints();
    this.renderLeaderboard();
    this.renderAchievements();
  }

  renderPaints() {
    const list =
      document.getElementById('paint-list');

    if (
      !list ||
      !CONFIG.PAINTS
    ) {
      return;
    }

    list.innerHTML = '';

    Object.values(
      CONFIG.PAINTS
    ).forEach((paint) => {
      if (!paint) {
        return;
      }

      const selected =
        this.game.selectedPaint ===
        paint.id;

      const div =
        document.createElement('div');

      div.className =
        'route-card';

      div.style.padding =
        '10px';

      if (selected) {
        div.style.borderColor =
          '#f5c542';
      }

      const color =
        Number(
          paint.color
        );

      const hex =
        Number.isFinite(color)
          ? '#' +
            color
              .toString(16)
              .padStart(
                6,
                '0'
              )
          : '#f5c542';

      div.innerHTML =
        `<div style="height:22px;border-radius:6px;background:${hex};margin-bottom:6px"></div>` +
        `<div class="rname" style="font-size:0.8rem">${selected ? '✓ ' : ''}${paint.name || paint.id || 'Paint'}</div>`;

      div.onclick = () => {
        if (!paint.id) {
          return;
        }

        this.game.selectedPaint =
          paint.id;

        Storage.setPaint(
          paint.id
        );

        if (
          this.game.renderer3d &&
          typeof this.game.renderer3d.applyPaint ===
            'function'
        ) {
          this.game.renderer3d.applyPaint(
            paint.id
          );
        }

        this.renderPaints();

        this.showMissionToast(
          'Paint: ' +
          String(
            paint.name ||
            paint.id
          )
        );
      };

      list.appendChild(div);
    });
  }

  renderLeaderboard() {
    const element =
      document.getElementById(
        'leaderboard'
      );

    if (!element) {
      return;
    }

    const rows =
      Storage.getLeaderboard?.() || [];

    if (!rows.length) {
      element.textContent =
        'No runs yet — finish a drive!';

      return;
    }

    element.innerHTML =
      rows
        .map((row, index) => {
          const score =
            Number(row?.score) || 0;

          const distance =
            row?.dist ??
            0;

          const driver =
            row?.driver ||
            'RuffNeck';

          return (
            `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">` +
            `#${index + 1} ₦${score.toLocaleString()} · ` +
            `${distance}km · ` +
            `${driver}` +
            `</div>`
          );
        })
        .join('');
  }

  renderAchievements() {
    const element =
      document.getElementById(
        'ach-list'
      );

    if (
      !element ||
      !CONFIG.ACHIEVEMENTS
    ) {
      return;
    }

    const unlocked =
      Storage.getAchievements?.() ||
      {};

    element.innerHTML =
      CONFIG.ACHIEVEMENTS
        .map((achievement) => {
          const on =
            !!unlocked[
              achievement.id
            ];

          return (
            `<div style="padding:5px 0;color:${on ? '#f5c542' : '#64748b'}">` +
            `${on ? '🏆' : '🔒'} ` +
            `${achievement.name || achievement.id}` +
            ` — ${achievement.desc || ''}` +
            `</div>`
          );
        })
        .join('');
  }

  showStart() {
    this.game.state =
      STATE.START;

    this.game.isPaused =
      false;

    if (this.overScreen) {
      this.overScreen.style.display =
        'none';
    }

    if (this.routeScreen) {
      this.routeScreen.style.display =
        'none';
    }

    if (this.garageScreen) {
      this.garageScreen.style.display =
        'none';
    }

    if (this.startScreen) {
      this.startScreen.style.display =
        'flex';
    }

    const highScore =
      document.getElementById(
        'hs'
      );

    if (highScore) {
      highScore.textContent =
        String(
          this.game.high ?? 0
        );
    }

    this.hideEvent();
  }

  showPlaying() {
    if (this.startScreen) {
      this.startScreen.style.display =
        'none';
    }

    if (this.routeScreen) {
      this.routeScreen.style.display =
        'none';
    }

    if (this.garageScreen) {
      this.garageScreen.style.display =
        'none';
    }

    if (this.overScreen) {
      this.overScreen.style.display =
        'none';
    }

    this.hideEvent();
  }

  showGameOver(game) {
    if (this.overScreen) {
      this.overScreen.style.display =
        'flex';
    }

    const finalStats =
      document.getElementById(
        'final-stats'
      );

    if (finalStats) {
      finalStats.innerHTML =
        `<b>₦${Math.floor(Number(game?.score) || 0).toLocaleString()}</b> · ` +
        `${Number(game?.dist || 0).toFixed(1)} km · ` +
        `${Number(game?.totalPax) || 0} pax · ` +
        `${Number(game?.dropCount) || 0} drops`;
    }

    const finalHigh =
      document.getElementById(
        'final-hs'
      );

    if (finalHigh) {
      finalHigh.textContent =
        String(
          game?.high ?? 0
        );
    }
  }

  updateHUD(game) {
    if (!game) {
      return;
    }

    if (this.scoreEl) {
      this.scoreEl.textContent =
        String(
          Math.floor(
            Number(game.score) || 0
          )
        );
    }

    if (this.distEl) {
      this.distEl.textContent =
        Number(
          game.dist
        || 0
        ).toFixed(1);
    }

    if (this.paxEl) {
      this.paxEl.textContent =
        String(
          Number(
            game.paxOnBoard
          ) || 0
        );
    }

    if (this.capEl) {
      this.capEl.textContent =
        String(
          Number(
            game.capacity
          ) || 0
        );
    }

    if (this.livesEl) {
      this.livesEl.textContent =
        String(
          Number(
            game.continuesLeft
          ) || 0
        );
    }
  }

  setMission(value) {
    if (!this.missionLabel) {
      return;
    }

    const text =
      typeof value === 'object' &&
      value !== null
        ? (
            value.title ||
            value.name ||
            ''
          )
        : value;

    this.missionLabel.textContent =
      '🎯 ' +
      String(
        text ?? ''
      );
  }

  setMissionProgress(mission) {
    if (!this.missionLabel || !mission) {
      return;
    }

    const title =
      mission.title ||
      mission.name ||
      'Mission';

    const progress =
      Number(
        mission.progress
      ) || 0;

    const target =
      Number(
        mission.target ||
        mission.goal ||
        1
      ) || 1;

    this.missionLabel.textContent =
      `🎯 ${title} · ${Math.min(progress, target)}/${target}`;
  }

  setRouteLabel(value) {
    if (!this.routeLabel) {
      return;
    }

    const text =
      typeof value === 'object' &&
      value !== null
        ? (
            value.name ||
            value.title ||
            ''
          )
        : value;

    this.routeLabel.textContent =
      String(
        text ?? ''
      );
  }

  setRadio(value) {
    if (!this.radioLabel) {
      return;
    }

    const text =
      typeof value === 'object' &&
      value !== null
        ? (
            value.name ||
            value.title ||
            ''
          )
        : value;

    this.radioLabel.textContent =
      '📻 ' +
      String(
        text ?? ''
      );
  }

  setDriverLabel(value) {
    if (!this.driverLabel) {
      return;
    }

    const text =
      typeof value === 'object' &&
      value !== null
        ? (
            value.name ||
            value.title ||
            ''
          )
        : value;

    this.driverLabel.textContent =
      '👤 ' +
      String(
        text ?? ''
      );
  }

  setWeather(value) {
    return value;
  }

  showMissionToast(message) {
    if (!this.toast) {
      return;
    }

    const text =
      typeof message === 'object' &&
      message !== null
        ? (
            message.text ||
            message.message ||
            message.title ||
            ''
          )
        : message;

    this.toast.textContent =
      String(
        text ?? ''
      );

    this.toast.style.opacity =
      '1';

    clearTimeout(
      this._tt
    );

    this._tt =
      window.setTimeout(
        () => {
          if (this.toast) {
            this.toast.style.opacity =
              '0';
          }
        },
        1600
      );
  }

  /*
   * Supports both forms:
   *
   * showEvent(title, text, choices)
   *
   * and the form actually used by Game:
   *
   * showEvent({
   *   title,
   *   text,
   *   actions: [...]
   * })
   *
   * Game action callbacks are named onClick,
   * while older UI code expected action.
   */
  showEvent(
    title,
    text,
    choices
  ) {
    let payload;

    if (
      title &&
      typeof title === 'object' &&
      !Array.isArray(title)
    ) {
      payload =
        title;
    } else {
      payload = {
        title,
        text,
        actions: choices
      };
    }

    const eventTitle =
      typeof payload.title === 'object' &&
      payload.title !== null
        ? (
            payload.title.title ||
            payload.title.name ||
            ''
          )
        : payload.title;

    const eventText =
      typeof payload.text === 'object' &&
      payload.text !== null
        ? (
            payload.text.text ||
            payload.text.message ||
            ''
          )
        : payload.text;

    const actions =
      Array.isArray(
        payload.actions
      )
        ? payload.actions
        : Array.isArray(
            payload.choices
          )
          ? payload.choices
          : [];

    if (this.eventTitle) {
      this.eventTitle.textContent =
        String(
          eventTitle ?? ''
        );
    }

    if (this.eventText) {
      this.eventText.textContent =
        String(
          eventText ?? ''
        );
    }

    if (this.eventChoices) {
      this.eventChoices.innerHTML =
        '';
    }

    if (this.eventBox) {
      this.eventBox.style.display =
        'block';
    }

    /*
     * IMPORTANT:
     * Do not force STATE.EVENT here.
     *
     * Game.start() calls showEvent() while already
     * in STATE.PLAY and its Start Driving callback
     * only hides the event.
     *
     * Negotiation / KAROTA / game-over already set
     * STATE.EVENT themselves before calling this method.
     */

    actions.forEach(
      (choice) => {
        if (
          !choice ||
          !this.eventChoices
        ) {
          return;
        }

        const button =
          document.createElement(
            'button'
          );

        button.type =
          'button';

        button.textContent =
          String(
            choice.label ||
            'Continue'
          );

        if (
          choice.primary
        ) {
          button.dataset.primary =
            'true';
        }

        button.addEventListener(
          'click',
          (event) => {
            event.preventDefault();
            event.stopPropagation();

            this.eventBox.style.display =
              'none';

            const callback =
              typeof choice.onClick ===
              'function'
                ? choice.onClick
                : typeof choice.action ===
                    'function'
                  ? choice.action
                  : null;

            if (callback) {
              try {
                callback();
              } catch (error) {
                console.error(
                  'Kano Run event action failed:',
                  error
                );
              }
            }
          }
        );

        this.eventChoices.appendChild(
          button
        );
      }
    );
  }

  syncSettingsButtons() {
    const muteBtn =
      document.getElementById(
        'mute-btn'
      );

    const qualityBtn =
      document.getElementById(
        'quality-btn'
      );

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

  updateDailyUI() {
    const box =
      document.getElementById(
        'daily-box'
      );

    const claim =
      document.getElementById(
        'claim-daily'
      );

    if (!box) {
      return;
    }

    const streak =
      Number(
        Storage.getStreak?.() ?? 0
      ) || 0;

    const claimed =
      Boolean(
        Storage.isDailyClaimed?.()
      );

    if (claimed) {
      box.textContent =
        `📅 Daily claimed · Streak ${streak} day${streak === 1 ? '' : 's'}`;

      if (claim) {
        claim.style.display =
          'none';
      }
    } else {
      box.textContent =
        `📅 Daily reward ready · Current streak ${streak}`;

      if (claim) {
        claim.style.display =
          'inline-block';
      }
    }
  }

  hideEvent() {
    if (this.eventBox) {
      this.eventBox.style.display =
        'none';
    }

    if (this.eventChoices) {
      this.eventChoices.innerHTML =
        '';
    }
  }

  async shareRun(game) {
    const route =
      CONFIG.ROUTES?.[
        game?.selectedRoute
      ];

    const driver =
      CONFIG.DRIVERS?.[
        game?.selectedDriver
      ] ||
      CONFIG.DRIVERS?.ruffneck;

    const routeName =
      route?.name ||
      'Kano';

    const driverName =
      driver?.name ||
      'RuffNeck';

    const score =
      Math.floor(
        Number(
          game?.score
        ) || 0
      );

    const distance =
      Number(
        game?.dist
      ) || 0;

    const passengers =
      Number(
        game?.totalPax
      ) || 0;

    const shareText =
      `I just drove ₦${score.toLocaleString()} ` +
      `on ${routeName} as ${driverName} ` +
      `in Kano Run 3D! ` +
      `${distance.toFixed(1)} km · ` +
      `${passengers} passengers.`;

    try {
      if (
        typeof navigator.share ===
        'function'
      ) {
        await navigator.share({
          title:
            'Kano Run',
          text:
            shareText,
          url:
            'https://kano-run.vercel.app'
        });

        return;
      }

      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText ===
          'function'
      ) {
        await navigator.clipboard.writeText(
          shareText +
          ' Play: https://kano-run.vercel.app'
        );

        this.showMissionToast(
          'Copied result to clipboard'
        );

        return;
      }

      window.prompt(
        'Copy your run:',
        shareText +
          ' Play: https://kano-run.vercel.app'
      );
    } catch {
      try {
        if (
          navigator.clipboard &&
          typeof navigator.clipboard.writeText ===
            'function'
        ) {
          await navigator.clipboard.writeText(
            shareText +
            ' Play: https://kano-run.vercel.app'
          );

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