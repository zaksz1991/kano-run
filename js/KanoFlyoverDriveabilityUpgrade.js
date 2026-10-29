/**
 * KANO LIFE — driveable KWANKWASIYYA flyover.
 *
 * Additive renderer adapter. The existing road simulation remains authoritative;
 * this module supplies a raised road surface with approach ramps and keeps the
 * rendered keke, traffic, roadside zones and camera on that surface. It does not
 * modify game.js, renderer3d.js, GLB assets, scoring, or saved data.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import './KanoFlyoverRoundaboutUpgrade.js';
import {
  KANO_FLYOVER_DECK_HEIGHT,
  KANO_FLYOVER_DECK_HALF_LENGTH,
  KANO_FLYOVER_RAMP_END,
  kanoFlyoverHeightAt,
  kanoSignedRoadScroll,
  kanoWrapFlyoverZ,
} from './KanoFlyoverDriveabilityRules.mjs';

const PATCH = Symbol.for('kano.life.flyoverDriveability.v1');
const RAMP_RUN = KANO_FLYOVER_RAMP_END - KANO_FLYOVER_DECK_HALF_LENGTH;
const RAMP_LENGTH = Math.hypot(RAMP_RUN, KANO_FLYOVER_DECK_HEIGHT);
const RAMP_ANGLE = Math.atan2(KANO_FLYOVER_DECK_HEIGHT, RAMP_RUN);
const AUDIT = {
  installed: false,
  version: 1,
  deckHeight: KANO_FLYOVER_DECK_HEIGHT,
  rampEndZ: KANO_FLYOVER_RAMP_END,
  flyoverSurfaceCount: 0,
  elevatedRenderFrames: 0,
  lastRenderedHeight: 0,
  lastActiveFlyoverIndex: null,
  hiddenCrossDeckBarriers: 0,
  roundaboutRoutesDriveable: false,
  browserVisualTest: 'not verified',
};

function getSurfaceHeight(flyover) {
  if (flyover?.userData?.proceduralFlyover) return KANO_FLYOVER_DECK_HEIGHT;
  const cached = Number(flyover?.userData?.kanoFlyoverDeckHeight);
  if (Number.isFinite(cached) && cached >= 2.5 && cached <= 5.2) return cached;
  let height = KANO_FLYOVER_DECK_HEIGHT;
  try {
    flyover?.updateMatrixWorld?.(true);
    const bounds = new THREE.Box3().setFromObject(flyover);
    const size = bounds.getSize(new THREE.Vector3());
    if (Number.isFinite(size.y) && size.y > 1) {
      // The current model catalogue normalizes flyovers to 5.8 m. Their deck
      // is typically near 80% of the full bound; clamp to the procedural deck.
      height = THREE.MathUtils.clamp(bounds.min.y + size.y * 0.8, 3.1, 4.9);
    }
  } catch {
    height = KANO_FLYOVER_DECK_HEIGHT;
  }
  if (flyover?.userData) flyover.userData.kanoFlyoverDeckHeight = height;
  return height;
}

function hideCrossDeckBarriers(flyover, deckHeight) {
  if (!flyover?.traverse || flyover.userData?.kanoDriveabilityBarrierScanComplete) return;
  let hidden = 0;
  try {
    flyover.updateMatrixWorld(true);
    flyover.traverse((object) => {
      if (!object?.isMesh || object.userData?.kanoDriveabilityBarrierHidden) return;
      const name = String(object.name || '');
      const bounds = new THREE.Box3().setFromObject(object);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const proceduralFrontBackStripes = name.startsWith('KANO_FLYOVER_STRIPES_');
      const crosswiseBarrier = size.x > 7.5
        && size.z < 0.62
        && size.y > 0.08
        && size.y < 0.95
        && center.y >= deckHeight - 0.45
        && center.y <= deckHeight + 1.15;
      if (proceduralFrontBackStripes || crosswiseBarrier) {
        object.visible = false;
        object.userData.kanoDriveabilityBarrierHidden = true;
        hidden += 1;
      }
    });
    flyover.userData.kanoDriveabilityBarrierScanComplete = true;
    flyover.userData.kanoDriveabilityHiddenBarriers = hidden;
    AUDIT.hiddenCrossDeckBarriers += hidden;
  } catch (error) {
    console.warn('[Kano Life] Flyover barrier scan skipped safely.', error);
  }
}

function addRoadMarkings(renderer, parent, deckHeight) {
  const count = Math.floor(((KANO_FLYOVER_RAMP_END - 1) * 2) / 3.75) + 1;
  const geometry = new THREE.BoxGeometry(0.13, 0.026, 1.15);
  const material = new THREE.MeshBasicMaterial({ color: 0xf6cd4b, toneMapped: false });
  const marks = new THREE.InstancedMesh(geometry, material, count);
  marks.name = 'KANO_FLYOVER_DRIVING_LANE_DASHES';
  marks.userData.kanoFlyoverRoadMarkings = true;
  marks.frustumCulled = false;
  const transform = new THREE.Object3D();
  let index = 0;
  for (let z = KANO_FLYOVER_RAMP_END - 1; z >= -KANO_FLYOVER_RAMP_END + 1; z -= 3.75) {
    transform.position.set(0, kanoFlyoverHeightAt(z, deckHeight) + 0.105, z);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(1, 1, 1);
    transform.updateMatrix();
    marks.setMatrixAt(index, transform.matrix);
    index += 1;
  }
  marks.count = index;
  marks.instanceMatrix.needsUpdate = true;
  parent.add(marks);
}

function addSideBarriers(renderer, parent, deckHeight) {
  // z=33 down to -33 at 3.1-unit spacing produces 22 rows.
  const countPerSide = Math.floor(((KANO_FLYOVER_RAMP_END - 1) * 2) / 3.1) + 1;
  const geometry = new THREE.BoxGeometry(0.18, 0.48, 0.86);
  const material = renderer.material
    ? renderer.material(0xffffff, 0.84)
    : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 });
  const rails = new THREE.InstancedMesh(geometry, material, countPerSide * 2);
  rails.name = 'KANO_FLYOVER_RED_WHITE_SIDE_PARAPETS';
  rails.userData.kanoFlyoverSideParapets = true;
  rails.frustumCulled = false;
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  let instance = 0;
  for (let z = KANO_FLYOVER_RAMP_END - 1; z >= -KANO_FLYOVER_RAMP_END + 1; z -= 3.1) {
    for (const side of [-1, 1]) {
      transform.position.set(side * 4.45, kanoFlyoverHeightAt(z, deckHeight) + 0.26, z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      rails.setMatrixAt(instance, transform.matrix);
      color.setHex(instance % 2 === 0 ? 0xc63b37 : 0xf6f0df);
      rails.setColorAt(instance, color);
      instance += 1;
    }
  }
  rails.count = instance;
  rails.instanceMatrix.needsUpdate = true;
  if (rails.instanceColor) rails.instanceColor.needsUpdate = true;
  parent.add(rails);
}

function addRampMesh(renderer, parent, deckHeight, direction) {
  const roadMaterial = renderer.material
    ? renderer.material(0x353d43, 0.94)
    : new THREE.MeshStandardMaterial({ color: 0x353d43, roughness: 0.94 });
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(9.0, 0.14, RAMP_LENGTH),
    roadMaterial,
  );
  ramp.name = direction > 0 ? 'KWANKWASIYYA_FLYOVER_ENTRY_RAMP' : 'KWANKWASIYYA_FLYOVER_EXIT_RAMP';
  ramp.userData.kanoFlyoverDriveSurface = true;
  ramp.position.set(0, deckHeight / 2, direction * (KANO_FLYOVER_DECK_HALF_LENGTH + RAMP_RUN / 2));
  ramp.rotation.x = direction > 0 ? RAMP_ANGLE : -RAMP_ANGLE;
  ramp.receiveShadow = false;
  ramp.castShadow = false;
  parent.add(ramp);
}

function createApproachGroup(renderer, flyover, index) {
  const deckHeight = getSurfaceHeight(flyover);
  const group = new THREE.Group();
  group.name = `KWANKWASIYYA_DRIVABLE_APPROACH_${index + 1}`;
  group.userData.kanoFlyoverDriveSurface = true;
  group.userData.flyoverIndex = index;
  group.userData.deckHeight = deckHeight;
  // Build all vertices at the procedural fallback height. A vertical-only
  // group scale then aligns the complete ramp profile with a promoted GLB deck.
  addRampMesh(renderer, group, KANO_FLYOVER_DECK_HEIGHT, 1);
  addRampMesh(renderer, group, KANO_FLYOVER_DECK_HEIGHT, -1);
  addSideBarriers(renderer, group, KANO_FLYOVER_DECK_HEIGHT);
  addRoadMarkings(renderer, group, KANO_FLYOVER_DECK_HEIGHT);

  // Short side rails on the existing transverse deck replace its old front/back
  // parapets as the edge protection for the driver's direction of travel.
  for (const x of [-4.45, 4.45]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.54, KANO_FLYOVER_DECK_HALF_LENGTH * 2),
      renderer.material ? renderer.material(0xdddcd5, 0.72) : new THREE.MeshStandardMaterial({ color: 0xdddcd5 }),
    );
    rail.name = 'KWANKWASIYYA_FLYOVER_DECK_SIDE_RAIL';
    rail.position.set(x, KANO_FLYOVER_DECK_HEIGHT + 0.26, 0);
    rail.userData.kanoFlyoverDriveSurface = true;
    group.add(rail);
  }

  group.scale.y = deckHeight / KANO_FLYOVER_DECK_HEIGHT;
  group.position.set(flyover.position.x, 0, flyover.position.z);
  group.visible = flyover.visible !== false;
  renderer.world.add(group);
  return { index, group, flyover, deckHeight, sourceHeight: deckHeight };
}


// ---------------------------------------------------------------------------
// The player's own flyover GLB (world/roads/kano_urban_flyover.glb) replaces the
// built-in white/red boxes on every device. The drivable height profile is sampled
// from the GLB's real road surface, so the visible deck and the car always agree.
// ---------------------------------------------------------------------------
const GLB_SPAN = KANO_FLYOVER_RAMP_END * 2;
const GLB_WIDTH = 10.5;

function sampleDeck(wrapper) {
  wrapper.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const heights = [];
  for (let z = -KANO_FLYOVER_RAMP_END; z <= KANO_FLYOVER_RAMP_END; z += 1) {
    raycaster.set(new THREE.Vector3(0, 200, z), down);
    const hit = raycaster.intersectObject(wrapper, true)[0];
    heights.push(hit ? hit.point.y : null);
  }
  let last = null;
  for (let i = 0; i < heights.length; i += 1) { if (heights[i] === null) heights[i] = last; else last = heights[i]; }
  last = null;
  for (let i = heights.length - 1; i >= 0; i -= 1) { if (heights[i] === null) heights[i] = last; else last = heights[i]; }
  return heights;
}

function skinWithGlb(renderer, record) {
  if (record.glbSkinTried) return;
  if (!renderer.models?.cache?.has?.('flyover')) {
    // Phones only preload the keke at start; ask for the flyover once, then retry.
    if (!renderer._kanoFlyoverGlbRequested && typeof renderer.models?.load === 'function') {
      renderer._kanoFlyoverGlbRequested = true;
      Promise.resolve(renderer.models.load('flyover')).catch(() => {});
    }
    return;
  }
  record.glbSkinTried = true;
  try {
    const model = renderer.models.getInstance('flyover');
    if (!model) return;
    model.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const lengthAxisIsX = size.x >= size.z;
    const wrapper = new THREE.Group();
    wrapper.name = 'KANO_FLYOVER_GLB_DECK';
    wrapper.add(model);
    // Put the long axis along the road (z).
    wrapper.rotation.y = lengthAxisIsX ? Math.PI / 2 : 0;
    const length = Math.max(size.x, size.z);
    const width = Math.min(size.x, size.z);
    const lengthScale = GLB_SPAN / length;
    const widthScale = GLB_WIDTH / width;
    // Local x is the long axis when rotated, local z otherwise.
    if (lengthAxisIsX) wrapper.scale.set(lengthScale, lengthScale, widthScale);
    else wrapper.scale.set(widthScale, lengthScale, lengthScale);
    let heights = sampleDeck(wrapper);
    const endsOf = (list) => (list[0] + list[list.length - 1]) / 2;
    const rise = Math.max(...heights) - endsOf(heights);
    if (!(rise > 0.8)) return; // flat or unreadable: keep the built-in flyover
    wrapper.scale.y *= KANO_FLYOVER_DECK_HEIGHT / rise;
    heights = sampleDeck(wrapper);
    const base = endsOf(heights);
    wrapper.position.y = -base;
    const profile = heights.map((h) => Math.max(0, h - base));
    profile[0] = 0;
    profile[profile.length - 1] = 0;

    // Hide the built-in boxes, rails, ramps and stripes.
    const hideAll = (root) => root?.traverse?.((o) => { if (o.isMesh) o.visible = false; });
    hideAll(record.flyover);
    record.group.children.slice().forEach((child) => hideAll(child));
    record.group.add(wrapper);
    record.profile = profile;
    record.glbSkinned = true;
    AUDIT.glbFlyoverSkins = (AUDIT.glbFlyoverSkins || 0) + 1;
    console.info('[Kano Life] Flyover GLB active as the drivable deck.');
  } catch (error) {
    console.warn('[Kano Life] Flyover GLB skin skipped safely.', error);
  }
}

function profileHeight(profile, relativeZ) {
  const z = Number(relativeZ);
  if (!Number.isFinite(z) || Math.abs(z) > KANO_FLYOVER_RAMP_END) return 0;
  const f = z + KANO_FLYOVER_RAMP_END;
  const i = Math.min(profile.length - 2, Math.floor(f));
  const t = f - i;
  return profile[i] * (1 - t) + profile[i + 1] * t;
}

function ensureApproachGroups(renderer) {
  if (!renderer?.world || !Array.isArray(renderer.flyovers)) return;
  renderer.kanoFlyoverApproachRecords ||= [];
  for (let index = 0; index < renderer.flyovers.length; index += 1) {
    const flyover = renderer.flyovers[index];
    if (!flyover) continue;
    hideCrossDeckBarriers(flyover, getSurfaceHeight(flyover));
    let record = renderer.kanoFlyoverApproachRecords.find((item) => item.index === index);
    if (!record) {
      record = createApproachGroup(renderer, flyover, index);
      renderer.kanoFlyoverApproachRecords.push(record);
    } else {
      record.flyover = flyover;
      // Later GLB promotion can replace the fallback root. Keep the road surface
      // aligned and scale its vertical profile to the actual active model bounds.
      const currentHeight = getSurfaceHeight(flyover);
      if (Math.abs(currentHeight - record.sourceHeight) > 0.05) {
        record.group.scale.y = currentHeight / KANO_FLYOVER_DECK_HEIGHT;
        record.deckHeight = currentHeight;
        record.sourceHeight = currentHeight;
        record.group.userData.deckHeight = currentHeight;
      }
    }
    skinWithGlb(renderer, record);
    flyover.userData ||= {};
    flyover.userData.kanoDriveableFlyover = true;
    flyover.userData.kanoDriveableDeckHeight = record.deckHeight;
    record.group.visible = flyover.visible !== false;
  }
  AUDIT.flyoverSurfaceCount = renderer.kanoFlyoverApproachRecords.length;
}

function nearestSurfaceForZ(renderer, z) {
  let selected = null;
  let selectedHeight = 0;
  let closest = Infinity;
  for (const record of renderer.kanoFlyoverApproachRecords || []) {
    const flyover = renderer.flyovers?.[record.index] || record.flyover;
    if (!flyover) continue;
    const deckHeight = record.deckHeight || getSurfaceHeight(flyover);
    const relativeZ = z - flyover.position.z;
    const height = record.profile ? profileHeight(record.profile, relativeZ) : kanoFlyoverHeightAt(relativeZ, deckHeight);
    if (height <= 0) continue;
    if (Math.abs(relativeZ) < closest) {
      closest = Math.abs(relativeZ);
      selected = { record, flyover, relativeZ, height };
      selectedHeight = height;
    }
  }
  return selected ? { ...selected, height: selectedHeight } : null;
}

function elevateActor(renderer, actor) {
  if (!actor?.position) return 0;
  const surface = nearestSurfaceForZ(renderer, actor.position.z);
  const height = surface?.height || 0;
  actor.position.y = height;
  return height;
}

function updateMobileTrafficBatchElevations(renderer, state) {
  if (!renderer.mobile || !renderer._mobileTrafficBatches?.size) return;
  const vehicles = Array.isArray(state?.traffic) ? state.traffic : [];
  const selectedGlbIds = renderer._mobileGlbTrafficIds || new Set();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();
  const tempMatrix = new THREE.Matrix4();

  for (const [type, batch] of renderer._mobileTrafficBatches) {
    const mesh = batch?.mesh;
    if (!mesh?.count) continue;
    const matching = vehicles.filter((vehicle) => {
      if (vehicle.type !== type || Math.abs(Number(vehicle.depth) || 0) > 1.35) return false;
      const actor = renderer.trafficActors?.get(vehicle.id);
      return !selectedGlbIds.has(vehicle.id) || !actor || actor.userData?.fallback;
    });
    const limit = Math.min(mesh.count, matching.length);
    let changed = false;
    for (let index = 0; index < limit; index += 1) {
      const vehicle = matching[index];
      const z = -Math.max(-0.05, Number(vehicle.depth) || 0) * 88;
      const surface = nearestSurfaceForZ(renderer, z);
      if (!surface) continue;
      mesh.getMatrixAt(index, tempMatrix);
      tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);
      tempPosition.y = surface.height;
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      mesh.setMatrixAt(index, tempMatrix);
      changed = true;
    }
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  }
}

function applyDriveSurfaceBeforeRender(renderer, scene, camera) {
  if (renderer.lifeScene !== 'road' || !renderer.world?.visible) return 0;
  ensureApproachGroups(renderer);
  if (!renderer.player?.position) return 0;

  const playerSurface = nearestSurfaceForZ(renderer, renderer.player.position.z);
  const height = playerSurface?.height || 0;
  if (height > 0) {
    renderer.player.position.y += height;
    camera.position.y += height;
    AUDIT.elevatedRenderFrames += 1;
    AUDIT.lastActiveFlyoverIndex = playerSurface.record.index;
  } else {
    AUDIT.lastActiveFlyoverIndex = null;
  }
  AUDIT.lastRenderedHeight = Number(height.toFixed(3));
  renderer._kanoFlyoverCurrentHeight = height;
  renderer._kanoFlyoverCurrentIndex = playerSurface?.record.index ?? null;

  for (const actor of renderer.trafficActors?.values?.() || []) elevateActor(renderer, actor);
  for (const actor of renderer.zoneActors?.values?.() || []) elevateActor(renderer, actor);
  updateMobileTrafficBatchElevations(renderer, renderer._kanoFlyoverCurrentState);
  return height;
}

function syncApproachMotion(renderer, state, deltaSeconds) {
  if (renderer.lifeScene !== 'road') return;
  ensureApproachGroups(renderer);
  const scroll = kanoSignedRoadScroll(state, deltaSeconds);
  const loop = renderer.flyoverLoopDistance || (renderer.mobile ? 260 : 306);

  // Renderer3D's current flyover visual uses 0.72 road parallax. Add the
  // missing 0.28 here, so the deck, ramps, traffic and ground markings share
  // one continuous world-coordinate system without changing renderer3d.js.
  for (const flyover of renderer.flyovers || []) {
    if (flyover) flyover.position.z += scroll * 0.28;
  }

  for (const record of renderer.kanoFlyoverApproachRecords || []) {
    const flyover = renderer.flyovers?.[record.index] || record.flyover;
    if (!flyover) continue;
    record.flyover = flyover;
    const predictedZ = kanoWrapFlyoverZ(flyover.position.z + scroll * 0.72, loop);
    record.group.position.set(flyover.position.x, 0, predictedZ);
    record.group.visible = flyover.visible !== false
      && Math.abs(predictedZ - (renderer.camera?.position?.z || 0)) < (renderer.mobile ? 100 : 178);
  }
}

function installRenderHook(renderer) {
  if (typeof window !== 'undefined' && renderer) {
    window.__KANO_ACTIVE_RENDERER__ = renderer;
  }
  const webgl = renderer?.renderer;
  if (!webgl || webgl.__kanoFlyoverDriveabilityInstalled) return;
  const originalRender = webgl.render.bind(webgl);
  Object.defineProperty(webgl, '__kanoFlyoverDriveabilityInstalled', { value: true, configurable: false });
  webgl.render = function renderWithFlyoverDriveSurface(scene, camera) {
    const originalCameraY = camera?.position?.y;
    const basePlayerY = renderer.player?.position?.y;
    renderer._kanoFlyoverActiveRenderState = renderer._kanoFlyoverCurrentState;
    let height = 0;
    try {
      height = applyDriveSurfaceBeforeRender(renderer, scene, camera);
      return originalRender(scene, camera);
    } finally {
      // Keep the simulation's base position intact; it intentionally remains a
      // 1-D signed-distance road model. The GPU draw above uses the elevated pose.
      if (camera?.position && Number.isFinite(originalCameraY)) camera.position.y = originalCameraY;
      if (renderer.player?.position && Number.isFinite(basePlayerY)) renderer.player.position.y = basePlayerY;
      renderer._kanoFlyoverLastRenderedHeight = height;
    }
  };
}

if (!Renderer3D.prototype[PATCH]) {
  const originalBuildFlyover = Renderer3D.prototype.buildFlyover;
  if (typeof originalBuildFlyover === 'function') {
    Renderer3D.prototype.buildFlyover = function buildDriveableFlyovers(...args) {
      const result = originalBuildFlyover.apply(this, args);
      ensureApproachGroups(this);
      installRenderHook(this);
      return result;
    };
  }

  const originalDraw = Renderer3D.prototype.draw;
  if (typeof originalDraw === 'function') {
    Renderer3D.prototype.draw = function drawWithDriveableFlyover(state, deltaSeconds, ...args) {
      if (this.lifeScene === 'road') {
        this._kanoFlyoverCurrentState = state;
        installRenderHook(this);
        syncApproachMotion(this, state, deltaSeconds);
      }
      return originalDraw.call(this, state, deltaSeconds, ...args);
    };
  }

  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true, configurable: false });
  AUDIT.installed = true;
}

if (typeof window !== 'undefined') {
  window.kanoFlyoverDriveabilityAudit = () => {
    const renderer = window.__KANO_ACTIVE_RENDERER__ || window.renderer || null;
    const records = renderer?.kanoFlyoverApproachRecords || [];
    const flyovers = renderer?.flyovers || [];
    const activeIndex = renderer?._kanoFlyoverCurrentIndex ?? null;
    return {
      ...AUDIT,
      activeRenderer: Boolean(renderer),
      flyoverCount: flyovers.length,
      flyovers: flyovers.map((flyover, index) => ({
        index,
        modelPath: flyover?.userData?.modelPath || null,
        drivable: Boolean(flyover?.userData?.kanoDriveableFlyover && records.some((record) => record.index === index)),
        deckHeight: Number((records.find((record) => record.index === index)?.deckHeight || KANO_FLYOVER_DECK_HEIGHT).toFixed(2)),
        z: Number((flyover?.position?.z || 0).toFixed(2)),
        approachGroupVisible: Boolean(records.find((record) => record.index === index)?.group?.visible),
      })),
      playerHeight: Number((renderer?._kanoFlyoverLastRenderedHeight || 0).toFixed(3)),
      activeFlyoverIndex: activeIndex,
      trafficActorCount: renderer?.trafficActors?.size || 0,
      roundabouts: (renderer?.kanoRoundaboutActors || []).map((actor) => ({
        name: actor.name,
        visualOnly: true,
        branchDrivingEnabled: false,
      })),
      limitations: [
        'The flyover deck and ramps are visually driveable; the current game simulation still calculates collisions and progression on its signed linear road coordinate.',
        'Roundabout scenery remains visual-only. True roundabout exits require changing the protected game/renderer route simulation and steering model.',
        'Physical-phone and real-browser visuals are not verified by this source-level package.',
      ],
    };
  };
}
console.info('[Kano Life] Driveable KWANKWASIYYA flyover ramps and render-height adapter registered.');
