// Bulk entry in Registration (owner, 2026-11-22, after the colleague test): one
// competitor per line with everything the category rules need —
//   Last name; First name; Club; Gender (M / F, also Ž / W); Birth (year or DD.MM.YYYY); Grade
// separated by ; tab or comma. Empty fields are allowed (rules then warn).
import { gradeLabel, gradeRank } from './eligibility.js';

const gender = (v) => {
  const t = String(v ?? '').trim().toLowerCase();
  if (!t) return '';
  if (['m', 'male', 'man', 'men', 'muški', 'muski'].includes(t)) return 'M';
  if (['f', 'ž', 'z', 'w', 'female', 'woman', 'women', 'ženski', 'zenski'].includes(t)) return 'F';
  return '';
};

/** '2009' → { birth_year }, '14.03.2009' / '2009-03-14' → { birth_date, birth_year }. */
const birth = (v) => {
  const t = String(v ?? '').trim();
  let m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\.?$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return { birth_date: iso, birth_year: m[3] };
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { birth_date: t, birth_year: m[1] };
  if (/^\d{4}$/.test(t)) return { birth_year: t, birth_date: '' };
  return { birth_year: '', birth_date: '' };
};

/** Lines → people for addCompetitorEntry. */
export function parseBulk(text) {
  return String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const p = line.split(/\t|;|,/).map((x) => x.trim());
    const rank = gradeRank(p[5]);
    return {
      last_name: p[0] ?? '', first_name: p[1] ?? '', club: p[2] ?? '',
      gender: gender(p[3]), ...birth(p[4]),
      grade_rank: rank ?? '', grade: rank != null ? gradeLabel(rank) : (p[5] ?? ''),
      checked_in: true,
    };
  }).filter((x) => x.last_name);
}
