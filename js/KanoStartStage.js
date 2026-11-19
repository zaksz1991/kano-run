/**
 * KANO LIFE - LIVE 3D START STAGE
 *
 * The start page shows a real animated street scene instead of a still picture: a yellow keke at a Kano
 * kerb at dusk, the driver in his long Hausa gown shouting for passengers, and men and women (hijab and
 * otherwise, different clothes) walking up, climbing in through the SIDE door, riding, getting out, paying
 * and walking off. Only the game's own GLB models are used. It pauses whenever the start screen is hidden
 * and draws at a capped 30 fps with pixel ratio 1 so it stays light on mid-range phones.
 */
import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { polishCharacter, stepCharacterGait } from './KanoCharacterPolish.js';
import { yellowize } from './KanoYellowKeke.js';

const BASE = '/assets/models/';
const SHOUTS = [
  'Kofar Nassarawa! Shiga, shiga!',
  'Zoo Road! Mutum uku, ga wuri!',
  'Sannu oga, ina zuwa?',
  'Ga canji nan, ranka ya dade!',
  'Adaidaita! Gidan Sarki!',
  'Hanzarta, hanya ta cika!',
];
const LOOP = 16;
const WALK_LINE_Z = 1.95;
const DOOR_Z = 0.82;
const DOOR_X = 0.1;

const CAST = [
  { file: 'characters/passengers/hijab-muslim-woman.glb', key: 'passengerWoman', woman: true, offset: 0, fare: '+₦300' },
  { file: 'characters/passengers/Man in Suit.glb', key: 'passengerVIP', offset: 4, fare: '+₦700' },
  { file: 'characters/passengers/hijab-muslim-woman-2.glb', key: 'passengerWoman', woman: true, offset: 8, fare: '+₦250' },
  { file: 'characters/passengers/Man.glb', key: 'passengerMan', offset: 12, fare: '+₦400' },
];

function fitHeight(actor, height) {
  actor.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(actor);
  const h = box.max.y - box.min.y;
  if (h > 0) actor.scale.multiplyScalar(height / h);
  actor.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(actor);
  actor.position.y -= b2.min.y;
}

function ease(t) { return t * t * (3 - 2 * t); }

function start() {
  const hero = document.querySelector('#start-screen .kano-keke-hero');
  const screen = document.getElementById('start-screen');
  if (!hero || !screen || hero.dataset.kanoStage) return;
  hero.dataset.kanoStage = '1';

  const canvas = document.createElement('canvas');
  canvas.className = 'kano-stage-canvas';
  canvas.setAttribute('aria-label', 'Animated Kano street: a keke driver calls out while passengers board, ride and pay');
  hero.appendChild(canvas);
  const bubble = document.createElement('div'); bubble.className = 'kano-stage-bubble'; hero.appendChild(bubble);
  const fx = document.createElement('div'); fx.className = 'kano-stage-fx'; hero.appendChild(fx);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'default' });
  } catch (_) { hero.removeChild(canvas); bubble.remove(); fx.remove(); return; }
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2b36e);
  scene.fog = new THREE.Fog(0xf2b36e, 14, 34);
  scene.add(new THREE.HemisphereLight(0xffe6c0, 0x8a6a4a, 1.5));
  const sun = new THREE.DirectionalLight(0xffd7a0, 2.6); sun.position.set(-5, 6, 6); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(34, 1.4, 0.1, 60);

  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), mat(0xc9a36b)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), mat(0x34373b)); road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -1.4); scene.add(road);
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(60, 3), mat(0xb9b2a4)); paving.rotation.x = -Math.PI / 2; paving.position.set(0, 0.03, 2.5); scene.add(paving);
  const kerb = new THREE.Mesh(new THREE.BoxGeometry(60, 0.12, 0.22), mat(0xe9e5da)); kerb.position.set(0, 0.05, 1.38); scene.add(kerb);
  for (let i = -6; i <= 6; i += 1) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.12), mat(0xf1efe6)); dash.rotation.x = -Math.PI / 2; dash.position.set(i * 2.4, 0.01, -2.4); scene.add(dash);
  }

  const loader = createGLTFLoader();
  const load = (file) => new Promise((resolve) => loader.load(encodeURI(BASE + file), (g) => resolve(g), undefined, () => resolve(null)));

  let keke = null; let driver = null; const actors = []; let ready = false;
  const mixers = [];

  load('vehicles/keke/keke-3.glb').then((g) => {
    if (!g) return;
    keke = g.scene;
    // Same livery as the in-game keke: Kano yellow body, black roof.
    keke.traverse((o) => { if (o.isMesh && o.material?.map) o.name = 'merged_by_material'; });
    try { yellowize(keke); } catch (_) { /* keep original paint */ }
    keke.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(keke);
    const size = box.getSize(new THREE.Vector3());
    // Long axis of the model lies along the road (x).
    if (size.z > size.x) keke.rotation.y = Math.PI / 2;
    keke.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(keke);
    const s = 2.7 / Math.max(b2.getSize(new THREE.Vector3()).x, 0.01);
    keke.scale.multiplyScalar(s); keke.updateMatrixWorld(true);
    const b3 = new THREE.Box3().setFromObject(keke);
    const c = b3.getCenter(new THREE.Vector3());
    keke.position.set(-c.x, -b3.min.y, 0.2 - c.z);
    scene.add(keke);
    ready = true;
  });

  const bldgs = ['world/buildings-suburban/building-type-d.glb', 'world/buildings-suburban/building-type-g.glb', 'world/buildings-suburban/building-type-f.glb'];
  bldgs.forEach((f, i) => load(f).then((g) => {
    if (!g) return;
    const b = g.scene;
    const box = new THREE.Box3().setFromObject(b);
    const sz = box.getSize(new THREE.Vector3());
    b.scale.multiplyScalar(5.2 / Math.max(sz.x, sz.z, 0.01));
    const nb = new THREE.Box3().setFromObject(b);
    b.position.set(-9 + i * 7.5 - nb.getCenter(new THREE.Vector3()).x, -nb.min.y, -8);
    scene.add(b);
  }));

  function prepPerson(gltf, height) {
    const actor = gltf.scene;
    fitHeight(actor, height);
    const holder = new THREE.Group(); holder.add(actor);
    scene.add(holder);
    return { holder, actor };
  }

  load('characters/pedestrians/Man-Long-Sleeves.glb').then((g) => {
    if (!g) return;
    const p = prepPerson(g, 1.72);
    try { polishCharacter(p.actor, 'passengerMan'); } catch (_) { /* cosmetic */ }
    p.holder.position.set(1.9, 0, 1.05); p.holder.rotation.y = 0.35;
    driver = { ...p, clips: {}, mixer: new THREE.AnimationMixer(p.actor), current: null };
    for (const clip of g.animations) driver.clips[clip.name.split('|').pop()] = clip;
    mixers.push(driver.mixer);
  });

  CAST.forEach((c) => load(c.file).then((g) => {
    if (!g) return;
    const p = prepPerson(g, c.woman ? 1.62 : 1.74);
    try { polishCharacter(p.actor, c.key); } catch (_) { /* cosmetic */ }
    const a = { ...c, ...p, clips: {}, mixer: null, current: null, paid: false };
    if (g.animations?.length) {
      a.mixer = new THREE.AnimationMixer(p.actor);
      for (const clip of g.animations) a.clips[clip.name.split('|').pop()] = clip;
      mixers.push(a.mixer);
    }
    p.holder.visible = false;
    actors.push(a);
  }));

  function play(entry, name) {
    if (!entry.mixer || entry.current === name || !entry.clips[name]) return;
    const next = entry.mixer.clipAction(entry.clips[name]);
    next.reset().fadeIn(0.2).play();
    if (entry.current) entry.mixer.clipAction(entry.clips[entry.current]).fadeOut(0.2);
    entry.current = name;
  }

  let shoutIndex = 0; let shoutClock = 0;
  function popFare(text) {
    const el = document.createElement('div'); el.className = 'kano-stage-fare'; el.textContent = text;
    el.style.left = `${46 + Math.random() * 8}%`;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function placeActor(a, time) {
    const t = ((time + a.offset) % LOOP + LOOP) % LOOP;
    const h = a.holder;
    let moving = false; let visible = true; let scale = 1;
    if (t < 4.6) { // walk along the paving to the door, facing the way they walk
      const u = ease(t / 4.6);
      h.position.set(THREE.MathUtils.lerp(-6.5, DOOR_X - 1.35, u), 0, WALK_LINE_Z + 0.2);
      h.rotation.y = Math.PI / 2; moving = true; a.paid = false;
    } else if (t < 5.5) { // turn and step in through the SIDE door
      const u = ease((t - 4.6) / 0.9);
      h.position.set(THREE.MathUtils.lerp(DOOR_X - 1.35, DOOR_X, u), 0, THREE.MathUtils.lerp(WALK_LINE_Z + 0.2, DOOR_Z, u));
      h.rotation.y = THREE.MathUtils.lerp(Math.PI / 2, Math.PI, ease(Math.min(1, (t - 4.6) / 0.35)));
      moving = true; scale = 1 - u * 0.2; if (u > 0.85) visible = false;
    } else if (t < 8.5) { visible = false; }
    else if (t < 9.4) { // climb out of the side door
      const u = ease((t - 8.5) / 0.9);
      h.position.set(DOOR_X, 0, THREE.MathUtils.lerp(DOOR_Z, WALK_LINE_Z, u));
      h.rotation.y = 0; moving = true; scale = 0.8 + u * 0.2;
    } else if (t < 14.2) { // pay the driver, then walk off along the paving
      const u = ease((t - 9.4) / 4.8);
      if (t > 9.6 && !a.paid) { a.paid = true; popFare(a.fare); }
      h.position.set(THREE.MathUtils.lerp(DOOR_X, 7, u), 0, WALK_LINE_Z);
      h.rotation.y = t < 10.1 ? THREE.MathUtils.lerp(0, Math.PI / 2, (t - 9.4) / 0.7) : Math.PI / 2;
      moving = t > 10; if (t < 10) { play(a, 'Idle'); }
    } else { visible = false; }
    h.visible = visible;
    h.scale.setScalar(scale);
    if (moving) { play(a, 'Walk'); } else if (visible) { play(a, 'Idle'); }
    if (a.woman && visible) stepCharacterGait(a.actor, time * 7.2 + a.offset, moving);
    return !visible && t >= 5.5 && t < 8.5;
  }

  let running = false; let last = 0; let clock = 0;
  function resize() {
    const w = hero.clientWidth || 360; const h = hero.clientHeight || 220;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - last < 33) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
    let riding = false;
    for (const a of actors) { if (placeActor(a, clock)) riding = true; }
    for (const m of mixers) m.update(dt);
    if (keke) {
      const jolt = riding ? Math.sin(clock * 22) * 0.012 : Math.sin(clock * 9) * 0.004; // idling engine
      keke.position.y = Math.max(0, jolt) + 0.0;
      keke.rotation.z = riding ? Math.sin(clock * 17) * 0.006 : 0;
    }
    if (driver) {
      const cyc = clock % 5;
      const yelling = cyc > 1.2 && cyc < 3.6;
      play(driver, yelling ? (Math.floor(clock / 5) % 2 ? 'Clapping' : 'Punch') : 'Idle');
      driver.holder.rotation.y = 0.35 + Math.sin(clock * 1.3) * 0.12;
      shoutClock += dt;
      bubble.classList.toggle('on', yelling);
      if (!yelling && cyc < 0.2 && shoutClock > 2) { shoutClock = 0; shoutIndex = (shoutIndex + 1) % SHOUTS.length; bubble.textContent = SHOUTS[shoutIndex]; }
    }
    if (!bubble.textContent) bubble.textContent = SHOUTS[0];
    // gentle handheld camera drift so the stage feels alive
    camera.position.set(2.2 + Math.sin(clock * 0.35) * 0.5, 2.1, 7.6);
    camera.lookAt(0.2, 0.95, 0.6);
    renderer.render(scene, camera);
  }
  function setRunning(on) {
    if (on && !running) { running = true; resize(); requestAnimationFrame((t) => { last = t; frame(t); }); }
    else if (!on) running = false;
  }
  const visibleNow = () => !screen.classList.contains('hidden') && !document.hidden && hero.offsetParent !== null;
  setInterval(() => { const on = visibleNow(); if (on !== running) setRunning(on); }, 400);
  window.addEventListener('resize', () => { if (running) resize(); });
  // Once the first frames exist, fade the still picture away.
  setTimeout(() => hero.classList.add('kano-stage-live'), 1200);
  setRunning(visibleNow());
}

if (typeof window !== 'undefined' && !window.__kanoStartStage) {
  window.__kanoStartStage = true;
  const go = () => { try { start(); } catch (e) { console.warn('[Kano Life] live start stage skipped', e); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
}
