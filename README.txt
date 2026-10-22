KANO LIFE — STEP 15: MOBILE FOG-HORIZON CULLING

Replace only:
  kano-run/js/renderer3d.js

Also included:
  kano-run/tests/KanoMobileFogHorizonCulling.test.mjs

What this change does:
- On mobile road gameplay, hides roadside visual actors that are already
  substantially blended into the existing fog: distant buildings, pedestrians,
  street lights and roadside props.
- Keeps flyovers visible to a slightly longer distance because they are major
  Kano road landmarks.
- Re-evaluates visibility as actors move and recycle, so they can reappear.
- Skips only cosmetic procedural pedestrian arm sway beyond the near detail
  distance. Actor movement and gameplay simulation remain unchanged.
- Does not change renderer mode, resolution, model files, textures, audio,
  traffic simulation, passenger stops, collisions, missions or player physics.
- Desktop behaviour is unchanged.

Installation: copy the complete replacement renderer3d.js over the matching
file and leave all other project files and assets alone.

Validation performed in this package environment: syntax check and six
focused source regression checks. The full game and physical-device FPS were
not benchmarked; reduced draw cost is a targeted optimization, not a claim that
phone performance is already fixed.
