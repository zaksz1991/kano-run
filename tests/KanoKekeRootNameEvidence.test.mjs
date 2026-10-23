import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKekeEvidenceNamePaths, classifyKekeMeshEvidence } from '../js/KanoKekeStructureEvidence.js';

const vehicleCoreName = /vehicle|keke|chassis|bodywork|carbody|body[_ .-]?panel|roof|cabin|bumper|windshield|handlebar|headlight|mudguard|fork|axle|fender|engine|motor|fairing|door|bonnet|hood|grille|grill|dashboard|steering|headlamp/i;
const wheelPartName = /wheel|tire|tyre/i;
const characterName = /pedestrian|character|human|person|driver|rider|passenger|crowd|woman|man|female|male|npc/i;

function classify(descendantNames, rootName, shape = {}) {
  const paths = buildKekeEvidenceNamePaths(descendantNames, rootName);
  return {
    paths,
    evidence: classifyKekeMeshEvidence({
      ...paths,
      width: shape.width ?? 0.3,
      height: shape.height ?? 0.7,
      depth: shape.depth ?? 0.25,
      centerY: shape.centerY ?? 1.2,
      vehicleCoreName,
      wheelPartName,
      characterName,
    }),
  };
}

test('generic keke model root is not vehicle-structure evidence for unnamed crowd meshes', () => {
  const { paths, evidence } = classify(['Mesh_01', 'Root'], 'keke');
  assert.equal(paths.completeNamePath, 'Mesh_01 Root keke');
  assert.equal(paths.structuralNamePath, 'Mesh_01');
  assert.equal(evidence.vehicleCore, false);
  assert.equal(evidence.namedWheel, false);
  assert.equal(evidence.broadLowBody, false);
});

test('a pedestrian GLB aliased as keke is rejected from character evidence', () => {
  const { evidence } = classify(['CrowdMale', 'BodyMesh'], 'keke', {
    width: 0.45, height: 1.7, depth: 0.35, centerY: 1.0,
  });
  assert.equal(evidence.looksLikeCharacter, true);
  assert.equal(evidence.vehicleCore, false);
  assert.equal(evidence.broadLowBody, false);
});

test('a descendant KekeBody part still counts as specific vehicle structure', () => {
  const { paths, evidence } = classify(['KekeBody', 'Mesh_01'], 'Scene');
  assert.match(paths.structuralNamePath, /KekeBody/);
  assert.equal(evidence.vehicleCore, true);
});

test('wheel labels remain valid structural evidence when their root is generic', () => {
  const { evidence } = classify(['Wheel_FL'], 'keke');
  assert.equal(evidence.namedWheel, true);
  assert.equal(evidence.vehicleCore, false);
});

test('a broad low chassis can pass the fallback without naming vehicle parts', () => {
  const { evidence } = classify(['BodyMesh'], 'keke', {
    width: 1.55, height: 0.72, depth: 1.18, centerY: 0.62,
  });
  assert.equal(evidence.looksLikeCharacter, false);
  assert.equal(evidence.broadLowBody, true);
});

test('a tall or high mesh does not pass the broad low chassis fallback', () => {
  const { evidence } = classify(['BodyMesh'], 'keke', {
    width: 1.2, height: 1.1, depth: 0.8, centerY: 1.2,
  });
  assert.equal(evidence.broadLowBody, false);
});

 test('character names prevent broad geometry from masquerading as a chassis', () => {
  const { evidence } = classify(['MaleCharacter', 'BodyMesh'], 'keke', {
    width: 1.3, height: 0.7, depth: 0.9, centerY: 0.6,
  });
  assert.equal(evidence.looksLikeCharacter, true);
  assert.equal(evidence.broadLowBody, false);
});
