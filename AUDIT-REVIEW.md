# Kano Life — Updated Scan, Audit and Review

## Scope and boundary

Target repository: `https://github.com/zaksz1991/kano-run`.
Reference deployment: `https://kano-run-nu.vercel.app`.

The package is a separate implementation candidate. No GitHub commit or Vercel deployment was made from this environment. The actual GLB pack supplied by the user is not bundled into this package; the catalog has been checked against their provided case-sensitive asset listing. Preserve `public/assets/models/` and existing audio assets when applying code changes.

## Findings addressed in this pass

### Player visibility and road movement

- The earlier chase camera aimed far ahead with a higher camera position, which pushed the player near the lower edge. The candidate now aims lower on the horizon so the keke occupies the middle/lower portion of the view and stays above the control row.
- The procedural player fallback was upgraded from a primitive vehicle stand-in to a three-wheeled Adaidaita Sahu-like shape with a driver, open passenger bay, canopy, windshield, mirrors, and lamps.
- Career cruise has been reduced to 27 km/h base with a 68 km/h base cap (driver modifiers still apply). Free roam is 30/62. Time Attack has a separate 140 km/h base cap because its 3.5 km Gold time of 95 seconds requires an average speed around 133 km/h.
- Renderer road scrolling and game zone advancement now share the same km/h-to-world conversion. Zones stop moving while the player is stopped, making brake-to-load/drop/refuel interactions physically consistent.
- Canvas 2D lane markings and roadside props now advance based on distance travelled, and the player keke remains clearly drawn above touch controls.

### Existing assets and vehicle boxes

- Replaced incorrect/generic model catalog paths with actual filenames from the user's repository tree, including all `vehicles/keke/keke-1.glb` through `keke-8.glb`, actual cars/SUV/truck assets, special vehicles, passenger/pedestrian character assets, exact-case props, building folders, and flyover files.
- Fixed URL encoding for filenames with spaces.
- Added valid road-light and pothole candidates; retained a purpose-built procedural bus-stop shelter rather than treating a road-side mesh or bench as a bus stop.
- Mobile's first-drive preload remains small; later models load in short batches and replace traffic/person/building fallbacks in place. KAROTA traffic now also appears on mobile.
- Added multiple flyover spans that are visible immediately, then replaced by loaded `kano_urban_flyover.glb` instances when available. Only horizontal dimensions are expanded, preventing a narrow bridge mesh from scaling into an enormous tower.
- Added market-stall texture use from the existing `environment/ground/market-stall.jpg`.

### Kano morning life sequence

- Added a staged 06:05–06:43 morning journey: wake up, step into the neighbourhood, buy akara + pap/pap only or skip, walk to the keke park, greet the security guard, and unlock the same player keke before driving.
- Breakfast costs are charged from the saved banked wallet. Eating activates a small fare bonus during that run.
- WebGL shows the actual player keke inside the guarded 3D parking yard. Canvas 2D has a dedicated garage scene with the same stylized keke and security guard, so forced fallback no longer leaves a road-only screen behind the garage stage.

## Previous audited items retained

- Valid single viewport declaration.
- WebGL context failure/context loss replaces the active canvas before creating a Canvas 2D context.
- `?force2d` and `?force3d` modes.
- Mobile low-FPS fallback only after below 10 FPS for about eight continuous seconds.
- Frame-level recovery, asset cache/clone cleanup, target-height normalization, model bounds checks, material repair, and road-grounding.
- Run-mission progress accumulates repeatable actions; combo/clean-distance objectives are peak-based; each KAROTA decision counts once.
- 60+ route names, drivers and paint progression, all six modes, save normalization, daily rewards/missions, local tribe boards, and existing career events remain in the candidate.

## Verification results

- `npm test`: **43/43 passing**.
- `npm run check`: **passed**.
- Package JSON/script validation: passed.
- Static regression coverage includes the actual asset catalog names, progressive mobile preloads, morning routine, 2D garage, repeated flyover replacement, slower cruise tuning, stopped pickup zones, existing game/progression behavior, and canvas fallback.

## Remaining release blockers

1. **Vite build unverified.** This environment currently has no `node_modules/vite`; an earlier install attempt could not resolve `registry.npmjs.org`. Run the production build from a network-enabled environment before deployment.
2. **Actual GLB requests not verified.** Source catalog paths align with the user's supplied file tree, but the package does not include the assets. Verify HTTP 200 responses and `[ModelManager] OK ...` console logs in the real repository.
3. **Browser/WebGL/mobile visuals not run.** The keke's actual asset facing, scale and screen position must be tested in a browser and on a physical phone. Node tests cannot prove visual correctness.
4. **No live changes.** GitHub and Vercel remain unchanged; this output contains local candidate files only.

## Acceptance checklist before release

- Preserve the existing GLB and audio folders while applying the code overlay.
- Run `npm run check`, `npm test`, and `npm run build` in the repository root.
- Test `/`, `/?force2d`, and `/?force3d` on desktop and mobile.
- Verify `[ModelManager] OK keke`, loaded traffic/person/building messages, visible flyovers and no vehicle boxes remaining after preload.
- Complete the morning sequence, purchase the meal, greet the guard, inspect the parked keke, start the shift, stop on a pickup pad, and test fare/drop/fuel/pothole interactions.
- Test each continue/event button, portrait and landscape layouts, and reload persistence.
- Deploy to Vercel only after the production build and browser QA pass.
