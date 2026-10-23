# InstantMesh asset pipeline — carried forward in Step 94

InstantMesh remains part of the asset replacement strategy for Kano Life. The current flyover signage and roundabout scenery use lightweight procedural Three.js geometry so they load with the static game, without adding new external model dependencies.

For high-detail final assets, prioritise:

1. A production-quality Adaidaita Sahu keke with clean wheel geometry, canopy, front lamp, cabin and rear passenger opening.
2. Rigged pedestrian and passenger characters with a natural standing pose and a walking animation; hijab variants must not use an arms-outstretched source pose.
3. A high-detail Kwankwasiyya flyover / overpass asset with the red-and-white parapet marking pattern, sign placement, underside supports and road clearance.
4. A modular Kano fuel-station kit and properly sized market/shopfront assets.

Reference images should be licensed or user-provided. Any InstantMesh inference must be performed in an appropriate GPU/model-weight environment, then the resulting mesh must be retopologised/decimated, UV-checked, textured, validated for scale/orientation, exported as GLB and tested on a representative phone.

**InstantMesh inference was not run for Step 94.** No generated mesh is represented as an InstantMesh output. Step 94's signs, curb, island and approach geometry are native procedural Three.js meshes.

## Driving functionality boundary

This stage only makes the flyover identity and roundabout geometry visible in the existing recycled-road scene. It does not add junction collision/path topology, a route branch, a vehicle path over the bridge deck, U-turns, or reverse-control changes. Those require the next separate driveability stage and should be verified against the existing speed/steer/controller rules.
