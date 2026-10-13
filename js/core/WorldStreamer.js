import * as THREE from "three";

export class WorldStreamer {
  constructor(options = {}) {
    this.options = {
      segmentLength: 40,
      segmentsAhead: 8,
      segmentsBehind: 2,
      recycleMargin: 20,
      roadWidth: 12,
      sidewalkWidth: 2.5,
      seed: 1991,
      ...options,
    };

    this.scene = null;
    this.environment = null;
    this.segments = [];
    this.materials = {};
    this.random = null;
    this.nextSegmentId = 1;
    this.disposed = false;
    this.initialized = false;
    this.lastPlayerZ = 0;
  }

  init(sceneOrBuilder, environment = null) {
    if (this.disposed) {
      throw new Error("WorldStreamer has been disposed.");
    }

    if (this.initialized) {
      return this;
    }

    this.scene =
      typeof sceneOrBuilder?.getScene === "function"
        ? sceneOrBuilder.getScene()
        : sceneOrBuilder;

    if (!this.scene?.isScene) {
      throw new TypeError(
        "WorldStreamer requires a valid Three.js scene."
      );
    }

    this.environment = environment;
    this.random = this.createRandom(this.options.seed);

    this.createMaterials();
    this.populateInitialWorld();

    this.initialized = true;

    return this;
  }

  createRandom(seed) {
    let state = Number(seed) >>> 0;

    return () => {
      state = (state + 0x6d2b79f5) >>> 0;

      let value = state;

      value = Math.imul(
        value ^ (value >>> 15),
        value | 1
      );

      value ^= value + Math.imul(
        value ^ (value >>> 7),
        value | 61
      );

      return (
        ((value ^ (value >>> 14)) >>> 0) /
        4294967296
      );
    };
  }

  randomRange(min, max) {
    return min + this.random() * (max - min);
  }

  createMaterials() {
    this.materials = {
      road: new THREE.MeshStandardMaterial({
        color: 0x34383d,
        roughness: 0.95,
      }),

      sidewalk: new THREE.MeshStandardMaterial({
        color: 0xb9b3a5,
        roughness: 1,
      }),

      kerb: new THREE.MeshStandardMaterial({
        color: 0xe1d7c3,
        roughness: 1,
      }),

      marking: new THREE.MeshStandardMaterial({
        color: 0xf4e4a3,
        roughness: 0.8,
      }),

      dirt: new THREE.MeshStandardMaterial({
        color: 0xb5a075,
        roughness: 1,
      }),

      grass: new THREE.MeshStandardMaterial({
        color: 0x70874a,
        roughness: 1,
      }),

      building: [
        new THREE.MeshStandardMaterial({
          color: 0xd5c4a0,
          roughness: 0.95,
        }),
        new THREE.MeshStandardMaterial({
          color: 0xe6dfce,
          roughness: 0.95,
        }),
        new THREE.MeshStandardMaterial({
          color: 0xb97955,
          roughness: 0.95,
        }),
        new THREE.MeshStandardMaterial({
          color: 0xc8b69a,
          roughness: 0.95,
        }),
      ],

      roof: new THREE.MeshStandardMaterial({
        color: 0x65574b,
        roughness: 0.95,
      }),

      window: new THREE.MeshStandardMaterial({
        color: 0x537887,
        roughness: 0.35,
        metalness: 0.1,
      }),

      trunk: new THREE.MeshStandardMaterial({
        color: 0x6e4b2d,
        roughness: 1,
      }),

      foliage: [
        new THREE.MeshStandardMaterial({
          color: 0x52743e,
          roughness: 1,
        }),
        new THREE.MeshStandardMaterial({
          color: 0x7d9149,
          roughness: 1,
        }),
      ],
    };
  }

  populateInitialWorld() {
    const total =
      this.options.segmentsAhead +
      this.options.segmentsBehind +
      1;

    const startIndex = -this.options.segmentsBehind;

    for (let index = 0; index < total; index += 1) {
      const worldIndex = startIndex + index;

      this.createSegment(
        worldIndex * this.options.segmentLength
      );
    }
  }

  createSegment(zPosition) {
    const length = this.options.segmentLength;
    const group = new THREE.Group();

    group.name = `stream-segment-${this.nextSegmentId++}`;
    group.position.z = zPosition;

    group.userData.worldSegment = true;
    group.userData.segmentLength = length;
    group.userData.lastGeneratedZ = zPosition;

    this.createRoad(group, length);
    this.createSidewalks(group, length);
    this.createRoadsideTerrain(group, length);
    this.createLaneMarkings(group, length);

    this.scene.add(group);
    this.segments.push(group);

    this.populateRoadside(group, zPosition, length);

    return group;
  }

  createRoad(group, length) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(
        this.options.roadWidth,
        0.16,
        length + 0.05
      ),
      this.materials.road
    );

    road.name = "stream-road";
    road.position.y = -0.04;
    road.receiveShadow = true;

    group.add(road);
  }

  createSidewalks(group, length) {
    const roadHalf = this.options.roadWidth / 2;
    const width = this.options.sidewalkWidth;

    for (const side of [-1, 1]) {
      const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(
          width,
          0.2,
          length + 0.1
        ),
        this.materials.sidewalk
      );

      sidewalk.name = "stream-sidewalk";
      sidewalk.position.set(
        side * (roadHalf + width / 2),
        0,
        0
      );

      sidewalk.receiveShadow = true;
      group.add(sidewalk);

      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.18,
          0.24,
          length + 0.1
        ),
        this.materials.kerb
      );

      kerb.name = "stream-kerb";
      kerb.position.set(
        side * (roadHalf + 0.09),
        0.04,
        0
      );

      group.add(kerb);
    }
  }

  createRoadsideTerrain(group, length) {
    const terrainWidth = 35;
    const offset =
      this.options.roadWidth / 2 +
      this.options.sidewalkWidth +
      terrainWidth / 2;

    for (const side of [-1, 1]) {
      const terrain = new THREE.Mesh(
        new THREE.BoxGeometry(
          terrainWidth,
          0.15,
          length + 0.1
        ),
        this.random() > 0.5
          ? this.materials.dirt
          : this.materials.grass
      );

      terrain.name = "stream-roadside-terrain";
      terrain.position.set(
        side * offset,
        -0.15,
        0
      );

      terrain.receiveShadow = true;
      group.add(terrain);
    }
  }

  createLaneMarkings(group, length) {
    const laneWidth = 2.4;
    const roadWidth = this.options.roadWidth;
    const laneCount = Math.floor(roadWidth / laneWidth);

    const dashLength = 3.2;
    const dashWidth = 0.08;
    const gap = 4.2;

    for (let lane = 1; lane < laneCount; lane += 1) {
      const x = -roadWidth / 2 + lane * laneWidth;

      for (
        let z = -length / 2 + dashLength / 2;
        z < length / 2;
        z += dashLength + gap
      ) {
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(
            dashWidth,
            0.025,
            dashLength
          ),
          this.materials.marking
        );

        dash.name = "stream-lane-marking";
        dash.position.set(x, 0.055, z);

        group.add(dash);
      }
    }
  }

  populateRoadside(group, zPosition, length) {
    const interval = 12;

    for (
      let z = -length / 2 + interval / 2;
      z < length / 2;
      z += interval
    ) {
      for (const side of [-1, 1]) {
        const chance = this.random();

        if (chance < 0.42) {
          this.addTree(
            group,
            side,
            z,
            zPosition
          );
        } else if (chance < 0.78) {
          this.addBuilding(
            group,
            side,
            z,
            zPosition
          );
        } else if (chance < 0.9) {
          this.addRoadsidePole(
            group,
            side,
            z
          );
        }
      }
    }
  }

  addTree(group, side, localZ) {
    const height = this.randomRange(3.2, 5.5);
    const crownRadius = this.randomRange(0.8, 1.35);

    const tree = new THREE.Group();
    tree.name = "stream-tree";

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.12,
        0.2,
        height * 0.48,
        7
      ),
      this.materials.trunk
    );

    trunk.position.y = height * 0.24;
    trunk.castShadow = true;
    tree.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(
        crownRadius,
        8,
        6
      ),
      this.materials.foliage[
        Math.floor(this.random() * this.materials.foliage.length)
      ]
    );

    crown.position.y = height * 0.62;
    crown.scale.set(1, 1.25, 0.95);
    crown.castShadow = true;

    tree.add(crown);

    const roadEdge =
      this.options.roadWidth / 2 +
      this.options.sidewalkWidth +
      this.randomRange(2.5, 6);

    tree.position.set(
      side * roadEdge,
      0,
      localZ
    );

    tree.userData.environmentType = "tree";

    group.add(tree);
  }

  addBuilding(group, side, localZ) {
    const width = this.randomRange(4.5, 8.5);
    const height = this.randomRange(4, 11);
    const depth = this.randomRange(5, 10);

    const building = new THREE.Group();
    building.name = "stream-building";

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      this.materials.building[
        Math.floor(
          this.random() * this.materials.building.length
        )
      ]
    );

    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;

    building.add(body);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        width + 0.2,
        0.2,
        depth + 0.2
      ),
      this.materials.roof
    );

    roof.position.y = height + 0.08;
    roof.castShadow = true;

    building.add(roof);

    this.addBuildingWindows(
      building,
      width,
      height,
      depth
    );

    const roadEdge =
      this.options.roadWidth / 2 +
      this.options.sidewalkWidth +
      width / 2 +
      this.randomRange(1, 3);

    building.position.set(
      side * roadEdge,
      0,
      localZ
    );

    building.userData.environmentType = "building";

    group.add(building);
  }

  addBuildingWindows(building, width, height, depth) {
    const rows = Math.min(
      5,
      Math.max(1, Math.floor(height / 2))
    );

    const columns = Math.min(
      4,
      Math.max(1, Math.floor(width / 1.8))
    );

    const windowWidth = Math.min(
      0.7,
      width / (columns + 1) * 0.55
    );

    const windowHeight = 0.7;

    const geometry = new THREE.BoxGeometry(
      windowWidth,
      windowHeight,
      0.045
    );

    for (let row = 0; row < rows; row += 1) {
      const y = 1 + row * 1.65;

      if (y > height - 0.4) {
        continue;
      }

      for (let column = 0; column < columns; column += 1) {
        const x =
          -width / 2 +
          ((column + 1) * width) / (columns + 1);

        const windowMesh = new THREE.Mesh(
          geometry,
          this.materials.window
        );

        windowMesh.position.set(
          x,
          y,
          depth / 2 + 0.025
        );

        building.add(windowMesh);
      }
    }
  }

  addRoadsidePole(group, side, localZ) {
    const height = this.randomRange(3.5, 5.5);

    const pole = new THREE.Group();
    pole.name = "stream-roadside-pole";

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.045,
        0.07,
        height,
        6
      ),
      this.materials.roof
    );

    shaft.position.y = height / 2;
    shaft.castShadow = true;

    pole.add(shaft);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.45, 0.08),
      this.materials.marking
    );

    sign.position.y = height - 0.4;

    pole.add(sign);

    const roadEdge =
      this.options.roadWidth / 2 +
      this.options.sidewalkWidth +
      1.5;

    pole.position.set(
      side * roadEdge,
      0,
      localZ
    );

    group.add(pole);
  }

  update(deltaTime, playerPosition) {
    if (
      !this.initialized ||
      this.disposed ||
      !playerPosition ||
      !Number.isFinite(playerPosition.z)
    ) {
      return;
    }

    this.lastPlayerZ = playerPosition.z;

    const segmentLength = this.options.segmentLength;

    const desiredAhead =
      playerPosition.z +
      this.options.segmentsAhead * segmentLength;

    const desiredBehind =
      playerPosition.z -
      this.options.segmentsBehind * segmentLength;

    this.recycleBehind(desiredBehind);

    while (this.getFurthestZ() < desiredAhead) {
      this.createSegment(
        this.getFurthestZ() + segmentLength
      );
    }

    this.trimExcessSegments(
      playerPosition.z,
      segmentLength
    );
  }

  getFurthestZ() {
    if (this.segments.length === 0) {
      return this.lastPlayerZ;
    }

    return Math.max(
      ...this.segments.map(
        (segment) => segment.position.z
      )
    );
  }

  recycleBehind(threshold) {
    if (this.segments.length === 0) {
      return;
    }

    const length = this.options.segmentLength;

    const furthest = this.getFurthestZ();

    for (const segment of this.segments) {
      if (
        segment.position.z + length <
        threshold - this.options.recycleMargin
      ) {
        segment.position.z = furthest + length;
        segment.userData.lastGeneratedZ =
          segment.position.z;
      }
    }

    this.segments.sort(
      (a, b) => a.position.z - b.position.z
    );
  }

  trimExcessSegments(playerZ, segmentLength) {
    const maximum =
      this.options.segmentsAhead +
      this.options.segmentsBehind +
      3;

    if (this.segments.length <= maximum) {
      return;
    }

    const minimumZ =
      playerZ -
      (this.options.segmentsBehind + 2) * segmentLength;

    this.segments.sort(
      (a, b) => a.position.z - b.position.z
    );

    while (
      this.segments.length > maximum &&
      this.segments[0].position.z < minimumZ
    ) {
      const segment = this.segments.shift();

      segment.parent?.remove(segment);
      this.disposeObject(segment);
    }
  }

  setSeed(seed) {
    this.options.seed = Number(seed) >>> 0;
    this.random = this.createRandom(this.options.seed);
  }

  getSegments() {
    return [...this.segments];
  }

  getStats() {
    return {
      segmentCount: this.segments.length,
      segmentLength: this.options.segmentLength,
      playerZ: this.lastPlayerZ,
      nextSegmentId: this.nextSegmentId,
    };
  }

  disposeObject(object) {
    object.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.geometry?.dispose();
    });
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    for (const segment of this.segments) {
      segment.parent?.remove(segment);
      this.disposeObject(segment);
    }

    this.segments.length = 0;

    for (const material of Object.values(this.materials)) {
      if (Array.isArray(material)) {
        for (const item of material) {
          item.dispose();
        }
      } else {
        material.dispose();
      }
    }

    this.materials = {};
    this.scene = null;
    this.environment = null;
    this.random = null;
    this.initialized = false;
    this.disposed = true;
  }
}

export default WorldStreamer;