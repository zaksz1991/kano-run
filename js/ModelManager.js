import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
  bus: [
    'vehicles/special/bus.glb',
    'vehicles/cars/quaternius_cc0-truck-1449.glb',
  ],
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
    'vehicles/special/bus.glb',
  ],
  passenger: [
    'characters/passengers/hijab_muslim_woman.glb',
    'characters/passengers/Man.glb',
    'characters/passengers/Man in Suit.glb',
    'characters/passengers/women_in_hijab.glb',
  ],
  passengerWoman: [
    'characters/passengers/hijab_muslim_woman.glb',
    'characters/passengers/women_in_hijab.glb',
    'characters/passengers/hijab_muslim_woman 2.glb',
    'characters/passengers/free_download_attractive_african_woman_236.glb',
    'characters/passengers/woman with her arms crossed.glb',
  ],
  passengerMan: [
    'characters/passengers/Man.glb',
    'characters/passengers/Man-fjHyMd5Wxw.glb',
    'characters/passengers/handsome_man_in_casual_clothes_in_a-pose_86.glb',
    'characters/passengers/tekamist_mens.glb',
  ],
  passengerVIP: [
    'characters/passengers/Man in Suit.glb',
    'characters/passengers/Man-fjHyMd5Wxw.glb',
    'characters/passengers/handsome_man_in_casual_clothes_in_a-pose_86.glb',
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
    'characters/pedestrians/muslim_girl.glb',
    'characters/pedestrians/keke female.glb',
    'characters/passengers/women_in_hijab.glb',
    'characters/passengers/hijab_muslim_woman.glb',
    'characters/pedestrians/low_poly_people_free_sample_pack.glb',
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
    'world/roads/kowloon_bay_flyover.glb',
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
  bench: ['world/props/Bench.glb'],
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

  const status = Number(error?.httpStatus ?? error?.status);

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
    /parse|json|gltf|glb|buffer|unexpected token|magic/.test(message)
  ) {
    return 'parse_error';
  }

  return 'load_error';
}

export function auditModelStart(key, relativePath, url) {
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

  MODEL_ASSET_AUDIT.set(auditId(key, relativePath), record);

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
    MODEL_ASSET_AUDIT.get(auditId(key, relativePath)) ||
    auditModelStart(key, relativePath, url);

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
    MODEL_ASSET_AUDIT.get(auditId(key, relativePath)) ||
    auditModelStart(key, relativePath, url);

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
    MODEL_ASSET_AUDIT.get(auditId(key, relativePath)) ||
    auditModelStart(key, relativePath, url);

  record.status = 'rejected';
  record.failureType = 'invalid_dimensions';
  record.error =
    typeof reason === 'string' ? reason : safeErrorMessage(reason);
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
  const attemptedAssets = [...MODEL_ASSET_AUDIT.values()].map(
    (record) => ({ ...record }),
  );

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

    return String(a.path).localeCompare(String(b.path));
  });

  const count = (status) =>
    assets.filter((asset) => asset.status === status).length;

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
// MODEL RESOURCE MANAGEMENT
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

      material.side = THREE.DoubleSide;

      if (
        Number.isFinite(material.opacity) &&
        material.opacity < 0.12
      ) {
        material.opacity = 0.85;
        material.transparent = true;
      }

      material.needsUpdate = true;
    }
  });
}

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
        if (!material || materials.has(material)) continue;

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

// Cloned actor materials are disposed separately because their geometry
// and textures can be shared with the cached model.
function disposeInstanceMaterials(root) {
  const materials = new Set();

  root?.traverse((object) => {
    const materialList = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    for (const material of materialList) {
      if (!material || materials.has(material)) continue;

      materials.add(material);
      material.dispose();
    }
  });
}

function parseGLTF(loader, arrayBuffer, resourcePath) {
  if (typeof loader.parseAsync === 'function') {
    return loader.parseAsync(arrayBuffer, resourcePath);
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
    response.status === 404 ? 'http_404' : 'http_error';

  return error;
}

// ============================================================
// SEATED KEKE DRIVER RIG
// ============================================================

const DRIVER_RIG_NAME = 'KANO_SEATED_DRIVER_RIG';
const DRIVER_BODY_NAME = 'KANO_DRIVER_BODY';
const DRIVER_HEAD_NAME = 'KANO_DRIVER_HEAD';
const DRIVER_LEFT_ARM_NAME = 'KANO_DRIVER_LEFT_ARM';
const DRIVER_RIGHT_ARM_NAME = 'KANO_DRIVER_RIGHT_ARM';

function makeLimbBetween(
  start,
  end,
  radiusTop,
  radiusBottom,
  material,
  segments = 8,
) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);

  const direction = new THREE.Vector3().subVectors(
    to,
    from,
  );

  const length = direction.length();

  const limb = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      Math.max(0.01, length),
      segments,
    ),
    material,
  );

  limb.position.copy(from).add(to).multiplyScalar(0.5);

  limb.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );

  limb.castShadow = false;
  limb.receiveShadow = false;

  return limb;
}

function makeDriverMaterial(
  color,
  roughness = 0.86,
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

function createSeatedDriverRig() {
  const rig = new THREE.Group();

  rig.name = DRIVER_RIG_NAME;
  rig.userData.proceduralSeatedDriver = true;
  rig.userData.animationClock = 0;

  const body = new THREE.Group();

  body.name = DRIVER_BODY_NAME;
  rig.add(body);

  const shirt = makeDriverMaterial(0x236348);
  const shirtLight = makeDriverMaterial(0x39795a);
  const skin = makeDriverMaterial(0x70452f);
  const trousers = makeDriverMaterial(0x2d3437);
  const shoe = makeDriverMaterial(0x171c20);
  const cap = makeDriverMaterial(0x174a37);
  const capBand = makeDriverMaterial(0xd3b46a);

  // Seated hips and torso.
  const hips = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.31),
    trousers,
  );

  hips.name = 'KANO_DRIVER_HIPS';
  hips.position.set(0, 0.79, 0.04);
  body.add(hips);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.17, 0.28, 4, 8),
    shirt,
  );

  torso.name = 'KANO_DRIVER_TORSO';
  torso.position.set(0, 1.08, 0.02);
  torso.rotation.x = -0.08;
  body.add(torso);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.09, 0.09, 10),
    shirtLight,
  );

  collar.position.set(0, 1.31, -0.035);
  body.add(collar);

  // The head pivot supports independent head movement.
  const headPivot = new THREE.Group();

  headPivot.name = DRIVER_HEAD_NAME;
  headPivot.position.set(0, 1.34, -0.075);
  body.add(headPivot);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.132, 14, 12),
    skin,
  );

  head.name = 'KANO_DRIVER_FACE';
  head.position.set(0, 0.135, 0);
  head.scale.set(0.93, 1.08, 0.94);
  headPivot.add(head);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.064, 0.11, 9),
    skin,
  );

  neck.position.set(0, 0.045, 0.018);
  headPivot.add(neck);

  const capDome = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.135,
      12,
      8,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.53,
    ),
    cap,
  );

  capDome.name = 'KANO_DRIVER_CAP';
  capDome.position.set(0, 0.246, -0.004);
  capDome.scale.set(1.02, 0.76, 1.0);
  headPivot.add(capDome);

  const capRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.119, 0.012, 5, 16),
    capBand,
  );

  capRim.position.set(0, 0.216, 0);
  capRim.rotation.x = Math.PI / 2;
  headPivot.add(capRim);

  // Bent legs are positioned in a seated pose.
  for (const side of [-1, 1]) {
    const thighStart = [
      side * 0.105,
      0.77,
      0.075,
    ];

    const knee = [
      side * 0.13,
      0.56,
      -0.12,
    ];

    const ankle = [
      side * 0.13,
      0.405,
      -0.37,
    ];

    body.add(
      makeLimbBetween(
        thighStart,
        knee,
        0.093,
        0.115,
        trousers,
        8,
      ),
    );

    body.add(
      makeLimbBetween(
        knee,
        ankle,
        0.073,
        0.088,
        trousers,
        8,
      ),
    );

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.075, 0.22),
      shoe,
    );

    foot.position.set(
      side * 0.13,
      0.365,
      -0.43,
    );

    body.add(foot);
  }

  // Arms are pivoted at the shoulders.
  const armDescriptors = [
    {
      side: -1,
      name: DRIVER_LEFT_ARM_NAME,
      elbow: [-0.105, -0.115, -0.19],
      hand: [-0.13, -0.24, -0.44],
    },
    {
      side: 1,
      name: DRIVER_RIGHT_ARM_NAME,
      elbow: [0.105, -0.115, -0.19],
      hand: [0.13, -0.24, -0.44],
    },
  ];

  for (const descriptor of armDescriptors) {
    const arm = new THREE.Group();

    arm.name = descriptor.name;
    arm.position.set(
      descriptor.side * 0.17,
      1.245,
      -0.015,
    );

    body.add(arm);

    arm.add(
      makeLimbBetween(
        [0, 0, 0],
        descriptor.elbow,
        0.061,
        0.075,
        shirt,
        8,
      ),
    );

    arm.add(
      makeLimbBetween(
        descriptor.elbow,
        descriptor.hand,
        0.047,
        0.055,
        shirtLight,
        8,
      ),
    );

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 9, 8),
      skin,
    );

    hand.position.set(...descriptor.hand);
    arm.add(hand);

    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.049, 0.049, 0.075, 8),
      shirt,
    );

    cuff.position.set(
      descriptor.hand[0] * 0.84,
      descriptor.hand[1] * 0.84,
      descriptor.hand[2] * 0.84,
    );

    arm.add(cuff);
  }

  // Handlebar and grips.
  const handlebar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.46, 8),
    makeDriverMaterial(0x4b5559, 0.55),
  );

  handlebar.name = 'KANO_DRIVER_HANDLEBAR';
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 1.015, -0.47);
  body.add(handlebar);

  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.033, 0.033, 0.12, 8),
      shoe,
    );

    grip.rotation.z = Math.PI / 2;
    grip.position.set(side * 0.22, 1.015, -0.47);
    body.add(grip);
  }

  rig.userData.driverRigVersion = 1;

  return rig;
}

// ============================================================
// DRIVER ANIMATION
// ============================================================

export function updateDriverAnimation(
  instance,
  deltaSeconds,
  {
    speed = 0,
    steer = 0,
    reverse = false,
    crashShake = 0,
  } = {},
) {
  const rig = instance?.getObjectByName?.(
    DRIVER_RIG_NAME,
  );

  if (!rig) return false;

  const dt = THREE.MathUtils.clamp(
    Number(deltaSeconds) || 0,
    0,
    0.05,
  );

  const velocity = THREE.MathUtils.clamp(
    Math.abs(Number(speed) || 0),
    0,
    1.8,
  );

  const steering = THREE.MathUtils.clamp(
    Number(steer) || 0,
    -1,
    1,
  );

  const shaking = THREE.MathUtils.clamp(
    Number(crashShake) || 0,
    0,
    1,
  );

  rig.userData.animationClock =
    (Number(rig.userData.animationClock) || 0) + dt;

  const time = rig.userData.animationClock;

  const movingWobble =
    Math.sin(time * (2.2 + velocity * 8)) *
    (0.002 + velocity * 0.004);

  const body = rig.getObjectByName(
    DRIVER_BODY_NAME,
  );

  const head = rig.getObjectByName(
    DRIVER_HEAD_NAME,
  );

  const leftArm = rig.getObjectByName(
    DRIVER_LEFT_ARM_NAME,
  );

  const rightArm = rig.getObjectByName(
    DRIVER_RIGHT_ARM_NAME,
  );

  if (body) {
    body.position.y =
      movingWobble +
      Math.sin(time * 27) * shaking * 0.008;

    body.rotation.z = -steering * 0.035;
    body.rotation.x = reverse
      ? 0.035
      : -0.012 * velocity;
  }

  if (head) {
    head.rotation.y =
      steering * 0.16 +
      Math.sin(time * 0.75) * 0.018;

    head.rotation.x = reverse
      ? 0.055
      : Math.sin(time * 0.6) * 0.012;
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

function hasEmbeddedDriver(root) {
  let found = false;

  const characterName =
    /(^|[_ .-])(driver|rider|mannequin|human|person)([_ .-]|$)/i;

  root?.traverse((object) => {
    if (found) return;

    if (
      object.name &&
      characterName.test(object.name)
    ) {
      found = true;
    }
  });

  return found;
}

// ============================================================
// MODEL MANAGER
// ============================================================

export class ModelManager {
  constructor({
    basePath = '/assets/models/',
  } = {}) {
    this.loader = new GLTFLoader();

    this.basePath = basePath.endsWith('/')
      ? basePath
      : `${basePath}/`;

    this.cache = new Map();
    this.pending = new Map();
    this.failed = new Set();
    this.instances = new Set();
    this.disposed = false;
  }

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
      for (const relativePath of catalog) {
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
          // Fetch directly to distinguish HTTP failures from GLB parsing errors.
          const response = await fetch(url, {
            credentials: 'same-origin',
          });

          auditRecord.httpStatus = response.status;

          if (!response.ok) {
            throw createHttpError(response, url);
          }

          const arrayBuffer = await response.arrayBuffer();

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

          source.updateMatrixWorld(true);

          const originalBox = new THREE.Box3().setFromObject(
            source,
          );

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
            key === 'flyover' ? 650 : 120;

          const invalidDimensions =
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

          const targetHeight =
            TARGET_HEIGHT[key] || 1.6;

          source.scale.multiplyScalar(
            targetHeight / originalSize.y,
          );

          source.updateMatrixWorld(true);

          const scaledBox = new THREE.Box3().setFromObject(
            source,
          );

          const center = scaledBox.getCenter(
            new THREE.Vector3(),
          );

          // Normalize the model inside its wrapper.
          source.position.x -= center.x;
          source.position.y -= scaledBox.min.y;
          source.position.z -= center.z;

          repairMaterials(source);

          const wrapper = new THREE.Group();

          wrapper.add(source);
          wrapper.position.set(0, 0, 0);

          // Keep the wrapper available for gameplay rotation.
          if (!UPRIGHT_KEYS.has(key)) {
            source.rotation.y = Math.PI;
          }

          wrapper.userData.modelPath = relativePath;
          wrapper.userData.targetHeight = targetHeight;
          wrapper.userData.modelKey = key;

          // Add a seated procedural driver to vehicle-only keke models.
          // Do not add the procedural driver if a named rider is embedded.
          if (
            key === 'keke' &&
            !hasEmbeddedDriver(source)
          ) {
            wrapper.add(createSeatedDriverRig());

            wrapper.userData.hasProceduralDriver = true;
          }

          this.cache.set(key, wrapper);
          this.failed.delete(key);

          console.info(
            `[ModelManager] OK ${key} <- assets/models/${relativePath}`,
          );

          return wrapper;
        } catch (error) {
          auditModelFailure(
            key,
            relativePath,
            url,
            error,
            error?.httpStatus ?? auditRecord.httpStatus,
          );

          if (this.disposed) return null;

          // Continue to the next candidate when an asset is unavailable.
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

  async preload(keys) {
    if (this.disposed) return [];

    return Promise.all(
      [...new Set(keys)].map((key) => this.load(key)),
    );
  }

  getInstance(key) {
    const model = this.cache.get(key);

    if (!model || this.disposed) {
      return null;
    }

    const clone = model.clone(true);

    clone.userData.sharedGeometry = true;
    clone.userData.modelManagerInstance = true;
    clone.userData.modelKey = key;

    clone.traverse((object) => {
      if (!object.isMesh || !object.material) return;

      object.material = Array.isArray(object.material)
        ? object.material.map(
            (material) => material?.clone() || material,
          )
        : object.material.clone();
    });

    this.instances.add(clone);

    return clone;
  }

  // Call when a cloned actor is permanently removed from the scene.
  releaseInstance(instance) {
    if (
      !instance ||
      !this.instances.has(instance)
    ) {
      return false;
    }

    disposeInstanceMaterials(instance);
    this.instances.delete(instance);

    return true;
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    for (const instance of [...this.instances]) {
      this.releaseInstance(instance);
    }

    disposeModelResources([...this.cache.values()]);

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