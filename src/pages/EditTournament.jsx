import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackToDashboard, Message, useTournament } from '../components/TournamentShell';
import { updateTournament } from '../lib/api';
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
    });
  }, [tournament]);

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
    run(() => updateTournament(tournamentId, {
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
  const publicUrl = `${window.location.origin}/t/${tournamentId}`;
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
          <input type="checkbox" checked={tournament.is_public} disabled={busy || role !== 'owner'}
            onChange={(e) => toggle('is_public', e.target.checked, e.target.checked ? 'Published on the home page.' : 'Hidden from the home page.')} />
          Published — shown on the home page; setup, entries, draw, schedule and live results are public
        </label>
        {role !== 'owner' && <p className="tp-muted">Only the owner can publish.</p>}
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
        <div className="tp-grid">
          <label className="tp-field" style={{ gridColumn: '1 / -1' }}>Name<input value={form.name} onChange={set('name')} required /></label>
          <label className="tp-field">Start date<input type="date" value={form.start_date} onChange={set('start_date')} /></label>
          <label className="tp-field">End date<input type="date" value={form.end_date} onChange={set('end_date')} /></label>
          <label className="tp-field">Venue<input value={form.venue} onChange={set('venue')} /></label>
          <label className="tp-field">City<input value={form.city} onChange={set('city')} /></label>
          <label className="tp-field">Country<input value={form.country} onChange={set('country')} /></label>
        </div>
        <div className="tp-actions">
          <button type="submit" className="tp-btn" disabled={busy}>Save</button>
          <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/shiaijo`}>Shiaijo plan</Link>
        </div>
      </form>
    </div>
  );
}

export default EditTournament;
