# Changelog

## 4.2.0 — Northern life scenes, aligned traffic physics and forgiving shoulder stops

- Expanded the morning into seven scenes: bedroom wake-up, household/compound activity, neighbourhood shops, multiple breakfast options, market-road walk, school/mosque junction, and guarded keke park with Mallam security.
- Corrected 2D depth projection so vehicles enter the visible player-keke contact plane rather than drifting under the mobile control row.
- Tightened 3D collision depth to the near bumper-contact plane. Collision damage continues to scale by relative speed, with small scrapes remaining recoverable.
- Applied vehicle local-forward correction in ModelManager so the traffic root, not the imported GLB's arbitrary forward axis, decides same-direction vs oncoming heading.
- Reduced Career base speed cap to 38 km/h and Free roam to 36 km/h; Time Attack is separately capped at 150 km/h so the existing 3.5 km medal challenge is mathematically achievable.
- Ordinary one-person roadside pickup/drop/fuel interactions now accept speeds up to 12 km/h. The marked General Checkpoint/Keke Stop remains a near-stop (≤6.5 km/h) for large passengers and groups of 2–4 seats. Large/group passengers no longer spawn at ordinary one-seat roadside stops.
- Added legible 2D labels for roadside pickup/drop, fuel and the General Checkpoint stop.
- Fixed the mirrored-side-window placement on procedural truck/bus/KAROTA bodies so each side window is on its own side.
- Added regression coverage for stop rules, seat capacity policy, depth projection alignment, traffic direction, contact depth and heavy-vehicle visuals.
- Verification: `npm run check` passed; 53/53 Node tests passed. Production build and real-browser/GLB QA remain unverified because Vite dependencies are not installed in this environment.

## 4.1.0 — Kano morning routine, realistic asset mapping, flyovers, calmer city driving

- Added the opening life-sim sequence and dedicated 3D/2D guarded parking yard.
- Replaced generic model paths with exact case-sensitive filenames from the supplied asset tree and added progressive mobile model replacement.
- Added immediate procedural flyover spans, replaced by real flyover GLBs when available.
- Improved the procedural three-wheel keke, camera framing and fallback vehicle shapes.
- Made world and zone motion use consistent speed-to-world conversion.

## 4.0.1 — Mission and checkpoint integrity

- Fixed repeatable career mission counters and KAROTA checkpoint counting.
