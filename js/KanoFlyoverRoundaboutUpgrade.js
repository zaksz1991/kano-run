import { mergeChildMeshes } from './KanoMergeStaticMeshes.js';
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { getKanoSignboardTextureProfile } from './KanoSignboardClarityRules.js';

/**
 * KANO LIFE — Step 94: Kwankwasiyya flyover identity and Kano roundabout scenery.
 *
 * This additive renderer patch builds on Renderer3D's existing looping flyovers.
 * It adds readable bridge identity, retains the distinctive red/white parapets,
 * and adds lightweight roadside roundabout scenes with connecting approach arms.
 * This pass is intentionally visual-only: the base simulation still has a linear
 * road model, so actual route branching / U-turns / driving on top of the bridge
 * require a separate road-topology and vehicle-control implementation.
 */
const PATCH = Symbol.for('kano.life.flyoverRoundabout.step94');
const ROUNDABOUTS = [];
const SIGNATURES = [];
const AUDIT = {
  version: 1,
  installed: false,
  flyoverTheme: 'KWANKWASIYYA red-white Kano flyover',
  roundaboutTheme: 'Kano roadside landscaped roundabout',
  flyoverSignsCreated: 0,
  roundaboutsCreated: 0,
  loopedWithRoad: true,
  routeTopology: 'visual-only; straight-road simulation remains authoritative',
};

const mat = (color, roughness = 0.82, metalness = 0) => new THREE.MeshStandardMaterial({
  color, roughness, metalness, flatShading: true,
});

function addBox(parent, size, color, position, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    options.material || mat(color, options.roughness ?? 0.82),
  );
  mesh.position.set(position[0], position[1], position[2]);
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  mesh.name = options.name || 'kano_step94_mesh';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function makeSignTexture(title, subtitle, key, options = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const profile = getKanoSignboardTextureProfile();
  canvas.width = profile.width;
  canvas.height = profile.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bg = options.background || '#174c3b';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Kwankwasiyya-inspired red / white stripe identity on the sign edges.
  const band = profile.topBand;
  ctx.fillStyle = '#c63b37';
  ctx.fillRect(0, 0, canvas.width, band);
  ctx.fillRect(0, canvas.height - band, canvas.width, band);
  ctx.fillStyle = '#f7f2e7';
  ctx.fillRect(0, band, canvas.width, profile.innerBand);
  ctx.fillRect(0, canvas.height - band - profile.innerBand, canvas.width, profile.innerBand);

  ctx.strokeStyle = '#f7f2e7';
  ctx.lineWidth = profile.borderLineWidth;
  ctx.strokeRect(16, 50, canvas.width - 32, canvas.height - 100);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff8e7';
  ctx.font = `900 ${profile.titleFontSize}px Arial, sans-serif`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#08251d';
  ctx.lineWidth = profile.titleStrokeWidth;
  ctx.strokeText(title, canvas.width / 2, profile.titleY, canvas.width - 90);
  ctx.fillText(title, canvas.width / 2, profile.titleY, canvas.width - 90);
  ctx.fillStyle = '#f3d477';
  ctx.font = `700 ${profile.subtitleFontSize}px Arial, sans-serif`;
  ctx.strokeStyle = '#08251d';
  ctx.lineWidth = profile.subtitleStrokeWidth;
  ctx.strokeText(subtitle, canvas.width / 2, profile.subtitleY, canvas.width - 90);
  ctx.fillText(subtitle, canvas.width / 2, profile.subtitleY, canvas.width - 90);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = profile.anisotropy;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.name = key;
  return texture;
}

function addSignFace(parent, texture, width, height, position, name) {
  if (!texture) return null;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  sign.position.set(position[0], position[1], position[2]);
  sign.name = name;
  parent.add(sign);
  return sign;
}

function createKwankwasiyyaFlyoverSign(renderer, flyover, index) {
  const sign = new THREE.Group();
  sign.name = `KWANKWASIYYA_FLYOVER_SIGN_${index + 1}`;
  sign.userData.kanoKwankwasiyyaFlyoverSign = true;
  sign.userData.signStyle = 'red-white-stripe';

  // The sign sits above the flyover deck on its approach-facing parapet.
  // It is intentionally above deck height, not a low gantry blocking traffic.
  addBox(sign, [9.6, 1.42, 0.25], 0xf7f2e7, [0, 5.62, 7.76], { name: 'kwankwasiyya_sign_backing' });
  addBox(sign, [9.78, 0.16, 0.31], 0xc63b37, [0, 6.33, 7.76], { name: 'kwankwasiyya_red_top_stripe' });
  addBox(sign, [9.78, 0.16, 0.31], 0xf7f2e7, [0, 6.16, 7.76], { name: 'kwankwasiyya_white_top_stripe' });
  addBox(sign, [9.78, 0.16, 0.31], 0xc63b37, [0, 4.91, 7.76], { name: 'kwankwasiyya_red_bottom_stripe' });
  addBox(sign, [9.78, 0.16, 0.31], 0xf7f2e7, [0, 5.08, 7.76], { name: 'kwankwasiyya_white_bottom_stripe' });
  const texture = makeSignTexture('KWANKWASIYYA', 'FLYOVER  •  KANO STATE', `kwankwasiyya-flyover-${index + 1}`);
  const signFace = addSignFace(sign, texture, 9.25, 1.12, [0, 5.68, 7.635], 'kwankwasiyya_sign_face');
  signFace.rotation.y = Math.PI; // title panel faces the approach-facing side

  // Two robust brackets make the sign visibly belong to the flyover structure.
  for (const x of [-4.25, 4.25]) {
    addBox(sign, [0.22, 0.84, 0.2], 0xd6d4ca, [x, 4.98, 2.73], { name: 'kwankwasiyya_sign_bracket' });
    addBox(sign, [0.38, 0.12, 0.31], 0xc63b37, [x, 4.56, 2.73], { name: 'kwankwasiyya_sign_bracket_red_cap' });
  }

  sign.position.copy(flyover.position);
  renderer.world.add(sign);
  SIGNATURES.push({ sign, flyoverIndex: index, flyover });
  AUDIT.flyoverSignsCreated += 1;
}

function ensureFlyoverSignage(renderer) {
  if (!renderer?.flyovers?.length || !renderer.world) return;
  renderer.kanoFlyoverSignRecords ||= [];

  for (let index = 0; index < renderer.flyovers.length; index += 1) {
    const flyover = renderer.flyovers[index];
    if (!flyover) continue;
    let record = renderer.kanoFlyoverSignRecords.find((item) => item.index === index);
    if (!record) {
      const before = SIGNATURES.length;
      createKwankwasiyyaFlyoverSign(renderer, flyover, index);
      record = { index, flyover, sign: SIGNATURES[before].sign };
      renderer.kanoFlyoverSignRecords.push(record);
    } else {
      // Some model loaders swap a procedural flyover for a GLB after startup.
      record.flyover = flyover;
    }
    flyover.userData ||= {};
    flyover.userData.kanoKwankwasiyyaSignPresent = true;
    flyover.userData.kanoFlyoverTheme = 'KWANKWASIYYA red-white-stripe';
  }
}

function addRoadSurface(parent, length, width, position, alongX = true, name = 'roundabout_approach_road') {
  const size = alongX ? [length, 0.055, width] : [width, 0.055, length];
  return addBox(parent, size, 0x343c43, position, { name, roughness: 0.98 });
}

function createRoundabout(renderer, side, z, index) {
  const group = new THREE.Group();
  group.name = `KANO_ROUNDABOUT_SCENERY_${index + 1}`;
  group.userData.kanoRoundaboutScenery = true;
  group.userData.routeBranchingEnabled = false;
  group.userData.roundaboutTheme = 'Kano landscaped roundabout, red-white curb';
  const centreX = side * 12.7;

  // Connected approach surfaces: the inward arm joins the edge of the main road.
  addRoadSurface(group, 7.4, 3.5, [-side * 3.7, 0.018, 0], true, 'roundabout_main_road_approach');
  addRoadSurface(group, 5.4, 3.25, [side * 4.05, 0.018, 0], true, 'roundabout_outer_road_approach');
  addRoadSurface(group, 5.8, 3.25, [0, 0.018, -4.0], false, 'roundabout_north_road_approach');
  addRoadSurface(group, 5.8, 3.25, [0, 0.018, 4.0], false, 'roundabout_south_road_approach');

  // Roundabout ring and lane surface.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.62, 3.42, 48),
    mat(0x3a4248, 0.97),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.054;
  ring.name = 'roundabout_asphalt_ring';
  group.add(ring);

  // A low curb marks the island edge, with alternating red and white blocks.
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(1.54, 1.62, 0.23, 40),
    mat(0x3f7752, 0.95),
  );
  island.position.y = 0.125;
  island.name = 'roundabout_central_landscaped_island';
  group.add(island);
  const curbSegments = renderer.mobile ? 18 : 28;
  for (let segment = 0; segment < curbSegments; segment += 1) {
    const angle = (segment / curbSegments) * Math.PI * 2;
    const radius = 1.61;
    const curb = addBox(
      group,
      [0.37, 0.22, 0.18],
      segment % 2 === 0 ? 0xc63b37 : 0xf6f0df,
      [Math.cos(angle) * radius, 0.23, Math.sin(angle) * radius],
      { name: segment % 2 === 0 ? 'roundabout_red_curb_stripe' : 'roundabout_white_curb_stripe' },
    );
    curb.rotation.y = -angle;
  }

  // Centre planting and a modest Kano identity marker; low draw-call count.
  const planter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.94, 1.03, 0.12, 24),
    mat(0x9a9a83, 0.94),
  );
  planter.position.y = 0.29;
  planter.name = 'roundabout_planter_border';
  group.add(planter);
  const centreGreen = new THREE.Mesh(
    new THREE.CircleGeometry(0.88, 24),
    mat(0x498050, 0.95),
  );
  centreGreen.rotation.x = -Math.PI / 2;
  centreGreen.position.y = 0.36;
  group.add(centreGreen);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.13, 1.35, 7),
    mat(0x755239, 0.96),
  );
  trunk.position.set(0, 0.95, 0.02);
  group.add(trunk);
  const palmFronds = renderer.mobile ? 4 : 5;
  for (let leaf = 0; leaf < palmFronds; leaf += 1) {
    const angle = (leaf / palmFronds) * Math.PI * 2;
    const frond = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.76, 6),
      mat(leaf % 2 ? 0x287149 : 0x397f4d, 0.94),
    );
    frond.position.set(Math.cos(angle) * 0.28, 1.55 + (leaf % 2) * 0.08, Math.sin(angle) * 0.28);
    frond.rotation.z = Math.cos(angle) * -0.48;
    frond.rotation.x = Math.sin(angle) * 0.48;
    group.add(frond);
  }
  const shrubCount = renderer.mobile ? 4 : 6;
  for (let shrub = 0; shrub < shrubCount; shrub += 1) {
    const angle = (shrub / shrubCount) * Math.PI * 2;
    const bush = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 7, 5),
      mat(shrub % 2 ? 0x2d6a42 : 0x477f4c, 0.98),
    );
    bush.position.set(Math.cos(angle) * 0.67, 0.49, Math.sin(angle) * 0.67);
    bush.scale.set(1.35, 0.8, 1.05);
    group.add(bush);
  }

  // Short lane dashes around the circulating lane.
  const laneDashes = renderer.mobile ? 8 : 12;
  for (let dashIndex = 0; dashIndex < laneDashes; dashIndex += 1) {
    const angle = (dashIndex / laneDashes) * Math.PI * 2;
    const radius = 2.6;
    const dash = addBox(
      group,
      [0.12, 0.025, 0.52],
      0xe9e4d5,
      [Math.cos(angle) * radius, 0.09, Math.sin(angle) * radius],
      { name: 'roundabout_circulation_lane_marking' },
    );
    dash.rotation.y = -angle;
  }

  // Roadside sign, facing approaching traffic (+Z).
  addBox(group, [0.13, 1.65, 0.13], 0x555b55, [side * 2.65, 0.86, 2.15], { name: 'roundabout_sign_post' });
  addBox(group, [2.4, 0.98, 0.16], 0xf5f0e3, [side * 2.65, 1.86, 2.15], { name: 'roundabout_sign_backing' });
  const signTexture = makeSignTexture('KANO ROUNDABOUT', 'SLOW  •  GIVE WAY', `kano-roundabout-sign-${index + 1}`, { background: '#174c3b' });
  addSignFace(group, signTexture, 2.28, 0.86, [side * 2.65, 1.86, 2.245], 'kano_roundabout_sign_face');

  // Direction boards make this look like a junction, without falsely claiming
  // the current linear vehicle/path simulation can yet execute these turns.
  for (const [direction, label, boardZ] of [
    [-1, 'SABON GARI', -2.7],
    [1, 'KURMI MARKET', -3.55],
  ]) {
    const x = -side * 3.4;
    addBox(group, [1.85, 0.09, 0.15], 0xe8dfc7, [x, 1.48, boardZ], { name: 'roundabout_direction_board' });
    addBox(group, [0.10, 1.5, 0.10], 0x737a70, [x, 0.76, boardZ], { name: 'roundabout_direction_post' });
    // Use thin red/white arrow tips as visible, legible direction cues at range.
    addBox(group, [0.24, 0.12, 0.18], direction < 0 ? 0xc63b37 : 0xf5f0e3, [x + direction * 0.78, 1.48, boardZ], { name: `roundabout_direction_arrow_${direction}` });
    const placardTex = makeSignTexture(label, direction < 0 ? '← LEFT EXIT' : 'RIGHT EXIT →', `roundabout-direction-${index + 1}-${direction}`, { background: '#174c3b' });
    addSignFace(group, placardTex, 1.75, 0.7, [x, 1.49, boardZ + 0.09], `roundabout_direction_face_${direction}`);
  }

  // Fold the ~60 small coloured parts (curb blocks, dashes, shrubs, fronds) into one mesh.
  mergeChildMeshes(group);
  group.position.set(centreX, 0, z);
  renderer.world.add(group);
  ROUNDABOUTS.push(group);
  AUDIT.roundaboutsCreated += 1;
  return group;
}

function installRoundaboutScenes(renderer) {
  if (renderer.kanoRoundaboutSceneryInstalled || !renderer.world) return;
  renderer.kanoRoundaboutSceneryInstalled = true;
  renderer.kanoRoundaboutActors = [];
  const placements = [
    { side: 1, z: -48, index: 0 },
    { side: -1, z: -148, index: 1 },
  ];
  for (const placement of placements) {
    renderer.kanoRoundaboutActors.push(createRoundabout(renderer, placement.side, placement.z, placement.index));
  }
  renderer.kanoRoundaboutRecycleSpacing = renderer.mobile ? 92 : 108;
}

function signedScroll(state, deltaSeconds) {
  const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.05);
  const signedSpeed = Number.isFinite(state?.signedSpeed)
    ? state.signedSpeed
    : state?.reverse
      ? -Math.abs(Number(state?.speed) || 0)
      : Math.abs(Number(state?.speed) || 0);
  return signedSpeed * dt * 0.28;
}

// Real Kano flyover / interchange sites. A flyover is only built into the scene
// while the driver is on the route that actually has one (Kofar Mata flyover and
// the Dan Agundi interchange are real; other routes have none).
export const KANO_FLYOVER_SITES = {
  'Kofar Mata': { title: 'KOFAR MATA', subtitle: 'FLYOVER  •  KANO' },
  'Kofar Dan Agundi': { title: 'DAN AGUNDI', subtitle: 'INTERCHANGE  •  KANO' },
};

function applyFlyoverSite(renderer, routeName) {
  const site = KANO_FLYOVER_SITES[routeName] || null;
  const key = site ? routeName : '';
  const changed = renderer.__kanoFlyoverSiteKey !== key;
  renderer.__kanoFlyoverSiteKey = key;
  for (const flyover of renderer.flyovers || []) if (flyover) flyover.visible = Boolean(site);
  for (const record of renderer.kanoFlyoverSignRecords || []) {
    record.sign.visible = Boolean(site);
    if (site && changed) {
      const face = record.sign.getObjectByName('kwankwasiyya_sign_face');
      const texture = makeSignTexture(site.title, site.subtitle, `flyover-site-${routeName}-${record.index}`);
      if (face && texture) {
        face.material.map = texture;
        face.material.needsUpdate = true;
      }
    }
  }
}

function advanceRoundabouts(renderer, state, deltaSeconds) {
  const actors = renderer.kanoRoundaboutActors || [];
  if (renderer.lifeScene !== 'road' || !actors.length) return;
  const scroll = signedScroll(state, deltaSeconds);
  for (const actor of actors) actor.position.z += scroll;

  const farPass = 18;
  const farLimit = renderer.mobile ? -260 : -330;
  const spacing = renderer.kanoRoundaboutRecycleSpacing || 100;
  for (const actor of actors) {
    if (actor.position.z > farPass) {
      const otherDepths = actors.filter((item) => item !== actor).map((item) => item.position.z);
      actor.position.z = (otherDepths.length ? Math.min(...otherDepths) : -100) - spacing;
    } else if (actor.position.z < farLimit) {
      const otherDepths = actors.filter((item) => item !== actor).map((item) => item.position.z);
      actor.position.z = (otherDepths.length ? Math.max(...otherDepths) : -40) + spacing;
    }
  }

  // Keep signs aligned with a flyover even when an asynchronous GLB upgrade
  // substitutes its root object. Existing flyovers use the same 0.72 parallax.
  const flyoverScroll = scroll * 0.72;
  for (const record of renderer.kanoFlyoverSignRecords || []) {
    const flyover = renderer.flyovers?.[record.index];
    if (!flyover) continue;
    record.flyover = flyover;
    let z = flyover.position.z + flyoverScroll;
    const loop = renderer.flyoverLoopDistance || (renderer.mobile ? 260 : 306);
    if (z > 22) z -= loop;
    else if (z < -loop) z += loop;
    record.sign.position.set(flyover.position.x, flyover.position.y, z);
  }
}

function publishAudit() {
  if (typeof window === 'undefined') return;
  window.kanoFlyoverRoundaboutAudit = () => {
    const renderer = window.__KANO_ACTIVE_RENDERER__ || window.renderer || null;
    const flyovers = renderer?.flyovers || [];
    const roundabouts = renderer?.kanoRoundaboutActors || [];
    return {
      ...AUDIT,
      activeRenderer: Boolean(renderer),
      flyovers: flyovers.map((actor, index) => ({
        index,
        proceduralFallback: Boolean(actor.userData?.proceduralFlyover),
        kwankwasiyyaSign: Boolean(actor.userData?.kanoKwankwasiyyaSignPresent),
        stripedParapet: Boolean(actor.userData?.proceduralFlyover),
        position: { x: Number(actor.position.x.toFixed(2)), z: Number(actor.position.z.toFixed(2)) },
      })),
      roundabouts: roundabouts.map((actor) => ({
        name: actor.name,
        visualOnly: true,
        branchDrivingEnabled: false,
        position: { x: Number(actor.position.x.toFixed(2)), z: Number(actor.position.z.toFixed(2)) },
        meshCount: actor.children.length,
      })),
      note: 'The overpass sign and landscaped roundabout scenes are visible scenery. The existing road model is still linear; Step 94 does not enable real junction steering or driving on the flyover deck.',
    };
  };
}

if (!Renderer3D.prototype[PATCH]) {
  const originalBuildFlyover = Renderer3D.prototype.buildFlyover;
  if (typeof originalBuildFlyover === 'function') {
    Renderer3D.prototype.buildFlyover = function buildFlyoverWithKwankwasiyya(...args) {
      const result = originalBuildFlyover.apply(this, args);
      ensureFlyoverSignage(this);
      return result;
    };
  }

  const originalBuildWorld = Renderer3D.prototype.buildWorld;
  if (typeof originalBuildWorld === 'function') {
    Renderer3D.prototype.buildWorld = function buildWorldWithKanoRoundabouts(...args) {
      const result = originalBuildWorld.apply(this, args);
      installRoundaboutScenes(this);
      ensureFlyoverSignage(this);
      return result;
    };
  }

  const originalDraw = Renderer3D.prototype.draw;
  if (typeof originalDraw === 'function') {
    Renderer3D.prototype.draw = function drawWithKanoRoadLandmarks(state, deltaSeconds, ...args) {
      if (this.lifeScene === 'road') {
        ensureFlyoverSignage(this);
        advanceRoundabouts(this, state, deltaSeconds);
        if (state && typeof state.route === 'string') applyFlyoverSite(this, state.route);
      }
      return originalDraw.call(this, state, deltaSeconds, ...args);
    };
  }

  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true, configurable: false });
  AUDIT.installed = true;
}

publishAudit();
console.info('[Kano Life] Step 94 Kwankwasiyya flyover signage and Kano roundabout scenery registered.');
