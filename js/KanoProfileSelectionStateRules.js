/** Small, side-effect-free selection normalizers for the current Kano Life UI. */
export function chooseEnabledValue(currentValue, options, fallbackValue = '') {
  const enabled = Array.from(options || []).filter((option) => !option?.disabled);
  const current = String(currentValue ?? '');
  if (enabled.some((option) => String(option.value) === current)) return current;
  const fallback = String(fallbackValue ?? '');
  if (enabled.some((option) => String(option.value) === fallback)) return fallback;
  return String(enabled[0]?.value ?? '');
}

export function normalizeRouteId(savedRouteId, routes) {
  const list = Array.isArray(routes) ? routes : [];
  const current = String(savedRouteId ?? '');
  const exact = list.find((route) => String(route?.id ?? '') === current);
  if (exact) return exact.id;
  const byName = list.find((route) => String(route?.name ?? '').toLowerCase() === current.toLowerCase());
  return byName?.id ?? list[0]?.id ?? '';
}

export function normalizeUnlockedDriverId(savedDriverId, drivers, unlockedIds) {
  const list = Array.isArray(drivers) ? drivers : [];
  const unlocked = new Set(Array.isArray(unlockedIds) ? unlockedIds.map(String) : []);
  const current = list.find((driver) => String(driver?.id ?? '') === String(savedDriverId ?? '') && unlocked.has(String(driver.id)));
  if (current) return current.id;
  const firstUnlocked = list.find((driver) => unlocked.has(String(driver?.id ?? '')));
  if (firstUnlocked) return firstUnlocked.id;
  return list.find((driver) => String(driver?.id ?? '') === 'ruffneck')?.id ?? list[0]?.id ?? '';
}
