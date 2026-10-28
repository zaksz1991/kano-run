// ============================================================
// KANO LIFE — DAY HUD (clock chip + hunger / fatigue meters)
// File: js/KanoDayHud.js
// Pure DOM, textContent only. Attaches to #game-container so it works in 2D and 3D.
// Position is measured against the real HUD furniture to avoid covering passengers.
// ============================================================

const STYLE_ID = 'kano-day-hud-styles';

const CSS = `
.kano-day-hud{position:absolute;right:8px;left:auto;top:calc(env(safe-area-inset-top,0px) + 200px);z-index:6;
  display:flex;flex-direction:column;gap:4px;width:min(156px,calc(100% - 16px));box-sizing:border-box;
  pointer-events:none;font:700 11px/1.2 system-ui,sans-serif;color:#e8f1fb}
.kano-day-hud .kdh-clock{background:#101a26ed;border:1px solid #ffffff28;border-radius:8px;padding:5px 8px;
  backdrop-filter:blur(4px);white-space:nowrap;box-sizing:border-box}
.kano-day-hud .kdh-clock b{font-size:13px;letter-spacing:.04em}
.kano-day-hud .kdh-row{display:flex;align-items:center;gap:6px;background:#101a26ed;border:1px solid #ffffff28;
  border-radius:8px;padding:3px 8px;box-sizing:border-box;min-width:0}
.kano-day-hud .kdh-row span{width:46px;flex:0 0 auto;opacity:.9}
.kano-day-hud .kdh-bar{flex:1;min-width:0;height:5px;border-radius:3px;background:#ffffff22;overflow:hidden}
.kano-day-hud .kdh-bar i{display:block;height:100%;width:0;background:#9de6d7;transition:width .4s,background .4s}
.kano-day-hud .kdh-bar i.warn{background:#f5c542}
.kano-day-hud .kdh-bar i.crit{background:#ff6b6b}
@media (max-width:760px){.kano-day-hud{top:calc(env(safe-area-inset-top,0px) + 280px);font-size:10px}
  .kano-day-hud .kdh-clock{padding:4px 7px}
  .kano-day-hud .kdh-clock b{font-size:12px}
  .kano-day-hud .kdh-row{padding:3px 6px;gap:5px}
  .kano-day-hud .kdh-row span{width:40px}}
@media (prefers-reduced-motion:reduce){.kano-day-hud .kdh-bar i{transition:none}}
`;

export class KanoDayHud {
  constructor({ container = document.getElementById('game-container'), lang = 'en' } = {}) {
    this.container = container || document.body;
    this.lang = lang;
    this.last = '';
    this.#injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'kano-day-hud';
    this.root.setAttribute('aria-hidden', 'true'); // decorative; warnings go through the game's toast

    this.clock = document.createElement('div');
    this.clock.className = 'kdh-clock';
    this.time = document.createElement('b');
    this.label = document.createElement('div');
    this.clock.append(this.time, this.label);

    this.hunger = this.#row('Hunger');
    this.fatigue = this.#row('Fatigue');
    this.root.append(this.clock, this.hunger.row, this.fatigue.row);
    this.root.style.display = 'none'; // shown only while driving
    this.container.appendChild(this.root);

    // Re-anchor on viewport resize and device rotation. This also handles the
    // browser's changing mobile viewport when the address bar collapses.
    this.onResize = () => {
      if (this.root.style.display !== 'none') this.#place();
    };
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('orientationchange', this.onResize, { passive: true });
  }

  #injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  #row(name) {
    const row = document.createElement('div');
    row.className = 'kdh-row';
    const label = document.createElement('span');
    label.textContent = name;
    const bar = document.createElement('div');
    bar.className = 'kdh-bar';
    const fill = document.createElement('i');
    bar.appendChild(fill);
    row.append(label, bar);
    return { row, fill };
  }

  /**
   * Avoid the passenger list by anchoring the meters to the right edge. Then
   * measure every visible element that occupies that right-hand lane and place
   * the meters below it (not at a guessed, device-specific pixel offset).
   */
  #place() {
    const host = this.container.getBoundingClientRect();
    if (!host.width || !host.height) return;

    const box = this.root.getBoundingClientRect();
    const panelWidth = Math.max(136, Math.min(156, box.width || 156));
    const right = host.right - 8;
    const left = right - panelWidth;
    let occupiedBottom = host.top;

    for (const selector of ['#menu-btn', '.minimap', '#hud .hud-top', '#hud .hud-bottom', '#hud .mission-pill']) {
      const element = this.container.querySelector(selector);
      if (!element || element.hidden) continue;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const overlapsRightLane = rect.right > left && rect.left < right;
      if (overlapsRightLane) occupiedBottom = Math.max(occupiedBottom, rect.bottom);
    }

    const panelHeight = box.height || 96;
    const controls = this.container.querySelector('#drive-controls, .drive-controls');
    let maxTop = host.bottom - panelHeight - 8;
    if (controls && !controls.hidden && window.getComputedStyle(controls).display !== 'none') {
      const controlsRect = controls.getBoundingClientRect();
      if (controlsRect.height > 0) maxTop = Math.min(maxTop, controlsRect.top - panelHeight - 8);
    }

    const desiredTop = occupiedBottom - host.top + 8;
    const top = Math.min(Math.max(8, desiredTop), Math.max(8, maxTop - host.top));
    this.root.style.left = 'auto';
    this.root.style.right = '8px';
    this.root.style.top = `${Math.round(top)}px`;
  }

  setLanguage(lang) { this.lang = lang; this.last = ''; }

  show(visible) {
    // Called every frame while driving. Measuring the layout (getBoundingClientRect /
    // getComputedStyle for several elements) each frame forces a reflow and is a
    // big cost on phones, so only re-place when it appears or about once a second.
    const display = visible ? '' : 'none';
    if (this.root.style.display !== display) this.root.style.display = display;
    if (!visible) { this.placedAt = 0; return; }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this.placedAt || now - this.placedAt > 1000) {
      this.placedAt = now;
      this.#place();
    }
  }

  /** Cheap: only touches the DOM when the displayed values change. */
  render(snapshot) {
    const key = `${snapshot.clock}|${snapshot.period}|${snapshot.hunger}|${snapshot.fatigue}|${snapshot.day}|${this.lang}`;
    if (key === this.last) return;
    this.last = key;
    this.time.textContent = `DAY ${snapshot.day} · ${snapshot.clock}`;
    this.label.textContent = snapshot.periodLabel;
    for (const [part, value] of [[this.hunger, snapshot.hunger], [this.fatigue, snapshot.fatigue]]) {
      part.fill.style.width = `${value}%`;
      part.fill.className = value >= 90 ? 'crit' : value >= 70 ? 'warn' : '';
    }
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.root.remove();
  }
}
