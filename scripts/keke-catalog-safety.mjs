import path from 'node:path';

const SOURCE_GUARD_MARKER = '// KANO KEKE VEHICLE-CATEGORY SAFETY GUARD';
const VARIANT_PATCH_MARKER = '// KANO GLB VARIANT ACTIVATION PATCH';
const CATALOG_START = 'const CATALOG =';
const DIMENSIONS_MARKER = '// MODEL DIMENSIONS';

/**
 * A player-keke GLB must be an asset from the vehicles tree. This prevents
 * broad filename matching (for example, "keke female.glb") from putting a
 * pedestrian/person model into the player-vehicle category.
 */
export function isSafeKekeVehiclePath(rawPath) {
  if (typeof rawPath !== 'string') return false;
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!/^vehicles\//i.test(normalized)) return false;
  if (!/\.glb$/i.test(normalized)) return false;
  if (normalized.split('/').some((segment) => segment === '..' || segment === '.' || !segment)) return false;
  // Extra guard for misfiled human assets inside a vehicle folder.
  if (/(^|[\s_\-./])(character|pedestrian|passenger|woman|women|female|girl|boy|boys|man|men|male|person|people|human|child|children|almajiri|mannequin)(?=$|[\s_\-./])/i.test(normalized)) return false;
  return true;
}

function cleanKekePaths(paths) {
  const original = Array.isArray(paths) ? paths : [];
  const candidates = [...new Set(original.filter((item) => typeof item === 'string'))];
  const accepted = candidates.filter(isSafeKekeVehiclePath).sort((a, b) => a.localeCompare(b));
  const acceptedSet = new Set(accepted);
  const rejected = candidates.filter((item) => !acceptedSet.has(item));
  return { accepted, rejected };
}

function extractJsonCatalog(source) {
  const start = source.indexOf(CATALOG_START);
  if (start < 0) return null;
  const dimensionsAt = source.indexOf(DIMENSIONS_MARKER, start);
  if (dimensionsAt < 0) return null;
  const objectStart = source.indexOf('{', start);
  const declarationEnd = source.lastIndexOf('};', dimensionsAt);
  if (objectStart < 0 || declarationEnd < objectStart) return null;
  try {
    const catalog = JSON.parse(source.slice(objectStart, declarationEnd + 1));
    return { start, end: declarationEnd + 2, catalog };
  } catch {
    return null;
  }
}

/** Sanitize the transformed JSON CATALOG literal emitted by glb-catalog-sync. */
export function sanitizeKekeCatalogSource(source) {
  if (typeof source !== 'string' || source.includes(SOURCE_GUARD_MARKER)) {
    return { code: source, audit: null };
  }
  // The pre-plugin injects a JSON catalogue when real files were discovered.
  // If it did not run, leave ModelManager's valid original JS object intact.
  if (!source.includes(VARIANT_PATCH_MARKER)) return { code: source, audit: null };
  const extracted = extractJsonCatalog(source);
  if (!extracted) {
    throw new Error('[Kano Keke Safety] Refusing to patch an unrecognised transformed catalogue.');
  }
  const { accepted, rejected } = cleanKekePaths(extracted.catalog.keke);
  extracted.catalog.keke = accepted;
  const declaration = `const CATALOG = ${JSON.stringify(extracted.catalog, null, 2)};`;
  const code = source.slice(0, extracted.start)
    + `${SOURCE_GUARD_MARKER}\n${declaration}`
    + source.slice(extracted.end);
  return {
    code,
    audit: {
      allowedVehiclePaths: accepted,
      excludedNonVehicleOrHumanPaths: rejected,
      fallbackRequired: accepted.length === 0,
    },
  };
}

/** Keep the static JSON report consistent with the runtime catalogue guard. */
export function sanitizeCatalogReport(report) {
  if (!report || typeof report !== 'object' || !report.catalog || typeof report.catalog !== 'object') {
    return { report, audit: null };
  }
  const { accepted, rejected } = cleanKekePaths(report.catalog.keke);
  const acceptedSet = new Set(accepted);
  report.catalog.keke = accepted;
  if (report.categoryCounts && typeof report.categoryCounts === 'object') {
    report.categoryCounts.keke = accepted.length;
  }
  if (Array.isArray(report.files)) {
    for (const file of report.files) {
      if (!Array.isArray(file.categories)) continue;
      file.categories = file.categories.filter((category) => category !== 'keke' || acceptedSet.has(file.path));
      file.classified = file.categories.length > 0;
    }
    report.unclassified = report.files.filter((file) => !file.classified).map((file) => file.path).sort();
  }
  report.kekeCategorySafety = {
    status: accepted.length ? 'vehicle-only' : 'no-safe-vehicle-candidate',
    acceptedVehiclePaths: accepted,
    excludedCandidates: rejected,
    note: accepted.length
      ? 'Only GLBs under vehicles/ that do not look like human character assets are permitted for the player keke.'
      : 'No safe vehicle candidate was found. The game should retain its procedural vehicle fallback rather than display a person as the keke.',
  };
  return {
    report,
    audit: {
      allowedVehiclePaths: accepted,
      excludedNonVehicleOrHumanPaths: rejected,
      fallbackRequired: accepted.length === 0,
    },
  };
}

export function createKekeCatalogSafetyPlugin() {
  const state = { lastAudit: null };
  return {
    name: 'kano-keke-vehicle-category-safety',
    enforce: 'post',
    transform(source, id) {
      const normalizedId = id.split('?')[0].replace(/\\/g, '/');
      if (!normalizedId.endsWith('/js/ModelManager.js') && normalizedId !== 'js/ModelManager.js') return null;
      const result = sanitizeKekeCatalogSource(source);
      if (result.audit) {
        state.lastAudit = result.audit;
        if (result.audit.excludedNonVehicleOrHumanPaths.length) {
          console.warn('[Kano Keke Safety] Excluded non-vehicle candidates from player-keke catalogue:', result.audit.excludedNonVehicleOrHumanPaths);
        }
        if (result.audit.fallbackRequired) {
          console.warn('[Kano Keke Safety] No safe player-keke GLB exists in the discovered catalogue. Procedural fallback must remain; character models will not be used as vehicles.');
        }
      }
      return result.code === source ? null : { code: result.code, map: null };
    },
    generateBundle(_options, bundle) {
      const target = bundle['assets/models/model-catalog-audit.generated.json'];
      if (!target || target.type !== 'asset') return;
      try {
        const parsed = JSON.parse(String(target.source));
        const result = sanitizeCatalogReport(parsed);
        target.source = JSON.stringify(result.report, null, 2);
        state.lastAudit = result.audit || state.lastAudit;
      } catch (error) {
        this.warn(`[Kano Keke Safety] Could not sanitize generated model audit: ${error?.message || error}`);
      }
    },
    getLastAudit() {
      return state.lastAudit;
    },
  };
}
