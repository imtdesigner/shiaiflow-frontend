import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Segmented from './Segmented';
import { DateTimeInput } from './EuInputs';
import { updateTournament } from '../lib/api';
import { CONSENTS, signupSettings } from '../lib/tournament/signup.js';

/** Local datetime-input value ↔ ISO timestamp. */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Signup setup (owner, 2026-11-22) — the same in the new-tournament wizard and
 * in Edit tournament: registration open / deadline, the signup form fields,
 * one category per competitor, GDPR consents and team signup (only with team
 * categories). Every change saves at once.
 */
export default function SignupSetup({ tournament, categories, run, busy }) {
  const tournamentId = tournament.id;
  const [deadline, setDeadline] = useState(toLocalInput(tournament.registration_deadline));
  useEffect(() => { setDeadline(toLocalInput(tournament.registration_deadline)); }, [tournament.registration_deadline]);
  const form = { registration_deadline: deadline };
  const setForm = (f) => setDeadline(f.registration_deadline);
  const toggle = (field, value, ok) => run(() => updateTournament(tournamentId, { [field]: value }), ok);
  const signup = signupSettings(tournament);
  const saveSignup = (patch) => run(() => updateTournament(tournamentId, { signup_fields: { ...signup, ...patch } }), 'Signup form saved.');
  const deadlinePassed = tournament.registration_deadline && new Date(tournament.registration_deadline) < new Date();
  const regOpen = tournament.registration_open && !deadlinePassed;

  return (
    <>
      <div id="g-registration" className="tp-card">
        <h3>Registration</h3>
        <div className="fr-row">
          <span className="fr-row-label">Registration</span>
          <Segmented options={[[true, 'Open'], [false, 'Closed']]} value={!!tournament.registration_open} disabled={busy}
            onChange={(v) => toggle('registration_open', v)} />
          {tournament.registration_open && !regOpen && <span className="tp-badge warn">closed — the deadline has passed</span>}
        </div>
        <div className="fr-row">
          <span className="fr-row-label">Closes by itself on</span>
          <DateTimeInput value={form.registration_deadline || null} disabled={busy}
            onChange={(v) => {
              setForm({ ...form, registration_deadline: v ?? '' });
              run(() => updateTournament(tournamentId, { registration_deadline: v ? new Date(v).toISOString() : null }), 'Deadline saved.');
            }} />
        </div>
        <p className="tp-muted cr-option-hint" style={{ marginLeft: 0 }}>
          {tournament.is_public ? 'Competitors sign up on the public page while registration is open.' : 'Competitors can sign up once the tournament is published.'}
          {' '}No approval needed; edit or remove entries in <Link to={`/tournament/${tournamentId}/registration`}>Registration</Link>.
        </p>
      </div>

      <div id="g-signup" className="tp-card">
        <h3>Signup form</h3>
        <p className="tp-muted" style={{ marginTop: 0 }}>
          Name, club and what the category rules need (gender, birth, grade) are always asked. Each category's limits — and whether age counts by
          year or exact date of birth — are set in Drawings under "Who can enter".
        </p>
        {[['email', 'Competitor email'], ['dojo_email', 'Dojo email']].map(([k, label]) => (
          <div key={k} className="fr-row">
            <span className="fr-row-label">{label}</span>
            <Segmented options={[['off', 'Not asked'], ['optional', 'Optional'], ['required', 'Required']]} value={signup[k]} disabled={busy}
              onChange={(v) => saveSignup({ [k]: v })} />
          </div>
        ))}
        <div id="g-rules" className="cr-option">
          <label className="tp-check">
            <input type="checkbox" checked={!!tournament.single_category} disabled={busy} onChange={(e) => toggle('single_category', e.target.checked)} />
            Only one individual category per competitor
          </label>
          <p className="tp-muted cr-option-hint">Off: a competitor may enter every individual category they qualify for.</p>
        </div>
        <div className="cr-option">
          <label className="tp-check">
            <input type="checkbox" checked={signup.add_another} disabled={busy} onChange={(e) => saveSignup({ add_another: e.target.checked })} />
            "Add another" button
          </label>
          <p className="tp-muted cr-option-hint">Several people in one signup, e.g. a dojo registering its members.</p>
        </div>
        <h4>Consents (GDPR)</h4>
        {CONSENTS.map((c) => (
          <div key={c.key} className="fr-row">
            <span className="fr-row-label">{c.label}</span>
            <Segmented options={[['off', 'Not asked'], ['ask', 'Asked (yes / no)'], ['required', 'Required']]} value={signup.consents[c.key]} disabled={busy}
              onChange={(v) => saveSignup({ consents: { ...signup.consents, [c.key]: v } })} />
          </div>
        ))}
        <p className="tp-muted">Emails and consents are seen by the organizers only (Registration).</p>
      </div>

      {categories.some((c) => c.kind === 'team') && (
        <div className="tp-card">
          <h3>Team signup</h3>
          <div className="fr-row">
            <span className="fr-row-label">How teams sign up</span>
            <Segmented options={[['with_competitor', 'Each competitor names or picks a team'], ['team_first', 'A team picks its members']]}
              value={tournament.team_signup} disabled={busy} onChange={(v) => toggle('team_signup', v)} />
          </div>
          <p className="tp-muted cr-option-hint" style={{ marginLeft: 0 }}>
            {tournament.team_signup === 'team_first'
              ? 'The team signs up and picks its members from competitors who are already registered.'
              : 'When signing up, a competitor names a new team or joins one that already exists.'}
          </p>
          <div className="cr-option">
            <label className="tp-check">
              <input type="checkbox" checked={tournament.multi_team} disabled={busy} onChange={(e) => toggle('multi_team', e.target.checked)} />
              One competitor in teams of different categories
            </label>
            <p className="tp-muted cr-option-hint">E.g. in Team juniors and Team adults. Off: one team per competitor.</p>
          </div>
        </div>
      )}

    </>
  );
}
