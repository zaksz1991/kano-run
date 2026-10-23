# Kano Life — Step 84: Missing 3D Model Asset Repair

## What this update fixes

The submitted runtime trace showed repeated `404` responses for vehicle and passenger GLBs, and the supplied project snapshot had no `public/assets/models/` files at all. The game already has procedural fallbacks, but the missing first-choice GLB paths made the model loader probe many nonexistent alternatives.

This package adds **24 bundled, original low-poly GLB models** at the exact first-choice paths already configured in `js/ModelManager.js`. It does not alter the game engine or model-selection logic. It supplies:

- Yellow Adaidaita Sahu with a three-wheel layout, canopy, windscreen, bench and open driver space. The existing model manager attaches its seated driver rig to the keke wrapper.
- Distinct car, SUV, truck, bus, motorcycle, police, KAROTA and ambulance models.
- Northern Nigerian-style modest passenger/pedestrian models, including hijab and Hausa-cap variants.
- A flat-roof Kano compound frontage, industrial building, red/white-striped flyover, streetlight, construction cone, roadside dirt pile, bench, traffic signal and stop sign.

The models are hand-assembled low-poly meshes with embedded geometry and PBR materials. They are not claimed to be photorealistic scans or third-party artist assets.

## Install directly into the existing game

1. Extract this ZIP with File Explorer.
2. Copy the ZIP's `public` folder into the existing project root (the folder that already contains `index.html` and `package.json`).
3. Merge folders if prompted. The GLBs are new model files; do not delete or replace your JavaScript, HTML, CSS, audio, saves, or existing assets.
4. Copy `tests/KanoStep84BundledModelAssets.test.mjs` into the existing `tests` folder if you also want the regression test. It is not needed for gameplay.

The update does **not** require a `harness` folder, `boot.py`, or any Python tools on your computer.

## Verification performed here

- All 24 GLB files were exported as glTF binary version 2 and read back successfully using Trimesh's GLB parser.
- Each first-choice path in `ModelManager.js` is included in the bundle; duplicated first-choice paths (for example, car/taxi and passenger/passengerWoman) share the same appropriate model file.
- Every model has embedded binary geometry, vertex positions/normals, material assignments, finite bounds, and no external buffer dependencies.
- Models are merged by material to keep the majority of vehicle and character assets within 4–11 meshes.
- The complete Node test suite is run before packaging; results are recorded in `TEST-STATUS-Step84.txt`.
- ZIP integrity is checked after packaging.

## Limits

This asset package directly addresses the reported missing model paths in the supplied source snapshot. It does not prove the live Vercel deployment has been updated, and it cannot by itself establish that every startup-freeze symptom is resolved. A Vite production build and a live browser smoke test are not reported as passed unless those checks are actually completed.
