import { useState } from 'react';
import { DateInput } from './EuInputs';
import { GRADES } from '../lib/tournament/eligibility.js';

/**
 * Correct a competitor's data (organizers; owner 2026-11-27): name, club,
 * gender, birth year / date, grade. The competitor is one person in the whole
 * tournament, so the change shows in every category and team.
 */
export default function EditPerson({ person, birthDate, ageBasis, busy, onSave, onCancel }) {
  const [p, setP] = useState({
    last_name: person.last_name ?? '',
    first_name: person.first_name ?? '',
    club: person.club ?? '',
    gender: person.gender ?? '',
    birth_year: person.birth_year ?? '',
    birth_date: birthDate ?? '',
    grade_rank: person.grade_rank ?? '',
  });
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  return (
    <form className="edit-person" onSubmit={(e) => { e.preventDefault(); if (p.last_name.trim()) onSave(p); }}>
      <div className="tp-grid">
        <label className="tp-field">Last name<input value={p.last_name} onChange={set('last_name')} required autoFocus /></label>
        <label className="tp-field">First name<input value={p.first_name} onChange={set('first_name')} /></label>
        <label className="tp-field">Club<input value={p.club} onChange={set('club')} /></label>
        <label className="tp-field">
          Gender
          <select value={p.gender} onChange={set('gender')}>
            <option value="">—</option><option value="M">Male</option><option value="F">Female</option>
          </select>
        </label>
        {ageBasis === 'birth_date'
          ? <label className="tp-field">Date of birth<DateInput value={p.birth_date || null} onChange={(v) => setP({ ...p, birth_date: v ?? '' })} /></label>
          : <label className="tp-field">Birth year<input type="number" value={p.birth_year} onChange={set('birth_year')} /></label>}
        <label className="tp-field">
          Grade
          <select value={p.grade_rank} onChange={set('grade_rank')}>
            <option value="">—</option>
            {GRADES.map((g) => <option key={g.rank} value={g.rank}>{g.label}</option>)}
          </select>
        </label>
      </div>
      <p className="tp-muted" style={{ margin: '0.3rem 0' }}>Changes this person everywhere in the tournament (every category and team).</p>
      <div className="tp-actions">
        <button type="submit" className="tp-btn small" disabled={busy}>Save</button>
        <button type="button" className="tp-btn secondary small" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
