# Integration details

Target file: `js/game.js`

1. In `spawnTraffic()`, replace the current static `types` array and `choose(types)` selection with the weighted selection hunk.
2. In `pickup(zone)`, insert `marketDemandFactor` immediately before `const fareFactor`, then multiply by it inside that factor expression.
3. In `updateEnvironment(dt)`, replace the existing `if (event === 'wedding')` traffic-spawn block with the keke-convoy hunk.

Do not replace the entire 2,900-line game file. These are three narrow edits to existing methods. The unified diff is included for reference, but no automated application or deployment was performed.
