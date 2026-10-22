# Step 3 — Audio delivery optimization

## What this update does

- Adds an FFmpeg-based, cross-platform conversion script for the six currently configured radio tracks plus `engine.mp3` and `horn.mp3`.
- Encodes Ogg/Opus at 80 kb/s for radio and 64 kb/s for engine/horn effects.
- Stages every conversion in a temporary directory first; if a conversion fails, it does not install partial variants or change the generated registry.
- Installs a compressed `.opus.ogg` variant only when that variant is smaller than its source MP3.
- Never deletes or overwrites source MP3 files. Existing generated variants that are not selected remain untouched.
- Generates `js/audio-variants.generated.js` and a report under `artifacts/audio-compression/`.
- Uses Opus only when the generated registry lists a smaller variant and the browser reports Ogg/Opus support. The MP3 is the fallback. Older browsers use MP3 directly.
- Keeps radio `preload="none"` behavior; only the selected radio station is played/loaded.

## Run locally

With FFmpeg installed and available on `PATH`, run from the repository root:

```powershell
node scripts/compress-audio.mjs
```

If FFmpeg is installed outside `PATH`, set `FFMPEG_PATH` to the executable path before running the script. The script first verifies that all eight required source MP3s exist, then stages all encodes. Source MP3s are not modified.

Report paths:

- `artifacts/audio-compression/report.md`
- `artifacts/audio-compression/report.json`

## Expected validation

After conversion, run `npm test`, `npm run check`, `npm run build`, and `npm run browser:audit`. The encoded files should be served only to Opus-capable browsers; MP3 fallback should be used otherwise. Re-run the browser audit after compression because the new Ogg files are not available until the conversion command completes.

## Verification boundary

The binary assets were not present in the code-only source snapshot used to prepare this update. Consequently, this ZIP contains the converter and runtime negotiation, but not converted recordings or measured savings for your original audio. Those values will be generated from your local binaries by the script.
