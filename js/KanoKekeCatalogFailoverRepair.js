/**
 * KANO LIFE — Catalogued Keke Model Failover Repair (Task 25)
 *
 * Task 24's retry logic mutates MODEL_KEYS.keke with splice() while asynchronous
 * model loads are in progress. MODEL_KEYS is a shared exported catalog object;
 * that can affect a second ModelManager / renderer generation. This revision
 * never mutates the shared catalog array. It temporarily swaps the property for
 * a private candidate array only during ModelManager.load()'s synchronous start,
 * then restores the original array immediately while that load continues.
 *
 * Only known keke-1.glb through keke-8.glb and explicitly retryable visual
 * validation failures participate. The visible active vehicle is preserved
 * unless an alternative passes Renderer3D.applyModel().
 */
import './KanoKnownKekeModelAcceptanceRepair.js';
import { MODEL_KEYS } from './ModelManager.js';
import { Renderer3D } from './renderer3d.js';
import {
  getUntriedKekeCatalogPaths,
  loadWithIsolatedCatalog,
  normalizeCataloguedKekePath,
  shouldStartKekeCatalogFailover,
  isRetryableKekeRejection,
} from './KanoKekeCatalogFailoverRules.js';

const PATCH = Symbol.for('kano.life.kekeCatalogFailover.v2');
const BUSY = Symbol.for('kano.life.kekeCatalogFailover.busy.v2');

const report = {
  version: 2,
  installed: false,
  failoverRuns: 0,
  alternativesChecked: 0,
  acceptedAlternativeCount: 0,
  exhaustedCount: 0,
  last: null,
  errors: [],
};

function addError(message) {
  report.errors.push(String(message));
  if (report.errors.length > 32) report.errors.splice(0, report.errors.length - 32);
}

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

function safeClone(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function publishReport() {
  if (typeof window === 'undefined') return;
  window.__KANO_KEKE_CATALOG_FAILOVER__ = report;
  window.kanoKekeCatalogFailoverAudit = () => ({
    ...report,
    last: report.last ? safeClone(report.last) : null,
    errors: [...report.errors],
  });
}

function install() {
  const prototype = Renderer3D?.prototype;
  if (!prototype || prototype[PATCH] || typeof prototype.applyModel !== 'function') return false;

  const originalApplyModel = prototype.applyModel;
  Object.defineProperty(prototype, PATCH, { value: true, configurable: false });

  prototype.applyModel = async function applyKekeWithSafeCatalogFailover(key, object, ...args) {
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
      (manager.pending instanceof Map && manager.pending.has('keke'))
    ) {
      return originalApplyModel.call(this, key, object, ...args);
    }

    this[BUSY] = true;
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
      sharedCatalogMutated: false,
    };

    try {
      const initialResult = await originalApplyModel.call(this, key, object, ...args);
      if (initialResult) return initialResult;

      const initialValidation = object?.userData?.kanoKekeVisualValidation;
      event.initialValidation = compactValidation(initialValidation);
      const catalogAtStart = [...MODEL_KEYS.keke];
      if (!shouldStartKekeCatalogFailover({
        key,
        ready: this.ready,
        disposed: this.disposed,
        modelPath: event.initialPath,
        validation: initialValidation,
        attemptsRemaining: catalogAtStart.length - 1,
      })) {
        return initialResult;
      }

      failoverStarted = true;
      cacheBeforeFailover = manager.cache.get('keke');
      report.failoverRuns += 1;
      const attempted = new Set([event.initialPath]);

      for (let attemptIndex = 0; attemptIndex < catalogAtStart.length - 1; attemptIndex += 1) {
        const remaining = getUntriedKekeCatalogPaths(catalogAtStart, attempted);
        if (!remaining.length) {
          event.stoppedReason = 'no-untried-catalogued-keke-remains';
          break;
        }

        // ModelManager's early cache/pending checks must not return the rejected
        // model or a concurrent in-flight load for this key.
        if (manager.pending instanceof Map && manager.pending.has('keke')) {
          event.stoppedReason = 'keke-load-already-pending';
          break;
        }
        manager.cache.delete('keke');
        manager.failed?.delete?.('keke');

        let loadedSource = null;
        try {
          loadedSource = await loadWithIsolatedCatalog(
            MODEL_KEYS,
            'keke',
            remaining,
            (catalogKey) => manager.load(catalogKey),
          );
        } catch (error) {
          addError(`load-alternative: ${String(error?.message || error)}`);
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
          addError(`apply-alternative:${candidatePath}:${String(error?.message || error)}`);
          event.stoppedReason = 'alternative-apply-threw';
          break;
        }

        report.alternativesChecked += 1;
        if (accepted) {
          acceptedAlternative = true;
          event.acceptedPath = candidatePath;
          event.attempts.push({ path: candidatePath, accepted: true, reason: 'renderer-accepted-model' });
          report.acceptedAlternativeCount += 1;
          report.last = safeClone(event);
          console.info(`[Kano Life] Safe keke catalog failover selected ${candidatePath}.`);
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
      report.last = safeClone(event);
      console.warn('[Kano Life] No alternative catalogued keke passed visual validation; keeping the active vehicle.', event);
      publishReport();
      return false;
    } catch (error) {
      addError(`apply-model-failover: ${String(error?.message || error)}`);
      report.last = safeClone({ ...event, stoppedReason: 'unexpected-failover-error' });
      publishReport();
      throw error;
    } finally {
      // The exported catalog array has not been mutated. Restore only the
      // original cached model if none of the alternatives replaced the player.
      if (failoverStarted && !acceptedAlternative) {
        if (cacheBeforeFailover) manager.cache.set('keke', cacheBeforeFailover);
        else manager.cache.delete('keke');
      }
      this[BUSY] = false;
    }
  };

  report.installed = true;
  publishReport();
  return true;
}

install();
export { install as installKanoKekeCatalogFailoverRepair };
