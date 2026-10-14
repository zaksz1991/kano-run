# Kano Run fix pack 16

1. **Keke facing** — flip yaw for keke/motorcycle so they face travel direction
2. **Better fallbacks** — tricycle/bike/car shapes instead of plain boxes when GLB fails
3. **No snow** — harmattan dust only (beige); fewer particles
4. **Simple title** — no 3D hero keke; clean navy/gold UI
5. **New users ₦30,000** — EconomySystem + config startingMoney

## Install
```bat
cd C:\Users\DELL\Documents\GitHub\kano-run
copy /Y path\to\kano-fix16\index.html index.html
copy /Y path\to\kano-fix16\js\core\*.js js\core\
copy /Y path\to\kano-fix16\js\systems\*.js js\systems\
npm.cmd run build
```

Clear localStorage once to get ₦30k as a new profile, or set money manually.
