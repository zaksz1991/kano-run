# Step 3 — Provisional Public Asset Review Candidates

**Source:** the supplied `ASSET-MANIFEST.csv` and code-only snapshot at `4447dd1`, cross-checked against the build log showing 98 GLBs and 10 unclassified items. These are candidates for manual review, not a deletion or movement order. The local `scripts/audit-public-references.mjs` included in this update should be run against your complete working tree before any candidate is approved.

**No files have been moved or deleted.** The `public/vendor/three.module.js` path is a separate tiny re-export stub; `animation.js` imports the root-level `vendor/three.module.js`, not this public copy.

## Unclassified GLB models (10 files)

| Size | Path |
|---:|---|
| 245,948 bytes | `public/assets/models/environment/sky/free_-_skybox_basic_sky.glb` |
| 815,172 bytes | `public/assets/models/environment/sky/sky_cloud_of_azure_lane_island.glb` |
| 405,652 bytes | `public/assets/models/environment/sky/sky_dome_demo.glb` |
| 341,472 bytes | `public/assets/models/environment/sky/sky_pano_-_milkyway.glb` |
| 525,640 bytes | `public/assets/models/environment/sky/sky_pano_-_monument_valley_lookout.glb` |
| 706,416 bytes | `public/assets/models/environment/sky/starry_night_sky_hdri_background_photosphere.glb` |
| 169,672 bytes | `public/assets/models/vehicles/wheels/turbine-wheel.glb` |
| 43,556 bytes | `public/assets/models/vehicles/wheels/wheel-model.glb` |
| 493,196 bytes | `public/assets/models/world/props/Man.glb` |
| 181,608 bytes | `public/assets/models/world/props/SUV.glb` |

Group total: **3,928,332 bytes (3.75 MiB)**.

## Audio files with no direct source reference (11 files)

| Size | Path |
|---:|---|
| 1,540,014 bytes | `public/assets/models/audio/Igbo.mp3` |
| 3,416,651 bytes | `public/assets/models/audio/hausa-radio.mp3` |
| 1,752,128 bytes | `public/assets/models/audio/igbo-radio.mp3` |
| 6,109,771 bytes | `public/assets/models/audio/kano-radio.mp3` |
| 3,667,844 bytes | `public/assets/models/audio/kwankwasiyya-radio.mp3` |
| 6,736,919 bytes | `public/assets/models/audio/nigeria.mp3` |
| 2,619,899 bytes | `public/assets/models/audio/ruffneck-2.mp3` |
| 113,580 bytes | `public/assets/models/audio/ruffneck.mp3` |
| 32,332 bytes | `public/assets/models/audio/whistle.mp3` |
| 1,743,142 bytes | `public/assets/models/audio/yoruba-radio.mp3` |
| 4,285,170 bytes | `public/assets/models/audio/yoruba.mp3` |

Group total: **32,017,450 bytes (30.53 MiB)**.

## Sky image files with no direct source reference (9 files)

| Size | Path |
|---:|---|
| 284,497 bytes | `public/assets/models/environment/sky/rainbow_bk.png` |
| 237,391 bytes | `public/assets/models/environment/sky/rainbow_ft.png` |
| 276,150 bytes | `public/assets/models/environment/sky/rainbow_lf.png` |
| 294,576 bytes | `public/assets/models/environment/sky/rainbow_rt.png` |
| 206,204 bytes | `public/assets/models/environment/sky/sh_up.png` |
| 240,532 bytes | `public/assets/models/environment/sky/skype_up.png` |
| 77,131 bytes | `public/assets/models/environment/sky/sp2_up.png` |
| 86,107 bytes | `public/assets/models/environment/sky/sp3_dn.png` |
| 40,087 bytes | `public/assets/models/environment/sky/sp3_up.png` |

Group total: **1,742,675 bytes (1.66 MiB)**.

## Other public files with no exact public-path reference (2 files)

| Size | Path |
|---:|---|
| 367 bytes | `public/css/mobile-hud.css` |
| 56 bytes | `public/vendor/three.module.js` |

Group total: **423 bytes (0.00 MiB)**.

## Total candidates

**32 files; approximately 37,688,880 bytes (35.94 MiB)** from the supplied inventory. This total excludes any extra files (such as restored `Textures/colormap.png`) that were absent from the supplied manifest.

## Keep separate — path mismatches fixed in the update

- `public/assets/models/environment/ground/asphalt.jpg`
- `public/assets/models/environment/ground/market-stall.jpg`

The source used `/assets/environment/ground/...`, omitting `/models`. This update fixes both runtime URLs to match the actual `public/assets/models/environment/ground/` paths. These are **not** candidates for moving.

## Approval gate

Please review the candidate list and the generated report from the complete local tree. These files may be future content (especially audio for Hausa/Yoruba/Igbo stations) even though the current code snapshot has no direct references. I will not move them to `art-source/` or delete them without explicit approval.
