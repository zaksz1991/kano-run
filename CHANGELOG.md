# Changelog

## 4.0.1 — Mission and checkpoint integrity

- Fixed repeatable career mission counters so multiple passenger drops, boards, near-misses, fares, refills, VIP pickups, special pickups, horn uses, and KAROTA resolutions can advance to their targets.
- Kept combo, streak, distance, and clean-distance mission tracking peak-based instead of accumulating repeated state snapshots.
- Fixed KAROTA checkpoint counting to record one resolution per checkpoint interaction.
- Added regression coverage for cumulative run missions, peak-based objectives, and checkpoint counting.
- Verification: `npm test` passes 36 tests and `npm run check` passes. Vite production build remains unverified because dependencies could not be installed in this environment.
