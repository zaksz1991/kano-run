# Changelog

## 4.1.0 — Kano morning routine, realistic asset mapping, flyovers, calmer city driving

- Added the opening life-sim sequence: wake up, step into the neighbourhood, buy roadside akara and pap, walk to the keke park, greet the security guard, and start the shift with the same visible player keke.
- Added a dedicated 3D Kano keke parking-yard scene and a matching Canvas 2D garage fallback that displays the parked three-wheel keke and security guard.
- Rebuilt the fallback player vehicle with three wheels, body shell, driver, open passenger bay, canopy, windshield, mirrors, and lamps; adjusted chase-camera aiming to keep the keke above touch controls.
- Replaced obsolete model paths such as generic `sedan.glb` and `building-1.glb` with exact case-sensitive filenames from the current asset tree. Added more real traffic/person/road/prop mappings and progressive model replacement.
- Added two mobile / three desktop flyover spans immediately, with real `kano_urban_flyover.glb` replacement when it finishes loading. Bridge scaling remains horizontal to avoid over-height models.
- Slow-tuned city driving (27 km/h base cruise, 68 km/h base cap) and free roam (30/62); Time Attack retains a faster cap to support the 3.5 km Gold target.
- Matched road-scene movement and game zone progression to the same speed-to-world scale; stopped zones no longer drift past a stationary keke.
- Made roadside 2D scenery respond to travelled distance rather than wall-clock time and added a dedicated playable 2D garage scene.
- Updated README and the asset directory guide to the real asset filenames; versioned package as 4.1.0.
- Verification: 43/43 Node tests pass; `npm run check` passes. Vite production build and browser/asset QA are still outstanding because dependencies could not be installed in this environment.

## 4.0.1 — Mission and checkpoint integrity

- Fixed repeatable career mission counters so repeated actions can complete their targets, while combo and clean-distance objectives remain peak-based.
- Fixed KAROTA checkpoint counting to record one resolution per encounter.
- Added regression coverage for cumulative mission progress, peak objectives, and checkpoint counting.
