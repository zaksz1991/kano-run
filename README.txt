KANO LIFE — MOBILE BACKFACE-CULLING FIX

Purpose
-------
Reduce avoidable rendering work for the procedural 3D world on phones without
lowering the rendering resolution or replacing the materials with flat shaders.

Change
------
Only js/renderer3d.js is a replacement source file. The material() helper now
uses THREE.FrontSide on mobile for its procedural MeshStandardMaterial surfaces.
Desktop keeps THREE.DoubleSide unchanged. Colors, roughness, meshes, animations,
imported GLB materials, gameplay, traffic, collision, resolution policy, and
assets are untouched.

This targets solid scenery and ground planes whose outward-facing surfaces are
intended to be seen from the road. A few intentionally double-sided textured
sign faces use their own explicit material and remain double-sided.

Install
-------
Extract the ZIP into the existing kano-run folder and replace only:
  js/renderer3d.js
Keep all other source files and all model, texture, and audio assets unchanged.

Validation performed here
-------------------------
The full replacement passed Node's JavaScript syntax check and the included
focused source regression test. The full project test suite and physical-phone
performance have not been run or claimed.
