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

/** Exact age (full years) on a day; dates as 'YYYY-MM-DD'. */
export function ageOn(day, birthDate) {
  if (!day || !birthDate) return null;
  const [y, m, d] = day.split('-').map(Number);
  const [by, bm, bd] = birthDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/**
 * Age for the rules. ctx = tournament year (number, by birth year) or
 * { date: first tournament day, basis: 'birth_year' | 'birth_date' }.
 */
export function ruleAge(person, ctx) {
  const c = typeof ctx === 'number' ? { year: ctx, basis: 'birth_year' } : ctx;
  const year = c.year ?? (Number(String(c.date ?? '').slice(0, 4)) || new Date().getFullYear());
  if (c.basis === 'birth_date') return ageOn(c.date ?? `${year}-01-01`, person.birth_date);
  const birthYear = person.birth_year ?? (person.birth_date ? Number(person.birth_date.slice(0, 4)) : null);
  return ageIn(year, birthYear);
}

/** Age basis of a tournament as the ctx for ruleAge / ineligibleReason. */
export const tournamentAgeCtx = (t) => ({
  date: t.start_date ?? new Date().toISOString().slice(0, 10),
  basis: t.age_basis ?? 'birth_year',
});

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
 * person: { gender: 'M'|'F'|null, birth_year, birth_date, grade_rank }; ctx: see ruleAge.
 * Works for a category or one team position rule (same fields). A rule the person
 * gives no data for blocks only when that rule is set.
 */
export function ineligibleReason(category, person, ctx) {
  if (category.gender && person.gender !== category.gender) {
    return category.gender === 'M' ? 'men only' : 'women only';
  }
  if (category.min_age != null || category.max_age != null) {
    const age = ruleAge(person, ctx);
    if (age == null) return typeof ctx === 'object' && ctx.basis === 'birth_date' ? 'date of birth needed' : 'birth year needed';
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
export function eligibleCategories(categories, person, ctx) {
  return categories.map((c) => ({ category: c, reason: ineligibleReason(c, person, ctx) }));
}

// --- teams --------------------------------------------------------------------
// Kendo teams: 3 + 1 reserve or 5 + 2 reserves. Positions in fighting order.

export const teamPositions = (size) => (size === 5
  ? ['Senpo', 'Jiho', 'Chuken', 'Fukusho', 'Taisho']
  : ['Senpo', 'Chuken', 'Taisho']);

export const teamReserves = (size) => (size === 5 ? 2 : 1);
export const teamMaxMembers = (size) => size + teamReserves(size);

/** True when a position rule limits anything. */
export const hasRule = (r) => !!r && ['gender', 'min_age', 'max_age', 'min_grade', 'max_grade'].some((k) => r[k] != null && r[k] !== '');

/**
 * Problems of a team (members in fighting order, reserves after the
 * positions) — the same checks as SQL private.check_team: size, one dojo,
 * category rules for everyone, position rules per position; a reserve must
 * fit some position. Returns a list of messages (empty = ok).
 */
export function teamProblems(category, team, members, ctx) {
  const out = [];
  const size = category.team_size;
  if (members.length > teamMaxMembers(size)) {
    out.push(`A team has at most ${teamMaxMembers(size)} members (${size} + ${teamReserves(size)}).`);
  }
  const names = teamPositions(size);
  const rules = category.position_rules;
  members.forEach((m, i) => {
    const who = `${m.last_name} ${m.first_name ?? ''}`.trim();
    const why = ineligibleReason(category, m, ctx);
    if (why) { out.push(`${who}: ${why}`); return; }
    if (category.team_same_dojo && String(m.club ?? '').toLowerCase() !== String(team.club ?? '').toLowerCase()) {
      out.push(`${who}: the team must be from one dojo (${team.club || 'no dojo given'}).`);
    }
    if (!rules) return;
    if (i < size) {
      const r = ineligibleReason(rules[i] ?? {}, m, ctx);
      if (r) out.push(`${who} as ${names[i].toLowerCase()}: ${r}`);
    } else if (!rules.some((r) => !ineligibleReason(r ?? {}, m, ctx))) {
      out.push(`${who} (reserve) fits no position of the team.`);
    }
  });
  return out;
}
