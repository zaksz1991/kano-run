# Kano Run upgrade pack 13 — faster load + assets

## Features
1. **BootLoader** — priority GLBs first, rest in background
2. **AssetCatalog** — city-kit / city-pack / character paths
3. **PassengerSystem** — 1 model first; `boarding` / `dropping` events for hold
4. Pack 12 systems included: orientation, hold, pedestrians, Naija, mobile title

## Install
```bat
cd C:\Users\DELL\Documents\GitHub\kano-run
copy /Y path\to\kano-upgrade13\index.html index.html
copy /Y path\to\kano-upgrade13\js\core\*.js js\core\
copy /Y path\to\kano-upgrade13\js\systems\*.js js\systems\
npm.cmd run build
npm.cmd run dev
```

### Wire BootLoader in Main.js (recommended)
```js
import BootLoader from "./BootLoader.js";
import { attachTitleBridge } from "./TitleBridge.js";

const boot = new BootLoader({ eventBus });
const bar = document.getElementById("loading-progress");
await boot.loadPriority((p) => { if (bar) bar.style.width = Math.round(p * 55) + "%"; });
boot.loadBackground((p) => { if (bar) bar.style.width = Math.round(55 + p * 45) + "%"; });
attachTitleBridge(eventBus);
```

Match GLB filenames under public/assets/models/ to AssetCatalog if any 404.
