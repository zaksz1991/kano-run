```js
// Kano Run — Adaidaita Sahu
// Asset-driven 3D renderer
//
// Uses only local assets from:
// public/assets/
//
// No CDN.
// No external images.
// No new dependencies.
//
// Preserves the existing renderer API used by Game:
//   draw(game)
//   render(game)
//   resize()
//   applyPaint()
//   applyQuality()

import * as THREE from '../vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];
const ROAD_LEN = 180;
const PLAYER_Z = 5.5;

const ASSETS = {
  player: {
    normal: '/assets/player/keke-player.png',
    left: '/assets/player/keke-player-left.png',
    right: '/assets/player/keke-player-right.png',
    damaged: '/assets/player/keke-player-damaged.png',
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
    pedestrian1: '/assets/people/pedestrian-01.png',
    pedestrian2: '/assets/people/pedestrian-02.png',
    pedestrian3: '/assets/people/pedestrian-03.png',
    passenger: '/assets/people/passenger.png',
  },

  effects: {
    dust: '/assets/effects/dust.png',
    smoke: '/assets/effects/smoke.png',
    collision: '/assets/effects/collision.png',
    speedLines: '/assets/effects/speed-lines.png',
  },
};

const TRAFFIC_ASSETS = [
  ASSETS.traffic.kekeYellow,
  ASSETS.traffic.kekeBlue,
  ASSETS.traffic.car,
  ASSETS.traffic.taxi,
  ASSETS.traffic.bus,
  ASSETS.traffic.motorcycle,
  ASSETS.traffic.truck,
  ASSETS.traffic.police,
  ASSETS.traffic.karota,
];

const ENVIRONMENT_ASSETS = [
  ASSETS.environment.shop,
  ASSETS.environment.market,
  ASSETS.environment.house,
  ASSETS.environment.mosque,
  ASSETS.environment.school,
  ASSETS.environment.petrol,
  ASSETS.environment.busStop,
  ASSETS.environment.billboard,
  ASSETS.environment.streetLight,
];

const PEOPLE_ASSETS = [
  ASSETS.people.pedestrian1,
  ASSETS.people.pedestrian2,
  ASSETS.people.pedestrian3,
  ASSETS.people.passenger,
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pick(array, index) {
  if (!array.length) return null;
  return array[Math.abs(index) % array.length];
}

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game?.canvas;

    this.ready = false;
    this.width = 1;
    this.height = 1;

    this.quality = 'high';

    this.vehiclePool = [];
    this.zonePool = [];
    this.coinPool = [];
    this.environmentPool = [];
    this.peoplePool = [];
    this.effectPool = [];

    this.textures = new Map();
    this.textureLoader = new THREE.TextureLoader();

    this.lastGame = null;
    this.lastRenderTime = 0;

    this.playerSprite = null;
    this.playerShadow = null;
    this.playerRoot = null;

    this.road = null;
    this.roadMarkings = [];
    this.shoulderObjects = [];
    this.cityObjects = [];

    this.playerLane = 1;
    this.playerTargetX = 0;
    this.playerCurrentX = 0;

    this.weather = null;
    this.timeOfDay = 'day';

    this.init();
  }

  init() {
    if (!this.canvas) return;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 2)
    );

    this.renderer.setSize(
      this.canvas.clientWidth || 960,
      this.canvas.clientHeight || 540,
      false
    );

    if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    this.scene = new THREE.Scene();

    this.scene.background = new THREE.Color(0x87b9d9);

    this.camera = new THREE.PerspectiveCamera(
      55,
      16 / 9,
      0.1,
      500
    );

    this.camera.position.set(0, 5.8, 11.5);
    this.camera.lookAt(0, 1.7, -25);

    this.clock = new THREE.Clock();

    this.setupLights();
    this.setupRoad();
    this.setupCity();
    this.setupPlayer();
    this.setupPools();

    this.ready = true;

    this.resize();
  }

  setupLights() {
    this.ambientLight = new THREE.HemisphereLight(
      0xb9d9ee,
      0x51483e,
      1.8
    );

    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(
      0xffffff,
      2.2
    );

    this.sunLight.position.set(
      -35,
      55,
      25
    );

    this.scene.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight(
      0xffd6a0,
      0.55
    );

    this.fillLight.position.set(
      30,
      15,
      -40
    );

    this.scene.add(this.fillLight);
  }

  setupRoad() {
    const roadGroup = new THREE.Group();
    roadGroup.name = 'KanoRoad';

    const roadGeometry = new THREE.PlaneGeometry(
      11,
      ROAD_LEN
    );

    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x343434,
      roughness: 0.96,
      metalness: 0,
    });

    this.road = new THREE.Mesh(
      roadGeometry,
      roadMaterial
    );

    this.road.rotation.x = -Math.PI / 2;
    this.road.position.set(0, 0, -ROAD_LEN / 2 + 10);

    roadGroup.add(this.road);

    const shoulderGeometry = new THREE.PlaneGeometry(
      3.8,
      ROAD_LEN
    );

    const shoulderMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b765d,
      roughness: 1,
    });

    const leftShoulder = new THREE.Mesh(
      shoulderGeometry,
      shoulderMaterial
    );

    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.set(
      -7.2,
      -0.015,
      -ROAD_LEN / 2 + 10
    );

    roadGroup.add(leftShoulder);

    const rightShoulder = leftShoulder.clone();

    rightShoulder.position.x = 7.2;

    roadGroup.add(rightShoulder);

    this.scene.add(roadGroup);

    this.roadMarkings = [];

    for (let lane = 0; lane < 2; lane += 1) {
      const x = lane === 0 ? -1.2 : 1.2;

      for (let i = 0; i < 18; i += 1) {
        const geometry = new THREE.PlaneGeometry(
          0.12,
          4.5
        );

        const material = new THREE.MeshBasicMaterial({
          color: 0xf1e7bd,
          transparent: true,
          opacity: 0.82,
          side: THREE.DoubleSide,
        });

        const marker = new THREE.Mesh(
          geometry,
          material
        );

        marker.rotation.x = -Math.PI / 2;

        marker.position.set(
          x,
          0.025,
          6 - i * 9
        );

        this.scene.add(marker);
        this.roadMarkings.push(marker);
      }
    }

    this.addRoadEdgeLines();
  }

  addRoadEdgeLines() {
    const geometry = new THREE.BoxGeometry(
      0.09,
      0.035,
      ROAD_LEN
    );

    const material = new THREE.MeshBasicMaterial({
      color: 0xe7d7a4,
    });

    const left = new THREE.Mesh(
      geometry,
      material
    );

    left.position.set(
      -5.25,
      0.025,
      -ROAD_LEN / 2 + 10
    );

    this.scene.add(left);

    const right = left.clone();

    right.position.x = 5.25;

    this.scene.add(right);
  }

  setupCity() {
    /*
     * Environment sprites are positioned as roadside scenery.
     * They are intentionally mixed with simple road geometry so the
     * scene still has depth instead of becoming a flat 2D game.
     */

    const group = new THREE.Group();
    group.name = 'KanoEnvironment';

    this.scene.add(group);

    this.environmentRoot = group;

    const positions = [
      [-9.0, -8, 0],
      [9.0, -12, 1],
      [-9.4, -20, 2],
      [9.3, -26, 3],
      [-9.1, -35, 4],
      [9.2, -43, 5],
      [-9.3, -53, 6],
      [9.2, -61, 7],
      [-9.4, -72, 8],
      [9.3, -81, 0],
      [-9.2, -92, 1],
      [9.4, -102, 2],
      [-9.1, -113, 3],
      [9.2, -124, 4],
      [-9.3, -136, 5],
      [9.3, -148, 6],
    ];

    positions.forEach((item, index) => {
      const [x, z, type] = item;

      const object = this.createEnvironmentSprite(
        pick(ENVIRONMENT_ASSETS, type),
        index
      );

      object.position.set(
        x,
        2.0,
        z
      );

      group.add(object);
      this.environmentPool.push(object);
    });

    this.addFarBackground();
  }

  addFarBackground() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 260),
      new THREE.MeshStandardMaterial({
        color: 0x8f8069,
        roughness: 1,
      })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.04, -80);

    this.scene.add(ground);

    const horizon = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 55),
      new THREE.MeshBasicMaterial({
        color: 0x6f8467,
      })
    );

    horizon.position.set(
      0,
      18,
      -105
    );

    this.scene.add(horizon);
  }

  setupPlayer() {
    this.playerRoot = new THREE.Group();
    this.playerRoot.name = 'PlayerKeke';

    this.scene.add(this.playerRoot);

    this.playerSprite = this.createSprite(
      ASSETS.player.normal,
      3.25,
      3.25,
      'player'
    );

    this.playerSprite.position.set(
      0,
      1.72,
      PLAYER_Z
    );

    this.playerRoot.add(this.playerSprite);

    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 32),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
      })
    );

    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.set(
      0,
      0.035,
      PLAYER_Z + 0.35
    );

    this.scene.add(this.playerShadow);
  }

  setupPools() {
    for (let i = 0; i < 14; i += 1) {
      const vehicle = this.createVehicle(i);
      this.scene.add(vehicle.root);
      this.vehiclePool.push(vehicle);
    }

    for (let i = 0; i < 10; i += 1) {
      const zone = this.createPassengerZone(i);
      this.scene.add(zone.root);
      this.zonePool.push(zone);
    }

    for (let i = 0; i < 12; i += 1) {
      const coin = this.createCoin(i);
      this.scene.add(coin.root);
      this.coinPool.push(coin);
    }

    for (let i = 0; i < 10; i += 1) {
      const person = this.createPerson(i);
      this.scene.add(person.root);
      this.peoplePool.push(person);
    }

    for (let i = 0; i < 6; i += 1) {
      const effect = this.createEffect(i);
      this.scene.add(effect.root);
      this.effectPool.push(effect);
    }
  }

  createTexture(path) {
    if (!path) return null;

    if (this.textures.has(path)) {
      return this.textures.get(path);
    }

    const texture = this.textureLoader.load(
      path,
      loaded => {
        if ('colorSpace' in loaded && THREE.SRGBColorSpace) {
          loaded.colorSpace = THREE.SRGBColorSpace;
        }

        loaded.minFilter = THREE.LinearMipmapLinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.generateMipmaps = true;

        if (
          this.renderer &&
          this.renderer.capabilities &&
          this.renderer.capabilities.getMaxAnisotropy
        ) {
          loaded.anisotropy = Math.min(
            this.renderer.capabilities.getMaxAnisotropy(),
            8
          );
        }

        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        /*
         * Asset failures are intentionally silent.
         * The renderer continues using its fallback material.
         */
      }
    );

    this.textures.set(path, texture);

    return texture;
  }

  createSprite(path, width, height, name = 'sprite') {
    const texture = this.createTexture(path);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);

    sprite.name = name;
    sprite.scale.set(width, height, 1);

    return sprite;
  }

  createEnvironmentSprite(path, index) {
    const group = new THREE.Group();

    const sprite = this.createSprite(
      path,
      5.5,
      5.5,
      `environment-${index}`
    );

    sprite.position.y = 2.5;

    group.add(sprite);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.18,
      })
    );

    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;

    group.add(shadow);

    group.userData.sprite = sprite;
    group.userData.shadow = shadow;

    return group;
  }

  createVehicle(index) {
    const root = new THREE.Group();

    root.visible = false;

    const sprite = this.createSprite(
      pick(TRAFFIC_ASSETS, index),
      2.8,
      2.8,
      `traffic-${index}`
    );

    sprite.position.y = 1.45;

    root.add(sprite);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.25,
      })
    );

    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;

    root.add(shadow);

    return {
      root,
      sprite,
      shadow,
      active: false,
      source: null,
      type: 'car',
      lane: 1,
      targetLane: 1,
      z: -100,
      speed: 0,
      bob: Math.random() * Math.PI * 2,
    };
  }

  createPassengerZone(index) {
    const root = new THREE.Group();

    root.visible = false;

    const person = this.createSprite(
      ASSETS.people.passenger,
      2.15,
      2.15,
      `passenger-zone-${index}`
    );

    person.position.y = 1.15;

    root.add(person);

    const marker = this.createSprite(
      ASSETS.effects.speedLines,
      1.7,
      1.7,
      `passenger-marker-${index}`
    );

    marker.position.y = 2.8;
    marker.material.opacity = 0.5;

    root.add(marker);

    return {
      root,
      person,
      marker,
      active: false,
      source: null,
      z: -100,
    };
  }

  createCoin(index) {
    const root = new THREE.Group();

    root.visible = false;

    const geometry = new THREE.CylinderGeometry(
      0.42,
      0.42,
      0.14,
      24
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0xf7c843,
      metalness: 0.65,
      roughness: 0.22,
    });

    const coin = new THREE.Mesh(
      geometry,
      material
    );

    coin.rotation.z = Math.PI / 2;
    coin.position.y = 1.2;

    root.add(coin);

    return {
      root,
      coin,
      active: false,
      source: null,
      z: -100,
      spin: Math.random() * Math.PI * 2,
    };
  }

  createPerson(index) {
    const root = new THREE.Group();

    root.visible = false;

    const sprite = this.createSprite(
      pick(PEOPLE_ASSETS, index),
      1.8,
      1.8,
      `pedestrian-${index}`
    );

    sprite.position.y = 1.0;

    root.add(sprite);

    return {
      root,
      sprite,
      active: false,
      z: -100,
      side: index % 2 === 0 ? -1 : 1,
      walk: Math.random() * Math.PI * 2,
    };
  }

  createEffect(index) {
    const root = new THREE.Group();

    root.visible = false;

    const sprite = this.createSprite(
      ASSETS.effects.dust,
      2.2,
      2.2,
      `effect-${index}`
    );

    sprite.position.y = 0.75;

    root.add(sprite);

    return {
      root,
      sprite,
      active: false,
      type: 'dust',
      life: 0,
      maxLife: 0.5,
    };
  }

  resetVehicle(vehicle) {
    vehicle.active = false;
    vehicle.root.visible = false;
    vehicle.source = null;
  }

  resetZone(zone) {
    zone.active = false;
    zone.root.visible = false;
    zone.source = null;
  }

  resetCoin(coin) {
    coin.active = false;
    coin.root.visible = false;
    coin.source = null;
  }

  resetPerson(person) {
    person.active = false;
    person.root.visible = false;
  }

  resetEffect(effect) {
    effect.active = false;
    effect.root.visible = false;
  }

  getVehicleAsset(source, index) {
    const value =
      source?.type ||
      source?.kind ||
      source?.vehicleType ||
      source?.vehicle ||
      source?.name ||
      '';

    const type = String(value).toLowerCase();

    if (
      type.includes('police') ||
      type.includes('polic')
    ) {
      return ASSETS.traffic.police;
    }

    if (
      type.includes('karota') ||
      type.includes('checkpoint') ||
      type.includes('enforcer')
    ) {
      return ASSETS.traffic.karota;
    }

    if (
      type.includes('bus')
    ) {
      return ASSETS.traffic.bus;
    }

    if (
      type.includes('truck') ||
      type.includes('lorry')
    ) {
      return ASSETS.traffic.truck;
    }

    if (
      type.includes('taxi')
    ) {
      return ASSETS.traffic.taxi;
    }

    if (
      type.includes('motor') ||
      type.includes('bike')
    ) {
      return ASSETS.traffic.motorcycle;
    }

    if (
      type.includes('keke') ||
      type.includes('tricycle') ||
      type.includes('sahu')
    ) {
      return index % 2 === 0
        ? ASSETS.traffic.kekeYellow
        : ASSETS.traffic.kekeBlue;
    }

    return ASSETS.traffic.car;
  }

  syncVehicle(vehicle, source, index, game) {
    if (!source) {
      this.resetVehicle(vehicle);
      return;
    }

    vehicle.active = true;
    vehicle.root.visible = true;
    vehicle.source = source;

    const lane = clamp(
      Math.round(
        number(
          source.lane,
          number(source.x, 0)
        )
      ),
      0,
      2
    );

    vehicle.lane = lane;

    const z = this.objectDepth(
      source,
      index,
      game
    );

    vehicle.z = z;

    vehicle.root.position.x =
      LANE_X[lane] + number(source.offsetX, 0);

    vehicle.root.position.y =
      number(source.height, 0);

    vehicle.root.position.z = z;

    const asset = this.getVehicleAsset(
      source,
      index
    );

    if (
      vehicle.sprite.material.map?.image?.src !==
      asset
    ) {
      vehicle.sprite.material.map =
        this.createTexture(asset);

      vehicle.sprite.material.needsUpdate = true;
    }

    const scale = this.vehicleScale(
      source,
      index
    );

    vehicle.sprite.scale.set(
      scale,
      scale,
      1
    );

    vehicle.sprite.position.y =
      scale * 0.48;

    vehicle.shadow.scale.set(
      scale / 2.8,
      scale / 2.8,
      1
    );

    vehicle.shadow.position.y = 0.035;

    const speed =
      number(source.speed, 0) ||
      number(game?.speed, 0);

    vehicle.bob +=
      0.08 +
      speed * 0.0002;

    vehicle.sprite.position.y +=
      Math.sin(vehicle.bob) * 0.025;

    vehicle.sprite.material.opacity = 1;
  }

  vehicleScale(source, index) {
    const type = String(
      source?.type ||
      source?.kind ||
      source?.vehicleType ||
      ''
    ).toLowerCase();

    if (type.includes('bus')) return 4.5;
    if (type.includes('truck')) return 4.2;
    if (type.includes('motor')) return 2.2;
    if (type.includes('keke')) return 3.2;
    if (type.includes('taxi')) return 3.1;
    if (type.includes('police')) return 3.3;
    if (type.includes('karota')) return 3.3;

    return index % 3 === 0 ? 3.3 : 3.0;
  }

  objectDepth(source, index, game) {
    if (
      source &&
      Number.isFinite(Number(source.z))
    ) {
      return number(source.z);
    }

    if (
      source &&
      Number.isFinite(Number(source.y))
    ) {
      const y = number(source.y);

      if (y >= 0 && y <= 700) {
        const normalized = y / 700;
        return 7 - normalized * 105;
      }

      if (y < 0) return y;
    }

    const roadOffset =
      number(game?.roadOff, 0) % ROAD_LEN;

    return (
      -18 -
      index * 11 +
      roadOffset
    );
  }

  syncPlayer(game) {
    if (!this.playerRoot) return;

    const lane =
      clamp(
        Math.round(
          number(game?.playerLane, this.playerLane)
        ),
        0,
        2
      );

    this.playerLane = lane;

    const target =
      Number.isFinite(Number(game?.playerX))
        ? this.gameXToWorld(game.playerX)
        : LANE_X[lane];

    this.playerTargetX =
      clamp(
        target,
        -3.0,
        3.0
      );

    this.playerCurrentX +=
      (
        this.playerTargetX -
        this.playerCurrentX
      ) * 0.18;

    this.playerRoot.position.x =
      this.playerCurrentX;

    this.playerRoot.position.z =
      PLAYER_Z;

    const damaged =
      Boolean(
        game?.invulnerable === false &&
        (
          game?.shake ||
          game?.collision
        )
      );

    let asset = ASSETS.player.normal;

    if (damaged) {
      asset = ASSETS.player.damaged;
    } else if (
      this.playerCurrentX -
      this.playerTargetX >
      0.12
    ) {
      asset = ASSETS.player.left;
    } else if (
      this.playerCurrentX -
      this.playerTargetX <
      -0.12
    ) {
      asset = ASSETS.player.right;
    }

    const currentMap =
      this.playerSprite.material.map;

    const currentPath =
      currentMap?.image?.src || '';

    if (!currentPath.endsWith(asset)) {
      this.playerSprite.material.map =
        this.createTexture(asset);

      this.playerSprite.material.needsUpdate = true;
    }

    const speed =
      number(game?.speed, 0);

    const bounce =
      Math.sin(
        performance.now() * 0.012 +
        speed * 0.02
      ) *
      (0.025 + speed * 0.0003);

    this.playerSprite.position.y =
      1.72 + bounce;

    this.playerSprite.rotation.z =
      clamp(
        (
          this.playerTargetX -
          this.playerCurrentX
        ) * -0.035,
        -0.08,
        0.08
      );

    this.playerShadow.position.x =
      this.playerCurrentX;

    const shadowScale =
      1 +
      clamp(speed / 150, 0, 0.4);

    this.playerShadow.scale.set(
      shadowScale,
      shadowScale,
      1
    );
  }

  gameXToWorld(value) {
    const x = number(value, 0);

    if (
      x >= -3.5 &&
      x <= 3.5
    ) {
      return x;
    }

    const canvasWidth =
      this.canvas?.clientWidth ||
      this.width ||
      960;

    const normalized =
      x / canvasWidth;

    return (
      (normalized - 0.5) *
      5
    );
  }

  syncTraffic(game) {
    const objects =
      Array.isArray(game?.obs)
        ? game.obs
        : [];

    for (let i = 0; i < this.vehiclePool.length; i += 1) {
      this.syncVehicle(
        this.vehiclePool[i],
        objects[i],
        i,
        game
      );
    }
  }

  syncPassengers(game) {
    const zones =
      Array.isArray(game?.paxZones)
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
        zones[i];

      if (!source) {
        this.resetZone(zone);
        continue;
      }

      zone.active = true;
      zone.root.visible = true;
      zone.source = source;

      const lane =
        clamp(
          Math.round(
            number(
              source.lane,
              number(source.x, 1)
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

      zone.root.position.y =
        number(source.height, 0);

      const waving =
        Math.sin(
          performance.now() * 0.008 +
          i
        );

      zone.marker.position.y =
        2.8 +
        waving * 0.08;

      zone.marker.material.opacity =
        0.35 +
        Math.abs(waving) * 0.25;
    }
  }

  syncCoins(game) {
    const coins =
      Array.isArray(game?.coins)
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

      if (!source) {
        this.resetCoin(item);
        continue;
      }

      item.active = true;
      item.root.visible = true;
      item.source = source;

      const lane =
        clamp(
          Math.round(
            number(source.lane, 1)
          ),
          0,
          2
        );

      item.root.position.x =
        LANE_X[lane] +
        number(source.offsetX, 0);

      item.root.position.z =
        this.objectDepth(
          source,
          i,
          game
        );

      item.coin.rotation.y +=
        0.055;

      item.coin.rotation.z =
        Math.PI / 2;

      item.coin.position.y =
        1.15 +
        Math.sin(
          performance.now() * 0.006 +
          i
        ) *
        0.15;
    }
  }

  syncPedestrians(game) {
    /*
     * Pedestrians are decorative unless the game already exposes
     * a pedestrian collection.
     */

    const pedestrians =
      Array.isArray(game?.pedestrians)
        ? game.pedestrians
        : [];

    for (
      let i = 0;
      i < this.peoplePool.length;
      i += 1
    ) {
      const person =
        this.peoplePool[i];

      const source =
        pedestrians[i];

      if (!source) {
        person.root.visible = false;
        person.active = false;
        continue;
      }

      person.active = true;
      person.root.visible = true;

      person.root.position.x =
        number(
          source.x,
          person.side * 7
        );

      person.root.position.z =
        number(
          source.z,
          this.objectDepth(
            source,
            i,
            game
          )
        );

      person.walk += 0.05;

      person.sprite.position.y =
        1 +
        Math.abs(
          Math.sin(person.walk)
        ) *
        0.08;
    }
  }

  animateRoad(game) {
    const offset =
      number(game?.roadOff, 0);

    this.roadMarkings.forEach(
      (marker, index) => {
        const base =
          6 -
          (index % 9) * 9;

        marker.position.z =
          base +
          (offset % 81);
      }
    );
  }

  updateCamera(game) {
    const speed =
      number(game?.speed, 0);

    const steering =
      this.playerTargetX -
      this.playerCurrentX;

    const targetX =
      this.playerCurrentX * 0.22;

    this.camera.position.x +=
      (
        targetX -
        this.camera.position.x
      ) * 0.06;

    this.camera.position.y =
      5.6 +
      clamp(speed / 250, 0, 0.6);

    this.camera.position.z =
      11.5 -
      clamp(speed / 250, 0, 1.2);

    this.camera.lookAt(
      this.playerCurrentX * 0.12,
      1.8,
      -25
    );

    this.camera.rotation.z =
      clamp(
        steering * -0.025,
        -0.04,
        0.04
      );
  }

  updateEnvironment(game) {
    const offset =
      number(game?.roadOff, 0);

    this.environmentPool.forEach(
      (object, index) => {
        const base =
          object.userData.baseZ;

        if (!Number.isFinite(base)) {
          object.userData.baseZ =
            object.position.z;
        }

        const z =
          object.userData.baseZ +
          (offset % 165);

        object.position.z =
          z > 20
            ? z - 165
            : z;

        const side =
          object.position.x < 0
            ? -1
            : 1;

        object.position.x =
          side *
          (
            8.2 +
            (index % 3) * 0.45
          );
      }
    );
  }

  updateWeather(game) {
    const weather =
      String(
        game?.weather ||
        ''
      ).toLowerCase();

    if (weather === this.weather) {
      return;
    }

    this.weather = weather;

    if (
      weather.includes('rain')
    ) {
      this.scene.background =
        new THREE.Color(0x66798b);

      this.ambientLight.intensity =
        1.2;

      this.sunLight.intensity =
        0.85;

      return;
    }

    if (
      weather.includes('dust') ||
      weather.includes('harmattan')
    ) {
      this.scene.background =
        new THREE.Color(0xbcae92);

      this.ambientLight.intensity =
        1.25;

      this.sunLight.intensity =
        1.2;

      return;
    }

    this.scene.background =
      new THREE.Color(0x87b9d9);

    this.ambientLight.intensity =
      1.8;

    this.sunLight.intensity =
      2.2;
  }

  updateTimeOfDay(game) {
    const value =
      String(
        game?.timeOfDay ||
        game?.time ||
        ''
      ).toLowerCase();

    if (value === this.timeOfDay) {
      return;
    }

    this.timeOfDay = value;

    if (
      value.includes('night')
    ) {
      this.scene.background =
        new THREE.Color(0x101b2d);

      this.ambientLight.intensity =
        0.75;

      this.sunLight.intensity =
        0.25;

      this.fillLight.intensity =
        0.8;

      return;
    }

    if (
      value.includes('dusk') ||
      value.includes('evening')
    ) {
      this.scene.background =
        new THREE.Color(0x8c6f63);

      this.ambientLight.intensity =
        1.1;

      this.sunLight.intensity =
        0.8;

      this.fillLight.intensity =
        1.1;

      return;
    }

    this.scene.background =
      new THREE.Color(0x87b9d9);

    this.ambientLight.intensity =
      1.8;

    this.sunLight.intensity =
      2.2;

    this.fillLight.intensity =
      0.55;
  }

  updateEffects(game) {
    const speed =
      number(game?.speed, 0);

    const active =
      speed > 60;

    for (
      let i = 0;
      i < this.effectPool.length;
      i += 1
    ) {
      const effect =
        this.effectPool[i];

      if (!active) {
        effect.root.visible = false;
        effect.active = false;
        continue;
      }

      if (
        i >=
        (
          this.quality === 'high'
            ? 4
            : 2
        )
      ) {
        effect.root.visible = false;
        continue;
      }

      effect.active = true;
      effect.root.visible = true;

      effect.type = 'dust';

      effect.root.position.set(
        this.playerCurrentX +
        (
          i % 2 === 0
            ? -0.8
            : 0.8
        ),
        0.1,
        PLAYER_Z + 1.0
      );

      effect.sprite.material.map =
        this.createTexture(
          ASSETS.effects.dust
        );

      effect.sprite.material.needsUpdate =
        true;

      effect.sprite.material.opacity =
        clamp(
          speed / 220,
          0.12,
          0.55
        );

      effect.sprite.scale.set(
        1.6 +
        speed * 0.004,
        1.6 +
        speed * 0.004,
        1
      );
    }
  }

  syncGame(game) {
    if (!game) return;

    this.syncPlayer(game);
    this.syncTraffic(game);
    this.syncPassengers(game);
    this.syncCoins(game);
    this.syncPedestrians(game);

    this.animateRoad(game);
    this.updateEnvironment(game);
    this.updateCamera(game);
    this.updateWeather(game);
    this.updateTimeOfDay(game);
    this.updateEffects(game);

    this.lastGame = game;
  }

  draw(game) {
    /*
     * Game currently calls:
     *
     * renderer3d.draw(this);
     * renderer3d.render(this);
     *
     * Therefore draw() only synchronizes objects.
     * Rendering itself happens once inside render().
     */
    if (!this.ready) return;

    this.syncGame(game);
  }

  render(game) {
    if (!this.ready || !this.renderer) {
      return;
    }

    if (game && game !== this.lastGame) {
      this.syncGame(game);
    }

    const now =
      performance.now();

    this.lastRenderTime = now;

    this.renderer.render(
      this.scene,
      this.camera
    );
  }

  resize() {
    if (!this.renderer || !this.camera) {
      return;
    }

    const width =
      this.canvas?.clientWidth ||
      this.canvas?.width ||
      960;

    const height =
      this.canvas?.clientHeight ||
      this.canvas?.height ||
      540;

    this.width = width;
    this.height = height;

    this.camera.aspect =
      width / Math.max(height, 1);

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(
      width,
      height,
      false
    );
  }

  applyQuality(value) {
    const quality =
      String(value || 'high')
        .toLowerCase();

    if (
      quality === 'low' ||
      quality === 'medium' ||
      quality === 'high'
    ) {
      this.quality = quality;
    }

    if (this.renderer) {
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
    }
  }

  applyPaint(paint) {
    /*
     * Player is an image asset, so paint selection must not destroy
     * the actual keke artwork.
     *
     * If a future paint system supplies a tint, apply it subtly.
     */
    if (
      !this.playerSprite ||
      !this.playerSprite.material
    ) {
      return;
    }

    if (
      paint &&
      typeof paint === 'object' &&
      paint.color
    ) {
      try {
        this.playerSprite.material.color.set(
          paint.color
        );
      } catch {
        this.playerSprite.material.color.set(
          0xffffff
        );
      }
    } else {
      this.playerSprite.material.color.set(
        0xffffff
      );
    }

    this.playerSprite.material.needsUpdate =
      true;
  }

  setWeather(weather) {
    this.weather =
      String(weather || '');

    this.updateWeather({
      weather: this.weather,
    });
  }

  setTimeOfDay(time) {
    this.timeOfDay =
      String(time || '');

    this.updateTimeOfDay({
      timeOfDay: this.timeOfDay,
    });
  }

  destroy() {
    if (this.renderer) {
      this.renderer.dispose();
    }

    this.textures.forEach(
      texture => {
        texture?.dispose?.();
      }
    );

    this.textures.clear();

    this.vehiclePool.length = 0;
    this.zonePool.length = 0;
    this.coinPool.length = 0;
    this.environmentPool.length = 0;
    this.peoplePool.length = 0;
    this.effectPool.length = 0;

    this.ready = false;
  }
}

export default Renderer3D;
```
