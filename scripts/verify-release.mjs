import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_DIST = process.argv.includes('--dist');
const TARGET_ROOT = CHECK_DIST ? path.join(ROOT, 'dist') : ROOT;
const failures = [];
const warnings = [];
let checks = 0;

function pass(message) {
  checks += 1;
  console.log(`PASS ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN ${message}`);
}

function readRequired(filePath, label) {
  if (!existsSync(filePath)) {
    fail(`${label} is missing: ${path.relative(ROOT, filePath)}`);
    return null;
  }
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`Could not read ${label}: ${error.message}`);
    return null;
  }
}

function countMatches(text, expression) {
  return [...text.matchAll(expression)].length;
}

function checkHtmlDocument(html, htmlPath) {
  if (!html) return;
  const label = path.relative(ROOT, htmlPath);
  const normalized = html.replace(/^\uFEFF/, '').trimStart();

  if (!/^<!doctype\s+html\s*>/i.test(normalized)) {
    fail(`${label} must begin with <!doctype html>.`);
  } else {
    pass(`${label} begins with a valid HTML doctype`);
  }

  const htmlOpenCount = countMatches(html, /<html\b/gi);
  const htmlCloseCount = countMatches(html, /<\/html\s*>/gi);
  const bodyOpenCount = countMatches(html, /<body\b/gi);
  const bodyCloseCount = countMatches(html, /<\/body\s*>/gi);

  if (htmlOpenCount !== 1 || htmlCloseCount !== 1) {
    fail(`${label} must contain exactly one <html> opening and closing tag (found ${htmlOpenCount} opens, ${htmlCloseCount} closes).`);
  } else {
    pass(`${label} has exactly one HTML document root`);
  }

  if (bodyOpenCount !== 1 || bodyCloseCount !== 1) {
    fail(`${label} must contain exactly one <body> opening and closing tag (found ${bodyOpenCount} opens, ${bodyCloseCount} closes).`);
  } else {
    pass(`${label} has exactly one body`);
  }

  if (!/<\/html\s*>\s*$/i.test(html)) {
    fail(`${label} must end with </html>.`);
  } else {
    pass(`${label} ends cleanly with </html>`);
  }

  const scriptEntryMatches = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  const mainEntry = scriptEntryMatches.some((match) => /(?:^|\/)js\/main\.js(?:[?#].*)?$/i.test(match[1]));
  if (!mainEntry) {
    fail(`${label} must load /js/main.js (or ./js/main.js) as a script entry.`);
  } else {
    pass(`${label} loads the JavaScript game entry point`);
  }

  if (countMatches(html, /<!doctype\s+html/gi) !== 1) {
    fail(`${label} contains multiple HTML doctype declarations.`);
  } else {
    pass(`${label} contains a single doctype declaration`);
  }

  // This detects the exact class of regression that broke the Vercel build:
  // JavaScript module code was accidentally pasted into index.html.
  const contaminationChecks = [
    [/\bexport\s+class\s+Game\b/, 'export class Game'],
    [/\bspawnInitial\s*\(\s*\)\s*\{/, 'spawnInitial() method'],
    [/\bthis\.spawnZone\s*\(/, 'game-engine this.spawnZone() call'],
    [/\bconst\s+randomBetween\s*=\s*\(/, 'game-engine randomBetween declaration'],
    [/\bimport\s*\{\s*ROUTES\s*,\s*DRIVERS\s*,\s*RADIO\s*[,}]/, 'game.js configuration imports'],
  ];

  for (const [expression, description] of contaminationChecks) {
    if (expression.test(html)) {
      fail(`${label} contains JavaScript game-engine code (${description}).`);
    }
  }

  if (!contaminationChecks.some(([expression]) => expression.test(html))) {
    pass(`${label} contains no known pasted game-engine code signatures`);
  }

  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*type\s*=\s*["']module["']/i.test(html)) {
    warn(`${label} includes an inline ES module script; check that it is intentional.`);
  }

  // Validate local HTML script and stylesheet references. Vite public assets
  // may live at the project root while the source tree uses /public.
  const localAttributes = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  for (const match of localAttributes) {
    const url = match[1].trim();
    if (!url || /^(?:https?:|data:|blob:|#|\/\/)/i.test(url)) continue;
    const clean = url.split(/[?#]/, 1)[0];
    const candidate = path.resolve(path.dirname(htmlPath), clean);
    if (existsSync(candidate)) continue;
    const rootCandidate = path.resolve(TARGET_ROOT, clean.replace(/^\.\//, '').replace(/^\//, ''));
    const publicCandidate = path.resolve(ROOT, 'public', clean.replace(/^\.\//, '').replace(/^\//, ''));
    if (existsSync(rootCandidate) || existsSync(publicCandidate)) continue;
    // Avoid false positives for external links embedded in <a>; only src/href
    // on script/link elements are collected by this expression.
    fail(`${label} references a missing local script/style asset: ${url}`);
  }
}

function listJavaScriptFiles(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', '.vercel'].includes(name)) continue;
    const absolute = path.join(dir, name);
    const stat = statSync(absolute);
    if (stat.isDirectory()) listJavaScriptFiles(absolute, output);
    else if (/\.(?:m?js|cjs)$/i.test(name)) output.push(absolute);
  }
  return output;
}

function checkLocalImports() {
  if (CHECK_DIST) return;
  const jsRoot = path.join(ROOT, 'js');
  const files = listJavaScriptFiles(jsRoot);
  if (!files.length) {
    fail('No JavaScript modules found under js/.');
    return;
  }

  const importPattern = /\b(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g;
  let missingCount = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (/^(?:https?:|data:|node:)/i.test(specifier)) continue;
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue;

      const pathname = specifier.split(/[?#]/, 1)[0];
      const target = pathname.startsWith('/')
        ? path.resolve(ROOT, pathname.slice(1))
        : path.resolve(path.dirname(file), pathname);

      if (!existsSync(target)) {
        missingCount += 1;
        fail(`${path.relative(ROOT, file)} imports a missing local file: ${specifier}`);
      }
    }
  }

  if (missingCount === 0) {
    pass(`all local imports resolve across ${files.length} JavaScript module(s)`);
  }
}

console.log(`[Kano Release Check] ${CHECK_DIST ? 'Checking built deployment output' : 'Checking source project'}`);

if (!CHECK_DIST) {
  const packageText = readRequired(path.join(ROOT, 'package.json'), 'package.json');
  if (packageText) {
    try {
      const pkg = JSON.parse(packageText);
      if (pkg.type === 'module') pass('package.json declares ES modules');
      else fail('package.json should declare "type": "module".');
      if (pkg.dependencies?.three) pass('Three.js dependency is declared');
      else fail('package.json is missing the three dependency.');
      if (pkg.devDependencies?.vite || pkg.dependencies?.vite) pass('Vite build dependency is declared');
      else fail('package.json is missing Vite.');
      if (pkg.scripts?.build) pass('a production build script is defined');
      else fail('package.json is missing scripts.build.');
    } catch (error) {
      fail(`package.json is invalid JSON: ${error.message}`);
    }
  }

  const entry = path.join(ROOT, 'js', 'main.js');
  if (existsSync(entry)) pass('js/main.js exists');
  else fail('js/main.js is missing.');
}

const indexPath = path.join(TARGET_ROOT, 'index.html');
const html = readRequired(indexPath, CHECK_DIST ? 'dist/index.html' : 'index.html');
checkHtmlDocument(html, indexPath);
checkLocalImports();

console.log(`\n[Kano Release Check] ${checks} check(s) passed; ${warnings.length} warning(s); ${failures.length} failure(s).`);
if (warnings.length) {
  console.log('\nWarnings:');
  for (const message of warnings) console.log(`- ${message}`);
}
if (failures.length) {
  console.error('\nFix the listed release blockers before deploying to Vercel.');
  process.exit(1);
}

console.log('Release structure looks valid. Run npm run build to verify Vite can bundle the application.');
