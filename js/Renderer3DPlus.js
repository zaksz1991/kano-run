import * as THREE from 'three';
import { Renderer3D } from './Renderer3D.js';

/**
 * Renderer3DPlus: drop-in upgrade for Renderer3D (same constructor and API).
 * Put this file next to Renderer3D.js and import it as:
 *   import { Renderer3DPlus as Renderer3D } from './Renderer3DPlus.js';
 *
 * Adds: material sharing (Lambert on mobile), one scrolling lane-marking texture,
 * baked building windows, dynamic resolution, blob shadows, spring suspension,
 * speed FOV, smooth day/night/harmattan transitions, shader pre-warm,
 * throttled asset upgrades, and texture-leak fixes. Add ?perf to the URL to log stats.
 */

const LANE_PERIOD = 8.5; // world units per dash repeat (matches the original spacing)
const SHADOW_SIZE = {
  keke: [1.9, 2.9], car: [1.9, 3.4], taxi: [1.9, 3.4], suv: [2.1, 3.6],
  truck: [2.5, 5.2], bus: [2.4, 4.6], motorcycle: [0.9, 2.2],
  police: [1.9, 3.4], karota: [2.0, 3.6], ambulance: [2.2, 4.2],
};

const signedSpeedOf = (s) =>
  Number.isFinite(s?.signedSpeed) ? s.signedSpeed
    : s?.reverse ? -Math.abs(Number(s?.speed) || 0) : Math.abs(Number(s?.speed) || 0);

export class Renderer3DPlus extends Renderer3D {
  constructor(canvas, models, opts = {}) {
    super(canvas, models, opts);

    // Dynamic resolution
    this.maxPR = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2);
    this.minPR = 0.75;
    this.pr = this.mobile ? 1 : Math.min(this.maxPR, 1.5);
    this.renderer.setPixelRatio(this.pr);
    this.frameAvg = 16.7;
    this.adjustT = 0;

    // Motion state
    this.sus = { pitch: 0, pitchV: 0, bounce: 0, bounceV: 0 };
    this.prevSpeed = 0;
    this.prevShake = 0;
    this.fovCur = this.camera.fov;
    this.nightMix = 0;
    this._dt = 0.016;
    this._warmed = false;
    this.perf = /[?&]perf\b/.test(window.location?.search || '');

    // Day/night lights (created as locals in the original buildWorld)
    this.hemi = this.scene.children.find((o) => o.isHemisphereLight) || null;
    this.sun = this.scene.children.find((o) => o.isDirectionalLight) || null;
    this.hemiBase = this.hemi?.intensity ?? 1.8;
    this.sunBase = this.sun?.intensity ?? 1.75;

    this.buildLaneTexture();
    this.makeShadowAssets();
    this.attachShadow(this.player, 'keke');

    // Pre-render hook: camera FOV/far, sky smoothing, night lights.
    const r = this.renderer;
    const render = r.render.bind(r);
    r.render = (scene, camera) => {
      try { this.beforeRender(); } catch (e) { console.warn('[Renderer3DPlus]', e); }
      render(scene, camera);
    };
  }

  // ---------- materials ----------
  material(color, roughness = 1, opts = {}) {
    this._matCache ??= new Map();
    this._locked ??= [];
    // Materials that code mutates (keke paint, asphalt texture) must stay unique.
    const unique = opts.unique ||
      (color === 0xf5c542 && roughness === 0.72) ||
      (color === 0x343c43 && roughness === 1);
    const key = `${color}|${roughness}`;
    if (!unique) {
      const hit = this._matCache.get(key);
      if (hit) return hit;
    }
    const side = this.mobile ? THREE.FrontSide : THREE.DoubleSide;
    const m = this.mobile
      ? new THREE.MeshLambertMaterial({ color, side })
      : new THREE.MeshStandardMaterial({ color, roughness, side });
    if (!unique) {
      m.userData.shared = true;
      m.dispose = () => {};           // actors disposing a shared material must not free it
      this._matCache.set(key, m);
      this._locked.push(m);
    }
    return m;
  }

  loadOptionalTexture(url, material, repeat = [1, 1]) {
    if (material.userData?.shared) {
      if (!this._warnedShared) {
        this._warnedShared = true;
        console.warn('[Renderer3DPlus] texture skipped on a shared material; pass { unique: true } (see notes).');
      }
      return;
    }
    this._texCache ??= new Map();
    const key = `${url}|${repeat}`;
    const apply = (tex) => {
      material.map = tex;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    };
    let entry = this._texCache.get(key);
    if (entry?.tex) return apply(entry.tex);
    if (entry) { entry.waiters.push(apply); return; }
    entry = { tex: null, waiters: [apply] };
    this._texCache.set(key, entry);
    try {
      new THREE.TextureLoader().load(url, (tex) => {
        if (this.disposed) { tex.dispose(); return; }
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat[0], repeat[1]);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        entry.tex = tex;
        entry.waiters.splice(0).forEach((fn) => fn(tex));
      }, undefined, () => {});
    } catch { /* optional */ }
  }

  // ---------- baked windows: one plane per building ----------
  addWindows(group, width, height) {
    if (this.mobile) return;
    const cols = Math.max(1, Math.floor(width / 0.8));
    const rows = Math.max(1, Math.floor(height / 1.2));
    this._winGeo ??= new Map();
    const key = `${cols}x${rows}`;
    let geo = this._winGeo.get(key);
    if (!geo) {
      geo = new THREE.PlaneGeometry(cols * 0.65, rows * 0.9);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cols, uv.getY(i) * rows);
      this._winGeo.set(key, geo);
    }
    if (!this._winMat) {
      const c = document.createElement('canvas');
      c.width = 130; c.height = 180;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(79,113,128,0.01)';
      g.fillRect(0, 0, 130, 180);
      g.fillStyle = '#4f7180';
      g.fillRect(41, 58, 48, 64);
      this._winTex = new THREE.CanvasTexture(c);
      this._winTex.colorSpace = THREE.SRGBColorSpace;
      this._winTex.wrapS = this._winTex.wrapT = THREE.RepeatWrapping;
      this._winMat = new THREE.MeshLambertMaterial({ map: this._winTex, alphaTest: 0.5 });
      this._winMat.dispose = () => {};
      this._locked.push(this._winMat);
    }
    const mesh = new THREE.Mesh(geo, this._winMat);
    mesh.position.set(-width * 0.35 + ((cols - 1) * 0.65) / 2, 0.6 + (rows - 1) * 0.45, 1.51);
    mesh.userData.sharedGeometry = true;
    group.add(mesh);
  }

  // ---------- lane markings: 1 scrolling texture instead of ~58 meshes ----------
  buildLaneTexture() {
    for (const dash of this.laneDashes) {
      this.world.remove(dash);
      dash.geometry.dispose();
    }
    this.laneDashes.length = 0;

    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(232,224,200,0.012)';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#e8e0c8';
    for (const x of [-2, 2]) {
      const px = ((x + 6.5) / 13) * 512;
      g.fillRect(px - 2, 0, 4, (3.4 / LANE_PERIOD) * 256);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 250 / LANE_PERIOD);
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.laneTexture = tex;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 250),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.028, -92);
    this.world.add(mesh);
    this.laneMesh = mesh;
  }

  // ---------- blob shadows ----------
  makeShadowAssets() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    this.shadowTex = new THREE.CanvasTexture(c);
    this.shadowTex.colorSpace = THREE.SRGBColorSpace;
    this.shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.shadowMat.dispose = () => {};
    this._locked.push(this.shadowMat);
  }

  attachShadow(actor, type = 'car') {
    if (!actor || actor.userData.blobShadow) return;
    const [w, l] = SHADOW_SIZE[type] || SHADOW_SIZE.car;
    const mesh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    mesh.scale.set(w, 1, l);
    mesh.position.y = 0.045;
    mesh.renderOrder = 1;
    mesh.userData.sharedGeometry = true;
    actor.add(mesh);
    actor.userData.blobShadow = mesh;
  }

  async applyModel(key, object) {
    const old = this.player;
    if (old?.userData?.blobShadow) {
      old.remove(old.userData.blobShadow);
      old.userData.blobShadow = null;
    }
    const ok = await super.applyModel(key, object);
    this.attachShadow(this.player, 'keke');
    return ok;
  }

  syncTraffic(state) {
    super.syncTraffic(state);
    for (const actor of this.trafficActors.values()) {
      if (!actor.userData.blobShadow) this.attachShadow(actor, actor.userData.vehicleType);
    }
  }

  // Fix: zone label canvas textures were never freed.
  syncZones(state) {
    const before = new Map(this.zoneActors);
    super.syncZones(state);
    for (const [id, actor] of before) {
      if (!this.zoneActors.has(id)) actor.userData.labelTexture?.dispose();
    }
  }

  // ---------- throttled GLB upgrades (were scanning every frame) ----------
  _modelSig() {
    const c = this.models?.cache;
    return c ? (c.size ?? Object.keys(c).length) : -1;
  }
  upgradeWorldAssets() {
    const sig = this._modelSig();
    if (sig === this._worldSig) return;
    this._worldSig = sig;
    super.upgradeWorldAssets();
  }
  upgradePedestrians() {
    const sig = this._modelSig();
    if (sig === this._pedSig) return;
    this._pedSig = sig;
    super.upgradePedestrians();
  }

  // ---------- suspension (hooked into the pre-render driver step) ----------
  animateFallbackDriver(state, dt) {
    super.animateFallbackDriver(state, dt);
    if (!this.player || !(dt > 0)) return;

    const speed = signedSpeedOf(state);
    const accel = (speed - this.prevSpeed) / dt;
    this.prevSpeed = speed;

    const shake = Number(state?.crashShake) || 0;
    if (shake > this.prevShake + 0.05) this.bump(Math.min(shake, 1));
    this.prevShake = shake;

    const s = this.sus;
    const target = THREE.MathUtils.clamp(accel * 0.0012, -0.045, 0.045); // nose lifts on gas, dips on brake
    s.pitchV += ((target - s.pitch) * 70 - s.pitchV * 10) * dt;
    s.pitch += s.pitchV * dt;
    s.bounceV += ((0 - s.bounce) * 90 - s.bounceV * 7) * dt;
    s.bounce += s.bounceV * dt;

    this.player.rotation.x = s.pitch;   // flip the sign if your model faces +z
    this.player.position.y += s.bounce;
  }

  /** Call from game.js on potholes or hard bumps: renderer.bump(0..1). Crashes trigger it automatically. */
  bump(strength = 1) {
    this.sus.bounceV += 1.4 * strength;
    this.sus.pitchV += (Math.random() < 0.5 ? -1 : 1) * 0.5 * strength;
  }

  // ---------- per-frame hook right before render ----------
  beforeRender() {
    const road = this.lifeScene === 'road';
    const k = 1 - Math.exp(-this._dt * 2);

    let fovTarget = 58;
    let far = 260;
    if (road) {
      fovTarget = 58 + Math.min(Math.abs(signedSpeedOf(this.liveState)) / 90, 1) * 6;
      far = this.scene.fog.far + 15;

      // Smooth sky/fog (the base class sets the target colours every frame).
      this._sky ??= this.scene.background.clone();
      this._fogc ??= this.scene.fog.color.clone();
      this._sky.lerp(this.scene.background, k);
      this._fogc.lerp(this.scene.fog.color, k);
      this.scene.background.copy(this._sky);
      this.scene.fog.color.copy(this._fogc);

      // Day/night lighting
      const nightTarget = this.liveState?.night ? 1 : 0;
      this.nightMix += (nightTarget - this.nightMix) * k;
      if (this.hemi) this.hemi.intensity = THREE.MathUtils.lerp(this.hemiBase, this.hemiBase * 0.38, this.nightMix);
      if (this.sun) {
        this.sun.intensity = THREE.MathUtils.lerp(this.sunBase, this.sunBase * 0.2, this.nightMix);
        this.sun.color.setHex(0xffedca).lerp(new THREE.Color(0x8fa4d8), this.nightMix);
      }
    }

    this.fovCur += (fovTarget - this.fovCur) * k;
    if (Math.abs(this.fovCur - this.camera.fov) > 0.02 || Math.abs(this.camera.far - far) > 0.5) {
      this.camera.fov = this.fovCur;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  // ---------- shader pre-warm (avoids hitches on first garage or scene entry) ----------
  warmUp() {
    this._warmed = true;
    const groups = [...this.lifeSceneGroups.values()];
    const saved = [this.world.visible, this.garageGroup.visible, this.lifeDioramaRoot.visible, groups.map((g) => g.visible)];
    const set = (w, g, l) => {
      this.world.visible = w;
      this.garageGroup.visible = g;
      this.lifeDioramaRoot.visible = l;
      groups.forEach((x) => { x.visible = l; });
      try { this.renderer.compile(this.scene, this.camera); } catch { /* ignore */ }
    };
    set(true, false, false);
    set(false, true, true);
    [this.world.visible, this.garageGroup.visible, this.lifeDioramaRoot.visible] = saved;
    groups.forEach((g, i) => { g.visible = saved[3][i]; });
  }

  updateResolution(rawDelta) {
    if (!(rawDelta > 0) || rawDelta > 0.1) return; // ignore tab-switch spikes
    this.frameAvg += (rawDelta * 1000 - this.frameAvg) * 0.05;
    this.adjustT += rawDelta;
    if (this.adjustT < 1) return;
    this.adjustT = 0;
    let pr = this.pr;
    if (this.frameAvg > 22) pr -= 0.25;
    else if (this.frameAvg < 17.5) pr += 0.125;
    pr = THREE.MathUtils.clamp(pr, this.minPR, this.maxPR);
    if (pr !== this.pr) {
      this.pr = pr;
      this.renderer.setPixelRatio(pr);
      this.resize();
    }
  }

  // ---------- main loop ----------
  draw(state, deltaSeconds) {
    if (!this.ready || this.disposed) return;
    const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.05);
    this._dt = dt;
    this.liveState = state;

    if (!this._warmed) this.warmUp();
    this.updateResolution(Number(deltaSeconds) || 0);

    if (this.lifeScene === 'road' && this.laneTexture) {
      const t = this.laneTexture;
      t.offset.y = (t.offset.y + (signedSpeedOf(state) * dt * 0.28) / LANE_PERIOD) % 1;
    }

    super.draw(state, deltaSeconds);

    if (this.perf) {
      const now = performance.now();
      if (now - (this._pl || 0) > 2000) {
        this._pl = now;
        const i = this.renderer.info;
        console.info(`[perf] fps≈${(1000 / this.frameAvg).toFixed(0)} calls=${i.render.calls} tris=${i.render.triangles} geo=${i.memory.geometries} tex=${i.memory.textures} pr=${this.pr}`);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    super.dispose();
    for (const m of this._locked || []) THREE.Material.prototype.dispose.call(m);
    this._locked = [];
    this.laneTexture?.dispose();
    this.shadowTex?.dispose();
    this.shadowGeo?.dispose();
    this._winTex?.dispose();
    this._winGeo?.forEach((g) => g.dispose());
    this._texCache?.forEach((e) => e.tex?.dispose());
  }
}

export default Renderer3DPlus;
