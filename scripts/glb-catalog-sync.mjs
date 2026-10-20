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
      if (!normalizedId.endsWith('/js/ModelManager.js')) return null;
      const report = await refreshReport();
      if (!report.discoveredCount) return null;
      const transformed = replaceCatalog(source, report.catalog);
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
