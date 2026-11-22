/** Cash hand-over: when a passenger pays at the drop-off, show the notes changing hands over the keke. */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.cashHandover.v1');

function show(amount, name) {
  const css = document.getElementById('kano-cash-css') || Object.assign(document.createElement('style'), { id: 'kano-cash-css' });
  if (!css.parentNode) {
    css.textContent = '@keyframes kanoCash{0%{opacity:0;transform:translate(-50%,24px) scale(.9)}15%{opacity:1}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-70px) scale(1.05)}}';
    document.head.append(css);
  }
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:46%;z-index:55;pointer-events:none;padding:10px 16px;border-radius:14px;background:#0f2a1c;border:2px solid #2fe08d;color:#d8ffe9;font:900 15px Arial,sans-serif;box-shadow:0 8px 24px #0008;animation:kanoCash 1.9s ease-out forwards;text-align:center;transform:translateX(-50%)';
  el.innerHTML = `💵 ${name ? `${name} pays` : 'Fare paid'}<br><span style="font-size:20px;color:#2fe08d">+₦${Math.round(amount).toLocaleString()}</span>`;
  document.body.append(el);
  setTimeout(() => el.remove(), 2000);
}

if (!Game.prototype[PATCH]) {
  Object.defineProperty(Game.prototype, PATCH, { value: true });
  const base = Game.prototype.drop;
  Game.prototype.drop = function dropWithCash(zone) {
    const name = this.s?.passengers?.[0]?.name;
    const before = Number(this.s?.fares) || 0;
    const result = base.call(this, zone);
    try {
      const paid = (Number(this.s?.fares) || 0) - before;
      if (paid > 0) show(paid, name);
    } catch { /* cosmetic only */ }
    return result;
  };
}
