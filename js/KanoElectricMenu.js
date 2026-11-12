/**
 * Pause-menu entry for the electric keke: the replacement price, the daily battery rental and the CNG stations,
 * so drivers do not have to find a filling station to learn about it.
 */
const naira = (n) => `\u20A6${Math.round(n).toLocaleString('en-NG')}`;

function openCard() {
  const E = window.kanoElectric;
  if (!E) return;
  let el = document.getElementById('kano-electric-card');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kano-electric-card';
    el.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:16px';
    document.body.appendChild(el);
  }
  const owned = E.owned();
  el.replaceChildren();
  const box = document.createElement('div');
  box.style.cssText = 'max-width:380px;width:100%;background:#10202c;color:#fff;border:2px solid #4cc9f0;border-radius:16px;padding:16px;font:600 14px system-ui,sans-serif;line-height:1.45';
  const h = document.createElement('div');
  h.style.cssText = 'font-size:17px;font-weight:800;color:#4cc9f0;margin-bottom:8px';
  h.textContent = '\u26A1 ELECTRIC KEKE NAPEP';
  const p1 = document.createElement('div');
  p1.textContent = owned
    ? 'Your keke is electric. Rent a fully charged battery at any filling station for ' + naira(E.rent) + ' a day.'
    : 'The manufacturer replaces your engine with an electric one for ' + naira(E.price) + ', paid from your banked wallet. They also rent a fully charged battery for ' + naira(E.rent) + ' a day, so you never buy the battery.';
  const p2 = document.createElement('div');
  p2.style.cssText = 'margin-top:8px;font-size:12px;color:#bcd';
  p2.textContent = 'CNG stations: ' + E.stations.map((x) => x.replace(' CNG', '')).join(' \u00B7 ');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:12px';
  const mk = (label, fn, primary) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.style.cssText = 'flex:1;padding:12px;border-radius:12px;border:0;font:800 13px system-ui,sans-serif;background:' + (primary ? '#4cc9f0;color:#032' : '#223645;color:#fff');
    b.addEventListener('click', fn);
    return b;
  };
  if (!owned) row.append(mk('GO ELECTRIC ' + naira(E.price), () => { E.convert(); openCard(); }, true));
  row.append(mk('CLOSE', () => { el.remove(); }));
  box.append(h, p1, p2, row);
  el.appendChild(box);
}

function addButton() {
  const row = document.querySelector('#menu-screen .menu-actions');
  if (!row || document.getElementById('kano-electric-menu-btn')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'kano-electric-menu-btn'; b.textContent = '\u26A1 ELECTRIC KEKE & BATTERY';
  b.addEventListener('click', openCard);
  const garage = document.getElementById('menu-garage-btn');
  if (garage?.parentNode === row) garage.after(b); else row.appendChild(b);
}

if (typeof window !== 'undefined' && !window.__kanoElectricMenu) {
  window.__kanoElectricMenu = true;
  setInterval(() => { try { addButton(); } catch (_) { /* optional */ } }, 1500);
}
