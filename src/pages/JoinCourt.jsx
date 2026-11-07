import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Message } from '../components/TournamentShell';
import { claimTournament } from '../lib/runApi';
import { supabase } from '../supabaseClient';
import './TournamentPages.css';

/**
 * Join a tournament with its PIN (no account needed). The door decides the role:
 *   ?as=editor → editor: edits the tournament before the start, Manage after it
 *                (only once the owner has published the tournament);
 *   ?as=table  → scoretable only: picks a shiaijo (only while the tournament runs).
 */
function JoinCourt() {
  const { tournamentId } = useParams();
  const [params] = useSearchParams();
  const door = params.get('as') === 'table' ? 'table' : 'editor';
  const [tournament, setTournament] = useState(null);
  const [pin, setPinText] = useState('');
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('tournaments').select('id, name, status, shiaijo_count').eq('id', tournamentId).maybeSingle()
      .then(({ data }) => setTournament(data));
  }, [tournamentId, joined]);

  const join = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await claimTournament(tournamentId, pin.trim(), door);
      setJoined(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const select = () => {
    try { sessionStorage.setItem('sf-selected-tournament', JSON.stringify({ id: tournamentId, name: tournament?.name })); } catch { /* ignore */ }
  };
  const running = tournament?.status === 'running';
  const courts = Array.from({ length: tournament?.shiaijo_count ?? 2 }, (_, i) => i + 1);
  const courtButtons = (
    <div className="tp-actions">
      {courts.map((n) => (
        <Link key={n} className="tp-btn" to={`/tournament/${tournamentId}/score?court=${n}`} onClick={select}>Shiaijo {n}</Link>
      ))}
    </div>
  );

  return (
    <div className="tp-page" style={{ maxWidth: 520 }}>
      <h2>{tournament?.name ?? 'Tournament'}</h2>
      <p className="tp-subtitle">
        {door === 'table' ? 'Scoretable' : 'Editor'} — type the PIN from the tournament owner.
        {' '}<Link to={`/join/${tournamentId}?as=${door === 'table' ? 'editor' : 'table'}`}>
          {door === 'table' ? 'I am an editor' : 'I am a scoretable'}
        </Link>
      </p>
      <Message type="error">{error}</Message>

      {!joined ? (
        <form className="tp-card" onSubmit={join}>
          <label className="tp-field">
            PIN
            <input inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={(e) => setPinText(e.target.value)} required />
          </label>
          <div className="tp-actions">
            <button type="submit" className="tp-btn" disabled={busy || !pin.trim()}>{busy ? 'Checking…' : 'Continue'}</button>
          </div>
        </form>
      ) : door === 'table' ? (
        <div className="tp-card">
          <h3>Scoretable — pick your shiaijo</h3>
          {courtButtons}
        </div>
      ) : (
        <div className="tp-card">
          <h3>You're in as editor</h3>
          {running ? (
            <>
              <p className="tp-muted">The tournament is running.</p>
              <div className="tp-actions">
                <Link className="tp-btn" to={`/tournament/${tournamentId}/manage`} onClick={select}>Manage</Link>
                <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/fights`} onClick={select}>Fight plan</Link>
              </div>
              <p className="tp-muted">Scoretables:</p>
              {courtButtons}
            </>
          ) : (
            <>
              <p className="tp-muted">Before the start you can edit the tournament: registration, draw, brackets, shiaijo plan.</p>
              <div className="tp-actions">
                <Link className="tp-btn" to="/dashboard" onClick={select}>Open the tournament</Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default JoinCourt;
