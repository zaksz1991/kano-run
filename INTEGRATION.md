# Kano Life Commercial Integration Release

## Repository audit observations

The current `main.js` already imports `KanoAdaptiveQuality`, `LiveUserCounter`, `KanoProductionBridge`, and the existing renderer/game lifecycle. `controls.js` already supports touch buttons, swipe steering, reverse, and automatic release of held controls. `storage.js` already owns the game's v4 save format and validates driver/route/paint unlocks.

Therefore, do not replace those with `AdaptivePerformanceScaler.js`, `MobileTouchControls.js`, `SaveSystem.js`, or a second live counter. That would create competing sources of truth and could break saved progression.

## New additive coordinator

`js/KanoCommercialIntegration.js` provides optional passenger dialogue lifecycle and documented custom-event seams for hotspot requests and systemic events. It intentionally does not fabricate passenger actors, alter game money, write Supabase data, or create fake player counts.

### Integration into `js/main.js`

1. Add this import with the other imports:

```js
import { KanoCommercialIntegration } from './KanoCommercialIntegration.js';
```

2. Add a module-level variable beside the other optional systems:

```js
let commercialIntegration = null;
```

3. In `boot()`, after `game = new Game(ui, audio, { mobile });`, initialise it:

```js
try {
  commercialIntegration = new KanoCommercialIntegration({ root: container, game });
} catch (error) {
  commercialIntegration = null;
  console.warn('[Kano Life] commercial integration unavailable', error);
}
```

4. In `frame(now)`, after `game?.tick(dt);`, add:

```js
commercialIntegration?.update?.(dt, game?.s || {});
```

5. In `disposeRenderer()`, do not dispose this coordinator: it is renderer-independent. If the app adds a full application shutdown path, call `commercialIntegration?.dispose?.()` there.

## Hooking real passenger actors

When the actual passenger renderer creates a DOM anchor, pass that anchor to:

```js
commercialIntegration?.attachPassengerAnchor(anchor);
```

Then emit an event when dialogue is appropriate:

```js
window.dispatchEvent(new CustomEvent('kano:passenger-nearby', { detail: { anchor } }));
```

The event's `anchor` must be a real connected DOM element. This does not automatically bind to Three.js meshes; projecting 3D world positions requires the actual passenger actor and camera API.

## Hotspot UI contract

A hotspot UI button can opt into event routing with `data-kano-hotspot="fuel"`, `"mechanic"`, `"mosque"`, `"vulcanizer"`, or `"spare-parts"`. The coordinator emits `kano:hotspot-interaction-request`. A trusted gameplay handler must validate player proximity, cost, inventory and vehicle state before changing gameplay.

## Events exposed

- `kano:commercial-event` with `type: market-day`, `wedding-convoy`, or `vehicle-breakdown` when the corresponding source event is emitted.
- `kano:hotspot-interaction-request` for explicitly marked hotspot controls.

This coordinator is an integration seam, not a replacement for the authoritative game economy, traffic, physics, storage, Supabase, Redis, or radio systems.

## Validation status

The module is syntax-checked independently. A full Vite build and in-browser regression test require the complete repository checkout. No changes are pushed to GitHub or deployed by this package.
