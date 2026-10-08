// Kano Run — enforcement world layer
// Visual-only presentation for KAROTA/police checkpoints and active pursuit.
// Game.js remains authoritative for fines, negotiation, wanted state and chase timers.

export class EnforcementWorld {
  constructor(THREE, renderer) {
    this.THREE = THREE;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'enforcement-world';
    renderer.world.add(this.group);

    this.checkpointPool = [];
    this.chaseVehicle = null;
    this.elapsed = 0;
    this.tmp = new THREE.Vector3();

    this.buildCheckpointPool(3);
    this.buildChaseVehicle();
  }

  mat(color, options = {}) {
    return new this.THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.78,
      metalness: options.metalness ?? 0.05,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
    });
  }

  box(parent, size, pos, material, rotation = null) {
    const m = new this.THREE.Mesh(new this.THREE.BoxGeometry(...size), material);
    m.position.set(...pos);
    if (rotation) m.rotation.set(...rotation);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  cyl(parent, radius, height, pos, material, radial = 10) {
    const m = new this.THREE.Mesh(new this.THREE.CylinderGeometry(radius, radius, height, radial), material);
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  sphere(parent, radius, pos, material) {
    const m = new this.THREE.Mesh(new this.THREE.SphereGeometry(radius, 12, 8), material);
    m.position.set(...pos);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  makeOfficer(seed = 0) {
    const T = this.THREE;
    const g = new T.Group();
    const skin = this.mat(0x6a432e);
    const uniform = this.mat(seed % 2 ? 0x2e4853 : 0x3a4d55);
    const dark = this.mat(0x172126);
    const reflective = this.mat(0xf0c94d, { emissive: 0x5b430b, emissiveIntensity: 0.18 });

    this.sphere(g, 0.16, [0, 1.48, 0], skin);
    this.box(g, [0.32, 0.52, 0.22], [0, 1.08, 0], uniform);
    this.box(g, [0.07, 0.42, 0.07], [-0.2, 1.08, 0], skin);
    this.box(g, [0.07, 0.42, 0.07], [0.2, 1.08, 0], skin);
    this.box(g, [0.09, 0.5, 0.09], [-0.08, 0.5, 0], dark);
    this.box(g, [0.09, 0.5, 0.09], [0.08, 0.5, 0], dark);
    this.box(g, [0.36, 0.08, 0.3], [0, 1.66, 0], dark);
    this.box(g, [0.08, 0.06, 0.03], [0.12, 1.15, -0.13], reflective);

    g.userData.rightArm = g.children[3];
    g.userData.leftArm = g.children[2];
    return g;
  }

  makeCheckpoint(index) {
    const T = this.THREE;
    const g = new T.Group();
    g.visible = false;

    const asphalt = this.mat(0x24292b, { roughness: 0.92 });
    const yellow = this.mat(0xf1c84b, { emissive: 0x6a4c0b, emissiveIntensity: 0.22 });
    const white = this.mat(0xe7e7dc);
    const red = this.mat(0xb82d27, { emissive: 0x3c0805, emissiveIntensity: 0.25 });
    const dark = this.mat(0x171c1f);

    // Portable inspection islands and cones.
    for (const x of [-3.9, 3.9]) {
      this.box(g, [0.62, 0.14, 1.7], [x, 0.07, 0], asphalt);
      for (let i = -1; i <= 1; i += 1) {
        this.cyl(g, 0.075, 0.55, [x + i * 0.17, 0.36, 0.45], red, 8);
      }
    }

    // Raised barrier spanning the road.
    const barrierPivot = new T.Group();
    barrierPivot.position.set(-3.1, 0.92, 0);
    g.add(barrierPivot);
    this.box(barrierPivot, [6.1, 0.1, 0.12], [3.05, 0, 0], white);
    this.box(barrierPivot, [0.34, 0.12, 0.16], [0.2, 0, 0], red);
    this.box(barrierPivot, [0.34, 0.12, 0.16], [1.4, 0, 0], red);
    this.box(barrierPivot, [0.34, 0.12, 0.16], [2.6, 0, 0], red);
    barrierPivot.rotation.z = -0.02;

    // KAROTA inspection sign.
    const board = new T.Group();
    this.box(board, [2.35, 0.72, 0.08], [0, 2.15, 0], yellow);
    this.box(board, [2.12, 0.48, 0.09], [0, 2.15, -0.055], dark);
    board.position.set(0, 0, 0);
    g.add(board);

    const officer = this.makeOfficer(index);
    officer.position.set(2.15, 0, 0.2);
    officer.rotation.y = -Math.PI / 2;
    g.add(officer);

    // Small booth.
    const booth = new T.Group();
    this.box(booth, [1.15, 1.35, 0.9], [0, 0.68, 2.0], white);
    this.box(booth, [1.28, 0.12, 1.02], [0, 1.4, 2.0], dark);
    this.box(booth, [0.55, 0.42, 0.05], [0, 0.9, 1.53], dark);
    booth.position.x = -2.35;
    g.add(booth);

    g.userData.barrier = barrierPivot;
    g.userData.officer = officer;
    g.userData.phase = index * 1.73;
    g.userData.index = index;
    this.group.add(g);
    this.checkpointPool.push(g);
  }

  buildCheckpointPool(count) {
    for (let i = 0; i < count; i += 1) this.makeCheckpoint(i);
  }

  buildChaseVehicle() {
    const T = this.THREE;
    const g = new T.Group();
    const body = this.mat(0x26343c, { roughness: 0.56 });
    const white = this.mat(0xe6e6df, { roughness: 0.65 });
    const glass = this.mat(0x18252d, { roughness: 0.2, metalness: 0.18 });
    const red = this.mat(0xd9342b, { emissive: 0x8c0805, emissiveIntensity: 1.5 });
    const blue = this.mat(0x2c75ff, { emissive: 0x0a2caa, emissiveIntensity: 1.5 });

    this.box(g, [1.9, 0.68, 4.0], [0, 0.55, 0], body);
    this.box(g, [1.52, 0.62, 1.65], [0, 1.0, -0.25], glass);
    this.box(g, [1.98, 0.12, 0.4], [0, 0.94, 0.55], white);
    this.box(g, [0.38, 0.1, 0.13], [-0.38, 1.48, -0.1], red);
    this.box(g, [0.38, 0.1, 0.13], [0.38, 1.48, -0.1], blue);

    g.userData.red = g.children[g.children.length - 2];
    g.userData.blue = g.children[g.children.length - 1];
    g.position.set(0, 0, PLAYER_Z + 15);
    g.visible = false;
    this.group.add(g);
    this.chaseVehicle = g;
  }

  update(dt, game) {
    this.elapsed += dt;
    const checkpoints = Array.isArray(game?.checkpoints) ? game.checkpoints : [];

    for (let i = 0; i < this.checkpointPool.length; i += 1) {
      const mesh = this.checkpointPool[i];
      const cp = checkpoints[i];
      if (!cp) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;
      mesh.position.x = 0;
      mesh.position.z = this.renderer.screenYToZ(Number(cp.y) || 0, Number(game.playerY) || 500);
      mesh.position.y = 0;

      const phase = this.elapsed * 3 + mesh.userData.phase;
      const active = Boolean(game.eventOpen) && game.eventType === cp.type;
      const barrierTarget = active ? 0.05 : -0.72;
      mesh.userData.barrier.rotation.z += (barrierTarget - mesh.userData.barrier.rotation.z) * Math.min(dt * 5, 1);

      mesh.userData.officer.userData.rightArm.rotation.z = active
        ? -1.0 + Math.sin(phase * 3) * 0.18
        : Math.sin(phase) * 0.08;
      mesh.userData.officer.userData.leftArm.rotation.z = active
        ? 0.25 + Math.sin(phase * 2.2) * 0.1
        : 0;
    }

    const chase = Number(game?.policeChase) || 0;
    if (!this.chaseVehicle) return;
    this.chaseVehicle.visible = chase > 0;
    if (!this.chaseVehicle.visible) return;

    const intensity = Math.min(chase / 600, 1);
    const targetZ = 5.5 + 11 + intensity * 5;
    this.chaseVehicle.position.x = this.renderer.player?.position.x || 0;
    this.chaseVehicle.position.z += (targetZ - this.chaseVehicle.position.z) * Math.min(dt * (1.8 + intensity), 1);
    this.chaseVehicle.position.y = 0.02 + Math.sin(this.elapsed * 7) * 0.018;
    this.chaseVehicle.rotation.y = Math.PI;

    const pulse = (Math.sin(this.elapsed * 12) + 1) * 0.5;
    this.chaseVehicle.userData.red.material.emissiveIntensity = 0.5 + pulse * 2.2;
    this.chaseVehicle.userData.blue.material.emissiveIntensity = 0.5 + (1 - pulse) * 2.2;
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}
