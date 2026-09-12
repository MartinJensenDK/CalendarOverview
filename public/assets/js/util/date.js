// Date helpers. The API works in UTC ISO strings; everything is rendered in the browser's zone.
import { locale } from '../i18n.js';

export const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of a local Date */
export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function todayYmd() {
  return ymd(new Date());
}

export function isWeekend(s) {
  const d = parseYmd(s).getDay();
  return d === 0 || d === 6;
}

export function weekday(s, form = 'short') {
  return new Intl.DateTimeFormat(locale(), { weekday: form }).format(parseYmd(s));
}

export function dayLabel(s) {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(parseYmd(s));
}

export function rangeLabel(from, to) {
  const a = parseYmd(from);
  const b = parseYmd(to);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const f1 = new Intl.DateTimeFormat(locale(), sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  const f2 = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  return from === to ? f2.format(a) : `${f1.format(a)} – ${f2.format(b)}`;
}

export function timeLabel(date) {
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function relativeTime(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (diff < 60) return rtf.format(0, 'minute');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}

/** Minutes since local midnight of the given local day for an ISO instant; clamps to [0, 1440]. */
export function minutesInDay(iso, dayYmd) {
  const start = parseYmd(dayYmd).getTime();
  const t = new Date(iso).getTime();
  return Math.max(0, Math.min(1440, (t - start) / 60000));
}

export function hhmmToMinutes(s) {
  const [h, m] = (s || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHhmm(m) {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Local ISO without zone for Outlook deep links: 2025-01-31T09:00:00 */
export function localIso(date) {
  return `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function isoWeek(s) {
  const d = parseYmd(s);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
