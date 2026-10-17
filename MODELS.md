# Kano Life — asset catalog (rearranged)

```
public/assets/models/
  vehicles/keke/keke-1..8.glb
  vehicles/cars/…          (sedan-like, taxi, suv, truck, motorcycle)
  vehicles/special/        police, karota, bus, okada, ambulance
  characters/passengers/   hijab, suit, igbo, turban…
  characters/pedestrians/  pedestrian, passenger, police_man…
  world/buildings-suburban/
  world/buildings-industrial/
  world/props/             Tree, Billboard, Bench, Stop-sign…
  world/roads/
  environment/ground/      asphalt, potholes, Dirt, walls, market-stall
  environment/sky/         sh_ft/bk/up/dn/lf/rt.png
```

Engine loads via `js/ModelManager.js` keys: keke, car, taxi, suv, truck, police, karota, bus, motorcycle, passenger, pedestrian, building, market, bustop, tree, billboard…

Console after Start should show:
`[ModelManager] OK keke ← assets/models/vehicles/keke/keke-3.glb`
