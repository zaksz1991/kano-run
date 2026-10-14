# Kano Run — real asset wiring pack

Uses **exact paths** from your `model-inventory.txt`.

## What gets used

| Folder | In-game use |
|--------|-------------|
| `keke/` | Player + traffic keke variants |
| `car-kit/` | Sedan, taxi, truck, van, SUV, police, ambulance… |
| `cars-bundle/` | Extra cars / police / sports |
| `city-kit-suburban/` | Roadside houses (a–u) + trees/fences |
| `city-kit-industrial/` | Factories, tanks, containers (Sharada theme) |
| `city-kit-roads/` | Lights, poles, signs, dumpsters |
| `city-pack/` | Big buildings, bus stop, billboard, bench, tree… |
| `pedestrian-passengers/` | Hausa/Igbo attire, hijab, suit, drivers |

## Install
```bat
cd C:\Users\DELL\Documents\GitHub\kano-run
copy /Y path\to\kano-assets\js\core\AssetCatalog.js js\core\
copy /Y path\to\kano-assets\js\systems\ScenerySystem.js js\systems\
copy /Y path\to\kano-assets\js\systems\PassengerSystem.js js\systems\
copy /Y path\to\kano-assets\js\systems\VehicleSystem.js js\systems\
npm.cmd run build
npm.cmd run dev
```

Spaces in filenames are handled with `encodeURI` / `modelUrl()`.

## Themes
- Default / city centre → suburban + city-pack buildings  
- Industrial district → city-kit-industrial  
- Market → pizza corner, red/green buildings + props  

## Test
1. Drive — varied buildings on both sides (not empty fog)  
2. Traffic includes van/SUV/pickup/keke if VehicleSystem applied  
3. Passengers include hijab / Igbo wear / turban models  
