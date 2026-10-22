KANO LIFE — GLB CULLING + FRAME-WORK REDUCTION (STEP 2)

Replace only:
  js/KanoGameplayPresentationRepair.js

This is a complete replacement based on the previous Single Resolution Controller Fix. It keeps that fix and makes the GLB visibility/transform repair a one-time-per-model preparation plus a throttled active-scene scan.

Changes:
- Stops traversing the road, garage and every life-scene model tree on every rendered frame.
- Mobile visibility repair scans are limited to once every 450 ms; desktop scans to once every 250 ms.
- Hidden garage/life-scene trees are not traversed while the road scene is active, and vice versa.
- GLB geometry preparation is cached per root; shared geometry bounds are computed once.
- Three.js frustum culling is re-enabled instead of forcing every imported mesh to render outside the camera view.
- The repair routine no longer forces GLB roots visible on every pass, so the adaptive LOD/scene visibility settings remain effective.
- Includes the preceding single-resolution-controller correction; do not replace any other project file with this package.

No model, texture, audio, save, collision, mission, speed or game-loop files are changed.

Validation performed here: the complete replacement passed node syntax checking; both focused source-regression checks passed. No full npm test/build/browser audit was run against your local project, and no claim of physical-phone performance is made.
