import { Game } from './game.js';

/**
 * KANO LIFE — Step 97: road-path continuity and reverse-aware route progress.
 *
 * This module is deliberately additive. It keeps a signed local map projection
 * across the existing arcade heading changes, captures route-graph transitions,
 * and exposes a privacy-local audit. It does not claim tyre-level vehicle
 * physics or a surveyed real-world street network.
 */
const PATCH = Symbol.for('kano.life.roadPathContinuity.step97');
const UNITS_PER_KM = 1008;
const FIRST_JUNCTION_KM = 0.36;
const JUNCTION_INTERVAL_KM = 0.46;
const CHOICE_WINDOW_AFTER_KM = 0.045;
const MAX_SEGMENTS = 64;

const AUDIT = {
  version: 1,
  installed: false,
  coordinateFrame: 'local projected map coordinates in world units; signed travel distance in kilometres',
  unitsPerKm: UNITS_PER_KM,
  routeSegmentsRecorded: 0,
  completedTurns: 0,
  reverseSamples: 0,
  discontinuities: 0,
  limitations: 'Arcade heading integration and route breadcrumbs; not tyre-level physics or a surveyed Kano street map.',
};

function finiteOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function worldKm(game) {
  const signed = Number(game?.kanoWorldDistanceKm);
  if (Number.isFinite(signed)) return signed;
  return finiteOr(game?.s?.distance, 0);
}

function headingOf(game) {
  const heading = Number(game?.s?.kanoRoadHeading);
  return Number.isFinite(heading) ? heading : finiteOr(game?.kanoNavigationState?.heading, 0);
}

function forwardJunctionAtStart(worldDistance) {
  const index = Math.floor((worldDistance - FIRST_JUNCTION_KM) / JUNCTION_INTERVAL_KM);
  if (index < 0) return FIRST_JUNCTION_KM;
  const candidate = FIRST_JUNCTION_KM + index * JUNCTION_INTERVAL_KM;
  return worldDistance <= candidate + CHOICE_WINDOW_AFTER_KM + 1e-6
    ? candidate
    : candidate + JUNCTION_INTERVAL_KM;
}

function wrapAngle(angle) {
  let result = angle % (Math.PI * 2);
  if (result > Math.PI) result -= Math.PI * 2;
  if (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function compassHeading(angle) {
  const degrees = ((-angle * 180 / Math.PI) % 360 + 360) % 360;
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(degrees / 45) % names.length];
}

function createPathState(game) {
  const initialHeading = headingOf(game);
  const nav = game?.kanoNavigationState;
  const routeName = game?.route?.name || 'Kano road';
  return {
    xUnits: 0,
    zUnits: 0,
    totalTravelKm: 0,
    reverseTravelKm: 0,
    lastWorldKm: worldKm(game),
    lastHeading: initialHeading,
    lastTurnsTaken: finiteOr(nav?.turnsTaken, 0),
    currentRouteName: routeName,
    lastRouteName: routeName,
    activeSegment: null,
    segments: [],
    startedAt: new Date().toISOString(),
    lastTravelDirection: game?.s?.reverse || finiteOr(game?.s?.signedSpeed) < -0.05 ? 'reverse' : 'forward',
  };
}

function appendSegment(path, segment) {
  path.segments.push(segment);
  if (path.segments.length > MAX_SEGMENTS) path.segments.splice(0, path.segments.length - MAX_SEGMENTS);
  AUDIT.routeSegmentsRecorded += 1;
}

function beginRouteSegment(game, path, before) {
  const nav = game?.kanoNavigationState;
  const count = finiteOr(nav?.turnsTaken, 0);
  if (!nav || count <= path.lastTurnsTaken) return;

  const direction = nav.turn?.direction || game?.s?.kanoLastNavigation || 'straight';
  const segment = {
    index: count,
    direction,
    fromRoute: path.lastRouteName || 'Kano road',
    toRoute: game?.route?.name || path.lastRouteName || 'Kano road',
    startWorldKm: before.worldKm,
    startXUnits: before.xUnits,
    startZUnits: before.zUnits,
    headingFrom: before.heading,
    headingTo: Number.isFinite(nav.turn?.to) ? nav.turn.to : headingOf(game),
    status: nav.turn ? 'turning' : 'completed',
  };

  appendSegment(path, segment);
  if (nav.turn) path.activeSegment = segment;
  else AUDIT.completedTurns += 1;
  path.lastTurnsTaken = count;
}

function finishRouteSegmentIfReady(game, path) {
  const nav = game?.kanoNavigationState;
  if (!path.activeSegment || nav?.turn) return;
  path.activeSegment.status = 'completed';
  path.activeSegment.endWorldKm = worldKm(game);
  path.activeSegment.endXUnits = Number(path.xUnits.toFixed(3));
  path.activeSegment.endZUnits = Number(path.zUnits.toFixed(3));
  path.activeSegment.headingTo = headingOf(game);
  path.activeSegment = null;
  AUDIT.completedTurns += 1;
}

function integrateFrame(game, path, previousWorldKm, previousHeading) {
  const currentWorldKm = worldKm(game);
  const currentHeading = headingOf(game);
  const deltaKm = currentWorldKm - previousWorldKm;
  if (!Number.isFinite(deltaKm) || Math.abs(deltaKm) > 0.025) {
    // Large one-frame leaps usually indicate a reset, run transition, or an
    // external test mutation. Do not teleport the recorded map projection.
    if (Number.isFinite(deltaKm) && Math.abs(deltaKm) > 0.025) AUDIT.discontinuities += 1;
    path.lastWorldKm = currentWorldKm;
    path.lastHeading = currentHeading;
    return;
  }

  const midpointHeading = previousHeading + wrapAngle(currentHeading - previousHeading) * 0.5;
  const distanceUnits = deltaKm * UNITS_PER_KM;
  // With heading zero the road extends down -Z. Positive navigation heading
  // turns the travel vector left in the same convention as Step 95's renderer.
  path.xUnits -= Math.sin(midpointHeading) * distanceUnits;
  path.zUnits -= Math.cos(midpointHeading) * distanceUnits;
  path.totalTravelKm += Math.abs(deltaKm);
  if (deltaKm < -1e-8) {
    path.reverseTravelKm += -deltaKm;
    AUDIT.reverseSamples += 1;
  }
  path.lastWorldKm = currentWorldKm;
  path.lastHeading = currentHeading;
  path.currentRouteName = game?.route?.name || path.currentRouteName;
}

function updateRouteStatus(game) {
  if (typeof document === 'undefined') return;
  const panel = document.getElementById('kano-road-navigation');
  if (!panel) return;
  let status = panel.querySelector('#kano-road-path-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'kano-road-path-status';
    status.style.cssText = 'margin:0 0 7px;padding:5px 7px;border-left:3px solid #c63b37;border-radius:4px;background:rgba(245,197,66,.10);color:#f7f2e7;font:800 9px/1.3 system-ui,sans-serif;letter-spacing:.035em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const choices = panel.querySelector('#kano-nav-directions');
    if (choices) panel.insertBefore(status, choices);
    else panel.append(status);
  }
  const routeName = game?.route?.name || 'Kano road';
  const direction = game?.s?.reverse || finiteOr(game?.s?.signedSpeed) < -0.05 ? 'REVERSE' : 'FORWARD';
  status.textContent = `CURRENT ROAD · ${routeName.toUpperCase()} · HEADING ${compassHeading(headingOf(game))} · ${direction}`;
}

function initialisePath(game) {
  game.kanoRoadPath = createPathState(game);
  game.kanoRoadPathContinuity = game.kanoRoadPath;
  updateRouteStatus(game);
}

function installGamePathHooks() {
  if (Game.prototype[PATCH]) return;
  const originalStart = Game.prototype.start;
  const originalTick = Game.prototype.tick;
  if (typeof originalStart !== 'function' || typeof originalTick !== 'function') return;

  Game.prototype.start = function startWithPathContinuity(...args) {
    const result = originalStart.apply(this, args);
    // The earlier Step 96 wrapper assigns the new run's world distance after
    // the Step 95 navigation start hook. Rebase the nav target here so a second
    // run cannot inherit the previous run's junction position.
    const worldDistance = worldKm(this);
    const nav = this.kanoNavigationState;
    if (nav) {
      nav.nextJunctionAt = forwardJunctionAtStart(worldDistance);
      nav.junctionIndex = Math.max(0, Math.round((nav.nextJunctionAt - FIRST_JUNCTION_KM) / JUNCTION_INTERVAL_KM));
      nav.lastTravelDirection = 'forward';
      nav.windowOpen = false;
      nav.turn = null;
      nav.routeHistory = [];
      nav.turnsTaken = 0;
      nav.uTurns = 0;
      nav.missedJunctions = 0;
    }
    initialisePath(this);
    return result;
  };

  Game.prototype.tick = function tickWithPathContinuity(deltaSeconds, ...args) {
    // The earlier hooks perform simulation, navigation-heading interpolation,
    // and signed world-distance advancement. This wrapper records their result.
    const path = this.kanoRoadPath;
    const previousWorldKm = path ? path.lastWorldKm : worldKm(this);
    const previousHeading = path ? path.lastHeading : headingOf(this);
    const before = path ? {
      worldKm: previousWorldKm,
      xUnits: path.xUnits,
      zUnits: path.zUnits,
      heading: previousHeading,
    } : null;

    const result = originalTick.call(this, deltaSeconds, ...args);
    if (!this.kanoRoadPath && this.state === 'PLAY' && this.s) initialisePath(this);
    const current = this.kanoRoadPath;
    if (!current || this.state !== 'PLAY' || !this.s || this.s.event || this.s.runEnded) return result;

    integrateFrame(this, current, previousWorldKm, previousHeading);
    if (before) beginRouteSegment(this, current, before);
    finishRouteSegmentIfReady(this, current);

    const nav = this.kanoNavigationState;
    current.lastTurnsTaken = Math.max(current.lastTurnsTaken, finiteOr(nav?.turnsTaken, 0));
    current.lastRouteName = this.route?.name || current.lastRouteName;
    current.lastTravelDirection = this.s.reverse || finiteOr(this.s.signedSpeed) < -0.05 ? 'reverse' : 'forward';
    updateRouteStatus(this);
    return result;
  };

  Object.defineProperty(Game.prototype, PATCH, { value: true, configurable: false });
  AUDIT.installed = true;
}

function publishAudit() {
  if (typeof window === 'undefined') return;
  window.kanoRoadPathContinuityAudit = () => {
    const game = window.__KANO_ACTIVE_GAME__ || window.__KANO_ACTIVE_UI__?.game || null;
    const path = game?.kanoRoadPath;
    const nav = game?.kanoNavigationState;
    if (!path) return {
      ...AUDIT,
      activeGame: Boolean(game),
      gameState: game?.state || 'NOT_CREATED',
      pathInitialised: false,
    };
    return {
      ...AUDIT,
      activeGame: Boolean(game),
      gameState: game?.state || 'NOT_CREATED',
      pathInitialised: true,
      coordinateUnits: 'world units',
      xUnits: Number(path.xUnits.toFixed(3)),
      zUnits: Number(path.zUnits.toFixed(3)),
      distanceFromOriginMetres: Number((Math.hypot(path.xUnits, path.zUnits) * 1000 / UNITS_PER_KM).toFixed(2)),
      signedWorldDistanceKm: Number(worldKm(game).toFixed(5)),
      totalTravelKm: Number(path.totalTravelKm.toFixed(5)),
      reverseTravelKm: Number(path.reverseTravelKm.toFixed(5)),
      routeName: game?.route?.name || path.currentRouteName,
      headingRadians: Number(headingOf(game).toFixed(4)),
      headingCompass: compassHeading(headingOf(game)),
      travelDirection: path.lastTravelDirection,
      nextJunctionKm: Number.isFinite(nav?.nextJunctionAt) ? Number(nav.nextJunctionAt.toFixed(5)) : null,
      nextJunctionDistanceMetres: Number.isFinite(nav?.nextJunctionAt)
        ? Math.round((nav.nextJunctionAt - worldKm(game)) * 1000)
        : null,
      activeTurn: nav?.turn?.direction || null,
      turnsTaken: finiteOr(nav?.turnsTaken, 0),
      segments: path.segments.map((segment) => ({ ...segment })),
      pathContinuityValid: [path.xUnits, path.zUnits, path.totalTravelKm, path.reverseTravelKm].every(Number.isFinite),
    };
  };
}

installGamePathHooks();
publishAudit();
console.info('[Kano Life] Step 97 signed route progression, reverse-aware junction scheduling, and local path continuity trace registered.');
