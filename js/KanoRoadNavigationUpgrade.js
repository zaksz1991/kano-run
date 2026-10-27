/**
 * KANO LIFE — STEP 95: directional junction choices, U-turns, and reverse control.
 *
 * Adds an arcade navigation graph over the established route catalogue. Links
 * are playable connections between named destinations, not a surveyed street map.
 */
import * as THREE from 'three';
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { Renderer2D } from './renderer2d.js';
import { ROUTES } from './config.js';
import { save, persist } from './storage.js';

const PATCH_KEY = Symbol.for('kano.life.roadNavigation.step95');
const JUNCTION_INTERVAL_KM = 0.46;
const FIRST_JUNCTION_KM = 0.36;
const JUNCTION_PREVIEW_KM = 0.30;
const CHOICE_WINDOW_BEFORE_KM = 0.14;
const CHOICE_WINDOW_AFTER_KM = 0.045;
const NORMAL_TURN_SPEED_LIMIT = 35;
const UTURN_SPEED_LIMIT = 12;
const ROAD_PIVOT_Z = 2;
const TAU = Math.PI * 2;

const BRANCH_LINKS = Object.freeze({
  'Sabon Gari': ['Fagge', 'Kurmi Market'],
  'Kurmi Market': ['Kofar Wambai', 'Kofar Mata'],
  Hotoro: ['Tarauni', 'Naibawa'],
  Panshekara: ['Kumbotso', 'Sheka'],
  Kumbotso: ['Panshekara', 'Challawa'],
  'Beirut Road': ['Zoo Road', 'Bompai'],
  'Zoo Road': ['Beirut Road', 'Nassarawa'],
  'Zaria Road': ['Kofar Ruwa', 'Naibawa'],
  Sharada: ['Bompai', 'Challawa'],
  Bompai: ['Sharada', 'Nassarawa'],
  Nassarawa: ['Bompai', 'Tarauni'],
  'Gyadi-Gyadi': ['Hotoro', 'Tarauni'],
  Tarauni: ['Nassarawa', 'Hotoro'],
  Dala: ['Kofar Ruwa', 'Kofar Mata'],
  Gwale: ['Dala', 'Fagge'],
  Fagge: ['Sabon Gari', 'Kofar Ruwa'],
  'Kofar Ruwa': ['Fagge', 'Dala'],
  'Kofar Mata': ['Kurmi Market', 'Dala'],
  'Kofar Nassarawa': ["Emir's Palace", 'Kofar Dan Agundi'],
  Challawa: ['Kumbotso', 'Sharada'],
  Tokarawa: ['Dakata', 'Ungogo'],
  Ungogo: ['Tokarawa', 'BUK Gate'],
  'Wudil Road': ['Naibawa', 'Tarauni'],
  'Gwarzo Road': ['Gwarzo Junction', 'BUK Gate'],
  'Katsina Road': ['BUK Gate', 'Kofar Ruwa'],
  'BUK Gate': ['Gwarzo Road', 'Ungogo'],
  'Aminu Kano Teaching Hospital': ['Kofar Ruwa', 'Kumbotso'],
  'Murtala Muhammad Way': ['Kano City Centre', 'Kofar Dan Agundi'],
  'Ibrahim Taiwo Road': ['Kofar Wambai', 'Kano City Centre'],
  'France Road': ['Murtala Muhammad Way', 'Kano City Centre'],
  'New Road': ['Sabon Gari', 'Nassarawa'],
  'Farm Centre': ['Hotoro', 'Naibawa'],
  Naibawa: ['Hotoro', 'Wudil Road'],
  Kabuga: ['Rijiyar Zaki', 'BUK Gate'],
  Kawaji: ['Ungogo', 'Gwarzo Road'],
  Dakata: ['Tokarawa', 'Mariri'],
  'Kano City Centre': ['Kurmi Market', 'Murtala Muhammad Way'],
  'Goron Dutse': ['Dala', 'Kofar Ruwa'],
  Jakara: ['Kofar Mata', 'Kofar Wambai'],
  Yakasai: ['Fagge', 'Kofar Nassarawa'],
  'Unguwa Uku': ['Naibawa', 'Tarauni'],
  'Rimin Kebe': ['Tarauni', 'Nassarawa'],
  'Rano Road': ['Kumbotso', 'Panshekara'],
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapHeading(angle) {
  let wrapped = angle % TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  if (wrapped < -Math.PI) wrapped += TAU;
  return wrapped;
}

function routeByName(name) {
  return ROUTES.find((route) => route.name === name) || null;
}

function routeIndex(route) {
  const index = ROUTES.findIndex((item) => item.id === route?.id);
  return index >= 0 ? index : 0;
}

// Step 97: use the same signed world coordinate as scenery anchors. The
// simulation's official distance is intentionally forward-only, so it cannot
// locate the nearest junction after a reverse manoeuvre.
function navigationWorldDistance(game) {
  const worldDistance = Number(game?.kanoWorldDistanceKm);
  if (Number.isFinite(worldDistance)) return worldDistance;
  return Number(game?.s?.distance) || 0;
}

function forwardJunctionAtOrAhead(worldKm) {
  const index = Math.floor((worldKm - FIRST_JUNCTION_KM) / JUNCTION_INTERVAL_KM);
  if (index < 0) return FIRST_JUNCTION_KM;
  const candidate = FIRST_JUNCTION_KM + index * JUNCTION_INTERVAL_KM;
  // Retain the current junction throughout the same 45 m pass band used by
  // the forward choice window; this matters when switching out of reverse.
  return worldKm <= candidate + CHOICE_WINDOW_AFTER_KM + 1e-6
    ? candidate
    : candidate + JUNCTION_INTERVAL_KM;
}

function reverseJunctionAtOrBehind(worldKm) {
  const index = Math.floor((worldKm - FIRST_JUNCTION_KM + 1e-6) / JUNCTION_INTERVAL_KM);
  if (index < 0) return null;
  return FIRST_JUNCTION_KM + index * JUNCTION_INTERVAL_KM;
}

function syncJunctionTargetForTravel(game, nav) {
  const worldKm = navigationWorldDistance(game);
  const state = game?.s;
  const reverse = Boolean(state?.reverse) || Number(state?.signedSpeed) < -0.05;
  const direction = reverse ? 'reverse' : 'forward';

  if (nav.lastTravelDirection !== direction) {
    nav.lastTravelDirection = direction;
    nav.nextJunctionAt = reverse
      ? reverseJunctionAtOrBehind(worldKm)
      : forwardJunctionAtOrAhead(worldKm);
    nav.windowOpen = false;
    if (Number.isFinite(nav.nextJunctionAt)) {
      nav.junctionIndex = Math.max(0, Math.round((nav.nextJunctionAt - FIRST_JUNCTION_KM) / JUNCTION_INTERVAL_KM));
    }
  }

  if (reverse) {
    // Keep the junction being backed past as the target until the vehicle has
    // moved safely beyond its 45 m interaction band, then select the prior one.
    while (Number.isFinite(nav.nextJunctionAt)
      && worldKm < nav.nextJunctionAt - CHOICE_WINDOW_AFTER_KM) {
      nav.nextJunctionAt -= JUNCTION_INTERVAL_KM;
      if (nav.nextJunctionAt < FIRST_JUNCTION_KM - 1e-6) {
        nav.nextJunctionAt = null;
        break;
      }
      nav.junctionIndex = Math.max(0, nav.junctionIndex - 1);
    }
    nav.windowOpen = false;
    return { worldKm, reverse, direction };
  }

  if (!Number.isFinite(nav.nextJunctionAt)) nav.nextJunctionAt = forwardJunctionAtOrAhead(worldKm);
  // Re-arm a missed junction only after the approach window has been passed.
  while (Number.isFinite(nav.nextJunctionAt)
    && worldKm > nav.nextJunctionAt + CHOICE_WINDOW_AFTER_KM) {
    nav.nextJunctionAt += JUNCTION_INTERVAL_KM;
    nav.junctionIndex += 1;
    nav.missedJunctions += 1;
  }
  return { worldKm, reverse, direction };
}

function branchTarget(game, direction) {
  const index = routeIndex(game.route);
  const configured = BRANCH_LINKS[game.route?.name];
  const candidateName = configured?.[direction === 'left' ? 0 : 1];
  if (candidateName) {
    const candidate = routeByName(candidateName);
    if (candidate && candidate.id !== game.route?.id) return candidate;
  }
  const offset = direction === 'left' ? -1 : 1;
  return ROUTES[(index + offset + ROUTES.length) % ROUTES.length] || ROUTES[0];
}

function makeNavigationState(game) {
  const worldKm = navigationWorldDistance(game);
  return {
    heading: 0,
    turn: null,
    nextJunctionAt: forwardJunctionAtOrAhead(worldKm),
    junctionIndex: Math.max(0, Math.round((forwardJunctionAtOrAhead(worldKm) - FIRST_JUNCTION_KM) / JUNCTION_INTERVAL_KM)),
    turnsTaken: 0,
    uTurns: 0,
    missedJunctions: 0,
    routeHistory: [],
    options: null,
    windowOpen: false,
    lastHudUpdate: 0,
    lastRouteId: game.route?.id || ROUTES[0]?.id,
    lastTravelDirection: 'forward',
  };
}

function ensureReverseButton() {
  if (typeof document === 'undefined') return null;
  const controls = document.getElementById('drive-controls');
  if (!controls) return null;
  let button = document.getElementById('reverse-btn');
  if (!button) {
    button = document.createElement('button');
    button.id = 'reverse-btn';
    button.type = 'button';
    button.dataset.action = 'reverse';
    button.className = 'control reverse';
    button.textContent = 'REVERSE';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Engage reverse gear');
    button.title = 'Stop first, select reverse, then hold BRAKE to move backwards. Press R to toggle gear.';
    controls.append(button);
  } else {
    button.dataset.action ||= 'reverse';
    button.classList.add('control', 'reverse');
  }
  return button;
}

function addTurnButton(container, direction, icon, title, detail) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `kano-nav-choice kano-nav-${direction}`;
  button.dataset.kanoNavTurn = direction;
  button.setAttribute('aria-label', `${title}: ${detail}`);
  button.innerHTML = `<span class="kano-nav-arrow" aria-hidden="true">${icon}</span><span class="kano-nav-choice-title">${title}</span><span class="kano-nav-choice-route"></span>`;
  container.append(button);
  return button;
}

function ensureNavigationHUD() {
  if (typeof document === 'undefined') return null;
  const root = document.getElementById('game-container');
  if (!root) return null;
  let panel = document.getElementById('kano-road-navigation');
  if (panel) return panel;

  const style = document.createElement('style');
  style.id = 'kano-road-navigation-step95-style';
  style.textContent = `
    #kano-road-navigation{position:absolute;z-index:11;left:50%;top:clamp(160px,25vh,235px);transform:translateX(-50%);width:min(430px,calc(100% - 22px));padding:9px 10px 10px;border:1px solid #d6c590;border-top:4px solid #c63b37;border-radius:13px;background:linear-gradient(145deg,rgba(11,35,31,.96),rgba(9,23,32,.96));box-shadow:0 8px 28px rgba(0,0,0,.34);color:#f8f5e9;font:700 11px/1.25 system-ui,sans-serif;pointer-events:auto;backdrop-filter:blur(8px)}
    #kano-road-navigation[hidden]{display:none!important}#kano-road-navigation .kano-nav-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 7px}#kano-road-navigation .kano-nav-heading{font-size:10px;letter-spacing:.1em;font-weight:1000;color:#f5d985}#kano-road-navigation .kano-nav-distance{font-size:11px;font-weight:1000;white-space:nowrap}#kano-road-navigation .kano-nav-directions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}#kano-road-navigation .kano-nav-choice{min-width:0;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:5px 3px;border-radius:9px;border:1px solid rgba(235,229,209,.32);background:#203747;color:#f8f5e9;touch-action:manipulation}#kano-road-navigation .kano-nav-choice:disabled{opacity:.58;filter:saturate(.65)}#kano-road-navigation .kano-nav-choice:not(:disabled){border-color:#f5c542;box-shadow:inset 0 0 0 1px rgba(245,197,66,.22)}#kano-road-navigation .kano-nav-arrow{font-size:22px;line-height:1;color:#f5c542;font-weight:1000}#kano-road-navigation .kano-nav-choice-title{font-size:9px;line-height:1.1;font-weight:1000;letter-spacing:.02em}#kano-road-navigation .kano-nav-choice-route{max-width:100%;font-size:8px;line-height:1.1;text-align:center;color:#d1e5da;overflow-wrap:anywhere}#kano-road-navigation .kano-nav-note{margin:7px 1px 0;color:#d3e0dc;font-size:9px;line-height:1.25}#kano-road-navigation .kano-nav-note strong{color:#fff1c2}#reverse-btn{touch-action:manipulation}
    @media(max-width:390px){#kano-road-navigation{top:clamp(154px,24vh,206px);width:calc(100% - 14px);padding:7px}#kano-road-navigation .kano-nav-directions{gap:3px}#kano-road-navigation .kano-nav-choice{min-height:58px;padding:4px 2px}#kano-road-navigation .kano-nav-arrow{font-size:20px}#kano-road-navigation .kano-nav-choice-title{font-size:8px}#kano-road-navigation .kano-nav-choice-route{font-size:7px}#kano-road-navigation .kano-nav-note{font-size:8px}}@media(max-height:600px){#kano-road-navigation{top:132px;padding:5px 7px}#kano-road-navigation .kano-nav-choice{min-height:47px}#kano-road-navigation .kano-nav-note{margin-top:4px}}
  `;
  document.head.append(style);
  panel = document.createElement('aside');
  panel.id = 'kano-road-navigation';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Junction route choices');
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = '<div class="kano-nav-head"><span class="kano-nav-heading">KANO ROAD GUIDE</span><span class="kano-nav-distance" id="kano-nav-distance">NEXT JUNCTION</span></div><div class="kano-nav-directions" id="kano-nav-directions"></div><p class="kano-nav-note" id="kano-nav-note">Choose a direction when the junction is close. Slow down before turning.</p>';
  const choices = panel.querySelector('#kano-nav-directions');
  addTurnButton(choices, 'left', '↰', 'LEFT', 'take left road');
  addTurnButton(choices, 'straight', '↑', 'STRAIGHT', 'continue on this route');
  addTurnButton(choices, 'right', '↱', 'RIGHT', 'take right road');
  addTurnButton(choices, 'uturn', '⤺', 'U-TURN', 'turn back at the junction');
  root.append(panel);
  panel.querySelectorAll('[data-kano-nav-turn]').forEach((button) => {
    button.addEventListener('click', () => {
      const game = activeGame();
      if (game) selectTurn(game, button.dataset.kanoNavTurn);
    });
  });
  return panel;
}

function activeGame() {
  if (typeof window === 'undefined') return null;
  return window.__KANO_ACTIVE_GAME__ || window.__KANO_ACTIVE_UI__?.game || null;
}

function getOptions(game, nav) {
  nav.options = {
    left: branchTarget(game, 'left'),
    straight: game.route || ROUTES[0],
    right: branchTarget(game, 'right'),
  };
  return nav.options;
}

function chooseUTurnRoute(game, nav) {
  const priorId = nav.routeHistory.pop();
  if (priorId) {
    const prior = ROUTES.find((route) => route.id === priorId);
    if (prior) return prior;
  }
  return game.route || ROUTES[0];
}

function setCurrentRoute(game, route) {
  if (!route) return;
  game.route = route;
  save.routeId = route.id;
  persist();
  const select = document.getElementById('route-select');
  if (select) select.value = route.id;
  game.ui?.update?.(game.s, game.route, game.driver);
}

function getWindowState(game, nav) {
  const distance = navigationWorldDistance(game);
  const remaining = Number.isFinite(nav.nextJunctionAt) ? nav.nextJunctionAt - distance : Infinity;
  const reverse = Boolean(game.s?.reverse) || Number(game.s?.signedSpeed) < -0.05;
  return {
    remaining,
    windowOpen: false, // junction turning removed: the road is straight-only
  };
}

function selectTurn(game, direction) {
  const nav = game.kanoNavigationState;
  const state = game.s;
  if (!nav || !state || game.state !== 'PLAY' || state.event || state.runEnded) return false;
  if (!nav.windowOpen || nav.turn) {
    game.ui?.toast?.('Follow the road guide. The turn buttons activate near the junction.');
    return false;
  }
  if (state.reverse) {
    game.ui?.toast?.('Select forward gear before entering a junction.');
    return false;
  }
  // Instead of refusing, the driver brakes hard for the turn (what a real keke driver does).
  const turnLimit = direction === 'uturn' ? UTURN_SPEED_LIMIT : (['left', 'right'].includes(direction) ? NORMAL_TURN_SPEED_LIMIT : Infinity);
  if (state.speed > turnLimit) {
    state.speed = turnLimit;
    if (Number.isFinite(state.signedSpeed)) state.signedSpeed = Math.sign(state.signedSpeed || 1) * turnLimit;
    game.ui?.toast?.(direction === 'uturn' ? 'Brakes squealing… slowing for the U-turn!' : 'You brake hard for the turn!');
  }
  if (!['left', 'straight', 'right', 'uturn'].includes(direction)) return false;

  const oldRoute = game.route || ROUTES[0];
  const options = getOptions(game, nav);
  let targetRoute = oldRoute;
  let delta = 0;
  let duration = 0;
  let visualDirection = 0;

  if (direction === 'left') {
    targetRoute = options.left;
    delta = Math.PI / 2;
    duration = 1.35;
    visualDirection = 1;
  } else if (direction === 'right') {
    targetRoute = options.right;
    delta = -Math.PI / 2;
    duration = 1.35;
    visualDirection = -1;
  } else if (direction === 'uturn') {
    targetRoute = chooseUTurnRoute(game, nav);
    delta = Math.PI;
    duration = 2.15;
    visualDirection = 2;
    nav.uTurns += 1;
  }

  if (targetRoute && targetRoute.id !== oldRoute.id) {
    nav.routeHistory.push(oldRoute.id);
    if (nav.routeHistory.length > 20) nav.routeHistory.shift();
    setCurrentRoute(game, targetRoute);
  }

  if (direction === 'straight') {
    nav.turnsTaken += 1;
    nav.junctionIndex += 1;
    nav.nextJunctionAt += JUNCTION_INTERVAL_KM;
    nav.lastTravelDirection = 'forward';
    state.kanoLastNavigation = 'straight';
    state.kanoRoadTurn = null;
    nav.windowOpen = false;
    game.ui?.toast?.(`Straight ahead · ${oldRoute.name}`);
    updateNavigationHUD(game, true);
    return true;
  }

  const from = nav.heading;
  nav.turn = {
    direction,
    visualDirection,
    from,
    to: wrapHeading(from + delta),
    elapsed: 0,
    duration,
    routeName: targetRoute?.name || oldRoute.name,
  };
  nav.nextJunctionAt += JUNCTION_INTERVAL_KM;
  nav.junctionIndex += 1;
  nav.turnsTaken += 1;
  nav.windowOpen = false;
  state.kanoRoadTurn = { direction: visualDirection, progress: 0 };
  state.kanoRoadTurnDirection = visualDirection;
  state.kanoRoadHeading = nav.heading;
  state.kanoLastNavigation = direction;
  updateNavigationHUD(game, true);
  game.ui?.toast?.(`${direction === 'uturn' ? 'U-TURN' : `${direction.toUpperCase()} TURN`} · ${targetRoute?.name || oldRoute.name}`);
  return true;
}

function updateNavigation(game, dt) {
  if (!game?.s) return;
  if (!game.kanoNavigationState) game.kanoNavigationState = makeNavigationState(game);
  const nav = game.kanoNavigationState;
  const state = game.s;

  if (nav.turn) {
    nav.turn.elapsed = Math.min(nav.turn.duration, nav.turn.elapsed + dt);
    const progress = clamp(nav.turn.elapsed / nav.turn.duration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const difference = wrapHeading(nav.turn.to - nav.turn.from);
    nav.heading = wrapHeading(nav.turn.from + difference * eased);
    state.kanoRoadHeading = nav.heading;
    state.kanoRoadTurn = { direction: nav.turn.visualDirection, progress };
    state.kanoRoadHeadingBase = nav.turn.from;
    state.kanoJunctionDepth = null;
    if (progress >= 1) {
      state.kanoRoadHeadingBase = nav.turn.to;
      const label = nav.turn.direction === 'uturn' ? 'U-turn complete' : `${nav.turn.direction.toUpperCase()} turn complete`;
      nav.heading = wrapHeading(nav.turn.to);
      state.kanoRoadHeading = nav.heading;
      state.kanoRoadTurn = null;
      nav.turn = null;
      game.ui?.toast?.(`${label} · ${game.route?.name || 'Kano road'}`);
    }
  } else {
    state.kanoRoadHeading = nav.heading;
    state.kanoRoadHeadingBase = nav.heading;
    state.kanoRoadTurn = null;
    const travel = syncJunctionTargetForTravel(game, nav);
    // Traffic depth (world z / 88) of the junction cross road, so AI cars can turn off at it.
    {
      const ahead = nav.nextJunctionAt - navigationWorldDistance(game);
      const behind = navigationWorldDistance(game) - (nav.nextJunctionAt - JUNCTION_INTERVAL_KM);
      const km = (behind >= -0.001 && behind < 0.06) ? -behind : ahead;
      state.kanoJunctionDepth = Number.isFinite(km) ? (km * 1008 - ROAD_PIVOT_Z) / 88 : null;
    }
    if (travel.reverse) {
      nav.windowOpen = false;
    } else {
      const status = getWindowState(game, nav);
      nav.windowOpen = status.windowOpen;
      if (status.windowOpen) getOptions(game, nav);
    }
  }
  updateNavigationHUD(game, false);
}

function setButtonRoute(button, routeName) {
  const label = button?.querySelector('.kano-nav-choice-route');
  if (label && label.textContent !== routeName) label.textContent = routeName;
}

function updateNavigationHUD(game, force) {
  const panel = ensureNavigationHUD();
  if (!panel || !game) return;
  const nav = game.kanoNavigationState;
  const state = game.s;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && nav && now - nav.lastHudUpdate < 120) return;
  if (nav) nav.lastHudUpdate = now;

  const onRoad = game.state === 'PLAY' && Boolean(state) && !state.event && !state.runEnded && !state.reverse;
  const remaining = nav && Number.isFinite(nav.nextJunctionAt)
    ? nav.nextJunctionAt - navigationWorldDistance(game)
    : Infinity;
  const visible = false; // turning removed
  panel.hidden = !visible;
  if (!visible) return;

  const distanceLabel = panel.querySelector('#kano-nav-distance');
  const note = panel.querySelector('#kano-nav-note');
  if (nav.turn) {
    distanceLabel.textContent = nav.turn.direction === 'uturn' ? 'TURNING BACK' : `TURNING ${nav.turn.direction.toUpperCase()}`;
    note.textContent = `${nav.turn.routeName} · complete the turn and follow the road.`;
    panel.querySelectorAll('[data-kano-nav-turn]').forEach((button) => { button.disabled = true; });
    return;
  }

  const metres = Math.max(0, Math.round(remaining * 1000 / 10) * 10);
  distanceLabel.textContent = remaining <= 0 ? 'AT JUNCTION' : metres >= 1000 ? `IN ${(metres / 1000).toFixed(1)} km` : `IN ${metres} m`;
  const options = getOptions(game, nav);
  setButtonRoute(panel.querySelector('[data-kano-nav-turn="left"]'), options.left?.name || 'Left road');
  setButtonRoute(panel.querySelector('[data-kano-nav-turn="straight"]'), options.straight?.name || 'Current route');
  setButtonRoute(panel.querySelector('[data-kano-nav-turn="right"]'), options.right?.name || 'Right road');
  setButtonRoute(panel.querySelector('[data-kano-nav-turn="uturn"]'), nav.routeHistory.length ? 'Previous road' : (game.route?.name || 'Return'));

  const status = getWindowState(game, nav);
  nav.windowOpen = status.windowOpen;
  panel.querySelectorAll('[data-kano-nav-turn]').forEach((button) => {
    button.disabled = !status.windowOpen;
    button.setAttribute('aria-disabled', String(button.disabled));
  });
  if (status.windowOpen) {
    note.textContent = state.speed > NORMAL_TURN_SPEED_LIMIT
      ? 'Brake to 35 km/h or below before a left/right turn. U-turns require 12 km/h or less.'
      : state.reverse
        ? 'Select forward gear before choosing a junction direction.'
        : 'Choose a visible arrow. Brake first; U-turns require 12 km/h or less. Q / T / E / U are keyboard shortcuts.';
  } else {
    note.textContent = 'Directions activate near the junction. At the junction, keep steering ← / → past the edge lane to turn; R selects reverse gear.';
  }
}

function rotatePoint(x, z, angle) {
  const dx = Number(x) || 0;
  const dz = (Number(z) || 0) - ROAD_PIVOT_Z;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: dx * cosine + dz * sine, z: ROAD_PIVOT_Z - dx * sine + dz * cosine };
}

// ---- Visible junction: a real cross road that swings into view during a turn ----
let activeNavGame = null;
const UNITS_PER_KM = 1008; // 0.28 world units per (km/h * second)
function ensureCrossroad(renderer) {
  if (renderer.__kanoCrossroad) return renderer.__kanoCrossroad;
  const group = new THREE.Group();
  group.name = 'KANO_JUNCTION_CROSSROAD';
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x34363a, roughness: 0.95 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(260, 15), asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.016;
  group.add(road);
  const paint = new THREE.MeshBasicMaterial({ color: 0xf3efe0 });
  const dash = new THREE.PlaneGeometry(2.4, 0.22);
  for (let x = -120; x <= 120; x += 6) {
    if (Math.abs(x) < 9) continue;
    const mark = new THREE.Mesh(dash, paint);
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(x, 0.02, 0);
    group.add(mark);
  }
  const kerb = new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 0.9 });
  for (const z of [-7.8, 7.8]) {
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(115, 0.16, 0.45), kerb);
      strip.position.set(side * (9 + 57.5), 0.08, z);
      group.add(strip);
    }
  }
  const stop = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.5), paint);
  stop.rotation.x = -Math.PI / 2;
  stop.position.set(0, 0.021, 8.4);
  group.add(stop);
  group.visible = false;
  renderer.world.add(group);
  renderer.__kanoCrossroad = group;
  return group;
}

function updateCrossroad(renderer, state) {
  if (!renderer?.world) return;
  const game = activeNavGame;
  const group = ensureCrossroad(renderer);
  const nav = game?.kanoNavigationState;
  if (!nav || !state) { group.visible = false; return; }
  const remainingKm = Number.isFinite(nav.nextJunctionAt) ? nav.nextJunctionAt - navigationWorldDistance(game) : Infinity;
  const turning = Boolean(nav.turn);
  let z;
  if (turning) {
    const p = clamp(Number(state.kanoRoadTurn?.progress) || 0, 0, 1);
    // The junction slides under the keke during the first part of the turn.
    const startZ = nav.__crossStartZ ?? ROAD_PIVOT_Z;
    z = startZ + (ROAD_PIVOT_Z - startZ) * clamp(p / 0.25, 0, 1);
  } else {
    // Junction we are about to take: nextJunctionAt has been advanced already after a turn.
    const prevKm = nav.nextJunctionAt - JUNCTION_INTERVAL_KM;
    const ahead = remainingKm;
    const behind = navigationWorldDistance(game) - prevKm;
    const km = (behind >= -0.001 && behind < 0.06) ? -behind : ahead;
    z = ROAD_PIVOT_Z - km * UNITS_PER_KM;
    nav.__crossStartZ = z;
  }
  group.visible = z > -330 && z < 40;
  group.position.z = z;
}

let turnFadeEl = null;
function updateTurnFade(state) {
  if (typeof document === 'undefined') return;
  const p = state?.kanoRoadTurn?.progress;
  if (!turnFadeEl) {
    turnFadeEl = document.createElement('div');
    turnFadeEl.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:40;transition:opacity .12s linear';
    document.body.appendChild(turnFadeEl);
  }
  turnFadeEl.style.opacity = Number.isFinite(p) && p > 0.86 ? String(Math.min(0.85, (p - 0.86) * 6)) : '0';
}

function installRenderer3DRoadHeading() {
  if (Renderer3D.prototype[PATCH_KEY]) return;
  const originalDraw = Renderer3D.prototype.draw;
  if (typeof originalDraw !== 'function') return;
  Renderer3D.prototype.draw = function drawWithKanoRoadHeading(state, deltaSeconds, ...args) {
    const isRoad = this.lifeScene === 'road' && this.world && this.player && this.camera && this.renderer;
    const previousHeading = Number(this.__kanoRoadNavigationLastHeading) || 0;
    const previousRoadDraw = Boolean(this.__kanoRoadNavigationLastRoadDraw);
    if (previousRoadDraw && previousHeading) {
      const playerLocal = rotatePoint(this.player.position.x, this.player.position.z, -previousHeading);
      this.player.position.x = playerLocal.x;
      this.player.position.z = playerLocal.z;
      const cameraLocal = rotatePoint(this.camera.position.x, this.camera.position.z, -previousHeading);
      this.camera.position.x = cameraLocal.x;
      this.camera.position.z = cameraLocal.z;
    }
    if (!isRoad) {
      this.__kanoRoadNavigationLastRoadDraw = false;
      return originalDraw.call(this, state, deltaSeconds, ...args);
    }

    const animatedHeading = Number.isFinite(state?.kanoRoadHeading) ? state.kanoRoadHeading : 0;
    // `heading` is the settled heading the camera/player are cancelled against.
    // While turning, the world swings against it so the junction visibly rotates
    // past the keke instead of the camera cancelling the whole manoeuvre.
    const heading = Number.isFinite(state?.kanoRoadHeadingBase) ? state.kanoRoadHeadingBase : animatedHeading;
    const swing = state?.kanoRoadTurn ? wrapHeading(animatedHeading - heading) : 0;
    const worldHeading = heading - swing;
    this.world.rotation.y = worldHeading;
    this.world.position.set(-Math.sin(worldHeading) * ROAD_PIVOT_Z, 0, ROAD_PIVOT_Z * (1 - Math.cos(worldHeading)));
    this.driveFacingY = heading;
    updateCrossroad(this, state);
    updateTurnFade(state);

    const renderer = this.renderer;
    const camera = this.camera;
    const originalRender = renderer.render;
    const originalLookAt = camera.lookAt;
    let localTarget = null;
    camera.lookAt = function captureKanoTurnTarget(...targetArgs) {
      if (targetArgs.length === 1 && targetArgs[0] && typeof targetArgs[0] === 'object') {
        localTarget = [targetArgs[0].x, targetArgs[0].y, targetArgs[0].z];
      } else {
        localTarget = targetArgs.slice(0, 3);
      }
      return originalLookAt.apply(this, targetArgs);
    };
    const player = this.player;
    renderer.render = function renderAlongKanoHeading(scene, activeCamera) {
      const cameraPoint = rotatePoint(activeCamera.position.x, activeCamera.position.z, heading);
      activeCamera.position.set(cameraPoint.x, activeCamera.position.y, cameraPoint.z);
      if (localTarget && localTarget.length >= 3) {
        const targetPoint = rotatePoint(localTarget[0], localTarget[2], heading);
        originalLookAt.call(activeCamera, targetPoint.x, localTarget[1], targetPoint.z);
      }
      const playerPoint = rotatePoint(player.position.x, player.position.z, heading);
      player.position.set(playerPoint.x, player.position.y, playerPoint.z);
      const yawBefore = player.rotation.y;
      const turnInfo = state?.kanoRoadTurn;
      if (turnInfo) player.rotation.y += turnInfo.direction * Math.sin(turnInfo.progress * Math.PI) * 0.42;
      try { return originalRender.call(this, scene, activeCamera); }
      finally { player.rotation.y = yawBefore; }
    };
    try {
      return originalDraw.call(this, state, deltaSeconds, ...args);
    } finally {
      renderer.render = originalRender;
      camera.lookAt = originalLookAt;
      this.__kanoRoadNavigationLastHeading = heading;
      this.__kanoRoadNavigationLastRoadDraw = true;
    }
  };
  Object.defineProperty(Renderer3D.prototype, PATCH_KEY, { value: true, configurable: false });
}

function installRenderer2DTurnCue() {
  if (Renderer2D.prototype[PATCH_KEY]) return;
  const originalDraw = Renderer2D.prototype.draw;
  if (typeof originalDraw !== 'function') return;
  Renderer2D.prototype.draw = function drawWithKanoTurnCue(state, deltaSeconds, ...args) {
    const canvas = this.canvas;
    const turn = state?.kanoRoadTurn;
    if (canvas?.style) {
      if (turn && this.lifeScene === 'road') {
        const progress = clamp(Number(turn.progress) || 0, 0, 1);
        const wave = Math.sin(progress * Math.PI);
        const direction = Number(turn.direction) === 2 ? 1 : Math.sign(Number(turn.direction) || 0);
        canvas.style.transformOrigin = '50% 78%';
        canvas.style.transform = `translateX(${(direction * 8 * wave).toFixed(2)}px) rotate(${(direction * 1.1 * wave).toFixed(2)}deg) scale(1.02)`;
      } else if (canvas.style.transform) {
        canvas.style.transform = '';
        canvas.style.transformOrigin = '';
      }
    }
    return originalDraw.call(this, state, deltaSeconds, ...args);
  };
  Object.defineProperty(Renderer2D.prototype, PATCH_KEY, { value: true, configurable: false });
}

function installGameHooks() {
  if (Game.prototype[PATCH_KEY]) return;
  const originalStart = Game.prototype.start;
  const originalTick = Game.prototype.tick;
  if (typeof originalStart !== 'function' || typeof originalTick !== 'function') return;
  Game.prototype.start = function startWithKanoNavigation(...args) {
    const result = originalStart.apply(this, args);
    this.kanoNavigationState = makeNavigationState(this);
    this.s.kanoRoadHeading = 0;
    this.s.kanoRoadTurn = null;
    this.s.kanoRouteChoice = 'straight';
    this.ui?.updateReverseControl?.(this.s);
    updateNavigationHUD(this, true);
    return result;
  };
  Game.prototype.tick = function tickWithKanoNavigation(deltaSeconds, ...args) {
    activeNavGame = this;
    const result = originalTick.call(this, deltaSeconds, ...args);
    if (this.state === 'PLAY' && this.s && !this.s.event && !this.s.runEnded) {
      updateNavigation(this, clamp(Number(deltaSeconds) || 0, 0, 0.045));
      this.ui?.updateReverseControl?.(this.s);
    } else {
      updateNavigationHUD(this, false);
    }
    return result;
  };
  // Steering past the edge lane near a junction turns the keke into that road.
  const originalLane = Game.prototype.lane;
  Game.prototype.lane = function laneWithKanoEdgeTurn(direction, ...args) {
    const nav = this.kanoNavigationState;
    const sign = Math.sign(direction);
    const atEdge = this.s && ((sign < 0 && this.s.targetLane <= -1) || (sign > 0 && this.s.targetLane >= 1));
    if (atEdge && nav?.windowOpen && !nav.turn && this.state === 'PLAY') {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (nav.edgeSince && now - nav.edgeSince > 350 && nav.edgeSign === sign) {
        nav.edgeSince = 0;
        if (selectTurn(this, sign < 0 ? 'left' : 'right')) return undefined;
      }
      if (!nav.edgeSince || nav.edgeSign !== sign) { nav.edgeSince = now; nav.edgeSign = sign; }
    } else if (nav) {
      nav.edgeSince = 0;
    }
    return originalLane.call(this, direction, ...args);
  };
  const originalSetReverse = Game.prototype.setReverse;
  if (typeof originalSetReverse === 'function') {
    Game.prototype.setReverse = function setReverseWithKanoNavigation(value, ...args) {
      const result = originalSetReverse.call(this, value, ...args);
      this.ui?.updateReverseControl?.(this.s);
      updateNavigationHUD(this, true);
      return result;
    };
  }
  Object.defineProperty(Game.prototype, PATCH_KEY, { value: true, configurable: false });
}

function installKeyboardTurnShortcuts() {
  if (typeof window === 'undefined' || window.__KANO_STEP95_KEYBOARD_TURNS__) return;
  window.__KANO_STEP95_KEYBOARD_TURNS__ = true;
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
    const map = { q: 'left', t: 'straight', e: 'right', u: 'uturn' };
    const direction = map[String(event.key || '').toLowerCase()];
    if (!direction) return;
    const game = activeGame();
    if (!game || game.state !== 'PLAY' || !game.kanoNavigationState?.windowOpen) return;
    event.preventDefault();
    selectTurn(game, direction);
  });
}

function publishAudit() {
  if (typeof window === 'undefined') return;
  window.kanoRoadNavigationAudit = () => {
    const game = activeGame();
    const nav = game?.kanoNavigationState;
    const state = game?.s;
    const worldKm = navigationWorldDistance(game);
    const remaining = nav && Number.isFinite(nav.nextJunctionAt)
      ? Math.round((nav.nextJunctionAt - worldKm) * 1000)
      : null;
    return {
      version: 1,
      installed: Boolean(Game.prototype[PATCH_KEY] && Renderer3D.prototype[PATCH_KEY] && Renderer2D.prototype[PATCH_KEY]),
      activeGame: Boolean(game),
      gameState: game?.state || 'NOT_CREATED',
      currentRoute: game?.route?.name || null,
      nextJunctionInMetres: remaining,
      signedWorldDistanceKm: Number(worldKm.toFixed(5)),
      junctionTargetKm: Number.isFinite(nav?.nextJunctionAt) ? Number(nav.nextJunctionAt.toFixed(5)) : null,
      travelDirection: nav?.lastTravelDirection || (state?.reverse ? 'reverse' : 'forward'),
      signedCoordinateDrivesJunctions: true,
      choiceWindowOpen: Boolean(nav?.windowOpen),
      turnsTaken: nav?.turnsTaken || 0,
      uTurns: nav?.uTurns || 0,
      missedJunctions: nav?.missedJunctions || 0,
      reverseControlPresent: Boolean(document.getElementById('reverse-btn')),
      reverseEngaged: Boolean(state?.reverse),
      roadHeadingRadians: Number.isFinite(state?.kanoRoadHeading) ? Number(state.kanoRoadHeading.toFixed(3)) : 0,
      currentTurn: nav?.turn?.direction || null,
      routeGraph: 'Arcade links among named destinations; not a surveyed street-level map',
    };
  };
}

ensureReverseButton();
ensureNavigationHUD();
installGameHooks();
installRenderer3DRoadHeading();
installRenderer2DTurnCue();
installKeyboardTurnShortcuts();
publishAudit();
if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { ensureReverseButton(); ensureNavigationHUD(); }, { once: true });
}
console.info('[Kano Life] Step 95 navigation choices, world-heading turns, U-turns and visible reverse gear registered.');
