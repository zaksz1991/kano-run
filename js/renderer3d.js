// Kano Run — Adaidaita Sahu
// Reliable 3D renderer
//
// The scene does NOT depend on image assets to be visible.
// Local PNG assets are loaded when available, but every major
// object also has a procedural 3D fallback.
//
// Compatible with:
//   game.js
//   main.js
//
// Public renderer API:
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
  const result =
    String(
      value ?? ''
    ).trim();

  return result || fallback;
}

function pick(array, index) {
  if (
    !Array.isArray(array) ||
    array.length === 0
  ) {
    return null;
  }

  return array[
    Math.abs(index) % array.length
  ];
}

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas =
      game?.canvas || null;

    this.ready = false;
    this.paused = false;

    this.width = 1;
    this.height = 1;

    this.quality =
      'high';

    this.renderer = null;
    this.scene = null;
    this.camera = null;

    this.textureLoader =
      new THREE.TextureLoader();

    this.textures =
      new Map();

    this.vehiclePool = [];
    this.zonePool = [];
    this.coinPool = [];
    this.peoplePool = [];
    this.effectPool = [];
    this.environmentPool = [];

    this.playerRoot = null;
    this.playerFallback = null;
    this.playerSprite = null;
    this.playerShadow = null;

    this.driverRoot = null;
    this.driverFallback = null;
    this.driverSprite = null;

    this.environmentRoot = null;
    this.ground = null;
    this.horizon = null;

    this.roadMarkings = [];
    this.roadEdgeMarks = [];

    this.ambientLight = null;
    this.sunLight = null;
    this.fillLight = null;

    this.weather =
      'clear';

    this.timeOfDay =
      'day';

    this.playerCurrentX = 0;
    this.playerTargetX = 0;
    this.playerLane = 1;

    this.opening = {
      active: false,
      stage: 'idle',
      frame: 0,
      driverId: 'ruffneck',
      paint: 'classic'
    };

    this.lastGame = null;
    this.lastRenderToken = null;

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

    this.width =
      width;

    this.height =
      height;

    this.renderer =
      new THREE.WebGLRenderer({
        canvas:
          this.canvas,

        antialias:
          true,

        alpha:
          false,

        powerPreference:
          'high-performance'
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
      'outputColorSpace' in
      this.renderer &&
      THREE.SRGBColorSpace
    ) {
      this.renderer.outputColorSpace =
        THREE.SRGBColorSpace;
    }

    this.renderer.setClearColor(
      0x83b7d8,
      1
    );

    this.scene =
      new THREE.Scene();

    this.scene.background =
      new THREE.Color(
        0x83b7d8
      );

    this.scene.fog =
      new THREE.Fog(
        0x83b7d8,
        35,
        170
      );

    this.camera =
      new THREE.PerspectiveCamera(
        58,
        width /
          Math.max(
            height,
            1
          ),
        0.1,
        260
      );

    this.camera.position.set(
      0,
      6.3,
      12.5
    );

    this.camera.lookAt(
      0,
      1.6,
      -28
    );

    this.setupLights();
    this.setupRoad();
    this.setupEnvironment();
    this.setupPlayer();
    this.setupPools();

    this.ready =
      true;

    this.resize();

    this.syncGame(
      this.game
    );

    this.render(
      this.game
    );
  }

  setupLights() {
    this.ambientLight =
      new THREE.HemisphereLight(
        0xcce4f4,
        0x514437,
        1.8
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
      -30,
      45,
      26
    );

    this.scene.add(
      this.sunLight
    );

    this.fillLight =
      new THREE.DirectionalLight(
        0xffd5a5,
        0.55
      );

    this.fillLight.position.set(
      28,
      18,
      -30
    );

    this.scene.add(
      this.fillLight
    );
  }

  material(
    color,
    roughness = 0.72,
    metalness = 0.05,
    emissive = 0x000000
  ) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity:
        emissive !== 0
          ? 0.25
          : 0
    });
  }

  setupRoad() {
    const group =
      new THREE.Group();

    group.name =
      'KanoRoad';

    const road =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          11,
          ROAD_LEN
        ),
        this.material(
          0x30353c,
          0.96
        )
      );

    road.rotation.x =
      -Math.PI / 2;

    road.position.set(
      0,
      0,
      -ROAD_LEN / 2 +
        10
    );

    group.add(
      road
    );

    const leftShoulder =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          4.2,
          ROAD_LEN
        ),
        this.material(
          0x8b765d,
          1
        )
      );

    leftShoulder.rotation.x =
      -Math.PI / 2;

    leftShoulder.position.set(
      -7.5,
      -0.025,
      -ROAD_LEN / 2 +
        10
    );

    group.add(
      leftShoulder
    );

    const rightShoulder =
      leftShoulder.clone();

    rightShoulder.position.x =
      7.5;

    group.add(
      rightShoulder
    );

    const edgeMaterial =
      new THREE.MeshBasicMaterial({
        color:
          0xf3d269
      });

    for (
      const x of [
        -5.25,
        5.25
      ]
    ) {
      const edge =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.09,
            0.04,
            ROAD_LEN
          ),
          edgeMaterial
        );

      edge.position.set(
        x,
        0.03,
        -ROAD_LEN / 2 +
          10
      );

      group.add(
        edge
      );

      this.roadEdgeMarks.push(
        edge
      );
    }

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
        i < 30;
        i += 1
      ) {
        const marker =
          new THREE.Mesh(
            new THREE.BoxGeometry(
              0.11,
              0.025,
              3.4
            ),
            new THREE.MeshBasicMaterial({
              color:
                0xf0e8c2
            })
          );

        marker.position.set(
          x,
          0.035,
          5 -
            i * 7
        );

        group.add(
          marker
        );

        this.roadMarkings.push(
          marker
        );
      }
    }

    this.scene.add(
      group
    );
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
      [-9.0, -6, 0],
      [9.0, -13, 1],
      [-9.2, -22, 2],
      [9.1, -31, 3],
      [-9.3, -40, 4],
      [9.2, -50, 5],
      [-9.0, -61, 6],
      [9.1, -73, 7],
      [-9.2, -86, 8],
      [9.0, -99, 0],
      [-9.3, -112, 3],
      [9.3, -126, 1],
      [-9.1, -141, 4],
      [9.2, -156, 5],
      [-9.2, -172, 2]
    ];

    for (
      let i = 0;
      i < positions.length;
      i += 1
    ) {
      const item =
        positions[i];

      const root =
        this.makeEnvironmentFallback(
          item[2],
          i
        );

      root.position.set(
        item[0],
        0,
        item[1]
      );

      root.userData.baseZ =
        item[1];

      root.userData.side =
        item[0] < 0
          ? -1
          : 1;

      this.environmentRoot.add(
        root
      );

      this.environmentPool.push(
        root
      );
    }

    this.ground =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          200,
          320
        ),
        this.material(
          0x8d775c,
          1
        )
      );

    this.ground.rotation.x =
      -Math.PI / 2;

    this.ground.position.set(
      0,
      -0.05,
      -100
    );

    this.scene.add(
      this.ground
    );

    this.horizon =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          220,
          70
        ),
        new THREE.MeshBasicMaterial({
          color:
            0x73906f
        })
      );

    this.horizon.position.set(
      0,
      16,
      -125
    );

    this.scene.add(
      this.horizon
    );
  }

  makeEnvironmentFallback(
    type,
    index
  ) {
    const root =
      new THREE.Group();

    const kind =
      Math.abs(
        Number(type) || 0
      );

    const baseColor =
      [
        0xc08b5a,
        0xd5a36a,
        0xb97b4b,
        0x8f9f8d,
        0xd9c69a,
        0xc95d36,
        0x75899b,
        0xa64b31,
        0xb7a47b
      ][
        kind % 9
      ];

    if (kind === 3) {
      const mosque =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            3.1,
            3.2,
            2.8
          ),
          this.material(
            0xd8d6c9,
            0.86
          )
        );

      mosque.position.y =
        1.6;

      root.add(
        mosque
      );

      const dome =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            1.1,
            16,
            12,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
          ),
          this.material(
            0x2f8b6e,
            0.5,
            0.05
          )
        );

      dome.position.y =
        3.25;

      root.add(
        dome
      );

      for (
        const x of [
          -1.5,
          1.5
        ]
      ) {
        const tower =
          new THREE.Mesh(
            new THREE.CylinderGeometry(
              0.22,
              0.28,
              4.3,
              12
            ),
            this.material(
              0xe2ddca,
              0.8
            )
          );

        tower.position.set(
          x,
          2.15,
          -0.45
        );

        root.add(
          tower
        );

        const top =
          new THREE.Mesh(
            new THREE.ConeGeometry(
              0.38,
              0.65,
              12
            ),
            this.material(
              0x2f8b6e,
              0.5
            )
          );

        top.position.set(
          x,
          4.6,
          -0.45
        );

        root.add(
          top
        );
      }

      return root;
    }

    if (kind === 5) {
      const canopy =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            4.1,
            0.18,
            2.7
          ),
          this.material(
            0xd53c2f,
            0.55
          )
        );

      canopy.position.y =
        3;

      root.add(
        canopy
      );

      for (
        const x of [
          -1.6,
          1.6
        ]
      ) {
        const pillar =
          new THREE.Mesh(
            new THREE.CylinderGeometry(
              0.12,
              0.12,
              3,
              8
            ),
            this.material(
              0xf3f0e5,
              0.55
            )
          );

        pillar.position.set(
          x,
          1.5,
          0
        );

        root.add(
          pillar
        );
      }

      const pump =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.55,
            1.25,
            0.45
          ),
          this.material(
            0x28323d,
            0.55
          )
        );

      pump.position.set(
        0,
        0.65,
        0.45
      );

      root.add(
        pump
      );

      return root;
    }

    if (kind === 6) {
      const shelter =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            2.8,
            1.7,
            1.6
          ),
          this.material(
            0x596a77,
            0.82
          )
        );

      shelter.position.y =
        0.85;

      root.add(
        shelter
      );

      const roof =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            3.1,
            0.15,
            1.85
          ),
          this.material(
            0x34434e,
            0.7
          )
        );

      roof.position.y =
        1.8;

      root.add(
        roof
      );

      return root;
    }

    if (kind === 7) {
      const pole =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.08,
            0.08,
            3.3,
            8
          ),
          this.material(
            0x4f5861,
            0.6,
            0.3
          )
        );

      pole.position.y =
        1.65;

      root.add(
        pole
      );

      const board =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            2.6,
            1.15,
            0.12
          ),
          this.material(
            index % 2 === 0
              ? 0x1d5f8f
              : 0x198754,
            0.7
          )
        );

      board.position.y =
        3.15;

      root.add(
        board
      );

      return root;
    }

    if (kind === 8) {
      const pole =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.06,
            0.08,
            4.2,
            8
          ),
          this.material(
            0x59636d,
            0.5,
            0.35
          )
        );

      pole.position.y =
        2.1;

      root.add(
        pole
      );

      const lamp =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            0.24,
            10,
            8
          ),
          this.material(
            0xffdf6d,
            0.3,
            0,
            0xffb300
          )
        );

      lamp.position.y =
        4.2;

      root.add(
        lamp
      );

      return root;
    }

    const width =
      2.5 +
      (
        index % 3
      ) *
      0.55;

    const height =
      2.4 +
      (
        index % 4
      ) *
      0.5;

    const depth =
      2 +
      (
        index % 2
      ) *
      0.6;

    const building =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          width,
          height,
          depth
        ),
        this.material(
          baseColor,
          0.9
        )
      );

    building.position.y =
      height / 2;

    root.add(
      building
    );

    const roof =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          width + 0.2,
          0.18,
          depth + 0.2
        ),
        this.material(
          index % 2 === 0
            ? 0x4a352a
            : 0x69737a,
          0.94
        )
      );

    roof.position.y =
      height +
      0.08;

    root.add(
      roof
    );

    const door =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.42,
          0.9,
          0.1
        ),
        this.material(
          0x3b2921,
          0.95
        )
      );

    door.position.set(
      0,
      0.45,
      depth / 2 +
      0.055
    );

    root.add(
      door
    );

    return root;
  }

  setupPlayer() {
    this.playerRoot =
      new THREE.Group();

    this.playerRoot.name =
      'PlayerKeke';

    this.playerRoot.position.set(
      0,
      0,
      PLAYER_Z
    );

    this.scene.add(
      this.playerRoot
    );

    this.playerFallback =
      this.makeKekeFallback(
        0xf2c20f,
        true
      );

    this.playerRoot.add(
      this.playerFallback
    );

    this.playerSprite =
      this.createSprite(
        ASSETS.player.normal,
        3.8,
        3.8,
        'player-keke'
      );

    this.playerSprite.position.set(
      0,
      2.05,
      0
    );

    this.playerSprite.material.opacity =
      0;

    this.playerRoot.add(
      this.playerSprite
    );

    this.playerShadow =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          1.25,
          24
        ),
        new THREE.MeshBasicMaterial({
          color:
            0x000000,
          transparent:
            true,
          opacity:
            0.28,
          depthWrite:
            false
        })
      );

    this.playerShadow.rotation.x =
      -Math.PI / 2;

    this.playerShadow.position.set(
      0,
      0.03,
      PLAYER_Z + 0.35
    );

    this.scene.add(
      this.playerShadow
    );

    this.driverRoot =
      new THREE.Group();

    this.driverRoot.name =
      'OpeningDriver';

    this.scene.add(
      this.driverRoot
    );

    this.driverFallback =
      this.makePersonFallback(
        1.8,
        true
      );

    this.driverFallback.position.set(
      -4.6,
      0,
      0
    );

    this.driverRoot.add(
      this.driverFallback
    );

    this.driverSprite =
      this.createSprite(
        ASSETS.people.passenger,
        1.8,
        1.8,
        'opening-driver'
      );

    this.driverSprite.position.set(
      -4.6,
      1.15,
      PLAYER_Z + 2.4
    );

    this.driverSprite.material.opacity =
      0;

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
        this.createVehicle(
          i
        );

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
        this.createZone(
          i
        );

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
        this.createCoin(
          i
        );

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
        this.createPerson(
          i
        );

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
        this.createEffect(
          i
        );

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

    let texture = null;

    try {
      texture =
        this.textureLoader.load(
          path,
          loaded => {
            if (
              'colorSpace' in
                loaded &&
              THREE.SRGBColorSpace
            ) {
              loaded.colorSpace =
                THREE.SRGBColorSpace;
            }

            loaded.minFilter =
              THREE.LinearFilter;

            loaded.magFilter =
              THREE.LinearFilter;

            loaded.generateMipmaps =
              true;

            loaded.needsUpdate =
              true;
          },
          undefined,
          () => {
            // Procedural fallback remains visible.
          }
        );
    } catch {
      texture = null;
    }

    this.textures.set(
      path,
      texture
    );

    return texture;
  }

  textureReady(sprite) {
    const image =
      sprite?.material
        ?.map
        ?.image;

    if (!image) {
      return false;
    }

    return (
      num(
        image.naturalWidth,
        0
      ) > 0 ||
      num(
        image.width,
        0
      ) > 0
    );
  }

  createSprite(
    path,
    width,
    height,
    name = 'sprite'
  ) {
    const texture =
      this.createTexture(
        path
      );

    const material =
      new THREE.SpriteMaterial({
        map:
          texture,
        transparent:
          true,
        opacity:
          1,
        depthTest:
          false,
        depthWrite:
          false,
        color:
          0xffffff
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

  makeKekeFallback(
    color = 0xf2c20f,
    player = false
  ) {
    const root =
      new THREE.Group();

    const body =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.65,
          0.75,
          1.8
        ),
        this.material(
          color,
          0.58,
          0.08
        )
      );

    body.position.set(
      0,
      0.78,
      0
    );

    root.add(
      body
    );

    const lower =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.48,
          0.28,
          1.45
        ),
        this.material(
          0x17191d,
          0.9
        )
      );

    lower.position.set(
      0,
      0.42,
      0
    );

    root.add(
      lower
    );

    const canopy =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.8,
          0.18,
          1.7
        ),
        this.material(
          player
            ? 0xffdd36
            : 0xf4b619,
          0.45
        )
      );

    canopy.position.set(
      0,
      1.75,
      -0.08
    );

    root.add(
      canopy
    );

    for (
      const x of [
        -0.7,
        0.7
      ]
    ) {
      const pillarFront =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.09,
            0.9,
            0.09
          ),
          this.material(
            0x20242a,
            0.85
          )
        );

      pillarFront.position.set(
        x,
        1.28,
        0.62
      );

      root.add(
        pillarFront
      );

      const pillarRear =
        pillarFront.clone();

      pillarRear.position.z =
        -0.62;

      root.add(
        pillarRear
      );
    }

    const windshield =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.28,
          0.48,
          0.08
        ),
        this.material(
          0x3a6f95,
          0.22,
          0.12
        )
      );

    windshield.position.set(
      0,
      1.35,
      0.87
    );

    root.add(
      windshield
    );

    const frontPanel =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.35,
          0.46,
          0.3
        ),
        this.material(
          player
            ? 0xe3af17
            : color,
          0.6
        )
      );

    frontPanel.position.set(
      0,
      0.72,
      0.92
    );

    root.add(
      frontPanel
    );

    const bumper =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.45,
          0.13,
          0.12
        ),
        this.material(
          0x252a31,
          0.82,
          0.22
        )
      );

    bumper.position.set(
      0,
      0.46,
      1.09
    );

    root.add(
      bumper
    );

    const lightMaterial =
      this.material(
        0xffee8a,
        0.25,
        0,
        0xffc107
      );

    for (
      const x of [
        -0.4,
        0.4
      ]
    ) {
      const light =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            0.11,
            10,
            8
          ),
          lightMaterial
        );

      light.position.set(
        x,
        0.73,
        1.1
      );

      root.add(
        light
      );
    }

    const seat =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.35,
          0.2,
          0.55
        ),
        this.material(
          0x24282d,
          0.92
        )
      );

    seat.position.set(
      0,
      0.9,
      -0.35
    );

    root.add(
      seat
    );

    const wheelMaterial =
      this.material(
        0x121417,
        0.98,
        0
      );

    const hubMaterial =
      this.material(
        0xa7adb4,
        0.38,
        0.58
      );

    const wheel =
      (
        x,
        z,
        radius
      ) => {
        const tire =
          new THREE.Mesh(
            new THREE.CylinderGeometry(
              radius,
              radius,
              0.22,
              16
            ),
            wheelMaterial
          );

        tire.rotation.z =
          Math.PI / 2;

        tire.position.set(
          x,
          radius,
          z
        );

        root.add(
          tire
        );

        const hub =
          new THREE.Mesh(
            new THREE.CylinderGeometry(
              radius * 0.32,
              radius * 0.32,
              0.25,
              12
            ),
            hubMaterial
          );

        hub.rotation.z =
          Math.PI / 2;

        hub.position.copy(
          tire.position
        );

        root.add(
          hub
        );
      };

    wheel(
      -0.72,
      -0.55,
      0.31
    );

    wheel(
      0.72,
      -0.55,
      0.31
    );

    wheel(
      0,
      0.91,
      0.27
    );

    const handle =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.035,
          0.035,
          0.75,
          8
        ),
        hubMaterial
      );

    handle.rotation.z =
      Math.PI / 2;

    handle.position.set(
      0,
      1.2,
      0.82
    );

    root.add(
      handle
    );

    const plate =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.46,
          0.16,
          0.05
        ),
        this.material(
          0xffffff,
          0.7
        )
      );

    plate.position.set(
      0,
      0.55,
      1.11
    );

    root.add(
      plate
    );

    return root;
  }

  makeCarFallback(
    color = 0xd93f36
  ) {
    const root =
      new THREE.Group();

    const body =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.8,
          0.65,
          3.2
        ),
        this.material(
          color,
          0.48,
          0.12
        )
      );

    body.position.y =
      0.72;

    root.add(
      body
    );

    const cabin =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.55,
          0.72,
          1.6
        ),
        this.material(
          color,
          0.5,
          0.12
        )
      );

    cabin.position.set(
      0,
      1.3,
      -0.15
    );

    root.add(
      cabin
    );

    const glass =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.38,
          0.42,
          1.42
        ),
        this.material(
          0x27485f,
          0.18,
          0.18
        )
      );

    glass.position.set(
      0,
      1.32,
      0.38
    );

    root.add(
      glass
    );

    for (
      const x of [
        -0.82,
        0.82
      ]
    ) {
      for (
        const z of [
          -1.05,
          1.05
        ]
      ) {
        const tire =
          new THREE.Mesh(
            new THREE.CylinderGeometry(
              0.29,
              0.29,
              0.18,
              14
            ),
            this.material(
              0x101216,
              0.98
            )
          );

        tire.rotation.z =
          Math.PI / 2;

        tire.position.set(
          x,
          0.32,
          z
        );

        root.add(
          tire
        );
      }
    }

    return root;
  }

  makeBusFallback() {
    const root =
      new THREE.Group();

    const body =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.05,
          1.85,
          4.6
        ),
        this.material(
          0x1f8664,
          0.7
        )
      );

    body.position.y =
      1.35;

    root.add(
      body
    );

    const window =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.8,
          0.75,
          3.75
        ),
        this.material(
          0x29475a,
          0.22,
          0.15
        )
      );

    window.position.set(
      0,
      1.65,
      0
    );

    root.add(
      window
    );

    return root;
  }

  makeTruckFallback() {
    const root =
      new THREE.Group();

    const cab =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.9,
          1.55,
          1.55
        ),
        this.material(
          0xd78a31,
          0.55
        )
      );

    cab.position.set(
      0,
      1.2,
      1.3
    );

    root.add(
      cab
    );

    const cargo =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.05,
          1.8,
          2.7
        ),
        this.material(
          0x8d949b,
          0.82
        )
      );

    cargo.position.set(
      0,
      1.35,
      -0.75
    );

    root.add(
      cargo
    );

    return root;
  }

  makeMotorcycleFallback() {
    const root =
      new THREE.Group();

    const frame =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.32,
          0.26,
          1.65
        ),
        this.material(
          0xd73434,
          0.5
        )
      );

    frame.position.y =
      0.64;

    root.add(
      frame
    );

    for (
      const z of [
        -0.72,
        0.72
      ]
    ) {
      const tire =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.28,
            0.28,
            0.16,
            14
          ),
          this.material(
            0x111318,
            0.98
          )
        );

      tire.rotation.z =
        Math.PI / 2;

      tire.position.set(
        0,
        0.28,
        z
      );

      root.add(
        tire
      );
    }

    const seat =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.52,
          0.12,
          0.62
        ),
        this.material(
          0x16191d,
          0.9
        )
      );

    seat.position.set(
      0,
      0.88,
      -0.05
    );

    root.add(
      seat
    );

    return root;
  }

  makePersonFallback(
    scale = 1,
    driver = false
  ) {
    const root =
      new THREE.Group();

    const skin =
      this.material(
        driver
          ? 0x6d412a
          : 0x72472f,
        0.82
      );

    const clothing =
      this.material(
        driver
          ? 0xf0ede0
          : 0x356e8d,
        0.84
      );

    const dark =
      this.material(
        0x1e252c,
        0.94
      );

    const body =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.45,
          0.72,
          0.32
        ),
        clothing
      );

    body.position.y =
      1.05;

    root.add(
      body
    );

    const head =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.22,
          12,
          10
        ),
        skin
      );

    head.position.y =
      1.62;

    root.add(
      head
    );

    for (
      const x of [
        -0.12,
        0.12
      ]
    ) {
      const leg =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.13,
            0.58,
            0.14
          ),
          dark
        );

      leg.position.set(
        x,
        0.45,
        0
      );

      root.add(
        leg
      );
    }

    root.scale.setScalar(
      scale
    );

    return root;
  }

  vehicleFallback(
    type,
    index
  ) {
    const value =
      safeString(
        type,
        'car'
      ).toLowerCase();

    if (
      value.includes(
        'bus'
      )
    ) {
      return this.makeBusFallback();
    }

    if (
      value.includes(
        'truck'
      )
    ) {
      return this.makeTruckFallback();
    }

    if (
      value.includes(
        'motor'
      ) ||
      value.includes(
        'bike'
      )
    ) {
      return this.makeMotorcycleFallback();
    }

    if (
      value.includes(
        'keke'
      ) ||
      value.includes(
        'tricycle'
      ) ||
      value.includes(
        'sahu'
      )
    ) {
      return this.makeKekeFallback(
        index % 2 === 0
          ? 0xf2c20f
          : 0x2775bd
      );
    }

    if (
      value.includes(
        'police'
      )
    ) {
      const car =
        this.makeCarFallback(
          0x2355a6
        );

      this.addPoliceBar(
        car
      );

      return car;
    }

    if (
      value.includes(
        'karota'
      )
    ) {
      const car =
        this.makeCarFallback(
          0xf08c18
        );

      this.addPoliceBar(
        car
      );

      return car;
    }

    if (
      value.includes(
        'taxi'
      )
    ) {
      return this.makeCarFallback(
        0xe8c134
      );
    }

    return this.makeCarFallback(
      index % 2 === 0
        ? 0xd63f36
        : 0x3c6fa8
    );
  }

  addPoliceBar(root) {
    const bar =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.85,
          0.13,
          0.27
        ),
        this.material(
          0x252a31,
          0.45
        )
      );

    bar.position.set(
      0,
      2.05,
      -0.05
    );

    root.add(
      bar
    );

    const red =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.25,
          0.11,
          0.24
        ),
        this.material(
          0xf3343a,
          0.3,
          0,
          0xf3343a
        )
      );

    red.position.set(
      -0.22,
      2.06,
      -0.05
    );

    root.add(
      red
    );

    const blue =
      red.clone();

    blue.material =
      this.material(
        0x367cf5,
        0.3,
        0,
        0x367cf5
      );

    blue.position.x =
      0.22;

    root.add(
      blue
    );
  }

  createVehicle(index) {
    const root =
      new THREE.Group();

    root.visible =
      false;

    const fallback =
      this.vehicleFallback(
        'car',
        index
      );

    root.add(
      fallback
    );

    const sprite =
      this.createSprite(
        this.vehicleAssetFromIndex(
          index
        ),
        3.5,
        3.5,
        `traffic-${index}`
      );

    sprite.position.y =
      1.7;

    sprite.material.opacity =
      0;

    root.add(
      sprite
    );

    const shadow =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          1.1,
          18
        ),
        new THREE.MeshBasicMaterial({
          color:
            0x000000,
          transparent:
            true,
          opacity:
            0.22,
          depthWrite:
            false
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
      fallback,
      sprite,
      shadow,
      source: null,
      lane: 1,
      bob:
        Math.random() *
        Math.PI *
        2
    };
  }

  vehicleAssetFromIndex(
    index
  ) {
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

  rebuildVehicleFallback(
    vehicle,
    type,
    index
  ) {
    if (!vehicle) {
      return;
    }

    if (
      vehicle.fallback
    ) {
      vehicle.root.remove(
        vehicle.fallback
      );
    }

    vehicle.fallback =
      this.vehicleFallback(
        type,
        index
      );

    vehicle.root.add(
      vehicle.fallback
    );
  }

  createZone(index) {
    const root =
      new THREE.Group();

    root.visible =
      false;

    const person =
      this.makePersonFallback(
        0.95,
        false
      );

    person.position.y =
      0;

    root.add(
      person
    );

    const ring =
      new THREE.Mesh(
        new THREE.RingGeometry(
          0.65,
          0.9,
          24
        ),
        new THREE.MeshBasicMaterial({
          color:
            0x43db80,
          transparent:
            true,
          opacity:
            0.76,
          side:
            THREE.DoubleSide
        })
      );

    ring.rotation.x =
      -Math.PI / 2;

    ring.position.y =
      0.04;

    root.add(
      ring
    );

    return {
      root,
      person,
      ring,
      source: null
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
          0.36,
          0.36,
          0.12,
          20
        ),
        this.material(
          0xffc928,
          0.22,
          0.68,
          0xb77b00
        )
      );

    coin.rotation.z =
      Math.PI / 2;

    coin.position.y =
      1.25;

    root.add(
      coin
    );

    return {
      root,
      coin,
      source: null,
      spin:
        Math.random() *
        Math.PI *
        2
    };
  }

  createPerson(index) {
    const root =
      new THREE.Group();

    root.visible =
      false;

    const fallback =
      this.makePersonFallback(
        0.9 +
          (
            index % 3
          ) *
          0.08,
        false
      );

    root.add(
      fallback
    );

    const sprite =
      this.createSprite(
        pick(
          PEOPLE_ASSETS,
          index
        ),
        2.2,
        2.2,
        `pedestrian-${index}`
      );

    sprite.position.y =
      1.1;

    sprite.material.opacity =
      0;

    root.add(
      sprite
    );

    return {
      root,
      fallback,
      sprite,
      baseX:
        index % 2 === 0
          ? -6.3
          : 6.3,
      baseZ:
        -8 -
        index * 12,
      walk:
        Math.random() *
        Math.PI *
        2
    };
  }

  createEffect(index) {
    const root =
      new THREE.Group();

    root.visible =
      false;

    const puff =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.42,
          10,
          8
        ),
        new THREE.MeshBasicMaterial({
          color:
            0xbca58a,
          transparent:
            true,
          opacity:
            0.3
        })
      );

    puff.position.y =
      0.5;

    root.add(
      puff
    );

    return {
      root,
      puff,
      index
    };
  }

  objectDepth(
    source,
    index,
    game
  ) {
    if (
      source &&
      Number.isFinite(
        Number(
          source.z
        )
      )
    ) {
      return clamp(
        num(
          source.z
        ),
        -150,
        6
      );
    }

    if (
      source &&
      Number.isFinite(
        Number(
          source.y
        )
      )
    ) {
      /*
       * Game.js uses 2D-style negative Y positions.
       * Compress them into a useful 3D depth range.
       */
      const y =
        num(
          source.y
        );

      return clamp(
        2 +
          y *
          0.045,
        -125,
        3
      );
    }

    return (
      -20 -
      index * 8 +
      (
        num(
          game?.roadOff,
          0
        ) %
        120
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

    return clamp(
      (
        x /
        width -
        0.5
      ) *
        5.2,
      -3.2,
      3.2
    );
  }

  syncPlayer(game) {
    if (
      !this.playerRoot
    ) {
      return;
    }

    const lane =
      clamp(
        Math.round(
          num(
            game?.playerLane,
            1
          )
        ),
        0,
        2
      );

    const laneX =
      LANE_X[lane];

    const gameX =
      Number.isFinite(
        Number(
          game?.playerX
        )
      )
        ? this.gameXToWorld(
            game.playerX
          )
        : laneX;

    this.playerTargetX =
      clamp(
        gameX,
        -3,
        3
      );

    this.playerCurrentX +=
      (
        this.playerTargetX -
        this.playerCurrentX
      ) *
      0.22;

    this.playerLane =
      lane;

    this.playerRoot.position.set(
      this.playerCurrentX,
      0,
      PLAYER_Z
    );

    const drift =
      this.playerTargetX -
      this.playerCurrentX;

    this.playerRoot.rotation.z =
      clamp(
        drift *
        -0.035,
        -0.09,
        0.09
      );

    const speed =
      num(
        game?.speed,
        0
      );

    const damaged =
      num(
        game?.shake,
        0
      ) >
        0 &&
      num(
        game?.inv,
        0
      ) <= 0;

    let asset =
      ASSETS.player.normal;

    if (
      damaged
    ) {
      asset =
        ASSETS.player.damaged;
    } else if (
      drift < -0.08
    ) {
      asset =
        ASSETS.player.right;
    } else if (
      drift > 0.08
    ) {
      asset =
        ASSETS.player.left;
    }

    this.playerSprite.material.map =
      this.createTexture(
        asset
      );

    const hasImage =
      this.textureReady(
        this.playerSprite
      );

    this.playerSprite.material.opacity =
      hasImage
        ? 1
        : 0;

    this.playerFallback.visible =
      !hasImage;

    this.playerSprite.position.y =
      2.02 +
      Math.sin(
        performance.now() *
        0.011
      ) *
      (
        0.03 +
        speed *
        0.001
      );

    const bounce =
      Math.sin(
        performance.now() *
        0.016
      ) *
      (
        0.025 +
        speed *
        0.002
      );

    this.playerFallback.position.y =
      bounce;

    this.playerShadow.position.x =
      this.playerCurrentX;

    this.playerShadow.position.z =
      PLAYER_Z +
      0.25;

    this.playerShadow.scale.set(
      1 +
        speed *
        0.018,
      1 +
        speed *
        0.018,
      1
    );

    const blink =
      damaged &&
      Math.floor(
        performance.now() /
        80
      ) %
        2 ===
        0;

    this.playerRoot.visible =
      !blink;
  }

  syncTraffic(game) {
    const obstacles =
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

      const obstacle =
        obstacles[i];

      if (
        !obstacle
      ) {
        vehicle.root.visible =
          false;

        continue;
      }

      vehicle.root.visible =
        true;

      vehicle.source =
        obstacle;

      const lane =
        clamp(
          Math.round(
            num(
              obstacle.lane,
              1
            )
          ),
          0,
          2
        );

      vehicle.root.position.x =
        LANE_X[lane];

      vehicle.root.position.z =
        this.objectDepth(
          obstacle,
          i,
          game
        );

      vehicle.root.position.y =
        0;

      const type =
        safeString(
          obstacle.type,
          'car'
        );

      this.rebuildVehicleFallback(
        vehicle,
        type,
        i
      );

      const asset =
        this.vehicleAsset(
          obstacle,
          i
        );

      vehicle.sprite.material.map =
        this.createTexture(
          asset
        );

      const loaded =
        this.textureReady(
          vehicle.sprite
        );

      vehicle.sprite.material.opacity =
        loaded
          ? 1
          : 0;

      vehicle.fallback.visible =
        !loaded;

      const scale =
        this.vehicleScale(
          obstacle,
          i
        );

      vehicle.fallback.scale.setScalar(
        scale /
          3.2
      );

      vehicle.sprite.scale.set(
        scale,
        scale,
        1
      );

      vehicle.fallback.position.y =
        scale *
        0.42;

      vehicle.sprite.position.y =
        scale *
        0.47;

      vehicle.shadow.scale.set(
        scale /
          3,
        scale /
          3,
        1
      );

      vehicle.bob +=
        0.05 +
        num(
          obstacle.speed,
          0
        ) *
        0.008;

      const suspension =
        Math.sin(
          vehicle.bob
        ) *
        0.045;

      vehicle.fallback.position.y +=
        suspension;

      vehicle.sprite.position.y +=
        suspension;

      const laneDelta =
        num(
          obstacle.targetLane,
          lane
        ) -
        lane;

      vehicle.root.rotation.z =
        clamp(
          laneDelta *
          -0.04,
          -0.08,
          0.08
        );
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

      const passenger =
        passengers[i];

      if (
        !passenger ||
        passenger.taken
      ) {
        zone.root.visible =
          false;

        continue;
      }

      zone.root.visible =
        true;

      zone.source =
        passenger;

      zone.root.position.x =
        LANE_X[
          clamp(
            Math.round(
              num(
                passenger.lane,
                1
              )
            ),
            0,
            2
          )
        ];

      zone.root.position.z =
        this.objectDepth(
          passenger,
          i,
          game
        );

      zone.root.position.y =
        0;

      zone.person.position.y =
        0.03 +
        Math.abs(
          Math.sin(
            performance.now() *
            0.008 +
            i
          )
        ) *
        0.08;

      zone.ring.scale.setScalar(
        1 +
          Math.sin(
            performance.now() *
            0.008 +
            i
          ) *
          0.08
      );

      zone.ring.material.color.setHex(
        passenger.vip
          ? 0xb46cff
          : passenger.aishat
            ? 0xf46bb2
            : 0x43db80
      );
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
        item.root.visible =
          false;

        continue;
      }

      item.root.visible =
        true;

      item.source =
        source;

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
        ];

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

  updatePeople(game) {
    const offset =
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

      let z =
        person.baseZ +
        (
          offset %
          170
        );

      while (
        z > 8
      ) {
        z -= 170;
      }

      while (
        z < -165
      ) {
        z += 170;
      }

      person.root.position.set(
        person.baseX,
        0,
        z
      );

      person.walk +=
        0.045;

      const step =
        Math.abs(
          Math.sin(
            person.walk
          )
        ) *
        0.1;

      person.fallback.position.y =
        step;

      const texture =
        this.createTexture(
          pick(
            PEOPLE_ASSETS,
            i
          )
        );

      person.sprite.material.map =
        texture;

      const loaded =
        this.textureReady(
          person.sprite
        );

      person.sprite.material.opacity =
        loaded
          ? 1
          : 0;

      person.fallback.visible =
        !loaded;

      person.root.visible =
        true;
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
      i <
        this.environmentPool.length;
      i += 1
    ) {
      const object =
        this.environmentPool[i];

      let z =
        object.userData.baseZ +
        (
          offset %
          170
        );

      while (
        z > 10
      ) {
        z -= 170;
      }

      while (
        z < -165
      ) {
        z += 170;
      }

      object.position.z =
        z;

      object.visible =
        true;
    }
  }

  updateRoad(game) {
    const offset =
      num(
        game?.roadOff,
        0
      );

    for (
      let i = 0;
      i <
        this.roadMarkings.length;
      i += 1
    ) {
      let z =
        5 -
        (
          i % 15
        ) *
        7 +
        (
          offset % 105
        );

      while (
        z > 10
      ) {
        z -= 105;
      }

      while (
        z < -95
      ) {
        z += 105;
      }

      this.roadMarkings[i].position.z =
        z;
    }
  }

  updateEffects(game) {
    const speed =
      num(
        game?.speed,
        0
      );

    const count =
      speed > 5
        ? 4
        : speed > 4
          ? 2
          : 0;

    for (
      let i = 0;
      i <
        this.effectPool.length;
      i += 1
    ) {
      const effect =
        this.effectPool[i];

      if (
        i >= count
      ) {
        effect.root.visible =
          false;

        continue;
      }

      effect.root.visible =
        true;

      effect.root.position.set(
        this.playerCurrentX +
          (
            i % 2 === 0
              ? -0.65
              : 0.65
          ),
        0,
        PLAYER_Z +
          0.8 +
          i *
          0.18
      );

      const s =
        0.8 +
        speed *
        0.05;

      effect.root.scale.set(
        s,
        s,
        s
      );

      effect.puff.material.opacity =
        clamp(
          speed /
            18,
          0.1,
          0.42
        );
    }
  }

  updateCamera(game) {
    const speed =
      num(
        game?.speed,
        0
      );

    const desiredX =
      this.playerCurrentX *
      0.22;

    this.camera.position.x +=
      (
        desiredX -
        this.camera.position.x
      ) *
      0.08;

    this.camera.position.y =
      6.15 +
      clamp(
        speed /
          70,
        0,
        0.75
      );

    this.camera.position.z =
      12.5 -
      clamp(
        speed /
          65,
        0,
        1.6
      );

    this.camera.lookAt(
      this.playerCurrentX *
        0.12,
      1.6,
      -28
    );

    if (
      num(
        game?.shake,
        0
      ) > 0
    ) {
      const amount =
        num(
          game?.shakeMag,
          4
        );

      this.camera.position.x +=
        (
          Math.random() -
          0.5
        ) *
        amount *
        0.025;

      this.camera.position.y +=
        (
          Math.random() -
          0.5
        ) *
        amount *
        0.018;
    }
  }

  updateLighting(game) {
    const t =
      typeof game?.getTimeOfDay ===
      'function'
        ? num(
            game.getTimeOfDay(),
            0.25
          )
        : 0.25;

    if (
      t >= 0.78 ||
      t < 0.08
    ) {
      this.scene.background =
        new THREE.Color(
          0x101827
        );

      this.scene.fog.color.setHex(
        0x1d2a3b
      );

      this.ambientLight.intensity =
        0.72;

      this.sunLight.intensity =
        0.25;

      this.fillLight.intensity =
        0.85;

      this.timeOfDay =
        'night';

      return;
    }

    if (
      t >= 0.62
    ) {
      this.scene.background =
        new THREE.Color(
          0x755c65
        );

      this.scene.fog.color.setHex(
        0x805f62
      );

      this.ambientLight.intensity =
        1.0;

      this.sunLight.intensity =
        0.72;

      this.fillLight.intensity =
        0.9;

      this.timeOfDay =
        'evening';

      return;
    }

    if (
      t >= 0.42
    ) {
      this.scene.background =
        new THREE.Color(
          0x65a8cf
        );

      this.scene.fog.color.setHex(
        0x84b8d2
      );

      this.ambientLight.intensity =
        1.4;

      this.sunLight.intensity =
        1.65;

      this.fillLight.intensity =
        0.55;

      this.timeOfDay =
        'afternoon';

      return;
    }

    this.scene.background =
      new THREE.Color(
        0x83b7d8
      );

    this.scene.fog.color.setHex(
      0x83b7d8
    );

    this.ambientLight.intensity =
      1.8;

    this.sunLight.intensity =
      2.1;

    this.fillLight.intensity =
      0.55;

    this.timeOfDay =
      'day';
  }

  updateWeather(game) {
    const weather =
      typeof game?.getWeather ===
      'function'
        ? safeString(
            game.getWeather(),
            'clear'
          ).toLowerCase()
        : safeString(
            game?.weatherState,
            'clear'
          ).toLowerCase();

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
      this.scene.fog.near =
        24;

      this.scene.fog.far =
        105;

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
      this.scene.fog.near =
        18;

      this.scene.fog.far =
        100;

      return;
    }

    this.scene.fog.near =
      35;

    this.scene.fog.far =
      170;
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

    this.driverFallback.visible =
      true;

    this.driverSprite.material.opacity =
      0;

    this.driverFallback.position.set(
      -4.8,
      0,
      0
    );

    this.driverRoot.position.set(
      0,
      0,
      PLAYER_Z + 2.4
    );

    this.driverFallback.scale.setScalar(
      1
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
      !this.opening.active
    ) {
      this.driverRoot.visible =
        false;

      return;
    }

    const frame =
      this.opening.frame;

    this.driverRoot.visible =
      true;

    this.driverFallback.visible =
      true;

    if (
      frame < 75
    ) {
      const t =
        clamp(
          frame /
            75,
          0,
          1
        );

      const eased =
        t *
        t *
        (
          3 -
          2 * t
        );

      this.driverFallback.position.x =
        -4.8 +
        4.8 *
        eased;

      this.driverFallback.position.y =
        Math.abs(
          Math.sin(
            frame *
            0.22
          )
        ) *
        0.08;

      this.driverFallback.rotation.z =
        Math.sin(
          frame *
          0.22
        ) *
        0.05;

      return;
    }

    if (
      frame < 120
    ) {
      const t =
        clamp(
          (
            frame -
            75
          ) /
            45,
          0,
          1
        );

      this.driverFallback.position.x =
        0.1;

      this.driverFallback.position.y =
        0.55 -
        t *
        0.55;

      this.driverFallback.scale.setScalar(
        1 -
        t *
        0.45
      );

      return;
    }

    this.driverFallback.visible =
      false;

    this.driverSprite.material.opacity =
      0;

    if (
      frame < 165
    ) {
      this.playerFallback.rotation.y =
        Math.sin(
          frame *
          0.25
        ) *
        0.035;

      this.playerFallback.position.y =
        Math.sin(
          frame *
          0.35
        ) *
        0.02;

      return;
    }

    this.playerFallback.rotation.y =
      0;

    this.playerFallback.position.y =
      0;
  }

  setPaused(value) {
    this.paused =
      Boolean(
        value
      );
  }

  setWeather(value) {
    this.weather =
      safeString(
        value,
        'clear'
      ).toLowerCase();

    this.updateWeather({
      weather:
        this.weather
    });
  }

  setTimeOfDay(value) {
    this.timeOfDay =
      safeString(
        value,
        'day'
      ).toLowerCase();
  }

  applyPaint(paint) {
    let id =
      safeString(
        paint,
        'classic'
      ).toLowerCase();

    if (
      paint &&
      typeof paint ===
      'object'
    ) {
      id =
        safeString(
          paint.id,
          'classic'
        ).toLowerCase();
    }

    const colors = {
      classic:
        0xf2c20f,

      ruffneck:
        0xeab308,

      sky:
        0x38bdf8,

      forest:
        0x22c55e,

      royal:
        0xa855f7,

      ember:
        0xef4444,

      night:
        0x27303a
    };

    const color =
      colors[id] ||
      colors.classic;

    if (
      !this.playerFallback
    ) {
      return;
    }

    this.playerFallback.traverse(
      child => {
        if (
          child.isMesh &&
          child.material?.color
        ) {
          const width =
            child.geometry
              ?.parameters
              ?.width;

          if (
            width == null ||
            width >= 1
          ) {
            child.material.color.setHex(
              color
            );
          }
        }
      }
    );
  }

  applyQuality(value) {
    let low =
      false;

    if (
      typeof value ===
      'boolean'
    ) {
      low =
        value;
    } else {
      low =
        safeString(
          value,
          'high'
        ).toLowerCase() ===
        'low';
    }

    this.quality =
      low
        ? 'low'
        : safeString(
            value,
            'high'
          ).toLowerCase() ===
          'medium'
          ? 'medium'
          : 'high';

    if (
      !this.renderer
    ) {
      return;
    }

    const ratio =
      this.quality ===
      'low'
        ? 1
        : this.quality ===
          'medium'
          ? Math.min(
              window.devicePixelRatio ||
                1,
              1.5
            )
          : Math.min(
              window.devicePixelRatio ||
                1,
              2
            );

    this.renderer.setPixelRatio(
      ratio
    );

    this.resize();
  }

  syncGame(game) {
    if (
      !game
    ) {
      return;
    }

    this.game =
      game;

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

    this.updatePeople(
      game
    );

    this.updateEnvironment(
      game
    );

    this.updateRoad(
      game
    );

    this.updateEffects(
      game
    );

    this.updateCamera(
      game
    );

    this.updateLighting(
      game
    );

    this.updateWeather(
      game
    );

    if (
      this.opening.active
    ) {
      this.updateOpeningSequence(
        this.opening
      );
    }

    this.lastGame =
      game;
  }

  frameToken(game) {
    const gameFrame =
      num(
        game?.frame,
        0
      );

    const introFrame =
      num(
        game?.introSequence
          ?.frame,
        this.opening.frame
      );

    return (
      String(
        gameFrame
      ) +
      ':' +
      String(
        introFrame
      ) +
      ':' +
      String(
        this.paused
          ? 1
          : 0
      )
    );
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

    this.render(
      this.game
    );
  }

  render(game = this.game) {
    if (
      !this.ready ||
      !this.renderer ||
      !this.scene ||
      !this.camera
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

    const token =
      this.frameToken(
        this.game
      );

    if (
      token ===
      this.lastRenderToken
    ) {
      return;
    }

    this.renderer.render(
      this.scene,
      this.camera
    );

    this.lastRenderToken =
      token;
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

    this.lastRenderToken =
      null;
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