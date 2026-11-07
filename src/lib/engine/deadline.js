// Natural-language deadline parsing ("by Thursday EOD", "before the go/no-go", "by 11am").

import { addDays, zonedDate, zonedParts } from "../time.js";

const WEEKDAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};

const EOD_HOUR = 17;

function atLocal(base, tz, dayOffset, hour, minute = 0) {
  const p = zonedParts(base, tz);
  const d = addDays(p.year, p.month, p.day, dayOffset);
  return zonedDate(d.y, d.m, d.d, hour, minute, tz);
}

/** Does a free-text reference ("qbr this afternoon", "go/no-go") point at this meeting title? */
export function matchesMeeting(title, reference) {
  const compact = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const acronym = title
    .split(/[\s×—–-]+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0].toLowerCase())
    .join("");
  const words = reference
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const phrase = words
      .slice(0, n)
      .join("")
      .replace(/[^a-z0-9]/g, "");
    if (phrase.length < 3) continue;
    if (compact.includes(phrase) || acronym.includes(phrase)) return true;
  }
  return false;
}

function parseClock(text) {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!m) return undefined;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  return { h, m: Number(m[2] ?? 0) };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Deadlines never land on a weekend, and a time already past when the message was sent means the next business day. */
function normalize(result, ctx, rollIfPast) {
  if (!result) return result;
  const ref = ctx.sentAt ?? ctx.now;
  let d = new Date(result.iso);
  if (rollIfPast && d.getTime() <= ref.getTime()) d = new Date(d.getTime() + 24 * 3_600_000);
  for (let i = 0; i < 3; i++) {
    const wd = zonedParts(d, ctx.timezone).weekday;
    if (wd !== 0 && wd !== 6) break;
    const p = zonedParts(d, ctx.timezone);
    const next = addDays(p.year, p.month, p.day, 1);
    d = zonedDate(next.y, next.m, next.d, p.hour, p.minute, ctx.timezone);
  }
  return { ...result, iso: d.toISOString() };
}

export function parseDeadline(text, ctx) {
  const lower = text.toLowerCase();
  const relative = /\b(by|at|before)\s+\d|\b(eod|end of (the )?day|tonight|this afternoon|today|tomorrow)\b/.test(lower);
  return normalize(parseRaw(text, ctx), ctx, relative);
}

function parseRaw(text, ctx) {
  const { timezone: tz } = ctx;
  const ref = ctx.sentAt ?? ctx.now;
  const lower = text.toLowerCase();

  // "before the go/no-go", "ahead of the QBR", "before tomorrow's review"
  // Explicit calendar dates win over relative phrasing: "by Friday, Nov 13".
  const md = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  if (md) {
    const month = MONTHS.indexOf(md[1]) + 1;
    const p = zonedParts(ref, tz);
    let year = p.year;
    if (month < p.month - 6) year += 1;
    const clock = parseClock(lower);
    return { iso: zonedDate(year, month, Number(md[2]), clock?.h ?? EOD_HOUR, clock?.m ?? 0, tz).toISOString(), phrase: md[0] };
  }

  const within = lower.match(/\bwithin\s+(\d+)\s+(hour|hours|day|days|business days)\b/);
  if (within) {
    const n = Number(within[1]);
    const ms = within[2].startsWith("hour") ? n * 3_600_000 : n * 24 * 3_600_000;
    return { iso: new Date(ref.getTime() + ms).toISOString(), phrase: within[0] };
  }

  const before =
    lower.match(
      /\b(?:before|ahead of|prior to)\s+(?:the\s+|our\s+|my\s+|this afternoon's\s+|today's\s+|tomorrow's\s+)?([a-z0-9/&×' -]{3,40})/,
    ) ?? lower.match(/\b(?:for|at|in)\s+(?:this afternoon's|this morning's|today's|tomorrow's)\s+([a-z0-9/&×' -]{3,40})/);
  if (before) {
    const target = before[1].trim();
    const meeting = ctx.meetings
      .filter((m) => m.meta.start && new Date(m.meta.start).getTime() > ref.getTime())
      .sort((a, b) => new Date(a.meta.start).getTime() - new Date(b.meta.start).getTime())
      .find((m) => matchesMeeting(m.title, target));
    if (meeting?.meta.start) return { iso: meeting.meta.start, phrase: `before ${meeting.title}` };
  }

  const clock = parseClock(lower);

  // Explicit "by 11am" / "at 3pm" today.
  if (clock && /\b(by|at|before)\s+\d/.test(lower) && !/\b(tomorrow|monday|tuesday|wednesday|thursday|friday)\b/.test(lower)) {
    const d = atLocal(ref, tz, 0, clock.h, clock.m);
    return {
      iso: d.toISOString(),
      phrase: `by ${clock.h > 12 ? clock.h - 12 : clock.h}${clock.m ? `:${String(clock.m).padStart(2, "0")}` : ""}${clock.h >= 12 ? "pm" : "am"}`,
    };
  }

  if (
    /\b(eod|end of (the )?day|by tonight|this afternoon|today)\b/.test(lower) &&
    !/\b(tomorrow|monday|tuesday|wednesday|thursday|friday)\b/.test(lower)
  ) {
    const d = atLocal(ref, tz, 0, clock?.h ?? EOD_HOUR, clock?.m ?? 0);
    return { iso: d.toISOString(), phrase: "today" };
  }

  if (/\btomorrow\b/.test(lower)) {
    const d = atLocal(ref, tz, 1, clock?.h ?? EOD_HOUR, clock?.m ?? 0);
    return { iso: d.toISOString(), phrase: "tomorrow" };
  }

  const wd = lower.match(
    /\b(?:by|before|on|until|due)\s+(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri)\b/,
  );
  if (wd) {
    const target = WEEKDAY_INDEX[wd[1]];
    const cur = zonedParts(ref, tz).weekday;
    let delta = (target - cur + 7) % 7;
    if (delta === 0) delta = 7;
    const d = atLocal(ref, tz, delta, clock?.h ?? EOD_HOUR, clock?.m ?? 0);
    return { iso: d.toISOString(), phrase: `by ${wd[1]}` };
  }

  if (/\b(end of (the )?week|by friday|this week)\b/.test(lower)) {
    const cur = zonedParts(ref, tz).weekday;
    const delta = Math.max(0, 5 - cur);
    return { iso: atLocal(ref, tz, delta, EOD_HOUR).toISOString(), phrase: "end of week" };
  }

  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return { iso: zonedDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), EOD_HOUR, 0, tz).toISOString(), phrase: iso[0] };
  }
  return undefined;
}

/** Remove deadline phrases from a title once they've been captured as a due date. */
export function stripDeadlinePhrases(title) {
  return title
    .replace(
      /\s*\b(by|before|until|no later than)\s+(next\s+)?(monday|tuesday|wednesday|thursday|friday|tomorrow|tonight|eod|end of (the )?(day|week))(\s+(eod|morning|afternoon|evening))?\b/gi,
      "",
    )
    .replace(/\s*\bby\s+\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, "")
    .replace(/\s*\bon\s+(monday|tuesday|wednesday|thursday|friday)\b/gi, "")
    .replace(/,?\s*\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/gi, "")
    .replace(/\s*\b(before|ahead of)\s+the\s+[a-z/ -]{2,20}$/gi, "")
    .replace(/\s*\b(tomorrow|today|this afternoon)\b\s*$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
