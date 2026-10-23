/**
 * Kano Life — research-informed seasonal living model.
 * Calendar windows are approximate simulation rules, not live forecasts.
 * Risk indices are tuning units, not measured climate or medical values.
 */

export const KANO_SIMULATION_YEAR_DAYS = 365;
export const KANO_SEASONAL_STORAGE_KEY = 'kano-life-seasonal-resilience-v1';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const finiteInteger = (value, fallback = 1) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
};

export const KANO_SEASON_PROFILES = Object.freeze({
  harmattan: Object.freeze({
    id: 'harmattan', atmosphereSeason: 'harmattan', label: 'Harmattan / cool dry',
    period: 'Approximately November–February',
    guidance: 'Dust and reduced visibility can matter. Keep lights, windscreen, air intake and rest planning in view.',
    base: Object.freeze({ visibilityRisk: 0.70, heatLoad: 0.32, wetRoadRisk: 0.10, householdWaterPressure: 0.55 }),
  }),
  hotDry: Object.freeze({
    id: 'hotDry', atmosphereSeason: 'hotDry', label: 'Hot dry season',
    period: 'Approximately March–14 May',
    guidance: 'Plan water, shade and breaks. Earlier or later shifts are a player choice, not an automatic income penalty.',
    base: Object.freeze({ visibilityRisk: 0.12, heatLoad: 0.90, wetRoadRisk: 0.08, householdWaterPressure: 0.92 }),
  }),
  rainy: Object.freeze({
    id: 'rainy', atmosphereSeason: 'rainy', label: 'Rainy season',
    period: 'Approximately 15 May–15 October',
    guidance: 'Expect variable wet-road conditions. Slow down, inspect tyres and brakes, and avoid entering floodwater.',
    base: Object.freeze({ visibilityRisk: 0.35, heatLoad: 0.48, wetRoadRisk: 0.78, householdWaterPressure: 0.38 }),
  }),
  cool: Object.freeze({
    id: 'cool', atmosphereSeason: 'cool', label: 'Season transition',
    period: 'Approximately 16–31 October',
    guidance: 'Conditions can shift between wet and dry. Review vehicle readiness and keep a flexible route plan.',
    base: Object.freeze({ visibilityRisk: 0.22, heatLoad: 0.30, wetRoadRisk: 0.20, householdWaterPressure: 0.45 }),
  }),
});

// Each day is a simulation day. The 365-day calendar has no leap day.
export function normalizeSimulationDay(day) {
  return Math.max(1, finiteInteger(day, 1));
}

export function getDayOfYear(day) {
  return ((normalizeSimulationDay(day) - 1) % KANO_SIMULATION_YEAR_DAYS) + 1;
}

export function getKanoSeasonForDay(day) {
  const yearDay = getDayOfYear(day);
  let profile;
  if (yearDay >= 305 || yearDay <= 59) profile = KANO_SEASON_PROFILES.harmattan;
  else if (yearDay >= 60 && yearDay <= 134) profile = KANO_SEASON_PROFILES.hotDry;
  else if (yearDay >= 135 && yearDay <= 288) profile = KANO_SEASON_PROFILES.rainy;
  else profile = KANO_SEASON_PROFILES.cool;
  return Object.freeze({
    absoluteDay: normalizeSimulationDay(day),
    year: Math.floor((normalizeSimulationDay(day) - 1) / KANO_SIMULATION_YEAR_DAYS) + 1,
    dayOfYear: yearDay,
    id: profile.id,
    atmosphereSeason: profile.atmosphereSeason,
    label: profile.label,
    period: profile.period,
    guidance: profile.guidance,
    base: profile.base,
  });
}

export const KANO_SEASONAL_ACTIONS = Object.freeze([
  Object.freeze({
    id: 'plan-water-and-shade', title: 'Plan water and shade breaks',
    description: 'Choose a safe pause for water and shade during a hot shift. This records a plan only.',
    seasons: Object.freeze(['hotDry', 'harmattan']),
    gains: Object.freeze({ wellbeing: 14, schedule: 5 }),
  }),
  Object.freeze({
    id: 'inspect-tyres-brakes', title: 'Inspect tyres and brakes',
    description: 'Check tyre condition, brakes, lights and steering before carrying passengers.',
    seasons: Object.freeze(['rainy', 'cool', 'harmattan']),
    gains: Object.freeze({ vehicle: 15, schedule: 3 }),
  }),
  Object.freeze({
    id: 'dust-visibility-check', title: 'Check dust visibility and lights',
    description: 'Clean the windscreen and lamps; check the air intake as part of routine maintenance.',
    seasons: Object.freeze(['harmattan']),
    gains: Object.freeze({ vehicle: 12, wellbeing: 4 }),
  }),
  Object.freeze({
    id: 'rain-route-check', title: 'Plan a wet-road route',
    description: 'Choose an alternative around deep water, blocked drains and pothole-prone stretches.',
    seasons: Object.freeze(['rainy']),
    gains: Object.freeze({ vehicle: 10, schedule: 9 }),
  }),
  Object.freeze({
    id: 'household-water-power', title: 'Review household water and power backup',
    description: 'Review existing water, charging and power-contingency plans without buying anything here.',
    seasons: Object.freeze(['hotDry', 'rainy', 'harmattan', 'cool']),
    gains: Object.freeze({ household: 13, schedule: 2 }),
  }),
  Object.freeze({
    id: 'plan-cash-buffer', title: 'Review the rainy-day budget',
    description: 'Review the current budget and likely repairs. This is a plan, not a transfer or wallet deduction.',
    seasons: Object.freeze(['hotDry', 'rainy', 'harmattan', 'cool']),
    gains: Object.freeze({ finances: 12, household: 3 }),
  }),
  Object.freeze({
    id: 'adjust-shift-window', title: 'Choose a safer work window',
    description: 'Consider cooler hours, planned rest and traffic pressure before the next shift.',
    seasons: Object.freeze(['hotDry', 'harmattan', 'rainy', 'cool']),
    gains: Object.freeze({ wellbeing: 8, schedule: 8 }),
  }),
]);

export function createDefaultSeasonalResilienceState() {
  return {
    version: 1,
    enabled: false,
    readiness: { vehicle: 50, wellbeing: 50, household: 50, finances: 50, schedule: 50 },
    lastActionDay: null,
    actionLog: [],
  };
}

export function normalizeSeasonalResilienceState(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const base = createDefaultSeasonalResilienceState();
  const readiness = raw.readiness && typeof raw.readiness === 'object' ? raw.readiness : {};
  const actionLog = Array.isArray(raw.actionLog) ? raw.actionLog : [];
  const validActionIds = new Set(KANO_SEASONAL_ACTIONS.map(action => action.id));
  base.enabled = raw.enabled === true;
  for (const key of Object.keys(base.readiness)) {
    base.readiness[key] = Math.round(clamp(readiness[key] ?? base.readiness[key], 0, 100));
  }
  const lastActionDay = Number(raw.lastActionDay);
  base.lastActionDay = Number.isFinite(lastActionDay) && lastActionDay >= 1 ? Math.floor(lastActionDay) : null;
  base.actionLog = actionLog
    .filter(item => item && typeof item === 'object' && validActionIds.has(String(item.actionId)))
    .slice(-90)
    .map(item => ({
      day: Math.max(1, finiteInteger(item.day, 1)),
      actionId: String(item.actionId),
      title: KANO_SEASONAL_ACTIONS.find(action => action.id === String(item.actionId))?.title || 'Seasonal planning action',
      season: Object.hasOwn(KANO_SEASON_PROFILES, String(item.season)) ? String(item.season) : 'cool',
    }));
  return base;
}

export function getSeasonalRiskSnapshot(day, state = createDefaultSeasonalResilienceState()) {
  const normalized = normalizeSeasonalResilienceState(state);
  const calendar = getKanoSeasonForDay(day);
  const base = calendar.base;
  const readiness = normalized.readiness;
  const readinessRatio = key => clamp(readiness[key], 0, 100) / 100;
  // Readiness only dampens game-design risk indices; these are not clinical or
  // measured physical risk estimates.
  const modifiers = {
    visibilityRisk: Number((base.visibilityRisk * (1 - readinessRatio('vehicle') * 0.12)).toFixed(3)),
    heatLoad: Number((base.heatLoad * (1 - readinessRatio('wellbeing') * 0.14)).toFixed(3)),
    wetRoadRisk: Number((base.wetRoadRisk * (1 - readinessRatio('vehicle') * 0.15)).toFixed(3)),
    householdWaterPressure: Number((base.householdWaterPressure * (1 - readinessRatio('household') * 0.10)).toFixed(3)),
  };
  const dayCue = (calendar.dayOfYear * 9301 + 49297) % 233280 / 233280;
  let scenario;
  if (calendar.id === 'harmattan') scenario = dayCue < 0.72 ? 'Dusty air · visibility check' : 'Dry-season break · keep visibility checks';
  else if (calendar.id === 'hotDry') scenario = dayCue > 0.78 ? 'Peak-heat planning day' : 'Hot and dry · schedule water and shade';
  else if (calendar.id === 'rainy') scenario = dayCue < 0.58 ? 'Rain-prone roads · avoid standing water' : dayCue < 0.82 ? 'Intermittent showers · inspect road edges' : 'Rain break · stay ready for wet stretches';
  else scenario = 'Transition period · conditions can change';
  const readinessValues = Object.values(readiness);
  const readinessScore = Math.round(readinessValues.reduce((sum, value) => sum + value, 0) / Math.max(1, readinessValues.length));
  return {
    ...calendar,
    enabled: normalized.enabled,
    scenario,
    modifiers,
    readiness: { ...readiness },
    readinessScore,
    actionsTaken: normalized.actionLog.length,
    lastActionDay: normalized.lastActionDay,
  };
}

export function actionsForSeason(day) {
  const season = getKanoSeasonForDay(day).id;
  return KANO_SEASONAL_ACTIONS
    .map(action => ({ ...action, priority: action.seasons.includes(season) ? 0 : 1 }))
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
}

export function recordSeasonalAction(state, actionId, options = {}) {
  const normalized = normalizeSeasonalResilienceState(state);
  const action = KANO_SEASONAL_ACTIONS.find(item => item.id === String(actionId));
  if (!action) return { ok: false, state: normalized, message: 'That seasonal planning action is not available.' };
  const day = normalizeSimulationDay(options.day ?? 1);
  const activeShift = options.activeShift === true;
  if (activeShift) return { ok: false, state: normalized, message: 'Pause or finish the driving shift before planning.' };
  if (normalized.lastActionDay === day) {
    return { ok: false, state: normalized, message: 'One seasonal planning action is allowed per simulated day.' };
  }
  const season = getKanoSeasonForDay(day).id;
  const next = normalizeSeasonalResilienceState(normalized);
  for (const [key, amount] of Object.entries(action.gains)) {
    next.readiness[key] = Math.round(clamp(next.readiness[key] + amount, 0, 100));
  }
  next.lastActionDay = day;
  next.actionLog.push({ day, actionId: action.id, title: action.title, season });
  next.actionLog = next.actionLog.slice(-90);
  return { ok: true, state: next, action, message: `${action.title} recorded. No money was spent.` };
}

export function exportSeasonalResilienceReport(state, day = 1) {
  const normalized = normalizeSeasonalResilienceState(state);
  return {
    schema: 'kano-life-seasonal-resilience/v1',
    exportedAt: new Date().toISOString(),
    simulation: getSeasonalRiskSnapshot(day, normalized),
    state: normalized,
    notes: [
      'Calendar seasons are approximate simulation windows, not live weather forecasts.',
      'Risk values are game-design indices, not measured physical, financial or medical values.',
      'Planning actions never change the authoritative wallet or record personal medical details.',
    ],
  };
}
