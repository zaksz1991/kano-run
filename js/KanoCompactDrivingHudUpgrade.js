/**
 * KANO LIFE — compact phone driving HUD.
 * This additive adapter keeps the existing UI/game implementation authoritative:
 * original DOM nodes stay in place and continue receiving updates. A compact view
 * mirrors the four high-priority values; secondary HUD details remain available
 * through an expandable drawer. Desktop layout is not changed.
 */
import { Game } from './game.js';
import { formatFareAmount, isDrivingScreenVisible, compactPassengerText } from './KanoCompactDrivingHudRules.mjs';

const INSTALL_KEY = Symbol.for('kano.life.compactDrivingHud.v1');
const STYLE_ID = 'kano-compact-driving-hud-style';
const ROOT_ID = 'kano-compact-driving-hud';
const UPDATE_INTERVAL_MS = 120;

const css = `
@media (max-width: 760px), (pointer: coarse) {
  #hud.kano-compact-hud-source { display: none !important; }
  #game-container > .minimap.kano-compact-hud-source { display: none !important; }
  #kano-compact-driving-hud {
    position: absolute;
    z-index: 1200;
    top: max(5px, env(safe-area-inset-top));
    left: 7px; right: 7px;
    color: #f5f8fc;
    font: 600 11px/1.2 system-ui, -apple-system, sans-serif;
    pointer-events: none;
    contain: layout style;
  }
  #kano-compact-driving-hud .kcdh-head {
    display: flex; justify-content: space-between; align-items: center;
    gap: 8px; margin: 0 0 4px; padding: 0 2px;
    text-shadow: 0 1px 3px #07111e;
  }
  #kano-compact-driving-hud .kcdh-brand {
    font-size: 10px; font-weight: 900; letter-spacing: .12em;
  }
  #kano-compact-driving-hud button {
    pointer-events: auto; min-height: 32px; min-width: 54px;
    padding: 5px 10px; border: 1px solid #6f879b;
    border-radius: 9px; background: rgba(8, 24, 39, .94);
    color: #f7fafc; font: 800 10px/1 system-ui, sans-serif;
    touch-action: manipulation;
  }
  #kano-compact-driving-hud .kcdh-grid {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px;
  }
  #kano-compact-driving-hud .kcdh-cell {
    box-sizing: border-box; min-width: 0; min-height: 48px;
    padding: 6px 5px 5px; border: 1px solid rgba(151, 181, 201, .32);
    border-radius: 10px; background: rgba(5, 20, 34, .91);
    box-shadow: 0 2px 8px rgba(0,0,0,.16); text-align: center;
  }
  #kano-compact-driving-hud .kcdh-label {
    display: block; color: #a9c6d8; font-size: 8px; font-weight: 800;
    letter-spacing: .08em; white-space: nowrap;
  }
  #kano-compact-driving-hud .kcdh-value {
    display: block; overflow: hidden; margin-top: 4px;
    font-size: clamp(14px, 4.3vw, 18px); font-weight: 900;
    font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap;
  }
  #kano-compact-driving-hud [data-kcdh-cell="fuel"] .kcdh-value { color: #f9cf64; }
  #kano-compact-driving-hud [data-kcdh-cell="fares"] .kcdh-value { color: #70e0b2; }
  #kano-compact-driving-hud .kcdh-details {
    pointer-events: auto; margin-top: 5px; max-height: min(42vh, 270px);
    overflow: auto; overscroll-behavior: contain; padding: 9px;
    border: 1px solid rgba(151, 181, 201, .42); border-radius: 12px;
    background: rgba(5, 20, 34, .97); box-shadow: 0 8px 22px rgba(0,0,0,.28);
    -webkit-overflow-scrolling: touch;
  }
  #kano-compact-driving-hud .kcdh-details[hidden] { display: none !important; }
  #kano-compact-driving-hud .kcdh-details-heading {
    margin: 0 0 7px; color: #f4c85b; font-size: 10px; letter-spacing: .09em;
  }
  #kano-compact-driving-hud .kcdh-detail-stats {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px;
  }
  #kano-compact-driving-hud .kcdh-detail-stats .stat {
    box-sizing: border-box; min-width: 0; padding: 7px;
    border-radius: 7px; background: rgba(255,255,255,.06);
  }
  #kano-compact-driving-hud .kcdh-detail-stats small,
  #kano-compact-driving-hud .kcdh-detail-stats strong { display:block; }
  #kano-compact-driving-hud .kcdh-detail-stats small { color:#a9c6d8; font-size:8px; }
  #kano-compact-driving-hud .kcdh-detail-stats strong { font-size:12px; margin-top:3px; }
  #kano-compact-driving-hud .kcdh-detail-bottom {
    display:flex; gap:6px 10px; flex-wrap:wrap; margin-top:8px;
    color:#d7e5ed; font-size:10px;
  }
  #kano-compact-driving-hud .kcdh-detail-bottom > span { max-width:100%; }
  #kano-compact-driving-hud .kcdh-mission {
    margin-top:8px; padding:7px; border-radius:7px;
    background:rgba(255,255,255,.06); color:#f4f7fa; font-size:10px;
  }
  #kano-compact-driving-hud .kcdh-mission:empty { display:none; }
  #kano-compact-driving-hud .kcdh-legacy-map {
    margin-top:7px; color:#c0d3df; font-size:10px;
  }
  #kano-road-navigation {
    top: calc(max(5px, env(safe-area-inset-top)) + 82px) !important;
    max-width: min(95vw, 390px) !important;
  }
}
`;

function appendStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.append(style);
}

function sourceById(id) {
  return document.getElementById(id);
}

function sourceText(id, fallback = '—') {
  const node = sourceById(id);
  return node ? (node.textContent.trim() || fallback) : fallback;
}

function cloneWithoutIds(source) {
  const clone = source.cloneNode(true);
  const sourceIds = [...(source.id ? [source] : []), ...source.querySelectorAll('[id]')];
  const cloneIds = [...(clone.id ? [clone] : []), ...clone.querySelectorAll('[id]')];
  for (let i = 0; i < cloneIds.length; i += 1) cloneIds[i].removeAttribute('id');
  const pairs = sourceIds.map((node, index) => ({ source: node, mirror: cloneIds[index] })).filter(pair => pair.mirror);
  return { clone, pairs };
}

function createCell(label, key, value = '—') {
  const cell = document.createElement('div');
  cell.className = 'kcdh-cell';
  cell.dataset.kcdhCell = key;
  const caption = document.createElement('span');
  caption.className = 'kcdh-label';
  caption.textContent = label;
  const output = document.createElement('strong');
  output.className = 'kcdh-value';
  output.dataset.kcdhValue = key;
  output.textContent = value;
  cell.append(caption, output);
  return cell;
}

function currentScreenState(hud) {
  const hidden = id => Boolean(sourceById(id)?.classList.contains('hidden'));
  return isDrivingScreenVisible({
    startHidden: hidden('start-screen'),
    lifeHidden: hidden('life-routine-screen'),
    resultsHidden: hidden('over-screen'),
    menuHidden: hidden('menu-screen'),
    hudInlineDisplay: hud?.style?.display || '',
  });
}

function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (window[INSTALL_KEY]) return true;
  if (!window.matchMedia('(max-width: 760px), (pointer: coarse)').matches) return false;

  const hud = sourceById('hud');
  const gameContainer = sourceById('game-container');
  if (!hud || !gameContainer) return false;

  appendStyle();
  const root = document.createElement('section');
  root.id = ROOT_ID;
  root.setAttribute('aria-label', 'Driving status');
  root.innerHTML = `
    <div class="kcdh-head"><span class="kcdh-brand">KANO LIFE</span><button type="button" id="kcdh-toggle" aria-expanded="false" aria-controls="kcdh-details">MORE</button></div>
    <div class="kcdh-grid" aria-live="off"></div>
    <div class="kcdh-details" id="kcdh-details" hidden>
      <h2 class="kcdh-details-heading">SHIFT DETAILS</h2>
      <div class="kcdh-detail-stats"></div>
      <div class="kcdh-detail-bottom"></div>
      <div class="kcdh-mission"></div>
      <div class="kcdh-legacy-map"></div>
    </div>`;
  gameContainer.insertBefore(root, hud);

  const grid = root.querySelector('.kcdh-grid');
  grid.append(
    createCell('SPEED', 'speed', sourceText('speed', '0')),
    createCell('FUEL', 'fuel', `${sourceText('fuel', '100')}%`),
    createCell('FARES', 'fares', '₦0'),
    createCell('PASSENGERS', 'pax', `${sourceText('pax', '0')}/${sourceText('capacity', '5')}`),
  );

  const details = root.querySelector('#kcdh-details');
  const statHost = root.querySelector('.kcdh-detail-stats');
  const bottomHost = root.querySelector('.kcdh-detail-bottom');
  const missionHost = root.querySelector('.kcdh-mission');
  const mapHost = root.querySelector('.kcdh-legacy-map');
  const mirrors = [];

  for (const id of ['score', 'distance', 'condition']) {
    const source = sourceById(id)?.closest('.stat');
    if (source && !mirrors.some(pair => pair.sourceRoot === source)) {
      const { clone, pairs } = cloneWithoutIds(source);
      clone.classList.add('kcdh-detail-stat');
      statHost.append(clone);
      mirrors.push(...pairs.map(pair => ({ ...pair, sourceRoot: source })));
    }
  }
  const bottom = hud.querySelector('.hud-bottom');
  if (bottom) {
    const { clone, pairs } = cloneWithoutIds(bottom);
    clone.classList.add('kcdh-detail-bottom-content');
    bottomHost.append(clone);
    mirrors.push(...pairs);
  }
  const mission = sourceById('mission-label');
  if (mission) {
    const { clone, pairs } = cloneWithoutIds(mission);
    missionHost.append(clone);
    mirrors.push(...pairs);
  }
  const passengerList = sourceById('passenger-list');
  if (passengerList) {
    const { clone, pairs } = cloneWithoutIds(passengerList);
    clone.classList.remove('hidden');
    clone.classList.add('kcdh-passenger-detail');
    bottomHost.append(clone);
    mirrors.push(...pairs);
  }
  const minimap = gameContainer.querySelector('.minimap');
  if (minimap) {
    const { clone, pairs } = cloneWithoutIds(minimap);
    clone.classList.add('kcdh-minimap-detail');
    mapHost.append(clone);
    mirrors.push(...pairs);
    minimap.classList.add('kano-compact-hud-source');
  }

  hud.classList.add('kano-compact-hud-source');
  const toggle = root.querySelector('#kcdh-toggle');
  toggle.addEventListener('click', () => {
    const opening = details.hidden;
    details.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
    toggle.textContent = opening ? 'LESS' : 'MORE';
  });

  // Avoid layout churn: mirror only when a source value actually changes.
  const last = new Map();
  const setValue = (key, value) => {
    const node = root.querySelector(`[data-kcdh-value="${key}"]`);
    const text = String(value);
    if (node && last.get(key) !== text) {
      node.textContent = text;
      last.set(key, text);
    }
  };
  let lastScreenState = null;
  let lastSync = Number.NEGATIVE_INFINITY;
  let activeGame = null;

  function sync(now = performance.now(), game = activeGame) {
    if (now - lastSync < UPDATE_INTERVAL_MS) return;
    lastSync = now;
    setValue('speed', `${sourceText('speed', '0')} km/h`);
    setValue('fuel', `${sourceText('fuel', '100')}%`);
    setValue('pax', compactPassengerText(sourceText('pax', '0'), sourceText('capacity', '5')));
    setValue('fares', formatFareAmount(game?.s?.fares || 0));

    for (const pair of mirrors) {
      if (!pair.source?.isConnected || !pair.mirror?.isConnected) continue;
      // Only copy leaf text to avoid deleting nested mirror markup.
      if (pair.source.childElementCount === 0) {
        const text = pair.source.textContent;
        if (pair.mirror.textContent !== text) pair.mirror.textContent = text;
      }
      if (pair.source.getAttribute('aria-label') !== pair.mirror.getAttribute('aria-label')) {
        const label = pair.source.getAttribute('aria-label');
        if (label === null) pair.mirror.removeAttribute('aria-label');
        else pair.mirror.setAttribute('aria-label', label);
      }
    }
    const stateVisible = currentScreenState(hud);
    if (stateVisible !== lastScreenState) {
      root.style.display = stateVisible ? '' : 'none';
      lastScreenState = stateVisible;
    }
  }

  const originalUpdate = Game.prototype.update;
  if (typeof originalUpdate === 'function' && !Game.prototype[INSTALL_KEY]) {
    Game.prototype.update = function updateWithCompactHud(...args) {
      activeGame = this;
      const result = originalUpdate.apply(this, args);
      sync(performance.now(), this);
      return result;
    };
    Object.defineProperty(Game.prototype, INSTALL_KEY, { value: true });
  }

  const watchedIds = ['start-screen', 'life-routine-screen', 'over-screen', 'menu-screen'];
  const screenObserver = new MutationObserver(() => sync(performance.now(), activeGame));
  for (const id of watchedIds) {
    const node = sourceById(id);
    if (node) screenObserver.observe(node, { attributes: true, attributeFilter: ['class'] });
  }
  screenObserver.observe(hud, { attributes: true, attributeFilter: ['style'] });

  window.kanoCompactDrivingHudAudit = () => ({
    installed: true,
    mobileOnly: true,
    sourceHudPreserved: Boolean(sourceById('hud')),
    primaryValues: ['speed', 'fuel', 'fares', 'pax'],
    detailsDrawer: Boolean(sourceById('kcdh-details')),
    detailsOpen: details ? !details.hidden : false,
    protectedFilesModifiedByThisModule: [],
    active: root.style.display !== 'none',
  });
  window[INSTALL_KEY] = { root, sync, dispose: () => {
    screenObserver.disconnect();
    root.remove();
    hud.classList.remove('kano-compact-hud-source');
    minimap?.classList.remove('kano-compact-hud-source');
  } };
  sync(0, activeGame);
  return true;
}

// The HTML imports KanoWorldPerformanceInstancingUpgrade.js before main.js.
// This retry is bounded and only covers DOM/module startup timing.
if (!install()) {
  let attempts = 0;
  const retry = () => {
    attempts += 1;
    if (install() || attempts >= 40) return;
    setTimeout(retry, 250);
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', retry, { once: true });
    else setTimeout(retry, 0);
  }
}
