const WORLD_CONFIG = Object.freeze({
  roadWidth: 12,
  laneWidth: 3.2,
  segmentLength: 40,
  visibleSegments: 12,
  roadLength: 480,
  sidewalkWidth: 2.5,
  buildingSpacing: 18,
  roadsideOffset: 10,
  worldSeed: 1991,
});

const DISTRICT_THEMES = Object.freeze({
  city_centre: {
    buildingHeight: [8, 30],
    buildingDensity: 0.95,
    marketDensity: 0.7,
    vegetationDensity: 0.15,
    colors: ["#d7b58a", "#c8a078", "#e0c7a4", "#b58a63"],
  },
  market: {
    buildingHeight: [4, 16],
    buildingDensity: 0.85,
    marketDensity: 1,
    vegetationDensity: 0.08,
    colors: ["#c58d52", "#b97a40", "#e0b36e", "#a86d3b"],
  },
  residential: {
    buildingHeight: [5, 18],
    buildingDensity: 0.7,
    marketDensity: 0.25,
    vegetationDensity: 0.4,
    colors: ["#d8c7a6", "#c9b18b", "#e5d8bf", "#bca27b"],
  },
  industrial: {
    buildingHeight: [7, 24],
    buildingDensity: 0.6,
    marketDensity: 0.15,
    vegetationDensity: 0.12,
    colors: ["#92989a", "#b1aaa0", "#a49a8d", "#777f83"],
  },
  outskirts: {
    buildingHeight: [3, 12],
    buildingDensity: 0.3,
    marketDensity: 0.1,
    vegetationDensity: 0.8,
    colors: ["#d5b98a", "#c6a878", "#e0ca9d", "#ad956e"],
  },
});

const PROP_TYPES = Object.freeze([
  "streetlight",
  "tree",
  "market_stall",
  "signboard",
  "utility_pole",
  "wall",
  "shop",
  "residential_building",
  "commercial_building",
]);

export default class WorldSystem {
  constructor({
    scene = null,
    eventBus = null,
    routeSystem = null,
    randomSeed = WORLD_CONFIG.worldSeed,
  } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.routeSystem = routeSystem;

    this.seed = randomSeed >>> 0;
    this.segmentIndex = 0;
    this.worldOffset = 0;
    this.currentDistrict = null;
    this.currentTheme = "residential";

    this.segments = [];
    this.props = [];
    this.disposed = false;

    this.emit("world:ready", this.getSnapshot());
  }

  random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  randomRange(min, max) {
    return min + this.random() * (max - min);
  }

  randomInt(min, max) {
    return Math.floor(this.randomRange(min, max + 1));
  }

  choose(items) {
    return items[Math.floor(this.random() * items.length)];
  }

  createSegment(district = null) {
    if (this.disposed) {
      throw new Error("Cannot create segments after WorldSystem.destroy().");
    }

    const theme = this.resolveTheme(district);
    const index = this.segmentIndex++;

    const segment = {
      id: `segment_${index}`,
      index,
      length: WORLD_CONFIG.segmentLength,
      z: -index * WORLD_CONFIG.segmentLength,
      district: district?.name ?? this.currentDistrict?.name ?? "Kano",
      theme,
      road: {
        width: WORLD_CONFIG.roadWidth,
        laneWidth: WORLD_CONFIG.laneWidth,
        lanes: 3,
        color: "#45484c",
        markingColor: "#f6f0d7",
      },
      props: this.generateProps(index, theme),
      createdAt: Date.now(),
    };

    this.segments.push(segment);
    this.props.push(...segment.props);

    this.emit("world:segment-created", segment);

    return segment;
  }

  generateProps(segmentIndex, themeName) {
    const theme = DISTRICT_THEMES[themeName] ??
      DISTRICT_THEMES.residential;

    const generated = [];
    const buildingCount = Math.round(
      theme.buildingDensity * this.randomRange(1, 4)
    );

    for (let i = 0; i < buildingCount; i += 1) {
      const side = this.random() < 0.5 ? -1 : 1;

      generated.push({
        id: `prop_${segmentIndex}_building_${i}`,
        type: this.choose([
          "shop",
          "residential_building",
          "commercial_building",
        ]),
        side,
        x: side * this.randomRange(
          WORLD_CONFIG.roadsideOffset,
          WORLD_CONFIG.roadsideOffset + 16
        ),
        z: -segmentIndex * WORLD_CONFIG.segmentLength -
          this.randomRange(0, WORLD_CONFIG.segmentLength),
        width: this.randomRange(4, 10),
        height: this.randomRange(
          theme.buildingHeight[0],
          theme.buildingHeight[1]
        ),
        depth: this.randomRange(5, 12),
        color: this.choose(theme.colors),
        theme: themeName,
      });
    }

    const extraCount = this.randomInt(1, 4);

    for (let i = 0; i < extraCount; i += 1) {
      const side = this.random() < 0.5 ? -1 : 1;
      const roll = this.random();

      let type;

      if (roll < theme.vegetationDensity * 0.5) {
        type = "tree";
      } else if (roll < theme.marketDensity) {
        type = "market_stall";
      } else if (roll < 0.75) {
        type = "streetlight";
      } else if (roll < 0.9) {
        type = "signboard";
      } else {
        type = "utility_pole";
      }

      generated.push({
        id: `prop_${segmentIndex}_extra_${i}`,
        type,
        side,
        x: side * this.randomRange(
          WORLD_CONFIG.roadWidth / 2 + 1,
          WORLD_CONFIG.roadsideOffset + 5
        ),
        z: -segmentIndex * WORLD_CONFIG.segmentLength -
          this.randomRange(0, WORLD_CONFIG.segmentLength),
        scale: this.randomRange(0.8, 1.5),
        theme: themeName,
      });
    }

    return generated;
  }

  resolveTheme(district) {
    if (!district) {
      return this.currentTheme;
    }

    const name = String(
      district.type ?? district.theme ?? district.name ?? ""
    ).toLowerCase();

    if (
      name.includes("market") ||
      name.includes("kasuwa") ||
      name.includes("sabon gari")
    ) {
      return "market";
    }

    if (
      name.includes("industrial") ||
      name.includes("factory") ||
      name.includes("challawa")
    ) {
      return "industrial";
    }

    if (
      name.includes("outskirts") ||
      name.includes("rural") ||
      name.includes("airport")
    ) {
      return "outskirts";
    }

    if (
      name.includes("centre") ||
      name.includes("center") ||
      name.includes("city")
    ) {
      return "city_centre";
    }

    return "residential";
  }

  setDistrict(district) {
    if (!district) {
      return false;
    }

    const previous = this.currentDistrict;

    this.currentDistrict = district;
    this.currentTheme = this.resolveTheme(district);

    this.emit("world:district-changed", {
      previous,
      current: district,
      theme: this.currentTheme,
    });

    return true;
  }

  initialize(district = null) {
    this.clearSegments();

    this.segmentIndex = 0;
    this.worldOffset = 0;

    if (district) {
      this.setDistrict(district);
    }

    for (
      let i = 0;
      i < WORLD_CONFIG.visibleSegments;
      i += 1
    ) {
      this.createSegment(this.currentDistrict);
    }

    this.emit("world:initialized", this.getSnapshot());

    return this.getSnapshot();
  }

  update(deltaSeconds, speed = 0) {
    if (this.disposed || !Number.isFinite(deltaSeconds)) {
      return;
    }

    const delta = Math.max(0, Math.min(deltaSeconds, 0.1));
    const distance = Math.max(0, speed) * delta;

    this.worldOffset += distance;

    for (const segment of this.segments) {
      segment.z += distance;
    }

    const recycleDistance = WORLD_CONFIG.segmentLength;

    while (
      this.segments.length > 0 &&
      this.segments[0].z > recycleDistance
    ) {
      const recycled = this.segments.shift();

      this.removeSegmentProps(recycled);

      const nextZ = this.segments.length
        ? this.segments[this.segments.length - 1].z -
          WORLD_CONFIG.segmentLength
        : -WORLD_CONFIG.segmentLength;

      const replacement = this.createSegment(this.currentDistrict);
      replacement.z = nextZ;

      for (const prop of replacement.props) {
        prop.z = nextZ - this.randomRange(
          0,
          WORLD_CONFIG.segmentLength
        );
      }

      this.emit("world:segment-recycled", {
        removedId: recycled.id,
        replacementId: replacement.id,
      });
    }
  }

  removeSegmentProps(segment) {
    const removedIds = new Set(
      segment.props.map((prop) => prop.id)
    );

    this.props = this.props.filter(
      (prop) => !removedIds.has(prop.id)
    );
  }

  clearSegments() {
    this.segments.length = 0;
    this.props.length = 0;
  }

  getNearbyProps(positionZ, range = 80) {
    return this.props.filter(
      (prop) => Math.abs(prop.z - positionZ) <= range
    );
  }

  getSnapshot() {
    return {
      segmentCount: this.segments.length,
      propCount: this.props.length,
      segmentIndex: this.segmentIndex,
      worldOffset: this.worldOffset,
      currentDistrict: this.currentDistrict,
      currentTheme: this.currentTheme,
      roadWidth: WORLD_CONFIG.roadWidth,
      laneWidth: WORLD_CONFIG.laneWidth,
    };
  }

  emit(eventName, payload = {}) {
    this.eventBus?.emit?.(eventName, payload);
  }

  destroy() {
    this.clearSegments();

    this.scene = null;
    this.routeSystem = null;
    this.eventBus = null;
    this.currentDistrict = null;
    this.disposed = true;
  }
}

export {
  WORLD_CONFIG,
  DISTRICT_THEMES,
  PROP_TYPES,
};