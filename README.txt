Copy js/ files into your project (replace). Apply after the earlier ZIPs
(renderer3d.js here also contains the real keke-stop names from kano-names-scores.zip).
1. POTHOLE redesigned (renderer3d.js): jagged irregular hole in cracked asphalt, deep dark core, mud, broken
   asphalt chunks, hairline cracks, and a roadside warning stick with red rag. The red target ring is gone.
   The photoscan pothole GLB no longer overrides it (KanoGameplayPresentationRepair.js flag KANO_USE_POTHOLE_PHOTOSCAN=false).
2. COINS (KanoVisualEffects.js): arranged in trails - straight lines, a diagonal sweep, a zig-zag and short gaps.
   New coins queue at the far end so trail spacing stays intact instead of popping in near the keke.
Tests 1443/1443 pass.
