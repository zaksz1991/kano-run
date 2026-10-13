import * as THREE from "three";

export class WorldManager {
  constructor(options = {}) {
    this.options = {
      roadLength: 240,
      roadWidth: 12,
      laneWidth: 2.4,
      sidewalkWidth: 2.5,
      groundSize: 1200,
      segmentLength: 40,
      visibleSegments: 7,
      ...options,
    };

    this.sceneBuilder = null;
    this.scene = null;
    this.groups = {};
    this.segments = [];
    this.materials = {};
    this.disposed = false;
    this.initialized = false;
    this.worldOffset = 0;
    this.segmentCounter = 0;
  }

  init(sceneBuilder) {
    if (this.disposed) {
      throw new Error("WorldManager has been disposed.");
    }

    if (this.initialized) {
      return this;
    }

    if (!sceneBuilder) {
      throw new Error("WorldManager requires a SceneBuilder.");
    }

    this.sceneBuilder = sceneBuilder;
    this.scene =
      typeof sceneBuilder.getScene === "function"
        ? sceneBuilder.getScene()
        : sceneBuilder;

    if (!this.scene?.isScene) {
      throw new TypeError("WorldManager requires a valid Three.js scene.");
    }

    this.createMaterials();
    this.createGroups();
    this.createGround();
    this.createInitialSegments();

    this.initialized = true;

    return this;
  }

  createMaterials() {
    this.materials.ground = new THREE.MeshStandardMaterial({
      color: 0xc6b58a,
      roughness: 1,
      metalness: 0,
    });

    this.materials.road = new THREE.MeshStandardMaterial({
      color: 0x34383d,
      roughness: 0.94,
      metalness: 0,
    });

    this.materials.sidewalk = new THREE.MeshStandardMaterial({
      color: 0xb9b3a5,
      roughness: 1,
    });

    this.materials.roadMarking = new THREE.MeshStandardMaterial({
      color: 0xf6e8a6,
      roughness: 0.8,
      emissive: 0x171307,
    });

    this.materials.kerb = new THREE.MeshStandardMaterial({
      color: 0xd5d0c5,
      roughness: 1,
    });

    this.materials.dirt = new THREE.MeshStandardMaterial({
      color: 0xa9966e,
      roughness: 1,
    });

    this.materials.grass = new THREE.MeshStandardMaterial({
      color: 0x718b49,
      roughness: 1,
    });
  }

  createGroups() {
    const names = [
      "world-ground",
      "world-road",
      "world-markings",
      "world-sidewalks",
      "world-scenery",
      "world-landmarks",
    ];

    for (const name of names) {
      const existing =
        typeof this.sceneBuilder.getGroup === "function"
          ? this.sceneBuilder.getGroup(name)
          : null;

      const group = existing || new THREE.Group();

      group.name = name;

      if (!existing) {
        this.scene.add(group);
      }

      this.groups[name] = group;
    }
  }

  createGround() {
    const size = this.options.groundSize;

    const geometry = new THREE.PlaneGeometry(size, size);

    const ground = new THREE.Mesh(
      geometry,
      this.materials.ground
    );

    ground.name = "world-ground-plane";
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.2, 0);
    ground.receiveShadow = true;

    this.groups["world-ground"].add(ground);

    this.ground = ground;
  }

  createInitialSegments() {
    const count = Math.max(
      3,
      Math.ceil(this.options.visibleSegments)
    );

    const length = this.options.segmentLength;

    for (let index = 0; index < count; index += 1) {
      this.createSegment(index * length);
    }
  }

  createSegment(zPosition) {
    const segmentLength = this.options.segmentLength;
    const roadWidth = this.options.roadWidth;
    const sidewalkWidth = this.options.sidewalkWidth;

    const group = new THREE.Group();

    group.name = `world-segment-${this.segmentCounter++}`;
    group.position.z = zPosition;

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(
        roadWidth,
        0.16,
        segmentLength + 0.15
      ),
      this.materials.road
    );

    road.name = "road-surface";
    road.position.y = -0.04;
    road.receiveShadow = true;
    group.add(road);

    this.createLaneMarkings(group, segmentLength);
    this.createRoadEdges(group, segmentLength);

    const sidewalkOffset =
      roadWidth / 2 + sidewalkWidth / 2;

    for (const side of [-1, 1]) {
      const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(
          sidewalkWidth,
          0.22,
          segmentLength + 0.1
        ),
        this.materials.sidewalk
      );

      sidewalk.name =
        side < 0 ? "left-sidewalk" : "right-sidewalk";

      sidewalk.position.set(
        side * sidewalkOffset,
        0,
        0
      );

      sidewalk.receiveShadow = true;
      group.add(sidewalk);
    }

    group.userData.worldSegment = true;
    group.userData.segmentLength = segmentLength;
    group.userData.initialZ = zPosition;

    this.groups["world-road"].add(group);
    this.segments.push(group);

    return group;
  }

  createLaneMarkings(group, segmentLength) {
    const laneWidth = this.options.laneWidth;
    const roadWidth = this.options.roadWidth;

    const laneCount = Math.max(
      1,
      Math.floor(roadWidth / laneWidth)
    );

    const markingLength = Math.min(4, segmentLength * 0.18);
    const markingWidth = 0.09;
    const markingGeometry = new THREE.BoxGeometry(
      markingWidth,
      0.025,
      markingLength
    );

    for (let lane = 1; lane < laneCount; lane += 1) {
      const x =
        -roadWidth / 2 + lane * laneWidth;

      const markingsPerSegment = Math.max(
        2,
        Math.floor(segmentLength / 8)
      );

      for (
        let index = 0;
        index < markingsPerSegment;
        index += 1
      ) {
        const marking = new THREE.Mesh(
          markingGeometry,
          this.materials.roadMarking
        );

        marking.name = "lane-marking";
        marking.position.set(
          x,
          0.055,
          -segmentLength / 2 +
            (index + 0.5) *
              (segmentLength / markingsPerSegment)
        );

        group.add(marking);
      }
    }
  }

  createRoadEdges(group, segmentLength) {
    const roadWidth = this.options.roadWidth;
    const edgeWidth = 0.18;

    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(
          edgeWidth,
          0.035,
          segmentLength
        ),
        this.materials.kerb
      );

      edge.name = "road-edge";
      edge.position.set(
        side * (roadWidth / 2 - edgeWidth / 2),
        0.055,
        0
      );

      group.add(edge);
    }
  }

  update(deltaTime, playerPosition = null) {
    if (!this.initialized || this.disposed) {
      return;
    }

    if (
      playerPosition &&
      Number.isFinite(playerPosition.z)
    ) {
      this.recycleSegments(playerPosition.z);
    }
  }

  recycleSegments(playerZ) {
    if (this.segments.length === 0) {
      return;
    }

    const segmentLength = this.options.segmentLength;

    const furthestZ = Math.max(
      ...this.segments.map(
        (segment) => segment.position.z
      )
    );

    const recycleThreshold =
      playerZ -
      segmentLength * 1.5;

    for (const segment of this.segments) {
      if (segment.position.z < recycleThreshold) {
        segment.position.z =
          furthestZ + segmentLength;

        segment.userData.initialZ =
          segment.position.z;

        this.segmentCounter += 0;
      }
    }

    this.worldOffset = playerZ;
  }

  setRoadColor(color) {
    this.materials.road?.color.set(color);
  }

  setGroundColor(color) {
    this.materials.ground?.color.set(color);
  }

  setSidewalkColor(color) {
    this.materials.sidewalk?.color.set(color);
  }

  getSegments() {
    return [...this.segments];
  }

  getGroups() {
    return { ...this.groups };
  }

  getRoadDimensions() {
    return {
      width: this.options.roadWidth,
      laneWidth: this.options.laneWidth,
      laneCount: Math.max(
        1,
        Math.floor(
          this.options.roadWidth /
            this.options.laneWidth
        )
      ),
      segmentLength: this.options.segmentLength,
      sidewalkWidth: this.options.sidewalkWidth,
    };
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

    if (this.ground) {
      this.ground.parent?.remove(this.ground);
      this.disposeObject(this.ground);
      this.ground = null;
    }

    for (const material of Object.values(this.materials)) {
      material.dispose();
    }

    this.materials = {};
    this.groups = {};
    this.scene = null;
    this.sceneBuilder = null;
    this.initialized = false;
    this.disposed = true;
  }

  disposeObject(object) {
    object.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.geometry?.dispose();
    });
  }
}

export default WorldManager;