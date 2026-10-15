# Mobile HUD fix 2

## Problem (your screenshot)
Mission cards + wallet clones + radio + daily missions + dock + drive buttons all stacked.

## Fix
1. index.html loads mobile-hud.css
2. CSS hides #kano-mission-ui, radio, daily on phone
3. MissionSystem does not render floating cards on mobile
4. HUDSystem does not mount radio/missions panels on mobile
5. Missions/Radio only via bottom dock sheets

## Install
```bat
copy index.html
copy css\mobile-hud.css css\
copy js\systems\MissionSystem.js js\systems\
copy js\systems\HUDSystem.js js\systems\
copy js\systems\MobileUISystem.js js\systems\
npm.cmd run build
git push
```
Close phone tab fully after deploy.
