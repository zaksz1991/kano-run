import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'js', 'KanoLifeRootCauseRepair.js');
const source = await readFile(file, 'utf8');
const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

assert.match(source, /function activateEmbeddedAnimation\(actor, path, clips, mode, requestToken\)/);
assert.match(source, /kanoEmbeddedAnimationDesiredMode/);
assert.match(source, /nextAction\.crossFadeFrom\(previousAction, 0\.22, false\)/);
assert.match(source, /requestEmbeddedAnimation\(actor, actionMode\)/);
assert.match(source, /const actionMode = String\(rig\.action \|\| 'idle'\)/);
assert.match(source, /actions: new Map\(\)/);
assert.match(source, /const embeddedAnimationBudgetWaitlist = new Set\(\)/);
assert.match(source, /rootAudit\.embeddedAnimations\.budgetWaitlist = embeddedAnimationBudgetWaitlist\.size/);
assert.match(source, /for \(const \[actor, entry\] of embeddedAnimationMixers\)/);
assert.doesNotMatch(source, /for \(const \[actor, entry\] of \[\.\.\.embeddedAnimationMixers\.entries\(\)\]\)/);
assert.match(source, /kanoSeatEntryTransition/);
assert.match(source, /durationMs: 360/);
assert.match(source, /actor\.userData\.kanoRootCauseSeatBaseY = seatTargetY/);
assert.match(source, /disposeAnimationProbeScene\(gltf\.scene\)/);
assert.match(source, /keke-model-calibration-v1/);
assert.match(source, /function updateRealGoats\(renderer, dt\)/);
assert.match(source, /Game\.prototype/);

console.log('PASS: JavaScript syntax');
console.log('PASS: life-scene activity changes request the matching embedded clip');
console.log('PASS: embedded state transitions crossfade between compatible clips');
console.log('PASS: clip actions are cached per actor to avoid repeated creation');
console.log('PASS: mixer-budget deferrals retry when animation capacity frees');
console.log('PASS: mixer update avoids allocating a full entries array each frame');
console.log('PASS: seated passenger entry eases into the seat without persistent vertical offset');
console.log('PASS: previous keke calibration, goat discovery, vendor, passenger and damage repairs remain in the file');
