KANO LIFE — CLOUD SAVE ACTIVATION FIX

Finding
The current public index.html loads radio.js, GlobalLeaderboardBridge.js, and main.js, but it does not load js/KanoCloudSave.js. The KanoCloudSave.js file builds its panel and adds the CLOUD SAVE buttons only when its module executes. Without the script tag, the cloud-save UI and its initialization never run.

Files
- index.html: complete replacement matching the current repository page and adding the missing KanoCloudSave.js module script.

Installation
Replace the entire project-root index.html with this file.
Keep the existing js/KanoCloudSave.js, js/storage.js, js/GlobalLeaderboardBridge.js and other files. The cloud module and its SQL table must already exist from the previous Cloud Save package. You must still configure the Supabase project URL/public anon or publishable key and run the supplied SQL schema before cloud synchronization can work.

Safety
Do not use a Supabase service_role or secret key in the browser. Cloud save is account-backed, and the database must enforce row-level security for authenticated users.

Verification performed in this package
- HTML parsed successfully.
- All existing key canvas, UI and control IDs were preserved from the current public index.html.
- radio.js, GlobalLeaderboardBridge.js, and main.js script tags were preserved.
- KanoCloudSave.js script tag is present exactly once.

Not tested
No live browser, Supabase project, auth credentials or actual cloud-save operation was available for verification. This file activates the existing module; it does not configure a Supabase backend on its own.
