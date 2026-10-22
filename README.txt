KANO LIFE — STEP 11: IMPORTED GLB BACK-FACE CULLING

Purpose
-------
ModelManager.repairMaterials() previously forced every imported GLB material to
THREE.DoubleSide. This disables normal back-face culling even for opaque vehicle,
character and building materials whose GLB specifies single-sided rendering.
On mobile, that can increase fragment work substantially.

Change
------
Complete replacement:
  kano-run/js/ModelManager.js

The replacement preserves the side setting supplied by GLTFLoader (including
DoubleSide only where the GLB explicitly authors a double-sided material), keeps
the existing low-opacity repair and keeps imported-model shadow flags disabled.
The previous unconditional material.needsUpdate request is removed; it remains
only when the opacity repair changes transparency.

Installation
------------
Copy only js/ModelManager.js from the ZIP into the existing kano-run/js folder,
replacing the file at that exact path. Do not replace other source files or any
models, textures, audio or saved data.

Validation
----------
This change was checked against the available Kano Life source snapshot. Syntax
check and the three focused source regression tests are run for this package.
No full project test suite, production build or physical-phone benchmark is
claimed. If an individual GLB intentionally uses double-sided material, its
GLB-authored setting remains respected by GLTFLoader.
