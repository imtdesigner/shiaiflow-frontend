// European formats everywhere (owner, 2026-11-18): 24-hour clock, day before
// month. Labels stay English, so en-GB ("12 Dec 2026, 18:00").

const LOCALE = 'en-GB';

const asDate = (d) => (d instanceof Date ? d : new Date(String(d).length === 10 ? `${d}T00:00:00` : d));

/** "12 Dec 2026" from 'YYYY-MM-DD' or an ISO timestamp. */
export const fmtDate = (d) => (d ? asDate(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** "Sat 12 Dec" — a tournament day. */
export const fmtDay = (d) => (d ? asDate(d).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }) : '');

/** "12 Dec 2026, 18:00" (24-hour). */
export const fmtDateTime = (d) => (d
  ? asDate(d).toLocaleString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  : '');

/** "12 Dec, 18:00" (24-hour, no year). */
export const fmtShortDateTime = (d) => (d
  ? asDate(d).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  : '');

const pad = (n) => String(n).padStart(2, '0');

/**
 * Typed time → 'HH:MM' (24-hour) or null when not a time.
 * Accepts 9, 930, 0930, 9:30, 9.30, 18:05 …
 */
export function parseTime(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  let h; let m;
  const sep = t.match(/^(\d{1,2})[:.,h ](\d{1,2})$/);
  if (sep) { h = Number(sep[1]); m = Number(sep[2]); } else if (/^\d{1,4}$/.test(t)) {
    if (t.length <= 2) { h = Number(t); m = 0; } else { h = Number(t.slice(0, -2)); m = Number(t.slice(-2)); }
  } else return null;
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/** Typed date (12.12.2026, 12/12/2026, 12-12-2026, 12.12.26) → 'YYYY-MM-DD' or null. */
export function parseDate(text) {
  const m = String(text ?? '').trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\.?$/);
  if (!m) return null;
  const d = Number(m[1]); const mo = Number(m[2]);
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' for the date fields. */
export const showDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
