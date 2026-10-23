/**
 * KANO LIFE — Step 103: animate seated keke drivers with speed and steering.
 *
 * Uses the existing driver rig exported by ModelManager.js. It does not replace
 * vehicle geometry, gameplay input, collision rules, or the renderer. The
 * wrapper updates rig pose before the original draw call, so the existing
 * renderer remains the sole authority for rendering and vehicle transforms.
 */
import { Renderer3D } from './renderer3d.js';

const PATCH_KEY = Symbol.for('kano.life.seatedDriverMotion.step103');
const RIG_NAME = 'KANO_SEATED_DRIVER_RIG';
const BODY_NAME = 'KANO_DRIVER_TORSO';
const METRICS_KEY = Symbol.for('kano.life.seatedDriverMotionMetrics.step103');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Kept local so this adapter also works with projects whose ModelManager does
// not export an animation helper. It operates only on the existing named rig.
function updateDriverRig(rig, deltaSeconds, { speed = 0, steer = 0, reverse = false, crashShake = 0 } = {}) {
  if (!rig || typeof rig.getObjectByName !== 'function') return false;
  const body = rig.getObjectByName(BODY_NAME);
  if (!body) return false;
  const dt = clamp(finite(deltaSeconds, 0), 0, 0.05);
  const velocity = clamp(Math.abs(finite(speed, 0)), 0, 1.8);
  const steering = clamp(finite(steer, 0), -1, 1);
  const shaking = clamp(finite(crashShake, 0), 0, 1);
  rig.userData.animationClock = finite(rig.userData.animationClock) + dt;
  const time = rig.userData.animationClock;
  const movingWobble = Math.sin(time * (2.2 + velocity * 8)) * (0.002 + velocity * 0.004);
  const head = rig.getObjectByName('KANO_DRIVER_HEAD');
  const leftArm = rig.getObjectByName('KANO_DRIVER_LEFT_ARM');
  const rightArm = rig.getObjectByName('KANO_DRIVER_RIGHT_ARM');
  body.position.y = movingWobble + Math.sin(time * 27) * shaking * 0.008;
  body.rotation.z = -steering * 0.035;
  body.rotation.x = reverse ? 0.035 : -0.012 * velocity;
  if (head) {
    head.rotation.y = steering * 0.16 + Math.sin(time * 0.75) * 0.018;
    head.rotation.x = reverse ? 0.055 : Math.sin(time * 0.6) * 0.012;
  }
  if (leftArm) {
    leftArm.rotation.y = steering * 0.16;
    leftArm.rotation.z = steering * 0.035;
  }
  if (rightArm) {
    rightArm.rotation.y = steering * 0.16;
    rightArm.rotation.z = -steering * 0.035;
  }
  return true;
}

function gameFor(renderer, state) {
  return state && typeof state === 'object'
    && ('speed' in state || 's' in state || 'obs' in state)
    ? state
    : renderer?.game || (typeof window !== 'undefined' ? window.__KANO_LIFE_GAME__ : null);
}

function deltaFor(renderer, args, state) {
  const candidates = [
    args?.[0],
    state?.deltaSeconds,
    state?.dt,
    renderer?.game?.deltaSeconds,
  ];
  for (const candidate of candidates) {
    const number = Number(candidate);
    if (Number.isFinite(number) && number > 0 && number <= 1) return clamp(number, 0, 0.05);
  }
  return 1 / 60;
}

function isDescendantOf(object, ancestor) {
  let current = object;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function rootForRig(rig) {
  let current = rig;
  while (current?.parent) {
    if (current.userData?.modelManagerInstance
      || current.userData?.kanoStep102PlayerKekeGLB
      || current.userData?.kanoStep99RealKekeInstalled
      || current.userData?.kanoStep101TrafficGLB) return current;
    current = current.parent;
  }
  return rig;
}

function steerFor(renderer, game) {
  const candidates = [game?.steer, game?.steering, game?.inputSteer, game?.s?.steer, game?.s?.steering];
  for (const value of candidates) {
    if (Number.isFinite(Number(value))) return clamp(Number(value), -1, 1);
  }

  const player = renderer?.player;
  if (Number.isFinite(Number(player?.rotation?.z)) && Math.abs(Number(player.rotation.z)) > 0.002) {
    return clamp(Number(player.rotation.z) / 0.06, -1, 1);
  }

  const px = Number(player?.position?.x);
  const targetX = Number(game?.targetX ?? game?.s?.targetX);
  if (Number.isFinite(px) && Number.isFinite(targetX)) {
    const laneSpan = Math.max(0.9, Math.abs(finite(renderer?.laneToX?.(2), 2.4) - finite(renderer?.laneToX?.(0), -2.4)) / 2);
    return clamp((targetX - px) / laneSpan, -1, 1);
  }
  return 0;
}

function isReverse(game) {
  const gear = String(game?.gear ?? game?.s?.gear ?? '').toLowerCase();
  return Boolean(game?.reverse || game?.s?.reverse || gear === 'r' || gear === 'reverse'
    || finite(game?.signedSpeed, finite(game?.s?.signedSpeed, 0)) < -0.01);
}

function createMetrics(renderer) {
  if (!renderer[METRICS_KEY]) {
    Object.defineProperty(renderer, METRICS_KEY, {
      value: {
        version: '103.0.0',
        drawCalls: 0,
        rigsFound: 0,
        rigsAnimated: 0,
        playerRigAnimated: false,
        trafficRigsAnimated: 0,
        parkedRigsAnimated: 0,
        lastDeltaSeconds: 0,
        lastSpeedFactor: 0,
        lastSteer: 0,
        lastReverse: false,
        errors: [],
      },
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return renderer[METRICS_KEY];
}

function sceneRoots(renderer) {
  const roots = [renderer?.scene, renderer?.world, renderer?.player];
  if (Array.isArray(renderer?.vehiclePool)) roots.push(...renderer.vehiclePool);
  for (const key of ['zoneActors', 'kanoStep98WorldAnchors']) {
    const value = renderer?.[key];
    if (value instanceof Map) {
      for (const entry of value.values()) {
        if (entry?.node) roots.push(entry.node);
        if (entry?.actor) roots.push(entry.actor);
        if (entry?.parking) roots.push(entry.parking);
      }
    }
  }
  return [...new Set(roots.filter((root) => root && typeof root.traverse === 'function'))];
}

function trafficContext(renderer, modelRoot, game) {
  const poolRoot = modelRoot?.parent;
  if (!poolRoot || !Array.isArray(renderer?.vehiclePool)) return null;
  const index = renderer.vehiclePool.indexOf(poolRoot);
  if (index < 0) return null;
  const traffic = Array.isArray(game?.obs) ? game.obs
    : Array.isArray(game?.s?.traffic) ? game.s.traffic
      : Array.isArray(game?.state?.traffic) ? game.state.traffic : [];
  return traffic[index] || null;
}

function animateSceneDrivers(renderer, state, args) {
  const game = gameFor(renderer, state);
  const dt = deltaFor(renderer, args, state);
  const metrics = createMetrics(renderer);
  const seenRigs = new Set();
  const rigs = [];

  for (const root of sceneRoots(renderer)) {
    try {
      root.traverse((object) => {
        if (object?.name === RIG_NAME && !seenRigs.has(object)) {
          seenRigs.add(object);
          rigs.push(object);
        }
      });
    } catch (error) {
      metrics.errors.push(String(error?.message || error).slice(0, 160));
      if (metrics.errors.length > 5) metrics.errors.shift();
    }
  }

  const maximum = Math.max(1, finite(game?.maxSpeed, finite(game?.s?.maxSpeed, 8)));
  const playerSpeed = clamp(Math.abs(finite(game?.speed, finite(game?.s?.speed, 0))) / maximum * 1.35, 0, 1.6);
  const steer = steerFor(renderer, game);
  const reverse = isReverse(game);
  const crashShake = clamp(finite(game?.shake, finite(game?.s?.shake, 0)) / Math.max(1, finite(game?.shakeMag, 4)), 0, 1);

  metrics.drawCalls += 1;
  metrics.rigsFound = rigs.length;
  metrics.rigsAnimated = 0;
  metrics.playerRigAnimated = false;
  metrics.trafficRigsAnimated = 0;
  metrics.parkedRigsAnimated = 0;
  metrics.lastDeltaSeconds = dt;
  metrics.lastSpeedFactor = playerSpeed;
  metrics.lastSteer = steer;
  metrics.lastReverse = reverse;

  for (const rig of rigs) {
    const modelRoot = rootForRig(rig);
    const isPlayer = Boolean(renderer?.player && isDescendantOf(modelRoot, renderer.player));
    const traffic = trafficContext(renderer, modelRoot, game);
    const isTraffic = Boolean(traffic);
    const isParked = Boolean(modelRoot?.userData?.kanoStep99RealKekeInstalled
      || modelRoot?.userData?.kanoParkedCheckpointKeke);

    const context = isPlayer
      ? { speed: playerSpeed, steer, reverse, crashShake }
      : isTraffic
        ? { speed: clamp(finite(traffic?.speedFactor, 0.65) * 0.7, 0.08, 1.1), steer: 0, reverse: false, crashShake: 0 }
        : { speed: 0, steer: 0, reverse: false, crashShake: 0 };

    try {
      const torsoExists = Boolean(modelRoot?.getObjectByName?.(BODY_NAME));
      if (!torsoExists) continue;
      if (updateDriverRig(rig, dt, context)) {
        metrics.rigsAnimated += 1;
        if (isPlayer) metrics.playerRigAnimated = true;
        else if (isTraffic) metrics.trafficRigsAnimated += 1;
        else if (isParked) metrics.parkedRigsAnimated += 1;
      }
    } catch (error) {
      metrics.errors.push(String(error?.message || error).slice(0, 160));
      if (metrics.errors.length > 5) metrics.errors.shift();
    }
  }
}

if (typeof Renderer3D.prototype.draw === 'function' && !Renderer3D.prototype[PATCH_KEY]) {
  const originalDraw = Renderer3D.prototype.draw;
  Object.defineProperty(Renderer3D.prototype, PATCH_KEY, { value: true, enumerable: false });
  Renderer3D.prototype.draw = function kanoStep103AnimateSeatedDrivers(state, ...args) {
    try {
      if (typeof window !== 'undefined') {
        window.__KANO_LIFE_RENDERER__ = this;
        window.__KANO_ACTIVE_RENDERER__ = this;
      }
      animateSceneDrivers(this, state, args);
    } catch (error) {
      const metrics = createMetrics(this);
      metrics.errors.push(String(error?.message || error).slice(0, 160));
      if (metrics.errors.length > 5) metrics.errors.shift();
    }
    return originalDraw.call(this, state, ...args);
  };
}

if (typeof window !== 'undefined') {
  window.kanoSeatedDriverMotionAudit = () => {
    const renderer = window.__KANO_LIFE_RENDERER__ || window.__KANO_ACTIVE_RENDERER__ || null;
    if (!renderer) {
      return {
        version: '103.0.0',
        rendererFound: false,
        note: 'Start the game and render a frame before reading this audit.',
      };
    }
    const metrics = createMetrics(renderer);
    const playerModel = renderer.player?.children?.find((child) => child.userData?.kanoStep102PlayerKekeGLB) || null;
    const playerRig = playerModel?.getObjectByName?.(RIG_NAME) || null;
    return {
      ...metrics,
      errors: [...metrics.errors],
      rendererFound: true,
      playerModelMounted: Boolean(playerModel),
      playerDriverRigPresent: Boolean(playerRig && playerModel?.getObjectByName?.(BODY_NAME)),
      playerRigAnimated: metrics.playerRigAnimated,
      note: 'Animations are driven from the existing game speed, steering, reverse state and crash shake. The renderer remains responsible for position, camera, and controls.',
    };
  };
}

console.info('[Kano Life] Step 103 seated-driver steering and motion animation registered.');
