/**
 * KAROTA checkpoints you can SEE before they stop you.
 * The game used to pop a text card from nowhere. Now, when a KAROTA stop is due, a real checkpoint is placed
 * ~120 m ahead on the road (KAROTA vehicle, an officer from your police GLB, cones funnelling traffic to the
 * shoulder) and a distance chip counts down. The usual KAROTA card opens only when you reach the checkpoint.
 * Models come from your own GLBs: karota.glb, police_man.glb and the cone model.
 */
import * as THREE from 'three';

const UNITS_PER_KM = 1008;      // world scroll: 0.28 units per km/h per second
const AHEAD_KM = 0.12;          // checkpoint is placed 120 m ahead
const TRIGGER_KM = 0.014;       // the stop opens when you are ~14 m away
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__;

let staged = null;
let chip = null;

function ensureChip() {
  if (chip && chip.isConnected) return chip;
  chip = document.createElement('div');
  chip.id = 'kano-karota-chip';
  chip.style.cssText = 'position:fixed;left:50%;top:216px;transform:translateX(-50%);z-index:44;padding:6px 12px;'
    + 'border-radius:12px;font:800 12px/1.3 system-ui,sans-serif;color:#fff;background:rgba(22,70,140,.94);'
    + 'border:1px solid rgba(255,255,255,.45);pointer-events:none;display:none;white-space:nowrap';
  document.body.appendChild(chip);
  return chip;
}

function fit(model, height) {
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  if (!(h > 0.05)) return false;
  const k = height / h;
  model.scale.multiplyScalar(k);
  const lowered = new THREE.Box3().setFromObject(model);
  model.position.y -= lowered.min.y;
  return true;
}

async function build(renderer) {
  const group = new THREE.Group();
  group.name = 'KANO_KAROTA_CHECKPOINT';
  group.visible = false;
  const models = renderer?.models;
  if (!models?.load) return group;
  const place = async (key, height, x, z, rotY) => {
    try {
      await models.load(key);
      const model = models.getInstance(key);
      if (!model) return;
      if (!fit(model, height)) return;
      const holder = new THREE.Group();
      holder.add(model);
      holder.position.set(x, 0, z);
      holder.rotation.y = rotY;
      group.add(holder);
    } catch (_) { /* optional model */ }
  };
  await Promise.all([
    place('karota', 2.0, 7.3, -7, Math.PI),
    place('karotaOfficer', 1.8, 4.7, 0, Math.PI * 0.12),
    place('cone', 0.75, 4.0, -1.6, 0),
    place('cone', 0.75, 3.0, -4.2, 0),
    place('cone', 0.75, 2.0, -6.8, 0),
    place('cone', 0.75, 1.0, -9.4, 0),
  ]);
  group.visible = true;
  return group;
}

function install(g) {
  if (g.__kanoKarotaStaged || typeof g.beginEvent !== 'function') return;
  g.__kanoKarotaStaged = true;
  const original = g.beginEvent.bind(g);
  g.beginEvent = function patched(type) {
    if (type === 'karota' && !this.__kanoKarotaPass) {
      if (staged || this.state !== 'PLAY' || this.s.event) return undefined;
      staged = { atKm: this.s.distance + AHEAD_KM, startKm: this.s.distance, group: null, triggered: false };
      const renderer = window.kanoRenderer;
      build(renderer).then((group) => {
        if (!staged) return;
        staged.group = group;
        renderer?.world?.add(group);
      }).catch(() => {});
      return undefined;
    }
    return original(type);
  };
  g.__kanoKarotaOpen = () => {
    g.__kanoKarotaPass = true;
    try {
      g.s.eventCooldown = 0;
      g.beginEvent('karota');
    } finally { g.__kanoKarotaPass = false; }
  };
}

function cleanup() {
  if (staged?.group) {
    staged.group.parent?.remove(staged.group);
    staged.group.traverse?.((o) => { if (o.geometry) o.geometry.dispose?.(); });
  }
  staged = null;
  if (chip) chip.style.display = 'none';
}

function frame() {
  try {
    const g = game();
    if (g) install(g);
    if (staged && g) {
      const s = g.s;
      if (g.state === 'OVER' || g.state === 'MENU' || s.distance < staged.startKm - 0.05) { cleanup(); }
      else {
        const dKm = staged.atKm - s.distance;
        const z = 2 - dKm * UNITS_PER_KM;
        if (staged.group) staged.group.position.z = z;
        const el = ensureChip();
        if (!staged.triggered && g.state === 'PLAY') {
          el.style.display = 'block';
          el.textContent = `🚔 KAROTA checkpoint ahead · ${Math.max(0, Math.round(dKm * 1000))} m · slow down`;
          if (dKm <= TRIGGER_KM) {
            g.__kanoKarotaOpen?.();
            if (s.event === 'karota') staged.triggered = true;
          }
        } else {
          el.style.display = 'none';
        }
        if (staged.triggered && z > 70) cleanup();
        if (!staged.triggered && z > 40) cleanup();
      }
    }
  } catch (_) { /* optional */ }
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && !window.__kanoKarotaCheckpoint) {
  window.__kanoKarotaCheckpoint = true;
  requestAnimationFrame(frame);
}
