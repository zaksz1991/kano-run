/**
 * Empty-tank rescue. Running out of fuel used to freeze the keke with no way out.
 * Now the driver always has options, like real life in Kano:
 *   1. buy a little fuel from the roadside jerrycan boy (black-market price, from run earnings)
 *   2. call a friend on WhatsApp (free, takes a few seconds, limited)
 *   3. push the keke to the next fuel station (crawl speed)
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.fuelRescue.v1');
const JERRYCAN_PRICE_PER_LITRE = 160;
const TANK_LITRES = 12;
const PUSH_MAX_SPEED = 7;

const naira = (n) => `₦${Math.round(n).toLocaleString()}`;

function host() {
  let el = document.getElementById('kano-fuel-rescue');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kano-fuel-rescue';
  el.setAttribute('role', 'dialog');
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:120px;width:min(92vw,380px);z-index:70;background:rgba(40,12,8,.96);color:#fff4d0;border:2px solid #ff9a3c;border-radius:14px;padding:12px;font:700 13px/1.35 Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.55);display:none';
  document.body.append(el);
  return el;
}

function close() {
  const el = document.getElementById('kano-fuel-rescue');
  if (el) {
    el.style.display = 'none';
    el.replaceChildren();
  }
}

function button(label, onClick, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.disabled = disabled;
  b.style.cssText = `display:block;width:100%;min-height:44px;margin-top:8px;border-radius:10px;border:1px solid #ff9a3c;font:900 13px Arial,sans-serif;touch-action:manipulation;${disabled ? 'background:#3a2a24;color:#8a7a70' : 'background:#ff9a3c;color:#2a0f00'}`;
  b.addEventListener('click', onClick);
  return b;
}

function openRescue(game) {
  const s = game.s;
  const el = host();
  el.replaceChildren();
  s.rescueOpen = true;

  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;color:#ffd27a';
  title.textContent = 'TANK EMPTY — the keke has stopped';
  const copy = document.createElement('div');
  copy.style.marginTop = '4px';
  copy.textContent = 'Oga, mai kekenapep, what do you do?';
  el.append(title, copy);

  const spend = Math.min(Math.max(0, Math.floor(s.score)), 320);
  const litres = spend / JERRYCAN_PRICE_PER_LITRE;
  const percent = litres / TANK_LITRES * 100;
  el.append(button(
    spend >= 80
      ? `Buy from the jerrycan boy · ${naira(spend)} for ${litres.toFixed(1)} L (+${Math.round(percent)}%)`
      : 'Jerrycan boy · you do not have enough run earnings',
    () => {
      s.score -= spend;
      s.fuel = Math.min(100, s.fuel + percent);
      s.rescueOpen = false;
      s.pushing = false;
      close();
      game.ui.toast(`Jerrycan boy: "Fuel dey, oga!" · -${naira(spend)}`);
    },
    spend < 80,
  ));

  const calls = s.rescueCalls || 0;
  el.append(button(
    calls < 2 ? 'Call a friend on WhatsApp (free · takes about 8 seconds)' : 'No more friends are picking up',
    () => {
      s.rescueCalls = calls + 1;
      s.rescueOpen = false;
      close();
      game.ui.toast('Calling Dan Ladi… "I dey come with fuel, hold on!"');
      window.setTimeout(() => {
        if (game.s !== s || s.fuel > 0.5) return;
        s.fuel = Math.min(100, s.fuel + 14);
        s.pushing = false;
        game.ui.toast('Dan Ladi arrived with a bottle of fuel · +14% tank');
      }, 8000);
    },
    calls >= 2,
  ));

  el.append(button('Push the keke to the next fuel station', () => {
    s.pushing = true;
    s.rescueOpen = false;
    close();
    game.ui.toast('You and the passengers push the keke · hold GAS to keep rolling to the next fuel station');
  }));
  el.style.display = 'block';
}

if (!Game.prototype[PATCH]) {
  const originalTick = Game.prototype.tick;
  Game.prototype.tick = function tickWithFuelRescue(dt, ...rest) {
    const s = this.s;
    if (this.state !== 'PLAY' || s?.event) {
      if (s?.rescueOpen && this.state !== 'PLAY') { s.rescueOpen = false; close(); }
      return originalTick.call(this, dt, ...rest);
    }
    let bumped = false;
    if (s && s.pushing && s.fuel <= 0.1) {
      s.fuel = 0.4;
      bumped = true;
    }
    const result = originalTick.call(this, dt, ...rest);
    if (s && bumped) {
      if (s.fuel <= 0.4) {
        s.fuel = 0;
        s.speed = Math.min(s.speed, PUSH_MAX_SPEED);
        if (typeof this.syncSignedSpeed === 'function') this.syncSignedSpeed();
      } else {
        s.pushing = false; // refuelled while pushing
      }
    }
    if (s && s.fuel > 0.5 && s.rescueOpen) {
      s.rescueOpen = false;
      close();
    }
    if (
      s && s.fuel <= 0.1 && !s.pushing && !s.rescueOpen &&
      this.mode !== 'fuel' && !(s.rescueCooldown > 0)
    ) {
      s.rescueCooldown = 25;
      openRescue(this);
    }
    if (s && s.rescueCooldown > 0) s.rescueCooldown -= dt;
    return result;
  };
  Object.defineProperty(Game.prototype, PATCH, { value: true });
}
