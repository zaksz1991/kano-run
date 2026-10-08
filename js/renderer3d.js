// Kano Run — Adaidaita Sahu
// Asset-driven 3D renderer
//
// Uses only local assets from public/assets/.
// Compatible with the existing Game class.
//
// Renderer contract:
//   draw(game)
//   render(game)
//   resize()
//   applyPaint(paint)
//   applyQuality(value)
//   startOpeningSequence(driverId, paint)
//   updateOpeningSequence(sequence)
//   setPaused(value)
//   setWeather(weather)
//   setTimeOfDay(value)

import * as THREE from '../vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];

const ROAD_LEN = 190;
const PLAYER_Z = 5.5;

const ASSETS = {
  player: {
    normal: '/assets/player/keke-player.png',
    left: '/assets/player/keke-player-left.png',
    right: '/assets/player/keke-player-right.png',
    damaged: '/assets/player/keke-player-damaged.png'
  },

  traffic: {
    kekeYellow: '/assets/traffic/keke-yellow.png',
    kekeBlue: '/assets/traffic/keke-blue.png',
    car: '/assets/traffic/car-sedan.png',
    taxi: '/assets/traffic/taxi.png',
    bus: '/assets/traffic/bus.png',
    motorcycle: '/assets/traffic/motorcycle.png',
    truck: '/assets/traffic/truck.png',
    police: '/assets/traffic/police.png',
    karota: '/assets/traffic/karota.png'
  },

  environment: {
    shop: '/assets/environment/shop.png',
    market: '/assets/environment/market-stall.png',
    house: '/assets/environment/house.png',
    mosque: '/assets/environment/mosque.png',
    school: '/assets/environment/school.png',
    petrol: '/assets/environment/petrol-station.png',
    busStop: '/assets/environment/bus-stop.png',
    billboard: '/assets/environment/billboard.png',
    streetLight: '/assets/environment/street-light.png'
  },

  people: {
    pedestrian1: '/assets/people/pedestrian-01.png',
    pedestrian2: '/assets/people/pedestrian-02.png',
    pedestrian3: '/assets/people/pedestrian-03.png',
    passenger: '/assets/people/passenger.png'
  },

  effects: {
    dust: '/assets/effects/dust.png',
    smoke: '/assets/effects/smoke.png',
    collision: '/assets/effects/collision.png',
    speedLines: '/assets/effects/speed-lines.png'
  }
};

const ENVIRONMENT_ASSETS = [
  ASSETS.environment.shop,
  ASSETS.environment.market,
  ASSETS.environment.house,
  ASSETS.environment.mosque,
  ASSETS.environment.school,
  ASSETS.environment.petrol,
  ASSETS.environment.busStop,
  ASSETS.environment.billboard,
  ASSETS.environment.streetLight
];

const PEOPLE_ASSETS = [
  ASSETS.people.pedestrian1,
  ASSETS.people.pedestrian2,
  ASSETS.people.pedestrian3
];

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function num(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeString(value, fallback = '') {
  const text = String(value ?? '').trim();

  return text || fallback;
}

function pick(array, index) {
  if (!Array.isArray(array) || !array.length) {
    return null;
  }

  return array[
    Math.abs(index) % array.length
  ];
}

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game?.canvas || null;

    this.ready = false;
    this.paused = false;

    this.width = 1;
    this.height = 1;

    this.quality = 'high';

    this.renderer = null;
    this.scene = null;
    this.camera = null;

    this.clock = new THREE.Clock();

    this.textures = new Map();
    this.textureLoader = new THREE.TextureLoader();

    this.vehiclePool = [];
    this.zonePool = [];
    this.coinPool = [];
    this.peoplePool = [];
    this.effectPool = [];
    this.environmentPool = [];

    this.playerRoot = null;
    this.playerSprite = null;
    this.playerShadow = null;

    this.road = null;
    this.roadMarkings = [];
    this.roadEdgeMarks = [];

    this.environmentRoot = null;
    this.ground = null;
    this.horizon = null;

    this.ambientLight = null;
    this.sunLight = null;
    this.fillLight = null;

    this.weather = 'clear';
    this.timeOfDay = 'day';

    this.playerCurrentX = 0;
    this.playerTargetX = 0;
    this.playerLane = 1;

    this.lastGame = null;
    this.lastRenderTime = 0;

    this.opening = {
      active: false,
      stage: 'idle',
      frame: 0,
      driverId: 'ruffneck',
      paint: 'classic'
    };

    this.driverSprite = null;
    this.driverRoot = null;

    this.init();
  }

  init() {
    if (!this.canvas) {
      return;
    }

    const width =
      this.canvas.clientWidth ||
      this.canvas.width ||
      960;

    const height =
      this.canvas.clientHeight ||
      this.canvas.height ||
      540;

    this.width = width;
    this.height = height;

    this.renderer =
      new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2
      )
    );

    this.renderer.setSize(
      width,
      height,
      false
    );

    if (
      'outputColorSpace' in this.renderer &&
      THREE.SRGBColorSpace
    ) {
      this.renderer.outputColorSpace =
        THREE.SRGBColorSpace;
    }

    this.renderer.setClearColor(
      0x87b9d9,
      1
    );

    this.scene =
      new THREE.Scene();

    this.scene.background =
      new THREE.Color(
        0x87b9d9
      );

    this.scene.fog =
      new THREE.Fog(
        0x87b9d9,
        35,
        165
      );

    this.camera =
      new THREE.PerspectiveCamera(
        55,
        width / Math.max(height, 1),
        0.1,
        260
      );

    this.camera.position.set(
      0,
      5.8,
      11.5
    );

    this.camera.lookAt(
      0,
      1.8,
      -28
    );

    this.setupLights();
    this.setupRoad();
    this.setupEnvironment();
    this.setupPlayer();
    this.setupPools();

    this.ready = true;

    this.resize();
  }

  setupLights() {
    this.ambientLight =
      new THREE.HemisphereLight(
        0xc5def0,
        0x51463b,
        1.7
      );

    this.scene.add(
      this.ambientLight
    );

    this.sunLight =
      new THREE.DirectionalLight(
        0xffffff,
        2.1
      );

    this.sunLight.position.set(
      -32,
      52,
      30
    );

    this.scene.add(
      this.sunLight
    );

    this.fillLight =
      new THREE.DirectionalLight(
        0xffd4a0,
        0.5
      );

    this.fillLight.position.set(
      28,
      16,
      -38
    );

    this.scene.add(
      this.fillLight
    );
  }

  setupRoad() {
    const roadGroup =
      new THREE.Group();

    roadGroup.name =
      'KanoRoad';

    const roadGeometry =
      new THREE.PlaneGeometry(
        11,
        ROAD_LEN
      );

    const roadMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x363636,
        roughness: 0.97,
        metalness: 0
      });

    this.road =
      new THREE.Mesh(
        roadGeometry,
        roadMaterial
      );

    this.road.rotation.x =
      -Math.PI / 2;

    this.road.position.set(
      0,
      0,
      -ROAD_LEN / 2 + 10
    );

    roadGroup.add(
      this.road
    );

    const shoulderGeometry =
      new THREE.PlaneGeometry(
        3.8,
        ROAD_LEN
      );

    const shoulderMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x8c765b,
        roughness: 1
      });

    const leftShoulder =
      new THREE.Mesh(
        shoulderGeometry,
        shoulderMaterial
      );

    leftShoulder.rotation.x =
      -Math.PI / 2;

    leftShoulder.position.set(
      -7.2,
      -0.02,
      -ROAD_LEN / 2 + 10
    );

    roadGroup.add(
      leftShoulder
    );

    const rightShoulder =
      leftShoulder.clone();

    rightShoulder.position.x =
      7.2;

    roadGroup.add(
      rightShoulder
    );

    this.scene.add(
      roadGroup
    );

    this.roadMarkings =
      [];

    for (
      let lane = 0;
      lane < 2;
      lane += 1
    ) {
      const x =
        lane === 0
          ? -1.2
          : 1.2;

      for (
        let i = 0;
        i < 22;
        i += 1
      ) {
        const marker =
          new THREE.Mesh(
            new THREE.PlaneGeometry(
              0.12,
              4.4
            ),
            new THREE.MeshBasicMaterial({
              color: 0xf3e8bf,
              transparent: true,
              opacity: 0.84,
              side: THREE.DoubleSide
            })
          );

        marker.rotation.x =
          -Math.PI / 2;

        marker.position.set(
          x,
          0.025,
          7 - i * 9
        );

        this.scene.add(
          marker
        );

        this.roadMarkings.push(
          marker
        );
      }
    }

    const edgeMaterial =
      new THREE.MeshBasicMaterial({
        color: 0xe3d39d
      });

    for (
      const x of [-5.25, 5.25]
    ) {
      const edge =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.09,
            0.035,
            ROAD_LEN
          ),
          edgeMaterial
        );

      edge.position.set(
        x,
        0.025,
        -ROAD_LEN / 2 + 10
      );

      this.scene.add(
        edge
      );

      this.roadEdgeMarks.push(
        edge
      );
    }
  }

  setupEnvironment() {
    this.environmentRoot =
      new THREE.Group();

    this.environmentRoot.name =
      'KanoEnvironment';

    this.scene.add(
      this.environmentRoot
    );

    const positions = [
      [-9.2, -4, 0],
      [9.1, -9, 1],
      [-9.4, -17, 2],
      [9.3, -24, 3],
      [-9.2, -33, 4],
      [9.4, -42, 5],
      [-9.2, -51, 6],
      [9.3, -61, 7],
      [-9.4, -72, 8],
      [9.1, -82, 0],
      [-9.3, -92, 1],
      [9.4, -103, 2],
      [-9.2, -114, 3],
      [9.3, -126, 4],
      [-9.3, -138, 5],
      [9.4, -151, 6],
      [-9.2, -164, 7],
      [9.1, -177, 8],
      [-9.4, -190, 0],
      [9.3, -204, 1]
    ];

    positions.forEach(
      (item, index) => {
        const x = item[0];
        const z = item[1];
        const type = item[2];

        const object =
          this.createEnvironmentObject(
            pick(
              ENVIRONMENT_ASSETS,
              type
            ),
            index
          );

        object.position.set(
          x,
          0,
          z
        );

        object.userData.baseZ =
          z;

        object.userData.side =
          x < 0
            ? -1
            : 1;

        this.environmentRoot.add(
          object
        );

        this.environmentPool.push(
          object
        );
      }
    );

    this.ground =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          190,
          300
        ),
        new THREE.MeshStandardMaterial({
          color: 0x917d63,
          roughness: 1
        })
      );

    this.ground.rotation.x =
      -Math.PI / 2;

    this.ground.position.set(
      0,
      -0.045,
      -95
    );

    this.scene.add(
      this.ground
    );

    this.horizon =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          220,
          60
        ),
        new THREE.MeshBasicMaterial({
          color: 0x718667
        })
      );

    this.horizon.position.set(
      0,
      17,
      -120
    );

    this.scene.add(
      this.horizon
    );
  }

  createEnvironmentObject(
    path,
    index
  ) {
    const root =
      new THREE.Group();

    const sprite =
      this.createSprite(
        path,
        this.environmentScale(
          path
        ),
        this.environmentScale(
          path
        ),
        `environment-${index}`
      );

    sprite.position.y =
      this.environmentHeight(
        path
      );

    root.add(
      sprite
    );

    const shadow =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          1.35,
          20
        ),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.16
        })
      );

    shadow.rotation.x =
      -Math.PI / 2;

    shadow.position.y =
      0.025;

    root.add(
      shadow
    );

    root.userData.sprite =
      sprite;

    root.userData.shadow =
      shadow;

    return root;
  }

  environmentScale(path) {
    if (
      path ===
      ASSETS.environment.mosque
    ) {
      return 6.8;
    }

    if (
      path ===
      ASSETS.environment.petrol
    ) {
      return 6.4;
    }

    if (
      path ===
      ASSETS.environment.school
    ) {
      return 6.2;
    }

    if (
      path ===
      ASSETS.environment.busStop
    ) {
      return 4.8;
    }

    if (
      path ===
      ASSETS.environment.billboard
    ) {
      return 4.2;
    }

    if (
      path ===
      ASSETS.environment.streetLight
    ) {
      return 4.8;
    }

    return 5.3;
  }

  environmentHeight(path) {
    if (
      path ===
      ASSETS.environment.billboard
    ) {
      return 3.2;
    }

    if (
      path ===
      ASSETS.environment.streetLight
    ) {
      return 2.5;
    }

    return 2.5;
  }

  setupPlayer() {
    this.playerRoot =
      new THREE.Group();

    this.playerRoot.name =
      'PlayerKeke';

    this.scene.add(
      this.playerRoot
    );

    this.playerSprite =
      this.createSprite(
        ASSETS.player.normal,
        4.0,
        4.0,
        'player-keke'
      );

    this.playerSprite.position.set(
      0,
      2.05,
      0
    );

    this.playerRoot.add(
      this.playerSprite
    );

    this.playerShadow =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          1.2,
          32
        ),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.28
        })
      );

    this.playerShadow.rotation.x =
      -Math.PI / 2;

    this.playerShadow.position.set(
      0,
      0.035,
      PLAYER_Z + 0.3
    );

    this.scene.add(
      this.playerShadow
    );

    // Opening-sequence driver.
    // The local passenger artwork is used because there is no
    // dedicated driver asset in public/assets/people/.
    this.driverRoot =
      new THREE.Group();

    this.driverRoot.name =
      'OpeningDriver';

    this.scene.add(
      this.driverRoot
    );

    this.driverSprite =
      this.createSprite(
        ASSETS.people.passenger,
        1.9,
        1.9,
        'opening-driver'
      );

    this.driverSprite.position.set(
      -4.6,
      1.05,
      PLAYER_Z + 2.4
    );

    this.driverRoot.add(
      this.driverSprite
    );

    this.driverRoot.visible =
      false;
  }

  setupPools() {
    for (
      let i = 0;
      i < 22;
      i += 1
    ) {
      const vehicle =
        this.createVehicle(i);

      this.scene.add(
        vehicle.root
      );

      this.vehiclePool.push(
        vehicle
      );
    }

    for (
      let i = 0;
      i < 10;
      i += 1
    ) {
      const zone =
        this.createPassengerZone(i);

      this.scene.add(
        zone.root
      );

      this.zonePool.push(
        zone
      );
    }

    for (
      let i = 0;
      i < 12;
      i += 1
    ) {
      const coin =
        this.createCoin(i);

      this.scene.add(
        coin.root
      );

      this.coinPool.push(
        coin
      );
    }

    for (
      let i = 0;
      i < 12;
      i += 1
    ) {
      const person =
        this.createPerson(i);

      this.scene.add(
        person.root
      );

      this.peoplePool.push(
        person
      );
    }

    for (
      let i = 0;
      i < 8;
      i += 1
    ) {
      const effect =
        this.createEffect(i);

      this.scene.add(
        effect.root
      );

      this.effectPool.push(
        effect
      );
    }
  }

  createTexture(path) {
    if (!path) {
      return null;
    }

    if (
      this.textures.has(path)
    ) {
      return this.textures.get(
        path
      );
    }

    const texture =
      this.textureLoader.load(
        path,
        loaded => {
          if (
            'colorSpace' in loaded &&
            THREE.SRGBColorSpace
          ) {
            loaded.colorSpace =
              THREE.SRGBColorSpace;
          }

          loaded.minFilter =
            THREE.LinearMipmapLinearFilter;

          loaded.magFilter =
            THREE.LinearFilter;

          loaded.generateMipmaps =
            true;

          if (
            this.renderer?.capabilities
              ?.getMaxAnisotropy
          ) {
            loaded.anisotropy =
              Math.min(
                this.renderer.capabilities
                  .getMaxAnisotropy(),
                8
              );
          }

          loaded.needsUpdate =
            true;
        },
        undefined,
        () => {
          // Keep rendering even if an individual local asset fails.
        }
      );

    this.textures.set(
      path,
      texture
    );

    return texture;
  }

  createSprite(
    path,
    width,
    height,
    name = 'sprite'
  ) {
    const texture =
      this.createTexture(path);

    const material =
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false
      });

    const sprite =
      new THREE.Sprite(
        material
      );

    sprite.name =
      name;

    sprite.scale.set(
      width,
      height,
      1
    );

    return sprite;
  }

  createVehicle(index) {
    const root =
      new THREE.Group();

    root.visible =
      false;

    const sprite =
      this.createSprite(
        this.vehicleAssetFromIndex(
          index
        ),
        3.2,
        3.2,
        `traffic-${index}`
      );

    sprite.position.y =
      1.5;

    root.add(
      sprite
    );

    const shadow =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          0.85,
          20
        ),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.24
        })
      );

    shadow.rotation.x =
      -Math.PI / 2;

    shadow.position.y =
      0.03;

    root.add(
      shadow
    );

    return {
      root,
      sprite,
      shadow,
      source: null,
      active: false,
      lane: 1,
      bob: Math.random() *
        Math.PI *
        2
    };
  }

  vehicleAssetFromIndex(index) {
    const assets = [
      ASSETS.traffic.kekeYellow,
      ASSETS.traffic.kekeBlue,
      ASSETS.traffic.car,
      ASSETS.traffic.taxi,
      ASSETS.traffic.bus,
      ASSETS.traffic.motorcycle,
      ASSETS.traffic.truck,
      ASSETS.traffic.police,
      ASSETS.traffic.karota
    ];

    return pick(
      assets,
      index
    );
  }

  createPassengerZone(index) {
    const root =
      new THREE.Group();

    root.visible =
      false;

    const person =
      this.createSprite(
        ASSETS.people.passenger,
        2.35,
        2.35,
        `passenger-${index}`
      );

    person.position.y =
      1.2;

    root.add(
      person
    );

    const marker =
      this.createSprite(
        ASSETS.effects.speedLines,
        1.65,
        1.65,
        `passenger-marker-${index}`
      );

    marker.position.y =
      2.8;

    marker.material.opacity =
      0.42;

    root.add(
      marker
    );

    return {
      root,
      person,
      marker,
      source: null,
      active: false
    };
  }

  createCoin(index) {
    const root =
      new THREE.Group();

    root.visible =
      false;

    const coin =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.42,
          0.42,
          0.14,
          24
        ),
        new THREE.MeshStandardMaterial({
          color: 0xf7c843,
          metalness: 0.7,
          roughness: 0.2
        })
      );

    coin.rotation.z =
      Math.PI / 2;

    coin.position.y =
      1.15;

    root.add(
      coin
    );

    return {
      root,
      coin,
      source: null,
      active: false,
      spin: Math.random() *
        Math.PI *
        2
    };
  }

  createPerson(index) {
    const root =
      new THREE.Group();

    root.visible =
      false;

    const sprite =
      this.createSprite(
        pick(
          PEOPLE_ASSETS,
          index
        ),
        2.15,
        2.15,
        `pedestrian-${index}`
      );

    sprite.position.y =
      1.15;

    root.add(
      sprite
    );

    return {
      root,
      sprite,
      active: false,
      walk: Math.random() *
        Math.PI *
        2,

      side:
        index % 2 === 0
          ? -1
          : 1,

      baseX:
        index % 2 === 0
          ? -6.0
          : 6.0,

      baseZ:
        -8 -
        index * 13
    };
  }

  createEffect(index) {
    const root =
      new THREE.Group();

    root.visible =
      false;

    const sprite =
      this.createSprite(
        ASSETS.effects.dust,
        2.2,
        2.2,
        `effect-${index}`
      );

    sprite.position.y =
      0.7;

    root.add(
      sprite
    );

    return {
      root,
      sprite,
      active: false,
      index
    };
  }

  vehicleAsset(source, index) {
    const value =
      safeString(
        source?.type ||
        source?.kind ||
        source?.vehicleType ||
        source?.vehicle ||
        source?.name,
        'car'
      ).toLowerCase();

    if (
      value.includes('police')
    ) {
      return ASSETS.traffic.police;
    }

    if (
      value.includes('karota') ||
      value.includes('checkpoint') ||
      value.includes('enforcer')
    ) {
      return ASSETS.traffic.karota;
    }

    if (
      value.includes('bus')
    ) {
      return ASSETS.traffic.bus;
    }

    if (
      value.includes('truck') ||
      value.includes('lorry')
    ) {
      return ASSETS.traffic.truck;
    }

    if (
      value.includes('taxi')
    ) {
      return ASSETS.traffic.taxi;
    }

    if (
      value.includes('motor') ||
      value.includes('bike')
    ) {
      return ASSETS.traffic.motorcycle;
    }

    if (
      value.includes('keke') ||
      value.includes('tricycle') ||
      value.includes('sahu')
    ) {
      return index % 2 === 0
        ? ASSETS.traffic.kekeYellow
        : ASSETS.traffic.kekeBlue;
    }

    return ASSETS.traffic.car;
  }

  vehicleScale(
    source,
    index
  ) {
    const value =
      safeString(
        source?.type ||
        source?.kind ||
        source?.vehicleType,
        ''
      ).toLowerCase();

    if (
      value.includes('bus')
    ) {
      return 4.55;
    }

    if (
      value.includes('truck')
    ) {
      return 4.25;
    }

    if (
      value.includes('motor')
    ) {
      return 2.35;
    }

    if (
      value.includes('keke')
    ) {
      return 3.45;
    }

    if (
      value.includes('taxi')
    ) {
      return 3.25;
    }

    if (
      value.includes('police') ||
      value.includes('karota')
    ) {
      return 3.45;
    }

    return index % 3 === 0
      ? 3.4
      : 3.1;
  }

  resetVehicle(vehicle) {
    vehicle.active =
      false;

    vehicle.source =
      null;

    vehicle.root.visible =
      false;
  }

  resetZone(zone) {
    zone.active =
      false;

    zone.source =
      null;

    zone.root.visible =
      false;
  }

  resetCoin(coin) {
    coin.active =
      false;

    coin.source =
      null;

    coin.root.visible =
      false;
  }

  objectDepth(
    source,
    index,
    game
  ) {
    if (
      source &&
      Number.isFinite(
        Number(source.z)
      )
    ) {
      return clamp(
        num(source.z),
        -178,
        9
      );
    }

    if (
      source &&
      Number.isFinite(
        Number(source.y)
      )
    ) {
      const y =
        num(
          source.y
        );

      // Game.js uses large negative screen-space Y values
      // for newly spawned traffic/passengers.
      //
      // Convert them to real 3D depth rather than using
      // the raw negative number. This keeps traffic visible
      // inside the camera's useful range.
      const z =
        7 +
        y * 0.1;

      return clamp(
        z,
        -170,
        7
      );
    }

    const offset =
      num(
        game?.roadOff,
        0
      );

    return (
      -20 -
      index * 10 +
      (
        offset % 160
      )
    );
  }

  gameXToWorld(value) {
    const x =
      num(
        value,
        0
      );

    if (
      x >= -3.5 &&
      x <= 3.5
    ) {
      return x;
    }

    const width =
      this.canvas?.clientWidth ||
      this.width ||
      960;

    if (
      width <= 0
    ) {
      return 0;
    }

    const normalized =
      x / width;

    return (
      normalized -
      0.5
    ) * 5;
  }

  syncPlayer(game) {
    if (
      !this.playerRoot ||
      !this.playerSprite
    ) {
      return;
    }

    const lane =
      clamp(
        Math.round(
          num(
            game?.playerLane,
            this.playerLane
          )
        ),
        0,
        2
      );

    this.playerLane =
      lane;

    const target =
      Number.isFinite(
        Number(game?.playerX)
      )
        ? this.gameXToWorld(
            game.playerX
          )
        : LANE_X[lane];

    this.playerTargetX =
      clamp(
        target,
        -3,
        3
      );

    this.playerCurrentX +=
      (
        this.playerTargetX -
        this.playerCurrentX
      ) *
      0.2;

    this.playerRoot.position.set(
      this.playerCurrentX,
      0,
      PLAYER_Z
    );

    const damaged =
      Boolean(
        num(game?.shake, 0) > 0 &&
        num(game?.inv, 0) <= 0
      );

    let asset =
      ASSETS.player.normal;

    const difference =
      this.playerTargetX -
      this.playerCurrentX;

    if (damaged) {
      asset =
        ASSETS.player.damaged;
    } else if (
      difference < -0.12
    ) {
      asset =
        ASSETS.player.right;
    } else if (
      difference > 0.12
    ) {
      asset =
        ASSETS.player.left;
    }

    const currentTexture =
      this.playerSprite
        .material
        .map;

    const currentSource =
      currentTexture
        ?.image
        ?.src ||
      '';

    if (
      !currentSource.endsWith(
        asset
      )
    ) {
      this.playerSprite
        .material
        .map =
        this.createTexture(
          asset
        );

      this.playerSprite
        .material
        .needsUpdate =
        true;
    }

    const speed =
      num(
        game?.speed,
        0
      );

    const bounce =
      Math.sin(
        performance.now() *
        0.012 +
        speed * 0.04
      ) *
      (
        0.035 +
        speed * 0.001
      );

    this.playerSprite.position.y =
      2.05 +
      bounce;

    this.playerSprite.rotation.z =
      clamp(
        difference *
        -0.035,
        -0.1,
        0.1
      );

    const shadowScale =
      1 +
      clamp(
        speed / 120,
        0,
        0.35
      );

    this.playerShadow.position.x =
      this.playerCurrentX;

    this.playerShadow.scale.set(
      shadowScale,
      shadowScale,
      1
    );

    const blink =
      damaged &&
      Math.floor(
        performance.now() /
        70
      ) % 2 === 0;

    this.playerRoot.visible =
      !blink;
  }

  syncTraffic(game) {
    const traffic =
      Array.isArray(
        game?.obs
      )
        ? game.obs
        : [];

    for (
      let i = 0;
      i < this.vehiclePool.length;
      i += 1
    ) {
      const vehicle =
        this.vehiclePool[i];

      const source =
        traffic[i];

      if (!source) {
        this.resetVehicle(
          vehicle
        );
        continue;
      }

      vehicle.active =
        true;

      vehicle.source =
        source;

      vehicle.root.visible =
        true;

      const lane =
        clamp(
          Math.round(
            num(
              source.lane,
              1
            )
          ),
          0,
          2
        );

      vehicle.lane =
        lane;

      vehicle.root.position.x =
        LANE_X[lane] +
        num(
          source.offsetX,
          0
        );

      vehicle.root.position.z =
        this.objectDepth(
          source,
          i,
          game
        );

      vehicle.root.position.y =
        num(
          source.height,
          0
        );

      const asset =
        this.vehicleAsset(
          source,
          i
        );

      const currentTexture =
        vehicle.sprite
          .material
          .map;

      const currentSource =
        currentTexture
          ?.image
          ?.src ||
        '';

      if (
        !currentSource.endsWith(
          asset
        )
      ) {
        vehicle.sprite.material.map =
          this.createTexture(
            asset
          );

        vehicle.sprite.material.needsUpdate =
          true;
      }

      const scale =
        this.vehicleScale(
          source,
          i
        );

      vehicle.sprite.scale.set(
        scale,
        scale,
        1
      );

      vehicle.sprite.position.y =
        scale *
        0.48;

      vehicle.shadow.scale.set(
        scale / 2.7,
        scale / 2.7,
        1
      );

      const speed =
        num(
          source.speed,
          num(game?.speed, 0)
        );

      vehicle.bob +=
        0.07 +
        speed * 0.001;

      vehicle.sprite.position.y +=
        Math.sin(
          vehicle.bob
        ) *
        0.035;

      const laneChange =
        num(
          source.targetLane,
          lane
        ) -
        lane;

      vehicle.sprite.rotation.z =
        clamp(
          laneChange *
          -0.045,
          -0.08,
          0.08
        );

      vehicle.sprite.material.opacity =
        1;
    }
  }

  syncPassengers(game) {
    const passengers =
      Array.isArray(
        game?.paxZones
      )
        ? game.paxZones
        : [];

    for (
      let i = 0;
      i < this.zonePool.length;
      i += 1
    ) {
      const zone =
        this.zonePool[i];

      const source =
        passengers[i];

      if (
        !source ||
        source.taken
      ) {
        this.resetZone(
          zone
        );
        continue;
      }

      zone.active =
        true;

      zone.source =
        source;

      zone.root.visible =
        true;

      const lane =
        clamp(
          Math.round(
            num(
              source.lane,
              1
            )
          ),
          0,
          2
        );

      zone.root.position.x =
        LANE_X[lane];

      zone.root.position.z =
        this.objectDepth(
          source,
          i,
          game
        );

      zone.person.position.y =
        1.2 +
        Math.abs(
          Math.sin(
            performance.now() *
            0.006 +
            i
          )
        ) *
        0.06;

      zone.marker.position.y =
        2.8 +
        Math.sin(
          performance.now() *
          0.008 +
          i
        ) *
        0.12;

      zone.marker.material.opacity =
        0.3 +
        Math.abs(
          Math.sin(
            performance.now() *
            0.008 +
            i
          )
        ) *
        0.28;
    }
  }

  syncCoins(game) {
    const coins =
      Array.isArray(
        game?.coins
      )
        ? game.coins
        : [];

    for (
      let i = 0;
      i < this.coinPool.length;
      i += 1
    ) {
      const item =
        this.coinPool[i];

      const source =
        coins[i];

      if (
        !source ||
        source.used ||
        source.taken
      ) {
        this.resetCoin(
          item
        );
        continue;
      }

      item.active =
        true;

      item.source =
        source;

      item.root.visible =
        true;

      item.root.position.x =
        LANE_X[
          clamp(
            Math.round(
              num(
                source.lane,
                1
              )
            ),
            0,
            2
          )
        ] +
        num(
          source.offsetX,
          0
        );

      item.root.position.z =
        this.objectDepth(
          source,
          i,
          game
        );

      item.spin +=
        0.08;

      item.coin.rotation.y =
        item.spin;

      item.coin.position.y =
        1.15 +
        Math.sin(
          performance.now() *
          0.006 +
          i
        ) *
        0.15;
    }
  }

  updateDecorativePeople(game) {
    const roadOffset =
      num(
        game?.roadOff,
        0
      );

    for (
      let i = 0;
      i < this.peoplePool.length;
      i += 1
    ) {
      const person =
        this.peoplePool[i];

      const z =
        person.baseZ +
        (
          roadOffset % 170
        );

      person.root.position.z =
        z > 8
          ? z - 170
          : z;

      person.root.position.x =
        person.baseX;

      person.root.visible =
        true;

      person.walk +=
        0.05;

      person.sprite.position.y =
        1.15 +
        Math.abs(
          Math.sin(
            person.walk
          )
        ) *
        0.08;
    }
  }

  updateEnvironment(game) {
    const offset =
      num(
        game?.roadOff,
        0
      );

    for (
      let i = 0;
      i < this.environmentPool.length;
      i += 1
    ) {
      const object =
        this.environmentPool[i];

      const base =
        num(
          object.userData.baseZ,
          object.position.z
        );

      object.userData.baseZ =
        base;

      let z =
        base +
        (
          offset % 170
        );

      if (z > 10) {
        z -= 170;
      }

      object.position.z =
        z;

      const side =
        object.userData.side ||
        (
          object.position.x < 0
            ? -1
            : 1
        );

      object.position.x =
        side *
        (
          8.4 +
          (
            i % 3
          ) *
          0.45
        );
    }
  }

  animateRoad(game) {
    const offset =
      num(
        game?.roadOff,
        0
      );

    for (
      let i = 0;
      i < this.roadMarkings.length;
      i += 1
    ) {
      const marker =
        this.roadMarkings[i];

      const base =
        7 -
        (
          i % 11
        ) *
        9;

      let z =
        base +
        (
          offset % 99
        );

      if (
        z > 10
      ) {
        z -= 99;
      }

      marker.position.z =
        z;
    }
  }

  updateCamera(game) {
    const speed =
      num(
        game?.speed,
        0
      );

    const steer =
      this.playerTargetX -
      this.playerCurrentX;

    const desiredX =
      this.playerCurrentX *
      0.24;

    this.camera.position.x +=
      (
        desiredX -
        this.camera.position.x
      ) *
      0.08;

    this.camera.position.y =
      5.7 +
      clamp(
        speed / 80,
        0,
        0.7
      );

    this.camera.position.z =
      11.5 -
      clamp(
        speed / 70,
        0,
        1.8
      );

    this.camera.lookAt(
      this.playerCurrentX *
      0.14,
      1.75,
      -30
    );

    this.camera.rotation.z =
      clamp(
        steer *
        -0.025,
        -0.045,
        0.045
      );

    if (
      num(
        game?.shake,
        0
      ) > 0
    ) {
      const magnitude =
        num(
          game?.shakeMag,
          4
        );

      this.camera.position.x +=
        (
          Math.random() -
          0.5
        ) *
        magnitude *
        0.025;

      this.camera.position.y +=
        (
          Math.random() -
          0.5
        ) *
        magnitude *
        0.02;
    }
  }

  getGameWeather(game) {
    if (
      typeof game?.getWeather ===
      'function'
    ) {
      return safeString(
        game.getWeather(),
        'clear'
      ).toLowerCase();
    }

    return safeString(
      game?.weatherState ||
      game?.weather,
      'clear'
    ).toLowerCase();
  }

  getGameTime(game) {
    if (
      typeof game?.getTimeOfDay ===
      'function'
    ) {
      const value =
        num(
          game.getTimeOfDay(),
          0.3
        );

      if (
        value >= 0.78 ||
        value < 0.08
      ) {
        return 'night';
      }

      if (
        value >= 0.62
      ) {
        return 'evening';
      }

      if (
        value >= 0.42
      ) {
        return 'afternoon';
      }

      return 'day';
    }

    return safeString(
      game?.timeOfDay ||
      game?.time ||
      'day',
      'day'
    ).toLowerCase();
  }

  updateWeather(game) {
    const weather =
      this.getGameWeather(
        game
      );

    if (
      weather ===
      this.weather
    ) {
      return;
    }

    this.weather =
      weather;

    if (
      weather.includes(
        'rain'
      )
    ) {
      this.scene.background =
        new THREE.Color(
          0x627384
        );

      this.scene.fog.color.setHex(
        0x6b7c8f
      );

      this.scene.fog.near =
        24;

      this.scene.fog.far =
        115;

      this.ambientLight.intensity =
        1.25;

      this.sunLight.intensity =
        0.85;

      return;
    }

    if (
      weather.includes(
        'dust'
      ) ||
      weather.includes(
        'harmattan'
      )
    ) {
      this.scene.background =
        new THREE.Color(
          0xc0af8e
        );

      this.scene.fog.color.setHex(
        0xc5b89f
      );

      this.scene.fog.near =
        18;

      this.scene.fog.far =
        105;

      this.ambientLight.intensity =
        1.35;

      this.sunLight.intensity =
        1.1;

      return;
    }

    this.scene.background =
      new THREE.Color(
        0x87b9d9
      );

    this.scene.fog.color.setHex(
      0x87b9d9
    );

    this.scene.fog.near =
      35;

    this.scene.fog.far =
      165;

    this.ambientLight.intensity =
      1.7;

    this.sunLight.intensity =
      2.1;
  }

  updateTimeOfDay(game) {
    const time =
      this.getGameTime(
        game
      );

    if (
      time ===
      this.timeOfDay
    ) {
      return;
    }

    this.timeOfDay =
      time;

    if (
      time ===
      'night'
    ) {
      this.scene.background =
        new THREE.Color(
          0x101a2a
        );

      this.scene.fog.color.setHex(
        0x182438
      );

      this.ambientLight.intensity =
        0.72;

      this.sunLight.intensity =
        0.25;

      this.fillLight.intensity =
        0.85;

      return;
    }

    if (
      time ===
      'evening'
    ) {
      this.scene.background =
        new THREE.Color(
          0x805f5a
        );

      this.scene.fog.color.setHex(
        0x805f5a
      );

      this.ambientLight.intensity =
        1.0;

      this.sunLight.intensity =
        0.75;

      this.fillLight.intensity =
        1.0;

      return;
    }

    if (
      time ===
      'afternoon'
    ) {
      this.scene.background =
        new THREE.Color(
          0x5fa9d4
        );

      this.scene.fog.color.setHex(
        0x84b6d0
      );

      this.ambientLight.intensity =
        1.45;

      this.sunLight.intensity =
        1.7;

      this.fillLight.intensity =
        0.55;

      return;
    }

    this.scene.background =
      new THREE.Color(
        0x87b9d9
      );

    this.scene.fog.color.setHex(
      0x87b9d9
    );

    this.ambientLight.intensity =
      1.7;

    this.sunLight.intensity =
      2.1;

    this.fillLight.intensity =
      0.5;
  }

  updateEffects(game) {
    const speed =
      num(
        game?.speed,
        0
      );

    const activeCount =
      this.quality === 'high'
        ? 4
        : this.quality === 'medium'
          ? 2
          : 1;

    for (
      let i = 0;
      i < this.effectPool.length;
      i += 1
    ) {
      const effect =
        this.effectPool[i];

      if (
        speed <= 4 ||
        i >= activeCount
      ) {
        effect.root.visible =
          false;

        effect.active =
          false;

        continue;
      }

      effect.active =
        true;

      effect.root.visible =
        true;

      effect.root.position.set(
        this.playerCurrentX +
        (
          i % 2 === 0
            ? -0.8
            : 0.8
        ),
        0.2,
        PLAYER_Z +
        0.9
      );

      effect.sprite.material.map =
        this.createTexture(
          ASSETS.effects.dust
        );

      effect.sprite.material.needsUpdate =
        true;

      effect.sprite.material.opacity =
        clamp(
          speed / 18,
          0.12,
          0.5
        );

      const scale =
        1.55 +
        speed *
        0.012;

      effect.sprite.scale.set(
        scale,
        scale,
        1
      );
    }
  }

  updateOpeningDriver() {
    if (
      !this.opening.active ||
      !this.driverRoot ||
      !this.driverSprite
    ) {
      return;
    }

    const frame =
      this.opening.frame;

    this.driverRoot.visible =
      true;

    if (
      frame < 75
    ) {
      const t =
        clamp(
          frame / 75,
          0,
          1
        );

      const eased =
        t * t *
        (
          3 -
          2 * t
        );

      this.driverRoot.position.x =
        -4.6 +
        (
          4.6 *
          eased
        );

      this.driverRoot.position.z =
        PLAYER_Z +
        2.4 -
        (
          1.9 *
          eased
        );

      this.driverSprite.rotation.z =
        Math.sin(
          frame * 0.22
        ) *
        0.08;

      this.driverSprite.position.y =
        1.05 +
        Math.abs(
          Math.sin(
            frame * 0.22
          )
        ) *
        0.07;

      return;
    }

    if (
      frame < 120
    ) {
      const t =
        (
          frame -
          75
        ) /
        45;

      const eased =
        clamp(
          t,
          0,
          1
        );

      this.driverRoot.position.x =
        0.15 *
        Math.sin(
          eased *
          Math.PI
        );

      this.driverRoot.position.z =
        PLAYER_Z +
        0.5 -
        eased *
        0.4;

      this.driverSprite.position.y =
        1.05 -
        eased *
        0.45;

      this.driverSprite.scale.set(
        1.9 -
        eased *
        0.9,
        1.9 -
        eased *
        0.9,
        1
      );

      return;
    }

    if (
      frame < 165
    ) {
      this.driverRoot.visible =
        false;

      this.playerRoot.scale.set(
        1 +
        Math.sin(
          frame * 0.28
        ) *
        0.015,
        1 +
        Math.sin(
          frame * 0.28
        ) *
        0.015,
        1
      );

      this.playerSprite.rotation.z =
        Math.sin(
          frame * 0.3
        ) *
        0.025;

      return;
    }

    this.driverRoot.visible =
      false;

    this.playerRoot.scale.set(
      1,
      1,
      1
    );

    this.playerSprite.rotation.z =
      0;
  }

  startOpeningSequence(
    driverId = 'ruffneck',
    paint = 'classic'
  ) {
    this.opening.active =
      true;

    this.opening.stage =
      'walk_to_keke';

    this.opening.frame =
      0;

    this.opening.driverId =
      driverId;

    this.opening.paint =
      paint;

    this.driverRoot.visible =
      true;

    this.driverRoot.position.set(
      -4.6,
      0,
      PLAYER_Z + 2.4
    );

    this.driverSprite.scale.set(
      1.9,
      1.9,
      1
    );

    this.playerRoot.visible =
      true;

    this.playerRoot.scale.set(
      1,
      1,
      1
    );

    this.playerCurrentX =
      0;

    this.playerTargetX =
      0;

    this.playerRoot.position.set(
      0,
      0,
      PLAYER_Z
    );

    this.applyPaint(
      paint
    );
  }

  updateOpeningSequence(
    sequence
  ) {
    if (
      !sequence
    ) {
      return;
    }

    this.opening.active =
      Boolean(
        sequence.active
      );

    this.opening.stage =
      safeString(
        sequence.stage,
        'idle'
      );

    this.opening.frame =
      num(
        sequence.frame,
        0
      );

    if (
      this.opening.active
    ) {
      this.updateOpeningDriver();
    } else {
      this.driverRoot.visible =
        false;
      this.playerRoot.scale.set(
        1,
        1,
        1
      );
    }
  }

  setPaused(value) {
    this.paused =
      Boolean(
        value
      );
  }

  updateWeatherDirect(value) {
    this.weather =
      safeString(
        value,
        'clear'
      ).toLowerCase();

    this.updateWeather({
      weather: this.weather
    });
  }

  setWeather(weather) {
    this.updateWeatherDirect(
      weather
    );
  }

  setTimeOfDay(time) {
    this.timeOfDay =
      safeString(
        time,
        'day'
      ).toLowerCase();

    this.updateTimeOfDay({
      timeOfDay:
        this.timeOfDay
    });
  }

  applyPaint(paint) {
    if (
      !this.playerSprite ||
      !this.playerSprite.material
    ) {
      return;
    }

    // The supplied player PNG is the actual keke artwork.
    // Keep its artwork intact rather than destroying it
    // with a recolor pass.
    this.playerSprite.material.color.set(
      0xffffff
    );

    this.playerSprite.material.needsUpdate =
      true;

    if (
      paint &&
      typeof paint === 'object' &&
      paint.color
    ) {
      try {
        this.playerSprite.material.color.set(
          paint.color
        );

        this.playerSprite.material.needsUpdate =
          true;
      } catch {
        this.playerSprite.material.color.set(
          0xffffff
        );
      }
    }
  }

  applyQuality(value) {
    const quality =
      safeString(
        value,
        'high'
      ).toLowerCase();

    if (
      quality === 'low' ||
      quality === 'medium' ||
      quality === 'high'
    ) {
      this.quality =
        quality;
    }

    if (
      !this.renderer
    ) {
      return;
    }

    const pixelRatio =
      this.quality === 'low'
        ? 1
        : this.quality === 'medium'
          ? Math.min(
              window.devicePixelRatio || 1,
              1.5
            )
          : Math.min(
              window.devicePixelRatio || 1,
              2
            );

    this.renderer.setPixelRatio(
      pixelRatio
    );

    this.renderer.setSize(
      this.width ||
        this.canvas?.clientWidth ||
        960,
      this.height ||
        this.canvas?.clientHeight ||
        540,
      false
    );
  }

  syncGame(game) {
    if (
      !game
    ) {
      return;
    }

    this.syncPlayer(
      game
    );

    this.syncTraffic(
      game
    );

    this.syncPassengers(
      game
    );

    this.syncCoins(
      game
    );

    this.updateDecorativePeople(
      game
    );

    this.updateEnvironment(
      game
    );

    this.animateRoad(
      game
    );

    this.updateCamera(
      game
    );

    this.updateWeather(
      game
    );

    this.updateTimeOfDay(
      game
    );

    this.updateEffects(
      game
    );

    if (
      this.opening.active
    ) {
      this.updateOpeningDriver();
    }

    this.lastGame =
      game;
  }

  draw(game = this.game) {
    if (
      game
    ) {
      this.game =
        game;
    }

    if (
      !this.ready
    ) {
      return;
    }

    this.syncGame(
      this.game
    );
  }

  render(game = this.game) {
    if (
      !this.ready ||
      !this.renderer
    ) {
      return;
    }

    if (
      game &&
      game !== this.lastGame
    ) {
      this.syncGame(
        game
      );
    }

    this.lastRenderTime =
      performance.now();

    this.renderer.render(
      this.scene,
      this.camera
    );
  }

  resize() {
    if (
      !this.renderer ||
      !this.camera ||
      !this.canvas
    ) {
      return;
    }

    const width =
      this.canvas.clientWidth ||
      this.canvas.width ||
      960;

    const height =
      this.canvas.clientHeight ||
      this.canvas.height ||
      540;

    this.width =
      width;

    this.height =
      height;

    this.camera.aspect =
      width /
      Math.max(
        height,
        1
      );

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(
      width,
      height,
      false
    );
  }

  destroy() {
    if (
      this.renderer
    ) {
      this.renderer.dispose();
    }

    this.textures.forEach(
      texture => {
        texture?.dispose?.();
      }
    );

    this.textures.clear();

    this.vehiclePool.length =
      0;

    this.zonePool.length =
      0;

    this.coinPool.length =
      0;

    this.peoplePool.length =
      0;

    this.effectPool.length =
      0;

    this.environmentPool.length =
      0;

    this.ready =
      false;
  }
}

export default Renderer3D;