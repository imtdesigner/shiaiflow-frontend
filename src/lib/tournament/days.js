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
    breaks: saved[i]?.breaks ?? [],
    program: saved[i]?.program ?? null, // own day programme (later days), else the tournament's
  }));
}

/** days column value for a date range, keeping the times already set. */
export function daysValue(startDate, endDate, current = []) {
  const count = dayCount(startDate, endDate);
  return Array.from({ length: count }, (_, i) => ({
    start: current[i]?.start ?? null, end: current[i]?.end ?? null, breaks: current[i]?.breaks ?? [],
    ...(current[i]?.program ? { program: current[i].program } : {}),
  }));
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

/** Breaks of a day as [fromSec, toSec] from the day's start ('HH:MM' times). */
export function breakSeconds(day) {
  if (!day?.start) return [];
  return (day.breaks ?? [])
    .filter((b) => b?.from && b?.to)
    .map((b) => [minutesBetween(day.start, b.from) * 60, minutesBetween(day.start, b.to) * 60])
    .filter(([a, z]) => z > a)
    .sort((x, y) => x[0] - y[0]);
}

/** Start of a fight at or after t: not inside a break, and not running into one. */
function placeFight(t, secs, breaks) {
  let start = t;
  for (const [from, to] of breaks) {
    if (start >= to) continue;
    if (start + secs > from) start = Math.max(start, to);
  }
  return start;
}

/**
 * Schedule of every court, per day. `queues`: Map(court → fights in running
 * order); `dayOf(f)` → day number; `secsOf(f)` → fight seconds.
 * Options: `changeover` seconds between fights (bow-in, changeover), `breaksOf(day)`
 * → [[fromSec, toSec]] from that day's start (no fight starts in, or runs into, a break).
 * Returns [{ court, days: [{ day, list: [{ f, start }], total }] }] — start and
 * total in seconds from that day's start. Each day the end-block fights start
 * once every court has finished that day's other fights.
 */
export function courtSchedule(queues, dayOf, secsOf, { changeover = 0, breaksOf = () => [] } = {}) {
  const courts = [...queues.keys()];
  const all = courts.flatMap((c) => queues.get(c));
  const dayNos = [...new Set(all.map(dayOf))].sort((a, b) => a - b);
  const run = (list, day, from = 0) => {
    let t = from;
    const placed = list.map((f) => {
      const start = placeFight(t === from ? t : t + changeover, secsOf(f), breaksOf(day));
      t = start + secsOf(f);
      return { f, start };
    });
    return { placed, end: t };
  };
  const regularEnd = new Map(dayNos.map((d) => [d, Math.max(0, ...courts.map((c) => run(
    queues.get(c).filter((f) => dayOf(f) === d && !f.end_block), d,
  ).end))]));
  return courts.map((court) => ({
    court,
    days: dayNos.map((day) => {
      const mine = queues.get(court).filter((f) => dayOf(f) === day);
      const regular = run(mine.filter((f) => !f.end_block), day);
      const blockFights = mine.filter((f) => f.end_block);
      const block = blockFights.length
        ? run(blockFights, day, Math.max(regular.end + (regular.placed.length ? changeover : 0), regularEnd.get(day) + changeover))
        : { placed: [], end: regular.end };
      return { day, list: [...regular.placed, ...block.placed], total: block.end };
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

/** Names the app uses itself (same list as SQL private.reserved_link). */
export const RESERVED_LINKS = new Set([
  'about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'attend', 'contact', 'create-tournament',
  'dashboard', 'explore', 'help', 'home', 'join', 'login', 'logout', 'new', 'policy', 'pricing', 'privacy',
  'profile', 'register', 'reset-password', 'search', 'settings', 'signup', 'static', 'support', 'terms',
  'tournament', 'tournaments', 'www',
]);

/** Public address of a tournament: /<link name> when it has one, else /t/<id>. */
export const publicPath = (t) => (t?.slug ? `/${t.slug}` : `/t/${t?.id}`);

/** Why a link name is not allowed (null = ok): 3–60 of a–z, 0–9, '-', not at the ends, not an app page. */
export function linkProblem(slug) {
  if (!slug) return null;
  if (RESERVED_LINKS.has(slug)) return 'used by the app itself';
  if (slug.length < 3) return 'at least 3 characters';
  if (slug.length > 60) return 'at most 60 characters';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])$/.test(slug)) return 'only small letters, digits and "-" (not at the start or end)';
  return null;
}

export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
