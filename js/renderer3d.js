import * as THREE from '../vendor/three.module.js';

const ROAD_WIDTH = 16;
const ROAD_LENGTH = 220;
const LANE_X = [-4.8, 0, 4.8];

const COLORS = {
  sky: 0x8fc7e8,
  ground: 0xb99a68,
  road: 0x34383c,
  roadEdge: 0x77736a,
  lane: 0xe7d9a8,
  keke: 0x159447,
  kekeRoof: 0x0e6e37,
  kekeInterior: 0x20272a,
  black: 0x17191b,
  white: 0xf4f0df,
  red: 0xb52c25,
  blue: 0x2867a8,
  yellow: 0xd5a928,
  brown: 0x795132,
  wall: 0xc9aa79,
  shop: 0xb97842,
  roof: 0x78432c,
  vegetation: 0x456b38
};

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;

    this.ready = false;
    this.failed = false;

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.world = null;
    this.road = null;
    this.player = null;
    this.playerBody = null;

    this.trafficGroup = null;
    this.environmentGroup = null;
    this.passengerGroup = null;
    this.effectGroup = null;

    this.trafficMeshes = [];
    this.passengerMeshes = [];
    this.environmentMeshes = [];

    this.roadMarks = [];

    this.lastTime = 0;
    this.worldDistance = 0;

    this.playerX = 0;
    this.playerTargetX = 0;

    this.playerSpeed = 0;
    this.playerLean = 0;

    this.weather = 'clear';

    this.paint = COLORS.keke;

    this.quality = 'high';

    this.tmpVector = new THREE.Vector3();
    this.tmpVector2 = new THREE.Vector3();

    this.init();
  }

  init() {
    if (!this.canvas) {
      this.failed = true;
      return;
    }

    try {
      this.scene = new THREE.Scene();

      this.scene.background =
        new THREE.Color(COLORS.sky);

      this.scene.fog =
        new THREE.Fog(
          COLORS.sky,
          70,
          250
        );

      const width =
        this.canvas.clientWidth ||
        this.canvas.width ||
        800;

      const height =
        this.canvas.clientHeight ||
        this.canvas.height ||
        500;

      this.camera =
        new THREE.PerspectiveCamera(
          58,
          width / Math.max(height, 1),
          0.1,
          500
        );

      this.camera.position.set(
        0,
        6.5,
        12
      );

      this.camera.lookAt(
        0,
        1.2,
        -35
      );

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

      this.renderer.shadowMap.enabled = true;

      this.renderer.shadowMap.type =
        THREE.PCFSoftShadowMap;

      if (
        'outputColorSpace' in
        this.renderer
      ) {
        this.renderer.outputColorSpace =
          THREE.SRGBColorSpace;
      }

      if (
        'toneMapping' in
        this.renderer
      ) {
        this.renderer.toneMapping =
          THREE.ACESFilmicToneMapping;

        this.renderer.toneMappingExposure =
          1.05;
      }

      this.createLights();
      this.createWorld();
      this.createRoad();
      this.createEnvironment();
      this.createPlayer();
      this.createTraffic();
      this.createPassengers();
      this.createEffects();

      this.resize();

      window.addEventListener(
        'resize',
        () => this.resize()
      );

      this.ready = true;

      this.render(0);
    } catch (error) {
      console.error(
        'Kano Run 3D renderer initialization failed:',
        error
      );

      this.failed = true;
      this.ready = false;
    }
  }

  createLights() {
    const ambient =
      new THREE.HemisphereLight(
        0xdbeeff,
        0x72563d,
        1.8
      );

    this.scene.add(ambient);

    const sun =
      new THREE.DirectionalLight(
        0xffe8bd,
        2.4
      );

    sun.position.set(
      -35,
      55,
      20
    );

    sun.castShadow = true;

    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;

    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;

    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 180;

    this.scene.add(sun);

    const fill =
      new THREE.DirectionalLight(
        0x9bc9ff,
        0.55
      );

    fill.position.set(
      40,
      20,
      50
    );

    this.scene.add(fill);
  }

  createWorld() {
    this.world =
      new THREE.Group();

    this.scene.add(this.world);

    const groundMaterial =
      new THREE.MeshStandardMaterial({
        color: COLORS.ground,
        roughness: 1
      });

    const ground =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          280,
          ROAD_LENGTH * 3
        ),
        groundMaterial
      );

    ground.rotation.x =
      -Math.PI / 2;

    ground.position.y = -0.05;
    ground.position.z = -ROAD_LENGTH;

    ground.receiveShadow = true;

    this.world.add(ground);
  }

  createRoad() {
    this.road =
      new THREE.Group();

    this.world.add(this.road);

    const roadMaterial =
      new THREE.MeshStandardMaterial({
        color: COLORS.road,
        roughness: 0.95
      });

    const road =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          ROAD_WIDTH,
          ROAD_LENGTH
        ),
        roadMaterial
      );

    road.rotation.x =
      -Math.PI / 2;

    road.position.set(
      0,
      0,
      -ROAD_LENGTH / 2
    );

    road.receiveShadow = true;

    this.road.add(road);

    this.createRoadShoulders();
    this.createLaneMarks();
    this.createRoadEdges();
  }

  createRoadShoulders() {
    const material =
      new THREE.MeshStandardMaterial({
        color: COLORS.roadEdge,
        roughness: 1
      });

    [-1, 1].forEach(side => {
      const shoulder =
        new THREE.Mesh(
          new THREE.PlaneGeometry(
            3.5,
            ROAD_LENGTH
          ),
          material
        );

      shoulder.rotation.x =
        -Math.PI / 2;

      shoulder.position.set(
        side *
          (ROAD_WIDTH / 2 + 1.75),
        0.005,
        -ROAD_LENGTH / 2
      );

      shoulder.receiveShadow = true;

      this.road.add(shoulder);
    });
  }

  createRoadEdges() {
    const material =
      new THREE.MeshStandardMaterial({
        color: COLORS.lane,
        roughness: 0.8
      });

    [-1, 1].forEach(side => {
      const edge =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.16,
            0.025,
            ROAD_LENGTH
          ),
          material
        );

      edge.position.set(
        side *
          (ROAD_WIDTH / 2 - 0.15),
        0.02,
        -ROAD_LENGTH / 2
      );

      this.road.add(edge);
    });
  }

  createLaneMarks() {
    const material =
      new THREE.MeshStandardMaterial({
        color: COLORS.lane,
        roughness: 0.8
      });

    const lanePositions = [
      -2.4,
      2.4
    ];

    lanePositions.forEach(x => {
      for (
        let z = -5;
        z > -ROAD_LENGTH;
        z -= 9
      ) {
        const mark =
          new THREE.Mesh(
            new THREE.BoxGeometry(
              0.13,
              0.025,
              4.2
            ),
            material
          );

        mark.position.set(
          x,
          0.035,
          z
        );

        this.road.add(mark);

        this.roadMarks.push(mark);
      }
    });
  }

  createPlayer() {
    this.player =
      new THREE.Group();

    this.player.position.set(
      0,
      0,
      5
    );

    this.world.add(this.player);

    this.playerBody =
      this.createKeke(
        this.paint,
        true
      );

    this.player.add(
      this.playerBody
    );
  }

  createKeke(color, player = false) {
    const group =
      new THREE.Group();

    const bodyMaterial =
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.05
      });

    const darkMaterial =
      new THREE.MeshStandardMaterial({
        color: COLORS.kekeInterior,
        roughness: 0.9
      });

    const blackMaterial =
      new THREE.MeshStandardMaterial({
        color: COLORS.black,
        roughness: 0.95
      });

    const glassMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x17252b,
        roughness: 0.25,
        metalness: 0.1,
        transparent: true,
        opacity: 0.82
      });

    const lowerBody =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.9,
          0.95,
          3.2
        ),
        bodyMaterial
      );

    lowerBody.position.y =
      1.05;

    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;

    group.add(lowerBody);

    const cabin =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.45,
          1.8,
          2.25
        ),
        darkMaterial
      );

    cabin.position.set(
      0,
      2.05,
      -0.15
    );

    cabin.castShadow = true;

    group.add(cabin);

    const roof =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.65,
          0.18,
          2.55
        ),
        bodyMaterial
      );

    roof.position.set(
      0,
      3.02,
      -0.15
    );

    roof.castShadow = true;

    group.add(roof);

    const frontGlass =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.0,
          0.85,
          0.06
        ),
        glassMaterial
      );

    frontGlass.position.set(
      0,
      2.32,
      -1.28
    );

    group.add(frontGlass);

    const rearGlass =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.0,
          0.85,
          0.06
        ),
        glassMaterial
      );

    rearGlass.position.set(
      0,
      2.32,
      0.98
    );

    group.add(rearGlass);

    this.addKekeSideBars(
      group,
      bodyMaterial
    );

    const frontWheel =
      this.createWheel();

    frontWheel.position.set(
      0,
      0.55,
      -1.35
    );

    frontWheel.rotation.y =
      Math.PI / 2;

    group.add(frontWheel);

    [-1, 1].forEach(side => {
      const rearWheel =
        this.createWheel();

      rearWheel.position.set(
        side * 1.15,
        0.55,
        0.85
      );

      rearWheel.rotation.z =
        Math.PI / 2;

      group.add(rearWheel);
    });

    const frontMudguard =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.25,
          0.15,
          0.55
        ),
        bodyMaterial
      );

    frontMudguard.position.set(
      0,
      0.9,
      -1.42
    );

    group.add(frontMudguard);

    const headlightMaterial =
      new THREE.MeshStandardMaterial({
        color: 0xfff4c7,
        emissive: 0xffd76a,
        emissiveIntensity: 1.8
      });

    const headlight =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.18,
          12,
          8
        ),
        headlightMaterial
      );

    headlight.position.set(
      0,
      1.28,
      -1.67
    );

    group.add(headlight);

    const bumper =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.8,
          0.14,
          0.18
        ),
        blackMaterial
      );

    bumper.position.set(
      0,
      0.7,
      -1.72
    );

    group.add(bumper);

    if (player) {
      this.createDriver(
        group
      );
    }

    return group;
  }

  createWheel() {
    const tireMaterial =
      new THREE.MeshStandardMaterial({
        color: COLORS.black,
        roughness: 1
      });

    const hubMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x9b9b94,
        roughness: 0.55,
        metalness: 0.5
      });

    const wheel =
      new THREE.Group();

    const tire =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.48,
          0.48,
          0.28,
          18
        ),
        tireMaterial
      );

    tire.rotation.z =
      Math.PI / 2;

    tire.castShadow = true;

    wheel.add(tire);

    const hub =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.19,
          0.19,
          0.31,
          12
        ),
        hubMaterial
      );

    hub.rotation.z =
      Math.PI / 2;

    wheel.add(hub);

    return wheel;
  }

  addKekeSideBars(
    group,
    material
  ) {
    [-1, 1].forEach(side => {
      const vertical =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.08,
            1.9,
            0.08
          ),
          material
        );

      vertical.position.set(
        side * 1.22,
        2.05,
        -0.45
      );

      group.add(vertical);

      const rearVertical =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.08,
            1.9,
            0.08
          ),
          material
        );

      rearVertical.position.set(
        side * 1.22,
        2.05,
        0.75
      );

      group.add(rearVertical);
    });
  }

  createDriver(group) {
    const clothes =
      new THREE.MeshStandardMaterial({
        color: 0x3b5870,
        roughness: 0.9
      });

    const skin =
      new THREE.MeshStandardMaterial({
        color: 0x70422d,
        roughness: 0.9
      });

    const torso =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.72,
          0.95,
          0.5
        ),
        clothes
      );

    torso.position.set(
      0,
      2.0,
      -0.7
    );

    group.add(torso);

    const head =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.31,
          16,
          12
        ),
        skin
      );

    head.position.set(
      0,
      2.75,
      -0.7
    );

    group.add(head);

    const cap =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.34,
          16,
          8,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        ),
        new THREE.MeshStandardMaterial({
          color: 0xeeeeee,
          roughness: 0.95
        })
      );

    cap.position.set(
      0,
      2.92,
      -0.7
    );

    group.add(cap);

    const armMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x3b5870,
        roughness: 0.9
      });

    [-1, 1].forEach(side => {
      const arm =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.11,
            0.11,
            0.85,
            10
          ),
          armMaterial
        );

      arm.rotation.z =
        side * 0.65;

      arm.position.set(
        side * 0.42,
        2.12,
        -1.08
      );

      group.add(arm);
    });
  }

  createTraffic() {
    this.trafficGroup =
      new THREE.Group();

    this.world.add(
      this.trafficGroup
    );

    const types = [
      {
        type: 'keke',
        color: COLORS.yellow
      },
      {
        type: 'keke',
        color: COLORS.blue
      },
      {
        type: 'car',
        color: COLORS.white
      },
      {
        type: 'car',
        color: COLORS.red
      },
      {
        type: 'taxi',
        color: COLORS.yellow
      },
      {
        type: 'bus',
        color: 0xc56b37
      },
      {
        type: 'truck',
        color: 0x5d6670
      },
      {
        type: 'motorcycle',
        color: 0x252525
      }
    ];

    for (
      let i = 0;
      i < 22;
      i++
    ) {
      const definition =
        types[
          i % types.length
        ];

      const vehicle =
        this.createTrafficVehicle(
          definition.type,
          definition.color
        );

      vehicle.position.set(
        LANE_X[
          i % LANE_X.length
        ],
        0,
        -18 -
          i * 13
      );

      vehicle.userData.speed =
        7 +
        (i % 5) * 1.4;

      vehicle.userData.baseZ =
        vehicle.position.z;

      vehicle.userData.lane =
        i %
        LANE_X.length;

      vehicle.userData.type =
        definition.type;

      this.trafficGroup.add(
        vehicle
      );

      this.trafficMeshes.push(
        vehicle
      );
    }
  }

  createTrafficVehicle(
    type,
    color
  ) {
    if (
      type === 'keke'
    ) {
      return this.createKeke(
        color,
        false
      );
    }

    if (
      type === 'motorcycle'
    ) {
      return this.createMotorcycle(
        color
      );
    }

    const group =
      new THREE.Group();

    const material =
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72
      });

    const dark =
      new THREE.MeshStandardMaterial({
        color: COLORS.black,
        roughness: 0.9
      });

    let width = 2.4;
    let height = 1.3;
    let length = 4.4;

    if (type === 'bus') {
      width = 3.0;
      height = 2.8;
      length = 7.5;
    }

    if (type === 'truck') {
      width = 3.0;
      height = 2.4;
      length = 6.2;
    }

    const body =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          width,
          height,
          length
        ),
        material
      );

    body.position.y =
      height / 2 + 0.3;

    body.castShadow = true;

    group.add(body);

    if (
      type === 'car' ||
      type === 'taxi'
    ) {
      const cabin =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            width * 0.8,
            1.05,
            length * 0.48
          ),
          new THREE.MeshStandardMaterial({
            color: 0x24333a,
            roughness: 0.3,
            metalness: 0.05
          })
        );

      cabin.position.set(
        0,
        height + 0.75,
        0.15
      );

      cabin.castShadow = true;

      group.add(cabin);
    }

    if (type === 'bus') {
      for (
        let i = -2;
        i <= 2;
        i++
      ) {
        const window =
          new THREE.Mesh(
            new THREE.BoxGeometry(
              0.62,
              0.72,
              0.05
            ),
            new THREE.MeshStandardMaterial({
              color: 0x273940,
              roughness: 0.25
            })
          );

        window.position.set(
          -width / 2 - 0.02,
          height + 0.3,
          i * 1.2
        );

        window.rotation.y =
          Math.PI / 2;

        group.add(window);
      }
    }

    const wheelPositions = [
      [-width / 2 + 0.25, 0.48, -length / 2 + 0.9],
      [width / 2 - 0.25, 0.48, -length / 2 + 0.9],
      [-width / 2 + 0.25, 0.48, length / 2 - 0.9],
      [width / 2 - 0.25, 0.48, length / 2 - 0.9]
    ];

    wheelPositions.forEach(
      position => {
        const wheel =
          new THREE.Mesh(
            new THREE.CylinderGeometry(
              0.45,
              0.45,
              0.25,
              12
            ),
            dark
          );

        wheel.rotation.z =
          Math.PI / 2;

        wheel.position.set(
          position[0],
          position[1],
          position[2]
        );

        group.add(wheel);
      }
    );

    return group;
  }

  createMotorcycle(color) {
    const group =
      new THREE.Group();

    const material =
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8
      });

    const black =
      new THREE.MeshStandardMaterial({
        color: COLORS.black,
        roughness: 1
      });

    const body =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.65,
          0.6,
          1.8
        ),
        material
      );

    body.position.y =
      0.8;

    group.add(body);

    [-0.65, 0.65].forEach(z => {
      const wheel =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.32,
            0.32,
            0.15,
            12
          ),
          black
        );

      wheel.rotation.z =
        Math.PI / 2;

      wheel.position.set(
        0,
        0.35,
        z
      );

      group.add(wheel);
    });

    const rider =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.27,
          12,
          10
        ),
        new THREE.MeshStandardMaterial({
          color: 0x71422d
        })
      );

    rider.position.set(
      0,
      1.45,
      0.1
    );

    group.add(rider);

    return group;
  }

  createEnvironment() {
    this.environmentGroup =
      new THREE.Group();

    this.world.add(
      this.environmentGroup
    );

    /*
     * Repeated Kano-style roadside blocks.
     * These are intentionally 3D geometry rather
     * than missing-image placeholders.
     */

    for (
      let i = 0;
      i < 34;
      i++
    ) {
      const side =
        i % 2 === 0
          ? -1
          : 1;

      const z =
        -8 -
        Math.floor(i / 2) * 10;

      const choice =
        i % 7;

      let object;

      if (choice === 0) {
        object =
          this.createShop();
      } else if (
        choice === 1
      ) {
        object =
          this.createHouse();
      } else if (
        choice === 2
      ) {
        object =
          this.createMarketStall();
      } else if (
        choice === 3
      ) {
        object =
          this.createWall();
      } else if (
        choice === 4
      ) {
        object =
          this.createStreetLight();
      } else if (
        choice === 5
      ) {
        object =
          this.createMosque();
      } else {
        object =
          this.createBillboard();
      }

      object.position.set(
        side *
          (ROAD_WIDTH / 2 +
            4 +
            (i % 3) * 1.5),
        0,
        z
      );

      object.rotation.y =
        side === 1
          ? -0.12
          : 0.12;

      this.environmentGroup.add(
        object
      );

      this.environmentMeshes.push(
        object
      );
    }

    for (
      let i = 0;
      i < 18;
      i++
    ) {
      const side =
        i % 2 === 0
          ? -1
          : 1;

      const pedestrian =
        this.createPedestrian(
          i % 3
        );

      pedestrian.position.set(
        side *
          (ROAD_WIDTH / 2 +
            2.5 +
            (i % 2) * 1.5),
        0,
        -12 -
          i * 18
      );

      this.environmentGroup.add(
        pedestrian
      );
    }
  }

  createShop() {
    const group =
      new THREE.Group();

    const wall =
      new THREE.MeshStandardMaterial({
        color: COLORS.shop,
        roughness: 1
      });

    const roofMaterial =
      new THREE.MeshStandardMaterial({
        color: COLORS.roof,
        roughness: 1
      });

    const building =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          5.5,
          3.8,
          5
        ),
        wall
      );

    building.position.y =
      1.9;

    building.castShadow = true;
    building.receiveShadow = true;

    group.add(building);

    const roof =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          5.9,
          0.25,
          5.4
        ),
        roofMaterial
      );

    roof.position.y =
      3.95;

    group.add(roof);

    const opening =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          2.6,
          1.8,
          0.08
        ),
        new THREE.MeshStandardMaterial({
          color: 0x29241e
        })
      );

    opening.position.set(
      0,
      1.05,
      -2.52
    );

    group.add(opening);

    const sign =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          4.4,
          0.55,
          0.08
        ),
        new THREE.MeshStandardMaterial({
          color: 0xe3c05b
        })
      );

    sign.position.set(
      0,
      3.25,
      -2.57
    );

    group.add(sign);

    return group;
  }

  createHouse() {
    const group =
      new THREE.Group();

    const wall =
      new THREE.MeshStandardMaterial({
        color: COLORS.wall,
        roughness: 1
      });

    const building =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          6,
          4,
          6
        ),
        wall
      );

    building.position.y =
      2;

    building.castShadow = true;

    group.add(building);

    const roof =
      new THREE.Mesh(
        new THREE.ConeGeometry(
          4.5,
          1.6,
          4
        ),
        new THREE.MeshStandardMaterial({
          color: 0x8b5b39,
          roughness: 1
        })
      );

    roof.rotation.y =
      Math.PI / 4;

    roof.position.y =
      4.7;

    group.add(roof);

    const door =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.1,
          2.2,
          0.08
        ),
        new THREE.MeshStandardMaterial({
          color: 0x4e3123
        })
      );

    door.position.set(
      0,
      1.1,
      -3.04
    );

    group.add(door);

    return group;
  }

  createMarketStall() {
    const group =
      new THREE.Group();

    const wood =
      new THREE.MeshStandardMaterial({
        color: 0x714b2d,
        roughness: 1
      });

    const canopy =
      new THREE.MeshStandardMaterial({
        color: 0xc44d32,
        roughness: 0.9
      });

    const table =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          4.2,
          0.8,
          2.2
        ),
        wood
      );

    table.position.y =
      0.8;

    table.castShadow = true;

    group.add(table);

    const roof =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          4.7,
          0.18,
          2.7
        ),
        canopy
      );

    roof.position.y =
      3.1;

    group.add(roof);

    [-1, 1].forEach(side => {
      const pole =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.07,
            0.07,
            3,
            8
          ),
          wood
        );

      pole.position.set(
        side * 2,
        1.55,
        0
      );

      group.add(pole);
    });

    return group;
  }

  createWall() {
    const group =
      new THREE.Group();

    const material =
      new THREE.MeshStandardMaterial({
        color: 0xb99a70,
        roughness: 1
      });

    const wall =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          8,
          2.8,
          1
        ),
        material
      );

    wall.position.y =
      1.4;

    wall.castShadow = true;

    group.add(wall);

    for (
      let i = -3;
      i <= 3;
      i++
    ) {
      const post =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.22,
            3.15,
            1.15
          ),
          material
        );

      post.position.set(
        i * 1.15,
        1.55,
        0
      );

      group.add(post);
    }

    return group;
  }

  createStreetLight() {
    const group =
      new THREE.Group();

    const poleMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x4a4a43,
        roughness: 0.8,
        metalness: 0.35
      });

    const pole =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.08,
          0.11,
          7,
          10
        ),
        poleMaterial
      );

    pole.position.y =
      3.5;

    group.add(pole);

    const arm =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.5,
          0.08,
          0.08
        ),
        poleMaterial
      );

    arm.position.set(
      0.65,
      6.7,
      0
    );

    group.add(arm);

    const lamp =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.16,
          10,
          8
        ),
        new THREE.MeshStandardMaterial({
          color: 0xffe9a1,
          emissive: 0xffc84d,
          emissiveIntensity: 1.5
        })
      );

    lamp.position.set(
      1.25,
      6.6,
      0
    );

    group.add(lamp);

    return group;
  }

  createMosque() {
    const group =
      new THREE.Group();

    const wall =
      new THREE.MeshStandardMaterial({
        color: 0xd8d0b9,
        roughness: 1
      });

    const domeMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x718d8e,
        roughness: 0.8
      });

    const building =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          7,
          4,
          6
        ),
        wall
      );

    building.position.y =
      2;

    building.castShadow = true;

    group.add(building);

    const dome =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          2.1,
          20,
          12,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        ),
        domeMaterial
      );

    dome.position.y =
      4;

    group.add(dome);

    const minaret =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.38,
          0.5,
          8,
          12
        ),
        wall
      );

    minaret.position.set(
      4,
      4,
      0
    );

    group.add(minaret);

    const cap =
      new THREE.Mesh(
        new THREE.ConeGeometry(
          0.58,
          1,
          12
        ),
        domeMaterial
      );

    cap.position.set(
      4,
      8.5,
      0
    );

    group.add(cap);

    return group;
  }

  createBillboard() {
    const group =
      new THREE.Group();

    const postMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x55544d
      });

    const post =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.25,
          4.5,
          0.25
        ),
        postMaterial
      );

    post.position.y =
      2.25;

    group.add(post);

    const board =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          5.5,
          2.5,
          0.15
        ),
        new THREE.MeshStandardMaterial({
          color: 0x1d5661,
          roughness: 0.8
        })
      );

    board.position.y =
      4.4;

    board.castShadow = true;

    group.add(board);

    return group;
  }

  createPedestrian(index = 0) {
    const group =
      new THREE.Group();

    const skinColors = [
      0x6f432e,
      0x845238,
      0x593724
    ];

    const skin =
      new THREE.MeshStandardMaterial({
        color:
          skinColors[
            index %
            skinColors.length
          ],
        roughness: 0.95
      });

    const clothes =
      new THREE.MeshStandardMaterial({
        color:
          index % 2 === 0
            ? 0x3e5870
            : 0x8a6244,
        roughness: 0.95
      });

    const body =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.24,
          0.32,
          1.15,
          8
        ),
        clothes
      );

    body.position.y =
      1.05;

    body.castShadow = true;

    group.add(body);

    const head =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.24,
          12,
          10
        ),
        skin
      );

    head.position.y =
      1.85;

    group.add(head);

    const legMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x2e3237,
        roughness: 1
      });

    [-1, 1].forEach(
      side => {
        const leg =
          new THREE.Mesh(
            new THREE.CylinderGeometry(
              0.08,
              0.09,
              0.75,
              8
            ),
            legMaterial
          );

        leg.position.set(
          side * 0.11,
          0.38,
          0
        );

        group.add(leg);
      }
    );

    group.userData.walkPhase =
      Math.random() * Math.PI * 2;

    return group;
  }

  createPassengers() {
    this.passengerGroup =
      new THREE.Group();

    this.world.add(
      this.passengerGroup
    );

    for (
      let i = 0;
      i < 14;
      i++
    ) {
      const passenger =
        this.createPedestrian(
          i % 3
        );

      passenger.position.set(
        i % 2 === 0
          ? -12
          : 12,
        0,
        -15 -
          i * 17
      );

      passenger.userData.destination =
        [
          'Sabon Gari',
          'Fagge',
          'Kofar Mata',
          'Tarauni',
          'Hotoro',
          'Naibawa',
          'Dala',
          'Zoo Road'
        ][
          i % 8
        ];

      passenger.userData.waiting =
        true;

      this.passengerGroup.add(
        passenger
      );

      this.passengerMeshes.push(
        passenger
      );
    }
  }

  createEffects() {
    this.effectGroup =
      new THREE.Group();

    this.world.add(
      this.effectGroup
    );

    for (
      let i = 0;
      i < 20;
      i++
    ) {
      const dust =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            0.06 +
              Math.random() * 0.1,
            6,
            6
          ),
          new THREE.MeshBasicMaterial({
            color: 0xb9a07b,
            transparent: true,
            opacity: 0.18
          })
        );

      dust.position.set(
        (Math.random() - 0.5) *
          ROAD_WIDTH,
        0.15 +
          Math.random() * 0.5,
        -Math.random() * 100
      );

      dust.userData.speed =
        0.02 +
        Math.random() * 0.04;

      this.effectGroup.add(
        dust
      );
    }
  }

  updatePlayer(game) {
    if (!this.player) {
      return;
    }

    const state =
      game?.state;

    const speed =
      Number(
        game?.speed ??
        game?.currentSpeed ??
        game?.velocity ??
        0
      ) || 0;

    this.playerSpeed =
      Math.max(
        0,
        Math.min(20, speed)
      );

    let lane =
      Number(
        game?.lane ??
        game?.playerLane ??
        game?.currentLane
      );

    if (!Number.isFinite(lane)) {
      lane = 1;
    }

    lane =
      Math.max(
        0,
        Math.min(
          LANE_X.length - 1,
          lane
        )
      );

    this.playerTargetX =
      LANE_X[lane];

    this.playerX +=
      (this.playerTargetX -
        this.playerX) *
      0.16;

    this.player.position.x =
      this.playerX;

    /*
     * Keep the player's keke at the
     * bottom of the road perspective.
     */
    this.player.position.z = 5;

    const leanTarget =
      this.playerTargetX -
      this.playerX;

    this.playerLean +=
      (leanTarget -
        this.playerLean) *
      0.15;

    this.player.rotation.z =
      -this.playerLean * 0.08;

    const bob =
      Math.sin(
        performance.now() * 0.012
      ) *
      Math.min(
        0.035,
        this.playerSpeed * 0.004
      );

    this.player.position.y =
      bob;

    if (this.playerBody) {
      this.playerBody.rotation.y =
        -this.playerLean * 0.03;
    }

    /*
     * If the game exposes a paint color,
     * apply it without requiring a reload.
     */
    if (game?.paint) {
      this.applyPaint(
        game.paint
      );
    }

    /*
     * Keep camera following the player.
     */
    const cameraX =
      this.playerX * 0.34;

    this.camera.position.x +=
      (cameraX -
        this.camera.position.x) *
      0.06;

    this.camera.position.y =
      6.5 +
      Math.min(
        1.5,
        this.playerSpeed * 0.05
      );

    this.camera.position.z =
      12;

    this.camera.lookAt(
      this.playerX * 0.2,
      1.15,
      -38
    );

    /*
     * Some game implementations expose
     * distance rather than speed.
     */
    const distance =
      Number(
        game?.dist ??
        game?.distance ??
        0
      );

    if (
      Number.isFinite(distance)
    ) {
      this.worldDistance =
        distance;
    }

    void state;
  }

  updateTraffic(delta) {
    if (!this.trafficMeshes.length) {
      return;
    }

    const movement =
      Math.max(
        0.02,
        delta
      );

    this.trafficMeshes.forEach(
      vehicle => {
        const speed =
          Number(
            vehicle.userData.speed
          ) || 8;

        vehicle.position.z +=
          speed *
          movement *
          0.45;

        /*
         * Vehicles that pass the camera
         * recycle far ahead.
         */
        if (
          vehicle.position.z >
          25
        ) {
          vehicle.position.z =
            -170 -
            Math.random() * 55;

          const lane =
            Math.floor(
              Math.random() *
              LANE_X.length
            );

          vehicle.position.x =
            LANE_X[lane];

          vehicle.userData.lane =
            lane;
        }

        /*
         * Very small suspension motion.
         */
        vehicle.position.y =
          Math.sin(
            performance.now() *
              0.006 +
              vehicle.id
          ) *
          0.018;
      }
    );
  }

  updateEnvironment(delta) {
    const speedFactor =
      1 +
      this.playerSpeed *
      0.035;

    this.environmentMeshes.forEach(
      object => {
        object.position.z +=
          delta *
          0.8 *
          speedFactor;

        if (
          object.position.z >
          25
        ) {
          object.position.z =
            -230 -
            Math.random() * 70;
        }
      }
    );

    this.passengerMeshes.forEach(
      passenger => {
        passenger.position.z +=
          delta *
          0.8 *
          speedFactor;

        if (
          passenger.position.z >
          24
        ) {
          passenger.position.z =
            -220 -
            Math.random() * 60;

          passenger.userData.waiting =
            true;
        }

        const phase =
          passenger.userData.walkPhase ||
          0;

        passenger.userData.walkPhase =
          phase +
          delta * 4;

        passenger.rotation.y =
          Math.sin(
            passenger.userData.walkPhase
          ) *
          0.12;
      }
    );
  }

  updateEffects(delta) {
    if (!this.effectGroup) {
      return;
    }

    this.effectGroup.children.forEach(
      dust => {
        dust.position.z +=
          delta *
          (1.5 +
            this.playerSpeed *
              0.4);

        dust.position.x +=
          Math.sin(
            performance.now() *
              0.001 +
              dust.id
          ) *
          0.002;

        if (
          dust.position.z >
          15
        ) {
          dust.position.z =
            -100 -
            Math.random() * 80;
        }
      }
    );
  }

  update(delta = 0.016) {
    if (!this.ready) {
      return;
    }

    const safeDelta =
      Math.min(
        Math.max(
          Number(delta) || 0.016,
          0.001
        ),
        0.05
      );

    this.updatePlayer(
      this.game
    );

    this.updateTraffic(
      safeDelta
    );

    this.updateEnvironment(
      safeDelta
    );

    this.updateEffects(
      safeDelta
    );

    this.updateRoad(
      safeDelta
    );
  }

  updateRoad(delta) {
    const movement =
      delta *
      (0.7 +
        this.playerSpeed *
          0.15);

    this.roadMarks.forEach(
      mark => {
        mark.position.z +=
          movement;

        if (
          mark.position.z >
          12
        ) {
          mark.position.z -=
            ROAD_LENGTH;
        }
      }
    );
  }

  resize() {
    if (
      !this.renderer ||
      !this.camera
    ) {
      return;
    }

    const width =
      this.canvas.clientWidth ||
      this.canvas.width ||
      800;

    const height =
      this.canvas.clientHeight ||
      this.canvas.height ||
      500;

    this.camera.aspect =
      width /
      Math.max(height, 1);

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(
      width,
      height,
      false
    );
  }

  applyPaint(value) {
    if (!this.playerBody) {
      return;
    }

    let color =
      value;

    if (
      typeof value === 'string'
    ) {
      const normalized =
        value.toLowerCase();

      const map = {
        green: COLORS.keke,
        yellow: COLORS.yellow,
        blue: COLORS.blue,
        red: COLORS.red,
        black: COLORS.black,
        white: COLORS.white,
        orange: 0xd26a32,
        gold: 0xb88b27
      };

      color =
        map[normalized] ??
        value;
    }

    if (
      typeof color !== 'number'
    ) {
      return;
    }

    this.playerBody.traverse(
      object => {
        if (
          object.isMesh &&
          object.material &&
          object.material.color
        ) {
          /*
           * Only recolor the primary body.
           * Dark/glass materials stay intact.
           */
          const current =
            object.material.color.getHex();

          if (
            current ===
              COLORS.keke ||
            current ===
              this.paint
          ) {
            object.material.color.setHex(
              color
            );
          }
        }
      }
    );

    this.paint =
      color;
  }

  applyQuality(level = 'high') {
    this.quality =
      level;

    if (!this.renderer) {
      return;
    }

    let pixelRatio = 1.5;

    if (level === 'low') {
      pixelRatio = 1;
      this.renderer.shadowMap.enabled =
        false;
    } else if (
      level === 'medium'
    ) {
      pixelRatio = 1.25;
      this.renderer.shadowMap.enabled =
        true;
    } else {
      pixelRatio = 2;
      this.renderer.shadowMap.enabled =
        true;
    }

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        pixelRatio
      )
    );

    this.resize();
  }

  draw(game = this.game) {
    if (!this.ready) {
      return;
    }

    this.game =
      game || this.game;

    this.update(
      0.016
    );

    this.render(
      performance.now()
    );
  }

  render(time = 0) {
    if (
      !this.renderer ||
      !this.scene ||
      !this.camera
    ) {
      return;
    }

    const delta =
      this.lastTime
        ? Math.min(
            0.05,
            (time -
              this.lastTime) /
              1000
          )
        : 0.016;

    this.lastTime =
      time;

    this.update(
      delta
    );

    this.renderer.render(
      this.scene,
      this.camera
    );
  }

  /*
   * Compatibility method for game loops that
   * call renderer3d.update/render separately.
   */
  renderFrame(
    time = performance.now()
  ) {
    this.render(time);
  }

  /*
   * Allows the game to force a particular
   * weather appearance without replacing the
   * actual 3D scene.
   */
  setWeather(weather = 'clear') {
    this.weather =
      weather;

    if (!this.scene) {
      return;
    }

    if (
      weather === 'dust' ||
      weather === 'hazy'
    ) {
      this.scene.background =
        new THREE.Color(
          0xb8a786
        );

      this.scene.fog =
        new THREE.Fog(
          0xb8a786,
          45,
          190
        );
    } else if (
      weather === 'rain'
    ) {
      this.scene.background =
        new THREE.Color(
          0x607789
        );

      this.scene.fog =
        new THREE.Fog(
          0x607789,
          40,
          180
        );
    } else {
      this.scene.background =
        new THREE.Color(
          COLORS.sky
        );

      this.scene.fog =
        new THREE.Fog(
          COLORS.sky,
          70,
          250
        );
    }
  }

  dispose() {
    if (!this.scene) {
      return;
    }

    this.scene.traverse(
      object => {
        if (
          object.geometry
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

          materials.forEach(
            material => {
              material.dispose?.();
            }
          );
        }
      }
    );

    try {
      this.renderer?.dispose();
    } catch {}

    this.trafficMeshes =
      [];

    this.passengerMeshes =
      [];

    this.environmentMeshes =
      [];

    this.roadMarks =
      [];

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.player = null;
    this.playerBody = null;

    this.ready = false;
  }
}

export default Renderer3D;