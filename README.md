# Kano Run — new title screen

## Changes
- Full-bleed Kano street hero (brand/keke-street.webp)
- Gold START button (game-like, not flat cyan card)
- Live status text under button while systems load
- Progress bar advances during long init (scenery / checkpoint)
- Garage + Naija Challenge secondary actions

## Why LOADING stuck before
Console showed checkpoint ~70s and scenery ~7s. The button said LOADING with no feedback.
Main.js now shows status messages so users know it is still working.

## Install
```bat
cd C:\Users\DELL\Documents\GitHub\kano-run
copy /Y path\to\kano-title\index.html index.html
copy /Y path\to\kano-title\js\core\Main.js js\core\Main.js
npm.cmd run build
```

Deploy to Vercel after push.
