# Kano Run upgrade pack 12 — major gameplay pass

## Fixes & features
1. **Vehicles face travel direction** (yaw follows +Z / velocity)
2. **Mobile responsive** title + safe-area + on-screen pads (◀▶▲▼)
3. **Keke stops** during board / negotiate / drop (`PassengerHoldSystem`)
4. **Walking pedestrians** on roadside
5. **Denser scenery** (if ScenerySystem included)
6. **Naija Challenge** — Hausa / Yoruba / Igbo Top 3 + regional + national index (🇳🇬)
7. **Physics tuning** — accel / brake / steer feel from garage stats
8. **3D title screen** — lightweight Three.js keke + road (loads before full game)
9. **Faster feel** — title does not load full GLB set; use Performance ⚙ → Low on phones

## Install
```bat
cd C:\Users\DELL\Documents\GitHub\kano-run
copy /Y path\to\kano-upgrade12\index.html index.html
copy /Y path\to\kano-upgrade12\js\systems\*.js js\systems\
copy /Y path\to\kano-upgrade12\js\core\Game.js js\core\Game.js
npm.cmd run build
npm.cmd run dev
```

## Test checklist
- [ ] Traffic cars/bikes face forward
- [ ] Phone: pads steer/gas/brake
- [ ] Passenger stop freezes keke until negotiate ends
- [ ] Pedestrians walk on sides
- [ ] 🇳🇬 set tribe → finish run → Top 3 updates
- [ ] Title shows 3D keke before START

## Loading tip
On mobile set **⚙ → Low**. Full GLB world still loads on START — that is separate from the title scene.
