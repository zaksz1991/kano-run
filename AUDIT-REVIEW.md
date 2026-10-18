# Kano Life — Scan, Audit and Review

## Scope

The public repository to be upgraded is `https://github.com/zaksz1991/kano-run`. The deployment referenced during the review is `https://kano-run-nu.vercel.app`. This package is a separate local candidate; it has not been pushed to GitHub or deployed to Vercel.

An initial public-source audit reported a malformed viewport value (`viewport-fit=cover.0`), duplicate viewport scaling options, a simulated rather than readiness-based loading screen, and a game-loop call to `this.checkCollisions()` without a matching method. The candidate fixes the viewport and removes the undefined-method dependency by using the collision update in the traffic loop. The animation frame loop includes recovery handling and keeps requesting frames after exceptions. A follow-up gameplay audit found a mission-progress defect: repeated actions such as drops, boards, and near-misses were being recorded as a peak of one instead of accumulated counts. Those run counters now accumulate; peak objectives such as combo and collision-free distance remain max-based. KAROTA checkpoint resolution also counts once per encounter rather than double-counting pay/talk outcomes.

## Work included in this candidate

### Boot, renderer and asset loading

- Vanilla JavaScript ES modules + Vite + Three.js `^0.170.0`.
- Correct single mobile viewport declaration.
- WebGL/Three.js path and Canvas 2D fallback.
- Fresh-canvas replacement before creating a 2D context after WebGL has been used; context-loss recovery also goes to a new canvas.
- `?force2d` and `?force3d` options.
- Mobile performance watchdog only switches at below 10 FPS for roughly eight seconds, unless 3D has been explicitly forced.
- Optional GLB catalog, ordered fallbacks, target-height scaling, per-model bounding-box/aspect checks, material repair, model cache/clones, grounding, and console success logs. Rejected malformed models are cleaned up. Available desktop assets replace procedural buildings, flyover, streetlights, roadside stalls, benches, bus stops, traffic lights, stop signs, cones and dirt mounds. An optional asphalt texture is loaded when present.
- 3D resource lifecycle cleanup: transient actor geometries and unique materials are disposed when traffic/zones/fallback props are removed; cached GLB geometry/textures are protected from clone cleanup and disposed by `ModelManager` when the renderer is retired. Pending loads clean up results that finish after renderer shutdown.
- Procedural 3D vehicle models and visible Canvas 2D keke/road fallback.

### Driving and gameplay fixes

- Three-lane steering, gas/brake, speed, vehicle wear, fuel, collision/invulnerability behavior, near misses, combo bonuses, and traffic pooling.
- Added actual pothole collision/damage counting. Before this fix, `potholeHits` did not increment, making the Potholes Challenge incorrectly succeed at the finish.
- Match Drop now compares a stop against the passenger's actual destination. The earlier comparison incorrectly counted stops at the selected route name as matches even when the passenger destination differed.
- Drop-zone spawning favours destinations for passengers currently aboard, reducing the chance that their intended stop never appears.
- Touch gas/brake buttons capture the pointer so the input can be released when a finger slides outside a control. Very narrow phones now retain all six critical HUD cards by changing to a three-column/two-row layout instead of hiding passenger, fuel, and condition stats.
- Saved paint is applied to the procedural 3D keke and to plausible painted meshes in a loaded GLB.
- Both one-way and two-way traffic configuration; police remain in the reduced mobile traffic pool.

### Progression and local life-sim layer

- 60+ Kano route labels; seven driver profiles; purchasable locked drivers and paint jobs.
- Six modes: Career, Time Attack, Fuel Gauge Challenge, Match Drop, Potholes Challenge, and Free roam.
- Three randomly selected run missions from a broader pool covering fares, boarding/drops, matched destinations, streak, near-misses, safe speed, collision-free distance, horn use, KAROTA checkpoints, rich-man drama, refills, Aishat/Hibba, combo, and end-run fuel/condition/pothole conditions.
- WAT-based daily login reward and claimable daily missions with one-time rewards. Saved route, driver, paint, sound, camera, language, radio, best-time, leaderboard, and progression fields are normalized to known-safe values when browser storage is corrupted. Career runs now track consecutive matched destinations so the match-streak mission can actually be completed.
- Wallet, high score, recent runs, route/driver/paint/radio/dialect/settings, best times, achievements, and top-three local Hausa/Yoruba/Igbo scoreboards persisted in localStorage.
- Career events for fare negotiation, KAROTA, rich-man drama, and robber keke.
- Timed market day, wedding convoy, harmattan, bad road, muddy stretch, fuel queue, and Juma'a traffic modifiers.
- Procedural northern-clothing cues for roadside pedestrians, text-textured RuffNeck promotional billboards in 3D, and start-screen promo links.
- HUD exposes level, combo, heat/status, language, route, radio, lives, and an onboard manifest with passenger name, destination, seats, and fare.

## Verification performed

The current local test run passed **36/36** Node tests. `npm run check` also passed for the project source modules. Tests cover catalog size, game ticking, mode selection, vehicle collision damage, passenger fares, paid continues, repeatable run-mission progress, peak-based objectives, one-count-per-encounter KAROTA progression, tribal top-three sorting, daily mission rewards, paint/driver purchases, two-way traffic, Time Attack completion, pothole damage/challenge failure, true Match Drop penalties, mission pool coverage and completion, corrupted-save normalization, terminal mission thresholds, canvas replacement for fallback, GLB validation/grounding contracts, touch pointer capture, UI IDs, world asset catalog coverage, GLB resource-lifecycle contracts, and CI job contents.

The CI workflow installs dependencies and runs syntax checks, tests, and a production build on GitHub Actions. It intentionally does not use the `setup-node` npm cache because there is no committed lockfile in this candidate yet.

## Remaining release blockers and limitations

1. **Production build is not verified here.** `node ./node_modules/vite/bin/vite.js build` cannot run until Vite is installed. Dependency installation previously failed when the environment could not resolve `registry.npmjs.org`. GitHub Actions can attempt the build after the candidate is integrated and pushed.
2. **No GLB pack is bundled.** The loader paths are present, but actual asset URLs, 200 responses, model facing/orientation, quality, and performance must be tested with the user's licensed files.
3. **No browser/WebGL session was available for full interactive QA.** Source tests do not substitute for playing the game on desktop and a real phone.
4. **Audio is intentionally lightweight synthesized SFX.** Local radio station labels/cycling are implemented; recorded Hausa voice clips and a true radio music bed are not included.
5. **Leaderboards are local-only.** The tribal top-three boards persist in the browser's localStorage; there is no server submission or cross-device ranking service.
6. **The live repository/deployment remains unchanged.** The changes are packaged as a candidate only. A merge/replacement decision, network-enabled build, browser QA, and deployment are still required before calling this production-shipped.

## Release acceptance checklist

- Install dependencies in a network-enabled environment and run `npm run check`, `npm test`, and `npm run build`.
- Verify `/`, `/?force2d`, and `/?force3d` in a browser; ensure the fallback always draws the road and keke.
- Supply owned/licensed GLBs and verify `[ModelManager] OK ...` logs and HTTP 200 model paths.
- Test first movement within ten seconds, mobile controls, gas/brake release, passenger pickup/drop/match, fuel pads, real pothole damage, collision recovery, fare/KAROTA/rich-man/robber choices, life savers, and paid continue.
- Verify garage purchases, paint changes, WAT daily claim, mission claims, wallet/save recovery after reload, route-specific best times, and top-three tribe totals.
- Test portrait and landscape on a physical phone; ensure the passenger manifest and controls do not cover the road centre or player keke.
- Deploy to Vercel only after the build is green and the live site is verified.
