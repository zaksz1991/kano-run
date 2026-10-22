KANO LIFE — STEP 16: MOBILE REMAINING STANDARD-SHADER FIX

REPLACE ONLY:
  kano-run/js/renderer3d.js

OPTIONAL REGRESSION TEST INCLUDED:
  kano-run/tests/KanoMobileRemainingStandardShaders.test.mjs

WHY:
The previous mobile shader optimization used the tier-aware material factory
for most procedural scenery, but several important paths still explicitly
created MeshStandardMaterial instances: the large instanced road kerbs, repeated
flyover stripes, life-scene procedural boxes, and transparent roadside/checkpoint
pads. These paths bypassed the mobile Lambert material budget.

CHANGES:
- Road kerbs and flyover stripes now use this.material(), which selects cheaper
  Lambert shading on phones while keeping Standard shading on desktop.
- Procedural boxes in the optional life scenes use the same tier-aware factory.
  Any supplied materialOptions are still applied.
- Roadside stop and checkpoint pads use the tier-aware factory while preserving
  their transparency and opacity.
- Player keke glass and fallback traffic window materials retain their authored
  transparent Standard-shader appearance.
- No assets are removed or changed. No driving physics, renderer selection,
  missions, traffic simulation, collision behaviour, or resolution settings are
  modified.

INSTALL:
Copy the complete renderer3d.js over the matching file. Keep all other source
files and model, texture, and audio assets unchanged. The test file is optional;
no test command is requested from the project owner.

VALIDATION PERFORMED HERE:
- Five focused source regression tests passed.
- renderer3d.js passed module syntax parsing.
- ZIP integrity check passed.

LIMITATION:
This verifies source structure only. No physical-phone benchmark was run, so
this is a targeted shader-path correction and not a claim that mobile FPS is
already fixed.
