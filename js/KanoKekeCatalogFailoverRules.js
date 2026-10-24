/**
 * KANO LIFE — pure rules for trying the next catalogued keke GLB.
 * Does not load models, mutate the catalog, or depend on Three.js.
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
