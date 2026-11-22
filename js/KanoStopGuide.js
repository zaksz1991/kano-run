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
    if (!g?.s || g.state !== 'PLAY') { board.style.display = 'none'; return; }
    // Challenge
    if (!challenge || (challenge.until && Date.now() > challenge.until)) newChallenge();
    const c = challenge;
    const goal = c.kind === 'drop' ? `Drop ${c.n} passengers at ${c.dest}` : `Pick up ${c.n} passengers at ${c.stop}`;
    board.innerHTML = c.until ? '<b>CHALLENGE COMPLETE</b>Next one coming…' : `<b>🎯 KANO CHALLENGE · ${naira(c.reward)}</b>${goal} · ${c.done}/${c.n}`;
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
  const pickup = Game.prototype.pickup;
  Game.prototype.pickup = function pickupForChallenge(zone) {
    const before = this.s?.passengers?.length || 0;
    const stop = zone?.stopName;
    const result = pickup.call(this, zone);
    try {
      const gained = (this.s?.passengers?.length || 0) - before;
      if (gained > 0 && challenge?.kind === 'pickup' && stop === challenge.stop) bump(this, gained);
    } catch { /* cosmetic */ }
    return result;
  };
  const drop = Game.prototype.drop;
  Game.prototype.drop = function dropForChallenge(zone) {
    const matching = (this.s?.passengers || []).filter((p) => p.dest === zone?.dest).length;
    const before = this.s?.passengers?.length || 0;
    const result = drop.call(this, zone);
    try {
      const left = before - (this.s?.passengers?.length || 0);
      if (left > 0 && challenge?.kind === 'drop' && zone?.dest === challenge.dest) bump(this, Math.min(left, matching) || left);
    } catch { /* cosmetic */ }
    return result;
  };
  setInterval(render, 250);
}
