import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackToDashboard, Message, useTournament } from '../components/TournamentShell';
import { tournamentOrganizers, updateTournament, uploadLogo } from '../lib/api';
import { DaysEditor, LinkField, linkReady } from '../components/TournamentFields';
import { daysValue } from '../lib/tournament/days.js';
import { getPin, myRole, setPin } from '../lib/runApi';
import './TournamentPages.css';

const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

/** Local datetime-input value ↔ ISO timestamp. */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Tournament setup: basic data, publishing (home page + public page),
 * registration (open / deadline), how teams register, and the PIN for
 * editors and tables.
 */
function EditTournament() {
  const { tournamentId, tournament, reload, error: loadError, loading } = useTournament();
  const [form, setForm] = useState(null);
  const [pin, setPinState] = useState(null);
  const [role, setRole] = useState(null);
  const [organizer, setOrganizer] = useState(null);
  useEffect(() => { tournamentOrganizers([tournamentId]).then((o) => setOrganizer(o[tournamentId] ?? null)).catch(() => {}); }, [tournamentId]);
  const waitingVerification = organizer && !organizer.verified;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!tournament) return;
    setForm({
      name: tournament.name ?? '',
      start_date: tournament.start_date ?? '',
      end_date: tournament.end_date ?? '',
      venue: tournament.venue ?? '',
      city: tournament.city ?? '',
      country: tournament.country ?? '',
      registration_deadline: toLocalInput(tournament.registration_deadline),
      days: tournament.days ?? (tournament.start_time ? [{ start: tournament.start_time.slice(0, 5), end: null }] : []),
      slug: tournament.slug ?? '',
    });
    setLinkConfirmed(false);
  }, [tournament]);
  const [linkState, setLinkState] = useState(null);
  const [linkConfirmed, setLinkConfirmed] = useState(false);

  useEffect(() => {
    getPin(tournamentId).then(setPinState).catch(() => {});
    myRole(tournamentId).then(setRole).catch(() => {});
  }, [tournamentId]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await fn(); await reload(); if (ok) setMsg({ type: 'success', text: ok }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const save = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setMsg({ type: 'error', text: 'Enter the tournament name.' }); return; }
    if (!linkReady(form.slug, tournament.slug ?? '', linkState, linkConfirmed)) {
      setMsg({ type: 'error', text: 'Check the link name (taken, not allowed, or your earlier tournament uses it — tick to reuse it).' });
      return;
    }
    const days = daysValue(form.start_date, form.end_date || form.start_date, form.days);
    run(() => updateTournament(tournamentId, {
      days,
      start_time: days[0]?.start || null,
      slug: form.slug || null,
      name: form.name.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || form.start_date || null,
      venue: form.venue.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
    }), 'Saved.');
  };

  const toggle = (field, value, ok) => run(() => updateTournament(tournamentId, { [field]: value }), ok);

  if (loading || !form) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const deadlinePassed = tournament.registration_deadline && new Date(tournament.registration_deadline) < new Date();
  const regOpen = tournament.registration_open && !deadlinePassed;
  const publicUrl = `${window.location.origin}/t/${tournament.slug || tournamentId}`;
  const joinUrl = `${window.location.origin}/join/${tournamentId}`;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Edit tournament</h2>
      <p className="tp-subtitle">{tournament.name}</p>
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      <div className="tp-card">
        <h3>Publishing</h3>
        <label className="tp-field tp-check">
          <input type="checkbox" checked={tournament.is_public} disabled={busy || role !== 'owner' || (waitingVerification && !tournament.is_public)}
            onChange={(e) => toggle('is_public', e.target.checked, e.target.checked ? 'Published on the home page.' : 'Hidden from the home page.')} />
          Published — shown on the home page; setup, entries, draw, schedule and live results are public
        </label>
        {role !== 'owner' && <p className="tp-muted">Only the owner can publish.</p>}
        {waitingVerification && (
          <Message type="info">
            The organizer's account is waiting for approval by the app admins (new dojo or federation, or a former one turned individual). Everything can be set up,
            but publishing the signup and starting the tournament wait for the verification.
          </Message>
        )}
        {tournament.is_public && <p className="tp-muted">Public page: <a href={publicUrl}>{publicUrl}</a></p>}
      </div>

      <div className="tp-card">
        <h3>Registration</h3>
        <p>
          Status: <span className={`tp-badge ${regOpen ? 'ok' : 'warn'}`}>{regOpen ? 'open' : 'closed'}</span>
          {!tournament.is_public && <span className="tp-muted"> · competitors can register once the tournament is published</span>}
        </p>
        <div className="tp-grid">
          <label className="tp-field tp-check">
            <input type="checkbox" checked={tournament.registration_open} disabled={busy}
              onChange={(e) => toggle('registration_open', e.target.checked)} />
            Registration open
          </label>
          <label className="tp-field">
            Deadline (closes by itself)
            <input type="datetime-local" value={form.registration_deadline} onChange={set('registration_deadline')} onBlur={save} />
          </label>
        </div>
        <h3 style={{ marginTop: '1rem' }}>Rules for entering</h3>
        <div className="tp-grid">
          <label className="tp-field">
            Age limits count
            <select value={tournament.age_basis ?? 'birth_year'} disabled={busy} onChange={(e) => toggle('age_basis', e.target.value)}>
              <option value="birth_year">by birth year (tournament year − birth year)</option>
              <option value="birth_date">by exact age on the first day (asks the date of birth)</option>
            </select>
          </label>
          <label className="tp-field tp-check">
            <input type="checkbox" checked={!!tournament.single_category} disabled={busy}
              onChange={(e) => toggle('single_category', e.target.checked)} />
            A competitor may enter only one individual category (of those they qualify for)
          </label>
        </div>
        <p className="tp-muted">Each category's limits (gender, age, grade, team rules) are set on the Drawings page under "Who can enter".</p>
        <h3 style={{ marginTop: '1rem' }}>Teams</h3>
        <div className="tp-grid">
          <label className="tp-field">
            How teams register
            <select value={tournament.team_signup} disabled={busy} onChange={(e) => toggle('team_signup', e.target.value)}>
              <option value="with_competitor">Each competitor names a new team or picks an existing one</option>
              <option value="team_first">A team registers and picks its members from registered competitors</option>
            </select>
          </label>
          <label className="tp-field tp-check">
            <input type="checkbox" checked={tournament.multi_team} disabled={busy}
              onChange={(e) => toggle('multi_team', e.target.checked)} />
            A competitor may be in teams of different categories (e.g. Junior B and Team adults)
          </label>
        </div>
        <p className="tp-muted">Registrations need no approval; edit or remove them in <Link to={`/tournament/${tournamentId}/registration`}>Registration</Link>.</p>
      </div>

      <div className="tp-card">
        <h3>PIN for editors and tables</h3>
        <p className="tp-muted" style={{ marginTop: 0 }}>
          Before the start the PIN lets editors change the tournament; after the start it opens the scoretables and Manage.
          Share <strong>{joinUrl}</strong>.
        </p>
        <div className="tp-actions">
          <strong style={{ fontSize: '1.4rem', letterSpacing: '0.2em' }}>{pin ?? '—'}</strong>
          <button type="button" className="tp-btn secondary small" disabled={busy}
            onClick={() => run(async () => { const p = randomPin(); await setPin(tournamentId, p); setPinState(p); })}>
            {pin ? 'New PIN' : 'Create PIN'}
          </button>
        </div>
      </div>

      <form className="tp-card" onSubmit={save}>
        <h3>Tournament</h3>
        {tournament.draws_confirmed && role !== 'owner' && <Message type="info">The draws are confirmed — only the owner can change the tournament data now.</Message>}
        <fieldset disabled={tournament.draws_confirmed && role !== 'owner'} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="tp-grid">
          <label className="tp-field" style={{ gridColumn: '1 / -1' }}>Name<input value={form.name} onChange={set('name')} required /></label>
          <label className="tp-field">Start date<input type="date" value={form.start_date} onChange={set('start_date')} /></label>
          <label className="tp-field">End date<input type="date" value={form.end_date} onChange={set('end_date')} /></label>
          <label className="tp-field">Venue<input value={form.venue} onChange={set('venue')} /></label>
          <label className="tp-field">City<input value={form.city} onChange={set('city')} /></label>
          <label className="tp-field">Country<input value={form.country} onChange={set('country')} /></label>
          <LinkField value={form.slug} saved={tournament.slug ?? ''} name={form.name} onChange={(v) => setForm({ ...form, slug: v })}
            confirmed={linkConfirmed} onConfirm={setLinkConfirmed} onStatus={setLinkState} />
        </div>
        <h4>Days</h4>
        {form.start_date
          ? <DaysEditor startDate={form.start_date} endDate={form.end_date} value={form.days} onChange={(days) => setForm({ ...form, days })} />
          : <p className="tp-muted">Set the dates to plan the days.</p>}
        <p className="tp-muted">Each category's day is set in the Shiaijo plan. The fight plan starts each day at its start time.</p>
        <div className="tp-actions">
          <button type="submit" className="tp-btn" disabled={busy}>Save</button>
          <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/shiaijo`}>Shiaijo plan</Link>
        </div>
        </fieldset>
      </form>

      <div className="tp-card">
        <h3>Logo</h3>
        {tournament.logo_url ? <img className="tp-logo-preview" src={tournament.logo_url} alt="Tournament logo" /> : <p className="tp-muted">No logo yet.</p>}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) run(() => uploadLogo(tournamentId, f), 'Logo saved.'); e.target.value = ''; }} />
        {tournament.logo_url && (
          <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => toggle('logo_url', null, 'Logo removed.')}>Remove logo</button>
        )}
        <p className="tp-muted">PNG, JPG, WebP or SVG, up to 2 MB. Shown on the public page and the tournament lists.</p>
      </div>
    </div>
  );
}

export default EditTournament;
