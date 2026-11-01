# KANO LIFE — Step 109: Performance Lab Reliability Repair

## Purpose

The previous phone benchmark showed large inconsistencies between runs. In particular, the 0.5-resolution result and the fog-off result moved in the opposite direction from what those interventions should ordinarily explain. A single FPS delta without nearby control samples could not separate a rendering change from device heat, background load, or measurement noise.

Step 109 changes the diagnostic method before using the numbers to justify another rendering optimisation.

## Performance Lab changes

- Adds an 1.8-second warm-up before the first sample.
- Measures a 2-second baseline immediately before and after each intervention, with a 2.5-second intervention sample.
- Compares the intervention against the mean of the two adjacent baselines.
- Calculates baseline drift. Rows with more than 20% drift are marked `UNSTABLE` and excluded from the best-gain ranking.
- Reports sample FPS, p95 frame interval, and the proportion of frame intervals over 33 ms.
- Keeps the game tab visible during sampling; a hidden-tab interruption invalidates the run instead of accepting throttled animation-frame timings.
- Corrects the road/trees test so it actually includes named tree, palm, and vegetation objects.
- Restores the renderer method/property descriptors and scene visibility/style values after each test.

The nine bracketed scene tests take approximately 76 seconds, excluding warm-up and the final renderer timing probes. Allow roughly 85–90 seconds for a complete run.

## Renderer timing changes

- Removes the synchronous `gl.finish()` probe. That call forced a GPU/CPU synchronization point and contaminated the frame pacing being measured.
- Reports JavaScript time spent inside `renderer.render()` separately from GPU execution time.
- Uses `EXT_disjoint_timer_query_webgl2` or `EXT_disjoint_timer_query` for asynchronous GPU timing when the browser/driver exposes it.
- Checks query availability and GPU-disjoint state before accepting GPU samples. Unsupported or missing results are labelled unavailable; they are never displayed as `0.0 ms`.
- Runs the CPU and GPU probes sequentially because each temporarily wraps `renderer.render()`.

The render-submission figure is not the total game-loop CPU cost. GPU timer-query data is driver-dependent and may remain unavailable on the user's phone.

## Character LOD diagnosis and failed-bake guard

The previous summary only showed active roots, static-pose roots, static-pose meshes, and remaining skinned meshes. It could not explain why an idle actor was not converted.

The updated end-of-run diagnostic distinguishes:

- idle roots from walking roots;
- idle actors with a clip still loading, with no compatible idle clip, or with a failed animation setup;
- idle roots awaiting a valid camera-distance sample;
- roots in the near, 32–40-unit hysteresis, and far (40+ unit) distance bands;
- successful static-pose conversions and failed bake reasons.

A far character whose GLB cannot be baked is now marked as having attempted its bake. This prevents the same unsupported mesh from triggering a repeated failed bake every 120 ms. A character that was successfully converted and later returns to the near/full-detail band is restored and can be converted again after it moves away.

The distance values are scene world units, not a guaranteed physical metre measurement.

## Files

### Replace

- `js/KanoPerfLab.js`
- `js/KanoAnimationTrafficUpgrade.js`

### Add

- `tests/KanoPerfLabReliability.test.mjs`

No `index.html`, renderer entrypoint, model catalogue, gameplay presentation repair, regression guard, or `public/` asset is changed by this step.

## Phone verification

After uploading these files and allowing Vercel to deploy, open the game with `?lab=1`, start a driving session, and keep the tab visible until the Performance Lab finishes. The output should show the paired-control drift for each row, p95 frame interval, the number of stable rows, renderer submission timing, and either asynchronous GPU timing or an explicit unavailable message.

For the character result, inspect the idle/walk counts, distance bands, loading/no-clip/failed counts, baked-root counts, and any bake-failure reason. This will determine whether the previously reported `0/1` static roots were simply near the camera, lacked an idle animation entry, or failed the static-pose conversion.

No physical-device FPS improvement is claimed by this source-only update. The next optimisation should be selected from a stable phone run, not from the inconsistent earlier measurements.
