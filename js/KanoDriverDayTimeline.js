/**
 * A driver's day, shown on screen.
 *  - A small animated sun/moon arc with the clock, the day number and what a keke driver is doing right now.
 *  - Each time the day moves to a new part (Fajr, morning rush, Zuhr, evening rush, Maghrib, night, late night)
 *    a short animated scene slides in: sky, sun or moon, mosque at prayer times, a keke driving past, and the
 *    real effect on your day (fares, traffic, visibility). Tap the arc to see the whole day's plan.
 * Display only. It reads game.dayCycle.state and never changes the simulation.
 */
import { PERIODS, periodAt, formatClock } from './KanoDayCycle.js';

const INFO = {
  fajr:    { title: 'Fajr · before sunrise', doing: 'Dawn prayer, tea and kosai, check tyres and fuel', fare: 0.9, traffic: 0.5, vis: 0.8, sky: ['#26304f', '#e58a5b'], mosque: true, orb: 'moon' },
  morning: { title: 'Morning rush', doing: 'Workers and traders heading out. Best fares of the day', fare: 1.2, traffic: 1.3, vis: 1, sky: ['#5aa7d8', '#f6d99a'], orb: 'sun' },
  midday:  { title: 'Midday', doing: 'Steady rides between the markets', fare: 1, traffic: 1, vis: 1, sky: ['#3f95d6', '#bfe4f5'], orb: 'sun' },
  zuhr:    { title: 'Zuhr · after prayer', doing: 'Streets ease after Zuhr. Lunch at the buka', fare: 0.95, traffic: 0.8, vis: 1, sky: ['#3d8fd0', '#d8ecf4'], mosque: true, orb: 'sun' },
  asr:     { title: 'Evening rush', doing: 'Markets closing. Long queues, big fares, heavy traffic', fare: 1.25, traffic: 1.4, vis: 1, sky: ['#6d9fcf', '#f3b768'], orb: 'sun' },
  maghrib: { title: 'Maghrib · dusk', doing: 'Lights on. Pause for Maghrib, then back on the road', fare: 1.1, traffic: 1, vis: 0.75, sky: ['#3b2e5a', '#e0734f'], mosque: true, orb: 'sun' },
  isha:    { title: 'Night', doing: 'Night rides. Fewer people out, watch the dark edges', fare: 1, traffic: 0.7, vis: 0.6, sky: ['#0d1730', '#2b3a68'], mosque: true, orb: 'moon' },
  late:    { title: 'Late night', doing: 'Dead streets. Think of home, food and sleep', fare: 0.8, traffic: 0.4, vis: 0.5, sky: ['#070d1c', '#16213f'], orb: 'moon' },
};

const CSS = `
#kano-day-arc{position:fixed;left:8px;bottom:268px;z-index:41;width:150px;padding:5px 7px 6px;border-radius:12px;
  background:rgba(14,24,38,.86);border:1px solid rgba(255,255,255,.22);color:#fff;font:700 10px/1.25 system-ui,sans-serif;
  pointer-events:auto;touch-action:manipulation}
#kano-day-arc svg{display:block;width:100%;height:36px}
#kano-day-arc .row{display:flex;justify-content:space-between;gap:6px}
#kano-day-arc .t{color:#f5c542;font-weight:900}
#kano-day-arc .d{opacity:.85;margin-top:2px;max-height:2.6em;overflow:hidden}
#kano-day-plan{position:fixed;left:8px;bottom:352px;z-index:42;width:min(78vw,300px);padding:9px 11px;border-radius:14px;
  background:rgba(14,24,38,.96);border:1px solid rgba(245,197,66,.5);color:#fff;font:600 11px/1.4 system-ui,sans-serif;display:none}
#kano-day-plan b{color:#f5c542}
#kano-day-plan .now{background:rgba(245,197,66,.18);border-radius:7px;padding:2px 5px}
#kano-day-banner{position:fixed;left:50%;top:92px;z-index:55;width:min(92vw,340px);transform:translate(-50%,-30px);opacity:0;
  border-radius:16px;overflow:hidden;background:rgba(10,18,30,.95);border:1px solid rgba(245,197,66,.6);color:#fff;
  font:700 12px/1.4 system-ui,sans-serif;pointer-events:none;transition:transform .5s cubic-bezier(.2,.9,.3,1.2),opacity .4s}
#kano-day-banner.show{transform:translate(-50%,0);opacity:1}
#kano-day-banner svg{display:block;width:100%;height:70px}
#kano-day-banner .txt{padding:8px 12px 10px}
#kano-day-banner h4{margin:0 0 3px;font-size:15px;color:#f5c542}
#kano-day-banner .fx{margin-top:5px;font-size:11px;opacity:.9}
@keyframes kano-keke-pass{from{transform:translateX(-60px)}to{transform:translateX(360px)}}
@keyframes kano-orb-rise{from{transform:translateY(26px)}to{transform:translateY(0)}}
@keyframes kano-wheel{to{transform:rotate(360deg)}}
.kano-keke-run{animation:kano-keke-pass 3.6s linear infinite}
.kano-orb{animation:kano-orb-rise 1.4s ease-out both}
.kano-wh{transform-box:fill-box;transform-origin:center;animation:kano-wheel .5s linear infinite}
@keyframes kano-steam{0%{transform:translateY(0);opacity:0}30%{opacity:.8}100%{transform:translateY(-22px);opacity:0}}
@keyframes kano-zzz{0%{transform:translate(0,0);opacity:0}25%{opacity:1}100%{transform:translate(14px,-26px);opacity:0}}
.kano-steam{animation:kano-steam 2.2s ease-out infinite}.kano-steam.b{animation-delay:.7s}.kano-steam.c{animation-delay:1.4s}
.kano-zzz{animation:kano-zzz 2.6s ease-out infinite;font:900 14px system-ui;fill:#f1efe2}.kano-zzz.b{animation-delay:1.3s}
.kano-break-scene{margin:-20px -20px 12px;border-radius:20px 20px 0 0;overflow:hidden}
.kano-break-scene svg{display:block;width:100%;height:96px}
@media (prefers-reduced-motion:reduce){.kano-steam,.kano-zzz{animation:none;opacity:.7}}
@media (prefers-reduced-motion:reduce){.kano-keke-run,.kano-orb,.kano-wh{animation:none}}
`;

function scene(id) {
  const i = INFO[id];
  const orb = i.orb === 'moon'
    ? '<circle class="kano-orb" cx="262" cy="26" r="11" fill="#f1efe2"/><circle cx="267" cy="23" r="9" fill="' + i.sky[0] + '"/>'
    : '<circle class="kano-orb" cx="262" cy="30" r="13" fill="#ffd45a"/>';
  const mosque = i.mosque
    ? '<g fill="#1a2538"><rect x="40" y="52" width="46" height="26"/><path d="M40 52a23 20 0 0 1 46 0z"/><rect x="92" y="34" width="6" height="44"/><path d="M92 34l3-9 3 9z"/><rect x="22" y="42" width="5" height="36"/><path d="M22 42l2.5-8 2.5 8z"/></g>'
    : '<g fill="#1a2538" opacity=".8"><rect x="30" y="56" width="30" height="22"/><rect x="66" y="48" width="26" height="30"/><rect x="100" y="60" width="38" height="18"/></g>';
  const night = id === 'isha' || id === 'late';
  const stars = night ? '<g fill="#fff" opacity=".8"><circle cx="30" cy="12" r="1"/><circle cx="120" cy="20" r="1.2"/><circle cx="190" cy="10" r="1"/><circle cx="230" cy="40" r="1"/></g>' : '';
  return `<svg viewBox="0 0 300 92" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="kdb-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${i.sky[0]}"/><stop offset="1" stop-color="${i.sky[1]}"/></linearGradient></defs>
<rect width="300" height="92" fill="url(#kdb-${id})"/>${stars}${orb}${mosque}
<rect y="78" width="300" height="14" fill="#2b2f36"/><rect y="84" width="300" height="1.5" fill="#d8d2a8" stroke-dasharray="10 8"/>
<g class="kano-keke-run"><rect x="0" y="62" width="34" height="14" rx="4" fill="#f2c230"/><path d="M5 62q4-12 14-12h8l4 12z" fill="#2b3a4d"/>
<circle class="kano-wh" cx="8" cy="77" r="5" fill="#111"/><circle class="kano-wh" cx="28" cy="77" r="5" fill="#111"/>${night ? '<path d="M34 68l22-5v10z" fill="#ffe9a0" opacity=".55"/>' : ''}</g></svg>`;
}

function arcSvg(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  const dayStart = 360, dayEnd = 1110;
  const isDay = m >= dayStart && m <= dayEnd;
  let t;
  if (isDay) t = (m - dayStart) / (dayEnd - dayStart);
  else t = ((m < dayStart ? m + 1440 : m) - dayEnd) / (1440 - (dayEnd - dayStart));
  const x = 10 + t * 120;
  const y = 32 - Math.sin(Math.PI * t) * 24;
  const orb = isDay
    ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="#ffd45a"/>`
    : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#f1efe2"/><circle cx="${(x + 2).toFixed(1)}" cy="${(y - 1.5).toFixed(1)}" r="4.2" fill="#0e1826"/>`;
  return `<svg viewBox="0 0 140 36"><path d="M10 32Q70 -16 130 32" fill="none" stroke="${isDay ? '#f5c54266' : '#8aa0d066'}" stroke-width="1.5" stroke-dasharray="3 3"/>
<line x1="4" y1="33" x2="136" y2="33" stroke="#ffffff30"/>${orb}</svg>`;
}


function breakScene(kind) {
  const keke = '<g><rect x="196" y="58" width="42" height="17" rx="5" fill="#f2c230"/><path d="M202 58q5-14 17-14h10l5 14z" fill="#2b3a4d"/><circle cx="208" cy="76" r="6" fill="#111"/><circle cx="232" cy="76" r="6" fill="#111"/></g>';
  if (kind === 'restBreak') {
    return `<svg viewBox="0 0 300 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="300" height="96" fill="#0f1a33"/>
<circle cx="256" cy="22" r="11" fill="#f1efe2"/><circle cx="261" cy="19" r="9" fill="#0f1a33"/><g fill="#fff" opacity=".8"><circle cx="40" cy="14" r="1"/><circle cx="110" cy="26" r="1.2"/><circle cx="170" cy="12" r="1"/></g>
<g fill="#16301f"><rect x="62" y="48" width="8" height="32"/><circle cx="66" cy="38" r="22"/><circle cx="48" cy="48" r="14"/><circle cx="84" cy="48" r="14"/></g>
<rect y="80" width="300" height="16" fill="#2b2f36"/>${keke}
<text class="kano-zzz" x="228" y="46">Z</text><text class="kano-zzz b" x="236" y="40">z</text></svg>`;
  }
  return `<svg viewBox="0 0 300 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="300" height="96" fill="#e7b872"/>
<rect y="80" width="300" height="16" fill="#8d6a3c"/>
<g><rect x="50" y="34" width="110" height="6" fill="#b3332a"/><path d="M44 34l10-14h92l10 14z" fill="#d9463b"/><rect x="56" y="40" width="4" height="40" fill="#5a3b1c"/><rect x="150" y="40" width="4" height="40" fill="#5a3b1c"/>
<rect x="56" y="62" width="98" height="18" fill="#6b4a27"/><ellipse cx="86" cy="60" rx="14" ry="6" fill="#3a3a3a"/><ellipse cx="124" cy="60" rx="12" ry="5" fill="#3a3a3a"/></g>
<g stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"><path class="kano-steam" d="M82 54q-4-6 0-12"/><path class="kano-steam b" d="M90 54q4-6 0-12"/><path class="kano-steam c" d="M122 54q-4-6 0-12"/></g>
${keke}</svg>`;
}

function syncBreakScene() {
  const g = window.kanoGame || window.__KANO_ACTIVE_GAME__;
  const card = document.getElementById('event-card');
  const kind = g?.s?.event;
  const wanted = card && !card.classList.contains('hidden') && (kind === 'mealBreak' || kind === 'restBreak') ? kind : null;
  let host = card?.querySelector('.kano-break-scene');
  if (!wanted) { host?.remove(); return; }
  if (host && host.dataset.kind === wanted) return;
  host?.remove();
  host = document.createElement('div');
  host.className = 'kano-break-scene';
  host.dataset.kind = wanted;
  host.innerHTML = breakScene(wanted);
  card.insertBefore(host, card.firstChild);
}

if (typeof window !== 'undefined' && !window.__kanoDriverDayTimeline) {
  window.__kanoDriverDayTimeline = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  let arc = null; let plan = null; let banner = null; let lastPeriod = null; let hideTimer = 0; let lastMinuteDrawn = -99;

  const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__;

  function build() {
    if (arc && arc.isConnected) return;
    arc = document.createElement('div');
    arc.id = 'kano-day-arc';
    arc.setAttribute('role', 'button');
    arc.setAttribute('aria-label', 'Driver day timeline');
    arc.style.display = 'none';
    arc.addEventListener('click', () => { if (plan) plan.style.display = plan.style.display === 'block' ? 'none' : 'block'; renderPlan(); });
    document.body.appendChild(arc);
    plan = document.createElement('div');
    plan.id = 'kano-day-plan';
    document.body.appendChild(plan);
    banner = document.createElement('div');
    banner.id = 'kano-day-banner';
    document.body.appendChild(banner);
  }

  function renderPlan() {
    const st = game()?.dayCycle?.state;
    if (!plan || plan.style.display !== 'block' || !st) return;
    const nowId = periodAt(st.minuteOfDay).id;
    plan.innerHTML = `<b>Driver's day · Day ${st.day}</b><br>` + PERIODS.map((p) => {
      const i = INFO[p.id];
      const hh = String(Math.floor(p.from / 60)).padStart(2, '0') + ':' + String(p.from % 60).padStart(2, '0');
      return `<div class="${p.id === nowId ? 'now' : ''}">${hh} · <b>${i.title}</b><br><span style="opacity:.85">${i.doing}</span></div>`;
    }).join('');
  }

  function showBanner(id, st) {
    const i = INFO[id];
    if (!i || !banner) return;
    const bits = [];
    if (i.fare !== 1) bits.push(`Fares ${i.fare > 1 ? '+' : ''}${Math.round((i.fare - 1) * 100)}%`);
    if (i.traffic !== 1) bits.push(`Traffic ${i.traffic > 1 ? 'heavier' : 'lighter'}`);
    if (i.vis < 1) bits.push('Poor visibility');
    const sv = game()?.s || {};
    const check = [];
    if (Number.isFinite(sv.fuel) && sv.fuel < 35) check.push(`Fuel ${Math.round(sv.fuel)}%: refill soon`);
    if (st.hunger >= 60) check.push('Hungry: eat at a buka');
    if (st.fatigue >= 60) check.push('Tired: take a tea break');
    if (Number.isFinite(sv.tyres) && sv.tyres < 50) check.push('Tyres worn: visit the vulcanizer');
    if (Number.isFinite(sv.engine) && sv.engine < 50) check.push('Engine weak: service it');
    banner.innerHTML = scene(id) + `<div class="txt"><h4>${i.title} · ${formatClock(st.minuteOfDay)}</h4>${i.doing}${bits.length ? `<div class="fx">${bits.join(' · ')}</div>` : ''}${check.length ? `<div class="fx" style="color:#ffb27a">Your check: ${check.join(' · ')}</div>` : ''}</div>`;
    banner.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => banner.classList.remove('show'), 5200);
  }

  let base = null;

  function showSummary(prev, now) {
    if (!banner) return;
    const trips = Math.max(0, now.drops - prev.drops);
    const km = Math.max(0, now.distance - prev.distance);
    const fares = Math.max(0, now.fares - prev.fares);
    banner.innerHTML = scene('late') + `<div class="txt"><h4>Day ${prev.day} complete</h4>`
      + `${trips} trip${trips === 1 ? '' : 's'} · ${km.toFixed(1)} km driven<br>Fares earned: ₦${Math.round(fares).toLocaleString()}`
      + `<div class="fx">A new day in Kano begins. Check your tyres, fuel and stomach.</div></div>`;
    banner.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => banner.classList.remove('show'), 7000);
  }

  setInterval(() => { try { syncBreakScene(); } catch (e) { window.__kanoBreakErr = String(e && e.stack || e).slice(0, 300); } }, 400);

  setInterval(() => {
    try {
      build();
      const g = game();
      const st = g?.dayCycle?.state;
      if (!st || g.state !== 'PLAY') { arc.style.display = 'none'; plan.style.display = 'none'; banner.classList.remove('show'); return; }
      const sv = g.s || {};
      const now = { day: st.day, drops: Number(sv.drops) || 0, distance: Number(sv.distance) || 0, fares: Number(sv.fares) || 0 };
      if (!base || now.drops < base.drops || now.distance < base.distance - 0.001) base = { ...now }; // new run
      if (now.day > base.day) { showSummary(base, now); base = { ...now }; lastPeriod = periodAt(st.minuteOfDay).id; }
      const m = Math.floor(st.minuteOfDay);
      const p = periodAt(st.minuteOfDay);
      if (p.id !== lastPeriod) {
        const first = lastPeriod === null;
        lastPeriod = p.id;
        if (!first) showBanner(p.id, st);
      }
      arc.style.display = 'block';
      if (m !== lastMinuteDrawn) {
        lastMinuteDrawn = m;
        arc.innerHTML = arcSvg(st.minuteOfDay)
          + `<div class="row"><span class="t">${formatClock(st.minuteOfDay)}</span><span>Day ${st.day}</span></div>`
          + `<div class="d">${INFO[p.id].title}</div>`;
        renderPlan();
      }
    } catch (_) { /* display only */ }
  }, 600);
}
