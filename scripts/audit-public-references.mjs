import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanGlbCatalog } from './glb-catalog-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'artifacts', 'public-reference-audit');
const SOURCE_EXTS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.webmanifest', '.yml', '.yaml']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', 'artifacts']);

function walk(dir, root = dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(absolute, root));
    else if (entry.isFile()) result.push({ absolute, rel: path.relative(root, absolute).split(path.sep).join('/') });
  }
  return result;
}

const allProjectFiles = walk(ROOT).filter((item) => SOURCE_EXTS.has(path.extname(item.rel).toLowerCase()));
const searchFiles = allProjectFiles.filter(({ rel }) => !rel.startsWith('tests/') && !rel.startsWith('docs/') && !rel.startsWith('patches/') && rel !== 'ASSET-MANIFEST.csv');
const corpus = searchFiles.map(({ absolute, rel }) => {
  try { return { rel, text: fs.readFileSync(absolute, 'utf8').toLowerCase() }; }
  catch { return { rel, text: '' }; }
});
const publicFiles = walk(PUBLIC).map(({ absolute, rel }) => ({ absolute, rel: `/${rel}` }));
// Declare the model root before either URI traversal or catalog discovery uses it.
// Keeping this above the first `existsSync(modelRoot)` avoids a temporal-dead-zone crash.
const modelRoot = path.join(PUBLIC, 'assets', 'models');
const externalModelRefs = new Set();
function addExternalUri(modelFile, uri) {
  if (typeof uri !== 'string' || !uri || uri.startsWith('data:') || /^https?:\/\//i.test(uri)) return;
  const clean = uri.split(/[?#]/, 1)[0];
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch {}
  const absolute = decoded.startsWith('/')
    ? path.resolve(PUBLIC, `.${decoded}`)
    : path.resolve(path.dirname(modelFile), decoded);
  const publicPrefix = `${path.resolve(PUBLIC)}${path.sep}`;
  if (absolute.startsWith(publicPrefix)) {
    externalModelRefs.add(`/${path.relative(PUBLIC, absolute).split(path.sep).join('/')}`.toLowerCase());
  }
}
function readModelUris(file) {
  try {
    const buffer = fs.readFileSync(file);
    let document;
    if (path.extname(file).toLowerCase() === '.gltf') {
      document = JSON.parse(buffer.toString('utf8'));
    } else {
      if (buffer.length < 20 || buffer.toString('utf8', 0, 4) !== 'glTF') return;
      const jsonLength = buffer.readUInt32LE(12);
      const jsonType = buffer.readUInt32LE(16);
      if (jsonType !== 0x4e4f534a || 20 + jsonLength > buffer.length) return;
      document = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).replace(/[\u0000\u0009\u000a\u000d\u0020]+$/g, ''));
    }
    for (const item of [...(document.images || []), ...(document.buffers || [])]) addExternalUri(file, item?.uri);
  } catch { /* corrupt models are reported by the dedicated GLB audit */ }
}
if (fs.existsSync(modelRoot)) {
  for (const file of walk(modelRoot)) {
    if (/\.(?:glb|gltf)$/i.test(file.rel)) readModelUris(file.absolute);
  }
}
const exactPath = (rel) => {
  const withoutSlash = rel.replace(/^\//, '');
  return [rel.toLowerCase(), withoutSlash.toLowerCase(), `public${rel}`.toLowerCase()];
};
const findings = [];

// The build plugin discovers models dynamically. Use its real category mapping
// to avoid falsely calling catalog-driven GLBs unused simply because filenames
// are not hard-coded in the renderer source.
let catalog = null;
if (fs.existsSync(modelRoot)) {
  try { catalog = await scanGlbCatalog(modelRoot, path.join(ROOT, 'scripts', 'glb-catalog-overrides.json')); }
  catch (error) { console.warn(`[Public Asset Audit] GLB catalogue scan unavailable: ${error.message}`); }
}
const glbByPublicPath = new Map((catalog?.files || []).map((item) => [`/assets/models/${item.path}`.toLowerCase(), item]));

for (const file of publicFiles) {
  const rel = file.rel;
  const lowerPath = rel.toLowerCase();
  if (externalModelRefs.has(lowerPath)) continue;
  const basename = path.posix.basename(rel).toLowerCase();
  const ext = path.posix.extname(rel).toLowerCase();

  if (lowerPath.startsWith('/assets/models/') && ext === '.glb') {
    const record = glbByPublicPath.get(lowerPath);
    if (record?.classified) continue;
    findings.push({ path: rel, bytes: safeSize(file.absolute), status: 'REVIEW_UNCLASSIFIED_GLB', evidence: 'GLB was discovered by the actual-asset catalogue scanner but assigned to no runtime category. Keep pending manual visual/source review.' });
    continue;
  }

  const keys = exactPath(rel);
  let exactHits = [];
  for (const source of corpus) {
    if (keys.some((key) => source.text.includes(key))) exactHits.push(source.rel);
  }
  if (exactHits.length) continue;

  // Basename hits are only a weak signal: URLs composed from a directory plus
  // filename may be real, while similarly named copies in another directory are not.
  const basenameHits = corpus.filter((source) => basename && source.text.includes(basename));
  if (basenameHits.length) {
    findings.push({ path: rel, bytes: safeSize(file.absolute), status: 'REVIEW_PATH_OR_DYNAMIC_REFERENCE', evidence: `Full public path not found; basename occurs in ${basenameHits.slice(0, 5).map((item) => item.rel).join(', ')}. Review before moving.` });
  } else {
    findings.push({ path: rel, bytes: safeSize(file.absolute), status: 'REVIEW_NO_TEXT_REFERENCE', evidence: 'No direct path or basename reference found in scanned JavaScript, CSS, HTML, or configuration. GLB/glTF external image and buffer URIs are also followed into public files.' });
  }
}

function safeSize(file) {
  try { return fs.statSync(file).size; } catch { return null; }
}

const bytes = findings.reduce((sum, item) => sum + (item.bytes || 0), 0);
const lines = [
  '# Public Asset Reference Audit',
  '',
  `- Generated: ${new Date().toISOString()}`,
  `- Public files scanned: ${publicFiles.length}`,
  `- Source/config files searched: ${corpus.length}`,
  `- Review candidates: ${findings.length}`,
  `- Candidate bytes (files that exist on disk): ${bytes}`,
  '',
  '> This report is advisory. It never deletes or moves files. Check model references, GLB external texture URIs, runtime-generated paths, and desired future content before approving any move.',
  '',
  '| Status | Size (bytes) | Public path | Evidence |',
  '| --- | ---: | --- | --- |',
  ...findings.sort((a,b) => a.path.localeCompare(b.path)).map((item) => `| ${item.status} | ${item.bytes ?? 'unknown'} | \`${item.path}\` | ${item.evidence.replaceAll('|', '\\|')} |`),
  '',
];
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), scannedPublicFiles: publicFiles.length, scannedSourceFiles: corpus.length, candidateCount: findings.length, candidateBytes: bytes, findings }, null, 2) + '\n');
console.log(`[Public Asset Audit] Scanned ${publicFiles.length} public files and ${corpus.length} source/config files.`);
console.log(`[Public Asset Audit] ${findings.length} candidate(s) written to artifacts/public-reference-audit/report.md`);
console.log('[Public Asset Audit] No files were moved or deleted.');
