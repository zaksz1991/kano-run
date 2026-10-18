# Kano Life 4.2.0 — Audit, findings and verification

## Release boundary

Target repository: `https://github.com/zaksz1991/kano-run`  
Reference deployment: `https://kano-run-nu.vercel.app`

This is a local candidate and code overlay, not a GitHub deployment. The user's live repository/assets remain unchanged. The actual model pack was listed in the user message but not available as files in this execution sandbox. Model catalog paths match that supplied list; actual HTTP 200s, downloaded geometry, facing, and rendering have not been browser-verified.

## User-reported problems and addressed findings

### Traffic facing the player during forward driving

**Likely root cause:** imported GLBs can use differing local forward axes; the renderer also sets the traffic actor's root yaw each frame. An earlier model-level root rotation could therefore be overwritten by traffic direction logic. The candidate applies the forward correction to the imported model source, preserving the actor root for same-way/oncoming traffic. Default one-way mode assigns all traffic the same travel direction; only explicit two-way mode spawns oncoming traffic.

**Verification boundary:** source logic and automated tests verify the correction path, but visual orientation of each supplied GLB must still be confirmed in a browser, as actual GLB files were not available here.

### Poor collision feel and the invisible collision point in 2D

- Traffic depth is now interpreted as relative closing speed: faster same-way traffic pulls away; slower same-way traffic is approached; oncoming traffic closes at the sum of speeds.
- The 3D impact plane is near depth `0.022` with a tight `0.012–0.035` contact band, closer to bumper-to-bumper contact than the previous far-ahead impact plane.
- Damage scales by relative speed, applies invulnerability frames, and does not immediately destroy the vehicle from a low-speed scrape.
- Canvas 2D now maps the near collision plane to about 59% screen height, matching the visible keke, rather than sending near vehicles underneath the drive controls.

### Roadside passengers and large people/groups

- Pickup, drop and fuel zones spawn on the left/right shoulder with pads/signs at the road edge, never in the centre lane. Potholes remain in travel lanes.
- Single roadside pickup uses one seat and can be completed at up to 12 km/h when aligned with the shoulder.
- `GENERAL CHECKPOINT · KEKE STOP` is the explicitly marked group stop. It accepts 2–4 seats, is limited to 6.5 km/h or less, and is the only source of large/group passenger boarding. Ordinary roadside stops no longer randomly spawn large group passengers.
- A stopped keke keeps its zones in place; missed stops scroll naturally and do not freeze the road or trap the player.

### Excessive speed and rigid rules

- Career base cap: 38 km/h before driver modifiers.
- Free roam base cap: 36 km/h.
- Time Attack base cap: 150 km/h as an intentional separate arcade mode, making the existing 3.5 km/95-second Gold target reachable.
- Stops are more forgiving at normal roadside zones; only multi-seat General Checkpoint boarding requires an almost complete stop.
- Life activities include accept/pass options so school runs, market delivery, repair, fuel queue, water/top-up, wedding convoy and goat crossings do not become compulsory tasks.

### Northern Kano life / model-backed scenes

The morning scene set covers a bedroom, compound chores and water carrying, neighbourhood shops, several breakfast choices, a market-road walk, school/mosque crossing activity, and guarded keke park with a security guard and the same player vehicle. Runtime content additionally includes school runs, market loads, vulcanizer, fuel queues, wedding traffic, roadside water/phone-credit, goat crossings, market day, Juma'a traffic, harmattan, rain/mud and broken roads.

The 3D morning scenes use model slots for the owner's existing keke, motorcycle, building, passenger/pedestrian and security GLBs. The road scene progressively replaces procedural vehicles, people, buildings, road props and flyovers when corresponding model keys load. Canvas 2D provides fully drawn versions of the morning, garage and drive scenes without trying to reuse a WebGL-backed canvas context.

## Automated verification

- `npm run check`: **PASS**.
- `npm test`: **53/53 PASS**.
- The tests cover gameplay startup, missions, saved-state normalization, daily/tribal features, mode starts, stop interactions, group seat policy, direction/closing speed, relative-speed collision damage, 2D projected contact position, viewport, fallback canvas, real asset path strings, scene callbacks, model replacement and flyover setup.
- `npm run build`: **NOT VERIFIED**. It fails in this environment because `node_modules/vite/bin/vite.js` is absent. Dependency installation did not complete earlier due to registry networking failure.

## Release blockers

1. Restore/install dependencies in an environment with npm registry access, then run `npm run build`.
2. Merge only code/config/test/docs changes into the existing repository; preserve the actual `public/assets/models`, `public/assets/environment`, `public/assets/audio`, and all unrelated live features.
3. Check browser console/network requests for `[ModelManager] OK keke`, car/people/building/flyover assets and HTTP 200 responses.
4. Test normal one-way orientation, two-way opposing lane, actual keke visibility, flyover height/scale, roadside stop positioning, contact alignment and all morning scenes on desktop and a physical mobile device.
5. Only then commit/push and verify the Vercel deployment. No live change was made from this environment.
