// Tournament days (owner, 2026-11-08): a tournament may last several days,
// each with a start and end time; every category is on one day. The fight
// plan restarts the clock each day; the end-of-tournament block (finals …)
// closes each day for that day's categories. Also the tournament link name.

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' + n days. */
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Number of days from start to end date (at least 1, at most 14). */
export function dayCount(startDate, endDate) {
  if (!startDate || !endDate || endDate <= startDate) return 1;
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Math.min(14, Math.round(ms / 86400000) + 1);
}

/**
 * Days of a tournament: [{ n, date, start: 'HH:MM'|null, end: 'HH:MM'|null }].
 * From tournament.days when set, else one per date; day 1 falls back to the
 * old single start_time.
 */
export function tournamentDays(t) {
  const count = dayCount(t?.start_date, t?.end_date);
  const saved = Array.isArray(t?.days) ? t.days : [];
  return Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    date: t?.start_date ? addDays(t.start_date, i) : null,
    start: saved[i]?.start ?? (i === 0 ? t?.start_time?.slice(0, 5) ?? null : null),
    end: saved[i]?.end ?? null,
  }));
}

/** days column value for a date range, keeping the times already set. */
export function daysValue(startDate, endDate, current = []) {
  const count = dayCount(startDate, endDate);
  return Array.from({ length: count }, (_, i) => ({ start: current[i]?.start ?? null, end: current[i]?.end ?? null }));
}

/** Clock time: 'HH:MM' + seconds → 'HH:MM' ('+1h 05' without a start). */
export function clockAt(start, seconds) {
  if (!start) {
    const m = Math.round(seconds / 60);
    return `+${Math.floor(m / 60)}h ${pad(m % 60)}`;
  }
  const [h, mi] = start.split(':').map(Number);
  const total = Math.round(h * 60 + mi + seconds / 60);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/** Minutes between two 'HH:MM' (b − a). */
const minutesBetween = (a, b) => {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return (bh * 60 + bm) - (ah * 60 + am);
};

/**
 * Schedule of every court, per day. `queues`: Map(court → fights in running
 * order); `dayOf(f)` → day number; `secsOf(f)` → fight seconds.
 * Returns [{ court, days: [{ day, list: [{ f, start }], total }] }] — start and
 * total in seconds from that day's start. Each day the end-block fights start
 * once every court has finished that day's other fights.
 */
export function courtSchedule(queues, dayOf, secsOf) {
  const courts = [...queues.keys()];
  const all = courts.flatMap((c) => queues.get(c));
  const dayNos = [...new Set(all.map(dayOf))].sort((a, b) => a - b);
  const regularEnd = new Map(dayNos.map((d) => [d, Math.max(0, ...courts.map((c) => queues.get(c)
    .filter((f) => dayOf(f) === d && !f.end_block).reduce((t, f) => t + secsOf(f), 0)))]));
  return courts.map((court) => ({
    court,
    days: dayNos.map((day) => {
      let t = 0;
      let block = false;
      const list = queues.get(court).filter((f) => dayOf(f) === day).map((f) => {
        if (f.end_block && !block) { t = Math.max(t, regularEnd.get(day)); block = true; }
        const start = t;
        t += secsOf(f);
        return { f, start };
      });
      return { day, list, total: t };
    }).filter((d) => d.list.length),
  }));
}

/** True when a day's fights run past its end time. */
export function overrunsDay(day, totalSeconds) {
  if (!day?.start || !day?.end) return false;
  return totalSeconds / 60 > minutesBetween(day.start, day.end);
}

// --- link name -------------------------------------------------------------------

/** Link name from a tournament name: "Croatian Open 2027" → "croatian-open". */
export function suggestLink(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Why a link name is not allowed (null = ok): 3–60 of a–z, 0–9, '-', not at the ends. */
export function linkProblem(slug) {
  if (!slug) return null;
  if (slug.length < 3) return 'at least 3 characters';
  if (slug.length > 60) return 'at most 60 characters';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])$/.test(slug)) return 'only small letters, digits and "-" (not at the start or end)';
  return null;
}

export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
