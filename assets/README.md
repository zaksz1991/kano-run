# Kano Run — Asset Pack

Placeholder art pack structured for a production Kano endless-runner.

Replace these PNGs with final illustrated / AI-refined art. Keep filenames the same so the loader keeps working.

```
assets/
├── player/
│   ├── keke-player.png          # Main player Adaidaita (full body, large)
│   ├── keke-player-left.png
│   ├── keke-player-right.png
│   └── keke-player-damaged.png
│
├── traffic/
│   ├── keke-yellow.png
│   ├── keke-blue.png
│   ├── car-sedan.png
│   ├── taxi.png
│   ├── bus.png
│   ├── motorcycle.png
│   ├── truck.png
│   ├── police.png
│   └── karota.png
│
├── environment/
│   ├── shop.png
│   ├── market-stall.png
│   ├── house.png
│   ├── mosque.png
│   ├── school.png
│   ├── petrol-station.png
│   ├── bus-stop.png
│   ├── billboard.png
│   └── street-light.png
│
├── people/
│   ├── pedestrian-01.png
│   ├── pedestrian-02.png
│   ├── pedestrian-03.png
│   └── passenger.png
│
└── effects/
    ├── dust.png
    ├── smoke.png
    ├── collision.png
    └── speed-lines.png
```

## Player keke guidelines

- Show the **complete** tricycle: canopy, body, three wheels, plate
- Transparent background
- Recommended size: ~256×320 px (or 2× for retina)
- Anchor near bottom-center of the sprite
- In-game the player sits above the on-screen controls so nothing is cropped

## Art direction

- Northern Nigeria / Kano feel (Adaidaita Sahu, markets, mosques, Harmattan haze)
- Readable at small mobile sizes
- Strong silhouette for traffic obstacles
- Environment art should support gameplay (lanes, depth), not only decoration

## Loader

`js/assets.js` loads these images when present and falls back to canvas drawing if a file is missing.
