KANO LIFE — GLOBAL LEADERBOARD UPGRADE
======================================

PURPOSE
-------
Adds a shared, server-backed global score board alongside the existing local
save and tribe scoreboards. The board contains Overall, Hausa, Yoruba, and Igbo
leaderboards. It submits only newly completed/banked runs, queues failed network
submissions locally for retry, and exposes scores through the existing Vercel
serverless API layout.

FILES IN THIS PACKAGE
---------------------
index.html
  Complete replacement for the current root index.html. It preserves the game's
  existing screen/control IDs and adds the GlobalLeaderboardBridge module before
  main.js so score-sync observation is installed before gameplay interactions.

js/GlobalLeaderboardBridge.js
  New frontend bridge. Observes successful saves to kano-life-save-v4, detects a
  newly banked run through lastRuns, stores a retry queue in localStorage, submits
  records to /api/leaderboard, and adds the Global Rank UI to NAIJA RANK and the
  run report. It does not modify local wallet balances or unlocks.

api/leaderboard.js
  New Vercel API endpoint backed by Upstash Redis REST. It stores each score in
  the overall board and the player's selected dialect board, with up to 500 rows
  retained per board. It validates input and applies basic IP/session rate limits.

INSTALLATION
------------
Copy the files to the same relative paths in the existing kano-run project:
  index.html                         (replace the entire file)
  js/GlobalLeaderboardBridge.js      (new file)
  api/leaderboard.js                 (new file)

No edits to game.js, ui.js, storage.js, main.js, or the renderer are required.
This package deliberately leaves those gameplay files untouched.

SERVER STORAGE CONFIGURATION
----------------------------
The API reuses the same Vercel environment variables as the existing live-user
presence endpoint:
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN

If those variables are already configured for api/live-users.js, the leaderboard
uses that same Redis database. If not configured, the global board returns an
explicit unavailable message. While the service is unavailable, newly banked
scores remain queued in the browser and retry when connectivity returns.

WHAT IS SHARED VS LOCAL
-----------------------
Shared online: completed run score, distance, tribe, driver name, mode, selected
public display name, and submission date.

Still local to this browser: wallet funds, unlocked drivers/paint, achievements,
daily missions, active-run checkpoint, and other game settings. This package is
not cloud-save/account synchronization; that requires account identity and a
separate secure player-save backend.

Existing local scores are not automatically uploaded as if they were new runs.
Only a newly banked run observed after installation is submitted. This avoids
replaying historical local records and creating accidental duplicates.

TRUST / ANTI-CHEAT LIMITATION
----------------------------
The leaderboard is cross-browser and server-backed, but players are anonymous
and the run simulation still takes place in the browser. Rate limits and input
validation reduce accidental abuse; they cannot prove that a submitted score is
honest. A competitive, cheat-resistant board needs authenticated player accounts
and server-side validation/authority. Do not use this guest leaderboard for cash
prizes or other valuable rewards.

VALIDATION
----------
JavaScript syntax checks, HTML parsing, duplicate-ID checks, and an isolated API
mock test were run on the package. Actual Redis connectivity and visual behaviour
have not been tested in the user's live game.
