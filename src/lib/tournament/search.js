// Tournament search: one field filters by any criterion — name, place,
// country, dates (year, month, day), status and categories. Every word must
// match somewhere; case and diacritics are ignored ("zene" finds "Žene").

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTHS_HR = ['siječanj', 'veljača', 'ožujak', 'travanj', 'svibanj', 'lipanj', 'srpanj', 'kolovoz', 'rujan', 'listopad', 'studeni', 'prosinac'];

/** Lower case without diacritics (č ć → c, đ → d, š → s, ž → z …). */
export const fold = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/đ/g, 'd')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '');

function dateWords(iso) {
  if (!iso) return [];
  const [y, m, d] = iso.split('-').map(Number);
  return [iso, String(y), MONTHS[m - 1], MONTHS[m - 1].slice(0, 3), MONTHS_HR[m - 1], `${d}.${m}.`, `${d}.${m}.${y}`, `${d}/${m}/${y}`];
}

/** Everything a tournament can be found by, as one folded string. */
export function searchText(t, statusLabel = '') {
  const cats = t.categories ?? [];
  return fold([
    t.name, t.venue, t.city, t.country, statusLabel,
    ...dateWords(t.start_date), ...dateWords(t.end_date),
    ...cats.map((c) => c.name),
    cats.some((c) => c.kind === 'team') ? 'team ekipno' : '',
    cats.some((c) => c.kind === 'individual') ? 'individual pojedinacno' : '',
  ].filter(Boolean).join(' '));
}

/** True when every word of the query appears in the tournament's search text. */
export function matchesQuery(t, query, statusLabel) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = searchText(t, statusLabel);
  return words.every((w) => text.includes(w));
}
