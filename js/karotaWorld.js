// Kano Run — KAROTA checkpoint visual world layer
// Visual-only adapter: reads existing game state without replacing enforcement logic.

export class KarotaWorld {
  constructor(THREE, renderer, options = {}) {
    this.THREE = THREE;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'KarotaCheckpointWorld';
    this.renderer.world?.add(this.group);

    this.active = false;
    this.lastActive = false;
    this.elapsed = 0;
    this.pulse = 0;
    this.officer = null;
    this.vehicle = null;
    this.sign = null;
    this.barrier = null;
    this.lights = [];
    this.dust = [];

    this.build();
    this.group.visible = false;
  }

  mat(color, roughness = 0.72, metalness = 0.02, emissive = 0) {
    return new this.THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity: emissive ? 0.7 : 0,
    });
  }

  box(w, h, d, material) {
    const m = new this.THREE.Mesh(new this.THREE.BoxGeometry(w, h, d), material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  cylinder(r1, r2, h, material, segments = 16) {
    const m = new this.THREE.Mesh(new this.THREE.CylinderGeometry(r1, r2, h, segments), material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  textTexture(text, bg = '#111820', fg = '#f7d24b') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e0b62f';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.fillStyle = fg;
    ctx.font = 'bold 52px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    const texture = new this.THREE.CanvasTexture(canvas);
    texture.colorSpace = this.THREE.SRGBColorSpace;
    return texture;
  }

  build() {
    const T = this.THREE;
    const roadX = 0;

    // Side checkpoint canopy / frame.
    const frameMat = this.mat(0x22272b, 0.55, 0.25);
    const yellowMat = this.mat(0xf1c232, 0.5, 0.05);
    const darkMat = this.mat(0x15191c, 0.65, 0.05);

    const leftPost = this.box(0.28, 4.4, 0.28, frameMat);
    leftPost.position.set(-4.75, 2.2, -8);
    const rightPost = this.box(0.28, 4.4, 0.28, frameMat);
    rightPost.position.set(4.75, 2.2, -8);
    const top = this.box(9.8, 0.34, 0.3, frameMat);
    top.position.set(0, 4.25, -8);
    this.group.add(leftPost, rightPost, top);

    const sign = new T.Mesh(
      new T.PlaneGeometry(5.8, 1.45),
      new T.MeshStandardMaterial({ map: this.textTexture('KAROTA  •  CHECKPOINT'), roughness: 0.6, side: T.DoubleSide })
    );
    sign.position.set(0, 3.55, -8.18);
    sign.rotation.y = Math.PI;
    sign.castShadow = true;
    this.group.add(sign);
    this.sign = sign;

    // Traffic cones and lane guidance.
    for (const x of [-3.55, -1.8, 1.8, 3.55]) {
      const cone = this.cylinder(0.06, 0.22, 0.52, yellowMat, 12);
      cone.position.set(x, 0.26, -6.2);
      this.group.add(cone);
    }

    // Barrier arm.
    this.barrier = this.box(4.0, 0.13, 0.13, yellowMat);
    this.barrier.position.set(0, 1.05, -6.8);
    this.group.add(this.barrier);

    // Officer: simplified but recognisable uniformed figure.
    const officer = new T.Group();
    const uniform = this.mat(0x26313a);
    const skin = this.mat(0x704a32);
    const capMat = this.mat(0x111820);
    const torso = this.box(0.62, 1.0, 0.38, uniform);
    torso.position.y = 1.55;
    const head = this.cylinder(0.23, 0.23, 0.42, skin, 14);
    head.position.y = 2.28;
    head.rotation.z = Math.PI / 2;
    const cap = this.box(0.52, 0.11, 0.42, capMat);
    cap.position.set(0, 2.53, 0);
    const armL = this.box(0.16, 0.8, 0.18, uniform);
    armL.position.set(-0.44, 1.58, 0);
    const armR = armL.clone();
    armR.position.x = 0.44;
    const legL = this.box(0.18, 0.9, 0.2, uniform);
    legL.position.set(-0.18, 0.55, 0);
    const legR = legL.clone();
    legR.position.x = 0.18;
    officer.add(torso, head, cap, armL, armR, legL, legR);
    officer.position.set(-3.45, 0, -5.7);
    this.group.add(officer);
    this.officer = officer;

    // KAROTA patrol vehicle.
    const car = new T.Group();
    const body = this.box(1.9, 0.58, 4.15, darkMat);
    body.position.y = 0.56;
    const cabin = this.box(1.62, 0.58, 2.1, this.mat(0x33404a, 0.4, 0.1));
    cabin.position.set(0, 0.98, -0.15);
    const stripe = this.box(1.93, 0.16, 2.5, yellowMat);
    stripe.position.set(0, 0.78, -0.15);
    car.add(body, cabin, stripe);
    car.position.set(3.35, 0, -5.4);
    car.rotation.y = Math.PI;
    this.group.add(car);
    this.vehicle = car;

    // Flashing warning lamps.
    for (const x of [-0.18, 0.18]) {
      const lamp = this.box(0.14, 0.12, 0.14, this.mat(0x101010, 0.3, 0, 0));
      lamp.position.set(x, 1.38, -5.4);
      car.add(lamp);
      this.lights.push(lamp);
    }

    // Small checkpoint booth.
    const booth = this.box(1.5, 1.8, 1.3, this.mat(0xc9b98f));
    booth.position.set(5.25, 0.9, -8.3);
    this.group.add(booth);
    const roof = this.box(1.75, 0.18, 1.55, yellowMat);
    roof.position.set(5.25, 1.86, -8.3);
    this.group.add(roof);

    // Dust patches make the checkpoint feel grounded in Kano roadside conditions.
    for (let i = 0; i < 12; i += 1) {
      const p = new T.Mesh(
        new T.CircleGeometry(0.16 + Math.random() * 0.28, 8),
        new T.MeshStandardMaterial({ color: 0x8a7358, transparent: true, opacity: 0.18, depthWrite: false })
      );
      p.rotation.x = -Math.PI / 2;
      p.position.set((Math.random() - 0.5) * 10, 0.012, -10 + Math.random() * 8);
      this.group.add(p);
      this.dust.push(p);
    }
  }

  isActive(game) {
    if (!game) return false;
    const candidates = [
      game.karotaCheckpointActive,
      game.karotaActive,
      game.checkpointActive,
      game.atKarotaCheckpoint,
      game.inKarotaCheckpoint,
      game.karotaCheckpoint,
    ];

    if (candidates.some(v => v === true)) return true;
    if (candidates.some(v => v && typeof v === 'object')) return true;

    const state = String(game.state || game.phase || game.mode || '').toLowerCase();
    return state.includes('karota') || state.includes('checkpoint');
  }

  checkpointData(game) {
    const raw = game?.karotaCheckpoint || game?.checkpoint || {};
    return typeof raw === 'object' && raw ? raw : {};
  }

  update(delta, game) {
    this.elapsed += delta;
    this.pulse += delta;

    const active = this.isActive(game);
    this.active = active;
    this.group.visible = active;
    if (!active) return;

    const data = this.checkpointData(game);
    const progress = Number(data.progress ?? game?.karotaCheckpointProgress ?? 0);
    const stopped = Boolean(data.stopped ?? game?.karotaStopped ?? game?.checkpointStopped);

    // Bring checkpoint toward the player as the gameplay screen-space road advances.
    const distance = Number(game?.roadOff ?? game?.dist ?? 0);
    const phaseOffset = ((distance % 170) / 170) * 20;
    this.group.position.z = -8 - phaseOffset;

    this.officer.rotation.y = Math.sin(this.pulse * 1.4) * 0.08;
    this.officer.children[3].rotation.z = Math.sin(this.pulse * 5.5) * 0.35;
    this.officer.children[4].rotation.z = -Math.sin(this.pulse * 5.5) * 0.35;

    this.barrier.rotation.z = stopped ? 0 : -0.65;
    this.barrier.position.y = stopped ? 1.05 : 0.72;

    const flash = Math.floor(this.pulse * 5) % 2 === 0;
    this.lights.forEach((lamp, i) => {
      lamp.material.color.setHex(flash === (i === 0) ? 0xe63232 : 0x2f4c58);
      lamp.material.emissive.setHex(flash === (i === 0) ? 0xe63232 : 0x142027);
      lamp.material.emissiveIntensity = flash === (i === 0) ? 1.8 : 0.4;
    });

    // If the game supplies inspection progress, make the sign pulse during the stop.
    const pulse = stopped ? 1 + Math.sin(this.pulse * 8) * 0.035 : 1;
    this.sign.scale.set(pulse, pulse, pulse);
    this.sign.position.y = 3.55 + Math.sin(progress * Math.PI) * 0.04;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.group.traverse(obj => {
      if (obj.geometry?.dispose) obj.geometry.dispose();
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(m => {
          if (m.map?.dispose) m.map.dispose();
          if (m.dispose) m.dispose();
        });
      }
    });
  }
}

export default KarotaWorld;
