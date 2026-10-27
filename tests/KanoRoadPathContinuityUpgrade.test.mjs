import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const navSource = await readFile(new URL('js/KanoRoadNavigationUpgrade.js', root), 'utf8');
const pathSource = await readFile(new URL('js/KanoRoadPathContinuityUpgrade.js', root), 'utf8');
const bootstrap = await readFile(new URL('js/KanoModelAssetVisualUpgrade.js', root), 'utf8');

 test('Step 97 path continuity hook loads after signed world coordinates and before main.js', () => {
  const world = bootstrap.indexOf("await import('./KanoRoadWorldCoordinatesUpgrade.js')");
  const path = bootstrap.indexOf("await import('./KanoRoadPathContinuityUpgrade.js')");
  const presentation = bootstrap.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(world >= 0 && path > world && presentation > path);
});

test('Navigation uses signed world distance rather than the forward-only career odometer', () => {
  assert.match(navSource, /function navigationWorldDistance\(game\)/);
  assert.match(navSource, /Number\(game\?\.kanoWorldDistanceKm\)/);
  assert.match(navSource, /const distance = navigationWorldDistance\(game\)/);
  assert.doesNotMatch(navSource, /while \(state\.distance > nav\.nextJunctionAt/);
});

test('Reverse travel repositions the active target to a previous junction and keeps turn choices disabled', () => {
  assert.match(navSource, /function reverseJunctionAtOrBehind\(worldKm\)/);
  assert.match(navSource, /nav\.nextJunctionAt = reverse\s*\? reverseJunctionAtOrBehind\(worldKm\)/);
  assert.match(navSource, /nav\.windowOpen = false;\s*return \{ worldKm, reverse, direction \}/);
  assert.match(navSource, /windowOpen: false/);
});

test('Forward navigation re-arms missed junctions only beyond the passing band', () => {
  assert.match(navSource, /worldKm > nav\.nextJunctionAt \+ CHOICE_WINDOW_AFTER_KM/);
  assert.match(navSource, /nav\.nextJunctionAt \+= JUNCTION_INTERVAL_KM/);
  assert.match(navSource, /nav\.missedJunctions \+= 1/);
});

test('Starting a new run rebases navigation after the world coordinate is reset', () => {
  assert.match(pathSource, /Step 96 wrapper assigns the new run's world distance after/);
  assert.match(pathSource, /Step 95 navigation start hook/);
  assert.match(pathSource, /nav\.nextJunctionAt = forwardJunctionAtStart\(worldDistance\)/);
  assert.match(pathSource, /nav\.routeHistory = \[\]/);
});

test('Path integration uses the midpoint heading to reduce turn-transition jumps', () => {
  assert.match(pathSource, /const midpointHeading = previousHeading \+ wrapAngle\(currentHeading - previousHeading\) \* 0\.5/);
  assert.match(pathSource, /path\.xUnits -= Math\.sin\(midpointHeading\) \* distanceUnits/);
  assert.match(pathSource, /path\.zUnits -= Math\.cos\(midpointHeading\) \* distanceUnits/);
});

test('Reverse travel subtracts from the signed path position and is counted separately', () => {
  assert.match(pathSource, /if \(deltaKm < -1e-8\)/);
  assert.match(pathSource, /path\.reverseTravelKm \+= -deltaKm/);
  assert.match(pathSource, /path\.totalTravelKm \+= Math\.abs\(deltaKm\)/);
});

test('Route changes, turn headings and endpoints are recorded as bounded local breadcrumbs', () => {
  assert.match(pathSource, /const MAX_SEGMENTS = 64/);
  assert.match(pathSource, /function beginRouteSegment\(game, path, before\)/);
  assert.match(pathSource, /fromRoute: path\.lastRouteName/);
  assert.match(pathSource, /toRoute: game\?\.route\?\.name/);
  assert.match(pathSource, /headingFrom: before\.heading/);
  assert.match(pathSource, /endXUnits = Number\(path\.xUnits\.toFixed\(3\)\)/);
});

test('Path recording safely ignores oversized coordinate jumps instead of teleporting the trace', () => {
  assert.match(pathSource, /Math\.abs\(deltaKm\) > 0\.025/);
  assert.match(pathSource, /AUDIT\.discontinuities \+= 1/);
  assert.match(pathSource, /path\.lastWorldKm = currentWorldKm/);
});

test('A local browser audit reports signed position, heading, route, reverse distance and junction target', () => {
  assert.match(pathSource, /window\.kanoRoadPathContinuityAudit/);
  assert.match(pathSource, /signedWorldDistanceKm:/);
  assert.match(pathSource, /headingCompass:/);
  assert.match(pathSource, /reverseTravelKm:/);
  assert.match(pathSource, /nextJunctionDistanceMetres:/);
  assert.match(pathSource, /pathContinuityValid:/);
});

test('Path trace retains no browser storage export, cookies, or network sender', () => {
  assert.doesNotMatch(pathSource, /localStorage|document\.cookie|fetch\(|XMLHttpRequest|sendBeacon/);
});

test('InstantMesh is preserved as an explicit asset plan, not falsely claimed as executed', async () => {
  const instantMesh = await readFile(new URL('docs/INSTANTMESH-ASSET-PIPELINE-Step95.md', root), 'utf8');
  assert.match(instantMesh, /TencentARC\/InstantMesh/);
  assert.match(instantMesh, /not run|was not run|not executed/i);
});

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} to exist in source`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`Could not extract ${name}`);
}

const navigationMath = new Function('FIRST_JUNCTION_KM', 'JUNCTION_INTERVAL_KM', 'CHOICE_WINDOW_AFTER_KM', `
  ${extractFunction(navSource, 'navigationWorldDistance')}
  ${extractFunction(navSource, 'forwardJunctionAtOrAhead')}
  ${extractFunction(navSource, 'reverseJunctionAtOrBehind')}
  ${extractFunction(navSource, 'syncJunctionTargetForTravel')}
  return { navigationWorldDistance, forwardJunctionAtOrAhead, reverseJunctionAtOrBehind, syncJunctionTargetForTravel };
`)(0.36, 0.46, 0.045);

test('Executed navigation math keeps a junction target during the 45 m forward pass band', () => {
  assert.equal(navigationMath.forwardJunctionAtOrAhead(0), 0.36);
  assert.equal(navigationMath.forwardJunctionAtOrAhead(0.37), 0.36);
  assert.equal(navigationMath.forwardJunctionAtOrAhead(0.405), 0.36);
  assert.ok(Math.abs(navigationMath.forwardJunctionAtOrAhead(0.406) - 0.82) < 1e-9);
});

test('Executed reverse junction selection picks the nearest lower junction and handles the road start', () => {
  assert.ok(Math.abs(navigationMath.reverseJunctionAtOrBehind(0.90) - 0.82) < 1e-9);
  assert.equal(navigationMath.reverseJunctionAtOrBehind(0.70), 0.36);
  assert.equal(navigationMath.reverseJunctionAtOrBehind(0.34), null);
});

test('Executed direction transitions re-arm the same junction after reversing within its pass band', () => {
  const nav = { lastTravelDirection: 'reverse', nextJunctionAt: 0.36, junctionIndex: 0, missedJunctions: 0, windowOpen: false };
  const game = { kanoWorldDistanceKm: 0.37, s: { reverse: false, signedSpeed: 0 } };
  const result = navigationMath.syncJunctionTargetForTravel(game, nav);
  assert.equal(result.reverse, false);
  assert.ok(Math.abs(nav.nextJunctionAt - 0.36) < 1e-9);
  assert.equal(nav.lastTravelDirection, 'forward');
});

test('Executed reverse progression advances to the previous junction after clearing the pass band', () => {
  const nav = { lastTravelDirection: 'reverse', nextJunctionAt: 0.82, junctionIndex: 1, missedJunctions: 0, windowOpen: true };
  const game = { kanoWorldDistanceKm: 0.77, s: { reverse: true, signedSpeed: -8 } };
  const result = navigationMath.syncJunctionTargetForTravel(game, nav);
  assert.equal(result.reverse, true);
  assert.ok(Math.abs(nav.nextJunctionAt - 0.36) < 1e-9);
  assert.equal(nav.windowOpen, false);
});

test('Executed path integrator moves forward on -Z and reverses along the same trace', () => {
  const audit = { discontinuities: 0, reverseSamples: 0 };
  const helpers = new Function('AUDIT', 'UNITS_PER_KM', `
    ${extractFunction(pathSource, 'finiteOr')}
    ${extractFunction(pathSource, 'worldKm')}
    ${extractFunction(pathSource, 'headingOf')}
    ${extractFunction(pathSource, 'wrapAngle')}
    ${extractFunction(pathSource, 'integrateFrame')}
    return { integrateFrame };
  `)(audit, 1008);
  const path = { xUnits: 0, zUnits: 0, totalTravelKm: 0, reverseTravelKm: 0, lastWorldKm: 0, lastHeading: 0 };
  helpers.integrateFrame({ kanoWorldDistanceKm: 0.01, s: { kanoRoadHeading: 0 } }, path, 0, 0);
  assert.ok(Math.abs(path.zUnits + 10.08) < 0.001);
  helpers.integrateFrame({ kanoWorldDistanceKm: 0.005, s: { kanoRoadHeading: 0 } }, path, 0.01, 0);
  assert.ok(Math.abs(path.zUnits + 5.04) < 0.001);
  assert.equal(path.reverseTravelKm, 0.005);
  assert.equal(audit.reverseSamples, 1);
});

test('Executed path integrator turns continuously with the midpoint heading', () => {
  const audit = { discontinuities: 0, reverseSamples: 0 };
  const helpers = new Function('AUDIT', 'UNITS_PER_KM', `
    ${extractFunction(pathSource, 'finiteOr')}
    ${extractFunction(pathSource, 'worldKm')}
    ${extractFunction(pathSource, 'headingOf')}
    ${extractFunction(pathSource, 'wrapAngle')}
    ${extractFunction(pathSource, 'integrateFrame')}
    return { integrateFrame };
  `)(audit, 1008);
  const path = { xUnits: 0, zUnits: 0, totalTravelKm: 0, reverseTravelKm: 0, lastWorldKm: 0, lastHeading: 0 };
  helpers.integrateFrame({ kanoWorldDistanceKm: 0.01, s: { kanoRoadHeading: Math.PI / 2 } }, path, 0, 0);
  assert.ok(path.xUnits < -7 && path.xUnits > -8);
  assert.ok(path.zUnits < -7 && path.zUnits > -8);
  assert.equal(path.totalTravelKm, 0.01);
});

test('Executed path integrator rejects a teleport-sized frame delta', () => {
  const audit = { discontinuities: 0, reverseSamples: 0 };
  const helpers = new Function('AUDIT', 'UNITS_PER_KM', `
    ${extractFunction(pathSource, 'finiteOr')}
    ${extractFunction(pathSource, 'worldKm')}
    ${extractFunction(pathSource, 'headingOf')}
    ${extractFunction(pathSource, 'wrapAngle')}
    ${extractFunction(pathSource, 'integrateFrame')}
    return { integrateFrame };
  `)(audit, 1008);
  const path = { xUnits: 1, zUnits: 2, totalTravelKm: 0, reverseTravelKm: 0, lastWorldKm: 0, lastHeading: 0 };
  helpers.integrateFrame({ kanoWorldDistanceKm: 0.05, s: { kanoRoadHeading: 0 } }, path, 0, 0);
  assert.equal(path.xUnits, 1);
  assert.equal(path.zUnits, 2);
  assert.equal(audit.discontinuities, 1);
});
