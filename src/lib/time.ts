// Timezone-aware date helpers with no dependencies. All engine logic receives an explicit
// `now` so demo mode can run on a frozen clock.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday,
  };
}

/** Build the instant for a wall-clock time in a given timezone. */
export function zonedDate(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes handle DST boundaries.
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(ts), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    ts += guess - asUtc;
  }
  return new Date(ts);
}

/** Add calendar days to a Y/M/D triple (timezone-free arithmetic). */
export function addDays(y: number, m: number, d: number, days: number): { y: number; m: number; d: number; weekday: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), weekday: dt.getUTCDay() };
}

/** Add business days (skipping Sat/Sun). */
export function addBusinessDays(y: number, m: number, d: number, n: number): { y: number; m: number; d: number; weekday: number } {
  let cur = { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    cur = addDays(cur.y, cur.m, cur.d, step);
    if (cur.weekday !== 0 && cur.weekday !== 6) left--;
  }
  return cur;
}

export function weekdayName(index: number): string {
  return WEEKDAYS[((index % 7) + 7) % 7];
}

export function startOfDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedDate(p.year, p.month, p.day, 0, 0, timeZone);
}

export function sameDay(a: Date, b: Date, timeZone: string): boolean {
  const pa = zonedParts(a, timeZone);
  const pb = zonedParts(b, timeZone);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export function businessDaysBetween(from: Date, to: Date, timeZone: string): number {
  const a = zonedParts(from, timeZone);
  const b = zonedParts(to, timeZone);
  const start = Date.UTC(a.year, a.month - 1, a.day);
  const end = Date.UTC(b.year, b.month - 1, b.day);
  const sign = end >= start ? 1 : -1;
  let count = 0;
  for (let t = start; sign > 0 ? t < end : t > end; t += sign * DAY) {
    const wd = new Date(t + (sign > 0 ? DAY : 0)).getUTCDay();
    if (wd !== 0 && wd !== 6) count += sign;
  }
  return count;
}

export function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

export function formatDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
}

/** Human description of a due date relative to now, e.g. "today 11:00 AM", "Thu", "2 days overdue". */
export function describeDue(dueIso: string, now: Date, timeZone: string): string {
  const due = new Date(dueIso);
  const diff = due.getTime() - now.getTime();
  if (diff < 0) {
    const days = Math.floor(-diff / DAY);
    if (days >= 1) return `${days} day${days === 1 ? "" : "s"} overdue`;
    return `overdue since ${formatTime(dueIso, timeZone)}`;
  }
  if (sameDay(due, now, timeZone)) return `today ${formatTime(dueIso, timeZone)}`;
  const tomorrow = new Date(now.getTime() + DAY);
  if (sameDay(due, tomorrow, timeZone)) return `tomorrow ${formatTime(dueIso, timeZone)}`;
  if (diff < 6 * DAY) return due.toLocaleDateString("en-US", { weekday: "short", timeZone }) + " " + formatTime(dueIso, timeZone);
  return formatDay(dueIso, timeZone);
}
