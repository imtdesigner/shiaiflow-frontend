// Category templates offered when setting up a tournament (owner, 2026-11-08).
// A template is only a starting point: everything can be changed, the name
// too. Times from DP HKS 2026 (seconds). Ages by the tournament's age basis.

const IND = { kind: 'individual', team_size: null, pool_size: 3, advancing: 2 };
const TEAM = { kind: 'team', team_size: 3, team_same_dojo: false, position_rules: null };

export const CATEGORY_TEMPLATES = [
  { ...IND, name: 'Junior A', max_age: 14, pool_fight_seconds: 120, ko_fight_seconds: 180, final_fight_seconds: 180 },
  { ...IND, name: 'Junior B', min_age: 15, max_age: 18, pool_fight_seconds: 120, ko_fight_seconds: 180, final_fight_seconds: 180 },
  { ...IND, name: 'Kyu W', gender: 'F', max_grade: -1, pool_fight_seconds: 120, ko_fight_seconds: 180, final_fight_seconds: 180 },
  { ...IND, name: 'Kyu M', gender: 'M', max_grade: -1, pool_fight_seconds: 120, ko_fight_seconds: 180, final_fight_seconds: 180 },
  { ...IND, name: 'Dan W', gender: 'F', min_grade: 1, pool_fight_seconds: 180, ko_fight_seconds: 180, final_fight_seconds: 240 },
  { ...IND, name: 'Dan M', gender: 'M', min_grade: 1, pool_fight_seconds: 240, ko_fight_seconds: 240, final_fight_seconds: 300 },
  { ...TEAM, name: 'Team juniors', max_age: 18, pool_size: 3, advancing: 1, pool_fight_seconds: 300, ko_fight_seconds: 300, final_fight_seconds: 300 },
  { ...TEAM, name: 'Team adults', pool_size: 1, advancing: 1, pool_fight_seconds: 300, ko_fight_seconds: 300, final_fight_seconds: 300 },
];

export const EMPTY_CATEGORY = {
  name: '', kind: 'individual', team_size: null, pool_size: 3, advancing: 2,
  pool_fight_seconds: 180, ko_fight_seconds: 180, final_fight_seconds: 240,
  gender: null, min_age: null, max_age: null, min_grade: null, max_grade: null,
  team_same_dojo: false, position_rules: null,
  fight_system: 'sanbon', pool_split: 'even', qf_fight_seconds: null, sf_fight_seconds: null,
  pool_tie: 'hikiwake', pool_encho_seconds: null, pool_hantei: false, ko_encho_seconds: null, ko_hantei: false,
  daihyosen_encho_seconds: null, daihyosen_hantei: false, third_place: 'shared',
};

/** Setup fields of a category (what a template or a copy carries over). */
export const SETUP_FIELDS = [
  'name', 'kind', 'team_size', 'pool_size', 'advancing',
  'pool_fight_seconds', 'ko_fight_seconds', 'final_fight_seconds',
  'gender', 'min_age', 'max_age', 'min_grade', 'max_grade', 'team_same_dojo', 'position_rules',
  'pool_tie', 'pool_encho_seconds', 'pool_hantei', 'ko_encho_seconds', 'ko_hantei',
  'ko_template_code', 'ko_template', 'ko_template_edited', 'ranking_criteria', 'auto_hansoku_ippon',
  'fight_system', 'pool_split', 'qf_fight_seconds', 'sf_fight_seconds',
  'daihyosen_encho_seconds', 'daihyosen_hantei', 'third_place',
];

/** A category's setup only (no ids, draw, status or courts) — for copying. */
export function categorySetup(c) {
  const out = {};
  for (const k of SETUP_FIELDS) if (c[k] !== undefined) out[k] = c[k];
  return out;
}

/** Category row for the database from an edited form value. */
export function categoryRow(c) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const team = c.kind === 'team';
  const size = team ? Number(c.team_size || 3) : null;
  return {
    ...categorySetup(c),
    name: String(c.name ?? '').trim(),
    team_size: size,
    pool_size: Number(c.pool_size),
    advancing: Number(c.advancing),
    gender: c.gender || null,
    min_age: num(c.min_age), max_age: num(c.max_age),
    min_grade: num(c.min_grade), max_grade: num(c.max_grade),
    team_same_dojo: team && !!c.team_same_dojo,
    position_rules: team && Array.isArray(c.position_rules) ? c.position_rules.slice(0, size).map((r) => ({
      gender: r?.gender || null,
      min_age: num(r?.min_age), max_age: num(r?.max_age),
      min_grade: num(r?.min_grade), max_grade: num(r?.max_grade),
    })) : null,
  };
}
