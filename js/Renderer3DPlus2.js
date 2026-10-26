import * as THREE from 'three';
import { Renderer3DPlus } from './Renderer3DPlus.js';

/**
 * Renderer3DPlus2: round two, built on Renderer3DPlus.
 *   import { Renderer3DPlus2 as Renderer3D } from './Renderer3DPlus2.js';
 * Adds: traffic pooling (no more create/dispose hitches), smoothed chase/driver
 * camera transitions, and night headlight/tail-light glows (sprites, no real lights).
 */

const MODEL_KEYS = new Set([
  'keke', 'car', 'taxi', 'suv', 'truck', 'bus', 'motorcycle', 'police', 'karota', 'ambulance',
]);
const SIZES = {
  keke: [1.9, 2.9], car: [1.9, 3.4], taxi: [1.9, 3.4], suv: [2.1, 3.6], truck: [2.5, 5.2],
  bus: [2.4, 4.6], motorcycle: [0.9, 2.2], police: [1.9, 3.4], karota: [2.0, 3.6], ambulance: [2.2, 4.2],
};
const KEKE_LAMPS = { x: 0.43, headY: 0.91, headZ: -1.0, tailY: 0.7, tailZ: 0.94 };
const POOL_MAX = 4;

export class Renderer3DPlus2 extends Renderer3DPlus {
  constructor(canvas, models, opts = {}) {
    super(canvas, models, opts);

    this._pool = new Map();
    this._glowOn = false;
    this._cam = null;
    this._lookRaw = null;

    this.makeGlowAssets();
    this.attachGlows(this.player, 'keke', KEKE_LAMPS);

    // Record where the base class aims the camera so we can smooth it.
    const cam = this.camera;
    this._origLookAt = cam.lookAt.bind(cam);
    cam.lookAt = (x, y, z) => {
      this._lookRaw ??= new THREE.Vector3();
      if (x && x.isVector3) this._lookRaw.copy(x);
      else this._lookRaw.set(x, y, z);
      this._origLookAt(x, y, z);
    };
  }

  // ---------- night glows ----------
  makeGlowAssets() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(c);
    this.glowTex.colorSpace = THREE.SRGBColorSpace;

    const mk = (color) => {
      const m = new THREE.SpriteMaterial({
        map: this.glowTex, color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      m.dispose = () => {};
      this._locked.push(m);
      return m;
    };
    this.glowHead = mk(0xfff1c4);
    this.glowTail = mk(0xff3b2a);
  }

  attachGlows(actor, type, lamps) {
    if (!actor || actor.userData.glows) return;
    const [w, l] = SIZES[type] || SIZES.car;
    const L = lamps || { x: w * 0.27, headY: 0.6, headZ: -l / 2, tailY: 0.65, tailZ: l / 2 };
    const xs = type === 'motorcycle' ? [0] : [-L.x, L.x];
    const list = [];
    const add = (mat, x, y, z, size) => {
      const s = new THREE.Sprite(mat);
      s.position.set(x, y, z);
      s.scale.setScalar(size);
      s.visible = this._glowOn;
      s.userData.sharedGeometry = true;
      actor.add(s);
      list.push(s);
    };
    for (const x of xs) {
      add(this.glowHead, x, L.headY, L.headZ, 0.95);
      add(this.glowTail, x, L.tailY, L.tailZ, 0.55);
    }
    actor.userData.glows = list;
  }

  setGlowVisible(on) {
    this._glowOn = on;
    const apply = (a) => a?.userData?.glows?.forEach((s) => { s.visible = on; });
    apply(this.player);
    for (const a of this.trafficActors.values()) apply(a);
  }

  updateGlows() {
    const on = this.nightMix > 0.3;
    this.glowHead.opacity = this.glowTail.opacity = THREE.MathUtils.clamp(this.nightMix, 0, 1) * 0.9;
    if (on !== this._glowOn) this.setGlowVisible(on);
  }

  async applyModel(key, object) {
    const ok = await super.applyModel(key, object);
    if (this.player && !this.player.userData.glows) this.attachGlows(this.player, 'keke', KEKE_LAMPS);
    return ok;
  }

  // ---------- traffic with pooling ----------
  _freeActor(root) {
    const seen = new Set();
    const visit = (o, shared) => {
      const sg = shared || o.userData?.sharedGeometry === true;
      if (o.geometry && !sg && !o.geometry.userData?.shared && !seen.has(o.geometry)) {
        seen.add(o.geometry);
        o.geometry.dispose();
      }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (!m || m.userData?.shared || seen.has(m)) continue;
        seen.add(m);
        m.dispose();
      }
      for (const c of o.children || []) visit(c, sg);
    };
    visit(root, false);
  }

  syncTraffic(state) {
    const active = new Set();

    for (const v of state.traffic || []) {
      active.add(v.id);
      const key = MODEL_KEYS.has(v.type) ? v.type : 'car';

      let actor = this.trafficActors.get(v.id);
      if (!actor) {
        actor = this._pool.get(v.type)?.pop() || this.makeTrafficActor(v);
        actor.userData.vehicleType = v.type;
        actor.visible = true;
        this.world.add(actor);
        this.trafficActors.set(v.id, actor);
      }

      if (actor.userData.fallback && this.models?.cache?.has(key)) {
        const model = this.models.getInstance(key);
        if (model) {
          model.userData.fallback = false;
          model.userData.vehicleType = v.type;
          model.position.copy(actor.position);
          model.rotation.copy(actor.rotation);
          this.world.remove(actor);
          this._freeActor(actor);
          this.world.add(model);
          this.trafficActors.set(v.id, model);
          actor = model;
        }
      }

      actor.position.set((v.lane - 1) * 3, 0, -Math.max(-0.05, Number(v.depth) || 0) * 88);
      actor.rotation.y = v.direction === -1 ? Math.PI : 0;

      this.attachShadow(actor, v.type);
      this.attachGlows(actor, v.type);
    }

    for (const [id, actor] of this.trafficActors) {
      if (active.has(id)) continue;
      this.world.remove(actor);
      this.trafficActors.delete(id);
      const type = actor.userData.vehicleType;
      const list = this._pool.get(type) || [];
      if (list.length < POOL_MAX) {
        actor.visible = false;
        list.push(actor);
        this._pool.set(type, list);
      } else {
        this._freeActor(actor);
      }
    }
  }

  // ---------- camera smoothing ----------
  beforeRender() {
    super.beforeRender();

    if (this.lifeScene !== 'road') {
      this._cam = null;
      return;
    }
    this.updateGlows();

    const look = this._lookRaw;
    if (!look) return;

    const cam = this.camera;
    const k = 1 - Math.exp(-this._dt * 5);

    // Keep the crash shake out of the smoothing so it is not damped away.
    const shake = Math.max(0, Number(this.liveState?.crashShake) || 0);
    const shakeOff = Math.sin((this.liveState?.time || 0) * 41) * shake * 0.12;

    const ty = cam.position.y - shakeOff;
    const tz = cam.position.z;
    const c = (this._cam ??= { y: ty, z: tz, ly: look.y, lz: look.z });
    c.y += (ty - c.y) * k;
    c.z += (tz - c.z) * k;
    c.ly += (look.y - c.ly) * k;
    c.lz += (look.z - c.lz) * k;

    cam.position.y = c.y + shakeOff;
    cam.position.z = c.z;
    this._origLookAt(look.x, c.ly, c.lz);
  }

  dispose() {
    if (this.disposed) return;
    // Put pooled actors back in the scene so the base dispose frees them too.
    for (const list of this._pool.values()) for (const a of list) this.world.add(a);
    this._pool.clear();
    super.dispose();
    this.glowTex?.dispose();
  }
}

export default Renderer3DPlus2;
