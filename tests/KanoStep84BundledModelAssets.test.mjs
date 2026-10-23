import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_ROOT = path.join(ROOT, 'public', 'assets', 'models');
const MODEL_MANAGER = readFileSync(path.join(ROOT, 'js', 'ModelManager.js'), 'utf8');

const FIRST_CANDIDATES = {
  keke: 'vehicles/keke/keke-3.glb',
  car: 'vehicles/cars/quaternius_cc0-normal-car-1190.glb',
  suv: 'vehicles/cars/quaternius_cc0-suv-1402.glb',
  truck: 'vehicles/cars/quaternius_cc0-truck-1449.glb',
  bus: 'vehicles/special/bus.glb',
  motorcycle: 'vehicles/special/okada.glb',
  police: 'vehicles/special/police.glb',
  karota: 'vehicles/special/karota.glb',
  ambulance: 'vehicles/special/ambulance.glb',
  passenger: 'characters/passengers/hijab_muslim_woman.glb',
  passengerWoman: 'characters/passengers/hijab_muslim_woman.glb',
  passengerMan: 'characters/passengers/Man.glb',
  passengerVIP: 'characters/passengers/Man in Suit.glb',
  security: 'characters/pedestrians/Man in Long Sleeves.glb',
  pedestrian: 'characters/pedestrians/pedestrian.glb',
  pedestrianWoman: 'characters/pedestrians/muslim_girl.glb',
  building: 'world/buildings-suburban/building-type-d.glb',
  industrialBuilding: 'world/buildings-industrial/building-a.glb',
  flyover: 'world/roads/kano_urban_flyover.glb',
  roadlight: 'world/roads/light-square.glb',
  cone: 'world/roads/construction-cone.glb',
  dirtmound: 'environment/ground/photoscan_-_pothole_1.glb',
  bench: 'world/props/Bench.glb',
  trafficLight: 'world/props/Traffic-Light.glb',
  stopSign: 'world/props/Stop-sign.glb',
};

function readGlb(relativePath) {
  const fullPath = path.join(MODELS_ROOT, relativePath);
  assert.ok(existsSync(fullPath), `Missing bundled model: ${relativePath}`);
  const bytes = readFileSync(fullPath);
  assert.ok(bytes.length >= 28, `${relativePath} is too small to be a GLB file`);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${relativePath} has no GLB magic header`);
  assert.equal(bytes.readUInt32LE(4), 2, `${relativePath} is not glTF binary version 2`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${relativePath} declares the wrong total length`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `${relativePath} has no leading JSON chunk`);
  assert.ok(jsonLength > 0 && 20 + jsonLength <= bytes.length, `${relativePath} has an invalid JSON chunk length`);
  const jsonText = bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\u0000+$/g, '').trim();
  const document = JSON.parse(jsonText);
  assert.equal(document.asset?.version, '2.0', `${relativePath} is not glTF 2.0`);
  assert.ok(Array.isArray(document.meshes) && document.meshes.length > 0, `${relativePath} has no meshes`);
  assert.ok(Array.isArray(document.nodes) && document.nodes.length > 0, `${relativePath} has no nodes`);
  assert.ok(Array.isArray(document.materials) && document.materials.length > 0, `${relativePath} has no materials`);
  assert.ok(Array.isArray(document.scenes) && document.scenes.length > 0, `${relativePath} has no scene`);
  const binHeader = 20 + jsonLength;
  assert.ok(binHeader + 8 <= bytes.length, `${relativePath} has no binary buffer chunk`);
  const binaryLength = bytes.readUInt32LE(binHeader);
  assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942, `${relativePath} has no BIN chunk`);
  assert.ok(binHeader + 8 + binaryLength <= bytes.length, `${relativePath} binary chunk exceeds file length`);
  assert.ok(document.buffers?.[0]?.byteLength <= binaryLength, `${relativePath} buffer exceeds BIN chunk`);
  assert.ok(!document.buffers.some((buffer) => buffer.uri), `${relativePath} references an external buffer`);

  for (const [meshIndex, mesh] of document.meshes.entries()) {
    assert.ok(mesh.primitives?.length, `${relativePath} mesh ${meshIndex} has no primitives`);
    for (const primitive of mesh.primitives) {
      assert.ok(Number.isInteger(primitive.attributes?.POSITION), `${relativePath} has a primitive without POSITION`);
      assert.ok(Number.isInteger(primitive.attributes?.NORMAL), `${relativePath} has a primitive without NORMAL`);
      assert.ok(Number.isInteger(primitive.material), `${relativePath} has a primitive without a material`);
      const position = document.accessors[primitive.attributes.POSITION];
      assert.equal(position?.type, 'VEC3', `${relativePath} has an invalid position accessor`);
      assert.ok(position?.count >= 3, `${relativePath} has too few vertices`);
      assert.ok(position?.min?.length === 3 && position?.max?.length === 3, `${relativePath} has no bounding range`);
      for (let axis = 0; axis < 3; axis += 1) {
        assert.ok(Number.isFinite(position.min[axis]) && Number.isFinite(position.max[axis]), `${relativePath} has non-finite bounds`);
        assert.ok(position.max[axis] - position.min[axis] > 0.01, `${relativePath} has degenerate mesh bounds`);
      }
    }
  }
  return { bytes, document };
}

test('each configured model category starts with a bundled GLB candidate', () => {
  const catalogStart = MODEL_MANAGER.indexOf('const CATALOG = {');
  const dimensionsStart = MODEL_MANAGER.indexOf('// MODEL DIMENSIONS', catalogStart);
  assert.ok(catalogStart >= 0 && dimensionsStart > catalogStart, 'ModelManager catalog boundaries could not be read');
  const catalog = MODEL_MANAGER.slice(catalogStart, dimensionsStart);
  for (const [category, relativePath] of Object.entries(FIRST_CANDIDATES)) {
    const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const candidate = catalog.match(new RegExp(`\\b${escapedCategory}\\s*:\\s*\\[\\s*'([^']+)'`));
    assert.ok(candidate, `No model catalog entry found for ${category}`);
    assert.equal(candidate[1], relativePath, `${category} first candidate changed; update this test and bundle intentionally`);
    assert.ok(existsSync(path.join(MODELS_ROOT, relativePath)), `${category} first candidate is not bundled: ${relativePath}`);
  }
});

test('the bundled catalog covers all unique first-choice model paths', () => {
  const unique = new Set(Object.values(FIRST_CANDIDATES));
  assert.equal(unique.size, 24);
  for (const relativePath of unique) assert.ok(existsSync(path.join(MODELS_ROOT, relativePath)), `Missing ${relativePath}`);
});

for (const relativePath of [...new Set(Object.values(FIRST_CANDIDATES))]) {
  test(`GLB structure and embedded geometry: ${relativePath}`, () => {
    const { bytes, document } = readGlb(relativePath);
    assert.ok(bytes.length < 500_000, `${relativePath} exceeds the per-model mobile budget`);
    assert.ok(document.meshes.length <= 14, `${relativePath} has too many draw-call meshes (${document.meshes.length})`);
    assert.ok(document.materials.every((material) => material.pbrMetallicRoughness?.baseColorFactor?.length === 4), `${relativePath} has an invalid base color material`);
  });
}

test('the whole bundled model directory stays under the small-asset budget', () => {
  const total = [...new Set(Object.values(FIRST_CANDIDATES))]
    .reduce((sum, rel) => sum + statSync(path.join(MODELS_ROOT, rel)).size, 0);
  assert.ok(total < 2_500_000, `Model pack exceeds 2.5 MB (${total} bytes)`);
});
