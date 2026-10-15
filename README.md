# Vercel build fix (exit 126)

## Cause
`node_modules/.bin/vite` is not executable on the build image (Permission denied).
Often happens with a stale Vercel build cache after dependency changes.

## Fix
Invoke Vite via Node directly (no .bin shim):

```json
"build": "node ./node_modules/vite/bin/vite.js build"
```

And set the same in `vercel.json` `buildCommand`.

## Install
```bat
copy /Y package.json package.json
copy /Y vercel.json vercel.json
git add package.json vercel.json
git commit -m "Fix Vercel vite permission denied (exit 126)"
git push
```

In Vercel dashboard: Redeploy → **uncheck** "Use existing Build Cache" (or Redeploy without cache).
