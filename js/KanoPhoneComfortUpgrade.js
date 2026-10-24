// KANO LIFE — PHONE COMFORT: picture sharpness setting + compact road guide.
// Additive. Sharpness is stored under RENDER_SHARPNESS_KEY and read by
// KanoDeviceTier at the next game start (a reload applies it at once).
import { RENDER_SHARPNESS_KEY, getRenderSharpness } from './KanoDeviceTier.js';

const STYLE_ID = 'kano-phone-comfort-style';
const ROW_ID = 'kano-sharpness-row';
const SIZE_ROW_ID = 'kano-ui-size-row';
const UI_SCALE_KEY = 'kano-life-ui-scale-v1';
const UI_SCALES = [['0.85', 'Small'], ['1', 'Normal'], ['1.15', 'Large'], ['1.25', 'Extra large']];

function readUiScale() {
  try {
    const value = localStorage.getItem(UI_SCALE_KEY);
    return UI_SCALES.some(([v]) => v === value) ? value : '1';
  } catch { return '1'; }
}

// Scales the on-screen controls and HUD only (the 3D picture is unaffected).
function applyUiScale(value) {
  document.documentElement.style.setProperty('--kano-ui-scale', value);
}

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // Road guide: keep it as a slim strip so the road stays visible.
  style.textContent = `
    #drive-controls, .hud-top, .hud-bottom, #kano-road-navigation { zoom: var(--kano-ui-scale, 1); }
    #drive-controls .control { white-space: nowrap; }
    @media (max-width: 700px) {
      #kano-road-navigation #kano-nav-note,
      #kano-road-navigation .kano-nav-note,
      #kano-road-navigation #kano-road-path-status { display: none !important; }
      #kano-road-navigation { padding: 6px 8px !important; }
      #kano-road-navigation .kano-nav-head { margin: 0 0 4px !important; }
      #kano-road-navigation .kano-nav-choice { min-height: 44px !important; padding: 3px 2px !important; }
      #kano-road-navigation .kano-nav-arrow { font-size: 18px !important; }
    }
  `;
  document.head.append(style);
}

function buildRow() {
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.id = ROW_ID;
  const label = document.createElement('label');
  label.setAttribute('for', 'sharpness-select');
  label.textContent = 'Picture sharpness';
  const select = document.createElement('select');
  select.id = 'sharpness-select';
  for (const [value, text] of [['standard', 'Standard · saves battery'], ['sharp', 'Sharp · clearer picture'], ['max', 'Maximum · native resolution']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = getRenderSharpness();
  select.addEventListener('change', () => {
    try { localStorage.setItem(RENDER_SHARPNESS_KEY, select.value); } catch { /* storage unavailable */ }
    note.textContent = 'Saved. Reload the page to apply the new sharpness.';
  });
  const note = document.createElement('small');
  note.style.cssText = 'display:block;margin-top:4px;opacity:.75';
  note.textContent = 'Sharper pictures use more battery and heat. The game still lowers quality if the phone struggles.';
  row.append(label, select, note);
  return row;
}

function buildSizeRow() {
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.id = SIZE_ROW_ID;
  const label = document.createElement('label');
  label.setAttribute('for', 'ui-size-select');
  label.textContent = 'Game controls size';
  const select = document.createElement('select');
  select.id = 'ui-size-select';
  for (const [value, text] of UI_SCALES) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = readUiScale();
  select.addEventListener('change', () => {
    try { localStorage.setItem(UI_SCALE_KEY, select.value); } catch { /* storage unavailable */ }
    applyUiScale(select.value);
  });
  row.append(label, select);
  return row;
}

function mount() {
  if (typeof document === 'undefined' || document.getElementById(ROW_ID)) return true;
  const quality = document.getElementById('quality-select');
  const host = quality?.closest('.setting-row') || quality?.parentElement;
  if (!host?.parentElement) return false;
  host.after(buildRow());
  if (!document.getElementById(SIZE_ROW_ID)) host.after(buildSizeRow());
  return true;
}

injectStyle();
if (typeof document !== 'undefined') applyUiScale(readUiScale());
if (typeof document !== 'undefined' && !mount()) {
  // The settings rows are created/moved by other modules; wait for them.
  const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 20000);
}
