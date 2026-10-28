import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { fixCharacterPose } from './KanoCharacterPoseFix.js';
import { mergeTexturedByMaterial } from './KanoMergeStaticMeshes.js';
import { resolveKanoGlbPath } from './KanoGlbPathResolver.js';

// ============================================================
// KANO LIFE — MODEL MANAGER
// ============================================================

// ============================================================
// MODEL CATALOG
// ============================================================

const CATALOG = {
  keke: [
    'vehicles/keke/keke-3.glb',
    'vehicles/keke/keke-1.glb',
    'vehicles/keke/keke-2.glb',
    'vehicles/keke/keke-4.glb',
    'vehicles/keke/keke-5.glb',
    'vehicles/keke/keke-6.glb',
    'vehicles/keke/keke-7.glb',
    'vehicles/keke/keke-8.glb',
  ],

  car: [
    'vehicles/cars/quaternius_cc0-normal-car-1190.glb',
    'vehicles/cars/lowpoly_bmw_e36_m3.glb',
    'vehicles/cars/2006_kia_ceed.glb',
    'vehicles/cars/2005_chrysler_300.glb',
    'vehicles/cars/1979_chevrolet_impala.glb',
  ],

  taxi: [
    'vehicles/cars/2006_kia_ceed.glb',
    'vehicles/cars/quaternius_cc0-normal-car-1190.glb',
    'vehicles/cars/lowpoly_bmw_e36_m3.glb',
  ],

  suv: [
    'vehicles/cars/quaternius_cc0-suv-1402.glb',
    'vehicles/cars/2002_dodge_ram_2500.glb',
    'world/props/SUV.glb',
    'vehicles/cars/asphalt_8_-_nissan_juke_nismo.glb',
  ],

  truck: [
    'vehicles/cars/quaternius_cc0-truck-1449.glb',
    'vehicles/cars/peterbilt_352.glb',
    'vehicles/cars/volvo_fh.glb',
    'vehicles/cars/volvo_fh_cement_truck.glb',
    'vehicles/cars/2002_dodge_ram_2500.glb',
  ],

  // No usable bus model ships yet (the old bus.glb rendered black; the current
  // file is an auto-rickshaw; the only truck is a food truck). Empty on purpose:
  // buses use the built-in shape until a proper .glb is added here.
  bus: [],

  motorcycle: [
    'vehicles/special/okada.glb',
    'vehicles/cars/motorcycle.glb',
    'vehicles/cars/asphalt_6_ktm_rc8.glb',
    'vehicles/cars/asphalt_6_can-am_spyder.glb',
  ],

  police: [
    'vehicles/special/police.glb',
    'world/props/Police-Car.glb',
    'vehicles/cars/2006_kia_ceed.glb',
  ],

  karota: [
    'vehicles/special/karota.glb',
    'vehicles/special/police.glb',
  ],

  ambulance: [
    'vehicles/special/ambulance.glb',
  ],

  // Light models first (about 2-3k triangles). The hijab_muslim_woman GLBs are
  // about 38k triangles with 14 materials each and a T-pose (arms held out), which is
  // too heavy to draw several times in a phone keke, so they are the last resort.
  passenger: [
    'characters/passengers/Man.glb',
    'characters/passengers/man-2.glb',
    'characters/passengers/Man in Suit.glb',
    'characters/passengers/women_in_hijab.glb',
    'characters/passengers/hijab_muslim_woman.glb',
  ],

  passengerWoman: [
    'characters/passengers/women_in_hijab.glb',
    'characters/passengers/free_download_attractive_african_woman_236.glb',
    'characters/passengers/hijab_muslim_woman.glb',
    'characters/passengers/hijab_muslim_woman 2.glb',
  ],

  passengerMan: [
    'characters/passengers/Man.glb',
    'characters/passengers/man-2.glb',
    'characters/pedestrians/Man-Long-Sleeves.glb',
  ],

  passengerVIP: [
    'characters/passengers/Man in Suit.glb',
    'characters/passengers/Man-fjHyMd5Wxw.glb',
    'characters/passengers/handsome_man_in_casual_clothes_in_a-pose_86.glb',
  ],

  karotaOfficer: [
    'characters/pedestrians/police_man.glb',
    'characters/pedestrians/police-man.glb',
  ],

  security: [
    'characters/pedestrians/Man in Long Sleeves.glb',
    'characters/pedestrians/police_man.glb',
    'characters/passengers/Man.glb',
  ],

  pedestrian: [
    'characters/pedestrians/pedestrian.glb',
    'characters/pedestrians/Man in Long Sleeves.glb',
    'characters/pedestrians/low_poly_people_free_sample_pack.glb',
    'characters/pedestrians/hi_guys.glb',
    'characters/pedestrians/passenger.glb',
  ],

  pedestrianWoman: [
    'characters/passengers/women_in_hijab.glb',
    'characters/passengers/hijab_muslim_woman.glb',
  ],

  building: [
    'world/buildings-suburban/building-type-d.glb',
    'world/buildings-suburban/building-type-e.glb',
    'world/buildings-suburban/building-type-f.glb',
    'world/buildings-suburban/building-type-g.glb',
    'world/buildings-suburban/building-type-h.glb',
    'world/buildings-suburban/building-type-i.glb',
    'world/buildings-suburban/building-type-j.glb',
    'world/buildings-suburban/building-type-k.glb',
    'world/buildings-suburban/building-type-l.glb',
    'world/buildings-suburban/building-type-m.glb',
    'world/buildings-suburban/building-type-n.glb',
    'world/buildings-suburban/building-type-o.glb',
    'world/buildings-suburban/building-type-p.glb',
    'world/buildings-suburban/building-type-q.glb',
    'world/buildings-suburban/building-type-r.glb',
    'world/buildings-suburban/building-type-s.glb',
    'world/buildings-suburban/building-type-t.glb',
    'world/buildings-suburban/building-type-u.glb',
  ],

  industrialBuilding: [
    'world/buildings-industrial/building-a.glb',
    'world/buildings-industrial/building-b.glb',
    'world/buildings-industrial/building-c.glb',
    'world/buildings-industrial/building-d.glb',
    'world/buildings-industrial/building-e.glb',
    'world/buildings-industrial/building-f.glb',
    'world/buildings-industrial/building-g.glb',
    'world/buildings-industrial/building-h.glb',
    'world/buildings-industrial/building-i.glb',
    'world/buildings-industrial/building-j.glb',
    'world/buildings-industrial/building-k.glb',
    'world/buildings-industrial/building-l.glb',
    'world/buildings-industrial/building-m.glb',
    'world/buildings-industrial/building-n.glb',
    'world/buildings-industrial/building-o.glb',
    'world/buildings-industrial/building-p.glb',
    'world/buildings-industrial/building-q.glb',
    'world/buildings-industrial/building-r.glb',
    'world/buildings-industrial/building-s.glb',
    'world/buildings-industrial/building-t.glb',
  ],

  flyover: [
    'world/roads/kano_urban_flyover.glb',
    'world/roads/kai_tak_flyovers.glb',
    'world/roads/kowloon_bay_flyovers.glb',
  ],

  roadlight: [
    'world/roads/light-square.glb',
    'world/roads/light-curved.glb',
    'world/roads/light-square-double.glb',
    'world/roads/light-curved-double.glb',
    'world/roads/electricity-pole-single.glb',
    'world/roads/electricity-pole.glb',
    'world/roads/electricity-pole-wide.glb',
  ],

  cone: [
    'world/roads/construction-cone.glb',
    'world/roads/construction-barrier.glb',
    'world/props/Cone.glb',
  ],

  dirtmound: [
    'environment/ground/photoscan_-_pothole_1.glb',
    'environment/ground/low_poly_dirt_ground.glb',
    'environment/ground/close_sand_with_tracks.glb',
    'environment/ground/sand_with_handprints_tile_texture.glb',
    'environment/ground/manhole_cover_on_broken_asphalt_road.glb',
  ],

  bench: [
    'world/props/Bench.glb',
  ],

  busStop: [],

  trafficLight: [
    'world/props/Traffic-Light.glb',
    'world/roads/traffic-light.glb',
  ],

  stopSign: [
    'world/props/Stop-sign.glb',
    'world/roads/road-sign-stop.glb',
  ],

  marketStall: [],
};

// ============================================================
// MODEL DIMENSIONS
// ============================================================

const PEOPLE_AND_VEHICLE_TRIANGLE_CAP = 12000;
const MAX_TRIANGLES_BY_KEY = {};
for (const k of [
  'keke', 'car', 'taxi', 'suv', 'truck', 'bus', 'motorcycle', 'police', 'karota', 'ambulance',
  'passenger', 'passengerWoman', 'passengerMan', 'passengerVIP', 'security', 'karotaOfficer',
  'pedestrian', 'pedestrianWoman',
]) MAX_TRIANGLES_BY_KEY[k] = PEOPLE_AND_VEHICLE_TRIANGLE_CAP;

const STATIC_MERGE_KEYS = new Set([
  'keke', 'car', 'taxi', 'suv', 'truck', 'bus', 'motorcycle', 'police', 'karota', 'ambulance',
  'building', 'industrialBuilding', 'roadlight', 'trafficLight', 'stopSign', 'cone', 'flyover',
]);

const TARGET_HEIGHT = {
  keke: 1.85,
  car: 1.4,
  taxi: 1.4,
  suv: 1.65,
  truck: 2.35,
  bus: 2.55,
  motorcycle: 1.25,
  police: 1.45,
  karota: 1.5,
  ambulance: 1.65,

  passenger: 1.7,
  passengerWoman: 1.7,
  passengerMan: 1.75,
  passengerVIP: 1.8,

  security: 1.75,
  pedestrian: 1.7,
  pedestrianWoman: 1.7,

  building: 4.5,
  industrialBuilding: 5.2,
  flyover: 5.8,
  roadlight: 4.2,

  cone: 0.75,
  dirtmound: 1.1,
  bench: 0.72,
  busStop: 3.0,
  trafficLight: 3.8,
  stopSign: 2.1,
  marketStall: 2.45,
};

const UPRIGHT_KEYS = new Set([
  'passenger',
  'passengerWoman',
  'passengerMan',
  'passengerVIP',
  'security',
  'pedestrian',
  'pedestrianWoman',
  'building',
  'industrialBuilding',
  'flyover',
  'roadlight',
  'cone',
  'dirtmound',
  'bench',
  'busStop',
  'trafficLight',
  'stopSign',
  'marketStall',
]);

// ============================================================
// MODEL ASSET AUDIT
// ============================================================

const MODEL_ASSET_AUDIT = new Map();

function auditId(key, relativePath) {
  return `${key}::${relativePath}`;
}

function safeErrorMessage(error) {
  if (typeof error === 'string') return error;

  return (
    error?.message ||
    error?.statusText ||
    'Unknown model loading error'
  );
}

function classifyFailure(error) {
  if (error?.failureType) return error.failureType;

  const status = Number(
    error?.httpStatus ?? error?.status,
  );

  if (status === 404) return 'http_404';

  if (Number.isFinite(status) && status >= 400) {
    return 'http_error';
  }

  const message = safeErrorMessage(error).toLowerCase();

  if (
    /failed to fetch|network|load failed|err_network|connection/.test(
      message,
    )
  ) {
    return 'network_error';
  }

  if (
    /parse|json|gltf|glb|buffer|unexpected token|magic/.test(
      message,
    )
  ) {
    return 'parse_error';
  }

  return 'load_error';
}

export function auditModelStart(
  key,
  relativePath,
  url,
) {
  const now = Date.now();

  const record = {
    key,
    path: relativePath,
    assetPath: relativePath,
    url,
    status: 'loading',
    failureType: null,
    error: null,
    httpStatus: null,
    startedAt: now,
    finishedAt: null,
    durationMs: null,
    meshCount: 0,
    dimensions: null,
  };

  MODEL_ASSET_AUDIT.set(
    auditId(key, relativePath),
    record,
  );

  return record;
}

export function auditModelSuccess(
  key,
  relativePath,
  url,
  gltf,
  httpStatus = null,
) {
  const record =
    MODEL_ASSET_AUDIT.get(
      auditId(key, relativePath),
    ) ||
    auditModelStart(
      key,
      relativePath,
      url,
    );

  let meshCount = 0;

  gltf?.scene?.traverse((object) => {
    if (object.isMesh) meshCount += 1;
  });

  record.status = 'loaded';
  record.error = null;
  record.failureType = null;
  record.httpStatus = httpStatus;
  record.meshCount = meshCount;
  record.finishedAt = Date.now();

  record.durationMs = Math.max(
    0,
    record.finishedAt - record.startedAt,
  );

  return record;
}

export function auditModelFailure(
  key,
  relativePath,
  url,
  error,
  httpStatus = null,
) {
  const record =
    MODEL_ASSET_AUDIT.get(
      auditId(key, relativePath),
    ) ||
    auditModelStart(
      key,
      relativePath,
      url,
    );

  const embeddedStatus = Number(
    error?.httpStatus ?? error?.status,
  );

  const resolvedStatus = Number.isFinite(embeddedStatus)
    ? embeddedStatus
    : Number.isFinite(Number(httpStatus))
      ? Number(httpStatus)
      : null;

  record.status = 'failed';
  record.httpStatus = resolvedStatus;
  record.failureType = classifyFailure(error);
  record.error = safeErrorMessage(error);
  record.finishedAt = Date.now();

  record.durationMs = Math.max(
    0,
    record.finishedAt - record.startedAt,
  );

  return record;
}

export function auditModelRejected(
  key,
  relativePath,
  url,
  reason,
  dimensions = null,
  httpStatus = null,
) {
  const record =
    MODEL_ASSET_AUDIT.get(
      auditId(key, relativePath),
    ) ||
    auditModelStart(
      key,
      relativePath,
      url,
    );

  record.status = 'rejected';
  record.failureType = 'invalid_dimensions';

  record.error =
    typeof reason === 'string'
      ? reason
      : safeErrorMessage(reason);

  record.dimensions = dimensions;
  record.httpStatus = httpStatus;
  record.finishedAt = Date.now();

  record.durationMs = Math.max(
    0,
    record.finishedAt - record.startedAt,
  );

  return record;
}

export function getModelAssetAuditReport() {
  const attemptedAssets = [
    ...MODEL_ASSET_AUDIT.values(),
  ].map((record) => ({ ...record }));

  const unconfiguredAssets = Object.entries(CATALOG)
    .filter(
      ([, paths]) =>
        !Array.isArray(paths) || paths.length === 0,
    )
    .map(([key]) => ({
      key,
      path: '',
      assetPath: '',
      url: null,
      status: 'unconfigured',
      failureType: 'no_configured_paths',
      error:
        'No candidate model asset paths are configured for this category.',
      httpStatus: null,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      meshCount: 0,
      dimensions: null,
    }));

  const assets = [
    ...attemptedAssets,
    ...unconfiguredAssets,
  ].sort((a, b) => {
    const keyCompare = String(a.key).localeCompare(
      String(b.key),
    );

    if (keyCompare !== 0) return keyCompare;

    return String(a.path).localeCompare(
      String(b.path),
    );
  });

  const count = (status) =>
    assets.filter(
      (asset) => asset.status === status,
    ).length;

  return {
    total: assets.length,
    loaded: count('loaded'),
    failed: count('failed'),
    rejected: count('rejected'),
    loading: count('loading'),
    unconfigured: count('unconfigured'),
    attempted: attemptedAssets.length,
    assets,
    generatedAt: new Date().toISOString(),
  };
}

export function printModelAssetAuditReport() {
  const report = getModelAssetAuditReport();

  console.groupCollapsed(
    '[ModelManager] Model asset audit',
  );

  console.table({
    total: report.total,
    attempted: report.attempted,
    loaded: report.loaded,
    failed: report.failed,
    rejected: report.rejected,
    loading: report.loading,
    unconfigured: report.unconfigured,
  });

  if (report.assets.length) {
    console.table(
      report.assets.map((asset) => ({
        key: asset.key,
        path: asset.path || '(not configured)',
        status: asset.status,
        failureType: asset.failureType || '',
        httpStatus: asset.httpStatus ?? '',
        durationMs: asset.durationMs ?? '',
        error: asset.error || '',
      })),
    );
  }

  console.groupEnd();

  return report;
}

// ============================================================
// MATERIAL REPAIR
// ============================================================

function repairMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;

    object.castShadow = false;
    object.receiveShadow = false;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      if (!material) continue;

      // Preserve the material side authored in the GLB. GLTFLoader already
      // maps doubleSided=true to THREE.DoubleSide and otherwise uses the normal
      // front-face material. Forcing every imported mesh to DoubleSide disables
      // back-face culling across nearly the entire model catalogue on phones.
      // Keep the existing low-opacity repair, and request a program update only
      // when that repair actually changes material transparency.
      if (
        Number.isFinite(material.opacity) &&
        material.opacity < 0.12
      ) {
        material.opacity = 0.85;
        material.transparent = true;
        material.needsUpdate = true;
      }
    }
  });
}

// ============================================================
// RESOURCE MANAGEMENT
// ============================================================

function disposeModelResources(roots) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  for (const root of roots) {
    root?.traverse((object) => {
      if (
        object.geometry &&
        !geometries.has(object.geometry)
      ) {
        geometries.add(object.geometry);
        object.geometry.dispose();
      }

      const materialList = Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [];

      for (const material of materialList) {
        if (
          !material ||
          materials.has(material)
        ) {
          continue;
        }

        materials.add(material);

        for (const value of Object.values(material)) {
          if (
            value?.isTexture &&
            !textures.has(value)
          ) {
            textures.add(value);
            value.dispose();
          }
        }

        material.dispose();
      }
    });
  }
}

function parseGLTF(loader, arrayBuffer, resourcePath) {
  if (typeof loader.parseAsync === 'function') {
    return loader.parseAsync(
      arrayBuffer,
      resourcePath,
    );
  }

  return new Promise((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      resourcePath,
      resolve,
      reject,
    );
  });
}

function createHttpError(response, url) {
  const error = new Error(
    `HTTP ${response.status}${
      response.statusText
        ? ` ${response.statusText}`
        : ''
    } while requesting ${url}`,
  );

  error.httpStatus = response.status;

  error.failureType =
    response.status === 404
      ? 'http_404'
      : 'http_error';

  return error;
}

// ============================================================
// SEATED KEKE DRIVER
//
// The imported vehicle GLB replaces the renderer's fallback
// keke. This rig ensures that the replacement still has a driver
// positioned at the handlebars, inside the passenger cabin.
//
// Its hierarchy follows Renderer3D.animateFallbackDriver():
// driverPivot, arms[].shoulder, arms[].forearm.
//
// No standalone pedestrian is created or moved alongside the
// player's vehicle.
// ============================================================

const DRIVER_RIG_NAME = 'KANO_KEKE_SEATED_DRIVER';
const DRIVER_PIVOT_NAME = 'KANO_KEKE_DRIVER_PIVOT';

const DRIVER_LEFT_SHOULDER_NAME =
  'KANO_KEKE_DRIVER_SHOULDER_LEFT';

const DRIVER_RIGHT_SHOULDER_NAME =
  'KANO_KEKE_DRIVER_SHOULDER_RIGHT';

const DRIVER_LEFT_FOREARM_NAME =
  'KANO_KEKE_DRIVER_FOREARM_LEFT';

const DRIVER_RIGHT_FOREARM_NAME =
  'KANO_KEKE_DRIVER_FOREARM_RIGHT';

function makeDriverMaterial(color, roughness = 0.88) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    side: THREE.DoubleSide,
  });
}

function hasNamedDriver(root) {
  let found = false;

  const driverName =
    /(^|[\s_.-])(driver|rider|chauffeur|human|person)([\s_.-]|$)/i;

  root?.traverse((object) => {
    if (found || !object.name) return;

    if (
      (object.isMesh || object.isSkinnedMesh) &&
      driverName.test(object.name)
    ) {
      found = true;
    }
  });

  return found;
}

function createSeatedKekeDriver() {
  const root = new THREE.Group();

  root.name = DRIVER_RIG_NAME;

  root.userData.proceduralDriver = true;
  root.userData.seated = true;

  const bodyMaterial = makeDriverMaterial(0x2f674e);
  const sleeveMaterial = makeDriverMaterial(0x397457);
  const skinMaterial = makeDriverMaterial(0x70472f);
  const capMaterial = makeDriverMaterial(0x18382e);
  const trouserMaterial = makeDriverMaterial(0x252d32);
  const shoeMaterial = makeDriverMaterial(0x12171b);

  // ----------------------------------------------------------
  // SEATED TORSO PIVOT
  //
  // These coordinates match the cabin position used by
  // Renderer3D.makeKeke().
  // ----------------------------------------------------------

  const driverPivot = new THREE.Group();

  driverPivot.name = DRIVER_PIVOT_NAME;
  driverPivot.position.set(0, 1.18, -0.03);

  root.add(driverPivot);

  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.16,
      0.2,
      0.46,
      10,
    ),
    bodyMaterial,
  );

  torso.name = 'KANO_KEKE_DRIVER_TORSO';
  torso.position.set(0, 0, 0);

  driverPivot.add(torso);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.055,
      0.065,
      0.10,
      9,
    ),
    skinMaterial,
  );

  neck.name = 'KANO_KEKE_DRIVER_NECK';
  neck.position.set(0, 0.235, -0.065);

  driverPivot.add(neck);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.14,
      14,
      12,
    ),
    skinMaterial,
  );

  head.name = 'KANO_KEKE_DRIVER_HEAD';
  head.position.set(0, 0.34, -0.09);
  head.scale.set(0.94, 1.03, 0.97);

  driverPivot.add(head);

  // A Northern Nigerian-style cap.
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.14,
      0.16,
      0.055,
      12,
    ),
    capMaterial,
  );

  cap.name = 'KANO_KEKE_DRIVER_CAP';
  cap.position.set(0, 0.46, -0.09);

  driverPivot.add(cap);

  // ----------------------------------------------------------
  // SEATED LEGS
  // ----------------------------------------------------------

  for (const side of [-1, 1]) {
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        0.075,
        0.20,
        3,
        7,
      ),
      trouserMaterial,
    );

    thigh.name =
      side < 0
        ? 'KANO_KEKE_DRIVER_LEFT_THIGH'
        : 'KANO_KEKE_DRIVER_RIGHT_THIGH';

    thigh.position.set(
      side * 0.105,
      -0.22,
      -0.13,
    );

    thigh.rotation.x = Math.PI / 2.8;

    driverPivot.add(thigh);

    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        0.052,
        0.18,
        3,
        7,
      ),
      trouserMaterial,
    );

    shin.name =
      side < 0
        ? 'KANO_KEKE_DRIVER_LEFT_SHIN'
        : 'KANO_KEKE_DRIVER_RIGHT_SHIN';

    shin.position.set(
      side * 0.11,
      -0.47,
      -0.31,
    );

    shin.rotation.x = -0.35;

    driverPivot.add(shin);

    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.13,
        0.07,
        0.21,
      ),
      shoeMaterial,
    );

    shoe.position.set(
      side * 0.11,
      -0.57,
      -0.39,
    );

    driverPivot.add(shoe);
  }

  // ----------------------------------------------------------
  // ARTICULATED ARMS
  //
  // Animation code in Renderer3D expects each item to have
  // shoulder and forearm references.
  // ----------------------------------------------------------

  const arms = [];

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();

    shoulder.name =
      side < 0
        ? DRIVER_LEFT_SHOULDER_NAME
        : DRIVER_RIGHT_SHOULDER_NAME;

    shoulder.position.set(
      side * 0.16,
      0.11,
      -0.02,
    );

    driverPivot.add(shoulder);

    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.045,
        0.055,
        0.27,
        8,
      ),
      bodyMaterial,
    );

    upperArm.name =
      side < 0
        ? 'KANO_KEKE_DRIVER_LEFT_UPPER_ARM'
        : 'KANO_KEKE_DRIVER_RIGHT_UPPER_ARM';

    upperArm.position.set(
      side * 0.055,
      -0.11,
      -0.09,
    );

    upperArm.rotation.x = -0.35;
    upperArm.rotation.z = side * -0.25;

    shoulder.add(upperArm);

    const forearm = new THREE.Group();

    forearm.name =
      side < 0
        ? DRIVER_LEFT_FOREARM_NAME
        : DRIVER_RIGHT_FOREARM_NAME;

    forearm.position.set(
      side * 0.08,
      -0.21,
      -0.15,
    );

    shoulder.add(forearm);

    const forearmMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.035,
        0.045,
        0.24,
        8,
      ),
      sleeveMaterial,
    );

    forearmMesh.name =
      side < 0
        ? 'KANO_KEKE_DRIVER_LEFT_FOREARM_MESH'
        : 'KANO_KEKE_DRIVER_RIGHT_FOREARM_MESH';

    forearmMesh.position.y = -0.1;
    forearmMesh.rotation.z = side * 0.25;

    forearm.add(forearmMesh);

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.052,
        9,
        8,
      ),
      skinMaterial,
    );

    hand.position.set(
      side * 0.075,
      -0.205,
      -0.24,
    );

    forearm.add(hand);

    arms.push({
      shoulder,
      forearm,
    });
  }

  // ----------------------------------------------------------
  // STEERING HANDLE
  // ----------------------------------------------------------

  const handlebarMaterial = makeDriverMaterial(
    0x667174,
    0.55,
  );

  const handlebar = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.025,
      0.025,
      0.46,
      8,
    ),
    handlebarMaterial,
  );

  handlebar.name = 'KANO_KEKE_DRIVER_HANDLEBAR';
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, -0.015, -0.42);

  driverPivot.add(handlebar);

  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.033,
        0.033,
        0.12,
        8,
      ),
      shoeMaterial,
    );

    grip.rotation.z = Math.PI / 2;

    grip.position.set(
      side * 0.22,
      -0.015,
      -0.42,
    );

    driverPivot.add(grip);
  }

  root.userData.driverPivotName = DRIVER_PIVOT_NAME;

  return root;
}

// ============================================================
// GET ANIMATION PARTS FROM A CLONED DRIVER
// ============================================================

function attachDriverAnimationReferences(instance) {
  const driverRoot = instance.getObjectByName(
    DRIVER_RIG_NAME,
  );

  if (!driverRoot) {
    return false;
  }

  const driverPivot = driverRoot.getObjectByName(
    DRIVER_PIVOT_NAME,
  );

  const leftShoulder = driverRoot.getObjectByName(
    DRIVER_LEFT_SHOULDER_NAME,
  );

  const rightShoulder = driverRoot.getObjectByName(
    DRIVER_RIGHT_SHOULDER_NAME,
  );

  const leftForearm = driverRoot.getObjectByName(
    DRIVER_LEFT_FOREARM_NAME,
  );

  const rightForearm = driverRoot.getObjectByName(
    DRIVER_RIGHT_FOREARM_NAME,
  );

  if (
    !driverPivot ||
    !leftShoulder ||
    !rightShoulder ||
    !leftForearm ||
    !rightForearm
  ) {
    console.warn(
      '[ModelManager] seated driver rig found, but some animation parts are missing.',
    );

    return false;
  }

  // Renderer3D.animateFallbackDriver() already understands
  // this exact data structure.
  instance.userData.driverAnimationParts = {
    driverPivot,

    arms: [
      {
        shoulder: leftShoulder,
        forearm: leftForearm,
      },
      {
        shoulder: rightShoulder,
        forearm: rightForearm,
      },
    ],

    // Imported GLB wheel nodes are not assumed to be Three.js
    // wheel meshes with compatible rotation axes.
    wheels: [],
  };

  instance.userData.hasSeatedDriver = true;

  return true;
}

// ============================================================
// MODEL MANAGER
// ============================================================

export class ModelManager {
  constructor({
    basePath = '/assets/models/',
    mobile = false,
  } = {}) {
    this.loader = createGLTFLoader();

    this.basePath = basePath.endsWith('/')
      ? basePath
      : `${basePath}/`;

    this.mobile = Boolean(mobile);
    this.cache = new Map();
    this.pending = new Map();
    this.failed = new Set();
    this.disposed = false;
  }

  // ----------------------------------------------------------
  // LOAD MODEL
  // ----------------------------------------------------------

  async load(key) {
    if (this.disposed) return null;

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    if (this.pending.has(key)) {
      return this.pending.get(key);
    }

    const catalog = CATALOG[key] || [];

    const task = (async () => {
      for (const requestedPath of catalog) {
        const relativePath = resolveKanoGlbPath(requestedPath);
        const encodedPath = relativePath
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');

        const url = `${this.basePath}${encodedPath}`;

        const auditRecord = auditModelStart(
          key,
          relativePath,
          url,
        );

        try {
          const response = await fetch(url, {
            credentials: 'same-origin',
          });

          auditRecord.httpStatus = response.status;

          if (!response.ok) {
            throw createHttpError(
              response,
              url,
            );
          }

          const arrayBuffer =
            await response.arrayBuffer();

          const resourcePath = url.slice(
            0,
            url.lastIndexOf('/') + 1,
          );

          let gltf;

          try {
            gltf = await parseGLTF(
              this.loader,
              arrayBuffer,
              resourcePath,
            );
          } catch (error) {
            if (!error.failureType) {
              error.failureType = 'parse_error';
            }

            error.httpStatus = response.status;

            throw error;
          }

          auditModelSuccess(
            key,
            relativePath,
            url,
            gltf,
            response.status,
          );

          if (this.disposed) {
            disposeModelResources([gltf.scene]);
            return null;
          }

          const source = gltf.scene;

          // People GLBs that ship in a T-pose get their arms lowered once, at load.
          fixCharacterPose(gltf, key, THREE);

          // Fewer draw calls: pieces of a static model that share a material
          // become one mesh (textures kept; wheels and doors stay separate).
          if (STATIC_MERGE_KEYS.has(key)) {
            try { mergeTexturedByMaterial(source); } catch (error) { console.debug('[ModelManager] merge skipped', key, error?.message || error); }
          }

          source.updateMatrixWorld(true);

          const originalBox = new THREE.Box3()
            .setFromObject(source);

          const originalSize = originalBox.getSize(
            new THREE.Vector3(),
          );

          const maxSize = Math.max(
            originalSize.x,
            originalSize.y,
            originalSize.z,
          );

          const horizontalSpan = Math.max(
            originalSize.x,
            originalSize.z,
          );

          const horizontalRatioLimit =
            key === 'flyover'
              ? 100
              : key === 'roadlight'
                ? 24
                : 18;

          const maxDimensionLimit =
            key === 'flyover'
              ? 650
              : 120;

          // Triangle budget: a single oversized model (for example a 48k-triangle
          // car or a 38k-triangle person) can freeze a phone when several appear.
          let sourceTriangles = 0;
          source.traverse((node) => {
            if (!node.isMesh || !node.geometry?.attributes?.position) return;
            const geo = node.geometry;
            sourceTriangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
          });
          const triangleCap = MAX_TRIANGLES_BY_KEY[key] || 0;
          const overTriangleBudget = triangleCap > 0 && sourceTriangles > triangleCap;
          if (overTriangleBudget) {
            console.warn(`[ModelManager] ${url} has ${Math.round(sourceTriangles)} triangles (limit ${triangleCap}); skipped`);
          }

          const invalidDimensions =
            overTriangleBudget ||
            !Number.isFinite(originalSize.x) ||
            !Number.isFinite(originalSize.y) ||
            !Number.isFinite(originalSize.z) ||
            !Number.isFinite(horizontalSpan) ||
            originalSize.y < 0.05 ||
            originalSize.y > 120 ||
            maxSize > maxDimensionLimit ||
            horizontalSpan >
              originalSize.y * horizontalRatioLimit;

          if (invalidDimensions) {
            const reason =
              'Model dimensions are invalid or outside the accepted size limits.';

            console.warn(
              `[ModelManager] rejected model ${url}`,
              originalSize,
            );

            auditModelRejected(
              key,
              relativePath,
              url,
              reason,
              {
                x: originalSize.x,
                y: originalSize.y,
                z: originalSize.z,
              },
              response.status,
            );

            disposeModelResources([source]);

            continue;
          }

          // --------------------------------------------------
          // NORMALISE DIMENSIONS
          // --------------------------------------------------

          const targetHeight =
            TARGET_HEIGHT[key] || 1.6;

          source.scale.multiplyScalar(
            targetHeight / originalSize.y,
          );

          source.updateMatrixWorld(true);

          const scaledBox = new THREE.Box3()
            .setFromObject(source);

          const center = scaledBox.getCenter(
            new THREE.Vector3(),
          );

          source.position.x -= center.x;
          source.position.y -= scaledBox.min.y;
          source.position.z -= center.z;

          repairMaterials(source);

          // --------------------------------------------------
          // ROOT WRAPPER
          // --------------------------------------------------

          const wrapper = new THREE.Group();

          wrapper.add(source);

          wrapper.position.set(0, 0, 0);

          // Preserve the orientation correction for vehicle GLBs.
          if (!UPRIGHT_KEYS.has(key)) {
            source.rotation.y = Math.PI;
          }

          wrapper.userData.modelPath = relativePath;
          wrapper.userData.targetHeight = targetHeight;
          wrapper.userData.modelKey = key;

          // --------------------------------------------------
          // SEATED DRIVER IN THE KEKE CABIN
          //
          // The driver is a child of the vehicle root, not a
          // world-space actor. It therefore stays inside the
          // keke when the vehicle moves, steers or reverses.
          //
          // Keep the driver separate from the GLB source group
          // so the vehicle orientation correction does not turn
          // the driver around.
          // --------------------------------------------------

          if (
            key === 'keke' &&
            !hasNamedDriver(source)
          ) {
            wrapper.add(
              createSeatedKekeDriver(),
            );

            wrapper.userData.seatedDriverAttached = true;
          }

          this.cache.set(key, wrapper);
          this.failed.delete(key);

          console.info(
            `[ModelManager] OK ${key} <- assets/models/${relativePath}`,
          );

          if (
            key === 'keke' &&
            wrapper.userData.seatedDriverAttached
          ) {
            console.info(
              '[ModelManager] Seated driver rig attached to the keke.',
            );
          }

          return wrapper;
        } catch (error) {
          auditModelFailure(
            key,
            relativePath,
            url,
            error,
            error?.httpStatus ??
              auditRecord.httpStatus,
          );

          if (this.disposed) return null;

          console.debug(
            `[ModelManager] asset unavailable ${url} (${classifyFailure(error)})`,
            safeErrorMessage(error),
          );
        }
      }

      this.failed.add(key);

      if (catalog.length === 0) {
        console.info(
          `[ModelManager] ${key} has no configured GLB candidates; use its procedural fallback.`,
        );
      } else {
        console.info(
          `[ModelManager] placeholder ${key} (no usable GLB found)`,
        );
      }

      return null;
    })();

    this.pending.set(key, task);

    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }

  // ----------------------------------------------------------
  // PRELOAD MULTIPLE CATEGORIES
  // ----------------------------------------------------------

  async preload(keys) {
    if (this.disposed) return [];

    const uniqueKeys = [...new Set(keys)];

    // Desktop retains parallel preload throughput. Phones load models in
    // sequence to avoid simultaneous GLB decoding, material creation and
    // texture uploads creating large CPU/memory spikes. The task yield after
    // each model lets the browser paint and process touch input between assets.
    if (!this.mobile) {
      return Promise.all(uniqueKeys.map((key) => this.load(key)));
    }

    const results = [];
    for (const key of uniqueKeys) {
      if (this.disposed) break;
      results.push(await this.load(key));
      if (this.disposed) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return results;
  }

  // ----------------------------------------------------------
  // GET INSTANCE
  //
  // Geometry is shared with the cache.
  // Materials are cloned for independent paint/customisation.
  // The seated-driver animation references are rebound to this
  // particular instance after cloning.
  // ----------------------------------------------------------

  getInstance(key) {
    if (this.disposed) return null;

    const model = this.cache.get(key);

    if (!model) return null;

    const clone = model.clone(true);

    clone.userData.sharedGeometry = true;
    clone.userData.modelManagerInstance = true;
    clone.userData.modelKey = key;
    clone.userData.modelPath = model.userData.modelPath;

    clone.traverse((object) => {
      if (!object.isMesh || !object.material) return;

      object.material = Array.isArray(object.material)
        ? object.material.map(
            (material) => material?.clone() || material,
          )
        : object.material.clone();
    });

    if (key === 'keke') {
      attachDriverAnimationReferences(clone);
    }

    return clone;
  }

  // ----------------------------------------------------------
  // CACHE DIAGNOSTICS
  // ----------------------------------------------------------

  getStatus() {
    return {
      loaded: [...this.cache.keys()],
      pending: [...this.pending.keys()],
      failed: [...this.failed.keys()],
      disposed: this.disposed,
    };
  }

  // ----------------------------------------------------------
  // DISPOSE
  // ----------------------------------------------------------

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    disposeModelResources(
      [...this.cache.values()],
    );

    this.cache.clear();
    this.failed.clear();
    this.pending.clear();
  }
}

// ============================================================
// PUBLIC EXPORTS
// ============================================================

export const MODEL_KEYS = CATALOG;
export const MODEL_TARGET_HEIGHT = TARGET_HEIGHT;