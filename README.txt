KANO LIFE — NEXT GAMEPLAY REPAIR

Contents
- index.html: complete page entry file. It loads KanoGameplayPresentationRepair.js before main.js so the compatibility hooks are registered before the game creates its objects.
- js/KanoGameplayPresentationRepair.js: complete replacement repair module. The motorcycle rider detector no longer mistakes a standalone helmet for a human rider. It also checks motorcycle actors when models become available and disposes generated rider geometry after actors leave the scene.

Apply both files at the repository root using their included paths. Keep the existing js/main.js, js/game.js, js/renderer3d.js, js/ui.js, CSS, API files, assets, and all other files unchanged. This package does not include or replace those core files.

Validation performed: JavaScript syntax check passed. The public browser game was not run in a live interactive session, so runtime visuals still require in-game verification.
