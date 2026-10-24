/**
 * Kano Life daily rhythm director.
 * Pure simulation rules: caller supplies in-game weekday and clock time.
 * This module never reads device time, changes the wallet, or pauses the game.
 */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export class KanoDailyRhythmDirector {
  constructor(options = {}) {
    this.marketDays = new Set((options.marketDays ?? [1, 4]).map(Number));
    this.prayerWindows = options.prayerWindows ?? [
      { id: 'fajr', start: '05:00', end: '05:45', label: 'Fajr' },
      { id: 'dhuhr', start: '12:30', end: '13:15', label: 'Dhuhr' },
      { id: 'asr', start: '15:45', end: '16:15', label: 'Asr' },
      { id: 'maghrib', start: '18:15', end: '18:40', label: 'Maghrib' },
      { id: 'isha', start: '19:30', end: '20:00', label: 'Isha' },
    ];
    this.lastKey = null;
    this.events = [];
  }

  evaluate({ weekday = 0, time = '12:00', location = 'road', demand = 0.5 } = {}) {
    const day = ((Math.trunc(Number(weekday) || 0) % 7) + 7) % 7;
    const minute = parseTime(time);
    if (minute === null) return { ok: false, error: 'invalid_time' };
    const safeDemand = clamp(Number(demand) || 0, 0, 1);
    const activePrayer = this.prayerWindows.find(w => inWindow(minute, parseTime(w.start), parseTime(w.end))) ?? null;
    const fridayJummah = day === 5 && inWindow(minute, 12 * 60, 14 * 60);
    const marketDay = this.marketDays.has(day);
    const prayerFactor = activePrayer ? 0.72 : 1;
    const jummahFactor = fridayJummah ? 0.58 : 1;
    const marketFactor = marketDay && minute >= 7 * 60 && minute <= 17 * 60 ? 1.24 : 1;
    const demandMultiplier = clamp(prayerFactor * jummahFactor * marketFactor, 0.45, 1.35);
    const eventKey = `${day}:${minute}:${location}:${activePrayer?.id ?? ''}:${fridayJummah}:${marketDay}`;
    const newEvents = [];
    if (activePrayer) newEvents.push({ type: 'prayer_window', id: activePrayer.id, label: activePrayer.label, message: `Lokacin sallar ${activePrayer.label} — prayer time`, effects: { trafficMultiplier: prayerFactor, passengerDemandMultiplier: prayerFactor } });
    if (fridayJummah) newEvents.push({ type: 'jummah', id: 'jummah', label: 'Jumu’ah', message: 'Jumu’ah prayer period: expect quieter roads near mosques and busy approaches before prayer.', effects: { trafficMultiplier: jummahFactor, passengerDemandMultiplier: jummahFactor } });
    if (marketDay && minute >= 7 * 60 && minute <= 17 * 60) newEvents.push({ type: 'market_day', id: `market-${day}`, label: 'Market day', message: 'Market-day activity: more traders, shoppers and short passenger trips.', effects: { passengerDemandMultiplier: marketFactor, pedestrianActivityMultiplier: 1.2 } });
    if (location === 'park' && activePrayer) newEvents.push({ type: 'park_pause_opportunity', id: `park-${activePrayer.id}`, label: 'Park prayer break', message: 'Drivers at the park may choose to take a prayer break.', effects: { optionalBreak: true } });
    this.lastKey = eventKey;
    this.events = newEvents;
    return {
      ok: true,
      weekday: DAY_NAMES[day],
      time,
      marketDay,
      activePrayer: activePrayer?.id ?? null,
      fridayJummah,
      demand: clamp(safeDemand * demandMultiplier, 0, 1),
      demandMultiplier,
      effects: {
        trafficMultiplier: clamp(prayerFactor * jummahFactor, 0.45, 1),
        passengerDemandMultiplier: demandMultiplier,
        pedestrianActivityMultiplier: marketDay && minute >= 7 * 60 && minute <= 17 * 60 ? 1.2 : 1,
      },
      events: newEvents,
    };
  }

  getCurrentEvents() { return this.events.map(event => ({ ...event, effects: { ...event.effects } })); }
}

function parseTime(value) {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}
function inWindow(minute, start, end) {
  return start !== null && end !== null && minute >= start && minute < end;
}
