/**
 * Kano Life Stage Presenter
 * Animated, readable explanations for life-sim moments.
 * CSS transitions only (cheap on phone). Auto-hides.
 *
 * window.kanoLifeStage.present({ kind, title, body, chips, ms })
 * Also listens for window event: kano-life-stage
 */
const KINDS = {
  park: {
    eyebrow: 'Park operations',
    icon: '🅿️',
    title: 'You entered the park',
    body: 'Your working day starts at the keke stand. Queue, token, and boarding are tracked here before you roll out.',
  },
  board: {
    eyebrow: 'Passenger boarded',
    icon: '🧍',
    title: 'Someone entered your keke',
    body: 'A passenger sat down. Their destination and fare are now part of this trip.',
  },
  drop: {
    eyebrow: 'Passenger dropped',
    icon: '📍',
    title: 'Trip completed',
    body: 'You dropped a passenger. Fare is earned and the park ledger records the completed trip.',
  },
  shift: {
    eyebrow: 'Life ledger',
    icon: '📒',
    title: 'Shift settled',
    body: 'Your run is closed in the northern driver ledger: earnings, costs, and wallet for this shift.',
  },
  day: {
    eyebrow: 'End of day',
    icon: '🌙',
    title: 'Day statement saved',
    body: 'Today’s work is archived so tomorrow’s morning routine and household pressure can use real history.',
  },
  token: {
    eyebrow: 'Park token',
    icon: '🪙',
    title: 'Daily park token paid',
    body: 'A small official-queue token left your banked wallet so you can load from the stand.',
  },
  morning: {
    eyebrow: 'Driver’s day',
    icon: '🌅',
    title: 'Morning in Kano',
    body: 'Home compound, intention, and readiness before the park. How you start affects fatigue and focus.',
  },
  default: {
    eyebrow: 'Kano Life',
    icon: '✨',
    title: 'Life update',
    body: 'Something in your driver life changed.',
  },
};

function ensureDom() {
  let root = document.getElementById('kano-life-stage');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'kano-life-stage';
  root.innerHTML = `
    <div class="kls-card" role="status" aria-live="polite">
      <div class="kls-row">
        <div class="kls-icon" data-kls-icon>✨</div>
        <div>
          <p class="kls-eyebrow" data-kls-eye></p>
          <h3 class="kls-title" data-kls-title></h3>
          <p class="kls-body" data-kls-body></p>
          <div class="kls-meta" data-kls-meta></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

let hideTimer = 0;
let cssLinked = false;

function ensureCss() {
  if (cssLinked) return;
  cssLinked = true;
  const href = '/css/kano-life-stage.css';
  if (![...document.styleSheets].some((s) => (s.href || '').includes('kano-life-stage'))) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

/**
 * @param {object} opts
 * @param {string} [opts.kind] park|board|drop|shift|day|token|morning
 * @param {string} [opts.title]
 * @param {string} [opts.body]
 * @param {string[]} [opts.chips]
 * @param {number} [opts.ms] visible duration
 */
export function present(opts = {}) {
  ensureCss();
  const root = ensureDom();
  const base = KINDS[opts.kind] || KINDS.default;
  const eye = opts.eyebrow || base.eyebrow;
  const title = opts.title || base.title;
  const body = opts.body || base.body;
  const icon = opts.icon || base.icon;
  const chips = Array.isArray(opts.chips) ? opts.chips.filter(Boolean).slice(0, 5) : [];
  const ms = Math.max(2200, Math.min(8000, Number(opts.ms) || 4200));

  root.querySelector('[data-kls-icon]').textContent = icon;
  root.querySelector('[data-kls-eye]').textContent = eye;
  root.querySelector('[data-kls-title]').textContent = title;
  root.querySelector('[data-kls-body]').textContent = body;
  const meta = root.querySelector('[data-kls-meta]');
  meta.innerHTML = chips
    .map((c, i) => `<span class="kls-chip${i === 0 ? ' gold' : ''}">${String(c).slice(0, 40)}</span>`)
    .join('');

  root.classList.remove('kls-on');
  // reflow for restart animation
  void root.offsetWidth;
  root.classList.add('kls-on');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    root.classList.remove('kls-on');
  }, ms);
}

export function install() {
  if (typeof window === 'undefined') return;
  window.kanoLifeStage = { present, version: 1 };
  window.addEventListener('kano-life-stage', (ev) => {
    present(ev.detail || {});
  });
  console.info('[Kano Life] Stage presenter ready — animated life explanations');
}

install();
