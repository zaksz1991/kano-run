# Kano Life — Restore missing Kenney color maps

## What this update fixes

The current asset audit identified GLBs that refer to `Textures/colormap.png`, but their source palettes are absent from the corresponding kit folders. The application can return HTML fallback content for a missing PNG, so a simple HTTP 200 response does not prove that the texture is valid.

The installer obtains the original palette from each distinct Kenney kit and places it at the path resolved by the model's relative glTF URI:

- `public/assets/models/world/buildings-industrial/Textures/colormap.png` — City Kit (Industrial)
- `public/assets/models/world/buildings-suburban/Textures/colormap.png` — City Kit (Suburban)
- `public/assets/models/vehicles/special/Textures/colormap.png` — Car Kit, for `ambulance.glb`

The official Kenney pages identify the Industrial City Kit, Suburban City Kit, and Car Kit as CC0 assets. Sources:

- https://kenney.nl/assets/city-kit-industrial
- https://kenney.nl/assets/city-kit-suburban
- https://kenney.nl/assets/car-kit

## Install

1. Extract this ZIP directly into the root of your existing `kano-run` project folder, where `index.html` is located. Merge the included folders; do not replace `public/` or `public/assets/` wholesale.
2. Double-click `Install-Kano-Life-Texture-Fix.cmd` in File Explorer.
3. The installer downloads the three official packs into a temporary folder, extracts only the relevant `Textures/colormap.png` from each, verifies each image is a valid 512×512 PNG, then places only missing textures into the target paths.
4. Existing textures are never overwritten. If a kit does not contain an unambiguous 512×512 color map, the installer stops rather than inventing or substituting a texture.
5. When Node.js is available, it runs `scripts/audit-glb-texture-references.mjs` and writes `artifacts/glb-texture-audit/report.md` and `report.json`.

The installer does not delete, rename, compress, or modify any GLB models. It does not modify game saves or user data. Pack ZIPs are removed from the temporary folder after extraction.

## Radio path fix included

The replacement `js/audio.js` uses one manifest-backed path, `/assets/models/audio/`, and performs no guessed-directory or `HEAD`-request probing for radio tracks. Tracks use lazy `preload="none"` playback. Engine and horn paths are unchanged.

## Verification scope

The two added Node tests cover deterministic radio paths and the GLB texture-reference scanner using synthetic containers. The installer itself requires Windows PowerShell and network access to the official Kenney downloads. Real asset verification must be taken from the generated audit report and subsequent in-game 3D inspection; this code-only package does not claim those steps have already run.
