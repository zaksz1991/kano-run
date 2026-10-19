# Kano Life Release Safety Upgrade

Add these files to the root of the existing Kano Run repository. This is a pre-deploy safety upgrade, not a game feature replacement.

Included:
- `scripts/check-syntax.mjs`: syntax-check all project JavaScript modules without adding dependencies.
- `scripts/verify-release.mjs`: catches malformed/corrupted `index.html`, missing local imports, missing script/style assets, and common pasted-JavaScript regressions.
- `package.json`: complete project manifest with `check`, `verify`, and `release:verify` scripts; preserves Three.js and Vite dependencies.
- `.github/workflows/kano-release-check.yml`: validates pushes and pull requests before they reach production.
- `docs/RELEASE-CHECKLIST.md`: usage instructions and validation limits.

See `docs/RELEASE-CHECKLIST.md` before copying these files into the repository.
