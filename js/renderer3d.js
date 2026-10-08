import * as THREE from '../vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];
const ROAD_LEN = 150;
const PLAYER_Z = 5.5;

const PATHS = {
  player: '/assets/player/keke-player.png',
  playerLeft: '/assets/player/keke-player-left.png',
  playerRight: '/assets/player/keke-player-right.png',
  playerDamaged: '/assets/player/keke-player-damaged.png',

  kekeYellow: '/assets/traffic/keke-yellow.png',
  kekeBlue: '/assets/traffic/keke-blue.png',
  car: '/assets/traffic/car-sedan.png',
  taxi: '/assets/traffic/taxi.png',
  bus: '/assets/traffic/bus.png',
  motorcycle: '/assets/traffic/motorcycle.png',
  truck: '/assets/traffic/truck.png',
  police: '/assets/traffic/police.png',
  karota: '/assets/traffic/karota.png',

  shop: '/assets/environment/shop.png',
  market: '/assets/environment/market-stall.png',
  house: '/assets/environment/house.png',
  mosque: '/assets/environment/mosque.png',
  school: '/assets/environment/school.png',
  petrol: '/assets/environment/petrol-station.png',
  busStop: '/assets/environment/bus-stop.png',
  billboard: '/assets/environment/billboard.png',
  streetLight: '/assets/environment/street-light.png',

  ped1: '/assets/people/pedestrian-01.png',
  ped2: '/assets/people/pedestrian-02.png',
  ped3: '/assets/people/pedestrian-03.png',
  passenger: '/assets/people/passenger.png',

  dust: '/assets/effects/dust.png',
  smoke: '/assets/effects/smoke.png',
  collision: '/assets/effects/collision.png',
  speedLines: '/assets/effects/speed-lines.png'
};

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;

    this.ready = false;
    this.pools = {};
    this.zonePool = [];
    this.coinPool = [];

    this.textureLoader = new THREE.TextureLoader();
    this.textures = new Map();

    this.lastCamPx = 0;
    this.lastPlayerX = 0;

    this.trafficVisual = new WeakMap();

    this.weather = 'clear';
    this.weatherTimer = 0;
    this.weatherIndex = 0;

    this.baseSunIntensity = 1.2;
    this.baseHemIntensity = 0.5;

    this.quality = 'high';

    this.time = 0;
    this.lastTime = performance.now();

    this.roadGroup = null;
    this.cityGroup = null;
    this.trafficGroup = null;
    this.peopleGroup = null;
    this.effectGroup = null;

    this.player = null;
    this.playerWheels = [];
    this.playerSteerParts = [];

    this.cameraTarget = new THREE.Vector3();
    this.cameraCurrent = new THREE.Vector3();

    this.init();
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.75)
    );

    this.renderer.setSize(
      this.canvas.clientWidth || window.innerWidth,
      this.canvas.clientHeight || window.innerHeight,
      false
    );

    if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    if ('toneMapping' in this.renderer) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x86c4df);

    this.scene.fog = new THREE.Fog(
      0x86c4df,
      42,
      135
    );

    this.camera = new THREE.PerspectiveCamera(
      58,
      1,
      0.1,
      220
    );

    this.camera.position.set(0, 4.5, -5.2);
    this.camera.lookAt(0, 1, 18);

    this.ambientLight = new THREE.HemisphereLight(
      0xd9efff,
      0x73553d,
      this.baseHemIntensity
    );

    this.scene.add(this.ambientLight);

    this.sun = new THREE.DirectionalLight(
      0xfff0ce,
      this.baseSunIntensity
    );

    this.sun.position.set(-22, 32, -18);
    this.sun.castShadow = true;

    this.sun.shadow.mapSize.width = 1024;
    this.sun.shadow.mapSize.height = 1024;

    this.sun.shadow.camera.left = -45;
    this.sun.shadow.camera.right = 45;
    this.sun.shadow.camera.top = 65;
    this.sun.shadow.camera.bottom = -25;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 110;

    this.scene.add(this.sun);

    this.fillLight = new THREE.DirectionalLight(
      0x9fd7ff,
      0.22
    );

    this.fillLight.position.set(25, 12, 20);
    this.scene.add(this.fillLight);

    this.roadGroup = new THREE.Group();
    this.cityGroup = new THREE.Group();
    this.trafficGroup = new THREE.Group();
    this.peopleGroup = new THREE.Group();
    this.effectGroup = new THREE.Group();

    this.scene.add(this.roadGroup);
    this.scene.add(this.cityGroup);
    this.scene.add(this.trafficGroup);
    this.scene.add(this.peopleGroup);
    this.scene.add(this.effectGroup);

    this.buildRoad();
    this.buildCityscape();

    this.player = this.makeKeke(0xf5b400, true);
    this.player.position.set(0, 0, PLAYER_Z);

    this.scene.add(this.player);

    this.createPools();

    this.initParticles();
    this.resize();

    const savedQuality =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('kanoLQ')
        : null;

    if (savedQuality === 'low' || savedQuality === 'medium') {
      this.applyQuality(savedQuality);
    } else {
      this.applyQuality('high');
    }

    this.ready = true;
  }

  createPools() {
    const sizes = {
      car: 16,
      keke: 12,
      bus: 5,
      truck: 4,
      taxi: 6,
      motorcycle: 9,
      police: 4,
      karota: 4
    };

    Object.entries(sizes).forEach(([type, count]) => {
      this.pools[type] = [];

      for (let i = 0; i < count; i++) {
        const vehicle = this.makeTrafficVehicle(type);
        vehicle.visible = false;
        this.trafficGroup.add(vehicle);
        this.pools[type].push(vehicle);
      }
    });

    for (let i = 0; i < 20; i++) {
      const zone = this.makePassengerZone();
      zone.visible = false;
      this.peopleGroup.add(zone);
      this.zonePool.push(zone);
    }

    for (let i = 0; i < 22; i++) {
      const coin = this.makeCoin();
      coin.visible = false;
      this.effectGroup.add(coin);
      this.coinPool.push(coin);
    }
  }

  initParticles() {
    const dustCount = 140;

    const dustPositions = new Float32Array(
      dustCount * 3
    );

    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] =
        (Math.random() - 0.5) * 13;

      dustPositions[i * 3 + 1] =
        Math.random() * 1.5 + 0.03;

      dustPositions[i * 3 + 2] =
        Math.random() * ROAD_LEN - 25;
    }

    const dustGeometry = new THREE.BufferGeometry();

    dustGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(dustPositions, 3)
    );

    this.dustMaterial = new THREE.PointsMaterial({
      color: 0xd8b47a,
      size: 0.11,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });

    this.dustParticles = new THREE.Points(
      dustGeometry,
      this.dustMaterial
    );

    this.effectGroup.add(this.dustParticles);

    const rainCount = 600;

    const rainPositions = new Float32Array(
      rainCount * 3
    );

    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] =
        (Math.random() - 0.5) * 18;

      rainPositions[i * 3 + 1] =
        Math.random() * 17;

      rainPositions[i * 3 + 2] =
        Math.random() * ROAD_LEN - 20;
    }

    const rainGeometry = new THREE.BufferGeometry();

    rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(rainPositions, 3)
    );

    this.rainMaterial = new THREE.PointsMaterial({
      color: 0xbddcff,
      size: 0.07,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });

    this.rainParticles = new THREE.Points(
      rainGeometry,
      this.rainMaterial
    );

    this.effectGroup.add(this.rainParticles);

    const groundShadowGeometry =
      new THREE.CircleGeometry(1.35, 32);

    this.playerShadow = new THREE.Mesh(
      groundShadowGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.32,
        depthWrite: false
      })
    );

    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.set(
      0,
      0.025,
      PLAYER_Z
    );

    this.effectGroup.add(this.playerShadow);
  }

  mat(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness:
        options.roughness !== undefined
          ? options.roughness
          : 0.72,
      metalness:
        options.metalness !== undefined
          ? options.metalness
          : 0.08,
      emissive:
        options.emissive !== undefined
          ? options.emissive
          : 0x000000,
      emissiveIntensity:
        options.emissiveIntensity !== undefined
          ? options.emissiveIntensity
          : 0,
      transparent:
        options.transparent !== undefined
          ? options.transparent
          : false,
      opacity:
        options.opacity !== undefined
          ? options.opacity
          : 1,
      side:
        options.side !== undefined
          ? options.side
          : THREE.FrontSide
    });
  }

  buildRoad() {
    const asphalt = this.mat(0x343638, {
      roughness: 0.94
    });

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, ROAD_LEN),
      asphalt
    );

    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.03, 35);
    road.receiveShadow = true;

    this.roadGroup.add(road);

    const roadBase = new THREE.Mesh(
      new THREE.BoxGeometry(10.2, 0.18, ROAD_LEN),
      this.mat(0x252525, {
        roughness: 1
      })
    );

    roadBase.position.set(0, -0.13, 35);
    roadBase.receiveShadow = true;

    this.roadGroup.add(roadBase);

    const wear = new THREE.Mesh(
      new THREE.PlaneGeometry(3.9, ROAD_LEN),
      this.mat(0x3e3f3e, {
        roughness: 1
      })
    );

    wear.rotation.x = -Math.PI / 2;
    wear.position.set(0, 0.002, 35);

    this.roadGroup.add(wear);

    const shoulderMaterial = this.mat(0x9a774d, {
      roughness: 1
    });

    for (const x of [-5.7, 5.7]) {
      const shoulder = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, ROAD_LEN),
        shoulderMaterial
      );

      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(x, -0.01, 35);
      shoulder.receiveShadow = true;

      this.roadGroup.add(shoulder);
    }

    const curbMaterial = this.mat(0xbdb4a1);

    for (const x of [-4.86, 4.86]) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.25,
          0.22,
          ROAD_LEN
        ),
        curbMaterial
      );

      curb.position.set(x, 0.08, 35);
      curb.receiveShadow = true;

      this.roadGroup.add(curb);
    }

    const edgeMaterial = this.mat(0xe0b629, {
      roughness: 0.75
    });

    for (const x of [-4.52, 4.52]) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.08,
          0.012,
          ROAD_LEN
        ),
        edgeMaterial
      );

      line.position.set(x, 0.015, 35);

      this.roadGroup.add(line);
    }

    const laneMaterial = this.mat(0xe8dfc8);

    for (const x of [-1.2, 1.2]) {
      for (let z = -38; z < 115; z += 5.4) {
        const mark = new THREE.Mesh(
          new THREE.BoxGeometry(
            0.075,
            0.014,
            2.65
          ),
          laneMaterial
        );

        mark.position.set(x, 0.018, z);
        this.roadGroup.add(mark);
      }
    }

    this.addRoadPatches();
    this.addDrainage();
    this.addRoadsideDebris();
  }

  addRoadPatches() {
    const patchMaterial = this.mat(0x292b2c, {
      roughness: 1
    });

    const patches = [
      [-2.2, 0.012, 14, 1.2, 0.28],
      [2.5, 0.013, 31, 0.9, 0.22],
      [-0.7, 0.013, 54, 1.6, 0.3],
      [2.1, 0.013, 78, 1.2, 0.24],
      [-2.5, 0.013, 101, 1.7, 0.3]
    ];

    for (const [
      x,
      y,
      z,
      width,
      depth
    ] of patches) {
      const patch = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        patchMaterial
      );

      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, y, z);
      patch.rotation.z =
        (Math.random() - 0.5) * 0.4;

      this.roadGroup.add(patch);
    }
  }

  addDrainage() {
    const material = this.mat(0x5b554b, {
      roughness: 1
    });

    for (const x of [-5.25, 5.25]) {
      const drain = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.5,
          0.08,
          ROAD_LEN
        ),
        material
      );

      drain.position.set(x, 0.02, 35);

      this.roadGroup.add(drain);
    }
  }

  addRoadsideDebris() {
    const debrisMaterial = this.mat(0x6b5943);

    for (let i = 0; i < 75; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;

      const piece = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.04 + Math.random() * 0.12,
          0.03 + Math.random() * 0.05,
          0.06 + Math.random() * 0.16
        ),
        debrisMaterial
      );

      piece.position.set(
        side * (5.1 + Math.random() * 1.5),
        0.04,
        -35 + Math.random() * 145
      );

      piece.rotation.y =
        Math.random() * Math.PI;

      this.roadGroup.add(piece);
    }
  }

  buildCityscape() {
    const buildingTypes = [
      'house',
      'shop',
      'compound',
      'market',
      'mosque',
      'school',
      'petrol',
      'busstop'
    ];

    let z = -30;

    while (z < 125) {
      const leftType =
        buildingTypes[
          Math.floor(
            Math.random() * buildingTypes.length
          )
        ];

      const rightType =
        buildingTypes[
          Math.floor(
            Math.random() * buildingTypes.length
          )
        ];

      this.addBuildingByType(
        leftType,
        -1,
        z
      );

      this.addBuildingByType(
        rightType,
        1,
        z + 8 + Math.random() * 7
      );

      z += 12 + Math.random() * 8;
    }

    for (let zPos = -25; zPos < 125; zPos += 10) {
      this.addStreetLight(-5.7, zPos);
      this.addStreetLight(5.7, zPos + 4);

      if (Math.random() > 0.25) {
        this.addUtilityPole(
          -7.1,
          zPos + 2
        );
      }

      if (Math.random() > 0.25) {
        this.addUtilityPole(
          7.1,
          zPos + 6
        );
      }
    }

    for (let zPos = -10; zPos < 115; zPos += 19) {
      this.addBillboard(
        Math.random() > 0.5 ? -1 : 1,
        zPos
      );
    }

    for (let zPos = -30; zPos < 120; zPos += 8) {
      if (Math.random() > 0.25) {
        this.addRoadsideTree(
          -6.4 - Math.random() * 1.4,
          zPos + Math.random() * 4
        );
      }

      if (Math.random() > 0.25) {
        this.addRoadsideTree(
          6.4 + Math.random() * 1.4,
          zPos + Math.random() * 4
        );
      }
    }

    for (let i = 0; i < 30; i++) {
      this.addPedestrian(
        Math.random() > 0.5 ? -1 : 1,
        -28 + Math.random() * 150
      );
    }

    this.addDistantSkyline();
  }

  addBuildingByType(type, side, z) {
    switch (type) {
      case 'shop':
        this.addShop(side, z);
        break;

      case 'compound':
        this.addCompound(side, z);
        break;

      case 'market':
        this.addMarketStall(side, z);
        break;

      case 'mosque':
        this.addMosque(side, z);
        break;

      case 'school':
        this.addSchool(side, z);
        break;

      case 'petrol':
        this.addPetrol(side, z);
        break;

      case 'busstop':
        this.addBusStop(side, z);
        break;

      default:
        this.addHouse(side, z);
        break;
    }
  }

  addHouse(side, z) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        4 + Math.random() * 1.6,
        2.5 + Math.random() * 1.3,
        4
      ),
      this.mat(
        [
          0xd7c5a2,
          0xc8b28b,
          0xe0d3ba,
          0xbda37b
        ][Math.floor(Math.random() * 4)]
      )
    );

    body.position.y = 1.35;
    group.add(body);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.25, 4.4),
      this.mat(0x7e6a53)
    );

    roof.position.y = 2.72;
    group.add(roof);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 1.35, 0.08),
      this.mat(0x4b3424)
    );

    door.position.set(0, 0.75, 2.03);
    group.add(door);

    for (const x of [-1.25, 1.25]) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.7,
          0.55,
          0.06
        ),
        this.mat(0x4b7180, {
          metalness: 0.1,
          roughness: 0.3
        })
      );

      window.position.set(
        x,
        1.45,
        2.03
      );

      group.add(window);
    }

    group.position.set(
      side * (8 + Math.random() * 2),
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addCompound(side, z) {
    const group = new THREE.Group();

    const wallMaterial = this.mat(0xb8a078);

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 1.8, 4.8),
      wallMaterial
    );

    wall.position.y = 0.9;
    group.add(wall);

    const house = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 2.4, 3.3),
      this.mat(0xd5c6aa)
    );

    house.position.set(0, 2.05, -0.15);
    group.add(house);

    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(
        2.7,
        2.7,
        0.3,
        4
      ),
      this.mat(0x765e46)
    );

    roof.rotation.y = Math.PI / 4;
    roof.position.set(
      0,
      3.35,
      -0.15
    );

    group.add(roof);

    group.position.set(
      side * (8 + Math.random() * 2),
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addShop(side, z) {
    const group = new THREE.Group();

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 3.1, 3.8),
      this.mat(0xb8a581)
    );

    building.position.y = 1.55;
    group.add(building);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(
        5.1,
        0.16,
        1.05
      ),
      this.mat(0x2e6b72)
    );

    awning.position.set(
      0,
      2.55,
      2.15
    );

    group.add(awning);

    const opening = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.5,
        1.65,
        0.08
      ),
      this.mat(0x24292b, {
        roughness: 0.4
      })
    );

    opening.position.set(
      0,
      1.05,
      1.94
    );

    group.add(opening);

    group.position.set(
      side * (8 + Math.random() * 1.5),
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addSchool(side, z) {
    const group = new THREE.Group();

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 3.3, 4),
      this.mat(0xd6c8a8)
    );

    building.position.y = 1.65;
    group.add(building);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 0.22, 4.4),
      this.mat(0x6d6d61)
    );

    roof.position.y = 3.32;
    group.add(roof);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.6,
        0.65,
        0.08
      ),
      this.mat(0x2c6b50)
    );

    sign.position.set(
      0,
      2.35,
      2.04
    );

    group.add(sign);

    for (let i = -2; i <= 2; i++) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.65,
          0.55,
          0.06
        ),
        this.mat(0x547e8b)
      );

      window.position.set(
        i * 1.1,
        1.55,
        2.04
      );

      group.add(window);
    }

    group.position.set(
      side * (8.4 + Math.random()),
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addMosque(side, z) {
    const group = new THREE.Group();

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(
        5.5,
        2.7,
        4.6
      ),
      this.mat(0xe1d8c4)
    );

    building.position.y = 1.35;
    group.add(building);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(
        1.55,
        24,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ),
      this.mat(0x5b8c76)
    );

    dome.position.set(
      0,
      2.72,
      0
    );

    group.add(dome);

    const minaret = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.22,
        0.3,
        5.2,
        12
      ),
      this.mat(0xd6c9ad)
    );

    minaret.position.set(
      2.25,
      2.6,
      0
    );

    group.add(minaret);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(
        0.38,
        0.7,
        8
      ),
      this.mat(0x5b8c76)
    );

    cap.position.set(
      2.25,
      5.55,
      0
    );

    group.add(cap);

    group.position.set(
      side * (8.5 + Math.random()),
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addMarketStall(side, z) {
    const group = new THREE.Group();

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(
        4.2,
        0.15,
        2.7
      ),
      this.mat(0x9d4232)
    );

    canopy.position.y = 2.15;
    group.add(canopy);

    for (const x of [-1.75, 1.75]) {
      for (const zz of [-1, 1]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.045,
            0.045,
            2.1,
            8
          ),
          this.mat(0x53473c)
        );

        pole.position.set(
          x,
          1.05,
          zz
        );

        group.add(pole);
      }
    }

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(
        3.3,
        0.3,
        1.4
      ),
      this.mat(0x68432c)
    );

    table.position.y = 0.85;
    group.add(table);

    for (let i = 0; i < 8; i++) {
      const item = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.13,
          8,
          6
        ),
        this.mat(
          [
            0xb76535,
            0x7e9c48,
            0xd2a33b,
            0x7754a4
          ][i % 4]
        )
      );

      item.position.set(
        -1.2 + (i % 4) * 0.8,
        1.05,
        -0.45 + Math.floor(i / 4) * 0.65
      );

      group.add(item);
    }

    group.position.set(
      side * (6.8 + Math.random()),
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addPetrol(side, z) {
    const group = new THREE.Group();

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(
        7,
        0.25,
        4.8
      ),
      this.mat(0xeeeeea)
    );

    canopy.position.y = 4.2;
    group.add(canopy);

    for (const x of [-3, 3]) {
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.22,
          4.1,
          0.22
        ),
        this.mat(0x777777)
      );

      pole.position.set(
        x,
        2.05,
        0
      );

      group.add(pole);
    }

    const signPole = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.25,
        5.5,
        0.25
      ),
      this.mat(0x777777)
    );

    signPole.position.set(
      3.8,
      2.75,
      0
    );

    group.add(signPole);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.4,
        1.2,
        0.18
      ),
      this.mat(0xc33428, {
        emissive: 0x320706,
        emissiveIntensity: 0.3
      })
    );

    sign.position.set(
      3.8,
      5.15,
      0
    );

    group.add(sign);

    for (let i = -1; i <= 1; i++) {
      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.65,
          1.35,
          0.45
        ),
        this.mat(0x55585a)
      );

      pump.position.set(
        i * 1.55,
        0.68,
        0
      );

      group.add(pump);
    }

    group.position.set(
      side * 9,
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addBusStop(side, z) {
    const group = new THREE.Group();

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        4.6,
        0.18,
        1.9
      ),
      this.mat(0x2f5d62)
    );

    roof.position.y = 2.7;
    group.add(roof);

    for (const x of [-1.9, 1.9]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.06,
          0.06,
          2.7,
          8
        ),
        this.mat(0x555555)
      );

      pole.position.set(
        x,
        1.35,
        0
      );

      group.add(pole);
    }

    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(
        3.2,
        0.18,
        0.55
      ),
      this.mat(0x704a2f)
    );

    bench.position.set(
      0,
      0.75,
      0.2
    );

    group.add(bench);

    group.position.set(
      side * 6.5,
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addStreetLight(x, z) {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.055,
        0.075,
        4.9,
        8
      ),
      this.mat(0x4c5154, {
        metalness: 0.6,
        roughness: 0.45
      })
    );

    pole.position.y = 2.45;
    group.add(pole);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.1,
        0.06,
        0.06
      ),
      this.mat(0x4c5154)
    );

    arm.position.set(
      x < 0 ? 0.48 : -0.48,
      4.65,
      0
    );

    group.add(arm);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.12,
        12,
        8
      ),
      this.mat(0xffe5a1, {
        emissive: 0xffb82e,
        emissiveIntensity: 1.5
      })
    );

    lamp.position.set(
      x < 0 ? 0.92 : -0.92,
      4.57,
      0
    );

    group.add(lamp);

    group.position.set(
      x,
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addUtilityPole(x, z) {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.08,
        0.12,
        7,
        8
      ),
      this.mat(0x51463b)
    );

    pole.position.y = 3.5;
    group.add(pole);

    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.5,
        0.12,
        0.12
      ),
      this.mat(0x534b43)
    );

    cross.position.y = 6.2;
    group.add(cross);

    for (const dx of [-0.85, 0, 0.85]) {
      const insulator = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.07,
          0.07,
          0.25,
          8
        ),
        this.mat(0xd8d3c3)
      );

      insulator.position.set(
        dx,
        6.38,
        0
      );

      group.add(insulator);
    }

    group.position.set(
      x,
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addBillboard(side, z) {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.15,
        3.2,
        0.15
      ),
      this.mat(0x55514a)
    );

    pole.position.y = 1.6;
    group.add(pole);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(
        3.2,
        1.5,
        0.1
      ),
      this.mat(0x315f70)
    );

    board.position.y = 3.25;
    group.add(board);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(
        3.35,
        1.65,
        0.05
      ),
      this.mat(0xf1d06d)
    );

    border.position.set(
      0,
      3.25,
      -0.06
    );

    group.add(border);

    group.position.set(
      side * (6.8 + Math.random()),
      0,
      z
    );

    group.rotation.y =
      side < 0 ? -0.08 : 0.08;

    this.cityGroup.add(group);
  }

  addRoadsideTree(x, z) {
    const group = new THREE.Group();

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.12,
        0.19,
        2.5,
        8
      ),
      this.mat(0x65452e)
    );

    trunk.position.y = 1.25;
    group.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(
        1.15 + Math.random() * 0.5,
        12,
        8
      ),
      this.mat(0x497044, {
        roughness: 1
      })
    );

    crown.position.y = 2.9;
    group.add(crown);

    group.position.set(
      x,
      0,
      z
    );

    this.cityGroup.add(group);
  }

  addPedestrian(side, z) {
    const group = this.makePerson(
      [
        0x714a37,
        0x263b59,
        0x4d5b31,
        0x7b5d42,
        0x443b4e
      ][
        Math.floor(Math.random() * 5)
      ]
    );

    group.position.set(
      side * (5.9 + Math.random() * 1.3),
      0,
      z
    );

    group.rotation.y =
      side < 0 ? -Math.PI / 2 : Math.PI / 2;

    group.userData.walkPhase =
      Math.random() * Math.PI * 2;

    group.userData.baseX = group.position.x;
    group.userData.baseZ = z;

    this.peopleGroup.add(group);
  }

  makePerson(clothes = 0x35485b) {
    const group = new THREE.Group();

    const skin = this.mat(0x70472e);
    const cloth = this.mat(clothes);
    const dark = this.mat(0x1e2429);

    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.28,
        0.75,
        0.22
      ),
      dark
    );

    legs.position.y = 0.38;
    group.add(legs);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.62,
        0.95,
        0.35
      ),
      cloth
    );

    body.position.y = 1.15;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.24,
        12,
        8
      ),
      skin
    );

    head.position.y = 1.82;
    group.add(head);

    return group;
  }

  makeKeke(bodyColor = 0xf5b400, isPlayer = false) {
    const group = new THREE.Group();

    const bodyMat = this.mat(bodyColor, {
      roughness: 0.58,
      metalness: 0.05
    });

    const darkMat = this.mat(0x15191b, {
      roughness: 0.7
    });

    const roofMat = this.mat(
      isPlayer ? 0x22262a : 0x1e2224,
      {
        roughness: 0.65
      }
    );

    const chromeMat = this.mat(0xbfc3c5, {
      roughness: 0.3,
      metalness: 0.8
    });

    const glassMat = this.mat(0x315d6b, {
      roughness: 0.18,
      metalness: 0.05,
      transparent: true,
      opacity: 0.7
    });

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.42,
        0.32,
        2.65
      ),
      darkMat
    );

    chassis.position.y = 0.48;
    chassis.userData.isBody = true;
    group.add(chassis);

    const lowerBody = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.35,
        0.7,
        1.8
      ),
      bodyMat
    );

    lowerBody.position.set(
      0,
      0.82,
      0.28
    );

    lowerBody.userData.isBody = true;
    group.add(lowerBody);

    const frontNose = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.15,
        0.55,
        0.7
      ),
      bodyMat
    );

    frontNose.position.set(
      0,
      0.86,
      -1.03
    );

    frontNose.rotation.x = -0.08;
    frontNose.userData.isBody = true;
    group.add(frontNose);

    const passengerCompartment = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.28,
        1.25,
        1.45
      ),
      bodyMat
    );

    passengerCompartment.position.set(
      0,
      1.38,
      0.47
    );

    passengerCompartment.userData.isBody = true;
    group.add(passengerCompartment);

    for (const x of [-0.54, 0.54]) {
      const skirt = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.12,
          0.36,
          1.75
        ),
        bodyMat
      );

      skirt.position.set(
        x,
        0.66,
        0.34
      );

      skirt.userData.isBody = true;
      group.add(skirt);
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.43,
        0.12,
        1.65
      ),
      roofMat
    );

    roof.position.set(
      0,
      2.08,
      0.38
    );

    roof.userData.isBody = true;
    group.add(roof);

    const roofFrame = new THREE.Group();

    for (const x of [-0.58, 0.58]) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.09,
          1.35,
          0.09
        ),
        chromeMat
      );

      pillar.position.set(
        x,
        1.43,
        -0.2
      );

      roofFrame.add(pillar);
    }

    for (const x of [-0.58, 0.58]) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.09,
          1.35,
          0.09
        ),
        chromeMat
      );

      pillar.position.set(
        x,
        1.43,
        1.0
      );

      roofFrame.add(pillar);
    }

    group.add(roofFrame);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.1,
        0.7,
        0.06
      ),
      glassMat
    );

    windshield.position.set(
      0,
      1.55,
      -0.22
    );

    windshield.rotation.x = -0.12;
    group.add(windshield);

    const rearWindow = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.05,
        0.72,
        0.06
      ),
      glassMat
    );

    rearWindow.position.set(
      0,
      1.53,
      1.23
    );

    rearWindow.rotation.x = 0.08;
    group.add(rearWindow);

    for (const x of [-0.59, 0.59]) {
      const sideWindow = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.05,
          0.68,
          1.08
        ),
        glassMat
      );

      sideWindow.position.set(
        x,
        1.53,
        0.42
      );

      group.add(sideWindow);
    }

    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.28,
        0.16,
        0.15
      ),
      chromeMat
    );

    bumper.position.set(
      0,
      0.57,
      -1.38
    );

    group.add(bumper);

    const rearBumper = bumper.clone();
    rearBumper.position.z = 1.56;
    group.add(rearBumper);

    const headlightMat = this.mat(0xfff4c7, {
      emissive: 0xffd36b,
      emissiveIntensity: 1.7
    });

    for (const x of [-0.43, 0.43]) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.105,
          12,
          8
        ),
        headlightMat
      );

      lamp.position.set(
        x,
        0.86,
        -1.38
      );

      group.add(lamp);
    }

    const tailMat = this.mat(0x9e2220, {
      emissive: 0x4d0505,
      emissiveIntensity: 0.8
    });

    for (const x of [-0.43, 0.43]) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.17,
          0.13,
          0.05
        ),
        tailMat
      );

      lamp.position.set(
        x,
        0.78,
        1.57
      );

      group.add(lamp);
    }

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.02,
        0.25,
        0.55
      ),
      this.mat(0x3a2520)
    );

    seat.position.set(
      0,
      1.0,
      0.75
    );

    group.add(seat);

    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(
        0.28,
        0.045,
        8,
        18,
        Math.PI * 1.25
      ),
      darkMat
    );

    handle.rotation.x = Math.PI / 2;
    handle.position.set(
      0,
      1.24,
      -0.75
    );

    group.add(handle);

    const frontWheel = this.makeWheel();
    frontWheel.position.set(
      0,
      0.39,
      -1.04
    );

    group.add(frontWheel);

    const leftRearWheel = this.makeWheel();
    leftRearWheel.position.set(
      -0.68,
      0.39,
      0.82
    );

    group.add(leftRearWheel);

    const rightRearWheel = this.makeWheel();
    rightRearWheel.position.set(
      0.68,
      0.39,
      0.82
    );

    group.add(rightRearWheel);

    this.playerWheels = isPlayer
      ? [
          frontWheel,
          leftRearWheel,
          rightRearWheel
        ]
      : [];

    if (isPlayer) {
      this.playerSteerParts.push(handle);
    }

    group.userData.isKeke = true;
    group.userData.isPlayer = isPlayer;
    group.userData.isBody = true;
    group.userData.steerParts = [handle];

    return group;
  }

  makeWheel() {
    const group = new THREE.Group();

    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.31,
        0.31,
        0.16,
        16
      ),
      this.mat(0x111314, {
        roughness: 0.94
      })
    );

    tire.rotation.z = Math.PI / 2;
    group.add(tire);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.12,
        0.12,
        0.18,
        12
      ),
      this.mat(0xb2b5b6, {
        metalness: 0.75,
        roughness: 0.28
      })
    );

    hub.rotation.z = Math.PI / 2;
    group.add(hub);

    return group;
  }

  makeTrafficVehicle(type) {
    switch (type) {
      case 'keke':
        return this.makeKeke(0xf1bd26);

      case 'taxi':
        return this.makeCar(0x1e8b55, true);

      case 'bus':
        return this.makeBus();

      case 'truck':
        return this.makeTruck();

      case 'motorcycle':
        return this.makeMotorcycle();

      case 'police':
        return this.makePolice();

      case 'karota':
        return this.makeKarota();

      default:
        return this.makeCar(0x5d6670);
    }
  }

  makeCar(color = 0x5d6670, taxi = false) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.65,
        0.65,
        3.05
      ),
      this.mat(color, {
        roughness: 0.52
      })
    );

    body.position.y = 0.72;
    body.userData.isBody = true;
    group.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.35,
        0.78,
        1.45
      ),
      this.mat(0x27373e, {
        roughness: 0.24
      })
    );

    cabin.position.set(
      0,
      1.28,
      0.25
    );

    group.add(cabin);

    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.5,
        0.15,
        0.15
      ),
      this.mat(0xb6b7b4, {
        metalness: 0.7,
        roughness: 0.3
      })
    );

    bumper.position.z = -1.58;
    bumper.position.y = 0.55;
    group.add(bumper);

    const wheels = [];

    for (const x of [-0.78, 0.78]) {
      for (const z of [-1.0, 1.0]) {
        const wheel = this.makeCarWheel();
        wheel.position.set(
          x,
          0.38,
          z
        );

        group.add(wheel);
        wheels.push(wheel);
      }
    }

    const headlight = this.mat(0xfff3c4, {
      emissive: 0xffd86a,
      emissiveIntensity: 1.2
    });

    for (const x of [-0.53, 0.53]) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.22,
          0.13,
          0.06
        ),
        headlight
      );

      light.position.set(
        x,
        0.79,
        -1.57
      );

      group.add(light);
    }

    if (taxi) {
      const roofSign = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.55,
          0.15,
          0.25
        ),
        this.mat(0xffffff, {
          emissive: 0xffffcc,
          emissiveIntensity: 0.35
        })
      );

      roofSign.position.set(
        0,
        1.73,
        0.05
      );

      group.add(roofSign);
    }

    group.userData.wheels = wheels;
    group.userData.isBody = true;

    return group;
  }

  makeCarWheel() {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.28,
        0.28,
        0.18,
        14
      ),
      this.mat(0x101112, {
        roughness: 0.95
      })
    );

    wheel.rotation.z = Math.PI / 2;

    return wheel;
  }

  makeBus() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.25,
        1.65,
        5.1
      ),
      this.mat(0x4d6670, {
        roughness: 0.65
      })
    );

    body.position.y = 1.15;
    body.userData.isBody = true;
    group.add(body);

    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.12,
        0.85,
        4.45
      ),
      this.mat(0x2e4147, {
        roughness: 0.3
      })
    );

    upper.position.set(
      0,
      2.0,
      0.1
    );

    group.add(upper);

    for (let z = -1.55; z <= 1.55; z += 0.78) {
      for (const x of [-1.09, 1.09]) {
        const window = new THREE.Mesh(
          new THREE.BoxGeometry(
            0.05,
            0.47,
            0.55
          ),
          this.mat(0x7fa7b2, {
            roughness: 0.18
          })
        );

        window.position.set(
          x,
          2.05,
          z
        );

        group.add(window);
      }
    }

    const wheels = [];

    for (const x of [-1.1, 1.1]) {
      for (const z of [-1.55, 1.55]) {
        const wheel = this.makeCarWheel();
        wheel.scale.setScalar(1.25);
        wheel.position.set(
          x,
          0.53,
          z
        );

        group.add(wheel);
        wheels.push(wheel);
      }
    }

    group.userData.wheels = wheels;
    group.userData.isBody = true;

    return group;
  }

  makeTruck() {
    const group = new THREE.Group();

    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.9,
        1.55,
        1.75
      ),
      this.mat(0x9c3e2c)
    );

    cab.position.set(
      0,
      1.1,
      -1.15
    );

    group.add(cab);

    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.15,
        2.1,
        3.2
      ),
      this.mat(0xc4bda7)
    );

    cargo.position.set(
      0,
      1.35,
      0.95
    );

    group.add(cargo);

    const wheels = [];

    for (const x of [-1.0, 1.0]) {
      for (const z of [-1.0, 1.55]) {
        const wheel = this.makeCarWheel();
        wheel.position.set(
          x,
          0.48,
          z
        );

        group.add(wheel);
        wheels.push(wheel);
      }
    }

    group.userData.wheels = wheels;
    group.userData.isBody = true;

    return group;
  }

  makeMotorcycle() {
    const group = new THREE.Group();

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.32,
        0.3,
        1.45
      ),
      this.mat(0x222528, {
        metalness: 0.55,
        roughness: 0.35
      })
    );

    frame.position.y = 0.65;
    group.add(frame);

    for (const z of [-0.6, 0.6]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.29,
          0.29,
          0.1,
          14
        ),
        this.mat(0x111111)
      );

      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(
        0,
        0.34,
        z
      );

      group.add(wheel);
    }

    const rider = this.makePerson(0x293d59);
    rider.scale.setScalar(0.58);
    rider.position.y = 0.35;
    group.add(rider);

    group.userData.isBody = true;

    return group;
  }

  makePolice() {
    const group = this.makeCar(
      0x1e334d
    );

    const lightBar = new THREE.Group();

    const red = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.18,
        0.1,
        0.3
      ),
      this.mat(0xff2424, {
        emissive: 0xff0000,
        emissiveIntensity: 1.8
      })
    );

    red.position.x = -0.13;
    lightBar.add(red);

    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.18,
        0.1,
        0.3
      ),
      this.mat(0x2878ff, {
        emissive: 0x0055ff,
        emissiveIntensity: 1.8
      })
    );

    blue.position.x = 0.13;
    lightBar.add(blue);

    lightBar.position.y = 1.75;
    group.add(lightBar);

    group.userData.policeLights = lightBar;

    return group;
  }

  makeKarota() {
    const group = this.makeCar(
      0xd4a62b
    );

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.72,
        0.14,
        3.1
      ),
      this.mat(0x174e73)
    );

    stripe.position.y = 0.83;
    group.add(stripe);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.85,
        0.16,
        0.35
      ),
      this.mat(0x174e73, {
        emissive: 0x0b2639,
        emissiveIntensity: 0.5
      })
    );

    roof.position.y = 1.75;
    group.add(roof);

    return group;
  }

  makePassengerZone() {
    const group = new THREE.Group();

    const marker = new THREE.Mesh(
      new THREE.RingGeometry(
        0.5,
        0.72,
        24
      ),
      this.mat(0x32d583, {
        transparent: true,
        opacity: 0.78,
        emissive: 0x0a5e35,
        emissiveIntensity: 0.45,
        side: THREE.DoubleSide
      })
    );

    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.025;

    group.add(marker);

    const person = this.makePerson(
      0x6e4850
    );

    person.scale.setScalar(0.82);
    person.position.y = 0.02;

    group.add(person);

    group.userData.marker = marker;
    group.userData.person = person;

    return group;
  }

  makeCoin() {
    const group = new THREE.Group();

    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.23,
        0.23,
        0.08,
        20
      ),
      this.mat(0xf6c745, {
        metalness: 0.7,
        roughness: 0.22,
        emissive: 0x5d3c00,
        emissiveIntensity: 0.3
      })
    );

    coin.rotation.x = Math.PI / 2;

    group.add(coin);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(
        0.13,
        0.025,
        8,
        16
      ),
      this.mat(0xffef9c, {
        metalness: 0.65,
        roughness: 0.2
      })
    );

    ring.rotation.x = Math.PI / 2;

    group.add(ring);

    group.userData.coin = coin;

    return group;
  }

  addDistantSkyline() {
    const skyline = new THREE.Group();

    for (let i = 0; i < 35; i++) {
      const width =
        2 + Math.random() * 4;

      const height =
        2 + Math.random() * 8;

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(
          width,
          height,
          2
        ),
        this.mat(
          [
            0x8d9a9d,
            0x9e9b8d,
            0x7e8a8e,
            0xa79a7d
          ][i % 4]
        )
      );

      building.position.set(
        -45 + i * 2.7,
        height / 2,
        72 + Math.random() * 12
      );

      skyline.add(building);
    }

    this.cityGroup.add(skyline);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(
        190,
        32,
        16
      ),
      new THREE.MeshBasicMaterial({
        color: 0x8bc4df,
        side: THREE.BackSide
      })
    );

    sky.position.y = 15;
    this.cityGroup.add(sky);
  }

  updateTraffic() {
    const observations = this.game.obs || [];
    const active = new Set();

    for (const obstacle of observations) {
      if (!obstacle) continue;

      active.add(obstacle);

      let visual = this.trafficVisual.get(
        obstacle
      );

      if (!visual) {
        visual = this.obtainTrafficVisual(
          obstacle.type
        );

        if (!visual) continue;

        this.trafficVisual.set(
          obstacle,
          visual
        );

        visual.userData.source = obstacle;
        visual.userData.laneX =
          this.laneToX(obstacle.lane);

        visual.position.x =
          visual.userData.laneX;

        visual.position.z =
          this.getObstacleZ(obstacle);

        visual.position.y =
          this.getVehicleGroundY(
            obstacle.type
          );
      }

      const targetX = this.laneToX(
        obstacle.lane
      );

      const previousX =
        visual.userData.laneX ??
        visual.position.x;

      const smoothX = THREE.MathUtils.lerp(
        previousX,
        targetX,
        0.13
      );

      const steeringDelta =
        targetX - previousX;

      visual.userData.laneX = smoothX;

      visual.position.x = smoothX;
      visual.position.z =
        this.getObstacleZ(obstacle);

      visual.position.y =
        this.getVehicleGroundY(
          obstacle.type
        );

      const steer =
        THREE.MathUtils.clamp(
          steeringDelta * 0.2,
          -0.18,
          0.18
        );

      visual.rotation.y = steer;

      visual.rotation.z =
        THREE.MathUtils.clamp(
          -steeringDelta * 0.055,
          -0.08,
          0.08
        );

      this.animateVehicle(
        visual,
        obstacle
      );

      visual.visible = true;
    }

    for (const type of Object.keys(this.pools)) {
      for (const vehicle of this.pools[type]) {
        if (
          vehicle.userData.source &&
          !active.has(
            vehicle.userData.source
          )
        ) {
          vehicle.visible = false;
          vehicle.userData.source = null;
        }
      }
    }
  }

  obtainTrafficVisual(type) {
    const pool =
      this.pools[type] ||
      this.pools.car;

    if (!pool) return null;

    for (const vehicle of pool) {
      if (!vehicle.visible) {
        return vehicle;
      }
    }

    return pool[0] || null;
  }

  laneToX(lane) {
    const numeric = Number(lane);

    if (!Number.isFinite(numeric)) {
      return 0;
    }

    if (
      numeric >= 0 &&
      numeric <= 2
    ) {
      return (
        LANE_X[
          Math.round(numeric)
        ] ?? 0
      );
    }

    return THREE.MathUtils.clamp(
      numeric,
      -2.4,
      2.4
    );
  }

  getObstacleZ(obstacle) {
    if (
      Number.isFinite(obstacle.z)
    ) {
      return obstacle.z;
    }

    if (
      Number.isFinite(obstacle.dist)
    ) {
      return PLAYER_Z +
        obstacle.dist;
    }

    if (
      Number.isFinite(obstacle.distance)
    ) {
      return PLAYER_Z +
        obstacle.distance;
    }

    return PLAYER_Z + 25;
  }

  getVehicleGroundY(type) {
    if (type === 'bus') return 0;
    if (type === 'truck') return 0;
    return 0;
  }

  animateVehicle(vehicle, obstacle) {
    const speed =
      Math.abs(
        Number(
          obstacle.speed ??
          this.game.speed ??
          0
        )
      );

    const wheelGroups =
      vehicle.userData.wheels || [];

    for (const wheel of wheelGroups) {
      wheel.rotation.x +=
        speed * 0.015;
    }

    if (
      vehicle.userData.policeLights
    ) {
      const pulse =
        Math.sin(
          this.time * 0.022
        );

      vehicle.userData.policeLights
        .children[0]
        .material.opacity =
        pulse > 0 ? 1 : 0.35;

      vehicle.userData.policeLights
        .children[1]
        .material.opacity =
        pulse <= 0 ? 1 : 0.35;
    }
  }

  updatePassengerZones() {
    const zones = this.game.paxZones || [];

    for (
      let i = 0;
      i < this.zonePool.length;
      i++
    ) {
      const visual =
        this.zonePool[i];

      const zone = zones[i];

      if (!zone) {
        visual.visible = false;
        continue;
      }

      visual.visible = true;

      const x = this.resolveZoneX(zone);
      const z = this.resolveZoneZ(zone);

      visual.position.set(
        x,
        0,
        z
      );

      const marker =
        visual.userData.marker;

      if (marker) {
        marker.rotation.z =
          this.time * 0.0015;

        const pulse =
          1 +
          Math.sin(
            this.time * 0.006
          ) * 0.08;

        marker.scale.setScalar(pulse);
      }

      const person =
        visual.userData.person;

      if (person) {
        person.position.y =
          0.02 +
          Math.abs(
            Math.sin(
              this.time * 0.005
            )
          ) * 0.045;
      }
    }
  }

  resolveZoneX(zone) {
    if (
      Number.isFinite(zone.x)
    ) {
      return zone.x;
    }

    if (
      Number.isFinite(zone.lane)
    ) {
      return this.laneToX(
        zone.lane
      );
    }

    return (
      Math.random() > 0.5
        ? -5.5
        : 5.5
    );
  }

  resolveZoneZ(zone) {
    if (
      Number.isFinite(zone.z)
    ) {
      return zone.z;
    }

    if (
      Number.isFinite(zone.dist)
    ) {
      return PLAYER_Z + zone.dist;
    }

    if (
      Number.isFinite(zone.distance)
    ) {
      return PLAYER_Z + zone.distance;
    }

    return 30;
  }

  updateCoins() {
    const coins = this.game.coins || [];

    for (
      let i = 0;
      i < this.coinPool.length;
      i++
    ) {
      const visual =
        this.coinPool[i];

      const coin = coins[i];

      if (!coin) {
        visual.visible = false;
        continue;
      }

      visual.visible = true;

      visual.position.set(
        Number.isFinite(coin.x)
          ? coin.x
          : this.laneToX(coin.lane),
        Number.isFinite(coin.y)
          ? coin.y
          : 0.7,
        Number.isFinite(coin.z)
          ? coin.z
          : PLAYER_Z +
            (coin.dist || 20)
      );

      visual.rotation.y =
        this.time * 0.003;

      visual.position.y +=
        Math.sin(
          this.time * 0.005 +
          i
        ) * 0.08;
    }
  }

  updatePeople() {
    this.peopleGroup.children.forEach(
      person => {
        if (
          person.userData.walkPhase ===
          undefined
        ) {
          return;
        }

        const phase =
          person.userData.walkPhase;

        const walk =
          Math.sin(
            this.time * 0.004 +
            phase
          );

        person.position.x =
          person.userData.baseX +
          walk * 0.04;

        person.position.z =
          person.userData.baseZ +
          Math.cos(
            this.time * 0.002 +
            phase
          ) * 0.08;

        person.rotation.y +=
          walk * 0.002;
      }
    );
  }

  updatePlayer() {
    if (!this.player) return;

    const targetX =
      Number.isFinite(
        this.game.playerX
      )
        ? this.game.playerX
        : this.laneToX(
            this.game.playerLane
          );

    this.lastPlayerX =
      THREE.MathUtils.lerp(
        this.lastPlayerX,
        targetX,
        0.2
      );

    this.player.position.x =
      this.lastPlayerX;

    this.player.position.y =
      Number(this.game.playerY) || 0;

    this.player.position.z =
      PLAYER_Z;

    const bounce =
      Number(this.game.bounce) || 0;

    this.player.position.y +=
      Math.sin(
        this.time * 0.018
      ) *
      Math.min(
        Math.abs(
          Number(
            this.game.speed
          ) || 0
        ) * 0.0015,
        0.055
      );

    this.player.position.y +=
      bounce * 0.012;

    const steer =
      THREE.MathUtils.clamp(
        targetX -
          this.lastPlayerX,
        -0.35,
        0.35
      );

    this.player.rotation.z =
      THREE.MathUtils.lerp(
        this.player.rotation.z,
        -steer * 0.25,
        0.18
      );

    this.player.rotation.y =
      THREE.MathUtils.lerp(
        this.player.rotation.y,
        steer * 0.12,
        0.15
      );

    for (const wheel of this.playerWheels) {
      wheel.rotation.x +=
        Math.abs(
          Number(
            this.game.speed
          ) || 0
        ) * 0.018;
    }

    for (
      const part of
      this.playerSteerParts
    ) {
      part.rotation.z =
        THREE.MathUtils.lerp(
          part.rotation.z,
          -steer * 0.5,
          0.18
        );
    }

    if (this.playerShadow) {
      this.playerShadow.position.x =
        this.player.position.x;

      this.playerShadow.position.z =
        PLAYER_Z;

      const scale =
        1 -
        Math.min(
          Math.abs(
            this.player.position.y
          ) * 0.08,
          0.18
        );

      this.playerShadow.scale.set(
        scale,
        scale,
        scale
      );
    }
  }

  updateEffects(dt) {
    const speed =
      Number(this.game.speed) || 0;

    const moving =
      speed > 1;

    if (this.dustParticles) {
      const positions =
        this.dustParticles.geometry
          .attributes
          .position.array;

      for (
        let i = 0;
        i < positions.length;
        i += 3
      ) {
        positions[i + 2] -=
          speed * dt * 0.02;

        if (
          positions[i + 2] <
          -45
        ) {
          positions[i + 2] =
            110;
        }
      }

      this.dustParticles.geometry
        .attributes
        .position.needsUpdate = true;

      this.dustMaterial.opacity =
        moving && this.weather !== 'rain'
          ? 0.25
          : 0.08;
    }

    if (this.rainParticles) {
      const positions =
        this.rainParticles.geometry
          .attributes
          .position.array;

      for (
        let i = 0;
        i < positions.length;
        i += 3
      ) {
        positions[i + 1] -=
          18 * dt;

        positions[i + 2] -=
          speed * dt * 0.025;

        if (
          positions[i + 1] <
          0
        ) {
          positions[i + 1] =
            14 + Math.random() * 5;
        }

        if (
          positions[i + 2] <
          -45
        ) {
          positions[i + 2] =
            110;
        }
      }

      this.rainParticles.geometry
        .attributes
        .position.needsUpdate = true;

      this.rainMaterial.opacity =
        this.weather === 'rain'
          ? 0.52
          : 0;
    }
  }

  updateWeather(dt) {
    this.weatherTimer -= dt;

    if (
      this.weatherTimer <= 0
    ) {
      this.weatherTimer =
        24 + Math.random() * 35;

      const roll = Math.random();

      if (roll < 0.12) {
        this.weather = 'rain';
      } else if (roll < 0.27) {
        this.weather = 'dust';
      } else {
        this.weather = 'clear';
      }
    }

    if (
      this.weather === 'rain'
    ) {
      this.scene.fog.color.setHex(
        0x718696
      );

      this.scene.fog.near = 25;
      this.scene.fog.far = 95;

      this.sun.intensity =
        this.baseSunIntensity * 0.55;

      this.ambientLight.intensity =
        this.baseHemIntensity * 0.95;
    } else if (
      this.weather === 'dust'
    ) {
      this.scene.fog.color.setHex(
        0xb99d76
      );

      this.scene.fog.near = 25;
      this.scene.fog.far = 78;

      this.sun.intensity =
        this.baseSunIntensity * 0.75;

      this.ambientLight.intensity =
        this.baseHemIntensity * 0.82;
    } else {
      this.scene.fog.color.setHex(
        0x86c4df
      );

      this.scene.fog.near = 42;
      this.scene.fog.far = 135;

      this.sun.intensity =
        this.baseSunIntensity;

      this.ambientLight.intensity =
        this.baseHemIntensity;
    }
  }

  updateCamera(dt) {
    const speed =
      Number(this.game.speed) || 0;

    const playerX =
      Number(this.game.playerX) || 0;

    const targetX =
      playerX * 0.22;

    const speedLift =
      Math.min(speed * 0.006, 0.65);

    this.cameraTarget.set(
      targetX,
      0.95 + speedLift,
      17
    );

    const shakeMag =
      Number(this.game.shakeMag) || 0;

    const shake =
      Number(this.game.shake) || 0;

    const sx =
      Math.sin(
        this.time * 0.07
      ) *
      shakeMag *
      shake *
      0.012;

    const sy =
      Math.cos(
        this.time * 0.091
      ) *
      shakeMag *
      shake *
      0.008;

    const desiredX =
      playerX * 0.34 + sx;

    const desiredY =
      4.15 +
      speed * 0.003 +
      sy;

    const desiredZ =
      -5.1;

    this.camera.position.x =
      THREE.MathUtils.lerp(
        this.camera.position.x,
        desiredX,
        1 -
          Math.pow(
            0.001,
            dt
          )
      );

    this.camera.position.y =
      THREE.MathUtils.lerp(
        this.camera.position.y,
        desiredY,
        1 -
          Math.pow(
            0.001,
            dt
          )
      );

    this.camera.position.z =
      THREE.MathUtils.lerp(
        this.camera.position.z,
        desiredZ,
        1 -
          Math.pow(
            0.001,
            dt
          )
      );

    this.camera.lookAt(
      this.cameraTarget
    );

    this.camera.fov =
      THREE.MathUtils.lerp(
        this.camera.fov,
        56 +
          Math.min(
            speed * 0.015,
            8
          ),
        0.05
      );

    this.camera.updateProjectionMatrix();
  }

  updateTimeOfDay() {
    if (
      !this.game ||
      typeof this.game.getTimeOfDay !==
        'function'
    ) {
      return;
    }

    const value =
      this.game.getTimeOfDay();

    let phase = value;

    if (
      typeof value === 'object' &&
      value
    ) {
      phase =
        value.hour ??
        value.time ??
        value.progress ??
        12;
    }

    if (
      typeof phase !== 'number'
    ) {
      return;
    }

    let sunFactor = 1;

    if (
      phase < 6 ||
      phase > 19
    ) {
      sunFactor = 0.35;
    } else if (
      phase < 8 ||
      phase > 17
    ) {
      sunFactor = 0.68;
    } else if (
      phase > 15
    ) {
      sunFactor = 0.86;
    }

    this.sun.intensity =
      this.baseSunIntensity *
      sunFactor;

    this.ambientLight.intensity =
      this.baseHemIntensity *
      (0.72 + sunFactor * 0.28);

    if (
      phase < 6 ||
      phase > 19
    ) {
      this.scene.background.setHex(
        0x182b45
      );

      this.scene.fog.color.setHex(
        0x25384d
      );
    } else if (
      phase < 8 ||
      phase > 17
    ) {
      this.scene.background.setHex(
        0x6d94aa
      );
    } else {
      this.scene.background.setHex(
        0x86c4df
      );
    }
  }

  update(dt) {
    this.time += dt * 1000;

    this.updatePlayer();
    this.updateTraffic();
    this.updatePassengerZones();
    this.updateCoins();
    this.updatePeople();
    this.updateWeather(dt);
    this.updateEffects(dt);
    this.updateTimeOfDay();
    this.updateCamera(dt);
  }

  draw() {
    if (!this.ready) return;

    const now = performance.now();

    let dt =
      (now - this.lastTime) /
      1000;

    this.lastTime = now;

    dt = Math.min(dt, 0.05);

    this.update(dt);

    this.renderer.render(
      this.scene,
      this.camera
    );
  }

  render() {
    this.draw();
  }

  resize() {
    if (!this.renderer) return;

    const width =
      this.canvas.clientWidth ||
      window.innerWidth;

    const height =
      this.canvas.clientHeight ||
      window.innerHeight;

    this.camera.aspect =
      width / Math.max(height, 1);

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(
      width,
      height,
      false
    );

    let maxRatio = 1.75;

    if (this.quality === 'medium') {
      maxRatio = 1.35;
    }

    if (this.quality === 'low') {
      maxRatio = 1;
    }

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        maxRatio
      )
    );
  }

  applyQuality(level = 'high') {
    this.quality = level;

    if (level === 'low') {
      this.renderer.shadowMap.enabled =
        false;

      this.renderer.setPixelRatio(
        1
      );

      if (this.dustMaterial) {
        this.dustMaterial.opacity =
          0.12;
      }

      if (this.rainMaterial) {
        this.rainMaterial.opacity =
          0;
      }

      this.renderer.toneMappingExposure =
        1.02;
    } else if (level === 'medium') {
      this.renderer.shadowMap.enabled =
        true;

      this.renderer.shadowMap.type =
        THREE.PCFShadowMap;

      this.renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          1.35
        )
      );

      if (this.dustMaterial) {
        this.dustMaterial.opacity =
          0.2;
      }

      this.renderer.toneMappingExposure =
        1.05;
    } else {
      this.renderer.shadowMap.enabled =
        true;

      this.renderer.shadowMap.type =
        THREE.PCFSoftShadowMap;

      this.renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          1.75
        )
      );

      if (this.dustMaterial) {
        this.dustMaterial.opacity =
          0.3;
      }

      this.renderer.toneMappingExposure =
        1.08;
    }

    this.resize();
  }

  applyPaint(paint) {
    if (!this.player) return;

    let color = 0xf5b400;

    if (
      typeof paint === 'number'
    ) {
      color = paint;
    }

    if (
      typeof paint === 'string'
    ) {
      const normalized =
        paint.toLowerCase();

      const colors = {
        yellow: 0xf5b400,
        blue: 0x1976a8,
        green: 0x2e8b57,
        red: 0xb8342b,
        black: 0x202326,
        white: 0xe5e3d9,
        gold: 0xd8a827
      };

      if (
        colors[normalized] !==
        undefined
      ) {
        color =
          colors[normalized];
      } else if (
        normalized.startsWith('#')
      ) {
        const parsed =
          Number.parseInt(
            normalized.slice(1),
            16
          );

        if (
          Number.isFinite(parsed)
        ) {
          color = parsed;
        }
      }
    }

    this.player.traverse(
      object => {
        if (
          !object.isMesh ||
          !object.userData.isBody
        ) {
          return;
        }

        if (
          object.material &&
          object.material.color
        ) {
          object.material.color.setHex(
            color
          );
        }
      }
    );
  }

  dispose() {
    if (!this.scene) return;

    this.scene.traverse(
      object => {
        if (object.geometry) {
          object.geometry.dispose();
        }

        if (object.material) {
          const materials =
            Array.isArray(
              object.material
            )
              ? object.material
              : [object.material];

          for (
            const material of materials
          ) {
            if (
              material.map
            ) {
              material.map.dispose();
            }

            material.dispose();
          }
        }
      }
    );

    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}