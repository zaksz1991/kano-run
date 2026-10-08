import * as THREE from '../vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];
const ROAD_LEN = 120;
const PLAYER_Z = 5.5;

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.ready = false;

    this.pools = {};
    this.zonePool = [];
    this.coinPool = [];

    this.lastCamPx = 0;
    this.lastPlayerX = 0;
    this.trafficVisuals = new WeakMap();

    this.init();
  }

  init() {
    const w = this.canvas.clientWidth || 390;
    const h = this.canvas.clientHeight || 700;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.75)
    );

    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x8fc9e8, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9bcde3, 34, 110);

    this.camera = new THREE.PerspectiveCamera(
      58,
      w / h,
      0.1,
      180
    );

    this.camera.position.set(0, 4.6, -5.2);
    this.camera.lookAt(0, 0.8, 15);

    this.scene.add(
      new THREE.AmbientLight(0xb8c9d8, 0.65)
    );

    this.sun = new THREE.DirectionalLight(0xffedc4, 1.35);
    this.sun.position.set(12, 24, 10);
    this.scene.add(this.sun);

    this.hemlight = new THREE.HemisphereLight(
      0x9bc7ff,
      0x554332,
      0.55
    );
    this.scene.add(this.hemlight);

    this.buildRoad();
    this.buildCityscape();

    this.player = this.makeKeke(0xfbbf24, true);
    this.player.position.set(0, 0, PLAYER_Z);
    this.scene.add(this.player);

    /*
     * Larger pools prevent active gameplay traffic from disappearing
     * when many vehicles are simultaneously visible.
     */
    const poolSizes = {
      car: 14,
      keke: 8,
      bus: 4,
      truck: 3,
      taxi: 5,
      motorcycle: 7,
      police: 3,
      karota: 3
    };

    for (const [type, count] of Object.entries(poolSizes)) {
      this.pools[type] = [];

      for (let i = 0; i < count; i++) {
        let vehicle;

        if (type === 'car') {
          const colors = [
            0xdc2626,
            0x2563eb,
            0xf8fafc,
            0x1e293b,
            0x64748b,
            0x16a34a,
            0xd97706
          ];

          vehicle = this.makeCar(
            colors[i % colors.length]
          );
        } else if (type === 'keke') {
          const colors = [
            0xeab308,
            0xfacc15,
            0x16a34a,
            0x2563eb,
            0xdc2626
          ];

          vehicle = this.makeKeke(
            colors[i % colors.length],
            false
          );
        } else if (type === 'bus') {
          const colors = [
            0x2563eb,
            0xdc2626,
            0x16a34a,
            0x7c3aed
          ];

          vehicle = this.makeBus(
            colors[i % colors.length]
          );
        } else if (type === 'truck') {
          const colors = [
            0xdc2626,
            0xf59e0b,
            0x2563eb
          ];

          vehicle = this.makeTruck(
            colors[i % colors.length]
          );
        } else if (type === 'taxi') {
          vehicle = this.makeTaxi();
        } else if (type === 'motorcycle') {
          const colors = [
            0xef4444,
            0x2563eb,
            0x1e293b,
            0x16a34a
          ];

          vehicle = this.makeMotorcycle(
            colors[i % colors.length]
          );
        } else if (type === 'police') {
          vehicle = this.makeEnforcer('police');
        } else if (type === 'karota') {
          vehicle = this.makeEnforcer('karota');
        }

        if (!vehicle) continue;

        vehicle.visible = false;
        this.scene.add(vehicle);
        this.pools[type].push(vehicle);
      }
    }

    for (let i = 0; i < 14; i++) {
      const z = this.makeZone(0x4ade80);
      z.visible = false;
      this.scene.add(z);
      this.zonePool.push(z);
    }

    for (let i = 0; i < 16; i++) {
      const c = this.makeCoin();
      c.visible = false;
      this.scene.add(c);
      this.coinPool.push(c);
    }

    this.initParticles();

    this.weather = 'clear';
    this.weatherTimer = 0;

    try {
      const lq = JSON.parse(
        localStorage.getItem('kanoLQ') || 'false'
      );

      if (lq) {
        this.applyQuality(true);
      }
    } catch {}

    this.ready = true;
  }

  initParticles() {
    this.dustGeo = new THREE.BufferGeometry();

    const dustCount = 110;
    const dustPos = new Float32Array(
      dustCount * 3
    );

    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] =
        (Math.random() - 0.5) * 11;

      dustPos[i * 3 + 1] =
        0.08 + Math.random() * 2.0;

      dustPos[i * 3 + 2] =
        Math.random() * 55 + 2;
    }

    this.dustGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(dustPos, 3)
    );

    this.dustMat = new THREE.PointsMaterial({
      color: 0xc4b5a0,
      size: 0.11,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });

    this.dust = new THREE.Points(
      this.dustGeo,
      this.dustMat
    );

    this.scene.add(this.dust);

    this.rainGeo = new THREE.BufferGeometry();

    const rainCount = 500;
    const rainPos = new Float32Array(
      rainCount * 3
    );

    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] =
        (Math.random() - 0.5) * 16;

      rainPos[i * 3 + 1] =
        Math.random() * 14;

      rainPos[i * 3 + 2] =
        Math.random() * 55;
    }

    this.rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(rainPos, 3)
    );

    this.rainMat = new THREE.PointsMaterial({
      color: 0xb9d7ed,
      size: 0.075,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });

    this.rain = new THREE.Points(
      this.rainGeo,
      this.rainMat
    );

    this.scene.add(this.rain);

    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.3
      })
    );

    this.playerShadow.rotation.x =
      -Math.PI / 2;

    this.playerShadow.position.y = 0.025;

    this.scene.add(this.playerShadow);
  }

  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.55,
      metalness: opts.metalness ?? 0.15,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity:
        opts.emissiveIntensity ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1
    });
  }

  buildRoad() {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(
        9.5,
        ROAD_LEN
      ),
      this.mat(0x252b34, {
        roughness: 0.95,
        metalness: 0.03
      })
    );

    road.rotation.x = -Math.PI / 2;
    road.position.set(
      0,
      0,
      ROAD_LEN / 2 - 4
    );

    this.scene.add(road);

    const centerWear = new THREE.Mesh(
      new THREE.PlaneGeometry(
        4.8,
        ROAD_LEN
      ),
      this.mat(0x20262f, {
        roughness: 0.98,
        metalness: 0
      })
    );

    centerWear.rotation.x = -Math.PI / 2;
    centerWear.position.set(
      0,
      0.006,
      ROAD_LEN / 2 - 4
    );

    this.scene.add(centerWear);

    /*
     * Subtle road strips create depth without expensive
     * texture maps.
     */
    const wearMat = new THREE.MeshBasicMaterial({
      color: 0x303640,
      transparent: true,
      opacity: 0.38
    });

    for (let i = 0; i < 24; i++) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(
          0.18 + Math.random() * 0.5,
          1.2 + Math.random() * 2.8
        ),
        wearMat
      );

      strip.rotation.x = -Math.PI / 2;

      strip.position.set(
        (Math.random() - 0.5) * 7.8,
        0.012,
        i * 5.2 + Math.random() * 3
      );

      this.scene.add(strip);
    }

    /*
     * Curbs.
     */
    for (const sx of [-4.75, 4.75]) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.3,
          0.18,
          ROAD_LEN
        ),
        this.mat(0x9ca3af, {
          roughness: 0.82
        })
      );

      curb.position.set(
        sx,
        0.09,
        ROAD_LEN / 2 - 4
      );

      this.scene.add(curb);

      const curbDark = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.32,
          0.035,
          ROAD_LEN
        ),
        this.mat(0x52525b, {
          roughness: 0.9
        })
      );

      curbDark.position.set(
        sx,
        0.19,
        ROAD_LEN / 2 - 4
      );

      this.scene.add(curbDark);
    }

    /*
     * Dusty shoulders.
     */
    for (const sx of [-5.7, 5.7]) {
      const shoulder = new THREE.Mesh(
        new THREE.PlaneGeometry(
          2.3,
          ROAD_LEN
        ),
        this.mat(0x8a7357, {
          roughness: 1
        })
      );

      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(
        sx,
        0.01,
        ROAD_LEN / 2 - 4
      );

      this.scene.add(shoulder);

      /*
       * Outer drainage strip.
       */
      const drain = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.34,
          0.08,
          ROAD_LEN
        ),
        this.mat(0x4b5563, {
          roughness: 0.95
        })
      );

      drain.position.set(
        sx > 0 ? 6.75 : -6.75,
        0.04,
        ROAD_LEN / 2 - 4
      );

      this.scene.add(drain);
    }

    /*
     * Yellow road edge lines.
     */
    const edgeMat =
      new THREE.MeshBasicMaterial({
        color: 0xfacc15
      });

    for (const lx of [-4.45, 4.45]) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(
          0.11,
          ROAD_LEN
        ),
        edgeMat
      );

      line.rotation.x = -Math.PI / 2;
      line.position.set(
        lx,
        0.024,
        ROAD_LEN / 2 - 4
      );

      this.scene.add(line);
    }

    /*
     * Dashed lane dividers.
     */
    this.laneMarks = new THREE.Group();

    const dashMat =
      new THREE.MeshBasicMaterial({
        color: 0xe5e7eb
      });

    for (let z = 0; z < ROAD_LEN; z += 3.5) {
      for (const lx of [-1.2, 1.2]) {
        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(
            0.11,
            1.7
          ),
          dashMat
        );

        dash.rotation.x = -Math.PI / 2;
        dash.position.set(
          lx,
          0.028,
          z
        );

        this.laneMarks.add(dash);
      }
    }

    this.scene.add(this.laneMarks);

    /*
     * Small roadside stones / dirt blocks.
     */
    const dirtMat = this.mat(
      0x66513e,
      { roughness: 1 }
    );

    for (let i = 0; i < 42; i++) {
      const side = i % 2 === 0 ? -1 : 1;

      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.08 + Math.random() * 0.18,
          0.04 + Math.random() * 0.08,
          0.08 + Math.random() * 0.22
        ),
        dirtMat
      );

      stone.position.set(
        side * (5.0 + Math.random() * 1.7),
        0.035,
        Math.random() * ROAD_LEN
      );

      this.scene.add(stone);
    }
  }

  buildCityscape() {
    this.buildings = new THREE.Group();

    const colors = [
      0xc5b7a3,
      0xd6c7ae,
      0xb7a890,
      0x9c8b74,
      0xcbd5c0,
      0xa7a08f,
      0x8d806c,
      0xd1bfa4
    ];

    const types = [
      'house',
      'shop',
      'compound',
      'market',
      'house',
      'mosque',
      'shop',
      'petrol',
      'house',
      'busstop',
      'shop',
      'compound',
      'market',
      'house',
      'shop',
      'mosque',
      'house',
      'petrol',
      'school',
      'compound',
      'shop',
      'market',
      'house',
      'mosque',
      'shop',
      'house',
      'compound',
      'market'
    ];

    for (const side of [-1, 1]) {
      for (let i = 0; i < types.length; i++) {
        const z =
          i * 4.7 +
          (side > 0 ? 2.1 : 0);

        const xBase =
          side *
          (7.0 + (i % 4) * 0.42);

        const kind = types[i];

        if (kind === 'mosque') {
          this.addMosque(
            xBase,
            z,
            side
          );
        } else if (kind === 'market') {
          this.addMarketStall(
            xBase,
            z,
            side
          );
        } else if (kind === 'petrol') {
          this.addPetrol(
            xBase,
            z,
            side
          );
        } else if (kind === 'busstop') {
          this.addBusStop(
            xBase,
            z,
            side
          );
        } else if (kind === 'school') {
          this.addSchool(
            xBase,
            z,
            side
          );
        } else if (kind === 'shop') {
          this.addShop(
            xBase,
            z,
            side,
            colors[i % colors.length]
          );
        } else if (kind === 'compound') {
          this.addCompound(
            xBase,
            z,
            side,
            colors[i % colors.length]
          );
        } else {
          this.addHouse(
            xBase,
            z,
            side,
            colors[i % colors.length]
          );
        }

        if (i % 2 === 0) {
          this.addStreetLight(
            side * 5.2,
            z + 1.5
          );
        }

        if (i % 3 === 1) {
          this.addUtilityPole(
            side * 5.9,
            z + 1.2
          );
        }

        if (i % 4 === 1) {
          this.addBillboard(
            side * 5.45,
            z + 2.7
          );
        }
      }
    }

    /*
     * More roadside pedestrians.
     */
    for (let i = 0; i < 24; i++) {
      const side =
        i % 2 === 0 ? -1 : 1;

      this.addPedestrian(
        side * (5.0 + Math.random() * 0.65),
        i * 5.4 + 3
      );
    }

    this.scene.add(this.buildings);

    /*
     * Large background skyline.
     */
    this.backgroundBuildings =
      new THREE.Group();

    for (let side of [-1, 1]) {
      for (let i = 0; i < 18; i++) {
        const h =
          3.5 +
          Math.random() * 7;

        const building = new THREE.Mesh(
          new THREE.BoxGeometry(
            2.5 + Math.random() * 2.2,
            h,
            2.5 + Math.random() * 2
          ),
          this.mat(
            colors[i % colors.length],
            { roughness: 0.96 }
          )
        );

        building.position.set(
          side *
            (11.5 + Math.random() * 6),
          h / 2,
          i * 7 + Math.random() * 5
        );

        this.backgroundBuildings.add(
          building
        );
      }
    }

    this.scene.add(
      this.backgroundBuildings
    );

    /*
     * Sky dome.
     */
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(
        105,
        20,
        14,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ),
      new THREE.MeshBasicMaterial({
        color: 0x75bde2,
        side: THREE.BackSide
      })
    );

    this.sky.position.y = -3;

    this.scene.add(this.sky);
  }

  addHouse(x, z, side, color) {
    const bw =
      1.8 + Math.random() * 1.5;

    const bh =
      2.1 + Math.random() * 2.4;

    const bd =
      1.7 + Math.random() * 1.4;

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw,
        bh,
        bd
      ),
      this.mat(color, {
        roughness: 0.9
      })
    );

    wall.position.set(
      x,
      bh / 2,
      z
    );

    this.buildings.add(wall);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw + 0.22,
        0.15,
        bd + 0.22
      ),
      this.mat(0x66584b, {
        roughness: 0.95
      })
    );

    roof.position.set(
      x,
      bh + 0.08,
      z
    );

    this.buildings.add(roof);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.38,
        0.78,
        0.08
      ),
      this.mat(0x332820, {
        roughness: 0.85
      })
    );

    door.position.set(
      x,
      0.39,
      z +
        (side > 0
          ? -bd / 2 - 0.045
          : bd / 2 + 0.045)
    );

    this.buildings.add(door);

    const windowMat = this.mat(
      0x38556c,
      {
        roughness: 0.2,
        metalness: 0.25
      }
    );

    for (const wx of [-0.45, 0.45]) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.32,
          0.32,
          0.06
        ),
        windowMat
      );

      window.position.set(
        x + wx,
        bh * 0.58,
        z +
          (side > 0
            ? -bd / 2 - 0.035
            : bd / 2 + 0.035)
      );

      this.buildings.add(window);
    }
  }

  addCompound(x, z, side, color) {
    const bw = 3.4;
    const bh = 2.4;
    const bd = 2.7;

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw,
        bh,
        bd
      ),
      this.mat(color, {
        roughness: 0.92
      })
    );

    wall.position.set(
      x,
      bh / 2,
      z
    );

    this.buildings.add(wall);

    const perimeter = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw + 0.25,
        0.85,
        0.14
      ),
      this.mat(0x756b5b, {
        roughness: 0.95
      })
    );

    perimeter.position.set(
      x,
      0.43,
      z +
        (side > 0
          ? -bd / 2 - 0.1
          : bd / 2 + 0.1)
    );

    this.buildings.add(
      perimeter
    );

    const gate = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.8,
        1.1,
        0.08
      ),
      this.mat(0x374151, {
        roughness: 0.7,
        metalness: 0.25
      })
    );

    gate.position.set(
      x,
      0.55,
      z +
        (side > 0
          ? -bd / 2 - 0.16
          : bd / 2 + 0.16)
    );

    this.buildings.add(gate);
  }

  addShop(x, z, side, color) {
    const bw = 2.2;
    const bh = 2.45;
    const bd = 1.75;

    const shop = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw,
        bh,
        bd
      ),
      this.mat(
        color || 0xb45309,
        { roughness: 0.84 }
      )
    );

    shop.position.set(
      x,
      bh / 2,
      z
    );

    this.buildings.add(shop);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw + 0.35,
        0.1,
        0.72
      ),
      this.mat(0xdc2626, {
        roughness: 0.7
      })
    );

    awning.position.set(
      x,
      bh * 0.72,
      z +
        (side > 0 ? -0.95 : 0.95)
    );

    this.buildings.add(awning);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw * 0.85,
        0.38,
        0.08
      ),
      this.mat(0xfbbf24, {
        roughness: 0.45,
        emissive: 0xb45309,
        emissiveIntensity: 0.18
      })
    );

    sign.position.set(
      x,
      bh * 0.91,
      z +
        (side > 0
          ? -bd / 2 - 0.06
          : bd / 2 + 0.06)
    );

    this.buildings.add(sign);

    for (let i = -1; i <= 1; i++) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.28,
          0.28,
          0.28
        ),
        this.mat(
          [0x16a34a, 0xef4444, 0x2563eb][
            i + 1
          ],
          { roughness: 0.8 }
        )
      );

      crate.position.set(
        x + i * 0.35,
        0.15,
        z +
          (side > 0 ? -1.05 : 1.05)
      );

      this.buildings.add(crate);
    }
  }

  addSchool(x, z, side) {
    const bw = 3.2;
    const bh = 3.1;
    const bd = 2.2;

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw,
        bh,
        bd
      ),
      this.mat(0xe7e5df, {
        roughness: 0.84
      })
    );

    wall.position.set(
      x,
      bh / 2,
      z
    );

    this.buildings.add(wall);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw + 0.25,
        0.2,
        bd + 0.25
      ),
      this.mat(0xb91c1c, {
        roughness: 0.7
      })
    );

    roof.position.set(
      x,
      bh + 0.1,
      z
    );

    this.buildings.add(roof);

    for (let i = -1; i <= 1; i++) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.42,
          0.45,
          0.06
        ),
        this.mat(0x355c72, {
          roughness: 0.2,
          metalness: 0.2
        })
      );

      window.position.set(
        x + i * 0.8,
        1.8,
        z +
          (side > 0
            ? -bd / 2 - 0.04
            : bd / 2 + 0.04)
      );

      this.buildings.add(
        window
      );
    }
  }

  addMosque(x, z, side) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.6,
        2.7,
        2.2
      ),
      this.mat(0xf1eee5, {
        roughness: 0.78
      })
    );

    base.position.set(
      x,
      1.35,
      z
    );

    this.buildings.add(base);

    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.95,
        1.0,
        0.55,
        16
      ),
      this.mat(0x0f766e, {
        roughness: 0.45,
        metalness: 0.15
      })
    );

    roof.position.set(
      x,
      2.72,
      z
    );

    this.buildings.add(roof);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.86,
        14,
        10,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ),
      this.mat(0x0d9488, {
        roughness: 0.42,
        metalness: 0.18
      })
    );

    dome.position.set(
      x,
      2.8,
      z
    );

    this.buildings.add(dome);

    const minaret = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.15,
        0.22,
        4.4,
        10
      ),
      this.mat(0xf1eee5, {
        roughness: 0.65
      })
    );

    minaret.position.set(
      x + side * 1.25,
      2.2,
      z - 0.55
    );

    this.buildings.add(minaret);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(
        0.27,
        0.55,
        8
      ),
      this.mat(0xfbbf24, {
        roughness: 0.35,
        metalness: 0.25
      })
    );

    cap.position.set(
      x + side * 1.25,
      4.65,
      z - 0.55
    );

    this.buildings.add(cap);
  }

  addMarketStall(x, z, side) {
    const canopyColors = [
      0xeab308,
      0xdc2626,
      0x16a34a,
      0x2563eb
    ];

    for (const dx of [-0.75, 0.75]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.09,
          1.65,
          0.09
        ),
        this.mat(0x6b6256, {
          roughness: 0.9
        })
      );

      post.position.set(
        x + dx,
        0.83,
        z
      );

      this.buildings.add(post);
    }

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.9,
        0.09,
        1.45
      ),
      this.mat(
        canopyColors[
          Math.floor(
            Math.random() *
              canopyColors.length
          )
        ],
        { roughness: 0.72 }
      )
    );

    canopy.position.set(
      x,
      1.7,
      z
    );

    this.buildings.add(canopy);

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.55,
        0.12,
        1.0
      ),
      this.mat(0x8b5e34, {
        roughness: 0.9
      })
    );

    table.position.set(
      x,
      0.68,
      z
    );

    this.buildings.add(table);

    for (let i = 0; i < 5; i++) {
      const product = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.18,
          0.18,
          0.18
        ),
        this.mat(
          [
            0x22c55e,
            0xef4444,
            0xfbbf24,
            0x3b82f6,
            0xa855f7
          ][i],
          { roughness: 0.65 }
        )
      );

      product.position.set(
        x - 0.55 + i * 0.27,
        0.85,
        z
      );

      this.buildings.add(product);
    }
  }

  addPetrol(x, z, side) {
    const forecourt = new THREE.Mesh(
      new THREE.BoxGeometry(
        3.6,
        0.05,
        2.5
      ),
      this.mat(0x858585, {
        roughness: 0.96
      })
    );

    forecourt.position.set(
      x,
      0.025,
      z
    );

    this.buildings.add(
      forecourt
    );

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(
        3.5,
        0.14,
        2.3
      ),
      this.mat(0xdc2626, {
        roughness: 0.5
      })
    );

    canopy.position.set(
      x,
      2.55,
      z
    );

    this.buildings.add(canopy);

    for (const dx of [-1.25, 1.25]) {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.11,
          0.11,
          2.5,
          8
        ),
        this.mat(0xf8fafc, {
          roughness: 0.4,
          metalness: 0.25
        })
      );

      p.position.set(
        x + dx,
        1.25,
        z
      );

      this.buildings.add(p);
    }

    for (const dx of [-0.8, 0, 0.8]) {
      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.45,
          1.05,
          0.4
        ),
        this.mat(0x334155, {
          roughness: 0.6
        })
      );

      pump.position.set(
        x + dx,
        0.53,
        z + 0.45
      );

      this.buildings.add(pump);
    }

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.3,
        0.55,
        0.1
      ),
      this.mat(0xfbbf24, {
        roughness: 0.4,
        emissive: 0xb45309,
        emissiveIntensity: 0.2
      })
    );

    sign.position.set(
      x,
      2.9,
      z
    );

    this.buildings.add(sign);
  }

  addBusStop(x, z, side) {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.1,
        0.09,
        1.25
      ),
      this.mat(0x334155, {
        roughness: 0.72
      })
    );

    roof.position.set(
      x,
      2.05,
      z
    );

    this.buildings.add(roof);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.1,
        1.4,
        0.08
      ),
      this.mat(0x64748b, {
        roughness: 0.82
      })
    );

    back.position.set(
      x,
      1.2,
      z - side * 0.52
    );

    this.buildings.add(back);

    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.65,
        0.12,
        0.4
      ),
      this.mat(0x78716c, {
        roughness: 0.88
      })
    );

    bench.position.set(
      x,
      0.52,
      z
    );

    this.buildings.add(bench);
  }

  addStreetLight(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.045,
        0.065,
        3.5,
        7
      ),
      this.mat(0x4b5563, {
        roughness: 0.62,
        metalness: 0.42
      })
    );

    pole.position.set(
      x,
      1.75,
      z
    );

    this.buildings.add(pole);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.55,
        0.05,
        0.05
      ),
      this.mat(0x4b5563, {
        roughness: 0.65,
        metalness: 0.35
      })
    );

    arm.position.set(
      x + (x > 0 ? -0.22 : 0.22),
      3.35,
      z
    );

    this.buildings.add(arm);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.13,
        8,
        8
      ),
      this.mat(0xfff4b5, {
        emissive: 0xffd54a,
        emissiveIntensity: 0.75,
        roughness: 0.25
      })
    );

    lamp.position.set(
      x + (x > 0 ? -0.43 : 0.43),
      3.31,
      z
    );

    this.buildings.add(lamp);
  }

  addUtilityPole(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.06,
        0.08,
        4.8,
        7
      ),
      this.mat(0x51483d, {
        roughness: 0.92
      })
    );

    pole.position.set(
      x,
      2.4,
      z
    );

    this.buildings.add(pole);

    const crossbar = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.1,
        0.07,
        0.07
      ),
      this.mat(0x3f3f46, {
        roughness: 0.8
      })
    );

    crossbar.position.set(
      x,
      4.25,
      z
    );

    this.buildings.add(
      crossbar
    );

    for (const dx of [-0.42, 0.42]) {
      const insulator = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.045,
          0.045,
          0.18,
          8
        ),
        this.mat(0xd6d3d1, {
          roughness: 0.5
        })
      );

      insulator.position.set(
        x + dx,
        4.36,
        z
      );

      this.buildings.add(
        insulator
      );
    }

    /*
     * Lightweight visual wire.
     */
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.008,
        0.008,
        4.5,
        5
      ),
      this.mat(0x171717, {
        roughness: 0.9
      })
    );

    wire.rotation.z =
      Math.PI / 2;

    wire.position.set(
      x + (x > 0 ? -2.2 : 2.2),
      4.25,
      z
    );

    this.buildings.add(wire);
  }

  addBillboard(x, z) {
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.09,
        2.6,
        0.09
      ),
      this.mat(0x475569, {
        roughness: 0.72
      })
    );

    pole.position.set(
      x,
      1.3,
      z
    );

    this.buildings.add(pole);

    const cols = [
      0xe11d48,
      0x2563eb,
      0x16a34a,
      0x7c3aed,
      0xd97706
    ];

    const col =
      cols[
        Math.floor(
          Math.abs(z) % cols.length
        )
      ];

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.25,
        1.12,
        0.08
      ),
      this.mat(col, {
        roughness: 0.52,
        emissive: col,
        emissiveIntensity: 0.12
      })
    );

    board.position.set(
      x,
      2.9,
      z
    );

    this.buildings.add(board);
  }

  addPedestrian(x, z) {
    const skinColors = [
      0x6b4423,
      0x80552d,
      0x5a371d,
      0x8a5a32
    ];

    const shirtColors = [
      0x2563eb,
      0xec4899,
      0x16a34a,
      0xeab308,
      0xa855f7,
      0xf8fafc,
      0xdc2626
    ];

    const skin =
      skinColors[
        Math.floor(
          Math.random() *
            skinColors.length
        )
      ];

    const shirt =
      shirtColors[
        Math.floor(
          Math.random() *
            shirtColors.length
        )
      ];

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.14,
        0.17,
        0.58,
        7
      ),
      this.mat(shirt, {
        roughness: 0.84
      })
    );

    body.position.set(
      x,
      0.86,
      z
    );

    this.buildings.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.14,
        8,
        8
      ),
      this.mat(skin, {
        roughness: 0.82
      })
    );

    head.position.set(
      x,
      1.28,
      z
    );

    this.buildings.add(head);

    const legs = this.mat(
      0x1f2937,
      { roughness: 0.9 }
    );

    for (const dx of [-0.07, 0.07]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.085,
          0.42,
          0.09
        ),
        legs
      );

      leg.position.set(
        x + dx,
        0.36,
        z
      );

      this.buildings.add(leg);
    }

    /*
     * Some pedestrians get a small cap.
     */
    if (Math.random() < 0.55) {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.16,
          0.16,
          0.045,
          10
        ),
        this.mat(0x374151, {
          roughness: 0.75
        })
      );

      cap.position.set(
        x,
        1.43,
        z
      );

      this.buildings.add(cap);
    }
  }

  makeKeke(
    bodyColor = 0xfbbf24,
    isPlayer = false
  ) {
    const g = new THREE.Group();

    const bodyM = this.mat(
      bodyColor,
      {
        roughness: 0.4,
        metalness: 0.22
      }
    );

    const dark = this.mat(
      0x1f2937,
      { roughness: 0.72 }
    );

    const roofM = this.mat(
      isPlayer
        ? 0xfde047
        : 0xeab308,
      {
        roughness: 0.42,
        metalness: 0.12
      }
    );

    const chrome = this.mat(
      0xa7b0ba,
      {
        roughness: 0.28,
        metalness: 0.78
      }
    );

    const tire = this.mat(
      0x090d12,
      { roughness: 0.98 }
    );

    const glass = this.mat(
      0x244e68,
      {
        roughness: 0.08,
        metalness: 0.42,
        transparent: true,
        opacity: 0.62
      }
    );

    /*
     * Main chassis.
     */
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.18,
        0.27,
        1.72
      ),
      dark
    );

    chassis.position.set(
      0,
      0.35,
      0
    );

    g.add(chassis);

    /*
     * Front nose.
     */
    const frontBody = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.92,
        0.58,
        0.58
      ),
      bodyM
    );

    frontBody.position.set(
      0,
      0.68,
      0.62
    );

    frontBody.userData.isBody = true;

    g.add(frontBody);

    /*
     * Rear passenger body.
     */
    const rearBody = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.22,
        0.72,
        1.05
      ),
      bodyM
    );

    rearBody.position.set(
      0,
      0.74,
      -0.3
    );

    rearBody.userData.isBody = true;

    g.add(rearBody);

    /*
     * Lower rear bumper.
     */
    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.28,
        0.12,
        0.12
      ),
      chrome
    );

    bumper.position.set(
      0,
      0.47,
      -0.86
    );

    g.add(bumper);

    /*
     * Canopy.
     */
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.38,
        0.11,
        1.52
      ),
      roofM
    );

    canopy.position.set(
      0,
      1.38,
      -0.08
    );

    g.add(canopy);

    /*
     * Front canopy lip.
     */
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.38,
        0.15,
        0.1
      ),
      roofM
    );

    lip.position.set(
      0,
      1.29,
      0.66
    );

    g.add(lip);

    /*
     * Windshield.
     */
    const windshield = new THREE.Mesh(
      new THREE.PlaneGeometry(
        1.0,
        0.52
      ),
      glass
    );

    windshield.position.set(
      0,
      1.06,
      0.66
    );

    windshield.rotation.x =
      -0.18;

    g.add(windshield);

    /*
     * Side passenger openings.
     */
    for (const x of [-0.625, 0.625]) {
      const sideFrame =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.06,
            0.56,
            1.1
          ),
          dark
        );

      sideFrame.position.set(
        x,
        1.03,
        -0.18
      );

      g.add(sideFrame);

      const sideWin =
        new THREE.Mesh(
          new THREE.PlaneGeometry(
            0.72,
            0.43
          ),
          glass
        );

      sideWin.position.set(
        x +
          (x > 0
            ? 0.004
            : -0.004),
        1.04,
        -0.18
      );

      sideWin.rotation.y =
        x > 0
          ? -Math.PI / 2
          : Math.PI / 2;

      g.add(sideWin);
    }

    /*
     * Canopy supports.
     */
    for (const x of [-0.62, 0.62]) {
      for (const z of [0.45, -0.72]) {
        const support =
          new THREE.Mesh(
            new THREE.BoxGeometry(
              0.055,
              0.65,
              0.055
            ),
            dark
          );

        support.position.set(
          x,
          1.0,
          z
        );

        g.add(support);
      }
    }

    /*
     * Mirrors.
     */
    for (const x of [-0.58, 0.58]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.22,
          0.045,
          0.045
        ),
        dark
      );

      arm.position.set(
        x,
        1.0,
        0.58
      );

      g.add(arm);

      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.1,
          0.15,
          0.045
        ),
        chrome
      );

      mirror.position.set(
        x > 0
          ? x + 0.1
          : x - 0.1,
        1.0,
        0.58
      );

      g.add(mirror);
    }

    /*
     * Headlights.
     */
    const lightM = this.mat(
      0xfff3a6,
      {
        roughness: 0.2,
        emissive: 0xffc928,
        emissiveIntensity:
          isPlayer ? 1.2 : 0.55
      }
    );

    for (const x of [-0.3, 0.3]) {
      const headlight =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            0.105,
            12,
            12
          ),
          lightM
        );

      headlight.position.set(
        x,
        0.66,
        0.9
      );

      g.add(headlight);
    }

    /*
     * Front chrome guard.
     */
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.035,
        0.035,
        0.65,
        8
      ),
      chrome
    );

    bar.rotation.z =
      Math.PI / 2;

    bar.position.set(
      0,
      0.94,
      0.79
    );

    g.add(bar);

    /*
     * Passenger bench.
     */
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.02,
        0.15,
        0.42
      ),
      dark
    );

    bench.position.set(
      0,
      0.68,
      -0.5
    );

    g.add(bench);

    /*
     * Rear plate.
     */
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.42,
        0.12,
        0.025
      ),
      this.mat(0xf8fafc, {
        roughness: 0.45
      })
    );

    plate.position.set(
      0,
      0.47,
      -0.9
    );

    g.add(plate);

    /*
     * Front wheel + steering fork.
     */
    const frontWheelGroup =
      new THREE.Group();

    frontWheelGroup.position.set(
      0,
      0.22,
      0.84
    );

    const frontWheel =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.235,
          0.235,
          0.15,
          16
        ),
        tire
      );

    frontWheel.rotation.z =
      Math.PI / 2;

    frontWheelGroup.add(
      frontWheel
    );

    const frontHub =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.08,
          0.08,
          0.16,
          10
        ),
        chrome
      );

    frontHub.rotation.z =
      Math.PI / 2;

    frontWheelGroup.add(
      frontHub
    );

    const fork =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.06,
          0.46,
          0.07
        ),
        chrome
      );

    fork.position.set(
      0,
      0.21,
      0
    );

    frontWheelGroup.add(
      fork
    );

    g.add(frontWheelGroup);

    /*
     * Two rear wheels.
     */
    for (const x of [-0.61, 0.61]) {
      const rearWheel =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.25,
            0.25,
            0.17,
            16
          ),
          tire
        );

      rearWheel.rotation.z =
        Math.PI / 2;

      rearWheel.position.set(
        x,
        0.24,
        -0.53
      );

      g.add(rearWheel);

      const rearHub =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.09,
            0.09,
            0.18,
            10
          ),
          chrome
        );

      rearHub.rotation.z =
        Math.PI / 2;

      rearHub.position.set(
        x,
        0.24,
        -0.53
      );

      g.add(rearHub);
    }

    /*
     * Exhaust.
     */
    const exhaust =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.045,
          0.045,
          0.6,
          8
        ),
        chrome
      );

    exhaust.rotation.x =
      Math.PI / 2;

    exhaust.position.set(
      0.58,
      0.36,
      -0.78
    );

    g.add(exhaust);

    g.userData.kind = 'keke';
    g.userData.isPlayer = isPlayer;

    /*
     * Existing game/renderer contract.
     */
    g.userData.steerParts = [
      frontWheelGroup,
      bar
    ];

    return g;
  }

  makeCar(color = 0xdc2626) {
    const g = new THREE.Group();

    const bodyM = this.mat(
      color,
      {
        roughness: 0.4,
        metalness: 0.3
      }
    );

    const dark = this.mat(
      0x0b1118,
      { roughness: 0.88 }
    );

    const glass = this.mat(
      0x18364e,
      {
        roughness: 0.12,
        metalness: 0.38
      }
    );

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.42,
        0.4,
        2.35
      ),
      bodyM
    );

    body.position.y = 0.43;
    body.userData.isBody = true;

    g.add(body);

    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.27,
        0.13,
        0.55
      ),
      bodyM
    );

    hood.position.set(
      0,
      0.57,
      0.88
    );

    hood.userData.isBody = true;

    g.add(hood);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.22,
        0.48,
        1.18
      ),
      bodyM
    );

    cabin.position.set(
      0,
      0.79,
      -0.12
    );

    cabin.userData.isBody = true;

    g.add(cabin);

    const windshield =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.08,
          0.28,
          0.04
        ),
        glass
      );

    windshield.position.set(
      0,
      0.84,
      0.47
    );

    windshield.rotation.x =
      -0.1;

    g.add(windshield);

    const rearWindow =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.08,
          0.28,
          0.04
        ),
        glass
      );

    rearWindow.position.set(
      0,
      0.84,
      -0.7
    );

    rearWindow.rotation.x =
      0.1;

    g.add(rearWindow);

    const lightM = this.mat(
      0xfff3a6,
      {
        emissive: 0xffc928,
        emissiveIntensity: 0.55,
        roughness: 0.2
      }
    );

    for (const x of [-0.42, 0.42]) {
      const headlight =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.2,
            0.11,
            0.06
          ),
          lightM
        );

      headlight.position.set(
        x,
        0.43,
        1.2
      );

      g.add(headlight);
    }

    for (const [x, z] of [
      [-0.57, 0.78],
      [0.57, 0.78],
      [-0.57, -0.78],
      [0.57, -0.78]
    ]) {
      const wheel =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.225,
            0.225,
            0.15,
            14
          ),
          dark
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

    g.userData.kind = 'car';

    return g;
  }

  makeBus(color = 0x2563eb) {
    const g = new THREE.Group();

    const bodyM = this.mat(
      color,
      {
        roughness: 0.5,
        metalness: 0.2
      }
    );

    const dark = this.mat(
      0x0b1118,
      { roughness: 0.88 }
    );

    const glass = this.mat(
      0x18364e,
      {
        roughness: 0.12,
        metalness: 0.38
      }
    );

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.72,
        1.35,
        3.55
      ),
      bodyM
    );

    body.position.y = 0.92;
    body.userData.isBody = true;

    g.add(body);

    const upperGlass =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.74,
          0.5,
          3.18
        ),
        glass
      );

    upperGlass.position.y = 1.18;

    g.add(upperGlass);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.82,
        0.08,
        3.65
      ),
      bodyM
    );

    roof.position.y = 1.62;

    g.add(roof);

    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.75,
        0.12,
        0.12
      ),
      dark
    );

    bumper.position.set(
      0,
      0.35,
      1.8
    );

    g.add(bumper);

    for (const [x, z] of [
      [-0.72, 1.2],
      [0.72, 1.2],
      [-0.72, -1.2],
      [0.72, -1.2]
    ]) {
      const wheel =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.31,
            0.31,
            0.2,
            14
          ),
          dark
        );

      wheel.rotation.z =
        Math.PI / 2;

      wheel.position.set(
        x,
        0.3,
        z
      );

      g.add(wheel);
    }

    g.userData.kind = 'bus';

    return g;
  }

  makeTruck(color = 0xdc2626) {
    const g = new THREE.Group();

    const cabM = this.mat(
      color,
      {
        roughness: 0.5,
        metalness: 0.2
      }
    );

    const cargoM = this.mat(
      0x9ca3af,
      {
        roughness: 0.72,
        metalness: 0.08
      }
    );

    const dark = this.mat(
      0x0b1118,
      { roughness: 0.9 }
    );

    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.48,
        1.05,
        1.25
      ),
      cabM
    );

    cab.position.set(
      0,
      0.82,
      1.05
    );

    cab.userData.isBody = true;

    g.add(cab);

    const windshield =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.1,
          0.3,
          0.05
        ),
        this.mat(0x18364e, {
          roughness: 0.12,
          metalness: 0.35
        })
      );

    windshield.position.set(
      0,
      1.02,
      1.68
    );

    g.add(windshield);

    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.58,
        1.5,
        2.3
      ),
      cargoM
    );

    cargo.position.set(
      0,
      1.03,
      -0.58
    );

    g.add(cargo);

    const cargoTop = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.66,
        0.08,
        2.38
      ),
      dark
    );

    cargoTop.position.set(
      0,
      1.8,
      -0.58
    );

    g.add(cargoTop);

    for (const [x, z] of [
      [-0.63, 1.05],
      [0.63, 1.05],
      [-0.7, -1.0],
      [0.7, -1.0]
    ]) {
      const wheel =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.29,
            0.29,
            0.2,
            14
          ),
          dark
        );

      wheel.rotation.z =
        Math.PI / 2;

      wheel.position.set(
        x,
        0.28,
        z
      );

      g.add(wheel);
    }

    g.userData.kind = 'truck';

    return g;
  }

  makeTaxi() {
    const g =
      this.makeCar(0x16a34a);

    const roofSign =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.46,
          0.15,
          0.22
        ),
        this.mat(0xfbbf24, {
          emissive: 0xfbbf24,
          emissiveIntensity: 0.55,
          roughness: 0.4
        })
      );

    roofSign.position.set(
      0,
      1.08,
      -0.08
    );

    g.add(roofSign);

    const stripe =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.45,
          0.09,
          0.04
        ),
        this.mat(0xfbbf24, {
          roughness: 0.55
        })
      );

    stripe.position.set(
      0,
      0.58,
      0.15
    );

    g.add(stripe);

    g.userData.kind = 'taxi';

    return g;
  }

  makeMotorcycle(
    color = 0xef4444
  ) {
    const g = new THREE.Group();

    const bodyM = this.mat(
      color,
      {
        roughness: 0.48,
        metalness: 0.3
      }
    );

    const dark = this.mat(
      0x0b1118,
      { roughness: 0.92 }
    );

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.27,
        0.26,
        1.02
      ),
      bodyM
    );

    frame.position.set(
      0,
      0.48,
      0
    );

    g.add(frame);

    const tank = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.4,
        0.27,
        0.42
      ),
      bodyM
    );

    tank.position.set(
      0,
      0.66,
      0.15
    );

    g.add(tank);

    const riderBody =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.31,
          0.52,
          0.31
        ),
        this.mat(0x1f2937, {
          roughness: 0.85
        })
      );

    riderBody.position.set(
      0,
      0.92,
      -0.12
    );

    g.add(riderBody);

    const riderHead =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.15,
          9,
          9
        ),
        this.mat(0x6b4423, {
          roughness: 0.8
        })
      );

    riderHead.position.set(
      0,
      1.3,
      -0.12
    );

    g.add(riderHead);

    const handle =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.55,
          0.05,
          0.05
        ),
        dark
      );

    handle.position.set(
      0,
      0.9,
      0.48
    );

    g.add(handle);

    for (const z of [
      0.48,
      -0.48
    ]) {
      const wheel =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.205,
            0.205,
            0.11,
            14
          ),
          dark
        );

      wheel.rotation.z =
        Math.PI / 2;

      wheel.position.set(
        0,
        0.2,
        z
      );

      g.add(wheel);
    }

    g.userData.kind =
      'motorcycle';

    return g;
  }

  makeEnforcer(
    kind = 'police'
  ) {
    const isKarota =
      kind === 'karota';

    const baseColor =
      isKarota
        ? 0xf59e0b
        : 0x1e40af;

    const g =
      this.makeCar(baseColor);

    /*
     * Police/KAROTA body stripe.
     */
    const stripe =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          1.44,
          0.12,
          0.42
        ),
        this.mat(
          isKarota
            ? 0x111827
            : 0xf8fafc,
          {
            roughness: 0.58
          }
        )
      );

    stripe.position.set(
      0,
      0.58,
      0
    );

    g.add(stripe);

    /*
     * Roof light bar.
     */
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.78,
        0.12,
        0.24
      ),
      this.mat(0x111827, {
        roughness: 0.48
      })
    );

    bar.position.set(
      0,
      1.08,
      -0.1
    );

    g.add(bar);

    const red =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.3,
          0.105,
          0.2
        ),
        this.mat(0xef4444, {
          emissive: 0xef4444,
          emissiveIntensity: 0.85,
          roughness: 0.3
        })
      );

    red.position.set(
      -0.22,
      1.08,
      -0.1
    );

    g.add(red);

    const blue =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.3,
          0.105,
          0.2
        ),
        this.mat(0x3b82f6, {
          emissive: 0x3b82f6,
          emissiveIntensity: 0.85,
          roughness: 0.3
        })
      );

    blue.position.set(
      0.22,
      1.08,
      -0.1
    );

    g.add(blue);

    /*
     * KAROTA gets a more obvious yellow/orange roof marker.
     */
    if (isKarota) {
      const karotaMarker =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            0.7,
            0.05,
            0.28
          ),
          this.mat(0xfbbf24, {
            emissive: 0xb45309,
            emissiveIntensity: 0.35
          })
        );

      karotaMarker.position.set(
        0,
        1.17,
        -0.1
      );

      g.add(
        karotaMarker
      );
    }

    g.userData.kind = kind;

    return g;
  }

  makeZone(color) {
    const g = new THREE.Group();

    const ring =
      new THREE.Mesh(
        new THREE.RingGeometry(
          0.55,
          0.78,
          32
        ),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9
        })
      );

    ring.rotation.x =
      -Math.PI / 2;

    ring.position.y = 0.06;

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
          opacity: 0.2,
          side: THREE.DoubleSide
        })
      );

    disc.rotation.x =
      -Math.PI / 2;

    disc.position.y = 0.05;

    g.add(disc);

    return g;
  }

  makeCoin() {
    const mesh =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.3,
          0.3,
          0.075,
          20
        ),
        this.mat(0xfbbf24, {
          metalness: 0.78,
          roughness: 0.2,
          emissive: 0xb45309,
          emissiveIntensity: 0.3
        })
      );

    mesh.rotation.x =
      Math.PI / 2;

    return mesh;
  }

  screenYToZ(y, playerY) {
    const t =
      (playerY - y) /
      Math.max(playerY, 1);

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
          Math.round(lane)
        )
      )
    ];
  }

  applyPaint(paintId) {
    const colors = {
      classic: 0xfbbf24,
      ruffneck: 0xeab308,
      sky: 0x38bdf8,
      forest: 0x22c55e,
      royal: 0xa855f7,
      ember: 0xef4444,
      night: 0x1e293b
    };

    const col =
      colors[paintId] ||
      0xfbbf24;

    if (!this.player) return;

    this.player.traverse(
      (ch) => {
        if (
          ch.isMesh &&
          ch.userData.isBody
        ) {
          ch.material.color.setHex(
            col
          );
        }
      }
    );
  }

  applyQuality(low) {
    if (!this.renderer) return;

    this.renderer.setPixelRatio(
      low
        ? 1
        : Math.min(
            window.devicePixelRatio ||
              1,
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
      this.rain.visible = !low;
    }

    if (this.dust) {
      this.dustMat.opacity =
        low
          ? Math.min(
              this.dustMat.opacity,
              0.15
            )
          : 0.28;
    }
  }

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
        window.devicePixelRatio ||
          1,
        1.75
      )
    );

    this.renderer.setSize(
      w,
      h,
      false
    );
  }

  updateVehicleVisual(
    mesh,
    o,
    targetX,
    z
  ) {
    /*
     * Each gameplay vehicle gets smooth visual
     * lane movement rather than instantly snapping
     * from one lane to another.
     */
    if (!this.trafficVisuals.has(o)) {
      this.trafficVisuals.set(o, {
        x: targetX,
        z,
        previousX: targetX,
        speed: 0
      });
    }

    const visual =
      this.trafficVisuals.get(o);

    visual.previousX =
      visual.x;

    visual.x +=
      (targetX - visual.x) *
      0.18;

    visual.z +=
      (z - visual.z) *
      0.28;

    const lateral =
      visual.x -
      visual.previousX;

    mesh.position.x =
      visual.x;

    mesh.position.z =
      visual.z;

    mesh.position.y = 0;

    /*
     * Vehicle banking/steering.
     */
    const maxTurn =
      o.type === 'motorcycle'
        ? 0.18
        : 0.1;

    mesh.rotation.y =
      THREE.MathUtils.clamp(
        lateral * 0.85,
        -maxTurn,
        maxTurn
      );

    mesh.rotation.z =
      THREE.MathUtils.clamp(
        -lateral * 0.5,
        -0.08,
        0.08
      );

    /*
     * Slight suspension movement.
     */
    const bounce =
      Math.sin(
        (this.game.frame || 0) *
          0.16 +
          mesh.position.z
      ) *
      0.018;

    mesh.position.y =
      bounce;

    /*
     * Depth-based visual scaling.
     * Perspective already does most of the work;
     * this small correction makes distant traffic
     * read more clearly without becoming oversized.
     */
    const depth =
      THREE.MathUtils.clamp(
        (mesh.position.z - 8) /
          52,
        0,
        1
      );

    const scale =
      0.84 +
      depth * 0.12;

    mesh.scale.setScalar(
      scale
    );
  }

  renderTimeOfDay(tod) {
    if (tod > 0.68) {
      /*
       * Night.
       */
      this.renderer.setClearColor(
        0x020617,
        1
      );

      this.scene.fog.color.setHex(
        0x07111f
      );

      this.scene.fog.near = 20;
      this.scene.fog.far = 78;

      this.sun.intensity = 0.12;
      this.hemlight.intensity = 0.13;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x020617
        );
      }

      if (!this.playerHeadlights) {
        this.playerHeadlights = [];

        for (const x of [
          -0.3,
          0.3
        ]) {
          const light =
            new THREE.SpotLight(
              0xfff1c9,
              3.2,
              26,
              Math.PI / 5,
              0.55
            );

          light.position.set(
            x,
            0.7,
            0.9
          );

          light.target.position.set(
            x,
            0,
            18
          );

          this.player.add(
            light
          );

          this.player.add(
            light.target
          );

          this.playerHeadlights.push(
            light
          );
        }
      }

      this.playerHeadlights.forEach(
        (light) => {
          light.intensity = 3.2;
        }
      );

      return;
    }

    if (tod > 0.48) {
      /*
       * Evening.
       */
      this.renderer.setClearColor(
        0x6b3c72,
        1
      );

      this.scene.fog.color.setHex(
        0x56355e
      );

      this.scene.fog.near = 27;
      this.scene.fog.far = 91;

      this.sun.intensity = 0.42;
      this.hemlight.intensity = 0.26;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x6b3c72
        );
      }

      if (this.playerHeadlights) {
        this.playerHeadlights.forEach(
          (light) => {
            light.intensity = 0;
          }
        );
      }

      return;
    }

    if (tod > 0.28) {
      /*
       * Day.
       */
      this.renderer.setClearColor(
        0x45b6e6,
        1
      );

      this.scene.fog.color.setHex(
        0x78c6e4
      );

      this.scene.fog.near = 34;
      this.scene.fog.far = 105;

      this.sun.intensity = 1.15;
      this.hemlight.intensity = 0.48;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x45b6e6
        );
      }

      if (this.playerHeadlights) {
        this.playerHeadlights.forEach(
          (light) => {
            light.intensity = 0;
          }
        );
      }

      return;
    }

    /*
     * Dawn.
     */
    this.renderer.setClearColor(
      0x8ac8e8,
      1
    );

    this.scene.fog.color.setHex(
      0xb4d8e7
    );

    this.scene.fog.near = 38;
    this.scene.fog.far = 112;

    this.sun.intensity = 1.3;
    this.hemlight.intensity = 0.56;

    if (this.sky) {
      this.sky.material.color.setHex(
        0x8ac8e8
      );
    }

    if (this.playerHeadlights) {
      this.playerHeadlights.forEach(
        (light) => {
          light.intensity = 0;
        }
      );
    }
  }

  updateWeather(g, spd) {
    if (
      (g.frame || 0) % 900 === 0 &&
      g.state === 1
    ) {
      const r = Math.random();

      this.weather =
        r < 0.52
          ? 'clear'
          : r < 0.78
          ? 'harmattan'
          : 'rain';

      if (
        this.weather === 'rain' &&
        this.game.ui
      ) {
        this.game.ui.showMissionToast(
          'Rain in Kano'
        );
      }

      if (
        this.weather ===
          'harmattan' &&
        this.game.ui
      ) {
        this.game.ui.showMissionToast(
          'Harmattan haze'
        );
      }
    }

    if (this.weather === 'rain') {
      this.rainMat.opacity = 0.58;
      this.dustMat.opacity = 0.07;

      this.scene.fog.near =
        Math.min(
          this.scene.fog.near,
          24
        );
    } else if (
      this.weather === 'harmattan'
    ) {
      this.rainMat.opacity = 0;

      this.dustMat.opacity =
        0.45 +
        Math.min(
          0.18,
          spd * 0.025
        );

      this.dustMat.color.setHex(
        0xd4c4a8
      );

      this.scene.fog.color.lerp(
        new THREE.Color(
          0xc4b5a0
        ),
        0.28
      );
    } else {
      this.rainMat.opacity = 0;

      this.dustMat.opacity =
        0.16 +
        Math.min(
          0.22,
          spd * 0.025
        );

      this.dustMat.color.setHex(
        0xc4b5a0
      );
    }

    /*
     * Dust movement.
     */
    if (this.dust) {
      const pos =
        this.dust.geometry
          .attributes.position
          .array;

      for (
        let i = 0;
        i < pos.length;
        i += 3
      ) {
        pos[i + 2] -=
          spd * 0.09;

        pos[i] +=
          Math.sin(
            (g.frame || 0) *
              0.008 +
              i
          ) *
          0.001;

        if (pos[i + 2] < 1) {
          pos[i] =
            (Math.random() - 0.5) *
            10;

          pos[i + 1] =
            Math.random() * 1.5;

          pos[i + 2] =
            38 +
            Math.random() * 20;
        }
      }

      this.dust.geometry
        .attributes.position
        .needsUpdate = true;
    }

    /*
     * Rain movement.
     */
    if (
      this.rain &&
      this.rainMat.opacity > 0.05
    ) {
      const pos =
        this.rain.geometry
          .attributes.position
          .array;

      for (
        let i = 0;
        i < pos.length;
        i += 3
      ) {
        pos[i + 1] -=
          0.52;

        pos[i + 2] -=
          spd * 0.055;

        if (
          pos[i + 1] < 0
        ) {
          pos[i] =
            (Math.random() - 0.5) *
            16;

          pos[i + 1] =
            9 +
            Math.random() * 7;

          pos[i + 2] =
            Math.random() * 50;
        }
      }

      this.rain.geometry
        .attributes.position
        .needsUpdate = true;
    }
  }

  renderPlayer(g) {
    if (!this.player) return;

    const tx =
      this.laneToX(
        g.playerLane
      );

    const lateralVel =
      tx -
      this.player.position.x;

    this.player.position.x +=
      lateralVel * 0.2;

    this.player.position.z =
      PLAYER_Z;

    const bounceY =
      g.bounce > 0
        ? Math.sin(
            g.bounce * 0.9
          ) * 0.105
        : 0;

    this.player.position.y =
      bounceY;

    /*
     * Driving body lean.
     */
    this.player.rotation.y =
      lateralVel * 0.16;

    this.player.rotation.z =
      -lateralVel * 0.075;

    /*
     * Steering wheel/fork.
     */
    if (
      this.player.userData
        .steerParts
    ) {
      const steerAngle =
        THREE.MathUtils.clamp(
          lateralVel * 0.42,
          -0.35,
          0.35
        );

      for (
        const part of
          this.player.userData
            .steerParts
      ) {
        part.rotation.y =
          steerAngle;
      }
    }

    /*
     * Tiny suspension motion.
     */
    const suspension =
      Math.sin(
        (g.frame || 0) * 0.23
      ) *
      Math.min(
        0.018,
        (g.speed || 3) *
          0.002
      );

    this.player.position.y +=
      suspension;

    if (this.playerShadow) {
      this.playerShadow.position.x =
        this.player.position.x;

      this.playerShadow.position.z =
        this.player.position.z;

      const shadowScale =
        0.86 +
        Math.abs(bounceY) *
          2.2;

      this.playerShadow.scale.set(
        1.15 * shadowScale,
        shadowScale,
        0.7 * shadowScale
      );
    }
  }

  renderCamera(g, spd) {
    const px =
      this.player
        ? this.player.position.x
        : 0;

    const lateralVelCam =
      px -
      (this.lastCamPx || 0);

    this.lastCamPx = px;

    const speedFactor =
      THREE.MathUtils.clamp(
        (spd - 3) / 6,
        0,
        1
      );

    /*
     * More forward-facing driving camera.
     */
    const camZ =
      -5.0 -
      speedFactor * 1.0;

    const camY =
      4.55 +
      speedFactor * 0.45;

    const camX =
      px * 0.58;

    this.camera.position.x +=
      (camX -
        this.camera.position.x) *
      0.105;

    this.camera.position.y +=
      (camY -
        this.camera.position.y) *
      0.095;

    this.camera.position.z +=
      (camZ -
        this.camera.position.z) *
      0.095;

    /*
     * Collision/gameplay shake.
     */
    let sx = 0;
    let sy = 0;

    if (g.shake > 0) {
      const magnitude =
        g.shakeMag || 4;

      sx =
        (Math.random() - 0.5) *
        magnitude *
        0.035;

      sy =
        (Math.random() - 0.5) *
        magnitude *
        0.025;
    }

    this.camera.position.x += sx;
    this.camera.position.y += sy;

    /*
     * Driving banking.
     */
    const targetRoll =
      THREE.MathUtils.clamp(
        -lateralVelCam * 0.075,
        -0.075,
        0.075
      );

    this.camera.rotation.z +=
      (targetRoll -
        this.camera.rotation.z) *
      0.1;

    /*
     * Speed FOV.
     */
    const targetFov =
      57 +
      speedFactor * 7;

    this.camera.fov +=
      (targetFov -
        this.camera.fov) *
      0.055;

    this.camera.updateProjectionMatrix();

    this.camera.lookAt(
      px * 0.25,
      0.75,
      15.5
    );
  }

  renderTraffic(g) {
    const py =
      g.playerY || 500;

    const activeVehicles = {};

    for (
      const type in this.pools
    ) {
      activeVehicles[type] = 0;
    }

    for (
      const o of g.obs || []
    ) {
      const type =
        o.type || 'car';

      const pool =
        this.pools[type] ||
        this.pools.car;

      if (!pool) continue;

      const idx =
        activeVehicles[type] || 0;

      if (
        idx >= pool.length
      ) {
        continue;
      }

      const mesh =
        pool[idx];

      activeVehicles[type] =
        idx + 1;

      mesh.visible = true;

      const targetX =
        this.laneToX(
          o.lane
        );

      const targetZ =
        this.screenYToZ(
          o.y,
          py
        );

      this.updateVehicleVisual(
        mesh,
        o,
        targetX,
        targetZ
      );

      /*
       * Traffic-specific visual behavior.
       */
      if (
        type === 'motorcycle'
      ) {
        mesh.rotation.y +=
          THREE.MathUtils.clamp(
            (
              targetX -
              mesh.position.x
            ) *
              0.35,
            -0.18,
            0.18
          );
      }

      /*
       * Police and KAROTA lights alternate.
       */
      if (
        type === 'police' ||
        type === 'karota'
      ) {
        const flash =
          Math.floor(
            (g.frame || 0) / 8
          ) % 2;

        mesh.traverse(
          (child) => {
            if (
              child.isMesh &&
              child.material &&
              child.material.emissive
            ) {
              const current =
                child.material
                  .color
                  .getHex();

              if (
                current ===
                0xef4444
              ) {
                child.material
                  .emissive
                  .setHex(
                    flash
                      ? 0xef4444
                      : 0x220000
                  );
              }

              if (
                current ===
                0x3b82f6
              ) {
                child.material
                  .emissive
                  .setHex(
                    flash
                      ? 0x220000
                      : 0x3b82f6
                  );
              }
            }
          }
        );
      }
    }

    /*
     * Hide unused pool entries.
     */
    for (
      const type in this.pools
    ) {
      const pool =
        this.pools[type];

      const used =
        activeVehicles[type] ||
        0;

      for (
        let i = used;
        i < pool.length;
        i++
      ) {
        pool[i].visible = false;
      }
    }
  }

  renderZonesAndCoins(g) {
    const py =
      g.playerY || 500;

    let zi = 0;

    const zones = [
      ...(g.paxZones || [])
        .filter(
          (p) => !p.taken
        )
        .map((p) => ({
          ...p,
          kind: 'p'
        })),

      ...(g.dropZones || [])
        .filter(
          (d) => !d.used
        )
        .map((d) => ({
          ...d,
          kind: 'd'
        }))
    ];

    for (
      const z of zones
    ) {
      if (
        zi >=
        this.zonePool.length
      ) {
        break;
      }

      const mesh =
        this.zonePool[zi++];

      mesh.visible = true;

      mesh.position.x =
        this.laneToX(
          z.lane
        );

      mesh.position.z =
        this.screenYToZ(
          z.y,
          py
        );

      const col =
        z.kind === 'd'
          ? 0xfbbf24
          : z.aishat
          ? 0xf472b6
          : z.vip
          ? 0xa78bfa
          : 0x4ade80;

      mesh.children.forEach(
        (ch) => {
          if (ch.material) {
            ch.material.color.setHex(
              col
            );
          }
        }
      );

      const pulse =
        1 +
        Math.sin(
          (g.frame || 0) *
            0.12
        ) *
          0.08;

      mesh.scale.set(
        pulse,
        1,
        pulse
      );

      mesh.rotation.y =
        Math.sin(
          (g.frame || 0) *
            0.025
        ) *
        0.05;
    }

    while (
      zi <
      this.zonePool.length
    ) {
      this.zonePool[
        zi++
      ].visible = false;
    }

    let ci = 0;

    for (
      const c of g.coins || []
    ) {
      if (
        c.taken ||
        ci >=
          this.coinPool.length
      ) {
        continue;
      }

      const mesh =
        this.coinPool[ci++];

      mesh.visible = true;

      mesh.position.x =
        this.laneToX(
          c.lane
        );

      mesh.position.z =
        this.screenYToZ(
          c.y,
          py
        );

      mesh.position.y =
        0.55 +
        Math.sin(
          c.bob || 0
        ) *
          0.15;

      mesh.rotation.y +=
        0.11;

      mesh.rotation.z =
        Math.sin(
          (g.frame || 0) *
            0.08
        ) *
        0.12;
    }

    while (
      ci <
      this.coinPool.length
    ) {
      this.coinPool[
        ci++
      ].visible = false;
    }
  }

  render() {
    if (!this.ready) {
      return;
    }

    const g =
      this.game;

    const tod =
      typeof g.getTimeOfDay ===
      'function'
        ? g.getTimeOfDay()
        : 0.2;

    const spd =
      g.speed || 3;

    this.renderTimeOfDay(
      tod
    );

    this.updateWeather(
      g,
      spd
    );

    /*
     * Road scrolling.
     */
    if (this.laneMarks) {
      this.laneMarks.position.z =
        -(
          (g.roadOff || 0) *
          0.08
        ) % 3.5;
    }

    if (this.buildings) {
      this.buildings.position.z =
        -(
          (g.roadOff || 0) *
          0.04
        ) % 5.5;
    }

    if (
      this.backgroundBuildings
    ) {
      this.backgroundBuildings
        .position.z =
        -(
          (g.roadOff || 0) *
          0.018
        ) % 9;
    }

    /*
     * Player.
     */
    this.renderPlayer(
      g
    );

    /*
     * Camera.
     */
    this.renderCamera(
      g,
      spd
    );

    /*
     * Traffic.
     */
    this.renderTraffic(
      g
    );

    /*
     * Passenger/drop zones
     * and coins.
     */
    this.renderZonesAndCoins(
      g
    );

    this.renderer.render(
      this.scene,
      this.camera
    );
  }

  draw() {
    this.render();
  }
}