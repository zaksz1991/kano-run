KANO LIFE / KANO RUN — STEP 61
Household water access, hygiene routines and sanitation

WHAT THIS ADDS
- A LIFE & CAREER panel for household water collection, purchase, reserve tracking, and explicit hygiene/sanitation routines.
- Water access modes: shared borehole, scheduled piped supply, or vendor-dependent household.
- Fictional gameplay bundles for packaged water, water-vendor delivery, and a small tanker delivery.
- Daily/three-day cooldowns prevent repeated collection and household-task exploitation.
- Persistent reserve, routine meters, shortage notes and a bounded history log.
- JSON export for the household water report.

FINANCIAL AND SAFETY INTEGRITY
- Water purchases use the existing LIFE & CAREER wallet (`save.money`) and are locked during an active driving segment.
- Water collection and household routines do not award money or reputation.
- Household water is not silently drained; the player explicitly completes actions.
- All volumes and prices are fictional gameplay tuning, not current market quotations.
- The panel is not a medical diagnostic or treatment tool.
- This step does not change the vehicle renderer, game physics or the repaired core files.

INSTALLATION
Requires the Step 60 household-utilities module in the current add-on chain.
1. Extract this ZIP into the existing Kano Run project root.
2. Replace the complete file: js/KanoNorthernDriverUtilitiesUpgrade.js. Its only Step 61 change is one additive import at the top; the existing Step 60 implementation is preserved.
3. Add: js/KanoNorthernDriverHouseholdWater.js
4. Add: js/KanoNorthernDriverHouseholdWaterUpgrade.js
5. Copy the two KanoNorthernDriverHouseholdWater*.test.mjs files into the existing tests folder.

DO NOT REPLACE main.js, game.js, renderer3d.js, index.html, the service worker, manifest, CSS, model assets or other Claude-repaired files.

VALIDATION
Focused Node tests and JavaScript syntax checks are run against the files in this ZIP. This is not a build or a test of the entire Claude-repaired repository; visual rendering and physical-phone performance remain unverified.
