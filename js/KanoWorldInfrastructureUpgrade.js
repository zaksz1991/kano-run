import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

/**
 * KANO LIFE — Step 93: visible fuel forecourt and parked checkpoint keke.
 *
 * This is an additive Renderer3D decoration layer. It leaves zone depth,
 * pickup/refuel rules, collisions, game state, and the player controller
 * untouched. Zone scenery remains attached to the renderer world, never to
 * the player model. The base game still uses a continuous/recycled road loop;
 * this layer does not pretend that is already a fixed-coordinate map.
 */
const PATCH = Symbol.for('kano.life.worldInfrastructure.step93');
const TEXTURES = new Map();
const DESK_REPORT = {
  version: 1,
  installed: false,
  fuelStationDesign: 'arewa-forecourt-v1',
  checkpointKeke: 'renderer-native-keke',
  createdFuelStations: 0,
  createdCheckpointKeke: 0,
};

function material(color, roughness = 0.84, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}

function addBox(parent, size, color, position, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material(color, options.roughness ?? 0.84, options.metalness ?? 0),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = options.name || 'step93_station_mesh';
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radiusTop, radiusBottom, height, color, position, radialSegments = 10) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    material(color, 0.72, 0.02),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function cachedSignTexture(key, title, subtitle, theme = 'fuel') {
  if (TEXTURES.has(key)) return TEXTURES.get(key);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const background = theme === 'parking' ? '#203d32' : '#173f33';
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f5f0df';
  ctx.fillRect(0, 0, canvas.width, 13);
  ctx.fillRect(0, canvas.height - 13, canvas.width, 13);
  ctx.fillStyle = '#e2b94f';
  ctx.fillRect(0, 13, 15, canvas.height - 26);
  ctx.fillRect(canvas.width - 15, 13, 15, canvas.height - 26);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff7df';
  ctx.font = '900 72px Arial, sans-serif';
  ctx.fillText(title, 512, 94, 950);
  ctx.fillStyle = '#f0cf75';
  ctx.font = '700 32px Arial, sans-serif';
  ctx.fillText(subtitle, 512, 180, 950);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  TEXTURES.set(key, texture);
  return texture;
}

function addSignFace(parent, texture, width, height, position) {
  if (!texture) return null;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.name = 'step93_station_sign_face';
  parent.add(mesh);
  return mesh;
}

function addFuelPump(parent, sideSign, x, z, label) {
  const pump = new THREE.Group();
  pump.name = `KANO_FUEL_DISPENSER_${label}`;
  pump.position.set(sideSign * x, 0, z);
  parent.add(pump);

  addBox(pump, [0.66, 0.16, 0.78], 0x414a4b, [0, 0.2, 0], { name: 'dispenser_base' });
  addBox(pump, [0.53, 1.02, 0.47], 0xf0eee3, [0, 0.77, 0], { name: 'dispenser_body' });
  addBox(pump, [0.55, 0.14, 0.5], 0x1a6049, [0, 1.33, 0], { name: 'dispenser_top' });
  addBox(pump, [0.35, 0.26, 0.035], 0x111c20, [0, 1.0, 0.252], { name: 'digital_display' });
  addBox(pump, [0.2, 0.035, 0.04], 0x7be0ac, [0, 1.07, 0.278], { name: 'display_digits' });
  for (const [i, color] of [0xe9c65b, 0x1d664d, 0xc74639].entries()) {
    addBox(pump, [0.12, 0.055, 0.045], color, [-0.12 + i * 0.12, 0.75, 0.26], { name: 'dispenser_button' });
  }

  // A thick flexible hose with a separate nozzle, rather than a blank green cube.
  const hosePoints = [
    new THREE.Vector3(0.245, 1.0, 0.06),
    new THREE.Vector3(0.43, 0.88, 0.10),
    new THREE.Vector3(0.45, 0.55, 0.15),
    new THREE.Vector3(0.31, 0.41, 0.19),
    new THREE.Vector3(0.23, 0.57, 0.20),
  ];
  const curve = new THREE.CatmullRomCurve3(hosePoints);
  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 12, 0.025, 5, false),
    material(0x20282a, 0.76),
  );
  hose.name = 'fuel_hose';
  pump.add(hose);
  const nozzle = addBox(pump, [0.075, 0.25, 0.07], 0x303b3e, [0.23, 0.53, 0.235], { name: 'fuel_nozzle' });
  nozzle.rotation.z = -0.22;

  addBox(pump, [0.48, 0.07, 0.045], label === 'PMS' ? 0x1e6249 : 0x9c4b32, [0, 1.43, 0.26], { name: `pump_label_${label}` });
}

function buildFuelStation(renderer, actor, zone) {
  if (actor.userData.kanoFuelStationStep93) return;
  actor.userData.kanoFuelStationStep93 = true;
  actor.userData.kanoFuelStationDesign = 'arewa-forecourt-v1';
  actor.userData.kanoInfrastructureAnchor = 'zone-depth-on-renderer-world';
  actor.userData.kanoInfrastructureZoneId = String(zone.id);

  // Keep the gameplay zone and its depth untouched, but hide its old flat pad,
  // single green box, and generic floating label.
  for (const child of actor.children) child.visible = false;

  const sideSign = Number(zone.side) < 0 ? -1 : 1;
  const station = new THREE.Group();
  station.name = 'KANO_AREWA_FUEL_FORECOURT_STEP93';
  station.userData.kanoFuelStationGeometry = true;
  actor.add(station);

  const at = (x, y, z) => [sideSign * x, y, z];

  // Concrete forecourt, raised edge and paint marks.
  addBox(station, [6.9, 0.12, 8.2], 0xaaa99f, at(3.45, 0.045, -0.05), { name: 'forecourt_concrete' });
  addBox(station, [6.72, 0.09, 7.9], 0x777d79, at(3.45, 0.135, -0.05), { name: 'pump_apron' });
  addBox(station, [0.12, 0.045, 7.2], 0xe3bd52, at(0.22, 0.19, -0.05), { name: 'roadside_yellow_edge' });
  addBox(station, [0.12, 0.045, 7.2], 0xe3bd52, at(6.67, 0.19, -0.05), { name: 'outer_yellow_edge' });
  for (const z of [-2.65, -1.7, 1.7, 2.65]) {
    addBox(station, [0.055, 0.025, 0.72], 0xf3efe0, at(3.45, 0.196, z), { name: 'forecourt_bay_marking' });
  }

  // A real identifiable canopy silhouette with four columns, soffit and fascia.
  for (const x of [0.35, 6.45]) {
    for (const z of [-3.25, 3.15]) {
      addBox(station, [0.2, 3.0, 0.2], 0xe8e1cf, at(x, 1.72, z), { name: 'canopy_support' });
      addBox(station, [0.28, 0.13, 0.28], 0x1b6248, at(x, 3.2, z), { name: 'support_cap' });
    }
  }
  addBox(station, [6.75, 0.18, 7.28], 0xf0ecdf, at(3.4, 3.42, -0.05), { name: 'canopy_roof_top' });
  addBox(station, [6.6, 0.22, 7.05], 0x1b5d43, at(3.4, 3.26, -0.05), { name: 'canopy_soffit' });
  addBox(station, [6.75, 0.6, 0.24], 0x184732, at(3.4, 3.04, 3.58), { name: 'forecourt_fascia' });
  addBox(station, [6.78, 0.12, 0.27], 0xe5bf57, at(3.4, 3.39, 3.58), { name: 'fascia_gold_trim' });
  const stationSignTexture = cachedSignTexture('arewa-fuel-sign-v1', 'AREWA FUEL', 'PETROL  •  DIESEL  •  ENGINE OIL');
  addSignFace(station, stationSignTexture, 5.7, 0.43, at(3.4, 3.04, 3.72));

  // Two visible fuel dispensers sitting on their own plinths.
  addBox(station, [1.25, 0.11, 1.65], 0xc2c0b6, at(2.05, 0.24, -0.15), { name: 'pump_island_1' });
  addBox(station, [1.25, 0.11, 1.65], 0xc2c0b6, at(4.65, 0.24, -0.15), { name: 'pump_island_2' });
  addFuelPump(station, sideSign, 2.05, -0.15, 'PMS');
  addFuelPump(station, sideSign, 4.65, -0.15, 'DIESEL');

  // Under-canopy lamps and an outdoor price board help the station read from afar.
  for (const z of [-2.2, 0, 2.0]) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.06, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xffe7a3, emissive: 0xffd56c, emissiveIntensity: 0.35, roughness: 0.32 }),
    );
    lamp.position.set(sideSign * 3.4, 3.12, z);
    lamp.name = 'canopy_light';
    station.add(lamp);
  }
  addBox(station, [0.16, 1.35, 0.16], 0x444a45, at(6.2, 0.8, -2.8), { name: 'price_board_post' });
  addBox(station, [1.45, 1.0, 0.12], 0x184732, at(6.2, 1.85, -2.8), { name: 'price_board_panel' });
  const priceTexture = cachedSignTexture('arewa-fuel-price-v1', 'FUEL', 'PMS  •  DIESEL');
  addSignFace(station, priceTexture, 1.28, 0.72, at(6.2, 1.85, -2.725));

  actor.userData.kanoFuelStationParts = {
    canopy: true,
    dispenserCount: 2,
    sign: 'AREWA FUEL',
    coordinates: 'zone-relative roadside forecourt, not attached to player',
  };
  DESK_REPORT.createdFuelStations += 1;
}

function addParkedCheckpointKeke(renderer, actor, zone) {
  if (!zone.hub || zone.type !== 'pickup' || actor.userData.kanoCheckpointKekeStep93) return;
  actor.userData.kanoCheckpointKekeStep93 = true;
  actor.userData.kanoInfrastructureAnchor = 'zone-depth-on-renderer-world';
  actor.userData.kanoInfrastructureZoneId = String(zone.id);

  const sideSign = Number(zone.side) < 0 ? -1 : 1;
  const parking = new THREE.Group();
  parking.name = 'KANO_GENERAL_CHECKPOINT_PARKED_KEKE_STEP93';
  parking.userData.kanoCheckpointKeke = true;
  actor.add(parking);

  // Mark individual bays so the vehicles look deliberately parked rather than
  // appearing as traffic or random primitive blocks beside the passenger queue.
  for (const [index, x] of [1.9, 3.8].entries()) {
    const bay = addBox(parking, [1.8, 0.025, 3.05], 0xddd9c8, [sideSign * x, 0.205, index ? 1.45 : -1.65], { name: 'parked_keke_bay' });
    bay.material.transparent = true;
    bay.material.opacity = 0.45;
    bay.material.side = THREE.DoubleSide;
    for (const dx of [-0.88, 0.88]) {
      addBox(parking, [0.035, 0.025, 3.0], 0xf4e8b9, [sideSign * (x + dx), 0.222, index ? 1.45 : -1.65], { name: 'parking_bay_line' });
    }

    let keke = null;
    try {
      if (typeof renderer.makeKeke === 'function') keke = renderer.makeKeke();
    } catch (error) {
      console.warn('[Kano Life Step 93] Could not create a parked keke; leaving the checkpoint safe.', error);
    }
    if (!keke) continue;
    keke.name = `KANO_PARKED_ADAIDATA_SAHU_${index + 1}`;
    keke.userData.kanoParkedCheckpointKeke = true;
    keke.userData.vehicleType = 'keke';
    keke.scale.setScalar(renderer.mobile ? 0.66 : 0.72);
    keke.position.set(sideSign * x, 0.23, index ? 1.45 : -1.65);
    keke.rotation.y = index ? 0.06 : -0.045;
    parking.add(keke);
    DESK_REPORT.createdCheckpointKeke += 1;
  }

  // Visible park board close to the queue, above head height but below a canopy.
  addBox(parking, [1.75, 0.12, 0.18], 0x1c5942, [sideSign * 1.75, 2.4, -2.0], { name: 'checkpoint_keke_sign_board' });
  addSignFace(
    parking,
    cachedSignTexture('general-keke-parking-v1', 'KEKE PARK', 'WAITING PASSENGERS'),
    1.58,
    0.76,
    [sideSign * 1.75, 2.4, -1.895],
  );
  actor.userData.kanoCheckpointKekeCount = parking.children.filter((child) => child.userData?.kanoParkedCheckpointKeke).length;
  actor.userData.kanoCheckpointKekeParts = {
    count: actor.userData.kanoCheckpointKekeCount,
    parkingBays: 2,
    source: 'Renderer3D.makeKeke() existing three-wheel procedural model',
  };
}

function isDescendantOf(node, ancestor) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function publishAudit() {
  if (typeof window === 'undefined') return;
  window.kanoWorldInfrastructureAudit = () => {
    const renderer = window.__KANO_ACTIVE_RENDERER__ || window.renderer || null;
    const player = renderer?.player || null;
    const zones = [...(renderer?.zoneActors?.entries?.() || [])].map(([id, actor]) => ({
      id,
      type: actor.userData?.zoneType || 'unknown',
      anchor: actor.userData?.kanoInfrastructureAnchor || 'game-zone-depth',
      mountedToPlayer: Boolean(player && isDescendantOf(actor, player)),
      mountedToWorld: Boolean(renderer?.world && actor.parent === renderer.world),
      fuelStation: Boolean(actor.userData?.kanoFuelStationStep93),
      dispenserCount: actor.userData?.kanoFuelStationParts?.dispenserCount || 0,
      checkpointKekeCount: actor.userData?.kanoCheckpointKekeCount || 0,
      passengerCount: actor.userData?.kanoPassengerCrowdCount || 0,
      visiblePosition: actor.position ? { x: Number(actor.position.x.toFixed(2)), z: Number(actor.position.z.toFixed(2)) } : null,
    }));
    return {
      ...DESK_REPORT,
      activeZones: zones.length,
      fuelStations: zones.filter((zone) => zone.fuelStation).length,
      checkpointsWithKeke: zones.filter((zone) => zone.checkpointKekeCount > 0).length,
      mountedZoneActorsToPlayer: zones.filter((zone) => zone.mountedToPlayer).length,
      zoneActorsOnWorld: zones.filter((zone) => zone.mountedToWorld).length,
      zones,
      note: 'Fuel/checkpoint assets are parented to renderer.world and driven by each game zone depth, not attached to the player. Distant background objects still use the existing continuous-road recycling model; fixed-coordinate world conversion is a separate engine task.',
    };
  };
}

if (!Renderer3D.prototype[PATCH]) {
  const originalSyncZones = Renderer3D.prototype.syncZones;
  if (typeof originalSyncZones === 'function') {
    Renderer3D.prototype.syncZones = function kanoStep93SyncZones(state, ...args) {
      const result = originalSyncZones.call(this, state, ...args);
      for (const zone of state?.zones || []) {
        const actor = this.zoneActors?.get(zone.id);
        if (!actor) continue;
        try {
          if (zone.type === 'fuel') buildFuelStation(this, actor, zone);
          if (zone.type === 'pickup' && zone.hub) addParkedCheckpointKeke(this, actor, zone);
          if (zone.type !== 'pothole') {
            actor.userData.kanoInfrastructureAnchor = 'zone-depth-on-renderer-world';
            actor.userData.kanoInfrastructureZoneId = String(zone.id);
          }
        } catch (error) {
          // Rendering detail is optional; the fuel/pickup state and core loop remain authoritative.
          actor.userData.kanoInfrastructureVisualError = String(error?.message || error).slice(0, 240);
          console.warn('[Kano Life Step 93] Infrastructure visual enhancement skipped safely.', error);
        }
      }
      return result;
    };
  }
  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true, configurable: false });
  DESK_REPORT.installed = true;
}

publishAudit();
console.info('[Kano Life] Step 93 fuel forecourt and parked checkpoint keke registered.');
