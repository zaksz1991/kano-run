// Kano Run — Traffic Factory
// Phase A upgrade module
//
// Distinct traffic silhouettes.
// Common return contract:
//   { mesh, type, wheels, lights, specialEffects, box }

import * as THREE from '../vendor/three.module.js';

function mat(
  color,
  roughness = 0.55,
  metalness = 0.12,
  emissive = 0x000000,
  emissiveIntensity = 0
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity
  });
}

function box(
  parent,
  name,
  size,
  position,
  material,
  rotation = null
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      size[0],
      size[1],
      size[2]
    ),
    material
  );

  mesh.name = name;
  mesh.position.set(
    position[0],
    position[1],
    position[2]
  );

  if (rotation) {
    mesh.rotation.set(
      rotation[0] || 0,
      rotation[1] || 0,
      rotation[2] || 0
    );
  }

  parent.add(mesh);

  return mesh;
}

function wheel(
  parent,
  x,
  z,
  radius = 0.22
) {
  const group =
    new THREE.Group();

  group.position.set(
    x,
    radius,
    z
  );

  const tire =
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius,
        radius,
        0.15,
        12
      ),
      mat(0x080d17, 0.96)
    );

  tire.rotation.z =
    Math.PI / 2;

  group.add(tire);

  const hub =
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius * 0.32,
        radius * 0.32,
        0.17,
        10
      ),
      mat(
        0x9ca8b5,
        0.3,
        0.65
      )
    );

  hub.rotation.z =
    Math.PI / 2;

  group.add(hub);

  parent.add(group);

  return group;
}

function profile(
  mesh,
  type,
  width,
  length,
  wheels = [],
  lights = [],
  specialEffects = []
) {
  mesh.userData.kind =
    type;

  mesh.userData.trafficProfile =
    type;

  return {
    mesh,
    type,
    wheels,
    lights,
    specialEffects,
    box: {
      worldX: 0,
      worldZ: 0,
      width,
      length
    }
  };
}

function createKeke(options = {}) {
  const g =
    new THREE.Group();

  const body =
    mat(
      options.color ?? 0xeab308,
      0.42,
      0.22
    );

  const dark =
    mat(0x172033, 0.78);

  const roof =
    mat(
      options.roofColor ?? 0xfde047,
      0.4,
      0.08
    );

  const glass =
    mat(
      0x234a69,
      0.14,
      0.35,
      0x071421,
      0.06
    );

  const wheels = [];

  box(
    g,
    'body',
    [1.25, 0.52, 1.4],
    [0, 0.57, -0.05],
    body
  );

  box(
    g,
    'lowerBody',
    [1.36, 0.2, 1.46],
    [0, 0.32, -0.04],
    dark
  );

  box(
    g,
    'passengerSeat',
    [1.05, 0.18, 0.52],
    [0, 0.77, -0.46],
    mat(0x5d392a, 0.84)
  );

  box(
    g,
    'canopy',
    [1.4, 0.1, 1.32],
    [0, 1.25, -0.05],
    roof
  );

  for (const side of [-1, 1]) {
    for (const z of [-0.5, 0.48]) {
      const p =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.035,
            0.045,
            0.62,
            8
          ),
          dark
        );

      p.position.set(
        side * 0.58,
        0.99,
        z
      );

      g.add(p);
    }
  }

  box(
    g,
    'windshield',
    [1.05, 0.38, 0.06],
    [0, 0.99, 0.59],
    glass
  );

  wheels.push(
    wheel(g, -0.58, -0.52, 0.245)
  );

  wheels.push(
    wheel(g, 0.58, -0.52, 0.245)
  );

  wheels.push(
    wheel(g, 0, 0.82, 0.225)
  );

  return profile(
    g,
    'keke',
    1.15,
    1.5,
    wheels
  );
}

function createSedan(options = {}) {
  const g =
    new THREE.Group();

  const body =
    mat(
      options.color ?? 0x64748b,
      0.38,
      0.3
    );

  const dark =
    mat(0x0f172a, 0.88);

  const glass =
    mat(
      0x24415f,
      0.15,
      0.4
    );

  const lights = [];

  box(
    g,
    'lowerBody',
    [1.46, 0.18, 2.15],
    [0, 0.3, 0],
    dark
  );

  box(
    g,
    'body',
    [1.4, 0.4, 2.35],
    [0, 0.46, 0],
    body
  );

  box(
    g,
    'hood',
    [1.28, 0.14, 0.58],
    [0, 0.61, 0.88],
    body
  );

  box(
    g,
    'cabin',
    [1.2, 0.45, 1.18],
    [0, 0.78, -0.12],
    body
  );

  box(
    g,
    'windows',
    [1.08, 0.28, 1],
    [0, 0.84, -0.12],
    glass
  );

  for (const x of [-0.4, 0.4]) {
    lights.push(
      box(
        g,
        `headlight-${x}`,
        [0.18, 0.1, 0.06],
        [x, 0.45, 1.19],
        mat(
          0xfde047,
          0.25,
          0,
          0xfbbf24,
          0.55
        )
      )
    );
  }

  const wheels = [
    wheel(g, -0.57, 0.8),
    wheel(g, 0.57, 0.8),
    wheel(g, -0.57, -0.78),
    wheel(g, 0.57, -0.78)
  ];

  return profile(
    g,
    'sedan',
    1.35,
    2.35,
    wheels,
    lights
  );
}

function createTaxi() {
  const result =
    createSedan({
      color: 0xf8fafc
    });

  result.type =
    'taxi';

  result.mesh.userData.kind =
    'taxi';

  box(
    result.mesh,
    'taxiStripe',
    [1.42, 0.08, 1.55],
    [0, 0.57, -0.08],
    mat(0x16a34a, 0.65)
  );

  box(
    result.mesh,
    'taxiRoofSign',
    [0.5, 0.13, 0.28],
    [0, 1.08, -0.15],
    mat(0x22c55e, 0.55)
  );

  return result;
}

function createBus() {
  const g =
    new THREE.Group();

  const body =
    mat(0x0f766e, 0.55, 0.16);

  const lower =
    mat(0x164e63, 0.82);

  const glass =
    mat(0x1e3a5f, 0.18, 0.35);

  box(
    g,
    'busShell',
    [1.78, 1.15, 3.05],
    [0, 0.75, 0],
    body
  );

  box(
    g,
    'busLower',
    [1.86, 0.2, 2.95],
    [0, 0.22, 0],
    lower
  );

  for (const z of [
    -0.82,
    0,
    0.82
  ]) {
    box(
      g,
      `window-${z}`,
      [1.54, 0.34, 0.08],
      [0, 0.99, z],
      glass
    );
  }

  const wheels = [
    wheel(g, -0.69, 1.0, 0.25),
    wheel(g, 0.69, 1.0, 0.25),
    wheel(g, -0.69, -1.0, 0.25),
    wheel(g, 0.69, -1.0, 0.25)
  ];

  return profile(
    g,
    'bus',
    1.7,
    3.05,
    wheels
  );
}

function createMotorcycle() {
  const g =
    new THREE.Group();

  const dark =
    mat(0x111827, 0.9);

  const body =
    mat(0xef4444, 0.5, 0.18);

  const chrome =
    mat(
      0xadb8c3,
      0.28,
      0.7
    );

  const wheels = [];

  wheels.push(
    wheel(g, 0, -0.5, 0.19)
  );

  wheels.push(
    wheel(g, 0, 0.55, 0.19)
  );

  box(
    g,
    'frame',
    [0.12, 0.12, 1.15],
    [0, 0.37, 0.02],
    chrome
  );

  const tank =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.26,
        12,
        8
      ),
      body
    );

  tank.scale.set(
    0.72,
    0.7,
    1.15
  );

  tank.position.set(
    0,
    0.54,
    0.02
  );

  g.add(tank);

  box(
    g,
    'seat',
    [0.32, 0.09, 0.45],
    [0, 0.65, -0.36],
    dark
  );

  box(
    g,
    'handlebar',
    [0.5, 0.04, 0.05],
    [0, 0.76, 0.55],
    chrome
  );

  return profile(
    g,
    'motorcycle',
    0.62,
    1.15,
    wheels
  );
}

function createTruck() {
  const g =
    new THREE.Group();

  const cab =
    mat(0xb91c1c, 0.55, 0.18);

  const cargo =
    mat(0xd6d3d1, 0.75);

  const glass =
    mat(0x24415f, 0.18, 0.35);

  const wheels = [];

  box(
    g,
    'cargo',
    [1.92, 1.55, 1.9],
    [0, 1.0, -0.55],
    cargo
  );

  box(
    g,
    'cab',
    [1.92, 1.15, 0.96],
    [0, 0.78, 0.86],
    cab
  );

  box(
    g,
    'windshield',
    [1.46, 0.34, 0.06],
    [0, 1.02, 1.36],
    glass
  );

  for (const z of [
    -0.92,
    0.7
  ]) {
    wheels.push(
      wheel(
        g,
        -0.72,
        z,
        0.27
      )
    );

    wheels.push(
      wheel(
        g,
        0.72,
        z,
        0.27
      )
    );
  }

  return profile(
    g,
    'truck',
    1.85,
    2.85,
    wheels
  );
}

function createEnforcer(
  type
) {
  const police =
    type === 'police';

  const base =
    createSedan({
      color:
        police
          ? 0x1e40af
          : 0xf59e0b
    });

  base.type =
    type;

  base.mesh.userData.kind =
    type;

  const bar =
    new THREE.Group();

  bar.name =
    'warningBar';

  bar.position.y =
    1.08;

  box(
    bar,
    'bar',
    [0.75, 0.1, 0.24],
    [0, 0, -0.1],
    mat(0x1e293b, 0.5)
  );

  const red =
    box(
      bar,
      'red',
      [0.28, 0.1, 0.2],
      [-0.2, 0, -0.1],
      mat(
        0xef4444,
        0.25,
        0,
        0xef4444,
        0.8
      )
    );

  const blue =
    box(
      bar,
      'blue',
      [0.28, 0.1, 0.2],
      [0.2, 0, -0.1],
      mat(
        0x3b82f6,
        0.25,
        0,
        0x3b82f6,
        0.8
      )
    );

  base.mesh.add(bar);

  base.lights.push(
    red,
    blue
  );

  if (!police) {
    box(
      base.mesh,
      'karotaStripe',
      [1.48, 0.1, 0.42],
      [0, 0.56, -0.1],
      mat(0x111827, 0.7)
    );
  }

  base.specialEffects.push(
    bar
  );

  return base;
}

export function createTrafficVehicle(
  type = 'sedan',
  options = {}
) {
  switch (type) {
    case 'keke':
      return createKeke(options);

    case 'car':
    case 'sedan':
      return createSedan(options);

    case 'taxi':
      return createTaxi();

    case 'bus':
      return createBus();

    case 'motorcycle':
      return createMotorcycle();

    case 'truck':
      return createTruck();

    case 'police':
      return createEnforcer(
        'police'
      );

    case 'karota':
      return createEnforcer(
        'karota'
      );

    default:
      return createSedan(options);
  }
}

export function updateTrafficVehicle(
  vehicle,
  state = {},
  dt = 1 / 60
) {
  if (!vehicle) return;

  const mesh =
    vehicle.mesh || vehicle;

  const speed =
    Number.isFinite(Number(state.speed))
      ? Number(state.speed)
      : 0;

  const steer =
    Number.isFinite(
      Number(state.steerAmount)
    )
      ? Number(state.steerAmount)
      : 0;

  const wheelSpin =
    speed *
    dt *
    0.65;

  for (const wheelMesh of
    vehicle.wheels ||
    mesh.userData.wheels ||
    []) {
    wheelMesh.rotation.x +=
      wheelSpin;
  }

  const targetRotation =
    steer * -0.05;

  mesh.rotation.z +=
    (targetRotation -
      mesh.rotation.z) *
    Math.min(1, dt * 8);

  if (vehicle.box) {
    vehicle.box.worldX =
      mesh.position.x;

    vehicle.box.worldZ =
      mesh.position.z;
  }

  if (
    vehicle.type === 'police' ||
    vehicle.type === 'karota'
  ) {
    const phase =
      performance.now() *
      0.008;

    for (const light of
      vehicle.lights || []) {
      if (
        light.material &&
        light.material.emissive
      ) {
        light.material.emissiveIntensity =
          0.35 +
          Math.abs(
            Math.sin(phase)
          ) *
            1.1;
      }
    }
  }
}

export function disposeTrafficVehicle(
  vehicle
) {
  if (!vehicle) return;

  const mesh =
    vehicle.mesh || vehicle;

  mesh.traverse((node) => {
    if (!node.isMesh) return;

    node.geometry?.dispose?.();

    if (Array.isArray(node.material)) {
      node.material.forEach(
        (m) => m?.dispose?.()
      );
    } else {
      node.material?.dispose?.();
    }
  });

  mesh.parent?.remove(mesh);
}

export default createTrafficVehicle;