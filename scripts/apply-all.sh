#!/usr/bin/env bash
# Apply the Kano Life patches to the CURRENT main. Run from the repo root on a new branch.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
for p in kano-daycycle-main kano-daycycle-effects kano-texture-path kano-pwa kano-tests-update; do
  f="patches/$p.patch"
  git apply --check "$f" && git apply "$f" && echo "applied $p"
done
echo "Done. Run: npm test (or node --test tests/*.js tests/*.mjs), then deploy a Vercel PREVIEW and check it before merging."
