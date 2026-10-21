All of this applies to the CURRENT main (commit 57eb3ce or later). Do it on a branch.

1. Unzip into the repo root (say yes to overwrite). This adds ./patches/*.patch (overwriting older copies), ./js/KanoDayCycle.js,
   ./js/KanoDayHud.js, ./tests/KanoDayCycle.test.mjs. Those two js files and the test already exist in
   your repo; these are the newer versions.
2. bash apply-all.sh   (applies, in order: day-cycle main.js, day-cycle effects, texture path, PWA, test updates)
3. node --test tests/*.js tests/*.mjs   -> 108 passing on my copy of current main.
4. Push the branch, check the Vercel PREVIEW, then merge.

What changed since the last zips: day cycle starts neutral (20% hungry) when the morning routine is skipped;
tests now pass on the current main (in-memory localStorage for the storage hardening, runtime-built reverse button).
