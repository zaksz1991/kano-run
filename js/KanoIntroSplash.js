/**
 * Start sequence: splash -> three short intro slides -> start screen. Pure DOM overlay on top of the normal start
 * screen, so the game keeps loading underneath. Shown once per day on a device; SKIP is always available.
 */
const KEY = 'kano.intro.seen.day';
const SLIDES = [
  ['01 / 03', 'The City', 'Kano <em>awake</em> before the sun. Dakata, Sabon Gari, Kofar Mata, Zoo Road. Every street has a story.'],
  ['02 / 03', 'The Drive', 'Pick passengers, take the right lane, dodge KAROTA and watch your fuel. One wrong turn costs you a fare.'],
  ['03 / 03', 'The Hustle', 'Start with one keke and a small loan. Work hard, rest, pray, and build your <em>empire</em>.'],
];
const today = () => new Date().toISOString().slice(0, 10);
const seen = () => { try { return localStorage.getItem(KEY) === today(); } catch { return false; } };
const mark = () => { try { localStorage.setItem(KEY, today()); } catch { /* private mode */ } };

function run() {
  if (seen() || /[?&](debug|nointro)=1/.test(location.search) || document.getElementById('kano-intro')) return;
  const css = document.createElement('style');
  css.textContent = `#kano-intro{position:fixed;inset:0;z-index:99999;background:#0a0d12;color:#f4efe3;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 28px;font-family:Inter,Arial,sans-serif;transition:opacity .35s}
#kano-intro.out{opacity:0;pointer-events:none}
#kano-intro .mark{width:84px;height:84px;border-radius:22px;border:2px solid #f2c200;color:#f2c200;font:900 34px/80px Arial,sans-serif;letter-spacing:1px}
#kano-intro h1{margin:18px 0 4px;font:900 26px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase}
#kano-intro .sub{font:700 11px Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;opacity:.65}
#kano-intro .beta{margin-top:22px;padding:4px 12px;border:1px solid #2fe08d;border-radius:99px;color:#2fe08d;font:800 10px Arial,sans-serif;letter-spacing:.18em}
#kano-intro .bar{width:140px;height:3px;background:#1e2630;border-radius:2px;margin-top:26px;overflow:hidden}
#kano-intro .bar i{display:block;height:100%;width:40%;background:#f2c200;animation:kanoIntroBar 1.1s ease-in-out infinite}
@keyframes kanoIntroBar{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
#kano-intro .no{font:800 11px Arial,sans-serif;letter-spacing:.2em;color:#f2c200}
#kano-intro h2{margin:14px 0 10px;font:900 38px/1.05 Georgia,serif;text-transform:uppercase}
#kano-intro p{max-width:300px;margin:0 auto;font:500 15px/1.5 Arial,sans-serif;opacity:.85}
#kano-intro em{color:#f2c200;font-style:italic}
#kano-intro button{touch-action:manipulation;cursor:pointer}
#kano-intro .go{margin-top:30px;min-width:190px;min-height:48px;border:0;border-radius:12px;background:#f2c200;color:#111;font:900 13px Arial,sans-serif;letter-spacing:.14em}
#kano-intro .skip{position:absolute;top:max(16px,env(safe-area-inset-top));right:18px;background:none;border:0;color:#f4efe3;opacity:.6;font:800 11px Arial,sans-serif;letter-spacing:.2em}
#kano-intro .dots{position:absolute;bottom:max(26px,env(safe-area-inset-bottom));display:flex;gap:8px}
#kano-intro .dots b{width:7px;height:7px;border-radius:50%;background:#2a3440}#kano-intro .dots b.on{background:#f2c200}`;
  document.head.append(css);
  const box = document.createElement('div');
  box.id = 'kano-intro';
  document.body.append(box);
  const finish = () => { mark(); box.classList.add('out'); setTimeout(() => { box.remove(); css.remove(); }, 400); };
  const splash = () => {
    box.innerHTML = '<div class="mark">KL</div><h1>Kano Life</h1><div class="sub">Preparing the city…</div><div class="sub" style="margin-top:6px">Kano streets · open world</div><div class="bar"><i></i></div><div class="beta">EARLY BETA · OPEN DEMO</div>';
  };
  const slide = (i) => {
    const [no, title, text] = SLIDES[i];
    box.innerHTML = `<button class="skip" type="button">SKIP</button><div class="no">${no}</div><h2>${title}</h2><p>${text}</p><button class="go" type="button">${i === SLIDES.length - 1 ? 'ENTER KANO' : 'CONTINUE →'}</button><div class="dots">${SLIDES.map((_, k) => `<b class="${k === i ? 'on' : ''}"></b>`).join('')}</div>`;
    box.querySelector('.skip').onclick = finish;
    box.querySelector('.go').onclick = () => (i === SLIDES.length - 1 ? finish() : slide(i + 1));
  };
  splash();
  setTimeout(() => slide(0), 1800);
}

if (document.body) run(); else document.addEventListener('DOMContentLoaded', run, { once: true });
