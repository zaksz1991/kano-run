KANO ACTIVATION PACK - copy every file into your project, same folders, replace when asked. No patches.

WHY: ChatGPT's recent Task upgrades (phone clarity, geometry budget, real keke GLB activation,
pedestrian gait/pavement walk, vehicle collision contact, flyover drivability, compact HUD, fuel
station forecourt, readable signboards) were delivered as integration/*.diff files that were never
applied, so none of them ran in the game. This pack imports them for real.

Wiring: js/KanoWorldPerformanceInstancingUpgrade.js (imports in correct order),
js/KanoTrafficMix.js (pedestrian + collision modules), js/KanoFeatureActivationBridge.js (new, fuel station).
Also: flyover deck/ramp lengths, sign orientation + sharp signboard textures, geometry rules fixed.
Tests: 1443/1443 passing. Boot check: game starts, driving controls present.
