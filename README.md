# Kano Life — Commercial Systems Upgrade

Additive integration package for progression persistence, optional cloud presence/leaderboards, touch controls, adaptive graphics quality, passenger speech bubbles, route hotspots, and a configurable legal-source Hausa radio playlist.

## Important status
This is an **integration-ready module pack**, not a claim that the live game is already updated. The real game's current source files and Supabase schema must be inspected before wiring the modules into its scene, controls, route definitions, and render loop. No Supabase project credentials are included.

## Modules
- `js/SaveSystem.js` — localStorage-first save, wallet, unlocks, route records; optional Supabase save sync.
- `js/MobileTouchControls.js` — pointer/touch steering, throttle, brake, handbrake.
- `js/AdaptivePerformanceScaler.js` — device-informed starting quality and runtime FPS scaling.
- `js/PassengerDialogueManager.js` — Hausa dialogue bubbles, optional English translation.
- `js/SpatialHotspotManager.js` — fuel, mechanic, mosque/prayer, vulcanizer and spare-parts points.
- `js/OnlinePresenceAndLeaderboard.js` — Supabase Realtime presence session count and score queries/inserts.
- `js/HausaRadioManager.js` — stations and audio URLs provided by the game owner; no copyrighted music included.

## Minimum integration sequence
1. Import `SaveSystem` once at game startup; load saved bank/unlocks and call `bankFare`, `spend`, `unlock`, `completeRoute` from existing gameplay events.
2. Import `MobileTouchControls` after the game's existing control handlers exist. Map callbacks to the existing input state; do not add a second independent physics loop.
3. Instantiate `AdaptivePerformanceScaler({renderer, composer, onChange})`; call `scaler.update()` once per render frame. Ensure composer/render dimensions are managed by the existing resize handler.
4. Add `installPassengerDialogueStyles()` and instantiate `PassengerDialogueManager`; call `speakRandom(passengerHtmlAnchor)` on passenger events and `update()` once per frame. HTML anchors must track the rendered passenger position; for 3D objects, project their world coordinates to screen coordinates first.
5. Build hotspot coordinates from the game's real route/world data. Call `hotspots.update(playerWorldPosition)` each simulation tick; trigger repair/refuel only through existing validated economy/vehicle systems.
6. Configure `OnlinePresenceAndLeaderboard` with the project's existing Supabase client. Call `start()` only after consent/privacy handling. Its presence count is connected channel sessions, not unique verified humans or page views.
7. Provide only licensed or owner-controlled radio streams in station `tracks`.

## Supabase schema contract
The online adapter expects:
- `player_profiles(user_id primary key, save_data jsonb, updated_at timestamptz)` for saves.
- `kano_leaderboard(id identity primary key, user_id uuid, display_name text, bank bigint, lifetime_earnings bigint, route_id text null, score numeric, created_at timestamptz default now())` for score submissions.

Enable RLS and write policies before production use. Restrict profile reads/writes to `auth.uid() = user_id`; validate leaderboard values server-side and prevent users from submitting arbitrary bank/score values. For a competitive leaderboard, use a trusted server/Edge Function to validate runs instead of trusting browser inserts. Presence needs Supabase Realtime enabled for the channel. Do not put service-role keys in browser code.

## Honest limitations
- This package does not assert Supabase or Redis is already configured or connected.
- The presence metric is concurrent channel sessions, not total visitors. Counting page visits requires a separate privacy-conscious analytics event pipeline.
- Redis is not used by these browser modules. Ghost multiplayer requires a server-authoritative session/position protocol, validation, rate limiting, and reconnection strategy; it should not be implemented as unrestricted client writes.
- The hotspot manager returns validated action intents but deliberately does not directly mutate vehicle condition or money.
- Dialogue bubbles need real passenger DOM anchors or a Three.js world-to-screen projection adapter.
- Radio tracks must be licensed or otherwise legally available for streaming.
- This is not a 100% feature-complete AAA game certification. Performance, security, accessibility, gameplay balance and cross-device QA remain required.
