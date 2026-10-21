# Kano Keke Life — Vite Build Dependency Restoration

## Root cause

The current repository `package.json` was reduced to a minimal test-only manifest. It contains no `dependencies`, no Vite package, no Three.js package, and no `build` script. Vercel then removes cached packages during installation and runs its configured `vite build` command, but the `vite` executable no longer exists. This matches the reported `sh: line 1: vite: command not found` error.

## Apply this repair

Replace only the repository-root `package.json` with the complete `package.json` in this ZIP.

This restores:
- `vite` as a regular dependency (not a devDependency), so production-mode dependency pruning will not remove the build tool.
- `three` as a regular dependency for the game's Three.js imports.
- the expected `dev`, `build`, `preview`, and test scripts.
- the Node 24.x engine requirement used by the previously valid manifest.

Keep `vite.config.js`, the GLB catalogue scanner, manual model mappings, HTML files, renderer, game modules, and all GLB assets unchanged.

## Validation

The JSON manifest parses successfully. The dependency placement ensures Vite is in `dependencies`, not `devDependencies`, which directly addresses builds where npm prunes development dependencies. The ZIP includes only this manifest and these instructions.

A fresh Vercel build has not been run from this environment. The next deployment log must confirm npm installs Vite and then runs `vite build` successfully.
