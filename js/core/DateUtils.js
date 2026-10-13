/**
 * Date Utilities
 * RuffNeck Entertainment — Kano Run
 */

export const DateUtils = {
  now() {
    return Date.now();
  },

  create(value = Date.now()) {
    const date = value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  },

  isValid(value) {
    const date = this.create(value);
    return date !== null;
  },

  timestamp(value = Date.now()) {
    const date = this.create(value);
    return date ? date.getTime() : null;
  },

  addMilliseconds(value, amount) {
    const date = this.create(value);
    if (!date) return null;

    return new Date(date.getTime() + amount);
  },

  addSeconds(value, amount) {
    return this.addMilliseconds(value, amount * 1000);
  },

  addMinutes(value, amount) {
    return this.addMilliseconds(value, amount * 60_000);
  },

  addHours(value, amount) {
    return this.addMilliseconds(value, amount * 3_600_000);
  },

  addDays(value, amount) {
    const date = this.create(value);
    if (!date) return null;

    date.setDate(date.getDate() + amount);
    return date;
  },

  startOfDay(value = Date.now()) {
    const date = this.create(value);
    if (!date) return null;

    date.setHours(0, 0, 0, 0);
    return date;
  },

  endOfDay(value = Date.now()) {
    const date = this.create(value);
    if (!date) return null;

    date.setHours(23, 59, 59, 999);
    return date;
  },

  startOfWeek(value = Date.now(), weekStartsOn = 1) {
    const date = this.startOfDay(value);
    if (!date) return null;

    const day = date.getDay();
    const offset = (day - weekStartsOn + 7) % 7;

    date.setDate(date.getDate() - offset);
    return date;
  },

  startOfMonth(value = Date.now()) {
    const date = this.create(value);
    if (!date) return null;

    date.setDate(1);
    date.setHours(0, 0, 0, 0);

    return date;
  },

  endOfMonth(value = Date.now()) {
    const date = this.create(value);
    if (!date) return null;

    date.setMonth(date.getMonth() + 1, 0);
    date.setHours(23, 59, 59, 999);

    return date;
  },

  differenceMilliseconds(first, second) {
    const a = this.create(first);
    const b = this.create(second);

    if (!a || !b) return null;

    return b.getTime() - a.getTime();
  },

  differenceSeconds(first, second) {
    const difference = this.differenceMilliseconds(first, second);
    return difference === null ? null : difference / 1000;
  },

  differenceMinutes(first, second) {
    const difference = this.differenceMilliseconds(first, second);
    return difference === null ? null : difference / 60_000;
  },

  differenceHours(first, second) {
    const difference = this.differenceMilliseconds(first, second);
    return difference === null ? null : difference / 3_600_000;
  },

  differenceDays(first, second) {
    const difference = this.differenceMilliseconds(first, second);
    return difference === null ? null : difference / 86_400_000;
  },

  isSameDay(first, second) {
    const a = this.create(first);
    const b = this.create(second);

    if (!a || !b) return false;

    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  },

  isToday(value) {
    return this.isSameDay(value, Date.now());
  },

  isYesterday(value) {
    return this.isSameDay(value, this.addDays(new Date(), -1));
  },

  isPast(value) {
    const date = this.create(value);
    return date ? date.getTime() < Date.now() : false;
  },

  isFuture(value) {
    const date = this.create(value);
    return date ? date.getTime() > Date.now() : false;
  },

  isBetween(value, start, end, inclusive = true) {
    const date = this.timestamp(value);
    const from = this.timestamp(start);
    const to = this.timestamp(end);

    if (date === null || from === null || to === null) {
      return false;
    }

    const minimum = Math.min(from, to);
    const maximum = Math.max(from, to);

    return inclusive
      ? date >= minimum && date <= maximum
      : date > minimum && date < maximum;
  },

  toISOString(value = Date.now()) {
    const date = this.create(value);
    return date ? date.toISOString() : null;
  },

  toDateKey(value = Date.now()) {
    const date = this.create(value);
    if (!date) return null;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  },

  formatDate(value, locale = "en-NG", options = {}) {
    const date = this.create(value);
    if (!date) return "";

    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...options,
    }).format(date);
  },

  formatTime(value, locale = "en-NG", options = {}) {
    const date = this.create(value);
    if (!date) return "";

    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    }).format(date);
  },

  formatDateTime(value, locale = "en-NG", options = {}) {
    const date = this.create(value);
    if (!date) return "";

    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    }).format(date);
  },

  formatDuration(milliseconds, options = {}) {
    const {
      showMilliseconds = false,
      padHours = false,
    } = options;

    if (!Number.isFinite(milliseconds)) return "00:00";

    const negative = milliseconds < 0;
    const absolute = Math.abs(milliseconds);

    const totalSeconds = Math.floor(absolute / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];

    if (hours > 0 || padHours) {
      parts.push(String(hours).padStart(2, "0"));
    }

    parts.push(String(minutes).padStart(2, "0"));
    parts.push(String(seconds).padStart(2, "0"));

    let result = parts.join(":");

    if (showMilliseconds) {
      result += `.${String(Math.floor(absolute % 1000)).padStart(3, "0")}`;
    }

    return negative ? `-${result}` : result;
  },

  timeAgo(value, now = Date.now()) {
    const difference = this.differenceMilliseconds(value, now);

    if (difference === null) return "";

    const seconds = Math.round(Math.abs(difference) / 1000);
    const future = difference > 0;

    const units = [
      ["year", 31_536_000],
      ["month", 2_592_000],
      ["day", 86_400],
      ["hour", 3_600],
      ["minute", 60],
      ["second", 1],
    ];

    for (const [unit, unitSeconds] of units) {
      const amount = Math.floor(seconds / unitSeconds);

      if (amount >= 1) {
        const label = `${amount} ${unit}${amount === 1 ? "" : "s"}`;
        return future ? `in ${label}` : `${label} ago`;
      }
    }

    return future ? "in a moment" : "just now";
  },

  getAge(birthDate, referenceDate = Date.now()) {
    const birth = this.create(birthDate);
    const reference = this.create(referenceDate);

    if (!birth || !reference || birth > reference) return null;

    let age = reference.getFullYear() - birth.getFullYear();

    const birthdayNotReached =
      reference.getMonth() < birth.getMonth() ||
      (
        reference.getMonth() === birth.getMonth() &&
        reference.getDate() < birth.getDate()
      );

    if (birthdayNotReached) age--;

    return age;
  },
};

export default DateUtils;