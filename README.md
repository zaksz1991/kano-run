# Kano Life — Essence Bridge

Makes **life sim** half of the game (with keke driving) without new menus or per-frame cost.

## What was wrong
`KanoNorthernDriverLifeSimulationUpgrade` already called `settleShift`, but only when a banking transaction id changed in a narrow way. Soft continues and some terminal paths never closed the life shift — so the career ledger felt disconnected from driving.

## What this does
- On `Game.start` (career / freeRoam): ensures `life.beginShift`
- On terminal run end (after `bankRun`): always `life.settleShift` + day ledger `closeDay`
- One toast: `LIFE · earned · costs · net`
- **No** RAF, **no** timers, **no** new panels

## Install
1. Copy `KanoLifeSimEssenceBridge.js` into repo `js/`
2. In `index.html`, add **after** the other life upgrades (near the end of module scripts):

```html
<script type="module" src="/js/KanoLifeSimEssenceBridge.js"></script>
```

3. Deploy. Hard refresh.

## Verify
1. Start **Career**, drive a short run, die/end without soft continue
2. Toast should mention **LIFE ·**
3. Console: `[Kano Life] Essence bridge installed`
4. `window.kanoLifeEssence.snapshot()` in DevTools shows updated ledger

## Phone
Event-only. Does not load extra GLBs. Safe with existing systems.

---

## Park Essence Bridge (next)

File: `KanoParkEssenceBridge.js`

Working day order: **Park → Drive → Life settle**

On Career / Free roam start:
- Maps route → park (Sabon Gari, Hotoro, Farm Centre, BUK Gate, …)
- `startWorkday` + `startShift`
- Pays **₦40** official-queue token only if wallet can afford
- Toast: `PARK · {stand} · queue #N`

Install (after essence bridge):
```html
<script type="module" src="/js/KanoLifeSimEssenceBridge.js"></script>
<script type="module" src="/js/KanoParkEssenceBridge.js"></script>
```
