// Kano Run — Keke Factory
// Phase A upgrade module
//
// Creates a reusable, hierarchical keke.
// The geometry is intentionally independent from Game.

import * as THREE from '../vendor/three.module.js';

function colorValue(value, fallback) {
  return value ?? fallback;
}

function material(
  color,
  {
    roughness = 0.55,
    metalness = 0.12,
    transparent = false,
    opacity = 1,
    emissive = 0x000000,
    emissiveIntensity = 0
  } = {}
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    transparent,
    opacity,
    emissive,
    emissiveIntensity,
    depthWrite: !transparent
  });
}

function addBox(
  parent,
  name,
  size,
  position,
  mat,
  rotation = null
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      size[0],
      size[1],
      size[2]
    ),
    mat
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

function addCylinder(
  parent,
  name,
  radiusTop,
  radiusBottom,
  height,
  position,
  mat,
  rotation = null,
  segments = 12
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      segments
    ),
    mat
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

function addWheel(
  parent,
  name,
  x,
  z,
  radius,
  tire,
  hub
) {
  const wheel = new THREE.Group();
  wheel.name = name;

  wheel.position.set(
    x,
    radius,
    z
  );

  const tyreMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius,
      radius,
      0.18,
      16
    ),
    tire
  );

  tyreMesh.rotation.z =
    Math.PI / 2;

  wheel.add(tyreMesh);

  const hubMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius * 0.34,
      radius * 0.34,
      0.2,
      12
    ),
    hub
  );

  hubMesh.rotation.z =
    Math.PI / 2;

  wheel.add(hubMesh);

  parent.add(wheel);

  return wheel;
}

function addPerson(parent, options = {}) {
  const skin = material(
    options.skinColor ?? 0x6b4029,
    {
      roughness: 0.72
    }
  );

  const shirt = material(
    options.shirtColor ?? 0x2563eb,
    {
      roughness: 0.82
    }
  );

  const dark = material(
    options.trouserColor ?? 0x18202c,
    {
      roughness: 0.9
    }
  );

  const person = new THREE.Group();
  person.name =
    options.name || 'driver';

  const torso = addBox(
    person,
    'torso',
    [0.28, 0.5, 0.22],
    [0, 0.68, 0],
    shirt
  );

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.14,
      10,
      8
    ),
    skin
  );

  head.name = 'head';
  head.position.set(
    0,
    1.03,
    0
  );

  person.add(head);

  for (const side of [-1, 1]) {
    addBox(
      person,
      `leg-${side}`,
      [0.09, 0.42, 0.1],
      [side * 0.075, 0.24, 0],
      dark
    );

    addBox(
      person,
      `arm-${side}`,
      [0.08, 0.34, 0.09],
      [side * 0.19, 0.68, 0],
      skin,
      [0, 0, side * 0.16]
    );
  }

  torso.userData.role =
    'driver-body';

  parent.add(person);

  return person;
}

export function createPlayerKeke(options = {}) {
  const paintColor =
    colorValue(
      options.paintColor,
      0xfbbf24
    );

  const accentColor =
    colorValue(
      options.accentColor,
      0x172033
    );

  const driverColor =
    colorValue(
      options.driverColor,
      0x2563eb
    );

  const group =
    new THREE.Group();

  group.name =
    'playerKeke';

  const chassis =
    new THREE.Group();

  chassis.name =
    'chassis';

  group.add(chassis);

  const bodyMaterial =
    material(
      paintColor,
      {
        roughness: 0.42,
        metalness: 0.22
      }
    );

  const accentMaterial =
    material(
      accentColor,
      {
        roughness: 0.78,
        metalness: 0.08
      }
    );

  const chrome =
    material(
      0xb8c4d1,
      {
        roughness: 0.28,
        metalness: 0.72
      }
    );

  const rubber =
    material(
      0x080d17,
      {
        roughness: 0.97
      }
    );

  const glass =
    material(
      0x234a69,
      {
        roughness: 0.12,
        metalness: 0.34,
        transparent: true,
        opacity: 0.7,
        emissive: 0x071421,
        emissiveIntensity: 0.08
      }
    );

  const seatMaterial =
    material(
      0x5d392a,
      {
        roughness: 0.84
      }
    );

  const lightMaterial =
    material(
      0xfde047,
      {
        roughness: 0.25,
        emissive: 0xfbbf24,
        emissiveIntensity: 0.85
      }
    );

  const redLightMaterial =
    material(
      0xef4444,
      {
        roughness: 0.35,
        emissive: 0x7f1d1d,
        emissiveIntensity: 0.55
      }
    );

  // Lower chassis.
  addBox(
    chassis,
    'lowerBodyPanel',
    [1.38, 0.2, 1.5],
    [0, 0.32, -0.03],
    accentMaterial
  );

  // Main body.
  addBox(
    chassis,
    'bodyPanel',
    [1.27, 0.52, 1.38],
    [0, 0.58, -0.06],
    bodyMaterial
  );

  // Angled front panel.
  addBox(
    chassis,
    'frontPanel',
    [1.08, 0.38, 0.34],
    [0, 0.58, 0.78],
    accentMaterial,
    [-0.06, 0, 0]
  );

  // Side panels.
  addBox(
    chassis,
    'sidePanelLeft',
    [0.1, 0.46, 1.18],
    [-0.64, 0.58, -0.05],
    bodyMaterial,
    [0, 0.03, -0.03]
  );

  addBox(
    chassis,
    'sidePanelRight',
    [0.1, 0.46, 1.18],
    [0.64, 0.58, -0.05],
    bodyMaterial,
    [0, -0.03, 0.03]
  );

  // Rear panel.
  addBox(
    chassis,
    'rearPanel',
    [1.22, 0.45, 0.12],
    [0, 0.59, -0.73],
    bodyMaterial
  );

  // Passenger bench.
  addBox(
    chassis,
    'passengerBench',
    [1.06, 0.18, 0.52],
    [0, 0.77, -0.46],
    seatMaterial
  );

  addBox(
    chassis,
    'passengerBackrest',
    [1.08, 0.4, 0.11],
    [0, 0.98, -0.68],
    seatMaterial
  );

  // Driver seat.
  addBox(
    chassis,
    'driverSeat',
    [0.46, 0.18, 0.42],
    [0, 0.74, 0.27],
    seatMaterial
  );

  // Canopy.
  const canopy =
    new THREE.Group();

  canopy.name =
    'roofCanopy';

  group.add(canopy);

  addBox(
    canopy,
    'canopyTop',
    [1.42, 0.11, 1.34],
    [0, 1.27, -0.06],
    bodyMaterial
  );

  // Canopy frame.
  for (const side of [-1, 1]) {
    addCylinder(
      canopy,
      `frontSupport-${side}`,
      0.038,
      0.048,
      0.65,
      [side * 0.59, 1.0, 0.5],
      accentMaterial,
      null,
      10
    );

    addCylinder(
      canopy,
      `rearSupport-${side}`,
      0.038,
      0.048,
      0.65,
      [side * 0.59, 1.0, -0.52],
      accentMaterial,
      null,
      10
    );
  }

  // Windshield.
  addBox(
    group,
    'windshield',
    [1.06, 0.4, 0.055],
    [0, 1.0, 0.59],
    glass,
    [-0.04, 0, 0]
  );

  addBox(
    group,
    'windshieldFrame',
    [1.16, 0.07, 0.07],
    [0, 1.21, 0.61],
    accentMaterial
  );

  // Dashboard.
  addBox(
    group,
    'dashboard',
    [0.9, 0.12, 0.3],
    [0, 0.91, 0.34],
    accentMaterial
  );

  // Steering column.
  const steeringColumn =
    addCylinder(
      group,
      'steeringColumn',
      0.035,
      0.045,
      0.3,
      [0, 0.98, 0.29],
      chrome,
      [0.35, 0, 0],
      10
    );

  steeringColumn.userData.baseRotationX =
    steeringColumn.rotation.x;

  // Steering handle.
  const steering =
    new THREE.Mesh(
      new THREE.TorusGeometry(
        0.16,
        0.025,
        8,
        16
      ),
      chrome
    );

  steering.name =
    'steeringHandle';

  steering.rotation.x =
    Math.PI / 2;

  steering.position.set(
    0,
    1.08,
    0.24
  );

  group.add(steering);

  // Mudguards.
  for (const side of [-1, 1]) {
    addBox(
      chassis,
      `frontMudguard-${side}`,
      [0.2, 0.09, 0.54],
      [side * 0.57, 0.48, 0.73],
      bodyMaterial,
      [0, 0, side * 0.08]
    );

    addBox(
      chassis,
      `rearMudguard-${side}`,
      [0.2, 0.09, 0.54],
      [side * 0.57, 0.48, -0.52],
      bodyMaterial,
      [0, 0, side * -0.08]
    );
  }

  // Wheels.
  const wheels = [];

  wheels.push(
    addWheel(
      group,
      'frontWheel',
      0,
      0.82,
      0.225,
      rubber,
      chrome
    )
  );

  wheels.push(
    addWheel(
      group,
      'rearWheelLeft',
      -0.59,
      -0.52,
      0.245,
      rubber,
      chrome
    )
  );

  wheels.push(
    addWheel(
      group,
      'rearWheelRight',
      0.59,
      -0.52,
      0.245,
      rubber,
      chrome
    )
  );

  // Suspension.
  const suspension =
    new THREE.Group();

  suspension.name =
    'suspension';

  group.add(suspension);

  addBox(
    suspension,
    'frontSuspension',
    [0.08, 0.42, 0.08],
    [0, 0.46, 0.78],
    chrome,
    [-0.16, 0, 0]
  );

  for (const side of [-1, 1]) {
    addBox(
      suspension,
      `rearSuspension-${side}`,
      [0.06, 0.3, 0.06],
      [side * 0.52, 0.42, -0.52],
      chrome
    );
  }

  // Front lamps.
  for (const side of [-1, 1]) {
    addBox(
      group,
      `headlight-${side}`,
      [0.18, 0.14, 0.06],
      [side * 0.32, 0.63, 0.98],
      lightMaterial
    );

    addBox(
      group,
      `tailLight-${side}`,
      [0.15, 0.12, 0.05],
      [side * 0.35, 0.55, -0.79],
      redLightMaterial
    );
  }

  // Front bumper.
  addBox(
    group,
    'bumper',
    [1.04, 0.08, 0.14],
    [0, 0.36, 1.02],
    chrome
  );

  // Mirrors.
  for (const side of [-1, 1]) {
    addBox(
      group,
      `mirrorStem-${side}`,
      [0.045, 0.05, 0.26],
      [side * 0.56, 1.12, 0.53],
      chrome,
      [0, side * 0.25, 0]
    );

    addBox(
      group,
      `mirror-${side}`,
      [0.17, 0.13, 0.05],
      [side * 0.67, 1.18, 0.45],
      accentMaterial
    );
  }

  // Registration plate.
  addBox(
    group,
    'registrationPlate',
    [0.45, 0.14, 0.04],
    [0, 0.36, 1.06],
    material(0xf8fafc, {
      roughness: 0.55
    })
  );

  // Exhaust.
  addCylinder(
    group,
    'exhaust',
    0.035,
    0.05,
    0.62,
    [0.48, 0.3, -0.72],
    chrome,
    [Math.PI / 2, 0, 0],
    10
  );

  // Driver.
  const driver =
    addPerson(group, {
      name: 'driver',
      skinColor:
        options.driverSkinColor ??
        0x6b4029,
      shirtColor:
        driverColor,
      trouserColor:
        0x1e293b
    });

  driver.position.set(
    0,
    0,
    0.15
  );

  // Metadata.
  group.userData.kind =
    'keke';

  group.userData.type =
    'player';

  group.userData.wheels =
    wheels;

  group.userData.steering =
    steering;

  group.userData.driver =
    driver;

  group.userData.chassis =
    chassis;

  group.userData.baseY = 0;

  group.userData.animation = {
    wheelSpin: 0,
    steering: 0,
    suspension: 0,
    speed: 0
  };

  group.userData.box = {
    worldX: 0,
    worldZ: 5.5,
    width: 1.15,
    length: 1.5
  };

  return group;
}

export function updateKekeAnimation(
  keke,
  state = {},
  dt = 1 / 60
) {
  if (!keke) return;

  const data =
    keke.userData.animation ||
    (keke.userData.animation = {
      wheelSpin: 0,
      steering: 0,
      suspension: 0,
      speed: 0
    });

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

  const accelerating =
    Boolean(state.accelerating);

  const braking =
    Boolean(state.braking);

  data.speed +=
    (speed - data.speed) *
    Math.min(1, dt * 8);

  data.steering +=
    (steer - data.steering) *
    Math.min(1, dt * 10);

  data.wheelSpin +=
    data.speed *
    dt *
    0.7;

  for (const wheel of
    keke.userData.wheels || []) {
    wheel.rotation.x =
      data.wheelSpin;
  }

  if (keke.userData.steering) {
    keke.userData.steering.rotation.z =
      data.steering * 0.55;
  }

  const targetTilt =
    data.steering * -0.055;

  keke.rotation.z +=
    (targetTilt -
      keke.rotation.z) *
    Math.min(1, dt * 8);

  let suspensionTarget = 0;

  if (accelerating) {
    suspensionTarget -= 0.025;
  }

  if (braking) {
    suspensionTarget += 0.035;
  }

  if (state.bounce) {
    suspensionTarget +=
      Math.sin(
        Number(state.bounce) * 0.9
      ) * 0.08;
  }

  data.suspension +=
    (suspensionTarget -
      data.suspension) *
    Math.min(1, dt * 10);

  keke.position.y =
    data.suspension;

  if (keke.userData.driver) {
    const driver =
      keke.userData.driver;

    driver.rotation.z =
      data.steering * -0.08;

    driver.rotation.x =
      braking ? -0.035 : 0;
  }

  if (keke.userData.box) {
    keke.userData.box.worldX =
      keke.position.x;

    keke.userData.box.worldZ =
      keke.position.z;
  }
}

export function recolorKeke(
  keke,
  paintColor
) {
  if (!keke) return;

  const color =
    new THREE.Color(
      paintColor ?? 0xfbbf24
    );

  keke.traverse((node) => {
    if (
      !node.isMesh ||
      !node.material ||
      !node.material.color
    ) {
      return;
    }

    if (
      node.name.includes('Panel') ||
      node.name === 'bodyPanel' ||
      node.name === 'frontPanel'
    ) {
      node.material.color.copy(color);
    }
  });
}

export function disposeKeke(keke) {
  if (!keke) return;

  keke.traverse((node) => {
    if (!node.isMesh) return;

    if (node.geometry) {
      node.geometry.dispose();
    }

    if (node.material) {
      if (Array.isArray(node.material)) {
        for (const material of node.material) {
          material.dispose?.();
        }
      } else {
        node.material.dispose?.();
      }
    }
  });

  keke.parent?.remove(keke);
}

export default createPlayerKeke;