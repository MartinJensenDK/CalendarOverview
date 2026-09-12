// Working hours come from Microsoft Graph per person and per day (user.work = [{ s, e, loc }] in UTC).
// A person without any reported hours in the range falls back to the usual 08–17 on weekdays.
import { parseYmd, isWeekend, minutesInDay } from './date.js';

export const DEFAULT_HOURS = { start: 8 * 60, end: 17 * 60 };

/** Working intervals for one person on one day: [{ sm, em, loc }] in minutes since local midnight. */
export function hoursFor(user, day) {
  const work = user && user.work;
  if (!work || work.length === 0) {
    return isWeekend(day) ? [] : [{ sm: DEFAULT_HOURS.start, em: DEFAULT_HOURS.end, loc: null }];
  }
  const ds = parseYmd(day).getTime(); const de = ds + 86400000;
  const out = [];
  for (const w of work) {
    const a = new Date(w.s).getTime(); const b = new Date(w.e).getTime();
    if (b <= ds || a >= de) continue;
    const sm = minutesInDay(w.s, day); const em = minutesInDay(w.e, day);
    if (em > sm) out.push({ sm, em, loc: w.loc || null });
  }
  return out;
}

/** Earliest start and latest end across people and days; null when nobody works on those days. */
export function hoursRange(users, days) {
  let start = Infinity; let end = -Infinity;
  for (const u of users) {
    for (const d of days) {
      for (const h of hoursFor(u, d)) { if (h.sm < start) start = h.sm; if (h.em > end) end = h.em; }
    }
  }
  return start === Infinity ? null : { start, end };
}

/** True when [start, end) lies within one of the person's working intervals that day. */
export function isWorking(user, day, start, end) {
  return hoursFor(user, day).some((h) => h.sm <= start && h.em >= end);
}
