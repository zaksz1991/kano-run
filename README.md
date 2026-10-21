# Kano Keke Life — Vite Dependency Build Repair

## Why the deployment failed

The build log shows `npm install` removed packages and the build then failed with `vite: command not found`. This means the package manifest used by that deployment did not leave Vite installed, even though the `build` script calls `vite build`.

## File included

- `package.json` — complete replacement manifest with `vite` and `three` declared as runtime dependencies, the existing Vite scripts, Node 24.x, and the optional test script.

## Installation

In GitHub's browser editor, open the repository-root `package.json` and replace the entire file with the included version. Save the change.

Do not delete or replace any other file for this fix. The manifest intentionally places Vite under `dependencies` rather than `devDependencies` so production-only dependency installation cannot omit the build tool.

## Validation

The JSON was parsed successfully and the `build` script resolves to `vite build`. A successful Vercel build has not been verified; the next Vercel build is the final check.
