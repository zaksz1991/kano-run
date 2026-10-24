# Next bottleneck: `main.js` static imports

After deferring the 22 `index.html` tags, **`main.js` still eagerly imports** secondary systems:

| Import | Needed before first drive? |
|--------|------------------------------|
| game, ui, controls, audio, renderer3d/2d, ModelManager, storage, config path | **Yes** |
| KanoAdaptiveQuality, KanoDeviceTier, KekeDynamics, DayCycle/Hud | **Yes** (perf/day) |
| ModelAuditPanel | No — debug |
| LiveUserCounter | No — social proof |
| KanoWorkshopPanel | No — tools |
| KanoCinematicCamera | No — polish |
| KanoVisualEffects | Nice — can wait |
| KanoAtmosphere | Nice — can wait |
| registerServiceWorker | No — after load |

## Manual edits (safest)

In `js/main.js`:

1. **Remove** these static imports (or comment them):
```js
// import { createModelAuditPanel } from './ModelAuditPanel.js';
// import { LiveUserCounter } from './LiveUserCounter.js';
// import { KanoWorkshopPanel } from './KanoWorkshopPanel.js';
// import { KanoCinematicCamera } from './KanoCinematicCamera.js';
// import { KanoVisualEffects } from './KanoVisualEffects.js';
// import { KanoAtmosphere } from './KanoAtmosphere.js';
// import { registerServiceWorker } from './registerServiceWorker.js';
```

2. **Replace** `registerServiceWorker();` with:
```js
setTimeout(() => {
  import('./registerServiceWorker.js').then((m) => m.registerServiceWorker?.());
}, 3000);
```

3. **Replace** `createModelAuditPanel();` with:
```js
setTimeout(() => {
  import('./ModelAuditPanel.js').then((m) => m.createModelAuditPanel?.());
}, 4000);
```

4. For `new LiveUserCounter`, `new KanoWorkshopPanel`, `new KanoCinematicCamera`, `new KanoVisualEffects`, `new KanoAtmosphere`:
   - Wrap creation in `setTimeout(..., 2000)` + `import('./Module.js').then(m => { ... new m.X(...) })`
   - Leave variables as `null` until loaded; guard updates with `if (liveUserCounter)`.

5. Build/deploy and confirm the game still starts.

## Optional codemod
`lazy-main-imports.mjs` — experimental; always keep `main.js.bak`.

```bash
node lazy-main-imports.mjs js/main.js
# then fix any constructor syntax by hand
```

## Expected gain
Less JS parse/compile on cold start → faster menu and first PLAY on phone.
Combine with **index defer** for best result.
