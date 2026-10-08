// Kano Run — Road Factory
// Phase A upgrade module
//
// Creates reusable road segments and roadside visual modules.
// Designed for forward-moving traffic.

import * as THREE from '../vendor/three.module.js';

export const ROAD_CONFIG = {
  laneX: [-2.4, 0, 2.4],
  width: 9.5,
  shoulderWidth: 2.4,
  segmentLength: 30,
  segmentCount: 5
};

function mat(
  color,
  roughness = 0.8,
  metalness = 0.05
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
}

function plane(
  width,
  length,
  material
) {
  const mesh =
    new THREE.Mesh(
      new THREE.PlaneGeometry(
        width,
        length
      ),
      material
    );

  mesh.rotation.x =
    -Math.PI / 2;

  return mesh;
}

function addBox(
  parent,
  size,
  position,
  material
) {
  const mesh =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        size[0],
        size[1],
        size[2]
      ),
      material
    );

  mesh.position.set(
    position[0],
    position[1],
    position[2]
  );

  parent.add(mesh);

  return mesh;
}

export function createRoadSegment(
  options = {}
) {
  const width =
    options.width ??
    ROAD_CONFIG.width;

  const length =
    options.length ??
    ROAD_CONFIG.segmentLength;

  const shoulderWidth =
    options.shoulderWidth ??
    ROAD_CONFIG.shoulderWidth;

  const segment =
    new THREE.Group();

  segment.name =
    'roadSegment';

  const road =
    plane(
      width,
      length,
      mat(
        0x2c3545,
        0.94,
        0.04
      )
    );

  road.position.y =
    0;

  segment.add(road);

  const roadWear =
    plane(
      3.4,
      length,
      mat(
        0x242e3d,
        0.97,
        0.02
      )
    );

  roadWear.position.y =
    0.006;

  segment.add(roadWear);

  for (const side of [-1, 1]) {
    const shoulder =
      plane(
        shoulderWidth,
        length,
        mat(
          0x5c5346,
          0.98,
          0
        )
      );

    shoulder.position.set(
      side *
        (width / 2 +
          shoulderWidth / 2),
      0.01,
      0
    );

    segment.add(
      shoulder
    );

    const curb =
      addBox(
        segment,
        [0.24, 0.12, length],
        [
          side *
            (width / 2),
          0.07,
          0
        ],
        mat(
          0x918579,
          0.9
        )
      );

    curb.userData.role =
      'curb';
  }

  // Edge lines.
  const edgeMaterial =
    new THREE.MeshBasicMaterial({
      color: 0xeab308
    });

  for (const x of [
    -4.5,
    4.5
  ]) {
    const line =
      plane(
        0.12,
        length,
        edgeMaterial
      );

    line.position.set(
      x,
      0.022,
      0
    );

    segment.add(line);
  }

  // Lane separators.
  const dashMaterial =
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24
    });

  const laneMarks =
    new THREE.Group();

  laneMarks.name =
    'laneMarks';

  for (
    let z = -length / 2;
    z < length / 2;
    z += 3.2
  ) {
    for (const x of [
      -1.2,
      1.2
    ]) {
      const dash =
        plane(
          0.1,
          1.4,
          dashMaterial
        );

      dash.position.set(
        x,
        0.025,
        z
      );

      laneMarks.add(
        dash
      );
    }
  }

  segment.add(
    laneMarks
  );

  // Roadside drainage strips.
  for (const side of [-1, 1]) {
    addBox(
      segment,
      [0.12, 0.05, length],
      [
        side *
          (width / 2 +
            0.18),
        0.025,
        0
      ],
      mat(
        0x3f3a34,
        0.98
      )
    );
  }

  segment.userData.length =
    length;

  segment.userData.width =
    width;

  segment.userData.roadOffset =
    0;

  return segment;
}

function createBuilding(
  type,
  side,
  z
) {
  const group =
    new THREE.Group();

  const x =
    side *
    (6.6 +
      Math.random() * 1.2);

  if (type === 'mosque') {
    const base =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.3,
          2.5,
          2
        ),
        mat(0xe7e1d6, 0.8)
      );

    base.position.set(
      x,
      1.25,
      z
    );

    group.add(base);

    const dome =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.85,
          14,
          10,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        ),
        mat(
          0x16a394,
          0.38,
          0.15
        )
      );

    dome.position.set(
      x,
      2.55,
      z
    );

    group.add(dome);

    for (const dx of [
      -0.95,
      0.95
    ]) {
      const tower =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.13,
            0.18,
            3.4,
            10
          ),
          mat(
            0xe7e1d6,
            0.75
          )
        );

      tower.position.set(
        x + dx,
        1.7,
        z - 0.55
      );

      group.add(tower);
    }

    return group;
  }

  if (type === 'shop') {
    const building =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.1,
          2.35,
          1.7
        ),
        mat(
          0xb9784f,
          0.88
        )
      );

    building.position.set(
      x,
      1.17,
      z
    );

    group.add(building);

    addBox(
      group,
      [2.35, 0.1, 0.7],
      [
        x,
        1.85,
        z -
          side * 0.3
      ],
      mat(
        0xdc2626,
        0.72
      )
    );

    addBox(
      group,
      [1.3, 0.8, 0.08],
      [
        x,
        0.65,
        z -
          side * 0.88
      ],
      mat(
        0x241e1b,
        0.95
      )
    );

    return group;
  }

  if (type === 'market') {
    for (const dx of [
      -0.8,
      0.8
    ]) {
      for (const dz of [
        -0.55,
        0.55
      ]) {
        addBox(
          group,
          [0.08, 1.6, 0.08],
          [
            x + dx,
            0.8,
            z + dz
          ],
          mat(
            0x78716c,
            0.9
          )
        );
      }
    }

    addBox(
      group,
      [1.9, 0.1, 1.4],
      [x, 1.65, z],
      mat(
        0xeab308,
        0.72
      )
    );

    addBox(
      group,
      [1.5, 0.12, 1],
      [x, 0.7, z],
      mat(
        0xa16207,
        0.85
      )
    );

    return group;
  }

  if (type === 'petrol') {
    addBox(
      group,
      [3.2, 0.12, 2.1],
      [x, 2.4, z],
      mat(
        0xdc2626,
        0.5
      )
    );

    for (const dx of [
      -1.2,
      1.2
    ]) {
      const pole =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.11,
            0.11,
            2.4,
            8
          ),
          mat(
            0xf8fafc,
            0.4,
            0.3
          )
        );

      pole.position.set(
        x + dx,
        1.2,
        z
      );

      group.add(
        pole
      );
    }

    return group;
  }

  if (type === 'busstop') {
    addBox(
      group,
      [2, 0.08, 1.2],
      [x, 2, z],
      mat(
        0x334155,
        0.7
      )
    );

    addBox(
      group,
      [2, 1.35, 0.08],
      [
        x,
        1.2,
        z -
          side * 0.5
      ],
      mat(
        0x475569,
        0.8
      )
    );

    addBox(
      group,
      [1.6, 0.12, 0.4],
      [x, 0.5, z],
      mat(
        0x78716c,
        0.85
      )
    );

    return group;
  }

  // Default house.
  const height =
    2.4 +
    Math.random() *
      1.4;

  addBox(
    group,
    [2.1, height, 1.7],
    [x, height / 2, z],
    mat(
      0x8d6246,
      0.93
    )
  );

  addBox(
    group,
    [2.3, 0.15, 1.9],
    [x, height + 0.08, z],
    mat(
      0x4b4038,
      0.96
    )
  );

  return group;
}

export function createRoadsideModule(
  options = {}
) {
  const group =
    new THREE.Group();

  const types = [
    'house',
    'shop',
    'market',
    'house',
    'mosque',
    'shop',
    'petrol',
    'house',
    'busstop'
  ];

  const length =
    options.length ??
    ROAD_CONFIG.segmentLength;

  for (
    let z = -length / 2;
    z < length / 2;
    z += 6
  ) {
    for (const side of [
      -1,
      1
    ]) {
      const type =
        types[
          Math.floor(
            Math.random() *
              types.length
          )
        ];

      group.add(
        createBuilding(
          type,
          side,
          z +
            (Math.random() -
              0.5)
        )
      );
    }
  }

  return group;
}

export function createRoadSystem(
  options = {}
) {
  const segmentCount =
    options.segmentCount ??
    ROAD_CONFIG.segmentCount;

  const segmentLength =
    options.segmentLength ??
    ROAD_CONFIG.segmentLength;

  const root =
    new THREE.Group();

  root.name =
    'roadSystem';

  const segments = [];

  for (
    let i = 0;
    i < segmentCount;
    i++
  ) {
    const segment =
      createRoadSegment({
        ...options,
        length:
          segmentLength
      });

    segment.position.z =
      i * segmentLength;

    root.add(
      segment
    );

    segments.push(
      segment
    );
  }

  return {
    root,
    segments,
    segmentLength,
    segmentCount
  };
}

export function recycleRoadSegments(
  roadSystem,
  cameraZ
) {
  if (!roadSystem?.segments?.length) {
    return;
  }

  const {
    segments,
    segmentLength
  } = roadSystem;

  let farthestZ =
    -Infinity;

  for (const segment of segments) {
    farthestZ =
      Math.max(
        farthestZ,
        segment.position.z
      );
  }

  for (const segment of segments) {
    if (
      segment.position.z <
      cameraZ -
        segmentLength
    ) {
      segment.position.z =
        farthestZ +
        segmentLength;

      farthestZ =
        segment.position.z;
    }
  }
}

export function disposeRoadSystem(
  roadSystem
) {
  if (!roadSystem) return;

  const root =
    roadSystem.root;

  root?.traverse((node) => {
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

  root?.parent?.remove(
    root
  );
}

export default createRoadSystem;