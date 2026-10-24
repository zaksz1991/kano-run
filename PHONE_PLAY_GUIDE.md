# Phone play = fast + clear (like laptop)

## What “like desktop” means on a phone
- **Readable road** near the camera (not grey mush)
- **Stable FPS** (30 solid is better than 60 that stutters)
- **Same controls and rules** — not the same pixel count

Phones have fewer GPU pixels/sec. Desktop at 2× DPR is often *lighter* than a phone at 3× DPR.

## Already in your game
- `KanoAdaptiveQuality` — drops resolution / culls distant décor when FPS tanks
- `KanoDeviceTier` — high / mid / low budgets
- `KanoMobileWorldClarityUpgrade` — clarity hooks
- `KanoMobileGeometryBudgetUpgrade` — simplifies heavy GLB meshes in memory on mobile

## Add this profile
`KanoPhonePlayProfile.js` forces sensible phone defaults:
| Setting | Low phone | Mid | High phone |
|---------|-----------|-----|------------|
| Max DPR | 1.0 | 1.25 | 1.5 |
| Target FPS | 30 | 30 | 60 |
| Shadows | off | off | off |
| Fog far | 34 | 42 | 55 |

## Install
```html
<script type="module" src="/js/KanoPhonePlayProfile.js"></script>
```
Place **after** main/renderer boot scripts (or at end of body).

Verify console:
`[Kano Phone Play] active tier=mid dpr≤1.25 ...`
`window.kanoPhonePlay.profile`

## Make the world clearer (checklist)
1. **Fog** — closer far-plane (profile does this) so near road stays sharp  
2. **Fewer distant props** — rely on adaptive LOD; don’t spawn 70 pedestrians  
3. **Traffic cap** — 4–8 vehicles on screen on low tier  
4. **No giant GLBs** — bus/flyover scale must stay game-sized  
5. **Strip unused life Upgrade scripts** from `index.html` on mobile if load > 3s  
6. **Compress textures** to ≤1024 on phone path  

## Do / Don’t
- DO aim for locked 30 FPS on mid Android  
- DO keep player keke + road markings highest contrast  
- DON’T enable MSAA + shadows + full DPR on phone  
- DON’T load 200+ JS modules before first frame if you can defer  

## Success test (phone)
1. Cold start → driving under 5s  
2. No long hitch every second  
3. Road lanes readable  
4. Keke visible and yellow/clear  
5. Temperature: play 5 min without forced 15 FPS thermal drop  

## World budget (next)
`KanoPhoneWorldBudget.js`
- Traffic cap: low 5 / mid 7 / high 10
- Fog tightened for readable near road
- Trims farthest cars if over cap

```html
<script type="module" src="/js/KanoPhonePlayProfile.js"></script>
<script type="module" src="/js/KanoPhoneWorldBudget.js"></script>
```

## Render guard (final mile)
`KanoPhoneRenderGuard.js`
- Caps canvas long edge (960 / 1120 / 1280) so 3× DPR phones stay playable
- Notes tab hidden (battery/heat)
- `window.kanoPhoneFps` — check live FPS in console

```html
<script type="module" src="/js/KanoPhoneRenderGuard.js"></script>
```
While driving on phone: `kanoPhoneFps` — aim ≥25–30 sustained.
