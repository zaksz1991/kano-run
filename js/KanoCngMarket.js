/**
 * Kano CNG economy.
 * Many Kano keke napep run on CNG (cheap) and keep a petrol tank as backup. CNG is sold at only ~6 stations,
 * and when demand is high they hoard, so the price jumps. A petrol-only keke pays about ₦5,000 for a full tank;
 * a CNG keke that has to buy petrol pays about ₦10,000 (dual-fuel markup); a full CNG tank is about ₦3,500.
 * The game's own fuel gauge (s.fuel) always mirrors the tank you are currently running on.
 */
const CNG_FULL = 3500;
const PETROL_PLAIN_FULL = 5000;
const PETROL_DUAL_FULL = 10000;
const KIT_PRICE = 30000;
const KEY = 'kano-cng-converted';
const STATIONS = ['Jaen CNG', 'Hotoro CNG', 'Ring Road CNG', 'Zaria Road CNG', 'Gadon Kaya CNG', 'Dawanau CNG'];
// Jaen is open the most and has a long queue every day.
const JAEN = 0;
const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const store = {
  get() { try { return localStorage.getItem(KEY); } catch (_) { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch (_) { /* optional */ } },
};

function hasCngFlag() {
  let v = store.get();
  if (v === null) { v = Math.random() < 0.5 ? '1' : '0'; store.set(v); }
  return v === '1';
}

export function cngDemand(day, stationIndex, minuteOfDay, seasonBoost = 0) {
  const base = 1 + 0.95 * Math.abs(Math.sin(day * 3.7 + stationIndex * 1.9));
  const rush = (minuteOfDay >= 360 && minuteOfDay <= 600) || (minuteOfDay >= 990 && minuteOfDay <= 1140) ? 0.25 : 0;
  return base + rush + seasonBoost + (stationIndex === JAEN ? 0.2 : 0);
}

function mirror(g) {
  const s = g.s;
  if (!s) return;
  if (!s.hasCng) { s.petrol = s.fuel; return; }
  if (s.activeTank === 'cng') {
    s.cng = s.fuel;
    if (s.cng <= 0.05 && s.petrol > 0.05) {
      s.activeTank = 'petrol';
      s.fuel = s.petrol;
      g.ui?.toast?.('CNG finished · switched to the petrol tank');
    }
  } else {
    s.petrol = s.fuel;
  }
}

function setActive(s, tank) {
  s.activeTank = tank;
  s.fuel = tank === 'cng' ? s.cng : s.petrol;
}

function ensureCss() {
  if (document.getElementById('kano-cng-css')) return;
  const st = document.createElement('style');
  st.id = 'kano-cng-css';
  st.textContent = 'body.kano-has-cng #kano-fuel-budget-chip{display:none!important}';
  document.head.append(st);
}

let panel = null;
function host() {
  if (panel && panel.isConnected) return panel;
  panel = document.createElement('div');
  panel.id = 'kano-cng-panel';
  panel.setAttribute('role', 'dialog');
  panel.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:124px;width:min(94vw,380px);z-index:62;background:rgba(8,22,30,.96);color:#fff4d0;border:2px solid #4cc9f0;border-radius:14px;padding:10px 12px;font:700 13px/1.35 Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.55);display:none';
  document.body.append(panel);
  return panel;
}
const closePanel = () => { if (panel) { panel.style.display = 'none'; panel.replaceChildren(); } };
function btn(label, fn, primary, disabled) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.disabled = !!disabled;
  b.style.cssText = `flex:1 1 30%;min-height:40px;border-radius:9px;border:1px solid #4cc9f0;font:900 12px Arial,sans-serif;touch-action:manipulation;opacity:${disabled ? 0.45 : 1};${primary ? 'background:#4cc9f0;color:#04202b' : 'background:#203747;color:#fff4d0'}`;
  b.addEventListener('click', fn);
  return b;
}

function openStation(g) {
  const s = g.s;
  const day = g.dayCycle?.state?.day || 1;
  const minute = g.dayCycle?.state?.minuteOfDay ?? 600;
  const idx = Math.abs(Math.floor((s.distance || 0) * 2.5) + day) % STATIONS.length;
  const name = STATIONS[idx];
  const season = window.kanoSeason?.describe?.(day);
  const demand = cngDemand(day, idx, minute, season?.cngBoost || 0);
  const hoarding = demand >= 1.85 && idx !== JAEN; // Jaen is always open, just always queued
  const cngFull = Math.round(CNG_FULL * demand / 50) * 50;
  const blackFull = Math.round(cngFull * 1.5 / 50) * 50;
  const petrolFull = (s.hasCng ? PETROL_DUAL_FULL : PETROL_PLAIN_FULL) * (s.environment === 'fuelQueue' ? 1.3 : 1);
  const el = host();
  const alive = () => g.state === 'PLAY';

  const render = () => {
    if (!alive()) { closePanel(); return; }
    el.replaceChildren();
    el.style.display = 'block';
    const head = document.createElement('div');
    head.style.cssText = 'font-size:11px;color:#4cc9f0';
    head.textContent = `${s.hasCng ? name.toUpperCase() : 'FILLING STATION'} · cash ${naira(s.score)}`
      + (s.hasCng ? ` · CNG ${Math.round(s.cng)}% · petrol ${Math.round(s.petrol)}%` : ` · tank ${Math.round(s.petrol)}%`);
    el.append(head);
    if (s.hasCng) {
      const note = document.createElement('div');
      note.style.cssText = 'margin-top:6px;font-weight:600;font-size:12px;color:#d7e9f2';
      note.textContent = hoarding
        ? `The attendant says "CNG don finish" — but a boy at the back will sell you some at ${naira(blackFull)} a full tank. They are hoarding while demand is high.`
        : demand > 1.45
          ? `Queue is long and the price has gone up today: ${naira(cngFull)} for a full tank.`
          : `CNG is moving normally: ${naira(cngFull)} for a full tank.`;
      el.append(note);
    }
    const buyRow = (label, tank, full, extra = 1) => {
      const cur = tank === 'cng' ? s.cng : s.petrol;
      const need = 100 - cur;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px';
      const buy = (pct) => () => {
        const want = Math.min(pct, need);
        const cost = Math.round(full * extra * want / 100);
        if (want < 1) { g.ui?.toast?.('Tank is already full'); return; }
        const pay = Math.min(cost, s.score);
        if (pay < 150) { g.ui?.toast?.('Not enough earnings for that'); return; }
        const got = cost > 0 ? want * (pay / cost) : want;
        s.score = Math.max(0, s.score - pay);
        if (tank === 'cng') s.cng = Math.min(100, s.cng + got); else s.petrol = Math.min(100, s.petrol + got);
        if (tank === 'cng') setActive(s, 'cng'); else if (!s.hasCng || s.activeTank === 'petrol') setActive(s, 'petrol');
        s.refills = (s.refills || 0) + 1;
        g.dailyAdd?.('refills', 1); g.missionAdd?.('refills', 1); g.audio?.pickup?.();
        g.ui?.toast?.(`${tank === 'cng' ? 'CNG' : 'Petrol'} bought · ${naira(pay)}${pay < cost ? ' (all you could afford)' : ''}`);
        s.refillCooldown = 3;
        closePanel();
      };
      const c = (p) => naira(full * extra * Math.min(p, need) / 100);
      const t = document.createElement('div');
      t.style.cssText = 'width:100%;font-size:11px;color:#9fd8ea';
      t.textContent = label;
      row.append(t, btn(`¼ ${c(25)}`, buy(25), false, need < 1), btn(`½ ${c(50)}`, buy(50), false, need < 1), btn(`FULL ${c(100)}`, buy(100), true, need < 1));
      el.append(row);
    };
    if (s.hasCng) buyRow(hoarding ? 'CNG (black-market price)' : 'CNG', 'cng', hoarding ? blackFull : cngFull);
    buyRow(s.hasCng ? 'PETROL (dual-fuel markup, almost double)' : 'PETROL', 'petrol', petrolFull);
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:6px;margin-top:8px';
    if (!s.hasCng) foot.append(btn(`CONVERT TO CNG ${naira(KIT_PRICE)}`, () => {
      if (s.score < KIT_PRICE) { g.ui?.toast?.(`Conversion kit costs ${naira(KIT_PRICE)} · earn more fares first`); return; }
      s.score -= KIT_PRICE; s.hasCng = true; s.cng = 0; s.activeTank = 'petrol'; store.set('1');
      document.body.classList.add('kano-has-cng');
      g.ui?.toast?.('CNG tank fitted · you keep the petrol tank as backup');
      render();
    }, false, false));
    foot.append(btn('LEAVE', closePanel));
    el.append(foot);
  };

  const cars = Math.min(6, Math.floor(demand * 1.6) + (idx === JAEN ? 2 : 0));
  if (!cars) { render(); return; }
  let remaining = Math.min(20, cars * 4);
  const wait = () => {
    el.replaceChildren(); el.style.display = 'block';
    const h = document.createElement('div');
    h.textContent = `${cars} vehicles ahead at ${s.hasCng ? name : 'the pump'} · about ${remaining}s`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:8px';
    row.append(btn('LEAVE QUEUE', () => { clearInterval(timer); closePanel(); }));
    el.append(h, row);
  };
  wait();
  const timer = setInterval(() => { remaining -= 1; if (remaining <= 0) { clearInterval(timer); render(); } else wait(); }, 1000);
}

let chip = null;
function updateChip(g) {
  const s = g.s;
  if (!chip || !chip.isConnected) {
    chip = document.createElement('div');
    chip.id = 'kano-cng-chip';
    chip.style.cssText = 'position:fixed;left:8px;bottom:178px;z-index:40;padding:6px 10px;border-radius:12px;font:700 12px/1.25 system-ui,sans-serif;color:#fff;background:rgba(8,30,40,.88);border:1px solid rgba(76,201,240,.6);pointer-events:none;display:none;max-width:48vw';
    document.body.append(chip);
  }
  const lowest = s.hasCng ? Math.max(s.cng, s.petrol) : s.petrol;
  if (g.state !== 'PLAY' || !s.hasCng || document.hidden || (s.cng > 30 && s.petrol > 30 && lowest > 30)) { chip.style.display = 'none'; return; }
  chip.style.display = 'block';
  chip.textContent = `🟢 CNG ${Math.round(s.cng)}% · ⛽ Petrol ${Math.round(s.petrol)}% · running on ${s.activeTank === 'cng' ? 'CNG' : 'PETROL'}`;
  chip.style.borderColor = s.activeTank === 'petrol' ? 'rgba(255,120,80,.9)' : 'rgba(76,201,240,.6)';
}

function patch(g) {
  if (g.__kanoCng) return;
  g.__kanoCng = true;
  ensureCss();
  const origStart = g.start.bind(g);
  const origTick = g.tick.bind(g);
  const origRefuel = g.refuel.bind(g);
  g.start = function (...a) {
    const r = origStart(...a);
    const s = this.s;
    if (s) {
      s.hasCng = hasCngFlag();
      s.petrol = s.fuel;
      s.cng = s.hasCng ? 75 : 0;
      s.activeTank = s.hasCng ? 'cng' : 'petrol';
      if (s.hasCng) { s.petrol = Math.min(s.petrol, 45); s.fuel = s.cng; }
      document.body.classList.toggle('kano-has-cng', !!s.hasCng);
    }
    return r;
  };
  g.tick = function (dt) {
    const r = origTick(dt);
    try { mirror(this); } catch (_) { /* optional */ }
    return r;
  };
  g.refuel = function (...a) {
    const s = this.s;
    if (!s || typeof document === 'undefined') return origRefuel(...a);
    if (s.refillCooldown > 0) return false;
    try { s.refillCooldown = 3; openStation(this); return true; }
    catch (e) { console.warn('[Kano CNG] fallback refuel', e); return origRefuel(...a); }
  };
  setInterval(() => {
    try {
      if (!g.s) return;
      updateChip(g);
      const label = document.querySelector('#fuel')?.closest('.stat')?.querySelector('small');
      if (label) label.textContent = g.s.hasCng ? (g.s.activeTank === 'cng' ? 'CNG' : 'PETROL') : 'FUEL';
    } catch (_) { /* display only */ }
  }, 500);
}

if (typeof window !== 'undefined' && !window.__kanoCngMarket) {
  window.__kanoCngMarket = true;
  const wait = setInterval(() => {
    const g = window.kanoGame;
    if (g && typeof g.start === 'function' && typeof g.tick === 'function' && typeof g.refuel === 'function') {
      clearInterval(wait);
      patch(g);
      if (g.s && g.state === 'PLAY' && g.s.hasCng === undefined) {
        g.s.hasCng = hasCngFlag(); g.s.petrol = g.s.fuel; g.s.cng = g.s.hasCng ? 75 : 0;
        g.s.activeTank = g.s.hasCng ? 'cng' : 'petrol';
        if (g.s.hasCng) g.s.fuel = g.s.cng;
        document.body.classList.toggle('kano-has-cng', !!g.s.hasCng);
      }
    }
  }, 300);
}
