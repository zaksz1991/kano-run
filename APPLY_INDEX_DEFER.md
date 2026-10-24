# Apply real index.html defer (from live kano-run.vercel.app)

Your live homepage loads **22 upgrade modules before `main.js`**.  
That delays first paint on phone. Driving only needs `main.js` (and what it imports).

## Steps

1. Open repo `index.html`.
2. Find the block that starts with:
   ```html
   <script type="module" src="/js/KanoLifeRuntimeAudit.js"></script>
   ```
   and ends with:
   ```html
   <script type="module" src="/js/main.js"></script>
   ```
3. **Replace that whole block** with the contents of `INDEX_SCRIPT_REPLACEMENT.html`.
4. Copy phone JS files into `js/`:
   - KanoPhonePlayProfile.js
   - KanoPhoneWorldBudget.js
   - KanoPhonePropBudget.js
   - KanoPhoneRenderGuard.js
   - KanoPhoneStartupDefer.js
5. Commit, push, deploy.
6. Phone test: cold open → time until menu is usable; console:
   - `[PhoneStartup] defer armed`
   - `[PhoneStartup] loading 22 deferred modules`

## What stays eager
Only **main.js** (+ phone helpers). Life/career/social upgrades load after idle or when you start driving.

## What this does not fix
Modules **imported inside main.js** still load with the game. This only removes the **22 parallel `<script>` tags** that currently race main on every cold start.
