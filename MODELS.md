# Kano Life — 3D models (required for full quality)

GLBs are **not** in this zip (they live on your PC / InstantMesh exports).

## Drop models here (after unzip)

```
public/assets/models/
  keke/keke-1.glb … keke-8.glb
  car-kit/sedan.glb, taxi.glb, police.glb, truck.glb, …
  city-kit-suburban/building-type-a.glb …
  city-kit-industrial/…
  city-pack/Bus Stop.glb, Tree.glb, Billboard.glb …
  pedestrian-passengers/…
```

Paths match `AssetCatalog` / `ModelManager`. Missing files → procedural placeholders (game still runs).

## InstantMesh / your pipeline
1. Export GLB, Y-up, meters, origin at ground.
2. Prefer < 2 MB per vehicle for mobile.
3. `npm run build` then deploy.

Without models on Vercel you will still get WebGL/2D road + activities; with models you get full city kits.
