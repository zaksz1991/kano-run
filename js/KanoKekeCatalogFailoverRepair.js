/**
 * KANO LIFE — Catalogued Keke Model Failover Repair (Task 24)
 *
 * If the first GLB loads but fails the renderer's structural/visual checks,
 * try the next catalogued keke model instead of permanently retaining the
 * procedural yellow vehicle. The existing active player is not removed until
 * Renderer3D.applyModel accepts an alternative.
 *
 * This repair is deliberately limited to known vehicles/keke/keke-1.glb through
 * keke-8.glb and specific visual-structure rejection reasons. It does not
 * suppress HTTP/parse failures, change the player physics, alter public assets,
 * or dispose geometry that may still be shared by traffic instances.
 */
import './KanoKnownKekeModelAcceptanceRepair.js';
import { MODEL_KEYS } from './ModelManager.js';
import { Renderer3D } from './renderer3d.js';
import {
  getUntriedKekeCatalogPaths,
  normalizeCataloguedKekePath,
  shouldStartKekeCatalogFailover,
  isRetryableKekeRejection,
} from './KanoKekeCatalogFailoverRules.js';

const PATCH = Symbol.for('kano.life.kekeCatalogFailover.v1');
const BUSY = Symbol.for('kano.life.kekeCatalogFailover.busy.v1');
let catalogMutationInProgress = false;

const report = {
  version: 1,
  installed: false,
  failoverRuns: 0,
  alternativesChecked: 0,
  acceptedAlternativeCount: 0,
  exhaustedCount: 0,
  last: null,
  errors: [],
};

function compactValidation(validation) {
  return {
    ok: validation?.ok === true,
    reason: String(validation?.reason || 'unknown-rejection'),
    meshCount: Number.isFinite(Number(validation?.meshCount))
      ? Number(validation.meshCount)
      : null,
    bounds: validation?.bounds ? { ...validation.bounds } : null,
  };
}

function publishReport() {
  if (typeof window === 'undefined') return;
  window.__KANO_KEKE_CATALOG_FAILOVER__ = report;
  window.kanoKekeCatalogFailoverAudit = () => ({
    ...report,
    last: report.last ? structuredCloneSafe(report.last) : null,
    errors: [...report.errors],
  });
}

function structuredCloneSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function install() {
  const prototype = Renderer3D?.prototype;
  if (!prototype || prototype[PATCH] || typeof prototype.applyModel !== 'function') {
    return false;
  }

  const originalApplyModel = prototype.applyModel;
  Object.defineProperty(prototype, PATCH, { value: true, configurable: false });

  prototype.applyModel = async function applyKekeWithCatalogFailover(key, object, ...args) {
    if (key !== 'keke' || this[BUSY]) {
      return originalApplyModel.call(this, key, object, ...args);
    }

    const manager = this.models;
    const catalog = MODEL_KEYS?.keke;
    if (
      !this.ready ||
      this.disposed ||
      !manager ||
      typeof manager.load !== 'function' ||
      typeof manager.getInstance !== 'function' ||
      !(manager.cache instanceof Map) ||
      !Array.isArray(catalog) ||
      catalogMutationInProgress
    ) {
      return originalApplyModel.call(this, key, object, ...args);
    }

    this[BUSY] = true;
    let catalogSnapshot = null;
    let cacheBeforeFailover;
    let failoverStarted = false;
    let acceptedAlternative = false;
    const event = {
      startedAt: new Date().toISOString(),
      initialPath: normalizeCataloguedKekePath(
        object?.userData?.modelPath || object?.userData?.assetPath,
      ),
      initialValidation: null,
      attempts: [],
      acceptedPath: null,
      stoppedReason: null,
    };

    try {
      const initialResult = await originalApplyModel.call(this, key, object, ...args);
      if (initialResult) return initialResult;

      const initialValidation = object?.userData?.kanoKekeVisualValidation;
      event.initialValidation = compactValidation(initialValidation);
      const currentPaths = [...catalog];
      if (!shouldStartKekeCatalogFailover({
        key,
        ready: this.ready,
        disposed: this.disposed,
        modelPath: event.initialPath,
        validation: initialValidation,
        attemptsRemaining: currentPaths.length - 1,
      })) {
        return initialResult;
      }

      // A global catalog list backs ModelManager instances. Serialize mutation
      // while this one failover is in progress, and restore the exact original
      // order on every exit path.
      catalogMutationInProgress = true;
      failoverStarted = true;
      catalogSnapshot = currentPaths;
      cacheBeforeFailover = manager.cache.get('keke');
      report.failoverRuns += 1;
      const attempted = new Set([event.initialPath]);

      for (let attemptIndex = 0; attemptIndex < currentPaths.length - 1; attemptIndex += 1) {
        const remaining = getUntriedKekeCatalogPaths(currentPaths, attempted);
        if (!remaining.length) {
          event.stoppedReason = 'no-untried-catalogued-keke-remains';
          break;
        }

        // Restrict this load attempt to paths that have not already been
        // rejected by the renderer. ModelManager's load method reads this
        // exported catalog array directly and will naturally skip missing or
        // invalid-size assets among the remaining candidates.
        catalog.splice(0, catalog.length, ...remaining);
        manager.cache.delete('keke');
        manager.failed?.delete?.('keke');

        let loadedSource = null;
        try {
          loadedSource = await manager.load('keke');
        } catch (error) {
          report.errors.push(`load-alternative: ${String(error?.message || error)}`);
          event.stoppedReason = 'model-manager-load-threw';
          break;
        }

        if (!loadedSource) {
          event.stoppedReason = 'no-untried-glb-loaded';
          break;
        }

        const candidatePath = normalizeCataloguedKekePath(loadedSource.userData?.modelPath);
        if (!candidatePath || attempted.has(candidatePath)) {
          event.stoppedReason = candidatePath
            ? 'model-manager-returned-an-already-tried-path'
            : 'loaded-model-path-not-in-keke-catalog';
          break;
        }
        // load() may have passed over missing, unparsable, or bad-dimension
        // candidates before returning this asset. Mark those earlier entries as
        // unavailable in this run so another iteration does not refetch them.
        const selectedIndex = remaining.findIndex(
          (path) => normalizeCataloguedKekePath(path) === candidatePath,
        );
        for (const skippedPath of remaining.slice(0, Math.max(0, selectedIndex))) {
          const normalizedSkippedPath = normalizeCataloguedKekePath(skippedPath);
          if (!normalizedSkippedPath || attempted.has(normalizedSkippedPath)) continue;
          attempted.add(normalizedSkippedPath);
          event.attempts.push({
            path: normalizedSkippedPath,
            accepted: false,
            reason: 'model-manager-skipped-unusable-asset',
          });
        }

        const candidate = manager.getInstance('keke');
        if (!candidate) {
          attempted.add(candidatePath);
          event.attempts.push({ path: candidatePath, accepted: false, reason: 'model-instance-unavailable' });
          report.alternativesChecked += 1;
          continue;
        }

        let accepted = false;
        try {
          accepted = await originalApplyModel.call(this, 'keke', candidate, ...args);
        } catch (error) {
          report.errors.push(`apply-alternative:${candidatePath}: ${String(error?.message || error)}`);
          event.stoppedReason = 'alternative-apply-threw';
          break;
        }

        report.alternativesChecked += 1;
        if (accepted) {
          acceptedAlternative = true;
          event.acceptedPath = candidatePath;
          event.attempts.push({ path: candidatePath, accepted: true, reason: 'renderer-accepted-model' });
          report.acceptedAlternativeCount += 1;
          report.last = structuredCloneSafe(event);
          console.info(`[Kano Life] Keke model failover selected ${candidatePath}.`);
          publishReport();
          return true;
        }

        attempted.add(candidatePath);
        const validation = candidate.userData?.kanoKekeVisualValidation;
        event.attempts.push({
          path: candidatePath,
          accepted: false,
          ...compactValidation(validation),
        });
        if (!isRetryableKekeRejection(validation)) {
          event.stoppedReason = 'alternative-rejection-not-eligible-for-failover';
          break;
        }
      }

      report.exhaustedCount += 1;
      if (!event.stoppedReason) event.stoppedReason = 'all-remaining-catalogue-options-exhausted';
      report.last = structuredCloneSafe(event);
      console.warn('[Kano Life] No alternative catalogued keke passed visual validation; keeping the active vehicle.', event);
      publishReport();
      return false;
    } catch (error) {
      report.errors.push(`apply-model-failover: ${String(error?.message || error)}`);
      report.last = structuredCloneSafe({ ...event, stoppedReason: 'unexpected-failover-error' });
      publishReport();
      throw error;
    } finally {
      if (catalogSnapshot) {
        catalog.splice(0, catalog.length, ...catalogSnapshot);
      }
      // If no alternate was accepted, restore the model that was cached before
      // failover. Its geometry is not disposed because existing traffic objects
      // might share it. An accepted alternative remains the active cache entry.
      if (failoverStarted && !acceptedAlternative) {
        if (cacheBeforeFailover) manager.cache.set('keke', cacheBeforeFailover);
        else manager.cache.delete('keke');
      }
      if (failoverStarted) catalogMutationInProgress = false;
      this[BUSY] = false;
    }
  };

  report.installed = true;
  publishReport();
  return true;
}

install();
export { install as installKanoKekeCatalogFailoverRepair };
