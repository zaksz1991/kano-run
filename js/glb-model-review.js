import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CATALOG_KEYS, CATEGORY_LABELS, cloneJson, initialOverridesFromReport,
  currentCategoryPaths, toggleCategoryPath, publicModelUrl, createOverridePayload,
  currentAssignments, classifyFilterMatches,
} from './glb-model-review-utils.js';

const $ = (id) => document.getElementById(id);
const elements = {
  metricTotal: $('metricTotal'), metricClassified: $('metricClassified'), metricUnclassified: $('metricUnclassified'), metricDraft: $('metricDraft'),
  search: $('search'), assetList: $('assetList'), selectedTitle: $('selectedTitle'), reloadPreview: $('reloadPreview'), viewer: $('viewer'), viewerMessage: $('viewerMessage'), viewerStatus: $('viewerStatus'),
  detailMeshes: $('detailMeshes'), detailTriangles: $('detailTriangles'), detailMaterials: $('detailMaterials'), detailAnimations: $('detailAnimations'), detailSize: $('detailSize'), detailDimensions: $('detailDimensions'), detailPath: $('detailPath'), detailHints: $('detailHints'),
  categorySelect: $('categorySelect'), toggleMapping: $('toggleMapping'), copyPath: $('copyPath'), mappingStatus: $('mappingStatus'), exportOverrides: $('exportOverrides'), exportCsv: $('exportCsv'), resetDraft: $('resetDraft'),
  clipControl: $('clipControl'), clipSelect: $('clipSelect'), playClip: $('playClip'),
};

const AUDIT_URL = '/assets/models/model-catalog-audit.generated.json';
const DRAFT_KEY = 'kano-life-glb-visual-review-draft-v1';
let report = null;
let allFiles = [];
let selectedFile = null;
let filter = 'all';
let draft = null;
let originalDraft = null;
let loadToken = 0;
let currentRoot = null;
let currentMixer = null;
let currentAnimations = [];
let currentClipAction = null;
let raf = 0;
let lastFrame = performance.now();
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let gridHelper = null;

function setStatus(node, text, kind = '') {
  node.textContent = text;
  node.classList.remove('good', 'bad');
  if (kind) node.classList.add(kind);
}
function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return '—';
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}
function formatDim(v) {
  return [v.x, v.y, v.z].map((n) => Number(n).toFixed(2)).join(' × ');
}
function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function setViewerMessage(title, body) {
  elements.viewerMessage.hidden = false;
  elements.viewerMessage.innerHTML = `<div><strong>${safeText(title)}</strong>${safeText(body)}</div>`;
}

function initRenderer() {
  if (renderer) return true;
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a1321');
    camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
    camera.position.set(4.1, 3.1, 5.2);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor('#0a1321', 1);
    elements.viewer.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 1.2;
    controls.maxDistance = 35;
    controls.target.set(0, 0.7, 0);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x293243, 2.0));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
    key.position.set(4, 8, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x7acbe3, 1.0);
    fill.position.set(-5, 3, -4);
    scene.add(fill);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x172438, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.015;
    ground.name = 'preview-ground';
    scene.add(ground);
    gridHelper = new THREE.GridHelper(20, 40, 0x3d6077, 0x273b50);
    gridHelper.position.y = 0.001;
    scene.add(gridHelper);
    window.addEventListener('resize', resizeRenderer);
    resizeRenderer();
    renderLoop();
    return true;
  } catch (error) {
    setViewerMessage('3D preview unavailable', `${error?.message || error}. WebGL may be disabled or unavailable on this device.`);
    setStatus(elements.viewerStatus, 'WebGL initialization failed', 'bad');
    return false;
  }
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const width = Math.max(1, elements.viewer.clientWidth);
  const height = Math.max(1, elements.viewer.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function renderLoop(now = performance.now()) {
  raf = requestAnimationFrame(renderLoop);
  const delta = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (currentMixer) currentMixer.update(delta);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function disposeRoot(root) {
  if (!root) return;
  root.traverse((object) => {
    if (object.geometry?.dispose) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value && value.isTexture && typeof value.dispose === 'function') value.dispose();
      }
      material.dispose?.();
    }
  });
}

function clearCurrentModel() {
  currentMixer?.stopAllAction();
  currentMixer = null;
  currentAnimations = [];
  currentClipAction = null;
  if (currentRoot) {
    scene?.remove(currentRoot);
    disposeRoot(currentRoot);
    currentRoot = null;
  }
  elements.clipControl.hidden = true;
  elements.clipSelect.innerHTML = '';
}

function configureAnimations(clips, root) {
  currentAnimations = clips || [];
  if (!currentAnimations.length) {
    elements.clipControl.hidden = true;
    return;
  }
  elements.clipControl.hidden = false;
  elements.clipSelect.innerHTML = currentAnimations.map((clip, i) => `<option value="${i}">${safeText(clip.name || `Animation ${i + 1}`)}</option>`).join('');
  currentMixer = new THREE.AnimationMixer(root);
  playSelectedClip();
}

function playSelectedClip() {
  if (!currentMixer || !currentAnimations.length) return;
  const index = Number(elements.clipSelect.value || 0);
  const clip = currentAnimations[index];
  if (!clip) return;
  if (currentClipAction) currentClipAction.stop();
  currentClipAction = currentMixer.clipAction(clip);
  currentClipAction.reset().play();
}

async function loadSelectedModel(reload = false) {
  if (!selectedFile) return;
  if (!initRenderer()) return;
  const token = ++loadToken;
  const file = selectedFile;
  clearCurrentModel();
  elements.reloadPreview.disabled = true;
  elements.viewerMessage.hidden = false;
  setViewerMessage('Loading GLB…', file.path);
  setStatus(elements.viewerStatus, 'Loading model file…');
  elements.selectedTitle.textContent = file.path.split('/').pop();
  elements.detailPath.textContent = file.path;
  elements.detailSize.textContent = formatBytes(file.bytes);
  elements.detailHints.textContent = (file.internalNames || []).length ? `Embedded GLB names: ${(file.internalNames || []).slice(0, 16).join(' · ')}` : 'This GLB exposes no useful embedded object names in the JSON header.';
  elements.detailMeshes.textContent = '…';
  elements.detailTriangles.textContent = '…';
  elements.detailMaterials.textContent = '…';
  elements.detailAnimations.textContent = '…';
  elements.detailDimensions.textContent = '…';
  const url = publicModelUrl(file.path);
  try {
    const loader = createGLTFLoader();
    const gltf = await loader.loadAsync(url);
    if (token !== loadToken) { disposeRoot(gltf.scene); return; }
    const root = gltf.scene || gltf.scenes?.[0];
    if (!root) throw new Error('The GLB loaded but did not contain a usable scene.');
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const originalSize = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(originalSize.x + originalSize.y + originalSize.z) || originalSize.length() < 1e-5) {
      throw new Error('The file loaded, but its geometry bounds are empty or invalid.');
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(originalSize.x, originalSize.y, originalSize.z, 0.001);
    const fitScale = 2.7 / maxDimension;
    root.scale.multiplyScalar(fitScale);
    root.position.set(-center.x * fitScale, -bounds.min.y * fitScale, -center.z * fitScale);
    root.updateMatrixWorld(true);
    scene.add(root);
    currentRoot = root;
    const finalBounds = new THREE.Box3().setFromObject(root);
    const finalSize = finalBounds.getSize(new THREE.Vector3());
    let meshCount = 0, triangleCount = 0;
    const materials = new Set();
    root.traverse((object) => {
      if (!object.isMesh) return;
      meshCount += 1;
      const indexCount = object.geometry?.index?.count;
      const positionCount = object.geometry?.attributes?.position?.count || 0;
      triangleCount += Math.floor((indexCount ?? positionCount) / 3);
      const mats = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      mats.forEach((material) => { if (material) materials.add(material); });
      object.frustumCulled = false;
    });
    elements.detailMeshes.textContent = String(meshCount);
    elements.detailTriangles.textContent = triangleCount.toLocaleString();
    elements.detailMaterials.textContent = String(materials.size);
    elements.detailAnimations.textContent = String(gltf.animations?.length || 0);
    elements.detailDimensions.textContent = formatDim(originalSize);
    controls.target.set(0, Math.max(0.25, finalSize.y * 0.42), 0);
    const distance = Math.max(3.8, Math.max(finalSize.x, finalSize.y, finalSize.z) * 2.0);
    camera.position.set(distance * 0.76, distance * 0.55, distance);
    camera.near = 0.01;
    camera.far = Math.max(100, distance * 20);
    camera.updateProjectionMatrix();
    controls.minDistance = Math.max(0.6, distance * 0.28);
    controls.maxDistance = Math.max(12, distance * 8);
    controls.update();
    configureAnimations(gltf.animations, root);
    elements.viewerMessage.hidden = true;
    setStatus(elements.viewerStatus, reload ? 'Preview reloaded successfully' : 'Loaded successfully', 'good');
    updateMappingUI();
  } catch (error) {
    if (token !== loadToken) return;
    setViewerMessage('Could not preview this model', `${error?.message || error}. Check the file path and GLB validity. A 404 means the file is not being served at the reported path.`);
    setStatus(elements.viewerStatus, 'Model load failed — inspect exact path and HTTP status', 'bad');
    elements.detailMeshes.textContent = '0';
    elements.detailTriangles.textContent = '0';
    elements.detailMaterials.textContent = '0';
    elements.detailAnimations.textContent = '0';
    elements.detailDimensions.textContent = 'Invalid / unavailable';
  } finally {
    if (token === loadToken) elements.reloadPreview.disabled = false;
  }
}

function currentFileCategories(file) {
  return currentAssignments(report, draft, file.path);
}

function filteredFiles() {
  const query = elements.search.value.trim().toLowerCase();
  return allFiles.filter((file) => {
    file.categories = currentFileCategories(file);
    if (!classifyFilterMatches(file, filter)) return false;
    if (!query) return true;
    const haystack = `${file.path} ${(file.internalNames || []).join(' ')} ${(file.categories || []).join(' ')}`.toLowerCase();
    return haystack.includes(query);
  });
}

function renderAssetList() {
  if (!report) return;
  const files = filteredFiles();
  elements.assetList.innerHTML = '';
  if (!files.length) {
    elements.assetList.innerHTML = '<div class="empty">No models match this filter.</div>';
    updateMetrics();
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const file of files) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `asset-item${selectedFile?.path === file.path ? ' active' : ''}`;
    const filename = file.path.split('/').pop();
    const categories = file.categories || [];
    const chips = categories.length
      ? categories.slice(0, 4).map((key) => `<span class="pill ok">${safeText(CATEGORY_LABELS[key] || key)}</span>`).join('') + (categories.length > 4 ? `<span class="pill">+${categories.length - 4}</span>` : '')
      : '<span class="pill warn">Unclassified</span>';
    button.innerHTML = `<div class="asset-title">${safeText(filename)}</div><div class="asset-path">${safeText(file.path)}</div><div class="asset-meta"><span class="pill">${formatBytes(file.bytes)}</span>${chips}</div>`;
    button.addEventListener('click', () => {
      selectedFile = allFiles.find((candidate) => candidate.path === file.path) || file;
      renderAssetList();
      loadSelectedModel();
    });
    fragment.appendChild(button);
  }
  elements.assetList.appendChild(fragment);
  updateMetrics();
}

function updateMetrics() {
  if (!report) return;
  const assignedPaths = new Set();
  for (const category of CATALOG_KEYS) currentCategoryPaths(report, draft, category).forEach((p) => assignedPaths.add(p));
  elements.metricTotal.textContent = String(allFiles.length);
  elements.metricClassified.textContent = String(assignedPaths.size);
  elements.metricUnclassified.textContent = String(allFiles.filter((file) => !assignedPaths.has(file.path)).length);
  elements.metricDraft.textContent = String(Object.keys(draft?.categories || {}).length);
}

function updateMappingUI() {
  if (!report || !selectedFile) {
    elements.toggleMapping.disabled = true;
    elements.copyPath.disabled = true;
    return;
  }
  const category = elements.categorySelect.value;
  const paths = currentCategoryPaths(report, draft, category);
  const present = paths.includes(selectedFile.path);
  elements.toggleMapping.textContent = present ? 'REMOVE FROM CATEGORY' : 'ADD TO CATEGORY';
  elements.toggleMapping.disabled = false;
  elements.copyPath.disabled = false;
  const sourceType = Object.prototype.hasOwnProperty.call(draft.categories || {}, category) ? 'draft override' : 'current generated catalog';
  setStatus(elements.mappingStatus, `${present ? 'Assigned' : 'Not assigned'} to ${CATEGORY_LABELS[category] || category}. This category currently has ${paths.length} model(s) in its ${sourceType}.`, present ? 'good' : '');
}

function updateAllDisplay() {
  renderAssetList();
  updateMappingUI();
}

function downloadBlob(filename, contents, mime = 'application/json') {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportOverrides() {
  const payload = createOverridePayload(draft);
  const changedCategories = Object.keys(payload.categories);
  if (!changedCategories.length && !Object.keys(payload.exclude).length) {
    setStatus(elements.mappingStatus, 'No manual categories have been edited. Select a GLB, choose a category, and add/remove it before exporting.', 'bad');
    return;
  }
  downloadBlob('glb-catalog-overrides.json', `${JSON.stringify(payload, null, 2)}\n`);
  setStatus(elements.mappingStatus, `Downloaded mapping JSON for ${changedCategories.length} category override(s). Replace scripts/glb-catalog-overrides.json with this file, then rebuild the game.`, 'good');
}

function exportCsv() {
  const header = ['path', 'filename', 'bytes', 'sizeKB', 'internalNames', 'categories', 'classified'];
  const rows = allFiles.map((file) => [
    file.path,
    file.path.split('/').pop(),
    file.bytes ?? '',
    Number((Number(file.bytes || 0) / 1024).toFixed(2)),
    (file.internalNames || []).join(' | '),
    currentFileCategories(file).join(' | '),
    currentFileCategories(file).length ? 'yes' : 'no',
  ]);
  const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  downloadBlob('kano-life-glb-inventory.csv', [header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

function resetDraft() {
  if (!originalDraft) return;
  draft = cloneJson(originalDraft);
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  setStatus(elements.mappingStatus, 'Draft reset to the generated catalogue and existing applied overrides. Your GLB files were not changed.', 'good');
  updateAllDisplay();
}

async function copySelectedPath() {
  if (!selectedFile) return;
  try {
    await navigator.clipboard.writeText(selectedFile.path);
    setStatus(elements.mappingStatus, 'Copied exact path: ' + selectedFile.path, 'good');
  } catch {
    setStatus(elements.mappingStatus, 'Clipboard access was blocked. Copy this exact path from the asset-inspection panel.', 'bad');
  }
}

function populateCategoryOptions() {
  elements.categorySelect.innerHTML = CATALOG_KEYS.map((key) => `<option value="${safeText(key)}">${safeText(CATEGORY_LABELS[key] || key)}</option>`).join('');
}

function parseSavedDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== 1 || typeof parsed.categories !== 'object') return null;
    for (const [category, paths] of Object.entries(parsed.categories)) {
      if (!CATALOG_KEYS.includes(category) || !Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) return null;
    }
    return parsed;
  } catch { return null; }
}

async function boot() {
  populateCategoryOptions();
  setStatus(elements.mappingStatus, 'Loading generated model inventory…');
  try {
    const response = await fetch(AUDIT_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Inventory request returned HTTP ${response.status}. The Vite GLB catalogue plugin must be installed and the game rebuilt.`);
    report = await response.json();
    allFiles = (report.files || []).filter((file) => typeof file.path === 'string').sort((a, b) => a.path.localeCompare(b.path));
    if (!allFiles.length) {
      setViewerMessage('No GLB assets found', 'The catalogue contains zero model files. Verify that your GLBs are under public/assets/models/.');
      elements.assetList.innerHTML = '<div class="empty">No GLB files were found under public/assets/models/.</div>';
    }
    originalDraft = initialOverridesFromReport(report);
    draft = parseSavedDraft() || cloneJson(originalDraft);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    if (report.overrideAudit?.errors?.length) {
      setStatus(elements.mappingStatus, `Catalogue loaded with ${report.overrideAudit.errors.length} mapping warning(s). Check overrideAudit.errors in the generated report before exporting a mapping.`, 'bad');
    } else {
      setStatus(elements.mappingStatus, `Catalogue loaded: ${report.discoveredCount} actual GLB files discovered. Select a model to preview it, then set its category.`, 'good');
    }
    if (!allFiles.length) {
      elements.metricTotal.textContent = '0'; elements.metricClassified.textContent = '0'; elements.metricUnclassified.textContent = '0';
    }
    renderAssetList();
    const first = allFiles.find((file) => !currentFileCategories(file).length) || allFiles[0];
    if (first) {
      selectedFile = first;
      renderAssetList();
      loadSelectedModel();
    }
  } catch (error) {
    elements.assetList.innerHTML = '<div class="empty">Could not load the generated model inventory.</div>';
    setViewerMessage('Model inventory unavailable', `${error?.message || error} Install the GLB catalog scanner and build-page integration included with this ZIP.`);
    setStatus(elements.mappingStatus, error?.message || String(error), 'bad');
    setStatus(elements.viewerStatus, 'Inventory unavailable', 'bad');
  }
}

elements.search.addEventListener('input', renderAssetList);
elements.categorySelect.addEventListener('change', updateMappingUI);
elements.toggleMapping.addEventListener('click', () => {
  if (!selectedFile) return;
  const result = toggleCategoryPath(report, draft, elements.categorySelect.value, selectedFile.path);
  draft = result.draft;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  setStatus(elements.mappingStatus, `${result.action === 'added' ? 'Added' : 'Removed'} ${selectedFile.path} ${result.action === 'added' ? 'to' : 'from'} ${CATEGORY_LABELS[elements.categorySelect.value] || elements.categorySelect.value}.`, 'good');
  updateAllDisplay();
});
elements.copyPath.addEventListener('click', copySelectedPath);
elements.reloadPreview.addEventListener('click', () => loadSelectedModel(true));
elements.exportOverrides.addEventListener('click', exportOverrides);
elements.exportCsv.addEventListener('click', exportCsv);
elements.resetDraft.addEventListener('click', resetDraft);
elements.clipSelect.addEventListener('change', playSelectedClip);
elements.playClip.addEventListener('click', playSelectedClip);
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  filter = button.dataset.filter || 'all';
  document.querySelectorAll('[data-filter]').forEach((node) => node.classList.toggle('active', node === button));
  renderAssetList();
}));
window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(raf);
  clearCurrentModel();
  controls?.dispose();
  renderer?.dispose();
});
window.kanoGlbVisualReview = {
  getReport: () => report ? cloneJson(report) : null,
  getDraft: () => draft ? cloneJson(draft) : null,
  selectModel: (relativePath) => {
    const next = allFiles.find((file) => file.path === relativePath);
    if (!next) return false;
    selectedFile = next;
    renderAssetList();
    loadSelectedModel();
    return true;
  },
};
boot();
