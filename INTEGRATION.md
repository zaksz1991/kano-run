# Kano Life — Collision / Vehicle Lifecycle Integration

## Purpose
Connects the existing `Game.hit(vehicle)` collision handler to the already-present `KanoVehicleLifecycleDirector.js` so impacts persist as component wear across run resets. The existing collision physics remains authoritative. It records a workshop repair estimate but **does not charge the player** or claim repairs have been paid.

## Apply to the public repository
Target repository: `zaksz1991/kano-run`  
Target file: `js/game.js`  
New dependency: `js/KanoVehicleLifecycleDirector.js` (already present in the repository)

Use GitHub's web editor to make the four changes shown in `patches/game.js.patch`:
1. Add the lifecycle import alongside the existing storage import.
2. In `Game` constructor, initialize `this.vehicleLifecycle` and create the persistent player keke only if it does not exist, before `this.resetRun()`.
3. In `resetRun()`, insert the lifecycle health sync immediately before `this.spawnInitial()`.
4. In `hit(vehicle)`, insert the `recordImpact` block immediately after the existing `s.tyres = Math.max(...)` statement and before `s.heat = Math.min(...)`.

## Behaviour and limitations
- Vehicle component wear is saved by the lifecycle director in browser local storage.
- Body, engine and tyre condition carry across run resets.
- Collision damage creates a repair estimate using the director's current repair prices.
- This patch does not yet expose a workshop UI or deduct money. Repairs must only be completed after the game's wallet/payment flow confirms payment.
- This is a source patch only. It has not been pushed to GitHub, deployed to Vercel, or tested in a live browser.

## Manual verification after applying
1. Start a run and collide with traffic.
2. Finish/restart the run; vehicle condition should remain damaged rather than reset to 100.
3. Reload the page; lifecycle component health should still be present.
4. Check browser console for lifecycle errors. The driving loop is guarded so lifecycle failures should not stop gameplay.
