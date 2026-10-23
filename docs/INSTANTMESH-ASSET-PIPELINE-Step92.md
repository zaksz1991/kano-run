# Kano Life — InstantMesh Asset Pipeline (Step 92)

## Scope of this pass

Step 92 is a controlled runtime pass for walking pedestrians, correct lowered arm poses, and checkpoint waiting crowds. It replaces the basic roadside fallback figures with purpose-built articulated 3D character meshes at runtime and prevents the current unrigged A-pose GLBs from overwriting their limb motion. The passenger queue uses four distinct outfits on mobile and six on desktop.

## InstantMesh remains required for the high-detail asset phase

The current supplied human GLBs were inspected locally: they contain mesh nodes but no `skins` and no animation clips. That makes them unsuitable as walk-cycle sources without adding a rig or replacing them. This step deliberately does not pretend to have created new image-to-3D assets.

The planned production asset phase will use the official **TencentARC/InstantMesh** project to reconstruct reference images into meshes, then validate, retopologize/optimize where necessary, rig characters in a DCC tool, and export browser-optimized GLB files. The project’s official setup documents Python 3.10+, PyTorch 2.1+, CUDA 12.1+, and checkpoints; those dependencies and model weights are not installed in this work environment, so InstantMesh inference was **not run** here. Reference: https://github.com/TencentARC/InstantMesh

## Priority asset queue

1. Yellow Kano Adaidaita Sahu keke with black canopy, passenger bench, mirrors, visible suspension/wheels, seated driver and correct scale.
2. Fuel station built as an identifiable forecourt: canopy, columns, pump islands, hoses, signage, price board, kerb and entry/exit.
3. Kano street people: Hausa male boubou/kaftan and kufi, women in hijab/abaya with arms at rest, street vendors, security and mixed waiting passengers. Models must have neutral/down-arm source poses and proper rigs for walking/idle/talk clips.
4. General checkpoint: multiple keke parked naturally and a row of four to six waiting passengers.
5. Kwankwasiyya flyover deck/pillars with red-and-white striped parapets and legible KWANKWASIYYA sign; support driving on the deck.
6. Roundabout geometry and route junction props with left/right arrows and safe turnaround radii.

## Asset acceptance checks

- GLB loads locally with no missing external textures/buffers.
- Correct scale, origin, forward axis, pivots, material colors and camera framing.
- No T/A-pose on characters used in ordinary scenes; no floating feet or fused open hands.
- Keke silhouette must be clearly three-wheeled with a black canopy and passenger cabin.
- Mobile triangle count, texture sizes and draw calls are budgeted before adding more actors.
- InstantMesh output is treated as a reconstruction draft, not final production-ready geometry; inspect and rig before promoting it to `public/assets/models/`.
