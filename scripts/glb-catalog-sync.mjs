import fs from 'node:fs';
import path from 'node:path';

const CATALOG_KEYS = [
  'keke', 'car', 'taxi', 'suv', 'truck', 'bus', 'motorcycle', 'police',
  'karota', 'ambulance', 'passenger', 'passengerWoman', 'passengerMan',
  'passengerVIP', 'security', 'pedestrian', 'pedestrianWoman', 'building',
  'industrialBuilding', 'flyover', 'roadlight', 'cone', 'dirtmound', 'bench',
  'busStop', 'trafficLight', 'stopSign', 'marketStall',
];

const normalizeRel = (value) => value.split(path.sep).join('/');
const has = (text, regex) => regex.test(String(text || '').toLowerCase());
// Accept both relative path strings and discovered GLB records. The catalogue
// builder intentionally unions directory-based object lists with name-based
// object lists; sorting the objects directly caused Vercel's
// `a.localeCompare is not a function` build failure.
const sortKey = (item) => {
  if (typeof item === 'string') return item;
  if (item && typeof item.path === 'string') return item.path;
  return String(item ?? '');
};
function uniqueSorted(items) {
  const unique = new Map();
  for (const item of items) {
    const key = sortKey(item);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, item]) => item);
}

function readGlbHints(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 20 || buffer.toString('utf8', 0, 4) !== 'glTF') return [];
    const jsonLength = buffer.readUInt32LE(12);
    const jsonType = buffer.readUInt32LE(16);
    // GLB JSON chunk type = ASCII "JSON" as a little-endian uint32.
    if (jsonType !== 0x4e4f534a || jsonLength <= 0 || 20 + jsonLength > buffer.length) return [];
    const document = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).replace(/[\u0000\u0009\u000a\u000d\u0020]+$/g, ''));
    const found = [];
    if (document.asset?.generator) found.push(document.asset.generator);
    if (document.asset?.copyright) found.push(document.asset.copyright);
    for (const collection of ['scenes', 'nodes', 'meshes', 'materials', 'animations']) {
      for (const entry of document[collection] || []) {
        if (typeof entry?.name === 'string') found.push(entry.name);
      }
    }
    return found.filter(Boolean).slice(0, 300);
  } catch {
    return [];
  }
}

function walkGlbFiles(directory, root = directory) {
  if (!fs.existsSync(directory)) return [];
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const result = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkGlbFiles(absolute, root));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
      result.push({ absolutePath: absolute, path: normalizeRel(path.relative(root, absolute)) });
    }
  }
  return result;
}

function fileText(file) {
  return `${file.path} ${(file.hints || []).join(' ')}`.toLowerCase().replace(/[_-]+/g, ' ');
}

function inside(file, directory) {
  const p = `/${file.path.toLowerCase()}/`;
  return p.includes(`/${directory.toLowerCase().replace(/^\/+|\/+$/g, '')}/`);
}

function makeCatalog(files) {
  const catalog = Object.fromEntries(CATALOG_KEYS.map((key) => [key, []]));
  const reasons = new Map(files.map((file) => [file.path, new Set()]));
  const assign = (key, candidates) => {
    const paths = uniqueSorted(candidates.map((file) => file.path));
    catalog[key] = paths;
    for (const relativePath of paths) reasons.get(relativePath)?.add(key);
  };
  const matching = (regex, candidates = files) => candidates.filter((file) => has(fileText(file), regex));
  const under = (directory) => files.filter((file) => inside(file, directory));

  // Stable folder paths take precedence over names, so renamed files within
  // established asset folders continue to be discovered.
  const kekeDir = under('vehicles/keke');
  assign('keke', uniqueSorted([...kekeDir, ...matching(/\b(keke|napep|adaidaita|tricycle)\b/) ]));

  const allVehicles = under('vehicles');
  const carsDir = under('vehicles/cars');
  const specialDir = under('vehicles/special');
  const specialVehicleText = /\b(motorcycle|motorbike|motor bike|okada|scooter|ktm|spyder|bus|coach|minibus|coaster|truck|lorry|freight|cargo|peterbilt|volvo fh|cement truck|pickup|police|patrol|karota|ambulance)\b/;
  const ordinaryCars = carsDir.filter((file) => !has(fileText(file), specialVehicleText));
  assign('car', ordinaryCars.length ? ordinaryCars : carsDir);
  const taxi = matching(/\btaxi\b/, allVehicles);
  assign('taxi', taxi.length ? taxi : (ordinaryCars.length ? ordinaryCars : carsDir));
  assign('suv', matching(/\b(suv|jeep|crossover|4x4|sport utility|nissan juke)\b/, [...allVehicles, ...under('world/props')]));
  assign('truck', matching(/\b(truck|lorry|freight|cargo|peterbilt|volvo fh|cement truck|pickup|dodge ram)\b/, allVehicles));
  assign('bus', matching(/\b(bus|coach|minibus|coaster|omnibus|transit bus)\b/, allVehicles));
  assign('motorcycle', matching(/\b(motorcycle|motorbike|motor bike|okada|scooter|ktm|spyder|can am)\b/, allVehicles));
  assign('police', matching(/\b(police car|police vehicle|patrol car|police)\b/, [...allVehicles, ...under('world/props')]));
  assign('karota', matching(/\b(karota|kano road traffic|traffic enforcement)\b/, allVehicles));
  assign('ambulance', matching(/\b(ambulance|emergency medical)\b/, allVehicles));

  const passengerFiles = under('characters/passengers');
  const pedestrianFiles = under('characters/pedestrians');
  const characterFiles = uniqueSorted([...passengerFiles, ...pedestrianFiles].map((file) => file.path));
  const fromPaths = (paths) => paths.map((relativePath) => files.find((file) => file.path === relativePath)).filter(Boolean);
  assign('passenger', passengerFiles);
  const womenPassengers = matching(/\b(woman|women|female|girl|hijab|muslim woman|lady|wife)\b/, passengerFiles);
  assign('passengerWoman', womenPassengers.length ? womenPassengers : passengerFiles);
  const menPassengers = matching(/\b(man|men|male|gentleman|boy|handsome man)\b/, passengerFiles);
  assign('passengerMan', menPassengers.length ? menPassengers : passengerFiles);
  const vipPassengers = matching(/\b(vip|suit|formal|businessman|executive)\b/, passengerFiles);
  assign('passengerVIP', vipPassengers.length ? vipPassengers : passengerFiles);
  const security = matching(/\b(security|police man|policeman|officer|karota|traffic officer|guard)\b/, characterFiles.map((p) => files.find((file) => file.path === p)).filter(Boolean));
  assign('security', security.length ? security : pedestrianFiles);
  assign('pedestrian', pedestrianFiles);
  const womenPedestrians = matching(/\b(woman|women|female|girl|hijab|lady|keke female)\b/, pedestrianFiles);
  assign('pedestrianWoman', womenPedestrians.length ? womenPedestrians : pedestrianFiles);

  const worldFiles = under('world');
  const suburbanBuildings = under('world/buildings-suburban');
  const industrialBuildings = under('world/buildings-industrial');
  const buildingNames = matching(/\b(building|buildings|house|home|bungalow|villa|residential|commercial|shopfront|storefront|compound|architecture)\b/, worldFiles);
  assign('building', uniqueSorted([...suburbanBuildings, ...buildingNames.filter((file) => !has(fileText(file), /\b(industrial|factory|warehouse|workshop|shed)\b/))]));
  const industrialNames = matching(/\b(industrial|factory|warehouse|workshop|shed|manufacturing)\b/, worldFiles);
  assign('industrialBuilding', uniqueSorted([...industrialBuildings, ...industrialNames]));
  assign('flyover', matching(/\b(flyover|fly over|overpass|elevated road|highway bridge|road bridge|viaduct)\b/, worldFiles));
  assign('roadlight', matching(/\b(light pole|street light|streetlight|road light|roadlight|electricity pole|lamp post|lamppost|street lamp)\b/, worldFiles));
  assign('cone', matching(/\b(cone|construction barrier|road barrier|traffic barrier)\b/, worldFiles));
  assign('bench', matching(/\b(bench|public seat|park bench)\b/, worldFiles));
  assign('busStop', matching(/\b(bus stop|busstop|bus shelter|transit shelter)\b/, worldFiles));
  assign('trafficLight', matching(/\b(traffic light|trafficlight|signal light|traffic signal)\b/, worldFiles));
  assign('stopSign', matching(/\b(stop sign|stopsign|road sign stop)\b/, worldFiles));
  assign('marketStall', matching(/\b(market stall|market-stall|stall|kiosk|vendor stand|market stand|street vendor|produce stand)\b/, worldFiles));

  const environmentGround = under('environment/ground');
  const environmentFiles = under('environment');
  const groundNames = matching(/\b(pothole|manhole|sand|dirt|ground|asphalt|road damage|broken road|gravel|mud)\b/, environmentFiles);
  assign('dirtmound', uniqueSorted([...environmentGround, ...groundNames]));

  const allAssigned = new Set([...reasons.entries()].filter(([, keys]) => keys.size > 0).map(([relativePath]) => relativePath));
  const fileReports = files.map((file) => ({
    path: file.path,
    bytes: file.bytes,
    internalNames: file.hints.filter((value) => value && value.length < 100).slice(0, 25),
    categories: [...(reasons.get(file.path) || [])].sort(),
    classified: (reasons.get(file.path) || new Set()).size > 0,
  }));
  const populatedCatalog = Object.fromEntries(Object.entries(catalog).map(([key, paths]) => [key, uniqueSorted(paths)]));
  return {
    catalog: populatedCatalog,
    files: fileReports,
    unclassified: files.filter((file) => !allAssigned.has(file.path)).map((file) => file.path).sort(),
    categoryCounts: Object.fromEntries(CATALOG_KEYS.map((key) => [key, populatedCatalog[key].length])),
  };
}

function readCatalogOverrides(overrideFile) {
  if (!overrideFile || !fs.existsSync(overrideFile)) {
    return { overrides: { schemaVersion: 1, categories: {}, exclude: {} }, errors: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { overrides: { schemaVersion: 1, categories: {}, exclude: {} }, errors: ['Override file must contain a JSON object.'] };
    }
    return { overrides: parsed, errors: [] };
  } catch (error) {
    return { overrides: { schemaVersion: 1, categories: {}, exclude: {} }, errors: [`Could not read override JSON: ${error?.message || error}`] };
  }
}

function validateOverridePath(rawPath, existingPaths) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { path: null, error: 'Model path must be a non-empty string.' };
  }
  const normalized = rawPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some((part) => part === '..' || part === '' || part === '.')) {
    return { path: null, error: `Path must be relative to public/assets/models and cannot contain traversal segments: ${rawPath}` };
  }
  if (!existingPaths.has(normalized)) {
    const caseInsensitiveMatch = [...existingPaths].find((candidate) => candidate.toLowerCase() === normalized.toLowerCase());
    return {
      path: null,
      error: caseInsensitiveMatch
        ? `Filename case does not match the actual asset. Use: ${caseInsensitiveMatch}`
        : `File was not found under public/assets/models: ${normalized}`,
      missingPath: normalized,
    };
  }
  return { path: normalized, error: null };
}

function applyCatalogOverrides(mapping, discovered, overrides, overrideFile = '') {
  const catalog = Object.fromEntries(CATALOG_KEYS.map((key) => [key, [...(mapping.catalog[key] || [])]]));
  const existingPaths = new Set(discovered.map((file) => file.path));
  const errors = [];
  const missingPaths = [];
  const appliedCategories = [];
  const appliedExclusions = [];
  const rawCategories = overrides?.categories;
  const rawExcludes = overrides?.exclude;

  if (overrides?.schemaVersion != null && overrides.schemaVersion !== 1) {
    errors.push(`Unsupported override schemaVersion ${String(overrides.schemaVersion)}; expected 1.`);
  }

  if (rawCategories != null && (!rawCategories || typeof rawCategories !== 'object' || Array.isArray(rawCategories))) {
    errors.push('"categories" must be an object whose keys are catalog categories and values are path arrays.');
  } else {
    for (const [key, rawPaths] of Object.entries(rawCategories || {})) {
      if (!CATALOG_KEYS.includes(key)) {
        errors.push(`Unknown category "${key}". Allowed categories: ${CATALOG_KEYS.join(', ')}.`);
        continue;
      }
      if (!Array.isArray(rawPaths)) {
        errors.push(`Category "${key}" must contain an array of model paths.`);
        continue;
      }
      if (rawPaths.length === 0) {
        // An explicit [] intentionally disables the auto-detected category.
        catalog[key] = [];
        appliedCategories.push(key);
        continue;
      }
      const valid = [];
      for (const rawPath of rawPaths) {
        const result = validateOverridePath(rawPath, existingPaths);
        if (result.path) valid.push(result.path);
        else {
          errors.push(`[${key}] ${result.error}`);
          if (result.missingPath) missingPaths.push(result.missingPath);
        }
      }
      if (valid.length) {
        // A partially valid override keeps only the explicitly approved, valid files.
        catalog[key] = uniqueSorted(valid);
        appliedCategories.push(key);
      } else {
        // Fail safe: a typo must not silently empty a previously working category.
        errors.push(`Category "${key}" override had no valid files; automatic candidates were preserved.`);
      }
    }
  }

  if (rawExcludes != null && (!rawExcludes || typeof rawExcludes !== 'object' || Array.isArray(rawExcludes))) {
    errors.push('"exclude" must be an object whose keys are catalog categories and values are path arrays.');
  } else {
    for (const [key, rawPaths] of Object.entries(rawExcludes || {})) {
      if (!CATALOG_KEYS.includes(key)) {
        errors.push(`Unknown exclusion category "${key}".`);
        continue;
      }
      if (!Array.isArray(rawPaths)) {
        errors.push(`Exclusion for "${key}" must be an array of model paths.`);
        continue;
      }
      const validExclusions = new Set();
      for (const rawPath of rawPaths) {
        const result = validateOverridePath(rawPath, existingPaths);
        if (result.path) validExclusions.add(result.path);
        else {
          errors.push(`[exclude.${key}] ${result.error}`);
          if (result.missingPath) missingPaths.push(result.missingPath);
        }
      }
      if (validExclusions.size) {
        const presentBefore = new Set(catalog[key]);
        catalog[key] = catalog[key].filter((candidate) => !validExclusions.has(candidate));
        for (const removedPath of validExclusions) {
          if (presentBefore.has(removedPath)) appliedExclusions.push({ category: key, path: removedPath });
        }
      }
    }
  }

  const membership = new Map(discovered.map((file) => [file.path, []]));
  for (const [key, paths] of Object.entries(catalog)) {
    for (const modelPath of paths) membership.get(modelPath)?.push(key);
  }
  const files = mapping.files.map((file) => {
    const categories = (membership.get(file.path) || []).sort();
    return { ...file, categories, classified: categories.length > 0 };
  });
  const populatedCatalog = Object.fromEntries(Object.entries(catalog).map(([key, paths]) => [key, uniqueSorted(paths)]));
  const unclassified = files.filter((file) => !file.classified).map((file) => file.path).sort();
  return {
    catalog: populatedCatalog,
    categoryCounts: Object.fromEntries(CATALOG_KEYS.map((key) => [key, populatedCatalog[key].length])),
    files,
    unclassified,
    overrideAudit: {
      file: overrideFile ? normalizeRel(path.relative(process.cwd(), overrideFile)) : 'scripts/glb-catalog-overrides.json',
      appliedCategories: uniqueSorted(appliedCategories),
      appliedExclusions,
      missingPaths: uniqueSorted(missingPaths),
      errors,
      status: errors.length ? (appliedCategories.length || appliedExclusions.length ? 'applied_with_warnings' : 'needs_attention')
        : (appliedCategories.length || appliedExclusions.length ? 'applied' : 'no_manual_overrides'),
    },
  };
}

export async function scanGlbCatalog(modelRoot, overrideFile = null) {
  const discovered = walkGlbFiles(modelRoot).map((file) => {
    let bytes = 0;
    try { bytes = fs.statSync(file.absolutePath).size; } catch { /* file changed mid-scan */ }
    return { ...file, bytes, hints: readGlbHints(file.absolutePath) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const automatic = makeCatalog(discovered);
  const resolvedOverrideFile = overrideFile || path.resolve(modelRoot, '..', '..', '..', 'scripts', 'glb-catalog-overrides.json');
  const { overrides, errors: readErrors } = readCatalogOverrides(resolvedOverrideFile);
  const mapping = applyCatalogOverrides(automatic, discovered, overrides, resolvedOverrideFile);
  mapping.overrideAudit.errors.unshift(...readErrors);
  if (readErrors.length && mapping.overrideAudit.status === 'no_manual_overrides') mapping.overrideAudit.status = 'needs_attention';
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    root: 'public/assets/models/',
    discoveredCount: discovered.length,
    note: discovered.length
      ? 'Catalog paths come from the exact GLB files found at build/dev time. Automatic mapping is supplemented by scripts/glb-catalog-overrides.json. Invalid manual paths are reported; an invalid all-missing override preserves the previous automatic category.'
      : 'No GLB files were found at the scanned model root. Existing static model catalogue was left unchanged.',
    catalog: mapping.catalog,
    categoryCounts: mapping.categoryCounts,
    unclassified: mapping.unclassified,
    files: mapping.files,
    overrideAudit: mapping.overrideAudit,
  };
}

export function patchModelManagerVariants(source) {
  if (source.includes('// KANO GLB VARIANT ACTIVATION PATCH')) return source;
  const helperMarker = 'export class ModelManager {';
  const helperAt = source.indexOf(helperMarker);
  if (helperAt < 0) throw new Error('[Kano GLB Variants] ModelManager class declaration not found.');
  source = source.slice(0, helperAt) + `const KANO_GLB_VARIANT_POLICY = {
  keke: { family: 'vehicle', mobile: 2, desktop: 3 },
  car: { family: 'vehicle', mobile: 2, desktop: 3 },
  taxi: { family: 'vehicle', mobile: 1, desktop: 2 },
  suv: { family: 'vehicle', mobile: 1, desktop: 2 },
  truck: { family: 'vehicle', mobile: 1, desktop: 2 },
  bus: { family: 'vehicle', mobile: 1, desktop: 2 },
  motorcycle: { family: 'vehicle', mobile: 2, desktop: 3 },
  police: { family: 'vehicle', mobile: 1, desktop: 2 },
  karota: { family: 'vehicle', mobile: 1, desktop: 2 },
  ambulance: { family: 'vehicle', mobile: 1, desktop: 2 },
  passenger: { family: 'character', mobile: 2, desktop: 3 },
  passengerWoman: { family: 'character', mobile: 2, desktop: 3 },
  passengerMan: { family: 'character', mobile: 2, desktop: 3 },
  passengerVIP: { family: 'character', mobile: 1, desktop: 2 },
  security: { family: 'character', mobile: 1, desktop: 2 },
  pedestrian: { family: 'character', mobile: 2, desktop: 4 },
  pedestrianWoman: { family: 'character', mobile: 2, desktop: 3 },
  building: { family: 'world', mobile: 3, desktop: 7 },
  industrialBuilding: { family: 'world', mobile: 2, desktop: 4 },
  flyover: { family: 'world', mobile: 2, desktop: 3 },
  roadlight: { family: 'world', mobile: 2, desktop: 3 },
  cone: { family: 'world', mobile: 1, desktop: 2 },
  bench: { family: 'world', mobile: 1, desktop: 2 },
  busStop: { family: 'world', mobile: 2, desktop: 2 },
  trafficLight: { family: 'world', mobile: 1, desktop: 2 },
  stopSign: { family: 'world', mobile: 1, desktop: 2 },
  marketStall: { family: 'world', mobile: 2, desktop: 4 },
  dirtmound: { family: 'environment', mobile: 2, desktop: 3 },
};
const KANO_GLB_VARIANT_PRIORITY = [
  'building', 'industrialBuilding', 'marketStall', 'busStop', 'flyover',
  'roadlight', 'pedestrian', 'pedestrianWoman', 'passengerWoman',
  'passengerMan', 'passenger', 'keke', 'motorcycle', 'car', 'taxi', 'suv',
  'truck', 'bus', 'karota', 'security', 'dirtmound', 'cone', 'trafficLight',
  'stopSign', 'bench', 'police', 'ambulance', 'passengerVIP',
];
function kanoDetectMobileVariantMode() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia(
      '(max-width: 760px), (pointer: coarse)',
    ).matches;
  } catch {
    return false;
  }
}
function kanoInitialVariantBudget(mobile) {
  return mobile
    ? { vehicle: 4, world: 7, character: 4, environment: 1 }
    : { vehicle: 5, world: 12, character: 6, environment: 2 };
}
function kanoVariantPolicyFor(key, mobile) {
  const policy = KANO_GLB_VARIANT_POLICY[key];
  return policy ? { ...policy, limit: mobile ? policy.mobile : policy.desktop } : null;
}
function kanoDisposeRoots(roots) {
  const unique = [...new Set((roots || []).filter(Boolean))];
  if (unique.length) disposeModelResources(unique);
}
` + source.slice(helperAt);

  const constructorPattern = /    this\.cache = new Map\(\);\s*    this\.pending = new Map\(\);\s*    this\.failed = new Set\(\);\s*    this\.disposed = false;/;
  if (!constructorPattern.test(source)) {
    throw new Error('[Kano GLB Variants] ModelManager constructor markers were not found; refusing an unsafe source rewrite.');
  }
  source = source.replace(constructorPattern, `    this.cache = new Map();
    this.pending = new Map();
    this.failed = new Set();
    this.disposed = false;
    this.variantCache = new Map();
    this.variantCursor = new Map();
    this.variantReady = new Set();
    this.variantMobile = kanoDetectMobileVariantMode();
    this.variantBudget = kanoInitialVariantBudget(this.variantMobile);`);

  const preloadStart = source.indexOf('  async preload(keys) {');
  const getInstanceMarker = '  // ----------------------------------------------------------\n  // GET INSTANCE';
  const preloadEnd = source.indexOf(getInstanceMarker, preloadStart);
  if (preloadStart < 0 || preloadEnd < 0) {
    throw new Error('[Kano GLB Variants] Could not locate preload()/GET INSTANCE boundaries; refusing an unsafe source rewrite.');
  }
  const methods = `  async preload(keys) {
    if (this.disposed) return [];
    const uniqueKeys = [...new Set(keys)];
    const primaryModels = await Promise.all(uniqueKeys.map((key) => this.load(key)));
    if (this.disposed) return primaryModels;
    await this.warmVariantPools(uniqueKeys);
    return primaryModels;
  }

  // Loads a bounded selection of the actual configured GLBs for each key.
  // The original cached model stays as the first variant and remains the
  // fallback if an additional asset fails validation or loading.
  async warmVariantPools(keys) {
    if (this.disposed) return [];
    const priority = new Map(KANO_GLB_VARIANT_PRIORITY.map((key, index) => [key, index]));
    const uniqueKeys = [...new Set(keys)].sort((a, b) =>
      (priority.get(a) ?? 999) - (priority.get(b) ?? 999) || String(a).localeCompare(String(b))
    );
    const states = [];

    for (const key of uniqueKeys) {
      const base = this.cache.get(key) || null;
      const candidates = Array.isArray(CATALOG[key]) ? [...CATALOG[key]] : [];
      const policy = kanoVariantPolicyFor(key, this.variantMobile);
      if (!base || !policy || policy.limit <= 1 || candidates.length <= 1) {
        if (base) this.variantCache.set(key, [base]);
        this.variantReady.add(key);
        continue;
      }
      const pool = this.variantCache.get(key) || [base];
      if (!pool.includes(base)) pool.unshift(base);
      this.variantCache.set(key, pool);
      const seen = new Set(pool.map((model) => model?.userData?.modelPath).filter(Boolean));
      states.push({ key, family: policy.family, limit: policy.limit, candidates, index: 0, pool, seen, exhausted: false });
    }

    let loadedAnyInLastRound = true;
    try {
      while (!this.disposed && loadedAnyInLastRound) {
        loadedAnyInLastRound = false;
        for (const state of states) {
          if (this.disposed) break;
          if (state.exhausted || state.pool.length >= state.limit) continue;
          if ((this.variantBudget[state.family] || 0) <= 0) continue;
          let loadedOne = false;
          while (state.index < state.candidates.length) {
            const relativePath = state.candidates[state.index++];
            if (!relativePath || state.seen.has(relativePath)) continue;
            const currentBasePath = this.cache.get(state.key)?.userData?.modelPath;
            if (relativePath === currentBasePath) {
              state.seen.add(relativePath);
              continue;
            }
            if ((this.variantBudget[state.family] || 0) <= 0) break;

            // CATALOG is module-local and the variant queue is serial. The
            // main manager has its primary cache already populated, so normal
            // scene reads continue to use that cache while this scratch loader
            // attempts exactly one candidate path.
            this.variantBudget[state.family] -= 1;
            const scratch = new ModelManager({ basePath: this.basePath });
            const originalCategory = CATALOG[state.key];
            let variant = null;
            try {
              CATALOG[state.key] = [relativePath];
              variant = await scratch.load(state.key);
            } catch (error) {
              console.debug('[Kano GLB Variants] candidate failed', state.key, relativePath, error?.message || error);
            } finally {
              CATALOG[state.key] = originalCategory;
              scratch.cache.delete(state.key);
              scratch.pending.delete(state.key);
              scratch.failed.clear();
              scratch.dispose();
            }

            if (!variant || variant.userData?.modelPath !== relativePath) {
              this.variantBudget[state.family] = Math.min(
                kanoInitialVariantBudget(this.variantMobile)[state.family],
                (this.variantBudget[state.family] || 0) + 1,
              );
              continue;
            }
            if (this.disposed) {
              kanoDisposeRoots([variant]);
              this.variantBudget[state.family] = Math.min(
                kanoInitialVariantBudget(this.variantMobile)[state.family],
                (this.variantBudget[state.family] || 0) + 1,
              );
              break;
            }

            state.pool.push(variant);
            state.seen.add(relativePath);
            this.variantCache.set(state.key, state.pool);
            console.info('[Kano GLB Variants] active', state.key, relativePath, '(' + state.pool.length + '/' + state.limit + ')');
            loadedAnyInLastRound = true;
            loadedOne = true;
            break;
          }
          if (!loadedOne && state.index >= state.candidates.length) state.exhausted = true;
        }
      }
    } finally {
      for (const key of uniqueKeys) this.variantReady.add(key);
    }

    return states.map((state) => ({
      key: state.key,
      loaded: state.pool.length,
      target: state.limit,
      paths: state.pool.map((model) => model?.userData?.modelPath).filter(Boolean),
    }));
  }

`;
  source = source.slice(0, preloadStart) + methods + source.slice(preloadEnd);

  const instanceOld = `    const model = this.cache.get(key);\n\n    if (!model) return null;`;
  const instanceNew = `    if (this.shouldWaitForVariantPool(key) && !this.variantReady.has(key)) return null;
    const variants = this.variantCache.get(key);
    let model = this.cache.get(key);
    if (variants?.length) {
      const cursor = this.variantCursor.get(key) || 0;
      model = variants[cursor % variants.length];
      this.variantCursor.set(key, (cursor + 1) % variants.length);
    }
    if (!model) return null;`;
  if (!source.includes(instanceOld)) {
    throw new Error('[Kano GLB Variants] Could not locate getInstance() model selection; refusing an unsafe source rewrite.');
  }
  source = source.replace(instanceOld, instanceNew);

  const getStatusOld = `      loaded: [...this.cache.keys()],\n      pending: [...this.pending.keys()],\n      failed: [...this.failed.keys()],\n      disposed: this.disposed,`;
  const getStatusNew = `      loaded: [...this.cache.keys()],
      pending: [...this.pending.keys()],
      failed: [...this.failed.keys()],
      variantPools: Object.fromEntries([...this.variantCache.entries()].map(([key, pool]) => [key, pool.map((model) => model?.userData?.modelPath).filter(Boolean)])),
      variantReady: [...this.variantReady],
      variantBudget: { ...this.variantBudget },
      disposed: this.disposed,`;
  if (!source.includes(getStatusOld)) {
    throw new Error('[Kano GLB Variants] Could not locate getStatus() fields; refusing an unsafe source rewrite.');
  }
  source = source.replace(getStatusOld, getStatusNew);

  const disposeOld = `    disposeModelResources(\n      [...this.cache.values()],\n    );\n\n    this.cache.clear();\n    this.failed.clear();\n    this.pending.clear();`;
  const disposeNew = `    const ownedRoots = new Set([...this.cache.values()]);
    for (const pool of this.variantCache.values()) {
      for (const model of pool || []) if (model) ownedRoots.add(model);
    }
    kanoDisposeRoots([...ownedRoots]);

    this.cache.clear();
    this.variantCache.clear();
    this.variantCursor.clear();
    this.variantReady.clear();
    this.failed.clear();
    this.pending.clear();`;
  if (!source.includes(disposeOld)) {
    throw new Error('[Kano GLB Variants] Could not locate dispose() cleanup markers; refusing an unsafe source rewrite.');
  }
  source = source.replace(disposeOld, disposeNew);

  const shouldWaitMethod = `
  shouldWaitForVariantPool(key) {
    const policy = kanoVariantPolicyFor(key, this.variantMobile);
    const candidates = Array.isArray(CATALOG[key]) ? CATALOG[key] : [];
    return !!policy && policy.limit > 1 && candidates.length > 1;
  }

`;
  const getInstanceMethodMarker = '  // ----------------------------------------------------------\n  // GET INSTANCE';
  const insertAt = source.indexOf(getInstanceMethodMarker);
  if (insertAt < 0) throw new Error('[Kano GLB Variants] GET INSTANCE insertion marker disappeared.');
  source = source.slice(0, insertAt) + shouldWaitMethod + source.slice(insertAt);

  // Add a marker only to the transformed module; repeated plugin calls do not
  // duplicate class methods, and catalogue replacement remains idempotent.
  const classMarker = 'export class ModelManager {';
  const classAt = source.indexOf(classMarker);
  if (classAt < 0) throw new Error('[Kano GLB Variants] ModelManager class declaration not found.');
  source = source.slice(0, classAt) + '// KANO GLB VARIANT ACTIVATION PATCH\n' + source.slice(classAt);
  return source;
}


export function patchRenderer3dModelActivation(source) {
  const marker = '// KANO GLB SCENE ACTIVATION AND AUDIT PATCH';
  if (source.includes(marker)) return source;
  let output = source;

  // The original mobile renderer only replaced two building slots with GLBs.
  // Keep the existing slot count and activate every slot the renderer already creates.
  const buildingGate = /const activeBuildingSlots = this\.mobile\s*\?\s*this\.buildingSlots\.slice\(0,\s*2\)\s*:\s*this\.buildingSlots;/;
  if (!buildingGate.test(output)) {
    throw new Error('[Kano GLB Scene] Could not locate the original mobile building-slot limit; no renderer source was rewritten.');
  }
  output = output.replace(buildingGate, `// Every existing frontage slot may use a loaded GLB, including mobile.
    const activeBuildingSlots = this.buildingSlots;`);

  // Bring mobile frontages somewhat closer to the roadside camera without placing
  // their centres inside the paved road. Desktop coordinates remain untouched.
  const buildingX = /const x = side \* \(9 \+ \(index % 3\) \* 2\.8\);/;
  if (!buildingX.test(output)) {
    throw new Error('[Kano GLB Scene] Could not locate the original building placement expression; no renderer source was rewritten.');
  }
  output = output.replace(buildingX,
    'const x = side * (this.mobile ? 7.8 + (index % 3) * 1.9 : 9 + (index % 3) * 2.8);');

  // Existing normalisation scales some frontage models down to 2.2m. Use a
  // modest architectural minimum while preserving slot height differences.
  const buildingHeight = /const normalizedHeight =\s*model\.userData\.targetHeight\s*\|\|\s*\(slot\.industrial \? 5\.2 : 4\.5\);\s*model\.scale\.multiplyScalar\(\s*slot\.height \/ normalizedHeight,\s*\);/;
  if (!buildingHeight.test(output)) {
    throw new Error('[Kano GLB Scene] Could not locate the original building-size correction; no renderer source was rewritten.');
  }
  output = output.replace(buildingHeight, `const normalizedHeight =
        model.userData.targetHeight ||
        (slot.industrial ? 5.2 : 4.5);
      const displayHeight = (slot.industrial ? 5.4 : 4.5) +
        Math.max(0, slot.height - 2.2) * 0.55;
      model.scale.multiplyScalar(displayHeight / normalizedHeight);
      model.userData.sceneDisplayHeight = displayHeight;`);

  // One extra mobile slot gives a second opportunity to show an existing
  // market-stall variant while remaining inside the 245-unit world loop.
  const propCount = 'const count = this.mobile ? 5 : 10;';
  if (!output.includes(propCount)) {
    throw new Error('[Kano GLB Scene] Could not locate the roadside-prop count; no renderer source was rewritten.');
  }
  output = output.replace(propCount, 'const count = this.mobile ? 6 : 10;');

  // Mobile previously had no streetlight slots at all, so roadlight GLBs could
  // never replace the primitive streetlight fallback on phones.
  const streetlightStart = '    if (!this.mobile) {\n      for (let index = 0; index < 6; index += 1) {\n        for (const side of [-1, 1]) {';
  if (!output.includes(streetlightStart)) {
    throw new Error('[Kano GLB Scene] Could not locate the mobile streetlight exclusion; no renderer source was rewritten.');
  }
  output = output.replace(streetlightStart,
    '    for (let index = 0; index < (this.mobile ? 3 : 6); index += 1) {\n        for (const side of [-1, 1]) {');
  const streetlightEnd = '          this.streetLights.push(pole);\n        }\n      }\n    }\n  }\n\n  buildRoadsideProps() {';
  if (!output.includes(streetlightEnd)) {
    throw new Error('[Kano GLB Scene] Could not close the streetlight-loop patch safely; no renderer source was rewritten.');
  }
  output = output.replace(streetlightEnd,
    '          this.streetLights.push(pole);\n        }\n      }\n  }\n\n  buildRoadsideProps() {');

  // Diagnostic records include the actual source path only when the active
  // scene actor carries ModelManager metadata. Primitive fallbacks are labelled
  // explicitly, preventing a configured/loaded model from being mistaken for a
  // model currently visible in the renderer.
  const usageMethod = `  getGlbSceneUsageReport() {
    const rows = [];
    const toEntry = (kind, category, actor, index, extra = {}) => {
      let modelPath = actor?.userData?.modelPath || null;
      let meshCount = 0;
      let visibleMeshCount = 0;
      let bounds = null;
      if (actor?.traverse) {
        actor.traverse((object) => {
          if (object.userData?.modelPath && !modelPath) modelPath = object.userData.modelPath;
          if (object.isMesh) {
            meshCount += 1;
            if (object.visible !== false) visibleMeshCount += 1;
          }
        });
        try {
          actor.updateMatrixWorld?.(true);
          const box = new THREE.Box3().setFromObject(actor);
          if (!box.isEmpty()) {
            const size = box.getSize(new THREE.Vector3());
            bounds = {
              x: Number(size.x.toFixed(3)),
              y: Number(size.y.toFixed(3)),
              z: Number(size.z.toFixed(3)),
            };
          }
        } catch { /* malformed bounds do not break gameplay */ }
      }
      const position = actor?.position
        ? { x: Number(actor.position.x.toFixed(3)), y: Number(actor.position.y.toFixed(3)), z: Number(actor.position.z.toFixed(3)) }
        : null;
      const entry = {
        kind,
        category: category || actor?.userData?.modelKey || 'unknown',
        modelPath,
        rendering: modelPath ? 'GLB' : 'procedural-fallback',
        visible: actor?.visible !== false,
        meshCount,
        visibleMeshCount,
        position,
        worldBounds: bounds,
        index,
        ...extra,
      };
      rows.push(entry);
      return entry;
    };

    for (const [index, slot] of (this.buildingSlots || []).entries()) {
      toEntry('building', slot.industrial ? 'industrialBuilding' : 'building', slot.actor, index, { industrial: !!slot.industrial, replaced: !!slot.replaced });
    }
    for (const [index, slot] of (this.roadProps || []).entries()) {
      toEntry('road-prop', slot.key, slot.actor, index, { replaced: !!slot.replaced });
    }
    for (const [index, actor] of (this.streetLights || []).entries()) {
      toEntry('streetlight', 'roadlight', actor, index);
    }
    for (const [index, actor] of (this.flyovers || []).entries()) {
      toEntry('flyover', 'flyover', actor, index, { procedural: !!actor?.userData?.proceduralFlyover });
    }
    for (const [index, pedestrian] of (this.pedestrians || []).entries()) {
      toEntry('pedestrian', pedestrian.actor?.userData?.characterType || 'pedestrian', pedestrian.actor, index, { usingModel: !!pedestrian.usingModel });
    }
    for (const [id, actor] of (this.trafficActors || new Map()).entries()) {
      toEntry('traffic', actor?.userData?.modelKey || actor?.userData?.vehicleType || 'traffic', actor, String(id), { vehicleType: actor?.userData?.vehicleType || null });
    }
    for (const [index, slot] of (this.garageVehicleSlots || []).entries()) {
      toEntry('garage-vehicle', 'keke', slot.actor, index, { replaced: !!slot.replaced });
    }
    for (const [index, slot] of (this.lifeAssetSlots || []).entries()) {
      toEntry('life-scene', slot.key, slot.actor, index, { sceneName: slot.sceneName, replaced: !!slot.replaced });
    }

    const glbRows = rows.filter((row) => row.modelPath);
    const fallbackRows = rows.filter((row) => !row.modelPath);
    return {
      generatedAt: new Date().toISOString(),
      renderMode: this.renderer?.isWebGLRenderer ? 'webgl' : 'unknown',
      mobile: !!this.mobile,
      summary: {
        totalSceneActors: rows.length,
        visibleGlbActors: glbRows.filter((row) => row.visible && row.visibleMeshCount > 0).length,
        glbActors: glbRows.length,
        fallbackActors: fallbackRows.length,
        uniqueGlbPaths: [...new Set(glbRows.map((row) => row.modelPath))].length,
      },
      modelManager: this.models?.getStatus?.() || null,
      actors: rows,
    };
  }

  setupGlbSceneAuditPanel() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    try {
      if (new URLSearchParams(window.location.search).get('assetAudit') !== '1') return;
    } catch { return; }
    if (document.getElementById('kano-glb-scene-audit')) return;

    const panel = document.createElement('section');
    panel.id = 'kano-glb-scene-audit';
    panel.style.cssText = 'position:fixed;z-index:2147483000;top:8px;right:8px;width:min(390px,calc(100vw - 16px));max-height:58vh;overflow:auto;background:rgba(8,18,30,.96);color:#f4f7fa;border:1px solid #00b4d8;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.45);padding:10px;font:12px/1.4 system-ui,sans-serif;';
    const title = document.createElement('div');
    title.textContent = 'KANO LIFE · GLB SCENE AUDIT';
    title.style.cssText = 'font-weight:800;color:#00d4f4;letter-spacing:.04em;margin-bottom:6px;';
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;';
    const createButton = (label, onClick) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'background:#153047;color:#fff;border:1px solid #416277;border-radius:6px;padding:6px 9px;font:600 11px system-ui;cursor:pointer;';
      button.addEventListener('click', onClick);
      controls.appendChild(button);
      return button;
    };
    const output = document.createElement('pre');
    output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:10px/1.35 ui-monospace,monospace;color:#e0ebf2;';
    const refresh = () => {
      const report = this.getGlbSceneUsageReport();
      const summary = report.summary;
      const grouped = new Map();
      for (const actor of report.actors) {
        const entry = grouped.get(actor.kind) || { total: 0, glb: 0, fallback: 0 };
        entry.total += 1;
        if (actor.modelPath) entry.glb += 1;
        else entry.fallback += 1;
        grouped.set(actor.kind, entry);
      }
      const categories = [...grouped.entries()].map(([name, value]) =>
        name.padEnd(15) + String(value.glb).padStart(3) + ' GLB / ' + String(value.fallback).padStart(3) + ' fallback'
      ).join('\\n');
      const paths = report.actors.filter((row) => row.modelPath).slice(0, 18).map((row) =>
        row.kind + ': ' + row.modelPath + (row.visible && row.visibleMeshCount ? '' : ' [NOT VISIBLE]')
      ).join('\\n');
      output.textContent = [
        'Mode: ' + report.renderMode + ' | Mobile: ' + report.mobile,
        'GLB actors visible: ' + summary.visibleGlbActors,
        'GLB actors total: ' + summary.glbActors,
        'Fallback actors: ' + summary.fallbackActors,
        'Unique GLB paths: ' + summary.uniqueGlbPaths,
        '', 'BY ACTOR TYPE', categories || '(no actors recorded)',
        '', 'ACTIVE MODEL PATHS (first 18)', paths || '(no GLB model has replaced an actor yet)',
        '', 'Generated: ' + report.generatedAt,
      ].join('\\n');
    };
    createButton('REFRESH', refresh);
    createButton('DOWNLOAD JSON', () => {
      refresh();
      const report = this.getGlbSceneUsageReport();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'kano-life-glb-scene-usage.json';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    createButton('CLOSE', () => {
      if (this.glbSceneAuditTimer) clearInterval(this.glbSceneAuditTimer);
      this.glbSceneAuditTimer = null;
      panel.remove();
    });
    panel.append(title, controls, output);
    document.body.appendChild(panel);
    refresh();
    this.glbSceneAuditTimer = window.setInterval(refresh, 2500);
  }

`;
  const methodAnchor = '  upgradeWorldAssets() {';
  if (!output.includes(methodAnchor)) {
    throw new Error('[Kano GLB Scene] Could not locate upgradeWorldAssets() for audit method insertion.');
  }
  output = output.replace(methodAnchor, usageMethod + methodAnchor);

  const constructorEnd = '    this.buildLifeDioramas();\n\n    this.ready = true;\n  }';
  if (!output.includes(constructorEnd)) {
    throw new Error('[Kano GLB Scene] Could not locate the Renderer3D constructor end for audit setup.');
  }
  output = output.replace(constructorEnd, `    this.buildLifeDioramas();

    this.ready = true;
    this.glbSceneAuditTimer = null;
    if (typeof window !== 'undefined') {
      window.kanoGetGlbSceneUsageReport = () => this.getGlbSceneUsageReport();
      window.kanoDownloadGlbSceneUsageReport = () => {
        const report = this.getGlbSceneUsageReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'kano-life-glb-scene-usage.json';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return report;
      };
    }
    this.setupGlbSceneAuditPanel();
  }`);

  const classMarker = 'export class Renderer3D {';
  if (!output.includes(classMarker)) {
    throw new Error('[Kano GLB Scene] Renderer3D class marker is missing.');
  }
  output = output.replace(classMarker, marker + '\n' + classMarker);
  return output;
}

function replaceCatalog(source, catalog) {
  const startToken = 'const CATALOG = {';
  const marker = '// MODEL DIMENSIONS';
  const start = source.indexOf(startToken);
  const dimensionsAt = source.indexOf(marker, start < 0 ? 0 : start);
  if (start < 0 || dimensionsAt < 0) {
    throw new Error('Could not locate CATALOG and MODEL DIMENSIONS in js/ModelManager.js. The model manager source layout changed; no files were rewritten.');
  }
  const closing = source.lastIndexOf('};', dimensionsAt);
  if (closing < start) throw new Error('Could not find the end of CATALOG in js/ModelManager.js.');
  const generated = `const CATALOG = ${JSON.stringify(catalog, null, 2)};`;
  return `${source.slice(0, start)}${generated}${source.slice(closing + 2)}`;
}

export function createGlbCatalogSyncPlugin() {
  const state = { root: process.cwd(), publicDir: 'public', modelRoot: '', overridesFile: '', latestReport: null };
  const auditPath = '/assets/models/model-catalog-audit.generated.json';

  async function refreshReport() {
    state.latestReport = await scanGlbCatalog(state.modelRoot, state.overridesFile);
    return state.latestReport;
  }

  return {
    name: 'kano-life-glb-catalog-sync',
    enforce: 'pre',
    async configResolved(config) {
      state.root = config.root;
      state.publicDir = config.publicDir === false
        ? ''
        : (typeof config.publicDir === 'string' ? config.publicDir : 'public');
      state.modelRoot = path.resolve(state.root, state.publicDir, 'assets', 'models');
      state.overridesFile = path.resolve(state.root, 'scripts', 'glb-catalog-overrides.json');
      await refreshReport();
    },
    async buildStart() {
      const report = await refreshReport();
      if (report.discoveredCount > 0) {
        this.emitFile({
          type: 'asset',
          fileName: 'assets/models/model-catalog-audit.generated.json',
          source: JSON.stringify(report, null, 2),
        });
        const populated = Object.entries(report.categoryCounts).filter(([, count]) => count > 0).map(([key, count]) => `${key}:${count}`);
        console.info(`[Kano GLB Catalog] Discovered ${report.discoveredCount} actual GLB files. Populated categories: ${populated.join(', ')}`);
        if (report.unclassified.length) console.warn(`[Kano GLB Catalog] ${report.unclassified.length} file(s) remain unclassified; see assets/models/model-catalog-audit.generated.json.`);
        if (report.overrideAudit?.errors?.length) console.warn('[Kano GLB Catalog] Manual override warnings:', report.overrideAudit.errors);
        if (report.overrideAudit?.appliedCategories?.length) console.info(`[Kano GLB Catalog] Manual overrides applied to: ${report.overrideAudit.appliedCategories.join(', ')}`);
      } else {
        console.warn(`[Kano GLB Catalog] No GLBs found under ${state.modelRoot}; leaving the original model catalogue in place.`);
      }
    },
    async transform(source, id) {
      const normalizedId = id.split('?')[0].replace(/\\/g, '/');
      if (normalizedId.endsWith('/js/renderer3d.js')) {
        const transformedRenderer = patchRenderer3dModelActivation(source);
        return { code: transformedRenderer, map: null };
      }
      if (!normalizedId.endsWith('/js/ModelManager.js')) return null;
      const report = await refreshReport();
      if (!report.discoveredCount) return null;
      const transformedCatalog = replaceCatalog(source, report.catalog);
      const transformed = patchModelManagerVariants(transformedCatalog);
      return { code: transformed, map: null };
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        let pathname = '';
        try { pathname = new URL(req.url || '/', 'http://localhost').pathname; } catch { /* invalid request */ }
        if (pathname !== auditPath) return next();
        try {
          const report = await refreshReport();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(report, null, 2));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: error?.message || 'GLB catalog scan failed' }));
        }
      });
      server.watcher.add(state.modelRoot);
      server.watcher.add(state.overridesFile);
      const managerPath = path.resolve(state.root, 'js', 'ModelManager.js');
      const invalidateAndReload = () => {
        refreshReport().catch((error) => console.warn('[Kano GLB Catalog] rescan failed', error));
        const module = server.moduleGraph.getModuleById(managerPath);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload', path: '*' });
      };
      const onModelFolderChange = (changedPath) => {
        const normalized = changedPath.replace(/\\/g, '/').toLowerCase();
        if (normalized.endsWith('.glb')) invalidateAndReload();
        else if (path.resolve(changedPath) === path.resolve(state.overridesFile)) invalidateAndReload();
      };
      server.watcher.on('add', onModelFolderChange);
      server.watcher.on('change', onModelFolderChange);
      server.watcher.on('unlink', onModelFolderChange);
    },
  };
}

export { CATALOG_KEYS };
