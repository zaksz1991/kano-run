# Live mobile check (2026-10-16)

## What we verified on kano-run.vercel.app
- Title screen: **OK** on phone width (layout, buttons, safe spacing)
- START DRIVING → loading shown
- This audit browser **cannot create WebGL** → "Error creating WebGL context" here is an environment limit, not proof phones fail
- In-run HUD (mission cards / radio stack) **could not be screenshot** without WebGL

## GitHub vs live CSS
- `main` index links `/css/mobile-hud.css`
- File must live under **`public/css/mobile-hud.css`** so Vite copies it to `dist/css/`
- Main.js now also injects the link + inline fallback rules

## Your phone test checklist
1. Hard-close tab, reopen https://kano-run.vercel.app
2. Start run
3. Confirm: no big mission cards in center, no full radio panel
4. Missions only via dock button
5. Drive buttons usable with thumbs
