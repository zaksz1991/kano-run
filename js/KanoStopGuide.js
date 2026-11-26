/**
 * Stop guide + Kano Challenge.
 *  - Challenge: a short goal for a real Kano location ("Take 3 passengers to Sabon Gari", "Pick up 2 at Kofar Mata")
 *    with a cash reward. Stops that match the goal are made to appear more often.
 */
import { Game } from './game.js';
import { ROUTES } from './config.js';

const PATCH = Symbol.for('kano.life.stopGuide.v1');
const naira = (n) => `₦${Math.round(n).toLocaleString()}`;
const STOPS = ['Kofar Mata', 'Sabon Gari', 'Kantin Kwari', 'Yankaba', 'Sharada', 'Rimin Gado', 'Zoo Road', 'Dakata', 'Tarauni'];
const DESTS = ['Sabon Gari', 'Kurmi Market', 'Bompai', 'Zoo Road', 'Fagge', 'Dala', 'Gwale', 'Kofar Ruwa', 'Dakata', 'Hotoro', 'Sharada', 'Tarauni'].filter((n) => ROUTES.some((r) => r.name === n));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__;

let guide = null;
let board = null;
let challenge = null;
let coachShown = false;

function coach() {
  if (coachShown) return;
  coachShown = true;
  let seen = false;
  try { seen = localStorage.getItem('kano.coach.v1') === '1'; } catch { /* private mode */ }
  if (seen) return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:300px;transform:translateX(-50%);z-index:70;width:min(88vw,320px);padding:14px 16px;border-radius:16px;background:rgba(10,13,18,.96);border:2px solid #f2c200;color:#f4efe3;font:700 13px/1.5 Arial,sans-serif;box-shadow:0 12px 34px #000b;text-align:left';
  el.innerHTML = '<div style="font:900 12px Arial;letter-spacing:.16em;color:#f2c200;margin-bottom:6px">HOW TO EARN</div>'
    + '<div><b style="color:#2fe08d">GREEN · PICK UP</b> a waiting passenger. Move into the side of the sign and slow down.</div>'
    + '<div style="margin-top:6px"><b style="color:#ff9a3c">ORANGE · DROP OFF</b> at the place your passenger asked for. The tag shows the name.</div>'
    + '<div style="margin-top:6px"><b style="color:#f2c200">🎯 CHALLENGE</b> top left: finish it for bonus cash.</div>'
    + '<div style="margin-top:10px;text-align:center;font:900 12px Arial;letter-spacing:.14em;color:#f2c200">TAP TO START</div>';
  const done = () => { try { localStorage.setItem('kano.coach.v1', '1'); } catch { /* ignore */ } el.remove(); };
  el.addEventListener('click', done);
  document.body.append(el);
  setTimeout(done, 9000);
}

function css() {
  if (document.getElementById('kano-guide-css')) return;
  const st = document.createElement('style');
  st.id = 'kano-guide-css';
  st.textContent = '#kano-stop-guide,#kano-challenge{position:fixed;left:8px;z-index:44;max-width:min(56vw,236px);padding:6px 10px;border-radius:12px;font:800 11.5px/1.3 Arial,sans-serif;color:#fff;pointer-events:none;box-shadow:0 4px 14px #0007;display:none}#kano-stop-guide{top:166px;border:2px solid #fff}#kano-challenge{top:168px;background:rgba(15,22,32,.92);border:1.5px solid #f2c200}#kano-stop-guide b,#kano-challenge b{display:block;font-size:10px;letter-spacing:.14em}';
  document.head.append(st);
}
function mk(id) { const el = document.createElement('div'); el.id = id; document.body.append(el); return el; }

function newChallenge() {
  const kind = Math.random() < 0.55 ? 'drop' : 'pickup';
  if (kind === 'drop') challenge = { kind, dest: pick(DESTS), n: 2 + Math.floor(Math.random() * 3), done: 0 };
  else challenge = { kind, stop: pick(STOPS), n: 2 + Math.floor(Math.random() * 2), done: 0 };
  challenge.reward = challenge.n * 450;
  challenge.until = 0;
}

function bump(game, amount) {
  if (!challenge || challenge.until) return;
  challenge.done += amount;
  if (challenge.done >= challenge.n) {
    game.s.fares = (Number(game.s.fares) || 0) + challenge.reward;
    game.s.score = (Number(game.s.score) || 0) + challenge.reward;
    game.ui?.toast?.(`Challenge complete! +${naira(challenge.reward)}`);
    challenge.until = Date.now() + 6000;
  }
}

function render() {
  try {
    const g = game();
    css();
    board ||= mk('kano-challenge');
    if (game()?.state === 'PLAY') coach();
    if (!g?.s || g.state !== 'PLAY' || window.kanoBoardingCamera?.w) { board.style.display = 'none'; return; }
    // Challenge
    if (!challenge || (challenge.until && Date.now() > challenge.until)) newChallenge();
    const c = challenge;
    const goal = c.kind === 'drop' ? `Drop ${c.n} passengers at ${c.dest}` : `Pick up ${c.n} passengers at ${c.stop}`;
    board.innerHTML = c.until ? '<b>CHALLENGE COMPLETE</b>Next one coming…' : `<b>🎯 ${naira(c.reward)}</b>${goal} · ${c.done}/${c.n}`;
    board.style.display = 'block';
  } catch { /* cosmetic */ }
}

if (!Game.prototype[PATCH]) {
  Object.defineProperty(Game.prototype, PATCH, { value: true });
  const spawn = Game.prototype.spawnZone;
  Game.prototype.spawnZone = function spawnWithChallenge(...args) {
    const result = spawn.apply(this, args);
    try {
      const z = this.s.zones[this.s.zones.length - 1];
      if (challenge && !challenge.until && z && Math.random() < 0.5) {
        if (challenge.kind === 'pickup' && z.type === 'pickup') {
          z.stopName = challenge.stop;
          z.label = z.hub ? `${challenge.stop.toUpperCase()} KEKE STOP · ${z.dest}` : `PICK UP · ${challenge.stop} → ${z.dest}`;
        } else if (challenge.kind === 'drop' && z.type === 'pickup') {
          z.dest = challenge.dest;
          z.label = z.hub ? `${(z.stopName || '').toUpperCase()} KEKE STOP · ${z.dest}` : `PICK UP · ${z.stopName} → ${z.dest}`;
        }
      }
    } catch { /* never break spawning */ }
    return result;
  };
  // Other modules replace pickup/drop on the game INSTANCE, which hides prototype wrappers
  // added later. So the challenge hooks sit on top of the instance once it exists.
  const hook = () => {
    const g = game();
    if (!g || g.__kanoChallengeHooked || typeof g.pickup !== 'function' || typeof g.drop !== 'function') return;
    g.__kanoChallengeHooked = true;
    const basePickup = g.pickup;
    const baseDrop = g.drop;
    g.pickup = function pickupForChallenge(zone, ...rest) {
      const before = this.s?.passengers?.length || 0;
      const stop = zone?.stopName;
      const result = basePickup.call(this, zone, ...rest);
      try {
        const self = this;
        const ch = challenge;
        let counted = 0;
        const check = () => {
          const gained = (self.s?.passengers?.length || 0) - before - counted;
          if (gained > 0 && ch && ch === challenge && ch.kind === 'pickup' && stop === ch.stop) { counted += gained; bump(self, gained); }
        };
        check();
        [150, 700, 1600].forEach((ms) => setTimeout(check, ms));
      } catch { /* cosmetic */ }
      return result;
    };
    g.drop = function dropForChallenge(zone, ...rest) {
      const matching = (this.s?.passengers || []).filter((p) => p.dest === zone?.dest).length;
      const before = this.s?.passengers?.length || 0;
      const result = baseDrop.call(this, zone, ...rest);
      try {
        const self = this;
        const ch = challenge;
        const dest = zone?.dest;
        let counted = 0;
        const check = () => {
          const left = before - (self.s?.passengers?.length || 0) - counted;
          if (left > 0 && ch && ch === challenge && ch.kind === 'drop' && dest === ch.dest) { const n = Math.min(left, Math.max(1, matching - counted)); counted += left; bump(self, n); }
        };
        check();
        [150, 700, 1600].forEach((ms) => setTimeout(check, ms));
      } catch { /* cosmetic */ }
      return result;
    };
  };
  setInterval(hook, 300);
  setInterval(render, 250);
}
