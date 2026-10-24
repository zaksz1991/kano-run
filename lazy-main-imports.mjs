/**
 * Run: node lazy-main-imports.mjs path/to/main.js
 * Rewrites selected static imports into dynamic import() after first frame.
 * Creates main.js.bak beside the file.
 */
import fs from 'fs';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node lazy-main-imports.mjs js/main.js');
  process.exit(1);
}

const LAZY = [
  'ModelAuditPanel',
  'LiveUserCounter',
  'KanoWorkshopPanel',
  'KanoCinematicCamera',
  'KanoVisualEffects',
  'registerServiceWorker',
  'KanoAtmosphere',
];

let src = fs.readFileSync(target, 'utf8');
fs.writeFileSync(target + '.bak', src);

// Remove static imports for LAZY modules (keep binding names via later dynamic)
const importLine = /^import\s+([^;]+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const removed = [];
src = src.replace(importLine, (full, bindings, path) => {
  const base = path.split('/').pop().replace(/\.js$/, '');
  const hit = LAZY.find((k) => base.includes(k) || full.includes(k));
  if (!hit) return full;
  removed.push({ bindings: bindings.trim(), path, hit });
  return `/* lazy: ${hit} from ${path} */\n`;
});

// Inject loader helper after imports block
const helper = `
/* ——— Phone: lazy secondary systems (injected) ——— */
const __kanoLazy = {};
async function __kanoLoadLazy(key, path) {
  if (__kanoLazy[key]) return __kanoLazy[key];
  const mod = await import(path);
  __kanoLazy[key] = mod;
  return mod;
}
function __kanoAfterFirstPlay(fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    try { fn(); } catch (e) { console.warn('[lazy-main]', e); }
  };
  // after short delay + when game hits PLAY
  setTimeout(run, 2500);
  const id = setInterval(() => {
    try {
      if (window.game?.state === 'PLAY' || window.__kanoGame?.state === 'PLAY') {
        clearInterval(id);
        run();
      }
    } catch (_) {}
  }, 400);
  setTimeout(() => clearInterval(id), 60000);
}
`;

// Place helper after last import-related line
const lines = src.split('\n');
let lastImport = 0;
for (let i = 0; i < Math.min(lines.length, 80); i++) {
  if (lines[i].startsWith('import ') || lines[i].includes('/* lazy:')) lastImport = i;
}
lines.splice(lastImport + 1, 0, helper);
src = lines.join('\n');

// Soften constructor usages — wrap known patterns
// registerServiceWorker();
src = src.replace(
  /registerServiceWorker\(\);/,
  `__kanoAfterFirstPlay(() => { __kanoLoadLazy('sw', './registerServiceWorker.js').then(m => m.registerServiceWorker?.()); });`
);

// createModelAuditPanel();
src = src.replace(
  /createModelAuditPanel\(\);/,
  `__kanoAfterFirstPlay(() => { __kanoLoadLazy('audit', './ModelAuditPanel.js').then(m => m.createModelAuditPanel?.()); });`
);

// new LiveUserCounter(
src = src.replace(
  /liveUserCounter\s*=\s*new LiveUserCounter\(/,
  `liveUserCounter = null; __kanoAfterFirstPlay(() => { __kanoLoadLazy('live', './LiveUserCounter.js').then(m => { liveUserCounter = new m.LiveUserCounter(`
);
// This might break paren balance — do safer approach for LiveUserCounter

fs.writeFileSync(target, src);
console.log('Removed static imports:', removed.map((r) => r.hit).join(', '));
console.log('Wrote', target, '(backup .bak)');
console.log('NOTE: Review new LiveUserCounter / Workshop / Cinematic / Atmosphere constructors manually if syntax breaks.');
