```js
/*
 * Kano Run — Adaidaita Sahu
 * 3D Renderer
 *
 * Local assets only.
 * No CDN.
 * No external APIs.
 *
 * File:
 *   js/renderer3d.js
 */

import * as THREE from './vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];
const PLAYER_Z = 5.5;
const ROAD_LENGTH = 180;

const ASSETS = {
  player: {
    normal: '/assets/player/keke-player.png',
    left: '/assets/player/keke-player-left.png',
    right: '/assets/player/keke-player-right.png',
    damaged: '/assets/player/keke-player-damaged.png',
  },

  traffic: {
    yellowKeke: '/assets/traffic/keke-yellow.png',
    blueKeke: '/assets/traffic/keke-blue.png',
    sedan: '/assets/traffic/car-sedan.png',
    taxi: '/assets/traffic/taxi.png',
    bus: '/assets/traffic/bus.png',
    motorcycle: '/assets/traffic/motorcycle.png',
    truck: '/assets/traffic/truck.png',
    police: '/assets/traffic/police.png',
    karota: '/assets/traffic/karota.png',
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
    streetLight: '/assets/environment/street-light.png',
  },

  people: {
    one: '/assets/people/pedestrian-01.png',
    two: '/assets/people/pedestrian-02.png',
    three: '/assets/people/pedestrian-03.png',
    passenger: '/assets/people/passenger.png',
  },

  effects: {
    dust: '/assets/effects/dust.png',
    smoke: '/assets/effects/smoke.png',
    collision: '/assets/effects/collision.png',
    speedLines: '/assets/effects/speed-lines.png',
  },
};

const TRAFFIC_TYPES = [
  'yellowKeke',
  'blueKeke',
  'sedan',
  'taxi',
  'bus',
  'motorcycle',
  'truck',
  'police',
  'karota',
];

const ENVIRONMENT_TYPES = [
  'shop',
  'market',
  'house',
  'mosque',
  'school',
  'petrol',
  'busStop',
  'billboard',
  'streetLight',
];

const PEOPLE_TYPES = [
  'one',
  'two',
  'three',
];

function safeNumber(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lower(value) {
  return String(value || '').toLowerCase();
}

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game?.canvas || null;

    this.ready = false;
    this.destroyed = false;

    this.renderer = null;
    this.scene = null;
    this.camera = null;

    this.clock = new THREE.Clock();

    this.textureLoader = null;
    this.textures = new Map();

    this.vehiclePool = [];
    this.passengerPool = [];
    this.coinPool = [];
    this.pedestrianPool = [];
    this.effectPool = [];

    this.environmentObjects = [];
    this.roadMarkers = [];

    this.player = null;
    this.playerSprite = null;
    this.playerShadow = null;

    this.playerX = 0;
    this.targetPlayerX = 0;

    this.currentWeather = '';
    this.currentTime = '';

    this.lastGame = null;
    this.quality = 'high';

    this.init();
  }

  init() {
    if (!this.canvas) {
      return;
    }

    this.textureLoader = new THREE.TextureLoader();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    this.renderer.setPixelRatio(pixelRatio);

    if (
      'outputColorSpace' in this.renderer &&
      THREE.SRGBColorSpace
    ) {
      this.renderer.outputColorSpace =
        THREE.SRGBColorSpace;
    }

    this.scene = new THREE.Scene();

    this.scene.background =
      new THREE.Color(0x86b6d4);

    this.camera =
      new THREE.PerspectiveCamera(
        58,
        16 / 9,
        0.1,
        350
      );

    this.camera.position.set(
      0,
      5.7,
      11.5
    );

    this.camera.lookAt(
      0,
      1.6,
      -25
    );

    this.createLighting();
    this.createWorld();
    this.createPlayer();
    this.createPools();

    this.ready = true;

    this.resize();
  }

  createLighting() {
    this.ambientLight =
      new THREE.HemisphereLight(
        0xc9e2f0,
        0x554638,
        1.65
      );

    this.scene.add(
      this.ambientLight
    );

    this.sunLight =
      new THREE.DirectionalLight(
        0xffffff,
        2.0
      );

    this.sunLight.position.set(
      -30,
      50,
      25
    );

    this.scene.add(
      this.sunLight
    );

    this.fillLight =
      new THREE.DirectionalLight(
        0xffd5a0,
        0.45
      );

    this.fillLight.position.set(
      25,
      20,
      -35
    );

    this.scene.add(
      this.fillLight
    );
  }

  createWorld() {
    this.world = new THREE.Group();
    this.world.name = 'KanoRunWorld';

    this.scene.add(
      this.world
    );

    this.createRoad();
    this.createShoulders();
    this.createRoadMarkings();
    this.createEnvironment();
    this.createBackground();
  }

  createRoad() {
    const geometry =
      new THREE.PlaneGeometry(
        10.8,
        ROAD_LENGTH
      );

    const material =
      new THREE.MeshStandardMaterial({
        color: 0x303236,
        roughness: 0.97,
        metalness: 0,
      });

    this.road =
      new THREE.Mesh(
        geometry,
        material
      );

    this.road.rotation.x =
      -Math.PI / 2;

    this.road.position.set(
      0,
      0,
      -75
    );

    this.world.add(
      this.road
    );

    const centerGlow =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          0.5,
          ROAD_LENGTH
        ),
        new THREE.MeshBasicMaterial({
          color: 0x3a3b3b,
          transparent: true,
          opacity: 0.55,
        })
      );

    centerGlow.rotation.x =
      -Math.PI / 2;

    centerGlow.position.set(
      0,
      0.012,
      -75
    );

    this.world.add(
      centerGlow
    );
  }

  createShoulders() {
    const geometry =
      new THREE.PlaneGeometry(
        3.6,
        ROAD_LENGTH
      );

    const material =
      new THREE.MeshStandardMaterial({
        color: 0x89745c,
        roughness: 1,
      });

    const left =
      new THREE.Mesh(
        geometry,
        material
      );

    left.rotation.x =
      -Math.PI / 2;

    left.position.set(
      -7.15,
      -0.02,
      -75
    );

    this.world.add(left);

    const right =
      left.clone();

    right.position.x = 7.15;

    this.world.add(right);

    const dirtLeft =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          1.2,
          ROAD_LENGTH
        ),
        new THREE.MeshStandardMaterial({
          color: 0x9b8060,
          roughness: 1,
        })
      );

    dirtLeft.rotation.x =
      -Math.PI / 2;

    dirtLeft.position.set(
      -9.35,
      -0.025,
      -75
    );

    this.world.add(
      dirtLeft
    );

    const dirtRight =
      dirtLeft.clone();

    dirtRight.position.x =
      9.35;

    this.world.add(
      dirtRight
    );
  }

  createRoadMarkings() {
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
              4.2
            ),
            new THREE.MeshBasicMaterial({
              color: 0xe8ddb9,
              transparent: true,
              opacity: 0.82,
              side: THREE.DoubleSide,
            })
          );

        marker.rotation.x =
          -Math.PI / 2;

        marker.position.set(
          x,
          0.028,
          7 - i * 9
        );

        this.world.add(
          marker
        );

        this.roadMarkers.push(
          marker
        );
      }
    }

    const edgeMaterial =
      new THREE.MeshBasicMaterial({
        color: 0xdccf9e,
      });

    const edgeGeometry =
      new THREE.BoxGeometry(
        0.08,
        0.035,
        ROAD_LENGTH
      );

    const leftEdge =
      new THREE.Mesh(
        edgeGeometry,
        edgeMaterial
      );

    leftEdge.position.set(
      -5.15,
      0.025,
      -75
    );

    this.world.add(
      leftEdge
    );

    const rightEdge =
      leftEdge.clone();

    rightEdge.position.x =
      5.15;

    this.world.add(
      rightEdge
    );
  }

  createBackground() {
    const ground =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          180,
          280
        ),
        new THREE.MeshStandardMaterial({
          color: 0x8d7d64,
          roughness: 1,
        })
      );

    ground.rotation.x =
      -Math.PI / 2;

    ground.position.set(
      0,
      -0.06,
      -80
    );

    this.world.add(
      ground
    );

    const horizon =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          180,
          50
        ),
        new THREE.MeshBasicMaterial({
          color: 0x71836e,
        })
      );

    horizon.position.set(
      0,
      19,
      -125
    );

    this.world.add(
      horizon
    );
  }

  loadTexture(path) {
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
            this.renderer &&
            this.renderer.capabilities &&
            this.renderer.capabilities.getMaxAnisotropy
          ) {
            loaded.anisotropy =
              Math.min(
                this.renderer.capabilities.getMaxAnisotropy(),
                8
              );
          }

          loaded.needsUpdate =
            true;
        },
        undefined,
        () => {
          /*
           * Keep the game running even when an
           * individual optional image is missing.
           */
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
    name
  ) {
    const texture =
      this.loadTexture(path);

    const material =
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
      });

    const sprite =
      new THREE.Sprite(
        material
      );

    sprite.name =
      name || 'sprite';

    sprite.scale.set(
      width,
      height,
      1
    );

    return sprite;
  }

  createPlayer() {
    this.player =
      new THREE.Group();

    this.player.name =
      'PlayerKeke';

    this.scene.add(
      this.player
    );

    this.playerSprite =
      this.createSprite(
        ASSETS.player.normal,
        3.35,
        3.35,
        'PlayerKekeSprite'
      );

    this.playerSprite.position.y =
      1.72;

    this.player.add(
      this.playerSprite
    );

    this.playerShadow =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          1.15,
          28
        ),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.3,
        })
      );

    this.playerShadow.rotation.x =
      -Math.PI / 2;

    this.playerShadow.position.set(
      0,
      0.035,
      PLAYER_Z + 0.25
    );

    this.scene.add(
      this.playerShadow
    );

    this.player.position.set(
      0,
      0,
      PLAYER_Z
    );
  }

  createPools() {
    for (
      let i = 0;
      i < 16;
      i += 1
    ) {
      this.vehiclePool.push(
        this.createVehicle(i)
      );
    }

    for (
      let i = 0;
      i < 10;
      i += 1
    ) {
      this.passengerPool.push(
        this.createPassenger(i)
      );
    }

    for (
      let i = 0;
      i < 12;
      i += 1
    ) {
      this.coinPool.push(
        this.createCoin(i)
      );
    }

    for (
      let i = 0;
      i < 10;
      i += 1
    ) {
      this.pedestrianPool.push(
        this.createPedestrian(i)
      );
    }

    for (
      let i = 0;
      i < 6;
      i += 1
    ) {
      this.effectPool.push(
        this.createEffect(i)
      );
    }
  }

  createVehicle(index) {
    const root =
      new THREE.Group();

    root.visible = false;

    const sprite =
      this.createSprite(
        ASSETS.traffic.car,
        3,
        3,
        `TrafficVehicle-${index}`
      );

    sprite.position.y =
      1.45;

    root.add(sprite);

    const shadow =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          0.85,
          20
        ),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.25,
        })
      );

    shadow.rotation.x =
      -Math.PI / 2;

    shadow.position.y =
      0.03;

    root.add(shadow);

    this.scene.add(
      root
    );

    return {
      root,
      sprite,
      shadow,
      active: false,
      source: null,
      phase: Math.random() * 10,
    };
  }

  createPassenger(index) {
    const root =
      new THREE.Group();

    root.visible = false;

    const person =
      this.createSprite(
        ASSETS.people.passenger,
        2.2,
        2.2,
        `Passenger-${index}`
      );

    person.position.y =
      1.15;

    root.add(person);

    const marker =
      this.createSprite(
        ASSETS.effects.speedLines,
        1.5,
        1.5,
        `PassengerMarker-${index}`
      );

    marker.position.y =
      2.65;

    marker.material.opacity =
      0.42;

    root.add(marker);

    this.scene.add(
      root
    );

    return {
      root,
      person,
      marker,
      active: false,
      source: null,
    };
  }

  createCoin(index) {
    const root =
      new THREE.Group();

    root.visible = false;

    const coin =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.42,
          0.42,
          0.14,
          24
        ),
        new THREE.MeshStandardMaterial({
          color: 0xf4c542,
          metalness: 0.7,
          roughness: 0.22,
        })
      );

    coin.rotation.z =
      Math.PI / 2;

    coin.position.y =
      1.15;

    root.add(coin);

    this.scene.add(
      root
    );

    return {
      root,
      coin,
      active: false,
      source: null,
      phase: index,
    };
  }

  createPedestrian(index) {
    const root =
      new THREE.Group();

    root.visible = false;

    const type =
      PEOPLE_TYPES[
        index % PEOPLE_TYPES.length
      ];

    const sprite =
      this.createSprite(
        ASSETS.people[type],
        1.8,
        1.8,
        `Pedestrian-${index}`
      );

    sprite.position.y =
      1;

    root.add
```
