import * as THREE from 'three';
import { getMobileTier, getMobileRenderBudget, getMobileTrafficModelBudget } from './KanoDeviceTier.js';
import { disposeOwnedZoneLabelTexture } from './KanoZoneTextureLifecycle.js';
import { advanceInstancedRoadPattern } from './KanoInstancedRoadScroll.js';
import { buildKekeEvidenceNamePaths, classifyKekeMeshEvidence, hasVisiblePathWithinRoot } from './KanoKekeStructureEvidence.js';
import { inspectPlayerKekeRenderability } from './KanoPlayerKekeRuntimeGuard.js';
import { capturePlayerKekeRecoveryPose } from './KanoPlayerKekeRecoveryTransform.js';
import { createKekeRuntimeDiagnostics } from './KanoKekeRuntimeDiagnostics.js';
import { measureKekeCameraDiagnostics } from './KanoKekeCameraDiagnostics.js';
import { inspectKekeRenderState } from './KanoKekeRenderStateDiagnostics.js';

const VEHICLE_MODEL_KEY = {
  keke: 'keke',
  car: 'car',
  taxi: 'taxi',
  suv: 'suv',
  truck: 'truck',
  bus: 'bus',
  motorcycle: 'motorcycle',
  police: 'police',
  karota: 'karota',
  ambulance: 'ambulance',
};

/**
 * Safely disposes resources owned by a scene subtree.
 * Cached GLB geometry must not be disposed while shared by other actors.
 */
function updateMobileActorDistanceVisibility(actor, limit, cameraZ) {
  if (!actor?.position) return;

  const shouldBeVisible = Math.abs(actor.position.z - cameraZ) <= limit;
  // Avoid redundant Object3D.visible writes on every visibility pass.
  if (actor.visible !== shouldBeVisible) actor.visible = shouldBeVisible;
}

/**
 * Keep only the active cached life-scene group attached to the scene graph.
 * Three.js updates world matrices for descendants even when an ancestor is
 * merely marked invisible. Detaching inactive cached groups preserves their
 * geometry and state without making every previously visited diorama part of
 * the render traversal. Pass null to detach all cached life scenes.
 */
export function mountActiveLifeDiorama(root, groups, activeName = null) {
  if (!root || !(groups instanceof Map)) return null;

  let activeGroup = null;
  for (const [name, group] of groups) {
    if (name === activeName) {
      if (group.parent !== root) root.add(group);
      if (!group.visible) group.visible = true;
      activeGroup = group;
      continue;
    }

    if (group.visible) group.visible = false;
    if (group.parent === root) root.remove(group);
  }

  root.visible = Boolean(activeGroup);
  return activeGroup;
}

function disposeSceneTree(root, { disposeTextures = false } = {}) {
  if (!root) return;

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  const visit = (object, inheritedSharedGeometry = false) => {
    const sharedGeometry =
      inheritedSharedGeometry ||
      object.userData?.sharedGeometry === true;

    if (
      object.geometry &&
      !sharedGeometry &&
      !geometries.has(object.geometry)
    ) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }

    const materialList = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    for (const material of materialList) {
      if (!material || materials.has(material)) continue;

      materials.add(material);

      if (disposeTextures && !sharedGeometry) {
        for (const value of Object.values(material)) {
          if (value?.isTexture && !textures.has(value)) {
            textures.add(value);
            value.dispose();
          }
        }
      }

      material.dispose();
    }

    for (const child of object.children || []) {
      visit(child, sharedGeometry);
    }
  };

  visit(root);
}

export class Renderer3D {
  constructor(canvas, models, { mobile = false } = {}) {
    this.canvas = canvas;
    this.models = models;
    this.mobile = mobile;
    this.mobileTier = mobile ? getMobileTier() : 'desktop';
    this.ready = false;
    this.disposed = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ccde5);
    this.scene.fog = new THREE.Fog(0x8ccde5, mobile ? 24 : 48, mobile ? 105 : 195);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, mobile ? 125 : 260);
    this.camera.position.set(0, 3.85, 10.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      alpha: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });

    this.renderer.setPixelRatio(
      mobile
        ? Math.min(window.devicePixelRatio || 1, getMobileRenderBudget(this.mobileTier).start)
        : Math.min(window.devicePixelRatio || 1, 1.5),
    );

    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.trafficActors = new Map();
    // Reuse hot-path collections: traffic sync runs on every active driving
    // frame, so rebuilding these sets/arrays creates avoidable garbage.
    this._activeTrafficIds = new Set();
    this._activeZoneIds = new Set();
    this._nextMobileWorldAssetUpgradeAt = 0;
    this._nextMobilePedestrianUpgradeAt = 0;
    // Distance visibility is a low-frequency presentation task, not part of
    // per-frame movement or collision simulation.
    this._nextMobileDistanceCullAt = 0;
    this._mobileTrafficCandidateScratch = [];
    this._nextMobileGlbTrafficSelectionAt = 0;
    this._mobileTrafficTypeScratch = new Set();
    this.zoneActors = new Map();
    this.laneDashes = [];
    this.laneDashInstanced = null;
    this.laneDashRecords = [];
    this.laneDashObject = new THREE.Object3D();
    this.curbInstanced = null;
    this.curbRecords = [];
    this.curbObject = new THREE.Object3D();
    this._mobileGlbTrafficIds = new Set();
    this._mobileTrafficVehicleGeometry = new Map();
    // One dynamic instanced draw per fallback vehicle type on phones.
    this._mobileTrafficBatches = new Map();
    this._mobileFallbackTrafficByType = new Map();
    this._mobileTrafficInstanceTransform = new THREE.Object3D();
    this.pedestrians = [];
    this.streetLights = [];
    this.roadProps = [];
    this.buildingSlots = [];

    // Instanced Kano roadside detail keeps added scenery inexpensive on phones.
    this.kanoNeemTrees = [];
    this.kanoDividerSegments = [];
    this.kanoRoadsideMeshes = {};
    this.kanoRoadsideLoopDistance = 250;
    this.kanoDividerLoopDistance = 100;
    this.kanoRoadsideDummy = new THREE.Object3D();
    this.achabaGeometries = new Map();

    this.buildingLoopDistance = mobile ? 155 : 231;

    this.flyoverFallback = null;
    this.flyovers = [];
    this.flyoverModelAdded = false;
    this.flyoverLoopDistance = mobile ? 260 : 306;

    this.lifeScene = 'road';
    // Runtime recovery checks are throttled; never scan the full GLB tree every frame.
    this._nextPlayerKekeRuntimeCheckAt = 0;
    this._playerKekeRuntimeRecoveryCount = 0;
    this._lastKekeRuntimeDiagnostic = { phase: 'renderer-startup', reason: 'player-created', at: 'not checked' };
    this._kekeRuntimeDiagnostics = null;
    this._nextKekeCameraDiagnosticsAt = 0;
    this._cachedKekeCameraDiagnostics = null;
    this._cachedKekeRenderStateDiagnostics = null;
    this.garageGroup = null;
    this.securityActor = null;
    this.securityUsingModel = false;
    this.driveFacingY = 0;
    this.lifeDioramaRoot = null;
    this.lifeSceneGroups = new Map();
    this.lifeAssetSlots = [];
    this.garageVehicleSlots = [];

    this.driverAnimationTime = 0;
    this.driverAnimationParts = null;
    this.previousSteer = 0;
    this.lastPaint = null;
    this.currentPaint = '#f5c542';

    this.buildWorld();

    this.player = this.makeKeke();
    this.player.position.set(0, 0, 2);
    this.scene.add(this.player);

    // Garage and life-scene geometry is created only when that scene is first
    // entered. The normal driving scene should not pay their startup CPU/memory
    // cost, and the scenes remain cached after first use for quick revisits.
    this._nextLifeSceneAssetUpgradeAt = 0;

    this.ready = true;
    // No on-screen UI is created unless the URL explicitly contains
    // ?debugKeke=1. The opt-in panel helps capture real runtime evidence.
    this._kekeRuntimeDiagnostics = createKekeRuntimeDiagnostics();
    this.updatePlayerKekeDiagnostics(true);
  }

  material(color, roughness = 1) {
    // Procedural fallback scenery dominates the mobile scene and does not need
    // physically based roughness/metalness lighting. Lambert shading uses a
    // cheaper shader while retaining directional lighting, colour and texture
    // support. This changes only this renderer's procedural materials on phones;
    // imported GLB materials and all desktop materials keep their authored path.
    const side = this.mobile ? THREE.FrontSide : THREE.DoubleSide;
    if (this.mobile) {
      return new THREE.MeshLambertMaterial({ color, side });
    }
    return new THREE.MeshStandardMaterial({ color, roughness, side });
  }

  loadOptionalTexture(url, material, repeat = [1, 1]) {
    try {
      const loader = new THREE.TextureLoader();

      loader.load(
        url,
        (texture) => {
          if (!this.ready || !this.scene || this.disposed) {
            texture.dispose();
            return;
          }

          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(repeat[0], repeat[1]);
          texture.colorSpace = THREE.SRGBColorSpace;

          material.map = texture;
          material.color.set(0xffffff);
          material.needsUpdate = true;
        },
        undefined,
        () => {
          // The fallback material remains usable if the texture is unavailable.
        },
      );
    } catch {
      // Optional textures must never prevent the game from rendering.
    }
  }

  buildWorld() {
    const asphaltMaterial = this.material(0x343c43);

    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(10.0, 250),
      asphaltMaterial,
    );

    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.z = -92;
    this.world.add(asphalt);

    this.loadOptionalTexture(
      '/assets/models/environment/ground/asphalt.jpg',
      asphaltMaterial,
      [3, 64],
    );

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 270),
      this.material(0xa59a78),
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.09, -92);
    this.world.add(ground);

    // Kano-style sandy shoulders. These sit above the broad ground plane but
    // outside the asphalt, creating a distinct dry verge without extra texture
    // downloads or per-frame objects.
    const vergeMaterial = this.material(0xb6a077);
    const vergeEdgeMaterial = this.material(0x988563);
    for (const side of [-1, 1]) {
      const verge = new THREE.Mesh(
        new THREE.PlaneGeometry(2.7, 250),
        vergeMaterial,
      );
      verge.rotation.x = -Math.PI / 2;
      verge.position.set(side * 6.35, -0.075, -92);
      verge.name = side < 0 ? 'KANO_LEFT_SAND_VERGE' : 'KANO_RIGHT_SAND_VERGE';
      this.world.add(verge);

      const dustyShoulderEdge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 250),
        vergeEdgeMaterial,
      );
      dustyShoulderEdge.rotation.x = -Math.PI / 2;
      dustyShoulderEdge.position.set(side * 7.82, -0.072, -92);
      this.world.add(dustyShoulderEdge);

      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.075, 250),
        this.material(0xe8d5a4),
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(side * 4.54, 0.026, -92);
      this.world.add(edge);
    }

    // Painted black-and-white kerbs are one InstancedMesh, not hundreds of
    // separate meshes. They mark the actual asphalt boundary and are recycled
    // by the existing road-scroll update, so they cannot drift away from stops.
    const curbRecords = [];
    let curbSegment = 0;
    for (let z = -3.0; z > -248; z -= 2.9) {
      for (const side of [-1, 1]) {
        curbRecords.push({
          x: side * 4.86,
          z,
          color: curbSegment % 2 === 0 ? 0x202326 : 0xeee9df,
        });
      }
      curbSegment += 1;
    }
    const curbGeometry = new THREE.BoxGeometry(0.28, 0.16, 2.84);
    // Route road-detail shading through the same tier-aware material factory.
    // Phones use Lambert shading; desktop retains Standard material, keeping
    // this large instanced road-edge batch cheaper without changing its colors.
    const curbMaterial = this.material(0xffffff, 0.96);
    const curbMesh = new THREE.InstancedMesh(
      curbGeometry,
      curbMaterial,
      curbRecords.length,
    );
    curbMesh.name = 'KANO_INSTANCED_BLACK_WHITE_KERBS';
    curbMesh.userData.kanoRoadKerbs = true;
    // The pattern spans the full road loop and its instance transforms recycle.
    // A permanently valid static frustum bound is therefore not available.
    curbMesh.frustumCulled = false;
    curbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const curbColor = new THREE.Color();
    for (let index = 0; index < curbRecords.length; index += 1) {
      const record = curbRecords[index];
      this.curbObject.position.set(record.x, 0.08, record.z);
      this.curbObject.rotation.set(0, 0, 0);
      this.curbObject.scale.set(1, 1, 1);
      this.curbObject.updateMatrix();
      curbMesh.setMatrixAt(index, this.curbObject.matrix);
      curbColor.setHex(record.color);
      curbMesh.setColorAt(index, curbColor);
    }
    curbMesh.instanceMatrix.needsUpdate = true;
    if (curbMesh.instanceColor) curbMesh.instanceColor.needsUpdate = true;
    curbMesh.computeBoundingSphere();
    this.world.add(curbMesh);
    this.curbInstanced = curbMesh;
    this.curbRecords = curbRecords;

    // Lane dashes are repeated geometry with one material. Batch all 58
    // markings into a single draw call instead of updating/rendering 58 meshes.
    const laneDashGeometry = new THREE.PlaneGeometry(0.095, 3.4);
    const laneDashMaterial = this.material(0xe8e0c8);
    const laneDashRecords = [];
    for (const x of [-1.8, 1.8]) {
      for (let z = -4; z > -245; z -= 8.5) {
        laneDashRecords.push({ x, z });
      }
    }
    const laneDashMesh = new THREE.InstancedMesh(
      laneDashGeometry, laneDashMaterial, laneDashRecords.length,
    );
    laneDashMesh.name = 'KANO_INSTANCED_LANE_MARKINGS';
    laneDashMesh.userData.kanoLaneDashInstancing = true;
    laneDashMesh.frustumCulled = false;
    laneDashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < laneDashRecords.length; index += 1) {
      const record = laneDashRecords[index];
      this.laneDashObject.position.set(record.x, 0.028, record.z);
      this.laneDashObject.rotation.set(-Math.PI / 2, 0, 0);
      this.laneDashObject.scale.set(1, 1, 1);
      this.laneDashObject.updateMatrix();
      laneDashMesh.setMatrixAt(index, this.laneDashObject.matrix);
    }
    laneDashMesh.instanceMatrix.needsUpdate = true;
    this.world.add(laneDashMesh);
    this.laneDashInstanced = laneDashMesh;
    this.laneDashRecords = laneDashRecords;
    laneDashGeometry.computeBoundingSphere();

    const buildingCount = this.mobile ? 10 : 24;
    const buildingSpacing = this.mobile ? 14 : 9;

    this.buildingLoopDistance =
      buildingCount * buildingSpacing + 15;

    const buildingColors = [
      0xd0b78e,
      0xb98e6b,
      0xd8c8a3,
      0x8d8e7a,
    ];

    for (let index = 0; index < buildingCount; index += 1) {
      const side = index % 2 ? 1 : -1;
      const z = -index * buildingSpacing - 8;
      const x = side * (9 + (index % 3) * 2.8);
      const height = 2.2 + (index % 4) * 0.7;
      const width = 2.8 + (index % 3) * 0.7;

      const buildingGroup = new THREE.Group();

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, 3),
        this.material(buildingColors[index % buildingColors.length]),
      );

      building.position.set(0, height / 2, 0);
      buildingGroup.add(building);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.15, 0.15, 3.15),
        this.material(0x9d5740),
      );

      roof.position.set(0, height + 0.05, 0);
      buildingGroup.add(roof);

      this.addWindows(buildingGroup, width, height);

      buildingGroup.position.set(x, 0, z);
      this.world.add(buildingGroup);

      this.buildingSlots.push({
        actor: buildingGroup,
        x,
        z,
        height,
        side,
        industrial: index % 6 === 3,
        replaced: false,
      });

      if (index % 4 === 0) {
        this.addBillboard(
          x - side * 1.5,
          2.7,
          z + 1.75,
          index % 2 === 0,
        );
      }
    }

    const hemi = new THREE.HemisphereLight(
      0xeaf7ff,
      0x75634d,
      1.8,
    );

    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffedca, 1.75);
    sun.position.set(-8, 14, 5);
    this.scene.add(sun);

    this.addBillboard(-8.7, 3.1, -45, false);
    this.addBillboard(8.7, 3.1, -78, true);

    this.buildFlyover();
    this.buildSidewalkLife();
    this.buildRoadsideProps();
    this.buildKanoRoadsideSet();
  }

  addWindows(buildingGroup, width, height) {
    if (this.mobile) return;

    const count = Math.max(1, Math.floor(width / 0.8));

    for (
      let row = 0;
      row < Math.max(1, Math.floor(height / 1.2));
      row += 1
    ) {
      for (let col = 0; col < count; col += 1) {
        const windowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.24, 0.32),
          this.material(0x4f7180),
        );

        windowMesh.position.set(
          -width * 0.35 + col * 0.65,
          0.6 + row * 0.9,
          1.51,
        );

        buildingGroup.add(windowMesh);
      }
    }
  }

  /**
   * Procedural Kano flyovers with alternating red-and-white parapet markings.
   * These remain available when the optional GLB flyover assets fail to load.
   */
  buildFlyover() {
    const positions = this.mobile
      ? [-72, -202]
      : [-72, -174, -276];

    this.flyoverLoopDistance = this.mobile ? 260 : 306;

    for (const [index, z] of positions.entries()) {
      const group = new THREE.Group();
      const width = this.mobile ? 22 : 26;

      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.58, 5.2),
        this.material(index % 2 === 0 ? 0x858d92 : 0x777f84),
      );

      deck.position.y = 4.35;
      group.add(deck);

      for (const sideZ of [-2.25, 2.25]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(width, 0.3, 0.24),
          this.material(0xf0eee6),
        );

        rail.position.set(0, 4.77, sideZ);
        group.add(rail);

      }

      // One InstancedMesh renders both red/white parapet stripes on this
      // flyover. The former loop created 22 mobile / 30 desktop meshes and
      // materials per span, wasting draw calls for a purely decorative detail.
      const stripeCount = this.mobile ? 11 : 15;
      const stripeWidth = width / stripeCount;
      const stripeGeometry = new THREE.BoxGeometry(
        stripeWidth * 0.96,
        0.29,
        0.035,
      );
      // Match the mobile procedural shader budget for repeated flyover stripes.
      const stripeMaterial = this.material(0xffffff, 0.92);
      const stripes = new THREE.InstancedMesh(
        stripeGeometry,
        stripeMaterial,
        stripeCount * 2,
      );
      stripes.name = `KANO_FLYOVER_STRIPES_${index}`;
      stripes.userData.kanoFlyoverStripeInstancing = true;
      const stripeMatrix = new THREE.Matrix4();
      const stripePosition = new THREE.Vector3();
      const stripeQuaternion = new THREE.Quaternion();
      const stripeScale = new THREE.Vector3(1, 1, 1);
      const stripeColor = new THREE.Color();
      let stripeInstance = 0;

      for (const sideZ of [-2.25, 2.25]) {
        for (let stripeIndex = 0; stripeIndex < stripeCount; stripeIndex += 1) {
          stripePosition.set(
            -width / 2 + stripeWidth * (stripeIndex + 0.5),
            4.78,
            sideZ + (sideZ > 0 ? 0.135 : -0.135),
          );
          stripeMatrix.compose(stripePosition, stripeQuaternion, stripeScale);
          stripes.setMatrixAt(stripeInstance, stripeMatrix);
          stripeColor.setHex(stripeIndex % 2 === 0 ? 0xc83d37 : 0xf4eee0);
          stripes.setColorAt(stripeInstance, stripeColor);
          stripeInstance += 1;
        }
      }

      stripes.instanceMatrix.needsUpdate = true;
      if (stripes.instanceColor) stripes.instanceColor.needsUpdate = true;
      stripes.computeBoundingSphere();
      group.add(stripes);

      for (const x of [-8.4, 8.4]) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 4.35, 0.95),
          this.material(0x777e83),
        );

        pillar.position.set(x, 2.17, 0);
        group.add(pillar);

        if (!this.mobile) {
          const base = new THREE.Mesh(
            new THREE.BoxGeometry(1.25, 0.35, 1.35),
            this.material(0x6a7075),
          );

          base.position.set(x, 0.18, 0);
          group.add(base);
        }
      }

      group.position.set(0, 0, z);
      group.userData.proceduralFlyover = true;
      group.userData.flyoverIndex = index;

      this.world.add(group);
      this.flyovers.push(group);
    }

    this.flyoverFallback = this.flyovers[0] || null;
  }

  buildGarageScene() {
    const group = new THREE.Group();

    group.visible = false;
    this.scene.add(group);
    this.garageGroup = group;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 26),
      this.material(0x9d998d),
    );

    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.08, -1);
    group.add(floor);

    const wall = this.material(0xb69b78);
    const wallShadow = this.material(0x8c775f);

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(19, 4.3, 0.36),
      wall,
    );

    backWall.position.set(0, 2.05, -10.3);
    group.add(backWall);

    for (const x of [-9.3, 9.3]) {
      const sideWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 4.1, 21),
        wall,
      );

      sideWall.position.set(x, 2, -0.2);
      group.add(sideWall);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.18, 21.4),
        wallShadow,
      );

      cap.position.set(x, 4.1, -0.2);
      group.add(cap);
    }

    const steel = this.material(0x37434a);

    for (const x of [-4.7, 4.7]) {
      for (const z of [-3.6, 2.5]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 4.15, 8),
          steel,
        );

        post.position.set(x, 2.05, z);
        group.add(post);
      }

      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 7.2),
        steel,
      );

      beam.position.set(x, 4.15, -0.55);
      group.add(beam);
    }

    for (let index = 0; index < (this.mobile ? 4 : 7); index += 1) {
      const rafter = new THREE.Mesh(
        new THREE.BoxGeometry(9.55, 0.11, 0.12),
        steel,
      );

      rafter.position.set(0, 4.12, -3.4 + index * 0.95);
      group.add(rafter);
    }

    const shutter = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 3.15, 0.12),
      this.material(0x777e80),
    );

    shutter.position.set(0.6, 1.65, -10.05);
    group.add(shutter);

    for (let y = 0.35; y < 3.0; y += 0.28) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(5.25, 0.035, 0.03),
        this.material(0x515b60),
      );

      slat.position.set(0.6, y, -9.96);
      group.add(slat);
    }

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.6, 2.4),
      this.material(0xc8b79a),
    );

    cabin.position.set(-6.0, 1.25, -5.3);
    group.add(cabin);

    const cabinWindow = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.62, 0.06),
      this.material(0x45606a),
    );

    cabinWindow.position.set(-6.0, 1.75, -4.05);
    group.add(cabinWindow);

    const guardDesk = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.78, 0.58),
      this.material(0x72543b),
    );

    guardDesk.position.set(-4.4, 0.39, -3.5);
    group.add(guardDesk);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 640;
    signCanvas.height = 160;

    const signCtx = signCanvas.getContext('2d');

    if (signCtx) {
      signCtx.fillStyle = '#183326';
      signCtx.fillRect(0, 0, 640, 160);

      signCtx.fillStyle = '#f6d46d';
      signCtx.font = '900 42px Arial, sans-serif';
      signCtx.textAlign = 'center';
      signCtx.fillText('KANO KEKE PARK', 320, 65);

      signCtx.fillStyle = '#ffffff';
      signCtx.font = '700 24px Arial, sans-serif';
      signCtx.fillText('SECURITY · PARKING YARD', 320, 112);
    }

    const signTexture = new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace = THREE.SRGBColorSpace;

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.1, 1.25),
      new THREE.MeshBasicMaterial({
        map: signTexture,
        side: THREE.DoubleSide,
      }),
    );

    sign.position.set(0.6, 4.55, -9.96);
    group.add(sign);

    this.securityActor = this.makeSecurityPlaceholder();
    this.securityActor.position.set(-3.7, 0, -1.8);
    this.securityActor.rotation.y = -0.55;
    group.add(this.securityActor);

    for (const parked of [
      { x: -2.9, z: -2.8, rot: -0.22, scale: 0.72 },
      { x: 3.05, z: -3.45, rot: 0.18, scale: 0.68 },
    ]) {
      const actor = this.makeKeke();

      actor.position.set(parked.x, 0, parked.z);
      actor.rotation.y = parked.rot;
      actor.scale.setScalar(parked.scale);

      group.add(actor);

      this.garageVehicleSlots.push({
        actor,
        ...parked,
        replaced: false,
      });
    }

    for (const x of [-2.1, 3.0]) {
      const stop = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.14, 3.4),
        this.material(0xe0d5b1),
      );

      stop.position.set(x, 0.02, -0.6);
      group.add(stop);
    }

    const lamp = new THREE.PointLight(0xffd6a0, 1.35, 17);
    lamp.position.set(0, 4.0, 0.5);
    group.add(lamp);
  }

  makeSecurityPlaceholder() {
    const guard = new THREE.Group();

    const uniform = this.material(0x315b47);
    const skin = this.material(0x70472f);
    const trousers = this.material(0x29313a);
    const capMaterial = this.material(0x233d32);

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 0.9, 9),
      uniform,
    );

    torso.position.y = 1.05;
    guard.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      skin,
    );

    head.position.y = 1.68;
    guard.add(head);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.1, 10),
      capMaterial,
    );

    cap.position.y = 1.84;
    guard.add(cap);

    for (const x of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.1, 0.58, 8),
        trousers,
      );

      leg.position.set(x, 0.34, 0);
      guard.add(leg);

      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.17, 0.09, 0.28),
        this.material(0x20262a),
      );

      boot.position.set(x, 0.07, 0.06);
      guard.add(boot);
    }

    for (const x of [-0.29, 0.29]) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 0.68, 8),
        uniform,
      );

      arm.position.set(x, 1.1, 0.01);
      arm.rotation.z = x < 0 ? -0.22 : 0.22;
      guard.add(arm);
    }

    guard.userData.securityPlaceholder = true;

    return guard;
  }

  ensureGarageScene() {
    if (this.garageGroup) return this.garageGroup;
    this.buildGarageScene();
    return this.garageGroup;
  }

  setLifeScene(sceneName) {
    if (!this.ready || !this.player) return;

    const valid = new Set([
      'road',
      'garage',
      'bedroom',
      'household',
      'street',
      'breakfast',
      'walk',
      'school',
    ]);

    const nextScene = valid.has(sceneName) ? sceneName : 'road';

    if (nextScene === 'garage') {
      this.ensureGarageScene();
    } else if (nextScene !== 'road') {
      this.buildLifeDioramas(nextScene);
    }

    this.lifeScene = nextScene;

    if (nextScene === 'road') {
      if (this.player.parent) {
        this.player.parent.remove(this.player);
      }

      this.scene.add(this.player);
      this.player.visible = true;
      this.player.position.set(0, 0, 2);
      this.player.rotation.set(0, this.driveFacingY, 0);

      if (this.garageGroup) this.garageGroup.visible = false;

      mountActiveLifeDiorama(
        this.lifeDioramaRoot,
        this.lifeSceneGroups,
        null,
      );

      this.world.visible = true;

      return;
    }

    if (nextScene === 'garage') {
      if (this.player.parent) {
        this.player.parent.remove(this.player);
      }

      this.garageGroup.add(this.player);

      this.player.visible = true;
      this.player.position.set(0.7, 0, 1.45);
      this.player.rotation.set(0, Math.PI, 0);

      this.world.visible = false;

      mountActiveLifeDiorama(
        this.lifeDioramaRoot,
        this.lifeSceneGroups,
        null,
      );

      this.garageGroup.visible = true;

      this.camera.position.set(5.1, 3.35, 8.6);
      this.camera.lookAt(0, 1.0, -0.4);

      this.upgradeGarageAssets();
      this.upgradeGarageVehicles();

      return;
    }

    if (this.player.parent) {
      this.player.parent.remove(this.player);
    }

    this.scene.add(this.player);
    this.player.visible = false;

    this.world.visible = false;
    if (this.garageGroup) this.garageGroup.visible = false;

    mountActiveLifeDiorama(
      this.lifeDioramaRoot,
      this.lifeSceneGroups,
      nextScene,
    );

    this.upgradeLifeSceneAssets();

    this.camera.position.set(0, 4.15, 14.2);
    this.camera.lookAt(0, 1.35, -0.4);
  }

  makeLocalCompoundFacade(color = 0xc4a77b) {
    const group = new THREE.Group();

    const wall = this.material(color);
    const shadow = this.material(0x80674e);
    const door = this.material(0x4b3929);
    const window = this.material(0x536b70, 0.35);

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 3.35, 0.32),
      wall,
    );

    shell.position.y = 1.65;
    group.add(shell);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 0.18, 0.52),
      shadow,
    );

    roof.position.set(0, 3.36, 0);
    group.add(roof);

    const entrance = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 2.15, 0.06),
      door,
    );

    entrance.position.set(0.35, 1.08, 0.2);
    group.add(entrance);

    for (const x of [-1.55, 1.72]) {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.75, 0.1),
        shadow,
      );

      frame.position.set(x, 2.18, 0.2);
      group.add(frame);

      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 0.59, 0.035),
        window,
      );

      pane.position.set(x, 2.18, 0.27);
      group.add(pane);
    }

    return group;
  }

  addLifeSlot(
    sceneName,
    key,
    position,
    { rotation = 0, scale = 1, fallback = 'person' } = {},
  ) {
    const sceneGroup = this.lifeSceneGroups.get(sceneName);

    if (!sceneGroup) return null;

    let actor;

    if (fallback === 'vehicle') {
      actor = this.makeKeke();
    } else if (fallback === 'building') {
      actor = this.makeLocalCompoundFacade();
    } else {
      actor = this.makeSecurityPlaceholder();
    }

    actor.position.set(position[0], position[1] || 0, position[2]);
    actor.rotation.y = rotation;
    actor.scale.multiplyScalar(scale);

    sceneGroup.add(actor);

    const slot = {
      sceneName,
      key,
      position: [...position],
      rotation,
      scale,
      fallbackType: fallback,
      actor,
      replaced: false,
    };

    this.lifeAssetSlots.push(slot);

    return slot;
  }

  buildLifeDioramas(sceneName) {
    const validScenes = [
      'bedroom', 'household', 'street', 'breakfast', 'walk', 'school',
    ];
    if (!validScenes.includes(sceneName)) return null;

    const existing = this.lifeSceneGroups.get(sceneName);
    if (existing) return existing;

    if (!this.lifeDioramaRoot) {
      const root = new THREE.Group();
      root.visible = false;
      this.scene.add(root);
      this.lifeDioramaRoot = root;
    }

    const floorFor = (group, color, size = [22, 22]) => {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(size[0], size[1]),
        this.material(color),
      );

      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.08;

      group.add(floor);
    };

    const localWall = (group, x, z, color = 0xc6aa7e) => {
      const facade = this.makeLocalCompoundFacade(color);

      facade.position.set(x, 0, z);
      group.add(facade);

      return facade;
    };

    const box = (
      group,
      dimensions,
      position,
      color,
      materialOptions = {},
    ) => {
      // Life-scene prop boxes are procedural scenery too. Use the tier-aware
      // material factory instead of forcing expensive, double-sided Standard
      // shaders for every box on phones. Desktop keeps the former Standard path.
      const material = this.material(color, materialOptions.roughness ?? 0.9);
      for (const [key, value] of Object.entries(materialOptions)) {
        if (key === 'color') material.color.set(value);
        else material[key] = value;
      }

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...dimensions),
        material,
      );

      mesh.position.set(...position);
      group.add(mesh);

      return mesh;
    };

    const group = new THREE.Group();
    group.visible = false;
    this.lifeDioramaRoot.add(group);
    this.lifeSceneGroups.set(sceneName, group);

    floorFor(
      group,
      ['bedroom', 'household'].includes(sceneName)
        ? 0x9d7e5e
        : 0xb7a17b,
      [24, 24],
    );

    if (sceneName === 'bedroom') {
      const g = group;

      box(g, [18, 4.8, 0.28], [0, 2.35, -7.4], 0xd1b68a);
      box(g, [0.28, 4.8, 13.8], [-8.9, 2.35, -0.3], 0xc8aa7f);
      box(g, [3.5, 1.8, 0.5], [-3.0, 0.9, -1.7], 0x6c4d37);
      box(g, [3.4, 0.25, 3.2], [-3.0, 1.45, -1.7], 0xeee0bf);
      box(g, [1.15, 0.3, 0.85], [-3.85, 1.64, -2.4], 0xf2d59d);
      box(g, [2.2, 3.25, 0.7], [5.2, 1.63, -5.2], 0x80583b);
      box(g, [2.3, 0.15, 0.75], [5.2, 3.3, -5.2], 0x473629);
      box(g, [2.3, 1.15, 0.12], [0.1, 2.65, -7.2], 0x594b3d);
      box(g, [1.85, 0.85, 0.08], [0.1, 2.65, -7.1], 0x6c969a);
      box(g, [0.05, 0.85, 0.04], [0.1, 2.65, -7.0], 0xe9d6a7);
      box(g, [1.85, 0.05, 0.04], [0.1, 2.65, -7.0], 0xe9d6a7);

      this.addLifeSlot(
        'bedroom',
        'passengerMan',
        [1.7, 0, 1.6],
        { rotation: -0.18, scale: 0.95 },
      );
    }

    if (sceneName === 'household') {
      const g = group;

      localWall(g, -4.7, -6.0, 0xb99c71);
      localWall(g, 3.5, -6.3, 0xd2b98b);

      box(g, [15, 0.26, 0.22], [0, 2.95, -5.7], 0x73553b);
      box(g, [1.0, 0.8, 0.9], [-4.7, 0.42, 1.0], 0x875b39);

      const pot = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 14, 12),
        this.material(0x8e5439),
      );

      pot.position.set(-4.3, 0.48, 1.0);
      pot.scale.y = 1.15;
      g.add(pot);

      const basin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.43, 0.25, 16),
        this.material(0x8f9b9d),
      );

      basin.position.set(4.2, 0.12, 1.2);
      g.add(basin);

      const broom = box(
        g,
        [0.05, 1.4, 0.05],
        [4.8, 0.7, 1.7],
        0x93683d,
      );

      broom.rotation.z = -0.28;

      this.addLifeSlot(
        'household',
        'passengerWoman',
        [2.4, 0, 0.2],
        { rotation: -0.2 },
      );

      this.addLifeSlot(
        'household',
        'passengerMan',
        [-1.3, 0, 2.1],
        { rotation: 0.4, scale: 0.8 },
      );
    }

    if (sceneName === 'street') {
      const g = group;

      box(g, [24, 0.12, 7.5], [0, 0, -1.6], 0x555957);
      box(g, [24, 0.08, 8.5], [0, -0.04, 6.5], 0xb3a07e);

      localWall(g, -7.1, -5.2, 0xc4a376);
      localWall(g, 7.0, -6.4, 0xd3b88b);

      box(g, [4.2, 1.4, 1.9], [-7.0, 0.72, -1.5], 0x975e38);
      box(g, [4.4, 0.15, 2.1], [-7.0, 1.5, -1.5], 0x426149);
      box(g, [0.08, 4.1, 0.08], [6.4, 2.0, 1.3], 0x454e4d);

      this.addLifeSlot(
        'street',
        'building',
        [-7.2, 0, -5.6],
        { scale: 1.05, fallback: 'building' },
      );

      this.addLifeSlot(
        'street',
        'keke',
        [1.0, 0, -2.4],
        { rotation: 0.08, scale: 0.96, fallback: 'vehicle' },
      );

      this.addLifeSlot(
        'street',
        'motorcycle',
        [4.3, 0, -0.4],
        { rotation: -0.1, scale: 0.85, fallback: 'vehicle' },
      );

      this.addLifeSlot(
        'street',
        'pedestrianWoman',
        [-2.9, 0, 0.8],
        { rotation: 0.2, scale: 0.86 },
      );

      this.addLifeSlot(
        'street',
        'pedestrian',
        [2.9, 0, 1.6],
        { rotation: -0.3, scale: 0.86 },
      );
    }

    if (sceneName === 'breakfast') {
      const g = group;

      localWall(g, -6.8, -6.2, 0xc6a57a);

      box(g, [8.2, 2.6, 0.32], [0.2, 1.3, -4.5], 0x8b5734);
      box(g, [8.4, 0.18, 2.1], [0.2, 2.65, -4.5], 0x4a6548);
      box(g, [7.3, 0.22, 1.4], [0.0, 0.98, -2.8], 0x77503a);
      box(g, [0.95, 0.54, 0.95], [-1.7, 0.28, -2.7], 0x6d7470);

      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.31, 0.24, 18),
        this.material(0xbfc3ba),
      );

      bowl.position.set(-0.3, 1.13, -2.6);
      g.add(bowl);

      const pap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.17, 0.34, 16),
        this.material(0x8aa5ad),
      );

      pap.position.set(1.2, 1.17, -2.6);
      g.add(pap);

      for (let i = 0; i < 5; i += 1) {
        const akara = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 10, 8),
          this.material(0xb9782d),
        );

        akara.position.set(
          -0.48 + (i % 3) * 0.24,
          1.31,
          -2.56 + Math.floor(i / 3) * 0.24,
        );

        akara.scale.set(1.1, 0.55, 1);
        g.add(akara);
      }

      this.addLifeSlot(
        'breakfast',
        'passengerWoman',
        [-2.2, 0, -1.65],
        { rotation: -0.18, scale: 0.92 },
      );

      this.addLifeSlot(
        'breakfast',
        'passengerMan',
        [2.4, 0, 0.3],
        { rotation: 0.18, scale: 0.94 },
      );

      this.addLifeSlot(
        'breakfast',
        'building',
        [6.8, 0, -5.8],
        { scale: 0.78, fallback: 'building' },
      );
    }

    if (sceneName === 'walk') {
      const g = group;

      box(g, [10.5, 0.08, 22], [-5.6, 0, -0.3], 0xc5b18d);
      box(g, [8.2, 0.12, 22], [5.2, -0.01, -0.3], 0x535957);

      localWall(g, -7.5, -7.2, 0xbda077);

      box(g, [3.2, 1.1, 0.22], [-7.5, 2.9, -6.9], 0x8b603b);

      this.addLifeSlot(
        'walk',
        'building',
        [6.9, 0, -7.4],
        { scale: 0.78, fallback: 'building' },
      );

      this.addLifeSlot(
        'walk',
        'pedestrianWoman',
        [-2.9, 0, -0.3],
        { rotation: 0.25, scale: 0.86 },
      );

      this.addLifeSlot(
        'walk',
        'pedestrian',
        [0.4, 0, 1.8],
        { rotation: -0.2, scale: 0.86 },
      );

      this.addLifeSlot(
        'walk',
        'keke',
        [4.7, 0, -3.8],
        { rotation: 0.12, scale: 0.78, fallback: 'vehicle' },
      );
    }

    if (sceneName === 'school') {
      const g = group;

      box(g, [19, 3.6, 0.34], [0, 1.8, -7.6], 0xc7b18a);
      box(g, [4.3, 2.5, 0.18], [-0.3, 1.3, -7.34], 0x765536);
      box(g, [4.9, 0.22, 0.25], [-0.3, 2.62, -7.27], 0x24453a);
      box(g, [22, 0.12, 8.2], [0, 0, 0.4], 0x595d59);
      box(g, [22, 0.08, 4.8], [0, 0, 7.0], 0xc0a984);

      this.addLifeSlot(
        'school',
        'pedestrianWoman',
        [-3.8, 0, 0.6],
        { scale: 0.86 },
      );

      this.addLifeSlot(
        'school',
        'pedestrian',
        [-0.8, 0, 1.4],
        { scale: 0.8 },
      );

      this.addLifeSlot(
        'school',
        'passengerMan',
        [3.0, 0, 0.2],
        { rotation: -0.2, scale: 0.9 },
      );

      this.addLifeSlot(
        'school',
        'motorcycle',
        [5.0, 0, -2.7],
        { scale: 0.78, fallback: 'vehicle' },
      );
    }

    return group;
  }

  upgradeLifeSceneAssets() {
    if (!this.models || !this.lifeAssetSlots.length) return;

    // Only the currently displayed diorama can affect the screen. Once scene
    // assets have been visited, skip scanning all previously built scenes on
    // every frame. Phones also throttle model-promotion checks to 3.3 Hz.
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (this.mobile && now < this._nextLifeSceneAssetUpgradeAt) return;
    if (this.mobile) this._nextLifeSceneAssetUpgradeAt = now + 300;

    for (const slot of this.lifeAssetSlots) {
      if (slot.sceneName !== this.lifeScene) continue;
      if (slot.replaced || !this.models.cache.has(slot.key)) continue;

      const model = this.models.getInstance(slot.key);
      if (!model) continue;

      model.position.set(
        slot.position[0],
        slot.position[1] || 0,
        slot.position[2],
      );

      model.rotation.y = slot.rotation;
      model.scale.multiplyScalar(slot.scale);
      model.userData.lifeSceneModel = true;

      const parent = this.lifeSceneGroups.get(slot.sceneName);

      parent?.remove(slot.actor);
      disposeSceneTree(slot.actor);
      parent?.add(model);

      slot.actor = model;
      slot.replaced = true;

      console.info(
        `[Kano Life] scene model ${slot.key} installed in ${slot.sceneName}`,
      );
    }
  }

  upgradeGarageVehicles() {
    if (!this.models?.cache.has('keke')) return;

    for (const slot of this.garageVehicleSlots) {
      if (slot.replaced) continue;

      const model = this.models.getInstance('keke');
      if (!model) continue;

      model.position.set(slot.x, 0, slot.z);
      model.rotation.y = slot.rot;
      model.scale.setScalar(slot.scale);

      this.garageGroup.remove(slot.actor);
      disposeSceneTree(slot.actor);
      this.garageGroup.add(model);

      slot.actor = model;
      slot.replaced = true;
    }
  }

  upgradeGarageAssets() {
    if (
      !this.models ||
      !this.garageGroup ||
      this.securityUsingModel ||
      !this.models.cache.has('security')
    ) {
      return;
    }

    const model = this.models.getInstance('security');
    if (!model) return;

    model.position.copy(this.securityActor.position);
    model.rotation.y = -0.55;

    this.garageGroup.remove(this.securityActor);
    disposeSceneTree(this.securityActor);
    this.garageGroup.add(model);

    this.securityActor = model;
    this.securityUsingModel = true;
  }

  addBillboard(x, y, z, green) {
    const sign = new THREE.Group();

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(3.3, 1.05, 0.12),
      this.material(green ? 0x168b71 : 0xf5c542),
    );

    sign.add(board);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 640;
    signCanvas.height = 210;

    const signContext = signCanvas.getContext('2d');

    if (signContext) {
      signContext.fillStyle = green ? '#126c56' : '#172638';
      signContext.fillRect(0, 0, signCanvas.width, signCanvas.height);

      signContext.fillStyle = green ? '#f7d85a' : '#f6d45d';
      signContext.font = '900 42px Arial, sans-serif';
      signContext.textAlign = 'center';

      signContext.fillText(
        green ? 'RUFFNECK LEARN' : 'RUFFNECK ENTERTAINMENT',
        320,
        78,
        600,
      );

      signContext.fillStyle = '#ffffff';
      signContext.font = '700 25px Arial, sans-serif';

      signContext.fillText(
        green
          ? 'ruffneck-lms.vercel.app'
          : 'ruffneck-entertainment.vercel.app',
        320,
        135,
        600,
      );

      signContext.fillStyle = '#b9d7e4';
      signContext.font = '600 18px Arial, sans-serif';

      signContext.fillText(
        green
          ? 'PRACTICAL AI & DIGITAL SKILLS'
          : 'KANO LIFE · MADE IN NIGERIA',
        320,
        176,
        600,
      );
    }

    const texture = new THREE.CanvasTexture(signCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(3.12, 0.91),
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
      }),
    );

    face.position.z = 0.066;
    sign.add(face);

    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 1.15, 0.09),
      this.material(0x495260),
    );

    post.position.y = -1.05;
    sign.add(post);

    sign.position.set(x, y, z);
    sign.rotation.y = x > 0 ? -0.18 : 0.18;

    this.world.add(sign);
  }

  /**
   * Merge the static parts of a procedural phone pedestrian into one mesh.
   * Arms stay as separate pivoted meshes so the existing walking animation
   * still works. This is intentionally mobile-only; desktop detail is intact.
   *
   * The source parts are procedural, opaque, untextured meshes that already
   * use this renderer's mobile Lambert material path. Vertex colours preserve
   * each part's original material colour after the parts share one draw call.
   */
  mergeMobilePedestrianStaticParts(group) {
    if (!this.mobile || !group?.children?.length) return;

    const staticParts = group.children.filter((child) =>
      child.isMesh && child.geometry?.getAttribute?.('position') && child.material,
    );
    if (staticParts.length < 2) return;

    const positions = [];
    const normals = [];
    const colors = [];
    const oldMaterials = new Set();
    const retainedMaterials = new Set();
    const staticPartSet = new Set(staticParts);

    // Arm pivots survive as children of the actor. Keep their shared clothing
    // materials alive while disposing materials used only by merged parts.
    for (const child of group.children) {
      if (staticPartSet.has(child)) continue;
      child.traverse?.((object) => {
        const list = Array.isArray(object.material)
          ? object.material
          : object.material
            ? [object.material]
            : [];
        for (const material of list) {
          if (material) retainedMaterials.add(material);
        }
      });
    }

    for (const part of staticParts) {
      part.updateMatrix();
      const sourceGeometry = part.geometry.index
        ? part.geometry.toNonIndexed()
        : part.geometry.clone();
      sourceGeometry.applyMatrix4(part.matrix);

      let position = sourceGeometry.getAttribute('position');
      let normal = sourceGeometry.getAttribute('normal');
      if (!normal) {
        sourceGeometry.computeVertexNormals();
        normal = sourceGeometry.getAttribute('normal');
      }

      const partMaterial = Array.isArray(part.material)
        ? part.material[0]
        : part.material;
      const color = partMaterial?.color || new THREE.Color(0xffffff);

      for (let index = 0; index < position.count; index += 1) {
        positions.push(position.getX(index), position.getY(index), position.getZ(index));
        normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
        colors.push(color.r, color.g, color.b);
      }

      const materialList = Array.isArray(part.material)
        ? part.material
        : [part.material];
      for (const material of materialList) {
        if (material) oldMaterials.add(material);
      }

      // The original geometries are owned by these freshly constructed
      // procedural pedestrians, not by the shared GLB cache.
      part.geometry.dispose();
      group.remove(part);
      sourceGeometry.dispose();
    }

    if (!positions.length) return;

    const mergedGeometry = new THREE.BufferGeometry();
    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    mergedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    mergedGeometry.computeBoundingBox();
    mergedGeometry.computeBoundingSphere();

    const mergedMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
      side: THREE.FrontSide,
    });
    const mergedMesh = new THREE.Mesh(mergedGeometry, mergedMaterial);
    mergedMesh.name = 'KANO_MOBILE_PEDESTRIAN_STATIC_PARTS';
    mergedMesh.frustumCulled = true;
    group.add(mergedMesh);

    for (const material of oldMaterials) {
      if (!retainedMaterials.has(material)) material.dispose?.();
    }
  }

  buildSidewalkLife() {
    const count = this.mobile
      ? (this.mobileTier === 'low' ? 10 : 12)
      : 22;
    const pedestrianSpacing = this.mobile
      ? (this.mobileTier === 'low' ? 19 : 16)
      : 12;

    // On phones, each pair is one row: one walker on each sidewalk at the
    // same depth. The previous index * spacing pattern alternated sides after
    // every step, accidentally doubling the gap between people on the same
    // sidewalk. Keep desktop placement unchanged to preserve its longer vista.
    const rowsPerSide = Math.ceil(count / 2);
    this.pedestrianLoopDistance = this.mobile
      ? rowsPerSide * pedestrianSpacing
      : count * pedestrianSpacing;

    const clothes = [
      0xf1e7ce,
      0x2b8067,
      0x99472e,
      0x343d56,
      0xdec15c,
      0xb88fa8,
      0x42749a,
    ];

    const skinTones = [
      0x8d5537,
      0x6d402d,
      0xa66a45,
      0x5a3528,
    ];

    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const variant = index % 5;
      const group = new THREE.Group();

      const skin = this.material(skinTones[index % skinTones.length]);
      const cloth = this.material(clothes[index % clothes.length]);
      const accent = this.material(clothes[(index + 3) % clothes.length]);

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(
          variant === 1 ? 0.22 : 0.15,
          variant === 1 ? 0.30 : 0.23,
          0.82,
          8,
        ),
        cloth,
      );

      body.position.y = 0.80;
      group.add(body);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 10, 8),
        skin,
      );

      head.position.y = 1.39;
      group.add(head);

      if (variant === 1 || variant === 4) {
        const hijab = new THREE.Mesh(
          new THREE.SphereGeometry(0.215, 10, 8),
          accent,
        );

        hijab.scale.set(1, 1.22, 0.92);
        hijab.position.set(0, 1.42, 0.015);
        group.add(hijab);

        const scarf = new THREE.Mesh(
          new THREE.ConeGeometry(0.24, 0.44, 8),
          accent,
        );

        scarf.position.set(0, 1.18, 0.02);
        scarf.rotation.x = Math.PI;
        group.add(scarf);
      } else if (variant === 0) {
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.19, 0.08, 10),
          accent,
        );

        cap.position.y = 1.55;
        group.add(cap);
      }

      const arms = [];

      for (const armX of [-0.22, 0.22]) {
        const armPivot = new THREE.Group();

        armPivot.position.set(armX, 1.13, 0);
        group.add(armPivot);

        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.06, 0.56, 6),
          cloth,
        );

        arm.position.y = -0.28;
        armPivot.add(arm);
        arms.push(armPivot);
      }

      if (variant === 2 || variant === 3) {
        for (const legX of [-0.095, 0.095]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.07, 0.40, 6),
            accent,
          );

          leg.position.set(legX, 0.22, 0);
          group.add(leg);
        }
      }

      if (variant === 4) {
        const basket = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.22, 0.25),
          this.material(0x8b5934),
        );

        basket.position.set(side * 0.25, 0.16, 0.08);
        group.add(basket);
      }

      // Static clothing/body/accessory parts become a single vertex-coloured
      // mesh on phones. The two animated arm pivots remain independent, reducing
      // each procedural pedestrian from roughly 5–8 draw calls to three.
      this.mergeMobilePedestrianStaticParts(group);

      group.scale.setScalar(index % 3 === 0 ? 0.94 : 0.82);

      const rowIndex = this.mobile ? Math.floor(index / 2) : index;
      const z = -5 - rowIndex * pedestrianSpacing;

      group.position.set(
        side * (7.0 + (index % 3) * 0.45),
        0,
        z,
      );

      group.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.userData.fallbackPedestrian = true;

      this.world.add(group);

      this.pedestrians.push({
        index,
        side,
        actor: group,
        arms,
        phase: index * 0.73,
        usingModel: false,
      });
    }

    if (!this.mobile) {
      for (let index = 0; index < 6; index += 1) {
        for (const side of [-1, 1]) {
          const pole = new THREE.Group();

          const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.055, 0.07, 4.1, 8),
            this.material(0x48505a),
          );

          stem.position.y = 2.05;
          pole.add(stem);

          const arm = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.07, 0.07),
            this.material(0x48505a),
          );

          arm.position.set(-side * 0.22, 4.05, 0);
          pole.add(arm);

          const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.38, 0.12, 0.24),
            this.material(0xf3e2a1),
          );

          lamp.position.set(-side * 0.48, 4.00, 0);
          pole.add(lamp);

          pole.position.set(side * 7.6, 0, -24 - index * 34);
          pole.userData.proceduralStreetLight = true;

          this.world.add(pole);
          this.streetLights.push(pole);
        }
      }
    }
  }

  buildRoadsideProps() {
    const types = [
      'marketStall',
      'bench',
      'busStop',
      'trafficLight',
      'stopSign',
    ];

    const count = this.mobile ? 5 : 10;

    const colors = [
      0x168c70,
      0xf0be42,
      0xb54b36,
      0x6e7f90,
      0xd7c8a5,
    ];

    for (let index = 0; index < count; index += 1) {
      const key = types[index % types.length];
      const side = index % 2 === 0 ? -1 : 1;

      const x = side * (
        key === 'marketStall' || key === 'busStop'
          ? 7.05
          : 7.2
      );

      const z =
        -35 -
        Math.floor(index / 2) *
          (this.mobile ? 75 : 44);

      const group = new THREE.Group();
      const postMaterial = this.material(0x554637);
      const accent = this.material(colors[index % colors.length]);

      if (key === 'bench') {
        const seat = new THREE.Mesh(
          new THREE.BoxGeometry(1.18, 0.12, 0.36),
          accent,
        );

        seat.position.y = 0.42;
        group.add(seat);

        const back = new THREE.Mesh(
          new THREE.BoxGeometry(1.18, 0.46, 0.10),
          accent,
        );

        back.position.set(0, 0.68, -0.14);
        group.add(back);

        for (const legX of [-0.48, 0.48]) {
          const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.09, 0.38, 0.10),
            postMaterial,
          );

          leg.position.set(legX, 0.20, 0);
          group.add(leg);
        }
      } else if (key === 'marketStall') {
        for (const postX of [-0.80, 0.80]) {
          for (const postZ of [-0.48, 0.48]) {
            const post = new THREE.Mesh(
              new THREE.BoxGeometry(0.075, 1.75, 0.075),
              postMaterial,
            );

            post.position.set(postX, 0.88, postZ);
            group.add(post);
          }
        }

        const canopyMaterial = this.material(colors[index % colors.length]);

        this.loadOptionalTexture(
          '/assets/models/environment/ground/market-stall.jpg',
          canopyMaterial,
          [1, 1],
        );

        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(1.85, 0.13, 1.2),
          canopyMaterial,
        );

        canopy.position.y = 1.83;
        group.add(canopy);

        const counter = new THREE.Mesh(
          new THREE.BoxGeometry(1.55, 0.16, 0.52),
          this.material(0xb88a59),
        );

        counter.position.set(0, 0.83, 0.28);
        group.add(counter);

        const crates = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.25, 0.30),
          this.material(0x7a512f),
        );

        crates.position.set(-0.45, 0.55, -0.05);
        group.add(crates);
      } else if (key === 'busStop') {
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, 0.14, 1.3),
          accent,
        );

        roof.position.y = 2.42;
        group.add(roof);

        for (const postX of [-0.86, 0.86]) {
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.10, 2.35, 0.10),
            postMaterial,
          );

          post.position.set(postX, 1.18, 0);
          group.add(post);
        }

        const bench = new THREE.Mesh(
          new THREE.BoxGeometry(1.35, 0.10, 0.35),
          this.material(0x9b7048),
        );

        bench.position.set(0, 0.52, -0.20);
        group.add(bench);

        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.64, 0.32, 0.08),
          this.material(0x172a3a),
        );

        sign.position.set(0, 1.98, 0.05);
        group.add(sign);
      } else if (key === 'trafficLight') {
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.08, 3.3, 8),
          postMaterial,
        );

        stem.position.y = 1.65;
        group.add(stem);

        const head = new THREE.Mesh(
          new THREE.BoxGeometry(0.44, 1.12, 0.35),
          this.material(0x242d35),
        );

        head.position.set(0, 2.65, 0.02);
        group.add(head);

        for (const [lightY, color] of [
          [3.00, 0xdf4a3d],
          [2.66, 0xf2bd3c],
          [2.31, 0x39bf75],
        ]) {
          const light = new THREE.Mesh(
            new THREE.SphereGeometry(0.105, 8, 6),
            this.material(color),
          );

          light.position.set(0, lightY, 0.21);
          group.add(light);
        }
      } else {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.06, 1.85, 7),
          postMaterial,
        );

        post.position.y = 0.92;
        group.add(post);

        const sign = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.09, 8),
          this.material(0xc94a3b),
        );

        sign.rotation.x = Math.PI / 2;
        sign.position.set(0, 1.65, 0.02);
        group.add(sign);

        const face = new THREE.Mesh(
          new THREE.CircleGeometry(0.26, 8),
          this.material(0xf4e6cf),
        );

        face.position.set(0, 1.65, 0.075);
        group.add(face);
      }

      group.position.set(x, 0, z);
      group.rotation.y = side < 0 ? 0.10 : -0.10;
      group.userData.proceduralRoadProp = true;

      this.world.add(group);

      this.roadProps.push({
        key,
        actor: group,
        replaced: false,
        targetHeight: {
          bench: 0.72,
          busStop: 3,
          trafficLight: 3.8,
          stopSign: 2.1,
          marketStall: 2.45,
        }[key],
      });
    }
  }

  buildKanoRoadsideSet() {
    const treeCountPerSide = this.mobile ? 5 : 9;
    const treeSpacing = this.mobile ? 46 : 26;

    for (const side of [-1, 1]) {
      for (let index = 0; index < treeCountPerSide; index += 1) {
        this.kanoNeemTrees.push({
          side,
          x: side * (12.7 + (index % 2) * 0.65),
          z: -20 - index * treeSpacing,
          scale: 0.78 + (index % 3) * 0.11,
          phase: index * 0.37 + (side > 0 ? 0.2 : 0),
        });
      }
    }

    const makeInstances = (name, geometry, material, count) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.name = name;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Instance transforms wrap around a loop, so the default static bounds
      // can become stale. These pools are small and are culled by distance fog.
      mesh.frustumCulled = false;
      this.world.add(mesh);
      return mesh;
    };

    const neemTrunk = new THREE.CylinderGeometry(0.17, 0.27, 2.25, 7);
    const neemCanopy = new THREE.SphereGeometry(1, 9, 7);
    const trunkMaterial = this.material(0x705039);
    const leafMainMaterial = this.material(0x3b713c);
    const leafSideMaterial = this.material(0x4f8246);
    const leafTopMaterial = this.material(0x608b4b);
    const treeCount = this.kanoNeemTrees.length;

    this.kanoRoadsideMeshes.neemTrunks = makeInstances(
      'Kano neem tree trunks', neemTrunk, trunkMaterial, treeCount,
    );
    this.kanoRoadsideMeshes.neemMainCanopy = makeInstances(
      'Kano neem canopy core', neemCanopy, leafMainMaterial, treeCount,
    );
    this.kanoRoadsideMeshes.neemSideCanopies = makeInstances(
      'Kano neem canopy sides', neemCanopy, leafSideMaterial, treeCount * 2,
    );
    this.kanoRoadsideMeshes.neemTopCanopy = makeInstances(
      'Kano neem canopy tops', neemCanopy, leafTopMaterial, treeCount,
    );

    const dividerCountPerSide = this.mobile ? 42 : 52;
    const dividerPitch = 2.4;
    this.kanoDividerLoopDistance = dividerCountPerSide * dividerPitch;

    for (const side of [-1, 1]) {
      for (let index = 0; index < dividerCountPerSide; index += 1) {
        this.kanoDividerSegments.push({
          side,
          z: -3 - index * dividerPitch,
          index,
        });
      }
    }

    const dividerCount = this.kanoDividerSegments.length;
    const dividerBodyGeometry = new THREE.BoxGeometry(0.32, 0.54, 2.28);
    const dividerStripeGeometry = new THREE.BoxGeometry(0.035, 0.32, 0.17);
    const dividerConcrete = this.material(0xbfc1bd, 0.96);
    const dividerBlack = this.material(0x242a2c, 0.9);

    this.kanoRoadsideMeshes.dividerBodies = makeInstances(
      'Kano black-white concrete roadside dividers',
      dividerBodyGeometry, dividerConcrete, dividerCount,
    );
    this.kanoRoadsideMeshes.dividerStripes = makeInstances(
      'Kano divider black diagonal stripes',
      dividerStripeGeometry, dividerBlack, dividerCount * 3,
    );

    this.updateKanoRoadsideMatrices();
  }

  updateKanoRoadsideMatrices() {
    const dummy = this.kanoRoadsideDummy;
    const meshes = this.kanoRoadsideMeshes;
    if (!dummy || !meshes.neemTrunks || !meshes.dividerBodies) return;

    const place = (mesh, index, x, y, z, scaleX = 1, scaleY = 1, scaleZ = 1, rotationX = 0, rotationY = 0, rotationZ = 0) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(rotationX, rotationY, rotationZ);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    };

    this.kanoNeemTrees.forEach((tree, index) => {
      const scale = tree.scale;
      place(meshes.neemTrunks, index, tree.x, 1.12 * scale, tree.z, scale, scale, scale);
      place(meshes.neemMainCanopy, index, tree.x, 2.86 * scale, tree.z, 0.95 * scale, 0.86 * scale, 0.86 * scale);
      place(meshes.neemTopCanopy, index, tree.x - tree.side * 0.05, 3.47 * scale, tree.z + 0.03, 0.68 * scale, 0.68 * scale, 0.68 * scale);
      place(meshes.neemSideCanopies, index * 2, tree.x - tree.side * 0.52 * scale, 2.73 * scale, tree.z + 0.02, 0.66 * scale, 0.61 * scale, 0.70 * scale);
      place(meshes.neemSideCanopies, index * 2 + 1, tree.x + tree.side * 0.48 * scale, 2.76 * scale, tree.z - 0.12, 0.68 * scale, 0.62 * scale, 0.72 * scale);
    });

    this.kanoDividerSegments.forEach((segment, index) => {
      const x = segment.side * 6.34;
      place(meshes.dividerBodies, index, x, 0.27, segment.z);
      for (let stripe = 0; stripe < 3; stripe += 1) {
        const stripeIndex = index * 3 + stripe;
        place(
          meshes.dividerStripes,
          stripeIndex,
          segment.side * 6.175,
          0.29,
          segment.z + (stripe - 1) * 0.63,
          1,
          1,
          1,
          0,
          segment.side < 0 ? -0.48 : 0.48,
          0,
        );
      }
    });

    for (const mesh of Object.values(meshes)) {
      if (mesh?.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  updateKanoRoadsideSet(scroll) {
    if (!Number.isFinite(scroll) || scroll === 0) return;

    for (const tree of this.kanoNeemTrees) {
      tree.z += scroll * 0.78;
      if (tree.z > 10) {
        tree.z -= this.kanoRoadsideLoopDistance;
      } else if (tree.z < -this.kanoRoadsideLoopDistance) {
        tree.z += this.kanoRoadsideLoopDistance;
      }
    }

    for (const segment of this.kanoDividerSegments) {
      segment.z += scroll;
      if (segment.z > 7) {
        segment.z -= this.kanoDividerLoopDistance;
      } else if (segment.z < -this.kanoDividerLoopDistance) {
        segment.z += this.kanoDividerLoopDistance;
      }
    }

    this.updateKanoRoadsideMatrices();
  }

  getAchabaGeometry(key, factory) {
    if (!this.achabaGeometries.has(key)) {
      this.achabaGeometries.set(key, factory());
    }
    return this.achabaGeometries.get(key);
  }

  makeAchabaRider(passenger = false, variant = 0) {
    const root = new THREE.Group();
    root.name = passenger ? 'ACHABA_REAR_PASSENGER' : 'ACHABA_FRONT_RIDER';
    root.userData.sharedGeometry = true;

    const z = passenger ? 0.47 : 0.04;
    const clothingColors = [0x1d5a47, 0x84513a, 0x2d4f79, 0x7d6a37, 0x433b51];
    const clothing = this.material(clothingColors[variant % clothingColors.length], 0.92);
    const skin = this.material([0x74462f, 0x875336, 0x603a2b][variant % 3], 0.98);
    const kufi = this.material([0xdbcba5, 0x263c34, 0x9c6a37][variant % 3], 0.96);

    const torso = new THREE.Mesh(
      this.getAchabaGeometry('rider-torso', () => new THREE.CapsuleGeometry(0.145, 0.25, 2, 6)),
      clothing,
    );
    torso.position.set(0, 0.98, z);
    torso.rotation.x = -0.13;
    root.add(torso);

    const head = new THREE.Mesh(
      this.getAchabaGeometry('rider-head', () => new THREE.SphereGeometry(0.115, 8, 6)),
      skin,
    );
    head.position.set(0, 1.27, z - 0.015);
    root.add(head);

    const cap = new THREE.Mesh(
      this.getAchabaGeometry('rider-kufi', () => new THREE.CylinderGeometry(0.105, 0.13, 0.06, 8)),
      kufi,
    );
    cap.position.set(0, 1.375, z - 0.015);
    root.add(cap);

    const armGeometry = this.getAchabaGeometry('rider-arm', () => new THREE.CapsuleGeometry(0.035, 0.18, 2, 5));
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeometry, clothing);
      arm.position.set(side * 0.15, 1.02, z - (passenger ? 0.02 : 0.20));
      arm.rotation.x = passenger ? 0.30 : 0.95;
      arm.rotation.z = side * 0.32;
      root.add(arm);
    }

    const legGeometry = this.getAchabaGeometry('rider-leg', () => new THREE.CapsuleGeometry(0.045, 0.17, 2, 5));
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeometry, clothing);
      leg.position.set(side * 0.14, 0.56, z + 0.16);
      leg.rotation.x = 0.62;
      leg.rotation.z = side * 0.12;
      root.add(leg);
    }

    return root;
  }

  ensureAchabaRiders(actor) {
    if (!actor || actor.userData?.achabaRidersAttached) return;

    const type = actor.userData?.vehicleType || actor.userData?.modelKey;
    if (type && type !== 'motorcycle') return;

    const alreadyHasBaseRider = Boolean(actor.userData?.kanoSingleRider);
    const baseZNames = [];
    actor.traverse((node) => {
      if (node === actor) return;
      if (/rider|driver|human|pedestrian|character/i.test(String(node.name || ''))) {
        baseZNames.push(node.name);
      }
    });

    const hasNamedRider = baseZNames.length > 0;
    const riders = [];
    if (!alreadyHasBaseRider && !hasNamedRider) {
      riders.push(this.makeAchabaRider(false, 0));
    }
    riders.push(this.makeAchabaRider(true, 2));

    for (const rider of riders) actor.add(rider);
    actor.userData.achabaRidersAttached = true;
    actor.userData.achabaRiderCount = 2;
  }

  buildKanoPolicePickup(group, bodyMat, windowMat, rubber, alloy, frontLamp, tailLamp) {
    // Detailed fallback pickup for when no suitable police-pickup GLB is loaded.
    // It is composed from curved bodywork, a separate cab, an open bed, bumpers,
    // door livery and a red/blue lightbar rather than a single vehicle box.
    const white = this.material(0xe7edf0, 0.7);
    const policeBlue = this.material(0x1269a7, 0.65);
    const dark = this.material(0x1c252b, 0.9);
    const bodyBase = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 3.45), bodyMat);
    bodyBase.position.set(0, 0.55, 0.02);
    group.add(bodyBase);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.63, 0.22, 0.82), white);
    hood.position.set(0, 0.82, -1.15);
    group.add(hood);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.78, 1.45), white);
    cab.position.set(0, 1.01, -0.38);
    group.add(cab);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.35, 0.035), windowMat);
    windshield.position.set(0, 1.17, -1.115);
    group.add(windshield);

    for (const side of [-1, 1]) {
      const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.52), windowMat);
      sideWindow.position.set(side * 0.785, 1.18, -0.37);
      group.add(sideWindow);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 1.32), policeBlue);
      stripe.position.set(side * 0.86, 0.70, 0.03);
      group.add(stripe);

      const bedSide = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.36, 1.06), bodyMat);
      bedSide.position.set(side * 0.77, 0.86, 1.02);
      group.add(bedSide);

      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.13), dark);
      mirror.position.set(side * 0.84, 1.07, -0.90);
      group.add(mirror);
    }

    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.43, 0.12, 1.08), dark);
    bedFloor.position.set(0, 0.73, 1.00);
    group.add(bedFloor);

    const lightbar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.18), dark);
    lightbar.position.set(0, 1.43, -0.37);
    group.add(lightbar);
    for (const [x, color] of [[-0.22, 0x227bff], [0.22, 0xff3939]]) {
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.16), this.material(color, 0.4));
      beacon.position.set(x, 1.50, -0.37);
      group.add(beacon);
    }

    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.12, 0.16), alloy);
    frontBumper.position.set(0, 0.34, -1.78);
    group.add(frontBumper);
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.11, 0.14), alloy);
    rearBumper.position.set(0, 0.34, 1.78);
    group.add(rearBumper);

    for (const z of [-1.16, 1.16]) {
      for (const x of [-0.84, 0.84]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.18, 12), rubber);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(x, 0.28, z);
        group.add(tire);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.19, 10), alloy);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(x, 0.28, z);
        group.add(hub);
      }
    }

    for (const [x, z] of [[-0.48, -1.58], [0.48, -1.58]]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.06), frontLamp);
      lamp.position.set(x, 0.72, z);
      group.add(lamp);
    }
    for (const x of [-0.62, 0.62]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.05), tailLamp);
      lamp.position.set(x, 0.67, 1.77);
      group.add(lamp);
    }

    group.userData.kanoVehicleFallback = 'policePickup';
  }

  shouldRunMobilePromotionCheck(kind, now = (globalThis.performance?.now?.() ?? Date.now())) {
    if (!this.mobile) return true;

    const deadlineField = kind === 'pedestrians'
      ? '_nextMobilePedestrianUpgradeAt'
      : '_nextMobileWorldAssetUpgradeAt';

    if (now < this[deadlineField]) return false;
    this[deadlineField] = now + 300;
    return true;
  }

  upgradeWorldAssets() {
    if (!this.models || !this.shouldRunMobilePromotionCheck('world')) return;

    const activeBuildingSlots = this.mobile
      ? this.buildingSlots.slice(0, 2)
      : this.buildingSlots;

    for (const slot of activeBuildingSlots) {
      if (slot.replaced) continue;

      const key = slot.industrial
        ? 'industrialBuilding'
        : 'building';

      if (!this.models.cache.has(key)) continue;

      const model = this.models.getInstance(key);
      if (!model) continue;

      const normalizedHeight =
        model.userData.targetHeight ||
        (slot.industrial ? 5.2 : 4.5);

      model.scale.multiplyScalar(
        slot.height / normalizedHeight,
      );

      model.position.set(slot.x, 0, slot.z);
      model.rotation.y = slot.side < 0 ? Math.PI / 2 : -Math.PI / 2;

      this.world.remove(slot.actor);
      disposeSceneTree(slot.actor);
      this.world.add(model);

      slot.actor = model;
      slot.replaced = true;
    }

    if (!this.mobile && this.models.cache.has('flyover')) {
      for (let index = 0; index < this.flyovers.length; index += 1) {
        const fallback = this.flyovers[index];

        if (!fallback?.userData?.proceduralFlyover) continue;

        const model = this.models.getInstance('flyover');
        if (!model) continue;

        model.updateMatrixWorld(true);

        let bounds = new THREE.Box3().setFromObject(model);
        let size = bounds.getSize(new THREE.Vector3());

        if (size.x < size.z) {
          model.rotation.y = Math.PI / 2;
        }

        model.updateMatrixWorld(true);

        bounds = new THREE.Box3().setFromObject(model);
        size = bounds.getSize(new THREE.Vector3());

        const span = Math.max(size.x, size.z);

        if (span > 0) {
          const horizontalScale = THREE.MathUtils.clamp(
            22 / span,
            0.55,
            4.0,
          );

          model.scale.x *= horizontalScale;
          model.scale.z *= horizontalScale;
        }

        const originalZ = fallback.position.z;

        model.position.copy(fallback.position);
        model.userData.flyoverModel = true;

        this.world.remove(fallback);
        disposeSceneTree(fallback);
        this.world.add(model);

        model.position.z = originalZ;

        this.flyovers[index] = model;

        if (index === 0) {
          this.flyoverFallback = model;
        }

        this.flyoverModelAdded = true;

        console.info(
          `[Kano Life] Flyover GLB active${
            model.userData.modelPath
              ? `: ${model.userData.modelPath}`
              : ''
          }`,
        );
      }
    }

    if (this.models.cache.has('roadlight')) {
      for (let index = 0; index < this.streetLights.length; index += 1) {
        const old = this.streetLights[index];

        if (!old.userData.proceduralStreetLight) continue;

        const model = this.models.getInstance('roadlight');
        if (!model) continue;

        model.position.copy(old.position);

        model.scale.multiplyScalar(
          4.1 / (model.userData.targetHeight || 4.2),
        );

        this.world.remove(old);
        disposeSceneTree(old);
        this.world.add(model);

        this.streetLights[index] = model;
      }
    }

    for (const slot of this.roadProps) {
      if (this.mobile && !['marketStall', 'busStop'].includes(slot.key)) continue;
      if (slot.replaced || !this.models.cache.has(slot.key)) continue;

      const model = this.models.getInstance(slot.key);
      if (!model) continue;

      const normalizedHeight =
        model.userData.targetHeight || slot.targetHeight;

      model.scale.multiplyScalar(
        slot.targetHeight / normalizedHeight,
      );

      model.position.copy(slot.actor.position);
      model.rotation.copy(slot.actor.rotation);
      model.userData.roadPropKey = slot.key;

      this.world.remove(slot.actor);
      disposeSceneTree(slot.actor);
      this.world.add(model);

      slot.actor = model;
      slot.replaced = true;
    }
  }

  upgradePedestrians() {
    if (
      !this.models ||
      !this.pedestrians.length ||
      !this.shouldRunMobilePromotionCheck('pedestrians')
    ) return;

    const characterKeys = [
      'pedestrianWoman',
      'pedestrian',
      'passengerWoman',
      'passengerMan',
      'passenger',
    ];

    // Full GLB walkers are limited because KanoInteractionReliability also
    // upgrades crowd actors. Most roadside walkers remain animated procedural
    // characters, avoiding a large pile of duplicated skinned meshes on phones.
    let mobileModelledCount = this.mobile
      ? this.pedestrians.reduce((count, pedestrian) => count + (pedestrian.usingModel ? 1 : 0), 0)
      : 0;
    const mobilePedestrianBudget = this.mobile
      ? (this.mobileTier === 'high' ? 3 : this.mobileTier === 'mid' ? 2 : 1)
      : Infinity;

    for (const pedestrian of this.pedestrians) {
      if (pedestrian.usingModel) continue;
      if (this.mobile && mobileModelledCount >= mobilePedestrianBudget) continue;

      const modelKey =
        characterKeys[pedestrian.index % characterKeys.length];

      if (!this.models.cache.has(modelKey)) continue;

      const model = this.models.getInstance(modelKey);
      if (!model) continue;

      model.position.copy(pedestrian.actor.position);
      model.rotation.y =
        pedestrian.side < 0 ? Math.PI / 2 : -Math.PI / 2;

      model.userData.fallback = false;
      model.userData.characterType = modelKey;

      this.world.remove(pedestrian.actor);
      disposeSceneTree(pedestrian.actor);
      this.world.add(model);

      pedestrian.actor = model;
      pedestrian.usingModel = true;
      if (this.mobile) mobileModelledCount += 1;
    }
  }

  makeKeke() {
    const group = new THREE.Group();

    const yellow = this.material(0xf5c542, 0.72);
    const darkGreen = this.material(0x18382e, 0.88);
    const frame = this.material(0x343e44, 0.62);
    const rubber = this.material(0x111820, 0.95);
    const metal = this.material(0x9da7a8, 0.55);

    const glass = new THREE.MeshStandardMaterial({
      color: 0x91d8e9,
      transparent: true,
      opacity: 0.48,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });

    const seatMaterial = this.material(0x6f3425, 0.92);

    const lowerShell = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 18, 12),
      yellow,
    );

    lowerShell.scale.set(1.0, 0.55, 1.38);
    lowerShell.position.set(0, 0.73, 0.03);
    lowerShell.userData.paintable = true;
    group.add(lowerShell);

    const frontNose = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 10),
      yellow,
    );

    frontNose.scale.set(0.84, 0.53, 0.72);
    frontNose.position.set(0, 0.86, -0.62);
    frontNose.userData.paintable = true;
    group.add(frontNose);

    const rearBench = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 0.12, 0.38),
      seatMaterial,
    );

    rearBench.position.set(0, 0.97, 0.42);
    group.add(rearBench);

    const backRest = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.42, 0.09),
      seatMaterial,
    );

    backRest.position.set(0, 1.17, 0.62);
    group.add(backRest);

    const addBar = (from, to, radius, material) => {
      const start = new THREE.Vector3(...from);
      const end = new THREE.Vector3(...to);
      const direction = end.clone().sub(start);

      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(
          radius,
          radius,
          direction.length(),
          7,
        ),
        material,
      );

      bar.position.copy(start).add(end).multiplyScalar(0.5);

      bar.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );

      group.add(bar);

      return bar;
    };

    const wheelSpots = [
      [0, -0.91],
      [-0.63, 0.62],
      [0.63, 0.62],
    ];

    const wheels = [];

    for (const [x, z] of wheelSpots) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.235, 0.235, 0.17, 16),
        rubber,
      );

      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.26, z);
      group.add(wheel);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.095, 0.18, 12),
        metal,
      );

      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      group.add(hub);

      wheels.push(wheel);
    }

    const fork = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.66, 8),
      metal,
    );

    fork.position.set(0, 0.59, -0.76);
    fork.rotation.x = -0.18;
    group.add(fork);

    // Procedural seated driver.
    const driverPivot = new THREE.Group();

    driverPivot.name = 'KANO_KEKE_DRIVER_PIVOT';
    driverPivot.position.set(0, 1.18, -0.03);
    group.add(driverPivot);

    const driverBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.46, 9),
      this.material(0x2f674e),
    );

    driverBody.position.y = 0;
    driverPivot.add(driverBody);

    const skin = this.material(0x70472f);

    const driverHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      skin,
    );

    driverHead.name = 'KANO_KEKE_DRIVER_HEAD';
    driverHead.position.set(0, 0.34, -0.09);
    driverPivot.add(driverHead);

    const driverCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.055, 10),
      darkGreen,
    );

    driverCap.position.set(0, 0.46, -0.09);
    driverPivot.add(driverCap);

    const armMaterial = this.material(0x2f674e);
    const arms = [];

    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();

      shoulder.position.set(side * 0.16, 0.11, -0.02);
      driverPivot.add(shoulder);

      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 0.27, 8),
        armMaterial,
      );

      upperArm.position.set(side * 0.055, -0.11, -0.09);
      upperArm.rotation.x = -0.35;
      upperArm.rotation.z = side * -0.25;
      shoulder.add(upperArm);

      const forearm = new THREE.Group();

      forearm.position.set(side * 0.08, -0.21, -0.15);
      shoulder.add(forearm);

      const forearmMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.24, 8),
        armMaterial,
      );

      forearmMesh.position.y = -0.1;
      forearmMesh.rotation.z = side * 0.25;
      forearm.add(forearmMesh);

      arms.push({ shoulder, forearm });
    }

    for (const x of [-0.54, 0.54]) {
      addBar([x, 0.95, -0.64], [x * 1.03, 1.63, -0.47], 0.035, frame);
      addBar([x, 0.98, 0.57], [x, 1.62, 0.48], 0.035, frame);
      addBar([x, 1.62, -0.47], [x, 1.62, 0.48], 0.035, frame);
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.26, 0.09, 1.22),
      darkGreen,
    );

    roof.position.set(0, 1.67, 0.0);
    group.add(roof);

    const windshield = new THREE.Mesh(
      new THREE.PlaneGeometry(0.88, 0.42),
      glass,
    );

    windshield.position.set(0, 1.34, -0.48);
    group.add(windshield);

    for (const x of [-0.72, 0.72]) {
      const mirrorArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.26, 6),
        metal,
      );

      mirrorArm.position.set(x, 1.28, -0.47);
      mirrorArm.rotation.z = x < 0 ? -0.28 : 0.28;
      group.add(mirrorArm);

      const mirror = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 8, 8),
        metal,
      );

      mirror.position.set(x * 1.08, 1.39, -0.48);
      group.add(mirror);
    }

    for (const x of [-0.43, 0.43]) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 10, 8),
        this.material(0xffedbd, 0.35),
      );

      lamp.position.set(x, 0.91, -1.0);
      group.add(lamp);

      const tail = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        this.material(0xd94735),
      );

      tail.position.set(x, 0.7, 0.94);
      group.add(tail);
    }

    group.userData.fallback = true;
    group.userData.vehicleType = 'keke';

    group.userData.driverAnimationParts = {
      driverPivot,
      arms,
      wheels,
    };

    return group;
  }

  // ==========================================================
  // REPLACE THE PLAYER KEKE
  // ==========================================================

  /**
   * Detect a real, renderable driver already included in a GLB even when it
   * does not use Kano's animation-pivot names. ModelManager intentionally
   * skips adding a procedural driver when it finds a named driver object.
   * Without this check, applyModel() could add a second procedural person.
   *
   * A name alone is not enough: seat/cockpit helpers and collapsed/invisible
   * objects must not suppress the fallback. Candidate bounds are measured in
   * the vehicle-root coordinate space so the result is independent of the
   * vehicle's eventual world placement.
   */
  hasPlausibleNativeDriver(object, vehicleBounds = {}) {
    if (!object?.isObject3D) return false;

    object.updateMatrixWorld(true);
    const rootMatrix = object.matrixWorld.clone();
    const determinant = rootMatrix.determinant();
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) {
      return false;
    }
    const inverseRoot = rootMatrix.invert();

    const vehicleWidth = Number(vehicleBounds.width) || 1.1;
    const vehicleHeight = Number(vehicleBounds.height) || 1.85;
    const vehicleDepth = Number(vehicleBounds.depth) || 1.5;
    const driverName = /(^|[\s_.-])(driver|rider|chauffeur|human|person)([\s_.-]|$)/i;
    const helperName = /seat|saddle|cockpit|handle|wheel|rig|skeleton|bone|locator|marker|dummy|proxy|helper|placeholder/i;
    let result = null;

    object.traverse((namedNode) => {
      if (result || !namedNode?.name || !driverName.test(namedNode.name)) return;
      if (helperName.test(namedNode.name)) return;
      // GLB roots can be hidden while they are cached, so ignore the root's
      // own visibility but reject a hidden driver node or any hidden group
      // between that node and the vehicle root. Otherwise an invisible native
      // driver can suppress the visible procedural seated-driver fallback.
      if (!hasVisiblePathWithinRoot(namedNode, object)) return;

      const candidateBounds = new THREE.Box3();
      namedNode.traverse((node) => {
        if (!node?.isMesh || !node.geometry) return;

        if (!hasVisiblePathWithinRoot(node, namedNode)) return;

        const materials = Array.isArray(node.material)
          ? node.material
          : [node.material];
        const canRender = materials.some((material) =>
          material && material.visible !== false &&
          Number(material.opacity ?? 1) > 0.025
        );
        if (!canRender) return;

        if (!node.geometry.boundingBox) {
          try { node.geometry.computeBoundingBox(); } catch { return; }
        }
        if (!node.geometry.boundingBox || node.geometry.boundingBox.isEmpty()) return;

        const relativeMatrix = new THREE.Matrix4().multiplyMatrices(
          inverseRoot,
          node.matrixWorld,
        );
        const meshBounds = node.geometry.boundingBox.clone().applyMatrix4(relativeMatrix);
        if (meshBounds.isEmpty()) return;
        const meshSize = meshBounds.getSize(new THREE.Vector3());
        if (![meshSize.x, meshSize.y, meshSize.z].every(Number.isFinite)) return;
        candidateBounds.union(meshBounds);
      });

      if (candidateBounds.isEmpty()) return;
      const size = candidateBounds.getSize(new THREE.Vector3());
      const center = candidateBounds.getCenter(new THREE.Vector3());
      const plausible =
        size.x >= 0.12 && size.x <= Math.max(1.35, vehicleWidth * 1.2) &&
        size.y >= 0.58 && size.y <= 2.45 &&
        size.z >= 0.08 && size.z <= Math.max(1.05, vehicleDepth * 0.9) &&
        candidateBounds.min.y >= -0.15 &&
        candidateBounds.max.y <= vehicleHeight + 0.45 &&
        Math.abs(center.x) <= vehicleWidth * 0.62 + 0.12 &&
        Math.abs(center.z) <= vehicleDepth * 0.72 + 0.12;

      if (plausible) {
        result = {
          name: namedNode.name,
          bounds: {
            width: Number(size.x.toFixed(3)),
            height: Number(size.y.toFixed(3)),
            depth: Number(size.z.toFixed(3)),
          },
        };
      }
    });

    if (result) {
      object.userData.kanoNativeDriverVisual = result;
      return result;
    }
    return false;
  }

  /**
   * Preserve the visible seated driver when an otherwise valid imported
   * keke does not contain a driver rig. ModelManager normally adds its own
   * named rig; this path is a last-resort safeguard for directly supplied
   * GLBs or older model-manager builds. The cloned geometry/materials are
   * independent because the outgoing procedural vehicle is disposed below.
   */
  attachFallbackDriverToKeke(object, old, visualCheck) {
    if (!object?.isObject3D || !old?.isObject3D) return false;

    const currentParts = object.userData?.driverAnimationParts;
    if (currentParts?.driverPivot) return false;

    const namedPivot = object.getObjectByName?.('KANO_KEKE_DRIVER_PIVOT');
    if (namedPivot?.isObject3D) {
      const arms = (namedPivot.children || [])
        .filter((child) => child?.isGroup &&
          (child.children || []).some((part) => part?.isGroup))
        .map((shoulder) => ({
          shoulder,
          forearm: shoulder.children.find((part) => part?.isGroup) || null,
        }));
      object.userData.driverAnimationParts = {
        driverPivot: namedPivot,
        arms,
        wheels: [],
      };
      return true;
    }

    const sourcePivot = old.userData?.driverAnimationParts?.driverPivot;
    if (!sourcePivot?.isObject3D) return false;

    const driverPivot = sourcePivot.clone(true);
    const geometryClones = new Map();
    const materialClones = new Map();

    driverPivot.traverse((node) => {
      if (node.geometry) {
        if (!geometryClones.has(node.geometry)) {
          geometryClones.set(node.geometry, node.geometry.clone());
        }
        node.geometry = geometryClones.get(node.geometry);
      }

      if (node.material) {
        const cloneMaterial = (material) => {
          if (!material) return material;
          if (!materialClones.has(material)) {
            materialClones.set(material, material.clone());
          }
          return materialClones.get(material);
        };
        node.material = Array.isArray(node.material)
          ? node.material.map(cloneMaterial)
          : cloneMaterial(node.material);
      }
    });

    const height = Number(visualCheck?.bounds?.height);
    const depth = Number(visualCheck?.bounds?.depth);
    const safeHeight = Number.isFinite(height) ? height : 1.85;
    const safeDepth = Number.isFinite(depth) ? depth : 1.5;

    driverPivot.name = 'KANO_KEKE_DRIVER_PIVOT';
    driverPivot.position.set(
      0,
      THREE.MathUtils.clamp(safeHeight * 0.64, 0.96, 1.22),
      -Math.min(0.12, safeDepth * 0.04),
    );
    driverPivot.userData.fallbackSeatedDriver = true;
    object.add(driverPivot);

    const arms = (driverPivot.children || [])
      .filter((child) => child?.isGroup &&
        (child.children || []).some((part) => part?.isGroup))
      .map((shoulder) => ({
        shoulder,
        forearm: shoulder.children.find((part) => part?.isGroup) || null,
      }));

    object.userData.driverAnimationParts = {
      driverPivot,
      arms,
      // GLB vehicle wheels are not the procedural fallback wheels.
      wheels: [],
    };
    object.userData.kanoFallbackDriverAttached = true;

    return true;
  }

  // Refuse to replace the visible procedural keke with a GLB that only
  // contains a driver/prop, invisible meshes, or collapsed/implausible bounds.
  // The incoming instance is left untouched on failure; its geometry may be
  // shared with ModelManager's cache. The currently active vehicle stays live.
  validateKekeModelCandidate(object) {
    if (!object?.isObject3D) {
      return { ok: false, reason: 'not-an-object3d', meshCount: 0 };
    }

    object.updateMatrixWorld(true);
    const rootMatrix = object.matrixWorld.clone();
    const determinant = rootMatrix.determinant();
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) {
      return { ok: false, reason: 'singular-root-transform', meshCount: 0 };
    }
    const inverseRoot = rootMatrix.invert();
    const bounds = new THREE.Box3();
    let meshCount = 0;
    let vehicleCoreEvidence = 0;
    let namedWheelEvidence = 0;
    let characterEvidence = 0;
    let broadLowBodyEvidence = false;
    const vehicleCoreName = /vehicle|keke|chassis|bodywork|carbody|body[_ .-]?panel|roof|cabin|bumper|windshield|handlebar|headlight|mudguard|fork|axle|fender|engine|motor|fairing|door|bonnet|hood|grille|grill|dashboard|steering|headlamp/i;
    const wheelPartName = /wheel|tire|tyre/i;
    // Do not use generic root names (for example the cache key "keke") as
    // evidence that a child mesh is vehicle geometry. Character labels remain
    // available through the complete path so mislabeled crowd assets are rejected.
    const characterName = /pedestrian|character|human|person|driver|rider|passenger|crowd|woman|man|female|male|npc/i;

    object.traverse((node) => {
      if (!node?.isMesh || !node.geometry) return;

      // The root can initially be hidden in the model cache; applyModel will
      // set its correct scene visibility after validation. Hidden descendants
      // are ignored because they will not contribute to the rendered vehicle.
      let ancestor = node;
      while (ancestor && ancestor !== object) {
        if (ancestor.visible === false) return;
        ancestor = ancestor.parent;
      }
      if (ancestor !== object) return;

      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      const canRender = materials.some((material) =>
        material && material.visible !== false &&
        Number(material.opacity ?? 1) > 0.025
      );
      if (!canRender) return;

      const geometry = node.geometry;
      if (!geometry.boundingBox) {
        try { geometry.computeBoundingBox(); } catch { return; }
      }
      if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;

      const relativeMatrix = new THREE.Matrix4().multiplyMatrices(
        inverseRoot,
        node.matrixWorld,
      );
      const meshBounds = geometry.boundingBox.clone().applyMatrix4(relativeMatrix);
      if (meshBounds.isEmpty()) return;
      const meshSize = meshBounds.getSize(new THREE.Vector3());
      if (![meshSize.x, meshSize.y, meshSize.z].every(Number.isFinite)) return;

      // Root/cache names are not structural proof. ModelManager and fallback
      // code commonly rename the GLB root to "keke"; including that name in
      // every descendant path made any wrongly mapped crowd model look like a
      // vehicle. Inspect descendant part names separately from the full path.
      const descendantNames = [];
      let namedAncestor = node;
      while (namedAncestor && namedAncestor !== object) {
        if (namedAncestor.name) descendantNames.push(String(namedAncestor.name));
        namedAncestor = namedAncestor.parent;
      }
      // When the root itself is a mesh, its name can be a real part label.
      if (node === object && node.isMesh && node.name) {
        descendantNames.push(String(node.name));
      }
      const { structuralNamePath, completeNamePath } = buildKekeEvidenceNamePaths(
        descendantNames,
        object.name || '',
      );
      const meshCentre = meshBounds.getCenter(new THREE.Vector3());
      const evidence = classifyKekeMeshEvidence({
        structuralNamePath,
        completeNamePath,
        width: meshSize.x,
        height: meshSize.y,
        depth: meshSize.z,
        centerY: meshCentre.y,
        vehicleCoreName,
        wheelPartName,
        characterName,
      });
      if (evidence.looksLikeCharacter) characterEvidence += 1;
      if (evidence.vehicleCore) vehicleCoreEvidence += 1;
      if (evidence.namedWheel) namedWheelEvidence += 1;
      if (evidence.broadLowBody) broadLowBodyEvidence = true;

      bounds.union(meshBounds);
      meshCount += 1;
    });

    if (meshCount === 0 || bounds.isEmpty()) {
      return { ok: false, reason: 'no-visible-renderable-meshes', meshCount };
    }

    const size = bounds.getSize(new THREE.Vector3());
    const footprint = size.x * size.z;
    const longSide = Math.max(size.x, size.z);
    const shortSide = Math.min(size.x, size.z);
    const finite = [size.x, size.y, size.z, footprint].every(Number.isFinite);
    const hasVehicleStructure = vehicleCoreEvidence > 0 || broadLowBodyEvidence || namedWheelEvidence >= 2;

    if (!finite) {
      return { ok: false, reason: 'non-finite-bounds', meshCount };
    }
    if (!hasVehicleStructure) {
      return {
        ok: false,
        reason: characterEvidence > 0
          ? 'character-only-model-no-vehicle-structure'
          : 'missing-vehicle-structure-evidence',
        meshCount,
        evidence: {
          vehicleCoreMeshes: vehicleCoreEvidence,
          wheelPartMeshes: namedWheelEvidence,
          characterMeshes: characterEvidence,
          broadLowBodyEvidence,
        },
        bounds: {
          width: Number(size.x.toFixed(3)),
          height: Number(size.y.toFixed(3)),
          depth: Number(size.z.toFixed(3)),
          footprint: Number(footprint.toFixed(3)),
        },
      };
    }

    if (
      size.y < 0.55 || size.y > 4.25 ||
      longSide < 0.82 || longSide > 7.5 ||
      shortSide < 0.30 || footprint < 0.68 || footprint > 30
    ) {
      return {
        ok: false,
        reason: 'implausible-keke-bounds',
        meshCount,
        bounds: {
          width: Number(size.x.toFixed(3)),
          height: Number(size.y.toFixed(3)),
          depth: Number(size.z.toFixed(3)),
          footprint: Number(footprint.toFixed(3)),
        },
      };
    }

    return {
      ok: true,
      reason: 'renderable-vehicle-bounds',
      meshCount,
      bounds: {
        width: Number(size.x.toFixed(3)),
        height: Number(size.y.toFixed(3)),
        depth: Number(size.z.toFixed(3)),
        footprint: Number(footprint.toFixed(3)),
      },
      evidence: {
        vehicleCoreMeshes: vehicleCoreEvidence,
        wheelPartMeshes: namedWheelEvidence,
        characterMeshes: characterEvidence,
        broadLowBodyEvidence,
      },
    };
  }

  async applyModel(key, object) {
    if (
      !object ||
      !this.ready ||
      this.disposed ||
      key !== 'keke'
    ) {
      return false;
    }

    const old = this.player;
    const visualCheck = this.validateKekeModelCandidate(object);
    if (!visualCheck.ok) {
      const modelPath = object.userData?.modelPath || object.userData?.modelKey || 'unknown GLB';
      object.userData.kanoKekeVisualValidation = visualCheck;
      // Crucially, do not detach or dispose the active vehicle here. This
      // keeps the procedural keke (with its seated driver) visible when an
      // imported model is technically loadable but visually unusable.
      if (old?.isObject3D) {
        old.visible = this.lifeScene === 'road' || this.lifeScene === 'garage';
        if (!old.parent) {
          const fallbackParent = this.lifeScene === 'garage' ? this.garageGroup : this.scene;
          fallbackParent?.add(old);
        }
      }
      console.warn(
        `[Kano Life] Rejected visually unusable keke model (${modelPath}); keeping the active vehicle.`,
        visualCheck,
      );
      return false;
    }

    object.userData.kanoKekeVisualValidation = visualCheck;
    const oldParent = old?.parent || this.scene;

    // Preserve the current state until the replacement has been prepared.
    object.position.copy(
      old?.position || new THREE.Vector3(0, 0, 2),
    );

    object.rotation.set(
      0,
      this.driveFacingY,
      old?.rotation?.z || 0,
    );

    object.userData.fallback = false;
    object.userData.vehicleType = 'keke';
    object.visible =
      this.lifeScene === 'road' ||
      this.lifeScene === 'garage';

    // ModelManager normally supplies a seated driver. Support older or
    // directly injected GLBs as well: if the accepted vehicle has no rig,
    // clone the outgoing fallback driver's rig before disposing that vehicle.
    if (!object.userData.driverAnimationParts?.driverPivot) {
      const rig = object.getObjectByName?.(
        'KANO_KEKE_DRIVER_PIVOT',
      );

      if (rig) {
        object.userData.driverAnimationParts = {
          driverPivot: rig,
          arms: [],
          wheels: [],
        };
      }
    }

    if (!object.userData.driverAnimationParts?.driverPivot) {
      const nativeDriver = this.hasPlausibleNativeDriver(
        object,
        visualCheck.bounds,
      );

      if (nativeDriver) {
        // Keep the GLB's own driver. Adding a fallback in this case would
        // create two visible people in the same cabin. A native rig without
        // Kano pivot names is preserved visually even if it cannot use the
        // procedural arm/head animation hooks.
        console.info(
          `[Kano Life] Existing GLB driver preserved (${nativeDriver.name}).`,
          nativeDriver.bounds,
        );
      } else {
        this.attachFallbackDriverToKeke(object, old, visualCheck);
      }
    }

    if (old?.parent) {
      old.parent.remove(old);
    }

    disposeSceneTree(old);

    const targetParent =
      this.lifeScene === 'garage'
        ? this.garageGroup
        : this.scene;

    (targetParent || oldParent || this.scene).add(object);

    this.player = object;

    if (this.lifeScene === 'garage') {
      object.position.set(0.7, 0, 1.45);
      object.rotation.set(0, Math.PI, 0);
    } else {
      object.position.set(0, 0, 2);
      object.rotation.set(0, this.driveFacingY, 0);
    }

    this.lastPaint = null;
    this.applyPlayerPaint(this.currentPaint || '#f5c542');

    console.info(
      `[Kano Life] Player keke visible using ${
        object.userData.modelPath || 'GLB model'
      }`,
    );

    if (object.userData.driverAnimationParts) {
      console.info(
        '[Kano Life] Seated driver animation references connected.',
      );
    } else {
      console.warn(
        '[Kano Life] This keke model has no recognised seated driver rig. Verify the ModelManager.js version and driver names.',
      );
    }

    return true;
  }

  applyPlayerPaint(paint) {
    const color =
      typeof paint === 'string' &&
      /^#[0-9a-f]{6}$/i.test(paint)
        ? paint
        : '#f5c542';

    this.currentPaint = color;

    if (!this.player || this.lastPaint === color) return;

    const paintable = [];

    const namedPaintPart =
      /body|paint|shell|chassis|outer|cover|hood|fender|side.?panel|cowl/i;

    this.player.traverse((object) => {
      if (!object.isMesh || !object.material) return;

      const materialList = Array.isArray(object.material)
        ? object.material
        : [object.material];

      const identity = `${object.name || ''} ${materialList
        .map((material) => material?.name || '')
        .join(' ')}`;

      if (
        object.userData.paintable ||
        namedPaintPart.test(identity)
      ) {
        paintable.push(object);
      }
    });

    if (!paintable.length && !this.player.userData.fallback) {
      let largest = null;
      let largestVolume = 0;

      this.player.traverse((object) => {
        if (!object.isMesh || !object.geometry) return;

        const materialList = Array.isArray(object.material)
          ? object.material
          : [object.material];

        const identity = `${object.name || ''} ${materialList
          .map((material) => material?.name || '')
          .join(' ')}`;

        if (
          /wheel|tire|tyre|glass|window|lamp|light|rubber|driver|passenger/i.test(
            identity,
          )
        ) {
          return;
        }

        if (!object.geometry.boundingBox) {
          object.geometry.computeBoundingBox();
        }

        const box = object.geometry.boundingBox;
        if (!box) return;

        const size = box.getSize(new THREE.Vector3());
        const volume = size.x * size.y * size.z;

        if (Number.isFinite(volume) && volume > largestVolume) {
          largest = object;
          largestVolume = volume;
        }
      });

      if (largest) paintable.push(largest);
    }

    for (const object of paintable) {
      const materialList = Array.isArray(object.material)
        ? object.material
        : [object.material];

      for (const material of materialList) {
        if (material?.color) {
          material.color.set(color);
          material.needsUpdate = true;
        }
      }
    }

    this.lastPaint = color;
  }

  resize() {
    if (!this.ready || !this.renderer || this.disposed) return;

    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    this.renderer.setSize(width, height, false);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Lightweight traffic-only Adaidaita Sahu. The player keeps the full keke;
   * this fallback uses shared low-poly geometry so a busy road does not create
   * dozens of separately tessellated meshes for every background keke.
   */
  makeTrafficKeke() {
    // Background mobile keke traffic is procedural, so combine its small body
    // parts into one vertex-coloured geometry. The previous version produced
    // twelve separate Mesh objects (and therefore up to twelve draw calls) for
    // every fallback keke. Keep the shape and colours, but render it as one Mesh.
    if (!this._mobileTrafficKekeGeometry?.merged) {
      const parts = [
        { geometry: new THREE.BoxGeometry(1.12, 0.48, 1.55), color: 0xf1c52f, position: [0, 0.67, 0.05] },
        { geometry: new THREE.BoxGeometry(0.82, 0.25, 0.38), color: 0xdba91f, position: [0, 0.68, -0.83] },
        { geometry: new THREE.BoxGeometry(1.12, 0.10, 1.18), color: 0x205b40, position: [0, 1.48, 0.08] },
        { geometry: new THREE.BoxGeometry(0.78, 0.42, 0.035), color: 0x8cc9d4, position: [0, 1.15, -0.49] },
        { geometry: new THREE.BoxGeometry(0.82, 0.07, 0.08), color: 0x333b3d, position: [0, 0.43, -1.02] },
      ];

      for (const x of [-0.49, 0.49]) {
        for (const z of [-0.46, 0.59]) {
          parts.push({
            geometry: new THREE.BoxGeometry(0.055, 0.66, 0.055),
            color: 0x183b30,
            position: [x, 1.10, z],
          });
        }
      }

      for (const [x, z] of [[0, -0.68], [-0.55, 0.48], [0.55, 0.48]]) {
        parts.push({
          geometry: new THREE.CylinderGeometry(0.19, 0.19, 0.11, 8),
          color: 0x15191b,
          position: [x, 0.20, z],
          rotation: [0, 0, Math.PI / 2],
        });
      }

      const positions = [];
      const normals = [];
      const colors = [];
      const translation = new THREE.Vector3();
      const rotation = new THREE.Euler();
      const scale = new THREE.Vector3(1, 1, 1);
      const quaternion = new THREE.Quaternion();
      const matrix = new THREE.Matrix4();

      for (const part of parts) {
        const original = part.geometry;
        const geometry = original.index ? original.toNonIndexed() : original;
        translation.set(...part.position);
        rotation.set(...(part.rotation || [0, 0, 0]));
        quaternion.setFromEuler(rotation);
        matrix.compose(translation, quaternion, scale);
        geometry.applyMatrix4(matrix);

        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        const positionAttribute = geometry.getAttribute('position');
        const normalAttribute = geometry.getAttribute('normal');
        const color = new THREE.Color(part.color);

        for (let index = 0; index < positionAttribute.count; index += 1) {
          positions.push(
            positionAttribute.getX(index),
            positionAttribute.getY(index),
            positionAttribute.getZ(index),
          );
          normals.push(
            normalAttribute.getX(index),
            normalAttribute.getY(index),
            normalAttribute.getZ(index),
          );
          colors.push(color.r, color.g, color.b);
        }

        if (geometry !== original) geometry.dispose();
        original.dispose();
      }

      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      merged.computeBoundingSphere();
      this._mobileTrafficKekeGeometry = { merged };
    }

    const keke = new THREE.Mesh(
      this._mobileTrafficKekeGeometry.merged,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    keke.name = 'KANO_LIGHTWEIGHT_TRAFFIC_KEKE';
    keke.castShadow = false;
    keke.receiveShadow = false;
    // disposeSceneTree skips renderer-shared geometry but still disposes this
    // actor's per-instance material when the traffic vehicle leaves the road.
    keke.userData.sharedGeometry = true;
    keke.userData.simplifiedTrafficKeke = true;
    return keke;
  }

  /**
   * Compact one-mesh mobile fallback for background traffic.
   *
   * The detailed desktop fallback below remains untouched. On phones, non-GLB
   * cars, buses, trucks, emergency vehicles and motorcycles use a small cached
   * vertex-coloured mesh. Each moving vehicle therefore uses one draw call
   * rather than a dozen separately-materialed primitive meshes. Gameplay
   * traffic, lane positions and collision state remain owned by game.js.
   */
  makeMobileLiteTrafficVehicle(type) {
    const cache = this._mobileTrafficVehicleGeometry;
    let geometry = cache.get(type);

    if (!geometry) {
      const parts = [];
      const add = (shape, color, position, rotation = [0, 0, 0], scale = [1, 1, 1]) => {
        parts.push({ shape, color, position, rotation, scale });
      };
      const box = (size, color, position, rotation, scale) =>
        add(new THREE.BoxGeometry(...size), color, position, rotation, scale);
      const sphere = (radius, color, position, scale = [1, 1, 1], segments = [10, 7]) =>
        add(new THREE.SphereGeometry(radius, segments[0], segments[1]), color, position, [0, 0, 0], scale);
      const wheel = (x, z, radius = 0.22, y = 0.27) => {
        add(
          new THREE.CylinderGeometry(radius, radius, 0.12, 8),
          0x15191b,
          [x, y, z],
          [0, 0, Math.PI / 2],
        );
        add(
          new THREE.CylinderGeometry(radius * 0.38, radius * 0.38, 0.135, 8),
          0x9aa3a5,
          [x, y, z],
          [0, 0, Math.PI / 2],
        );
      };
      const lamp = (x, y, z, color, sx = 0.12, sy = 0.075, sz = 0.055) =>
        sphere(1, color, [x, y, z], [sx, sy, sz], [6, 5]);

      const bodyColors = {
        car: 0x8f9fa7,
        taxi: 0xe8c64b,
        suv: 0x37465a,
        motorcycle: 0xc84a3b,
        police: 0xe8edf3,
        karota: 0x328ac2,
        truck: 0x9e5544,
        bus: 0xd4ad46,
        ambulance: 0xe8eceb,
      };
      const bodyColor = bodyColors[type] || 0xd6dce1;
      const glass = 0x5e8490;
      const rubber = 0x15191b;
      const trim = 0x39434a;
      const frontLight = 0xf6e6a9;
      const rearLight = 0xb93631;

      if (type === 'motorcycle') {
        // Side-profile wheels and frame keep the motorcycle silhouette visible
        // at mobile scale without a torus, axle, tank, rider and helmet mesh each.
        wheel(0, -0.50, 0.215, 0.25);
        wheel(0, 0.50, 0.215, 0.25);
        add(new THREE.CylinderGeometry(0.045, 0.055, 0.78, 6), bodyColor, [0, 0.49, 0.00], [Math.PI / 2.9, 0, 0]);
        sphere(0.25, bodyColor, [0, 0.66, -0.08], [0.72, 0.58, 1.08], [8, 6]);
        box([0.25, 0.09, 0.42], 0x1d272c, [0, 0.71, 0.29]);
        box([0.28, 0.42, 0.24], 0x2b5141, [0, 1.02, 0.22], [-0.18, 0, 0]);
        sphere(0.15, 0x2d363b, [0, 1.36, -0.04], [1, 0.96, 0.96], [8, 6]);
        // Rear passenger gives the mobile one-mesh bike the two-rider achaba silhouette.
        box([0.26, 0.35, 0.22], 0x84513a, [0, 0.97, 0.48], [-0.13, 0, 0]);
        sphere(0.125, 0x74462f, [0, 1.25, 0.47], [1, 1, 1], [8, 6]);
        sphere(0.13, 0xdbcba5, [0, 1.35, 0.47], [1, 0.28, 1], [8, 5]);
        box([0.48, 0.045, 0.06], trim, [0, 0.87, -0.43]);
        lamp(0, 0.76, -0.54, frontLight, 0.09, 0.08, 0.06);
      } else if (type === 'police') {
        // Single-mesh Kano police pickup: open bed, cab, side stripe and lightbar.
        const white = 0xe7edf0;
        const policeBlue = 0x1269a7;
        box([1.70, 0.45, 3.45], bodyColor, [0, 0.55, 0.02]);
        box([1.62, 0.22, 0.86], white, [0, 0.82, -1.15]);
        box([1.52, 0.78, 1.42], white, [0, 1.02, -0.39]);
        box([1.24, 0.34, 0.035], glass, [0, 1.18, -1.115]);
        for (const side of [-1, 1]) {
          box([0.035, 0.34, 0.52], glass, [side * 0.785, 1.18, -0.38]);
          box([0.055, 0.20, 1.33], policeBlue, [side * 0.86, 0.70, 0.03]);
          box([0.10, 0.35, 1.06], white, [side * 0.77, 0.86, 1.02]);
        }
        box([1.43, 0.10, 1.08], trim, [0, 0.73, 1.00]);
        box([0.72, 0.08, 0.18], trim, [0, 1.43, -0.37]);
        box([0.26, 0.11, 0.15], 0x227bff, [-0.22, 1.50, -0.37]);
        box([0.26, 0.11, 0.15], 0xff3939, [0.22, 1.50, -0.37]);
        for (const x of [-0.84, 0.84]) {
          for (const z of [-1.16, 1.16]) wheel(x, z, 0.30, 0.28);
        }
        lamp(-0.48, 0.72, -1.58, frontLight, 0.10, 0.07, 0.05);
        lamp(0.48, 0.72, -1.58, frontLight, 0.10, 0.07, 0.05);
        lamp(-0.62, 0.67, 1.77, rearLight, 0.08, 0.07, 0.05);
        lamp(0.62, 0.67, 1.77, rearLight, 0.08, 0.07, 0.05);
      } else if (['truck', 'bus', 'karota', 'ambulance'].includes(type)) {

        const truck = type === 'truck';
        const bus = type === 'bus';
        const width = truck ? 1.86 : bus ? 1.72 : 1.56;
        const length = truck ? 4.0 : bus ? 3.45 : type === 'ambulance' ? 3.05 : 2.85;
        const height = truck ? 1.10 : bus ? 1.32 : 1.05;

        if (truck) {
          box([width, 0.44, length * 0.9], bodyColor, [0, 0.52, 0.05]);
          box([width * 0.93, 1.12, length * 0.53], 0xb7a18a, [0, 1.30, 0.47]);
          box([width * 0.90, 0.78, 0.88], bodyColor, [0, 0.88, -1.28]);
          box([width * 0.73, 0.31, 0.035], glass, [0, 1.02, -1.73]);
          for (const x of [-width * 0.5, width * 0.5]) {
            for (const z of [-1.38, -0.48, 1.35]) wheel(x, z, 0.27, 0.29);
          }
        } else {
          box([width, height, length], bodyColor, [0, 0.88, 0.02]);
          const windowY = bus ? 1.10 : 0.98;
          const windowH = bus ? 0.42 : 0.30;
          for (const x of [-width * 0.505, width * 0.505]) {
            if (bus) {
              for (let windowIndex = 0; windowIndex < 4; windowIndex += 1) {
                const windowZ = -0.72 + windowIndex * 0.48;
                box([0.035, 0.39, 0.40], glass, [x, windowY, windowZ]);
                box([0.045, 0.45, 0.055], 0xe8d9ae, [x + Math.sign(x) * 0.012, windowY, windowZ + 0.23]);
              }
              box([0.045, 0.15, length * 0.82], 0x188354, [x + Math.sign(x) * 0.012, 0.63, 0.02]);
            } else {
              box([0.035, windowH, length * 0.60], glass, [x, windowY, 0.02]);
            }
          }
          if (bus) box([width * 0.94, 0.08, length * 0.82], 0xe8d9ae, [0, 1.58, 0.12]);
          box([width * 0.74, bus ? 0.37 : 0.31, 0.035], glass, [0, windowY, -length * 0.505]);
          box([width * 0.70, 0.24, 0.035], glass, [0, windowY, length * 0.505]);
          if (type === 'ambulance') {
            box([0.055, 0.25, length * 0.48], 0xc83e37, [width * 0.51, 0.82, 0.02]);
            box([0.055, 0.25, length * 0.48], 0xc83e37, [-width * 0.51, 0.82, 0.02]);
            box([0.06, 0.28, 0.06], 0xc83e37, [0, 1.38, 0.02]);
            box([0.19, 0.06, 0.06], 0xc83e37, [0, 1.38, 0.02]);
          }
          const wheelZ = bus ? [-1.08, 1.06] : [-0.95, 0.95];
          for (const x of [-width * 0.49, width * 0.49]) {
            for (const z of wheelZ) wheel(x, z, 0.245, 0.28);
          }
        }
        if (type === 'karota') {
          box([width * 0.90, 0.12, length * 0.66], 0x195d97, [0, 0.82, 0.02]);
        }
        if (type === 'bus') {
          box([width * 0.86, 0.10, length * 0.68], 0x8c6c25, [0, 0.46, 0.02]);
        }
        if (type === 'truck') {
          box([width * 0.86, 0.07, 0.12], 0xbfc2c0, [0, 0.30, -length * 0.48]);
        }
        lamp(-width * 0.31, 0.64, -length * 0.51, frontLight);
        lamp(width * 0.31, 0.64, -length * 0.51, frontLight);
        lamp(-width * 0.32, 0.63, length * 0.51, rearLight);
        lamp(width * 0.32, 0.63, length * 0.51, rearLight);
      } else {
        const suv = type === 'suv';
        const width = suv ? 1.72 : 1.52;
        const length = suv ? 3.02 : 2.72;
        const height = suv ? 0.53 : 0.40;
        box([width, height, length * 0.89], bodyColor, [0, 0.50, 0.05]);
        box([width * 0.90, 0.18, length * 0.25], bodyColor, [0, 0.63, -length * 0.31]);
        box([width * 0.71, suv ? 0.49 : 0.41, length * 0.45], bodyColor, [0, suv ? 0.89 : 0.82, 0.01]);
        box([width * 0.64, suv ? 0.27 : 0.23, 0.035], glass, [0, suv ? 0.95 : 0.87, -length * 0.22]);
        box([width * 0.62, suv ? 0.24 : 0.21, 0.035], glass, [0, suv ? 0.94 : 0.86, length * 0.24]);
        for (const x of [-width * 0.365, width * 0.365]) {
          box([0.035, 0.22, length * 0.29], glass, [x, suv ? 0.92 : 0.84, 0.03]);
        }
        for (const x of [-width * 0.47, width * 0.47]) {
          for (const z of [-length * 0.29, length * 0.29]) wheel(x, z, suv ? 0.27 : 0.235, 0.27);
        }
        box([width * 0.92, 0.10, 0.13], 0x9aa3a5, [0, 0.31, -length * 0.49]);
        box([width * 0.92, 0.10, 0.13], 0x9aa3a5, [0, 0.31, length * 0.49]);
        lamp(-width * 0.34, 0.55, -length * 0.47, frontLight);
        lamp(width * 0.34, 0.55, -length * 0.47, frontLight);
        lamp(-width * 0.34, 0.55, length * 0.47, rearLight);
        lamp(width * 0.34, 0.55, length * 0.47, rearLight);
        if (type === 'taxi') {
          box([0.36, 0.12, 0.22], 0xf1e4bd, [0, 1.13, -0.02]);
        }
        if (type === 'police') {
          box([width * 0.035, 0.10, length * 0.70], 0x2c68ad, [width * 0.51, 0.53, 0.02]);
          box([width * 0.035, 0.10, length * 0.70], 0x2c68ad, [-width * 0.51, 0.53, 0.02]);
          box([0.28, 0.07, 0.12], 0x3b78c1, [0, 1.15, 0.01]);
        }
      }

      const positions = [];
      const colors = [];
      const translation = new THREE.Vector3();
      const rotation = new THREE.Euler();
      const scale = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const matrix = new THREE.Matrix4();

      for (const part of parts) {
        const original = part.shape;
        const transformed = original.index ? original.toNonIndexed() : original;
        translation.set(...part.position);
        rotation.set(...part.rotation);
        scale.set(...part.scale);
        quaternion.setFromEuler(rotation);
        matrix.compose(translation, quaternion, scale);
        transformed.applyMatrix4(matrix);
        transformed.computeVertexNormals();

        const positionAttribute = transformed.getAttribute('position');
        const color = new THREE.Color(part.color);
        for (let index = 0; index < positionAttribute.count; index += 1) {
          positions.push(
            positionAttribute.getX(index),
            positionAttribute.getY(index),
            positionAttribute.getZ(index),
          );
          colors.push(color.r, color.g, color.b);
        }

        transformed.dispose();
        if (transformed !== original) original.dispose();
      }

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      cache.set(type, geometry);
    }

    const actor = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    actor.name = `KANO_LITE_TRAFFIC_${String(type).toUpperCase()}`;
    actor.castShadow = false;
    actor.receiveShadow = false;
    actor.userData.sharedGeometry = true;
    actor.userData.simplifiedTrafficVehicle = true;
    actor.userData.vehicleType = type;
    actor.userData.fallback = true;
    return actor;
  }

  /**
   * Return one InstancedMesh for a mobile fallback traffic type.
   * Geometry is shared with the existing lightweight procedural vehicle
   * builder; each visible vehicle is represented by one instance matrix rather
   * than a separate Three.js Object3D and draw call.
   */
  getMobileTrafficBatch(type, requiredCount = 1) {
    const existing = this._mobileTrafficBatches.get(type);
    if (existing && existing.capacity >= requiredCount) return existing;

    let geometry = existing?.mesh.geometry;
    let material = existing?.mesh.material;

    if (existing) {
      existing.mesh.parent?.remove(existing.mesh);
      existing.mesh.dispose?.();
    } else {
      // Calling the established builders creates or retrieves the canonical
      // cached geometry and its compatible vertex-colour material.
      const sample = type === 'keke'
        ? this.makeTrafficKeke()
        : this.makeMobileLiteTrafficVehicle(type);
      geometry = sample.geometry;
      material = sample.material;
    }

    const capacity = Math.max(
      16,
      requiredCount,
      existing ? existing.capacity * 2 : 0,
    );
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `KANO_MOBILE_TRAFFIC_BATCH_${String(type).toUpperCase()}`;
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // This batch is populated only with nearby traffic. Disable aggregate
    // frustum culling because per-instance matrices change every driving tick.
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.sharedGeometry = true;
    mesh.userData.mobileTrafficBatch = true;
    mesh.userData.vehicleType = type;
    this.world.add(mesh);

    const batch = { mesh, capacity };
    this._mobileTrafficBatches.set(type, batch);
    return batch;
  }

  makeTrafficActor(vehicle, { allowGLB = true } = {}) {
    const key = VEHICLE_MODEL_KEY[vehicle.type] || 'car';
    // Inspect the cached template before cloning; rejected clones can share GLB resources.
    const cachedModelPath = String(
      this.models?.cache?.get(key)?.userData?.modelPath || '',
    ).toLowerCase();
    const forceKanoPolicePickup = vehicle.type === 'police' && cachedModelPath &&
      !/hilux|pickup|ram_2500/.test(cachedModelPath);
    const forceKanoHiaceFallback = vehicle.type === 'bus' && cachedModelPath &&
      !/hiace|minibus|van/.test(cachedModelPath);
    const model = allowGLB && !forceKanoPolicePickup && !forceKanoHiaceFallback
      ? this.models?.getInstance(key)
      : null;

    if (model) {
      model.userData.fallback = false;
      return model;
    }

    if (vehicle.type === 'keke') {
      const keke = this.mobile ? this.makeTrafficKeke() : this.makeKeke();
      keke.userData.fallback = true;
      return keke;
    }

    // Background traffic on phones gets a one-mesh representation. Desktop
    // retains the multi-part detailed procedural models below.
    if (this.mobile) {
      return this.makeMobileLiteTrafficVehicle(vehicle.type);
    }

    const group = new THREE.Group();

    const colorMap = {
      car: 0x8f9fa7,
      taxi: 0xe8c64b,
      suv: 0x37465a,
      motorcycle: 0xc84a3b,
      police: 0xe8edf3,
      karota: 0x328ac2,
      truck: 0x9e5544,
      bus: 0xd4ad46,
      ambulance: 0xe8eceb,
    };

    const bodyMat = this.material(
      colorMap[vehicle.type] || 0xd6dce1,
      0.6,
    );

    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x33505d,
      roughness: 0.22,
      metalness: 0.05,
      transparent: true,
      opacity: 0.84,
      side: THREE.DoubleSide,
    });

    const rubber = this.material(0x12171b, 0.95);
    const alloy = this.material(0x9aa3a5, 0.55);
    const frontLamp = this.material(0xffe6a4, 0.35);
    const tailLamp = this.material(0xbd3830, 0.45);

    const addWheel = (x, y, z, radius = 0.25) => {
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.16, 12),
        rubber,
      );

      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, y, z);
      group.add(tire);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(
          radius * 0.47,
          radius * 0.47,
          0.17,
          10,
        ),
        alloy,
      );

      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, y, z);
      group.add(hub);
    };

    const addLampPair = (z, material) => {
      for (const x of [-0.47, 0.47]) {
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 10, 8),
          material,
        );

        lamp.scale.set(1.1, 0.68, 0.42);
        lamp.position.set(x, 0.58, z);
        group.add(lamp);
      }
    };

    if (vehicle.type === 'police') {
      this.buildKanoPolicePickup(group, bodyMat, windowMat, rubber, alloy, frontLamp, tailLamp);
    } else if (vehicle.type === 'motorcycle') {
      for (const z of [-0.52, 0.55]) {
        const wheel = new THREE.Mesh(
          new THREE.TorusGeometry(0.27, 0.065, 8, 16),
          rubber,
        );

        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(0, 0.28, z);
        group.add(wheel);

        const axle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.7, 8),
          alloy,
        );

        axle.rotation.x = Math.PI / 2;
        axle.position.set(0, 0.28, z);
        group.add(axle);
      }

      const frame = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.06, 0.95, 7),
        bodyMat,
      );

      frame.rotation.x = Math.PI / 2.9;
      frame.position.set(0, 0.48, 0.02);
      group.add(frame);

      const tank = new THREE.Mesh(
        new THREE.SphereGeometry(0.31, 14, 10),
        bodyMat,
      );

      tank.scale.set(0.72, 0.62, 1.15);
      tank.position.set(0, 0.64, -0.04);
      group.add(tank);

      const seat = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, 0.34, 3, 7),
        this.material(0x1d272c),
      );

      seat.rotation.x = Math.PI / 2;
      seat.position.set(0, 0.72, 0.33);
      group.add(seat);

      const rider = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.19, 0.47, 4, 8),
        this.material(0x2b5141),
      );
      rider.name = 'ACHABA_FRONT_RIDER_BODY';

      rider.position.set(0, 1.13, 0.22);
      rider.rotation.x = -0.18;
      group.add(rider);

      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 12, 10),
        this.material(0x2d363b),
      );

      helmet.name = 'ACHABA_FRONT_RIDER_HELMET';
      helmet.position.set(0, 1.48, -0.05);
      group.add(helmet);

      addLampPair(-0.59, frontLamp);
    } else {
      const heavy = [
        'truck',
        'bus',
        'karota',
        'ambulance',
      ].includes(vehicle.type);

      const bodyWidth =
        vehicle.type === 'truck'
          ? 2.0
          : vehicle.type === 'bus'
            ? 1.85
            : 1.55;

      const bodyLength =
        vehicle.type === 'truck'
          ? 4.25
          : vehicle.type === 'bus'
            ? 3.6
            : 2.95;

      const bodyHeight =
        vehicle.type === 'bus'
          ? 1.48
          : vehicle.type === 'truck'
            ? 1.18
            : 0.72;

      const lower = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 14),
        bodyMat,
      );

      lower.scale.set(
        bodyWidth * 0.56,
        bodyHeight * 0.48,
        bodyLength * 0.54,
      );

      lower.position.set(0, 0.55, 0.02);
      group.add(lower);

      if (heavy) {
        const cargo = new THREE.Mesh(
          new THREE.BoxGeometry(
            bodyWidth,
            bodyHeight * 0.92,
            bodyLength * 0.55,
          ),
          bodyMat,
        );

        cargo.position.set(
          0,
          0.7 + bodyHeight * 0.28,
          bodyLength * 0.2,
        );

        group.add(cargo);

        const cab = new THREE.Mesh(
          new THREE.BoxGeometry(
            bodyWidth * 0.92,
            bodyHeight * 0.84,
            bodyLength * 0.36,
          ),
          bodyMat,
        );

        cab.position.set(0, 0.76, -bodyLength * 0.31);
        group.add(cab);

        const windscreen = new THREE.Mesh(
          new THREE.BoxGeometry(
            bodyWidth * 0.76,
            bodyHeight * 0.34,
            0.035,
          ),
          windowMat,
        );

        windscreen.position.set(
          0,
          0.98,
          -bodyLength * 0.505,
        );

        group.add(windscreen);

        const sideWindowGeometry = new THREE.BoxGeometry(
          bodyWidth * 0.04,
          bodyHeight * 0.38,
          bodyLength * 0.27,
        );

        const rightSideWindow = new THREE.Mesh(
          sideWindowGeometry,
          windowMat,
        );

        rightSideWindow.position.set(
          bodyWidth * 0.48,
          0.98,
          -bodyLength * 0.31,
        );

        group.add(rightSideWindow);

        const leftSideWindow = new THREE.Mesh(
          sideWindowGeometry,
          windowMat,
        );

        leftSideWindow.position.set(
          -bodyWidth * 0.48,
          0.98,
          -bodyLength * 0.31,
        );

        group.add(leftSideWindow);

        if (vehicle.type === 'bus') {
          // Hiace/Danfo minibus fallback: multiple side windows, Kano green
          // belt stripe, handles and a shallow raised roof. The existing GLB
          // still wins whenever its actual bus model loads successfully.
          const busGreen = this.material(0x188354, 0.75);
          const busCream = this.material(0xe8d9ae, 0.9);
          const sideWindowCount = 4;
          for (const side of [-1, 1]) {
            const sideX = side * (bodyWidth * 0.51);
            for (let windowIndex = 0; windowIndex < sideWindowCount; windowIndex += 1) {
              const windowMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.035, 0.43, 0.40),
                windowMat,
              );
              windowMesh.position.set(sideX, 1.12, -0.70 + windowIndex * 0.48);
              group.add(windowMesh);

              const pillar = new THREE.Mesh(
                new THREE.BoxGeometry(0.045, 0.49, 0.055),
                busCream,
              );
              pillar.position.set(sideX + side * 0.014, 1.12, -0.46 + windowIndex * 0.48);
              group.add(pillar);
            }

            const stripe = new THREE.Mesh(
              new THREE.BoxGeometry(0.045, 0.16, bodyLength * 0.82),
              busGreen,
            );
            stripe.position.set(sideX + side * 0.012, 0.63, 0.04);
            group.add(stripe);

            const doorHandle = new THREE.Mesh(
              new THREE.BoxGeometry(0.045, 0.045, 0.12),
              alloy,
            );
            doorHandle.position.set(sideX + side * 0.02, 0.82, 0.50);
            group.add(doorHandle);
          }

          const roofLip = new THREE.Mesh(
            new THREE.BoxGeometry(bodyWidth * 0.94, 0.08, bodyLength * 0.82),
            busCream,
          );
          roofLip.position.set(0, bodyHeight * 1.25, 0.12);
          group.add(roofLip);
        }

        const wheelsZ =
          vehicle.type === 'truck'
            ? [-1.42, -0.55, 1.3]
            : [-1.05, 1.02];

        for (const z of wheelsZ) {
          for (const x of [
            -bodyWidth * 0.49,
            bodyWidth * 0.49,
          ]) {
            addWheel(
              x,
              0.28,
              z,
              vehicle.type === 'truck' ? 0.3 : 0.25,
            );
          }
        }
      } else {
        const cabin = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 12),
          windowMat,
        );

        cabin.scale.set(0.62, 0.36, 0.47);
        cabin.position.set(0, 0.95, -0.08);
        group.add(cabin);

        const roof = new THREE.Mesh(
          new THREE.SphereGeometry(1, 14, 10),
          bodyMat,
        );

        roof.scale.set(0.55, 0.09, 0.40);
        roof.position.set(0, 1.27, -0.08);
        group.add(roof);

        for (const x of [-0.63, 0.63]) {
          for (const z of [-0.84, 0.84]) {
            addWheel(x, 0.27, z, 0.24);
          }
        }

        addLampPair(-1.12, frontLamp);
      }

      addLampPair(bodyLength * 0.51, tailLamp);

      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(bodyWidth * 0.95, 0.12, 0.16),
        alloy,
      );

      bumper.position.set(0, 0.28, -bodyLength * 0.53);
      group.add(bumper);

      if (vehicle.type === 'taxi') {
        const roofSign = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.12, 0.22),
          this.material(0xf1e4bd),
        );

        roofSign.position.set(0, 1.34, -0.06);
        group.add(roofSign);
      }
    }

    group.userData.fallback = true;
    group.userData.vehicleType = vehicle.type;
    if (vehicle.type === 'police') group.userData.kanoVehicleFallback = 'policePickup';
    if (vehicle.type === 'bus') group.userData.kanoVehicleFallback = 'hiaceBus';

    return group;
  }

  /**
   * Builds a persistent, raised-edge pothole marker.
   */
  makePotholeActor(zone) {
    const group = new THREE.Group();

    const radius = zone.hub ? 1.25 : 0.82;

    const warningMaterial = new THREE.MeshBasicMaterial({
      color: 0xe64a3b,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.9, radius * 1.18, 28),
      warningMaterial,
    );

    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.055;
    group.add(outerRing);

    const brokenEdge = new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius,
        radius * 0.92,
        0.075,
        12,
        1,
        true,
      ),
      this.material(0x77736a),
    );

    brokenEdge.position.y = 0.025;
    group.add(brokenEdge);

    const crater = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.91, 16),
      this.material(0x15191c),
    );

    crater.rotation.x = -Math.PI / 2;
    crater.position.y = 0.019;
    group.add(crater);

    const innerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.65, 16),
      this.material(0x080b0e),
    );

    innerShadow.rotation.x = -Math.PI / 2;
    innerShadow.position.y = 0.021;
    group.add(innerShadow);

    const chipsMaterial = this.material(0x6e6659);

    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2;

      const chip = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.035, 0.12),
        chipsMaterial,
      );

      chip.position.set(
        Math.cos(angle) * radius * 1.02,
        0.055,
        Math.sin(angle) * radius * 1.02,
      );

      chip.rotation.y = angle;
      group.add(chip);
    }

    group.userData.zoneType = 'pothole';
    group.userData.potholeWarning = outerRing;

    return group;
  }

  syncZones(state) {
    const activeIds = this._activeZoneIds;
    activeIds.clear();

    for (const zone of state.zones || []) {
      activeIds.add(zone.id);

      let actor = this.zoneActors.get(zone.id);

      if (!actor) {
        if (zone.type === 'pothole') {
          actor = this.makePotholeActor(zone);
        } else {
          actor = new THREE.Group();

          const colors = {
            pickup: 0x28d78a,
            drop: 0xf5c542,
            fuel: 0x54e6a1,
          };

          const radius = zone.hub
            ? 1.25
            : zone.type === 'pickup'
              ? 0.68
              : 0.98;

          // General Checkpoint is a long loading bay for group passengers;
          // ordinary roadside stops keep their compact circular marker.
          const checkpointBay = Boolean(zone.hub) && zone.type === 'pickup';
          const padMaterial = this.material(
            colors[zone.type] || 0x353b42,
          );
          padMaterial.transparent = true;
          padMaterial.opacity = 0.78;

          const pad = new THREE.Mesh(
            checkpointBay
              ? new THREE.BoxGeometry(2.6, 0.04, 5.2)
              : new THREE.CylinderGeometry(radius, radius, 0.04, 20),
            padMaterial,
          );

          pad.position.y = 0.035;
          actor.add(pad);

          if (zone.type === 'fuel') {
            const pump = new THREE.Mesh(
              new THREE.BoxGeometry(0.34, 0.72, 0.34),
              this.material(0x35c991),
            );

            pump.position.set(0.75, 0.38, 0);
            actor.add(pump);
          }

          const labelCanvas = document.createElement('canvas');
          labelCanvas.width = 512;
          labelCanvas.height = 128;

          const labelCtx = labelCanvas.getContext('2d');

          if (labelCtx) {
            labelCtx.fillStyle =
              zone.type === 'drop'
                ? '#6d5016'
                : zone.type === 'fuel'
                  ? '#145a43'
                  : '#13533c';

            labelCtx.fillRect(0, 0, 512, 128);

            labelCtx.strokeStyle = '#f5d77b';
            labelCtx.lineWidth = 8;
            labelCtx.strokeRect(4, 4, 504, 120);

            labelCtx.fillStyle = '#fff4d0';
            labelCtx.font = '900 30px Arial, sans-serif';
            labelCtx.textAlign = 'center';

            const labelText = zone.hub
              ? 'GENERAL CHECKPOINT · KEKE STOP'
              : zone.type === 'pickup'
                ? 'ROADSIDE PICK-UP'
                : zone.type === 'drop'
                  ? 'ROADSIDE DROP-OFF'
                  : 'FUEL STOP';

            labelCtx.fillText(labelText, 256, 51, 486);

            labelCtx.font = '700 24px Arial, sans-serif';

            labelCtx.fillText(
              String(zone.dest || zone.label || '').slice(0, 36),
              256,
              91,
              486,
            );
          }

          const labelTexture = new THREE.CanvasTexture(labelCanvas);
          labelTexture.colorSpace = THREE.SRGBColorSpace;

          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(
              zone.hub ? 3.0 : 2.3,
              zone.hub ? 0.76 : 0.58,
            ),
            new THREE.MeshBasicMaterial({
              map: labelTexture,
              side: THREE.DoubleSide,
            }),
          );

          sign.position.set(0, 1.4, 0.15);
          actor.add(sign);
          actor.userData.labelTexture = labelTexture;

          if (zone.type === 'pickup') {
            const waiting = this.makeSecurityPlaceholder();

            waiting.scale.setScalar(zone.hub ? 0.86 : 0.78);

            waiting.position.set(
              zone.side < 0 ? 1.35 : -1.35,
              0,
              0.15,
            );

            waiting.rotation.y = zone.side < 0 ? -0.28 : 0.28;

            actor.add(waiting);

            actor.userData.waitingActors = [waiting];

            actor.userData.waitingModelKey = zone.hub
              ? 'passengerWoman'
              : zone.id.length % 2
                ? 'passengerWoman'
                : 'passengerMan';
          }
        }

        actor.userData.zoneType = zone.type;
        actor.userData.propKey = zone.prop || null;
        actor.userData.propAdded = false;

        this.world.add(actor);
        this.zoneActors.set(zone.id, actor);
      }

      actor.userData.propKey =
        zone.prop || actor.userData.propKey || null;

      if (
        actor.userData.waitingActors?.length &&
        !actor.userData.waitingUsingModel
      ) {
        const personKey = this.models?.cache.has(
          actor.userData.waitingModelKey,
        )
          ? actor.userData.waitingModelKey
          : this.models?.cache.has('passenger')
            ? 'passenger'
            : null;

        if (personKey) {
          const oldPerson = actor.userData.waitingActors[0];
          const person = this.models.getInstance(personKey);

          if (person) {
            person.position.copy(oldPerson.position);
            person.scale.copy(oldPerson.scale);
            person.rotation.copy(oldPerson.rotation);

            actor.remove(oldPerson);
            disposeSceneTree(oldPerson);
            actor.add(person);

            actor.userData.waitingActors = [person];
            actor.userData.waitingUsingModel = true;

            console.info(
              `[Kano Life] roadside passenger model active: ${personKey}`,
            );
          }
        }
      }

      if (
        actor.userData.propKey &&
        !actor.userData.propAdded &&
        this.models?.cache.has(actor.userData.propKey)
      ) {
        const prop = this.models.getInstance(actor.userData.propKey);

        if (prop) {
          prop.scale.multiplyScalar(
            actor.userData.propKey === 'cone' ? 0.7 : 0.42,
          );

          prop.position.set(
            actor.userData.propKey === 'cone' ? 0.82 : -0.82,
            0.03,
            -0.15,
          );

          actor.add(prop);
          actor.userData.propAdded = true;
        }
      }

      const markerX =
        zone.type === 'pothole'
          ? (zone.lane - 1) * 3
          : (zone.side || (zone.lane === 0 ? -1 : 1)) * 4.55;

      // Zone depth remains controlled by game.js.
      // In reverse gear, zone.depth must increase in game.js as
      // reverse movement approaches objects behind the player.
      actor.position.set(
        markerX,
        0,
        -Math.max(-0.05, Number(zone.depth) || 0) * 88,
      );
    }

    for (const [id, actor] of this.zoneActors) {
      if (activeIds.has(id)) continue;

      this.world.remove(actor);
      // Each temporary roadside zone owns a unique CanvasTexture for its
      // sign. disposeSceneTree intentionally preserves textures by default
      // because many GLB textures are shared; release this zone-owned texture
      // explicitly to prevent GPU texture accumulation as zones recycle.
      disposeOwnedZoneLabelTexture(actor);
      disposeSceneTree(actor);
      this.zoneActors.delete(id);
    }
  }

  syncTraffic(state) {
    const traffic = Array.isArray(state.traffic) ? state.traffic : [];
    const activeIds = this._activeTrafficIds;
    activeIds.clear();
    for (const vehicle of traffic) activeIds.add(vehicle.id);

    // Reuse the same small arrays while driving to avoid one collection per
    // vehicle on every frame. Non-instanced GLB actors remain keyed by ID.
    const fallbackByType = this._mobileFallbackTrafficByType;
    for (const list of fallbackByType.values()) list.length = 0;

    let mobileGlbIds = null;
    if (this.mobile) {
      for (const id of this._mobileGlbTrafficIds) {
        if (!activeIds.has(id)) this._mobileGlbTrafficIds.delete(id);
      }
      const budget = getMobileTrafficModelBudget(this.mobileTier);
      const freeSlots = Math.max(0, budget - this._mobileGlbTrafficIds.size);
      const selectionNow = globalThis.performance?.now?.() ?? Date.now();
      if (
        freeSlots > 0 &&
        this.models?.cache?.size &&
        selectionNow >= this._nextMobileGlbTrafficSelectionAt
      ) {
        // Model promotion affects visuals only. On phones, select the nearest
        // eligible GLB actors at most about 3 times per second instead of
        // re-scanning and sorting the full traffic list every rendered frame.
        // Movement, visibility, collision ownership and traffic state still
        // update in the normal per-frame path below.
        this._nextMobileGlbTrafficSelectionAt = selectionNow + 350;
        const candidates = this._mobileTrafficCandidateScratch;
        candidates.length = 0;
        for (const vehicle of traffic) {
          if (this._mobileGlbTrafficIds.has(vehicle.id)) continue;
          const key = VEHICLE_MODEL_KEY[vehicle.type] || 'car';
          if (!this.models.cache.has(key)) continue;
          candidates.push(vehicle);
        }
        candidates.sort((a, b) =>
          Math.abs(Number(a.depth) || 0) - Math.abs(Number(b.depth) || 0),
        );
        let slotsToFill = freeSlots;
        for (const vehicle of candidates) {
          if (slotsToFill <= 0) break;
          this._mobileGlbTrafficIds.add(vehicle.id);
          slotsToFill -= 1;
        }
      }
      mobileGlbIds = this._mobileGlbTrafficIds;
    }

    for (const vehicle of traffic) {
      const type = VEHICLE_MODEL_KEY[vehicle.type] ? vehicle.type : 'car';
      const allowGLB = !this.mobile || mobileGlbIds.has(vehicle.id);
      const depth = Math.abs(Number(vehicle.depth) || 0);
      const visible = !this.mobile || depth <= 1.35;

      // On phones, every unmodelled procedural traffic vehicle goes into a
      // type-specific InstancedMesh. Its simulated vehicle remains in game.js;
      // only the renderer's visual representation is batched.
      if (this.mobile && !allowGLB) {
        if (visible) {
          let list = fallbackByType.get(type);
          if (!list) {
            list = [];
            fallbackByType.set(type, list);
          }
          list.push(vehicle);
        }

        const obsolete = this.trafficActors.get(vehicle.id);
        if (obsolete?.userData?.fallback) {
          this.world.remove(obsolete);
          disposeSceneTree(obsolete);
          this.trafficActors.delete(vehicle.id);
        }
        continue;
      }

      let actor = this.trafficActors.get(vehicle.id);
      if (!actor) {
        actor = this.makeTrafficActor(vehicle, { allowGLB });
        actor.userData.vehicleType = vehicle.type;

        // A selected GLB can be in the model cache before an instance is
        // available. In that case keep rendering through the fallback batch.
        if (this.mobile && actor.userData.fallback) {
          if (visible) {
            let list = fallbackByType.get(type);
            if (!list) {
              list = [];
              fallbackByType.set(type, list);
            }
            list.push(vehicle);
          }
          disposeSceneTree(actor);
          continue;
        }

        this.world.add(actor);
        this.trafficActors.set(vehicle.id, actor);
      }

      const key = VEHICLE_MODEL_KEY[vehicle.type] || 'car';
      if (allowGLB && actor.userData.fallback) {
        const cachedModelPath = String(
          this.models?.cache?.get(key)?.userData?.modelPath || '',
        ).toLowerCase();
        const preservePolicePickupFallback = vehicle.type === 'police' &&
          actor.userData.kanoVehicleFallback === 'policePickup' &&
          !/hilux|pickup|ram_2500/.test(cachedModelPath);
        const preserveKanoHiaceFallback = vehicle.type === 'bus' &&
          actor.userData.kanoVehicleFallback === 'hiaceBus' &&
          !/hiace|minibus|van/.test(cachedModelPath);
        const model = preservePolicePickupFallback || preserveKanoHiaceFallback
          ? null
          : this.models?.getInstance(key);
        if (model) {
          model.userData.fallback = false;
          model.userData.vehicleType = vehicle.type;
          model.position.copy(actor.position);
          model.rotation.copy(actor.rotation);
          this.world.remove(actor);
          disposeSceneTree(actor);
          this.world.add(model);
          this.trafficActors.set(vehicle.id, model);
          actor = model;
        } else if (this.mobile) {
          this.world.remove(actor);
          disposeSceneTree(actor);
          this.trafficActors.delete(vehicle.id);
          if (visible) {
            let list = fallbackByType.get(type);
            if (!list) {
              list = [];
              fallbackByType.set(type, list);
            }
            list.push(vehicle);
          }
          continue;
        }
      }

      actor.visible = visible;
      actor.position.set(
        (vehicle.lane - 1) * 3 + (Number(vehicle.visualOffsetX) || 0),
        0,
        -Math.max(-0.05, Number(vehicle.depth) || 0) * 88,
      );
      actor.rotation.y = vehicle.direction === -1 ? Math.PI : 0;
      if (vehicle.type === 'motorcycle') this.ensureAchabaRiders(actor);
    }

    if (this.mobile) {
      // One instanced draw per fallback type. Batches remain allocated for
      // reuse, but their count drops to zero when that type leaves the view.
      const typeKeys = this._mobileTrafficTypeScratch;
      typeKeys.clear();
      for (const type of this._mobileTrafficBatches.keys()) typeKeys.add(type);
      for (const type of fallbackByType.keys()) typeKeys.add(type);
      for (const type of typeKeys) {
        const vehicles = fallbackByType.get(type) || [];
        const existing = this._mobileTrafficBatches.get(type);
        if (!vehicles.length) {
          if (existing) existing.mesh.count = 0;
          continue;
        }

        const batch = this.getMobileTrafficBatch(type, vehicles.length);
        batch.mesh.count = vehicles.length;
        const transform = this._mobileTrafficInstanceTransform;
        for (let index = 0; index < vehicles.length; index += 1) {
          const vehicle = vehicles[index];
          transform.position.set(
            (vehicle.lane - 1) * 3 + (Number(vehicle.visualOffsetX) || 0),
            0,
            -Math.max(-0.05, Number(vehicle.depth) || 0) * 88,
          );
          transform.rotation.set(0, vehicle.direction === -1 ? Math.PI : 0, 0);
          transform.scale.set(1, 1, 1);
          transform.updateMatrix();
          batch.mesh.setMatrixAt(index, transform.matrix);
        }
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    for (const [id, actor] of this.trafficActors) {
      if (activeIds.has(id)) continue;
      this.world.remove(actor);
      disposeSceneTree(actor);
      this.trafficActors.delete(id);
    }
  }

  // ==========================================================
  // PLAYER DRIVER ANIMATION
  //
  // Supports both:
  // 1. The procedural driver used by makeKeke().
  // 2. The seated driver rig supplied by ModelManager.js.
  // ==========================================================

  animateFallbackDriver(state, dt) {
    const parts =
      this.player?.userData?.driverAnimationParts;

    if (!parts?.driverPivot) return;

    const elapsed = THREE.MathUtils.clamp(
      Number(dt) || 0,
      0,
      0.05,
    );

    const steer = THREE.MathUtils.clamp(
      Number(state?.steer) || 0,
      -1,
      1,
    );

    const signedSpeed = Number.isFinite(state?.signedSpeed)
      ? state.signedSpeed
      : state?.reverse
        ? -Math.abs(Number(state?.speed) || 0)
        : Math.abs(Number(state?.speed) || 0);

    const speed = Math.abs(signedSpeed);

    const reversing =
      Boolean(state?.reverse) ||
      signedSpeed < -0.05;

    this.driverAnimationTime += elapsed * (
      1.2 + Math.min(speed / 35, 1.8)
    );

    const time = this.driverAnimationTime;

    const movement = Math.sin(time);

    const bodyLean = -steer * 0.13;

    const vibration = movement * Math.min(
      speed / 180,
      0.025,
    );

    // Move the entire seated driver's upper body slightly with the keke.
    parts.driverPivot.rotation.z =
      bodyLean + vibration;

    parts.driverPivot.rotation.x =
      Math.sin(time * 0.5) * 0.018 +
      (reversing ? 0.025 : -0.008);

    // Look back a little when reversing.
    const head = parts.driverPivot.getObjectByName?.(
      'KANO_KEKE_DRIVER_HEAD',
    );

    if (head) {
      const targetHeadY = reversing ? 0.48 : 0;

      head.rotation.y +=
        (targetHeadY - head.rotation.y) *
        Math.min(1, elapsed * 5);

      head.rotation.x =
        Math.sin(time * 0.7) * 0.012;
    }

    // Move the arms in response to steering.
    const driverArms = parts.arms || [];
    for (let index = 0; index < driverArms.length; index += 1) {
      const arm = driverArms[index];
      if (!arm?.shoulder || !arm?.forearm) continue;

      const side = index === 0 ? -1 : 1;

      arm.shoulder.rotation.z =
        side * -0.08 - steer * 0.12;

      arm.shoulder.rotation.x =
        -0.16 + Math.sin(time * 0.7) * 0.025;

      arm.forearm.rotation.z =
        side * 0.08 + steer * 0.09;
    }

    // Signed speed reverses the fallback wheel rotation.
    for (const wheel of parts.wheels || []) {
      wheel.rotation.x += signedSpeed * elapsed * 0.08;
    }
  }

  // ==========================================================
  // MOBILE FOG-HORIZON CULLING
  // ==========================================================

  /**
   * Hide roadside decoration already blended almost completely into fog.
   * This only affects rendering; actors continue moving and game.js keeps
   * owning traffic, passenger, collision and mission simulation. Visibility
   * is recalculated during each road frame so recycled actors reappear.
   */
  updateMobileDistanceCulling() {
    if (!this.mobile || !this.camera || !this.scene?.fog) return;

    const now = globalThis.performance?.now?.() ?? Date.now();
    if (now < this._nextMobileDistanceCullAt) return;
    // Ten passes per second are sufficient for scenery visibility; movement,
    // physics, collisions and the actual render loop continue at their normal
    // cadence. This avoids scanning every scenery collection on every frame.
    this._nextMobileDistanceCullAt = now + 100;

    const cameraZ = Number(this.camera.position.z) || 0;
    const fogFar = Math.max(65, Number(this.scene.fog.far) || 105);
    // At this point the fog has concealed most detail. Cutting hidden objects
    // here avoids drawing far scenery without shortening the visible road.
    const horizon = Math.min(100, fogFar * 0.90);
    const pedestrianHorizon = horizon * 0.76;

    for (const slot of this.buildingSlots) {
      updateMobileActorDistanceVisibility(slot.actor, horizon, cameraZ);
    }
    for (const pedestrian of this.pedestrians) {
      updateMobileActorDistanceVisibility(pedestrian.actor, pedestrianHorizon, cameraZ);
    }
    for (const pole of this.streetLights) {
      updateMobileActorDistanceVisibility(pole, horizon, cameraZ);
    }
    for (const slot of this.roadProps) {
      updateMobileActorDistanceVisibility(slot.actor, horizon, cameraZ);
    }
    // Flyovers are distinctive landmarks; retain them slightly farther than
    // other scenery, but never beyond the actual mobile fog horizon.
    for (const flyover of this.flyovers) {
      updateMobileActorDistanceVisibility(flyover, Math.min(110, fogFar), cameraZ);
    }
  }

  // ==========================================================
  // PLAYER KEKE RUNTIME VISIBILITY GUARD
  // ==========================================================

  /** Update the opt-in, low-frequency report without traversing the model tree. */
  updatePlayerKekeDiagnostics(force = false) {
    if (!this._kekeRuntimeDiagnostics?.enabled) return;

    const player = this.player;
    const health = player?.userData?.kanoRuntimeKekeHealth || {};
    const renderability = health.renderability || {};
    const structural = health.structural || {};
    const position = player?.position || null;
    const scale = player?.scale || null;
    let worldPosition = null;
    try {
      if (player?.getWorldPosition) {
        worldPosition = player.getWorldPosition(new THREE.Vector3());
      }
    } catch {
      worldPosition = null;
    }

    const parent = player?.parent || null;
    const parentName = parent === this.scene
      ? 'scene'
      : parent === this.garageGroup
        ? 'garageGroup'
        : (parent?.name || (parent ? parent.type || 'unnamed-parent' : 'detached'));
    const diagnosticsNow = globalThis.performance?.now?.() ?? Date.now();
    if (force || !this._cachedKekeCameraDiagnostics || diagnosticsNow >= this._nextKekeCameraDiagnosticsAt) {
      this._nextKekeCameraDiagnosticsAt = diagnosticsNow + 900;
      this._cachedKekeCameraDiagnostics = measureKekeCameraDiagnostics(player, this.camera, THREE);
      this._cachedKekeRenderStateDiagnostics = inspectKekeRenderState(player, this.camera, { sampleLimit: 8 });
    }

    const canvas = this.canvas;
    const cssWidth = Number(canvas?.clientWidth) || 0;
    const cssHeight = Number(canvas?.clientHeight) || 0;
    let pixelRatio = 1;
    try { pixelRatio = this.renderer?.getPixelRatio?.() || 1; } catch { /* diagnostics only */ }

    this._kekeRuntimeDiagnostics.update({
      scene: this.lifeScene,
      renderer: {
        mobile: this.mobile,
        tier: this.mobileTier,
        canvasSize: `${Number(canvas?.width) || 0}x${Number(canvas?.height) || 0} (${cssWidth}x${cssHeight} CSS)`,
        pixelRatio,
      },
      player: {
        name: player?.name || '(unnamed)',
        model: player?.userData?.modelPath || player?.userData?.modelKey || player?.name || 'procedural-keke',
        fallback: Boolean(player?.userData?.fallback || player?.userData?.kanoRuntimeRecoveredFallback),
        visible: player?.visible !== false,
        visiblePath: player ? this.isPlayerKekeVisibleThroughAncestors(player) : false,
        parent: parentName,
        position,
        worldPosition,
        scale,
      },
      health,
      renderability,
      structural,
      camera: this._cachedKekeCameraDiagnostics,
      renderState: this._cachedKekeRenderStateDiagnostics,
      recoveryCount: this._playerKekeRuntimeRecoveryCount,
      lastEvent: this._lastKekeRuntimeDiagnostic,
    }, force);
  }

  /** Root visibility is allowed to change during cache promotion; ancestors are not. */
  isPlayerKekeVisibleThroughAncestors(player) {
    let node = player;
    while (node) {
      if (node !== player && node.visible === false) return false;
      if (node === this.scene) return player.visible !== false;
      node = node.parent;
    }
    return false;
  }

  /**
   * Recover from runtime cases that pass asset loading but leave the active
   * player vehicle with no drawable mesh or an invalid vehicle structure.
   * Checks are throttled because traversing a GLB hierarchy every frame is
   * unnecessary. Cached GLB resources are detached, not disposed, because
   * ModelManager may share their geometry and materials with other actors.
   */
  ensurePlayerKekeRuntimeVisibility(now = Date.now()) {
    if (!this.ready || this.disposed || !this.player?.isObject3D) {
      return { ok: false, reason: 'renderer-or-player-unavailable' };
    }
    this.updatePlayerKekeDiagnostics();
    if (this.lifeScene !== 'road' && this.lifeScene !== 'garage') {
      return { ok: true, skipped: true, reason: 'player-hidden-by-life-scene-design' };
    }
    if (now < this._nextPlayerKekeRuntimeCheckAt) {
      return { ok: true, throttled: true, reason: 'check-throttled' };
    }
    this._nextPlayerKekeRuntimeCheckAt = now + (this.mobile ? 1100 : 1700);

    const activePlayer = this.player;
    const targetParent = this.lifeScene === 'garage'
      ? this.ensureGarageScene()
      : this.scene;
    const recoveryParent = targetParent || this.scene;

    // Capture the pose BEFORE any corrective reparenting. Reparenting without
    // converting local coordinates can move an otherwise-valid vehicle, and a
    // later fallback must appear where the failed vehicle had been.
    const recoveryPose = capturePlayerKekeRecoveryPose(
      activePlayer,
      recoveryParent,
      THREE,
    );

    // The root itself is sometimes hidden while a cached model is waiting for
    // promotion. In road/garage scenes it must be active. If a child or parent
    // mesh remains hidden, the renderability scan below will detect the gap.
    if (activePlayer.visible === false) activePlayer.visible = true;
    if (recoveryParent && activePlayer.parent !== recoveryParent) {
      activePlayer.parent?.remove(activePlayer);
      recoveryParent.add(activePlayer);
      if (recoveryPose) {
        activePlayer.position.copy(recoveryPose.position);
        activePlayer.quaternion.copy(recoveryPose.quaternion);
        activePlayer.scale.copy(recoveryPose.scale);
      }
    }
    if (this.lifeScene === 'garage' && this.garageGroup) {
      this.garageGroup.visible = true;
    }

    let renderability = inspectPlayerKekeRenderability(activePlayer);
    let structural = { ok: true, reason: 'procedural-fallback' };
    if (activePlayer.userData?.fallback !== true) {
      try {
        structural = this.validateKekeModelCandidate(activePlayer);
      } catch (error) {
        structural = { ok: false, reason: 'runtime-validation-threw', error: String(error) };
      }
    }

    if (renderability.ok && structural.ok) {
      activePlayer.userData.kanoRuntimeKekeHealth = {
        ok: true,
        checkedAt: now,
        renderability,
        structural,
      };
      this._lastKekeRuntimeDiagnostic = {
        phase: 'runtime-validation',
        reason: 'player-keke-healthy',
        at: new Date(now).toISOString(),
      };
      this.updatePlayerKekeDiagnostics(true);
      return { ok: true, renderability, structural };
    }

    const reason = !renderability.ok
      ? renderability.reason
      : (structural.reason || 'vehicle-structure-invalid');
    const failedModelName = activePlayer.userData?.modelPath || activePlayer.userData?.modelKey || activePlayer.name || 'active-player-keke';
    activePlayer.userData.kanoRuntimeKekeHealth = {
      ok: false,
      checkedAt: now,
      reason,
      renderability,
      structural,
    };

    // Do not dispose the rejected subtree: its GLB resources may be shared by
    // the model cache. It is removed from the active scene and retained only as
    // a detached object so its shared buffers remain valid for other instances.
    activePlayer.visible = false;
    activePlayer.userData.kanoRuntimeKekeRejected = {
      reason,
      checkedAt: now,
      model: failedModelName,
    };
    activePlayer.parent?.remove(activePlayer);

    const fallback = this.makeKeke();
    fallback.visible = true;
    // The procedural model has its own known dimensions, so do not inherit an
    // imported GLB's potentially extreme normalization scale. Preserve its
    // location and orientation, however, so a recovery does not teleport the
    // player away from their current lane or garage parking position.
    fallback.scale.set(1, 1, 1);
    if (recoveryPose) {
      fallback.position.copy(recoveryPose.position);
      fallback.quaternion.copy(recoveryPose.quaternion);
    } else if (this.lifeScene === 'garage') {
      fallback.position.set(0.7, 0, 1.45);
      fallback.rotation.set(0, Math.PI, 0);
    } else {
      fallback.position.set(0, 0, 2);
      fallback.rotation.set(0, this.driveFacingY, 0);
    }
    fallback.userData.kanoRuntimeRecoveryPoseSource = recoveryPose?.source || 'safe-default';
    fallback.userData.kanoRuntimeRecoveredFallback = true;
    fallback.userData.kanoRuntimeKekeHealth = {
      ok: true,
      checkedAt: now,
      reason: 'procedural-keke-restored-after-runtime-validation-failure',
      rejectedModel: failedModelName,
    };

    recoveryParent.add(fallback);
    this.player = fallback;
    this.lastPaint = null;
    this.applyPlayerPaint(this.currentPaint || '#f5c542');
    this._playerKekeRuntimeRecoveryCount += 1;
    this._lastKekeRuntimeDiagnostic = {
      phase: 'runtime-recovery',
      reason,
      rejectedModel: failedModelName,
      at: new Date(now).toISOString(),
    };
    this.updatePlayerKekeDiagnostics(true);

    console.warn(
      `[Kano Life] Restored procedural player keke after runtime visibility check (${reason}).`,
      { model: failedModelName, renderability, structural },
    );

    return {
      ok: true,
      recovered: true,
      reason,
      rejectedModel: failedModelName,
      renderability,
      structural,
    };
  }

  // ==========================================================
  // MAIN RENDER
  // ==========================================================

  draw(state, deltaSeconds) {
    if (!this.ready || this.disposed) return;

    this.ensurePlayerKekeRuntimeVisibility();

    const dt = THREE.MathUtils.clamp(
      Number(deltaSeconds) || 0,
      0,
      0.05,
    );

    if (this.lifeScene === 'garage') {
      this.ensureGarageScene();
      this.upgradeGarageAssets();
      this.upgradeGarageVehicles();
      this.applyPlayerPaint(state.paint);

      this.camera.position.set(5.1, 3.35, 8.6);
      this.camera.lookAt(0, 1.0, -0.4);

      this.renderer.render(this.scene, this.camera);

      return;
    }

    if (this.lifeScene !== 'road') {
      if (
        this.lifeScene !== 'garage' &&
        !this.lifeSceneGroups.has(this.lifeScene)
      ) {
        this.buildLifeDioramas(this.lifeScene);
      }
      mountActiveLifeDiorama(
        this.lifeDioramaRoot,
        this.lifeSceneGroups,
        this.lifeScene,
      );
      this.upgradeLifeSceneAssets();

      this.camera.position.set(0, 4.15, 14.2);
      this.camera.lookAt(0, 1.35, -0.4);

      this.renderer.render(this.scene, this.camera);

      return;
    }

    mountActiveLifeDiorama(
      this.lifeDioramaRoot,
      this.lifeSceneGroups,
      null,
    );
    this.world.visible = true;
    if (this.garageGroup) this.garageGroup.visible = false;

    this.syncZones(state);
    this.syncTraffic(state);
    this.upgradeWorldAssets();
    this.upgradePedestrians();

    const signedSpeed = Number.isFinite(state?.signedSpeed)
      ? state.signedSpeed
      : state?.reverse
        ? -Math.abs(Number(state?.speed) || 0)
        : Math.abs(Number(state?.speed) || 0);

    const reversing =
      Boolean(state?.reverse) ||
      signedSpeed < -0.05;

    const scroll = signedSpeed * dt * 0.28;
    this.updateKanoRoadsideSet(scroll);

    // --------------------------------------------------------
    // ENVIRONMENT
    // --------------------------------------------------------

    // Night stays readable on a phone in daylight; harmattan is a pale, dusty haze.
    const sky = state.night
      ? 0x37465a
      : state.environment === 'harmattan'
        ? 0xbdb9aa
        : 0x8ccde5;

    this.scene.background.set(sky);

    this.scene.fog.color.set(
      state.night
        ? 0x47566a
        : state.environment === 'harmattan'
          ? 0xbdb9aa
          : 0x8ccde5,
    );

    this.scene.fog.near = this.mobile
      ? (state.environment === 'harmattan' ? 14 : 24)
      : (state.environment === 'harmattan' ? 18 : 48);

    this.scene.fog.far = this.mobile
      ? (state.environment === 'harmattan' ? 70 : 105)
      : (state.environment === 'harmattan' ? 100 : 195);

    // --------------------------------------------------------
    // PLAYER POSITION AND STEERING
    // --------------------------------------------------------

    // Keep the keke body safely inside the painted kerbs. The earlier ±4.5
    // visual range let half the vehicle leave the road and clip on narrow phones.
    const laneX = Math.max(
      -3.45,
      Math.min(
        3.45,
        (state.steer || 0) * 3 +
          (state.pullOverSide || 0) * 2.35,
      ),
    );

    this.player.position.x +=
      (laneX - this.player.position.x) *
      Math.min(1, dt * 5.8);

    // Steering rotates the vehicle slightly, not 180 degrees.
    // Reverse gear moves it backwards without making it face forward.
    this.player.rotation.z =
      -(state.steer || 0) * 0.075;

    this.player.rotation.y = this.driveFacingY;

    this.player.position.y =
      Math.sin((state.distance || 0) * 2.2) * 0.025;

    this.animateFallbackDriver(state, dt);
    this.applyPlayerPaint(state.paint);

    // --------------------------------------------------------
    // FLYOVERS
    // --------------------------------------------------------

    for (const flyover of this.flyovers) {
      flyover.position.z += scroll * 0.72;

      if (flyover.position.z > 22) {
        flyover.position.z -= this.flyoverLoopDistance;
      } else if (
        flyover.position.z < -this.flyoverLoopDistance
      ) {
        flyover.position.z += this.flyoverLoopDistance;
      }
    }

    // --------------------------------------------------------
    // BUILDINGS
    // Buildings now move in both directions with the world.
    // --------------------------------------------------------

    for (const slot of this.buildingSlots) {
      slot.actor.position.z += scroll;

      if (slot.actor.position.z > 12) {
        slot.actor.position.z -= this.buildingLoopDistance;
      } else if (
        slot.actor.position.z < -this.buildingLoopDistance
      ) {
        slot.actor.position.z += this.buildingLoopDistance;
      }
    }

    // --------------------------------------------------------
    // PEDESTRIANS
    // --------------------------------------------------------

    for (const pedestrian of this.pedestrians) {
      pedestrian.actor.position.z += scroll * 0.72;

      if (pedestrian.actor.position.z > 6) {
        pedestrian.actor.position.z -= this.pedestrianLoopDistance;
      } else if (
        pedestrian.actor.position.z < -this.pedestrianLoopDistance
      ) {
        pedestrian.actor.position.z += this.pedestrianLoopDistance;
      }

      const animateArms =
        !this.mobile ||
        Math.abs(pedestrian.actor.position.z - this.camera.position.z) <= 48;
      if (animateArms && !pedestrian.usingModel && pedestrian.arms) {
        const phase =
          this.driverAnimationTime + pedestrian.phase;

        const arms = pedestrian.arms;
        for (let index = 0; index < arms.length; index += 1) {
          arms[index].rotation.z =
            Math.sin(phase + index * Math.PI) * 0.12;
        }
      }
    }

    // --------------------------------------------------------
    // STREET LIGHTS
    // --------------------------------------------------------

    for (const pole of this.streetLights) {
      pole.position.z += scroll;

      if (pole.position.z > 9) {
        pole.position.z -= 245;
      } else if (pole.position.z < -245) {
        pole.position.z += 245;
      }
    }

    // --------------------------------------------------------
    // ROAD PROPS
    // --------------------------------------------------------

    for (const slot of this.roadProps) {
      slot.actor.position.z += scroll * 0.88;

      if (slot.actor.position.z > 9) {
        slot.actor.position.z -= 245;
      } else if (slot.actor.position.z < -245) {
        slot.actor.position.z += 245;
      }
    }

    // --------------------------------------------------------
    // LANE MARKINGS
    // --------------------------------------------------------

    if (this.curbInstanced) {
      advanceInstancedRoadPattern({
        mesh: this.curbInstanced,
        records: this.curbRecords,
        scroll,
        scratch: this.curbObject,
        y: 0.08,
        rotationX: 0,
      });
    }

    if (this.laneDashInstanced) {
      advanceInstancedRoadPattern({
        mesh: this.laneDashInstanced,
        records: this.laneDashRecords,
        scroll,
        scratch: this.laneDashObject,
        y: 0.028,
        rotationX: -Math.PI / 2,
      });
    } else {
      for (const dash of this.laneDashes) {
        dash.position.z += scroll;
        if (dash.position.z > 8) dash.position.z -= 250;
        else if (dash.position.z < -250) dash.position.z += 250;
      }
    }

    // --------------------------------------------------------
    // CAMERA
    // --------------------------------------------------------

    const driverView = state.camera === 'driver';
    const cameraFollow = driverView ? 0.72 : 0.92;
    // Keep enough lateral framing margin that the keke remains visible during
    // hard steering. The previous 0.72 driver-view follow left the vehicle too
    // far from centre when combined with the narrow phone viewport.
    const lateralCameraTracking = driverView ? 0.94 : 0.98;
    const targetX = this.player.position.x * Math.max(cameraFollow, lateralCameraTracking);

    this.camera.position.x += (
      targetX - this.camera.position.x
    ) * Math.min(1, dt * 6.0);

    // Raise and pull the driver camera behind the keke canopy. The old low,
    // close position looked through the bodywork and could fill the viewport.
    this.camera.position.y = driverView ? 2.9 : 3.35;
    this.camera.position.z = driverView ? 7.2 : 8.6;

    const shake = Math.max(
      0,
      Number(state.crashShake) || 0,
    );

    this.camera.position.y +=
      Math.sin((state.time || 0) * 41) * shake * 0.12;

    // When reversing, show the road behind the keke.
    const cameraTargetZ = reversing
      ? driverView
        ? 10.5
        : 4.8
      : driverView
        ? -12
        : -1.8;

    this.camera.lookAt(
      targetX,
      driverView ? 1.6 : 0.72,
      cameraTargetZ,
    );

    this.updateMobileDistanceCulling();
    this.renderer.render(this.scene, this.camera);
  }

  // ==========================================================
  // CLEANUP
  // ==========================================================

  dispose() {
    if (!this.renderer || this.disposed) return;

    this.disposed = true;
    this.ready = false;
    this._kekeRuntimeDiagnostics?.dispose?.();
    this._kekeRuntimeDiagnostics = null;

    disposeSceneTree(this.scene, {
      disposeTextures: true,
    });

    // Traffic keke actors share these low-poly geometries between instances;
    // they are intentionally skipped by disposeSceneTree and released here.
    for (const geometry of Object.values(this._mobileTrafficKekeGeometry || {})) {
      geometry?.dispose?.();
    }
    this._mobileTrafficKekeGeometry = null;
    this._mobileTrafficBatches?.clear?.();
    this._mobileFallbackTrafficByType?.clear?.();

    for (const geometry of this._mobileTrafficVehicleGeometry?.values?.() || []) {
      geometry?.dispose?.();
    }
    this._mobileTrafficVehicleGeometry?.clear?.();

    this.models?.dispose?.();

    for (const geometry of this.achabaGeometries.values()) {
      try { geometry.dispose(); } catch { /* shared Achaba geometry cleanup */ }
    }
    this.achabaGeometries.clear();

    try {
      this.renderer.renderLists?.dispose?.();
    } catch {
      // Compatibility fallback for different Three.js versions.
    }

    this.renderer.dispose();

    try {
      this.renderer.forceContextLoss();
    } catch {
      // Some browser implementations do not expose this API.
    }

    this.scene.clear();
  }
}