KANO LIFE — ACCOUNT CLOUD SAVE & CROSS-DEVICE PROGRESSION
========================================================

PURPOSE
-------
Adds optional account-backed cloud save to the existing local save system.
Authenticated users can upload/download their complete save and enable
revision-checked automatic sync after verified local persist operations.
Local gameplay and localStorage continue to work without cloud configuration.

FILES
-----
js/KanoCloudSave.js
  New cloud-save UI and REST integration. It uses Supabase Auth and PostgREST
  directly; it adds no npm dependency and does not use a privileged API key.

js/GlobalLeaderboardBridge.js
  Complete replacement preserving the existing global leaderboard bridge,
  with a single added import to initialize KanoCloudSave.js. The current
  index.html already loads GlobalLeaderboardBridge.js as an ES module.

supabase/kano_life_cloud_saves.sql
  Database table, size constraint, grants and row-level-security policies.

SETUP
-----
1. In Supabase Dashboard, create or use a project.
2. Open SQL Editor, create a query, paste supabase/kano_life_cloud_saves.sql,
   and run it.
3. In Authentication settings, ensure Email provider is enabled. Keep email
   confirmation enabled if desired; new users may need to confirm their email.
4. In Project Settings > API, copy the Project URL and the public anon or
   publishable key. Do NOT use a service_role/secret key.
5. Open Kano Life and click CLOUD SAVE on the start screen or pause menu.
   Enter the URL and public key and click SAVE CLOUD CONFIG.
6. Create an account or sign in with email and password.
7. If a cloud save already exists, choose USE CLOUD SAVE or UPLOAD THIS DEVICE.
   These copies are not silently merged; export a JSON backup before replacing
   one side. If there is no cloud record, choose CREATE CLOUD SAVE FROM THIS DEVICE.
8. Once linked, every verified local persist event schedules a cloud sync after
   a short debounce. SYNC NOW forces a sync. A stale revision pauses sync and
   asks you to choose again, preventing an older tab from silently overwriting
   a newer cloud save.

WHAT IS SYNCHRONIZED
--------------------
The complete existing save object, including banked funds, banking history,
high scores, last runs, local Hausa/Yoruba/Igbo boards, achievements, daily
missions, unlocked drivers/paint, settings, and any active-run checkpoint that
is already present in storage.js.

WHAT THIS DOES NOT DO
--------------------
- It does not generate an account-backed save until you configure Supabase,
  run the SQL, and sign in.
- It does not magically checkpoint active gameplay each frame. It mirrors data
  whenever the existing storage module persist() succeeds. If a run is not
  written to local storage, there is nothing new to upload yet.
- It does not merge two diverged save files. It requires an explicit choice.
- This is not authoritative anti-cheat. The browser controls much of the game
  state; valuable rewards still require server-side validation.
- It does not sync the anonymous global leaderboard queue as private save data.

SECURITY
--------
The browser uses only the public anon/publishable key with Supabase Auth. RLS
restricts reads and writes to auth.uid() = user_id. Never paste a service_role
or secret key into the game. The public key is not an access control by itself;
the SQL policies are essential.

VALIDATION
----------
This package's JavaScript should be syntax-checked as ES modules and the SQL
reviewed/run in the user's Supabase project. Actual authentication, RLS, network
sync, and visual UI cannot be confirmed until configured against a real project.
