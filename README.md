# Title v2 — 3D keke + fix setStatus crash

## Fixes
- `this.setStatus is not a function` — Main.js always defines setStatus / setProgress
- Front page: **no photo background**
- Live **3D Adaidaita Sahu** (yellow napep) rotating on navy/gold palette

## Colors
- Navy background `#0c1222`
- Gold title + START button
- Sky-blue accents (subtitle, ghost borders)

## Install
```bat
cd C:\Users\DELL\Documents\GitHub\kano-run
copy /Y path\to\kano-title2\index.html index.html
copy /Y path\to\kano-title2\js\core\Main.js js\core\Main.js
npm.cmd run build
git push
```
