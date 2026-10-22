#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const ROOT = process.cwd();

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function decodeUri(uri) {
  const withoutQuery = String(uri).split(/[?#]/, 1)[0];
  try { return decodeURIComponent(withoutQuery); } catch { return withoutQuery; }
}

export function inspectGlbBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
    return { valid: false, reason: 'file is too short to be a GLB 2.0 container', json: null, containsColormap: false };
  }
  if (buffer.readUInt32LE(0) !== MAGIC) {
    return { valid: false, reason: 'invalid glTF binary magic', json: null, containsColormap: false };
  }
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (version !== 2) {
    return { valid: false, reason: `unsupported GLB version ${version}`, json: null, containsColormap: false };
  }
  if (declaredLength > buffer.length || declaredLength < 20) {
    return { valid: false, reason: 'declared GLB length is inconsistent with file size', json: null, containsColormap: false };
  }

  let offset = 12;
  let json = null;
  while (offset + 8 <= declaredLength) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (length > declaredLength - offset) {
      return { valid: false, reason: 'GLB chunk extends beyond declared file length', json: null, containsColormap: false };
    }
    if (type === JSON_CHUNK) {
      const raw = buffer.subarray(offset, offset + length).toString('utf8').replace(/[\u0000\s]+$/g, '');
      try {
        json = JSON.parse(raw);
      } catch (error) {
        return { valid: false, reason: `invalid JSON chunk: ${error.message}`, json: null, containsColormap: false };
      }
      break;
    }
    offset += length;
  }

  if (!json || typeof json !== 'object') {
    return { valid: false, reason: 'no JSON chunk found', json: null, containsColormap: false };
  }
  const text = JSON.stringify(json);
  return {
    valid: true,
    version,
    json,
    containsColormap: /colormap/i.test(text),
    externalImages: (Array.isArray(json.images) ? json.images : [])
      .map((image, index) => ({ index, uri: typeof image?.uri === 'string' ? image.uri : null }))
      .filter((image) => image.uri && !/^(data:|blob:|https?:|\/\/)/i.test(image.uri)),
  };
}

async function walkFiles(folder) {
  const files = [];
  let entries;
  try { entries = await fs.readdir(folder, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) files.push(full);
  }
  return files;
}

export async function auditGlbTextureReferences(modelsRoot = path.join(ROOT, 'public', 'assets', 'models')) {
  const absoluteRoot = path.resolve(modelsRoot);
  const files = await walkFiles(absoluteRoot);
  const colormapModels = [];
  const externalReferences = [];
  const invalidModels = [];

  for (const filename of files) {
    let buffer;
    try { buffer = await fs.readFile(filename); }
    catch (error) {
      invalidModels.push({ file: path.relative(ROOT, filename).replaceAll(path.sep, '/'), reason: `read error: ${error.message}` });
      continue;
    }
    const inspected = inspectGlbBuffer(buffer);
    const relativeFile = path.relative(ROOT, filename).replaceAll(path.sep, '/');
    if (!inspected.valid) {
      invalidModels.push({ file: relativeFile, reason: inspected.reason });
      continue;
    }

    if (inspected.containsColormap) {
      colormapModels.push({
        file: relativeFile,
        imageUris: inspected.externalImages.filter((item) => /colormap/i.test(item.uri)).map((item) => item.uri),
      });
    }

    for (const image of inspected.externalImages) {
      const uriPath = decodeUri(image.uri).replaceAll('\\', '/');
      const target = path.resolve(path.dirname(filename), uriPath);
      const withinModelsRoot = isInside(absoluteRoot, target);
      let exists = false;
      if (withinModelsRoot) {
        try { exists = (await fs.stat(target)).isFile(); } catch { exists = false; }
      }
      externalReferences.push({
        model: relativeFile,
        imageIndex: image.index,
        uri: image.uri,
        resolvedPath: path.relative(ROOT, target).replaceAll(path.sep, '/'),
        exists,
        outsideModelsRoot: !withinModelsRoot,
        isColormap: /colormap/i.test(image.uri),
      });
    }
  }

  const missingReferences = externalReferences.filter((reference) => !reference.exists);
  const result = {
    generatedAt: new Date().toISOString(),
    modelsRoot: path.relative(ROOT, absoluteRoot).replaceAll(path.sep, '/') || '.',
    glbCount: files.length,
    validGlbCount: files.length - invalidModels.length,
    colormapGlbCount: colormapModels.length,
    externalTextureReferenceCount: externalReferences.length,
    missingExternalTextureReferenceCount: missingReferences.length,
    colormapModels,
    externalReferences,
    missingReferences,
    invalidModels,
    note: 'Read-only audit. No assets are deleted, moved, rewritten, or embedded.',
  };

  const outputDir = path.join(ROOT, 'artifacts', 'glb-texture-audit');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const md = [
    '# GLB External Texture Reference Audit',
    '',
    `- Generated: ${result.generatedAt}`,
    `- GLBs scanned: ${result.glbCount}`,
    `- Valid GLBs: ${result.validGlbCount}`,
    `- GLBs mentioning colormap: ${result.colormapGlbCount}`,
    `- External image references: ${result.externalTextureReferenceCount}`,
    `- Missing/out-of-root external image references: ${result.missingExternalTextureReferenceCount}`,
    '',
    '## GLBs mentioning colormap',
    '',
    ...(colormapModels.length
      ? colormapModels.flatMap((model) => [
        `- \`${model.file}\``,
        ...(model.imageUris.length ? model.imageUris.map((uri) => `  - URI: \`${uri}\``) : ['  - Text contains “colormap”, but no external image URI named it.']),
      ])
      : ['No GLB JSON chunks mention colormap.']),
    '',
    '## Missing or out-of-root external image references',
    '',
    ...(missingReferences.length
      ? missingReferences.map((item) => `- \`${item.model}\` → \`${item.uri}\` (resolved: \`${item.resolvedPath}\`; outside models root: ${item.outsideModelsRoot})`)
      : ['None found.']),
    '',
    '## Invalid GLB files',
    '',
    ...(invalidModels.length ? invalidModels.map((item) => `- \`${item.file}\`: ${item.reason}`) : ['None found.']),
    '',
    '> Read-only audit. This script does not edit or move assets. Review the report before making texture or packaging changes.',
    '',
  ].join('\n');
  await fs.writeFile(path.join(outputDir, 'report.md'), md, 'utf8');

  console.log(`[GLB Texture Audit] Scanned ${result.glbCount} GLB file(s); ${result.validGlbCount} valid.`);
  console.log(`[GLB Texture Audit] GLBs mentioning colormap: ${result.colormapGlbCount}.`);
  for (const model of colormapModels) {
    console.log(`  ${model.file}${model.imageUris.length ? ` -> ${model.imageUris.join(', ')}` : ''}`);
  }
  console.log(`[GLB Texture Audit] External image references: ${result.externalTextureReferenceCount}; unresolved/out-of-root: ${result.missingExternalTextureReferenceCount}.`);
  if (missingReferences.length) {
    for (const reference of missingReferences) {
      console.log(`  MISSING ${reference.model} -> ${reference.uri} (resolved ${reference.resolvedPath})`);
    }
  }
  console.log(`[GLB Texture Audit] Reports: ${path.relative(ROOT, path.join(outputDir, 'report.md'))} and report.json`);
  return result;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const specifiedRoot = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  auditGlbTextureReferences(specifiedRoot).catch((error) => {
    console.error('[GLB Texture Audit] Failed:', error);
    process.exitCode = 1;
  });
}
