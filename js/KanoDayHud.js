// ============================================================
// KANO LIFE — DAY HUD (clock chip + hunger / fatigue meters)
// File: js/KanoDayHud.js
// Pure DOM, textContent only. Attaches to #game-container so it works in 2D and 3D.
// ============================================================

const STYLE_ID = 'kano-day-hud-styles';

const CSS = `
.kano-day-hud{position:absolute;left:8px;top:calc(env(safe-area-inset-top,0px) + 96px);z-index:6;
  display:flex;flex-direction:column;gap:4px;pointer-events:none;font:700 11px/1.2 system-ui,sans-serif;color:#e8f1fb}
.kano-day-hud .kdh-clock{background:#101a26cc;border:1px solid #ffffff22;border-radius:8px;padding:5px 8px;
  backdrop-filter:blur(4px);white-space:nowrap}
.kano-day-hud .kdh-clock b{font-size:13px;letter-spacing:.04em}
.kano-day-hud .kdh-row{display:flex;align-items:center;gap:6px;background:#101a26cc;border:1px solid #ffffff22;
  border-radius:8px;padding:3px 8px}
.kano-day-hud .kdh-row span{width:46px;opacity:.85}
.kano-day-hud .kdh-bar{flex:1;min-width:54px;height:5px;border-radius:3px;background:#ffffff22;overflow:hidden}
.kano-day-hud .kdh-bar i{display:block;height:100%;width:0;background:#9de6d7;transition:width .4s,background .4s}
.kano-day-hud .kdh-bar i.warn{background:#f5c542}
.kano-day-hud .kdh-bar i.crit{background:#ff6b6b}
@media (max-width:760px){.kano-day-hud{top:calc(env(safe-area-inset-top,0px) + 84px)}
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
    this.container.appendChild(this.root);
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

  setLanguage(lang) { this.lang = lang; this.last = ''; }
  show(visible) { this.root.style.display = visible ? '' : 'none'; }

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

  dispose() { this.root.remove(); }
}
