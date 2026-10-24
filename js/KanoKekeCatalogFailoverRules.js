/**
 * KANO LIFE — pure policy and isolated-load helpers for catalogued keke GLBs.
 *
 * ModelManager reads MODEL_KEYS[key] synchronously at the start of load().
 * Replacing that property for only the synchronous call lets that load capture
 * an isolated candidate array without mutating the shared catalog array itself.
 */
const RETRYABLE_REJECTIONS = new Set([
  'character-only-model-no-vehicle-structure',
  'missing-vehicle-structure-evidence',
  'implausible-keke-bounds',
  'no-visible-renderable-meshes',
  'non-finite-bounds',
  'singular-root-transform',
]);

export function normalizeCataloguedKekePath(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const path = value.trim().replace(/\\/g, '/').split(/[?#]/, 1)[0];
  if (path.split('/').some((segment) => segment === '..')) return '';
  const match = path.match(/(?:^|\/)vehicles\/keke\/(keke-[1-8]\.glb)$/i);
  return match ? `vehicles/keke/${match[1].toLowerCase()}` : '';
}

export function isRetryableKekeRejection(validation) {
  return Boolean(
    validation &&
    typeof validation === 'object' &&
    validation.ok === false &&
    RETRYABLE_REJECTIONS.has(validation.reason),
  );
}

export function getUntriedKekeCatalogPaths(catalogPaths, attemptedPaths = []) {
  if (!Array.isArray(catalogPaths)) return [];
  const attempted = new Set(
    (attemptedPaths instanceof Set ? [...attemptedPaths] : attemptedPaths)
      .map(normalizeCataloguedKekePath)
      .filter(Boolean),
  );
  const seen = new Set();
  return catalogPaths.filter((path) => {
    const normalized = normalizeCataloguedKekePath(path);
    if (!normalized || attempted.has(normalized) || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function shouldStartKekeCatalogFailover({
  key,
  ready,
  disposed,
  modelPath,
  validation,
  attemptsRemaining,
} = {}) {
  return Boolean(
    key === 'keke' &&
    ready === true &&
    disposed !== true &&
    normalizeCataloguedKekePath(modelPath) &&
    isRetryableKekeRejection(validation) &&
    Number.isFinite(Number(attemptsRemaining)) &&
    Number(attemptsRemaining) > 0,
  );
}

/**
 * Start one ModelManager.load() against an isolated candidate list.
 *
 * IMPORTANT: `load` must synchronously capture owner[key] before its first
 * await, as ModelManager.load() does. The shared property's original array is
 * restored in the same JavaScript turn, while the in-flight loader retains its
 * private candidate-array reference. The original array object and order are
 * never edited.
 */
export function loadWithIsolatedCatalog(owner, key, candidatePaths, load) {
  if (!owner || typeof owner !== 'object' || typeof key !== 'string' || !key) {
    throw new TypeError('A catalog owner and key are required.');
  }
  if (!Array.isArray(candidatePaths) || candidatePaths.length === 0) {
    throw new TypeError('At least one candidate catalog path is required.');
  }
  if (typeof load !== 'function') {
    throw new TypeError('A load callback is required.');
  }

  const originalArray = owner[key];
  if (!Array.isArray(originalArray)) {
    throw new TypeError(`Catalog owner has no array at key "${key}".`);
  }
  const isolatedCandidates = candidatePaths
    .map(normalizeCataloguedKekePath)
    .filter(Boolean);
  if (!isolatedCandidates.length) {
    throw new TypeError('No valid catalogued keke paths were provided.');
  }

  let pending;
  owner[key] = isolatedCandidates;
  try {
    // ModelManager.load() reads MODEL_KEYS[key] synchronously here.
    pending = load(key);
  } finally {
    // Restore the same array reference without changing its contents or order.
    owner[key] = originalArray;
  }
  return Promise.resolve(pending);
}
