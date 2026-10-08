// Phase 2 — vehicle quality + clearer player keke
import * as THREE from '../vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];
const ROAD_LEN = 120;
const PLAYER_Z = 5.5;

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game?.canvas || null;
    this.ready = false;

    this.vehiclePool = [];
    this.zonePool = [];
    this.coinPool = [];

    this.renderer = null;
    this.scene = null;
    this.camera = null;

    this.sun = null;
    this.hemlight = null;
    this.sky = null;

    this.laneMarks = null;
    this.buildings = null;

    this.player = null;
    this.playerShadow = null;

    this.dustGeo = null;
    this.dustMat = null;
    this.dust = null;

    this.rainGeo = null;
    this.rainMat = null;
    this.rain = null;

    this.weather = 'clear';
    this.weatherTimer = 0;

    this.init();
  }

  init() {
    if (!this.canvas) return;

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
    this.renderer.setClearColor(0x0a1020, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a1020, 30, 100);

    this.camera = new THREE.PerspectiveCamera(
      50,
      w / Math.max(h, 1),
      0.1,
      160
    );

    this.camera.position.set(0, 6.2, -3.5);
    this.camera.lookAt(0, 0.8, 18);

    this.scene.add(
      new THREE.AmbientLight(0x9aacc8, 0.6)
    );

    this.sun = new THREE.DirectionalLight(
      0xfff1c9,
      1.1
    );

    this.sun.position.set(10, 20, 8);
    this.scene.add(this.sun);

    this.hemlight = new THREE.HemisphereLight(
      0x87b5ff,
      0x3d4a32,
      0.4
    );

    this.scene.add(this.hemlight);

    this.buildRoad();
    this.buildCityscape();

    this.player = this.makeKeke(0xfbbf24, true);
    this.player.position.set(0, 0, PLAYER_Z);
    this.scene.add(this.player);

    for (let i = 0; i < 22; i += 1) {
      const vehicle = this.makeCar(0x64748b);

      vehicle.visible = false;

      this.scene.add(vehicle);
      this.vehiclePool.push(vehicle);
    }

    for (let i = 0; i < 10; i += 1) {
      const zone = this.makeZone(0x4ade80);

      zone.visible = false;

      this.scene.add(zone);
      this.zonePool.push(zone);
    }

    for (let i = 0; i < 12; i += 1) {
      const coin = this.makeCoin();

      coin.visible = false;

      this.scene.add(coin);
      this.coinPool.push(coin);
    }

    this.initParticles();

    this.weather = 'clear';
    this.weatherTimer = 0;

    try {
      const storedQuality = localStorage.getItem('kanoLQ');
      const lowQuality = JSON.parse(storedQuality || 'false');

      if (lowQuality) {
        this.applyQuality(true);
      }
    } catch {
      // Ignore unavailable or malformed localStorage values.
    }

    this.ready = true;
  }

  initParticles() {
    // Dust / speed particles
    this.dustGeo = new THREE.BufferGeometry();

    const dustCount = 80;
    const dustPos = new Float32Array(dustCount * 3);

    for (let i = 0; i < dustCount; i += 1) {
      dustPos[i * 3] =
        (Math.random() - 0.5) * 8;

      dustPos[i * 3 + 1] =
        Math.random() * 1.5;

      dustPos[i * 3 + 2] =
        Math.random() * 40 + 2;
    }

    this.dustGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(dustPos, 3)
    );

    this.dustMat = new THREE.PointsMaterial({
      color: 0xc4b5a0,
      size: 0.12,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });

    this.dust = new THREE.Points(
      this.dustGeo,
      this.dustMat
    );

    this.scene.add(this.dust);

    // Rain
    this.rainGeo = new THREE.BufferGeometry();

    const rainCount = 400;
    const rainPos = new Float32Array(rainCount * 3);

    for (let i = 0; i < rainCount; i += 1) {
      rainPos[i * 3] =
        (Math.random() - 0.5) * 14;

      rainPos[i * 3 + 1] =
        Math.random() * 12;

      rainPos[i * 3 + 2] =
        Math.random() * 50;
    }

    this.rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(rainPos, 3)
    );

    this.rainMat = new THREE.PointsMaterial({
      color: 0xa5c4e0,
      size: 0.08,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });

    this.rain = new THREE.Points(
      this.rainGeo,
      this.rainMat
    );

    this.scene.add(this.rain);

    // Cheap fake shadow under player
    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 16),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28
      })
    );

    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = 0.03;

    this.scene.add(this.playerShadow);
  }

  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.55,
      metalness: opts.metalness ?? 0.15,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0
    });
  }

  buildRoad() {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, ROAD_LEN),
      this.mat(0x2c3545, {
        roughness: 0.92,
        metalness: 0.08
      })
    );

    road.rotation.x = -Math.PI / 2;

    road.position.set(
      0,
      0,
      ROAD_LEN / 2 - 4
    );

    this.scene.add(road);

    const wear = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, ROAD_LEN),
      this.mat(0x243040, {
        roughness: 0.96,
        metalness: 0.04
      })
    );

    wear.rotation.x = -Math.PI / 2;

    wear.position.set(
      0,
      0.005,
      ROAD_LEN / 2 - 4
    );

    this.scene.add(wear);

    for (const sx of [-5.7, 5.7]) {
      const shoulder = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, ROAD_LEN),
        this.mat(0x5c5346, {
          roughness: 0.98
        })
      );

      shoulder.rotation.x = -Math.PI / 2;

      shoulder.position.set(
        sx,
        0.01,
        ROAD_LEN / 2 - 4
      );

      this.scene.add(shoulder);
    }

    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xeab308
    });

    for (const lx of [-4.5, 4.5]) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, ROAD_LEN),
        lineMat
      );

      line.rotation.x = -Math.PI / 2;

      line.position.set(
        lx,
        0.02,
        ROAD_LEN / 2 - 4
      );

      this.scene.add(line);
    }

    const white = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0
    });

    for (let z = 0; z < ROAD_LEN; z += 8) {
      for (const lx of [-4.35, 4.35]) {
        const tick = new THREE.Mesh(
          new THREE.PlaneGeometry(0.2, 0.6),
          white
        );

        tick.rotation.x = -Math.PI / 2;

        tick.position.set(
          lx,
          0.022,
          z
        );

        this.scene.add(tick);
      }
    }

    this.laneMarks = new THREE.Group();

    const dashMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24
    });

    for (let z = 0; z < ROAD_LEN; z += 3.2) {
      for (const lx of [-1.2, 1.2]) {
        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(0.1, 1.4),
          dashMat
        );

        dash.rotation.x = -Math.PI / 2;

        dash.position.set(
          lx,
          0.025,
          z
        );

        this.laneMarks.add(dash);
      }
    }

    this.scene.add(this.laneMarks);
  }

  buildCityscape() {
    this.buildings = new THREE.Group();

    const colors = [
      0x1e293b,
      0x273449,
      0x334155,
      0x3b4a5c,
      0x1a2332,
      0x445566,
      0x5c4033
    ];

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

    for (const side of [-1, 1]) {
      for (let i = 0; i < types.length; i += 1) {
        const z =
          i * 6.5 +
          (side > 0 ? 2 : 0);

        const xBase =
          side *
          (6.8 + (i % 3) * 0.4);

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
        } else if (kind === 'shop') {
          this.addShop(
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

    for (let i = 0; i < 10; i += 1) {
      const side =
        i % 2 === 0 ? -1 : 1;

      this.addPedestrian(
        side * 5.0,
        i * 9 + 4
      );
    }

    this.scene.add(this.buildings);

    this.sky = new THREE.Mesh(
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
        side: THREE.BackSide
      })
    );

    this.sky.position.y = -2;

    this.scene.add(this.sky);
  }

  addHouse(x, z, side, color) {
    const bw =
      1.6 + Math.random() * 1.2;

    const bh =
      2.2 + Math.random() * 2.5;

    const bd =
      1.5 + Math.random() * 1.2;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw,
        bh,
        bd
      ),
      this.mat(color, {
        roughness: 0.9
      })
    );

    mesh.position.set(
      x,
      bh / 2,
      z
    );

    this.buildings.add(mesh);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw + 0.2,
        0.15,
        bd + 0.2
      ),
      this.mat(0x44403c, {
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
        0.35,
        0.7,
        0.08
      ),
      this.mat(0x292524, {
        roughness: 0.8
      })
    );

    door.position.set(
      x - side * 0.1,
      0.35,
      z +
        (side > 0
          ? -bd / 2 - 0.02
          : bd / 2 + 0.02)
    );

    this.buildings.add(door);
  }

  addShop(x, z, side, color) {
    const bw = 2.0;
    const bh = 2.4;
    const bd = 1.6;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw,
        bh,
        bd
      ),
      this.mat(
        color || 0xb45309,
        {
          roughness: 0.85
        }
      )
    );

    mesh.position.set(
      x,
      bh / 2,
      z
    );

    this.buildings.add(mesh);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw + 0.3,
        0.08,
        0.7
      ),
      this.mat(0xdc2626, {
        roughness: 0.7
      })
    );

    awning.position.set(
      x - side * 0.3,
      bh * 0.75,
      z
    );

    this.buildings.add(awning);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(
        bw * 0.8,
        0.35,
        0.08
      ),
      this.mat(0xfbbf24, {
        roughness: 0.5,
        emissive: 0xb45309,
        emissiveIntensity: 0.15
      })
    );

    sign.position.set(
      x - side * 0.05,
      bh * 0.9,
      z +
        (side > 0
          ? -bd / 2 - 0.05
          : bd / 2 + 0.05)
    );

    this.buildings.add(sign);
  }

  addMosque(x, z, side) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.4,
        2.8,
        2.0
      ),
      this.mat(0x0f766e, {
        roughness: 0.8
      })
    );

    base.position.set(
      x,
      1.4,
      z
    );

    this.buildings.add(base);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.85,
        12,
        10,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ),
      this.mat(0xf5f5f4, {
        roughness: 0.4,
        metalness: 0.2
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
        0.18,
        0.22,
        4.2,
        10
      ),
      this.mat(0x0d9488, {
        roughness: 0.75
      })
    );

    minaret.position.set(
      x + side * 1.1,
      2.1,
      z - 0.6
    );

    this.buildings.add(minaret);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(
        0.28,
        0.5,
        8
      ),
      this.mat(0xfbbf24, {
        roughness: 0.4,
        metalness: 0.3
      })
    );

    cap.position.set(
      x + side * 1.1,
      4.4,
      z - 0.6
    );

    this.buildings.add(cap);
  }

  addMarketStall(x, z, side) {
    for (const dx of [-0.7, 0.7]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.1,
          1.6,
          0.1
        ),
        this.mat(0x78716c, {
          roughness: 0.9
        })
      );

      post.position.set(
        x + dx,
        0.8,
        z
      );

      this.buildings.add(post);
    }

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.8,
        0.08,
        1.4
      ),
      this.mat(0xeab308, {
        roughness: 0.7
      })
    );

    canopy.position.set(
      x,
      1.65,
      z
    );

    this.buildings.add(canopy);

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.5,
        0.12,
        1.0
      ),
      this.mat(0xa16207, {
        roughness: 0.85
      })
    );

    table.position.set(
      x,
      0.7,
      z
    );

    this.buildings.add(table);

    const goodsColors = [
      0x22c55e,
      0xef4444,
      0x3b82f6
    ];

    for (let i = 0; i < 3; i += 1) {
      const goods = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.25,
          0.25,
          0.25
        ),
        this.mat(goodsColors[i], {
          roughness: 0.6
        })
      );

      goods.position.set(
        x - 0.4 + i * 0.4,
        0.95,
        z
      );

      this.buildings.add(goods);
    }
  }

  addPetrol(x, z, side) {
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(
        3.2,
        0.12,
        2.2
      ),
      this.mat(0xdc2626, {
        roughness: 0.5
      })
    );

    canopy.position.set(
      x,
      2.4,
      z
    );

    this.buildings.add(canopy);

    for (const dx of [-1.2, 1.2]) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.12,
          0.12,
          2.4,
          8
        ),
        this.mat(0xf8fafc, {
          roughness: 0.4,
          metalness: 0.3
        })
      );

      pillar.position.set(
        x + dx,
        1.2,
        z
      );

      this.buildings.add(pillar);
    }

    const pump = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.5,
        1.2,
        0.4
      ),
      this.mat(0x1e293b, {
        roughness: 0.6
      })
    );

    pump.position.set(
      x,
      0.6,
      z + 0.5
    );

    this.buildings.add(pump);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.2,
        0.5,
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
      2.7,
      z
    );

    this.buildings.add(sign);
  }

  addBusStop(x, z, side) {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.0,
        0.08,
        1.2
      ),
      this.mat(0x334155, {
        roughness: 0.7
      })
    );

    roof.position.set(
      x,
      2.0,
      z
    );

    this.buildings.add(roof);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.0,
        1.4,
        0.08
      ),
      this.mat(0x475569, {
        roughness: 0.8
      })
    );

    back.position.set(
      x,
      1.2,
      z - side * 0.5
    );

    this.buildings.add(back);

    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.6,
        0.12,
        0.4
      ),
      this.mat(0x78716c, {
        roughness: 0.85
      })
    );

    bench.position.set(
      x,
      0.5,
      z
    );

    this.buildings.add(bench);
  }

  addStreetLight(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.05,
        0.06,
        3.2,
        6
      ),
      this.mat(0x64748b, {
        roughness: 0.6,
        metalness: 0.4
      })
    );

    pole.position.set(
      x,
      1.6,
      z
    );

    this.buildings.add(pole);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.18,
        8,
        8
      ),
      this.mat(0xfde047, {
        emissive: 0xfbbf24,
        emissiveIntensity: 0.6,
        roughness: 0.3
      })
    );

    lamp.position.set(
      x,
      3.25,
      z
    );

    this.buildings.add(lamp);
  }

  addBillboard(x, z) {
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.1,
        2.5,
        0.1
      ),
      this.mat(0x475569, {
        roughness: 0.7
      })
    );

    pole.position.set(
      x,
      1.25,
      z
    );

    this.buildings.add(pole);

    const col =
      Math.abs(z) % 12 < 6
        ? 0xe11d48
        : 0x2563eb;

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.2,
        1.1,
        0.08
      ),
      this.mat(col, {
        roughness: 0.5,
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
    const shirtColors = [
      0x3b82f6,
      0xec4899,
      0x22c55e,
      0xeab308,
      0xa855f7,
      0xf8fafc
    ];

    const shirt =
      shirtColors[
        Math.floor(
          Math.random() * shirtColors.length
        )
      ];

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.28,
        0.5,
        0.2
      ),
      this.mat(shirt, {
        roughness: 0.8
      })
    );

    body.position.set(
      x,
      0.85,
      z
    );

    this.buildings.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.14,
        8,
        8
      ),
      this.mat(0xfcd34d, {
        roughness: 0.7
      })
    );

    head.position.set(
      x,
      1.25,
      z
    );

    this.buildings.add(head);

    for (const dx of [-0.07, 0.07]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.1,
          0.45,
          0.1
        ),
        this.mat(0x1e293b, {
          roughness: 0.9
        })
      );

      leg.position.set(
        x + dx,
        0.35,
        z
      );

      this.buildings.add(leg);
    }
  }

  /**
   * Recognizable Adaidaita Sahu (3-wheeler)
   */
  makeKeke(bodyColor = 0xfbbf24, isPlayer = false) {
    const group = new THREE.Group();

    const bodyM = this.mat(bodyColor, {
      roughness: 0.45,
      metalness: 0.2
    });

    const dark = this.mat(0x1e293b, {
      roughness: 0.7
    });

    const roofM = this.mat(
      isPlayer ? 0xfde047 : 0xeab308,
      {
        roughness: 0.4
      }
    );

    const chrome = this.mat(0x94a3b8, {
      roughness: 0.3,
      metalness: 0.7
    });

    const tire = this.mat(0x0f172a, {
      roughness: 0.95
    });

    const body = new THREE.Mesh(
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

    group.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.22,
        0.08,
        1.36
      ),
      this.mat(0xca8a04, {
        roughness: 0.5
      })
    );

    stripe.position.set(
      0,
      0.38,
      -0.05
    );

    group.add(stripe);

    const canopy = new THREE.Mesh(
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

    group.add(canopy);

    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.35,
        0.08,
        0.12
      ),
      roofM
    );

    lip.position.set(
      0,
      1.15,
      0.5
    );

    group.add(lip);

    for (const x of [-0.55, 0.55]) {
      const pillarFront = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.07,
          0.55,
          0.07
        ),
        dark
      );

      pillarFront.position.set(
        x,
        0.95,
        0.45
      );

      group.add(pillarFront);

      const pillarRear = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.07,
          0.55,
          0.07
        ),
        dark
      );

      pillarRear.position.set(
        x,
        0.95,
        -0.45
      );

      group.add(pillarRear);
    }

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.05,
        0.38,
        0.06
      ),
      this.mat(0x38bdf8, {
        roughness: 0.2,
        metalness: 0.3
      })
    );

    windshield.position.set(
      0,
      0.95,
      0.58
    );

    group.add(windshield);

    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.95,
        0.38,
        0.35
      ),
      dark
    );

    nose.position.set(
      0,
      0.58,
      0.72
    );

    group.add(nose);

    const lightM = this.mat(0xfde047, {
      roughness: 0.3,
      emissive: 0xfbbf24,
      emissiveIntensity: isPlayer
        ? 0.85
        : 0.4
    });

    for (const x of [-0.3, 0.3]) {
      const headlight = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.09,
          10,
          10
        ),
        lightM
      );

      headlight.position.set(
        x,
        0.58,
        0.92
      );

      group.add(headlight);
    }

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.03,
        0.03,
        0.7,
        8
      ),
      chrome
    );

    bar.rotation.z = Math.PI / 2;

    bar.position.set(
      0,
      0.85,
      0.7
    );

    group.add(bar);

    const bench = new THREE.Mesh(
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

    group.add(bench);

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.45,
        0.14,
        0.03
      ),
      this.mat(0xf8fafc, {
        roughness: 0.6
      })
    );

    plate.position.set(
      0,
      0.35,
      0.9
    );

    group.add(plate);

    const makeWheel = (x, z, radius = 0.24) => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(
          radius,
          radius,
          0.16,
          14
        ),
        tire
      );

      wheel.rotation.z = Math.PI / 2;

      wheel.position.set(
        x,
        radius,
        z
      );

      group.add(wheel);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(
          radius * 0.35,
          radius * 0.35,
          0.18,
          10
        ),
        chrome
      );

      hub.rotation.z = Math.PI / 2;

      hub.position.set(
        x,
        radius,
        z
      );

      group.add(hub);

      return wheel;
    };

    makeWheel(
      -0.58,
      -0.5,
      0.24
    );

    makeWheel(
      0.58,
      -0.5,
      0.24
    );

    makeWheel(
      0,
      0.78,
      0.22
    );

    const fork = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.08,
        0.4,
        0.08
      ),
      chrome
    );

    fork.position.set(
      0,
      0.45,
      0.78
    );

    group.add(fork);

    group.userData.kind = 'keke';

    return group;
  }

  /**
   * Better sedan / generic car
   */
  makeCar(color = 0xdc2626) {
    const group = new THREE.Group();

    const bodyM = this.mat(color, {
      roughness: 0.4,
      metalness: 0.3
    });

    const dark = this.mat(0x0f172a, {
      roughness: 0.85
    });

    const glass = this.mat(0x1e3a5f, {
      roughness: 0.15,
      metalness: 0.4
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.35,
        0.38,
        2.3
      ),
      bodyM
    );

    body.position.y = 0.42;

    group.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.2,
        0.4,
        1.15
      ),
      bodyM
    );

    cabin.position.set(
      0,
      0.78,
      -0.15
    );

    group.add(cabin);

    const window = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.1,
        0.28,
        1.0
      ),
      glass
    );

    window.position.set(
      0,
      0.82,
      -0.12
    );

    group.add(window);

    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(
        1.25,
        0.12,
        0.55
      ),
      bodyM
    );

    hood.position.set(
      0,
      0.55,
      0.85
    );

    group.add(hood);

    const lightM = this.mat(0xfde047, {
      emissive: 0xfbbf24,
      emissiveIntensity: 0.5
    });

    for (const x of [-0.4, 0.4]) {
      const headlight = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.18,
          0.1,
          0.06
        ),
        lightM
      );

      headlight.position.set(
        x,
        0.4,
        1.18
      );

      group.add(headlight);
    }

    for (const [
      x,
      z
    ] of [
      [-0.55, 0.75],
      [0.55, 0.75],
      [-0.55, -0.75],
      [0.55, -0.75]
    ]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.22,
          0.22,
          0.14,
          12
        ),
        dark
      );

      wheel.rotation.z = Math.PI / 2;

      wheel.position.set(
        x,
        0.22,
        z
      );

      group.add(wheel);
    }

    group.userData.kind = 'car';

    group.userData.recolor = [
      body,
      cabin,
      hood
    ];

    return group;
  }

  /**
   * Police / KAROTA variant
   */
  makeEnforcer(kind = 'police') {
    const color =
      kind === 'karota'
        ? 0xf59e0b
        : 0x1e40af;

    const group = this.makeCar(color);

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.7,
        0.12,
        0.25
      ),
      this.mat(0x1e293b, {
        roughness: 0.5
      })
    );

    bar.position.set(
      0,
      1.05,
      -0.1
    );

    group.add(bar);

    const red = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.28,
        0.1,
        0.2
      ),
      this.mat(0xef4444, {
        emissive: 0xef4444,
        emissiveIntensity: 0.7
      })
    );

    red.position.set(
      -0.2,
      1.05,
      -0.1
    );

    group.add(red);

    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.28,
        0.1,
        0.2
      ),
      this.mat(0x3b82f6, {
        emissive: 0x3b82f6,
        emissiveIntensity: 0.7
      })
    );

    blue.position.set(
      0.2,
      1.05,
      -0.1
    );

    group.add(blue);

    group.userData.kind = kind;

    return group;
  }

  makeZone(color) {
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(
        0.55,
        0.78,
        28
      ),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      })
    );

    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;

    group.add(ring);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(
        0.5,
        24
      ),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide
      })
    );

    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;

    group.add(disc);

    return group;
  }

  makeCoin() {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.3,
        0.3,
        0.07,
        18
      ),
      this.mat(0xfbbf24, {
        metalness: 0.75,
        roughness: 0.22,
        emissive: 0xb45309,
        emissiveIntensity: 0.3
      })
    );

    mesh.rotation.x = Math.PI / 2;

    return mesh;
  }

  /**
   * Swap pool vehicle appearance to match obstacle type.
   */
  styleVehicle(mesh, type) {
    if (!mesh) return;

    const normalized =
      typeof type === 'string'
        ? type.toLowerCase()
        : 'car';

    const col =
      normalized === 'karota'
        ? 0xf59e0b
        : normalized === 'police'
          ? 0x1e40af
          : normalized === 'keke'
            ? 0xeab308
            : normalized === 'car'
              ? 0xdc2626
              : 0x64748b;

    mesh.traverse((child) => {
      if (
        !child.isMesh ||
        !child.material ||
        !child.material.color ||
        !child.geometry
      ) {
        return;
      }

      if (
        child.geometry.type !== 'BoxGeometry'
      ) {
        return;
      }

      const parameters =
        child.geometry.parameters;

      if (
        parameters &&
        parameters.height &&
        parameters.height < 0.3 &&
        parameters.depth &&
        parameters.depth < 1.1
      ) {
        return;
      }

      child.material.color.setHex(col);
    });

    if (normalized === 'keke') {
      mesh.scale.set(
        0.9,
        0.9,
        0.75
      );
    } else if (
      normalized === 'police' ||
      normalized === 'karota'
    ) {
      mesh.scale.set(
        1.05,
        1.05,
        1.05
      );
    } else {
      mesh.scale.set(
        1,
        1,
        1
      );
    }
  }

  screenYToZ(y, playerY) {
    const safePlayerY =
      Number.isFinite(Number(playerY))
        ? Number(playerY)
        : 500;

    const safeY =
      Number.isFinite(Number(y))
        ? Number(y)
        : safePlayerY;

    const t =
      (safePlayerY - safeY) /
      Math.max(safePlayerY, 1);

    return PLAYER_Z + t * 58;
  }

  laneToX(lane) {
    const safeLane =
      Number.isFinite(Number(lane))
        ? Math.round(Number(lane))
        : 1;

    return LANE_X[
      Math.max(
        0,
        Math.min(
          2,
          safeLane
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

    this.player.traverse((child) => {
      if (
        !child.isMesh ||
        !child.material ||
        !child.material.color ||
        !child.geometry
      ) {
        return;
      }

      if (
        child.geometry.type !== 'BoxGeometry'
      ) {
        return;
      }

      const parameters =
        child.geometry.parameters;

      if (
        parameters &&
        parameters.width >= 1.0 &&
        parameters.height >= 0.4 &&
        parameters.height <= 0.6
      ) {
        child.material.color.setHex(col);
      }
    });
  }

  applyQuality(low) {
    if (!this.renderer) return;

    this.renderer.setPixelRatio(
      low
        ? 1
        : Math.min(
            window.devicePixelRatio || 1,
            1.75
          )
    );

    this.renderer.setSize(
      this.canvas?.clientWidth || 390,
      this.canvas?.clientHeight || 700,
      false
    );

    if (this.rain) {
      this.rain.visible = !low;
    }

    if (this.dust && low) {
      this.dustMat.opacity =
        Math.min(
          this.dustMat.opacity,
          0.15
        );
    }
  }

  resize() {
    if (
      !this.renderer ||
      !this.camera ||
      !this.canvas
    ) {
      return;
    }

    const w =
      this.canvas.clientWidth || 390;

    const h =
      this.canvas.clientHeight || 700;

    this.camera.aspect =
      w / Math.max(h, 1);

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

  /**
   * Game can call draw(this).
   * Actual frame rendering remains inside render().
   */
  draw(game = this.game) {
    if (game) {
      this.game = game;
    }

    this.render(this.game);
  }

  /**
   * Safe weather notification hook.
   * The previous renderer called this method without defining it,
   * which could crash the game when weather changed.
   */
  uiWeatherToast(message) {
    if (!message) return;

    const game = this.game;

    try {
      if (
        game &&
        typeof game.setUI === 'function'
      ) {
        game.setUI({
          weatherToast: message
        });
      }
    } catch {
      // UI toast support is optional.
    }
  }

  render(game = this.game) {
    if (game) {
      this.game = game;
    }

    if (
      !this.ready ||
      !this.renderer ||
      !this.scene ||
      !this.camera
    ) {
      return;
    }

    const g = this.game;

    if (!g) {
      this.renderer.render(
        this.scene,
        this.camera
      );
      return;
    }

    const tod =
      typeof g.getTimeOfDay === 'function'
        ? g.getTimeOfDay()
        : 0.2;

    const spd =
      Number.isFinite(Number(g.speed))
        ? Number(g.speed)
        : 3;

    // Day / dusk / night
    if (tod > 0.62) {
      this.renderer.setClearColor(
        0x020617,
        1
      );

      this.scene.fog.color.setHex(
        0x020617
      );

      this.scene.fog.near = 22;
      this.scene.fog.far = 75;

      this.sun.intensity = 0.18;
      this.hemlight.intensity = 0.12;

      if (this.sky?.material) {
        this.sky.material.color.setHex(
          0x020617
        );
      }
    } else if (tod > 0.42) {
      this.renderer.setClearColor(
        0x7c3aed,
        1
      );

      this.scene.fog.color.setHex(
        0x4c1d95
      );

      this.scene.fog.near = 28;
      this.scene.fog.far = 90;

      this.sun.intensity = 0.45;
      this.hemlight.intensity = 0.25;

      if (this.sky?.material) {
        this.sky.material.color.setHex(
          0x5b21b6
        );
      }
    } else if (tod > 0.28) {
      this.renderer.setClearColor(
        0x38bdf8,
        1
      );

      this.scene.fog.color.setHex(
        0x7dd3fc
      );

      this.scene.fog.near = 35;
      this.scene.fog.far = 100;

      this.sun.intensity = 1.05;
      this.hemlight.intensity = 0.4;

      if (this.sky?.material) {
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

      this.scene.fog.near = 40;
      this.scene.fog.far = 110;

      this.sun.intensity = 1.2;
      this.hemlight.intensity = 0.5;

      if (this.sky?.material) {
        this.sky.material.color.setHex(
          0x7dd3fc
        );
      }
    }

    // Weather cycle
    if (
      (g.frame || 0) % 900 === 0 &&
      g.state === 1
    ) {
      const random =
        Math.random();

      this.weather =
        random < 0.55
          ? 'clear'
          : random < 0.8
            ? 'harmattan'
            : 'rain';

      if (
        this.weather === 'rain'
      ) {
        this.uiWeatherToast(
          'Rain in Kano'
        );
      }

      if (
        this.weather === 'harmattan'
      ) {
        this.uiWeatherToast(
          'Harmattan haze'
        );
      }
    }

    // Weather appearance
    if (
      this.weather === 'rain'
    ) {
      this.rainMat.opacity = 0.55;
      this.dustMat.opacity = 0.08;

      this.scene.fog.near =
        Math.min(
          this.scene.fog.near,
          25
        );

      this.sun.intensity *= 0.6;
    } else if (
      this.weather === 'harmattan'
    ) {
      this.rainMat.opacity = 0;
      this.dustMat.opacity = 0.55;

      this.dustMat.color.setHex(
        0xd4c4a8
      );

      this.scene.fog.color.lerp(
        new THREE.Color(0xc4b5a0),
        0.35
      );

      this.sun.intensity *= 0.75;
    } else {
      this.rainMat.opacity = 0;

      this.dustMat.opacity =
        0.2 +
        Math.min(
          0.25,
          spd * 0.03
        );

      this.dustMat.color.setHex(
        0xc4b5a0
      );
    }

    // Animate dust
    if (this.dust) {
      const position =
        this.dust.geometry.attributes
          .position.array;

      for (
        let i = 0;
        i < position.length;
        i += 3
      ) {
        position[i + 2] -=
          spd * 0.08;

        if (
          position[i + 2] < 1
        ) {
          position[i] =
            (Math.random() - 0.5) * 8;

          position[i + 1] =
            Math.random() * 1.2;

          position[i + 2] =
            35 +
            Math.random() * 15;
        }
      }

      this.dust.geometry.attributes
        .position.needsUpdate = true;
    }

    // Animate rain
    if (
      this.rain &&
      this.rainMat.opacity > 0.05
    ) {
      const position =
        this.rain.geometry.attributes
          .position.array;

      for (
        let i = 0;
        i < position.length;
        i += 3
      ) {
        position[i + 1] -=
          0.45;

        position[i + 2] -=
          spd * 0.05;

        if (
          position[i + 1] < 0
        ) {
          position[i] =
            (Math.random() - 0.5) * 14;

          position[i + 1] =
            8 +
            Math.random() * 6;

          position[i + 2] =
            Math.random() * 45;
        }
      }

      this.rain.geometry.attributes
        .position.needsUpdate = true;
    }

    // Road movement
    if (this.laneMarks) {
      this.laneMarks.position.z =
        -((g.roadOff || 0) * 0.08) %
        3.2;
    }

    if (this.buildings) {
      this.buildings.position.z =
        -((g.roadOff || 0) * 0.04) %
        6.2;
    }

    // Player keke
    if (this.player) {
      const targetX =
        this.laneToX(
          g.playerLane
        );

      this.player.position.x +=
        (targetX -
          this.player.position.x) *
        0.22;

      this.player.position.z =
        PLAYER_Z;

      this.player.position.y =
        g.bounce > 0
          ? Math.sin(
              g.bounce * 0.9
            ) * 0.1
          : 0;

      this.player.rotation.y =
        (targetX -
          this.player.position.x) *
        0.1;

      this.player.rotation.z =
        (this.player.position.x -
          targetX) *
        0.06;

      if (this.playerShadow) {
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
    }

    // Camera
    let shakeX = 0;
    let shakeY = 0;

    if (g.shake > 0) {
      const shakeMag =
        Number.isFinite(
          Number(g.shakeMag)
        )
          ? Number(g.shakeMag)
          : 4;

      shakeX =
        (Math.random() - 0.5) *
        shakeMag *
        0.03;

      shakeY =
        (Math.random() - 0.5) *
        shakeMag *
        0.02;
    }

    const playerX =
      this.player
        ? this.player.position.x
        : 0;

    const targetFov =
      50 +
      Math.min(
        8,
        Math.max(
          0,
          spd - 4
        ) * 1.5
      );

    this.camera.fov +=
      (targetFov -
        this.camera.fov) *
      0.05;

    this.camera.updateProjectionMatrix();

    this.camera.position.x =
      playerX * 0.4 +
      shakeX;

    this.camera.position.y =
      6.2 +
      shakeY;

    this.camera.position.z =
      -3.5;

    this.camera.lookAt(
      playerX * 0.25,
      0.9,
      16
    );

    // Traffic
    const playerY =
      Number.isFinite(
        Number(g.playerY)
      )
        ? Number(g.playerY)
        : 500;

    let vehicleIndex = 0;

    for (const obstacle of g.obs || []) {
      if (
        vehicleIndex >=
        this.vehiclePool.length
      ) {
        break;
      }

      const mesh =
        this.vehiclePool[
          vehicleIndex++
        ];

      mesh.visible = true;

      mesh.position.x =
        this.laneToX(
          obstacle?.lane
        );

      mesh.position.z =
        this.screenYToZ(
          obstacle?.y,
          playerY
        );

      mesh.position.y = 0;

      this.styleVehicle(
        mesh,
        obstacle?.type || 'car'
      );
    }

    while (
      vehicleIndex <
      this.vehiclePool.length
    ) {
      this.vehiclePool[
        vehicleIndex++
      ].visible = false;
    }

    // Passenger and destination zones
    let zoneIndex = 0;

    const passengerZones =
      (g.paxZones || [])
        .filter(
          (passenger) =>
            passenger &&
            !passenger.taken
        )
        .map((passenger) => ({
          ...passenger,
          kind: 'p'
        }));

    const dropZones =
      (g.dropZones || [])
        .filter(
          (drop) =>
            drop &&
            !drop.used
        )
        .map((drop) => ({
          ...drop,
          kind: 'd'
        }));

    const zones = [
      ...passengerZones,
      ...dropZones
    ];

    for (const zone of zones) {
      if (
        zoneIndex >=
        this.zonePool.length
      ) {
        break;
      }

      const mesh =
        this.zonePool[
          zoneIndex++
        ];

      mesh.visible = true;

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
            child.material?.color
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
          (g.frame || 0) * 0.12
        ) *
        0.08;

      mesh.scale.set(
        pulse,
        1,
        pulse
      );
    }

    while (
      zoneIndex <
      this.zonePool.length
    ) {
      this.zonePool[
        zoneIndex++
      ].visible = false;
    }

    // Coins
    let coinIndex = 0;

    for (const coin of g.coins || []) {
      if (
        coin?.taken ||
        coinIndex >=
          this.coinPool.length
      ) {
        continue;
      }

      const mesh =
        this.coinPool[
          coinIndex++
        ];

      mesh.visible = true;

      mesh.position.x =
        this.laneToX(
          coin?.lane
        );

      mesh.position.z =
        this.screenYToZ(
          coin?.y,
          playerY
        );

      mesh.position.y =
        0.55 +
        Math.sin(
          Number.isFinite(
            Number(coin?.bob)
          )
            ? Number(coin.bob)
            : 0
        ) *
          0.15;

      mesh.rotation.y += 0.1;
    }

    while (
      coinIndex <
      this.coinPool.length
    ) {
      this.coinPool[
        coinIndex++
      ].visible = false;
    }

    this.renderer.render(
      this.scene,
      this.camera
    );
  }
}

export default Renderer3D;