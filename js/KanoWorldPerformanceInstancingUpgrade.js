/**
 * KANO LIFE — WORLD PERFORMANCE + BRIGHTNESS UPGRADE
 *
 * Instances the repeating lane markings and desktop procedural building windows,
 * then lightly lifts the existing Kano atmosphere lighting without replacing
 * GLBs, changing gameplay rules, or forcing 3D on unsupported hardware.
 */
import * as THREE from 'three';
// Pure-side-effect repair modules. Order matters: clarity filtering wraps model
// loading before the geometry budget wraps it, and both register before the
// renderer module executes.
import './KanoMobileWorldClarityUpgrade.js';
import './KanoMobileGeometryBudgetUpgrade.js';
import { Renderer3D } from './renderer3d.js';
import './KanoKekeGlbActivationRepair.js';
import './KanoNorthernPedestrianGaitUpgrade.js';
import './KanoFlyoverDriveabilityUpgrade.js';
import './KanoCurrentMainExperienceRepair.js';
import './KanoCompactDrivingHudUpgrade.js';
import './KanoKnownKekeModelAcceptanceRepair.js';
import './KanoFeatureActivationBridge.js';
import './KanoFareHagglingBridge.js';
import './KanoFuelQueueBridge.js';
import './KanoStreetAnimalsOfficerUpgrade.js';
import './KanoRealLandmarksUpgrade.js';
import './KanoKekeCatalogFailoverRepair.js';
import { KanoAtmosphere } from './KanoAtmosphere.js';
const PATCH = Symbol.for('kano.life.worldPerformanceInstancing.v1');
const ATMOSPHERE_PATCH = Symbol.for('kano.life.worldBrightnessProfile.v1');

const report = {
  version: 1,
  installedAt: new Date().toISOString(),
  laneMarkingsInstanced: 0,
  laneMarkingDrawCallsBefore: 0,
  laneMarkingDrawCallsAfter: 0,
  buildingWindowBatches: 0,
  buildingWindowInstances: 0,
  brightnessProfile: 'waiting-for-atmosphere',
  renderer: null,
  errors: [],
};
function publishReport() {
  if (typeof window === 'undefined') return;
  window.__KANO_WORLD_PERFORMANCE_REPORT__ = report;
  window.kanoWorldPerformanceAudit = () => ({ ...report });
}

function disposeMaterial(material) {
  for (const item of Array.isArray(material) ? material : material ? [material] : []) {
    try {
      item?.dispose?.();
    } catch {
      // Keep world setup usable if an optional resource has already been released.
    }
  }
}
function makeInstancedWindows(renderer, group, width, height) {
  if (renderer.mobile || !group?.isObject3D) return;

  const columns = Math.max(1, Math.floor(width / 0.8));
  const rows = Math.max(1, Math.floor(height / 1.2));
  const count = columns * rows;
  if (!count) return;
  // One draw call per building replaces the old one-mesh-per-window approach.
  // Each building owns its geometry/material so replacing a procedural building
  // later cannot dispose resources still used by another building.
  const geometry = new THREE.PlaneGeometry(0.24, 0.32);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6b98aa,
    roughness: 0.68,
    metalness: 0.02,
    side: THREE.DoubleSide,
    emissive: 0x10232a,
    emissiveIntensity: 0.18,
  });
  const windows = new THREE.InstancedMesh(geometry, material, count);
  windows.name = 'KANO_INSTANCED_BUILDING_WINDOWS';
  windows.userData.kanoInstancedWindows = true;
  windows.castShadow = false;
  windows.receiveShadow = false;
  const dummy = new THREE.Object3D();
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      dummy.position.set(
        -width * 0.35 + col * 0.65,
        0.6 + row * 0.9,
        1.51,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      windows.setMatrixAt(index, dummy.matrix);
      index += 1;
    }
  }
  windows.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  windows.instanceMatrix.needsUpdate = true;
  windows.computeBoundingSphere();
  group.add(windows);
  report.buildingWindowBatches += 1;
  report.buildingWindowInstances += count;
}

function installWindowInstancing() {
  const prototype = Renderer3D?.prototype;
  if (!prototype || prototype[PATCH]) return;
  // Keep a stable reference for clean-up, diagnostics and renderer recovery.
  const originalAddWindows = prototype.addWindows;
  if (typeof originalAddWindows === 'function') {
    prototype.addWindows = function addInstancedBuildingWindows(group, width, height, ...args) {
      if (this.mobile) return;
      try {
        makeInstancedWindows(this, group, Number(width) || 0, Number(height) || 0);
      } catch (error) {
        report.errors.push(`window-instancing: ${String(error?.message || error)}`);
        // Fall back to the existing implementation if instancing fails.
        return originalAddWindows.call(this, group, width, height, ...args);
      }
    };
  }
  Object.defineProperty(prototype, PATCH, { value: true, configurable: false });
}

function installLaneMarkingInstancing(renderer) {
  if (!renderer || renderer.__kanoLaneMarkingInstancing) return;
  const source = Array.isArray(renderer.laneDashes)
    ? renderer.laneDashes.filter((dash) => dash?.position && dash?.geometry)
    : [];
  if (source.length < 8 || !renderer.world?.isObject3D) return;
  const geometry = new THREE.PlaneGeometry(0.095, 3.4);
  const material = new THREE.MeshBasicMaterial({
    color: 0xf3ead2,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, source.length);
  mesh.name = 'KANO_INSTANCED_LANE_MARKINGS';
  mesh.userData.kanoInstancedLaneMarkings = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const entries = source.map((dash, index) => ({
    index,
    x: Number(dash.position.x) || 0,
    y: Number(dash.position.y) || 0.028,
    z: Number(dash.position.z) || 0,
  }));
  const writeMatrix = (entry) => {
    dummy.position.set(entry.x, entry.y, entry.z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(entry.index, dummy.matrix);
  };
  for (const entry of entries) writeMatrix(entry);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  renderer.world.add(mesh);
  // The existing draw loop expects one mutable position per dash. Lightweight
  // logical records preserve that behaviour; the GPU receives a single batched
  // instance matrix update immediately before each WebGL render call.
  renderer.laneDashes = entries.map((entry) => {
    const position = {};
    for (const axis of ['x', 'y', 'z']) {
      Object.defineProperty(position, axis, {
        enumerable: true,
        configurable: false,
        get: () => entry[axis],
        set: (value) => {
          const number = Number(value);
          if (Number.isFinite(number)) entry[axis] = number;
        },
      });
    }
    position.set = (x, y, z) => {
      if (Number.isFinite(Number(x))) entry.x = Number(x);
      if (Number.isFinite(Number(y))) entry.y = Number(y);
      if (Number.isFinite(Number(z))) entry.z = Number(z);
    };
    return {
      position,
      userData: { kanoInstancedLaneDash: true, instanceIndex: entry.index },
    };
  });
  for (const dash of source) {
    dash.parent?.remove(dash);
    try { dash.geometry.dispose?.(); } catch {}
    disposeMaterial(dash.material);
  }
  const webgl = renderer.renderer;
  if (webgl?.render && !renderer.__kanoLaneRenderSync) {
    const originalRender = webgl.render;
    const renderWrapper = function renderWithInstancedLaneMarkings(scene, camera, ...args) {
      for (const entry of entries) writeMatrix(entry);
      mesh.instanceMatrix.needsUpdate = true;
      return originalRender.call(this, scene, camera, ...args);
    };
    webgl.render = renderWrapper;
    renderer.__kanoLaneRenderSync = { webgl, originalRender, renderWrapper, mesh };
  }
  renderer.__kanoLaneMarkingInstancing = { mesh, entries };
  report.laneMarkingsInstanced += source.length;
  report.laneMarkingDrawCallsBefore += source.length;
  report.laneMarkingDrawCallsAfter = 1;
  publishReport();
}

function installWorldBrightness() {
  const prototype = KanoAtmosphere?.prototype;
  if (!prototype || prototype[ATMOSPHERE_PATCH] || typeof prototype.applyProfile !== 'function') return;
  const originalApplyProfile = prototype.applyProfile;
  prototype.applyProfile = function applyBrighterKanoProfile(state = {}) {
    const result = originalApplyProfile.call(this, state);
    const profileKey = String(this.lastProfileKey || '');
    if (!profileKey || this.__kanoWorldBrightnessKey === profileKey) return result;
    const profile = this.profileFor?.(state);
    if (!profile || !this.renderer3d?.scene) return result;
    this.__kanoWorldBrightnessKey = profileKey;
    const night = profile.time === 'night';
    const scene = this.renderer3d.scene;
    // Use profile-derived base values on every change. Avoid cumulative colour
    // or intensity multipliers as the game clock advances.
    if (scene.background?.isColor && profile.backgroundColor) {
      const lift = new THREE.Color(night ? 0x30445d : 0xc6e9f5);
      scene.background.copy(profile.backgroundColor).lerp(lift, night ? 0.12 : 0.16);
    }
    if (scene.fog?.color?.isColor && profile.fogColor) {
      const fogLift = new THREE.Color(night ? 0x34465a : 0xcce8ef);
      scene.fog.color.copy(profile.fogColor).lerp(fogLift, night ? 0.10 : 0.13);
    }
    for (const item of this.original?.lights || []) {
      const light = item.light;
      if (!light || light.parent === null) continue;
      if (light.isHemisphereLight) {
        light.intensity = item.intensity * profile.hemi * (night ? 1.04 : 1.12);
      } else if (light.isDirectionalLight) {
        light.intensity = item.intensity * profile.directional * (night ? 1.04 : 1.10);
      }
    }
    const webgl = this.renderer3d.renderer;
    if (webgl && 'toneMappingExposure' in webgl) {
      webgl.toneMappingExposure = night ? 1.07 : 1.14;
    }
    report.brightnessProfile = night ? 'night-visible-lift' : 'daylight-lift';
    publishReport();
    return result;
  };
  Object.defineProperty(prototype, ATMOSPHERE_PATCH, { value: true, configurable: false });
}
function installRendererHooks() {
  const prototype = Renderer3D?.prototype;
  if (!prototype || prototype.__kanoWorldPerfHooks) return;
  const originalBuildWorld = prototype.buildWorld;
  if (typeof originalBuildWorld === 'function') {
    prototype.buildWorld = function buildWorldWithInstancing(...args) {
      const result = originalBuildWorld.apply(this, args);
      try {
        installLaneMarkingInstancing(this);
        if (typeof window !== 'undefined') window.__KANO_WORLD_PERF_RENDERER__ = this;
        // These are the existing ambient/sun lights. Atmosphere captures their
        // boosted baseline later and continues to control its day/night profiles.
        this.scene?.traverse?.((object) => {
          if (object?.isHemisphereLight) object.intensity = Math.max(object.intensity, 2.02);
          if (object?.isDirectionalLight) object.intensity = Math.max(object.intensity, 1.92);
        });
        this.renderer.toneMappingExposure = Math.max(1.08, Number(this.renderer.toneMappingExposure) || 1);
        report.renderer = this.mobile ? 'mobile' : 'desktop';
        publishReport();
      } catch (error) {
        report.errors.push(`world-instancing: ${String(error?.message || error)}`);
      }
      return result;
    };
  }
  const originalDispose = prototype.dispose;
  if (typeof originalDispose === 'function') {
    prototype.dispose = function disposeWorldPerformanceUpgrade(...args) {
      const record = this.__kanoLaneRenderSync;
      if (record?.webgl?.render === record.renderWrapper) {
        record.webgl.render = record.originalRender;
      }
      this.__kanoLaneRenderSync = null;
      this.__kanoLaneMarkingInstancing = null;
      if (typeof window !== 'undefined' && window.__KANO_WORLD_PERF_RENDERER__ === this) {
        window.__KANO_WORLD_PERF_RENDERER__ = null;
      }
      return originalDispose.apply(this, args);
    };
  }
  Object.defineProperty(prototype, '__kanoWorldPerfHooks', { value: true, configurable: false });
}

function installOptionalAuditPanel() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('worldPerfAudit') !== '1' && params.get('debugPerf') !== '1') return;
  if (document.getElementById('kano-world-perf-upgrade-panel')) return;
  const panel = document.createElement('aside');
  panel.id = 'kano-world-perf-upgrade-panel';
  panel.style.cssText = 'position:fixed;z-index:2147483001;left:8px;bottom:8px;max-width:min(94vw,390px);max-height:32vh;overflow:auto;padding:9px 11px;border:1px solid #35c7e4;border-radius:8px;background:#071725ed;color:#eef8ff;font:11px/1.4 ui-monospace,Consolas,monospace;pointer-events:auto;';
  const heading = document.createElement('strong');
  heading.textContent = 'KANO WORLD · PERFORMANCE UPGRADE';
  heading.style.cssText = 'display:block;color:#fbbf24;margin-bottom:5px;';
  const output = document.createElement('pre');
  output.style.cssText = 'white-space:pre-wrap;margin:0 0 7px;';
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = 'EXPORT JSON';
  exportButton.style.cssText = 'padding:5px 8px;border:0;border-radius:5px;background:#00b4d8;color:#04111e;font-weight:800;';
  exportButton.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ ...report }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kano-world-performance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.textContent = 'HIDE';
  hide.style.cssText = 'padding:5px 8px;border:1px solid #617b8d;border-radius:5px;background:#142a3c;color:#fff;font-weight:700;';
  hide.addEventListener('click', () => { clearInterval(timer); panel.remove(); });
  actions.append(exportButton, hide);
  panel.append(heading, output, actions);
  document.body.append(panel);
  const refresh = () => {
    const info = window.__KANO_WORLD_PERF_RENDERER__?.renderer?.info;
    output.textContent = [
      `Platform: ${report.renderer || 'waiting for renderer'}`,
      `Instanced lane markings: ${report.laneMarkingsInstanced}`,
      `Lane marking draw calls: ${report.laneMarkingDrawCallsBefore} → ${report.laneMarkingDrawCallsAfter}`,
      `Instanced window batches: ${report.buildingWindowBatches}`,
      `Window instances: ${report.buildingWindowInstances}`,
      `Brightness: ${report.brightnessProfile}`,
      `WebGL draw calls: ${Number(info?.render?.calls) || 0}`,
      `Triangles: ${((Number(info?.render?.triangles) || 0) / 1000).toFixed(1)}k`,
      `Notes: ${report.errors.slice(-2).join(' | ') || 'none'}`,
    ].join('\n');
  };
  refresh();
  const timer = setInterval(refresh, 1000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
installWindowInstancing();
installRendererHooks();
installWorldBrightness();
publishReport();
installOptionalAuditPanel();
console.info('[Kano Life] World instancing and daylight visibility upgrade registered.');
