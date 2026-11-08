import { useState } from 'react';
import { GRADES, hasRule, teamPositions, teamReserves } from '../lib/tournament/eligibility.js';

const num = (v) => (v === '' || v == null ? null : Number(v));

/**
 * Gender / age / grade limits, each switched on or off (off = no limit);
 * the limits combine. Used for a category and for one team position.
 * value: { gender, min_age, max_age, min_grade, max_grade }.
 */
export function RuleSet({ value, onChange, ageLabel = 'Age', compact = false }) {
  const v = value ?? {};
  const [on, setOn] = useState({
    gender: v.gender != null,
    age: v.min_age != null || v.max_age != null,
    grade: v.min_grade != null || v.max_grade != null,
  });
  const patch = (p) => onChange({ ...v, ...p });
  const toggle = (k, checked) => {
    setOn({ ...on, [k]: checked });
    if (checked && k === 'gender' && !v.gender) patch({ gender: 'M' });
    if (!checked) {
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
        {on.gender && (
          <select value={v.gender ?? 'M'} onChange={(e) => patch({ gender: e.target.value })}>
            <option value="M">men</option><option value="F">women</option>
          </select>
        )}
      </div>
      <div className="cr-rule">
        <label className="tp-check"><input type="checkbox" checked={on.age} onChange={(e) => toggle('age', e.target.checked)} /> {ageLabel}</label>
        {on.age && (
          <span className="cr-range">
            from <input type="number" min="0" max="120" value={v.min_age ?? ''} onChange={(e) => patch({ min_age: num(e.target.value) })} />
            to <input type="number" min="0" max="120" value={v.max_age ?? ''} onChange={(e) => patch({ max_age: num(e.target.value) })} />
          </span>
        )}
      </div>
      <div className="cr-rule">
        <label className="tp-check"><input type="checkbox" checked={on.grade} onChange={(e) => toggle('grade', e.target.checked)} /> Grade</label>
        {on.grade && <span className="cr-range">from {gradeSelect('min_grade')} to {gradeSelect('max_grade')}</span>}
      </div>
    </div>
  );
}

/**
 * "Who can enter" of a category: its own limits and, for teams, size (3+1 /
 * 5+2), one dojo only, and optional limits per position (then the fighting
 * order is fixed; off = the team list is handed in at the tournament).
 */
export default function CategoryRules({ category, onChange, ageBasis = 'birth_year' }) {
  const c = category;
  const team = c.kind === 'team';
  const size = Number(c.team_size || 3);
  const positions = teamPositions(size);
  const ageLabel = ageBasis === 'birth_date' ? 'Age (on the first day)' : 'Age (in the tournament year)';
  const setPositions = (checked) => onChange({
    ...c,
    position_rules: checked ? positions.map(() => ({ gender: c.gender ?? null, min_age: c.min_age ?? null, max_age: c.max_age ?? null, min_grade: c.min_grade ?? null, max_grade: c.max_grade ?? null })) : null,
  });
  const setPosition = (i, r) => onChange({ ...c, position_rules: positions.map((_, j) => (j === i ? r : c.position_rules?.[j] ?? {})) });

  return (
    <div className="cr">
      <p className="tp-muted cr-hint">{team ? 'Every team member must meet these:' : 'Who can enter (switched off = no limit; limits combine):'}</p>
      <RuleSet value={c} onChange={(v) => onChange({ ...c, ...v })} ageLabel={ageLabel} />
      {team && (
        <div className="cr-team">
          <label className="tp-field">
            Team
            <select value={size} onChange={(e) => onChange({ ...c, team_size: Number(e.target.value), position_rules: null })}>
              <option value={3}>3 + 1 reserve</option>
              <option value={5}>5 + 2 reserves</option>
            </select>
          </label>
          <label className="tp-check">
            <input type="checkbox" checked={!!c.team_same_dojo} onChange={(e) => onChange({ ...c, team_same_dojo: e.target.checked })} />
            All members from the same dojo (e.g. national championships)
          </label>
          <label className="tp-check">
            <input type="checkbox" checked={!!c.position_rules} onChange={(e) => setPositions(e.target.checked)} />
            Limits per position (fixed fighting order)
          </label>
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
          ) : (
            <p className="tp-muted">No position limits: teams hand in their fighting order (team list) at the tournament.</p>
          )}
        </div>
      )}
    </div>
  );
}
