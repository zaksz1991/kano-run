# Kano Life Step 71 tests

Pure model/bridge tests are runnable with the built-in Node test runner in Node 22+:

`node --test tests/KanoNorthernDriverSeasonalResilience.test.mjs tests/KanoNorthernDriverSeasonalBridgeCore.test.mjs tests/KanoNorthernDriverSeasonalResilienceIntegration.test.mjs`

The Step 69/70 tests are included for compatibility checks. Run those after copying into the complete current repository, because their browser-facing runtime dependencies exist in the full application rather than in this patch pack.
