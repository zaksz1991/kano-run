#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const ROOT_ARG = process.argv.find((arg) => arg.startsWith('--root='));
const ROOT = path.resolve(ROOT_ARG ? ROOT_ARG.slice('--root='.length) : DEFAULT_ROOT);
const AUDIO_DIR = path.join(ROOT, 'public', 'assets', 'models', 'audio');
const VARIANTS_MODULE = path.join(ROOT, 'js', 'audio-variants.generated.js');
const REPORT_DIR = path.join(ROOT, 'artifacts', 'audio-compression');

// Preserve all source MP3s. These are the six radio tracks currently selected
// by js/config.js, plus engine/horn effects used by the driving simulation.
// Rates stay in the requested 64–96 kb/s range.
export const ACTIVE_AUDIO_TRACKS = Object.freeze([
  { file: 'engine.mp3', bitrate: '64k', purpose: 'engine loop' },
  { file: 'horn.mp3', bitrate: '64k', purpose: 'horn effect' },
  { file: 'radio-kano.mp3', bitrate: '80k', purpose: 'Vision FM' },
  { file: 'rahama.mp3', bitrate: '80k', purpose: 'Rahama Radio' },
  { file: 'freedom.mp3', bitrate: '80k', purpose: 'Freedom Radio' },
  { file: 'cool.mp3', bitrate: '80k', purpose: 'Cool FM Kano' },
  { file: 'arewa.mp3', bitrate: '80k', purpose: 'Arewa Radio' },
  { file: 'wazobia.mp3', bitrate: '80k', purpose: 'Express Radio Kano' },
]);

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
}

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const rows = report.tracks.map((track) => `| ${track.file} | ${track.originalBytes} | ${track.opusBytes ?? '—'} | ${track.savedBytes ?? '—'} | ${track.status} |`);
  const summary = [
    '# Kano Life Audio Compression Report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Source tracks processed: ${report.tracks.length}`,
    `- Original bytes: ${report.originalBytes} (${formatMiB(report.originalBytes)})`,
    `- Installed Opus bytes: ${report.opusBytes} (${formatMiB(report.opusBytes)})`,
    `- Saved bytes: ${report.savedBytes} (${formatMiB(report.savedBytes)})`,
    `- Sources preserved: ${report.sourcesPreserved ? 'yes' : 'no'}`,
    '',
    'Encoded Ogg/Opus variants are used only when the browser reports support and the generated registry contains that track. MP3 originals remain available as fallbacks.',
    '',
    '| Source file | MP3 bytes | Opus bytes | Bytes saved | Result |',
    '|---|---:|---:|---:|---|',
    ...rows,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(REPORT_DIR, 'report.md'), `${summary}\n`);
}

function main() {
  if (!fs.existsSync(AUDIO_DIR)) {
    console.error(`[Audio Compression] Audio directory not found: ${AUDIO_DIR}`);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(path.dirname(VARIANTS_MODULE))) {
    console.error(`[Audio Compression] JavaScript directory not found: ${path.dirname(VARIANTS_MODULE)}`);
    process.exitCode = 1;
    return;
  }

  const inputErrors = ACTIVE_AUDIO_TRACKS.filter(({ file }) => !fs.existsSync(path.join(AUDIO_DIR, file)));
  if (inputErrors.length) {
    console.error('[Audio Compression] Required source audio is missing. No files were changed:');
    for (const item of inputErrors) console.error(`  - ${item.file}`);
    process.exitCode = 1;
    return;
  }

  const version = run(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']);
  if (version.error || version.status !== 0) {
    console.error('[Audio Compression] ffmpeg was not found or could not run. Install FFmpeg and ensure ffmpeg is on PATH, or set FFMPEG_PATH to its executable. No files were changed.');
    process.exitCode = 1;
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kano-life-audio-'));
  const results = [];
  let installedVariants = {};
  let hadError = false;

  try {
    // Stage every transcode first. If ffmpeg errors on any file, neither the
    // source assets nor the generated registry is modified.
    for (const track of ACTIVE_AUDIO_TRACKS) {
      const source = path.join(AUDIO_DIR, track.file);
      const variantName = track.file.replace(/\.mp3$/i, '.opus.ogg');
      const staged = path.join(tempDir, variantName);
      const originalBytes = fs.statSync(source).size;
      const args = [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
        '-i', source,
        '-map', '0:a:0', '-vn', '-map_metadata', '-1',
        '-c:a', 'libopus', '-b:a', track.bitrate,
        '-vbr', 'on', '-compression_level', '10', '-application', 'audio',
        '-ar', '48000', '-f', 'ogg', staged,
      ];
      const converted = run(process.env.FFMPEG_PATH || 'ffmpeg', args);
      if (converted.error || converted.status !== 0 || !fs.existsSync(staged) || fs.statSync(staged).size < 1) {
        hadError = true;
        console.error(`[Audio Compression] ffmpeg failed for ${track.file}: ${converted.stderr || converted.error?.message || `exit ${converted.status}`}`);
        break;
      }
      const opusBytes = fs.statSync(staged).size;
      results.push({ ...track, variantName, staged, originalBytes, opusBytes, status: opusBytes < originalBytes ? 'ready' : 'not-smaller' });
    }

    if (hadError || results.length !== ACTIVE_AUDIO_TRACKS.length) {
      console.error('[Audio Compression] No generated files or registry were installed because at least one transcode failed. Source MP3s were preserved.');
      process.exitCode = 1;
      return;
    }

    let installedBytes = 0;
    let originalBytes = 0;
    let servedBytes = 0;
    for (const result of results) {
      originalBytes += result.originalBytes;
      if (result.status === 'ready') {
        const output = path.join(AUDIO_DIR, result.variantName);
        fs.copyFileSync(result.staged, output);
        installedVariants[result.file] = result.variantName;
        installedBytes += result.opusBytes;
        servedBytes += result.opusBytes;
        result.status = 'installed';
      } else {
        servedBytes += result.originalBytes;
        result.status = 'skipped (Opus not smaller; MP3 retained)';
      }
    }

    const moduleText = [
      '// Generated by scripts/compress-audio.mjs. Do not hand-edit this mapping.',
      '// Each mapped Ogg/Opus file was checked to be smaller than its MP3 source.',
      `export const AUDIO_VARIANTS = Object.freeze(${JSON.stringify(installedVariants, null, 2)});`,
      '',
    ].join('\n');
    fs.writeFileSync(VARIANTS_MODULE, moduleText, 'utf8');

    const savedBytes = Math.max(0, originalBytes - servedBytes);
    const reportTracks = results.map(({ file, purpose, bitrate, originalBytes: oldBytes, opusBytes: newBytes, status }) => ({
      file, purpose, bitrate, originalBytes: oldBytes, opusBytes: newBytes,
      savedBytes: status === 'installed' ? oldBytes - newBytes : null,
      status,
    }));
    writeReport({
      generatedAt: new Date().toISOString(),
      tracks: reportTracks,
      originalBytes,
      opusBytes: installedBytes,
      servedBytes,
      savedBytes,
      variantCount: Object.keys(installedVariants).length,
      sourcesPreserved: true,
    });
    console.log(`[Audio Compression] Processed ${results.length} audio files; registered ${Object.keys(installedVariants).length} smaller Opus variants.`);
    console.log(`[Audio Compression] Source MP3s preserved: ${formatMiB(originalBytes)}. Installed Opus variants: ${formatMiB(installedBytes)}. Estimated bytes saved with browser format negotiation: ${formatMiB(savedBytes)}.`);
    console.log(`[Audio Compression] Report: ${path.join(REPORT_DIR, 'report.md')}`);
    if (!Object.keys(installedVariants).length) {
      console.warn('[Audio Compression] No Opus variant was smaller than its MP3 source; the generated registry remains empty and the game will keep using MP3.');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main();
}
