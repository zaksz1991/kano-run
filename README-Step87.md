# Kano Life — Step 87: Static Vercel Deployment Configuration

## What this changes

The repository is a root-level static HTML/CSS/JavaScript game. The root `index.html` imports the game scripts directly from `/js/` and styles from `/css/`. It does not require Vite to publish those source files as-is.

This replacement `vercel.json` preserves the existing URL handling and response headers, while overriding framework/build/install settings so Vercel serves the repository root directly:

- `framework: null` selects Vercel's **Other** framework preset.
- `installCommand: ""` skips dependency installation (Vercel documents the empty install command as the way to skip installation).
- `buildCommand: null` explicitly removes the configured build command.
- `outputDirectory: "."` serves root `index.html`, `js/`, `css/`, and the existing `public/` assets from the project root.

References:
- https://vercel.com/docs/project-configuration/vercel-json
- https://vercel.com/docs/builds/configure-a-build

## Apply

1. Open https://github.com/zaksz1991/kano-run.
2. Open the root `vercel.json` and choose **Edit**.
3. Replace the complete contents with this package's `vercel.json`.
4. Commit to `main`; Vercel should start a new deployment.
5. In the logs, verify that it no longer runs `npm install --include=dev` or `vite build`.

Do not create a `package.json`, install Vite, or replace game files for this static-hosting correction.

## Validation and limitations

- Parsed as JSON successfully.
- Configuration values checked against the current Vercel configuration documentation on 2026-10-23.
- Existing response headers and URL settings preserved from the public repository's `vercel.json`.
- No Vercel deployment was executed from this workspace. Successful deployment remains unverified until the next build log confirms it.
