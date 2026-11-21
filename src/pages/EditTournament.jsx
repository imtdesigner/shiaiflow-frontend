import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BackToDashboard, Message, useTournament } from '../components/TournamentShell';
import { changeCourtCount, deleteTournament, tournamentOrganizers, updateTournament, uploadLogo } from '../lib/api';
import { PublicPagePart, TournamentPart, VenuePart, linkReady, noEnterSubmit, usesSchedule } from '../components/TournamentFields';
import { daysValue } from '../lib/tournament/days.js';
import { CONSENTS, signupSettings } from '../lib/tournament/signup.js';
import { getPin, myRole, setPin } from '../lib/runApi';
import './TournamentPages.css';
import { DateTimeInput } from '../components/EuInputs';

const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

/** Local datetime-input value ↔ ISO timestamp. */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Tournament setup, in the same parts as Create: Tournament (name, dates,
 * schedule), Venue (hall, address, courts), Public page (link, publishing,
 * logo); then registration and the signup form, the PIN for editors and
 * tables, and deleting the tournament (owner).
 */
function EditTournament() {
  const { tournamentId, tournament, categories, reload, error: loadError, loading } = useTournament();
  const navigate = useNavigate();
  const [deleteName, setDeleteName] = useState(null); // typed name while confirming the delete
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
      address: tournament.address ?? '',
      city: tournament.city ?? '',
      country: tournament.country ?? '',
      registration_deadline: toLocalInput(tournament.registration_deadline),
      days: tournament.days ?? (tournament.start_time ? [{ start: tournament.start_time.slice(0, 5), end: null }] : []),
      slug: tournament.slug ?? '',
      custom_link: !!tournament.slug,
      shiaijo_count: tournament.shiaijo_count ?? 2,
      use_schedule: usesSchedule(tournament.days, tournament.start_time),
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
    if (form.custom_link && !linkReady(form.slug, tournament.slug ?? '', linkState, linkConfirmed)) {
      setMsg({ type: 'error', text: 'Check the link name (taken, not allowed, or your earlier tournament uses it — tick to reuse it).' });
      return;
    }
    const days = daysValue(form.start_date, form.end_date || form.start_date, form.use_schedule ? form.days : []);
    run(async () => {
      if (Number(form.shiaijo_count) !== (tournament.shiaijo_count ?? 2)) await changeCourtCount(tournament, categories, Number(form.shiaijo_count));
      await updateTournament(tournamentId, {
      days,
      start_time: days[0]?.start || null,
      slug: (form.custom_link && form.slug) || null,
      name: form.name.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || form.start_date || null,
      venue: form.venue.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
      });
    }, 'Saved.');
  };

  const remove = async () => {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await deleteTournament(tournamentId);
      try { sessionStorage.removeItem('sf-selected-tournament'); } catch { /* ignore */ }
      navigate('/dashboard');
    } catch (e) { setMsg({ type: 'error', text: e.message }); setBusy(false); }
  };

  const toggle = (field, value, ok) => run(() => updateTournament(tournamentId, { [field]: value }), ok);
  const signup = signupSettings(tournament);
  const saveSignup = (patch) => run(() => updateTournament(tournamentId, { signup_fields: { ...signup, ...patch } }), 'Signup form saved.');

  if (loading || !form) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  const deadlinePassed = tournament.registration_deadline && new Date(tournament.registration_deadline) < new Date();
  const regOpen = tournament.registration_open && !deadlinePassed;
  const publicUrl = `${window.location.origin}${tournament.slug ? `/${tournament.slug}` : `/t/${tournamentId}`}`;
  const joinUrl = `${window.location.origin}/join/${tournamentId}`;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Edit tournament</h2>
      <p className="tp-subtitle">{tournament.name}</p>
      <p className="tp-muted guide-note">The setup guide on the right (at the bottom on small screens) shows the next step — click it to jump there.</p>
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      <form id="g-details" onSubmit={save} onKeyDown={noEnterSubmit}>
        {tournament.draws_confirmed && role !== 'owner' && <Message type="info">The draws are confirmed — only the owner can change the tournament data now.</Message>}
        <fieldset disabled={tournament.draws_confirmed && role !== 'owner'} style={{ border: 0, padding: 0, margin: 0 }}>
          <TournamentPart form={form} setForm={setForm} />
          <VenuePart form={form} setForm={setForm} />
          <PublicPagePart form={form} setForm={setForm} saved={tournament.slug ?? ''}
            linkConfirmed={linkConfirmed} setLinkConfirmed={setLinkConfirmed} setLinkState={setLinkState} />
          <div className="tp-actions" style={{ marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
            <button type="submit" className="tp-btn" disabled={busy}>Save</button>
            <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/shiaijo`}>Shiaijo plan</Link>
          </div>
        </fieldset>
      </form>

      <div id="g-publish" className="tp-card">
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
        <h3>Logo</h3>
        {tournament.logo_url ? <img className="tp-logo-preview" src={tournament.logo_url} alt="Tournament logo" /> : <p className="tp-muted">No logo yet.</p>}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) run(() => uploadLogo(tournamentId, f), 'Logo saved.'); e.target.value = ''; }} />
        {tournament.logo_url && (
          <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => toggle('logo_url', null, 'Logo removed.')}>Remove logo</button>
        )}
        <p className="tp-muted">PNG, JPG, WebP or SVG, up to 2 MB. Shown on the public page and the tournament lists.</p>
      </div>
      <div id="g-registration" className="tp-card">
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
            <DateTimeInput value={form.registration_deadline || null} disabled={busy}
              onChange={(v) => {
                setForm({ ...form, registration_deadline: v ?? '' });
                run(() => updateTournament(tournamentId, { registration_deadline: v ? new Date(v).toISOString() : null }), 'Deadline saved.');
              }} />
          </label>
        </div>
        <h3 id="g-rules" style={{ marginTop: '1rem' }}>Rules for entering</h3>
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
        <h3 id="g-signup" style={{ marginTop: '1rem' }}>Signup form</h3>
        <p className="tp-muted">Name, club and what the category rules need (gender, birth, grade) are always asked. Switch the rest on as needed.</p>
        <div className="tp-grid">
          {[['email', 'Competitor email'], ['dojo_email', 'Dojo email']].map(([k, label]) => (
            <label key={k} className="tp-field">
              {label}
              <select value={signup[k]} disabled={busy} onChange={(e) => saveSignup({ [k]: e.target.value })}>
                <option value="off">not asked</option>
                <option value="optional">optional</option>
                <option value="required">required</option>
              </select>
            </label>
          ))}
          <label className="tp-field tp-check">
            <input type="checkbox" checked={signup.add_another} disabled={busy} onChange={(e) => saveSignup({ add_another: e.target.checked })} />
            "Add another" — register several people in one go (e.g. a dojo for its members)
          </label>
        </div>
        <h4>Consents (GDPR)</h4>
        <div className="tp-grid">
          {CONSENTS.map((c) => (
            <label key={c.key} className="tp-field">
              {c.label}
              <select value={signup.consents[c.key]} disabled={busy} onChange={(e) => saveSignup({ consents: { ...signup.consents, [c.key]: e.target.value } })}>
                <option value="off">not asked</option>
                <option value="ask">asked (yes / no)</option>
                <option value="required">required to register</option>
              </select>
            </label>
          ))}
        </div>
        <p className="tp-muted">Emails and consents are seen by the organizers only (Registration).</p>
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

      <div id="g-pin" className="tp-card">
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

      {role === 'owner' && (
        <div id="g-delete" className="tp-card">
          <h3>Delete tournament</h3>
          <p className="tp-muted" style={{ marginTop: 0 }}>Deletes the tournament with its categories, entries, draws and results. This cannot be undone.</p>
          {deleteName === null ? (
            <button type="button" className="tp-btn danger" disabled={busy} onClick={() => setDeleteName('')}>Delete tournament…</button>
          ) : (
            <div className="tp-grid">
              <label className="tp-field">
                <span>Type the tournament name to confirm: <strong>{tournament.name}</strong></span>
                <input value={deleteName} autoFocus onChange={(e) => setDeleteName(e.target.value)} />
              </label>
              <div className="tp-actions">
                <button type="button" className="tp-btn danger" disabled={busy || deleteName.trim() !== tournament.name.trim()} onClick={remove}>Delete for good</button>
                <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => setDeleteName(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EditTournament;
