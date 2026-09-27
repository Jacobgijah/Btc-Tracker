// Calendar-day helpers. A "day" is a "YYYY-MM-DD" string naming a calendar
// date; which instants belong to it depends on the time zone passed in.
// Day strings compare correctly with < and >, so they are used as keys everywhere.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const formatters = new Map();

function formatterFor(timeZone) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

function wallClock(instant, timeZone) {
  const parts = {};
  for (const { type, value } of formatterFor(timeZone).formatToParts(instant)) parts[type] = value;
  return parts;
}

export function isValidTimeZone(timeZone) {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export const isDay = (value) => typeof value === 'string' && DAY_RE.test(value);

/** The calendar day an instant falls on in `timeZone`. */
export function dayKey(instant, timeZone = 'UTC') {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date: ${instant}`);
  const p = wallClock(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "YYYY-MM-DD" as a Date at 00:00 UTC, the form Prisma uses for @db.Date columns. */
export const dayToDate = (day) => new Date(`${day}T00:00:00.000Z`);

/** A @db.Date value (00:00 UTC) back to "YYYY-MM-DD". */
export const dateToDay = (date) => date.toISOString().slice(0, 10);

export function addDays(day, n) {
  const d = dayToDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToDay(d);
}

/** Calendar months; the day of month is clamped (31 Mar - 1 month = 28/29 Feb). */
export function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return dateToDay(target);
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from, to) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

export const monthOf = (day) => day.slice(0, 7);

export function addMonthsToMonth(month, n) {
  return addMonths(`${month}-01`, n).slice(0, 7);
}

/** The instant a day starts (local midnight) in `timeZone`. */
export function startOfDay(day, timeZone = 'UTC') {
  const midnightUtc = dayToDate(day).getTime();
  const offsetAt = (t) => {
    const p = wallClock(new Date(t), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  };
  // Two passes so a DST change between the guess and the answer is handled.
  let t = midnightUtc - offsetAt(midnightUtc);
  t = midnightUtc - offsetAt(t);
  return new Date(t);
}

/** Collapses sorted days into runs of consecutive days: [{ from, to, days }]. */
export function toRuns(sortedDays) {
  const runs = [];
  for (const day of sortedDays) {
    const last = runs.at(-1);
    if (last && addDays(last.to, 1) === day) {
      last.to = day;
      last.days += 1;
    } else {
      runs.push({ from: day, to: day, days: 1 });
    }
  }
  return runs;
}
