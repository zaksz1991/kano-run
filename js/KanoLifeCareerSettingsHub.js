// ============================================================
// KANO LIFE — LIFE & CAREER HUB / SETTINGS INTEGRATION
// Connects the pre-existing simulation panels to one static host.
// Keeps original setting nodes and their original IDs/handlers.
// Does not create a game, wallet, save store, or second event loop.
// ============================================================

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const careerScreen = $('#kano-life-career-screen');
const careerPanel = $('.klc-panel', careerScreen || document);
const settingsBody = $('#klc-settings-body');
const menuScreen = $('#menu-screen');
const startScreen = $('#start-screen');
const socialScreenId = 'social-drama-screen';

let returnSurface = 'start';
let closeFocusSelector = '#life-career-btn';
let movedSettingsCount = 0;

const REFRESH_APIS = [
  'kanoNorthernDriverSkillsPathways',
  'kanoNorthernDriverCareerProgression',
  'kanoNorthernDriverDigitalLife',
  'kanoNorthernDriverEmploymentMarket',
  'kanoNorthernDriverEmploymentSchedule',
  'kanoNorthernDriverAureJourney',
  'kanoNorthernDriverAureAndCulture',
  'kanoNorthernDriverLefeNegotiation',
  'kanoNorthernDriverFamilyResponsibilities',
  'kanoNorthernDriverHouseholdWater',
  'kanoNorthernDriverSeasonalResilience',
  'kanoNorthernDriverAdashiSupport',
  'kanoNorthernDriverCivicProjects',
  'kanoNorthernDriverSocialNetwork',
];

function isVisible(element) {
  return Boolean(element && !element.classList.contains('hidden'));
}

function inferReturnSurface() {
  const game = window.__KANO_ACTIVE_GAME__ || window.__KANO_ACTIVE_UI__?.game;
  if (isVisible(menuScreen)) return 'menu';
  if (isVisible(startScreen)) return 'start';
  if (game?.state === 'MENU') return 'menu';
  return 'start';
}

function moveOriginalSettings() {
  if (!settingsBody || !menuScreen) return;
  const rows = $$('.setting-row', menuScreen);
  for (const row of rows) settingsBody.append(row);
  movedSettingsCount = rows.length;

  // The engine reads these same original values. Labels are corrected without
  // changing stored values, IDs, select elements, or existing change handlers.
  const quality = $('#quality-select', settingsBody);
  if (quality) {
    const labels = new Map([
      ['auto', '3D first · automatic recovery'],
      ['3d', 'Prefer 3D renderer'],
      ['2d', 'Canvas 2D compatibility'],
    ]);
    for (const option of quality.options) {
      if (labels.has(option.value)) option.textContent = labels.get(option.value);
    }
  }

  const menuNote = $('.menu-settings-note', menuScreen);
  if (menuNote) menuNote.textContent = movedSettingsCount
    ? 'Settings are now in LIFE & CAREER. Your saved selections and controls are unchanged.'
    : 'Settings could not be moved automatically. Reload the page and use the startup notice if one appears.';
}

function refreshSimulationPanels() {
  for (const key of REFRESH_APIS) {
    try {
      const api = window[key];
      if (typeof api?.refresh === 'function') api.refresh();
    } catch (error) {
      console.warn(`[Kano Life] ${key} refresh was skipped`, error);
    }
  }
}

function readablePanelName(section) {
  const heading = $('h2, h3, h4, h5', section)?.textContent?.replace(/\s+/g, ' ').trim();
  if (heading) return heading;
  return section.id.replace(/^kano-|^kes-|^kem-/, '').replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function refreshIntegrationStatus() {
  const status = $('#klc-sim-status');
  const list = $('#klc-sim-module-list');
  if (!careerPanel || !status || !list) return;

  const sections = $$('.klc-panel > section[id]', careerScreen)
    .filter(section => !section.id.startsWith('klc-'));
  const apiCount = REFRESH_APIS.filter(key => {
    const api = window[key];
    return Boolean(api && (typeof api.snapshot === 'function' || typeof api.refresh === 'function'));
  }).length;
  const controls = ['dialect-select', 'camera-select', 'road-select', 'mute-select', 'quality-select'];
  const readyControls = controls.filter(id => Boolean($(`#${id}`, settingsBody))).length;

  status.replaceChildren();
  const summary = document.createElement('p');
  summary.className = 'klc-status-summary';
  summary.textContent = `${sections.length} life-system panel(s) mounted · ${apiCount} simulation API(s) detected · ${readyControls}/5 original settings controls present.`;
  status.append(summary);

  const detail = document.createElement('p');
  detail.className = 'klc-hub-note';
  detail.textContent = sections.length
    ? 'Mounted panels are visible below. A mounted panel is not proof that every gameplay event has been browser-tested.'
    : 'No career panels have mounted. Check the on-screen startup error and the browser console; this screen will remain available for recovery.';
  status.append(detail);

  list.replaceChildren();
  if (!sections.length) {
    const empty = document.createElement('p');
    empty.className = 'klc-empty-state';
    empty.textContent = 'No simulation panels were detected in this session.';
    list.append(empty);
    return;
  }

  for (const section of sections) {
    const item = document.createElement('div');
    item.className = 'klc-module-chip';
    const dot = document.createElement('span');
    dot.className = 'klc-module-dot';
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = readablePanelName(section);
    item.append(dot, label);
    list.append(item);
  }
}

function openCareer() {
  if (!careerScreen || !careerPanel) return;
  returnSurface = inferReturnSurface();
  closeFocusSelector = returnSurface === 'menu' ? '#life-career-menu-btn' : '#life-career-btn';

  startScreen?.classList.add('hidden');
  menuScreen?.classList.add('hidden');
  document.getElementById(socialScreenId)?.classList.add('hidden');
  careerScreen.classList.remove('hidden');
  careerPanel.scrollTop = 0;

  refreshSimulationPanels();
  refreshIntegrationStatus();
  $('#life-career-close')?.focus({ preventScroll: true });
}

function closeCareer() {
  if (!careerScreen) return;
  careerScreen.classList.add('hidden');
  if (returnSurface === 'menu') {
    menuScreen?.classList.remove('hidden');
    startScreen?.classList.add('hidden');
  } else {
    startScreen?.classList.remove('hidden');
    menuScreen?.classList.add('hidden');
  }
  $(closeFocusSelector)?.focus({ preventScroll: true });
}

function openSocialFromCareer() {
  careerScreen?.classList.add('hidden');
  const socialButton = $('#kano-social-drama-btn') || $('#kds-social-menu-btn');
  if (socialButton) {
    socialButton.click();
    return;
  }
  // Fallback preserves a usable return route if the social overlay failed to load.
  const fallback = document.createElement('p');
  fallback.className = 'klc-hub-note klc-social-fallback';
  fallback.textContent = 'The People & Relationships module is not available in this build.';
  $('#klc-sim-status')?.append(fallback);
  careerScreen?.classList.remove('hidden');
}

function install() {
  if (!careerScreen || !careerPanel || !settingsBody) {
    console.error('[Kano Life] Life & Career host is missing from index.html.');
    return;
  }
  if (window.__KANO_LIFE_CAREER_HUB_INSTALLED__) return;
  window.__KANO_LIFE_CAREER_HUB_INSTALLED__ = true;

  // This runs before main.js constructs UI and binds listeners. We move, rather
  // than clone, settings fields to prevent duplicate IDs or duplicate handlers.
  moveOriginalSettings();

  $('#life-career-btn')?.addEventListener('click', openCareer);
  $('#life-career-menu-btn')?.addEventListener('click', openCareer);
  $('#life-career-close')?.addEventListener('click', closeCareer);
  $('#klc-open-social-from-career')?.addEventListener('click', openSocialFromCareer);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isVisible(careerScreen)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeCareer();
  }, true);

  window.addEventListener('kano:app-ui-ready', () => {
    // The existing UI was bound after the settings nodes were moved, so the
    // core game's original listeners are still authoritative.
    refreshIntegrationStatus();
  });

  window.kanoLifeCareerSettingsHub = {
    version: 1,
    open: openCareer,
    close: closeCareer,
    refresh: () => {
      refreshSimulationPanels();
      refreshIntegrationStatus();
    },
    snapshot: () => ({
      screenMounted: Boolean(careerScreen),
      settingsMoved: movedSettingsCount,
      simulationPanels: $$('.klc-panel > section[id]', careerScreen).map(section => section.id),
      source: 'DOM inspection only; not an end-to-end gameplay verification.',
    }),
  };

  refreshIntegrationStatus();
  console.info('[Kano Life] Life & Career host, original settings and simulation status registered.');
}

install();
