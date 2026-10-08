// Kano Run — passenger world layer
// Visual-only passenger representation. Game.js remains authoritative for fares,
// capacity, negotiation, pickup and drop-off state.

export class PassengerWorld {
  constructor(THREE, renderer, options = {}) {
    this.THREE = THREE;
    this.renderer = renderer;
    this.quality = options.quality || 'high';
    this.root = new THREE.Group();
    this.root.name = 'passenger-world';
    this.passengers = [];
    this.maxPassengers = this.quality === 'low' ? 6 : 10;
    this.clock = 0;
    renderer.world?.add(this.root);

    for (let i = 0; i < this.maxPassengers; i += 1) {
      const p = this.createPassenger(i);
      p.visible = false;
      this.root.add(p);
      this.passengers.push(p);
    }
  }

  mat(color, roughness = 0.95, extra = {}) {
    return new this.THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  }

  box(parent, sx, sy, sz, x, y, z, material) {
    const m = new this.THREE.Mesh(new this.THREE.BoxGeometry(sx, sy, sz), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  sphere(parent, r, x, y, z, material, scale = [1, 1, 1]) {
    const m = new this.THREE.Mesh(new this.THREE.SphereGeometry(r, 14, 10), material);
    m.position.set(x, y, z);
    m.scale.set(...scale);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  createSign(THREE, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f1d05b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#18242a';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  }

  createPassenger(index) {
    const THREE = this.THREE;
    const g = new THREE.Group();
    g.userData.index = index;
    g.userData.state = 'hidden';
    g.userData.phase = index * 0.73;
    g.userData.speed = 1.2 + (index % 4) * 0.12;
    g.userData.arm = null;
    g.userData.armOther = null;
    g.userData.destination = '';
    g.userData.label = '';

    const skin = this.mat([0x5a3828, 0x69402d, 0x744731, 0x83533b][index % 4]);
    const cloth = this.mat([0x31556a, 0x6e493b, 0x65713e, 0x7d5d78, 0x927750][index % 5]);
    const dark = this.mat(0x1e2528);
    const bagMat = this.mat([0x6a4934, 0x394d58, 0x7b5c3b][index % 3]);

    this.sphere(g, 0.17, 0, 1.43, 0, skin, [0.92, 1.05, 0.92]);
    this.box(g, 0.34, 0.56, 0.25, 0, 1.04, 0, cloth);

    const leftArm = this.box(g, 0.085, 0.48, 0.075, -0.22, 1.06, 0, skin);
    const rightArm = this.box(g, 0.085, 0.48, 0.075, 0.22, 1.06, 0, skin);
    const leftLeg = this.box(g, 0.09, 0.56, 0.08, -0.09, 0.55, 0, dark);
    const rightLeg = this.box(g, 0.09, 0.56, 0.08, 0.09, 0.55, 0, dark);
    g.userData.arm = rightArm;
    g.userData.armOther = leftArm;
    g.userData.leftLeg = leftLeg;
    g.userData.rightLeg = rightLeg;

    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.15), bagMat);
    bag.position.set(-0.28, 0.83, 0.08);
    bag.rotation.z = -0.12;
    bag.castShadow = true;
    g.add(bag);
    g.userData.bag = bag;

    const signGroup = new THREE.Group();
    signGroup.position.set(0.42, 1.72, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8), dark);
    pole.position.y = -0.26;
    signGroup.add(pole);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.32, 0.045), this.createSign(THREE, 'AKWAI'));
    sign.position.y = 0.04;
    signGroup.add(sign);
    signGroup.visible = false;
    g.add(signGroup);
    g.userData.signGroup = signGroup;
    g.userData.sign = sign;

    return g;
  }

  destinationName(data) {
    const raw = data?.destination || data?.destinationName || data?.to || data?.route || '';
    if (raw) return String(raw).replace(/^destination[:\s-]*/i, '').slice(0, 18);
    return ['Sabon Gari', 'Kofar Mata', 'Fagge', 'Farm Centre', 'Hotoro', 'Zoo Road', 'Naibawa', 'Tarauni', 'Dala', 'Kantin Kwari', 'Kofar Wambai'][Number(data?.lane || 0) % 11];
  }

  addressFor(index, data) {
    const explicit = data?.address || data?.formOfAddress || data?.title;
    if (explicit) return String(explicit);
    return ['Oga', 'Mai Gida', 'Mallam', 'Yallabai', 'Aboki', 'Driver', 'Baba', 'Mama', 'Hajiya'][index % 9];
  }

  setState(p, state) {
    if (p.userData.state === state) return;
    p.userData.state = state;
    p.userData.stateTime = 0;
    p.userData.signGroup.visible = state === 'flagging' || state === 'waiting';
  }

  update(dt, game, zones = []) {
    this.clock += dt;
    const THREE = this.THREE;
    const playerZ = this.renderer.player?.position.z ?? 5.5;
    const active = zones.filter(z => z && z.kind === 'pickup').slice(0, this.maxPassengers);

    for (let i = 0; i < this.passengers.length; i += 1) {
      const p = this.passengers[i];
      const data = active[i];
      if (!data) {
        p.visible = false;
        p.userData.state = 'hidden';
        continue;
      }

      p.visible = true;
      const lane = Number(data.lane) || 0;
      const zoneX = this.renderer.laneToX(lane);
      const zoneZ = this.renderer.screenYToZ(Number(data.y) || 0, Number(game?.playerY) || 520);
      const side = lane === 1 ? 1 : (i % 2 === 0 ? -1 : 1);

      p.position.x = zoneX + side * 1.05;
      p.position.z = zoneZ;
      p.position.y = 0;
      p.rotation.y = side < 0 ? -0.18 : Math.PI + 0.18;

      const distance = Math.abs(zoneZ - playerZ);
      const near = distance < 13;
      const veryNear = distance < 5.5;
      let state = near ? 'flagging' : 'waiting';
      if (data.boarding || data.isBoarding || data.state === 'boarding') state = 'boarding';
      if (data.boarded || data.state === 'riding') state = 'riding';
      if (data.exiting || data.state === 'exiting') state = 'exiting';
      this.setState(p, state);
      p.userData.stateTime += dt;

      const phase = this.clock * p.userData.speed + p.userData.phase;
      const walk = Math.sin(phase * 5.5);

      if (state === 'waiting') {
        p.userData.arm.rotation.z = 0.04 + Math.sin(phase * 1.8) * 0.03;
        p.userData.armOther.rotation.z = -0.04;
        p.userData.leftLeg.rotation.z = 0;
        p.userData.rightLeg.rotation.z = 0;
        p.position.y = 0;
      } else if (state === 'flagging') {
        p.userData.arm.rotation.z = -0.95 + Math.sin(phase * 7) * 0.18;
        p.userData.armOther.rotation.z = 0.12;
        p.userData.leftLeg.rotation.z = walk * 0.05;
        p.userData.rightLeg.rotation.z = -walk * 0.05;
        p.position.y = Math.abs(Math.sin(phase * 4)) * 0.025;
      } else if (state === 'boarding') {
        const q = Math.min(p.userData.stateTime / 0.9, 1);
        p.position.x = THREE.MathUtils.lerp(p.position.x, zoneX, q);
        p.position.z = THREE.MathUtils.lerp(p.position.z, playerZ + 0.7, q);
        p.rotation.y = THREE.MathUtils.lerp(p.rotation.y, Math.PI, q);
        p.scale.setScalar(1 - q * 0.08);
      } else if (state === 'exiting') {
        p.position.x += Math.sin(phase) * dt * 0.15;
        p.position.z += dt * 0.5;
      }

      if (state !== 'boarding') p.scale.setScalar(1);
      p.userData.signGroup.visible = state === 'waiting' || state === 'flagging';
      if (p.userData.sign.material.map) p.userData.sign.material.map.needsUpdate = true;

      const destination = this.destinationName(data);
      const label = `${this.addressFor(i, data)} • ${destination}`;
      if (label !== p.userData.label) {
        p.userData.label = label;
        this.updateSign(p, destination);
      }

      // A subtle attention cue when the player is close enough to stop.
      p.userData.signGroup.scale.setScalar(veryNear ? 1.08 + Math.sin(this.clock * 7) * 0.04 : 1);
    }
  }

  updateSign(p, destination) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f1d05b';
    ctx.fillRect(0, 0, 320, 96);
    ctx.fillStyle = '#18242a';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(destination.toUpperCase().slice(0, 18), 160, 48);
    const tex = new this.THREE.CanvasTexture(canvas);
    tex.colorSpace = this.THREE.SRGBColorSpace;
    if (p.userData.sign.material.map) p.userData.sign.material.map.dispose();
    p.userData.sign.material.map = tex;
    p.userData.sign.material.needsUpdate = true;
  }

  dispose() {
    for (const p of this.passengers) {
      p.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose?.();
          obj.material.dispose?.();
        }
      });
    }
    this.root.removeFromParent();
    this.passengers.length = 0;
  }
}
