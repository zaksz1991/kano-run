/**
 * Kano Run 3D — Professional controls module
 * Button · Swipe · Keyboard · Smooth lane lerp
 * LEFT = screen left · RIGHT = screen right
 * Game Developer: Hassan Zakariya
 */

export class Controls {
  /**
   * @param {object} game
   * @param {{
   *   lanes?: number,
   *   laneLerp?: number,
   *   swipeMinPx?: number
   * }} [opts]
   */
  constructor(game, opts = {}) {
    this.game = game;
    this.laneCount = opts.lanes || 3;
    this.laneLerp = opts.laneLerp ?? 0.18;
    this.swipeMinPx = opts.swipeMinPx ?? 36;

    /** Target lane index 0..laneCount-1 (0 = left, 2 = right on screen) */
    this.targetLane = 1;
    /** Smooth visual lane position (float) */
    this.smoothLane = 1;

    this._touchStartX = 0;
    this._touchStartY = 0;
    this._swiping = false;
    this._bound = false;
  }

  /** Call once after DOM is ready */
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

    // ——— Lane buttons: LEFT = decrease lane (screen left), RIGHT = increase ———
    this._hold(left, () => this.steerLeft());
    this._hold(right, () => this.steerRight());

    // ——— Gas / Brake ———
    this._press(
      gas,
      () => this.game.setThrottle?.(1),
      () => this.game.setThrottle?.(0.5)
    );
    this._press(
      brake,
      () => this.game.setBrake?.(true),
      () => this.game.setBrake?.(false)
    );

    if (horn) horn.addEventListener('click', (e) => {
      e.preventDefault();
      this.game.horn?.();
    });
    if (pauseBtn) pauseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.game.togglePause?.();
    });
    if (camBtn) camBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.game.toggleCabin?.();
    });
    if (radioBtn) radioBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.game.cycleRadio?.();
    });

    // ——— Keyboard ———
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.steerLeft();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.steerRight();
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.game.setThrottle?.(1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.game.setBrake?.(true);
          break;
        case ' ':
        case 'h':
        case 'H':
          e.preventDefault();
          this.game.horn?.();
          break;
        case 'p':
        case 'P':
        case 'Escape':
          e.preventDefault();
          this.game.togglePause?.();
          break;
        case 'c':
        case 'C':
          this.game.toggleCabin?.();
          break;
        case 'r':
        case 'R':
          this.game.cycleRadio?.();
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        this.game.setThrottle?.(0.5);
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        this.game.setBrake?.(false);
      }
    });

    // ——— Swipe / touch on play area ———
    const surface = container || canvas;
    if (surface) {
      surface.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
      surface.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
      surface.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });
      surface.addEventListener('touchcancel', () => { this._swiping = false; }, { passive: true });
    }

    // Sync from game if already set
    if (typeof this.game.playerLane === 'number') {
      this.targetLane = this.game.playerLane;
      this.smoothLane = this.game.playerLane;
    }
  }

  /**
   * FIXED for reported invert: LEFT button was sending vehicle right.
   * Camera faces +Z; +X is screen-right. Lane positions use LANE_X in renderer.
   * Empirically on live build, decreasing index moved the keke right — so we invert here.
   */
  steerLeft() {
    this.setTargetLane(this.targetLane + 1);
  }

  steerRight() {
    this.setTargetLane(this.targetLane - 1);
  }

  setTargetLane(n) {
    const max = this.laneCount - 1;
    this.targetLane = Math.max(0, Math.min(max, Math.round(n)));
    if (this.game) {
      this.game.playerLane = this.targetLane;
      this.game.bounce = Math.max(this.game.bounce || 0, 8);
    }
  }

  /**
   * Call every frame from game.update
   * Writes game.playerLaneX (float -1..1 style) and keeps playerLane in sync
   */
  update() {
    this.smoothLane += (this.targetLane - this.smoothLane) * this.laneLerp;
    if (Math.abs(this.smoothLane - this.targetLane) < 0.02) {
      this.smoothLane = this.targetLane;
    }
    if (this.game) {
      this.game.playerLane = this.targetLane;
      this.game.smoothLane = this.smoothLane;
      // -1 left … +1 right for renderer
      this.game.playerLaneX = (this.smoothLane - 1) / 1; // maps 0→-1, 1→0, 2→+1
    }
  }

  reset(lane = 1) {
    this.targetLane = lane;
    this.smoothLane = lane;
    if (this.game) {
      this.game.playerLane = lane;
      this.game.smoothLane = lane;
      this.game.playerLaneX = 0;
    }
  }

  // ——— private helpers ———

  _hold(el, fn) {
    if (!el) return;
    let timer = null;
    const start = (e) => {
      e.preventDefault();
      fn();
      clearInterval(timer);
      timer = setInterval(fn, 160);
    };
    const end = () => clearInterval(timer);
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('mousedown', start);
    el.addEventListener('touchend', end);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', end);
    el.addEventListener('touchcancel', end);
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
    if (!e.touches || !e.touches[0]) return;
    // Ignore if touching a control button
    const t = e.target;
    if (t && (t.closest?.('.ctrl-btn') || t.closest?.('#controls') || t.closest?.('.screen'))) {
      this._swiping = false;
      return;
    }
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
    this._swiping = true;
  }

  _onTouchMove(e) {
    if (!this._swiping || !e.touches || !e.touches[0]) return;
    const dx = e.touches[0].clientX - this._touchStartX;
    const dy = e.touches[0].clientY - this._touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > this.swipeMinPx) {
      e.preventDefault();
      if (dx < 0) this.steerLeft();
      else this.steerRight();
      this._touchStartX = e.touches[0].clientX;
      this._touchStartY = e.touches[0].clientY;
    }
  }

  _onTouchEnd() {
    this._swiping = false;
  }
}
