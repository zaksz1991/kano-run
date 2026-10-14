# Mobile: Failed to fetch RouteSystem-*.js

## Cause
Phone cached old HTML → requests old chunk hash after new deploy → 404.

## Fix
- RouteSystem, Progression, Economy = **static imports** (main bundle)
- loadSystem retries once on chunk failure
- vercel.json: no-cache HTML

## Install + redeploy
```bat
copy /Y path\to\kano-mobilefix\js\core\Game.js js\core\
copy /Y path\to\kano-mobilefix\js\systems\RouteSystem.js js\systems\
copy /Y path\to\kano-mobilefix\vercel.json vercel.json
npm.cmd run build
git add -A && git commit -m "Mobile: static RouteSystem, no-cache HTML" && git push
```

## On phone
Close tab fully → reopen kano-run.vercel.app (or clear site cache).
