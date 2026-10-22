KANO LIFE — MOBILE GLB ANIMATION DISCOVERY BUDGET (STEP 3)

Included replacement:
- kano-run/js/KanoAnimationTrafficUpgrade.js

Included focused regression test:
- kano-run/tests/KanoGLBAnimationDiscoveryBudget.test.mjs

Change:
On phones, the GLB animation manager no longer rebuilds the complete list of
animated roots every rendered frame. It refreshes the inventory every 120 ms.
Existing AnimationMixer updates remain per update for visible active roots;
detached roots continue to be cleaned up. Desktop retains per-frame discovery.
The cached inventory is cleared during disposal.

Scope:
This does not remove models, change the renderer mode, change resolution,
alter driving physics, change collision rules, or change asset paths.
Newly added/removed character animations can take up to about 120 ms to be
recognized by the mobile inventory. Detached roots are still checked by the
existing parent-reference cleanup during each update.

Install by extracting at the project root and replacing only the included
KanoAnimationTrafficUpgrade.js. Keep all other files/assets unchanged. The
focused test is included for the project; user does not need to run npm test
as a condition of this delivery.

Validation performed here: node --check on the replacement and test, plus
focused regression test execution. This does not prove physical-phone FPS.
