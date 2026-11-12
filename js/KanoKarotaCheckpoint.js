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
      holder.userData.baseY = rotY;
      holder.userData.baseX = x;
      holder.userData.baseZ = z;
      group.add(holder);
      return holder;
    } catch (_) { /* optional model */ }
    return null;
  };
  // The officer model's front faces -z, so turn it ~180 deg to face the oncoming driver.
  const FACE = Math.PI;
  const holders = await Promise.all([
    place('karota', 2.0, 5.9, -7, Math.PI),
    place('karotaOfficer', 1.8, 4.7, 0, FACE + 0.25),      // 0: waving traffic in
    place('karotaOfficer', 1.8, 2.6, -3.2, FACE - 0.3),    // 1: walks the cone line, checking vehicles
    place('karotaOfficer', 1.8, 6.6, -4.6, FACE + 0.5),    // 2: by the KAROTA vehicle, watching
    place('karotaOfficer', 1.8, 0.2, -8.2, FACE),          // 3: stands in the lane, hand up to stop
    place('karotaOfficer', 1.8, 5.4, -9.4, FACE - 0.6),    // 4: checking papers at the rear

    place('cone', 0.75, 4.0, -1.6, 0),
    place('cone', 0.75, 3.0, -4.2, 0),
    place('cone', 0.75, 2.0, -6.8, 0),
    place('cone', 0.75, 1.0, -9.4, 0),
  ]);
  group.userData.officers = holders.slice(1, 6).filter(Boolean);
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
    if (g) document.body.classList.toggle('kano-karota-stop', g.s?.event === 'karota');
    if (staged && g) {
      const s = g.s;
      if (g.state === 'OVER' || g.state === 'MENU' || s.distance < staged.startKm - 0.05) { cleanup(); }
      else {
        const dKm = staged.atKm - s.distance;
        const z = 2 - dKm * UNITS_PER_KM;
        if (staged.group) {
          staged.group.position.z = z;
          const t = performance.now() / 1000;
          const R = window.kanoRenderer;
          const px = R?.player?.position?.x || 0;
          const facing = (h) => {
            // yaw that turns the officer's front toward the keke
            const dx = px - h.position.x;
            const dz = 2 - (staged.group.position.z + h.position.z);
            return Math.atan2(-dx, -dz);
          };
          (staged.group.userData.officers || []).forEach((h, i) => {
            const u = h.userData;
            const stepBob = (speed, amp) => Math.abs(Math.sin(t * speed + i)) * amp;
            let moving = 0;
            if (i === 0) {            // waves traffic in: whole-body wave, swaying side to side
              h.position.x = u.baseX + Math.sin(t * 1.4) * 0.45;
              h.rotation.z = Math.sin(t * 5.5) * 0.14;
              moving = 0.5;
            } else if (i === 1) {     // walks the cone line checking vehicles
              h.position.x = u.baseX + Math.sin(t * 0.45) * 1.5;
              h.position.z = u.baseZ - 1.4 + Math.sin(t * 0.45 + 1.2) * 3.0;
              h.rotation.z = Math.sin(t * 4.2) * 0.05;
              moving = 1;
            } else if (i === 2) {     // strolls between the KAROTA vehicle and the lane
              h.position.x = u.baseX - 0.5 - (Math.sin(t * 0.33 + 2) * 0.5 + 0.5) * 2.2;
              h.position.z = u.baseZ + Math.sin(t * 0.5 + 3) * 1.4;
              h.rotation.z = Math.sin(t * 3.8) * 0.05;
              moving = 1;
            } else if (i === 3) {     // in the lane, hand up: steps toward the driver then back
              const pulse = Math.sin(t * 0.6) * 0.5 + 0.5;
              h.position.x = u.baseX + Math.sin(t * 1.1) * 0.5;
              h.position.z = u.baseZ + pulse * 2.2;
              h.rotation.z = Math.sin(t * 2.4) * 0.07;
              moving = 0.7;
            } else {                  // checks papers at the rear, pacing along the vehicle
              h.position.z = u.baseZ + Math.sin(t * 0.4 + 5) * 1.8;
              h.position.x = u.baseX + Math.sin(t * 0.9) * 0.25;
              h.rotation.z = Math.sin(t * 3.4) * 0.04;
              moving = 0.8;
            }
            // look at the driver, with a little glance around
            const want = facing(h) + Math.sin(t * 0.7 + i * 1.7) * 0.12;
            h.rotation.y += (want - h.rotation.y) * 0.12;
            h.position.y = moving ? stepBob(6.2, 0.06 * moving) : Math.abs(Math.sin(t * 2 + i)) * 0.02;
          });
        }
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
