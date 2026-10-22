KANO LIFE — STEP 14: MOBILE PROCEDURAL SHADER BUDGET

This is a narrowly scoped rendering change. Replace only:
  kano-run/js/renderer3d.js

What changes:
- On phones, the Renderer3D procedural material() factory now uses
  THREE.MeshLambertMaterial instead of THREE.MeshStandardMaterial.
- This retains directional lighting, colour, texture mapping and FrontSide
  culling, while removing the physically-based roughness shader path for
  procedural fallback scenery.
- Desktop material creation remains MeshStandardMaterial with its original
  roughness and DoubleSide behaviour.
- Imported GLB materials are not rewritten by this change.
- The file retains the preceding mobile traffic batching and instanced road
  scroll code included in the available Step 13 source snapshot.

Important:
- This ZIP replaces one complete source file; it does not alter game physics,
  collision systems, missions, audio, textures or model assets.
- Lambert-shaded procedural scenery may look somewhat flatter than Standard
  shading on phones. It is not a resolution reduction, and UI text stays sharp.
- Focused source regression tests are included at:
  kano-run/tests/Renderer3DMobileShaderBudget.test.mjs
- Do not treat static checks as proof of improved real-phone FPS. A physical
  device comparison is still required.
