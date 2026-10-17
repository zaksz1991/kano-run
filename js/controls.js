/**
 * Controls — LEFT = screen left, RIGHT = screen right
 * Game Developer: Hassan Zakariya
 */
export class Controls {
  constructor(game, opts = {}) {
    this.game = game;
    this.laneCount = opts.lanes || 3;
    // Higher = snappier lane change (exp lambda, not raw lerp)
    this.laneLambda = opts.laneLambda ?? 7;
    this.laneLerp = opts.laneLerp ?? 0.18; // fallback
    this.swipeMinPx = opts.swipeMinPx ?? 28;
    this.targetLane = 1;
    this.smoothLane = 1;
    this.laneVel = 0; // spring velocity for smooth steering
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._swiping = false;
    this._bound = false;
    this._lastT = 0;
  }

  bind() {
    if (this._bound) return;
    this._bound = true;
    const left = document.getElementById('left-btn');
    const right = document.getElementById('right-btn');
    const gas = document.getElementById('gas-btn');
    const brake = document.getElementById('brake-btn');
    const horn = document.getElementById('horn-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const camBtn = document.getElementById('cam-btn');
    const radioBtn = document.getElementById('radio-btn');
    const canvas = this.game.canvas || document.getElementById('c');
    const container = document.getElementById('game-container') || canvas?.parentElement;

    // LANE_X = [-5.5, 0, 5.5] → index 0 left, 2 right
    this._hold(left, () => this.steerLeft());
    this._hold(right, () => this.steerRight());
    this._press(gas, () => this.game.setThrottle?.(1), () => this.game.setThrottle?.(0.6));
    this._press(brake, () => this.game.setBrake?.(true), () => {
      this.game.setBrake?.(false);
      if ((this.game.throttle || 0) < 0.2) this.game.setThrottle?.(0.6);
    });
    window.addEventListener('blur', () => {
      this.game.setBrake?.(false);
      if ((this.game.throttle || 0) < 0.2) this.game.setThrottle?.(0.6);
    });
    if (horn) horn.addEventListener('click', (e) => { e.preventDefault(); this.game.horn?.(); });
    if (pauseBtn) {
      pauseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.togglePause?.();
      });
    }
    if (camBtn) camBtn.addEventListener('click', (e) => { e.preventDefault(); this.game.toggleCabin?.(); });
    if (radioBtn) {
      let radioHold = null;
      let radioLong = false;
      radioBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        radioLong = false;
        radioHold = setTimeout(() => {
          radioLong = true;
          if (this.game.radioOn !== false) this.game.toggleRadio?.();
        }, 450);
      });
      radioBtn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        clearTimeout(radioHold);
        if (!radioLong) this.game.cycleRadio?.();
      });
      radioBtn.addEventListener('pointercancel', () => clearTimeout(radioHold));
    }

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); this.steerLeft(); }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); this.steerRight(); }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); this.game.setThrottle?.(1); }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); this.game.setBrake?.(true); }
      if (e.key === ' ' || e.key === 'h' || e.key === 'H') { e.preventDefault(); this.game.horn?.(); }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { e.preventDefault(); this.game.togglePause?.(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.game.setThrottle?.(0.5);
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.game.setBrake?.(false);
    });

    const surface = container || canvas;
    if (surface) {
      surface.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
      surface.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
      surface.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });
    }
    if (typeof this.game.playerLane === 'number') {
      this.targetLane = this.game.playerLane;
      this.smoothLane = this.game.playerLane;
    }
  }

  // Fixed to match on-screen LEFT/RIGHT (user: was inverted)
  // Lane 0 = world -X = left side of road when camera is behind player
  steerLeft() {
    this.setTargetLane(this.targetLane + 1);
  }
  steerRight() {
    this.setTargetLane(this.targetLane - 1);
  }

  setTargetLane(n) {
    this.targetLane = Math.max(0, Math.min(this.laneCount - 1, Math.round(n)));
    if (this.game) {
      this.game.playerLane = this.targetLane;
      // Soft bounce on lane change only
      this.game.bounce = Math.max(this.game.bounce || 0, 5);
    }
  }

  reset(lane = 1) {
    this.targetLane = lane;
    this.smoothLane = lane;
    this.laneVel = 0;
    if (this.game) this.game.playerLane = lane;
  }

  /** Smooth steering — spring + exp, frame-rate independent */
  update() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const rawDt = this._lastT ? (now - this._lastT) / 1000 : 1 / 60;
    this._lastT = now;
    const dt = Math.min(0.05, Math.max(0.008, rawDt));

    const target = this.targetLane;
    // Spring-damper toward target lane (smooth, no snap)
    const stiff = 18;
    const damp = 11;
    this.laneVel += (stiff * (target - this.smoothLane) - damp * this.laneVel) * dt;
    this.smoothLane += this.laneVel * dt;

    // Snap settle when very close
    if (Math.abs(this.smoothLane - target) < 0.002 && Math.abs(this.laneVel) < 0.01) {
      this.smoothLane = target;
      this.laneVel = 0;
    }

    if (this.game) {
      this.game.smoothLane = this.smoothLane;
      this.game.playerLane = this.targetLane;
      this.game.steerBlend = this.smoothLane - 1; // -1..+1 for lean
    }
  }

  _hold(el, fn) {
    if (!el) return;
    const fire = (e) => { e.preventDefault(); fn(); };
    el.addEventListener('touchstart', fire, { passive: false });
    el.addEventListener('mousedown', fire);
  }

  _press(el, down, up) {
    if (!el) return;
    const d = (e) => { e.preventDefault(); down(); };
    const u = (e) => { e.preventDefault(); up(); };
    el.addEventListener('touchstart', d, { passive: false });
    el.addEventListener('mousedown', d);
    el.addEventListener('touchend', u);
    el.addEventListener('mouseup', u);
    el.addEventListener('mouseleave', u);
    el.addEventListener('touchcancel', u);
  }

  _onTouchStart(e) {
    const t = e.changedTouches?.[0] || e.touches?.[0];
    if (!t) return;
    this._touchStartX = t.clientX;
    this._touchStartY = t.clientY;
    this._swiping = true;
  }

  _onTouchMove(e) {
    if (!this._swiping) return;
    const t = e.changedTouches?.[0] || e.touches?.[0];
    if (!t) return;
    if (Math.abs(t.clientX - this._touchStartX) > this.swipeMinPx) e.preventDefault();
  }

  _onTouchEnd(e) {
    if (!this._swiping) return;
    this._swiping = false;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - this._touchStartX;
    const dy = t.clientY - this._touchStartY;
    if (Math.abs(dx) < this.swipeMinPx || Math.abs(dx) < Math.abs(dy)) return;
    // Swipe left on screen → steer left
    if (dx < 0) this.steerLeft();
    else this.steerRight();
  }
}
