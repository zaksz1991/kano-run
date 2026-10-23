/**
 * KANO LIFE — Step 102: use the bundled real keke model for the player's vehicle.
 *
 * This layer is installed before the application bootstrap. It waits for the
 * shared ModelManager keke asset, then swaps the procedural player body inside
 * the existing player root. Controls, root transforms, camera, shadow, state,
 * save data and the fallback remain intact while the GLB is loading.
 */
import { Renderer3D } from './renderer3d.js';

const PATCH_KEY = Symbol.for('kano.life.playerKekeGLB.step102');
const STATUS_KEY = Symbol.for('kano.life.playerKekeGLBStatus.step102');
const PAINT_PALETTE = Object.freeze({
  classic: 0xfbbf24,
  ruffneck: 0xeab308,
  sky: 0x38bdf8,
  forest: 0x22c55e,
  royal: 0xa855f7,
  ember: 0xef4444,
  night: 0x1e293b,
});
const NON_BODY_NAME = /glass|window|windshield|screen|tire|tyre|wheel|rubber|chrome|metal|light|lamp|headlight|tail|seat|interior|dashboard|handle|mirror|driver|rider|skin|shirt|trouser|cap|helmet|hand|arm|leg|torso|head|shoe|rubber|grip|brake/i;
const BODY_NAME = /body|bodywork|panel|shell|cabin|fairing|outer|yellow|paint|chassis|fender/i;

function getManager(renderer) {
  return renderer?.models
    || renderer?.modelManager
    || (typeof window !== 'undefined' ? window.__KANO_MODEL_MANAGER__ : null)
    || null;
}

function getStatus(renderer) {
  if (!renderer[STATUS_KEY]) {
    Object.defineProperty(renderer, STATUS_KEY, {
      value: {
        version: '102.0.0',
        status: 'waiting-for-model-manager',
        modelPath: null,
        error: null,
        mountedAt: null,
        legacyChildrenRemoved: 0,
        seatedDriverFound: false,
        lastPaint: null,
      },
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return renderer[STATUS_KEY];
}

function disposeLegacyChild(root) {
  if (!root) return;
  // The old player body is made by Renderer3D.makeKeke(); its geometry and
  // materials are locally owned. Never dispose a ModelManager instance here.
  if (root.userData?.modelManagerInstance) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse?.((node) => {
    if (node.userData?.modelManagerInstance) return;
    if (node.geometry && !geometries.has(node.geometry)) {
      geometries.add(node.geometry);
      try { node.geometry.dispose?.(); } catch (_) {}
    }
    const list = Array.isArray(node.material)
      ? node.material
      : node.material ? [node.material] : [];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      try { material.dispose?.(); } catch (_) {}
    }
  });
}

function clearLegacyPlayerMesh(renderer, playerRoot) {
  let removed = 0;
  const manager = getManager(renderer);
  for (const child of [...(playerRoot.children || [])]) {
    playerRoot.remove(child);
    if (child.userData?.modelManagerInstance) {
      manager?.releaseInstance?.(child);
    } else {
      disposeLegacyChild(child);
    }
    removed += 1;
  }
  return removed;
}

function insideSeatedDriver(instance) {
  const rig = instance?.getObjectByName?.('KANO_SEATED_DRIVER_RIG') || null;
  return Boolean(rig && rig.parent && instance.getObjectByName('KANO_DRIVER_TORSO'));
}

function updatePlayerPaint(renderer, paintId) {
  const playerRoot = renderer?.player;
  const model = playerRoot?.children?.find((child) => child.userData?.kanoStep102PlayerKekeGLB);
  if (!model) return;
  const selected = PAINT_PALETTE[paintId] ?? PAINT_PALETTE.classic;
  const targets = [];
  model.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const objectName = String(object.name || '');
    const parentNames = [];
    let parent = object.parent;
    while (parent && parent !== model) {
      parentNames.push(String(parent.name || ''));
      parent = parent.parent;
    }
    // The procedural seated driver is never paint-tinted, even if its clothing
    // happens to contain words such as "body" in a generated node name.
    if (parentNames.some((name) => /KANO_SEATED_DRIVER_RIG|KANO_DRIVER_/i.test(name))) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.color || material.map) continue;
      const label = `${objectName} ${material.name || ''}`;
      const namedBody = BODY_NAME.test(label);
      const excluded = NON_BODY_NAME.test(label);
      if (!namedBody && excluded) continue;
      if (!namedBody && Number(material.metalness || 0) > 0.42) continue;
      if (!namedBody && Number(material.roughness || 0) < 0.2) continue;
      const key = `kanoStep102OriginalPaint_${targets.length}`;
      if (!material.userData) material.userData = {};
      if (!Number.isFinite(material.userData[key])) material.userData[key] = material.color.getHex();
      material.color.setHex(selected);
      targets.push({ material, key });
    }
  });
  model.userData.kanoStep102PaintState = {
    paintId: String(paintId || 'classic'),
    targetMaterialCount: targets.length,
  };
  getStatus(renderer).lastPaint = {
    paintId: String(paintId || 'classic'),
    targetMaterialCount: targets.length,
  };
}

function mountPlayerKeke(renderer, template, manager) {
  const playerRoot = renderer?.player;
  if (!playerRoot || !template || renderer._kanoStep102MountingPlayerKeke) return false;
  const status = getStatus(renderer);
  if (playerRoot.children?.some((child) => child.userData?.kanoStep102PlayerKekeGLB)) {
    status.status = 'mounted';
    return true;
  }

  let instance = null;
  try {
    instance = manager?.getInstance?.('keke') || null;
  } catch (error) {
    status.error = String(error?.message || error).slice(0, 180);
  }
  if (!instance) {
    status.status = 'unavailable';
    return false;
  }

  renderer._kanoStep102MountingPlayerKeke = true;
  try {
    instance.name = 'KANO_PLAYER_ADAIDATA_SAHU_GLB';
    instance.userData.kanoStep102PlayerKekeGLB = true;
    instance.userData.kanoPlayerVehicleAssetPath = template.userData?.modelPath || null;
    // ModelManager normalizes the model to 1.85 m. Slightly reduce it for the
    // established chase camera while retaining realistic proportions.
    instance.scale.multiplyScalar(renderer.mobile ? 0.90 : 0.93);
    instance.position.set(0, 0, 0);
    instance.rotation.set(0, 0, 0);

    const removed = clearLegacyPlayerMesh(renderer, playerRoot);
    playerRoot.add(instance);
    const driverFound = insideSeatedDriver(instance);
    status.status = 'mounted';
    status.modelPath = template.userData?.modelPath || null;
    status.mountedAt = new Date().toISOString();
    status.legacyChildrenRemoved += removed;
    status.seatedDriverFound = driverFound;
    status.error = null;
    playerRoot.userData.kanoStep102PlayerKekeSource = status.modelPath;
    playerRoot.userData.kanoStep102DriverSeatedInside = driverFound;

    const activePaint = renderer.game?.selectedPaint || renderer.game?.paintId || 'classic';
    updatePlayerPaint(renderer, activePaint);
    return true;
  } catch (error) {
    try {
      if (instance.parent === playerRoot) playerRoot.remove(instance);
      manager?.releaseInstance?.(instance);
    } catch (_) {}
    status.status = 'error';
    status.error = String(error?.message || error).slice(0, 200);
    return false;
  } finally {
    renderer._kanoStep102MountingPlayerKeke = false;
  }
}

function requestPlayerKeke(renderer) {
  if (!renderer || renderer._kanoStep102PlayerKekeRequest) return;
  const playerRoot = renderer.player;
  if (!playerRoot) {
    getStatus(renderer).status = 'skipped-no-player-root';
    return;
  }
  renderer._kanoStep102PlayerKekeRequest = true;
  const status = getStatus(renderer);
  const manager = getManager(renderer);
  if (!manager || typeof manager.load !== 'function') {
    renderer._kanoStep102PlayerKekeRequest = false;
    status.status = 'waiting-for-model-manager';
    return;
  }
  status.status = 'loading-keke-glb';
  Promise.resolve()
    .then(() => manager.load('keke'))
    .then((template) => {
      if (!template) {
        status.status = 'unavailable-fallback-active';
        return;
      }
      mountPlayerKeke(renderer, template, manager);
    })
    .catch((error) => {
      status.status = 'error-fallback-active';
      status.error = String(error?.message || error).slice(0, 200);
    })
    .finally(() => {
      renderer._kanoStep102PlayerKekeRequest = false;
    });
}

if (typeof Renderer3D.prototype.init === 'function' && !Renderer3D.prototype[PATCH_KEY]) {
  const originalInit = Renderer3D.prototype.init;
  Object.defineProperty(Renderer3D.prototype, PATCH_KEY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Renderer3D.prototype.init = function kanoStep102Init(...args) {
    const result = originalInit.apply(this, args);
    // Step 101's initializer creates the shared ModelManager after the base
    // renderer creates the procedural fallback. This wrapper must run before
    // main.js instantiates Renderer3D, hence the bootstrap order fix in Step 102.
    requestPlayerKeke(this);
    return result;
  };

  const originalDraw = Renderer3D.prototype.draw;
  if (typeof originalDraw === 'function') {
    Renderer3D.prototype.draw = function kanoStep102Draw(state, ...args) {
      if (typeof window !== 'undefined') {
        window.__KANO_LIFE_RENDERER__ = this;
        window.__KANO_ACTIVE_RENDERER__ = this;
      }
      const status = getStatus(this);
      const manager = getManager(this);
      if (!this.player?.children?.some((child) => child.userData?.kanoStep102PlayerKekeGLB)) {
        if (manager?.cache?.get?.('keke')) mountPlayerKeke(this, manager.cache.get('keke'), manager);
        else if (!this._kanoStep102PlayerKekeRequest && status.status !== 'unavailable-fallback-active') requestPlayerKeke(this);
      }
      return originalDraw.call(this, state, ...args);
    };
  }

  const originalApplyPaint = Renderer3D.prototype.applyPaint;
  if (typeof originalApplyPaint === 'function') {
    Renderer3D.prototype.applyPaint = function kanoStep102ApplyPaint(paintId, ...args) {
      const result = originalApplyPaint.call(this, paintId, ...args);
      updatePlayerPaint(this, paintId);
      return result;
    };
  }
}

if (typeof window !== 'undefined') {
  window.kanoPlayerKekeModelAudit = () => {
    const renderer = window.__KANO_LIFE_RENDERER__
      || window.__KANO_ACTIVE_RENDERER__
      || window.renderer
      || null;
    const root = renderer?.player || null;
    const model = root?.children?.find((child) => child.userData?.kanoStep102PlayerKekeGLB) || null;
    const rig = model?.getObjectByName?.('KANO_SEATED_DRIVER_RIG') || null;
    const torso = model?.getObjectByName?.('KANO_DRIVER_TORSO') || null;
    let modelChildOfPlayer = false;
    if (model && root) {
      let current = model;
      while (current && current !== root) current = current.parent;
      modelChildOfPlayer = current === root;
    }
    const status = renderer ? getStatus(renderer) : null;
    return {
      version: '102.0.0',
      rendererFound: Boolean(renderer),
      status: status?.status || 'renderer-unavailable',
      modelMounted: Boolean(model),
      assetPath: model?.userData?.modelPath || status?.modelPath || null,
      modelChildOfPlayer,
      seatedDriverRigPresent: Boolean(rig && torso),
      driverParentIsInsideKeke: Boolean(rig && modelChildOfPlayer),
      proceduralFallbackStillVisible: Boolean(root && !model),
      legacyChildrenRemoved: status?.legacyChildrenRemoved || 0,
      appliedPaint: model?.userData?.kanoStep102PaintState || null,
      error: status?.error || null,
      note: 'The player root stays under the existing control/camera transform. The real keke GLB and its seated-driver rig are children of that root; the procedural vehicle remains until the bundled GLB finishes loading or if loading fails.',
    };
  };
}

console.info('[Kano Life] Step 102 player-keke GLB integration registered; procedural fallback is retained while the authentic keke asset loads.');
