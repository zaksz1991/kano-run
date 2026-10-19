# Kano Life — Commercial Integration Release

This release adds a small coordinator intended to integrate commercial features into the existing Kano Run lifecycle without duplicating the existing game systems.

## Important architecture decisions

- `storage.js` remains the canonical local save implementation.
- `controls.js` remains the canonical keyboard/touch control implementation.
- `KanoAdaptiveQuality.js` remains the canonical render-quality scaler.
- `LiveUserCounter.js` remains the existing online-session counter.
- The current `radio.js` / `audio.js` remain authoritative until their APIs are audited.
- `Game` remains authoritative for economy, physics, traffic, collision and route progression.

Read `INTEGRATION.md` before copying the new file into the repository. The coordinator is optional and does not by itself finish all the integrations listed in the roadmap.
