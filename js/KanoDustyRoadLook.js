/**
 * Kano road look, matched to the player's reference photos of the new Kano roads: dark clean
 * charcoal tar (thin crisp white dashes and yellow edge lines come from the road paint), the
 * planted median with black-and-white kerbs and lamp posts, and a pale paved footpath on the
 * outer edge. Visual only: lanes, collisions, stops and fares are untouched.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { PACK_ASPHALT_URL, PACK_COBBLE_URL } from './KanoRoadPackTextures.js';

const PATCH = Symbol.for('kano.life.dustyRoadLook.v1');

let asphaltTexture = null;
const clones = [];
function dustyAsphalt() {
  if (asphaltTexture) return asphaltTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4d5259';
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // aggregate speckle (coarse + fine)
  for (let i = 0; i < 7000; i += 1) {
    const v = 68 + Math.floor(rand() * 34);
    ctx.fillStyle = `rgba(${v},${v + 1},${v + 4},${0.2 + rand() * 0.32})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
  }
  // worn pale grit
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = `rgba(190,188,180,${0.06 + rand() * 0.1})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, 1);
  }
  // (clean tar: no cracks, patches, stains or potholes: the new Kano roads are smooth dark asphalt)
  asphaltTexture = new THREE.CanvasTexture(canvas);
  asphaltTexture.wrapS = THREE.RepeatWrapping;
  asphaltTexture.wrapT = THREE.RepeatWrapping;
  asphaltTexture.colorSpace = THREE.SRGBColorSpace;
  asphaltTexture.anisotropy = 4;
  // Replace the procedural tar with the real asphalt from the player's road-pack model.
  try {
    const img = new Image();
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, size, size);
        ctx.fillStyle = 'rgba(62,64,69,0.38)';   // soften the grain so near tarmac reads smooth, not gravelly
        ctx.fillRect(0, 0, size, size);
        asphaltTexture.needsUpdate = true;
        clones.forEach((t) => { t.needsUpdate = true; });
      } catch (e) { /* keep procedural tar */ }
    };
    img.src = PACK_ASPHALT_URL;
  } catch (e) { /* keep procedural tar */ }
  return asphaltTexture;
}

function applyTexture(material, repeat) {
  if (!material) return;
  const base = dustyAsphalt();
  if (material.map && material.map.userData?.kanoDusty) return;
  const map = base.clone();
  map.needsUpdate = true;
  map.userData = { kanoDusty: true };
  clones.push(map);
  map.repeat.set(repeat[0], repeat[1]);
  material.map = map;
  material.color?.set(0xffffff);
  material.needsUpdate = true;
}

// Roadside strips (where passengers wait) are black tar like the road, not tiles.
const tarStrips = [];
function tarStrip(width) {
  const map = dustyAsphalt().clone();
  map.needsUpdate = true;
  map.userData = { kanoDusty: true };
  clones.push(map);
  map.repeat.set(Math.max(1, width / 1.25), 208);
  tarStrips.push(map);
  return map;
}
const cobbles = [];
function cobbleMap(width) {
  const tex = new THREE.TextureLoader().load(PACK_COBBLE_URL);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 250 / width);   // square cobbles, as on the real footpath
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { kanoCobble: true };
  cobbles.push(tex);
  return tex;
}

const LOOP_FAR = 215;
const KERB_STEP = 2.9;

function buildFootpath(renderer, k) {
  if (k.__kanoFootpath) return;
  const mat = (color, rough) => {
    const m = renderer.material(color, rough);
    m.userData = m.userData || {};
    m.userData.kanoNoShift = true;
    return m;
  };
  // pale paved footpath beyond the oncoming carriageway (x -15.2 to -17.6), as in the photos
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 250), mat(0xb8b4aa, 1));
  path.rotation.x = -Math.PI / 2;
  path.position.set(-16.4, 0.02, -92);
  path.name = 'KANO_FOOTPATH_PAVING';
  try {
    path.material.map = tarStrip(2.4); path.material.color.set(0xffffff); path.material.needsUpdate = true;
  } catch (e) { /* plain paving */ }
  k.group.add(path);
  // navy-and-white kerb blocks along the road edge of the footpath
  const positions = [];
  for (let z = 10; z > -LOOP_FAR; z -= KERB_STEP) positions.push(z);
  const geometry = new THREE.BoxGeometry(0.26, 0.2, KERB_STEP - 0.06);
  const mesh = new THREE.InstancedMesh(geometry, mat(0xffffff, 0.95), positions.length);
  const dummy = new THREE.Object3D();
  const navy = new THREE.Color(0x202326); const white = new THREE.Color(0xf1efe6);
  positions.forEach((z, i) => {
    dummy.position.set(-15.35, 0.1, z); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, i % 2 ? white : navy);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  root.userData.period = KERB_STEP * 2;
  k.group.add(root);
  k.roots.push(root);   // scrolls with the rest of the two-way road
  k.__kanoFootpath = true;
}

function recolour(renderer) {
  const world = renderer.world;
  if (!world) return;
  // player's carriageway
  const road = world.children.find((c) => c.geometry?.parameters?.width === 10 && c.geometry?.parameters?.height === 250);
  if (road) applyTexture(road.material, [8, 208]);
  const k = renderer.__kanoTwoWay;
  if (k) {
    applyTexture(k.asphaltMaterial, [6.1, 208]);
    k.hasMap = true; // stop the original code from putting its dark texture back
    buildFootpath(renderer, k);
  }
  // Dedicated black-tar footways, one per side. The original footway planes are not drawn on the phone
  // build, which left raw yellow sand beside the road. These are drawn on top of the sand, identical both sides.
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'KANO_TAR_FOOTWAY_LEFT' : 'KANO_TAR_FOOTWAY_RIGHT';
    if (world.getObjectByName(name)) continue;
    const ref = world.getObjectByName('KANO_LEFT_SAND_VERGE') || world.getObjectByName('KANO_RIGHT_SAND_VERGE');
    if (!ref) continue;
    const mat = new ref.material.constructor({ color: 0xf0f0f0 });
    mat.userData = { kanoNoShift: true };
    try { mat.map = tarStrip(4.5); } catch (e) { mat.color.set(0x2c2e32); }
    const strip = new ref.constructor(new ref.geometry.constructor(4.5, 250), mat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(side * 6.85, -0.02, -92);
    strip.name = name;
    strip.renderOrder = 1;
    world.add(strip);
  }
  // A plain sand shoulder lay over the left footway; hide it so the left footway shows like the right one.
  const shoulder = world.getObjectByName('KANO_ROADSIDE_SHOULDER_LEFT');
  if (shoulder) shoulder.visible = false;
  // Both footways are the same cobble paving (the two sides of the road match).
  for (const name of ['KANO_RIGHT_SAND_VERGE', 'KANO_LEFT_SAND_VERGE']) {
    const verge = world.getObjectByName(name);
    if (verge?.material && !verge.material.map?.userData?.kanoDusty) {
      try { verge.material.map = tarStrip(2.7); verge.material.color.set(0xf0f0f0); verge.material.needsUpdate = true; } catch (e) { /* plain tar */ }
    }
    if (verge?.material) {
      // A sand strip lies at the same height beside it; without this the sand won on the left and showed as a yellow road edge.
      verge.position.y = -0.04;
    }
  }
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype[PATCH]) {
  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true });
  const draw = Renderer3D.prototype.draw;
  let last = 0;
  if (typeof draw === 'function') {
    Renderer3D.prototype.draw = function drawWithDustyRoad(...args) {
      // The road grit must travel with the world: a static texture looks stuck to the keke while moving.
      try {
        const st = args[0]; const dt = Math.max(0, Math.min(0.05, Number(args[1]) || 0));
        const signed = Number.isFinite(st?.signedSpeed) ? st.signedSpeed : st?.reverse ? -Math.abs(Number(st?.speed) || 0) : Math.abs(Number(st?.speed) || 0);
        this.__kanoRoadGritScroll = (this.__kanoRoadGritScroll || 0) + signed * dt * 0.28;
        if (this.lifeScene === 'road') {
          const rows = [];
          const road = this.world?.children?.find((c) => c.geometry?.parameters?.width === 10 && c.geometry?.parameters?.height === 250);
          if (road?.material?.map?.userData?.kanoDusty) rows.push(road.material.map);
          const onc = this.__kanoTwoWay?.asphaltMaterial?.map;
          if (onc?.userData?.kanoDusty) rows.push(onc);
          for (const map of rows) map.offset.y = (this.__kanoRoadGritScroll * map.repeat.y / 250) % 1;
          for (const map of tarStrips) map.offset.y = (this.__kanoRoadGritScroll * map.repeat.y / 250) % 1;
          for (const map of cobbles) map.offset.y = (this.__kanoRoadGritScroll * map.repeat.y / 250) % 1;
        }
      } catch (_) { /* cosmetic */ }
      const now = performance.now();
      if (now - last > 1000) {
        last = now;
        try { if (this.lifeScene === 'road') recolour(this); } catch (error) { console.warn('[Kano Life] Dusty road look skipped safely.', error); }
      }
      return draw.apply(this, args);
    };
  }
}
