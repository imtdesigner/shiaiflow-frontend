// Who may enter a category (owner, 2026-11-07): gender, age and grade.
// Age is by birth year ("godište"): tournament year − birth year.
// Grades as numbers: mudan = −7, 6 kyu = −6 … 1 kyu = −1, 1 dan = 1 … 8 dan = 8.

export const GRADES = [
  { rank: -7, label: 'Mudan' },
  ...[6, 5, 4, 3, 2, 1].map((k) => ({ rank: -k, label: `${k} kyu` })),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((d) => ({ rank: d, label: `${d} dan` })),
];

export const gradeLabel = (rank) => GRADES.find((g) => g.rank === rank)?.label ?? '';

/** '3 kyu' → −3, '2 dan' → 2, 'mudan' → −7, unknown → null. */
export function gradeRank(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith('mu')) return -7;
  const m = t.match(/(\d)\s*(kyu|dan)/);
  if (!m) return null;
  return m[2] === 'kyu' ? -Number(m[1]) : Number(m[1]);
}

/** Age in the tournament year by birth year. */
export const ageIn = (year, birthYear) => (birthYear ? year - birthYear : null);

/** Short description of a category's rules, e.g. "M · 18+ · 1 dan+". */
export function rulesText(c) {
  const parts = [];
  if (c.gender) parts.push(c.gender === 'M' ? 'Men' : 'Women');
  if (c.min_age != null && c.max_age != null) parts.push(`${c.min_age}–${c.max_age} y`);
  else if (c.min_age != null) parts.push(`${c.min_age}+ y`);
  else if (c.max_age != null) parts.push(`up to ${c.max_age} y`);
  if (c.min_grade != null && c.max_grade != null) parts.push(`${gradeLabel(c.min_grade)} – ${gradeLabel(c.max_grade)}`);
  else if (c.min_grade != null) parts.push(`${gradeLabel(c.min_grade)} and up`);
  else if (c.max_grade != null) parts.push(`up to ${gradeLabel(c.max_grade)}`);
  return parts.join(' · ') || 'open to all';
}

/**
 * Why a person may not enter this category (null = may enter).
 * person: { gender: 'M'|'F'|null, birth_year, grade_rank }. A rule the person
 * gives no data for blocks only when that rule is set.
 */
export function ineligibleReason(category, person, tournamentYear) {
  if (category.gender && person.gender !== category.gender) {
    return category.gender === 'M' ? 'men only' : 'women only';
  }
  if (category.min_age != null || category.max_age != null) {
    const age = ageIn(tournamentYear, person.birth_year);
    if (age == null) return 'birth year needed';
    if (category.min_age != null && age < category.min_age) return `from ${category.min_age} years`;
    if (category.max_age != null && age > category.max_age) return `up to ${category.max_age} years`;
  }
  if (category.min_grade != null || category.max_grade != null) {
    const g = person.grade_rank;
    if (g == null) return 'grade needed';
    if (category.min_grade != null && g < category.min_grade) return `from ${gradeLabel(category.min_grade)}`;
    if (category.max_grade != null && g > category.max_grade) return `up to ${gradeLabel(category.max_grade)}`;
  }
  return null;
}

/** Categories split into allowed / not allowed (with the reason). */
export function eligibleCategories(categories, person, tournamentYear) {
  return categories.map((c) => ({ category: c, reason: ineligibleReason(c, person, tournamentYear) }));
}
