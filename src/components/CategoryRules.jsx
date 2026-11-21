import { useState } from 'react';
import { GRADES, hasRule, teamPositions, teamReserves } from '../lib/tournament/eligibility.js';
import Segmented from './Segmented';

const num = (v) => (v === '' || v == null ? null : Number(v));

/**
 * Gender / age / grade limits, each switched on or off (off = no limit);
 * the limits combine. Used for a category and for one team position.
 * value: { gender, min_age, max_age, min_grade, max_grade }.
 */
export function RuleSet({ value, onChange, ageLabel = 'Age', compact = false, ageBasis, onAgeBasis }) {
  const v = value ?? {};
  const has = {
    gender: v.gender != null,
    age: v.min_age != null || v.max_age != null,
    grade: v.min_grade != null || v.max_grade != null,
  };
  // switched on by hand (no value yet), or a value is set (e.g. filled in by a template)
  const [manual, setOn] = useState(has);
  // grade: kyu only (up to 1 kyu), dan only (1 dan and up), or an own range
  const gradeShape = v.min_grade == null && v.max_grade === -1 ? 'kyu' : v.min_grade === 1 && v.max_grade == null ? 'dan' : (v.min_grade != null || v.max_grade != null) ? 'range' : null;
  const [rangePicked, setRangePicked] = useState(gradeShape === 'range');
  const gradeMode = rangePicked ? 'range' : gradeShape;
  const setGradeMode = (m) => {
    setRangePicked(m === 'range');
    if (m === 'kyu') patch({ min_grade: null, max_grade: -1 });
    if (m === 'dan') patch({ min_grade: 1, max_grade: null });
  };
  const on = { gender: manual.gender || has.gender, age: manual.age || has.age, grade: manual.grade || has.grade };
  const patch = (p) => onChange({ ...v, ...p });
  const toggle = (k, checked) => {
    setOn({ ...manual, [k]: checked });
    if (checked && k === 'gender' && !v.gender) patch({ gender: 'M' });
    if (!checked) {
      if (k === 'grade') setRangePicked(false);
      if (k === 'gender') patch({ gender: null });
      if (k === 'age') patch({ min_age: null, max_age: null });
      if (k === 'grade') patch({ min_grade: null, max_grade: null });
    }
  };
  const gradeSelect = (k) => (
    <select value={v[k] ?? ''} onChange={(e) => patch({ [k]: num(e.target.value) })}>
      <option value="">—</option>
      {GRADES.map((g) => <option key={g.rank} value={g.rank}>{g.label}</option>)}
    </select>
  );
  return (
    <div className={`cr-rules ${compact ? 'compact' : ''}`}>
      <div className="cr-rule">
        <label className="tp-check"><input type="checkbox" checked={on.gender} onChange={(e) => toggle('gender', e.target.checked)} /> Gender</label>
        {on.gender && <Segmented options={[['M', 'Men'], ['F', 'Women']]} value={v.gender ?? 'M'} onChange={(g) => patch({ gender: g })} />}
      </div>
      <div className="cr-rule">
        <label className="tp-check"><input type="checkbox" checked={on.age} onChange={(e) => toggle('age', e.target.checked)} /> {ageLabel}</label>
        {on.age && (
          <span className="cr-range">
            from <input type="number" min="0" max="120" value={v.min_age ?? ''} onChange={(e) => patch({ min_age: num(e.target.value) })} />
            to <input type="number" min="0" max="120" value={v.max_age ?? ''} onChange={(e) => patch({ max_age: num(e.target.value) })} />
          </span>
        )}
        {on.age && onAgeBasis && (
          <span className="cr-age-basis">
            <Segmented options={[['birth_year', 'By year of birth'], ['birth_date', 'By exact date of birth']]} value={ageBasis ?? 'birth_year'} onChange={onAgeBasis} />
            <span className="tp-muted">{ageBasis === 'birth_date' ? 'age on the first day — the signup asks the date of birth' : 'tournament year − year of birth'} · same for all categories</span>
          </span>
        )}
      </div>
      <div className="cr-rule">
        <label className="tp-check"><input type="checkbox" checked={on.grade} onChange={(e) => toggle('grade', e.target.checked)} /> Grade</label>
        {on.grade && (
          <span className="cr-grade-modes">
            <Segmented options={[['kyu', 'Kyu only'], ['dan', 'Dan only'], ['range', 'From – to']]} value={gradeMode} onChange={setGradeMode} />
            {gradeMode === 'range' && <span className="cr-range">from {gradeSelect('min_grade')} to {gradeSelect('max_grade')}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * "Who can enter" of a category: its own limits and, for teams, size (3+1 /
 * 5+2), one dojo only, and optional limits per position (then the fighting
 * order is fixed; off = the team list is handed in at the tournament).
 */
export default function CategoryRules({ category, onChange, ageBasis = 'birth_year', onAgeBasis }) {
  const c = category;
  const team = c.kind === 'team';
  const size = Number(c.team_size || 3);
  const positions = teamPositions(size);
  const ageLabel = 'Age';
  const setPositions = (checked) => onChange({
    ...c,
    position_rules: checked ? positions.map(() => ({ gender: c.gender ?? null, min_age: c.min_age ?? null, max_age: c.max_age ?? null, min_grade: c.min_grade ?? null, max_grade: c.max_grade ?? null })) : null,
  });
  const setPosition = (i, r) => onChange({ ...c, position_rules: positions.map((_, j) => (j === i ? r : c.position_rules?.[j] ?? {})) });

  return (
    <div className="cr">
      <p className="tp-muted cr-hint">{team ? 'Every team member must meet these — switch on the limits the category has:' : 'Switch on the limits this category has (all off = anyone can enter):'}</p>
      <RuleSet value={c} onChange={(v) => onChange({ ...c, ...v })} ageLabel={ageLabel} ageBasis={ageBasis} onAgeBasis={onAgeBasis} />
      {team && (
        <div className="cr-team">
          <div className="cr-team-size">
            <span className="fr-row-label">Team of</span>
            <Segmented options={[[3, '3'], [5, '5']]} value={size} onChange={(n) => onChange({ ...c, team_size: n, position_rules: null })} />
          </div>
          <div className="cr-option">
            <label className="tp-check">
              <input type="checkbox" checked={!!c.team_same_dojo} onChange={(e) => onChange({ ...c, team_same_dojo: e.target.checked })} />
              All members must be from the same dojo
            </label>
            <p className="tp-muted cr-option-hint">E.g. national championships, where every team represents one dojo. Off: mixed teams are allowed.</p>
          </div>
          <div className="cr-option">
            <label className="tp-check">
              <input type="checkbox" checked={!!c.position_rules} onChange={(e) => setPositions(e.target.checked)} />
              Fixed fighting order
            </label>
            <p className="tp-muted cr-option-hint">Off: each team hands in its fighting order before every match. On: the order is fixed and you can set limits per position (e.g. the youngest as senpo).</p>
          </div>
          {c.position_rules ? (
            <div className="cr-positions">
              {positions.map((name, i) => (
                <div key={name} className="cr-position">
                  <strong>{name}</strong>
                  <RuleSet compact value={c.position_rules[i]} onChange={(r) => setPosition(i, r)} ageLabel="Age" />
                  {!hasRule(c.position_rules[i]) && <span className="tp-muted">no extra limit</span>}
                </div>
              ))}
              <p className="tp-muted">Reserves ({teamReserves(size)}) must fit at least one position.</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
