import fs from 'node:fs';
import path from 'node:path';

export const CATALOG_KEYS = [
  'keke', 'car', 'taxi', 'suv', 'truck', 'bus', 'motorcycle', 'police',
  'karota', 'ambulance', 'passenger', 'passengerWoman', 'passengerMan',
  'passengerVIP', 'security', 'pedestrian', 'pedestrianWoman', 'building',
  'industrialBuilding', 'flyover', 'roadlight', 'cone', 'dirtmound', 'bench',
  'busStop', 'trafficLight', 'stopSign', 'marketStall',
];

const normalizeRel = (value) => String(value || '').split(path.sep).join('/');
const normalizedPath = (value) => normalizeRel(value).replace(/^\/+/, '').replace(/\\/g, '/');
const hintsText = (file) => `${file?.path || ''} ${(file?.hints || []).join(' ')}`.toLowerCase().replace(/[_-]+/g, ' ');
const has = (text, regex) => regex.test(String(text || '').toLowerCase());
const pathKey = (item) => typeof item === 'string' ? item : normalizedPath(item?.path ?? item?.relativePath ?? '');

// Accepts either paths or GLB records. This prevents the earlier
// a.localeCompare is not a function crash and deduplicates records by path.
export function uniqueSorted(items = []) {
  const byPath = new Map();
  for (const item of items || []) {
    const key = pathKey(item);
    if (!key) continue;
    if (!byPath.has(key)) byPath.set(key, item);
  }
  return [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item);
}

export function readGlbHints(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 20 || buffer.toString('utf8', 0, 4) !== 'glTF') return [];
    const jsonLength = buffer.readUInt32LE(12);
    const jsonType = buffer.readUInt32LE(16);
    // GLB JSON chunk type = ASCII "JSON" in little-endian byte order.
    if (jsonType !== 0x4e4f534a || jsonLength <= 0 || 20 + jsonLength > buffer.length) return [];
    const document = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).replace(/[\u0000\u0009\u000a\u000d\u0020]+$/g, ''));
    const found = [];
    if (document.asset?.generator) found.push(document.asset.generator);
    if (document.asset?.copyright) found.push(document.asset.copyright);
    for (const collection of ['scenes', 'nodes', 'meshes', 'materials', 'animations']) {
      for (const entry of document[collection] || []) if (typeof entry?.name === 'string') found.push(entry.name);
    }
    return found.filter(Boolean).slice(0, 300);
  } catch {
    return [];
  }
}

function walkGlbFiles(directory, root = directory) {
  if (!fs.existsSync(directory)) return [];
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return []; }
  const result = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkGlbFiles(absolutePath, root));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
      result.push({ absolutePath, path: normalizeRel(path.relative(root, absolutePath)) });
    }
  }
  return result;
}

function inside(file, directory) {
  const candidate = `/${normalizedPath(file?.path).toLowerCase()}/`;
  const target = `/${String(directory || '').toLowerCase().replace(/^\/+|\/+$/g, '')}/`;
  return candidate.includes(target);
}

function normaliseOverridePath(value) {
  return normalizedPath(value).replace(/^assets\/models\//i, '');
}

function allowedForCategory(key, file) {
  const p = normalizedPath(file?.path).toLowerCase();
  const inVehicles = inside(file, 'vehicles');
  const inCharacters = inside(file, 'characters');
  const inWorld = inside(file, 'world');
  const inEnvironment = inside(file, 'environment');
  if (key === 'keke') {
    // Hard safety rule: a pedestrian named "keke female" is still a person.
    // Only models inside the vehicle tree can become the player's keke.
    return inVehicles && !/\b(woman|women|female|girl|person|people|pedestrian|passenger|human|character|almajiri)\b/i.test(p.replace(/[_-]+/g, ' '));
  }
  if (['car', 'taxi', 'suv', 'truck', 'bus', 'motorcycle', 'ambulance', 'karota'].includes(key)) return inVehicles;
  if (key === 'police') return inVehicles || (inWorld && /police|patrol/i.test(p));
  if (['passenger', 'passengerWoman', 'passengerMan', 'passengerVIP', 'security', 'pedestrian', 'pedestrianWoman'].includes(key)) return inCharacters;
  if (key === 'dirtmound') return inEnvironment;
  if (['building', 'industrialBuilding', 'flyover', 'roadlight', 'cone', 'bench', 'busStop', 'trafficLight', 'stopSign', 'marketStall'].includes(key)) return inWorld;
  return false;
}

function categoryCandidates(files, key) {
  const under = (directory) => files.filter((file) => inside(file, directory));
  const matching = (regex, candidates = files) => candidates.filter((file) => has(hintsText(file), regex));
  const allVehicles = under('vehicles');
  const carsDir = under('vehicles/cars');
  const specialVehicleText = /\b(motorcycle|motorbike|motor bike|okada|scooter|ktm|spyder|bus|coach|minibus|coaster|truck|lorry|freight|cargo|peterbilt|volvo fh|cement truck|pickup|police|patrol|karota|ambulance)\b/;
  const ordinaryCars = carsDir.filter((file) => !has(hintsText(file), specialVehicleText));
  const passengerFiles = under('characters/passengers');
  const pedestrianFiles = under('characters/pedestrians');
  const characterFiles = uniqueSorted([...passengerFiles, ...pedestrianFiles].map((file) => file.path)).map((p) => files.find((file) => file.path === p)).filter(Boolean);
  const worldFiles = under('world');
  const environmentFiles = under('environment');
  const suburbanBuildings = under('world/buildings-suburban');
  const industrialBuildings = under('world/buildings-industrial');

  switch (key) {
    case 'keke': {
      // A renamed model remains discoverable by its stable vehicle folder.
      // Filename/embedded-name matching is restricted to the vehicle tree.
      const kekeDir = under('vehicles/keke');
      const namedVehicleCandidates = matching(/\b(keke|napep|adaidaita|tricycle|auto rickshaw|three wheeler|tuk tuk)\b/, allVehicles)
        .filter((file) => !/\b(woman|women|female|girl|person|people|pedestrian|passenger|human|character|almajiri)\b/.test(hintsText(file)));
      return uniqueSorted([...kekeDir, ...namedVehicleCandidates]);
    }
    case 'car': return ordinaryCars.length ? ordinaryCars : carsDir;
    case 'taxi': { const m = matching(/\btaxi\b/, allVehicles); return m.length ? m : (ordinaryCars.length ? ordinaryCars : carsDir); }
    case 'suv': return matching(/\b(suv|jeep|crossover|4x4|sport utility|nissan juke)\b/, [...allVehicles, ...under('world/props')]);
    case 'truck': return matching(/\b(truck|lorry|freight|cargo|peterbilt|volvo fh|cement truck|pickup|dodge ram)\b/, allVehicles);
    case 'bus': return matching(/\b(bus|coach|minibus|coaster|omnibus|transit bus)\b/, allVehicles);
    case 'motorcycle': return matching(/\b(motorcycle|motorbike|motor bike|okada|scooter|ktm|spyder|can am)\b/, allVehicles);
    case 'police': return matching(/\b(police car|police vehicle|patrol car|police)\b/, [...allVehicles, ...under('world/props')]);
    case 'karota': return matching(/\b(karota|kano road traffic|traffic enforcement)\b/, allVehicles);
    case 'ambulance': return matching(/\b(ambulance|emergency medical)\b/, allVehicles);
    case 'passenger': return passengerFiles;
    case 'passengerWoman': { const m = matching(/\b(woman|women|female|girl|hijab|muslim woman|lady|wife)\b/, passengerFiles); return m.length ? m : passengerFiles; }
    case 'passengerMan': { const m = matching(/\b(man|men|male|gentleman|boy|handsome man)\b/, passengerFiles); return m.length ? m : passengerFiles; }
    case 'passengerVIP': { const m = matching(/\b(vip|suit|formal|businessman|executive)\b/, passengerFiles); return m.length ? m : passengerFiles; }
    case 'security': { const m = matching(/\b(security|police man|policeman|officer|karota|traffic officer|guard)\b/, characterFiles); return m.length ? m : pedestrianFiles; }
    case 'pedestrian': return pedestrianFiles;
    case 'pedestrianWoman': { const m = matching(/\b(woman|women|female|girl|hijab|lady|keke female)\b/, pedestrianFiles); return m.length ? m : pedestrianFiles; }
    case 'building': {
      const names = matching(/\b(building|buildings|house|home|bungalow|villa|residential|commercial|shopfront|storefront|compound|architecture|shop|store)\b/, worldFiles);
      return uniqueSorted([...suburbanBuildings, ...names.filter((file) => !has(hintsText(file), /\b(industrial|factory|warehouse|workshop|shed|stall|kiosk|bus stop|street light|pole|sign|cone|bench)\b/))]);
    }
    case 'industrialBuilding': {
      const names = matching(/\b(industrial|factory|warehouse|workshop|shed|manufacturing)\b/, worldFiles);
      return uniqueSorted([...industrialBuildings, ...names]);
    }
    case 'flyover': return matching(/\b(flyover|fly over|overpass|elevated road|highway bridge|road bridge|viaduct)\b/, worldFiles);
    case 'roadlight': return matching(/\b(light pole|street light|streetlight|road light|roadlight|electricity pole|lamp post|lamppost|street lamp)\b/, worldFiles);
    case 'cone': return matching(/\b(cone|construction barrier|road barrier|traffic barrier)\b/, worldFiles);
    case 'bench': return matching(/\b(bench|public seat|park bench)\b/, worldFiles);
    case 'busStop': return matching(/\b(bus stop|busstop|bus shelter|transit shelter)\b/, worldFiles);
    case 'trafficLight': return matching(/\b(traffic light|trafficlight|signal light|traffic signal)\b/, worldFiles);
    case 'stopSign': return matching(/\b(stop sign|stopsign|road sign stop)\b/, worldFiles);
    case 'marketStall': return matching(/\b(market stall|market-stall|stall|kiosk|vendor stand|market stand|street vendor|produce stand|roadside shop|market booth)\b/, worldFiles);
    case 'dirtmound': return matching(/\b(pothole|manhole|sand|dirt|ground|asphalt|road damage|broken road|gravel|mud)\b/, environmentFiles);
    default: return [];
  }
}

export function makeCatalog(files, overrides = {}) {
  const catalog = Object.fromEntries(CATALOG_KEYS.map((key) => [key, []]));
  const reasons = new Map((files || []).map((file) => [normalizedPath(file.path), new Set()]));
  const warnings = [];
  const available = new Map((files || []).map((file) => [normalizedPath(file.path), file]));
  const assign = (key, candidates) => {
    const paths = uniqueSorted(candidates.map((item) => typeof item === 'string' ? item : item.path)).map((item) => normalizedPath(item));
    catalog[key] = paths;
    for (const relativePath of paths) reasons.get(relativePath)?.add(key);
  };

  for (const key of CATALOG_KEYS) {
    const candidates = categoryCandidates(files || [], key).filter((file) => allowedForCategory(key, file));
    assign(key, candidates);
  }

  // Overrides replace detected candidates for explicitly named categories.
  // Paths are validated against the real inventory and category-specific path
  // safety rules before they can enter the runtime CATALOG.
  const categories = overrides?.categories && typeof overrides.categories === 'object' ? overrides.categories : {};
  for (const [rawKey, values] of Object.entries(categories)) {
    const key = CATALOG_KEYS.includes(rawKey) ? rawKey : null;
    if (!key) { warnings.push(`Unknown override category: ${rawKey}`); continue; }
    if (!Array.isArray(values) || !values.length) continue;
    const accepted = [];
    for (const value of values) {
      const requestedPath = normaliseOverridePath(value);
      const file = available.get(requestedPath);
      if (!file) { warnings.push(`Override path not found (case-sensitive): ${requestedPath}`); continue; }
      if (!allowedForCategory(key, file)) {
        warnings.push(`Rejected unsafe mapping: ${requestedPath} cannot be used as ${key}.`);
        continue;
      }
      accepted.push(file.path);
    }
    if (accepted.length) {
      for (const oldPath of catalog[key]) reasons.get(oldPath)?.delete(key);
      assign(key, accepted);
      for (const acceptedPath of catalog[key]) reasons.get(acceptedPath)?.add(key);
    } else {
      warnings.push(`No valid override entries for ${key}; automatic safe candidates were retained.`);
    }
  }

  const exclude = overrides?.exclude && typeof overrides.exclude === 'object' ? overrides.exclude : {};
  for (const [rawKey, values] of Object.entries(exclude)) {
    if (!CATALOG_KEYS.includes(rawKey)) { warnings.push(`Unknown exclude category: ${rawKey}`); continue; }
    if (!Array.isArray(values)) continue;
    const remove = new Set(values.map(normaliseOverridePath));
    catalog[rawKey] = catalog[rawKey].filter((relativePath) => {
      if (!remove.has(relativePath)) return true;
      reasons.get(relativePath)?.delete(rawKey);
      return false;
    });
  }

  const unsafeKekeMatches = (files || []).filter((file) => /\b(keke|napep|adaidaita|tricycle)\b/.test(hintsText(file)) && !inside(file, 'vehicles'))
    .map((file) => ({ path: file.path, reason: 'Filename/internal name mentions a keke, but it is outside the vehicles folder; it cannot be the player vehicle.' }));
  const allAssigned = new Set([...reasons.entries()].filter(([, keys]) => keys.size > 0).map(([relativePath]) => relativePath));
  const fileReports = (files || []).map((file) => ({
    path: normalizedPath(file.path),
    bytes: Number(file.bytes) || 0,
    internalNames: (file.hints || []).filter((value) => value && value.length < 100).slice(0, 25),
    categories: [...(reasons.get(normalizedPath(file.path)) || [])].sort(),
    classified: (reasons.get(normalizedPath(file.path)) || new Set()).size > 0,
  }));
  const populatedCatalog = Object.fromEntries(Object.entries(catalog).map(([key, values]) => [key, uniqueSorted(values)]));
  return {
    catalog: populatedCatalog,
    files: fileReports,
    unclassified: (files || []).filter((file) => !allAssigned.has(normalizedPath(file.path))).map((file) => normalizedPath(file.path)).sort(),
    categoryCounts: Object.fromEntries(CATALOG_KEYS.map((key) => [key, populatedCatalog[key].length])),
    unsafeKekeMatches,
    overrideWarnings: warnings,
  };
}

export async function scanGlbCatalog(modelRoot, overridesPath = null) {
  const discovered = walkGlbFiles(modelRoot).map((file) => {
    let bytes = 0;
    try { bytes = fs.statSync(file.absolutePath).size; } catch { /* asset changed while scanning */ }
    return { ...file, bytes, hints: readGlbHints(file.absolutePath) };
  }).sort((a, b) => a.path.localeCompare(b.path));

  let overrides = {};
  if (overridesPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
      overrides = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[Kano GLB Catalog] Could not read model overrides: ${error?.message || error}`);
    }
  }

  const mapping = makeCatalog(discovered, overrides);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    root: 'public/assets/models/',
    discoveredCount: discovered.length,
    note: discovered.length
      ? 'Model candidates are discovered from actual GLBs. A pedestrian or character cannot be assigned to the player keke solely because its filename contains the word "keke". Manual overrides are path-validated.'
      : 'No GLBs were found at the scanned model root. Existing static model catalogue was left unchanged.',
    catalog: mapping.catalog,
    categoryCounts: mapping.categoryCounts,
    unclassified: mapping.unclassified,
    files: mapping.files,
    unsafeKekeMatches: mapping.unsafeKekeMatches,
    overrideWarnings: mapping.overrideWarnings,
  };
}

function replaceCatalog(source, catalog) {
  const startToken = 'const CATALOG = {';
  const marker = '// MODEL DIMENSIONS';
  const start = source.indexOf(startToken);
  const dimensionsAt = source.indexOf(marker, start < 0 ? 0 : start);
  if (start < 0 || dimensionsAt < 0) {
    throw new Error('Could not locate CATALOG and MODEL DIMENSIONS in js/ModelManager.js. No files were rewritten.');
  }
  const closing = source.lastIndexOf('};', dimensionsAt);
  if (closing < start) throw new Error('Could not find the end of CATALOG in js/ModelManager.js.');
  const generated = `const CATALOG = ${JSON.stringify(catalog, null, 2)};`;
  return `${source.slice(0, start)}${generated}${source.slice(closing + 2)}`;
}

export function createGlbCatalogSyncPlugin() {
  const state = { root: process.cwd(), publicDir: 'public', modelRoot: '', overridesPath: '', latestReport: null };
  const auditPath = '/assets/models/model-catalog-audit.generated.json';

  async function refreshReport() {
    state.latestReport = await scanGlbCatalog(state.modelRoot, state.overridesPath);
    return state.latestReport;
  }
  return {
    name: 'kano-life-glb-catalog-sync',
    enforce: 'pre',
    async configResolved(config) {
      state.root = config.root;
      state.publicDir = config.publicDir === false ? '' : (typeof config.publicDir === 'string' ? config.publicDir : 'public');
      state.modelRoot = path.resolve(state.root, state.publicDir, 'assets', 'models');
      state.overridesPath = path.resolve(state.root, 'scripts', 'glb-catalog-overrides.json');
      await refreshReport();
    },
    async buildStart() {
      const report = await refreshReport();
      if (report.discoveredCount > 0) {
        this.emitFile({ type: 'asset', fileName: 'assets/models/model-catalog-audit.generated.json', source: JSON.stringify(report, null, 2) });
        const populated = Object.entries(report.categoryCounts).filter(([, count]) => count > 0).map(([key, count]) => `${key}:${count}`);
        console.info(`[Kano GLB Catalog] Discovered ${report.discoveredCount} actual GLB files. Populated categories: ${populated.join(', ')}`);
        if (report.unsafeKekeMatches.length) console.warn(`[Kano GLB Catalog] Excluded ${report.unsafeKekeMatches.length} non-vehicle asset(s) whose names mention keke; see unsafeKekeMatches in the generated audit.`);
        if (report.overrideWarnings.length) console.warn(`[Kano GLB Catalog] ${report.overrideWarnings.length} manual mapping warning(s); see overrideWarnings in the generated audit.`);
        if (report.unclassified.length) console.warn(`[Kano GLB Catalog] ${report.unclassified.length} file(s) remain unclassified; inspect the generated model audit.`);
      } else {
        console.warn(`[Kano GLB Catalog] No GLBs found under ${state.modelRoot}; leaving the original static model catalogue unchanged.`);
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
        try { pathname = new URL(req.url || '/', 'http://localhost').pathname; } catch { /* malformed request */ }
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
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ error: error?.message || 'GLB catalog scan failed' }));
        }
      });
      if (state.modelRoot) server.watcher.add(state.modelRoot);
      if (state.overridesPath) server.watcher.add(state.overridesPath);
      const onModelFolderChange = (changedPath) => {
        const normalized = changedPath.replace(/\\/g, '/').toLowerCase();
        if (!normalized.endsWith('.glb') && !normalized.endsWith('/glb-catalog-overrides.json')) return;
        refreshReport().catch((error) => console.warn('[Kano GLB Catalog] rescan failed', error));
        const managerPath = path.resolve(state.root, 'js', 'ModelManager.js');
        const module = server.moduleGraph.getModuleById(managerPath);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload', path: '*' });
      };
      server.watcher.on('add', onModelFolderChange);
      server.watcher.on('unlink', onModelFolderChange);
      server.watcher.on('change', onModelFolderChange);
    },
  };
}
