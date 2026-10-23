# Kano Life — Step 85: Vercel Build Command Repair

## What this fixes

The failed Vercel build says `sh: line 1: vite: command not found`. The repository's root `package.json` declares Vite and defines the `build` script as `vite build`. This replacement `vercel.json` explicitly reinstates dependency installation before the build and invokes the package script rather than the bare `vite` executable.

- Install command: `npm install --include=dev`
- Build command: `npm run build`
- Output directory: `dist`
- Framework preset: `vite`

The replacement preserves the existing URL settings and security/model/asset headers.

## Apply using GitHub's website

1. Open the `zaksz1991/kano-run` repository on GitHub.
2. Open the root `vercel.json` file.
3. Choose Edit (pencil), replace its entire contents with the supplied `vercel.json`, and commit the change to `main`.
4. Vercel should start a new deployment. Confirm that the build log shows dependency installation before `npm run build`.

No `harness` folder, `boot.py`, terminal, or partial code edits are needed.

## Verification limits

The JSON was parsed and checked for the expected commands. This package has not been deployed to Vercel from this environment. If it still fails, check Vercel Project Settings → Build and Development Settings → Root Directory and ensure it points to the repository root (the folder containing `package.json`). Also check there is no separate empty Install Command overriding dependency installation; this file should override that setting.
