/**
 * KANO LIFE — FUEL STATION FORECOURT REDESIGN
 *
 * Additive patch for the existing Renderer3D instance. It removes only the
 * legacy fuel-zone marker/pump/sign and inserts a compact forecourt with a
 * concrete apron, canopy, fascia, supports, two dispensers, hose/nozzle detail,
 * and readable Kano Fuel signage. It does not change game fuel rules or road
 * coordinates and owns every resource it adds beneath the zone actor.
 */
import * as THREE from 'three';
import {
  buildKanoFuelStationLayout,
  getFuelStationSide,
  shouldUpgradeFuelStation,
  KANO_FUEL_STATION_BUDGET,
} from './KanoFuelStationForecourtRules.mjs';

const PATCH_KEY = Symbol.for('kano.life.fuelStationForecourt.v1');
const FORECOURT_NAME = 'KANO_FUEL_STATION_FORECOURT';
const runtime = {
  installed: 0,
  stationsBuilt: 0,
  stationsReused: 0,
  removedLegacyParts: 0,
  errors: [],
};

function noteError(stage, error) {
  runtime.errors.push(`${stage}: ${String(error?.message || error || 'unknown error')}`);
  if (runtime.errors.length > 12) runtime.errors.splice(0, runtime.errors.length - 12);
}

function createMat(renderer, color, roughness = 0.86) {
  return renderer.mobile
    ? new THREE.MeshLambertMaterial({ color, side: THREE.FrontSide })
    : new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

function disposeLegacyChild(child) {
  if (!child) return;
  child.parent?.remove(child);
  child.geometry?.dispose?.();
  const materials = Array.isArray(child.material)
    ? child.material
    : child.material ? [child.material] : [];
  for (const material of materials) {
    if (!material) continue;
    for (const value of Object.values(material)) {
      if (value?.isTexture) value.dispose?.();
    }
    material.dispose?.();
  }
}

function isLegacyFuelPart(child) {
  if (!child?.isMesh || !child.geometry) return false;
  const p = child.geometry.parameters || {};
  const position = child.position || { x: 0, y: 0, z: 0 };
  if (
    child.geometry.type === 'CylinderGeometry'
    && Math.abs(Number(p.height) - 0.04) < 0.006
    && Math.abs(Number(position.y) - 0.035) < 0.04
  ) return true;
  if (
    child.geometry.type === 'BoxGeometry'
    && Math.abs(Number(p.width) - 0.34) < 0.015
    && Math.abs(Number(p.height) - 0.72) < 0.015
    && Math.abs(Number(p.depth) - 0.34) < 0.015
    && Math.abs(Number(position.x) - 0.75) < 0.03
    && Math.abs(Number(position.y) - 0.38) < 0.03
  ) return true;
  // The old floating FUEL STOP canvas sign is replaced by a mounted canopy sign.
  if (
    child.geometry.type === 'PlaneGeometry'
    && Math.abs(Number(position.y) - 1.4) < 0.03
  ) return true;
  return false;
}

function addMesh(parent, geometry, material, position, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.kanoFuelStationOwned = true;
  parent.add(mesh);
  return mesh;
}

function addInstancedBoxes(parent, geometry, material, placements, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.userData.kanoFuelStationOwned = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const transform = new THREE.Object3D();
  placements.forEach((placement, index) => {
    transform.position.set(placement.x, placement.y, placement.z);
    transform.rotation.set(placement.rx || 0, placement.ry || 0, placement.rz || 0);
    transform.scale.set(placement.sx || 1, placement.sy || 1, placement.sz || 1);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function createTextTexture(lines, { width = 512, height = 144, background = '#173b31', accent = '#f2d58a' } = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#202824';
  context.fillRect(0, 0, width, height);
  context.fillStyle = background;
  context.fillRect(6, 6, width - 12, height - 12);
  context.strokeStyle = accent;
  context.lineWidth = 7;
  context.strokeRect(10, 10, width - 20, height - 20);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff8e7';
  context.font = `900 ${Math.round(height * 0.34)}px system-ui, Arial, sans-serif`;
  context.fillText(String(lines[0] || 'KANO FUEL'), width / 2, height * 0.37, width - 32);
  context.fillStyle = accent;
  context.font = `800 ${Math.round(height * 0.20)}px system-ui, Arial, sans-serif`;
  context.fillText(String(lines[1] || 'PETROL  ·  DIESEL'), width / 2, height * 0.72, width - 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  return texture;
}

function makeBoardMaterial(lines, palette) {
  const texture = createTextTexture(lines, palette);
  const material = new THREE.MeshBasicMaterial({
    color: texture ? 0xffffff : 0x173b31,
    map: texture || null,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return { material, texture };
}

function addHose(parent, start, side, material, index) {
  const points = [
    new THREE.Vector3(start.x + side * 0.20, start.y + 0.06, start.z + 0.07),
    new THREE.Vector3(start.x + side * 0.38, start.y - 0.03, start.z + 0.12),
    new THREE.Vector3(start.x + side * 0.39, start.y - 0.27, start.z + 0.18),
    new THREE.Vector3(start.x + side * 0.21, start.y - 0.34, start.z + 0.24),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 5, 0.018, 4, false), material);
  mesh.name = `KANO_FUEL_PUMP_HOSE_${index + 1}`;
  mesh.userData.kanoFuelStationOwned = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function buildForecourt(renderer, actor, zone, side) {
  const layout = buildKanoFuelStationLayout(side, { mobile: renderer.mobile });
  const group = new THREE.Group();
  group.name = FORECOURT_NAME;
  group.userData.kanoFuelStationForecourt = true;
  group.userData.kanoFuelStationSide = layout.side;
  group.userData.kanoFuelStationZoneId = zone.id;
  group.userData.kanoFuelStationMobile = Boolean(renderer.mobile);
  group.userData.kanoFuelStationDrawPartBudget = renderer.mobile
    ? KANO_FUEL_STATION_BUDGET.mobileMaxDrawParts
    : KANO_FUEL_STATION_BUDGET.desktopMaxDrawParts;

  const concrete = createMat(renderer, 0xb8b1a1, 0.95);
  const paint = createMat(renderer, 0xf1e2a9, 0.9);
  const canopyMat = createMat(renderer, 0x174c3e, 0.66);
  const red = createMat(renderer, 0xb94234, 0.7);
  const white = createMat(renderer, 0xf3eee0, 0.77);
  const steel = createMat(renderer, 0x596367, 0.56);
  const pumpBody = createMat(renderer, 0xe4e1d7, 0.72);
  const display = createMat(renderer, 0x112a2a, 0.46);
  const hoseMat = createMat(renderer, 0x202526, 0.82);
  const nozzleMat = createMat(renderer, 0x23292c, 0.62);

  // Roadside apron sits beyond the road edge, within the sandy verge.
  addMesh(group, new THREE.BoxGeometry(layout.apron.width, 0.07, layout.apron.depth), concrete,
    { x: layout.apron.x, y: layout.apron.y, z: layout.apron.z }, 'KANO_FUEL_CONCRETE_APRON');

  // Entry and exit edge stripes: three long instanced markings, not dozens of objects.
  addInstancedBoxes(group, new THREE.BoxGeometry(0.075, 0.018, 2.75), paint, [
    { x: side * 0.58, y: 0.072, z: -1.75 },
    { x: side * 0.58, y: 0.072, z: 1.88 },
    { x: side * 3.86, y: 0.072, z: 0.10 },
  ], 'KANO_FUEL_APRON_GUIDE_STRIPES');
  addInstancedBoxes(group, new THREE.BoxGeometry(0.16, 0.11, 5.7), steel, [
    { x: side * 0.30, y: 0.105, z: 0.12 },
    { x: side * 3.98, y: 0.105, z: 0.12 },
  ], 'KANO_FUEL_APRON_KERBS');

  // Canopy deck with a clear green/white/red fascia, using Kano-neutral branding.
  addMesh(group, new THREE.BoxGeometry(layout.canopy.width, 0.17, layout.canopy.depth), canopyMat,
    { x: layout.canopy.x, y: layout.canopy.y, z: layout.canopy.z }, 'KANO_FUEL_CANOPY_ROOF');
  addMesh(group, new THREE.BoxGeometry(layout.canopy.width, 0.19, 0.12), red,
    { x: layout.canopy.x, y: 2.82, z: 1.43 }, 'KANO_FUEL_CANOPY_FRONT_RED_FASCIA');

  const columnGeometry = new THREE.CylinderGeometry(0.075, 0.09, 2.86, renderer.mobile ? 6 : 8);
  addInstancedBoxes(group, columnGeometry, white, layout.columns, 'KANO_FUEL_CANOPY_SUPPORTS');

  // Two functional-looking dispensers; screens and islands are batched by type.
  const pumpBodies = layout.pumps.map((pump) => ({ x: pump.x, y: 0.74, z: pump.z }));
  addInstancedBoxes(group, new THREE.BoxGeometry(0.48, 1.22, 0.40), pumpBody, pumpBodies, 'KANO_FUEL_DISPENSER_BODIES');
  addInstancedBoxes(group, new THREE.BoxGeometry(0.29, 0.21, 0.025), display,
    layout.pumps.map((pump) => ({ x: pump.x, y: 1.00, z: pump.z + 0.211 })), 'KANO_FUEL_DISPENSER_DISPLAYS');
  const nozzlePlacements = [];
  layout.pumps.forEach((pump, index) => {
    const hoseStart = { x: pump.x + side * 0.19, y: 0.78, z: pump.z };
    addHose(group, hoseStart, side, hoseMat, index);
    nozzlePlacements.push({
      x: hoseStart.x + side * 0.20, y: 0.49, z: hoseStart.z + 0.23, rz: side * -0.18,
    });
  });
  addInstancedBoxes(group, new THREE.BoxGeometry(0.065, 0.19, 0.055), nozzleMat, nozzlePlacements, 'KANO_FUEL_DISPENSER_NOZZLES');

  const canopyBoard = makeBoardMaterial(['KANO FUEL', 'PETROL  ·  DIESEL'], { background: '#174c3e', accent: '#f2d58a' });
  const signPanel = addMesh(group, new THREE.PlaneGeometry(2.38, 0.50), canopyBoard.material,
    { x: layout.sign.x, y: layout.sign.y, z: layout.sign.z + 0.05 }, 'KANO_FUEL_CANOPY_SIGN');
  signPanel.userData.kanoFuelStationTexture = canopyBoard.texture;

  const priceBoard = makeBoardMaterial(['FUEL', 'PETROL  ·  DIESEL'], { background: '#1b3e33', accent: '#f4d683' });
  const pricePanel = addMesh(group, new THREE.PlaneGeometry(0.78, 1.24), priceBoard.material,
    { x: layout.priceBoard.x, y: layout.priceBoard.y, z: layout.priceBoard.z + 0.08 }, 'KANO_FUEL_PRICE_TOTEM_PANEL');
  pricePanel.userData.kanoFuelStationTexture = priceBoard.texture;
  addInstancedBoxes(group, new THREE.BoxGeometry(0.10, 1.05, 0.10), steel, [
    { x: layout.priceBoard.x, y: 0.63, z: layout.priceBoard.z, sy: 1.2 },
  ], 'KANO_FUEL_PRICE_TOTEM_POST');

  // Simple bollards keep the entry readable without adding high-cost shadows or lights.
  addInstancedBoxes(group, new THREE.CylinderGeometry(0.055, 0.065, 0.50, renderer.mobile ? 5 : 7), red, [
    { x: side * 0.92, y: 0.29, z: -2.60 },
    { x: side * 0.92, y: 0.29, z: 2.82 },
  ], 'KANO_FUEL_ENTRY_BOLLARDS');

  actor.add(group);
  actor.userData.kanoFuelStationTextures = [canopyBoard.texture, priceBoard.texture].filter(Boolean);
  actor.userData.kanoFuelStationForecourt = group;
  actor.userData.kanoFuelStationSide = side;
  actor.userData.kanoFuelStationBuiltAt = Date.now();
  runtime.stationsBuilt += 1;
  return group;
}

function releaseFuelStationTextures(actor) {
  const textures = actor?.userData?.kanoFuelStationTextures;
  if (!Array.isArray(textures)) return;
  for (const texture of textures) texture?.dispose?.();
  actor.userData.kanoFuelStationTextures = [];
}

function releaseTexturesBeforeZoneRecycle(renderer, state) {
  const activeIds = new Set((Array.isArray(state?.zones) ? state.zones : []).map((zone) => zone.id));
  for (const [id, actor] of renderer?.zoneActors?.entries?.() || []) {
    if (activeIds.has(id) || actor?.userData?.zoneType !== 'fuel') continue;
    releaseFuelStationTextures(actor);
  }
}

function upgradeFuelActor(renderer, actor, zone) {
  if (!actor?.isObject3D || actor.userData?.zoneType !== 'fuel') return false;
  const existing = actor.getObjectByName?.(FORECOURT_NAME);
  if (existing) {
    runtime.stationsReused += 1;
    return true;
  }

  const side = getFuelStationSide(zone?.side, actor.position?.x);
  const legacyChildren = [...actor.children].filter(isLegacyFuelPart);
  for (const child of legacyChildren) {
    disposeLegacyChild(child);
    runtime.removedLegacyParts += 1;
  }
  if (actor.userData.labelTexture) {
    // The original sign texture is owned by this one zone, not by a cached GLB.
    actor.userData.labelTexture.dispose?.();
    actor.userData.labelTexture = null;
  }
  buildForecourt(renderer, actor, zone, side);
  actor.userData.kanoFuelStationSide = side;
  return true;
}

export function installKanoFuelStationForecourtUpgrade(renderer) {
  if (!renderer || typeof renderer.syncZones !== 'function') return false;
  if (renderer[PATCH_KEY]) return true;
  const originalSyncZones = renderer.syncZones;
  const originalDispose = typeof renderer.dispose === 'function' ? renderer.dispose : null;
  const disposeWrapper = originalDispose ? function disposeWithKanoFuelStationForecourt(...args) {
    for (const actor of this.zoneActors?.values?.() || []) releaseFuelStationTextures(actor);
    return originalDispose.apply(this, args);
  } : null;
  const wrapper = function syncZonesWithKanoFuelStationForecourt(state, ...args) {
    try { releaseTexturesBeforeZoneRecycle(this, state); } catch (error) { noteError('zone-texture-recycle', error); }
    const result = originalSyncZones.call(this, state, ...args);
    try {
      const zones = Array.isArray(state?.zones) ? state.zones : [];
      for (const zone of zones) {
        if (!shouldUpgradeFuelStation(zone)) continue;
        const actor = this.zoneActors?.get?.(zone.id);
        if (!actor) continue;
        try {
          upgradeFuelActor(this, actor, zone);
        } catch (error) {
          noteError(`zone-${String(zone.id)}`, error);
        }
      }
    } catch (error) {
      noteError('sync-zones', error);
    }
    return result;
  };
  Object.defineProperty(renderer, PATCH_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { originalSyncZones, wrapper, originalDispose, disposeWrapper },
  });
  renderer.syncZones = wrapper;
  if (disposeWrapper) renderer.dispose = disposeWrapper;
  runtime.installed += 1;
  if (typeof window !== 'undefined') window.__KANO_FUEL_STATION_RENDERER__ = renderer;
  return true;
}

export function getKanoFuelStationForecourtAudit(renderer = null) {
  const actors = [...(renderer?.zoneActors?.values?.() || [])]
    .filter((actor) => actor?.userData?.zoneType === 'fuel');
  const stations = actors.map((actor) => {
    const station = actor.getObjectByName?.(FORECOURT_NAME) || null;
    let meshCount = 0;
    let triangleCount = 0;
    station?.traverse?.((object) => {
      if (!object.isMesh) return;
      meshCount += 1;
      const geometry = object.geometry;
      const index = geometry?.index;
      const position = geometry?.getAttribute?.('position');
      const instances = object.isInstancedMesh ? Math.max(0, Number(object.count) || 0) : 1;
      if (index) triangleCount += Math.floor(index.count / 3) * instances;
      else if (position) triangleCount += Math.floor(position.count / 3) * instances;
      else if (geometry?.type === 'InstancedMesh') triangleCount += 0;
    });
    return {
      zoneId: actor.userData.kanoFuelStationForecourt?.userData?.kanoFuelStationZoneId
        ?? actor.userData.kanoFuelStationZoneId ?? null,
      built: Boolean(station),
      side: actor.userData.kanoFuelStationSide ?? null,
      meshCount,
      triangleCount,
      visible: Boolean(station?.visible ?? actor.visible),
      worldAnchored: Boolean(station?.parent === actor && actor.parent === renderer?.world),
    };
  });
  return {
    version: 1,
    installed: Boolean(renderer?.[PATCH_KEY]),
    mobile: Boolean(renderer?.mobile),
    activeFuelZones: actors.length,
    builtStations: stations.filter((station) => station.built).length,
    runtime: { ...runtime, errors: [...runtime.errors] },
    stations,
  };
}

if (typeof window !== 'undefined') {
  window.kanoFuelStationForecourtAudit = (renderer) =>
    getKanoFuelStationForecourtAudit(renderer || window.__KANO_FUEL_STATION_RENDERER__ || null);
}
