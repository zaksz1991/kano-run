// Kano Run — Pedestrian Factory
// Phase A upgrade module
//
// Passenger state machine:
// WALKING → WAITING → FLAGGING → BOARDING → RIDING → EXITING

import * as THREE from '../vendor/three.module.js';

export const PEDESTRIAN_STATES = {
  WALKING: 'walking',
  WAITING: 'waiting',
  FLAGGING: 'flagging',
  BOARDING: 'boarding',
  RIDING: 'riding',
  EXITING: 'exiting'
};

function mat(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0
  });
}

export function createPedestrian(
  options = {}
) {
  const group =
    new THREE.Group();

  group.name =
    options.name ||
    'pedestrian';

  const skin =
    mat(
      options.skinColor ??
        0x6b4029
    );

  const shirt =
    mat(
      options.shirtColor ??
        0x2563eb
    );

  const trousers =
    mat(
      options.trouserColor ??
        0x1e293b
    );

  const body =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        0.28,
        0.52,
        0.2
      ),
      shirt
    );

  body.position.y =
    0.86;

  group.add(body);

  const head =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.14,
        10,
        8
      ),
      skin
    );

  head.position.y =
    1.27;

  group.add(head);

  const legs = [];

  for (const side of [-1, 1]) {
    const leg =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.1,
          0.45,
          0.1
        ),
        trousers
      );

    leg.position.set(
      side * 0.07,
      0.35,
      0
    );

    group.add(leg);
    legs.push(leg);
  }

  const arms = [];

  for (const side of [-1, 1]) {
    const arm =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.08,
          0.36,
          0.09
        ),
        skin
      );

    arm.position.set(
      side * 0.19,
      0.88,
      0
    );

    group.add(arm);
    arms.push(arm);
  }

  group.userData.state =
    options.state ??
    PEDESTRIAN_STATES.WALKING;

  group.userData.walkPhase =
    Math.random() *
    Math.PI *
    2;

  group.userData.flagPhase =
    0;

  group.userData.legs =
    legs;

  group.userData.arms =
    arms;

  group.userData.speed =
    options.speed ??
    0.45;

  group.userData.destination =
    options.destination ??
    null;

  group.userData.role =
    options.role ??
    'pedestrian';

  return group;
}

export function setPedestrianState(
  pedestrian,
  state
) {
  if (!pedestrian) return;

  if (
    !Object.values(
      PEDESTRIAN_STATES
    ).includes(state)
  ) {
    return;
  }

  pedestrian.userData.state =
    state;
}

export function updatePedestrian(
  pedestrian,
  state = {},
  dt = 1 / 60
) {
  if (!pedestrian) return;

  const data =
    pedestrian.userData;

  const currentState =
    state.state ??
    data.state ??
    PEDESTRIAN_STATES.WALKING;

  data.state =
    currentState;

  const speed =
    Number.isFinite(
      Number(state.speed)
    )
      ? Number(state.speed)
      : data.speed;

  data.walkPhase +=
    speed *
    dt *
    7;

  if (
    currentState ===
    PEDESTRIAN_STATES.WALKING
  ) {
    const swing =
      Math.sin(
        data.walkPhase
      ) *
      0.32;

    if (data.legs?.length >= 2) {
      data.legs[0].rotation.x =
        swing;

      data.legs[1].rotation.x =
        -swing;
    }

    if (data.arms?.length >= 2) {
      data.arms[0].rotation.x =
        -swing * 0.7;

      data.arms[1].rotation.x =
        swing * 0.7;
    }
  } else if (
    currentState ===
    PEDESTRIAN_STATES.FLAGGING
  ) {
    data.flagPhase +=
      dt * 7;

    if (data.arms?.length >= 2) {
      data.arms[1].rotation.z =
        -1.15 +
        Math.sin(
          data.flagPhase
        ) *
          0.35;
    }
  } else if (
    currentState ===
    PEDESTRIAN_STATES.BOARDING
  ) {
    pedestrian.position.y =
      Math.max(
        0,
        pedestrian.position.y -
          dt * 0.35
      );

    pedestrian.rotation.y +=
      dt * 0.8;
  } else if (
    currentState ===
    PEDESTRIAN_STATES.EXITING
  ) {
    pedestrian.position.y =
      Math.min(
        0,
        pedestrian.position.y +
          dt * 0.25
      );

    const swing =
      Math.sin(
        data.walkPhase
      ) *
      0.3;

    data.legs[0].rotation.x =
      swing;

    data.legs[1].rotation.x =
      -swing;
  } else {
    if (data.legs?.length >= 2) {
      data.legs[0].rotation.x *=
        0.8;

      data.legs[1].rotation.x *=
        0.8;
    }

    if (data.arms?.length >= 2) {
      data.arms[0].rotation.x *=
        0.8;

      data.arms[1].rotation.x *=
        0.8;
    }
  }

  if (
    currentState ===
    PEDESTRIAN_STATES.WAITING
  ) {
    pedestrian.rotation.z =
      Math.sin(
        data.walkPhase * 0.5
      ) *
      0.015;
  }
}

export function createPassenger(
  options = {}
) {
  const passenger =
    createPedestrian({
      ...options,
      role: 'passenger',
      state:
        options.state ??
        PEDESTRIAN_STATES.WAITING
    });

  passenger.userData.destination =
    options.destination ??
    null;

  passenger.userData.fare =
    Number.isFinite(
      Number(options.fare)
    )
      ? Number(options.fare)
      : 0;

  passenger.userData.passengerType =
    options.passengerType ??
    'regular';

  passenger.userData.vip =
    Boolean(options.vip);

  passenger.userData.aishat =
    Boolean(options.aishat);

  return passenger;
}

export function disposePedestrian(
  pedestrian
) {
  if (!pedestrian) return;

  pedestrian.traverse((node) => {
    if (!node.isMesh) return;

    node.geometry?.dispose?.();

    if (
      Array.isArray(
        node.material
      )
    ) {
      node.material.forEach(
        (m) => m?.dispose?.()
      );
    } else {
      node.material?.dispose?.();
    }
  });

  pedestrian.parent?.remove(
    pedestrian
  );
}

export default createPedestrian;