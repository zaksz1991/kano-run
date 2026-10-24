/**
 * Fuel stations with a real queue and a real price.
 * Replaces the free "+42 fuel" refill with: cars ahead of you, a short wait,
 * then choose how much to buy; the cost comes out of run earnings (s.score).
 * Station price changes through the day and with fuel-queue road conditions.
 */
import { Game } from './game.js';
import { KanoFuelQueueDirector } from './KanoFuelQueueDirector.js';

const PATCH = Symbol.for('kano.life.fuelQueueBridge.v1');
const TANK_LITRES = 12;          // keke tank
const PRICE_PER_LITRE = 100;     // gameplay-scaled (real pump prices would exceed a fare)
const WAIT_SECONDS_PER_CAR = 6;
const naira = (n) => `₦${Math.round(n).toLocaleString()}`;

export function fuelPlan(percentNeeded, score, pricePerLitre = PRICE_PER_LITRE) {
  const litresWanted = Math.max(0, percentNeeded) / 100 * TANK_LITRES;
  const affordableLitres = pricePerLitre > 0 ? Math.max(0, score) / pricePerLitre : litresWanted;
  const litres = Math.min(litresWanted, affordableLitres);
  return { litres, cost: Math.round(litres * pricePerLitre), percent: litres / TANK_LITRES * 100, short: litres < litresWanted - 1e-6 };
}

export function stationPrice(environment, hourSeed) {
  let price = PRICE_PER_LITRE * (0.92 + (Math.abs(Math.sin(hourSeed * 12.9898)) * 0.2));
  if (environment === 'fuelQueue') price *= 1.12;
  return Math.round(price);
}

function host() {
  let el = document.getElementById('kano-fuel-panel');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kano-fuel-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Fuel station');
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:132px;width:min(92vw,360px);z-index:60;background:rgba(10,24,16,.95);color:#fff4d0;border:2px solid #7bd88f;border-radius:14px;padding:10px 12px;font:700 13px/1.35 Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);display:none';
  document.body.append(el);
  return el;
}
const close = () => { const el = document.getElementById('kano-fuel-panel'); if (el) { el.style.display = 'none'; el.replaceChildren(); } };
function btn(label, fn, primary = false) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label;
  b.style.cssText = `flex:1 1 30%;min-height:40px;border-radius:9px;border:1px solid #7bd88f;font:900 12px Arial,sans-serif;touch-action:manipulation;${primary ? 'background:#7bd88f;color:#06240f' : 'background:#203747;color:#fff4d0'}`;
  b.addEventListener('click', fn);
  return b;
}

function openStation(game) {
  const s = game.s;
  const hourSeed = Math.floor((s.elapsed || 0) / 60) + (s.day || 1);
  const price = stationPrice(s.environment, hourSeed);
  const director = new KanoFuelQueueDirector({ pumpCount: 2, litersPerMinute: 8, stockLiters: 400, pricePerLiter: price });
  const carsAhead = s.environment === 'fuelQueue' ? 3 + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 4);
  for (let i = 0; i < carsAhead; i += 1) director.joinQueue({ vehicleId: `car-${i}`, vehicleType: 'car', requestedLiters: 4 + Math.floor(Math.random() * 6) });
  director.joinQueue({ vehicleId: 'player', vehicleType: 'keke', driverName: 'You', requestedLiters: TANK_LITRES });
  const waitSeconds = Math.min(30, carsAhead * WAIT_SECONDS_PER_CAR);
  const el = host();
  let remaining = waitSeconds;
  let timer = null;
  const alive = () => game.state === 'PLAY';

  const showBuy = () => {
    if (!alive()) { close(); return; }
    const needed = 100 - s.fuel;
    el.replaceChildren();
    el.style.display = 'block';
    const head = document.createElement('div');
    head.style.cssText = 'font-size:11px;color:#7bd88f';
    head.textContent = `FUEL STATION · ${naira(price)} per litre · tank ${Math.round(s.fuel)}%`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px';
    const buy = (percent) => () => {
      const plan = fuelPlan(Math.min(percent, 100 - s.fuel), s.score, price);
      if (plan.litres < 0.2) { game.ui?.toast?.('Not enough earnings for fuel'); close(); return; }
      s.score = Math.max(0, s.score - plan.cost);
      s.fuel = Math.min(100, s.fuel + plan.percent);
      s.refills += 1;
      game.dailyAdd?.('refills', 1);
      game.missionAdd?.('refills', 1);
      game.audio?.pickup?.();
      game.ui?.toast?.(`${plan.litres.toFixed(1)} L bought · ${naira(plan.cost)}${plan.short ? ' (all you could afford)' : ''}`);
      close();
    };
    const cost = (p) => naira(fuelPlan(Math.min(p, needed), s.score, price).cost);
    row.append(
      btn(`¼ TANK ${cost(25)}`, buy(25)),
      btn(`½ TANK ${cost(50)}`, buy(50)),
      btn(`FULL ${cost(needed)}`, buy(needed), true),
      btn('LEAVE', close),
    );
    el.append(head, row);
  };

  const showWait = () => {
    if (!alive()) { close(); return; }
    el.replaceChildren();
    el.style.display = 'block';
    const head = document.createElement('div');
    head.textContent = carsAhead
      ? `${carsAhead} car${carsAhead > 1 ? 's' : ''} ahead of you at the pump · about ${remaining}s`
      : 'A pump is free';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:8px';
    row.append(btn('LEAVE QUEUE', () => { clearInterval(timer); close(); }));
    el.append(head, row);
  };

  if (!carsAhead) { showBuy(); return; }
  showWait();
  timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) { clearInterval(timer); showBuy(); } else showWait();
  }, 1000);
}

if (Game?.prototype && !Game.prototype[PATCH]) {
  const originalRefuel = Game.prototype.refuel;
  if (typeof originalRefuel === 'function') {
    Game.prototype.refuel = function refuelWithQueue(...args) {
      const s = this.s;
      if (!s || s.refillCooldown > 0 || s.fuel >= 98 || typeof document === 'undefined') return originalRefuel.apply(this, args);
      try { openStation(this); s.refillCooldown = 3; return true; }
      catch (error) { console.warn('[Kano fuel queue] fallback to simple refill', error); return originalRefuel.apply(this, args); }
    };
  }
  Object.defineProperty(Game.prototype, PATCH, { value: true });
}
