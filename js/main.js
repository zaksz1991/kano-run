import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Storage } from './storage.js';
import { STATE } from './config.js';

Audio.muted = Storage.getMuted();

const canvas = document.getElementById('c');
if (!canvas) {
  throw new Error('Kano Run: #c canvas was not found.');
}

const PATCHED = Symbol.for('kano-run.runtime-quality-patches.v1');

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function requiredTrafficGap(first, second) {
  const types = [first?.type, second?.type];
  if (types.includes('bus')) return 94;
  if (types.includes('truck') || types.includes('ambulance')) return 86;
  if (types.includes('motorcycle')) return 44;
  if (types.includes('keke')) return 54;
  return 62;
}

function installTrafficSeparationPatch() {
  const original = Game.prototype.updateTraffic;
  if (typeof original !== 'function' || original[PATCHED]) return;

  function updateTrafficWithSeparation(...args) {
    const obstacles = Array.isArray(this.obs)
      ? this.obs.filter((item) => item && !item.collided)
      : [];
    const lanes = new Map();
    const originalFactors = new Map();

    for (const obstacle of obstacles) {
      const lane = numberOr(obstacle.lane, -1);
      if (lane < 0) continue;
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane).push(obstacle);
      originalFactors.set(obstacle, numberOr(obstacle.speedFactor, 1));
    }

    // Vehicles nearer the horizon have smaller y values. Keep a safe following
    // distance and temporarily slow followers when they approach a slower lead.
    for (const vehicles of lanes.values()) {
      vehicles.sort((a, b) => numberOr(a.y, 0) - numberOr(b.y, 0));
      for (let index = 1; index < vehicles.length; index += 1) {
        const lead = vehicles[index - 1];
        const follower = vehicles[index];
        const gap = numberOr(follower.y, 0) - numberOr(lead.y, 0);
        const minimum = requiredTrafficGap(lead, follower);

        if (gap < minimum) {
          follower.y = numberOr(lead.y, 0) + minimum;
        }

        const adjustedGap = numberOr(follower.y, 0) - numberOr(lead.y, 0);
        if (adjustedGap < minimum + 44) {
          const easing = Math.max(0, Math.min(1, (adjustedGap - minimum) / 44));
          const leadFactor = numberOr(lead.speedFactor, 1);
          const baseFactor = originalFactors.get(follower) ?? numberOr(follower.speedFactor, 1);
          const safeFactor = Math.max(0.08, leadFactor * (0.1 + easing * 0.9));
          follower.speedFactor = Math.min(baseFactor, safeFactor);
        }
      }
    }

    let result;
    try {
      result = original.apply(this, args);
    } finally {
      // The reduced value is a frame-local control, not a permanent vehicle stat.
      for (const [obstacle, speedFactor] of originalFactors) {
        obstacle.speedFactor = speedFactor;
      }
    }

    // Final overlap guard after movement, including vehicles that were spawned
    // close together. This prevents visual interpenetration from speed variance.
    const remaining = Array.isArray(this.obs)
      ? this.obs.filter((item) => item && !item.collided)
      : [];
    const remainingLanes = new Map();
    for (const obstacle of remaining) {
      const lane = numberOr(obstacle.lane, -1);
      if (lane < 0) continue;
      if (!remainingLanes.has(lane)) remainingLanes.set(lane, []);
      remainingLanes.get(lane).push(obstacle);
    }
    for (const vehicles of remainingLanes.values()) {
      vehicles.sort((a, b) => numberOr(a.y, 0) - numberOr(b.y, 0));
      for (let index = 1; index < vehicles.length; index += 1) {
        const lead = vehicles[index - 1];
        const follower = vehicles[index];
        const minimum = requiredTrafficGap(lead, follower);
        const requiredY = numberOr(lead.y, 0) + minimum;
        if (numberOr(follower.y, 0) < requiredY) follower.y = requiredY;
      }
    }

    return result;
  }

  updateTrafficWithSeparation[PATCHED] = true;
  Game.prototype.updateTraffic = updateTrafficWithSeparation;
}

function installRoadsidePassengerPatch() {
  const originalSpawn = Game.prototype.spawnPassengerZone;
  if (typeof originalSpawn === 'function' && !originalSpawn[PATCHED]) {
    function spawnPassengerZoneRoadside(...args) {
      const before = Array.isArray(this.paxZones) ? this.paxZones.length : 0;
      const result = originalSpawn.apply(this, args);
      const zones = Array.isArray(this.paxZones) ? this.paxZones : [];

      for (let index = before; index < zones.length; index += 1) {
        const zone = zones[index];
        if (!zone) continue;
        const side = numberOr(zone.roadsideSide, 0) === -1 || numberOr(zone.roadsideSide, 0) === 1
          ? numberOr(zone.roadsideSide, 1)
          : (numberOr(zone.id, index + 1) % 2 === 0 ? -1 : 1);
        zone.roadsideSide = side;
        // Use the nearest edge lane for the stop/interaction rule while the
        // actual passenger and pickup marker render on the physical shoulder.
        zone.lane = side < 0 ? 0 : 2;
      }
      return result;
    }
    spawnPassengerZoneRoadside[PATCHED] = true;
    Game.prototype.spawnPassengerZone = spawnPassengerZoneRoadside;
  }

  const originalRenderZones = Renderer3D.prototype.updateZones;
  if (typeof originalRenderZones === 'function' && !originalRenderZones[PATCHED]) {
    function renderZonesRoadside(dt, gameState) {
      const result = originalRenderZones.call(this, dt, gameState);
      const pickups = Array.isArray(gameState?.paxZones) ? gameState.paxZones : [];
      const zones = Array.isArray(this.zonePool) ? this.zonePool : [];
      const pedestrians = Array.isArray(this.pedestrianPool) ? this.pedestrianPool : [];

      for (let index = 0; index < pickups.length && index < zones.length; index += 1) {
        const side = numberOr(pickups[index]?.roadsideSide, 0);
        if (side !== -1 && side !== 1) continue;

        const marker = zones[index];
        if (marker?.visible) marker.position.x = side * 6.75;
        const pedestrian = pedestrians[index];
        if (pedestrian && marker?.visible) {
          pedestrian.position.x = side * 7.65;
        }
      }
      return result;
    }
    renderZonesRoadside[PATCHED] = true;
    Renderer3D.prototype.updateZones = renderZonesRoadside;
  }
}

function readableRadioLabel(station) {
  if (station && typeof station === 'object') {
    return String(station.name || station.label || station.title || station.id || 'Radio');
  }
  const value = String(station ?? 'Radio');
  return value === '[object Object]' ? 'Radio' : value;
}

function installReadableRadioLabelPatch() {
  const original = UI.prototype.setRadio;
  if (typeof original !== 'function' || original[PATCHED]) return;

  function setRadioName(station) {
    return original.call(this, readableRadioLabel(station));
  }
  setRadioName[PATCHED] = true;
  UI.prototype.setRadio = setRadioName;
}

installTrafficSeparationPatch();
installRoadsidePassengerPatch();
installReadableRadioLabelPatch();

// Create the game and UI. The renderer remains responsible for 3D presentation.
const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;

const renderer = new Renderer3D(game);
game.renderer3d = renderer;

// Route resizing through the game's public resize method, avoiding two resize
// callbacks when the renderer already registered its own listener.
if (renderer.onResize) {
  window.removeEventListener('resize', renderer.onResize);
}
function onResize() {
  if (typeof game.resize === 'function') game.resize();
  else if (typeof renderer.resize === 'function') renderer.resize();
}
window.addEventListener('resize', onResize, { passive: true });
onResize();

function addDeveloperCredit() {
  const startScreen = document.getElementById('start-screen');
  if (!startScreen || document.getElementById('kano-run-developer-credit')) return;

  const credit = document.createElement('p');
  credit.id = 'kano-run-developer-credit';
  credit.textContent = 'Developed by Hassan Zakariya · RuffNeck Entertainment';
  credit.setAttribute('aria-label', 'Game developer: Hassan Zakariya, RuffNeck Entertainment');
  credit.style.cssText = [
    'display:block', 'width:100%', 'box-sizing:border-box',
    'margin:14px 0 0', 'padding:8px 12px',
    'color:rgba(255,255,255,.74)', 'font-size:12px', 'font-weight:600',
    'line-height:1.5', 'letter-spacing:.025em', 'text-align:center'
  ].join(';');
  startScreen.appendChild(credit);
}
addDeveloperCredit();

// One radio click should advance exactly one station. This callback is the one
// UI entry point; no duplicate pointer handler is added here.
const radioButton = document.getElementById('radio-btn');
if (radioButton) {
  radioButton.onclick = (event) => {
    event.preventDefault();
    if (typeof game.nextRadio === 'function') game.nextRadio();
  };
}

// Keep the primary action usable even if a previous UI binding was lost during
// a partial deployment. Assigning onclick preserves independent addEventListener handlers.
const startButton = document.getElementById('start-btn');
if (startButton) {
  startButton.onclick = (event) => {
    event.preventDefault();
    try {
      if (typeof game.start !== 'function') throw new Error('Game.start() is missing.');
      game.start();
    } catch (error) {
      showStartupError(error);
    }
  };
}

function showStartupError(error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('[Kano Run startup/runtime error]', error);
  let panel = document.getElementById('kano-run-runtime-error');
  if (!panel) {
    panel = document.createElement('pre');
    panel.id = 'kano-run-runtime-error';
    panel.setAttribute('role', 'alert');
    panel.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:12px', 'z-index:2147483647',
      'max-height:38vh', 'overflow:auto', 'white-space:pre-wrap', 'overflow-wrap:anywhere',
      'margin:0', 'padding:12px', 'border:2px solid #ef4444', 'border-radius:10px',
      'background:#160b0b', 'color:#fecaca', 'font:12px/1.45 ui-monospace,monospace'
    ].join(';');
    document.body.appendChild(panel);
  }
  panel.textContent = `KANO RUN COULD NOT START
${message}`;
}

window.addEventListener('error', (event) => {
  if (event?.error || event?.message) showStartupError(event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  showStartupError(event?.reason || 'Unhandled promise rejection');
});

const staticControls = document.getElementById('controls');
if (staticControls) {
  staticControls.addEventListener('touchmove', (event) => event.preventDefault(), {
    passive: false
  });
}

window.KanoRun = { game, ui, renderer, mode: '3d' };

let lastFrameTime = 0;
let drivingControlsWereVisible = false;

function syncDrivingControls() {
  const controls = document.getElementById('kano-driving-controls');
  if (!controls) return;

  const visible = game.state === STATE.PLAY && !game.paused && !game.eventOpen;
  controls.style.display = visible ? 'flex' : 'none';
  controls.setAttribute('aria-hidden', String(!visible));

  const gas = document.getElementById('kano-gas-btn');
  const brake = document.getElementById('kano-brake-btn');
  for (const button of [gas, brake]) {
    if (button) {
      button.disabled = !visible;
      button.tabIndex = visible ? 0 : -1;
    }
  }

  if (drivingControlsWereVisible && !visible) {
    game.gasUp?.();
    game.brakeUp?.();
  }
  drivingControlsWereVisible = visible;
}

function loop(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const delta = Math.min(32, Math.max(0, timestamp - lastFrameTime));
  lastFrameTime = timestamp;

  try {
    game.update(delta);
    syncDrivingControls();
  } catch (error) {
    showStartupError(error);
    return;
  }
  requestAnimationFrame(loop);
}

syncDrivingControls();
requestAnimationFrame(loop);

console.log('Kano Run active — roadside pickups, separated traffic, contextual driving controls.');
