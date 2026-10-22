KANO LIFE — STEP 2 AUDIT STARTUP + RADIO FIX

Overlay package: extract this ZIP into the existing kano-run folder, preserving existing project files and all public assets. Replace files with the same relative paths; add new test/documentation files. No model, audio, texture, save, or user-data files are included or deleted.

The browser audit now allows up to 45 seconds for a slow 3D startup by default and can proceed if the game is already in a valid PLAY state. Radio playback uses the known asset directory from ASSET-MANIFEST.csv and no longer probes alternate paths. The Node test environment also gets event dispatch support to remove misleading window.dispatchEvent warnings.
