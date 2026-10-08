// Kano Run — Adaidaita Sahu
// Upgrade 10 — Asset-backed Upgrade 9 renderer
//
// IMPORTANT:
// - Upgrade 9 visual/gameplay architecture is preserved.
// - Uses local assets from /public/assets.
// - No CDN.
// - No external API.
// - No new npm dependency.
// - Procedural geometry remains as a fallback if an asset fails to load.
// - Game coordinates remain compatible with the existing game.js.
//
// Local asset groups:
// /assets/player/
// /assets/traffic/
// /assets/environment/
// /assets/people/
// /assets/effects/

import * as THREE from '../vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];
const ROAD_LEN = 120;
const PLAYER_Z = 5.5;

const ASSET_ROOT = '/assets';

const ASSETS = {
  player: {
    normal: `${ASSET_ROOT}/player/keke-player.png`,
    left: `${ASSET_ROOT}/player/keke-player-left.png`,
    right: `${ASSET_ROOT}/player/keke-player-right.png`,
    damaged: `${ASSET_ROOT}/player/keke-player-damaged.png`
  },

  traffic: {
    keke: `${ASSET_ROOT}/traffic/keke-yellow.png`,
    kekeBlue: `${ASSET_ROOT}/traffic/keke-blue.png`,
    car: `${ASSET_ROOT}/traffic/car-sedan.png`,
    taxi: `${ASSET_ROOT}/traffic/taxi.png`,
    bus: `${ASSET_ROOT}/traffic/bus.png`,
    motorcycle: `${ASSET_ROOT}/traffic/motorcycle.png`,
    truck: `${ASSET_ROOT}/traffic/truck.png`,
    police: `${ASSET_ROOT}/traffic/police.png`,
    karota: `${ASSET_ROOT}/traffic/karota.png`
  },

  environment: {
    shop: `${ASSET_ROOT}/environment/shop.png`,
    market: `${ASSET_ROOT}/environment/market-stall.png`,
    house: `${ASSET_ROOT}/environment/house.png`,
    mosque: `${ASSET_ROOT}/environment/mosque.png`,
    school: `${ASSET_ROOT}/environment/school.png`,
    petrol: `${ASSET_ROOT}/environment/petrol-station.png`,
    busStop: `${ASSET_ROOT}/environment/bus-stop.png`,
    billboard: `${ASSET_ROOT}/environment/billboard.png`,
    streetLight: `${ASSET_ROOT}/environment/street-light.png`
  },

  people: {
    pedestrian1: `${ASSET_ROOT}/people/pedestrian-01.png`,
    pedestrian2: `${ASSET_ROOT}/people/pedestrian-02.png`,
    pedestrian3: `${ASSET_ROOT}/people/pedestrian-03.png`,
    passenger: `${ASSET_ROOT}/people/passenger.png`
  },

  effects: {
    dust: `${ASSET_ROOT}/effects/dust.png`,
    smoke: `${ASSET_ROOT}/effects/smoke.png`,
    collision: `${ASSET_ROOT}/effects/collision.png`,
    speedLines: `${ASSET_ROOT}/effects/speed-lines.png`
  }
};

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;

    this.ready = false;
    this.assetsReady = false;

    this.vehiclePool = [];
    this.zonePool = [];
    this.coinPool = [];
    this.passengerPool = [];
    this.environmentPool = [];
    this.effectPool = [];

    this.textureCache = new Map();
    this.failedAssets = new Set();

    this.assetLoader = new THREE.TextureLoader();

    this.lastFrame = 0;
    this.lastSpeed = 0;
    this.lastWeather = 'clear';

    this.playerVisual = null;
    this.playerVisualState = 'normal';

    this.init();
  }

  // ------------------------------------------------------------
  // INITIALIZATION
  // ------------------------------------------------------------

  init() {
    const w = this.canvas.clientWidth || 390;
    const h = this.canvas.clientHeight || 700;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.75)
    );

    this.renderer.setSize(w, h, false);

    if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    this.renderer.setClearColor(0x0a1020, 1);

    this.scene = new THREE.Scene();

    this.scene.fog = new THREE.Fog(
      0x0a1020,
      30,
      100
    );

    this.camera = new THREE.PerspectiveCamera(
      50,
      w / h,
      0.1,
      160
    );

    this.camera.position.set(
      0,
      6.2,
      -3.5
    );

    this.camera.lookAt(
      0,
      0.8,
      18
    );

    // ----------------------------------------------------------
    // LIGHTING
    // ----------------------------------------------------------

    this.scene.add(
      new THREE.AmbientLight(
        0x9aacc8,
        0.6
      )
    );

    this.sun = new THREE.DirectionalLight(
      0xfff1c9,
      1.1
    );

    this.sun.position.set(
      10,
      20,
      8
    );

    this.scene.add(this.sun);

    this.hemlight = new THREE.HemisphereLight(
      0x87b5ff,
      0x3d4a32,
      0.4
    );

    this.scene.add(this.hemlight);

    // ----------------------------------------------------------
    // WORLD
    // ----------------------------------------------------------

    this.buildRoad();
    this.buildCityscape();

    // ----------------------------------------------------------
    // PLAYER FALLBACK MODEL
    // ----------------------------------------------------------

    this.player = this.makeKeke(
      0xfbbf24,
      true
    );

    this.player.position.set(
      0,
      0,
      PLAYER_Z
    );

    this.scene.add(this.player);

    // ----------------------------------------------------------
    // PLAYER ASSET SPRITE
    // ----------------------------------------------------------

    this.playerVisual = this.makeAssetSprite(
      ASSETS.player.normal,
      2.45,
      2.75
    );

    this.playerVisual.position.set(
      0,
      1.15,
      PLAYER_Z - 0.05
    );

    this.playerVisual.visible = false;

    this.scene.add(this.playerVisual);

    // ----------------------------------------------------------
    // VEHICLE POOL
    // ----------------------------------------------------------

    for (let i = 0; i < 22; i++) {
      const vehicle = this.makeVehicleFallback();

      vehicle.visible = false;

      this.scene.add(vehicle);

      this.vehiclePool.push(vehicle);
    }

    // ----------------------------------------------------------
    // PASSENGER / PICKUP POOL
    // ----------------------------------------------------------

    for (let i = 0; i < 10; i++) {
      const zone = this.makeZone(
        0x4ade80
      );

      zone.visible = false;

      this.scene.add(zone);

      this.zonePool.push(zone);
    }

    // ----------------------------------------------------------
    // COINS
    // ----------------------------------------------------------

    for (let i = 0; i < 12; i++) {
      const coin = this.makeCoin();

      coin.visible = false;

      this.scene.add(coin);

      this.coinPool.push(coin);
    }

    // ----------------------------------------------------------
    // PASSENGER VISUALS
    // ----------------------------------------------------------

    for (let i = 0; i < 12; i++) {
      const passenger = this.makeAssetSprite(
        this.getPedestrianAsset(i),
        1.0,
        1.65
      );

      passenger.visible = false;

      this.scene.add(passenger);

      this.passengerPool.push(passenger);
    }

    // ----------------------------------------------------------
    // PARTICLES
    // ----------------------------------------------------------

    this.initParticles();

    // ----------------------------------------------------------
    // WEATHER
    // ----------------------------------------------------------

    this.weather = 'clear';
    this.weatherTimer = 0;

    // ----------------------------------------------------------
    // QUALITY
    // ----------------------------------------------------------

    try {
      const lowQuality =
        JSON.parse(
          localStorage.getItem('kanoLQ') || 'false'
        );

      if (lowQuality) {
        this.applyQuality(true);
      }
    } catch {}

    this.ready = true;

    // Load visual assets after renderer is ready.
    this.loadAssets();
  }

  // ------------------------------------------------------------
  // ASSET LOADING
  // ------------------------------------------------------------

  loadTexture(path) {
    if (!path) return null;

    if (this.textureCache.has(path)) {
      return this.textureCache.get(path);
    }

    if (this.failedAssets.has(path)) {
      return null;
    }

    const texture = this.assetLoader.load(
      path,
      (loaded) => {
        if (
          'colorSpace' in loaded &&
          THREE.SRGBColorSpace
        ) {
          loaded.colorSpace =
            THREE.SRGBColorSpace;
        }

        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        this.failedAssets.add(path);
      }
    );

    if (
      'colorSpace' in texture &&
      THREE.SRGBColorSpace
    ) {
      texture.colorSpace =
        THREE.SRGBColorSpace;
    }

    texture.magFilter =
      THREE.LinearFilter;

    texture.minFilter =
      THREE.LinearMipmapLinearFilter;

    texture.anisotropy =
      Math.min(
        this.renderer.capabilities.getMaxAnisotropy(),
        4
      );

    this.textureCache.set(
      path,
      texture
    );

    return texture;
  }

  makeAssetSprite(
    path,
    width,
    height,
    options = {}
  ) {
    const texture =
      this.loadTexture(path);

    const material =
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity:
          options.opacity ?? 1,
        depthWrite: false,
        fog: true,
        color:
          options.color ?? 0xffffff
      });

    const sprite =
      new THREE.Sprite(material);

    sprite.scale.set(
      width,
      height,
      1
    );

    sprite.userData.assetPath =
      path;

    sprite.userData.baseWidth =
      width;

    sprite.userData.baseHeight =
      height;

    sprite.userData.assetLoaded =
      !!texture;

    return sprite;
  }

  replaceSpriteTexture(
    sprite,
    path
  ) {
    if (!sprite || !path) {
      return;
    }

    const texture =
      this.loadTexture(path);

    if (
      !texture ||
      !sprite.material
    ) {
      return;
    }

    sprite.material.map =
      texture;

    sprite.material.needsUpdate =
      true;

    sprite.userData.assetPath =
      path;

    sprite.userData.assetLoaded =
      true;
  }

  async loadAssets() {
    const paths = [
      ...Object.values(ASSETS.player),
      ...Object.values(ASSETS.traffic),
      ...Object.values(ASSETS.environment),
      ...Object.values(ASSETS.people),
      ...Object.values(ASSETS.effects)
    ];

    for (const path of paths) {
      this.loadTexture(path);
    }

    this.assetsReady = true;
  }

  // ------------------------------------------------------------
  // ROAD
  // ------------------------------------------------------------

  buildRoad() {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(
        9.5,
        ROAD_LEN
      ),
      this.mat(
        0x2c3545,
        {
          roughness: 0.92,
          metalness: 0.08
        }
      )
    );

    road.rotation.x =
      -Math.PI / 2;

    road.position.set(
      0,
      0,
      ROAD_LEN / 2 - 4
    );

    this.scene.add(road);

    const wear = new THREE.Mesh(
      new THREE.PlaneGeometry(
        3.2,
        ROAD_LEN
      ),
      this.mat(
        0x243040,
        {
          roughness: 0.96,
          metalness: 0.04
        }
      )
    );

    wear.rotation.x =
      -Math.PI / 2;

    wear.position.set(
      0,
      0.005,
      ROAD_LEN / 2 - 4
    );

    this.scene.add(wear);

    // Dusty shoulders.
    for (const sx of [-5.7, 5.7]) {
      const shoulder =
        new THREE.Mesh(
          new THREE.PlaneGeometry(
            2.4,
            ROAD_LEN
          ),
          this.mat(
            0x5c5346,
            {
              roughness: 0.98
            }
          )
        );

      shoulder.rotation.x =
        -Math.PI / 2;

      shoulder.position.set(
        sx,
        0.01,
        ROAD_LEN / 2 - 4
      );

      this.scene.add(
        shoulder
      );
    }

    // Yellow edge lines.
    const lineMaterial =
      new THREE.MeshBasicMaterial({
        color: 0xeab308
      });

    for (
      const lx of [-4.5, 4.5]
    ) {
      const line =
        new THREE.Mesh(
          new THREE.PlaneGeometry(
            0.14,
            ROAD_LEN
          ),
          lineMaterial
        );

      line.rotation.x =
        -Math.PI / 2;

      line.position.set(
        lx,
        0.02,
        ROAD_LEN / 2 - 4
      );

      this.scene.add(line);
    }

    // Road edge markers.
    const white =
      new THREE.MeshBasicMaterial({
        color: 0xe2e8f0
      });

    for (
      let z = 0;
      z < ROAD_LEN;
      z += 8
    ) {
      for (
        const lx of [-4.35, 4.35]
      ) {
        const tick =
          new THREE.Mesh(
            new THREE.PlaneGeometry(
              0.2,
              0.6
            ),
            white
          );

        tick.rotation.x =
          -Math.PI / 2;

        tick.position.set(
          lx,
          0.022,
          z
        );

        this.scene.add(tick);
      }
    }

    // Lane markings.
    this.laneMarks =
      new THREE.Group();

    const dashMaterial =
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24
      });

    for (
      let z = 0;
      z < ROAD_LEN;
      z += 3.2
    ) {
      for (
        const lx of [-1.2, 1.2]
      ) {
        const dash =
          new THREE.Mesh(
            new THREE.PlaneGeometry(
              0.1,
              1.4
            ),
            dashMaterial
          );

        dash.rotation.x =
          -Math.PI / 2;

        dash.position.set(
          lx,
          0.025,
          z
        );

        this.laneMarks.add(
          dash
        );
      }
    }

    this.scene.add(
      this.laneMarks
    );
  }

  // ------------------------------------------------------------
  // CITY
  // ------------------------------------------------------------

  buildCityscape() {
    this.buildings =
      new THREE.Group();

    const types = [
      'house',
      'shop',
      'house',
      'market',
      'house',
      'mosque',
      'shop',
      'petrol',
      'house',
      'busstop',
      'shop',
      'house',
      'market',
      'house',
      'shop',
      'mosque',
      'house',
      'petrol'
    ];

    for (
      const side of [-1, 1]
    ) {
      for (
        let i = 0;
        i < types.length;
        i++
      ) {
        const z =
          i * 6.5 +
          (side > 0 ? 2 : 0);

        const x =
          side *
          (
            6.8 +
            (i % 3) * 0.4
          );

        const kind =
          types[i];

        this.addEnvironmentAsset(
          kind,
          x,
          z,
          side,
          i
        );

        // Procedural fallback behind
        // the asset if needed.
        if (kind === 'mosque') {
          this.addMosque(
            x,
            z,
            side
          );
        } else if (
          kind === 'market'
        ) {
          this.addMarketStall(
            x,
            z,
            side
          );
        } else if (
          kind === 'petrol'
        ) {
          this.addPetrol(
            x,
            z,
            side
          );
        } else if (
          kind === 'busstop'
        ) {
          this.addBusStop(
            x,
            z,
            side
          );
        } else if (
          kind === 'shop'
        ) {
          this.addShop(
            x,
            z,
            side,
            0xb45309
          );
        } else {
          this.addHouse(
            x,
            z,
            side,
            0x334155
          );
        }

        if (i % 3 === 0) {
          this.addStreetLight(
            side * 5.2,
            z + 1.5
          );
        }

        if (i % 5 === 1) {
          this.addBillboard(
            side * 5.4,
            z + 3
          );
        }
      }
    }

    // Pedestrians.
    for (
      let i = 0;
      i < 12;
      i++
    ) {
      const side =
        i % 2 === 0
          ? -1
          : 1;

      this.addPedestrian(
        side * 5.0,
        i * 9 + 4,
        i
      );
    }

    this.scene.add(
      this.buildings
    );

    // Sky.
    this.sky =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          95,
          16,
          12,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        ),
        new THREE.MeshBasicMaterial({
          color: 0x1a2744,
          side:
            THREE.BackSide
        })
      );

    this.sky.position.y =
      -2;

    this.scene.add(
      this.sky
    );
  }

  addEnvironmentAsset(
    kind,
    x,
    z,
    side,
    index
  ) {
    const map = {
      house:
        ASSETS.environment.house,
      shop:
        ASSETS.environment.shop,
      market:
        ASSETS.environment.market,
      mosque:
        ASSETS.environment.mosque,
      petrol:
        ASSETS.environment.petrol,
      busstop:
        ASSETS.environment.busStop
    };

    const path = map[kind];

    if (!path) return;

    const sizes = {
      house: [3.0, 3.2],
      shop: [3.2, 3.0],
      market: [3.0, 2.6],
      mosque: [3.8, 4.3],
      petrol: [4.0, 3.0],
      busstop: [3.2, 2.7]
    };

    const size =
      sizes[kind] ||
      [3, 3];

    const sprite =
      this.makeAssetSprite(
        path,
        size[0],
        size[1]
      );

    sprite.position.set(
      x,
      size[1] / 2,
      z
    );

    // Face roadside.
    sprite.scale.x *=
      side < 0
        ? 1
        : -1;

    this.buildings.add(
      sprite
    );
  }

  // ------------------------------------------------------------
  // PROCEDURAL FALLBACK ENVIRONMENT
  // ------------------------------------------------------------

  addHouse(
    x,
    z,
    side,
    color
  ) {
    const bw =
      1.6 +
      Math.random() * 1.2;

    const bh =
      2.2 +
      Math.random() * 2.5;

    const bd =
      1.5 +
      Math.random() * 1.2;

    const mesh =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          bw,
          bh,
          bd
        ),
        this.mat(
          color,
          {
            roughness: 0.9
          }
        )
      );

    mesh.position.set(
      x,
      bh / 2,
      z
    );

    this.buildings.add(
      mesh
    );
  }

  addShop(
    x,
    z,
    side,
    color
  ) {
    const mesh =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2,
          2.4,
          1.6
        ),
        this.mat(
          color,
          {
            roughness: 0.85
          }
        )
      );

    mesh.position.set(
      x,
      1.2,
      z
    );

    this.buildings.add(
      mesh
    );
  }

  addMosque(
    x,
    z,
    side
  ) {
    const base =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.4,
          2.8,
          2
        ),
        this.mat(
          0x0f766e,
          {
            roughness: 0.8
          }
        )
      );

    base.position.set(
      x,
      1.4,
      z
    );

    this.buildings.add(
      base
    );

    const dome =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.85,
          12,
          10,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        ),
        this.mat(
          0xf5f5f4,
          {
            roughness: 0.4,
            metalness: 0.2
          }
        )
      );

    dome.position.set(
      x,
      2.8,
      z
    );

    this.buildings.add(
      dome
    );

    const minaret =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.18,
          0.22,
          4.2,
          10
        ),
        this.mat(
          0x0d9488,
          {
            roughness: 0.75
          }
        )
      );

    minaret.position.set(
      x + side * 1.1,
      2.1,
      z - 0.6
    );

    this.buildings.add(
      minaret
    );
  }

  addMarketStall(
    x,
    z
  ) {
    const canopy =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.8,
          0.08,
          1.4
        ),
        this.mat(
          0xeab308,
          {
            roughness: 0.7
          }
        )
      );

    canopy.position.set(
      x,
      1.65,
      z
    );

    this.buildings.add(
      canopy
    );
  }

  addPetrol(
    x,
    z
  ) {
    const canopy =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          3.2,
          0.12,
          2.2
        ),
        this.mat(
          0xdc2626,
          {
            roughness: 0.5
          }
        )
      );

    canopy.position.set(
      x,
      2.4,
      z
    );

    this.buildings.add(
      canopy
    );
  }

  addBusStop(
    x,
    z,
    side
  ) {
    const roof =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2,
          0.08,
          1.2
        ),
        this.mat(
          0x334155,
          {
            roughness: 0.7
          }
        )
      );

    roof.position.set(
      x,
      2,
      z
    );

    this.buildings.add(
      roof
    );
  }

  addStreetLight(
    x,
    z
  ) {
    const pole =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.05,
          0.06,
          3.2,
          6
        ),
        this.mat(
          0x64748b,
          {
            roughness: 0.6,
            metalness: 0.4
          }
        )
      );

    pole.position.set(
      x,
      1.6,
      z
    );

    this.buildings.add(
      pole
    );

    const lamp =
      this.makeAssetSprite(
        ASSETS.environment.streetLight,
        0.8,
        2.8
      );

    lamp.position.set(
      x,
      1.5,
      z
    );

    this.buildings.add(
      lamp
    );
  }

  addBillboard(
    x,
    z
  ) {
    const board =
      this.makeAssetSprite(
        ASSETS.environment.billboard,
        2.4,
        1.5
      );

    board.position.set(
      x,
      2.0,
      z
    );

    this.buildings.add(
      board
    );
  }

  addPedestrian(
    x,
    z,
    index = 0
  ) {
    const asset =
      this.getPedestrianAsset(
        index
      );

    const person =
      this.makeAssetSprite(
        asset,
        0.9,
        1.65
      );

    person.position.set(
      x,
      0.82,
      z
    );

    person.userData.baseZ =
      z;

    person.userData.walkPhase =
      index * 0.7;

    this.buildings.add(
      person
    );
  }

  getPedestrianAsset(index) {
    const people = [
      ASSETS.people.pedestrian1,
      ASSETS.people.pedestrian2,
      ASSETS.people.pedestrian3
    ];

    return people[
      index % people.length
    ];
  }

  // ------------------------------------------------------------
  // PLAYER / VEHICLES
  // ------------------------------------------------------------

  makeKeke(
    bodyColor = 0xfbbf24,
    isPlayer = false
  ) {
    const g =
      new THREE.Group();

    const bodyM =
      this.mat(
        bodyColor,
        {
          roughness: 0.45,
          metalness: 0.2
        }
      );

    const dark =
      this.mat(
        0x1e293b,
        {
          roughness: 0.7
        }
      );

    const roofM =
      this.mat(
        isPlayer
          ? 0xfde047
          : 0xeab308,
        {
          roughness: 0.4
        }
      );

    const tire =
      this.mat(
        0x0f172a,
        {
          roughness: 0.95
        }
      );

    const body =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.2,
          0.5,
          1.35
        ),
        bodyM
      );

    body.position.set(
      0,
      0.55,
      -0.05
    );

    g.add(body);

    const canopy =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.35,
          0.1,
          1.2
        ),
        roofM
      );

    canopy.position.set(
      0,
      1.22,
      -0.08
    );

    g.add(canopy);

    const windshield =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.05,
          0.38,
          0.06
        ),
        this.mat(
          0x38bdf8,
          {
            roughness: 0.2,
            metalness: 0.3
          }
        )
      );

    windshield.position.set(
      0,
      0.95,
      0.58
    );

    g.add(
      windshield
    );

    const bench =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.1,
          0.18,
          0.45
        ),
        dark
      );

    bench.position.set(
      0,
      0.72,
      -0.45
    );

    g.add(bench);

    const wheel = (
      x,
      z,
      r = 0.24
    ) => {
      const w =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            r,
            r,
            0.16,
            14
          ),
          tire
        );

      w.rotation.z =
        Math.PI / 2;

      w.position.set(
        x,
        r,
        z
      );

      g.add(w);

      return w;
    };

    wheel(
      -0.58,
      -0.5
    );

    wheel(
      0.58,
      -0.5
    );

    wheel(
      0,
      0.78,
      0.22
    );

    g.userData.kind =
      'keke';

    return g;
  }

  makeVehicleFallback() {
    const g =
      new THREE.Group();

    const body =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.3,
          0.45,
          2.2
        ),
        this.mat(
          0x64748b,
          {
            roughness: 0.55
          }
        )
      );

    body.position.y =
      0.45;

    g.add(body);

    const cabin =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.15,
          0.4,
          1.1
        ),
        this.mat(
          0x334155,
          {
            roughness: 0.5
          }
        )
      );

    cabin.position.set(
      0,
      0.78,
      -0.15
    );

    g.add(cabin);

    for (
      const [x, z] of [
        [-0.55, 0.7],
        [0.55, 0.7],
        [-0.55, -0.7],
        [0.55, -0.7]
      ]
    ) {
      const wheel =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.22,
            0.22,
            0.14,
            12
          ),
          this.mat(
            0x0f172a,
            {
              roughness: 0.9
            }
          )
        );

      wheel.rotation.z =
        Math.PI / 2;

      wheel.position.set(
        x,
        0.22,
        z
      );

      g.add(wheel);
    }

    return g;
  }

  // ------------------------------------------------------------
  // VEHICLE ASSETS
  // ------------------------------------------------------------

  getTrafficAsset(type) {
    switch (type) {
      case 'keke':
        return ASSETS.traffic.keke;

      case 'taxi':
        return ASSETS.traffic.taxi;

      case 'bus':
        return ASSETS.traffic.bus;

      case 'motorcycle':
      case 'bike':
      case 'okada':
        return ASSETS.traffic.motorcycle;

      case 'truck':
        return ASSETS.traffic.truck;

      case 'police':
        return ASSETS.traffic.police;

      case 'karota':
        return ASSETS.traffic.karota;

      case 'car':
      default:
        return ASSETS.traffic.car;
    }
  }

  createVehicleVisual(
    type
  ) {
    const path =
      this.getTrafficAsset(
        type
      );

    const dimensions =
      this.getVehicleDimensions(
        type
      );

    const sprite =
      this.makeAssetSprite(
        path,
        dimensions.width,
        dimensions.height
      );

    sprite.userData.vehicleType =
      type;

    return sprite;
  }

  getVehicleDimensions(type) {
    switch (type) {
      case 'bus':
        return {
          width: 2.15,
          height: 2.4
        };

      case 'truck':
        return {
          width: 2.1,
          height: 2.0
        };

      case 'motorcycle':
      case 'bike':
      case 'okada':
        return {
          width: 0.9,
          height: 1.45
        };

      case 'keke':
        return {
          width: 1.65,
          height: 2.0
        };

      case 'police':
      case 'karota':
        return {
          width: 1.75,
          height: 1.5
        };

      case 'taxi':
      case 'car':
      default:
        return {
          width: 1.65,
          height: 1.55
        };
    }
  }

  updateVehicleVisual(
    mesh,
    type
  ) {
    if (!mesh) return;

    const asset =
      this.getTrafficAsset(
        type
      );

    if (
      mesh.userData.assetPath !==
      asset
    ) {
      this.replaceSpriteTexture(
        mesh,
        asset
      );

      mesh.userData.assetPath =
        asset;
    }

    const dims =
      this.getVehicleDimensions(
        type
      );

    mesh.scale.set(
      dims.width,
      dims.height,
      1
    );

    mesh.userData.vehicleType =
      type;
  }

  // ------------------------------------------------------------
  // ZONE / COIN
  // ------------------------------------------------------------

  makeZone(color) {
    const g =
      new THREE.Group();

    const ring =
      new THREE.Mesh(
        new THREE.RingGeometry(
          0.55,
          0.78,
          28
        ),
        new THREE.MeshBasicMaterial({
          color,
          side:
            THREE.DoubleSide,
          transparent: true,
          opacity: 0.9
        })
      );

    ring.rotation.x =
      -Math.PI / 2;

    ring.position.y =
      0.06;

    g.add(ring);

    const disc =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          0.5,
          24
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.22,
          side:
            THREE.DoubleSide
        })
      );

    disc.rotation.x =
      -Math.PI / 2;

    disc.position.y =
      0.05;

    g.add(disc);

    return g;
  }

  makeCoin() {
    const coin =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.3,
          0.3,
          0.07,
          18
        ),
        this.mat(
          0xfbbf24,
          {
            metalness: 0.75,
            roughness: 0.22,
            emissive: 0xb45309,
            emissiveIntensity: 0.3
          }
        )
      );

    coin.rotation.x =
      Math.PI / 2;

    return coin;
  }

  // ------------------------------------------------------------
  // PARTICLES
  // ------------------------------------------------------------

  initParticles() {
    this.dustGeo =
      new THREE.BufferGeometry();

    const dustCount = 100;

    const dustPos =
      new Float32Array(
        dustCount * 3
      );

    for (
      let i = 0;
      i < dustCount;
      i++
    ) {
      dustPos[i * 3] =
        (Math.random() - 0.5) * 8;

      dustPos[i * 3 + 1] =
        Math.random() * 1.5;

      dustPos[i * 3 + 2] =
        Math.random() * 40 + 2;
    }

    this.dustGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        dustPos,
        3
      )
    );

    this.dustMat =
      new THREE.PointsMaterial({
        color: 0xc4b5a0,
        size: 0.12,
        transparent: true,
        opacity: 0.35,
        depthWrite: false
      });

    this.dust =
      new THREE.Points(
        this.dustGeo,
        this.dustMat
      );

    this.scene.add(
      this.dust
    );

    this.rainGeo =
      new THREE.BufferGeometry();

    const rainCount = 400;

    const rainPos =
      new Float32Array(
        rainCount * 3
      );

    for (
      let i = 0;
      i < rainCount;
      i++
    ) {
      rainPos[i * 3] =
        (Math.random() - 0.5) * 14;

      rainPos[i * 3 + 1] =
        Math.random() * 12;

      rainPos[i * 3 + 2] =
        Math.random() * 50;
    }

    this.rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        rainPos,
        3
      )
    );

    this.rainMat =
      new THREE.PointsMaterial({
        color: 0xa5c4e0,
        size: 0.08,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });

    this.rain =
      new THREE.Points(
        this.rainGeo,
        this.rainMat
      );

    this.scene.add(
      this.rain
    );

    // Player shadow.
    this.playerShadow =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          0.7,
          16
        ),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.28
        })
      );

    this.playerShadow.rotation.x =
      -Math.PI / 2;

    this.playerShadow.position.y =
      0.03;

    this.scene.add(
      this.playerShadow
    );

    // Asset-backed dust sprite.
    this.dustSprite =
      this.makeAssetSprite(
        ASSETS.effects.dust,
        2.5,
        1.3,
        {
          opacity: 0
        }
      );

    this.dustSprite.position.set(
      0,
      0.35,
      4.9
    );

    this.scene.add(
      this.dustSprite
    );

    // Speed lines.
    this.speedLines =
      this.makeAssetSprite(
        ASSETS.effects.speedLines,
        7.0,
        6.5,
        {
          opacity: 0
        }
      );

    this.speedLines.position.set(
      0,
      2.5,
      9
    );

    this.scene.add(
      this.speedLines
    );
  }

  // ------------------------------------------------------------
  // MATERIAL
  // ------------------------------------------------------------

  mat(
    color,
    opts = {}
  ) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness:
        opts.roughness ?? 0.55,
      metalness:
        opts.metalness ?? 0.15,
      emissive:
        opts.emissive ?? 0x000000,
      emissiveIntensity:
        opts.emissiveIntensity ?? 0
    });
  }

  // ------------------------------------------------------------
  // GAME COORDINATE HELPERS
  // ------------------------------------------------------------

  screenYToZ(
    y,
    playerY
  ) {
    const t =
      (playerY - y) /
      Math.max(
        playerY,
        1
      );

    return (
      PLAYER_Z +
      t * 58
    );
  }

  laneToX(lane) {
    return LANE_X[
      Math.max(
        0,
        Math.min(
          2,
          Math.round(
            lane || 0
          )
        )
      )
    ];
  }

  // ------------------------------------------------------------
  // PLAYER PAINT
  // ------------------------------------------------------------

  applyPaint(
    paintId
  ) {
    const colors = {
      classic: 0xfbbf24,
      ruffneck: 0xeab308,
      sky: 0x38bdf8,
      forest: 0x22c55e,
      royal: 0xa855f7,
      ember: 0xef4444,
      night: 0x1e293b
    };

    const color =
      colors[paintId] ||
      colors.classic;

    if (!this.player) {
      return;
    }

    this.player.traverse(
      (child) => {
        if (
          child.isMesh &&
          child.material &&
          child.material.color
        ) {
          child.material.color.setHex(
            color
          );
        }
      }
    );
  }

  // ------------------------------------------------------------
  // PLAYER DAMAGE / STEERING ASSETS
  // ------------------------------------------------------------

  updatePlayerAsset(
    game
  ) {
    if (!this.playerVisual) {
      return;
    }

    let desired =
      'normal';

    if (
      game.crashed ||
      game.damage ||
      game.isDamaged
    ) {
      desired =
        'damaged';
    } else {
      const lane =
        Number(game.playerLane);

      const targetX =
        this.laneToX(lane);

      const difference =
        targetX -
        this.player.position.x;

      if (difference < -0.18) {
        desired =
          'left';
      } else if (
        difference > 0.18
      ) {
        desired =
          'right';
      }
    }

    if (
      desired !==
      this.playerVisualState
    ) {
      const path =
        ASSETS.player[
          desired
        ] ||
        ASSETS.player.normal;

      this.replaceSpriteTexture(
        this.playerVisual,
        path
      );

      this.playerVisualState =
        desired;
    }
  }

  // ------------------------------------------------------------
  // QUALITY
  // ------------------------------------------------------------

  applyQuality(low) {
    if (!this.renderer) {
      return;
    }

    this.renderer.setPixelRatio(
      low
        ? 1
        : Math.min(
            window.devicePixelRatio || 1,
            1.75
          )
    );

    this.renderer.setSize(
      this.canvas.clientWidth ||
        390,
      this.canvas.clientHeight ||
        700,
      false
    );

    if (this.rain) {
      this.rain.visible =
        !low;
    }

    if (
      this.dust &&
      low
    ) {
      this.dustMat.opacity =
        Math.min(
          this.dustMat.opacity,
          0.15
        );
    }
  }

  // ------------------------------------------------------------
  // RESIZE
  // ------------------------------------------------------------

  resize() {
    const w =
      this.canvas.clientWidth ||
      390;

    const h =
      this.canvas.clientHeight ||
      700;

    this.camera.aspect =
      w / h;

    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        1.75
      )
    );

    this.renderer.setSize(
      w,
      h,
      false
    );
  }

  // ------------------------------------------------------------
  // WEATHER
  // ------------------------------------------------------------

  updateWeather(
    game
  ) {
    if (
      (game.frame || 0) % 900 === 0 &&
      game.state === 1
    ) {
      const r =
        Math.random();

      this.weather =
        r < 0.55
          ? 'clear'
          : r < 0.8
          ? 'harmattan'
          : 'rain';

      this.lastWeather =
        this.weather;

      this.showWeatherToast(
        this.weather
      );
    }

    if (
      this.weather ===
      'rain'
    ) {
      this.rainMat.opacity =
        0.55;

      this.dustMat.opacity =
        0.08;
    } else if (
      this.weather ===
      'harmattan'
    ) {
      this.rainMat.opacity =
        0;

      this.dustMat.opacity =
        0.55;

      this.dustMat.color.setHex(
        0xd4c4a8
      );
    } else {
      this.rainMat.opacity =
        0;

      this.dustMat.opacity =
        0.2 +
        Math.min(
          0.25,
          (game.speed || 0) *
            0.03
        );

      this.dustMat.color.setHex(
        0xc4b5a0
      );
    }
  }

  showWeatherToast(
    weather
  ) {
    try {
      if (
        this.game &&
        this.game.ui &&
        typeof this.game.ui.showToast ===
          'function'
      ) {
        this.game.ui.showToast(
          weather === 'rain'
            ? 'Rain in Kano'
            : 'Harmattan haze'
        );
      }
    } catch {}
  }

  // ------------------------------------------------------------
  // PARTICLE ANIMATION
  // ------------------------------------------------------------

  updateParticles(
    game
  ) {
    const speed =
      game.speed || 3;

    if (this.dust) {
      const positions =
        this.dust.geometry
          .attributes
          .position
          .array;

      for (
        let i = 0;
        i < positions.length;
        i += 3
      ) {
        positions[i + 2] -=
          speed * 0.08;

        if (
          positions[i + 2] < 1
        ) {
          positions[i] =
            (Math.random() - 0.5) * 8;

          positions[i + 1] =
            Math.random() * 1.2;

          positions[i + 2] =
            35 +
            Math.random() * 15;
        }
      }

      this.dust.geometry
        .attributes
        .position
        .needsUpdate = true;
    }

    if (
      this.rain &&
      this.rainMat.opacity > 0.05
    ) {
      const positions =
        this.rain.geometry
          .attributes
          .position
          .array;

      for (
        let i = 0;
        i < positions.length;
        i += 3
      ) {
        positions[i + 1] -=
          0.45;

        positions[i + 2] -=
          speed * 0.05;

        if (
          positions[i + 1] < 0
        ) {
          positions[i] =
            (Math.random() - 0.5) * 14;

          positions[i + 1] =
            8 +
            Math.random() * 6;

          positions[i + 2] =
            Math.random() * 45;
        }
      }

      this.rain.geometry
        .attributes
        .position
        .needsUpdate = true;
    }

    // Asset-backed dust.
    if (this.dustSprite) {
      const visible =
        speed > 5 &&
        this.weather !==
          'rain';

      this.dustSprite.material.opacity =
        visible
          ? Math.min(
              0.6,
              (speed - 5) * 0.08
            )
          : 0;

      this.dustSprite.position.x =
        this.player
          ? this.player.position.x
          : 0;
    }

    // Speed lines.
    if (this.speedLines) {
      const intensity =
        Math.max(
          0,
          Math.min(
            0.5,
            (speed - 7) *
              0.06
          )
        );

      this.speedLines.material.opacity =
        intensity;
    }
  }

  // ------------------------------------------------------------
  // PLAYER
  // ------------------------------------------------------------

  updatePlayer(
    game
  ) {
    if (!this.player) {
      return;
    }

    const targetX =
      this.laneToX(
        game.playerLane
      );

    const previousX =
      this.player.position.x;

    this.player.position.x +=
      (
        targetX -
        this.player.position.x
      ) * 0.22;

    this.player.position.z =
      PLAYER_Z;

    this.player.position.y =
      game.bounce > 0
        ? Math.sin(
            game.bounce * 0.9
          ) * 0.1
        : 0;

    const lateral =
      this.player.position.x -
      previousX;

    this.player.rotation.z =
      -lateral * 0.8;

    this.player.rotation.y =
      -lateral * 0.4;

    if (
      this.playerShadow
    ) {
      this.playerShadow.position.x =
        this.player.position.x;

      this.playerShadow.position.z =
        this.player.position.z;

      this.playerShadow.scale.setScalar(
        0.9 +
          Math.abs(
            this.player.position.y
          ) * 2
      );
    }

    // Keep asset sprite synchronized
    // with fallback keke.
    if (
      this.playerVisual
    ) {
      this.playerVisual.position.x =
        this.player.position.x;

      this.playerVisual.position.y =
        1.25 +
        this.player.position.y;

      this.playerVisual.position.z =
        PLAYER_Z - 0.15;

      this.playerVisual.rotation.z =
        this.player.rotation.z;

      this.playerVisual.visible =
        this.playerVisual.userData
          .assetLoaded === true;

      // Keep the procedural keke
      // behind the asset rather
      // than deleting it.
      this.player.visible =
        !this.playerVisual.visible;
    }

    this.updatePlayerAsset(
      game
    );
  }

  // ------------------------------------------------------------
  // CAMERA
  // ------------------------------------------------------------

  updateCamera(
    game
  ) {
    let sx = 0;
    let sy = 0;

    if (
      game.shake > 0
    ) {
      sx =
        (Math.random() - 0.5) *
        (game.shakeMag || 4) *
        0.03;

      sy =
        (Math.random() - 0.5) *
        (game.shakeMag || 4) *
        0.02;
    }

    const px =
      this.player
        ? this.player.position.x
        : 0;

    const speed =
      game.speed || 3;

    const targetFov =
      50 +
      Math.min(
        8,
        Math.max(
          0,
          speed - 4
        ) * 1.5
      );

    this.camera.fov +=
      (
        targetFov -
        this.camera.fov
      ) * 0.05;

    this.camera.updateProjectionMatrix();

    this.camera.position.x =
      px * 0.4 + sx;

    this.camera.position.y =
      6.2 + sy;

    this.camera.position.z =
      -3.5;

    this.camera.lookAt(
      px * 0.25,
      0.9,
      16
    );
  }

  // ------------------------------------------------------------
  // TRAFFIC
  // ------------------------------------------------------------

  updateTraffic(
    game
  ) {
    const playerY =
      game.playerY || 500;

    let index = 0;

    for (
      const obstacle of
        game.obs || []
    ) {
      if (
        index >=
        this.vehiclePool.length
      ) {
        break;
      }

      const fallback =
        this.vehiclePool[
          index++
        ];

      const type =
        obstacle.type ||
        'car';

      let visual =
        fallback.userData.assetVisual;

      if (
        !visual ||
        visual.userData.vehicleType !==
          type
      ) {
        if (visual) {
          visual.visible =
            false;
        }

        visual =
          this.createVehicleVisual(
            type
          );

        visual.userData.vehicleType =
          type;

        visual.userData.assetVisual =
          visual;

        this.scene.add(
          visual
        );
      }

      visual.visible =
        true;

      visual.position.x =
        this.laneToX(
          obstacle.lane
        );

      visual.position.z =
        this.screenYToZ(
          obstacle.y,
          playerY
        );

      visual.position.y =
        this.getTrafficHeight(
          type
        );

      // Slight road movement/bounce.
      visual.rotation.z =
        Math.sin(
          (game.frame || 0) *
            0.05 +
            index
        ) *
        0.012;
    }

    // Hide unused fallback and
    // asset-backed visuals.
    while (
      index <
      this.vehiclePool.length
    ) {
      this.vehiclePool[
        index++
      ].visible = false;
    }

    for (
      const fallback of
        this.vehiclePool
    ) {
      const visual =
        fallback.userData.assetVisual;

      if (
        visual &&
        !this.isVehicleInCurrentPool(
          visual,
          game.obs || []
        )
      ) {
        visual.visible =
          false;
      }
    }
  }

  getTrafficHeight(
    type
  ) {
    switch (type) {
      case 'bus':
      case 'truck':
        return 1.15;

      case 'motorcycle':
      case 'bike':
      case 'okada':
        return 0.72;

      case 'keke':
        return 0.95;

      default:
        return 0.8;
    }
  }

  isVehicleInCurrentPool(
    visual,
    obstacles
  ) {
    if (
      !visual ||
      !visual.visible
    ) {
      return false;
    }

    return obstacles.some(
      (o) =>
        Math.abs(
          this.screenYToZ(
            o.y,
            this.game.playerY ||
              500
          ) -
            visual.position.z
        ) < 0.5 &&
        this.laneToX(
          o.lane
        ) ===
          visual.position.x
    );
  }

  // ------------------------------------------------------------
  // PASSENGERS / ZONES
  // ------------------------------------------------------------

  updateZones(
    game
  ) {
    const playerY =
      game.playerY || 500;

    const zones = [
      ...(game.paxZones || [])
        .filter(
          (p) => !p.taken
        )
        .map(
          (p) => ({
            ...p,
            kind: 'p'
          })
        ),

      ...(game.dropZones || [])
        .filter(
          (d) => !d.used
        )
        .map(
          (d) => ({
            ...d,
            kind: 'd'
          })
        )
    ];

    let index = 0;

    for (
      const zone of zones
    ) {
      if (
        index >=
        this.zonePool.length
      ) {
        break;
      }

      const mesh =
        this.zonePool[
          index++
        ];

      mesh.visible =
        true;

      mesh.position.x =
        this.laneToX(
          zone.lane
        );

      mesh.position.z =
        this.screenYToZ(
          zone.y,
          playerY
        );

      const color =
        zone.kind === 'd'
          ? 0xfbbf24
          : zone.aishat
          ? 0xf472b6
          : zone.vip
          ? 0xa78bfa
          : 0x4ade80;

      mesh.children.forEach(
        (child) => {
          if (
            child.material &&
            child.material.color
          ) {
            child.material.color.setHex(
              color
            );
          }
        }
      );

      const pulse =
        1 +
        Math.sin(
          (game.frame || 0) *
            0.12
        ) *
          0.08;

      mesh.scale.set(
        pulse,
        1,
        pulse
      );
    }

    while (
      index <
      this.zonePool.length
    ) {
      this.zonePool[
        index++
      ].visible = false;
    }

    // Actual roadside passenger sprites.
    let passengerIndex = 0;

    for (
      const passenger of
        game.paxZones || []
    ) {
      if (
        passenger.taken
      ) {
        continue;
      }

      if (
        passengerIndex >=
        this.passengerPool.length
      ) {
        break;
      }

      const sprite =
        this.passengerPool[
          passengerIndex++
        ];

      sprite.visible =
        true;

      sprite.position.x =
        this.laneToX(
          passenger.lane
        );

      sprite.position.z =
        this.screenYToZ(
          passenger.y,
          playerY
        );

      sprite.position.y =
        0.9;

      const phase =
        Math.sin(
          (game.frame || 0) *
            0.12 +
            passengerIndex
        );

      sprite.position.y +=
        Math.max(
          0,
          phase
        ) * 0.04;

      // Flagging animation.
      sprite.rotation.z =
        phase * 0.025;
    }

    while (
      passengerIndex <
      this.passengerPool.length
    ) {
      this.passengerPool[
        passengerIndex++
      ].visible = false;
    }
  }

  // ------------------------------------------------------------
  // COINS
  // ------------------------------------------------------------

  updateCoins(
    game
  ) {
    const playerY =
      game.playerY || 500;

    let index = 0;

    for (
      const coin of
        game.coins || []
    ) {
      if (
        coin.taken ||
        index >=
          this.coinPool.length
      ) {
        continue;
      }

      const mesh =
        this.coinPool[
          index++
        ];

      mesh.visible =
        true;

      mesh.position.x =
        this.laneToX(
          coin.lane
        );

      mesh.position.z =
        this.screenYToZ(
          coin.y,
          playerY
        );

      mesh.position.y =
        0.55 +
        Math.sin(
          coin.bob || 0
        ) *
          0.15;

      mesh.rotation.y +=
        0.1;
    }

    while (
      index <
      this.coinPool.length
    ) {
      this.coinPool[
        index++
      ].visible = false;
    }
  }

  // ------------------------------------------------------------
  // DAY / NIGHT
  // ------------------------------------------------------------

  updateTimeOfDay(
    game
  ) {
    const tod =
      typeof game.getTimeOfDay ===
      'function'
        ? game.getTimeOfDay()
        : 0.2;

    if (
      tod > 0.62
    ) {
      this.renderer.setClearColor(
        0x020617,
        1
      );

      this.scene.fog.color.setHex(
        0x020617
      );

      this.scene.fog.near =
        22;

      this.scene.fog.far =
        75;

      this.sun.intensity =
        0.18;

      this.hemlight.intensity =
        0.12;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x020617
        );
      }
    } else if (
      tod > 0.42
    ) {
      this.renderer.setClearColor(
        0x7c3aed,
        1
      );

      this.scene.fog.color.setHex(
        0x4c1d95
      );

      this.scene.fog.near =
        28;

      this.scene.fog.far =
        90;

      this.sun.intensity =
        0.45;

      this.hemlight.intensity =
        0.25;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x5b21b6
        );
      }
    } else if (
      tod > 0.28
    ) {
      this.renderer.setClearColor(
        0x38bdf8,
        1
      );

      this.scene.fog.color.setHex(
        0x7dd3fc
      );

      this.scene.fog.near =
        35;

      this.scene.fog.far =
        100;

      this.sun.intensity =
        1.05;

      this.hemlight.intensity =
        0.4;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x38bdf8
        );
      }
    } else {
      this.renderer.setClearColor(
        0x7dd3fc,
        1
      );

      this.scene.fog.color.setHex(
        0xbae6fd
      );

      this.scene.fog.near =
        40;

      this.scene.fog.far =
        110;

      this.sun.intensity =
        1.2;

      this.hemlight.intensity =
        0.5;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x7dd3fc
        );
      }
    }
  }

  // ------------------------------------------------------------
  // MAIN DRAW
  // ------------------------------------------------------------

  draw() {
    this.render();
  }

  render() {
    if (
      !this.ready
    ) {
      return;
    }

    const game =
      this.game;

    this.updateTimeOfDay(
      game
    );

    this.updateWeather(
      game
    );

    this.updateParticles(
      game
    );

    // Road movement.
    if (this.laneMarks) {
      this.laneMarks.position.z =
        -(
          (game.roadOff || 0) *
          0.08
        ) % 3.2;
    }

    if (this.buildings) {
      this.buildings.position.z =
        -(
          (game.roadOff || 0) *
          0.04
        ) % 6.2;
    }

    this.updatePlayer(
      game
    );

    this.updateCamera(
      game
    );

    this.updateTraffic(
      game
    );

    this.updateZones(
      game
    );

    this.updateCoins(
      game
    );

    this.renderer.render(
      this.scene,
      this.camera
    );

    this.lastFrame =
      game.frame || 0;

    this.lastSpeed =
      game.speed || 0;
  }

  // ------------------------------------------------------------
  // OPTIONAL API COMPATIBILITY
  // ------------------------------------------------------------

  renderFrame() {
    this.render();
  }

  setQuality(low) {
    this.applyQuality(
      low
    );
  }

  setWeather(weather) {
    if (
      weather ===
        'clear' ||
      weather ===
        'harmattan' ||
      weather ===
        'rain'
    ) {
      this.weather =
        weather;
    }
  }

  dispose() {
    if (
      this.renderer
    ) {
      this.renderer.dispose();
    }

    for (
      const texture of
        this.textureCache.values()
    ) {
      if (
        texture &&
        typeof texture.dispose ===
          'function'
      ) {
        texture.dispose();
      }
    }

    this.textureCache.clear();

    if (this.scene) {
      this.scene.traverse(
        (object) => {
          if (
            object.geometry &&
            typeof object.geometry.dispose ===
              'function'
          ) {
            object.geometry.dispose();
          }

          if (
            object.material
          ) {
            const materials =
              Array.isArray(
                object.material
              )
                ? object.material
                : [
                    object.material
                  ];

            for (
              const material of
                materials
            ) {
              if (
                material.map &&
                material.map !==
                  undefined
              ) {
                // Texture cache owns
                // the texture lifecycle.
              }

              if (
                typeof material.dispose ===
                  'function'
              ) {
                material.dispose();
              }
            }
          }
        }
      );
    }

    this.ready =
      false;
  }
}

export default Renderer3D;